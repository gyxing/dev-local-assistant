import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  nativeTheme,
  screen,
  Tray,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type NativeImage,
  type Rectangle,
} from 'electron';
import type { CalendarTimeInfo } from '../shared/desktop-calendar-types';
import type { DesktopNotesSnapshot } from '../shared/desktop-notes-types';
import {
  TRAY_PANEL_ACTIONS,
  type TrayPanelAction,
  type TrayPanelResult,
  type TrayPanelState,
} from '../shared/tray-panel-types';
import { IPC_CHANNELS } from './ipc/channels';

const PANEL_ROUTE = '/tray-panel';
const PANEL_WIDTH = 252;
const PANEL_HEIGHT = 280;
const PANEL_GAP = 5;
const PANEL_LOAD_TIMEOUT_MS = 4000;

// 便签和日历各自串行切换，校时可独立执行。
const ACTION_GROUP = {
  'open-main': 'main',
  'toggle-notes': 'notes',
  'toggle-notes-mode': 'notes',
  'highlight-notes': 'notes',
  'toggle-calendar': 'calendar',
  'toggle-calendar-theme': 'calendar',
  'sync-time': 'clock',
  quit: 'quit',
} as const satisfies Record<TrayPanelAction, string>;

const ACTION_ERROR: Record<TrayPanelAction, string> = {
  'open-main': '打开主窗口失败，请重试。',
  'toggle-notes': '切换便利贴显示失败，请重试。',
  'toggle-notes-mode': '切换桌面模式失败，请检查当前状态后重试。',
  'highlight-notes': '检测范围失败，请重试。',
  'toggle-calendar': '切换日历显示失败，请重试。',
  'toggle-calendar-theme': '修改日历主题失败，请重试。',
  'sync-time': '校时失败，请检查网络后重试。',
  quit: '未能完成退出，请检查便利贴保存状态后重试。',
};

interface TrayControllerOptions {
  iconPath: string;
  panelPreloadPath: string;
  getRendererEntry: () => string;
  getNotesState: () => { windowOpen: boolean; desktopMode: boolean };
  getCalendarState: () => { windowOpen: boolean; darkTheme: boolean };
  toggleNotesWindow: (activate: boolean) => Promise<DesktopNotesSnapshot>;
  toggleNotesDesktopMode: () => Promise<unknown>;
  highlightNotesBounds: () => Promise<unknown>;
  toggleCalendarWindow: () => Promise<unknown>;
  toggleCalendarTheme: () => Promise<unknown>;
  syncCalendarTime: () => Promise<CalendarTimeInfo>;
  openMainWindow: () => void;
  quit: () => Promise<void>;
  reportError: (error: unknown) => void;
}

/** 计算托盘旁的面板位置，返回处于对应显示器工作区内的窗口范围。 */
function resolvePanelBounds(trayBounds: Rectangle): Rectangle {
  const { x: cursorX, y: cursorY } = screen.getCursorScreenPoint();
  const anchor = trayBounds.width > 0 && trayBounds.height > 0
    ? trayBounds
    : { x: cursorX, y: cursorY, width: 1, height: 1 };
  const area = screen.getDisplayMatching(anchor).workArea;
  const width = Math.min(PANEL_WIDTH, area.width);
  const height = Math.min(PANEL_HEIGHT, area.height);
  const right = area.x + area.width;
  const bottom = area.y + area.height;
  const x = Math.min(Math.max(anchor.x + anchor.width - width, area.x), right - width);
  const above = Math.min(anchor.y - PANEL_GAP, bottom) - height;
  const below = Math.max(anchor.y + anchor.height + PANEL_GAP, area.y);
  const y = above >= area.y ? above : Math.min(below, bottom - height);
  return { x, y, width, height };
}

/** 读取原生菜单图标。资源缺失时仍保留可用的文本菜单。 */
function loadMenuIcon(name: string): NativeImage | undefined {
  const directory = app.isPackaged
    ? path.join(process.resourcesPath, 'tray-icons')
    : path.join(app.getAppPath(), 'electron', 'resources', 'tray-icons');
  const icon = nativeImage.createFromPath(path.join(directory, `${name}.png`));
  return icon.isEmpty() ? undefined : icon;
}

/** 管理常驻托盘、弹出窗口及共用动作，业务状态仍由便签和日历控制器维护。 */
export class TrayController {
  private readonly tray: Tray;
  // 菜单随状态重建，图标只在创建控制器时加载一次。
  private readonly menuIcons = {
    window: loadMenuIcon('window'),
    notes: loadMenuIcon('notes'),
    calendar: loadMenuIcon('calendar'),
    bounds: loadMenuIcon('bounds'),
    clock: loadMenuIcon('clock'),
    quit: loadMenuIcon('quit'),
  };
  private ready = false;
  private disposed = false;
  private readonly pending = new Set<TrayPanelAction>();
  private revision = 0;
  private openSequence = 0;
  private panel?: BrowserWindow;
  private panelUrl?: string;
  private panelLoad?: Promise<void>;
  private resolvePanelReady?: () => void;
  private panelReady = false;
  private requestedBounds?: Rectangle;
  private fallback = false;

  constructor(private readonly options: TrayControllerOptions) {
    this.tray = new Tray(options.iconPath);
    try {
      this.tray.setToolTip('开发者工具箱');
      this.tray.on('double-click', () => {
        if (this.ready) void this.runAction('open-main', false);
      });
      if (process.platform === 'win32') {
        this.registerPanelIpc();
        this.tray.on('right-click', (_event, bounds) => this.openPanel(bounds));
      }
      this.refresh();
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  /** 启动状态恢复后开放菜单操作。 */
  enable() {
    this.ready = true;
    this.refresh();
  }

  /** 把便签与日历的真实状态同步到当前托盘入口。 */
  refresh() {
    if (this.disposed) return;
    this.revision += 1;
    if (process.platform !== 'win32') {
      this.tray.setContextMenu(this.createNativeMenu());
    }
    if (this.panelReady && this.panel && !this.panel.isDestroyed()) {
      this.panel.webContents.send(IPC_CHANNELS.trayPanelStateChanged, this.readState());
    }
  }

  private canRun(action: TrayPanelAction, notes = this.options.getNotesState()) {
    return this.ready
      && !this.disposed
      && !this.pending.has('quit')
      && !Array.from(this.pending).some((item) => ACTION_GROUP[item] === ACTION_GROUP[action])
      && (action !== 'highlight-notes' || notes.windowOpen);
  }

  private readState(): TrayPanelState {
    const notes = this.options.getNotesState();
    return {
      revision: this.revision,
      openSequence: this.openSequence,
      notes,
      calendar: this.options.getCalendarState(),
      pending: Array.from(this.pending),
      disabled: TRAY_PANEL_ACTIONS.filter((action) => !this.canRun(action, notes)),
    };
  }

  private createNativeMenu(): Menu {
    const { notes, calendar, disabled } = this.readState();
    const action = (
      id: TrayPanelAction,
      label: string,
      state: { checked?: boolean; icon?: NativeImage } = {},
    ): MenuItemConstructorOptions => ({
      label,
      ...(state.checked === undefined ? {} : { type: 'checkbox', checked: state.checked }),
      icon: state.icon,
      enabled: !disabled.includes(id),
      click: () => void this.runAction(id, false),
    });

    return Menu.buildFromTemplate([
      action('open-main', '打开主窗口', { icon: this.menuIcons.window }),
      {
        label: '便利贴',
        icon: this.menuIcons.notes,
        submenu: [
          action('toggle-notes', '显示便利贴', { checked: notes.windowOpen }),
          action('toggle-notes-mode', '桌面模式', { checked: notes.desktopMode }),
          action('highlight-notes', '检测范围', { icon: this.menuIcons.bounds }),
        ],
      },
      {
        label: '桌面日历',
        icon: this.menuIcons.calendar,
        submenu: [
          action('toggle-calendar', '显示日历', { checked: calendar.windowOpen }),
          action('toggle-calendar-theme', '深色主题', { checked: calendar.darkTheme }),
          action('sync-time', '立即校时', { icon: this.menuIcons.clock }),
        ],
      },
      { type: 'separator' },
      action('quit', '退出', { icon: this.menuIcons.quit }),
    ]);
  }

  /** 在应用确认退出时释放窗口、托盘和专用通道。 */
  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    if (process.platform === 'win32') {
      ipcMain.removeHandler(IPC_CHANNELS.trayPanelGetState);
      ipcMain.removeHandler(IPC_CHANNELS.trayPanelReady);
      ipcMain.removeHandler(IPC_CHANNELS.trayPanelRunAction);
    }
    this.panel?.destroy();
    this.tray.destroy();
  }

  private assertPanelSender(event: IpcMainInvokeEvent) {
    const contents = this.panel?.webContents;
    if (!contents || contents.isDestroyed()
      || event.sender !== contents
      || event.senderFrame !== contents.mainFrame
      || event.senderFrame.url !== this.panelUrl) {
      throw new Error('仅托盘面板可使用此操作');
    }
  }

  private registerPanelIpc() {
    ipcMain.handle(IPC_CHANNELS.trayPanelGetState, (event) => {
      this.assertPanelSender(event);
      return this.readState();
    });
    ipcMain.handle(IPC_CHANNELS.trayPanelReady, (event) => {
      this.assertPanelSender(event);
      this.resolvePanelReady?.();
      return this.readState();
    });
    ipcMain.handle(IPC_CHANNELS.trayPanelRunAction, (event, action: unknown) => {
      this.assertPanelSender(event);
      const allowedAction = TRAY_PANEL_ACTIONS.find((allowed) => allowed === action);
      if (!allowedAction) throw new Error('不支持的托盘操作');
      return this.runAction(allowedAction, true);
    });
  }

  private openPanel(bounds: Rectangle) {
    if (!this.ready || this.disposed || this.pending.has('quit')) return;
    if (this.fallback) {
      this.showNativeMenu(bounds);
      return;
    }

    this.requestedBounds = bounds;
    if (this.panelLoad) return;
    if (this.panelReady) {
      this.showRequestedPanel();
      return;
    }

    // 首次加载与后续右键共用同一个窗口，避免出现多个面板。
    this.panelLoad = this.loadPanel()
      .then(() => this.showRequestedPanel())
      .catch((error: unknown) => {
        const fallbackBounds = this.requestedBounds;
        this.useNativeFallback(error);
        if (!this.disposed && fallbackBounds) {
          this.showNativeMenu(fallbackBounds);
        }
      })
      .finally(() => { this.panelLoad = undefined; });
  }

  private async loadPanel() {
    const devServerUrl = process.env.NODE_ENV === 'development'
      ? process.env.DEV_SERVER_URL ?? 'http://127.0.0.1:8137'
      : undefined;
    const rendererEntry = this.options.getRendererEntry();
    const url = devServerUrl ? new URL(devServerUrl) : pathToFileURL(rendererEntry);
    url.hash = PANEL_ROUTE;
    this.panelUrl = url.href;
    const panel = new BrowserWindow({
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      show: false,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#171b23' : '#f8fafc',
      webPreferences: {
        preload: this.options.panelPreloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.panel = panel;
    panel.setMenu(null);
    panel.on('blur', () => panel.hide());
    panel.on('closed', () => {
      if (this.panel === panel) {
        this.panel = undefined;
        this.panelReady = false;
      }
    });
    panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    panel.webContents.on('will-navigate', (event) => event.preventDefault());
    panel.webContents.on('will-redirect', (event) => event.preventDefault());
    panel.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        event.preventDefault();
        this.hidePanel();
        if (!this.disposed) this.tray.focus();
      }
    });
    panel.webContents.on('render-process-gone', () => {
      if (this.panel === panel && this.panelReady) {
        this.useNativeFallback(new Error('托盘面板渲染进程退出'));
      }
    });

    let timer: NodeJS.Timeout | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      this.resolvePanelReady = resolve;
      timer = setTimeout(() => reject(new Error('托盘面板加载超时')), PANEL_LOAD_TIMEOUT_MS);
      panel.once('closed', () => reject(new Error('托盘面板在加载时关闭')));
    });
    try {
      const load = devServerUrl ? panel.loadURL(url.href) : panel.loadFile(rendererEntry, { hash: PANEL_ROUTE });
      await Promise.all([load, ready]);
      this.panelReady = true;
    } finally {
      clearTimeout(timer);
      this.resolvePanelReady = undefined;
    }
  }

  private showRequestedPanel() {
    const bounds = this.requestedBounds;
    const panel = this.panel;
    this.requestedBounds = undefined;
    if (!bounds || !panel || panel.isDestroyed() || this.disposed) return;

    panel.setBounds(resolvePanelBounds(bounds));
    this.openSequence += 1;
    this.refresh();
    panel.show();
    // Windows 后台启动时，进程的初始显示方式可能让第一次显示仍保持隐藏。
    if (!panel.isVisible()) panel.show();
    if (!panel.isVisible()) {
      this.useNativeFallback(new Error('托盘面板窗口未能显示'));
      this.showNativeMenu(bounds);
      return;
    }
    panel.focus();
  }

  private hidePanel() {
    this.requestedBounds = undefined;
    this.panel?.hide();
  }

  private useNativeFallback(error: unknown) {
    if (this.disposed) return;
    console.warn('托盘面板不可用，改用原生菜单', error);
    this.fallback = true;
    this.panelReady = false;
    this.requestedBounds = undefined;
    const panel = this.panel;
    this.panel = undefined;
    panel?.destroy();
  }

  private showNativeMenu(bounds: Rectangle) {
    const position = bounds.width > 0 && bounds.height > 0
      ? { x: Math.round(bounds.x + bounds.width / 2), y: Math.round(bounds.y + bounds.height / 2) }
      : screen.getCursorScreenPoint();
    this.tray.popUpContextMenu(this.createNativeMenu(), position);
  }

  private async runAction(action: TrayPanelAction, fromPanel: boolean): Promise<TrayPanelResult> {
    if (!this.canRun(action)) {
      return { ok: false, message: '当前无法执行此操作，请稍后重试。', state: this.readState() };
    }
    this.pending.add(action);
    this.refresh();
    let ok = true;
    let message: string | undefined;
    try {
      message = await this.performAction(action, fromPanel);
    } catch (error) {
      ok = false;
      message = ACTION_ERROR[action];
      if (fromPanel) {
        console.error('托盘操作失败', action, error);
      } else {
        this.options.reportError(error);
      }
    } finally {
      this.pending.delete(action);
      this.refresh();
    }
    return { ok, message, state: this.readState() };
  }

  private async performAction(action: TrayPanelAction, fromPanel: boolean): Promise<string | undefined> {
    switch (action) {
      case 'open-main':
        this.hidePanel();
        this.options.openMainWindow();
        return;
      case 'toggle-notes': {
        const snapshot = await this.options.toggleNotesWindow(!fromPanel);
        if (fromPanel && snapshot.windowOpen && snapshot.state.settings.desktopMode && !snapshot.desktopModeActive) {
          return '便利贴未能置底，已用交互模式打开。';
        }
        return;
      }
      case 'toggle-notes-mode':
        await this.options.toggleNotesDesktopMode();
        return;
      case 'highlight-notes':
        await this.options.highlightNotesBounds();
        return;
      case 'toggle-calendar':
        await this.options.toggleCalendarWindow();
        return;
      case 'toggle-calendar-theme':
        await this.options.toggleCalendarTheme();
        return;
      case 'sync-time': {
        if ((await this.options.syncCalendarTime()).source !== 'local') return '已按网络时间校准。';

        const message = '网络校时失败，继续使用本机时间。';
        if (!fromPanel) throw new Error(message);
        return message;
      }
      case 'quit':
        await this.options.quit();
        return;
    }
  }
}

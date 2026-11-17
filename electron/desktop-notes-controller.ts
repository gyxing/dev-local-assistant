import { randomUUID } from 'node:crypto';
import { app, BrowserWindow, ipcMain, Menu, screen, Tray } from 'electron';
import path from 'node:path';
import {
  createEmptyDesktopNotesState,
  DEFAULT_NOTES_WINDOW_HEIGHT,
  DEFAULT_NOTES_WINDOW_WIDTH,
  DESKTOP_NOTES_COMPACT_SIZE,
  DESKTOP_NOTES_HIGHLIGHT_DURATION_MS,
  normalizeDesktopNoteSettings,
  normalizeDesktopNotesWindowBounds,
} from '../shared/desktop-notes-state';
import type {
  DesktopNotesContentUpdate,
  DesktopNotesRuntimeUpdate,
  DesktopNotesSnapshot,
  DesktopNotesState,
  DesktopNotesWindowBounds,
} from '../shared/desktop-notes-types';
import { DEFAULT_APP_RUNTIME_PREFERENCES, type AppRuntimePreferences } from '../shared/task-types';
import { IPC_CHANNELS } from './ipc/channels';
import { ConfigService } from './services/config-service';
import { DesktopNotesService } from './services/desktop-notes-service';

const NOTES_WINDOW_MARGIN = 20;
const FLUSH_TIMEOUT_MS = 1500;

/** 开机自启时附加的启动参数，用于跳过主窗口、只恢复便利贴 */
export const BACKGROUND_LAUNCH_ARG = '--background';

interface DesktopNotesControllerOptions {
  configService: ConfigService;
  notesService: DesktopNotesService;
  getPreloadPath: () => string;
  getRendererEntry: () => string;
  getIconPath: () => string;
  /** 创建或显示主窗口；后台启动时主窗口可能还不存在，由调用方按需创建 */
  openMainWindow: () => void;
}

/**
 * 管理便利贴窗口、托盘和运行开关。
 * 关闭主窗口的默认行为是隐藏到托盘，便利贴继续留在桌面上。
 */
export class DesktopNotesController {
  private readonly configService: ConfigService;
  private readonly notesService: DesktopNotesService;
  private readonly getPreloadPath: () => string;
  private readonly getRendererEntry: () => string;
  private readonly getIconPath: () => string;
  private readonly openMainWindow: () => void;
  private mainWindow?: BrowserWindow;
  private notesWindow?: BrowserWindow;
  private tray?: Tray;
  private quitting = false;
  private runtime: AppRuntimePreferences = { ...DEFAULT_APP_RUNTIME_PREFERENCES };
  /** 用户设定的完整窗口范围，空状态收缩时保留，有贴纸后用它恢复 */
  private normalBounds?: DesktopNotesWindowBounds;
  /** 当前是否处于没有贴纸的收缩状态 */
  private compactMode = false;
  /** 便利贴窗口刚创建时渲染进程可能还没挂监听，用它兜底一次高亮请求 */
  private pendingBoundsHighlight = false;
  /** 检测范围期间临时置顶的恢复定时器 */
  private highlightRestoreTimer?: NodeJS.Timeout;

  constructor(options: DesktopNotesControllerOptions) {
    this.configService = options.configService;
    this.notesService = options.notesService;
    this.getPreloadPath = options.getPreloadPath;
    this.getRendererEntry = options.getRendererEntry;
    this.getIconPath = options.getIconPath;
    this.openMainWindow = options.openMainWindow;
  }

  async start(options: { background?: boolean } = {}) {
    const config = await this.configService.getConfig();
    this.runtime = config.runtime;
    this.applyLaunchAtLogin(this.runtime.launchAtLogin);
    this.registerProcessHandlers();

    if (this.runtime.notesWindowOpen) {
      await this.openNotesWindow();
    }

    // 开机自启不显示主窗口，提前建好托盘，保证用户关掉便利贴后仍有操作入口
    if (options.background) {
      this.ensureTray();
    }
  }

  attachMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
    window.on('close', (event) => {
      this.handleMainWindowClose(event);
    });
  }

  registerIpc() {
    ipcMain.handle(IPC_CHANNELS.desktopNotesGetSnapshot, () => this.readSnapshot());
    ipcMain.handle(IPC_CHANNELS.desktopNotesOpenWindow, () => this.openNotesWindow());
    ipcMain.handle(IPC_CHANNELS.desktopNotesCloseWindow, () => this.closeNotesWindow());
    ipcMain.handle(IPC_CHANNELS.desktopNotesRefresh, () => this.refresh());
    ipcMain.handle(IPC_CHANNELS.desktopNotesLoadState, () => this.notesService.loadState());
    ipcMain.handle(IPC_CHANNELS.desktopNotesSaveState, (event, state: DesktopNotesState) =>
      this.saveFromNotesWindow(event.sender.id, state),
    );
    ipcMain.handle(IPC_CHANNELS.desktopNotesSaveRuntime, (_, update: DesktopNotesRuntimeUpdate) =>
      this.saveRuntime(update),
    );
    ipcMain.handle(IPC_CHANNELS.desktopNotesUpdateContent, (event, update: DesktopNotesContentUpdate) =>
      this.updateContent(event.sender.id, update),
    );
    ipcMain.handle(IPC_CHANNELS.desktopNotesHighlightBounds, () => this.highlightNotesBounds());
    ipcMain.handle(IPC_CHANNELS.desktopNotesTakeBoundsHighlight, () => this.takePendingBoundsHighlight());
    ipcMain.handle(IPC_CHANNELS.desktopNotesSetCompact, (_, compact: boolean) => {
      this.applyCompact(compact);
    });
    ipcMain.handle(IPC_CHANNELS.desktopNotesEndBoundsHighlight, () => {
      this.endBoundsHighlight();
    });
  }

  /** 让便利贴窗口闪烁提示自身范围；窗口未打开时前端已禁用入口，这里只兜底 */
  private async highlightNotesBounds() {
    const target = this.notesWindow;
    if (!target || target.isDestroyed()) {
      return this.readSnapshot();
    }

    // 检测期间临时置顶，避免高亮区域被主窗口或其它窗口挡住
    target.setAlwaysOnTop(true);
    target.moveTop();
    this.scheduleHighlightRestore();

    this.pendingBoundsHighlight = true;
    target.webContents.send(IPC_CHANNELS.desktopNotesBoundsHighlight, DESKTOP_NOTES_HIGHLIGHT_DURATION_MS);
    return this.readSnapshot();
  }

  /** 渲染进程高亮动画结束时立即取消置顶，恢复窗口原有层级 */
  private endBoundsHighlight() {
    this.clearHighlightRestore();
    this.restoreNotesWindowLayer();
  }

  /** 兜底恢复：渲染进程没有回报结束时也按时取消置顶，避免窗口长期置顶 */
  private scheduleHighlightRestore() {
    this.clearHighlightRestore();
    this.highlightRestoreTimer = setTimeout(() => {
      this.highlightRestoreTimer = undefined;
      this.restoreNotesWindowLayer();
    }, DESKTOP_NOTES_HIGHLIGHT_DURATION_MS + 1000);
  }

  private restoreNotesWindowLayer() {
    const target = this.notesWindow;
    if (target && !target.isDestroyed()) {
      target.setAlwaysOnTop(false);
    }
  }

  private clearHighlightRestore() {
    if (this.highlightRestoreTimer) {
      clearTimeout(this.highlightRestoreTimer);
      this.highlightRestoreTimer = undefined;
    }
  }

  /** 渲染进程挂载后领取一次待处理的高亮请求，避免窗口创建瞬间事件丢失 */
  private takePendingBoundsHighlight() {
    const pending = this.pendingBoundsHighlight;
    this.pendingBoundsHighlight = false;
    return pending;
  }

  shouldQuitWhenAllWindowsClosed() {
    return this.quitting || this.runtime.quitWhenMainWindowCloses;
  }

  private registerProcessHandlers() {
    app.on('before-quit', () => {
      this.quitting = true;
      this.tray?.destroy();
      this.tray = undefined;
    });
  }

  private handleMainWindowClose(event: Electron.Event) {
    if (this.quitting) {
      return;
    }

    if (this.runtime.quitWhenMainWindowCloses) {
      this.quitting = true;
      this.destroyNotesWindow();
      app.quit();
      return;
    }

    event.preventDefault();
    this.mainWindow?.hide();
    this.ensureTray();
  }

  private ensureTray() {
    if (this.tray) {
      return;
    }

    this.tray = new Tray(this.getIconPath());
    this.tray.setToolTip('开发者工具箱');
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开主窗口', click: () => this.openMainWindow() },
        { label: '退出', click: () => this.quit() },
      ]),
    );
    this.tray.on('double-click', () => {
      this.openMainWindow();
    });
  }

  private quit() {
    this.quitting = true;
    this.destroyNotesWindow();
    app.quit();
  }

  private async openNotesWindow() {
    if (this.notesWindow && !this.notesWindow.isDestroyed()) {
      this.notesWindow.show();
      this.notesWindow.focus();
      return this.readSnapshot();
    }

    // 打开时先按有无贴纸决定尺寸，避免先铺开大窗口再收缩
    const cache = await this.notesService.getCacheInfo();
    const state = cache.exists ? await this.notesService.loadPersistedState() : createEmptyDesktopNotesState();
    const bounds = this.boundsFromState(state);
    this.normalBounds = bounds;
    this.compactMode = state.notes.length === 0;
    const initialBounds = this.compactMode ? this.compactBounds(bounds) : bounds;

    const notesWindow = new BrowserWindow({
      width: initialBounds.width,
      height: initialBounds.height,
      x: initialBounds.x,
      y: initialBounds.y,
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: false,
      hasShadow: false,
      thickFrame: false,
      backgroundColor: '#00000000',
      icon: this.getIconPath(),
      webPreferences: {
        preload: this.getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    notesWindow.setMenuBarVisibility(false);
    notesWindow.on('closed', () => {
      // 窗口销毁后就不需要再恢复层级了
      this.clearHighlightRestore();
      this.notesWindow = undefined;
      if (!this.quitting) {
        void this.setNotesWindowOpen(false);
      }
    });
    this.notesWindow = notesWindow;
    await this.loadNotesRenderer(notesWindow);
    await this.setNotesWindowOpen(true);
    return this.readSnapshot();
  }

  private closeNotesWindow() {
    const notesWindow = this.notesWindow;
    if (!notesWindow || notesWindow.isDestroyed()) {
      return this.setNotesWindowOpen(false).then(() => this.readSnapshot());
    }

    return new Promise<DesktopNotesSnapshot>((resolve) => {
      notesWindow.once('closed', () => {
        resolve(this.readSnapshot());
      });
      notesWindow.close();
    });
  }

  private destroyNotesWindow() {
    if (!this.notesWindow || this.notesWindow.isDestroyed()) {
      this.notesWindow = undefined;
      return;
    }

    this.notesWindow.destroy();
    this.notesWindow = undefined;
  }

  private async refresh() {
    await this.flushNotesWindow();
    const snapshot = await this.readSnapshot();
    this.publishSnapshot(snapshot);
    if (this.notesWindow && !this.notesWindow.isDestroyed()) {
      this.notesWindow.webContents.send(IPC_CHANNELS.desktopNotesApplyState, snapshot.state);
    }
    return snapshot;
  }

  /** 先让便利贴窗口把未落盘的编辑写回，再读取文件。 */
  private flushNotesWindow() {
    const notesWindow = this.notesWindow;
    if (!notesWindow || notesWindow.isDestroyed()) {
      return Promise.resolve();
    }

    const requestId = randomUUID();

    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timer);
        ipcMain.removeListener(IPC_CHANNELS.desktopNotesFlushResult, handleResult);
        resolve();
      };
      const timer = setTimeout(finish, FLUSH_TIMEOUT_MS);
      const handleResult = (
        event: Electron.IpcMainEvent,
        payload: { requestId?: string; state?: DesktopNotesState },
      ) => {
        if (event.sender.id !== notesWindow.webContents.id || payload.requestId !== requestId) {
          return;
        }

        const saveTask = payload.state ? this.notesService.saveState(payload.state) : Promise.resolve();
        void saveTask.finally(finish);
      };

      ipcMain.on(IPC_CHANNELS.desktopNotesFlushResult, handleResult);
      notesWindow.webContents.send(IPC_CHANNELS.desktopNotesFlush, requestId);
    });
  }

  private async saveFromNotesWindow(senderId: number, state: DesktopNotesState) {
    if (!this.notesWindow || this.notesWindow.webContents.id !== senderId) {
      return this.notesService.loadState();
    }

    const savedState = await this.notesService.saveState(state);
    this.publishSnapshot(await this.readSnapshot());
    return savedState;
  }

  private async saveRuntime(update: DesktopNotesRuntimeUpdate) {
    this.runtime = {
      ...this.runtime,
      launchAtLogin: update.launchAtLogin ?? this.runtime.launchAtLogin,
      quitWhenMainWindowCloses: update.quitWhenMainWindowCloses ?? this.runtime.quitWhenMainWindowCloses,
    };
    await this.configService.saveRuntime(this.runtime);
    this.applyLaunchAtLogin(this.runtime.launchAtLogin);
    const snapshot = await this.readSnapshot();
    this.publishSnapshot(snapshot);
    return snapshot;
  }

  private async setNotesWindowOpen(open: boolean) {
    if (this.runtime.notesWindowOpen === open) {
      return;
    }

    this.runtime = { ...this.runtime, notesWindowOpen: open };
    await this.configService.saveRuntime(this.runtime);
    this.publishSnapshot(await this.readSnapshot());
  }

  /**
   * 开发模式下 Electron 可执行文件不是安装包，写入登录启动项会在开机时启动错误的程序。
   * 偏好仍会保存，打包安装后再同步到系统。
   */
  private applyLaunchAtLogin(enabled: boolean) {
    if (!app.isPackaged) {
      return;
    }

    app.setLoginItemSettings({
      openAtLogin: enabled,
      // 只有开机启动带参数，用户手动点击图标时仍显示主窗口
      args: enabled ? [BACKGROUND_LAUNCH_ARG] : [],
    });
  }

  private async updateContent(senderId: number, update: DesktopNotesContentUpdate) {
    const notesWindowId = this.notesWindow && !this.notesWindow.isDestroyed() ? this.notesWindow.webContents.id : undefined;
    if (senderId === notesWindowId) {
      return this.readSnapshot();
    }

    await this.flushNotesWindow();
    const current = await this.notesService.loadPersistedState();
    const notes = current.notes.flatMap((note) => {
      if (update.deleteNoteId === note.id) {
        return [];
      }

      if (update.note && update.note.id === note.id) {
        return [
          {
            ...note,
            text: update.note.text.trim() || '空白贴纸',
            pinned: update.note.pinned,
            updatedAt: Date.now(),
          },
        ];
      }

      return [note];
    });
    const savedState = await this.notesService.saveState({
      ...current,
      notes,
      settings: update.settings ? normalizeDesktopNoteSettings({ ...current.settings, ...update.settings }) : current.settings,
      windowBounds: update.windowBounds
        ? normalizeDesktopNotesWindowBounds(update.windowBounds) ?? current.windowBounds
        : current.windowBounds,
    });
    this.pushStateToNotesWindow(savedState);
    // 以保存后的贴纸数量决定窗口形态，删掉最后一张时立即收缩，避免先闪回大窗口
    this.normalBounds = savedState.windowBounds;
    this.applyCompact(savedState.notes.length === 0);
    const snapshot = await this.readSnapshot();
    this.publishSnapshot(snapshot);
    return snapshot;
  }

  private pushStateToNotesWindow(state: DesktopNotesState) {
    if (!this.notesWindow || this.notesWindow.isDestroyed()) {
      return;
    }

    this.notesWindow.webContents.send(IPC_CHANNELS.desktopNotesApplyState, state);
  }

  /** 空状态下的窗口范围：右下角锚点不动，收成刚好包住新建按钮的小方块 */
  private compactBounds(normal: DesktopNotesWindowBounds): DesktopNotesWindowBounds {
    const size = DESKTOP_NOTES_COMPACT_SIZE;
    return {
      width: size,
      height: size,
      x: normal.x + normal.width - size,
      y: normal.y + normal.height - size,
    };
  }

  private applyCompact(compact: boolean) {
    if (!this.notesWindow || this.notesWindow.isDestroyed() || !this.normalBounds) {
      return;
    }

    this.compactMode = compact;
    this.notesWindow.setBounds(compact ? this.compactBounds(this.normalBounds) : this.normalBounds);
  }

  private boundsFromState(state: DesktopNotesState): DesktopNotesWindowBounds {
    if (state.windowBounds) {
      return state.windowBounds;
    }

    const workArea = screen.getPrimaryDisplay().workArea;
    return {
      width: DEFAULT_NOTES_WINDOW_WIDTH,
      height: DEFAULT_NOTES_WINDOW_HEIGHT,
      x: workArea.x + workArea.width - DEFAULT_NOTES_WINDOW_WIDTH - NOTES_WINDOW_MARGIN,
      y: workArea.y + workArea.height - DEFAULT_NOTES_WINDOW_HEIGHT - NOTES_WINDOW_MARGIN,
    };
  }

  private async readSnapshot(): Promise<DesktopNotesSnapshot> {
    const cache = await this.notesService.getCacheInfo();
    const state = cache.exists ? await this.notesService.loadPersistedState() : createEmptyDesktopNotesState();

    return {
      windowOpen: Boolean(this.notesWindow && !this.notesWindow.isDestroyed()),
      state,
      windowBounds: this.boundsFromState(state),
      workArea: screen.getPrimaryDisplay().workArea,
      cache,
      runtime: this.runtime,
      packaged: app.isPackaged,
    };
  }

  private publishSnapshot(snapshot: DesktopNotesSnapshot) {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    this.mainWindow.webContents.send(IPC_CHANNELS.desktopNotesSnapshot, snapshot);
  }

  private async loadNotesRenderer(notesWindow: BrowserWindow) {
    if (process.env.NODE_ENV === 'development') {
      const devServerUrl = process.env.DEV_SERVER_URL ?? 'http://127.0.0.1:8137';
      await notesWindow.loadURL(`${devServerUrl}/#/desktop-notes`);
      return;
    }

    await notesWindow.loadFile(this.getRendererEntry(), { hash: '/desktop-notes' });
  }
}

export function getAppIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(app.getAppPath(), 'build', 'icon.ico');
}

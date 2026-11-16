import { randomUUID } from 'node:crypto';
import { app, BrowserWindow, ipcMain, Menu, screen, Tray } from 'electron';
import path from 'node:path';
import {
  createEmptyDesktopNotesState,
  DEFAULT_NOTES_WINDOW_HEIGHT,
  DEFAULT_NOTES_WINDOW_WIDTH,
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

interface DesktopNotesControllerOptions {
  configService: ConfigService;
  notesService: DesktopNotesService;
  getPreloadPath: () => string;
  getRendererEntry: () => string;
  getIconPath: () => string;
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
  private mainWindow?: BrowserWindow;
  private notesWindow?: BrowserWindow;
  private tray?: Tray;
  private quitting = false;
  private runtime: AppRuntimePreferences = { ...DEFAULT_APP_RUNTIME_PREFERENCES };

  constructor(options: DesktopNotesControllerOptions) {
    this.configService = options.configService;
    this.notesService = options.notesService;
    this.getPreloadPath = options.getPreloadPath;
    this.getRendererEntry = options.getRendererEntry;
    this.getIconPath = options.getIconPath;
  }

  async start() {
    const config = await this.configService.getConfig();
    this.runtime = config.runtime;
    this.applyLaunchAtLogin(this.runtime.launchAtLogin);
    this.registerProcessHandlers();

    if (this.runtime.notesWindowOpen) {
      await this.openNotesWindow();
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
    this.tray.setToolTip('开发者本地助手');
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开主窗口', click: () => this.showMainWindow() },
        { label: '退出', click: () => this.quit() },
      ]),
    );
    this.tray.on('double-click', () => {
      this.showMainWindow();
    });
  }

  private showMainWindow() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return;
    }

    this.mainWindow.show();
    this.mainWindow.focus();
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

    const bounds = await this.resolveWindowBounds();
    const notesWindow = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
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

    app.setLoginItemSettings({ openAtLogin: enabled });
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
    this.applyWindowBounds(savedState.windowBounds);
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

  private applyWindowBounds(bounds: DesktopNotesWindowBounds | undefined) {
    if (!bounds || !this.notesWindow || this.notesWindow.isDestroyed()) {
      return;
    }

    this.notesWindow.setBounds({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  }

  private async resolveWindowBounds(): Promise<DesktopNotesWindowBounds> {
    const cache = await this.notesService.getCacheInfo();
    const state = cache.exists ? await this.notesService.loadPersistedState() : createEmptyDesktopNotesState();
    return this.boundsFromState(state);
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

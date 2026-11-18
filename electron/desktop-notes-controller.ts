import { randomUUID } from 'node:crypto';
import { app, BrowserWindow, ipcMain, screen } from 'electron';
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
  DesktopNotesSnapshot,
  DesktopNotesState,
  DesktopNotesWindowState,
  DesktopNotesWindowBounds,
} from '../shared/desktop-notes-types';
import { IPC_CHANNELS } from './ipc/channels';
import { ConfigService } from './services/config-service';
import { DesktopNotesService } from './services/desktop-notes-service';
import {
  getDisplayInfo,
  getDisplayWorkArea,
  getPrimaryDisplayId,
  isDisplayAvailable,
  listDisplays,
} from './services/display-service';
import { sendWindowToBottom } from './services/window-layer-service';

const NOTES_WINDOW_MARGIN = 20;
const FLUSH_TIMEOUT_MS = 1500;

interface DesktopNotesControllerOptions {
  configService: ConfigService;
  notesService: DesktopNotesService;
  getPreloadPath: () => string;
  getRendererEntry: () => string;
  getIconPath: () => string;
  saveRuntime: ConfigService['saveRuntime'];
  reportError: (error: unknown) => void;
}

/**
 * 管理便利贴窗口、模式和运行偏好，串行处理需要协调渲染端的操作。
 */
export class DesktopNotesController {
  private readonly configService: ConfigService;
  private readonly notesService: DesktopNotesService;
  private readonly getPreloadPath: () => string;
  private readonly getRendererEntry: () => string;
  private readonly getIconPath: () => string;
  private readonly writeRuntime: ConfigService['saveRuntime'];
  private readonly reportError: (error: unknown) => void;
  private mainWindow?: BrowserWindow;
  private notesWindow?: BrowserWindow;
  private quitting = false;
  private canUseDesktopMode = false;
  private desktopModeSaved = false;
  private desktopModeActive = false;
  private pendingAction: Promise<unknown> = Promise.resolve();
  private onStateChanged?: () => void;
  private notesWindowOpen = false;
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
    this.writeRuntime = options.saveRuntime;
    this.reportError = options.reportError;
  }

  async start(canUseDesktopMode: boolean) {
    this.canUseDesktopMode = canUseDesktopMode && process.platform === 'win32';
    const config = await this.configService.getConfig();
    this.notesWindowOpen = config.runtime.notesWindowOpen;
    this.desktopModeSaved = (await this.notesService.loadPersistedState()).settings.desktopMode;
    // 显示器被拔掉时把窗口收回主屏
    screen.on('display-removed', () => {
      void this.runAction(() => this.handleDisplayRemoved()).catch(this.reportError);
    });

    if (this.notesWindowOpen) {
      await this.runAction(() => this.openNotesWindow());
    }
  }

  attachMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  setOnStateChanged(callback: () => void) {
    this.onStateChanged = callback;
  }

  getTrayState() {
    const windowOpen = Boolean(this.notesWindow && !this.notesWindow.isDestroyed());
    return { windowOpen, desktopMode: windowOpen ? this.desktopModeActive : this.desktopModeSaved };
  }

  /** 等待便签草稿保存后进入退出状态，并保留下次启动的窗口偏好。 */
  prepareQuit() {
    return this.runAction(async () => {
      if (this.quitting) {
        return;
      }
      await this.withFlushedWindow(async () => {
        this.quitting = true;
      });
    });
  }

  /** 面板入口可无激活地打开便签，避免打断用户连续操作。 */
  toggleWindow(activate = true) {
    return this.runAction(() => this.getTrayState().windowOpen ? this.closeNotesWindow() : this.openNotesWindow(activate));
  }

  toggleDesktopMode() {
    return this.runAction(() => this.applyDesktopMode(!this.getTrayState().desktopMode));
  }

  /** 串行执行窗口操作，失败后仍然接受下一次请求。 */
  private runAction<T>(action: () => Promise<T>): Promise<T> {
    const task = this.pendingAction.then(action);
    this.pendingAction = task.catch(() => undefined);
    return task;
  }

  registerIpc() {
    ipcMain.handle(IPC_CHANNELS.desktopNotesGetSnapshot, () => this.readSnapshot());
    ipcMain.handle(IPC_CHANNELS.desktopNotesOpenWindow, () => this.runAction(() => this.openNotesWindow()));
    ipcMain.handle(IPC_CHANNELS.desktopNotesCloseWindow, () => this.runAction(() => this.closeNotesWindow()));
    ipcMain.handle(IPC_CHANNELS.desktopNotesRefresh, () => this.runAction(() => this.refresh()));
    ipcMain.handle(IPC_CHANNELS.desktopNotesLoadState, async (): Promise<DesktopNotesWindowState> => ({
      state: await this.notesService.loadState(),
      desktopModeActive: this.desktopModeActive,
    }));
    ipcMain.handle(IPC_CHANNELS.desktopNotesSetDesktopMode, (_, enabled: unknown) => {
      if (typeof enabled !== 'boolean') {
        throw new TypeError('桌面模式必须为布尔值');
      }
      return this.runAction(() => this.applyDesktopMode(enabled));
    });
    ipcMain.handle(IPC_CHANNELS.desktopNotesSaveState, (event, state: DesktopNotesState) =>
      this.saveFromNotesWindow(event.sender.id, state),
    );
    ipcMain.handle(IPC_CHANNELS.desktopNotesUpdateContent, (event, update: DesktopNotesContentUpdate) =>
      this.runAction(() => this.updateContent(event.sender.id, update)),
    );
    ipcMain.handle(IPC_CHANNELS.desktopNotesHighlightBounds, () => this.highlightNotesBounds());
    ipcMain.handle(IPC_CHANNELS.desktopNotesTakeBoundsHighlight, () => this.takePendingBoundsHighlight());
  }

  /** 让便利贴窗口闪烁提示自身范围；窗口未打开时前端已禁用入口，这里只兜底 */
  highlightNotesBounds() {
    return this.runAction(() => this.showBoundsHighlight());
  }

  private async showBoundsHighlight() {
    const target = this.notesWindow;
    if (!target || target.isDestroyed()) {
      return this.readSnapshot();
    }

    // 检测期间临时置顶，避免高亮区域被主窗口或其它窗口挡住
    if (!this.desktopModeActive) {
      target.setAlwaysOnTop(true);
      target.moveTop();
      this.scheduleHighlightRestore(target);
    }

    this.pendingBoundsHighlight = true;
    target.webContents.send(IPC_CHANNELS.desktopNotesBoundsHighlight, DESKTOP_NOTES_HIGHLIGHT_DURATION_MS);
    return this.readSnapshot();
  }

  /** 由主进程结束临时置顶，避免过期的渲染回包改变窗口层级。 */
  private scheduleHighlightRestore(target: BrowserWindow) {
    this.clearHighlightRestore();
    this.highlightRestoreTimer = setTimeout(() => {
      this.highlightRestoreTimer = undefined;
      if (target === this.notesWindow && !target.isDestroyed() && !this.desktopModeActive) {
        target.setAlwaysOnTop(false);
      }
    }, DESKTOP_NOTES_HIGHLIGHT_DURATION_MS);
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

  private async applyDesktopMode(enabled: boolean) {
    if (enabled && !this.canUseDesktopMode) {
      throw new Error('当前无法启用便利贴桌面模式，请检查系统托盘');
    }

    const target = this.notesWindow;
    if (!target || target.isDestroyed()) {
      await this.saveDesktopMode(enabled);
      return this.notifyStateChanged();
    }

    if (enabled === this.desktopModeActive && enabled === this.desktopModeSaved) {
      return this.readSnapshot();
    }

    return this.withFlushedWindow(async () => {
      try {
        this.clearHighlightRestore();
        this.pendingBoundsHighlight = false;
        if (enabled) {
          try {
            target.setAlwaysOnTop(false);
            target.setFocusable(false);
            target.setIgnoreMouseEvents(true);
            // Windows 有时保留当前激活窗口，重新无激活显示可释放焦点。
            if (target.isFocused()) {
              target.hide();
              target.showInactive();
            }
            await sendWindowToBottom(target);
            await this.saveDesktopMode(true);
            this.desktopModeActive = target === this.notesWindow && !target.isDestroyed();
          } catch (error) {
            this.restoreInteraction(target);
            throw new Error('无法启用便利贴桌面模式，已恢复交互', { cause: error });
          }
        } else {
          this.restoreInteraction(target);
          // 即使偏好写入失败，也先确保当前窗口可操作。
          try {
            await this.saveDesktopMode(false);
          } catch (error) {
            throw new Error('已恢复交互，桌面模式偏好未保存，重启后可能重新启用', { cause: error });
          }
        }
      } finally {
        await this.refreshWindowState();
      }
      return this.readSnapshot();
    });
  }

  private async saveDesktopMode(enabled: boolean) {
    await this.notesService.updateState((current) => ({
      ...current,
      settings: { ...current.settings, desktopMode: enabled },
    }));
    this.desktopModeSaved = enabled;
  }

  private restoreInteraction(target: BrowserWindow, raise = true) {
    this.desktopModeActive = false;
    if (target === this.notesWindow && !target.isDestroyed()) {
      target.setAlwaysOnTop(false);
      target.setIgnoreMouseEvents(false);
      target.setFocusable(true);
      // Windows 的 setFocusable(true) 也会恢复任务栏入口，便签仍由托盘管理。
      target.setSkipTaskbar(true);
      if (raise) target.moveTop();
    }
  }

  private async openNotesWindow(activate = true) {
    if (this.notesWindow && !this.notesWindow.isDestroyed()) {
      if (!this.desktopModeActive) {
        if (activate) {
          this.notesWindow.show();
          this.notesWindow.focus();
        } else {
          this.notesWindow.showInactive();
        }
      }
      return this.readSnapshot();
    }

    const state = await this.notesService.loadState();
    const bounds = this.boundsFromState(state);
    this.desktopModeActive = this.canUseDesktopMode && state.settings.desktopMode;
    const initialBounds = this.shouldCompact(state) ? this.compactBounds(bounds) : bounds;

    const notesWindow = new BrowserWindow({
      width: initialBounds.width,
      height: initialBounds.height,
      x: initialBounds.x,
      y: initialBounds.y,
      show: false,
      focusable: !this.desktopModeActive,
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
    notesWindow.setIgnoreMouseEvents(this.desktopModeActive);
    notesWindow.on('close', (event) => {
      if (!this.quitting) {
        event.preventDefault();
        void this.runAction(() => this.closeNotesWindow()).catch(this.reportError);
      }
    });
    notesWindow.on('closed', () => {
      this.clearHighlightRestore();
      this.pendingBoundsHighlight = false;
      this.notesWindow = undefined;
      this.desktopModeActive = false;
      this.onStateChanged?.();
    });
    this.notesWindow = notesWindow;
    try {
      await this.loadNotesRenderer(notesWindow);
      if (!(await this.notesService.getCacheInfo()).exists) {
        await this.notesService.updateState((current) => current);
      }
      if (this.desktopModeActive) {
        notesWindow.showInactive();
        try {
          await sendWindowToBottom(notesWindow);
        } catch (error) {
          this.restoreInteraction(notesWindow, activate);
          const failure = new Error('打开时无法置底便利贴，本次以交互模式显示', { cause: error });
          if (activate) {
            this.reportError(failure);
          } else {
            console.warn(failure);
          }
        }
      } else if (!activate) {
        notesWindow.showInactive();
      } else {
        notesWindow.show();
      }
      await this.setNotesWindowOpen(true);
      return this.refreshWindowState();
    } catch (error) {
      if (!notesWindow.isDestroyed()) {
        notesWindow.destroy();
      }
      throw error;
    }
  }

  private async closeNotesWindow() {
    await this.withFlushedWindow(async (target) => {
      await this.setNotesWindowOpen(false);
      target?.destroy();
    });
    return this.notifyStateChanged();
  }

  private async refresh() {
    return this.withFlushedWindow(() => this.refreshWindowState());
  }

  /** 在管理操作期间暂停窗口编辑，避免旧快照覆盖刚保存的内容。 */
  private async withFlushedWindow<T>(action: (target?: BrowserWindow) => Promise<T>): Promise<T> {
    const target = this.notesWindow;
    if (!target || target.isDestroyed() || this.desktopModeActive) {
      return action(target?.isDestroyed() ? undefined : target);
    }
    try {
      await this.flushNotesWindow(target);
      return await action(target);
    } finally {
      if (!this.quitting && !target.isDestroyed()) {
        target.webContents.send(IPC_CHANNELS.desktopNotesResumeEdits);
      }
    }
  }

  /** 保存请求的回包独立处理，避免与正在等待它的窗口操作互锁。 */
  private flushNotesWindow(notesWindow: BrowserWindow) {
    const requestId = randomUUID();
    const senderId = notesWindow.webContents.id;

    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        ipcMain.removeListener(IPC_CHANNELS.desktopNotesFlushResult, handleResult);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('等待便利贴编辑保存超时，请重试'));
      }, FLUSH_TIMEOUT_MS);
      const handleResult = (
        event: Electron.IpcMainEvent,
        payload: { requestId?: string; state?: DesktopNotesState },
      ) => {
        if (event.sender.id !== senderId || payload.requestId !== requestId) {
          return;
        }
        cleanup();
        if (!payload.state) {
          reject(new Error('便利贴尚未准备好保存，请重试'));
          return;
        }
        void this.saveRendererContent(payload.state).then(() => resolve(), reject);
      };

      ipcMain.on(IPC_CHANNELS.desktopNotesFlushResult, handleResult);
      notesWindow.webContents.send(IPC_CHANNELS.desktopNotesFlush, requestId);
    });
  }

  private async saveFromNotesWindow(senderId: number, state: DesktopNotesState) {
    if (!this.notesWindow || this.notesWindow.isDestroyed() || this.notesWindow.webContents.id !== senderId || this.desktopModeActive) {
      return this.notesService.loadState();
    }

    const savedState = await this.saveRendererContent(state);
    this.applyWindowSize(savedState);
    this.publishSnapshot(await this.readSnapshot());
    return savedState;
  }

  private saveRendererContent(state: DesktopNotesState) {
    return this.notesService.updateState((current) => ({
      ...current,
      notes: state.notes,
      // 窗口不回写管理页维护的屏幕范围和主进程维护的模式。
      settings: { ...state.settings, desktopMode: current.settings.desktopMode },
    }));
  }

  private async setNotesWindowOpen(open: boolean) {
    if (this.notesWindowOpen === open) {
      return;
    }

    await this.writeRuntime({ notesWindowOpen: open });
    this.notesWindowOpen = open;
  }

  private async updateContent(senderId: number, update: DesktopNotesContentUpdate) {
    const notesWindowId = this.notesWindow && !this.notesWindow.isDestroyed() ? this.notesWindow.webContents.id : undefined;
    if (senderId === notesWindowId) {
      return this.readSnapshot();
    }

    return this.withFlushedWindow(async () => {
      await this.notesService.updateState((current) => this.applyContentUpdate(current, update), createEmptyDesktopNotesState);
      return this.refreshWindowState();
    });
  }

  private applyContentUpdate(current: DesktopNotesState, update: DesktopNotesContentUpdate): DesktopNotesState {
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
    const displayChanged = Boolean(update.displayId) && update.displayId !== current.displayId;
    const nextDisplayId = update.displayId ?? current.displayId;
    let nextBounds = update.windowBounds
      ? normalizeDesktopNotesWindowBounds(update.windowBounds) ?? current.windowBounds
      : current.windowBounds;

    if (displayChanged) {
      // 换显示器后放到新屏右下角，避免沿用旧屏的坐标
      nextBounds = this.defaultBoundsForDisplay(nextDisplayId, nextBounds?.width, nextBounds?.height);
    }

    return {
      ...current,
      notes,
      displayId: nextDisplayId,
      settings: update.settings
        ? normalizeDesktopNoteSettings({ ...current.settings, ...update.settings, desktopMode: current.settings.desktopMode })
        : current.settings,
      windowBounds: nextBounds,
    };
  }

  private async refreshWindowState() {
    const snapshot = await this.notifyStateChanged();
    this.applyWindowSize(snapshot.state);
    if (!this.notesWindow || this.notesWindow.isDestroyed()) {
      return snapshot;
    }

    const state: DesktopNotesWindowState = { state: snapshot.state, desktopModeActive: snapshot.desktopModeActive };
    this.notesWindow.webContents.send(IPC_CHANNELS.desktopNotesApplyState, state);
    return snapshot;
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

  private shouldCompact(state: DesktopNotesState) {
    return !this.desktopModeActive && state.notes.length === 0;
  }

  private applyWindowSize(state: DesktopNotesState) {
    if (!this.notesWindow || this.notesWindow.isDestroyed()) {
      return;
    }

    const bounds = this.boundsFromState(state);
    this.notesWindow.setBounds(this.shouldCompact(state) ? this.compactBounds(bounds) : bounds);
  }

  private boundsFromState(state: DesktopNotesState): DesktopNotesWindowBounds {
    if (state.windowBounds) {
      return state.windowBounds;
    }

    return this.defaultBoundsForDisplay(state.displayId);
  }

  /** 指定显示器上的默认位置：右下角。 */
  private defaultBoundsForDisplay(
    displayId: string | undefined,
    width = DEFAULT_NOTES_WINDOW_WIDTH,
    height = DEFAULT_NOTES_WINDOW_HEIGHT,
  ): DesktopNotesWindowBounds {
    const workArea = getDisplayWorkArea(displayId);

    return {
      width,
      height,
      x: workArea.x + Math.max(0, workArea.width - width - NOTES_WINDOW_MARGIN),
      y: workArea.y + Math.max(0, workArea.height - height - NOTES_WINDOW_MARGIN),
    };
  }

  /** 保存的显示器不在了：把窗口收回主屏右下角并同步状态。 */
  private async handleDisplayRemoved() {
    const state = await this.notesService.loadPersistedState();
    if (!state.displayId || isDisplayAvailable(state.displayId)) {
      return;
    }

    const primaryId = getPrimaryDisplayId();
    const bounds = this.defaultBoundsForDisplay(primaryId, state.windowBounds?.width, state.windowBounds?.height);
    await this.notesService.updateState((current) => ({
      ...current,
      displayId: primaryId,
      windowBounds: bounds,
    }));

    // 屏幕变化只改变主进程的窗口范围，避免覆盖渲染端尚未保存的文本。
    const snapshot = await this.notifyStateChanged();
    this.applyWindowSize(snapshot.state);
  }

  private async readSnapshot(): Promise<DesktopNotesSnapshot> {
    const cache = await this.notesService.getCacheInfo();
    const state = cache.exists ? await this.notesService.loadState() : createEmptyDesktopNotesState();
    const display = getDisplayInfo(state.displayId);

    return {
      windowOpen: Boolean(this.notesWindow && !this.notesWindow.isDestroyed()),
      desktopModeActive: this.desktopModeActive,
      state,
      windowBounds: this.boundsFromState(state),
      workArea: display.workArea,
      displays: listDisplays(),
      activeDisplayId: display.id,
      cache,
    };
  }

  private async notifyStateChanged() {
    const snapshot = await this.readSnapshot();
    this.publishSnapshot(snapshot);
    this.onStateChanged?.();
    return snapshot;
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

import { BrowserWindow, ipcMain, screen } from 'electron';
import {
  CALENDAR_UNPOSITIONED,
  DEFAULT_DESKTOP_CALENDAR_SETTINGS,
  normalizeDesktopCalendarSettings,
} from '../shared/desktop-calendar-state';
import type {
  CalendarHolidayYear,
  DesktopCalendarSettings,
  DesktopCalendarSnapshot,
} from '../shared/desktop-calendar-types';
import { IPC_CHANNELS } from './ipc/channels';
import { ConfigService } from './services/config-service';
import {
  getDisplayInfo,
  getDisplayWorkArea,
  getPrimaryDisplayId,
  isDisplayAvailable,
  listDisplays,
} from './services/display-service';
import { HolidayService } from './services/holiday-service';
import { TimeService } from './services/time-service';
import { sendWindowToBottom } from './services/window-layer-service';

interface DesktopCalendarControllerOptions {
  configService: ConfigService;
  holidayService: HolidayService;
  timeService: TimeService;
  getPreloadPath: () => string;
  getRendererEntry: () => string;
  saveCalendarSettings: ConfigService['saveCalendarSettings'];
  reportError: (error: unknown) => void;
}

/**
 * 管理桌面日历窗口：透明、点击穿透、置底，纯展示。
 * 窗口不抢焦点，所有设置都从主窗口的管理页修改。
 */
export class DesktopCalendarController {
  private readonly configService: ConfigService;
  private readonly holidayService: HolidayService;
  private readonly timeService: TimeService;
  private readonly getPreloadPath: () => string;
  private readonly getRendererEntry: () => string;
  private readonly writeSettings: ConfigService['saveCalendarSettings'];
  private readonly reportError: (error: unknown) => void;
  private mainWindow?: BrowserWindow;
  private window?: BrowserWindow;
  private settings: DesktopCalendarSettings = {
    ...DEFAULT_DESKTOP_CALENDAR_SETTINGS,
  };
  private pendingSettings: Promise<unknown> = Promise.resolve();
  private onStateChanged?: () => void;

  constructor(options: DesktopCalendarControllerOptions) {
    this.configService = options.configService;
    this.holidayService = options.holidayService;
    this.timeService = options.timeService;
    this.getPreloadPath = options.getPreloadPath;
    this.getRendererEntry = options.getRendererEntry;
    this.writeSettings = options.saveCalendarSettings;
    this.reportError = options.reportError;
  }

  async start() {
    const config = await this.configService.getConfig();
    this.settings = config.calendar;

    if (this.settings.enabled) {
      await this.openWindow();
    }

    // 网络校时不阻塞窗口显示，失败时保留本机时间
    void this.timeService.start();

    // 显示器被拔掉时把窗口收回主屏
    screen.on('display-removed', () => {
      void this.runSettingsAction(() => this.handleDisplayRemoved()).catch(
        this.reportError,
      );
    });
  }

  registerIpc() {
    ipcMain.handle(IPC_CHANNELS.desktopCalendarGetSnapshot, () =>
      this.readSnapshot(),
    );
    ipcMain.handle(IPC_CHANNELS.desktopCalendarOpenWindow, () =>
      this.updateSettings({ enabled: true }),
    );
    ipcMain.handle(IPC_CHANNELS.desktopCalendarCloseWindow, () =>
      this.updateSettings({ enabled: false }),
    );
    ipcMain.handle(
      IPC_CHANNELS.desktopCalendarSaveSettings,
      (_, patch: Partial<DesktopCalendarSettings>) =>
        this.updateSettings(patch),
    );
    ipcMain.handle(IPC_CHANNELS.desktopCalendarGetHolidays, (_, year: number) =>
      this.getHolidays(year),
    );
    ipcMain.handle(IPC_CHANNELS.desktopCalendarGetTime, () =>
      this.timeService.getInfo(),
    );
    ipcMain.handle(IPC_CHANNELS.desktopCalendarSyncTime, () => this.syncTime());
  }

  attachMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  setOnStateChanged(callback: () => void) {
    this.onStateChanged = callback;
  }

  getTrayState() {
    return {
      windowOpen: Boolean(this.window && !this.window.isDestroyed()),
      darkTheme: this.settings.theme === 'dark',
    };
  }

  toggleWindow() {
    return this.runSettingsAction(() =>
      this.applySettings({ enabled: !this.getTrayState().windowOpen }),
    );
  }

  toggleTheme() {
    return this.runSettingsAction(() =>
      this.applySettings({
        theme: this.settings.theme === 'dark' ? 'light' : 'dark',
      }),
    );
  }

  /** 两个入口共享校时结果，管理页和日历窗口无需等待轮询。 */
  async syncTime() {
    const info = await this.timeService.sync();
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(
        IPC_CHANNELS.desktopCalendarTimeChanged,
        info,
      );
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(
        IPC_CHANNELS.desktopCalendarTimeChanged,
        info,
      );
    }
    return info;
  }

  /** 将托盘和管理页的配置变更按到达顺序应用。 */
  private runSettingsAction<T>(apply: () => Promise<T>): Promise<T> {
    const task = this.pendingSettings.then(apply);
    this.pendingSettings = task.catch(() => undefined);
    return task;
  }

  private async getHolidays(year: number): Promise<CalendarHolidayYear> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return { year, days: [], source: 'none' };
    }

    return this.holidayService.getYear(year);
  }

  private updateSettings(patch: Partial<DesktopCalendarSettings>) {
    return this.runSettingsAction(() => this.applySettings(patch));
  }

  private async applySettings(
    patch: Partial<DesktopCalendarSettings>,
  ): Promise<DesktopCalendarSnapshot> {
    const previous = this.settings;
    const nextSettings = normalizeDesktopCalendarSettings({
      ...previous,
      ...patch,
    });
    // 切换显示器后回到新屏右上角，避免沿用旧屏坐标
    if (nextSettings.displayId !== this.settings.displayId) {
      nextSettings.x = CALENDAR_UNPOSITIONED;
      nextSettings.y = CALENDAR_UNPOSITIONED;
    }

    const needsWindow =
      patch.enabled === true && !this.getTrayState().windowOpen;
    this.settings = nextSettings;
    try {
      if (needsWindow) {
        await this.openWindow();
      }
      const config = await this.writeSettings(nextSettings);
      this.settings = config.calendar;
    } catch (error) {
      this.settings = previous;
      if (needsWindow) {
        this.destroyWindow();
      }
      this.publishSnapshot();
      throw error;
    }

    if (this.settings.enabled) {
      this.applyWindowSettings();
    } else {
      this.destroyWindow();
    }
    return this.publishSnapshot();
  }

  private applyWindowSettings() {
    const window = this.window;
    if (!window || window.isDestroyed()) {
      return;
    }

    window.setBounds(this.resolveBounds());
    window.webContents.send(
      IPC_CHANNELS.desktopCalendarSettingsChanged,
      this.settings,
    );
  }

  /** 未定位时放到所选显示器右上角；已定位时限制在该显示器工作区内。 */
  private resolveBounds() {
    const { width, height } = this.settings;
    const workArea = getDisplayWorkArea(this.settings.displayId);
    const margin = 40;

    if (
      this.settings.x === CALENDAR_UNPOSITIONED ||
      this.settings.y === CALENDAR_UNPOSITIONED
    ) {
      return {
        width,
        height,
        x: workArea.x + Math.max(0, workArea.width - width - margin),
        y: workArea.y + margin,
      };
    }

    return {
      width,
      height,
      x: Math.min(
        Math.max(this.settings.x, workArea.x),
        workArea.x + Math.max(0, workArea.width - width),
      ),
      y: Math.min(
        Math.max(this.settings.y, workArea.y),
        workArea.y + Math.max(0, workArea.height - height),
      ),
    };
  }

  /** 保存的显示器被拔掉：回到主屏右上角并持久化。 */
  private async handleDisplayRemoved() {
    if (
      !this.settings.displayId ||
      isDisplayAvailable(this.settings.displayId)
    ) {
      return;
    }

    await this.applySettings({
      displayId: getPrimaryDisplayId(),
      x: CALENDAR_UNPOSITIONED,
      y: CALENDAR_UNPOSITIONED,
    });
  }

  private async openWindow() {
    const window = new BrowserWindow({
      ...this.resolveBounds(),
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      focusable: false,
      alwaysOnTop: false,
      hasShadow: false,
      thickFrame: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: this.getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    window.setMenuBarVisibility(false);
    // 纯展示窗口：鼠标事件直接穿透到桌面或下层窗口
    window.setIgnoreMouseEvents(true);
    window.on('closed', () => {
      this.window = undefined;
      this.publishSnapshot();
    });

    this.window = window;
    try {
      await this.loadRenderer(window);
    } catch (error) {
      this.destroyWindow();
      throw error;
    }
    try {
      await sendWindowToBottom(window);
    } catch (error) {
      // 置底失败时日历继续显示，沿用原有降级行为。
      console.warn('桌面日历置底失败', error);
    }
  }

  private async loadRenderer(window: BrowserWindow) {
    if (process.env.NODE_ENV === 'development') {
      const devServerUrl =
        process.env.DEV_SERVER_URL ?? 'http://127.0.0.1:8137';
      await window.loadURL(`${devServerUrl}/#/desktop-calendar`);
      return;
    }

    await window.loadFile(this.getRendererEntry(), {
      hash: '/desktop-calendar',
    });
  }

  private destroyWindow() {
    if (!this.window || this.window.isDestroyed()) {
      this.window = undefined;
      return;
    }

    this.window.destroy();
    this.window = undefined;
  }

  private readSnapshot(): DesktopCalendarSnapshot {
    const display = getDisplayInfo(this.settings.displayId);

    return {
      windowOpen: Boolean(this.window && !this.window.isDestroyed()),
      settings: this.settings,
      bounds: this.resolveBounds(),
      displays: listDisplays(),
      activeDisplayId: display.id,
    };
  }

  private publishSnapshot() {
    const snapshot = this.readSnapshot();
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(
        IPC_CHANNELS.desktopCalendarSnapshot,
        snapshot,
      );
    }
    this.onStateChanged?.();
    return snapshot;
  }
}

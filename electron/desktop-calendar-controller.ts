import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { app, BrowserWindow, ipcMain, screen } from 'electron';
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
import { HolidayService } from './services/holiday-service';
import { TimeService } from './services/time-service';

const execFileAsync = promisify(execFile);
const BOTTOM_SCRIPT_TIMEOUT_MS = 5000;

interface DesktopCalendarControllerOptions {
  configService: ConfigService;
  holidayService: HolidayService;
  timeService: TimeService;
  getPreloadPath: () => string;
  getRendererEntry: () => string;
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
  private window?: BrowserWindow;
  private settings: DesktopCalendarSettings = { ...DEFAULT_DESKTOP_CALENDAR_SETTINGS };

  constructor(options: DesktopCalendarControllerOptions) {
    this.configService = options.configService;
    this.holidayService = options.holidayService;
    this.timeService = options.timeService;
    this.getPreloadPath = options.getPreloadPath;
    this.getRendererEntry = options.getRendererEntry;
  }

  async start() {
    const config = await this.configService.getConfig();
    this.settings = config.calendar;

    if (this.settings.enabled) {
      await this.openWindow();
    }

    // 网络校时不阻塞窗口显示，失败时保留本机时间
    void this.timeService.start();
  }

  registerIpc() {
    ipcMain.handle(IPC_CHANNELS.desktopCalendarGetSnapshot, () => this.readSnapshot());
    ipcMain.handle(IPC_CHANNELS.desktopCalendarOpenWindow, () => this.openWindow());
    ipcMain.handle(IPC_CHANNELS.desktopCalendarCloseWindow, () => this.closeWindow());
    ipcMain.handle(IPC_CHANNELS.desktopCalendarSaveSettings, (_, settings: DesktopCalendarSettings) =>
      this.saveSettings(settings),
    );
    ipcMain.handle(IPC_CHANNELS.desktopCalendarGetHolidays, (_, year: number) => this.getHolidays(year));
    ipcMain.handle(IPC_CHANNELS.desktopCalendarGetTime, () => this.timeService.getInfo());
    ipcMain.handle(IPC_CHANNELS.desktopCalendarSyncTime, async () => {
      const info = await this.timeService.sync();
      // 手动校时后立刻通知日历窗口，不必等下一次轮询
      this.window?.webContents.send(IPC_CHANNELS.desktopCalendarTimeChanged, info);
      return info;
    });
  }

  private async getHolidays(year: number): Promise<CalendarHolidayYear> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return { year, days: [], source: 'none' };
    }

    return this.holidayService.getYear(year);
  }

  private async saveSettings(settings: DesktopCalendarSettings): Promise<DesktopCalendarSnapshot> {
    const config = await this.configService.saveCalendarSettings(settings);
    this.settings = config.calendar;

    if (!this.settings.enabled) {
      this.destroyWindow();
      return this.readSnapshot();
    }

    if (!this.window || this.window.isDestroyed()) {
      await this.openWindow();
      return this.readSnapshot();
    }

    this.applyWindowSettings();
    return this.readSnapshot();
  }

  private applyWindowSettings() {
    const window = this.window;
    if (!window || window.isDestroyed()) {
      return;
    }

    window.setBounds(this.resolveBounds());
    window.webContents.send(IPC_CHANNELS.desktopCalendarSettingsChanged, this.settings);
  }

  /** 未定位时放到主屏右侧垂直居中；已定位时限制在当前工作区内。 */
  private resolveBounds() {
    const { width, height } = this.settings;
    const workArea = screen.getPrimaryDisplay().workArea;

    if (this.settings.x === CALENDAR_UNPOSITIONED || this.settings.y === CALENDAR_UNPOSITIONED) {
      return {
        width,
        height,
        x: workArea.x + Math.max(0, workArea.width - width - 40),
        y: workArea.y + Math.max(0, Math.round((workArea.height - height) / 2)),
      };
    }

    return {
      width,
      height,
      x: Math.min(Math.max(this.settings.x, workArea.x), workArea.x + Math.max(0, workArea.width - width)),
      y: Math.min(Math.max(this.settings.y, workArea.y), workArea.y + Math.max(0, workArea.height - height)),
    };
  }

  private async openWindow(): Promise<DesktopCalendarSnapshot> {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      return this.readSnapshot();
    }

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
    });

    this.window = window;
    await this.loadRenderer(window);
    await this.sendToBottom(window);
    return this.readSnapshot();
  }

  private async loadRenderer(window: BrowserWindow) {
    if (process.env.NODE_ENV === 'development') {
      const devServerUrl = process.env.DEV_SERVER_URL ?? 'http://127.0.0.1:8137';
      await window.loadURL(`${devServerUrl}/#/desktop-calendar`);
      return;
    }

    await window.loadFile(this.getRendererEntry(), { hash: '/desktop-calendar' });
  }

  /**
   * 通过 Win32 把窗口压到 Z 序底部，满足「放在底层、不遮挡其他窗口」的要求。
   * 置底失败时保持普通窗口，不影响日历展示。
   */
  private async sendToBottom(window: BrowserWindow) {
    try {
      const handle = window.getNativeWindowHandle();
      const hwnd = handle.length >= 8 ? handle.readBigUInt64LE(0) : BigInt(handle.readUInt32LE(0));
      const systemRoot = process.env.SystemRoot || process.env.windir;
      if (!systemRoot) {
        return;
      }

      // 目标电脑不保证安装 PowerShell 7，统一使用 Windows 自带的 5.1
      const powerShellPath = `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
      await execFileAsync(
        powerShellPath,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          this.getBottomScriptPath(),
          '-WindowHandle',
          hwnd.toString(),
        ],
        { timeout: BOTTOM_SCRIPT_TIMEOUT_MS, windowsHide: true },
      );
    } catch {
      // 置底失败不影响日历展示
    }
  }

  private getBottomScriptPath() {
    return app.isPackaged
      ? path.join(process.resourcesPath, 'desktop-layer.ps1')
      : path.join(app.getAppPath(), 'electron', 'resources', 'desktop-layer.ps1');
  }

  private closeWindow(): Promise<DesktopCalendarSnapshot> | DesktopCalendarSnapshot {
    const window = this.window;
    if (!window || window.isDestroyed()) {
      return this.readSnapshot();
    }

    return new Promise<DesktopCalendarSnapshot>((resolve) => {
      window.once('closed', () => resolve(this.readSnapshot()));
      window.close();
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
    return {
      windowOpen: Boolean(this.window && !this.window.isDestroyed()),
      settings: this.settings,
      bounds: this.resolveBounds(),
    };
  }
}

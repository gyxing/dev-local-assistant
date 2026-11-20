import { app } from 'electron';
import {
  isMainWindowTheme,
  type AppSettingsPreferences,
  type AppSettingsSnapshot,
  type AppSettingsUpdate,
} from '../shared/app-settings-types';
import { DEFAULT_APP_RUNTIME_PREFERENCES } from '../shared/task-types';
import type { ConfigService } from './services/config-service';

/** 登录启动以托盘为入口，手动打开应用仍显示主窗口。 */
export const BACKGROUND_LAUNCH_ARG = '--background';

/** 管理工具箱的应用级运行偏好和 Windows 登录项。 */
export class AppSettingsController {
  private preferences: AppSettingsPreferences = {
    mainWindowTheme: DEFAULT_APP_RUNTIME_PREFERENCES.mainWindowTheme,
    launchAtLogin: DEFAULT_APP_RUNTIME_PREFERENCES.launchAtLogin,
    quitWhenMainWindowCloses: DEFAULT_APP_RUNTIME_PREFERENCES.quitWhenMainWindowCloses,
  };

  constructor(private readonly configService: ConfigService) {}

  /** 读取旧配置并同步安装版登录项，失败时仍可启动工具箱。 */
  async start(): Promise<void> {
    this.updatePreferences((await this.configService.getConfig()).runtime);
    if (this.loginItemSupported) {
      try {
        this.applyLoginItem(this.preferences.launchAtLogin);
      } catch (error) {
        console.warn('未能在启动时同步 Windows 登录项', error);
      }
    }
  }

  get quitWhenMainWindowCloses(): boolean {
    return this.preferences.quitWhenMainWindowCloses;
  }

  /** 区分已保存的偏好与系统实际的登录项状态。 */
  getSnapshot(): AppSettingsSnapshot {
    let loginItemEnabled: boolean | undefined;
    if (this.loginItemSupported) {
      try {
        const status = app.getLoginItemSettings({ args: [BACKGROUND_LAUNCH_ARG] });
        loginItemEnabled = status.openAtLogin && status.executableWillLaunchAtLogin;
      } catch (error) {
        console.warn('读取 Windows 登录项状态失败', error);
      }
    }
    return {
      ...this.preferences,
      packaged: app.isPackaged,
      loginItemSupported: this.loginItemSupported,
      loginItemEnabled,
    };
  }

  /** 保存明确提交的字段；写入失败时尝试恢复已变更的系统登录项。 */
  async save(input: unknown): Promise<AppSettingsSnapshot> {
    const patch = validateUpdate(input);
    let previousLoginItem: ReturnType<typeof app.getLoginItemSettings> | undefined;

    try {
      if (this.loginItemSupported && patch.launchAtLogin !== undefined) {
        previousLoginItem = app.getLoginItemSettings({ args: [BACKGROUND_LAUNCH_ARG] });
        this.applyLoginItem(patch.launchAtLogin);
      }
      const saved = await this.configService.saveRuntime(patch);
      this.updatePreferences(saved.runtime);
      return this.getSnapshot();
    } catch (error) {
      console.error('保存系统设置失败', error);
      if (previousLoginItem) {
        try {
          this.restoreLoginItem(previousLoginItem);
        } catch (rollbackError) {
          console.error('恢复之前的 Windows 登录项失败', rollbackError);
        }
      }
      throw new Error('未能保存系统设置，请检查当前状态后重试。', { cause: error });
    }
  }

  private get loginItemSupported(): boolean {
    // 开发版启动项会指向 Electron 工具链，可记偏好但只由 Windows 安装版写入。
    return process.platform === 'win32' && app.isPackaged;
  }

  private updatePreferences({ mainWindowTheme, launchAtLogin, quitWhenMainWindowCloses }: AppSettingsPreferences) {
    this.preferences = { mainWindowTheme, launchAtLogin, quitWhenMainWindowCloses };
  }

  private applyLoginItem(enabled: boolean) {
    const args = [BACKGROUND_LAUNCH_ARG];
    app.setLoginItemSettings({ openAtLogin: enabled, args });
    const status = app.getLoginItemSettings({ args });
    if (status.openAtLogin !== enabled || (enabled && !status.executableWillLaunchAtLogin)) {
      throw new Error('Windows 登录项未按预期更新');
    }
  }

  private restoreLoginItem(previous: ReturnType<typeof app.getLoginItemSettings>) {
    const args = [BACKGROUND_LAUNCH_ARG];
    // 回滚实际登记和启用状态，避免重新启用用户在 Windows 设置里停用的启动项。
    app.setLoginItemSettings({
      openAtLogin: previous.openAtLogin,
      enabled: previous.executableWillLaunchAtLogin,
      args,
    });
    const current = app.getLoginItemSettings({ args });
    if (current.openAtLogin !== previous.openAtLogin
      || (previous.openAtLogin && current.executableWillLaunchAtLogin !== previous.executableWillLaunchAtLogin)) {
      throw new Error('Windows 登录项未恢复到原有状态');
    }
  }
}

/** 应用设置只更新白名单字段，便签窗口状态由其控制器维护。 */
function validateUpdate(input: unknown): AppSettingsUpdate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('系统设置更新内容无效');
  }

  const patch: AppSettingsUpdate = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'mainWindowTheme' && isMainWindowTheme(value)) {
      patch.mainWindowTheme = value;
      continue;
    }
    if ((key === 'launchAtLogin' || key === 'quitWhenMainWindowCloses') && typeof value === 'boolean') {
      patch[key] = value;
      continue;
    }
    throw new TypeError('系统设置更新字段无效');
  }
  if (Object.keys(patch).length === 0) {
    throw new TypeError('请选择要更新的系统设置');
  }
  return patch;
}

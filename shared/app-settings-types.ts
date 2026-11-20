export type MainWindowTheme = 'system' | 'light' | 'dark';

/** 校验配置文件与设置请求中的主窗口主题。 */
export function isMainWindowTheme(value: unknown): value is MainWindowTheme {
  return value === 'system' || value === 'light' || value === 'dark';
}

/** 工具箱的外观与运行偏好。 */
export interface AppSettingsPreferences {
  mainWindowTheme: MainWindowTheme;
  launchAtLogin: boolean;
  quitWhenMainWindowCloses: boolean;
}

export type AppSettingsUpdate = Partial<AppSettingsPreferences>;

export interface AppSettingsSnapshot extends AppSettingsPreferences {
  packaged: boolean;
  loginItemSupported: boolean;
  /** 安装版的实际状态。未能读回或平台不支持时省略。 */
  loginItemEnabled?: boolean;
}

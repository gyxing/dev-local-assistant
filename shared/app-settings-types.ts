/** 控制整个工具箱的启动与退出方式。 */
export interface AppSettingsPreferences {
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

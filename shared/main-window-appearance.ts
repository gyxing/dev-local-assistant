import type { MainWindowTheme } from './app-settings-types';

export type MainWindowColorScheme = Exclude<MainWindowTheme, 'system'>;

export const MAIN_WINDOW_TITLE_BAR_HEIGHT = 36;

// 原生窗口按钮和前端标题栏共用颜色，避免切换主题时出现色块。
export const MAIN_WINDOW_COLORS = {
  light: { canvas: '#f5f5f5', titleBar: '#ffffff', symbol: '#1f2329' },
  dark: { canvas: '#15171a', titleBar: '#191c20', symbol: '#e8eaed' },
} as const;

/** 手动主题优先，跟随系统时读取 Windows 的应用配色。 */
export function resolveMainWindowScheme(
  preference: MainWindowTheme,
  systemDark: boolean,
): MainWindowColorScheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

export interface MainWindowMenuGroup {
  label: string;
  items: Array<
    | { id: number; type: 'separator' }
    | {
        id: number;
        type: 'command';
        label: string;
        accelerator: string | null;
        enabled: boolean;
      }
  >;
}

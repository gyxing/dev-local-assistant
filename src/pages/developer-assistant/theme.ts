import { theme } from 'antd';
import type { ThemeConfig } from 'antd';

export type WorkspaceColorScheme = 'light' | 'dark';

/** 使用 Ant Design 的浅色、深色和紧凑算法，布局色从同一套 Token 取值。 */
export function getWorkspaceTheme(scheme: WorkspaceColorScheme, reduceMotion: boolean) {
  const dark = scheme === 'dark';
  const config = {
    algorithm: [dark ? theme.darkAlgorithm : theme.defaultAlgorithm, theme.compactAlgorithm],
    token: { motion: !reduceMotion },
    components: {
      Menu: { fontSize: 14, iconSize: 16, collapsedIconSize: 18, groupTitleFontSize: 12 },
      Switch: { colorTextQuaternary: dark ? '#5F6F84' : '#68778B' },
    },
  } satisfies ThemeConfig;
  const token = theme.getDesignToken(config);

  return {
    config,
    colors: {
      canvas: token.colorBgLayout,
      surface: token.colorBgContainer,
      inset: token.colorFillAlter,
      'radius-control': `${token.borderRadius}px`,
      'position-fill': token.colorFillTertiary,
      'preset-fill': token.colorPrimaryBg,
      'preset-border': token.colorPrimaryBorder,
      border: token.colorBorder,
      divider: token.colorBorderSecondary,
      text: token.colorText,
      muted: token.colorTextSecondary,
      accent: token.colorPrimaryText,
      success: token.colorSuccess,
      warning: token.colorWarning,
    },
  };
}

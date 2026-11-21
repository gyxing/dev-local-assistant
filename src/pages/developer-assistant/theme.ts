import { theme } from 'antd';
import type { ThemeConfig } from 'antd';
import { MAIN_WINDOW_COLORS, type MainWindowColorScheme } from '../../../shared/main-window-appearance';

/** 使用 Ant Design 的浅色、深色和紧凑算法，布局色从同一套 Token 取值。 */
export function getWorkspaceTheme(scheme: MainWindowColorScheme, reduceMotion: boolean) {
  const dark = scheme === 'dark';
  const { canvas, titleBar } = MAIN_WINDOW_COLORS[scheme];
  const config = {
    algorithm: [dark ? theme.darkAlgorithm : theme.defaultAlgorithm, theme.compactAlgorithm],
    token: {
      motion: !reduceMotion,
      // 紧凑算法把 20px 种子字号派生为 16px 正文和 14px 小字。
      fontSize: 20,
      // 紧凑算法从 36px 减去 4px，常用控件实际高度为 32px。
      controlHeight: 36,
      controlHeightSM: 28,
      ...(dark && {
        colorBgLayout: canvas,
        colorBgContainer: '#202328',
        colorBgElevated: '#25292f',
        colorBorder: '#41464e',
        colorBorderSecondary: '#343941',
        colorTextSecondary: '#b4bbc4',
        colorTextTertiary: '#969faa',
      }),
    },
    components: {
      Layout: dark ? { lightSiderBg: titleBar, lightTriggerBg: titleBar } : undefined,
      Card: { bodyPaddingSM: 14, headerHeightSM: 36 },
      Table: { cellPaddingBlockSM: 7 },
      Menu: {
        iconSize: 16,
        collapsedIconSize: 18,
        groupTitleFontSize: 14,
        itemHeight: 38,
        ...(dark && {
          itemBg: titleBar,
          itemColor: '#e2e7ed',
          groupTitleColor: '#a4aebc',
          itemSelectedBg: '#213a60',
          itemSelectedColor: '#a9ccff',
        }),
      },
      Switch: { colorTextQuaternary: dark ? '#5F6F84' : '#68778B' },
    },
  } satisfies ThemeConfig;
  const token = theme.getDesignToken(config);

  return {
    config,
    colors: {
      canvas: token.colorBgLayout,
      titlebar: titleBar,
      surface: token.colorBgContainer,
      inset: token.colorFillAlter,
      'font-body': `${token.fontSize}px`,
      'font-caption': `${token.fontSizeSM}px`,
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

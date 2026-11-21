import { App, ConfigProvider } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { useLayoutEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { MainWindowTheme } from '@shared/app-settings-types';
import { resolveMainWindowScheme } from '../../../shared/main-window-appearance';
import { getWorkspaceTheme } from './theme';
import useSystemMedia from './useSystemMedia';
import './theme.less';

interface WorkspaceAppearanceProps {
  preference: MainWindowTheme;
  children: ReactNode;
}

/** 为主窗口及挂载到页面外的 Ant Design 弹层提供同一套主题。 */
export default function WorkspaceAppearance({ preference, children }: WorkspaceAppearanceProps) {
  const systemDark = useSystemMedia('(prefers-color-scheme: dark)');
  const reduceMotion = useSystemMedia('(prefers-reduced-motion: reduce)');
  const scheme = resolveMainWindowScheme(preference, systemDark);
  const { config, colors } = useMemo(() => getWorkspaceTheme(scheme, reduceMotion), [scheme, reduceMotion]);

  useLayoutEffect(() => {
    // 弹层可能挂载在 body 下，布局变量设在当前窗口根节点。
    const root = document.documentElement;
    root.dataset.toolboxTheme = scheme;
    const properties = Object.entries(colors);
    for (const [name, value] of properties) {
      root.style.setProperty(`--toolbox-${name}`, value);
    }
    return () => {
      delete root.dataset.toolboxTheme;
      for (const [name] of properties) root.style.removeProperty(`--toolbox-${name}`);
    };
  }, [colors, scheme]);

  return (
    <ConfigProvider
      theme={config}
      spin={reduceMotion ? { indicator: <LoadingOutlined style={{ fontSize: 24, animation: 'none' }} /> } : undefined}
    >
      <App component={false}>{children}</App>
    </ConfigProvider>
  );
}

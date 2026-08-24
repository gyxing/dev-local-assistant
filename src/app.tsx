import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { createElement } from 'react';

export function rootContainer(container: any) {
  return createElement(
    ConfigProvider,
    { locale: zhCN },
    createElement(App, { component: false }, container),
  );
}

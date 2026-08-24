import { defineConfig } from '@umijs/max';

export default defineConfig({
  npmClient: 'pnpm',
  // Electron 生产环境通过 file:// 加载页面，需要相对资源路径和 Hash 路由。
  publicPath: process.env.NODE_ENV === 'production' ? './' : '/',
  history: { type: 'hash' },
  routes: [{ path: '/', component: '@/pages/developer-assistant' }],
  antd: {},
});

import { useState } from 'react';
import { App, Typography } from 'antd';
import {
  ApiOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  PushpinOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import CleanerPage from '../node-modules-cleaner';
import DesktopNotesManager from './components/DesktopNotesManager';
import PackageCacheCleaner from './components/PackageCacheCleaner';
import HostsManager from './components/HostsManager';
import PortManager from './components/PortManager';
import './index.less';

const { Title, Text } = Typography;

type AssistantModule = 'node-modules' | 'package-cache' | 'port-manager' | 'hosts-manager' | 'desktop-notes';

// 固定侧栏模块顺序，避免新增工具后导航位置随渲染条件变化。
const MODULE_NAV_ITEMS: Array<{
  key: AssistantModule;
  label: string;
  icon: ReactNode;
}> = [
  { key: 'node-modules', label: '依赖清理', icon: <FolderOpenOutlined /> },
  { key: 'package-cache', label: '缓存清理', icon: <DatabaseOutlined /> },
  { key: 'port-manager', label: '端口管理', icon: <ApiOutlined /> },
  { key: 'hosts-manager', label: 'Hosts / DNS', icon: <GlobalOutlined /> },
  { key: 'desktop-notes', label: '桌面便利贴', icon: <PushpinOutlined /> },
];

/**
 * 开发者本地助手首页，负责在多个本地辅助工具之间切换。
 */
export default function DeveloperAssistantPage() {
  const { modal } = App.useApp();
  const [activeModule, setActiveModule] = useState<AssistantModule>('node-modules');
  const [hostsDirty, setHostsDirty] = useState(false);

  function handleModuleChange(nextModule: AssistantModule) {
    if (nextModule === activeModule) {
      return;
    }

    if (activeModule === 'hosts-manager' && hostsDirty) {
      modal.confirm({
        title: '离开 Hosts 管理？',
        content: '当前有未保存的 Hosts 修改，离开后这些修改会丢失。',
        okText: '放弃修改并离开',
        cancelText: '继续编辑',
        okButtonProps: { danger: true },
        onOk: () => {
          setHostsDirty(false);
          setActiveModule(nextModule);
        },
      });
      return;
    }

    setActiveModule(nextModule);
  }

  return (
    <main className="developer-assistant">
      <aside className="developer-assistant__sidebar">
        <div className="developer-assistant__brand">
          <Title level={4} className="developer-assistant__title">
            开发者助手
          </Title>
          <Text type="secondary" className="developer-assistant__subtitle">
            本地工具箱
          </Text>
        </div>

        <nav className="developer-assistant__menu" aria-label="开发者本地助手模块">
          {MODULE_NAV_ITEMS.map((item) => {
            const active = activeModule === item.key;

            return (
              <button
                key={item.key}
                type="button"
                className={`developer-assistant__menu-item${
                  active ? ' developer-assistant__menu-item--active' : ''
                }`}
                aria-current={active ? 'page' : undefined}
                onClick={() => handleModuleChange(item.key)}
              >
                <span className="developer-assistant__menu-icon">{item.icon}</span>
                <span className="developer-assistant__menu-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="developer-assistant__sidebar-footer">
          <span
            className={`developer-assistant__status-dot${
              window.developerAssistant ? ' developer-assistant__status-dot--connected' : ''
            }`}
          />
          <Text type="secondary" className="developer-assistant__status">
            {window.developerAssistant ? '服务可用' : '服务不可用'}
          </Text>
        </div>
      </aside>

      <section className="developer-assistant__content">
        {activeModule === 'node-modules' ? <CleanerPage /> : null}
        {activeModule === 'package-cache' ? <PackageCacheCleaner /> : null}
        {activeModule === 'port-manager' ? <PortManager /> : null}
        {activeModule === 'hosts-manager' ? <HostsManager onDirtyChange={setHostsDirty} /> : null}
        {activeModule === 'desktop-notes' ? <DesktopNotesManager /> : null}
      </section>
    </main>
  );
}

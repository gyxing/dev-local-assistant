import { useRef, useState } from 'react';
import { App, Badge, Layout, Menu } from 'antd';
import type { MenuProps } from 'antd';
import {
  ApiOutlined,
  CalendarOutlined,
  DatabaseOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  PushpinOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import CleanerPage from '../node-modules-cleaner';
import DesktopCalendarManager from './components/DesktopCalendarManager';
import DesktopNotesManager from './components/DesktopNotesManager';
import PackageCacheCleaner from './components/PackageCacheCleaner';
import HostsManager from './components/HostsManager';
import PortManager from './components/PortManager';
import SystemSettings from './components/SystemSettings';
import WorkspaceAppearance from './WorkspaceAppearance';
import useAppSettings from './useAppSettings';
import useSystemMedia from './useSystemMedia';
import './index.less';

type AssistantModule =
  | 'node-modules'
  | 'package-cache'
  | 'port-manager'
  | 'hosts-manager'
  | 'desktop-notes'
  | 'desktop-calendar'
  | 'system-settings';

// 工具菜单按任务分组，系统设置独立占据侧栏底部。
const moduleMenu: MenuProps['items'] = [
  {
    type: 'group',
    label: '清理',
    children: [
      { key: 'node-modules', label: '依赖清理', icon: <FolderOpenOutlined /> },
      { key: 'package-cache', label: '缓存清理', icon: <DatabaseOutlined /> },
    ],
  },
  {
    type: 'group',
    label: '网络',
    children: [
      { key: 'port-manager', label: '端口管理', icon: <ApiOutlined /> },
      { key: 'hosts-manager', label: 'Hosts / DNS', icon: <GlobalOutlined /> },
    ],
  },
  {
    type: 'group',
    label: '桌面',
    children: [
      { key: 'desktop-notes', label: '桌面便利贴', icon: <PushpinOutlined /> },
      { key: 'desktop-calendar', label: '桌面日历', icon: <CalendarOutlined /> },
    ],
  },
];

const settingsMenu: MenuProps['items'] = [
  { key: 'system-settings', label: '系统设置', title: '系统设置', icon: <SettingOutlined /> },
];

/** 主窗口入口负责加载已保存的外观偏好。 */
export default function DeveloperAssistantPage() {
  const appSettings = useAppSettings();
  return (
    <WorkspaceAppearance preference={appSettings.settings?.mainWindowTheme ?? 'system'}>
      <DeveloperAssistantWorkspace appSettings={appSettings} />
    </WorkspaceAppearance>
  );
}

/** 显示工具导航及当前模块，切换时处理 Hosts 未保存提醒。 */
function DeveloperAssistantWorkspace({ appSettings }: { appSettings: ReturnType<typeof useAppSettings> }) {
  const { modal, message } = App.useApp();
  const [activeModule, setActiveModule] = useState<AssistantModule>('node-modules');
  const [hostsDirty, setHostsDirty] = useState(false);
  const content = useRef<HTMLElement>(null);
  const collapsed = useSystemMedia('(max-width: 730px)');
  const connected = Boolean(window.developerAssistant);
  const settingsActive = activeModule === 'system-settings';

  function openModule(nextModule: AssistantModule) {
    message.destroy();
    content.current?.scrollTo(0, 0);
    setActiveModule(nextModule);
  }

  const handleModuleChange: MenuProps['onClick'] = ({ key }) => {
    const nextModule = key as AssistantModule;
    if (nextModule === activeModule) return;

    if (activeModule === 'hosts-manager' && hostsDirty) {
      modal.confirm({
        autoFocusButton: 'cancel',
        title: '离开 Hosts 管理？',
        content: '当前有未保存的 Hosts 修改，离开后这些修改会丢失。',
        okText: '放弃修改并离开',
        cancelText: '继续编辑',
        okButtonProps: { danger: true },
        onOk: () => {
          setHostsDirty(false);
          openModule(nextModule);
        },
      });
      return;
    }

    openModule(nextModule);
  };

  return (
    <Layout className="developer-assistant">
      <Layout.Sider className="developer-assistant__sider" theme="light" width={190} collapsed={collapsed} collapsedWidth={54}>
        <div className="developer-assistant__sidebar">
          <Menu
            className="developer-assistant__menu"
            mode="inline"
            inlineIndent={12}
            items={moduleMenu}
            selectedKeys={settingsActive ? [] : [activeModule]}
            onClick={handleModuleChange}
            aria-label="开发者工具箱模块"
          />

          <div className="developer-assistant__sidebar-footer">
            <Menu
              mode="inline"
              inlineIndent={12}
              items={settingsMenu}
              selectedKeys={settingsActive ? ['system-settings'] : []}
              onClick={handleModuleChange}
              aria-label="系统设置入口"
            />
            {!collapsed && (
              <div className="developer-assistant__status" role="status">
                <Badge status={connected ? 'success' : 'warning'} text={connected ? '本地服务已连接' : '本地服务未连接'} />
              </div>
            )}
          </div>
        </div>
      </Layout.Sider>

      <Layout.Content className="developer-assistant__content" ref={content}>
        {activeModule === 'node-modules' ? <CleanerPage /> : null}
        {activeModule === 'package-cache' ? <PackageCacheCleaner /> : null}
        {activeModule === 'port-manager' ? <PortManager /> : null}
        {activeModule === 'hosts-manager' ? <HostsManager onDirtyChange={setHostsDirty} /> : null}
        {activeModule === 'desktop-notes' ? <DesktopNotesManager /> : null}
        {activeModule === 'desktop-calendar' ? <DesktopCalendarManager /> : null}
        {activeModule === 'system-settings' ? <SystemSettings appSettings={appSettings} /> : null}
      </Layout.Content>
    </Layout>
  );
}

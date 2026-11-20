import { App, Button, Card, Segmented, Typography } from 'antd';
import StatusSwitch from '@/components/StatusSwitch';
import type { AppSettingsPreferences, MainWindowTheme } from '@shared/app-settings-types';
import type useAppSettings from '../../useAppSettings';
import WorkspacePageHeader from '../WorkspacePageHeader';
import './index.less';

const { Text } = Typography;

interface SystemSettingsProps {
  appSettings: ReturnType<typeof useAppSettings>;
}

/** 管理主窗口外观、开机启动和关闭行为。 */
export default function SystemSettings({ appSettings }: SystemSettingsProps) {
  const { message } = App.useApp();
  const { settings, saving, available, loadFailed, reload, save } = appSettings;

  async function update<K extends keyof AppSettingsPreferences>(key: K, value: AppSettingsPreferences[K]) {
    try {
      await save(key, value);
    } catch {
      void message.error('未能保存系统设置，请检查当前状态后重试。');
    }
  }

  const disabled = !settings || Boolean(saving);
  const loginItemDiffers = settings?.loginItemSupported
    && settings.loginItemEnabled !== settings.launchAtLogin;

  return (
    <section className="system-settings">
      <WorkspacePageHeader title="系统设置" description="管理主窗口外观、开机启动和关闭行为。" />
      {!available || loadFailed ? (
        <Card size="small">
          <div className="toolbox-setting-row">
            <Text type="secondary">
              {available ? '暂时无法读取系统设置。' : '请在 Electron 应用窗口中使用系统设置。'}
            </Text>
            {available ? <Button onClick={() => void reload()}>重试</Button> : null}
          </div>
        </Card>
      ) : (
        <>
          <Card size="small" title="外观" loading={!settings}>
            <div className="toolbox-setting-row">
              <div className="system-settings__description">
                <Text strong>主窗口主题</Text>
                <Text type="secondary" className="system-settings__hint">
                  影响主窗口及其弹窗。跟随 Windows 时，系统主题变化会自动应用。
                </Text>
              </div>
              <Segmented<MainWindowTheme>
                aria-label="主窗口主题"
                className="system-settings__control"
                value={settings?.mainWindowTheme ?? 'system'}
                options={[
                  { label: '跟随 Windows', value: 'system' },
                  { label: '浅色', value: 'light' },
                  { label: '深色', value: 'dark' },
                ]}
                disabled={disabled}
                onChange={(mode) => void update('mainWindowTheme', mode)}
              />
            </div>
          </Card>

          <Card size="small" title="启动与退出" loading={!settings}>
            <div className="system-settings__group">
              <div className="toolbox-setting-row">
                <div className="system-settings__description">
                  <Text strong>开机自启动</Text>
                  <Text type="secondary" className="system-settings__hint">
                    登录 Windows 后在后台启动，可从托盘打开主窗口。
                  </Text>
                  {settings && !settings.loginItemSupported ? (
                    <Text type="secondary" className="system-settings__hint">
                      {settings.packaged
                        ? '当前平台不支持 Windows 登录项。'
                        : '开发版只保存偏好，Windows 安装版才会写入登录项。'}
                    </Text>
                  ) : null}
                  {loginItemDiffers ? (
                    <Text type="warning" className="system-settings__hint">
                      {settings?.loginItemEnabled === undefined
                        ? '暂无法确认 Windows 登录项的实际状态。'
                        : 'Windows 登录项与已保存的偏好不一致，请检查系统启动设置。'}
                    </Text>
                  ) : null}
                </div>
                <StatusSwitch
                  aria-label="开机自启动"
                  className="system-settings__control"
                  checked={settings?.launchAtLogin ?? false}
                  disabled={disabled || Boolean(settings?.packaged && !settings.loginItemSupported)}
                  loading={saving === 'launchAtLogin'}
                  onChange={(checked) => void update('launchAtLogin', checked)}
                />
              </div>

              <div className="toolbox-setting-row">
                <div className="system-settings__description">
                  <Text strong>关闭主窗口时</Text>
                  <Text type="secondary" className="system-settings__hint">
                    收起后可从托盘重新打开。退出时会先保存便利贴中未提交的内容。
                  </Text>
                </div>
                <Segmented
                  aria-label="关闭主窗口时"
                  className="system-settings__control"
                  value={settings?.quitWhenMainWindowCloses ? 'quit' : 'tray'}
                  options={[
                    { label: '收起到托盘', value: 'tray' },
                    { label: '退出本地助手', value: 'quit' },
                  ]}
                  disabled={disabled}
                  onChange={(mode) => void update('quitWhenMainWindowCloses', mode === 'quit')}
                />
              </div>
            </div>
          </Card>
        </>
      )}
    </section>
  );
}

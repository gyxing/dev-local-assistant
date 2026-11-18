import { App, Card, Segmented, Switch, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { AppSettingsSnapshot, AppSettingsUpdate } from '../../../../../shared/app-settings-types';
import './index.less';

const { Text, Title } = Typography;

/** 工具箱的启动与退出设置，与各桌面工具的配置分开显示。 */
export default function SystemSettings() {
  const { message } = App.useApp();
  const [settings, setSettings] = useState<AppSettingsSnapshot>();
  const [saving, setSaving] = useState<keyof AppSettingsUpdate>();
  const [loadFailed, setLoadFailed] = useState(false);
  const api = window.appSettings;

  useEffect(() => {
    if (!api) return;

    let active = true;
    void api.getSnapshot()
      .then((snapshot) => {
        if (active) setSettings(snapshot);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => { active = false; };
  }, [api]);

  async function save(key: keyof AppSettingsUpdate, checked: boolean) {
    if (!api || !settings || saving) return;

    setSaving(key);
    try {
      setSettings(await api.save({ [key]: checked }));
    } catch (error) {
      void message.error(error instanceof Error ? error.message : '保存系统设置失败，请重试。');
      // Windows 登录项可能与保存的偏好不同，失败后重新读取以展示实际结果。
      try {
        setSettings(await api.getSnapshot());
      } catch {
        setLoadFailed(true);
      }
    } finally {
      setSaving(undefined);
    }
  }

  const disabled = !api || !settings || Boolean(saving) || loadFailed;
  const loginItemDiffers = settings?.loginItemSupported
    && settings.loginItemEnabled !== settings.launchAtLogin;

  return (
    <section className="system-settings">
      <header className="system-settings__header">
        <Title level={5} className="system-settings__title">系统设置</Title>
        <Text type="secondary" className="system-settings__hint">管理工具箱的启动和主窗口关闭行为。</Text>
      </header>

      <Card size="small" title="启动与退出" loading={Boolean(api && !settings && !loadFailed)}>
        {!api || loadFailed ? (
          <Text type="secondary">暂时无法读取系统设置，请重新进入此页面。</Text>
        ) : (
          <div className="system-settings__group">
            <div className="system-settings__row">
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
              <Switch
                aria-label="开机自启动"
                className="system-settings__control"
                checked={settings?.launchAtLogin ?? false}
                disabled={disabled || Boolean(settings?.packaged && !settings.loginItemSupported)}
                loading={saving === 'launchAtLogin'}
                onChange={(checked) => void save('launchAtLogin', checked)}
              />
            </div>

            <div className="system-settings__row">
              <div className="system-settings__description">
                <Text strong>关闭主窗口时</Text>
                <Text type="secondary" className="system-settings__hint">
                  收起后可从托盘重新打开。退出时会先保存便利贴中未提交的内容。
                </Text>
              </div>
              <Segmented
                aria-label="关闭主窗口时"
                className="system-settings__control"
                size="small"
                value={settings?.quitWhenMainWindowCloses ? 'quit' : 'tray'}
                options={[
                  { label: '收起到托盘', value: 'tray' },
                  { label: '退出工具箱', value: 'quit' },
                ]}
                disabled={disabled}
                onChange={(mode) => void save('quitWhenMainWindowCloses', mode === 'quit')}
              />
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}

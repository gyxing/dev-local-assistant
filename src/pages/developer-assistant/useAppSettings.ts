import { useEffect, useRef, useState } from 'react';
import type { AppSettingsPreferences, AppSettingsSnapshot } from '@shared/app-settings-types';

/** 共享当前已保存的系统设置，使主题在离开设置页后继续生效。 */
export default function useAppSettings() {
  const api = window.appSettings;
  const [settings, setSettings] = useState<AppSettingsSnapshot>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState<keyof AppSettingsPreferences>();
  const writing = useRef(false);

  useEffect(() => {
    if (!api) return;
    let active = true;
    void api.getSnapshot().then(
      (snapshot) => { if (active) setSettings(snapshot); },
      () => { if (active) setLoadFailed(true); },
    );
    return () => { active = false; };
  }, [api]);

  async function reload() {
    if (!api) return;
    setLoadFailed(false);
    try {
      setSettings(await api.getSnapshot());
    } catch {
      setLoadFailed(true);
    }
  }

  async function save<K extends keyof AppSettingsPreferences>(key: K, value: AppSettingsPreferences[K]) {
    if (!api || !settings || writing.current || settings[key] === value) return;

    writing.current = true;
    setSaving(key);
    try {
      setSettings(await api.save({ [key]: value }));
    } catch (error) {
      // 登录项可能被 Windows 改动，保存失败时重新读取实际状态。
      await reload();
      throw error;
    } finally {
      writing.current = false;
      setSaving(undefined);
    }
  }

  return { settings, loadFailed, saving, available: Boolean(api), reload, save };
}

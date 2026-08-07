import { useEffect, useState } from 'react';
import { message } from 'antd';
import type { DirectoryHistoryItem, IgnoredProject, ProtectedProject } from '@shared/task-types';
import type { ClearNodeModulesApi } from '../../../types/electron-api';
import { createNextDirectoryHistory, getErrorMessage } from '../utils';

/**
 * 负责加载和持久化清理器配置，隔离 Electron 配置 IPC 与页面展示逻辑。
 */
export default function useCleanerConfig(getElectronApi: () => ClearNodeModulesApi | undefined) {
  const [protectedProjects, setProtectedProjects] = useState<ProtectedProject[]>([]);
  const [directoryHistory, setDirectoryHistory] = useState<DirectoryHistoryItem[]>([]);
  const [ignoredProjects, setIgnoredProjects] = useState<IgnoredProject[]>([]);

  useEffect(() => {
    const api = window.clearNodeModules;
    if (!api) {
      return;
    }

    void api
      .getAppConfig()
      .then((config) => {
        setProtectedProjects(config.protectedProjects);
        setDirectoryHistory(config.directoryHistory);
        setIgnoredProjects(config.ignoredProjects);
      })
      .catch((error: unknown) => {
        message.error(getErrorMessage(error, '读取保护项目配置失败'));
      });
  }, []);

  async function saveDirectoryHistory(targetPath: string, incrementScanCount: boolean) {
    const api = getElectronApi();
    if (!api) {
      return;
    }

    try {
      const nextHistory = createNextDirectoryHistory(directoryHistory, targetPath, incrementScanCount);
      const config = await api.saveDirectoryHistory(nextHistory);
      setDirectoryHistory(config.directoryHistory);
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '保存历史目录失败'));
    }
  }

  async function clearDirectoryHistory() {
    const api = getElectronApi();
    if (!api) {
      return;
    }

    try {
      const config = await api.saveDirectoryHistory([]);
      setDirectoryHistory(config.directoryHistory);
      message.success('历史目录已清空');
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '清空历史目录失败'));
    }
  }

  async function saveIgnoredProjects(nextProjects: IgnoredProject[]) {
    const api = getElectronApi();
    if (!api) {
      return;
    }

    try {
      const config = await api.saveIgnoredProjects(nextProjects);
      setIgnoredProjects(config.ignoredProjects);
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '保存忽略项目失败'));
      throw error;
    }
  }

  async function saveProtectedProjects(nextProjects: ProtectedProject[]) {
    const api = getElectronApi();
    if (!api) {
      return;
    }

    try {
      const config = await api.saveProtectedProjects(nextProjects);
      setProtectedProjects(config.protectedProjects);
      message.success('保护项目配置已保存');
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '保存保护项目失败'));
      throw error;
    }
  }

  return {
    clearDirectoryHistory,
    directoryHistory,
    ignoredProjects,
    protectedProjects,
    saveDirectoryHistory,
    saveIgnoredProjects,
    saveProtectedProjects,
  };
}

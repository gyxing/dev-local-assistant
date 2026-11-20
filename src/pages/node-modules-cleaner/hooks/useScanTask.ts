import { useState } from 'react';
import { App } from 'antd';
import type { Dispatch, SetStateAction } from 'react';
import type { NodeModulesItem, ScanTaskStatus } from '@shared/task-types';
import type { ClearNodeModulesApi } from '../../../types/electron-api';
import { getErrorMessage } from '../utils';

interface UseScanTaskOptions {
  getElectronApi: () => ClearNodeModulesApi | undefined;
  rootPath: string;
  saveDirectoryHistory: (targetPath: string, incrementScanCount: boolean) => Promise<void>;
  setItems: Dispatch<SetStateAction<NodeModulesItem[]>>;
  setSelectedRowKeys: Dispatch<SetStateAction<string[]>>;
}

/**
 * 管理扫描任务的启动、暂停、继续和重扫，让页面组件不直接维护扫描状态机细节。
 */
export default function useScanTask({
  getElectronApi,
  rootPath,
  saveDirectoryHistory,
  setItems,
  setSelectedRowKeys,
}: UseScanTaskOptions) {
  const { message } = App.useApp();
  const [scanTaskId, setScanTaskId] = useState<string>();
  const [scanStatus, setScanStatus] = useState<ScanTaskStatus>('idle');
  const [scanMessage, setScanMessage] = useState('');

  function resetScanResult() {
    setItems([]);
    setSelectedRowKeys([]);
    setScanMessage('');
    setScanStatus('scanning');
  }

  async function handleStartScan() {
    if (!rootPath) {
      return;
    }

    const api = getElectronApi();
    if (!api) {
      return;
    }

    try {
      resetScanResult();
      await saveDirectoryHistory(rootPath, true);
      const taskId = await api.startScan(rootPath);
      setScanTaskId(taskId);
    } catch (error: unknown) {
      setScanStatus('idle');
      message.error(getErrorMessage(error, '启动扫描失败'));
    }
  }

  async function handlePauseScan() {
    const api = getElectronApi();
    if (!api || !scanTaskId) {
      return;
    }

    try {
      await api.pauseScan(scanTaskId);
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '暂停扫描失败'));
    }
  }

  async function handleResumeScan() {
    const api = getElectronApi();
    if (!api || !scanTaskId) {
      return;
    }

    try {
      await api.resumeScan(scanTaskId);
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '继续扫描失败'));
    }
  }

  async function handleRestartScan() {
    if (!rootPath) {
      return;
    }

    const api = getElectronApi();
    if (!api) {
      return;
    }

    try {
      resetScanResult();

      if (scanTaskId) {
        const nextTaskId = await api.restartScan(scanTaskId);
        setScanTaskId(nextTaskId);
        return;
      }

      const taskId = await api.startScan(rootPath);
      setScanTaskId(taskId);
    } catch (error: unknown) {
      setScanStatus('idle');
      message.error(getErrorMessage(error, '重新扫描失败'));
    }
  }

  return {
    handlePauseScan,
    handleRestartScan,
    handleResumeScan,
    handleStartScan,
    scanMessage,
    scanStatus,
    setScanMessage,
    setScanStatus,
  };
}

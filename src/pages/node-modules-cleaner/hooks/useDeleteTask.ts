import { useState } from 'react';
import { message } from 'antd';
import type {
  DeleteMode,
  DeleteTaskProgress,
  DeleteTaskStatus,
  NodeModulesItem,
} from '@shared/task-types';
import type { ClearNodeModulesApi } from '../../../types/electron-api';
import { getErrorMessage } from '../utils';

/**
 * 管理删除任务状态和控制动作，确保暂停、继续、取消都复用同一套错误处理。
 */
export default function useDeleteTask(getElectronApi: () => ClearNodeModulesApi | undefined) {
  const [deleteTaskId, setDeleteTaskId] = useState<string>();
  const [deleteTaskStatus, setDeleteTaskStatus] = useState<DeleteTaskStatus>();
  const [deleteProgress, setDeleteProgress] = useState<DeleteTaskProgress>();
  const [currentDeleteItemId, setCurrentDeleteItemId] = useState<string>();

  async function startDeleteItems(targetItems: NodeModulesItem[], mode: DeleteMode) {
    const api = getElectronApi();
    if (!api || !targetItems.length) {
      return;
    }

    try {
      const taskId = await api.startDelete(
        targetItems.map((item) => item.id),
        mode,
      );
      setDeleteTaskId(taskId);
      message.success('删除任务已开始');
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '启动删除任务失败'));
    }
  }

  async function handlePauseDelete() {
    const api = getElectronApi();
    if (!deleteTaskId || !api) {
      return;
    }

    try {
      await api.pauseDelete(deleteTaskId);
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '暂停删除失败'));
    }
  }

  async function handleResumeDelete() {
    const api = getElectronApi();
    if (!deleteTaskId || !api) {
      return;
    }

    try {
      await api.resumeDelete(deleteTaskId);
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '继续删除失败'));
    }
  }

  async function handleFinishDelete() {
    const api = getElectronApi();
    if (!deleteTaskId || !api) {
      return;
    }

    try {
      await api.finishDelete(deleteTaskId);
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '取消删除失败'));
    }
  }

  return {
    currentDeleteItemId,
    deleteProgress,
    deleteTaskId,
    deleteTaskStatus,
    handleFinishDelete,
    handlePauseDelete,
    handleResumeDelete,
    setCurrentDeleteItemId,
    setDeleteProgress,
    setDeleteTaskId,
    setDeleteTaskStatus,
    startDeleteItems,
  };
}

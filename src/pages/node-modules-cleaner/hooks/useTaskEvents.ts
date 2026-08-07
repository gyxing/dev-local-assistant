import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  DeleteTaskProgress,
  DeleteTaskStatus,
  NodeModulesItem,
  ScanTaskStatus,
  TaskEvent,
} from '@shared/task-types';

interface UseTaskEventsOptions {
  setCurrentDeleteItemId: Dispatch<SetStateAction<string | undefined>>;
  setDeleteProgress: Dispatch<SetStateAction<DeleteTaskProgress | undefined>>;
  setDeleteTaskId: Dispatch<SetStateAction<string | undefined>>;
  setDeleteTaskStatus: Dispatch<SetStateAction<DeleteTaskStatus | undefined>>;
  setItems: Dispatch<SetStateAction<NodeModulesItem[]>>;
  setScanMessage: Dispatch<SetStateAction<string>>;
  setScanStatus: Dispatch<SetStateAction<ScanTaskStatus>>;
}

/**
 * 将 Electron 任务事件集中转换为 React 状态，避免页面散落多处分支处理。
 */
export default function useTaskEvents({
  setCurrentDeleteItemId,
  setDeleteProgress,
  setDeleteTaskId,
  setDeleteTaskStatus,
  setItems,
  setScanMessage,
  setScanStatus,
}: UseTaskEventsOptions) {
  const updateItem = useCallback(
    (itemId: string, patch: Partial<NodeModulesItem>) => {
      setItems((currentItems) =>
        currentItems.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
      );
    },
    [setItems],
  );

  return useCallback(
    (event: TaskEvent) => {
      if (event.type === 'scan:item-found') {
        setItems((currentItems) => [...currentItems, { ...event.item, status: 'sizing' }]);
        return;
      }

      if (event.type === 'scan:status') {
        setScanStatus(event.status);
        setScanMessage(event.message ?? '');
        return;
      }

      if (event.type === 'size:updated') {
        updateItem(event.itemId, {
          sizeBytes: event.sizeBytes,
          fileCount: event.fileCount,
          status: 'ready',
        });
        return;
      }

      if (event.type === 'size:failed') {
        updateItem(event.itemId, {
          status: 'ready',
          errorMessage: event.errorMessage,
        });
        return;
      }

      if (event.type === 'delete:status') {
        setDeleteTaskId(event.taskId);
        setDeleteTaskStatus(event.status);
        setCurrentDeleteItemId(event.currentItemId);
        setDeleteProgress(event.progress);
        return;
      }

      if (event.type === 'delete:item-updated') {
        updateItem(event.itemId, {
          status: event.status,
          errorMessage: event.errorMessage,
          failureDetail: event.failureDetail,
        });
      }
    },
    [
      setCurrentDeleteItemId,
      setDeleteProgress,
      setDeleteTaskId,
      setDeleteTaskStatus,
      setItems,
      setScanMessage,
      setScanStatus,
      updateItem,
    ],
  );
}

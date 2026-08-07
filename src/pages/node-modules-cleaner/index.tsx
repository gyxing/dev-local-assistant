import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Modal, Space, message } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { NodeModulesItem } from '@shared/task-types';
import CleanerHeader from './components/CleanerHeader';
import CleanerToolbar from './components/CleanerToolbar';
import DeleteConfirmModal from './components/DeleteConfirmModal';
import type { DeleteConfirmModalRef } from './components/DeleteConfirmModal';
import DeleteFailureDetail from './components/DeleteFailureDetail';
import DeleteTaskFooter from './components/DeleteTaskFooter';
import IgnoredProjectsModal from './components/IgnoredProjectsModal';
import type { IgnoredProjectsModalRef } from './components/IgnoredProjectsModal';
import ProtectedProjectsModal from './components/ProtectedProjectsModal';
import type { ProtectedProjectsModalRef } from './components/ProtectedProjectsModal';
import ResultsTable from './components/ResultsTable';
import SummaryBar from './components/SummaryBar';
import useCleanerConfig from './hooks/useCleanerConfig';
import useDeleteTask from './hooks/useDeleteTask';
import useIgnoredProjectsActions from './hooks/useIgnoredProjectsActions';
import useNodeModulesSelection from './hooks/useNodeModulesSelection';
import useScanTask from './hooks/useScanTask';
import useTaskEvents from './hooks/useTaskEvents';
import {
  formatBytes,
  getErrorMessage,
} from './utils';
import './index.less';

/**
 * Node Modules 清理页容器，负责串联 Electron IPC、页面状态和业务组件。
 */
export default function CleanerPage() {
  const [rootPath, setRootPath] = useState('');
  const [items, setItems] = useState<NodeModulesItem[]>([]);
  const protectedProjectsModalRef = useRef<ProtectedProjectsModalRef>(null);
  const ignoredProjectsModalRef = useRef<IgnoredProjectsModalRef>(null);
  const deleteConfirmModalRef = useRef<DeleteConfirmModalRef>(null);
  const {
    clearDirectoryHistory,
    directoryHistory,
    ignoredProjects,
    protectedProjects,
    saveDirectoryHistory,
    saveIgnoredProjects,
    saveProtectedProjects,
  } = useCleanerConfig(getElectronApi);
  const {
    selectedDeletableItems,
    selectedRowKeys,
    selectedSize,
    setSelectedRowKeys,
    sizedCount,
    visibleItems,
  } = useNodeModulesSelection(items, ignoredProjects, protectedProjects);
  const electronApiAvailable = Boolean(window.clearNodeModules);
  const deleteTask = useDeleteTask(getElectronApi);
  const scanTask = useScanTask({
    getElectronApi,
    rootPath,
    saveDirectoryHistory,
    setItems,
    setSelectedRowKeys,
  });
  const ignoredProjectsActions = useIgnoredProjectsActions({
    ignoredProjects,
    saveIgnoredProjects,
    setSelectedRowKeys,
  });
  const currentDeleteItem = items.find((item) => item.id === deleteTask.currentDeleteItemId);
  const hasNotice = !electronApiAvailable || Boolean(scanTask.scanMessage);
  const handleTaskEvent = useTaskEvents({
    setCurrentDeleteItemId: deleteTask.setCurrentDeleteItemId,
    setDeleteProgress: deleteTask.setDeleteProgress,
    setDeleteTaskId: deleteTask.setDeleteTaskId,
    setDeleteTaskStatus: deleteTask.setDeleteTaskStatus,
    setItems,
    setScanMessage: scanTask.setScanMessage,
    setScanStatus: scanTask.setScanStatus,
  });

  useEffect(() => {
    const api = window.clearNodeModules;
    if (!api) {
      return undefined;
    }

    // Electron 任务事件只需要订阅一次，退出页面时由 preload 返回的函数释放监听。
    return api.onTaskEvent((event) => {
      handleTaskEvent(event);
    });
  }, [handleTaskEvent]);

  function getElectronApi() {
    const api = window.clearNodeModules;
    if (!api) {
      message.error('当前页面未连接 Electron 能力，请在应用窗口中使用该功能');
      return undefined;
    }

    return api;
  }

  async function handleSelectDirectory() {
    const api = getElectronApi();
    if (!api) {
      return;
    }

    try {
      const selectedPath = await api.selectDirectory();
      if (selectedPath) {
        setRootPath(selectedPath);
        void saveDirectoryHistory(selectedPath, false);
      }
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '选择目录失败'));
    }
  }

  function handleSelectHistory(targetPath: string) {
    setRootPath(targetPath);
    void saveDirectoryHistory(targetPath, false);
  }

  function handleClearHistory() {
    Modal.confirm({
      title: '确认清空历史目录',
      content: '清空后不会影响已扫描结果，也不会删除任何文件。',
      okText: '清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => clearDirectoryHistory(),
    });
  }

  function confirmTrashDelete() {
    Modal.confirm({
      title: '确认移入回收站',
      content: `将把 ${selectedDeletableItems.length} 个 node_modules 移入系统回收站，预计释放 ${formatBytes(
        selectedSize,
      )}。`,
      okText: '移入回收站',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => deleteTask.startDeleteItems(selectedDeletableItems, 'trash'),
    });
  }

  function handleShowDeleteError(item: NodeModulesItem) {
    Modal.info({
      title: '删除失败原因',
      width: 720,
      content: <DeleteFailureDetail item={item} onPermanentDelete={handlePermanentDeleteSingleItem} />,
      okText: '知道了',
    });
  }

  function handlePermanentDeleteSingleItem(item: NodeModulesItem) {
    Modal.confirm({
      title: '确认永久删除该项',
      content: `将永久删除 ${item.nodeModulesPath}，该操作无法从系统回收站恢复。`,
      okText: '永久删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => deleteTask.startDeleteItems([item], 'permanent'),
    });
  }

  return (
    <main className="cleaner-page">
      <CleanerHeader
        electronApiAvailable={electronApiAvailable}
        onOpenIgnoredProjects={() => ignoredProjectsModalRef.current?.open()}
        onOpenProtectedProjects={() => protectedProjectsModalRef.current?.open()}
      />

      <CleanerToolbar
        rootPath={rootPath}
        scanStatus={scanTask.scanStatus}
        directoryHistory={directoryHistory}
        onSelectDirectory={handleSelectDirectory}
        onSelectHistory={handleSelectHistory}
        onClearHistory={handleClearHistory}
        onStartScan={scanTask.handleStartScan}
        onPauseScan={scanTask.handlePauseScan}
        onResumeScan={scanTask.handleResumeScan}
        onRestartScan={scanTask.handleRestartScan}
        disabled={!electronApiAvailable}
      />

      <section className="cleaner-page__notice-summary">
        {hasNotice ? (
          <div className="cleaner-page__notice-list">
            {!electronApiAvailable ? (
              <Alert
                className="cleaner-page__alert"
                type="warning"
                message="当前页面未连接 Electron 能力，请在 Electron 应用窗口中使用目录选择、扫描和删除功能。"
                showIcon
              />
            ) : null}

            {scanTask.scanMessage ? (
              <Alert className="cleaner-page__alert" type="warning" message={scanTask.scanMessage} showIcon />
            ) : null}
          </div>
        ) : null}

        <SummaryBar
          totalCount={visibleItems.length}
          selectedCount={selectedDeletableItems.length}
          selectedSize={selectedSize}
          sizedCount={sizedCount}
        />
      </section>

      <section className="cleaner-page__actions">
        <div className="cleaner-page__delete-task">
          <DeleteTaskFooter
            deleteTaskId={deleteTask.deleteTaskId}
            deleteTaskStatus={deleteTask.deleteTaskStatus}
            progress={deleteTask.deleteProgress}
            currentDeleteItem={currentDeleteItem}
            onPauseDelete={() => void deleteTask.handlePauseDelete()}
            onResumeDelete={() => void deleteTask.handleResumeDelete()}
            onFinishDelete={() => void deleteTask.handleFinishDelete()}
          />
        </div>

        <Space className="cleaner-page__delete-actions">
          <Button
            danger
            icon={<DeleteOutlined />}
            disabled={!electronApiAvailable || !selectedDeletableItems.length}
            onClick={confirmTrashDelete}
          >
            移入回收站
          </Button>
          <Button
            danger
            disabled={!electronApiAvailable || !selectedDeletableItems.length}
            onClick={() => deleteConfirmModalRef.current?.open()}
          >
            永久删除
          </Button>
        </Space>
      </section>

      <ResultsTable
        items={visibleItems}
        protectedProjects={protectedProjects}
        selectedRowKeys={selectedRowKeys}
        onSelectedRowKeysChange={setSelectedRowKeys}
        onIgnore={ignoredProjectsActions.handleIgnoreItem}
        onShowError={handleShowDeleteError}
      />

      <DeleteConfirmModal
        ref={deleteConfirmModalRef}
        selectedCount={selectedDeletableItems.length}
        selectedSize={selectedSize}
        onConfirm={() => {
          void deleteTask.startDeleteItems(selectedDeletableItems, 'permanent');
        }}
      />

      <ProtectedProjectsModal
        ref={protectedProjectsModalRef}
        projects={protectedProjects}
        onSelectDirectory={async () => {
          const api = getElectronApi();
          try {
            return await api?.selectDirectory();
          } catch (error: unknown) {
            message.error(getErrorMessage(error, '选择保护目录失败'));
            return undefined;
          }
        }}
        onSave={async (nextProjects) => {
          await saveProtectedProjects(nextProjects);
        }}
      />

      <IgnoredProjectsModal
        ref={ignoredProjectsModalRef}
        projects={ignoredProjects}
        onRestore={ignoredProjectsActions.handleRestoreIgnoredProject}
        onClear={ignoredProjectsActions.handleClearIgnoredProjects}
      />
    </main>
  );
}

import { Button, Progress, Space, Typography } from 'antd';
import type { DeleteTaskProgress, DeleteTaskStatus, NodeModulesItem } from '@shared/task-types';
import { deleteTaskTextMap } from '../../utils';
import './index.less';

const { Text } = Typography;

interface DeleteTaskFooterProps {
  deleteTaskId?: string;
  deleteTaskStatus?: DeleteTaskStatus;
  progress?: DeleteTaskProgress;
  currentDeleteItem?: NodeModulesItem;
  onPauseDelete: () => void;
  onResumeDelete: () => void;
  onFinishDelete: () => void;
}

/**
 * 展示删除任务进度，并按任务状态暴露暂停、继续和取消操作。
 */
export default function DeleteTaskFooter({
  deleteTaskId,
  deleteTaskStatus,
  progress,
  currentDeleteItem,
  onPauseDelete,
  onResumeDelete,
  onFinishDelete,
}: DeleteTaskFooterProps) {
  if (!deleteTaskId) {
    return null;
  }

  const processedCount = progress ? progress.completedCount + progress.failedCount : 0;
  const percent = progress?.totalCount ? Math.round((processedCount / progress.totalCount) * 100) : 0;
  const showPauseButton = deleteTaskStatus === 'deleting';
  const showResumeButton = deleteTaskStatus === 'delete-paused';
  const showCancelButton = deleteTaskStatus === 'deleting' || deleteTaskStatus === 'delete-pausing';

  return (
    <div className="delete-task-footer">
      <div className="delete-task-footer__info">
        <Text strong className="delete-task-footer__status">
          删除：{deleteTaskStatus ? deleteTaskTextMap[deleteTaskStatus] : '准备中'}
        </Text>
        {currentDeleteItem ? <Text type="secondary">当前：{currentDeleteItem.projectName}</Text> : null}
        {progress ? (
          <Space size={8} wrap>
            <Text type="secondary">共 {progress.totalCount}</Text>
            <Text type="secondary">已删 {progress.completedCount}</Text>
            <Text type="secondary">失败 {progress.failedCount}</Text>
            <Text type="secondary">等待 {progress.pendingCount}</Text>
          </Space>
        ) : null}
        {progress ? <Progress percent={percent} size="small" showInfo={false} className="delete-task-footer__progress" /> : null}
      </div>
      <Space>
        {showPauseButton ? <Button onClick={onPauseDelete}>暂停删除</Button> : null}
        {deleteTaskStatus === 'delete-pausing' ? <Button disabled>等待中</Button> : null}
        {showResumeButton ? <Button onClick={onResumeDelete}>继续删除</Button> : null}
        {showCancelButton ? (
          <Button danger onClick={onFinishDelete}>
            取消本轮
          </Button>
        ) : null}
      </Space>
    </div>
  );
}

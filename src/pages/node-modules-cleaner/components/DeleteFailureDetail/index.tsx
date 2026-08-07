import { Button, Space, Typography } from 'antd';
import type { NodeModulesItem } from '@shared/task-types';
import { formatBooleanStatus } from '../../utils';

const { Text } = Typography;

interface DeleteFailureDetailProps {
  item: NodeModulesItem;
  onPermanentDelete: (item: NodeModulesItem) => void;
}

/**
 * 展示删除失败的诊断信息，帮助用户判断是权限、占用还是回收站能力问题。
 */
export default function DeleteFailureDetail({ item, onPermanentDelete }: DeleteFailureDetailProps) {
  const detail = item.failureDetail;

  return (
    <Space direction="vertical" size={8}>
      <Text>项目名：{item.projectName}</Text>
      <Text>项目路径：{item.projectPath}</Text>
      <Text>node_modules：{item.nodeModulesPath}</Text>
      <Text type="danger">原因：{item.errorMessage || '未返回具体失败原因'}</Text>
      {detail ? (
        <>
          <Text>删除方式：{detail.mode === 'trash' ? '移入回收站' : '永久删除'}</Text>
          <Text>解析路径：{detail.resolvedPath}</Text>
          <Text>
            系统错误：{[detail.errorName, detail.errorCode, detail.errorSyscall].filter(Boolean).join(' / ') || '无'}
          </Text>
          <Text>错误路径：{detail.errorPath || '无'}</Text>
          <Text>删除前存在：{formatBooleanStatus(detail.existsBeforeDelete)}</Text>
          <Text>失败后存在：{formatBooleanStatus(detail.existsAfterFailure)}</Text>
          <Text>失败后可访问：{formatBooleanStatus(detail.canAccessAfterFailure)}</Text>
          <Text>诊断：{detail.diagnosticMessage}</Text>
          <Text>建议：{detail.suggestion}</Text>
          {detail.mode === 'trash' ? (
            <Button danger onClick={() => onPermanentDelete(item)}>
              永久删除此项
            </Button>
          ) : null}
        </>
      ) : null}
    </Space>
  );
}

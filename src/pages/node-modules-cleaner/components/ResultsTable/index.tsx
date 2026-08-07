import { Button, Space, Table, Tag } from 'antd';
import type { TableColumnsType } from 'antd';
import type { NodeModulesItem, ProtectedProject } from '@shared/task-types';
import { formatBytes, getItemStatusColor, isItemProtected, statusTextMap } from '../../utils';
import './index.less';

interface ResultsTableProps {
  items: NodeModulesItem[];
  protectedProjects: ProtectedProject[];
  selectedRowKeys: string[];
  onSelectedRowKeysChange: (keys: string[]) => void;
  onIgnore: (item: NodeModulesItem) => void;
  onShowError: (item: NodeModulesItem) => void;
}

/**
 * 展示扫描到的 node_modules 列表，并提供选择、忽略和失败原因查看能力。
 */
export default function ResultsTable({
  items,
  protectedProjects,
  selectedRowKeys,
  onSelectedRowKeysChange,
  onIgnore,
  onShowError,
}: ResultsTableProps) {
  const columns: TableColumnsType<NodeModulesItem> = [
    {
      title: '项目名',
      dataIndex: 'projectName',
      width: 160,
      ellipsis: true,
    },
    {
      title: '大小',
      width: 110,
      render: (_, item) => formatBytes(item.sizeBytes),
      sorter: (left, right) => (left.sizeBytes ?? 0) - (right.sizeBytes ?? 0),
    },
    {
      title: '文件数',
      width: 90,
      render: (_, item) => item.fileCount ?? '-',
    },
    {
      title: '类型',
      width: 116,
      render: (_, item) =>
        item.source === 'package-json' ? (
          <Tag color="green">已识别项目</Tag>
        ) : (
          <Tag color="orange">未识别项目</Tag>
        ),
    },
    {
      title: '状态',
      width: 116,
      render: (_, item) =>
        isItemProtected(item, protectedProjects) ? (
          <Tag color="cyan">已保护</Tag>
        ) : (
          <Tag color={getItemStatusColor(item.status)}>{statusTextMap[item.status]}</Tag>
        ),
    },
    {
      title: 'node_modules 路径',
      dataIndex: 'nodeModulesPath',
      ellipsis: true,
    },
    {
      title: '操作',
      align: 'right',
      width: 120,
      render: (_, item) => {
        const protectedItem = isItemProtected(item, protectedProjects);
        const ignoringDisabled = protectedItem || item.status === 'deleting' || item.status === 'deleted';

        return (
          <Space size={8}>
            {item.status === 'delete-failed' ? (
              <Button type="link" size="small" onClick={() => onShowError(item)}>
                原因
              </Button>
            ) : null}
            <Button type="link" size="small" disabled={ignoringDisabled} onClick={() => onIgnore(item)}>
              忽略
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <Table<NodeModulesItem>
      className="results-table"
      rowKey="id"
      columns={columns}
      dataSource={items}
      size="small"
      rowSelection={{
        selectedRowKeys,
        onChange: (keys) => onSelectedRowKeysChange(keys.map(String)),
        getCheckboxProps: (item) => ({
          disabled: item.status === 'deleted' || item.status === 'deleting' || isItemProtected(item, protectedProjects),
        }),
      }}
      pagination={{
        defaultPageSize: 50,
        pageSizeOptions: [20, 50, 100],
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 个项目`,
      }}
      scroll={{ y: '100%' }}
    />
  );
}

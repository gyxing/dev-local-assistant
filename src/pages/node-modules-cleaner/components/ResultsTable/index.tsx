import { Button, Space, Table, Tag } from 'antd';
import { useEffect, useState } from 'react';
import type { TableColumnsType } from 'antd';
import type { NodeModulesItem, ProtectedProject } from '@shared/task-types';
import { formatBytes, getItemStatusColor, isItemProtected, statusTextMap } from '../../utils';
import './index.less';

interface ResultsTableProps {
  items: NodeModulesItem[];
  filter: string;
  onClearFilter: () => void;
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
  filter,
  onClearFilter,
  protectedProjects,
  selectedRowKeys,
  onSelectedRowKeysChange,
  onIgnore,
  onShowError,
}: ResultsTableProps) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filter]);

  // 保护项目及正在删除或已删除的项目不能再次勾选。
  const canSelect = (item: NodeModulesItem) =>
    item.status !== 'deleted' && item.status !== 'deleting' && !isItemProtected(item, protectedProjects);
  const columns: TableColumnsType<NodeModulesItem> = [
    {
      title: '项目名',
      dataIndex: 'projectName',
      width: 144,
      ellipsis: { showTitle: false },
      render: (name: string, item) => (
        <button
          type="button"
          className="results-table__project"
          title={name}
          disabled={!canSelect(item)}
          aria-pressed={selectedRowKeys.includes(item.id)}
          onClick={() => onSelectedRowKeysChange(selectedRowKeys.includes(item.id)
            ? selectedRowKeys.filter(key => key !== item.id)
            : [...selectedRowKeys, item.id])}
        >
          {name}
        </button>
      ),
    },
    {
      title: '大小',
      align: 'right',
      width: 92,
      render: (_, item) => formatBytes(item.sizeBytes),
      sorter: (left, right) => (left.sizeBytes ?? 0) - (right.sizeBytes ?? 0),
    },
    {
      title: '文件数',
      align: 'right',
      width: 76,
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
      width: 112,
      render: (_, item) =>
        isItemProtected(item, protectedProjects) ? (
          <Tag color="cyan">已保护</Tag>
        ) : (
          <Tag color={getItemStatusColor(item.status)}>{statusTextMap[item.status]}</Tag>
        ),
    },
    // 窄窗优先完整显示项目类型和状态，长路径可以在表格内横向查看。
    {
      title: '依赖路径',
      dataIndex: 'nodeModulesPath',
      className: 'toolbox-mono',
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
      className={`toolbox-data-table results-table${items.length ? ' toolbox-fill-table' : ''}`}
      rowKey="id"
      columns={columns}
      dataSource={items}
      size="small"
      rowSelection={{
        selectedRowKeys,
        preserveSelectedRowKeys: true,
        getTitleCheckboxProps: () => ({ 'aria-label': '全选本页可清理项目' }),
        onChange: (keys) => onSelectedRowKeysChange(keys.map(String)),
        getCheckboxProps: (item) => ({
          disabled: !canSelect(item),
          'aria-label': `选择 ${item.projectName}`,
        }),
      }}
      pagination={{
        current: page,
        onChange: setPage,
        defaultPageSize: 50,
        pageSizeOptions: [20, 50, 100],
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 个项目`,
      }}
      scroll={{ x: 920, y: '100%' }}
      locale={{
        emptyText: filter
          ? <span>没有匹配的项目 <Button type="link" size="small" onClick={onClearFilter}>清空筛选</Button></span>
          : '暂无扫描结果。选择目录后点击扫描。',
      }}
    />
  );
}

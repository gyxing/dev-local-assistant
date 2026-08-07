import { forwardRef, useImperativeHandle, useState } from 'react';
import type { Ref } from 'react';
import { Button, Modal, Space, Table, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { IgnoredProject } from '@shared/task-types';
import './index.less';

const { Text } = Typography;

interface IgnoredProjectsModalProps {
  projects: IgnoredProject[];
  onRestore: (projectId: string) => void;
  onClear: () => void;
}

export interface IgnoredProjectsModalRef {
  open: () => void;
}

/**
 * 展示已忽略项目，并允许用户恢复扫描这些项目。
 */
function IgnoredProjectsModal({
  projects,
  onRestore,
  onClear,
}: IgnoredProjectsModalProps, ref: Ref<IgnoredProjectsModalRef>) {
  const [open, setOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
  }));

  const columns: TableColumnsType<IgnoredProject> = [
    {
      title: '项目名',
      dataIndex: 'name',
      width: 180,
    },
    {
      title: '项目路径',
      dataIndex: 'projectPath',
      ellipsis: true,
    },
    {
      title: 'node_modules 路径',
      dataIndex: 'nodeModulesPath',
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    {
      title: '忽略时间',
      width: 180,
      render: (_, project) => new Date(project.createdAt).toLocaleString(),
    },
    {
      title: '操作',
      width: 100,
      render: (_, project) => (
        <Button type="link" size="small" onClick={() => onRestore(project.id)}>
          取消忽略
        </Button>
      ),
    },
  ];

  return (
    <Modal title="忽略项目" open={open} width={920} footer={null} onCancel={() => setOpen(false)}>
      <Space className="ignored-projects-modal__actions">
        <Text type="secondary">取消忽略后，重新扫描时项目会再次出现在列表中。</Text>
        <Button danger icon={<DeleteOutlined />} disabled={!projects.length} onClick={onClear}>
          清空忽略
        </Button>
      </Space>
      <Table<IgnoredProject>
        rowKey="id"
        columns={columns}
        dataSource={projects}
        pagination={false}
        size="small"
        scroll={{ y: 320 }}
      />
    </Modal>
  );
}

export default forwardRef(IgnoredProjectsModal);

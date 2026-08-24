import { useEffect, useState } from 'react';
import { App, Button, Modal, Space, Table, Tag, Typography } from 'antd';
import { RollbackOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import type {
  HostsBackupItem,
  HostsMutationResult,
} from '../../../../../shared/network-tools-types';
import { formatBytes } from '../../../node-modules-cleaner/utils';

const { Text } = Typography;

interface HostsBackupModalProps {
  open: boolean;
  sourceHash?: string;
  onCancel: () => void;
  onRestored: (result: HostsMutationResult) => void;
}

function formatCreatedAt(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

/** 展示原始与历史 Hosts 备份，并在恢复前进行二次确认。 */
export default function HostsBackupModal({
  open,
  sourceHash,
  onCancel,
  onRestored,
}: HostsBackupModalProps) {
  const { message, modal } = App.useApp();
  const [backups, setBackups] = useState<HostsBackupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string>();

  useEffect(() => {
    if (open) {
      void loadBackups();
    }
  }, [open]);

  async function loadBackups() {
    const api = window.developerAssistant;
    if (!api) {
      return;
    }

    setLoading(true);
    try {
      setBackups(await api.listHostsBackups());
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '读取 Hosts 备份失败');
    } finally {
      setLoading(false);
    }
  }

  function confirmRestore(backup: HostsBackupItem) {
    modal.confirm({
      title: backup.kind === 'original' ? '恢复原始 Hosts 备份' : '恢复历史 Hosts 备份',
      content: '恢复前仍会备份当前文件，恢复完成后会自动清理 DNS 缓存。',
      okText: '确认恢复',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => handleRestore(backup.id),
    });
  }

  async function handleRestore(backupId: string) {
    const api = window.developerAssistant;
    if (!api || !sourceHash) {
      message.error('当前 Hosts 文件状态不可用，请重新加载');
      return;
    }

    setRestoringId(backupId);
    try {
      const result = await api.restoreHostsBackup(backupId, sourceHash);
      onRestored(result);
      if (result.dnsResult.success) {
        message.success('Hosts 已恢复，DNS 缓存已清理');
      } else {
        message.warning(`Hosts 已恢复，但${result.dnsResult.message}`);
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '恢复 Hosts 备份失败');
    } finally {
      setRestoringId(undefined);
    }
  }

  const columns: TableColumnsType<HostsBackupItem> = [
    {
      title: '类型',
      dataIndex: 'kind',
      width: 110,
      render: (kind: HostsBackupItem['kind']) =>
        kind === 'original' ? <Tag color="blue">原始备份</Tag> : <Tag>历史备份</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 190,
      render: (createdAt: number) => formatCreatedAt(createdAt),
    },
    {
      title: '大小',
      dataIndex: 'sizeBytes',
      width: 100,
      render: (sizeBytes: number) => formatBytes(sizeBytes),
    },
    {
      title: '校验值',
      dataIndex: 'sha256',
      ellipsis: true,
      render: (sha256: string) => (
        <Text code ellipsis={{ tooltip: sha256 }}>
          {sha256.slice(0, 12)}
        </Text>
      ),
    },
    {
      title: '操作',
      width: 100,
      render: (_, backup) => (
        <Button
          size="small"
          icon={<RollbackOutlined />}
          loading={restoringId === backup.id}
          disabled={Boolean(restoringId && restoringId !== backup.id)}
          onClick={() => confirmRestore(backup)}
        >
          恢复
        </Button>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      width={820}
      title="Hosts 备份"
      footer={
        <Space>
          <Button loading={loading} onClick={loadBackups}>
            刷新列表
          </Button>
          <Button onClick={onCancel}>关闭</Button>
        </Space>
      }
      onCancel={onCancel}
    >
      <Table<HostsBackupItem>
        rowKey="id"
        columns={columns}
        dataSource={backups}
        loading={loading}
        size="small"
        pagination={false}
        scroll={{ x: 720, y: 360 }}
        locale={{ emptyText: '暂无 Hosts 备份' }}
      />
    </Modal>
  );
}

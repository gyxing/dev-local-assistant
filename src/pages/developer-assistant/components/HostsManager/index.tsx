import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Input, Modal, Space, Switch, Table, Tag, Typography } from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  SearchOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import type {
  HostsDocument,
  HostsEntry,
  HostsMutationResult,
} from '../../../../../shared/network-tools-types';
import HostsBackupModal from '../HostsBackupModal';
import HostsEntryModal from '../HostsEntryModal';
import './index.less';

const { Text } = Typography;

interface HostsManagerProps {
  onDirtyChange?: (dirty: boolean) => void;
}

function cloneEntries(entries: HostsEntry[]): HostsEntry[] {
  return entries.map((entry) => ({ ...entry, hostnames: [...entry.hostnames] }));
}

function serializeEntries(entries: HostsEntry[]): string {
  return JSON.stringify(
    entries.map((entry) => ({
      id: entry.id,
      address: entry.address,
      hostnames: entry.hostnames,
      comment: entry.comment ?? '',
      enabled: entry.enabled,
    })),
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** 管理 Windows Hosts 映射、备份恢复与 DNS 缓存清理。 */
export default function HostsManager({ onDirtyChange }: HostsManagerProps) {
  const { message, modal } = App.useApp();
  const [document, setDocument] = useState<HostsDocument>();
  const [entries, setEntries] = useState<HostsEntry[]>([]);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flushingDns, setFlushingDns] = useState(false);
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<HostsEntry>();
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [rawModalOpen, setRawModalOpen] = useState(false);
  const apiAvailable = Boolean(window.developerAssistant);

  const dirty = useMemo(
    () => Boolean(document && serializeEntries(entries) !== serializeEntries(document.entries)),
    [document, entries],
  );

  const loadDocument = useCallback(async () => {
    const api = window.developerAssistant;
    if (!api) {
      message.error('当前页面未连接 Electron 能力');
      return;
    }

    setLoading(true);
    try {
      const nextDocument = await api.getHostsDocument();
      setDocument(nextDocument);
      setEntries(cloneEntries(nextDocument.entries));
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '读取 Hosts 文件失败'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (apiAvailable) {
      void loadDocument();
    }
  }, [apiAvailable, loadDocument]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  function openAddModal() {
    setEditingEntry(undefined);
    setEntryModalOpen(true);
  }

  function openEditModal(entry: HostsEntry) {
    setEditingEntry(entry);
    setEntryModalOpen(true);
  }

  function handleEntrySubmit(entry: HostsEntry) {
    setEntries((currentEntries) => {
      const existingIndex = currentEntries.findIndex((item) => item.id === entry.id);
      if (existingIndex < 0) {
        return [...currentEntries, entry];
      }

      return currentEntries.map((item) => (item.id === entry.id ? entry : item));
    });
    setEntryModalOpen(false);
  }

  function confirmDelete(entry: HostsEntry) {
    modal.confirm({
      title: '删除 Hosts 记录',
      content: `将从待保存内容中删除 ${entry.hostnames.join('、')}，保存前不会修改系统文件。`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => setEntries((currentEntries) => currentEntries.filter((item) => item.id !== entry.id)),
    });
  }

  function handleReload() {
    if (!dirty) {
      void loadDocument();
      return;
    }

    modal.confirm({
      title: '放弃未保存修改？',
      content: '重新加载会丢弃当前尚未保存的 Hosts 编辑内容。',
      okText: '放弃并重新加载',
      cancelText: '继续编辑',
      okButtonProps: { danger: true },
      onOk: loadDocument,
    });
  }

  function confirmSave() {
    modal.confirm({
      title: '保存 Hosts 并清理 DNS',
      content: '保存前会创建历史备份；权限不足时 Windows 将弹出管理员授权窗口。',
      okText: '保存并刷新',
      cancelText: '取消',
      onOk: handleSave,
    });
  }

  async function handleSave() {
    const api = window.developerAssistant;
    if (!api || !document) {
      message.error('当前 Hosts 文件状态不可用，请重新加载');
      return;
    }

    setSaving(true);
    try {
      const result = await api.saveHosts({ sourceHash: document.sourceHash, entries });
      setDocument(result.document);
      setEntries(cloneEntries(result.document.entries));
      if (result.dnsResult.success) {
        message.success('Hosts 已保存，DNS 缓存已清理');
      } else {
        message.warning(`Hosts 已保存，但${result.dnsResult.message}`);
      }
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '保存 Hosts 文件失败'));
    } finally {
      setSaving(false);
    }
  }

  async function handleFlushDns() {
    const api = window.developerAssistant;
    if (!api) {
      message.error('当前页面未连接 Electron 能力');
      return;
    }

    setFlushingDns(true);
    try {
      const result = await api.flushDns();
      if (result.success) {
        message.success(result.message);
      } else {
        message.error(result.message);
      }
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '清理 DNS 缓存失败'));
    } finally {
      setFlushingDns(false);
    }
  }

  function handleRestored(result: HostsMutationResult) {
    setDocument(result.document);
    setEntries(cloneEntries(result.document.entries));
    setBackupModalOpen(false);
  }

  const normalizedSearchText = searchText.trim().toLowerCase();
  const filteredEntries = normalizedSearchText
    ? entries.filter((entry) =>
        [entry.address, ...entry.hostnames, entry.comment ?? ''].some((value) =>
          value.toLowerCase().includes(normalizedSearchText),
        ),
      )
    : entries;

  const columns: TableColumnsType<HostsEntry> = [
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 72,
      render: (enabled: boolean, entry) => (
        <Switch
          size="small"
          checked={enabled}
          aria-label={`${entry.hostnames.join('、')} 的启用状态`}
          onChange={(checked) =>
            setEntries((currentEntries) =>
              currentEntries.map((item) => (item.id === entry.id ? { ...item, enabled: checked } : item)),
            )
          }
        />
      ),
    },
    {
      title: 'IP 地址',
      dataIndex: 'address',
      width: 150,
      rowScope: 'row',
      render: (address: string) => <Text code>{address}</Text>,
    },
    {
      title: '主机名',
      dataIndex: 'hostnames',
      render: (hostnames: string[]) => (
        <Space className="hosts-manager__hostnames" size={[4, 4]} wrap>
          {hostnames.map((hostname) => (
            <Tag key={hostname} color="blue">
              {hostname}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '注释',
      dataIndex: 'comment',
      width: 220,
      render: (comment?: string) => (
        <Text type={comment ? undefined : 'secondary'} ellipsis={{ tooltip: comment }}>
          {comment || '-'}
        </Text>
      ),
    },
    {
      title: '操作',
      width: 150,
      render: (_, entry) => (
        <Space size={6}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(entry)}>
            编辑
          </Button>
          <Button danger size="small" icon={<DeleteOutlined />} onClick={() => confirmDelete(entry)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <section className="hosts-manager">
      <header className="hosts-manager__header">
        <div className="hosts-manager__heading">
          <Text strong>Hosts 与 DNS</Text>
          <Text type="secondary" className="hosts-manager__subtitle">
            管理本地域名映射，保存或恢复后自动清理 DNS 缓存
          </Text>
        </div>
        <Space wrap>
          <Button
            icon={<SyncOutlined />}
            loading={flushingDns}
            disabled={!apiAvailable || loading || saving}
            onClick={handleFlushDns}
          >
            清理 DNS
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={!apiAvailable || loading || !dirty}
            onClick={confirmSave}
          >
            保存并刷新
          </Button>
        </Space>
      </header>

      <div className="hosts-manager__toolbar">
        <Input
          className="hosts-manager__search"
          allowClear
          prefix={<SearchOutlined />}
          value={searchText}
          placeholder="搜索 IP、主机名或注释"
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Space size={6} wrap>
          <Button icon={<PlusOutlined />} disabled={!document || loading} onClick={openAddModal}>
            添加记录
          </Button>
          <Button icon={<ReloadOutlined />} loading={loading} disabled={!apiAvailable} onClick={handleReload}>
            重新加载
          </Button>
          <Button
            icon={<HistoryOutlined />}
            disabled={!document || loading || dirty}
            onClick={() => setBackupModalOpen(true)}
          >
            备份恢复
          </Button>
          <Button
            icon={<FileTextOutlined />}
            disabled={!document || loading}
            onClick={() => setRawModalOpen(true)}
          >
            查看原文
          </Button>
        </Space>
      </div>

      <div className="hosts-manager__meta">
        <Text type="secondary" ellipsis={{ tooltip: document?.hostsPath }}>
          {document?.hostsPath ?? '正在读取 Windows Hosts 文件…'}
        </Text>
        {document ? <Tag>{document.encoding.toUpperCase()}</Tag> : null}
        {document?.originalBackup ? <Tag color="green">原始备份已保护</Tag> : null}
        {dirty ? <Tag color="orange">有未保存修改</Tag> : null}
      </div>

      <Table<HostsEntry>
        className="hosts-manager__table"
        rowKey="id"
        columns={columns}
        dataSource={filteredEntries}
        loading={loading}
        size="small"
        tableLayout="fixed"
        pagination={false}
        scroll={{ x: 860, y: '100%' }}
        locale={{ emptyText: searchText ? '没有匹配的 Hosts 记录' : '暂无可管理的 Hosts 记录' }}
      />

      <HostsEntryModal
        open={entryModalOpen}
        entry={editingEntry}
        onCancel={() => setEntryModalOpen(false)}
        onSubmit={handleEntrySubmit}
      />
      <HostsBackupModal
        open={backupModalOpen}
        sourceHash={document?.sourceHash}
        onCancel={() => setBackupModalOpen(false)}
        onRestored={handleRestored}
      />
      <Modal
        open={rawModalOpen}
        width={840}
        title="当前 Hosts 文件原文"
        footer={<Button onClick={() => setRawModalOpen(false)}>关闭</Button>}
        onCancel={() => setRawModalOpen(false)}
      >
        <Text type="secondary">未保存的表格修改不会显示在原文中。</Text>
        <pre className="hosts-manager__raw-content">{document?.rawContent}</pre>
      </Modal>
    </section>
  );
}

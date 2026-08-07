import { useEffect, useState } from 'react';
import { Button, Modal, Space, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, FolderOpenOutlined, ReloadOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import type { PackageCacheItem, PackageManagerName } from '../../../../../shared/developer-tools-types';
import { formatBytes } from '../../../node-modules-cleaner/utils';
import './index.less';

const { Text } = Typography;

const statusTextMap: Record<PackageCacheItem['status'], string> = {
  ready: '可清理',
  missing: '目录不存在',
  unavailable: '命令不可用',
  failed: '扫描失败',
};

const statusColorMap: Record<PackageCacheItem['status'], string> = {
  ready: 'blue',
  missing: 'default',
  unavailable: 'orange',
  failed: 'red',
};

/**
 * 包管理缓存清理器，使用包管理器官方命令扫描和清理缓存。
 */
export default function PackageCacheCleaner() {
  const [items, setItems] = useState<PackageCacheItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [cleaningManager, setCleaningManager] = useState<PackageManagerName>();
  const apiAvailable = Boolean(window.developerAssistant);

  useEffect(() => {
    if (apiAvailable) {
      void handleScan();
    }
  }, [apiAvailable]);

  async function handleScan() {
    const api = window.developerAssistant;
    if (!api) {
      message.error('当前页面未连接 Electron 能力');
      return;
    }

    setLoading(true);
    try {
      setItems(await api.scanPackageCaches());
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '扫描包管理缓存失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenDirectory(cachePath?: string) {
    const api = window.developerAssistant;
    if (!api || !cachePath) {
      return;
    }

    const errorMessage = await api.openPackageCacheDirectory(cachePath);
    if (errorMessage) {
      message.error(errorMessage);
    }
  }

  function confirmClean(item: PackageCacheItem) {
    Modal.confirm({
      title: `确认清理 ${item.label}`,
      content: `将执行 ${item.label} 的官方清理命令。清理后缓存可重新生成，但首次安装依赖可能变慢。`,
      okText: '清理',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => handleClean(item.manager),
    });
  }

  async function handleClean(manager: PackageManagerName) {
    const api = window.developerAssistant;
    if (!api) {
      message.error('当前页面未连接 Electron 能力');
      return;
    }

    setCleaningManager(manager);
    try {
      const result = await api.cleanPackageCache(manager);
      if (result.success) {
        message.success(result.message);
        await handleScan();
        return;
      }

      message.error(result.message);
    } finally {
      setCleaningManager(undefined);
    }
  }

  const columns: TableColumnsType<PackageCacheItem> = [
    {
      title: '工具',
      dataIndex: 'label',
      width: 140,
    },
    {
      title: '缓存目录',
      dataIndex: 'cachePath',
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    {
      title: '大小',
      width: 120,
      render: (_, item) => (item.exists ? formatBytes(item.sizeBytes) : '-'),
    },
    {
      title: '文件数',
      width: 100,
      render: (_, item) => item.fileCount ?? '-',
    },
    {
      title: '状态',
      width: 120,
      render: (_, item) => <Tag color={statusColorMap[item.status]}>{statusTextMap[item.status]}</Tag>,
    },
    {
      title: '操作',
      width: 170,
      render: (_, item) => (
        <Space size={6}>
          <Button
            size="small"
            icon={<FolderOpenOutlined />}
            disabled={!item.cachePath || !item.exists}
            onClick={() => handleOpenDirectory(item.cachePath)}
          >
            打开
          </Button>
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            loading={cleaningManager === item.manager}
            disabled={item.status !== 'ready'}
            onClick={() => confirmClean(item)}
          >
            清理
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <section className="package-cache-cleaner">
      <header className="package-cache-cleaner__header">
        <div className="package-cache-cleaner__heading">
          <Text strong>包管理缓存清理器</Text>
          <Text type="secondary" className="package-cache-cleaner__subtitle">
            使用 npm、pnpm、yarn 官方命令清理缓存
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} disabled={!apiAvailable} onClick={handleScan}>
          扫描缓存
        </Button>
      </header>

      <Table<PackageCacheItem>
        className="package-cache-cleaner__table"
        rowKey="manager"
        columns={columns}
        dataSource={items}
        loading={loading}
        size="small"
        pagination={false}
      />
    </section>
  );
}

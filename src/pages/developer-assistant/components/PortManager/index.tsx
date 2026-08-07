import { useState } from 'react';
import { Button, Input, Modal, Space, Table, Tag, Typography, message } from 'antd';
import { CopyOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import type { PortUsageItem } from '../../../../../shared/developer-tools-types';
import './index.less';

const { Text } = Typography;

const COMMON_PORTS = [3000, 5173, 8000, 8080, 8137, 8138];

/**
 * 端口占用管理器，帮助开发者定位并结束本地开发端口对应进程。
 */
export default function PortManager() {
  const [portText, setPortText] = useState('');
  const [items, setItems] = useState<PortUsageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [killingPid, setKillingPid] = useState<number>();
  const apiAvailable = Boolean(window.developerAssistant);

  async function listPortUsages(ports?: number[]) {
    const api = window.developerAssistant;
    if (!api) {
      message.error('当前页面未连接 Electron 能力');
      return;
    }

    setLoading(true);
    try {
      setItems(await api.listPortUsages(ports));
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '查询端口占用失败');
    } finally {
      setLoading(false);
    }
  }

  function handleSearchPort() {
    const port = Number(portText.trim());
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      message.warning('请输入 1-65535 之间的端口号');
      return;
    }

    void listPortUsages([port]);
  }

  async function copyPid(pid: number) {
    try {
      await navigator.clipboard.writeText(String(pid));
      message.success('PID 已复制');
    } catch {
      message.error('复制 PID 失败');
    }
  }

  function confirmKillProcess(item: PortUsageItem) {
    Modal.confirm({
      title: `确认结束进程 ${item.pid}`,
      content: `端口 ${item.localPort} 当前由 ${item.processName || '未知进程'} 占用。结束进程可能中断正在运行的服务。`,
      okText: '结束进程',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => killProcess(item.pid),
    });
  }

  async function killProcess(pid: number) {
    const api = window.developerAssistant;
    if (!api) {
      message.error('当前页面未连接 Electron 能力');
      return;
    }

    setKillingPid(pid);
    try {
      const result = await api.killPortProcess(pid);
      if (result.success) {
        message.success(result.message);
        await listPortUsages(items.map((item) => item.localPort));
        return;
      }

      message.error(result.message);
    } finally {
      setKillingPid(undefined);
    }
  }

  const columns: TableColumnsType<PortUsageItem> = [
    {
      title: '端口',
      dataIndex: 'localPort',
      width: 90,
      render: (value: number) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: '协议',
      dataIndex: 'protocol',
      width: 80,
    },
    {
      title: '本地地址',
      dataIndex: 'localAddress',
      width: 180,
      ellipsis: true,
    },
    {
      title: '状态',
      dataIndex: 'state',
      width: 120,
      render: (value?: string) => value || '-',
    },
    {
      title: 'PID',
      dataIndex: 'pid',
      width: 100,
    },
    {
      title: '进程',
      dataIndex: 'processName',
      width: 140,
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    {
      title: '进程路径',
      dataIndex: 'processPath',
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    {
      title: '操作',
      width: 180,
      render: (_, item) => (
        <Space size={6}>
          <Button size="small" icon={<CopyOutlined />} onClick={() => copyPid(item.pid)}>
            复制
          </Button>
          <Button
            danger
            size="small"
            icon={<DeleteOutlined />}
            loading={killingPid === item.pid}
            onClick={() => confirmKillProcess(item)}
          >
            结束
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <section className="port-manager">
      <header className="port-manager__header">
        <div className="port-manager__heading">
          <Text strong>端口占用管理器</Text>
          <Text type="secondary" className="port-manager__subtitle">
            查询常用开发端口，必要时结束占用进程
          </Text>
        </div>
        <Space wrap>
          <Input
            className="port-manager__input"
            value={portText}
            placeholder="端口号"
            onChange={(event) => setPortText(event.target.value)}
            onPressEnter={handleSearchPort}
          />
          <Button icon={<SearchOutlined />} disabled={!apiAvailable} onClick={handleSearchPort}>
            查询端口
          </Button>
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            disabled={!apiAvailable}
            onClick={() => listPortUsages(COMMON_PORTS)}
          >
            扫描常用端口
          </Button>
        </Space>
      </header>

      <div className="port-manager__quick-ports">
        {COMMON_PORTS.map((port) => (
          <Button key={port} size="small" disabled={!apiAvailable} onClick={() => listPortUsages([port])}>
            {port}
          </Button>
        ))}
      </div>

      <Table<PortUsageItem>
        className="port-manager__table"
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={loading}
        size="small"
        pagination={{ pageSize: 50, showSizeChanger: false }}
      />
    </section>
  );
}

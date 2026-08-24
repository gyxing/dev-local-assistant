import { useState } from 'react';
import { Button, Input, Modal, Space, Table, Tag, Typography, message } from 'antd';
import { CopyOutlined, DeleteOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import type { TableColumnsType } from 'antd';
import type {
  PortUsageItem,
  PortUsageQuery,
} from '../../../../../shared/developer-tools-types';
import { groupPortUsages } from './port-usage-group';
import type { PortUsageGroup } from './port-usage-group';
import './index.less';

const { Text } = Typography;

// 覆盖常见开发服务器、数据库、中间件及本项目调试端口。
const COMMON_PORTS = [
  3000,
  3001,
  3306,
  4200,
  5000,
  5173,
  5174,
  5432,
  6379,
  8000,
  8080,
  8081,
  8137,
  8138,
  8888,
  27017,
];

const DETAIL_COLUMNS: TableColumnsType<PortUsageItem> = [
  {
    title: '本地地址',
    dataIndex: 'localAddress',
    ellipsis: true,
  },
  {
    title: '远程地址',
    dataIndex: 'remoteAddress',
    ellipsis: true,
    render: (value?: string) => value || '-',
  },
  {
    title: '状态',
    dataIndex: 'state',
    width: 140,
    render: (value?: string) => value || '-',
  },
];

function getLocalAddressSummary(group: PortUsageGroup): string {
  if (group.items.length === 1) {
    return group.items[0].localAddress;
  }

  return group.listeningCount > 0
    ? `${group.listeningCount} 个监听地址`
    : `${group.localAddressCount} 个本地地址`;
}

function renderStateSummary(group: PortUsageGroup): ReactNode {
  return (
    <Space size={[4, 4]} wrap>
      {group.listeningCount > 0 ? <Tag color="green">监听 {group.listeningCount}</Tag> : null}
      {group.establishedCount > 0 ? <Tag color="blue">连接 {group.establishedCount}</Tag> : null}
      {group.otherStateCount > 0 ? <Tag>占用 {group.otherStateCount}</Tag> : null}
    </Space>
  );
}

function renderApplicationInfo(group: PortUsageGroup): ReactNode {
  const processName = group.processName || '未知进程';
  // 启动命令不可用时回退到可执行文件路径，保证应用信息仍可用于定位进程。
  const applicationCommand = group.commandLine || group.processPath || '-';

  return (
    <div className="port-manager__application">
      <div className="port-manager__application-heading">
        <Text strong className="port-manager__application-name" ellipsis={{ tooltip: processName }}>
          {processName}
        </Text>
        <Text type="secondary" className="port-manager__application-pid">
          PID {group.pid}
        </Text>
      </div>
      <Text
        type="secondary"
        className="port-manager__application-command"
        ellipsis={{ tooltip: applicationCommand }}
      >
        {applicationCommand}
      </Text>
    </div>
  );
}

function renderPortUsageDetails(group: PortUsageGroup): ReactNode {
  return (
    <Table<PortUsageItem>
      className="port-manager__details-table"
      rowKey="id"
      columns={DETAIL_COLUMNS}
      dataSource={group.items}
      size="small"
      pagination={false}
    />
  );
}

/**
 * 端口占用管理器，帮助开发者定位并结束本地开发端口对应进程。
 */
export default function PortManager() {
  const [portText, setPortText] = useState('');
  const [items, setItems] = useState<PortUsageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [killingPid, setKillingPid] = useState<number>();
  const [lastQuery, setLastQuery] = useState<PortUsageQuery>({
    ports: COMMON_PORTS,
    scope: 'all',
  });
  const apiAvailable = Boolean(window.developerAssistant);

  async function listPortUsages(query: PortUsageQuery) {
    const api = window.developerAssistant;
    if (!api) {
      message.error('当前页面未连接 Electron 能力');
      return;
    }

    setLoading(true);
    try {
      const nextItems = await api.listPortUsages(query);
      setItems(nextItems);
      setLastQuery(query);
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '查询端口占用失败');
    } finally {
      setLoading(false);
    }
  }

  function handleSearchPort() {
    const normalizedPortText = portText.trim();
    if (!normalizedPortText) {
      void listPortUsages({ scope: 'listening' });
      return;
    }

    const port = Number(normalizedPortText);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      message.warning('请输入 1-65535 之间的端口号');
      return;
    }

    void listPortUsages({ ports: [port], scope: 'all' });
  }

  async function copyPid(pid: number) {
    try {
      await navigator.clipboard.writeText(String(pid));
      message.success('PID 已复制');
    } catch {
      message.error('复制 PID 失败');
    }
  }

  function confirmKillProcess(item: PortUsageGroup) {
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
        await listPortUsages(lastQuery);
        return;
      }

      message.error(result.message);
    } finally {
      setKillingPid(undefined);
    }
  }

  const groupedItems = groupPortUsages(items);

  const columns: TableColumnsType<PortUsageGroup> = [
    {
      title: '端口',
      dataIndex: 'localPort',
      width: 80,
      rowScope: 'row',
      render: (value: number) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: '协议',
      dataIndex: 'protocol',
      width: 64,
      responsive: ['sm'],
    },
    {
      title: '本地地址',
      width: 150,
      ellipsis: true,
      responsive: ['md'],
      render: (_, group) => getLocalAddressSummary(group),
    },
    {
      title: '状态',
      width: 150,
      render: (_, group) => renderStateSummary(group),
    },
    {
      title: '应用信息',
      render: (_, group) => renderApplicationInfo(group),
    },
    {
      title: '操作',
      width: 170,
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
            aria-label="端口号，留空查询全部"
            placeholder="端口号，留空查询全部"
            disabled={loading}
            onChange={(event) => setPortText(event.target.value)}
            onPressEnter={handleSearchPort}
          />
          <Button
            icon={<SearchOutlined />}
            loading={loading}
            disabled={!apiAvailable}
            onClick={handleSearchPort}
          >
            查询端口
          </Button>
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            disabled={!apiAvailable}
            onClick={() => listPortUsages({ ports: COMMON_PORTS, scope: 'all' })}
          >
            扫描常用端口
          </Button>
        </Space>
      </header>

      <div className="port-manager__quick-ports">
        {COMMON_PORTS.map((port) => (
          <Button
            key={port}
            size="small"
            disabled={!apiAvailable || loading}
            onClick={() => listPortUsages({ ports: [port], scope: 'all' })}
          >
            {port}
          </Button>
        ))}
      </div>

      <Table<PortUsageGroup>
        className="port-manager__table"
        rowKey="id"
        columns={columns}
        dataSource={groupedItems}
        loading={loading}
        size="small"
        tableLayout="fixed"
        scroll={{ y: '100%' }}
        pagination={false}
        expandable={{
          columnWidth: 40,
          expandedRowRender: renderPortUsageDetails,
          rowExpandable: (group) => group.items.length > 1,
        }}
      />
    </section>
  );
}

import { Button, Select, Tooltip, Typography } from 'antd';
import {
  ClearOutlined,
  FolderOpenOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { DirectoryHistoryItem, ScanTaskStatus } from '@shared/task-types';
import './index.less';

const { Text } = Typography;

interface CleanerToolbarProps {
  rootPath: string;
  scanStatus: ScanTaskStatus;
  directoryHistory: DirectoryHistoryItem[];
  disabled?: boolean;
  onSelectDirectory: () => void;
  onSelectHistory: (targetPath: string) => void;
  onClearHistory: () => void;
  onStartScan: () => void;
  onPauseScan: () => void;
  onResumeScan: () => void;
  onRestartScan: () => void;
}

/**
 * 负责目录选择、历史目录和扫描控制，是清理页的主要入口工具条。
 */
export default function CleanerToolbar({
  rootPath,
  scanStatus,
  directoryHistory,
  disabled = false,
  onSelectDirectory,
  onSelectHistory,
  onClearHistory,
  onStartScan,
  onPauseScan,
  onResumeScan,
  onRestartScan,
}: CleanerToolbarProps) {
  return (
    <section className="cleaner-toolbar">
      <Button icon={<FolderOpenOutlined />} onClick={onSelectDirectory} disabled={disabled}>
        浏览
      </Button>
      <Select
        className="cleaner-toolbar__history"
        value={undefined}
        placeholder="历史目录"
        disabled={disabled || !directoryHistory.length}
        options={directoryHistory.map((item) => ({
          value: item.path,
          label: `${item.name} · ${item.path}`,
        }))}
        onChange={onSelectHistory}
      />
      <Tooltip title="清空历史目录">
        <Button
          icon={<ClearOutlined />}
          aria-label="清空历史目录"
          disabled={disabled || !directoryHistory.length}
          onClick={onClearHistory}
        />
      </Tooltip>
      <Text className="cleaner-toolbar__path">{rootPath || '请选择要扫描的目录'}</Text>
      <Button type="primary" onClick={onStartScan} disabled={disabled || !rootPath || scanStatus === 'scanning'}>
        扫描
      </Button>
      {scanStatus === 'scanning' ? (
        <Button icon={<PauseOutlined />} onClick={onPauseScan} disabled={disabled}>
          暂停扫描
        </Button>
      ) : null}
      {scanStatus === 'scan-paused' ? (
        <Button icon={<PlayCircleOutlined />} onClick={onResumeScan} disabled={disabled}>
          继续扫描
        </Button>
      ) : null}
      <Button icon={<ReloadOutlined />} onClick={onRestartScan} disabled={disabled || !rootPath}>
        重新扫描
      </Button>
    </section>
  );
}

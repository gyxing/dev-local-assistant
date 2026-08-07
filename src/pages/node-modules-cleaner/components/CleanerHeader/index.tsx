import { Button, Space, Typography } from 'antd';
import { EyeInvisibleOutlined, SettingOutlined } from '@ant-design/icons';
import './index.less';

const { Text, Title } = Typography;

interface CleanerHeaderProps {
  electronApiAvailable: boolean;
  onOpenIgnoredProjects: () => void;
  onOpenProtectedProjects: () => void;
}

/**
 * 清理页标题区，集中放置全局配置入口，避免页面容器混入展示细节。
 */
export default function CleanerHeader({
  electronApiAvailable,
  onOpenIgnoredProjects,
  onOpenProtectedProjects,
}: CleanerHeaderProps) {
  return (
    <header className="cleaner-header">
      <div>
        <Title className="cleaner-header__title" level={3}>
          Node Modules 清理器
        </Title>
        <Text type="secondary">选择目录，扫描项目依赖，并安全地批量释放磁盘空间。</Text>
      </div>
      <Space>
        <Button icon={<EyeInvisibleOutlined />} disabled={!electronApiAvailable} onClick={onOpenIgnoredProjects}>
          忽略项目
        </Button>
        <Button icon={<SettingOutlined />} disabled={!electronApiAvailable} onClick={onOpenProtectedProjects}>
          保护项目
        </Button>
      </Space>
    </header>
  );
}

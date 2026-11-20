import { Button } from 'antd';
import { EyeInvisibleOutlined, SettingOutlined } from '@ant-design/icons';
import WorkspacePageHeader from '@/pages/developer-assistant/components/WorkspacePageHeader';

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
    <WorkspacePageHeader
      title="依赖清理"
      description="扫描指定目录下的 node_modules，按项目释放磁盘空间。"
      actions={<>
        <Button icon={<EyeInvisibleOutlined />} disabled={!electronApiAvailable} onClick={onOpenIgnoredProjects}>
          忽略项目
        </Button>
        <Button icon={<SettingOutlined />} disabled={!electronApiAvailable} onClick={onOpenProtectedProjects}>
          保护项目
        </Button>
      </>}
    />
  );
}

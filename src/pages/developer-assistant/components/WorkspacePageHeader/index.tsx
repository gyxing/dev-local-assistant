import { Typography } from 'antd';
import type { ReactNode } from 'react';

interface WorkspacePageHeaderProps {
  title: string;
  description: string;
  status?: ReactNode;
  actions?: ReactNode;
}

/** 统一各工作区页面的标题、状态和主要操作位置。 */
export default function WorkspacePageHeader({ title, description, status, actions }: WorkspacePageHeaderProps) {
  return (
    <header className="toolbox-page-header">
      <div className="toolbox-page-header__copy">
        <div className="toolbox-page-header__heading">
          <h1 className="toolbox-page-header__title">{title}</h1>
          {status}
        </div>
        <Typography.Text type="secondary" className="toolbox-page-header__description">
          {description}
        </Typography.Text>
      </div>
      {actions ? <div className="toolbox-page-header__actions">{actions}</div> : null}
    </header>
  );
}

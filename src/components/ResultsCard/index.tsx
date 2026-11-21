import { Card } from 'antd';
import type { ReactNode } from 'react';

interface ResultsCardProps {
  title: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  fill?: boolean;
}

/** 扫描和查询结果使用紧凑卡片，有工具栏时为输入框和按钮留出间距。 */
export default function ResultsCard({ title, extra, children, fill = false }: ResultsCardProps) {
  return (
    <Card
      size="small"
      title={title}
      extra={extra}
      style={fill ? { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 } : { flex: 'none' }}
      styles={{
        header: { flex: 'none', paddingBlock: extra ? 8 : undefined, paddingInline: 14 },
        body: fill ? { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 } : undefined,
      }}
    >
      {children}
    </Card>
  );
}

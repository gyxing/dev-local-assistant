import { Progress, Typography } from 'antd';
import { formatBytes } from '../../utils';
import './index.less';

const { Text } = Typography;

interface SummaryBarProps {
  totalCount: number;
  selectedCount: number;
  selectedSize: number;
  sizedCount: number;
}

/**
 * 汇总扫描结果和当前选择，让用户在删除前快速确认数量和容量。
 */
export default function SummaryBar({ totalCount, selectedCount, selectedSize, sizedCount }: SummaryBarProps) {
  const percent = totalCount ? Math.round((sizedCount / totalCount) * 100) : 0;

  return (
    <section className="summary-bar">
      <div className="summary-bar__metric">
        <Text type="secondary" className="summary-bar__label">发现</Text>
        <Text strong className="summary-bar__value">{totalCount}</Text>
      </div>
      <div className="summary-bar__metric">
        <Text type="secondary" className="summary-bar__label">已选</Text>
        <Text strong className="summary-bar__value">{selectedCount}</Text>
      </div>
      <div className="summary-bar__metric summary-bar__metric--wide">
        <Text type="secondary" className="summary-bar__label">预计释放</Text>
        <Text strong className="summary-bar__value">{formatBytes(selectedSize)}</Text>
      </div>
      <div className="summary-bar__progress-wrap">
        <Text type="secondary" className="summary-bar__label">容量统计</Text>
        <Progress className="summary-bar__progress" percent={percent} size="small" />
      </div>
    </section>
  );
}

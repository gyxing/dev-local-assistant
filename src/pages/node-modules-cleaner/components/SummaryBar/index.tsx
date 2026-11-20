import { Button } from 'antd';
import { formatBytes } from '../../utils';
import './index.less';

interface SummaryBarProps {
  selectedCount: number;
  selectedSize: number;
  hiddenSelectedCount: number;
  onClear: () => void;
}

/** 在批量操作旁显示实际选择范围，包含被筛选隐藏的项目。 */
export default function SummaryBar({ selectedCount, selectedSize, hiddenSelectedCount, onClear }: SummaryBarProps) {
  return (
    <div className="summary-bar">
      <span role="status">
        {selectedCount ? `已选 ${selectedCount} 项 · 预计释放 ${formatBytes(selectedSize)}` : '尚未选择项目'}
        {hiddenSelectedCount ? ` · 筛选外已选 ${hiddenSelectedCount} 项` : ''}
      </span>
      {selectedCount ? <Button size="small" type="text" onClick={onClear}>清除选择</Button> : null}
    </div>
  );
}

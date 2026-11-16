interface OverflowTagProps {
  count: number;
  active: boolean;
  onClick: () => void;
}

/** 右下角收纳入口，只在存在隐藏贴纸时显示。 */
export default function OverflowTag({ count, active, onClick }: OverflowTagProps) {
  return (
    <button className={`overflow-tag${active ? ' is-active' : ''}`} type="button" onClick={onClick}>
      还有 {count} 条
    </button>
  );
}

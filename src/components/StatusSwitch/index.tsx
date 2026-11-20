import { Switch, Tag } from 'antd';
import type { SwitchProps } from 'antd';
import './index.less';

interface StatusSwitchProps extends Omit<SwitchProps, 'checkedChildren' | 'unCheckedChildren' | 'defaultChecked'> {
  onLabel?: string;
  offLabel?: string;
}

/** 给受控开关补充可读状态，开关的键盘与表单行为沿用 Ant Design。 */
export default function StatusSwitch({
  checked = false,
  onLabel = '已开启',
  offLabel = '已关闭',
  ...props
}: StatusSwitchProps) {
  return (
    <span className="toolbox-status-switch">
      <Switch checked={checked} {...props} />
      <Tag color={checked ? 'processing' : 'default'} style={{ marginInlineEnd: 0 }} aria-hidden="true">
        {checked ? onLabel : offLabel}
      </Tag>
    </span>
  );
}

import { CloseOutlined } from '@ant-design/icons';
import { Button, InputNumber, Segmented, Slider, Switch } from 'antd';
import type { DesktopNoteSettings } from '../../../../../shared/desktop-notes-types';

interface SettingsPopoverProps {
  settings: DesktopNoteSettings;
  onChange: (settings: Partial<DesktopNoteSettings>) => void;
  onClose: () => void;
}

const FIXED_OPTIONS = [1, 2, 3, 5];

/**
 * 便利贴窗口内的显示设置。数量和行数允许超出固定档位，范围限制在 1 到 20。
 */
export default function SettingsPopover({ settings, onChange, onClose }: SettingsPopoverProps) {
  return (
    <aside className="settings-popover" aria-label="显示设置">
      <div className="settings-header">
        <strong>显示设置</strong>
        <Button type="text" size="small" aria-label="关闭设置" icon={<CloseOutlined />} onClick={onClose} />
      </div>

      <SettingNumber
        label="最大显示"
        value={settings.maxVisibleNotes}
        onChange={(value) => onChange({ maxVisibleNotes: value })}
      />
      <SettingNumber
        label="显示行数"
        value={settings.maxLinesPerNote}
        onChange={(value) => onChange({ maxLinesPerNote: value })}
      />

      <label className="settings-check">
        <span>只显示置顶贴纸</span>
        <Switch
          size="small"
          checked={settings.showPinnedOnly}
          onChange={(checked) => onChange({ showPinnedOnly: checked })}
        />
      </label>

      <label className="settings-slider">
        <span>透明度</span>
        <Slider
          min={0.35}
          max={1}
          step={0.05}
          value={settings.opacity}
          tooltip={{ formatter: (value) => `${Math.round((value ?? 0) * 100)}%` }}
          onChange={(value) => onChange({ opacity: value })}
        />
      </label>

      <label className="settings-slider">
        <span>字号</span>
        <Slider
          min={12}
          max={28}
          step={1}
          value={settings.fontSize}
          onChange={(value) => onChange({ fontSize: value })}
        />
      </label>
    </aside>
  );
}

interface SettingNumberProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function SettingNumber({ label, value, onChange }: SettingNumberProps) {
  const selectedOption = FIXED_OPTIONS.includes(value) ? String(value) : undefined;

  return (
    <div className="settings-row">
      <span>{label}</span>
      <div className="settings-number">
        <Segmented
          size="small"
          options={FIXED_OPTIONS.map((option) => ({ label: String(option), value: String(option) }))}
          value={selectedOption}
          onChange={(nextValue) => onChange(Number(nextValue))}
        />
        <InputNumber
          size="small"
          min={1}
          max={20}
          aria-label={`${label}自定义`}
          value={value}
          onChange={(nextValue) => {
            if (typeof nextValue === 'number') {
              onChange(nextValue);
            }
          }}
        />
      </div>
    </div>
  );
}

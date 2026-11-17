import { useEffect, useState } from 'react';
import { Button, Card, InputNumber, Segmented, Slider, Switch, Tag, Typography, message } from 'antd';
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  ReloadOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import {
  CALENDAR_UNPOSITIONED,
  MAX_CALENDAR_HEIGHT,
  MAX_CALENDAR_WIDTH,
  MIN_CALENDAR_HEIGHT,
  MIN_CALENDAR_WIDTH,
} from '../../../../../shared/desktop-calendar-state';
import type {
  CalendarTheme,
  CalendarTimeInfo,
  DesktopCalendarSettings,
  DesktopCalendarSnapshot,
} from '../../../../../shared/desktop-calendar-types';
import './index.less';

const { Text, Title } = Typography;
const POSITION_STEP = 20;

/** 说明网络时间与本机时间的差值，方便判断校时是否生效。 */
function describeOffset(offsetMs: number) {
  if (Math.abs(offsetMs) < 100) {
    return '与本机时间一致';
  }

  const seconds = (Math.abs(offsetMs) / 1000).toFixed(1);
  return offsetMs > 0 ? `比本机快 ${seconds} 秒` : `比本机慢 ${seconds} 秒`;
}

function describeTimeSource(info?: CalendarTimeInfo) {
  if (!info) {
    return '读取中';
  }

  if (info.source === 'local') {
    return '本机系统时间';
  }

  return `网络时间（${info.source === 'taobao' ? '淘宝' : '苏宁'}），${describeOffset(info.offsetMs)}`;
}

/**
 * 桌面日历管理页：开关、显示项、透明度、窗口尺寸与位置。
 */
export default function DesktopCalendarManager() {
  const [snapshot, setSnapshot] = useState<DesktopCalendarSnapshot>();
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [timeInfo, setTimeInfo] = useState<CalendarTimeInfo>();
  const apiAvailable = Boolean(window.desktopCalendar);

  useEffect(() => {
    const api = window.desktopCalendar;
    if (!api) {
      return;
    }

    let active = true;
    void api.getSnapshot().then((next) => {
      if (active) {
        setSnapshot(next);
      }
    });
    const stop = api.onSettingsChanged((settings) => {
      setSnapshot((current) => (current ? { ...current, settings } : current));
    });

    return () => {
      active = false;
      stop();
    };
  }, []);

  useEffect(() => {
    const api = window.desktopCalendar;
    if (!api) {
      return;
    }

    let active = true;
    const refresh = () => {
      void api.getTime().then((info) => {
        if (active) {
          setTimeInfo(info);
        }
      });
    };

    refresh();
    const timer = window.setInterval(refresh, 30 * 1000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  async function syncTime() {
    const api = window.desktopCalendar;
    if (!api) {
      return;
    }

    setSyncing(true);
    try {
      const info = await api.syncTime();
      setTimeInfo(info);
      message.success(info.source === 'local' ? '网络校时失败，继续使用本机时间' : '已按网络时间校准');
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '网络校时失败');
    } finally {
      setSyncing(false);
    }
  }

  async function saveSettings(patch: Partial<DesktopCalendarSettings>) {
    const api = window.desktopCalendar;
    if (!api || !snapshot) {
      return;
    }

    setSaving(true);
    try {
      setSnapshot(await api.saveSettings({ ...snapshot.settings, ...patch }));
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '保存日历设置失败');
    } finally {
      setSaving(false);
    }
  }

  function updateDraft(patch: Partial<DesktopCalendarSettings>) {
    setSnapshot((current) => (current ? { ...current, settings: { ...current.settings, ...patch } } : current));
  }

  function nudge(dx: number, dy: number) {
    if (!snapshot) {
      return;
    }

    void saveSettings({ x: snapshot.bounds.x + dx, y: snapshot.bounds.y + dy });
  }

  const settings = snapshot?.settings;

  return (
    <section className="desktop-calendar-manager">
      <header className="desktop-calendar-manager__header">
        <div className="desktop-calendar-manager__heading">
          <div className="desktop-calendar-manager__title-row">
            <Title level={5} className="desktop-calendar-manager__title">
              桌面日历
            </Title>
            <Tag color={snapshot?.windowOpen ? 'success' : 'default'}>
              {snapshot?.windowOpen ? '已显示' : '已隐藏'}
            </Tag>
          </div>
          <Text type="secondary">纯展示窗口，点击穿透、不抢焦点，其他窗口会盖住它。</Text>
        </div>
      </header>

      <Card size="small" title="运行">
        <div className="desktop-calendar-manager__runtime">
          <div className="desktop-calendar-manager__item">
            <div className="desktop-calendar-manager__item-text">
              <Text strong>在桌面显示日历</Text>
              <Text type="secondary" className="desktop-calendar-manager__hint">
                关闭后窗口隐藏，设置会保留。
              </Text>
            </div>
            <Switch
              checked={settings?.enabled ?? false}
              loading={saving}
              disabled={!apiAvailable}
              onChange={(checked) => void saveSettings({ enabled: checked })}
            />
          </div>

          <div className="desktop-calendar-manager__item">
            <div className="desktop-calendar-manager__item-text">
              <Text strong>时间源</Text>
              <Text type="secondary" className="desktop-calendar-manager__hint">
                {describeTimeSource(timeInfo)}
              </Text>
            </div>
            <Button
              size="small"
              icon={<SyncOutlined />}
              loading={syncing}
              disabled={!apiAvailable}
              onClick={() => void syncTime()}
            >
              立即校时
            </Button>
          </div>
        </div>
      </Card>

      <Card size="small" title="显示">
        <div className="desktop-calendar-manager__switches">
          <label className="desktop-calendar-manager__switch">
            <span>农历</span>
            <Switch
              size="small"
              checked={settings?.showLunar ?? true}
              disabled={!apiAvailable}
              onChange={(checked) => void saveSettings({ showLunar: checked })}
            />
          </label>
          <label className="desktop-calendar-manager__switch">
            <span>节气</span>
            <Switch
              size="small"
              checked={settings?.showSolarTerms ?? true}
              disabled={!apiAvailable}
              onChange={(checked) => void saveSettings({ showSolarTerms: checked })}
            />
          </label>
          <label className="desktop-calendar-manager__switch">
            <span>节日</span>
            <Switch
              size="small"
              checked={settings?.showFestivals ?? true}
              disabled={!apiAvailable}
              onChange={(checked) => void saveSettings({ showFestivals: checked })}
            />
          </label>
          <label className="desktop-calendar-manager__switch">
            <span>休班标记</span>
            <Switch
              size="small"
              checked={settings?.showHolidayMarks ?? true}
              disabled={!apiAvailable}
              onChange={(checked) => void saveSettings({ showHolidayMarks: checked })}
            />
          </label>
        </div>

        <div className="desktop-calendar-manager__slider-row">
          <Text className="desktop-calendar-manager__slider-label">背景不透明度</Text>
          <Slider
            className="desktop-calendar-manager__slider"
            min={0}
            max={1}
            step={0.02}
            value={settings?.opacity}
            disabled={!apiAvailable}
            onChange={(value) => updateDraft({ opacity: value })}
            onChangeComplete={(value) => void saveSettings({ opacity: value })}
          />
          <Text className="desktop-calendar-manager__slider-value">
            {settings ? `${Math.round(settings.opacity * 100)}%` : '-'}
          </Text>
        </div>

        <div className="desktop-calendar-manager__theme-row">
          <Text className="desktop-calendar-manager__slider-label">主题</Text>
          <Segmented
            size="small"
            options={[
              { label: '浅色', value: 'light' },
              { label: '深色', value: 'dark' },
            ]}
            value={settings?.theme ?? 'light'}
            disabled={!apiAvailable}
            onChange={(value) => void saveSettings({ theme: value as CalendarTheme })}
          />
        </div>
      </Card>

      <Card size="small" title="窗口">
        <div className="desktop-calendar-manager__window">
          <div className="desktop-calendar-manager__window-fields">
            <label className="desktop-calendar-manager__field">
              <span>宽度</span>
              <InputNumber
                size="small"
                min={MIN_CALENDAR_WIDTH}
                max={MAX_CALENDAR_WIDTH}
                value={settings?.width}
                disabled={!apiAvailable}
                onChange={(value) => updateDraft({ width: value ?? MIN_CALENDAR_WIDTH })}
                onBlur={() => settings && void saveSettings({ width: settings.width })}
              />
            </label>
            <label className="desktop-calendar-manager__field">
              <span>高度</span>
              <InputNumber
                size="small"
                min={MIN_CALENDAR_HEIGHT}
                max={MAX_CALENDAR_HEIGHT}
                value={settings?.height}
                disabled={!apiAvailable}
                onChange={(value) => updateDraft({ height: value ?? MIN_CALENDAR_HEIGHT })}
                onBlur={() => settings && void saveSettings({ height: settings.height })}
              />
            </label>
            <div className="desktop-calendar-manager__coord">
              <span>当前位置</span>
              <Text className="desktop-calendar-manager__coord-value">
                {snapshot ? `${snapshot.bounds.x}, ${snapshot.bounds.y}` : '-'}
              </Text>
            </div>
          </div>

          <div className="desktop-calendar-manager__dpad" aria-label="窗口位置">
            <span />
            <Button
              size="small"
              icon={<ArrowUpOutlined />}
              aria-label="上移"
              disabled={!apiAvailable}
              onClick={() => nudge(0, -POSITION_STEP)}
            />
            <span />
            <Button
              size="small"
              icon={<ArrowLeftOutlined />}
              aria-label="左移"
              disabled={!apiAvailable}
              onClick={() => nudge(-POSITION_STEP, 0)}
            />
            <Button
              size="small"
              icon={<ReloadOutlined />}
              aria-label="恢复右侧居中"
              title="恢复右侧居中"
              disabled={!apiAvailable}
              onClick={() => void saveSettings({ x: CALENDAR_UNPOSITIONED, y: CALENDAR_UNPOSITIONED })}
            />
            <Button
              size="small"
              icon={<ArrowRightOutlined />}
              aria-label="右移"
              disabled={!apiAvailable}
              onClick={() => nudge(POSITION_STEP, 0)}
            />
            <span />
            <Button
              size="small"
              icon={<ArrowDownOutlined />}
              aria-label="下移"
              disabled={!apiAvailable}
              onClick={() => nudge(0, POSITION_STEP)}
            />
            <span />
          </div>
        </div>

        <Text type="secondary" className="desktop-calendar-manager__hint">
          日历窗口不能拖动，请用方向键调整位置，中间按钮恢复默认的右侧居中。
        </Text>
      </Card>
    </section>
  );
}

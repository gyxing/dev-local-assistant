import type { DesktopCalendarSettings } from './desktop-calendar-types';

export const DEFAULT_CALENDAR_WIDTH = 560;
export const DEFAULT_CALENDAR_HEIGHT = 440;
export const DEFAULT_CALENDAR_OPACITY = 0.92;
export const MIN_CALENDAR_WIDTH = 360;
export const MAX_CALENDAR_WIDTH = 900;
export const MIN_CALENDAR_HEIGHT = 280;
export const MAX_CALENDAR_HEIGHT = 800;
/** 未定位标记，主进程见到它时按主屏右侧计算默认位置 */
export const CALENDAR_UNPOSITIONED = -1;

export const DEFAULT_DESKTOP_CALENDAR_SETTINGS: DesktopCalendarSettings = {
  enabled: false,
  width: DEFAULT_CALENDAR_WIDTH,
  height: DEFAULT_CALENDAR_HEIGHT,
  x: CALENDAR_UNPOSITIONED,
  y: CALENDAR_UNPOSITIONED,
  opacity: DEFAULT_CALENDAR_OPACITY,
  theme: 'light',
  showLunar: true,
  showSolarTerms: true,
  showFestivals: true,
  showHolidayMarks: true,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** 把外部传入的日历配置收敛到可用的范围，避免坏数据把窗口搞坏。 */
export function normalizeDesktopCalendarSettings(value: unknown): DesktopCalendarSettings {
  const record = (typeof value === 'object' && value !== null ? value : {}) as Partial<DesktopCalendarSettings>;

  return {
    enabled: record.enabled === true,
    width: Number.isFinite(record.width)
      ? Math.round(clamp(Number(record.width), MIN_CALENDAR_WIDTH, MAX_CALENDAR_WIDTH))
      : DEFAULT_CALENDAR_WIDTH,
    height: Number.isFinite(record.height)
      ? Math.round(clamp(Number(record.height), MIN_CALENDAR_HEIGHT, MAX_CALENDAR_HEIGHT))
      : DEFAULT_CALENDAR_HEIGHT,
    x: Number.isFinite(record.x) ? Math.round(Number(record.x)) : CALENDAR_UNPOSITIONED,
    y: Number.isFinite(record.y) ? Math.round(Number(record.y)) : CALENDAR_UNPOSITIONED,
    displayId: typeof record.displayId === 'string' ? record.displayId : undefined,
    opacity: Number.isFinite(record.opacity) ? clamp(Number(record.opacity), 0, 1) : DEFAULT_CALENDAR_OPACITY,
    theme: record.theme === 'dark' ? 'dark' : 'light',
    showLunar: record.showLunar !== false,
    showSolarTerms: record.showSolarTerms !== false,
    showFestivals: record.showFestivals !== false,
    showHolidayMarks: record.showHolidayMarks !== false,
  };
}

/** 日历配色主题。 */
export type CalendarTheme = 'light' | 'dark';

/** 桌面日历配置。窗口纯展示，所有设置都从主窗口的管理页修改。 */
export interface DesktopCalendarSettings {
  enabled: boolean;
  width: number;
  height: number;
  /** 窗口左上角坐标；-1 表示尚未定位，由主进程按主屏右侧计算默认位置 */
  x: number;
  y: number;
  /** 卡片背景不透明度，0 - 1，只影响背景不影响文字 */
  opacity: number;
  theme: CalendarTheme;
  showLunar: boolean;
  showSolarTerms: boolean;
  showFestivals: boolean;
  showHolidayMarks: boolean;
}

/** 某一天的法定节假日或调休信息。 */
export interface CalendarHolidayDay {
  /** 形如 2026-01-01 */
  date: string;
  name: string;
  /** true 表示放假，false 表示调休上班 */
  isOffDay: boolean;
}

/** 某一年的法定节假日数据，source 用于区分数据来自缓存还是网络。 */
export interface CalendarHolidayYear {
  year: number;
  days: CalendarHolidayDay[];
  source: 'cache' | 'network' | 'none';
}

/** 日历窗口位置与尺寸。 */
export interface DesktopCalendarBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 时间来源：淘宝、苏宁或本机系统时间。 */
export type CalendarTimeSource = 'taobao' | 'suning' | 'local';

/** 网络时间校准结果，offsetMs 为本机时间到服务端时间的偏移。 */
export interface CalendarTimeInfo {
  offsetMs: number;
  syncedAt?: number;
  source: CalendarTimeSource;
}

/** 日历窗口快照，主窗口管理页据此渲染。 */
export interface DesktopCalendarSnapshot {
  windowOpen: boolean;
  settings: DesktopCalendarSettings;
  /** 窗口当前实际位置，未打开时返回按设置算出的目标位置 */
  bounds: DesktopCalendarBounds;
}

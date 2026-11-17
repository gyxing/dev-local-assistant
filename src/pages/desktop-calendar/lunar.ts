import { Solar } from 'lunar-javascript';

/** 月历中一个格子的展示数据。 */
export interface CalendarDayCell {
  year: number;
  month: number;
  day: number;
  /** 是否属于当前显示的月份，前后补位日期为 false */
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  isoDate: string;
  /** 农历日；初一显示月份，其余显示日 */
  lunarText: string;
  /** 当天节气，没有则为空字符串 */
  solarTerm: string;
  /** 当天节日，公历节日与农历节日合并 */
  festivals: string[];
}

/** 某一天的完整信息，用于左侧时间栏。 */
export interface DayDetail {
  lunarText: string;
  ganzhiYear: string;
  shengxiao: string;
  solarTerm: string;
  festivals: string[];
}

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

const WEEKDAY_TEXT = ['日', '一', '二', '三', '四', '五', '六'];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function toIsoDate(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function getWeekdayText(date: Date) {
  return WEEKDAY_TEXT[date.getDay()];
}

/** 一次农历计算，同时拿到格子小字和详情需要的数据。 */
function describeSolarDay(year: number, month: number, day: number) {
  const solar = Solar.fromYmd(year, month, day);
  const lunar = solar.getLunar();
  const lunarDay = lunar.getDayInChinese();

  return {
    lunarMonth: lunar.getMonthInChinese(),
    lunarDay,
    lunarText: lunarDay === '初一' ? `${lunar.getMonthInChinese()}月` : lunarDay,
    solarTerm: lunar.getJieQi(),
    festivals: [...solar.getFestivals(), ...lunar.getFestivals()],
    ganzhiYear: lunar.getYearInGanZhi(),
    shengxiao: lunar.getYearShengXiao(),
  };
}

/** 当天详情，左侧时间栏用它显示农历、干支和节日。 */
export function describeDay(year: number, month: number, day: number): DayDetail {
  const info = describeSolarDay(year, month, day);

  return {
    lunarText: `${info.lunarMonth}月${info.lunarDay}`,
    ganzhiYear: info.ganzhiYear,
    shengxiao: info.shengxiao,
    solarTerm: info.solarTerm,
    festivals: info.festivals,
  };
}

/** 构建一个月的格子，按周一开头，前后补位日期标记为不在本月。 */
export function buildMonthCells(year: number, month: number, today: Date): CalendarDayCell[] {
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const todayIso = toIsoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());

  return Array.from({ length: cellCount }, (_, index) => {
    const offset = index - firstWeekday;
    const date = new Date(year, month - 1, 1 + offset);
    const cellYear = date.getFullYear();
    const cellMonth = date.getMonth() + 1;
    const cellDay = date.getDate();
    const info = describeSolarDay(cellYear, cellMonth, cellDay);
    const isoDate = toIsoDate(cellYear, cellMonth, cellDay);

    return {
      year: cellYear,
      month: cellMonth,
      day: cellDay,
      inMonth: cellYear === year && cellMonth === month,
      isToday: isoDate === todayIso,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isoDate,
      lunarText: info.lunarText,
      solarTerm: info.solarTerm,
      festivals: info.festivals,
    };
  });
}

import type { CalendarHolidayDay } from '../../../shared/desktop-calendar-types';

export interface HolidayInfo {
  name: string;
  /** true 为放假，false 为调休上班 */
  isOffDay: boolean;
}

/** 把接口返回的节假日数组转成按日期索引的 Map，方便格子渲染。 */
export function buildHolidayMap(days: CalendarHolidayDay[] | undefined): Map<string, HolidayInfo> {
  const map = new Map<string, HolidayInfo>();

  for (const day of days ?? []) {
    map.set(day.date, { name: day.name, isOffDay: day.isOffDay });
  }

  return map;
}

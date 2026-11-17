import fs from 'node:fs/promises';
import path from 'node:path';
import type { CalendarHolidayDay, CalendarHolidayYear } from '../../shared/desktop-calendar-types';

const CACHE_DIR_NAME = 'calendar-holidays';
/** 节假日数据只随国务院公告变化，缓存一周足够，过期后后台刷新 */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const HOLIDAY_SOURCES = [
  (year: number) => `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`,
  (year: number) => `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`,
];

interface HolidayCacheFile {
  fetchedAt: number;
  days: CalendarHolidayDay[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseDays(value: unknown): CalendarHolidayDay[] {
  if (!isRecord(value) || !Array.isArray(value.days)) {
    return [];
  }

  return value.days
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .filter(
      (item) =>
        typeof item.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
        typeof item.isOffDay === 'boolean',
    )
    .map((item) => ({
      date: item.date as string,
      name: typeof item.name === 'string' ? item.name : '',
      isOffDay: item.isOffDay as boolean,
    }));
}

/**
 * 按年获取法定节假日与调休数据：优先本地缓存，过期后从开源数据源刷新，全部失败时退回缓存。
 * 数据源：NateScarlet/holiday-cn（MIT，数据来自国务院公告）。
 */
export class HolidayService {
  private readonly cacheDir: string;

  constructor(userDataPath: string) {
    this.cacheDir = path.join(userDataPath, CACHE_DIR_NAME);
  }

  async getYear(year: number): Promise<CalendarHolidayYear> {
    const cached = await this.readCache(year);
    if (cached && Date.now() - cached.fetchedAt < CACHE_MAX_AGE_MS) {
      return { year, days: cached.days, source: 'cache' };
    }

    const fetched = await this.fetchYear(year);
    if (fetched) {
      await this.writeCache(year, fetched);
      return { year, days: fetched, source: 'network' };
    }

    if (cached) {
      return { year, days: cached.days, source: 'cache' };
    }

    return { year, days: [], source: 'none' };
  }

  private getCachePath(year: number) {
    return path.join(this.cacheDir, `${year}.json`);
  }

  private async readCache(year: number): Promise<HolidayCacheFile | undefined> {
    try {
      const content = await fs.readFile(this.getCachePath(year), 'utf8');
      const parsed: unknown = JSON.parse(content);
      if (!isRecord(parsed) || typeof parsed.fetchedAt !== 'number' || !Array.isArray(parsed.days)) {
        return undefined;
      }

      return { fetchedAt: parsed.fetchedAt, days: parseDays({ days: parsed.days }) };
    } catch {
      return undefined;
    }
  }

  private async writeCache(year: number, days: CalendarHolidayDay[]) {
    const cacheFile: HolidayCacheFile = { fetchedAt: Date.now(), days };
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      // 先写临时文件再改名，避免进程中断留下半个 JSON
      const tempPath = `${this.getCachePath(year)}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(cacheFile), 'utf8');
      await fs.rename(tempPath, this.getCachePath(year));
    } catch {
      // 缓存写入失败不影响当前这次展示
    }
  }

  private async fetchYear(year: number): Promise<CalendarHolidayDay[] | undefined> {
    for (const buildUrl of HOLIDAY_SOURCES) {
      try {
        const response = await fetch(buildUrl(year), { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!response.ok) {
          continue;
        }

        const days = parseDays(await response.json());
        if (days.length > 0) {
          return days;
        }
      } catch {
        // 单个源失败时继续尝试下一个
      }
    }

    return undefined;
  }
}

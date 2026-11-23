import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_DESKTOP_CALENDAR_SETTINGS } from '../../../shared/desktop-calendar-state';
import type {
  CalendarHolidayYear,
  DesktopCalendarSettings,
} from '../../../shared/desktop-calendar-types';
import CalendarGrid from './components/CalendarGrid';
import ClockPanel from './components/ClockPanel';
import { buildHolidayMap } from './holidays';
import './index.less';
import { buildMonthCells, describeDay, toIsoDate } from './lunar';

/**
 * 桌面日历透明窗口：左侧当前时间，右侧农历月历，纯展示、点击穿透。
 */
export default function DesktopCalendarPage() {
  const [now, setNow] = useState(() => new Date());
  const [settings, setSettings] = useState<DesktopCalendarSettings>(
    DEFAULT_DESKTOP_CALENDAR_SETTINGS,
  );
  const [holidayYear, setHolidayYear] = useState<CalendarHolidayYear>();
  /** 主进程校准出的「服务端时间 - 本机时间」，0 表示使用本机时间 */
  const offsetRef = useRef(0);

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const todayIso = toIsoDate(year, month, now.getDate());

  useEffect(() => {
    // 窗口是透明的，只在这个路由上清空页面背景，避免主窗口跟着变透明
    const style = document.createElement('style');
    style.textContent = `
      html, body, #root, #root > div {
        height: 100%;
        overflow: hidden;
        background: transparent !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, []);

  useEffect(() => {
    let timer: number;

    // 对齐到系统整秒再刷新，否则秒数跳变会比系统时钟晚最多 1 秒
    const tick = () => {
      const current = new Date(Date.now() + offsetRef.current);
      setNow(current);
      const delay = 1000 - (current.getTime() % 1000);
      timer = window.setTimeout(tick, delay > 0 ? delay : 1);
    };

    tick();

    return () => {
      window.clearTimeout(timer);
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
          offsetRef.current = info.offsetMs;
        }
      });
    };

    refresh();
    // 主进程每 10 分钟校准一次，这里定期取最新偏移，保证显示跟校准结果一致
    const timer = window.setInterval(refresh, 30 * 1000);
    // 手动校时后主进程会主动推送，日历立即切换
    const stop = api.onTimeChanged((info) => {
      offsetRef.current = info.offsetMs;
    });

    return () => {
      active = false;
      window.clearInterval(timer);
      stop();
    };
  }, []);

  useEffect(() => {
    const api = window.desktopCalendar;
    if (!api) {
      return;
    }

    let active = true;
    void api.getSnapshot().then((snapshot) => {
      if (active) {
        setSettings(snapshot.settings);
      }
    });
    const stop = api.onSettingsChanged(setSettings);

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
    void api.getHolidays(year).then((data) => {
      if (active) {
        setHolidayYear(data);
      }
    });

    return () => {
      active = false;
    };
  }, [year]);

  // todayIso 变化说明跨天了，需要重建月历高亮
  const cells = useMemo(
    () => buildMonthCells(year, month, now),
    [year, month, todayIso],
  );
  const detail = useMemo(
    () => describeDay(year, month, now.getDate()),
    [year, month, todayIso],
  );
  const holidayMap = useMemo(
    () => buildHolidayMap(holidayYear?.days),
    [holidayYear],
  );
  const monthFestival = settings.showFestivals
    ? detail.festivals[0]
    : undefined;

  return (
    // 不透明度只作用于卡片背景，文字始终不透明
    <main
      className={`desktop-calendar${settings.theme === 'dark' ? ' is-dark' : ''}`}
      style={{ '--calendar-opacity': settings.opacity } as CSSProperties}
    >
      <ClockPanel
        now={now}
        detail={detail}
        showFestivals={settings.showFestivals}
        showSolarTerms={settings.showSolarTerms}
      />

      <section className="desktop-calendar__month">
        <header className="desktop-calendar__month-title">
          <span className="desktop-calendar__month-label">
            {year} 年 {month} 月
          </span>
          {monthFestival ? (
            <span
              className="desktop-calendar__month-festival"
              title={monthFestival}
            >
              {monthFestival}
            </span>
          ) : null}
        </header>

        <CalendarGrid
          cells={cells}
          holidayMap={holidayMap}
          showLunar={settings.showLunar}
          showSolarTerms={settings.showSolarTerms}
          showFestivals={settings.showFestivals}
          showHolidayMarks={settings.showHolidayMarks}
        />
      </section>
    </main>
  );
}

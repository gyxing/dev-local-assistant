import type { DayDetail } from '../../lunar';
import { getWeekdayText } from '../../lunar';

interface ClockPanelProps {
  now: Date;
  detail: DayDetail;
  showFestivals: boolean;
  showSolarTerms: boolean;
}

function formatTime(date: Date) {
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, '0'))
    .join(':');
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 左侧时间栏：大号时间、星期胶囊、公历/农历/干支和节日节气标签。 */
export default function ClockPanel({ now, detail, showFestivals, showSolarTerms }: ClockPanelProps) {
  const time = formatTime(now);
  const mainTime = time.slice(0, 5);
  const seconds = time.slice(5);
  const festival = showFestivals ? detail.festivals[0] : undefined;
  const term = showSolarTerms ? detail.solarTerm : '';

  return (
    <aside className="desktop-calendar__clock">
      <div className="desktop-calendar__time">
        {mainTime}
        <span className="desktop-calendar__seconds">{seconds}</span>
      </div>
      <div className="desktop-calendar__clock-details">
        <div className="desktop-calendar__weekday">星期{getWeekdayText(now)}</div>
        <div className="desktop-calendar__date">{formatDate(now)}</div>
        <div className="desktop-calendar__lunar">农历 {detail.lunarText}</div>
        <div className="desktop-calendar__ganzhi">{detail.ganzhiYear}年 · {detail.shengxiao}</div>
      </div>

      {festival || term ? (
        <div className="desktop-calendar__badges">
          {festival ? <span className="desktop-calendar__badge">{festival}</span> : null}
          {term && term !== festival ? (
            <span className="desktop-calendar__badge desktop-calendar__badge--term">{term}</span>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}

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

/** 显示当前时刻、日期摘要及启用的节日节气。 */
export default function ClockPanel({ now, detail, showFestivals, showSolarTerms }: ClockPanelProps) {
  const time = formatTime(now);
  const date = formatDate(now);
  const mainTime = time.slice(0, 5);
  const seconds = time.slice(5);
  const festival = showFestivals ? detail.festivals[0] : undefined;
  const term = showSolarTerms ? detail.solarTerm : '';

  return (
    <aside className="desktop-calendar__clock">
      <time className="desktop-calendar__time" dateTime={time}>
        {mainTime}
        <span className="desktop-calendar__seconds">{seconds}</span>
      </time>
      <div className="desktop-calendar__accent" aria-hidden="true" />
      <div className="desktop-calendar__clock-details">
        <div className="desktop-calendar__gregorian">
          <span className="desktop-calendar__weekday">星期{getWeekdayText(now)}</span>
          <time className="desktop-calendar__date" dateTime={date}>{date}</time>
        </div>
        <div className="desktop-calendar__lunar-details">
          <span className="desktop-calendar__lunar">农历 {detail.lunarText}</span>
          <span className="desktop-calendar__ganzhi">{detail.ganzhiYear}年 · {detail.shengxiao}</span>
        </div>

        {festival || term ? (
          <div className="desktop-calendar__badges">
            {festival ? <span className="desktop-calendar__badge">{festival}</span> : null}
            {term && term !== festival ? (
              <span className="desktop-calendar__badge desktop-calendar__badge--term">{term}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

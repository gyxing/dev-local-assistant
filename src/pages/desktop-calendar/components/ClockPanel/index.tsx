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
export default function ClockPanel({
  now,
  detail,
  showFestivals,
  showSolarTerms,
}: ClockPanelProps) {
  const time = formatTime(now);
  const date = formatDate(now);
  // 时分拆成独立片段，冒号两侧才好单独留白
  const [hour, minute, second] = time.split(':');
  const festival = showFestivals ? detail.festivals[0] : undefined;
  const term = showSolarTerms ? detail.solarTerm : '';

  return (
    <aside className="desktop-calendar__clock">
      <time className="desktop-calendar__time" dateTime={time}>
        <span className="desktop-calendar__clock-face">
          <span className="desktop-calendar__hours">{hour}</span>
          <span className="desktop-calendar__colon">:</span>
          <span className="desktop-calendar__minutes">{minute}</span>
        </span>
        <span className="desktop-calendar__seconds desktop-calendar__colon2">
          :
        </span>
        <span className="desktop-calendar__seconds">{second}</span>
      </time>
      <div className="desktop-calendar__accent" aria-hidden="true" />
      <div className="desktop-calendar__clock-details">
        <div className="desktop-calendar__gregorian">
          <span className="desktop-calendar__weekday">
            星期{getWeekdayText(now)}
          </span>
          <time className="desktop-calendar__date" dateTime={date}>
            {now.getMonth() + 1}{' '}
            <span className="desktop-calendar__date-unit">月</span>{' '}
            {now.getDate()}{' '}
            <span className="desktop-calendar__date-unit">日</span>
          </time>
        </div>
        <div className="desktop-calendar__lunar-details">
          <span className="desktop-calendar__lunar">
            <span className="desktop-calendar__lunar-prefix">农历</span>{' '}
            {detail.lunarText}
          </span>
          <span className="desktop-calendar__ganzhi">
            {detail.ganzhiYear}年 · {detail.shengxiao}
          </span>
        </div>

        {festival || term ? (
          <div className="desktop-calendar__badges">
            {festival ? (
              <span className="desktop-calendar__badge">{festival}</span>
            ) : null}
            {term && term !== festival ? (
              <span className="desktop-calendar__badge desktop-calendar__badge--term">
                {term}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

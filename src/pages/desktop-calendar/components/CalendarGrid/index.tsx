import type { HolidayInfo } from '../../holidays';
import type { CalendarDayCell } from '../../lunar';
import { WEEKDAY_LABELS } from '../../lunar';

interface CalendarGridProps {
  cells: CalendarDayCell[];
  holidayMap: Map<string, HolidayInfo>;
  showLunar: boolean;
  showSolarTerms: boolean;
  showFestivals: boolean;
  showHolidayMarks: boolean;
}

/** 月历网格：7 列，格子里是公历日、农历/节日小字和休班角标。 */
export default function CalendarGrid({
  cells,
  holidayMap,
  showLunar,
  showSolarTerms,
  showFestivals,
  showHolidayMarks,
}: CalendarGridProps) {
  return (
    <div className="desktop-calendar__grid">
      {WEEKDAY_LABELS.map((label) => (
        <div key={label} className={`desktop-calendar__weekday-cell${label === '六' || label === '日' ? ' is-weekend' : ''}`}>
          {label}
        </div>
      ))}

      {cells.map((cell) => {
        const holiday = holidayMap.get(cell.isoDate);
        const festival = showFestivals ? cell.festivals[0] : undefined;
        const solarTerm = showSolarTerms ? cell.solarTerm : '';
        // 有节日或节气时优先显示，农历小字作为其余日期的补充。
        const event = festival ?? solarTerm;
        const subText = event || (showLunar ? cell.lunarText : '');

        return (
          <div
            key={cell.isoDate}
            aria-current={cell.isToday ? 'date' : undefined}
            className={[
              'desktop-calendar__day',
              cell.inMonth ? '' : 'is-outside',
              cell.isToday ? 'is-today' : '',
              cell.isWeekend ? 'is-weekend' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="desktop-calendar__day-number">{cell.day}</span>
            {subText ? (
              <span className={`desktop-calendar__day-sub${event ? ' is-event' : ''}`} title={subText}>{subText}</span>
            ) : null}
            {showHolidayMarks && holiday ? (
              <span
                className={`desktop-calendar__mark${holiday.isOffDay ? ' is-off' : ' is-work'}`}
                aria-label={holiday.isOffDay ? '休息日' : '补班日'}
              >
                {holiday.isOffDay ? '休' : '班'}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

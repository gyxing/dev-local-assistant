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
        <div key={label} className="desktop-calendar__weekday-cell">
          {label}
        </div>
      ))}

      {cells.map((cell) => {
        const holiday = holidayMap.get(cell.isoDate);
        const festival = showFestivals ? cell.festivals[0] : undefined;
        const solarTerm = showSolarTerms ? cell.solarTerm : '';
        const subText = festival ?? (solarTerm || (showLunar ? cell.lunarText : ''));

        return (
          <div
            key={cell.isoDate}
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
            {subText ? <span className="desktop-calendar__day-sub">{subText}</span> : null}
            {showHolidayMarks && holiday ? (
              <span className={`desktop-calendar__mark${holiday.isOffDay ? ' is-off' : ' is-work'}`}>
                {holiday.isOffDay ? '休' : '班'}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

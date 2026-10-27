import { useMemo, useState } from 'react';

const LEVELS = [0, 1, 2, 4, 6]; // lower bound of each colour step
const levelOf = (count) => LEVELS.reduce((lvl, min, i) => (count >= min ? i : lvl), 0);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** GitHub-style activity grid: one column per week, one row per weekday, one blue ramp. */
export default function Heatmap({ days }) {
  const [hover, setHover] = useState(null);

  const weeks = useMemo(() => {
    const out = [];
    // Pad the first column so rows line up with weekdays (Sunday on top).
    const firstDow = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
    let week = Array(firstDow).fill(null);
    for (const d of days) {
      week.push(d);
      if (week.length === 7) {
        out.push(week);
        week = [];
      }
    }
    if (week.length) out.push(week);
    return out;
  }, [days]);

  const total = days.reduce((s, d) => s + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;

  return (
    <div className="heatmap">
      <div className="heatmap-scroll">
        <div className="heatmap-months" aria-hidden>
          {weeks.map((w, i) => {
            const first = w.find(Boolean);
            const show = first && Number(first.date.slice(8)) <= 7;
            return <span key={i}>{show ? MONTHS[Number(first.date.slice(5, 7)) - 1] : ''}</span>;
          })}
        </div>
        <div className="heatmap-grid" role="img" aria-label={`${total} problems over ${activeDays} active days in the last year`}>
          {weeks.map((w, i) => (
            <div className="heatmap-col" key={i}>
              {w.map((d, j) =>
                d ? (
                  <span
                    key={j}
                    className={`cell l${levelOf(d.count)}`}
                    onMouseEnter={() => setHover(d)}
                    onMouseLeave={() => setHover(null)}
                    title={`${d.count} on ${d.date}`}
                  />
                ) : (
                  <span key={j} className="cell blank" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="heatmap-footer">
        <span className="muted">
          {hover
            ? `${hover.count} problem${hover.count === 1 ? '' : 's'} on ${new Date(`${hover.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`
            : `${total} problems · ${activeDays} active days in the last year`}
        </span>
        <span className="heatmap-legend muted" aria-hidden>
          Less {LEVELS.map((_, i) => <span key={i} className={`cell l${i}`} />)} More
        </span>
      </div>
    </div>
  );
}

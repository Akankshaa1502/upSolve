import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { platformName } from '../hooks.js';

function PlatformTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="tt-title">{p.name}</div>
      <div className="tt-row"><span><i className="swatch" style={{ background: 'var(--series-1)' }} />Solved</span><b>{p.solved}</b></div>
      <div className="tt-row"><span><i className="swatch" style={{ background: 'var(--series-2)' }} />Not solved yet</span><b>{p.unsolved}</b></div>
      <div className="tt-row"><span>Total</span><b>{p.total}</b></div>
    </div>
  );
}

/** Distinct problems per platform, stacked solved / not yet solved. */
export default function PlatformChart({ platforms }) {
  if (!platforms.length) return <p className="muted empty">No problems yet.</p>;
  const data = platforms.map((p) => ({ ...p, name: platformName(p.platform) }));
  return (
    <>
      <div className="legend" aria-hidden>
        <span><i className="swatch" style={{ background: 'var(--series-1)' }} />Solved</span>
        <span><i className="swatch" style={{ background: 'var(--series-2)' }} />Not solved yet</span>
      </div>
      <div style={{ width: '100%', height: data.length * 44 + 36 }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
            <CartesianGrid horizontal={false} stroke="var(--grid)" />
            <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip content={<PlatformTooltip />} cursor={{ fill: 'var(--hover-wash)' }} />
            {/* 2px surface stroke = the gap between stacked segments */}
            <Bar dataKey="solved" stackId="a" fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="unsolved" stackId="a" fill="var(--series-2)" stroke="var(--surface)" strokeWidth={2} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

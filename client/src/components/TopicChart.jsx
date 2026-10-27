import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { relativeDays } from '../hooks.js';

function TopicTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const t = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="tt-title">{t.topic}</div>
      <div className="tt-row"><span>Strength</span><b>{t.strength}</b></div>
      <div className="tt-row"><span>Solved</span><b>{t.solved} / {t.attempts}</b></div>
      <div className="tt-row"><span>Failed attempts</span><b>{t.failedAttempts}</b></div>
      <div className="tt-row"><span>Last practiced</span><b>{t.lastPracticed ? relativeDays(t.lastPracticed) : 'never'}</b></div>
    </div>
  );
}

/**
 * Topic strength = 100 − weakness score, for the most-practised topics, weakest at the top.
 * One series, so no legend: the card title names it.
 */
export default function TopicChart({ topics, max = 12 }) {
  const data = [...topics]
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, max)
    .map((t) => ({ ...t, strength: Math.round((100 - t.weakness) * 10) / 10 }))
    .sort((a, b) => a.strength - b.strength);

  if (!data.length) return <p className="muted empty">Log or sync a few tagged problems to see topic strength.</p>;

  return (
    <div style={{ width: '100%', height: Math.max(180, data.length * 30 + 40) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="var(--grid)" />
          <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--axis)' }} tickLine={false} />
          <YAxis type="category" dataKey="topic" width={130} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip content={<TopicTooltip />} cursor={{ fill: 'var(--hover-wash)' }} />
          <Bar dataKey="strength" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

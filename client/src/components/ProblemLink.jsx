import { platformName } from '../hooks.js';

export function PlatformBadge({ platform }) {
  return <span className={`badge platform p-${platform}`}>{platformName(platform)}</span>;
}

export function DifficultyBadge({ problem }) {
  if (!problem?.difficultyLabel && problem?.rating == null) return null;
  const label = problem.difficultyLabel && Number.isNaN(Number(problem.difficultyLabel))
    ? `${problem.difficultyLabel}${problem.rating ? ` ≈${problem.rating}` : ''}`
    : problem.rating ?? problem.difficultyLabel;
  return <span className="badge subtle">{label}</span>;
}

export default function ProblemLink({ problem }) {
  if (!problem) return <span className="muted">(deleted problem)</span>;
  return problem.url ? (
    <a href={problem.url} target="_blank" rel="noreferrer noopener" className="problem-title">{problem.title}</a>
  ) : (
    <span className="problem-title">{problem.title}</span>
  );
}

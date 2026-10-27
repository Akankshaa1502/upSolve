import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

/** Loads an API resource; returns { data, error, loading, reload }. */
export function useApi(path, query) {
  const key = JSON.stringify([path, query]);
  const [state, setState] = useState({ data: null, error: null, loading: true });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path, { query });
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState({ data: null, error, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

export const PLATFORM_NAMES = { codeforces: 'Codeforces', leetcode: 'LeetCode', atcoder: 'AtCoder', cses: 'CSES', demo: 'Demo' };
export const platformName = (p) => PLATFORM_NAMES[p] || (p ? p[0].toUpperCase() + p.slice(1) : '');

export const STATUS_LABELS = { solved: 'Solved', attempted: 'Attempted', gave_up: 'Gave up' };

export function formatDate(d) {
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeDays(d) {
  const days = Math.round((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { mergeCatalogWithLive, mergeFixtureWithLive } from '../src/fixtureLive.js';

export const LIVE_SCORES_POLL_MS = 60_000;

export function useLiveScores({ fixtureId = null, enabled = true } = {}) {
  const [liveById, setLiveById] = useState({});
  const [polledAt, setPolledAt] = useState(null);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || inFlight.current) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    inFlight.current = true;
    try {
      const qs = fixtureId ? `?fixtureId=${encodeURIComponent(fixtureId)}` : '';
      const res = await fetch(`/api/live-scores${qs}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Live scores failed');
      setLiveById(json.fixtures ?? {});
      setPolledAt(json.polledAt ?? null);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      inFlight.current = false;
    }
  }, [enabled, fixtureId]);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const id = setInterval(refresh, LIVE_SCORES_POLL_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  return { liveById, polledAt, error, refresh };
}

export function useLiveFixture(baseFixture, options = {}) {
  const fixtureId = baseFixture?.id ?? null;
  const { liveById } = useLiveScores({ fixtureId, enabled: Boolean(fixtureId), ...options });

  if (!baseFixture?.id) return baseFixture;
  const live = liveById[baseFixture.id];
  return live ? mergeFixtureWithLive(baseFixture, live) : baseFixture;
}

export function useLiveCatalog(baseCatalog, options = {}) {
  const { liveById, polledAt, error, refresh } = useLiveScores({
    enabled: Boolean(baseCatalog),
    ...options
  });

  const catalog = baseCatalog ? mergeCatalogWithLive(baseCatalog, liveById) : baseCatalog;
  return { catalog, liveById, polledAt, error, refresh };
}

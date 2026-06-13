'use client';

import { useEffect, useState } from 'react';
import PlayersPanel from '../../../components/PlayersPanel';
import { useLiveFixture } from '../../../hooks/useLiveScores.js';
import { readStoredFixtureSelection, readStoredPrediction } from '../../../src/fixtureSelection.js';
import { getFixtureById } from '../../../src/fixturesCatalog.js';

export default function PlayersPage() {
  const [baseFixture, setBaseFixture] = useState(null);
  const [ready, setReady] = useState(false);
  const fixture = useLiveFixture(baseFixture);

  useEffect(() => {
    const { fixtureId } = readStoredFixtureSelection();
    const prediction = readStoredPrediction();
    const selected = fixtureId ? getFixtureById(fixtureId) : null;
    const synced =
      prediction?.fixture?.id === fixtureId ? prediction.fixture : selected;
    setBaseFixture(synced);
    setReady(true);
  }, []);

  if (!ready) return null;

  return <PlayersPanel fixture={fixture} />;
}

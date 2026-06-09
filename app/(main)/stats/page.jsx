'use client';

import { useEffect, useState } from 'react';
import StatsPanel from '../../../components/StatsPanel';
import { readStoredFixtureSelection, readStoredPrediction } from '../../../src/fixtureSelection.js';
import { getFixtureById } from '../../../src/fixturesCatalog.js';

export default function StatsPage() {
  const [fixture, setFixture] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { fixtureId } = readStoredFixtureSelection();
    const prediction = readStoredPrediction();
    const selected = fixtureId ? getFixtureById(fixtureId) : null;
    const synced =
      prediction?.fixture?.id === fixtureId ? prediction.fixture : selected;
    setFixture(synced);
    setReady(true);
  }, []);

  if (!ready) return null;

  return <StatsPanel fixture={fixture} />;
}

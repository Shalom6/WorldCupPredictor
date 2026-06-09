'use client';

import { useEffect, useState } from 'react';
import { readStoredFixtureSelection, writeStoredFixtureSelection } from '../src/fixtureSelection.js';

export function useFixtureSelection() {
  const [group, setGroup] = useState('A');
  const [fixtureId, setFixtureId] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = readStoredFixtureSelection();
    setGroup(stored.group);
    setFixtureId(stored.fixtureId);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    writeStoredFixtureSelection(group, fixtureId);
  }, [group, fixtureId, ready]);

  return { group, setGroup, fixtureId, setFixtureId, ready };
}

'use client';

import PredictionsPanel from '../../../components/PredictionsPanel';
import { useFixtureSelection } from '../../../hooks/useFixtureSelection';
import { writeStoredPrediction } from '../../../src/fixtureSelection.js';

export default function PredictionsPage() {
  const { group, setGroup, fixtureId, setFixtureId, ready } = useFixtureSelection();

  function handlePredictionUpdate(prediction) {
    writeStoredPrediction(prediction);
  }

  if (!ready) return null;

  return (
    <PredictionsPanel
      onPredictionUpdate={handlePredictionUpdate}
      group={group}
      setGroup={setGroup}
      fixtureId={fixtureId}
      setFixtureId={setFixtureId}
    />
  );
}

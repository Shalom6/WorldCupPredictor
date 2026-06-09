'use client';

import { useEffect, useState } from 'react';
import AnalystPanel from '../../../components/AnalystPanel';
import { readStoredPrediction } from '../../../src/fixtureSelection.js';

export default function AnalystPage() {
  const [prediction, setPrediction] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrediction(readStoredPrediction());
    setReady(true);
  }, []);

  if (!ready) return null;

  return <AnalystPanel prediction={prediction} />;
}

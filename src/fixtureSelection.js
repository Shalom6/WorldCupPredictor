const GROUP_KEY = 'wc-group';
const FIXTURE_KEY = 'wc-fixture-id';
const PREDICTION_KEY = 'wc-prediction';

export function readStoredFixtureSelection() {
  if (typeof window === 'undefined') return { group: 'A', fixtureId: '' };
  try {
    return {
      group: sessionStorage.getItem(GROUP_KEY) || 'A',
      fixtureId: sessionStorage.getItem(FIXTURE_KEY) || ''
    };
  } catch {
    return { group: 'A', fixtureId: '' };
  }
}

export function writeStoredFixtureSelection(group, fixtureId) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(GROUP_KEY, group);
    sessionStorage.setItem(FIXTURE_KEY, fixtureId);
  } catch {
    // ignore quota / private mode
  }
}

export function readStoredPrediction() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PREDICTION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeStoredPrediction(prediction) {
  if (typeof window === 'undefined' || !prediction) return;
  try {
    sessionStorage.setItem(PREDICTION_KEY, JSON.stringify(prediction));
  } catch {
    // ignore quota / private mode
  }
}

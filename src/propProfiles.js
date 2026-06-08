function positionKind(position) {
  const pos = String(position ?? '').toLowerCase();
  if (pos.includes('attack') || pos.includes('forward')) return 'attack';
  if (pos.includes('def')) return 'def';
  if (pos.includes('mid')) return 'mid';
  return 'mid';
}

function round(n, dp = 3) {
  const p = 10 ** dp;
  return Math.round(n * p) / p;
}

/**
 * Default per-player prop weights from position + xgShare.
 * Roster JSON may override via propProfile.
 */
export function derivePropProfile(player) {
  const xg = player?.xgShare ?? 0.05;
  const kind = positionKind(player?.position);

  if (kind === 'attack') {
    return {
      shotsShare: round(xg * 2.4 + 0.05),
      sotShare: round(xg * 2.6 + 0.04),
      cardWeight: round(0.06 + xg * 0.15),
      foulWeight: round(0.065 + xg * 0.1)
    };
  }
  if (kind === 'def') {
    return {
      shotsShare: round(xg * 0.75 + 0.035),
      sotShare: round(xg * 0.5 + 0.025),
      cardWeight: round(0.12 + xg * 0.3),
      foulWeight: round(0.11 + xg * 0.15)
    };
  }
  return {
    shotsShare: round(xg * 1.35 + 0.07),
    sotShare: round(xg * 1.2 + 0.05),
    cardWeight: round(0.09 + xg * 0.2),
    foulWeight: round(0.095 + xg * 0.12)
  };
}

export function resolvePropProfile(player) {
  const derived = derivePropProfile(player);
  const override = player?.propProfile ?? {};
  return {
    shotsShare: override.shotsShare ?? derived.shotsShare,
    sotShare: override.sotShare ?? derived.sotShare,
    cardWeight: override.cardWeight ?? derived.cardWeight,
    foulWeight: override.foulWeight ?? derived.foulWeight
  };
}

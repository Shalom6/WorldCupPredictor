'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const POLYMARKET_POLL_MS = 120_000;
const STAGES = [{ id: 'group', label: 'Group Stage' }, { id: 'knockout', label: 'Knockouts' }];

function pct(n) {
  return typeof n === 'number' ? `${n.toFixed(1)}%` : '—';
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function ProbBar({ home, draw, away }) {
  return (
    <div className="probBar" aria-label="Win probability bar">
      <div className="seg home" style={{ width: `${clamp(home ?? 0, 0, 100)}%` }} />
      <div className="seg draw" style={{ width: `${clamp(draw ?? 0, 0, 100)}%` }} />
      <div className="seg away" style={{ width: `${clamp(away ?? 0, 0, 100)}%` }} />
    </div>
  );
}

function TrophyBar({ home, away, homeName, awayName }) {
  const h = clamp(home ?? 0, 0, 100);
  const a = clamp(away ?? 0, 0, 100);
  const denom = h + a || 1;
  return (
    <div className="probBar trophyBar" aria-label="To advance probability bar">
      <div className="seg home" style={{ width: `${(h / denom) * 100}%` }} title={homeName} />
      <div className="seg away" style={{ width: `${(a / denom) * 100}%` }} title={awayName} />
    </div>
  );
}

function ProbRow({ label, p, homeName, awayName }) {
  if (!p) return null;
  return (
    <div className="sourceBlock">
      <div className="sourceLabel">{label}</div>
      <div className="triple compact">
        <div className="pill">
          <div className="pillLabel">{homeName}</div>
          <div className="pillValue smallVal">{pct(p.homeWin)}</div>
        </div>
        <div className="pill">
          <div className="pillLabel">Draw</div>
          <div className="pillValue smallVal">{pct(p.draw)}</div>
        </div>
        <div className="pill">
          <div className="pillLabel">{awayName}</div>
          <div className="pillValue smallVal">{pct(p.awayWin)}</div>
        </div>
      </div>
    </div>
  );
}

function formatFixtureLabel(f) {
  return `${f.homeTeam} vs ${f.awayTeam} · MD${f.matchday}`;
}

export default function PredictionsPanel({ onPredictionUpdate }) {
  const [catalog, setCatalog] = useState(null);
  const [stageTab, setStageTab] = useState('group');
  const [group, setGroup] = useState('A');
  const [fixtureId, setFixtureId] = useState('');
  const [neutralVenue, setNeutralVenue] = useState(false);
  const [liveMarket, setLiveMarket] = useState(true);
  const [loading, setLoading] = useState(false);
  const [marketRefreshing, setMarketRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const groupFixtures = useMemo(() => {
    if (!catalog?.groupStage) return [];
    return catalog.groupStage.filter((f) => f.group === group);
  }, [catalog, group]);

  const knockoutFixtures = catalog?.knockout ?? [];
  const activeFixtures = stageTab === 'group' ? groupFixtures : knockoutFixtures;

  const selectedFixture = useMemo(() => {
    if (!fixtureId) return activeFixtures[0] ?? null;
    return activeFixtures.find((f) => f.id === fixtureId) ?? activeFixtures[0] ?? null;
  }, [activeFixtures, fixtureId]);

  const homeTeam = selectedFixture?.homeTeam ?? '';
  const awayTeam = selectedFixture?.awayTeam ?? '';
  const validTeams = homeTeam && awayTeam && homeTeam !== awayTeam;
  const isKnockout = stageTab === 'knockout';

  const subtitle = useMemo(() => {
    if (!data?.fixture) {
      return selectedFixture
        ? `FIFA World Cup 2026 · Group ${group} · ${selectedFixture.venueCity}`
        : 'FIFA World Cup 2026 · Group Stage';
    }
    const f = data.fixture;
    const groupPart = f.group ? ` · Group ${f.group}` : '';
    return `${f.competition} · ${f.stage}${groupPart} · ${f.venueCity} · ${f.date}`;
  }, [data, group, selectedFixture]);

  useEffect(() => {
    fetch('/api/fixtures')
      .then((r) => r.json())
      .then((json) => {
        setCatalog(json);
        const first = json.groupStage?.find((f) => f.group === 'A');
        if (first) setFixtureId(first.id);
      })
      .catch(() => setError('Could not load fixtures catalog'));
  }, []);

  useEffect(() => {
    const first = activeFixtures[0];
    if (first && !activeFixtures.some((f) => f.id === fixtureId)) {
      setFixtureId(first.id);
    }
  }, [activeFixtures, fixtureId]);

  async function load() {
    if (!validTeams || !selectedFixture) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixtureId: selectedFixture.id,
          homeTeam,
          awayTeam,
          neutralVenue: selectedFixture.neutralVenue ?? neutralVenue,
          stage: selectedFixture.stage,
          group: selectedFixture.group
        })
      });

      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('Server returned invalid JSON. Run npm run dev and refresh.');
      }

      if (!res.ok) throw new Error(json?.error || json?.detail || 'Failed to load predictions');
      if (json.polymarket?.dataApiNote) delete json.polymarket.dataApiNote;
      setData(json);
      setMarketUpdatedAt(json.marketUpdatedAt ? Date.parse(json.marketUpdatedAt) : Date.now());
      onPredictionUpdate?.(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const refreshMarket = useCallback(async () => {
    if (!validTeams || !data?.modelProbabilities || !data?.model?.lambda) return;

    setMarketRefreshing(true);
    try {
      const res = await fetch('/api/predictions/market', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam,
          awayTeam,
          fixture: data.fixture,
          modelProbabilities: data.modelProbabilities,
          model: data.model,
          blend: data.blend,
          statsBlend: data.statsBlend,
          marketProbabilities: data.marketProbabilities
        })
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || json?.detail || 'Market refresh failed');
      if (json.marketRefreshSkipped) return;

      setData((prev) => {
        const next = {
          ...prev,
          ...json,
          polymarket: json.polymarket
            ? { ...json.polymarket, dataApiNote: undefined }
            : prev.polymarket
        };
        onPredictionUpdate?.(next);
        return next;
      });
      setMarketUpdatedAt(Date.parse(json.marketUpdatedAt ?? json.updatedAt) || Date.now());
    } catch {
      // Background poll — keep last good values
    } finally {
      setMarketRefreshing(false);
    }
  }, [awayTeam, data, homeTeam, onPredictionUpdate, validTeams]);

  useEffect(() => {
    if (selectedFixture?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFixture?.id]);

  useEffect(() => {
    if (!liveMarket || !data?.marketProbabilities || !validTeams) return undefined;

    const poll = () => {
      if (document.visibilityState === 'visible') refreshMarket();
    };

    const interval = setInterval(poll, POLYMARKET_POLL_MS);
    return () => clearInterval(interval);
  }, [liveMarket, data?.marketProbabilities, validTeams, refreshMarket, homeTeam, awayTeam]);

  useEffect(() => {
    if (!liveMarket || !marketUpdatedAt) return undefined;
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [liveMarket, marketUpdatedAt]);

  const marketAgeLabel = useMemo(() => {
    if (!marketUpdatedAt) return null;
    const secs = Math.max(0, Math.floor((nowTick - marketUpdatedAt) / 1000));
    if (secs < 5) return 'just now';
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ago`;
  }, [marketUpdatedAt, nowTick]);

  const p = data?.probabilities;
  const ko = data?.knockout;
  const homeName = data?.fixture?.homeTeam ?? homeTeam;
  const awayName = data?.fixture?.awayTeam ?? awayTeam;
  const pm = data?.polymarket;
  const hasMarket = Boolean(data?.marketProbabilities);

  return (
    <section className="predictionsEngine">
      <header className="nav glass">
        <div className="navLeft">
          <div className="navTitleWrap">
            <div className="navTitle">World Cup Predictor</div>
            <div className="navSubtitle">{subtitle}</div>
          </div>
        </div>
        <div className="navRight">
          <button type="button" className="btnPrimary" disabled={!validTeams || loading} onClick={load}>
            {loading ? 'Updating…' : 'Predict'}
          </button>
        </div>
      </header>

      <div className="glass controls">
        <div className="stageTabs" role="tablist" aria-label="Tournament stage">
          {STAGES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              className={`stageTab${stageTab === s.id ? ' active' : ''}`}
              aria-selected={stageTab === s.id}
              onClick={() => setStageTab(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {stageTab === 'group' ? (
          <div className="controlsRow">
            <div className="control">
              <div className="controlLabel">Group</div>
              <div className="selectWrap">
                <select className="select" value={group} onChange={(e) => setGroup(e.target.value)}>
                  {(catalog?.groups ?? 'ABCDEFGHIJKL'.split('')).map((g) => (
                    <option key={g} value={g}>
                      Group {g}
                    </option>
                  ))}
                </select>
                <div className="chev" aria-hidden="true">
                  ⌄
                </div>
              </div>
            </div>
            <div className="control controlWide">
              <div className="controlLabel">Match</div>
              <div className="selectWrap">
                <select className="select" value={fixtureId} onChange={(e) => setFixtureId(e.target.value)}>
                  {groupFixtures.map((f) => (
                    <option key={f.id} value={f.id}>
                      {formatFixtureLabel(f)}
                    </option>
                  ))}
                </select>
                <div className="chev" aria-hidden="true">
                  ⌄
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass card infoCard">
            <p className="muted small">
              Knockout fixtures (Round of 32 through Final) will be added once the group stage is complete.
              The same prediction engine, stats, and AI analyst will apply — including extra time and penalties.
            </p>
          </div>
        )}

        {stageTab === 'group' ? (
          <div className="controlsRow">
            <div className="control toggleControl">
              <div className="controlLabel">Venue</div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={selectedFixture?.neutralVenue ?? neutralVenue}
                  onChange={(e) => setNeutralVenue(e.target.checked)}
                  disabled={Boolean(selectedFixture)}
                />
                <span className="track" aria-hidden="true" />
                <span className="toggleText">Neutral</span>
              </label>
            </div>
            <div className="control toggleControl">
              <div className="controlLabel">Polymarket</div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={liveMarket}
                  onChange={(e) => setLiveMarket(e.target.checked)}
                  disabled={!hasMarket && !loading}
                />
                <span className="track" aria-hidden="true" />
                <span className="toggleText">Live</span>
              </label>
            </div>
          </div>
        ) : null}

        {!validTeams && stageTab === 'group' ? <div className="error">Pick a valid fixture.</div> : null}
        {error ? <div className="error">{error}</div> : null}
      </div>

      {stageTab === 'knockout' ? null : (
        <>
          {pm && !pm.found && pm.message ? (
            <div className="glass card infoCard">
              <p className="muted small">{pm.message}</p>
            </div>
          ) : null}

          {pm?.found && pm.marketQuestion ? (
            <div className="glass card infoCard">
              <div className="polymarketCardHead">
                <p className="muted small polymarketCardText">
                  <span className="badge">Polymarket</span> {pm.marketQuestion}
                  {pm.source ? <span className="dot"> · </span> : null}
                  {pm.source ? <span>{pm.source}</span> : null}
                </p>
                {liveMarket && hasMarket ? (
                  <div className={`liveBadge${marketRefreshing ? ' liveBadgePulse' : ''}`}>
                    <span className="liveDot" aria-hidden="true" />
                    Live
                    {marketAgeLabel ? <span className="liveAge"> · {marketAgeLabel}</span> : null}
                  </div>
                ) : null}
              </div>
              {pm.note ? <p className="muted small">{pm.note}</p> : null}
              {liveMarket && hasMarket ? (
                <p className="muted small">
                  Auto-refreshes every {POLYMARKET_POLL_MS / 1000}s via Polymarket Gamma (cached ~90s on server).
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid">
            <section className="glass card">
              <div className="cardTitle">Win probabilities {hasMarket ? '(blended)' : '(model)'} · 90 minutes</div>
              <div className="triple">
                <div className="pill">
                  <div className="pillLabel">{homeName}</div>
                  <div className="pillValue">{pct(p?.homeWin)}</div>
                </div>
                <div className="pill">
                  <div className="pillLabel">Draw</div>
                  <div className="pillValue">{pct(p?.draw)}</div>
                </div>
                <div className="pill">
                  <div className="pillLabel">{awayName}</div>
                  <div className="pillValue">{pct(p?.awayWin)}</div>
                </div>
              </div>
              <ProbBar home={p?.homeWin} draw={p?.draw} away={p?.awayWin} />

              {isKnockout && ko ? (
                <div className="sourceBlock knockoutBlock">
                  <div className="sourceLabel">If level after 90 minutes</div>
                  <div className="knockoutPills">
                    <div className="pill">
                      <div className="pillLabel">Extra time</div>
                      <div className="pillValue smallVal">{pct(ko.extraTimePct)}</div>
                    </div>
                    <div className="pill">
                      <div className="pillLabel">Penalties</div>
                      <div className="pillValue smallVal">{pct(ko.penaltiesPct)}</div>
                    </div>
                  </div>
                </div>
              ) : null}

              {isKnockout && ko ? (
                <div className="sourceBlock">
                  <div className="sourceLabel">To advance (incl. ET &amp; pens)</div>
                  <div className="triple compact">
                    <div className="pill">
                      <div className="pillLabel">{homeName}</div>
                      <div className="pillValue smallVal">{pct(ko.toLiftTrophy?.homeWin)}</div>
                    </div>
                    <div className="pill">
                      <div className="pillLabel">{awayName}</div>
                      <div className="pillValue smallVal">{pct(ko.toLiftTrophy?.awayWin)}</div>
                    </div>
                  </div>
                  <TrophyBar
                    home={ko.toLiftTrophy?.homeWin}
                    away={ko.toLiftTrophy?.awayWin}
                    homeName={homeName}
                    awayName={awayName}
                  />
                </div>
              ) : null}

              <ProbRow label="National team model" p={data?.modelProbabilities} homeName={homeName} awayName={awayName} />
              {hasMarket ? (
                <ProbRow label="Polymarket live odds" p={data?.marketProbabilities} homeName={homeName} awayName={awayName} />
              ) : null}

              <p className="muted small">
                {data?.model?.lambda
                  ? `λ ${data.model.lambda.home} vs ${data.model.lambda.away} · ${data.model.note}`
                  : 'Loading model…'}
              </p>
              {data?.dataSources?.teams?.home ? (
                <p className="muted small">
                  Data: {data.dataSources.teams.home.season} qualifying + {data.dataSources.teams.home.era} era (
                  {Math.round((data.dataSources.catalog?.blendWeights?.historical ?? 0.25) * 100)}/
                  {Math.round((data.dataSources.catalog?.blendWeights?.season2026 ?? 0.55) * 100)}/
                  {Math.round((data.dataSources.catalog?.blendWeights?.formLast10 ?? 0.2) * 100)} blend)
                </p>
              ) : null}
            </section>

            <section className="glass card">
              <div className="cardTitle">Most likely scorelines</div>
              {loading && !data ? (
                <p className="muted">Loading scorelines…</p>
              ) : (
                <ol className="list">
                  {(data?.scorelines ?? []).map((row) => (
                    <li key={row.score}>
                      <div className="rowLine">
                        <span>{row.score}</span>
                        <span className="right">{row.probability.toFixed(1)}%</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <section className="glass card verdictCard">
            <div className="cardTitle">Overall match verdict</div>
            <p className="verdictSummary">{data?.verdict?.summary ?? '—'}</p>
            {data?.verdict ? (
              <p className="muted small">
                {data.verdict.isDeadHeat ? (
                  <>
                    Level: <strong>{data.verdict.favorite}</strong> · Edge: none
                  </>
                ) : (
                  <>
                    Favorite: <strong>{data.verdict.favorite}</strong> · Edge:{' '}
                    {data.verdict.confidenceGap.toFixed(1)} pts
                  </>
                )}
              </p>
            ) : null}
          </section>
        </>
      )}
    </section>
  );
}

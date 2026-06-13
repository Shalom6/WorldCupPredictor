'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveCatalog } from '../hooks/useLiveScores.js';
import { getMatchReport } from '../src/matchResult.js';
import MatchReport from './MatchReport.jsx';

const POLYMARKET_POLL_MS = 120_000;
const STAGES = [{ id: 'group', label: 'Group Stage' }, { id: 'knockout', label: 'Knockouts' }];

function pct(n) {
  return typeof n === 'number' ? `${n.toFixed(1)}%` : '—';
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function ProbBar({ home, draw, away, resultMode = false }) {
  const h = clamp(home ?? 0, 0, 100);
  const d = clamp(draw ?? 0, 0, 100);
  const a = clamp(away ?? 0, 0, 100);

  if (resultMode && (h === 100 || d === 100 || a === 100)) {
    return (
      <div className="probBar" aria-label="Final result bar">
        {h === 100 ? <div className="seg home" style={{ width: '100%' }} /> : null}
        {d === 100 ? <div className="seg draw" style={{ width: '100%' }} /> : null}
        {a === 100 ? <div className="seg away" style={{ width: '100%' }} /> : null}
      </div>
    );
  }

  const denom = h + d + a || 1;
  return (
    <div className="probBar" aria-label="Win probability bar">
      <div className="seg home" style={{ width: `${(h / denom) * 100}%` }} />
      <div className="seg draw" style={{ width: `${(d / denom) * 100}%` }} />
      <div className="seg away" style={{ width: `${(a / denom) * 100}%` }} />
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
  const live = f.live || f.status === 'in_progress' ? ' · LIVE' : '';
  const score =
    f.homeScore != null && f.awayScore != null ? ` (${f.homeScore}–${f.awayScore})` : '';
  return `${f.homeTeam} vs ${f.awayTeam}${score}${live} · MD${f.matchday}`;
}

export default function PredictionsPanel({
  onPredictionUpdate,
  group,
  setGroup,
  fixtureId,
  setFixtureId
}) {
  const [catalog, setCatalog] = useState(null);
  const { catalog: liveCatalog } = useLiveCatalog(catalog);
  const [stageTab, setStageTab] = useState('group');
  const [neutralVenue, setNeutralVenue] = useState(false);
  const [liveMarket, setLiveMarket] = useState(true);
  const [loading, setLoading] = useState(false);
  const [marketRefreshing, setMarketRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const didInitFixture = useRef(false);
  const loadSeq = useRef(0);

  const groupFixtures = useMemo(() => {
    if (!liveCatalog?.groupStage) return [];
    return liveCatalog.groupStage.filter((f) => f.group === group);
  }, [liveCatalog, group]);

  const knockoutFixtures = liveCatalog?.knockout ?? [];
  const activeFixtures = stageTab === 'group' ? groupFixtures : knockoutFixtures;

  const selectedFixture = useMemo(() => {
    const all = [...(liveCatalog?.groupStage ?? []), ...(liveCatalog?.knockout ?? [])];
    if (fixtureId) {
      return all.find((f) => f.id === fixtureId) ?? null;
    }
    return activeFixtures[0] ?? null;
  }, [liveCatalog, fixtureId, activeFixtures]);

  const dataMatchesSelection = data?.fixture?.id === selectedFixture?.id;
  const displayData = dataMatchesSelection ? data : null;

  const homeTeam = selectedFixture?.homeTeam ?? '';
  const awayTeam = selectedFixture?.awayTeam ?? '';
  const validTeams = homeTeam && awayTeam && homeTeam !== awayTeam;
  const isKnockout = stageTab === 'knockout';

  const subtitle = useMemo(() => {
    const f = selectedFixture;
    if (!f) return 'FIFA World Cup 2026 · Group Stage';
    const groupPart = f.group ? ` · Group ${f.group}` : '';
    return `FIFA World Cup 2026 · ${f.stage ?? 'Group Stage'}${groupPart} · ${f.venueCity} · ${f.date ?? ''}`.trim();
  }, [selectedFixture]);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/fixtures')
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setCatalog(json);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load fixtures catalog');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!catalog?.groupStage?.length || didInitFixture.current) return;
    didInitFixture.current = true;

    if (fixtureId) {
      const match = catalog.groupStage.find((f) => f.id === fixtureId);
      if (match?.group && match.group !== group) {
        setGroup(match.group);
      }
      return;
    }

    const first =
      catalog.groupStage.find((f) => f.group === group) ??
      catalog.groupStage.find((f) => f.group === 'A');
    if (first) {
      setFixtureId(first.id);
      if (first.group !== group) setGroup(first.group);
    }
  }, [catalog, fixtureId, group, setFixtureId, setGroup]);

  function handleGroupChange(nextGroup) {
    setGroup(nextGroup);
    const nextFixtures = (catalog?.groupStage ?? []).filter((f) => f.group === nextGroup);
    if (nextFixtures.length) setFixtureId(nextFixtures[0].id);
  }

  async function load() {
    if (!validTeams || !selectedFixture) return;

    const seq = ++loadSeq.current;
    const fixtureIdForLoad = selectedFixture.id;
    const home = selectedFixture.homeTeam;
    const away = selectedFixture.awayTeam;

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixtureId: fixtureIdForLoad,
          homeTeam: home,
          awayTeam: away,
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
      if (seq !== loadSeq.current) return;
      if (json.fixture?.id !== fixtureIdForLoad) return;

      if (json.polymarket?.dataApiNote) delete json.polymarket.dataApiNote;
      setData(json);
      setMarketUpdatedAt(json.marketUpdatedAt ? Date.parse(json.marketUpdatedAt) : Date.now());
      onPredictionUpdate?.(json);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(e.message);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  const refreshMarket = useCallback(async () => {
    if (!validTeams || !data?.modelProbabilities || !data?.model?.lambda || !dataMatchesSelection) return;

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
  }, [awayTeam, data, dataMatchesSelection, homeTeam, onPredictionUpdate, validTeams]);

  useEffect(() => {
    if (selectedFixture?.id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFixture?.id]);

  useEffect(() => {
    if (!liveMarket || !displayData?.marketProbabilities || !validTeams) return undefined;

    const poll = () => {
      if (document.visibilityState === 'visible') refreshMarket();
    };

    const interval = setInterval(poll, POLYMARKET_POLL_MS);
    return () => clearInterval(interval);
  }, [liveMarket, displayData?.marketProbabilities, validTeams, refreshMarket, homeTeam, awayTeam]);

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

  const catalogResult = useMemo(() => getMatchReport(selectedFixture), [selectedFixture]);
  const p = displayData?.probabilities;
  const matchResult = displayData?.matchResult ?? catalogResult;
  const isPlayed = Boolean(matchResult);
  const displayP = isPlayed ? matchResult?.probabilities : p;
  const ko = displayData?.knockout;
  const homeName = selectedFixture?.homeTeam ?? homeTeam;
  const awayName = selectedFixture?.awayTeam ?? awayTeam;
  const pm = displayData?.polymarket;
  const hasMarket = Boolean(displayData?.marketProbabilities) && !isPlayed;
  const marketClosed = Boolean(pm?.marketClosed) && !isPlayed;

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
                <select className="select" value={group} onChange={(e) => handleGroupChange(e.target.value)}>
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
                  disabled={(!hasMarket && !loading) || isPlayed}
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
          {isPlayed ? (
            <MatchReport homeTeam={homeName} awayTeam={awayName} report={matchResult} />
          ) : null}

          {!isPlayed && pm && !pm.found && marketClosed ? (
            <div className="glass card infoCard">
              <p className="muted small">
                Polymarket market closed{pm.eventTitle ? ` (${pm.eventTitle})` : ''}. Record the final
                score in match-results.json to show who won or if it was a draw.
              </p>
            </div>
          ) : null}

          {!isPlayed && pm && !pm.found && pm.message && !marketClosed ? (
            <div className="glass card infoCard">
              <p className="muted small">{pm.message}</p>
            </div>
          ) : null}

          {!isPlayed && pm?.found && pm.marketQuestion ? (
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
              <div className="cardTitle">
                {isPlayed ? 'Final result · 90 minutes' : `Win probabilities ${hasMarket ? '(blended)' : '(model)'} · 90 minutes`}
              </div>
              <div className="triple">
                <div className={`pill${isPlayed && displayP?.homeWin === 100 ? ' pillPick' : ''}`}>
                  <div className="pillLabel">{homeName}</div>
                  <div className="pillValue">{pct(displayP?.homeWin)}</div>
                </div>
                <div className={`pill${isPlayed && displayP?.draw === 100 ? ' pillPick' : ''}`}>
                  <div className="pillLabel">Draw</div>
                  <div className="pillValue">{pct(displayP?.draw)}</div>
                </div>
                <div className={`pill${isPlayed && displayP?.awayWin === 100 ? ' pillPick' : ''}`}>
                  <div className="pillLabel">{awayName}</div>
                  <div className="pillValue">{pct(displayP?.awayWin)}</div>
                </div>
              </div>
              <ProbBar
                home={displayP?.homeWin}
                draw={displayP?.draw}
                away={displayP?.awayWin}
                resultMode={isPlayed}
              />

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

              {!isPlayed ? (
                <>
                  <ProbRow
                    label="National team model"
                    p={displayData?.modelProbabilities}
                    homeName={homeName}
                    awayName={awayName}
                  />
                  {hasMarket ? (
                    <ProbRow
                      label="Polymarket live odds"
                      p={displayData?.marketProbabilities}
                      homeName={homeName}
                      awayName={awayName}
                    />
                  ) : null}
                </>
              ) : (
                <p className="muted small">Pre-match model and Polymarket odds hidden — match is complete.</p>
              )}

              <p className="muted small">
                {displayData?.model?.lambda
                  ? `λ ${displayData.model.lambda.home} vs ${displayData.model.lambda.away} · ${displayData.model.note}`
                  : loading
                    ? 'Loading model…'
                    : 'Press Predict to load this match.'}
              </p>
              {displayData?.dataSources?.teams?.home ? (
                <p className="muted small">
                  Data: {displayData.dataSources.teams.home.season} qualifying +{' '}
                  {displayData.dataSources.teams.home.era} era (
                  {Math.round((displayData.dataSources.catalog?.blendWeights?.historical ?? 0.25) * 100)}/
                  {Math.round((displayData.dataSources.catalog?.blendWeights?.season2026 ?? 0.55) * 100)}/
                  {Math.round((displayData.dataSources.catalog?.blendWeights?.formLast10 ?? 0.2) * 100)} blend)
                </p>
              ) : null}
            </section>

            <section className="glass card">
              <div className="cardTitle">{isPlayed ? 'Final scoreline' : 'Most likely scorelines'}</div>
              {loading && !displayData && !isPlayed ? (
                <p className="muted">Loading scorelines…</p>
              ) : (
                <ol className="list">
                  {(displayData?.scorelines ?? []).map((row) => (
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
            <div className="cardTitle">{isPlayed ? 'Match outcome' : 'Overall match verdict'}</div>
            <p className="verdictSummary">
              {displayData?.verdict?.summary ?? (isPlayed ? matchResult?.summary : '—')}
            </p>
            {displayData?.verdict || isPlayed ? (
              <p className="muted small">
                {isPlayed ? (
                  <>
                    Result: <strong>{matchResult.type === 'draw' ? 'Draw' : matchResult.winner}</strong>
                    {' · '}
                    {matchResult.scoreLine}
                  </>
                ) : displayData?.verdict?.isDeadHeat ? (
                  <>
                    Level: <strong>{displayData.verdict.favorite}</strong> · Edge: none
                  </>
                ) : (
                  <>
                    Favorite: <strong>{displayData.verdict.favorite}</strong> · Edge:{' '}
                    {displayData.verdict.confidenceGap.toFixed(1)} pts
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

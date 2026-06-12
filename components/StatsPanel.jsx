'use client';

import { useEffect, useMemo, useState } from 'react';
import { getMatchReport } from '../src/matchResult.js';
import MatchReport from './MatchReport.jsx';

function StatRow({ label, aName, a, bName, b, max }) {
  const av = Number(a);
  const bv = Number(b);
  const denom = max ?? Math.max(av, bv, 1);
  const ap = (av / denom) * 100;
  const bp = (bv / denom) * 100;

  return (
    <div className="statRow">
      <div className="statHead">
        <div className="statLabel">{label}</div>
        <div className="statVals">
          <span className="tag">{aName}</span> {a} <span className="dot">·</span> <span className="tag">{bName}</span> {b}
        </div>
      </div>
      <div className="statBar" role="presentation">
        <div className="fill a" style={{ width: `${ap}%` }} />
        <div className="fill b" style={{ width: `${bp}%` }} />
      </div>
    </div>
  );
}

function OuTable({ lines }) {
  if (!lines?.length) return null;
  return (
    <div className="ouTable">
      <div className="ouHead">
        <span>Line</span>
        <span>Over %</span>
        <span>Under %</span>
      </div>
      {lines.map((row) => (
        <div key={row.line} className="ouRow">
          <span className="ouLine">O/U {row.line}</span>
          <span className="ouOver">{row.overPct}%</span>
          <span className="ouUnder">{row.underPct}%</span>
        </div>
      ))}
    </div>
  );
}

function BettingCategoryCard({ category, homeTeam, awayTeam }) {
  return (
    <section className="glass card bettingCard">
      <div className="bettingCardHead">
        <div>
          <div className="cardTitle">{category.label}</div>
          <div className="marketHint">{category.marketTags}</div>
        </div>
        {category.match ? (
          <div className="matchExpected">
            <span className="muted small">Match exp.</span>
            <strong>
              {category.match.expected} {category.match.unit}
            </strong>
          </div>
        ) : null}
      </div>

      <div className="statsGrid">
        {category.team.map((row) => (
          <StatRow
            key={row.key}
            label={row.label}
            aName={homeTeam}
            a={row.home}
            bName={awayTeam}
            b={row.away}
          />
        ))}
      </div>

      {category.lines?.length ? (
        <div className="ouBlock">
          <div className="sourceLabel">Modelled Over / Under (match)</div>
          <OuTable lines={category.lines} />
        </div>
      ) : null}

      {category.extras?.length ? (
        <ul className="extrasList">
          {category.extras.map((ex) => (
            <li key={ex.label}>
              <span>{ex.label}</span>
              <span className="right">{ex.valuePct}%</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function formatExpected(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n < 10 ? n.toFixed(2) : n.toFixed(1);
}

function formatPct(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function PlayerPropStat({ label, value, highlight = false }) {
  return (
    <div className={`playerPropStat${highlight ? ' playerPropStatHighlight' : ''}`}>
      <span className="playerPropStatLabel">{label}</span>
      <span className="playerPropStatValue">{value}</span>
    </div>
  );
}

function PlayerPropCategoryCard({ category }) {
  return (
    <section className="glass card bettingCard playerPropCard">
      <div className="bettingCardHead">
        <div>
          <div className="cardTitle">{category.label}</div>
          <div className="marketHint">{category.marketTags}</div>
        </div>
      </div>

      <div className="playerPropList">
        {category.players.map((row) => {
          const mainLine = row.lines?.[0];
          const displayPct = row.anytimePct ?? mainLine?.overPct;
          const lineLabel = mainLine ? `O${mainLine.line}` : 'Over';

          return (
            <div key={`${row.team}-${row.name}`} className="playerPropRow">
              <div className="playerPropIdentity">
                <span className="playerPropName">{row.name}</span>
                <span className="tag playerPropTeam">{row.team}</span>
              </div>
              <div className="playerPropStats">
                <PlayerPropStat label="Expected" value={formatExpected(row.expected)} />
                <PlayerPropStat label="Line" value={lineLabel} />
                <PlayerPropStat label="Over" value={formatPct(displayPct)} highlight />
              </div>
            </div>
          );
        })}
      </div>

      {category.players.some((p) => p.lines?.length > 1) ? (
        <div className="playerPropLinesBlock">
          <div className="sourceLabel">All modelled lines (top players)</div>
          {category.players.slice(0, 5).map((row) => (
            <div key={`lines-${row.team}-${row.name}`} className="playerPropLinesGroup">
              <div className="playerPropLinesTitle">
                {row.name} <span className="muted">({row.team})</span>
              </div>
              <div className="playerPropLineChips">
                {row.lines.map((line) => (
                  <div key={line.line} className="playerPropLineChip">
                    <span className="playerPropStatLabel">O{line.line}</span>
                    <span className="playerPropStatValue">{formatPct(line.overPct)}</span>
                    <span className="playerPropUnder muted small">U {formatPct(line.underPct)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PlayerList({ title, rows, emptyLabel, hint }) {
  return (
    <section className="glass card">
      <div className="cardTitle">{title}</div>
      {rows.length ? (
        <ol className="list">
          {rows.map((row) => (
            <li key={`${row.team}-${row.name}`}>
              <div className="rowLine">
                <span>
                  {row.name} <span className="muted">({row.team})</span>
                </span>
                <span className="right">{row.probability.toFixed(1)}%</span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">{emptyLabel}</p>
      )}
      {hint ? <p className="muted small">{hint}</p> : null}
    </section>
  );
}

export default function StatsPanel({ fixture }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statsMode, setStatsMode] = useState('actual');

  const homeTeam = fixture?.homeTeam ?? 'Brazil';
  const awayTeam = fixture?.awayTeam ?? 'Morocco';
  const neutralVenue = fixture?.neutralVenue !== false;

  const matchReport = useMemo(() => getMatchReport(fixture), [fixture]);

  useEffect(() => {
    setStatsMode(matchReport ? 'actual' : 'projected');
  }, [fixture?.id, matchReport]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const qs = new URLSearchParams({
          homeTeam,
          awayTeam,
          neutralVenue: neutralVenue ? '1' : '0'
        });
        const res = await fetch(`/api/stats?${qs}`, { cache: 'no-store' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || json?.detail || 'Failed to load stats');
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [homeTeam, awayTeam, neutralVenue]);

  const showActual = Boolean(matchReport && statsMode === 'actual');
  const showProjected = !matchReport || statsMode === 'projected';
  const categories = data?.bettingCategories ?? [];
  const playerPropCategories = data?.playerProps?.categories ?? [];
  const scorers = data?.goalscorers ?? [];
  const assisters = data?.assisters ?? [];
  const matchTotals = data?.predictedStats?.match;
  const rosterSeason = data?.rosterSeason ?? '2025-26';
  const blendNote = data?.blendNote;

  return (
    <section className="statsEngine">
      <header className="nav glass">
        <div className="navLeft">
          <div className="appIcon" aria-hidden="true">
            <div className="appIconInner">📊</div>
          </div>
          <div className="navTitleWrap">
            <div className="navTitle">Match stats</div>
            <div className="navSubtitle">
              {fixture
                ? `${fixture.competition ?? 'FIFA World Cup 2026'} · ${homeTeam} vs ${awayTeam}`
                : `${homeTeam} vs ${awayTeam} · run Predict to sync fixture`}
            </div>
          </div>
        </div>
        {matchReport ? (
          <div className="navRight statsModeTabs" role="tablist" aria-label="Stats view">
            <button
              type="button"
              role="tab"
              className={`stageTab${statsMode === 'actual' ? ' active' : ''}`}
              aria-selected={statsMode === 'actual'}
              onClick={() => setStatsMode('actual')}
            >
              Actual
            </button>
            <button
              type="button"
              role="tab"
              className={`stageTab${statsMode === 'projected' ? ' active' : ''}`}
              aria-selected={statsMode === 'projected'}
              onClick={() => setStatsMode('projected')}
            >
              Pre-match model
            </button>
          </div>
        ) : null}
      </header>

      {!fixture ? (
        <section className="glass card infoCard">
          <p className="muted small">
            Showing default teams. Open <strong>Predictions</strong> and press <strong>Predict</strong> to sync
            teams with your selection.
          </p>
        </section>
      ) : null}

      {error ? <div className="error glass card">{error}</div> : null}

      {showActual ? (
        <MatchReport homeTeam={homeTeam} awayTeam={awayTeam} report={matchReport} />
      ) : null}

      {showProjected ? (
        <>
          <section className="glass card infoCard">
            <p className="muted small" style={{ margin: 0 }}>
              {matchReport
                ? 'Pre-match Poisson projections — switch to Actual for the final score and team stats.'
                : blendNote ??
                  `Poisson model + ${rosterSeason} squads. Projections are computed in-app from team rates and match context.`}
            </p>
          </section>

          {loading && !data ? (
            <section className="glass card">
              <p className="muted">Loading stats…</p>
            </section>
          ) : null}

          {matchTotals ? (
            <section className="glass card matchTotalsCard">
              <div className="cardTitle">Match totals (expected)</div>
              <div className="totalsGrid">
                {[
                  ['Goals', matchTotals.goals],
                  ['Shots', matchTotals.shots],
                  ['SOT', matchTotals.shotsOnTarget],
                  ['Corners', matchTotals.corners],
                  ['Fouls', matchTotals.fouls],
                  ['Offsides', matchTotals.offsides],
                  ['Yellow cards', matchTotals.yellowCards],
                  ['Booking pts', matchTotals.bookingPoints]
                ].map(([label, val]) => (
                  <div key={label} className="totalChip">
                    <span className="muted small">{label}</span>
                    <strong>{val}</strong>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {playerPropCategories.length ? (
            <>
              <header className="sectionDivider">
                <h2 className="sectionTitle">Player props</h2>
                <p className="muted small sectionHint">
                  Per-player projections from squad minutes, international per-90 rates, and team totals.
                </p>
              </header>
              <div className="bettingGrid playerPropsGrid">
                {playerPropCategories.map((cat) => (
                  <PlayerPropCategoryCard key={cat.id} category={cat} />
                ))}
              </div>
            </>
          ) : null}

          <header className="sectionDivider">
            <h2 className="sectionTitle">Match props</h2>
          </header>

          <div className="bettingGrid">
            {categories.map((cat) => (
              <BettingCategoryCard key={cat.id} category={cat} homeTeam={homeTeam} awayTeam={awayTeam} />
            ))}
          </div>

          <div className="grid statsGridLayout">
            <PlayerList
              title="Goalscorers"
              rows={scorers}
              emptyLabel={loading ? 'Loading…' : 'No scorer data.'}
              hint="Anytime scorer — % chance of at least one goal."
            />
            <PlayerList
              title="Most likely assists"
              rows={assisters}
              emptyLabel={loading ? 'Loading…' : 'No assist data.'}
              hint="At least one assist — mids weighted higher."
            />
          </div>

          {data?.dataSources?.home ? (
            <p className="muted small footer">
              Data: {data.dataSources.home.source} · roster {rosterSeason}
              {data.dataSources.home.uclDataQuality === 'ucl-goals-repaired'
                ? ' · qualifying goals repaired'
                : ''}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getMatchReport } from '../src/matchResult.js';
import MatchPlayerTable from './MatchPlayerTable.jsx';
import MatchReport from './MatchReport.jsx';

const OUTFIELD_STAT_TYPES = [
  { id: 'shots', code: 'SHO', label: 'Shots', field: 'shots', defaultLine: 0 },
  { id: 'goals', code: 'GLS', label: 'Goals', field: 'goals', defaultLine: 0 },
  { id: 'assists', code: 'AST', label: 'Assists', field: 'assists', defaultLine: 0 },
  { id: 'shotsOnTarget', code: 'SOT', label: 'SOT', field: 'shotsOnTarget', defaultLine: 0 },
  { id: 'goalsOrAssists', code: 'G or AST', label: 'G or AST', field: null, defaultLine: 0 },
  { id: 'fouls', code: 'Fouls', label: 'Fouls', field: 'fouls', defaultLine: 1 },
  { id: 'cards', code: 'Cards', label: 'Cards', field: 'cards', defaultLine: 0 }
];

const GOALKEEPER_STAT_TYPES = [
  { id: 'saves', code: 'SAV', label: 'Saves', field: 'saves', defaultLine: 2 },
  { id: 'goalsConceded', code: 'GC', label: 'Goals conceded', field: 'goalsConceded', defaultLine: 1 },
  { id: 'cleanSheet', code: 'CS', label: 'Clean sheet', field: null, defaultLine: 0 },
  { id: 'passes', code: 'PAS', label: 'Passes', field: 'passes', defaultLine: 15 },
  { id: 'keeperSweeper', code: 'SWP', label: 'Sweeper actions', field: 'keeperSweeper', defaultLine: 0 },
  { id: 'cards', code: 'CRD', label: 'Cards', field: 'cards', defaultLine: 0 }
];

function isGoalkeeper(position) {
  return String(position ?? '').toLowerCase().includes('goal');
}

function getStatTypesForPosition(position) {
  return isGoalkeeper(position) ? GOALKEEPER_STAT_TYPES : OUTFIELD_STAT_TYPES;
}

const TIMEFRAMES = [
  { id: 'season', label: 'Season' },
  { id: 'l5', label: 'Last 5' },
  { id: 'l10', label: 'Last 10' }
];

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function statValue(game, statType) {
  if (statType.id === 'goalsOrAssists') {
    return (game.goals ?? 0) + (game.assists ?? 0);
  }
  if (statType.id === 'cleanSheet') {
    if (game.goalsConceded != null) return game.goalsConceded === 0 ? 1 : 0;
    return 0;
  }
  if (statType.field) return game[statType.field] ?? 0;
  return 0;
}

function isOver(stat, line) {
  return stat > line;
}

function normalizeGames(log) {
  return (log ?? []).map((g, i) => ({
    ...g,
    venue: g.venue ?? (i % 2 === 0 ? 'home' : 'away')
  }));
}

function filterGames(log, { timeframe, opponent, split }) {
  let games = normalizeGames(log);
  if (opponent && opponent !== 'all') {
    games = games.filter((g) => g.opponent === opponent);
  }
  if (split === 'home') games = games.filter((g) => g.venue === 'home');
  if (split === 'away') games = games.filter((g) => g.venue === 'away');
  if (timeframe === 'l5') games = games.slice(0, 5);
  else if (timeframe === 'l10') games = games.slice(0, 10);
  return games;
}

function computeHitRate(games, statType, line) {
  if (!games.length) return { overPct: 0, underPct: 0, overCount: 0, underCount: 0, total: 0 };
  let overCount = 0;
  for (const g of games) {
    if (isOver(statValue(g, statType), line)) overCount++;
  }
  const total = games.length;
  const underCount = total - overCount;
  const overPct = Math.round((overCount / total) * 1000) / 10;
  const underPct = Math.round((underCount / total) * 1000) / 10;
  return { overPct, underPct, overCount, underCount, total };
}

function teamMonogram(team) {
  return String(team ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

function formatGameDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatChartAxisDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function formatDob(dateStr) {
  if (!dateStr) return '—';
  return formatGameDate(dateStr);
}

function formatCaps(profile) {
  if (profile?.internationalCaps == null) return '—';
  const goals = profile.internationalGoals;
  if (goals != null && goals > 0) return `${profile.internationalCaps} (${goals} goals)`;
  return String(profile.internationalCaps);
}

function PlayerProfileCard({ detail, loading }) {
  if (loading && !detail) {
    return <div className="lmProfileCard lmProfileCardEmpty">Loading player…</div>;
  }

  if (!detail) {
    return (
      <div className="lmProfileCard lmProfileCardEmpty">
        Search for a player to view profile details.
      </div>
    );
  }

  const profile = detail.profile ?? {};
  const facts = [
    { label: 'Club', value: profile.club },
    { label: 'Market value', value: profile.marketValueDisplay },
    { label: 'Age', value: profile.age != null ? String(profile.age) : null },
    { label: 'Date of birth', value: profile.dateOfBirth ? formatDob(profile.dateOfBirth) : null },
    { label: 'Int. caps', value: formatCaps(profile) }
  ];

  return (
    <div className="lmProfileCard">
      <p className="lmProfilePlayerName">{detail.name}</p>
      <p className="lmProfilePlayerMeta">
        {detail.team}
        {detail.number ? ` · #${detail.number}` : ''} · {detail.position}
      </p>
      <dl className="lmProfileFacts">
        {facts.map(({ label, value }) => (
          <div key={label} className="lmProfileFact">
            <dt>{label}</dt>
            <dd>{value ?? '—'}</dd>
          </div>
        ))}
      </dl>
      {profile.source === 'sofascore' ? (
        <p className="lmProfileSource muted small">Bio via Sofascore</p>
      ) : null}
    </div>
  );
}

function buildBarTooltip(g, statType, line, val) {
  const hit = isOver(val, line);
  const lineLabel = Number.isInteger(line) ? String(line) : line.toFixed(1);
  const venue = g.venue === 'home' ? 'vs' : g.venue === 'away' ? '@' : 'v';
  const valLabel = statType.id === 'cleanSheet' ? (val ? 'Yes' : 'No') : val;
  return {
    title: `${statType.label}: ${valLabel}`,
    meta: `${formatGameDate(g.date)} · ${venue} ${g.opponent}`,
    detail: `${g.competition ?? 'International'} · ${g.minutes ?? 0} min`,
    result: `${hit ? 'Over' : 'Under'} ${lineLabel} line`
  };
}

function WorkstationChart({ games, statType, line }) {
  const areaRef = useRef(null);
  const [hover, setHover] = useState(null);

  const chartGames = useMemo(
    () => [...games].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
    [games]
  );

  if (!chartGames.length) {
    return <div className="lmChartEmpty">No games for this filter.</div>;
  }

  const values = chartGames.map((g) => statValue(g, statType));
  const maxVal = Math.max(...values, line + 0.5, 1);
  const yMax = statType.id === 'cleanSheet' ? 1 : Math.ceil(maxVal + 0.5);
  const yTicks = Array.from({ length: yMax + 1 }, (_, i) => i);

  function onBarMove(e, i) {
    const area = areaRef.current;
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const col = e.currentTarget?.getBoundingClientRect?.();
    const clientX = e.clientX || (col ? col.left + col.width / 2 : rect.left + rect.width / 2);
    const clientY = e.clientY || (col ? col.top + col.height * 0.35 : rect.top + rect.height * 0.35);
    const x = Math.max(72, Math.min(clientX - rect.left, rect.width - 72));
    const y = Math.max(48, Math.min(clientY - rect.top, rect.height - 12));
    setHover({ idx: i, x, y });
  }

  function clearHover() {
    setHover(null);
  }

  const hoveredGame = hover != null ? chartGames[hover.idx] : null;
  const hoveredVal = hover != null ? values[hover.idx] : 0;
  const tip =
    hoveredGame != null ? buildBarTooltip(hoveredGame, statType, line, hoveredVal) : null;
  const hoveredHit = hoveredGame != null ? isOver(hoveredVal, line) : false;

  return (
    <div className="lmChartWrap">
      <div className="lmChartY">
        {yTicks.reverse().map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="lmChartArea" ref={areaRef}>
        <div className="lmChartGrid">
          {yTicks.map((t) => (
            <div key={t} className="lmChartGridLine" style={{ bottom: `${(t / yMax) * 100}%` }} />
          ))}
          {line >= 0 ? (
            <div className="lmChartLineMarker" style={{ bottom: `${(line / yMax) * 100}%` }} />
          ) : null}
        </div>
        <div className="lmChartBars">
          {chartGames.map((g, i) => {
            const val = values[i];
            const h = (val / yMax) * 100;
            const hit = isOver(val, line);
            const tipMeta = buildBarTooltip(g, statType, line, val);
            return (
              <div
                key={`${g.date}-${i}`}
                className={`lmChartBarCol${hover?.idx === i ? ' hovered' : ''}`}
                onMouseMove={(e) => onBarMove(e, i)}
                onMouseLeave={clearHover}
                onFocus={(e) => onBarMove(e, i)}
                onBlur={clearHover}
                tabIndex={0}
                role="img"
                aria-label={`${tipMeta.title}, ${tipMeta.meta}, ${tipMeta.result}`}
              >
                <div className="lmChartBarStack">
                  <div
                    className={`lmChartBar${hit ? ' hit' : ''}`}
                    style={{ height: `${Math.max(h, val > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <span className="lmChartXLabel">{formatChartAxisDate(g.date)}</span>
              </div>
            );
          })}
        </div>
        {hover != null && tip ? (
          <div
            className="lmChartTooltipFloat"
            role="tooltip"
            style={{ left: hover.x, top: hover.y }}
          >
            <strong>{tip.title}</strong>
            <span>{tip.meta}</span>
            <span>{tip.detail}</span>
            <span className={hoveredHit ? 'over' : 'under'}>{tip.result}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="lmFilterPill">
      <span className="lmFilterPillLabel">{label}</span>
      <div className="selectWrap lmFilterSelectWrap">
        <select className="select lmFilterSelect" value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="chev" aria-hidden="true">
          ⌄
        </div>
      </div>
    </div>
  );
}

export default function PlayersPanel({ fixture = null }) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [teams, setTeams] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [panelMode, setPanelMode] = useState('workstation');
  const [matchPlayers, setMatchPlayers] = useState([]);
  const [matchPlayersLoading, setMatchPlayersLoading] = useState(false);

  const [statTypeId, setStatTypeId] = useState('shots');
  const [timeframe, setTimeframe] = useState('season');
  const [split, setSplit] = useState('all');
  const [opponent, setOpponent] = useState('all');
  const [line, setLine] = useState(0);

  const searchRef = useRef(null);
  const inputRef = useRef(null);

  const statTypes = useMemo(() => getStatTypesForPosition(detail?.position), [detail?.position]);

  const statType = useMemo(
    () => statTypes.find((s) => s.id === statTypeId) ?? statTypes[0],
    [statTypes, statTypeId]
  );

  const homeTeam = fixture?.homeTeam;
  const awayTeam = fixture?.awayTeam;
  const matchReport = useMemo(() => getMatchReport(fixture), [fixture]);

  useEffect(() => {
    setPanelMode(matchReport ? 'thisMatch' : 'workstation');
  }, [fixture?.id, matchReport]);

  useEffect(() => {
    if (!matchReport || !fixture?.id) {
      setMatchPlayers([]);
      return undefined;
    }

    let cancelled = false;
    setMatchPlayersLoading(true);
    fetch(`/api/match-players?fixtureId=${encodeURIComponent(fixture.id)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) setMatchPlayers(json.players ?? []);
      })
      .catch(() => {
        if (!cancelled) setMatchPlayers([]);
      })
      .finally(() => {
        if (!cancelled) setMatchPlayersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fixture?.id, matchReport]);

  const opponents = useMemo(() => {
    const ops = new Set((detail?.gameLog ?? []).map((g) => g.opponent));
    return [{ value: 'all', label: 'All Opponents' }, ...[...ops].map((o) => ({ value: o, label: o }))];
  }, [detail]);

  const filteredGames = useMemo(
    () => filterGames(detail?.gameLog, { timeframe, opponent, split }),
    [detail, timeframe, opponent, split]
  );

  const hitRate = useMemo(
    () => computeHitRate(filteredGames, statType, line),
    [filteredGames, statType, line]
  );

  useEffect(() => {
    setStatTypeId((id) => (statTypes.some((t) => t.id === id) ? id : statTypes[0].id));
  }, [statTypes]);

  useEffect(() => {
    setLine(statType.defaultLine);
  }, [statTypeId, statType.defaultLine]);

  const runSearch = useCallback(async (q) => {
    setSearchLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      params.set('limit', '20');
      const res = await fetch(`/api/players?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Search failed');
      setTeams(json.teams ?? []);
      setSearchResults(json.players ?? []);
      setHighlightIdx(0);
    } catch (e) {
      setError(e.message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchOpen || query) runSearch(query);
    }, query ? 180 : 0);
    return () => clearTimeout(t);
  }, [query, runSearch, searchOpen]);

  useEffect(() => {
    fetch('/api/players?q=hakimi&limit=1')
      .then((r) => r.json())
      .then((json) => {
        setTeams(json.teams ?? []);
        const pick = json.players?.[0];
        if (pick && !selectedId) setSelectedId(pick.id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return undefined;
    }

    let cancelled = false;
    setDetailLoading(true);

    fetch(`/api/players?id=${encodeURIComponent(selectedId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setDetail(json);
        setQuery('');
        setSearchOpen(false);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    function onDocClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function selectPlayer(id) {
    setSelectedId(id);
    setSearchOpen(false);
    setQuery('');
  }

  function onSearchKeyDown(e) {
    if (!searchOpen && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setSearchOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = searchResults[highlightIdx];
      if (pick) selectPlayer(pick.id);
    } else if (e.key === 'Escape') {
      setSearchOpen(false);
    }
  }

  function adjustLine(delta) {
    setLine((l) => clamp(Math.round((l + delta) * 2) / 2, 0, 6));
  }

  const displayName = detail?.shortName ?? detail?.name ?? 'Select player';

  if (matchReport && panelMode === 'thisMatch') {
    return (
      <section className="lmApp">
        <header className="nav glass lmMatchModeHead">
          <div className="navTitleWrap">
            <div className="navTitle">Player stats — this match</div>
            <div className="navSubtitle">
              {homeTeam} vs {awayTeam}
              {!fixture ? ' · pick a fixture on Predictions' : ''}
            </div>
          </div>
          <div className="statsModeTabs" role="tablist" aria-label="Players view">
            <button
              type="button"
              role="tab"
              className="stageTab active"
              aria-selected
              onClick={() => setPanelMode('thisMatch')}
            >
              This match
            </button>
            <button
              type="button"
              role="tab"
              className="stageTab"
              aria-selected={false}
              onClick={() => setPanelMode('workstation')}
            >
              Season / props
            </button>
          </div>
        </header>

        {!fixture ? (
          <section className="glass card infoCard">
            <p className="muted small">
              Select a completed match on <strong>Predictions</strong> first — player box-score stats appear here
              after full time.
            </p>
          </section>
        ) : null}

        {fixture ? (
          <>
            <MatchReport homeTeam={homeTeam} awayTeam={awayTeam} report={matchReport} compact />
            <MatchPlayerTable
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              players={matchPlayers}
              loading={matchPlayersLoading}
            />
          </>
        ) : null}
      </section>
    );
  }

  return (
    <section className="lmApp">
      {matchReport ? (
        <header className="nav glass lmMatchModeHead">
          <div className="statsModeTabs" role="tablist" aria-label="Players view">
            <button
              type="button"
              role="tab"
              className="stageTab"
              aria-selected={false}
              onClick={() => setPanelMode('thisMatch')}
            >
              This match
            </button>
            <button
              type="button"
              role="tab"
              className="stageTab active"
              aria-selected
            >
              Season / props
            </button>
          </div>
        </header>
      ) : null}
      <div className="lmThreeCol">
        {/* Left — Profile */}
        <aside className="lmColLeft">
          <div className="lmProfileHead">
            <span className="lmProfileTitle">Profile</span>
          </div>

          <PlayerProfileCard detail={detail} loading={detailLoading} />

          <div className="lmBrowseBlock">
            <p className="lmBrowseLabel">Browse by team</p>
            <div className="selectWrap">
              <select
                className="select lmBrowseSelect"
                defaultValue=""
                onChange={(e) => {
                  const t = e.target.value;
                  if (!t) return;
                  fetch(`/api/players?team=${encodeURIComponent(t)}&limit=1`)
                    .then((r) => r.json())
                    .then((j) => j.players?.[0]?.id && selectPlayer(j.players[0].id));
                }}
              >
                <option value="">Pick a nation…</option>
                {teams.map((t) => (
                  <option key={t.team} value={t.team}>
                    {t.team}
                  </option>
                ))}
              </select>
              <div className="chev" aria-hidden="true">
                ⌄
              </div>
            </div>
            <p className="muted small lmBrowseHint">1,248 World Cup squad players · search by name above</p>
          </div>
        </aside>

        {/* Center — Workstation */}
        <main className="lmColCenter">
          <div className="lmWorkstationHead">
            <div className="lmPlayerChip" ref={searchRef}>
              <span className="lmTeamBadge">{teamMonogram(detail?.team)}</span>
              <div className="lmPlayerSearchWrap">
                <input
                  ref={inputRef}
                  type="search"
                  className="lmPlayerSearchInput"
                  placeholder={detail ? displayName : 'Search player…'}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => {
                    setSearchOpen(true);
                    if (!query) runSearch('');
                  }}
                  onKeyDown={onSearchKeyDown}
                  aria-label="Search players"
                  aria-expanded={searchOpen}
                  aria-autocomplete="list"
                />
                {searchOpen ? (
                  <div className="lmSearchDropdown" role="listbox">
                    {searchLoading ? <div className="lmSearchItem muted">Searching…</div> : null}
                    {!searchLoading && !searchResults.length ? (
                      <div className="lmSearchItem muted">No players found</div>
                    ) : null}
                    {searchResults.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        role="option"
                        aria-selected={i === highlightIdx}
                        className={`lmSearchItem${i === highlightIdx ? ' highlighted' : ''}${p.id === selectedId ? ' current' : ''}`}
                        onMouseEnter={() => setHighlightIdx(i)}
                        onClick={() => selectPlayer(p.id)}
                      >
                        <span className="lmSearchItemName">{p.shortName ?? p.name}</span>
                        <span className="lmSearchItemMeta">
                          {p.team} · {p.position}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="lmWorkstationTab active">Workstation</div>

          {detail?.dataSource === 'api-football' ? (
            <p className="lmDataBadge live">
              Live data · API-Football · International caps only
              {detail.importMeta?.competitions?.length ? (
                <span className="lmDataComps"> ({detail.importMeta.competitions.slice(0, 3).join(', ')})</span>
              ) : null}
            </p>
          ) : detail?.dataSource === 'sofascore' || detail?.dataSource === 'manual' ? (
            <p className="lmDataBadge curated">
              Curated data · Sofascore · International
              {detail.importMeta?.competitions?.length ? (
                <span className="lmDataComps"> ({detail.importMeta.competitions.slice(0, 3).join(', ')})</span>
              ) : null}
            </p>
          ) : detail ? (
            <p className="lmDataBadge estimate">Estimated data · add data/{detail.team?.toLowerCase()}.json or run import</p>
          ) : null}

          {error ? <div className="error lmError">{error}</div> : null}

          {detailLoading && !detail ? (
            <div className="lmLoading">Loading player…</div>
          ) : null}

          {detail ? (
            <div className="lmWorkstationBody">
              <div className="lmFilterRow">
                <FilterSelect
                  label="Stat Type"
                  value={statTypeId}
                  onChange={setStatTypeId}
                  options={statTypes.map((s) => ({ value: s.id, label: s.label }))}
                />
                <FilterSelect
                  label="Timeframe"
                  value={timeframe}
                  onChange={setTimeframe}
                  options={TIMEFRAMES.map((t) => ({ value: t.id, label: t.label }))}
                />
                <FilterSelect
                  label="Split"
                  value={split}
                  onChange={setSplit}
                  options={[
                    { value: 'all', label: 'Home+Away' },
                    { value: 'home', label: 'Home' },
                    { value: 'away', label: 'Away' }
                  ]}
                />
                <FilterSelect
                  label="Opponent"
                  value={opponent}
                  onChange={setOpponent}
                  options={opponents}
                />
              </div>

              <div className="lmHitSummary">
                <div className="lmHitStat over">
                  <span className="lmHitDot" />
                  <span className="lmHitLabel">Over</span>
                  <strong>{hitRate.overPct}%</strong>
                  <span className="lmHitFrac">
                    {hitRate.overCount}/{hitRate.total}
                  </span>
                </div>
                <div className="lmHitStat under">
                  <span className="lmHitDot" />
                  <span className="lmHitLabel">Under</span>
                  <strong>{hitRate.underPct}%</strong>
                  <span className="lmHitFrac">
                    {hitRate.underCount}/{hitRate.total}
                  </span>
                </div>
              </div>

              <p className="lmChartCaption">
                {statType.label} per game · oldest → newest (left to right) · hover for details
              </p>

              <WorkstationChart games={filteredGames} statType={statType} line={line} />

              <div className="lmGameTableWrap">
                <table className="lmGameTable">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Opponent</th>
                      <th>Comp</th>
                      <th>Min</th>
                      <th>{statType.code}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGames.map((g, i) => {
                      const val = statValue(g, statType);
                      const valDisplay =
                        statType.id === 'cleanSheet' ? (val ? 'Yes' : 'No') : val;
                      return (
                        <tr key={`${g.date}-${i}`} className={isOver(val, line) ? 'lmRowHit' : ''}>
                          <td>{formatGameDate(g.date)}</td>
                          <td>{g.opponent}</td>
                          <td>{g.competition}</td>
                          <td>{g.minutes}&apos;</td>
                          <td>{valDisplay}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            !detailLoading && (
              <div className="lmLoading">Search for a player to open the workstation.</div>
            )
          )}
        </main>

        {/* Right — My Picks */}
        <aside className="lmColRight">
          <div className="lmPicksHead">
            <span>My Picks</span>
            <span className="lmPicksCount">0</span>
          </div>

          <div className="lmLineBox">
            <span className="lmLineLabel">Line</span>
            <div className="lmLineControl">
              <button type="button" className="lmLineBtn" onClick={() => adjustLine(-0.5)} aria-label="Decrease line">
                −
              </button>
              <span className="lmLineValue">{Number.isInteger(line) ? line : line.toFixed(1)}</span>
              <button type="button" className="lmLineBtn" onClick={() => adjustLine(0.5)} aria-label="Increase line">
                +
              </button>
            </div>
          </div>

          <button type="button" className="lmPickBtn over" disabled={!detail}>
            <span>
              Over <strong>{statType.code}</strong>
            </span>
            <span className="lmPickPct">{hitRate.overPct}%</span>
          </button>
          <button type="button" className="lmPickBtn under" disabled={!detail}>
            <span>
              Under <strong>{statType.code}</strong>
            </span>
            <span className="lmPickPct">{hitRate.underPct}%</span>
          </button>

          {detail ? (
            <div className="lmPickContext">
              <p className="lmPickContextName">{displayName}</p>
              <p className="muted small">
                {detail.team} · Group {detail.group} · {filteredGames.length} games
              </p>
              <p className="muted small">
                {statType.id === 'goalsOrAssists'
                  ? `G+A combined · ${filteredGames.length} games`
                  : statType.id === 'cleanSheet'
                    ? `Clean sheet rate · ${filteredGames.length} games`
                    : `${filteredGames.length} games in sample`}
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

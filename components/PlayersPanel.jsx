'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const BET_TYPES = [
  { id: 'shots', code: 'SHO', label: 'Shots', field: 'shots', defaultLine: 0 },
  { id: 'goals', code: 'GLS', label: 'Goals', field: 'goals', defaultLine: 0 },
  { id: 'assists', code: 'AST', label: 'Assists', field: 'assists', defaultLine: 0 },
  { id: 'shotsOnTarget', code: 'SOT', label: 'SOT', field: 'shotsOnTarget', defaultLine: 0 },
  { id: 'goalsOrAssists', code: 'G or AST', label: 'G or AST', field: null, defaultLine: 0 },
  { id: 'fouls', code: 'Fouls', label: 'Fouls', field: 'fouls', defaultLine: 1 },
  { id: 'cards', code: 'Cards', label: 'Cards', field: 'cards', defaultLine: 0 }
];

const TIMEFRAMES = [
  { id: 'season', label: 'Season' },
  { id: 'l5', label: 'Last 5' },
  { id: 'l10', label: 'Last 10' }
];

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function statValue(game, betType) {
  if (betType.id === 'goalsOrAssists') {
    return (game.goals ?? 0) + (game.assists ?? 0);
  }
  return game[betType.field] ?? 0;
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

function computeHitRate(games, betType, line) {
  if (!games.length) return { overPct: 0, underPct: 0, overCount: 0, underCount: 0, total: 0 };
  let overCount = 0;
  for (const g of games) {
    if (isOver(statValue(g, betType), line)) overCount++;
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

function WorkstationChart({ games, betType, line }) {
  if (!games.length) {
    return <div className="lmChartEmpty">No games for this filter.</div>;
  }

  const values = games.map((g) => statValue(g, betType));
  const maxVal = Math.max(...values, line + 0.5, 1);
  const yMax = Math.ceil(maxVal + 0.5);
  const yTicks = Array.from({ length: yMax + 1 }, (_, i) => i);

  return (
    <div className="lmChartWrap">
      <div className="lmChartY">
        {yTicks.reverse().map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="lmChartArea">
        <div className="lmChartGrid">
          {yTicks.map((t) => (
            <div key={t} className="lmChartGridLine" style={{ bottom: `${(t / yMax) * 100}%` }} />
          ))}
          {line >= 0 ? (
            <div className="lmChartLineMarker" style={{ bottom: `${(line / yMax) * 100}%` }} />
          ) : null}
        </div>
        <div className="lmChartBars">
          {games.map((g, i) => {
            const val = values[i];
            const h = (val / yMax) * 100;
            const hit = isOver(val, line);
            return (
              <div key={`${g.date}-${i}`} className="lmChartBarCol" title={`${g.opponent}: ${val}`}>
                <div
                  className={`lmChartBar${hit ? ' hit' : ''}`}
                  style={{ height: `${Math.max(h, val > 0 ? 4 : 0)}%` }}
                />
              </div>
            );
          })}
        </div>
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

export default function PlayersPanel() {
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

  const [betTypeId, setBetTypeId] = useState('shots');
  const [timeframe, setTimeframe] = useState('season');
  const [split, setSplit] = useState('all');
  const [opponent, setOpponent] = useState('all');
  const [line, setLine] = useState(0);

  const searchRef = useRef(null);
  const inputRef = useRef(null);

  const betType = useMemo(() => BET_TYPES.find((b) => b.id === betTypeId) ?? BET_TYPES[0], [betTypeId]);

  const opponents = useMemo(() => {
    const ops = new Set((detail?.gameLog ?? []).map((g) => g.opponent));
    return [{ value: 'all', label: 'All Opponents' }, ...[...ops].map((o) => ({ value: o, label: o }))];
  }, [detail]);

  const filteredGames = useMemo(
    () => filterGames(detail?.gameLog, { timeframe, opponent, split }),
    [detail, timeframe, opponent, split]
  );

  const hitRate = useMemo(
    () => computeHitRate(filteredGames, betType, line),
    [filteredGames, betType, line]
  );

  useEffect(() => {
    setLine(betType.defaultLine);
  }, [betTypeId, betType.defaultLine]);

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

  return (
    <section className="lmApp">
      <div className="lmThreeCol">
        {/* Left — Profile */}
        <aside className="lmColLeft">
          <div className="lmProfileHead">
            <span className="lmProfileTitle">Profile</span>
          </div>
          <div className="lmModeTabs">
            <button type="button" className="lmModeTab active">
              Player
            </button>
            <button type="button" className="lmModeTab disabled" disabled title="Coming soon">
              Parlay
            </button>
            <button type="button" className="lmModeTab disabled" disabled title="Coming soon">
              SGP
            </button>
          </div>
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
          ) : detail ? (
            <p className="lmDataBadge estimate">Estimated data · run npm run import:api-football for real stats</p>
          ) : null}

          {error ? <div className="error lmError">{error}</div> : null}

          {detailLoading && !detail ? (
            <div className="lmLoading">Loading player…</div>
          ) : null}

          {detail ? (
            <>
              <div className="lmFilterRow">
                <FilterSelect
                  label="Bet Type"
                  value={betTypeId}
                  onChange={setBetTypeId}
                  options={BET_TYPES.map((b) => ({ value: b.id, label: b.label }))}
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

              <WorkstationChart games={filteredGames} betType={betType} line={line} />

              <div className="lmGameTableWrap">
                <table className="lmGameTable">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Opponent</th>
                      <th>Comp</th>
                      <th>Min</th>
                      <th>{betType.code}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGames.map((g, i) => {
                      const val = statValue(g, betType);
                      return (
                        <tr key={`${g.date}-${i}`} className={isOver(val, line) ? 'lmRowHit' : ''}>
                          <td>{g.date?.slice(5)}</td>
                          <td>{g.opponent}</td>
                          <td>{g.competition}</td>
                          <td>{g.minutes}&apos;</td>
                          <td>{val}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
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
              Over <strong>{betType.code}</strong>
            </span>
            <span className="lmPickPct">{hitRate.overPct}%</span>
          </button>
          <button type="button" className="lmPickBtn under" disabled={!detail}>
            <span>
              Under <strong>{betType.code}</strong>
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
                {betType.id === 'goalsOrAssists'
                  ? `G+A combined · ${filteredGames.length} games`
                  : `${filteredGames.length} games in sample`}
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

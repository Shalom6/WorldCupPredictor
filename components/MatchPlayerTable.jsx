'use client';

import { useMemo, useState } from 'react';

const COLUMNS = [
  { key: 'name', label: 'Player', sort: (a, b) => a.name.localeCompare(b.name) },
  { key: 'team', label: 'Team', sort: (a, b) => a.team.localeCompare(b.team) },
  { key: 'position', label: 'Pos', sort: (a, b) => a.position.localeCompare(b.position) },
  { key: 'minutes', label: 'Min', sort: (a, b) => b.minutes - a.minutes, numeric: true },
  { key: 'goals', label: 'G', sort: (a, b) => b.goals - a.goals, numeric: true },
  { key: 'assists', label: 'A', sort: (a, b) => b.assists - a.assists, numeric: true },
  { key: 'shots', label: 'Sh', sort: (a, b) => b.shots - a.shots, numeric: true },
  { key: 'shotsOnTarget', label: 'SOT', sort: (a, b) => b.shotsOnTarget - a.shotsOnTarget, numeric: true },
  { key: 'cards', label: 'Crd', sort: (a, b) => b.cards - a.cards, numeric: true }
];

function SortHeader({ col, sortKey, sortDir, onSort }) {
  const active = sortKey === col.key;
  return (
    <th scope="col">
      <button
        type="button"
        className={`matchPlayerSortBtn${active ? ' active' : ''}`}
        onClick={() => onSort(col.key)}
      >
        {col.label}
        {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
}

export default function MatchPlayerTable({ homeTeam, awayTeam, players, loading = false }) {
  const [sortKey, setSortKey] = useState('minutes');
  const [sortDir, setSortDir] = useState('desc');
  const [teamFilter, setTeamFilter] = useState('all');

  const filtered = useMemo(() => {
    let rows = players ?? [];
    if (teamFilter === 'home') rows = rows.filter((p) => p.team === homeTeam);
    if (teamFilter === 'away') rows = rows.filter((p) => p.team === awayTeam);
    const col = COLUMNS.find((c) => c.key === sortKey) ?? COLUMNS[3];
    return [...rows].sort((a, b) => {
      const cmp = col.sort(a, b);
      return sortDir === 'desc' ? cmp : -cmp;
    });
  }, [players, teamFilter, homeTeam, awayTeam, sortKey, sortDir]);

  function onSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'team' || key === 'position' ? 'asc' : 'desc');
    }
  }

  if (loading) {
    return (
      <section className="glass card matchPlayerTableCard">
        <p className="muted">Loading player stats…</p>
      </section>
    );
  }

  if (!players?.length) {
    return (
      <section className="glass card matchPlayerTableCard">
        <div className="cardTitle">This match — player stats</div>
        <p className="muted small">No per-player logs for this fixture yet.</p>
      </section>
    );
  }

  return (
    <section className="glass card matchPlayerTableCard">
      <div className="matchPlayerTableHead">
        <div className="cardTitle">This match — player stats</div>
        <div className="matchPlayerFilters" role="group" aria-label="Filter by team">
          {[
            { id: 'all', label: 'Both' },
            { id: 'home', label: homeTeam },
            { id: 'away', label: awayTeam }
          ].map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`stageTab matchPlayerFilter${teamFilter === opt.id ? ' active' : ''}`}
              onClick={() => setTeamFilter(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="matchPlayerTableWrap">
        <table className="matchPlayerTable">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <SortHeader key={col.key} col={col} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr
                key={row.id}
                className={row.goals > 0 || row.assists > 0 ? 'matchPlayerRowHighlight' : undefined}
              >
                <td>{row.name}</td>
                <td>
                  <span className={`tag${row.team === homeTeam ? ' matchStatTagHome' : ' matchStatTagAway'}`}>
                    {row.team}
                  </span>
                </td>
                <td className="muted">{row.position?.replace('Midfielder', 'MID').replace('Defender', 'DEF').replace('Forward', 'FWD').replace('Goalkeeper', 'GK') ?? '—'}</td>
                <td>{row.minutes}</td>
                <td>{row.goals || '—'}</td>
                <td>{row.assists || '—'}</td>
                <td>{row.shots || '—'}</td>
                <td>{row.shotsOnTarget || '—'}</td>
                <td>{row.cards || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

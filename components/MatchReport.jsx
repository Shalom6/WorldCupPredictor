'use client';

import { formatMatchMinute, MATCH_TEAM_STAT_ROWS } from '../src/matchResult.js';

function StatBar({ label, homeTeam, awayTeam, home, away, suffix = '', proportional = false }) {
  const av = Number(home);
  const bv = Number(away);
  if (!Number.isFinite(av) || !Number.isFinite(bv)) return null;

  let homeShare;
  let awayShare;
  if (proportional || suffix === '%') {
    const total = av + bv;
    homeShare = total > 0 ? (av / total) * 100 : 50;
    awayShare = total > 0 ? (bv / total) * 100 : 50;
  } else {
    const denom = Math.max(av, bv, 1);
    homeShare = (av / denom) * 100;
    awayShare = (bv / denom) * 100;
  }

  const fmt = (n) => `${n}${suffix}`;

  return (
    <div className="statRow matchStatRow">
      <div className="statHead">
        <div className="statLabel">{label}</div>
        <div className="statVals">
          <span className="tag matchStatTagHome">{homeTeam}</span> {fmt(home)}{' '}
          <span className="dot">·</span>{' '}
          <span className="tag matchStatTagAway">{awayTeam}</span> {fmt(away)}
        </div>
      </div>
      <div
        className="matchStatSplit"
        role="img"
        aria-label={`${label}: ${homeTeam} ${fmt(home)}, ${awayTeam} ${fmt(away)}`}
      >
        <div className="matchStatSplitHome" style={{ width: `${homeShare}%` }} />
        <div className="matchStatSplitAway" style={{ width: `${awayShare}%` }} />
      </div>
    </div>
  );
}

function GoalColumn({ team, goals }) {
  if (!goals?.length) {
    return <p className="muted small matchReportNoGoals">No goals</p>;
  }

  return (
    <ol className="matchReportGoals">
      {goals.map((goal, i) => (
        <li key={`${goal.name}-${goal.minute}-${i}`} className="matchReportGoal">
          <span className="matchReportMinute">{formatMatchMinute(goal.minute)}</span>
          <span className="matchReportScorer">{goal.name}</span>
          {goal.assist ? (
            <span className="matchReportAssist muted small">Assist: {goal.assist}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export default function MatchReport({ homeTeam, awayTeam, report, compact = false }) {
  if (!report) return null;

  const homeGoals = report.scorers?.home ?? [];
  const awayGoals = report.scorers?.away ?? [];
  const stats = report.teamStats ?? {};
  const statRows = MATCH_TEAM_STAT_ROWS.filter((row) => stats[row.key]);

  return (
    <section className={`glass card matchReport${compact ? ' matchReportCompact' : ''}`}>
      <div className="matchReportHead">
        <div className="cardTitle">{compact ? 'Final score' : 'Match report'}</div>
        <div className="matchReportScoreline" aria-label="Final score">
          <span className="matchReportTeam">{homeTeam}</span>
          <span className="matchReportScore">
            {report.homeScore}–{report.awayScore}
          </span>
          <span className="matchReportTeam">{awayTeam}</span>
        </div>
      </div>

      {(homeGoals.length || awayGoals.length) ? (
        <div className="matchReportGoalsGrid">
          <div className="matchReportGoalsCol">
            <div className="sourceLabel">{homeTeam}</div>
            <GoalColumn team={homeTeam} goals={homeGoals} />
          </div>
          <div className="matchReportGoalsCol">
            <div className="sourceLabel">{awayTeam}</div>
            <GoalColumn team={awayTeam} goals={awayGoals} />
          </div>
        </div>
      ) : null}

      {statRows.length ? (
        <div className="matchReportStats">
          <div className="sourceLabel">Team stats</div>
          <div className="statsGrid">
            {statRows.map((row) => {
              const values = stats[row.key];
              return (
                <StatBar
                  key={row.key}
                  label={row.label}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  home={values.home}
                  away={values.away}
                  suffix={row.suffix ?? ''}
                  proportional
                />
              );
            })}
          </div>
        </div>
      ) : null}

      {report.notes ? <p className="muted small matchReportNotes">{report.notes}</p> : null}
    </section>
  );
}

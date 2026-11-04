import React, { useState } from 'react';
import { CIRCUITS } from '@f1m/core';
import { teamDef, type DriverContract, type LeagueTeam, type RaceResultRecord } from './LeagueDashboard';
import Helmet from './Helmet';

interface ResultRow {
  driverId: string;
  teamId: string;
  position: number;
  points: number;
  retired: boolean;
  retireReason?: string;
}

export default function ChampionshipPanel({
  teams,
  drivers,
  results,
  myTeamId
}: {
  teams: LeagueTeam[];
  drivers: DriverContract[];
  results: RaceResultRecord[];
  myTeamId?: string;
}) {
  const ordered = [...results].sort((a, b) => b.gpIndex - a.gpIndex);
  const [selected, setSelected] = useState<string | null>(ordered[0]?.id ?? null);
  const [showAll, setShowAll] = useState(false);
  const race = ordered.find((r) => r.id === selected) ?? ordered[0];

  const nameOf = (driverId: string) => drivers.find((d) => d.driverId === driverId)?.name ?? driverId;
  const teamOfLeague = (leagueTeamId: string) => teams.find((t) => t.id === leagueTeamId);
  const sortedTeams = [...teams].sort((a, b) => b.points - a.points);

  const rows: ResultRow[] = race ? JSON.parse(race.resultsJson) : [];
  const visible = showAll ? rows : rows.filter((r) => r.points > 0 || r.teamId === myTeamId);

  return (
    <div className="stack">
      {race ? (
        <div className="card">
          <div className="lap-head">
            <h2>
              {race.id === ordered[0].id ? 'Última corrida' : `GP ${race.gpIndex + 1}`}: {CIRCUITS.find((c) => c.id === race.circuitId)?.gp}
            </h2>
            <button className="ghost small-btn" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Só pontuadores' : 'Ver todos'}
            </button>
          </div>
          {ordered.length > 1 && (
            <div className="row" style={{ gap: '6px', flexWrap: 'wrap', margin: '6px 0 10px' }}>
              {ordered.map((r) => (
                <button key={r.id} className={`small-btn ${r.id === race.id ? 'primary' : 'ghost'}`} onClick={() => setSelected(r.id)}>
                  GP {r.gpIndex + 1}
                </button>
              ))}
            </div>
          )}
          <table className="table compact">
            <tbody>
              {visible.map((r) => {
                const t = teamOfLeague(r.teamId);
                return (
                  <tr key={r.driverId} className={r.teamId === myTeamId ? 'mine' : ''}>
                    <td className="num">{r.retired ? 'AB' : r.position}</td>
                    <td>
                      {nameOf(r.driverId)}
                      <div className="muted small">
                        {teamDef(t?.teamId ?? '')?.name}
                        {r.retired && r.retireReason ? ` · ${r.retireReason}` : ''}
                      </div>
                    </td>
                    <td className="num right">{r.points > 0 ? `+${r.points}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <h2>Campeonato</h2>
          <p className="muted">Nenhuma corrida disputada ainda. O primeiro resultado aparece aqui depois do GP 1.</p>
        </div>
      )}

      <div className="grid two">
        <div className="card">
          <h2>Pilotos</h2>
          <table className="table compact">
            <thead>
              <tr>
                <th>Pos</th>
                <th>Piloto</th>
                <th>Vitórias</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d, idx) => (
                <tr key={d.id} className={d.leagueTeamId === myTeamId ? 'mine' : ''}>
                  <td className="num">{idx + 1}</td>
                  <td>
                    <span className="who">
                      <Helmet id={d.driverId} size={22} />
                      {d.name}
                    </span>
                  </td>
                  <td className="num">{d.wins}</td>
                  <td className="num">{d.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Construtores</h2>
          <table className="table compact">
            <thead>
              <tr>
                <th>Pos</th>
                <th>Equipe</th>
                <th>Gerente</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {sortedTeams.map((t, idx) => {
                const d = teamDef(t.teamId);
                return (
                  <tr key={t.id} className={t.id === myTeamId ? 'mine' : ''}>
                    <td className="num">{idx + 1}</td>
                    <td>
                      <span className="who">
                        <i className="team-chip" style={{ background: d?.color }} />
                        {d?.name}
                      </span>
                    </td>
                    <td className="muted">{t.isAI ? 'IA' : t.user?.name || t.user?.username}</td>
                    <td className="num">{t.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

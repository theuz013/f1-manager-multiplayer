import React from 'react';
import { teamDef, type DriverContract, type LeagueTeam } from './LeagueDashboard';

export interface HallEntry {
  id: string;
  season: number;
  driverName: string;
  driverTeamId: string;
  driverPoints: number;
  driverWins: number;
  constructorTeamId: string;
  constructorManager: string;
  constructorPoints: number;
}

// Pódio igual ao do solo: campeões e quem marcou história (5+ vitórias ou 20+ pódios)
export default function HallOfFamePanel({ hall, drivers, teams }: { hall: HallEntry[]; drivers: DriverContract[]; teams: LeagueTeam[] }) {
  const titles = (name: string) => hall.filter((h) => h.driverName === name).length;
  const legends = drivers
    .map((d) => ({ d, titles: titles(d.name), team: teams.find((t) => t.id === d.leagueTeamId) }))
    .filter((x) => x.titles > 0 || x.d.wins >= 5 || x.d.podiums >= 20)
    .sort((a, b) => b.titles - a.titles || b.d.wins - a.d.wins || b.d.podiums - a.d.podiums);
  const top = legends.slice(0, 3);
  const order = [top[1], top[0], top[2]];
  const heights = [148, 180, 120];
  const medals = ['🥈', '🥇', '🥉'];
  const colors = ['rgb(201, 211, 220)', 'rgb(245, 197, 66)', 'rgb(228, 164, 109)'];

  const managers = new Map<string, number>();
  hall.forEach((h) => managers.set(h.constructorManager, (managers.get(h.constructorManager) ?? 0) + 1));

  return (
    <div className="stack">
      <div
        className="card"
        style={{ background: 'radial-gradient(700px 260px at 50% 0%,#f5c54222,transparent),var(--panel)', borderColor: 'rgba(245, 197, 66, 0.4)' }}
      >
        <div className="eyebrow" style={{ textAlign: 'center', color: 'rgb(245, 197, 66)' }}>
          Legado desta liga
        </div>
        <h2 style={{ textAlign: 'center', margin: '4px 0 2px' }}>🏛️ Hall da Fama</h2>
        <p className="muted small" style={{ textAlign: 'center' }}>
          Só os pilotos que fizeram algo diferente: campeões, ou quem somou pelo menos 5 vitórias ou 20 pódios. Ordem por títulos, depois vitórias e pódios.
        </p>
        {top.length === 0 ? (
          <p className="muted small" style={{ textAlign: 'center' }}>
            Ninguém entrou ainda. O primeiro campeão da liga aparece aqui no fim da temporada.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginTop: '16px', maxWidth: '560px', marginLeft: 'auto', marginRight: 'auto' }}>
            {order.map((x, i) =>
              x ? (
                <div key={x.d.id} className="hof-col" style={{ flex: '1 1 0%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
                  <div style={{ fontSize: i === 1 ? '2.6rem' : '2rem', lineHeight: 1 }}>{medals[i]}</div>
                  <div style={{ fontWeight: 800, textAlign: 'center', fontSize: i === 1 ? '1.1rem' : '0.95rem', margin: '4px 0 2px', wordBreak: 'break-word' }}>{x.d.name}</div>
                  <div className="muted small" style={{ textAlign: 'center', margin: '0 0 6px' }}>
                    Marcou história na <b>{teamDef(x.team?.teamId ?? '')?.name}</b>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: `${heights[i]}px`,
                      background: `linear-gradient(${colors[i]}, ${colors[i].replace('rgb', 'rgba').replace(')', ', 0.2)')})`,
                      borderRadius: '10px 10px 0 0',
                      borderTop: `4px solid ${teamDef(x.team?.teamId ?? '')?.color}`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      paddingTop: '10px',
                      color: 'rgb(11, 17, 22)'
                    }}
                  >
                    <div style={{ fontSize: '2.2rem', fontWeight: 900, lineHeight: 1 }}>{x.titles}</div>
                    <div style={{ fontWeight: 800, fontSize: '0.7rem', letterSpacing: '0.1em' }}>{x.titles === 1 ? 'TÍTULO' : 'TÍTULOS'}</div>
                    <div style={{ fontSize: '0.72rem', marginTop: '6px', fontWeight: 700, textAlign: 'center', lineHeight: 1.4 }}>
                      {x.d.wins} vitórias
                      <br />
                      {x.d.podiums} pódios
                    </div>
                  </div>
                </div>
              ) : (
                <div key={i} style={{ flex: '1 1 0%' }} />
              )
            )}
          </div>
        )}
      </div>

      <div className="grid two">
        <div className="card">
          <h3>Campeões por temporada</h3>
          {hall.length === 0 && <p className="muted small">A primeira temporada ainda está em andamento.</p>}
          <table className="table compact">
            <tbody>
              {hall.map((h) => (
                <tr key={h.id}>
                  <td className="num">T{h.season}</td>
                  <td>
                    🏆 {h.driverName}
                    <div className="muted small">
                      {teamDef(h.driverTeamId)?.name} · {h.driverPoints} pts · {h.driverWins} vitórias
                    </div>
                  </td>
                  <td>
                    <i className="team-chip" style={{ background: teamDef(h.constructorTeamId)?.color }} /> {teamDef(h.constructorTeamId)?.name}
                    <div className="muted small">
                      {h.constructorManager} · {h.constructorPoints} pts
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Gerentes campeões</h3>
          {managers.size === 0 && <p className="muted small">Nenhum título de construtores ainda.</p>}
          <table className="table compact">
            <tbody>
              {[...managers.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([name, n]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td className="num right">
                      {n} {n === 1 ? 'título' : 'títulos'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

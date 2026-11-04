import React, { useState, useCallback } from 'react';
import { CAR_PARTS, CAR_PART_LABELS, MAX_PART_LEVEL } from '@f1m/core';
import { teamDef, type LeagueTeam, type RaceResultRecord } from './LeagueDashboard';
import { teamAssets } from '../teamAssets';
import Helmet from './Helmet';

const levelsOf = (t: LeagueTeam): Record<string, number> => ({
  ...Object.fromEntries(CAR_PARTS.map((p) => [p, 5])),
  ...(t.carLevels ? JSON.parse(t.carLevels) : {})
});
const avg = (t: LeagueTeam) => {
  const l = levelsOf(t);
  return CAR_PARTS.reduce((s, p) => s + l[p], 0) / CAR_PARTS.length;
};
const fmt = (v: number) => v.toFixed(1).replace('.', ',');

function EvolutionChart({ teams, results, highlight }: { teams: LeagueTeam[]; results: RaceResultRecord[]; highlight: string[] }) {
  const snaps = [...results]
    .filter((r) => r.carAvgJson)
    .sort((a, b) => a.season - b.season || a.gpIndex - b.gpIndex)
    .map((r) => ({ gp: r.gpIndex + 1, avg: JSON.parse(r.carAvgJson!) as Record<string, number> }));
  if (!snaps.length) return <p className="muted small">O gráfico aparece depois do primeiro GP: cada ponto é o nível médio do carro após uma corrida.</p>;
  const series = teams.map((t) => ({ t, pts: [5, ...snaps.map((s) => s.avg[t.id] ?? 5)] }));
  const all = series.flatMap((s) => s.pts);
  const lo = Math.floor(Math.min(...all) * 2) / 2;
  const hi = Math.max(lo + 1, Math.ceil(Math.max(...all) * 2) / 2);
  const W = 600, H = 200, P = 28;
  const x = (i: number) => P + (i * (W - P * 2)) / Math.max(1, snaps.length);
  const y = (v: number) => H - P - ((v - lo) / (hi - lo)) * (H - P * 2);
  return (
    <div className="chart evo">
      <div className="evo-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Nível médio dos carros a cada GP">
          {[lo, (lo + hi) / 2, hi].map((v) => (
            <g key={v}>
              <line x1={P} x2={W - P} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="3 4" />
              <text x={4} y={y(v) + 4} fontSize="10" fill="var(--muted)">{v.toFixed(1).replace('.', ',')}</text>
            </g>
          ))}
          {series
            .sort((a, b) => Number(highlight.includes(a.t.id)) - Number(highlight.includes(b.t.id)))
            .map(({ t, pts }) => {
              const on = highlight.includes(t.id);
              return (
                <polyline
                  key={t.id}
                  fill="none"
                  stroke={teamDef(t.teamId)?.color}
                  strokeWidth={on ? 3 : 1.5}
                  opacity={on ? 1 : 0.25}
                  points={pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                />
              );
            })}
          <text x={x(0)} y={H - 8} fontSize="10" fill="var(--muted)" textAnchor="middle">Início</text>
          {snaps.map((s, i) => (
            <text key={i} x={x(i + 1)} y={H - 8} fontSize="10" fill="var(--muted)" textAnchor="middle">GP {s.gp}</text>
          ))}
        </svg>
      </div>
    </div>
  );
}

export default function RivalsPanel({ teams, myTeam, season, results, leagueCode }: { teams: LeagueTeam[]; myTeam: LeagueTeam; season: number; results: RaceResultRecord[]; leagueCode: string }) {
  const standings = [...teams].sort((a, b) => b.points - a.points);
  const others = standings.filter((t) => t.id !== myTeam.id);
  const [rivalId, setRivalId] = useState(others[0]?.id);
  const [spyResult, setSpyResult] = useState<{ carAvgLevel: number; facilities: Record<string,number> } | null>(null);
  const [spyMsg, setSpyMsg] = useState<string | null>(null);
  const rival = others.find((t) => t.id === rivalId) ?? others[0];

  const doEspionage = useCallback(async () => {
    if (!rival) return;
    if (!window.confirm(`Espionar ${rival.teamId}? Custo: R$ 3,0 mi. A equipe alvo receberá um alerta.`)) return;
    const res = await fetch(`/api/leagues/${leagueCode}/espionage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLeagueTeamId: rival.id })
    });
    const data = await res.json();
    if (res.ok) { setSpyResult(data); setSpyMsg(null); }
    else { setSpyMsg(`⚠️ ${data.error}`); setSpyResult(null); }
  }, [rival, leagueCode]);
  if (!rival) return null;

  const rd = teamDef(rival.teamId);
  const md = teamDef(myTeam.teamId);
  const assets = teamAssets(rival.teamId);
  const rl = levelsOf(rival);
  const ml = levelsOf(myTeam);

  return (
    <div className="stack">
      <div className="card">
        <div className="eyebrow">Paddock · temporada {season}</div>
        <h2>Evolução do P&D</h2>
        <p className="muted small">Nível médio das sete peças de cada carro, no começo da temporada e depois de cada GP. A sua equipe e o rival escolhido aparecem em destaque.</p>
        <EvolutionChart teams={teams} results={results} highlight={[myTeam.id, rival.id]} />
        <div className="evo-legend">
          {others.map((t) => {
            const d = teamDef(t.teamId);
            return (
              <button key={t.id} className={t.id === rival.id ? 'on' : ''} onClick={() => setRivalId(t.id)}>
                <i className="team-chip" style={{ background: d?.color }} />
                {d?.name} · {fmt(avg(t))}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid two">
        <div className="card rival" style={{ '--hero': rd?.color } as React.CSSProperties}>
          <div className="hero-id">
            <img className="badge-logo" src={assets.logo} alt={rd?.name} style={{ height: '37px', maxWidth: '125px' }} />
            <div>
              <h2>{rd?.name}</h2>
              <p className="muted small">
                {standings.findIndex((t) => t.id === rival.id) + 1}º no campeonato · {rival.points} pts ·{' '}
                {rival.isAI ? 'gerida pela IA' : `gerente: ${rival.user?.name || rival.user?.username}`}
              </p>
            </div>
          </div>
          <div className="car-photo" role="img" aria-label={`Carro da ${rd?.name}`} style={{ maxWidth: '560px', aspectRatio: `${assets.ar} / 1` }}>
            <img src={assets.car} alt="" />
          </div>
          <div className="hero-drivers">
            {[...rival.drivers]
              .sort((a) => (a.role === 'titular1' ? -1 : 1))
              .map((d) => (
                <span key={d.id}>
                  <b>{d.role === 'titular1' ? 'P1' : 'P2'}</b> <Helmet id={d.driverId} size={22} /> {d.name} · {d.points} pts
                </span>
              ))}
          </div>
        </div>

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ margin: 0 }}>Peça por peça: {rd?.name} contra você</h3>
            <button className="ghost small-btn" onClick={doEspionage} title="Espionar: R$ 3 mi, 1 por GP">🕵️ Espionar</button>
          </div>
          {spyMsg && <p className="tip small" style={{ margin: '0 0 8px' }}>{spyMsg}</p>}
          {spyResult && (
            <div className="card" style={{ background: 'var(--bg2)', padding: '10px', marginBottom: '10px', fontSize: '12px' }}>
              <b>Relatório de inteligência:</b> nível médio do carro {spyResult.carAvgLevel.toFixed(1)}.{' '}
              Instalações: pesquisa {spyResult.facilities.pesquisa}, túnel {spyResult.facilities.tunel}, fábrica {spyResult.facilities.fabrica}, simulador {spyResult.facilities.simulador}, confiab. {spyResult.facilities.confiabilidade}.
            </div>
          )}
          <p className="muted small">Nível de cada peça hoje.</p>
          <div className="versus">
            <div className="versus-legend">
              <span>
                <i className="team-chip" style={{ background: rd?.color }} />
                {rd?.name}
              </span>
              <span>
                <i className="team-chip" style={{ background: md?.color }} />
                {md?.name}
              </span>
            </div>
            {CAR_PARTS.map((p) => {
              const diff = rl[p] - ml[p];
              return (
                <div key={p} className="versus-row" title={`${CAR_PART_LABELS[p]}: ${rl[p]} contra ${ml[p]}`}>
                  <span className="versus-part">{CAR_PART_LABELS[p]}</span>
                  <div className="versus-bars">
                    <div className="vbar">
                      <div style={{ width: `${(rl[p] / MAX_PART_LEVEL) * 100}%`, background: rd?.color }} />
                    </div>
                    <div className="vbar">
                      <div style={{ width: `${(ml[p] / MAX_PART_LEVEL) * 100}%`, background: md?.color }} />
                    </div>
                  </div>
                  <span className="num versus-num">
                    <b>{rl[p]}</b>
                    <br />
                    {ml[p]}
                  </span>
                  <span className="num small muted versus-delta">{diff === 0 ? '=' : diff > 0 ? `+${diff}` : diff}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

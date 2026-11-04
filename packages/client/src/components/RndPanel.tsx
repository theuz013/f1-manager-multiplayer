import React, { useEffect, useState } from 'react';
import { CAR_PARTS, CAR_PART_LABELS, projectGain, type CarPart } from '@f1m/core';
import { money, type LeagueTeam } from './LeagueDashboard';

interface PartInfo {
  part: CarPart;
  level: number;
  design: number;
  startCost: number;
  required: number;
  maxed: boolean;
  project: { engineers: number; progress: number; required: number; gpsLeft: number } | null;
}

interface RndInfo {
  engineers: number;
  inUse: number;
  salaryPerEngineer: number;
  budget: number;
  parts: PartInfo[];
}

const levelsOf = (t: LeagueTeam): Record<string, number> => ({
  ...Object.fromEntries(CAR_PARTS.map((p) => [p, 5])),
  ...(t.carLevels ? JSON.parse(t.carLevels) : {})
});

export default function RndPanel({
  leagueCode,
  team,
  teams,
  onGoToCar,
  onChanged
}: {
  leagueCode: string;
  team: LeagueTeam;
  teams: LeagueTeam[];
  onGoToCar: () => void;
  onChanged: () => void;
}) {
  const [info, setInfo] = useState<RndInfo | null>(null);
  const [part, setPart] = useState<CarPart>('motor');
  const [eng, setEng] = useState(2);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tunel: number = team.facilities ? JSON.parse(team.facilities).tunel ?? 2 : 2;

  async function load() {
    const res = await fetch(`/api/leagues/${leagueCode}/rnd`);
    if (res.ok) setInfo(await res.json());
  }
  useEffect(() => {
    load();
  }, [leagueCode, team.budget]);

  async function post(action: string, body: object) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/leagues/${leagueCode}/rnd/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      setMsg(res.ok ? data.message ?? null : `⚠️ ${data.error}`);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!info) return <div className="card"><p className="muted">Carregando o P&D...</p></div>;

  const free = info.engineers - info.inUse;
  const selected = info.parts.find((p) => p.part === part)!;
  const ready = info.parts.filter((p) => p.design > p.level);
  const active = info.parts.filter((p) => p.project);

  // Recomendação: peças em que o carro está mais atrás das outras equipes da liga
  const myLevels = levelsOf(team);
  const ranking = CAR_PARTS.map((p) => {
    const all = teams.map((t) => levelsOf(t)[p]);
    const rank = all.filter((v) => v > myLevels[p]).length + 1;
    return { p, rank, best: Math.max(...all), level: myLevels[p] };
  })
    .filter((r) => !info.parts.find((x) => x.part === r.p)?.project)
    .sort((a, b) => b.rank - a.rank || b.best - b.level - (a.best - a.level))
    .slice(0, 3);

  const engStep = (value: number, set: (n: number) => void, max: number) => (
    <span className="stepper">
      <button aria-label="Menos engenheiros" disabled={value <= 1 || busy} onClick={() => set(value - 1)}>
        −
      </button>
      <b>{value}</b>
      <button aria-label="Mais engenheiros" disabled={value >= max || busy} onClick={() => set(value + 1)}>
        +
      </button>
    </span>
  );

  return (
    <div className="grid two">
      <div className="stack">
        <div className="card">
          <h3>Recomendação do diretor técnico</h3>
          <p className="muted small">As peças em que o seu carro está mais atrás das outras {teams.length - 1} equipes da liga.</p>
          <div className="stack tight">
            {ranking.map((r, i) => (
              <div key={r.p} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span>
                  {i + 1}º <b>{CAR_PART_LABELS[r.p]}</b>
                  <span className="muted small">
                    {' '}
                    · nível {r.level}, {r.rank}º de {teams.length}, melhor {r.best}
                  </span>
                </span>
                <button className="small-btn" onClick={() => setPart(r.p)}>
                  Escolher
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Engenheiros</h2>
          <div className="eng-pool">
            {Array.from({ length: info.engineers }, (_, i) => (
              <i key={i} className={i < info.inUse ? 'on' : ''} />
            ))}
          </div>
          <p>
            {info.inUse} de {info.engineers} engenheiros em projetos · {money(info.inUse * info.salaryPerEngineer)} por GP.
          </p>
          <p className="muted small">Mais engenheiros num projeto, mais rápido ele termina. O salário deles sai do caixa depois de cada GP.</p>
          {info.inUse > 0 && (
            <button
              className="ghost small-btn"
              style={{ marginTop: '8px' }}
              disabled={busy}
              onClick={() => window.confirm('Turno extra de P&D: R$ 2,0 mi para aplicar 1 GP extra de progresso em todos os projetos agora. Continuar?') && post('extra-shift', {})}
            >
              ⚡ Turno extra de P&D — R$ 2,0 mi
            </button>
          )}
        </div>

        <div className="card">
          <h2>Projetos em andamento</h2>
          {!active.length && <p className="muted small">Nenhum projeto agora.</p>}
          {active.map((p) => {
            const pj = p.project!;
            const pct = Math.min(100, (pj.progress / pj.required) * 100);
            return (
              <div key={p.part} className="project">
                <div className="lap-head">
                  <b>
                    {CAR_PART_LABELS[p.part]} · nível {p.design + 1}
                  </b>
                  <span className="num">{Math.round(pct)}%</span>
                </div>
                <div className="bar">
                  <div style={{ width: `${pct}%` }} />
                </div>
                <div className="lap-head small">
                  <span className="muted">
                    {projectGain({ part: p.part, engineers: pj.engineers }, tunel)} pts/GP · pronto em {pj.gpsLeft} {pj.gpsLeft === 1 ? 'GP' : 'GPs'}
                  </span>
                </div>
                <div className="row tight">
                  {engStep(pj.engineers, (n) => post('engineers', { part: p.part, engineers: n }), pj.engineers + free)}
                  <button
                    className="ghost"
                    disabled={busy}
                    onClick={() => window.confirm(`Cancelar o projeto de ${CAR_PART_LABELS[p.part]}? O valor investido não volta.`) && post('cancel', { part: p.part })}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            );
          })}
          {ready.length > 0 && (
            <p className="tip">
              Prontas para fabricar: {ready.map((p) => CAR_PART_LABELS[p.part]).join(', ')}.{' '}
              <button className="link" onClick={onGoToCar}>
                Ir para o Carro
              </button>
            </p>
          )}
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <h2>Novo projeto</h2>
          <label className="field">
            <span>Peça</span>
            <select value={part} onChange={(e) => setPart(e.target.value as CarPart)}>
              {CAR_PARTS.map((p) => (
                <option key={p} value={p}>
                  {CAR_PART_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>Engenheiros ({free} livres)</span>
            {engStep(Math.min(eng, Math.max(1, free)), setEng, Math.max(1, free))}
          </div>
          {selected.project ? (
            <p className="tip small">Já existe um projeto para essa peça.</p>
          ) : selected.maxed ? (
            <p className="tip small">Essa peça já está no nível máximo.</p>
          ) : (
            <p className="tip small">
              Nível projetado hoje: {selected.design}. O projeto libera o nível {selected.design + 1} para fabricar. {selected.required} pontos, cerca de{' '}
              {Math.ceil(selected.required / Math.max(1, projectGain({ part, engineers: Math.min(eng, Math.max(1, free)) }, tunel)))} GPs.
            </p>
          )}
          {msg && <p className="small">{msg}</p>}
          <button
            className="primary"
            disabled={busy || free < 1 || !!selected.project || selected.maxed || info.budget < selected.startCost}
            onClick={() => post('start', { part, engineers: Math.min(eng, free) })}
          >
            Começar · {money(selected.startCost)}
          </button>
        </div>

        <div className="card">
          <h3>Peças</h3>
          <table className="table compact">
            <thead>
              <tr>
                <th>Peça</th>
                <th className="right">No carro</th>
                <th className="right">Projetada</th>
              </tr>
            </thead>
            <tbody>
              {info.parts.map((p) => (
                <tr key={p.part}>
                  <td>{CAR_PART_LABELS[p.part]}</td>
                  <td className="num right">{p.level}</td>
                  <td className={`num right ${p.design > p.level ? 'gain' : ''}`}>{p.design}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { CIRCUITS, SETUP_PARAMETERS, SETUP_LABELS, QUALI_RUNS, TIRE_SPECS, engineerRange, type CarSetup, type TireCompound } from '@f1m/core';
import { teamDef, type LeagueTeam } from './LeagueDashboard';
import Helmet from './Helmet';

interface Lap {
  id: string;
  driverId: string;
  session: number;
  setup: CarSetup;
  time: number;
  deleted: boolean;
  fit: number;
  feedback: string[];
  hints: Partial<Record<keyof CarSetup, number>>;
  auto: boolean;
}

interface Timing {
  driverId: string;
  name: string;
  leagueTeamId: string;
  teamId: string;
  best: (number | null)[];
  out: number | null;
}

interface WeekendState {
  phase: 'practice' | 'q1' | 'q2' | 'q3' | 'grid';
  currentSession: 1 | 2 | 3 | null;
  qualiSession: number;
  windows: Record<'practiceEnd' | 'q1End' | 'q2End' | 'q3End' | 'lockAt' | 'raceAt', string>;
  isLocked: boolean;
  practiceLimit: number;
  practiceUsed: number;
  setups: Record<string, CarSetup>;
  myLaps: Lap[];
  timing: Timing[];
  runsLeft: Record<string, number>;
  grid: string[] | null;
}

export type WeekendView = 'treino' | 'quali' | 'estrategia';

const lapTime = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(3).padStart(6, '0')}`;
};
const surname = (name: string) => name.split(' ').slice(1).join(' ') || name;
const when = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });

function useWeekend(leagueCode: string) {
  const [state, setState] = useState<WeekendState | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function refresh() {
    try {
      const res = await fetch(`/api/leagues/${leagueCode}/weekend`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setState(data);
    } catch (err: any) {
      setError(err.message);
    }
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [leagueCode]);
  return { state, setState, error, setError, refresh };
}

function SetupBox({
  leagueCode,
  team,
  driverId,
  setups,
  laps,
  locked,
  onSaved
}: {
  leagueCode: string;
  team: LeagueTeam;
  driverId: string;
  setups: Record<string, CarSetup>;
  laps: Lap[];
  locked: boolean;
  onSaved: (driverId: string, setup: CarSetup) => void;
}) {
  const setup = setups[driverId];
  const driver = team.drivers.find((d) => d.driverId === driverId)!;
  const other = team.drivers.find((d) => d.driverId !== driverId);
  const mine = laps.filter((l) => l.driverId === driverId);
  const last = mine[mine.length - 1];
  const range = engineerRange(mine);
  const suggestion = range
    ? (Object.fromEntries(SETUP_PARAMETERS.map((p) => [p, Math.round((range[p].lo + range[p].hi) / 2)])) as unknown as CarSetup)
    : null;
  const changes = suggestion ? SETUP_PARAMETERS.filter((p) => suggestion[p] !== setup[p]) : [];
  const timer = useRef<number>();

  function save(id: string, next: CarSetup) {
    onSaved(id, next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      fetch(`/api/leagues/${leagueCode}/weekend/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: id, setup: next })
      });
    }, 400);
  }

  return (
    <div className="stack tight">
      {SETUP_PARAMETERS.map((p) => {
        const g = range?.[p];
        const inside = g && setup[p] >= g.lo && setup[p] <= g.hi;
        return (
          <label key={p} className="slider">
            <div className="slider-head">
              <span>{SETUP_LABELS[p].name}</span>
              <span>
                {g && <span className={`ideal-tag ${inside ? 'in' : ''}`}>ideal {g.lo === g.hi ? g.lo : `${g.lo}–${g.hi}`}</span>}
                <b>{setup[p]}</b>
              </span>
            </div>
            <div className="range-wrap">
              {g && (
                <i
                  className="ideal-band"
                  style={{ '--lo': Math.max(0, g.lo - 0.5), '--hi': Math.min(100, g.hi + 0.5) } as React.CSSProperties}
                  title={`O ideal de ${surname(driver.name)} deve estar entre ${g.lo} e ${g.hi}`}
                />
              )}
              <input
                type="range"
                min={0}
                max={100}
                value={setup[p]}
                disabled={locked}
                onChange={(e) => save(driverId, { ...setup, [p]: Number(e.target.value) })}
              />
            </div>
            <div className="slider-ends">
              <span>{SETUP_LABELS[p].low}</span>
              <span>{SETUP_LABELS[p].high}</span>
            </div>
          </label>
        );
      })}
      <div className="engineer">
        {!last ? (
          <p className="muted small">
            Dê uma volta com {surname(driver.name)}: pelo que o piloto sentir, o engenheiro marca em cada ajuste a faixa onde o ideal dele deve estar.
          </p>
        ) : (
          <>
            <div className="fit-head">
              <span>Acerto na última volta</span>
              <b className={last.fit >= 95 ? 'good' : last.fit >= 80 ? '' : 'warn'}>{last.fit}% do ideal</b>
            </div>
            <div className="fit-bar">
              <i style={{ width: `${last.fit}%` }} />
            </div>
            {changes.length ? (
              <p className="small">
                Sugestão do engenheiro:{' '}
                {changes
                  .map((p) => {
                    const d = suggestion![p] - setup[p];
                    return `${SETUP_LABELS[p].name} ${d > 0 ? '+' : ''}${d} (${d > 0 ? SETUP_LABELS[p].high : SETUP_LABELS[p].low})`;
                  })
                  .join(' · ')}
              </p>
            ) : (
              <p className="small">O acerto está dentro da faixa ideal em todos os ajustes.</p>
            )}
            {!locked && changes.length > 0 && (
              <div className="row">
                <button className="small-btn" onClick={() => save(driverId, suggestion!)}>
                  Aplicar a sugestão
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {!locked && other && (
        <div className="row">
          <button className="ghost small-btn" onClick={() => save(other.driverId, { ...setup })}>
            Copiar este acerto para {surname(other.name)}
          </button>
        </div>
      )}
    </div>
  );
}

function Radio({ laps, driverName }: { laps: Lap[]; driverName: string }) {
  const reversed = [...laps].reverse();
  const item = (l: Lap) => {
    const n = laps.filter((x) => x.session === l.session).indexOf(l) + 1;
    return (
      <li key={l.id}>
        <div className="lap-head">
          <b>
            {l.session === 0 ? 'Treino' : `Q${l.session}`} · volta {n}
            {l.auto ? ' (automática)' : ''}
          </b>
          <span className={`num ${l.deleted ? 'loss' : ''}`}>{l.deleted ? 'anulada' : lapTime(l.time)}</span>
        </div>
        <div className="setup-mini">{SETUP_PARAMETERS.map((p) => `${SETUP_LABELS[p].name.split(' ')[0]} ${l.setup[p]}`).join(' · ')}</div>
        <ul>
          {l.feedback.map((f, i) => (
            <li key={i}>“{f}”</li>
          ))}
        </ul>
        <div className="setup-mini">Engenheiro: acerto em {l.fit}% do ideal</div>
      </li>
    );
  };
  return (
    <div className="radio-last">
      <div className="eyebrow">📻 Rádio de {surname(driverName)}</div>
      {!laps.length && <p className="muted small">Nenhuma volta ainda.</p>}
      {reversed[0] && <ol className="laps">{item(reversed[0])}</ol>}
      {reversed.length > 1 && (
        <details className="gp-help">
          <summary>Voltas anteriores ({reversed.length - 1})</summary>
          <ol className="laps">{reversed.slice(1).map(item)}</ol>
        </details>
      )}
    </div>
  );
}

function DriverTabs({ team, driverId, onDriver }: { team: LeagueTeam; driverId: string; onDriver: (id: string) => void }) {
  return (
    <div className="seg drivers">
      {team.drivers.map((d) => (
        <button key={d.driverId} className={d.driverId === driverId ? 'on' : ''} onClick={() => onDriver(d.driverId)}>
          {d.name}
        </button>
      ))}
    </div>
  );
}

const STOP_DEFAULT: TireCompound[][] = [['medio', 'duro'], ['macio', 'medio', 'duro'], ['macio', 'medio', 'medio', 'duro']];
const DRY: TireCompound[] = ['macio', 'medio', 'duro'];
const PACES: [string, string][] = [
  ['conservar', 'Poupar'],
  ['equilibrado', 'Normal'],
  ['atacar', 'Atacar']
];

function StrategyView({
  leagueCode,
  team,
  gpIndex,
  locked,
  gridPos,
  onSaved
}: {
  leagueCode: string;
  team: LeagueTeam;
  gpIndex: number;
  locked: boolean;
  gridPos: Record<string, number>;
  onSaved: () => void;
}) {
  const circuit = CIRCUITS[gpIndex % CIRCUITS.length];
  const saved = team.strategy ? JSON.parse(team.strategy) : null;
  const [compounds, setCompounds] = useState<TireCompound[]>(saved?.compounds ?? ['medio', 'duro']);
  const [pitLaps, setPitLaps] = useState<number[]>(saved?.pitLaps ?? [Math.round(circuit.laps * 0.45)]);
  const [pace, setPace] = useState(team.tacticPace || 'equilibrado');
  const [msg, setMsg] = useState<string | null>(null);

  function setStops(n: number) {
    setCompounds(STOP_DEFAULT[n - 1]);
    setPitLaps(Array.from({ length: n }, (_, i) => Math.round((circuit.laps * (i + 1)) / (n + 1))));
  }

  async function submit() {
    setMsg(null);
    const res = await fetch(`/api/leagues/${leagueCode}/strategy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tacticPace: pace, strategy: { compounds, pitLaps } })
    });
    const data = await res.json();
    setMsg(res.ok ? 'Estratégia salva.' : data.error);
    if (res.ok) onSaved();
  }

  const bounds = [0, ...pitLaps, circuit.laps];
  const twoCompounds = new Set(compounds).size >= 2;

  return (
    <div className="stack">
      <div className="grid two">
        <div className="card">
          <div className="eyebrow">
            {circuit.gp} · {circuit.laps} voltas
          </div>
          <h2>Estratégia de corrida</h2>
          <p className="muted">
            Monte o plano da equipe: pneus, voltas de parada e ritmo. Pode mudar até 1h antes da largada; depois o grid fecha.
          </p>
          <div className="hero-drivers">
            {team.drivers.map((d) => (
              <span key={d.id}>
                <Helmet id={d.driverId} size={22} /> {d.name}
                <em className="muted"> · {gridPos[d.driverId] ? `larga em ${gridPos[d.driverId]}º` : 'grid ainda não definido'}</em>
              </span>
            ))}
          </div>
        </div>

        <div className="card strategy">
          <div className="field">
            <span>Paradas</span>
            <div className="seg">
              {[1, 2, 3].map((n) => (
                <button key={n} className={pitLaps.length === n ? 'on' : ''} disabled={locked} onClick={() => setStops(n)}>
                  {n} {n === 1 ? 'parada' : 'paradas'}
                </button>
              ))}
            </div>
          </div>
          <div className="stints">
            {compounds.map((c, i) => {
              const len = bounds[i + 1] - bounds[i];
              const life = TIRE_SPECS[c].life;
              return (
                <div key={i} className="stint">
                  <div className="stint-head">
                    <b>Stint {i + 1}</b>
                    <span className={`muted small ${len > life * 1.15 ? 'loss' : ''}`}>
                      {len} voltas · pneu dura ~{life}
                    </span>
                  </div>
                  <div className="seg">
                    {DRY.map((t) => (
                      <button
                        key={t}
                        className={c === t ? 'on' : ''}
                        disabled={locked}
                        onClick={() => setCompounds(compounds.map((x, j) => (j === i ? t : x)))}
                      >
                        <i className="tyre" style={{ borderColor: TIRE_SPECS[t].color }} /> {TIRE_SPECS[t].label}
                      </button>
                    ))}
                  </div>
                  {i < pitLaps.length && (
                    <div className="pit-lap">
                      <span className="muted small">Para na volta</span>
                      <span className="stepper">
                        <button
                          disabled={locked || pitLaps[i] <= bounds[i] + 1}
                          onClick={() => setPitLaps(pitLaps.map((x, j) => (j === i ? x - 1 : x)))}
                          aria-label="Parar uma volta antes"
                        >
                          −
                        </button>
                        <b>{pitLaps[i]}</b>
                        <button
                          disabled={locked || pitLaps[i] >= bounds[i + 2] - 1}
                          onClick={() => setPitLaps(pitLaps.map((x, j) => (j === i ? x + 1 : x)))}
                          aria-label="Parar uma volta depois"
                        >
                          +
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="muted small">
            Pelo regulamento, quem para usa pelo menos dois compostos diferentes.
            {!twoCompounds && <b style={{ color: 'var(--warn)' }}> Este plano usa um composto só.</b>}
          </p>
          <div className="field">
            <span>Ritmo de corrida</span>
            <div className="seg">
              {PACES.map(([k, label]) => (
                <button key={k} className={pace === k ? 'on' : ''} disabled={locked} onClick={() => setPace(k)}>
                  {label}
                </button>
              ))}
            </div>
            <span className="muted small">Atacar ganha tempo por volta e gasta mais pneu; poupar perde tempo e gasta menos.</span>
          </div>
          <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
            <button className="primary" disabled={locked || !twoCompounds} onClick={submit}>
              Salvar estratégia
            </button>
            {msg && <span className="small muted">{msg}</span>}
            {locked && <span className="small muted">🔒 Grid fechado: estratégia travada.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WeekendPanel({
  leagueCode,
  team,
  teams,
  gpIndex,
  view,
  onLeagueChanged
}: {
  leagueCode: string;
  team: LeagueTeam;
  teams: LeagueTeam[];
  gpIndex: number;
  view: WeekendView;
  onLeagueChanged: () => void;
}) {
  const { state, setState, error, setError, refresh } = useWeekend(leagueCode);
  const [driverId, setDriverId] = useState(team.drivers[0]?.driverId ?? '');
  const [busy, setBusy] = useState(false);
  const circuit = CIRCUITS[gpIndex % CIRCUITS.length];

  if (error && !state) return <div className="card"><p className="muted">{error}</p></div>;
  if (!state) return <div className="card"><p className="muted">Carregando o fim de semana...</p></div>;

  const driver = team.drivers.find((d) => d.driverId === driverId) ?? team.drivers[0];
  const parcFerme = state.phase === 'grid';
  const gridPos = Object.fromEntries((state.grid ?? []).map((id, i) => [id, i + 1]));

  function onSaved(id: string, setup: CarSetup) {
    setState((s) => (s ? { ...s, setups: { ...s.setups, [id]: setup } } : s));
  }

  async function run(kind: 'practice' | 'quali') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueCode}/weekend/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: driver.driverId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const box = (session: number) => (
    <div className="card">
      <h3>Box</h3>
      <SetupBox
        leagueCode={leagueCode}
        team={team}
        driverId={driver.driverId}
        setups={state.setups}
        laps={state.myLaps.filter((l) => !l.deleted)}
        locked={parcFerme}
        onSaved={onSaved}
      />
      <div className="dock">
        <Radio laps={state.myLaps.filter((l) => l.driverId === driver.driverId && (session === 0 ? l.session === 0 : l.session > 0))} driverName={driver.name} />
        <DriverTabs team={team} driverId={driver.driverId} onDriver={setDriverId} />
        {error && (
          <p role="alert" className="small" style={{ color: 'var(--danger)', margin: 0 }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );

  if (view === 'estrategia') {
    return <StrategyView leagueCode={leagueCode} team={team} gpIndex={gpIndex} locked={state.isLocked} gridPos={gridPos} onSaved={onLeagueChanged} />;
  }

  if (view === 'treino') {
    const left = state.practiceLimit - state.practiceUsed;
    return (
      <div className="stack">
        <div className="card quali-head">
          <div>
            <div className="eyebrow">{circuit.gp} · treino livre</div>
            <h2>{state.phase === 'practice' ? 'Treino livre aberto' : 'Treino livre encerrado'}</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {state.phase === 'practice'
                ? `Termina ${when(state.windows.practiceEnd)}. ${left} de ${state.practiceLimit} voltas restantes para a equipe.`
                : 'A classificação já começou: o acerto continua mudando entre as voltas até o fim do Q3.'}
            </p>
          </div>
          <p className="tip small" style={{ margin: 0, maxWidth: '420px' }}>
            <b>Engenheiro:</b> {circuit.dica}
          </p>
        </div>
        <div className="grid two">
          {box(0)}
          <div className="card">
            <h3>Pista</h3>
            <p className="muted small">
              Cada volta mostra o tempo, o que o piloto sentiu e a % do acerto em relação ao ideal dele. Cada piloto tem um ideal próprio: o que serve para um
              pode não servir para o outro.
            </p>
            <div className="dock-actions">
              <button className="primary" disabled={busy || state.phase !== 'practice' || left <= 0} onClick={() => run('practice')}>
                Mandar {surname(driver.name)} para a pista ({left} {left === 1 ? 'volta' : 'voltas'})
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Classificação
  const session = state.currentSession;
  const shown = (session ?? (state.qualiSession > 0 ? state.qualiSession : 1)) as 1 | 2 | 3;
  const sessionEnd = session ? state.windows[`q${session}End` as 'q1End'] : null;
  const myRuns = state.runsLeft[driver.driverId] ?? 0;
  const myOut = state.timing.find((t) => t.driverId === driver.driverId)?.out;
  const closing = session && state.qualiSession !== session - 1;
  const order = parcFerme && state.grid
    ? state.grid.map((id) => state.timing.find((t) => t.driverId === id)!).filter(Boolean)
    : [...state.timing]
        .filter((t) => !t.out || t.out >= shown)
        .sort((a, b) => (a.best[shown - 1] ?? Infinity) - (b.best[shown - 1] ?? Infinity));
  const reference = order[0]?.best[(parcFerme ? 3 : shown) - 1] ?? null;
  const cutAt = shown === 1 ? 16 : shown === 2 ? 10 : null;

  return (
    <div className="stack">
      <div className="card quali-head">
        <div>
          <div className="eyebrow">{circuit.gp} · classificação</div>
          <h2>
            {parcFerme
              ? 'Grid definido'
              : state.phase === 'practice'
              ? `Q1 abre ${when(state.windows.practiceEnd)}`
              : closing
              ? `Encerrando o Q${session! - 1}...`
              : `Q${session} em andamento`}
          </h2>
          <div className="quali-steps">
            {[1, 2, 3].map((s) => (
              <span key={s} className={`quali-step ${s <= state.qualiSession ? 'past' : s === session ? 'now' : ''}`}>
                Q{s}
              </span>
            ))}
          </div>
        </div>
        <div className="quali-cond">
          <span className="muted small">
            {sessionEnd ? `Q${session} fecha ${when(sessionEnd)}` : parcFerme ? 'Parque fechado até a corrida' : `Q1 ${QUALI_RUNS[1]} · Q2 ${QUALI_RUNS[2]} · Q3 ${QUALI_RUNS[3]} voltas por piloto`}
          </span>
          <span className="muted small">
            <i className="tyre" style={{ borderColor: TIRE_SPECS.macio.color }} /> {TIRE_SPECS.macio.label}
          </span>
        </div>
      </div>

      <div className="grid two">
        <div className="stack">
          {box(1)}
          {!parcFerme && (
            <div className="card">
              <div className="dock-actions">
                {myOut ? (
                  <span className="muted small">
                    {surname(driver.name)} caiu no Q{myOut}.
                  </span>
                ) : (
                  <button className="primary" disabled={busy || !session || !!closing || myRuns <= 0} onClick={() => run('quali')}>
                    Mandar {surname(driver.name)} para a pista ({myRuns} {myRuns === 1 ? 'volta' : 'voltas'})
                  </button>
                )}
              </div>
              <p className="muted small" style={{ marginBottom: 0 }}>
                Os 6 mais lentos caem no Q1 e no Q2. Piloto que não marcar volta na sessão faz uma sozinho com o acerto salvo quando ela fechar. A pista fica um pouco
                mais rápida a cada sessão.
              </p>
            </div>
          )}
        </div>

        <div className="card">
          <h3>{parcFerme ? 'Grid de largada' : `Tempos do Q${shown}`}</h3>
          <table className="table compact">
            <tbody>
              {order.map((t, i) => {
                const best = parcFerme ? t.best.slice(0, t.out ?? 3).reverse().find((x) => x !== null) ?? null : t.best[shown - 1];
                const d = teamDef(t.teamId);
                const mine = t.leagueTeamId === team.id;
                const manager = teams.find((x) => x.id === t.leagueTeamId);
                return (
                  <React.Fragment key={t.driverId}>
                    {!parcFerme && cutAt && i === cutAt && (
                      <tr>
                        <td colSpan={4} className="muted small" style={{ textAlign: 'center', borderTop: '2px solid var(--danger)' }}>
                          zona de eliminação
                        </td>
                      </tr>
                    )}
                    <tr className={mine ? 'mine' : ''}>
                      <td className="num">{i + 1}</td>
                      <td>
                        <span className="who">
                          <Helmet id={t.driverId} size={22} />
                          {t.name}
                        </span>
                        <div className="muted small">
                          <i className="team-chip" style={{ background: d?.color }} /> {d?.name}
                          {manager && !manager.isAI ? ` · ${manager.user?.name || manager.user?.username}` : ' · IA'}
                        </div>
                      </td>
                      <td className="num right">{best !== null ? lapTime(best) : '—'}</td>
                      <td className="num right muted small">{best !== null && reference !== null && i > 0 ? `+${(best - reference).toFixed(3)}` : ''}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

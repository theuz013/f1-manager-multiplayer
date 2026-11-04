import React, { useState, useEffect } from 'react';
import { TEAMS } from '@f1m/core';
import Helmet from './Helmet';

interface DraftDriver {
  id: string;
  driverId: string;
  name: string;
  age: number;
  pot: number;
  ger: number;
  talento: number;
  classificacao: number;
  gestaoPneus: number;
  concentracao: number;
  experiencia: number;
  condicionamento?: number;
  agressividade?: number;
  potencial?: number;
  personalidade: string;
  signingFee: number;
  salario: number;
  isDrafted: boolean;
}

interface DraftPick {
  id: string;
  pickNumber: number;
  round: number;
  pot: number;
  driverId: string | null;
  deadline: string;
  autoPicked: boolean;
  leagueTeam: {
    id: string;
    teamId: string;
    isAI: boolean;
    user?: {
      username: string;
      name: string;
    };
  };
}

interface DraftState {
  leagueCode: string;
  status: string;
  totalPicks: number;
  completedPicksCount: number;
  currentPick: DraftPick | null;
  picks: DraftPick[];
  availablePot1: DraftDriver[];
  availablePot2: DraftDriver[];
  allDrivers: DraftDriver[];
}

interface SnakeDraftRoomProps {
  leagueCode: string;
  username: string;
  onDraftCompleted: () => void;
}

// Mesmas siglas e faixas do cartão de piloto do modo solo
const STATS: [keyof DraftDriver, string, string][] = [
  ['talento', 'RIT', 'Ritmo de corrida (talento)'],
  ['classificacao', 'VOL', 'Volta lançada (classificação)'],
  ['gestaoPneus', 'PNE', 'Gestão de pneus'],
  ['concentracao', 'FOC', 'Concentração'],
  ['agressividade', 'ATQ', 'Ataque (agressividade)'],
  ['experiencia', 'EXP', 'Experiência'],
  ['condicionamento', 'FÍS', 'Condicionamento físico'],
  ['potencial', 'POT', 'Potencial']
];
const tier = (d: DraftDriver) => (d.talento >= 92 ? 'craque' : d.ger >= 85 ? 'elite' : d.ger >= 75 ? 'ouro' : d.ger >= 65 ? 'prata' : 'bronze');
const brl = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',');

export default function SnakeDraftRoom({ leagueCode, username, onDraftCompleted }: SnakeDraftRoomProps) {
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [activePotTab, setActivePotTab] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    fetchDraftState();
    const interval = setInterval(fetchDraftState, 3000);
    return () => clearInterval(interval);
  }, [leagueCode]);

  // Timer regressivo para a escolha atual
  useEffect(() => {
    if (!draftState?.currentPick?.deadline) return;
    const timer = setInterval(() => {
      const diff = new Date(draftState.currentPick!.deadline).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('00:00 (tempo esgotado)');
      } else {
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [draftState?.currentPick?.deadline]);

  // O pote da vez abre sozinho para quem está escolhendo
  useEffect(() => {
    if (draftState?.currentPick) setActivePotTab(draftState.currentPick.pot as 1 | 2);
  }, [draftState?.currentPick?.id]);

  async function fetchDraftState() {
    try {
      const res = await fetch(`/api/leagues/${leagueCode}/draft`);
      if (res.ok) {
        const data = await res.json();
        setDraftState(data);
        if (data.status === 'SEASON') onDraftCompleted();
      }
    } catch {
      // Ignora falhas temporárias de rede no polling
    }
  }

  async function handlePick(driverId: string) {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueCode}/draft/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao realizar escolha.');
      }
      const updated = await res.json();
      setDraftState(updated);
      if (updated.status === 'SEASON') onDraftCompleted();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!draftState) {
    return (
      <div className="card">
        <p className="muted">Carregando o draft de pilotos...</p>
      </div>
    );
  }

  const currentPick = draftState.currentPick;
  const isMyTurn = !!currentPick && !currentPick.leagueTeam.isAI && currentPick.leagueTeam.user?.username === username;
  const currentTeamDef = currentPick ? TEAMS.find((t) => t.id === currentPick.leagueTeam.teamId) : null;
  const activePotDrivers = activePotTab === 1 ? draftState.availablePot1 : draftState.availablePot2;
  const taken = draftState.picks.filter((p) => p.driverId);

  return (
    <div className="stack">
      <div className="card quali-head">
        <div>
          <div className="eyebrow">Snake draft de pilotos · liga {leagueCode}</div>
          <h2>
            {draftState.completedPicksCount} de {draftState.totalPicks} escolhas feitas
          </h2>
          <p className="muted small" style={{ margin: 0 }}>
            Cada equipe contrata 1 piloto do Pote 1 (Elite) e 1 do Pote 2 (Desenvolvimento). No Pote 2 a ordem se inverte.
          </p>
        </div>
        {currentPick && (
          <div
            className="card"
            style={{ margin: 0, borderColor: isMyTurn ? 'var(--accent)' : 'var(--line)', borderLeft: `4px solid ${currentTeamDef?.color}` }}
          >
            <div className="eyebrow">{isMyTurn ? '🌟 Sua vez de escolher' : 'Na vez'}</div>
            <b style={{ fontSize: '1.1rem' }}>
              {currentTeamDef?.name} · {currentPick.leagueTeam.user?.name || currentPick.leagueTeam.user?.username || 'IA'}
            </b>
            <div className="small" style={{ color: isMyTurn ? 'var(--accent)' : 'var(--warn)' }}>
              Escolha #{currentPick.pickNumber} · Pote {currentPick.pot} · tempo restante {timeLeft}
            </div>
          </div>
        )}
      </div>

      {actionError && (
        <p role="alert" className="tip small" style={{ color: 'var(--danger)', margin: 0 }}>
          ⚠️ {actionError}
        </p>
      )}

      <div className="card">
        <h3>Sequência do draft</h3>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {draftState.picks.map((p) => {
            const tm = TEAMS.find((t) => t.id === p.leagueTeam.teamId);
            const chosen = draftState.allDrivers.find((d) => d.driverId === p.driverId);
            return (
              <span
                key={p.id}
                className={`snake-pick-badge ${currentPick?.id === p.id ? 'active' : ''}`}
                style={{ opacity: p.driverId ? 0.75 : 1, borderLeft: `3px solid ${tm?.color || 'var(--line)'}` }}
                title={chosen ? `#${p.pickNumber} ${tm?.name}: ${chosen.name}` : `#${p.pickNumber} ${tm?.name} (Pote ${p.pot})`}
              >
                <b>#{p.pickNumber}</b>
                {chosen ? (
                  <>
                    <Helmet id={chosen.driverId} size={18} />
                    {chosen.name.split(' ').slice(-1)[0]}
                  </>
                ) : (
                  <span>{tm?.name.split(' ')[0]}</span>
                )}
                <small className="muted">P{p.pot}</small>
              </span>
            );
          })}
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div className="seg">
          <button className={activePotTab === 1 ? 'on' : ''} onClick={() => setActivePotTab(1)}>
            Pote 1 · Elite ({draftState.availablePot1.length}) · luvas R$ 5,0 mi
          </button>
          <button className={activePotTab === 2 ? 'on' : ''} onClick={() => setActivePotTab(2)}>
            Pote 2 · Desenvolvimento ({draftState.availablePot2.length}) · luvas R$ 2,0 mi
          </button>
        </div>
        {isMyTurn && (
          <span className="small" style={{ color: 'var(--accent)' }}>
            Escolha um piloto do Pote {currentPick!.pot}
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '14px' }}>
        {activePotDrivers.map((d) => {
          const canDraftThis = isMyTurn && currentPick?.pot === d.pot;
          const [first, ...rest] = d.name.split(' ');
          return (
            <div key={d.driverId} className="card" style={{ display: 'grid', gap: '10px', justifyItems: 'center', margin: 0 }}>
              <div className={`pilot-card ${tier(d)} md`} title={`${d.name}: geral ${d.ger}`}>
                <div className="pc-top">
                  <div className="pc-ovr">
                    <b>{d.ger}</b>
                    <span>GER</span>
                  </div>
                  <Helmet id={d.driverId} size={64} />
                </div>
                <div className="pc-name">
                  <small>{first}</small>
                  <b>{rest.join(' ')}</b>
                </div>
                <dl className="pc-stats">
                  {STATS.map(([key, abbr, title]) => (
                    <div key={key} title={title}>
                      <dd>{(d[key] as number | undefined) ?? '—'}</dd>
                      <dt>{abbr}</dt>
                    </div>
                  ))}
                </dl>
                <div className="pc-foot">{d.age} anos</div>
              </div>
              <div style={{ width: '100%' }}>
                <div className="dh-chips" style={{ display: 'flex', justifyContent: 'center' }}>
                  <span className="trait">{d.personalidade.charAt(0).toUpperCase() + d.personalidade.slice(1)}</span>
                </div>
                <p className="muted small" style={{ textAlign: 'center', margin: '6px 0' }}>
                  Salário R$ {brl(d.salario, 2)} mi/GP · luvas R$ {brl(d.signingFee)} mi
                </p>
                <button className="primary" style={{ width: '100%' }} disabled={!canDraftThis || loading} onClick={() => handlePick(d.driverId)}>
                  {canDraftThis ? 'Contratar' : isMyTurn ? 'Escolha do outro pote' : 'Aguardando a vez'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {taken.length > 0 && (
        <div className="card">
          <h3>Já contratados</h3>
          <table className="table compact">
            <tbody>
              {taken.map((p) => {
                const d = draftState.allDrivers.find((x) => x.driverId === p.driverId);
                const tm = TEAMS.find((t) => t.id === p.leagueTeam.teamId);
                if (!d) return null;
                return (
                  <tr key={p.id}>
                    <td className="num">#{p.pickNumber}</td>
                    <td>
                      <span className="who">
                        <Helmet id={d.driverId} size={22} />
                        {d.name}
                      </span>
                    </td>
                    <td>
                      <i className="team-chip" style={{ background: tm?.color }} /> {tm?.name}
                    </td>
                    <td className="num right">GER {d.ger}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { CAR_PARTS, CAR_PART_LABELS, CIRCUITS, nextWeekendMilestone, TEAMS, SEASON_CALENDAR_SIZE } from '@f1m/core';
import RaceResultsModal from './RaceResultsModal';
import TeamPanel from './TeamPanel';
import CarPanel from './CarPanel';
import FinancePanel from './FinancePanel';
import { teamAssets } from '../teamAssets';
import Helmet from './Helmet';
import ChampionshipPanel from './ChampionshipPanel';
import RivalsPanel from './RivalsPanel';
import MarketPanel from './MarketPanel';
import RndPanel from './RndPanel';
import PaddockPanel, { type PaddockState } from './PaddockPanel';
import HallOfFamePanel, { type HallEntry } from './HallOfFamePanel';
import WeekendPanel, { type WeekendView } from './WeekendPanel';

export interface DriverContract {
  id: string;
  driverId: string;
  name: string;
  age: number;
  ger: number;
  talento: number;
  classificacao: number;
  gestaoPneus: number;
  concentracao: number;
  experiencia: number;
  condicionamento: number;
  agressividade: number;
  potencial: number;
  personalidade: string;
  salario: number;
  contractEnds: number;
  role: string;
  points: number;
  wins: number;
  podiums: number;
  poles: number;
  fastestLaps: number;
  leagueTeamId: string;
}

export interface LeagueTeam {
  id: string;
  teamId: string;
  isAI: boolean;
  budget: number;
  points: number;
  carLevels: string | null;
  carWear: string | null;
  facilities: string | null;
  tacticPace: string;
  setup: string | null;
  strategy: string | null;
  rndJson: string | null;
  user?: {
    username: string;
    name: string;
  };
  drivers: DriverContract[];
}

interface LeagueDetails {
  id: string;
  code: string;
  name: string;
  status: string;
  season: number;
  gpIndex: number;
  nextRaceAt: string | null;
  isLocked: boolean;
  admin: {
    username: string;
    name: string;
  };
  teams: LeagueTeam[];
  raceResults: RaceResultRecord[];
  hallOfFame: HallEntry[];
}

export interface RaceResultRecord {
  id: string;
  season: number;
  gpIndex: number;
  circuitId: string;
  resultsJson: string;
  carAvgJson: string | null;
}

type TabId = WeekendView | 'painel' | 'carro' | 'equipe' | 'financas' | 'campeonato' | 'rivais' | 'mercado' | 'pd' | 'hall' | 'paddock';

const shortGp = (gp: string) => gp.replace(/^GP (da|do|de|dos|das) /, '');
const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

// Mesma ordem e nomes das abas do modo solo; [id, rótulo, só para quem tem equipe]
const TABS: [TabId, string, boolean][] = [
  ['painel', 'Painel', false],
  ['paddock', 'Paddock', false],
  ['treino', 'Treino', true],
  ['quali', 'Classificação', true],
  ['estrategia', 'Estratégia', true],
  ['carro', 'Carro', true],
  ['pd', 'P&D', true],
  ['equipe', 'Equipe', true],
  ['mercado', 'Mercado', true],
  ['financas', 'Finanças', true],
  ['campeonato', 'Campeonato', false],
  ['rivais', 'Rivais', true],
  ['hall', 'Hall da Fama', false]
];

export const money = (v: number) => `R$ ${v.toFixed(1).replace('.', ',')} mi`;
export const teamDef = (teamId: string) => TEAMS.find((t) => t.id === teamId);

interface LeagueDashboardProps {
  leagueCode: string;
  username: string;
  onLeaveLeague: () => void;
  onHeaderInfo?: (info: { budget: number; label: string } | null) => void;
}

export default function LeagueDashboard({ leagueCode, username, onLeaveLeague, onHeaderInfo }: LeagueDashboardProps) {
  const [league, setLeague] = useState<LeagueDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('painel');
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [noMaster, setNoMaster] = useState(false);
  const [paddock, setPaddock] = useState<Pick<PaddockState, 'pendingInterview' | 'pendingReplies'> | null>(null);
  const [adminMsg, setAdminMsg] = useState<string | null>(null);
  const [countdownText, setCountdownText] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    fetchLeague();
    const interval = setInterval(fetchLeague, 8000);
    return () => clearInterval(interval);
  }, [leagueCode]);

  useEffect(() => {
    if (!league?.nextRaceAt) return;
    const timer = setInterval(() => {
      const diff = new Date(league.nextRaceAt!).getTime() - Date.now();
      if (diff <= 0) {
        setCountdownText('Processando simulação...');
      } else {
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setCountdownText(`${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [league?.nextRaceAt]);

  // Caixa e etapa no topo da tela, como no solo
  useEffect(() => {
    const team = league?.teams.find((t) => t.user?.username === username);
    if (!league || !team) return onHeaderInfo?.(null);
    const gp = CIRCUITS[league.gpIndex % CIRCUITS.length];
    onHeaderInfo?.({
      budget: team.budget,
      label: league.status === 'ENDED' ? `Temporada ${league.season} encerrada` : `Temporada ${league.season} · GP ${league.gpIndex + 1}/${SEASON_CALENDAR_SIZE} · ${gp.gp}`
    });
  }, [league, username]);
  useEffect(() => () => onHeaderInfo?.(null), []);

  async function fetchLeague() {
    try {
      const res = await fetch(`/api/leagues/${leagueCode}`);
      if (!res.ok) throw new Error('Não foi possível carregar a liga.');
      setLeague(await res.json());
      const pd = await fetch(`/api/leagues/${leagueCode}/paddock`);
      if (pd.ok) setPaddock(await pd.json());
      const sp = await fetch(`/api/leagues/${leagueCode}/sponsors`);
      if (sp.ok) {
        const s = await sp.json();
        setNoMaster(!s.active.some((x: { kind: string }) => x.kind === 'master') && s.offers.some((x: { kind: string }) => x.kind === 'master'));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdvance() {
    if (!league?.nextRaceAt) return;
    const step = nextWeekendMilestone(league.nextRaceAt, league.gpIndex + 1);
    if (!step) return;
    if (!window.confirm(`${step.label}?\n\n${step.effect}\n\nIsso vale para todos os participantes da liga.`)) return;
    setAdvancing(true);
    try {
      const res = await fetch(`/api/leagues/${leagueCode}/weekend/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: step.key })
      });
      const data = await res.json();
      setAdminMsg(res.ok ? `✓ ${data.message}` : `⚠️ ${data.error}`);
      await fetchLeague();
    } finally {
      setAdvancing(false);
    }
  }

  async function handleNextSeason() {
    if (!league) return;
    const next = league.season + 1;
    if (
      !window.confirm(
        `Encerrar a temporada ${league.season} e abrir a ${next}?\n\nCampeões e classificação final vão para o Hall da Fama, os pontos zeram, os contratos são renovados, as peças voltam novas e cada equipe recebe a verba da categoria. Isso vale para todos os participantes.`
      )
    )
      return;
    setAdvancing(true);
    try {
      const res = await fetch(`/api/leagues/${leagueCode}/next-season`, { method: 'POST' });
      const data = await res.json();
      setAdminMsg(res.ok ? `✓ ${data.message}` : `⚠️ ${data.error}`);
      await fetchLeague();
    } finally {
      setAdvancing(false);
    }
  }

  async function handleSimulateNow() {
    if (
      !window.confirm(
        `Correr o GP ${(league?.gpIndex ?? 0) + 1} agora?\n\nO treino e a classificação que faltam são encerrados (quem não andou faz voltas automáticas), a corrida é simulada e a liga passa para o próximo GP. Isso vale para todos os participantes.`
      )
    )
      return;
    try {
      setSimulating(true);
      const res = await fetch(`/api/leagues/${leagueCode}/simulate-now`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao simular GP');
      setAdminMsg(`✓ ${data.message}`);
      await fetchLeague();
      setShowResultsModal(true);
    } catch (err: any) {
      alert(`Falha na simulação: ${err.message}`);
    } finally {
      setSimulating(false);
    }
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(leagueCode.toUpperCase());
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  if (loading) {
    return (
      <div className="card">
        <p className="muted">Carregando a liga...</p>
      </div>
    );
  }

  if (error || !league) {
    return (
      <div className="card">
        <h3>Erro ao carregar liga</h3>
        <p className="muted">{error}</p>
        <button onClick={onLeaveLeague}>Voltar ao Lobby</button>
      </div>
    );
  }

  const circuit = CIRCUITS[league.gpIndex] || CIRCUITS[0];
  const isAdmin = league.admin.username === username;
  const userTeam = league.teams.find((t) => t.user?.username === username);
  const nextStep = league.nextRaceAt ? nextWeekendMilestone(league.nextRaceAt, league.gpIndex + 1) : null;
  const sortedTeams = [...league.teams].sort((a, b) => b.points - a.points);
  const allDrivers = league.teams.flatMap((t) => t.drivers ?? []).sort((a, b) => b.points - a.points || b.wins - a.wins);
  const myPos = userTeam ? sortedTeams.findIndex((t) => t.id === userTeam.id) + 1 : 0;
  const ahead = myPos > 1 ? sortedTeams[myPos - 2] : null;
  const def = userTeam ? teamDef(userTeam.teamId) : undefined;
  const assets = userTeam ? teamAssets(userTeam.teamId) : null;

  // Alertas no estilo do Painel do solo, a partir do estado da liga
  const alerts: { level: 'perigo' | 'aviso' | 'info'; text: string; tab?: TabId }[] = [];
  if (paddock?.pendingInterview) alerts.push({ level: 'aviso', text: `A imprensa quer ouvir você sobre o ${paddock.pendingInterview.gp}.`, tab: 'paddock' });
  if (paddock?.pendingReplies.length)
    alerts.push({ level: 'aviso', text: `${paddock.pendingReplies.map((r) => r.from).join(', ')} criticou sua equipe na imprensa. Responda no mural.`, tab: 'paddock' });
  if (userTeam && league.status === 'SEASON') {
    const wear: Record<string, number> = userTeam.carWear ? JSON.parse(userTeam.carWear) : {};
    const worn = (min: number, max = 101) =>
      CAR_PARTS.filter((p) => (wear[p] ?? 0) >= min && (wear[p] ?? 0) < max).map((p) => CAR_PART_LABELS[p].toLowerCase());
    const msLeft = league.nextRaceAt ? new Date(league.nextRaceAt).getTime() - Date.now() : Infinity;

    if (noMaster) alerts.push({ level: 'aviso', text: 'A equipe está sem patrocinador master. Há ofertas esperando em Finanças.', tab: 'financas' });
    if (userTeam.budget < 0) alerts.push({ level: 'perigo', text: 'Caixa negativo: nenhuma compra é possível até entrar dinheiro de prêmios.', tab: 'financas' });
    const critical = worn(80);
    if (critical.length) alerts.push({ level: 'perigo', text: `Desgaste crítico (80%+): ${critical.join(', ')}. Troque antes da corrida.`, tab: 'carro' });
    const high = worn(50, 80);
    if (high.length) alerts.push({ level: 'aviso', text: `Peças passando de 50% de desgaste: ${high.join(', ')}.`, tab: 'carro' });
    if (!league.isLocked && msLeft - 3600000 < 3 * 3600000)
      alerts.push({ level: 'aviso', text: 'O grid fecha em menos de 3 horas. Depois disso nada pode ser alterado para este GP.', tab: 'estrategia' });
    const levelsNow: Record<string, number> = userTeam.carLevels ? JSON.parse(userTeam.carLevels) : {};
    const designs: Record<string, number> = userTeam.rndJson ? JSON.parse(userTeam.rndJson).designs : {};
    const readyParts = CAR_PARTS.filter((p) => (designs[p] ?? 0) > (levelsNow[p] ?? 5)).map((p) => CAR_PART_LABELS[p]);
    if (readyParts.length) alerts.push({ level: 'info', text: `Peças novas prontas para fabricar: ${readyParts.join(', ')}.`, tab: 'carro' });
    if (!userTeam.setup && !league.isLocked)
      alerts.push({ level: 'info', text: 'Acerto e estratégia ainda não salvos: a equipe corre com o padrão do engenheiro.', tab: 'estrategia' });
  }

  return (
    <div className="league-dashboard">
      <nav className="tabs grouped">
        {TABS.filter(([, , mine]) => !mine || userTeam).map(([id, label]) => (
          <button key={id} className={activeTab === id ? 'on' : 'tab-off'} onClick={() => setActiveTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <main>
        <div className="view">
          {activeTab === 'painel' && (
            <div className="stack">
              {userTeam && def && assets && (
                <div className="card hero" style={{ '--hero': def.color } as React.CSSProperties}>
                  <div className="hero-id">
                    <img className="badge-logo" src={assets.logo} alt={def.name} style={{ height: '37px', maxWidth: '125px' }} />
                    <div>
                      <div className="eyebrow">
                        Temporada {league.season} · {league.name} ·{' '}
                        <button className="link" onClick={handleCopyCode} title="Copiar código de convite">
                          {copiedCode ? 'código copiado' : `código ${league.code}`}
                        </button>
                        {isAdmin && ' · Administrador'}
                      </div>
                      <h2>{def.name}</h2>
                      <div className="hero-drivers">
                        {userTeam.drivers.map((d) => (
                          <span key={d.id}>
                            <Helmet id={d.driverId} size={22} /> {d.name}
                            <em className="muted"> · {allDrivers.findIndex((x) => x.id === d.id) + 1}º</em>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div
                    className="car-photo"
                    role="img"
                    aria-label={`Carro da ${def.name}`}
                    style={{ maxWidth: '520px', aspectRatio: `${assets.ar} / 1` }}
                  >
                    <img src={assets.car} alt="" />
                  </div>
                </div>
              )}

              <div className="kpis">
                {userTeam && (
                  <button className={`kpi ${userTeam.budget < 0 ? 'bad' : ''}`} onClick={() => setActiveTab('financas')}>
                    <span className="kpi-label">Caixa</span>
                    <span className="kpi-value">{money(userTeam.budget)}</span>
                    <span className="kpi-sub">Orçamento único da equipe</span>
                  </button>
                )}
                {userTeam && (
                  <button className="kpi good" onClick={() => setActiveTab('campeonato')}>
                    <span className="kpi-label">Construtores</span>
                    <span className="kpi-value">
                      {myPos}º · {userTeam.points} pts
                    </span>
                    <span className="kpi-sub">
                      {ahead ? `${ahead.points - userTeam.points} pts atrás da ${teamDef(ahead.teamId)?.name}` : 'Liderando o campeonato'}
                    </span>
                  </button>
                )}
                <div className="kpi">
                  <span className="kpi-label">
                    GP {league.gpIndex + 1} de {SEASON_CALENDAR_SIZE}
                  </span>
                  <span className="kpi-value">{circuit.gp}</span>
                  <span className="kpi-sub">{circuit.circuito}</span>
                </div>
                <div className={`kpi ${league.isLocked ? 'bad' : ''}`}>
                  <span className="kpi-label">Largada automática</span>
                  <span className="kpi-value">{countdownText || '—'}</span>
                  <span className="kpi-sub">{league.isLocked ? '🔒 Grid fechado: configurações travadas' : 'Alterações liberadas até 1h antes'}</span>
                </div>
              </div>

              {alerts.length > 0 && (
                <div className="card">
                  <h3>Alertas</h3>
                  <ul className="alerts">
                    {alerts.map((a, i) => (
                      <li key={i} className={a.level}>
                        <i aria-hidden="true">{a.level === 'info' ? 'i' : '!'}</i>
                        <span>{a.text}</span>
                        {a.tab && (
                          <button className="link" onClick={() => setActiveTab(a.tab!)}>
                            Abrir
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid two">
                <div className="card">
                  <div className="eyebrow">Próxima corrida</div>
                  <h2>{circuit.gp}</h2>
                  <p className="muted">
                    {circuit.circuito} · {circuit.laps} voltas
                  </p>
                  <p className="tip">
                    <b>Engenheiro:</b> {circuit.dica}
                  </p>
                  <p className="tip">
                    <b>Previsão do tempo:</b> {Math.round(circuit.chuva * 100)}% de chance de chuva.
                  </p>
                  {(
                    [
                      ['Potência', circuit.potencia, 'Quanto o motor pesa mais que a carga aerodinâmica'],
                      ['Desgaste de pneu', (circuit.desgastePneu - 0.6) / 0.8, 'Quanto os pneus sofrem'],
                      ['Dificuldade de ultrapassar', circuit.ultrapassagem, 'Quanto custa passar alguém'],
                      ['Desgaste de peças', (circuit.desgastePecas - 0.8) / 0.6, 'Quanto as peças do carro sofrem']
                    ] as [string, number, string][]
                  ).map(([label, v, title]) => (
                    <div key={label} className="bar-row" title={title}>
                      <span>{label}</span>
                      <div className="bar">
                        <div style={{ width: pct(v) }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="card">
                  <h3>Calendário da temporada {league.season}</h3>
                  <ol className="calendar">
                    {CIRCUITS.slice(0, SEASON_CALENDAR_SIZE).map((c, idx) => {
                      const done = idx < league.gpIndex;
                      const res = league.raceResults?.find((r) => r.gpIndex === idx && r.season === league.season);
                      const mine = res && userTeam ? JSON.parse(res.resultsJson).filter((r: any) => r.teamId === userTeam.id) : [];
                      const best = mine.length ? Math.min(...mine.map((r: any) => r.position)) : null;
                      const pts = mine.reduce((s: number, r: any) => s + r.points, 0);
                      return (
                        <li key={c.id} className={done ? 'done' : idx === league.gpIndex ? 'now' : ''}>
                          <span className="num">{idx + 1}</span>
                          <b>{shortGp(c.gp)}</b>
                          <small>
                            {done && best ? `Melhor: ${best}º · ${pts} pts` : idx === league.gpIndex ? 'Próximo' : `${c.laps} voltas`}
                          </small>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>

              <div className="card">
                <h3>Fim de semana</h3>
                <p className="muted small">
                  A corrida é simulada automaticamente no horário, com o acerto e a estratégia salvos por cada equipe.
                </p>
                <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
                  {userTeam && (
                    <button className="primary" onClick={() => setActiveTab('treino')}>
                      Treino e classificação
                    </button>
                  )}
                  <button onClick={() => setShowResultsModal(true)}>Resultados</button>
                  <button className="ghost" onClick={onLeaveLeague}>
                    Voltar ao lobby
                  </button>
                </div>
              </div>

              {league.status === 'ENDED' && (
                <div className="card" style={{ borderColor: 'var(--warn)' }}>
                  <div className="eyebrow">Temporada {league.season} encerrada</div>
                  <h3>
                    {league.hallOfFame?.find((h) => h.season === league.season)
                      ? `Campeão: ${league.hallOfFame.find((h) => h.season === league.season)!.driverName}`
                      : 'Fim de temporada'}
                  </h3>
                  {isAdmin ? (
                    <>
                      <p className="muted small">
                        Ao abrir a temporada {league.season + 1}: campeões e classificação final vão para o Hall da Fama, os pontos zeram, os contratos são
                        renovados por mais uma temporada, as peças voltam com desgaste zero e cada equipe recebe a mesma verba da categoria. O treino livre do
                        GP 1 começa na hora.
                      </p>
                      {adminMsg && <p className="tip small">{adminMsg}</p>}
                      <button className="primary" disabled={advancing} onClick={handleNextSeason}>
                        {advancing ? 'Abrindo...' : `Encerrar a temporada ${league.season} e abrir a ${league.season + 1}`}
                      </button>
                    </>
                  ) : (
                    <p className="muted small">Aguardando o administrador abrir a temporada {league.season + 1}.</p>
                  )}
                </div>
              )}

              {isAdmin && nextStep && league.status === 'SEASON' && (
                <div className="card" style={{ borderColor: 'var(--warn)' }}>
                  <div className="eyebrow">Administrador · teste e controle do calendário</div>
                  <h3>Próximo passo: {nextStep.label}</h3>
                  <p className="muted small">
                    {nextStep.effect} Sem adiantar, acontece sozinho em {new Date(nextStep.at).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}.
                  </p>
                  {adminMsg && <p className="tip small">{adminMsg}</p>}
                  <div className="row" style={{ gap: '8px', flexWrap: 'wrap' }}>
                    <button className="primary" disabled={advancing} onClick={handleAdvance}>
                      {advancing ? 'Executando...' : `${nextStep.label} agora`}
                    </button>
                    <button className="ghost" disabled={simulating || advancing} onClick={handleSimulateNow}>
                      {simulating ? 'Simulando...' : `Pular tudo e correr o GP ${league.gpIndex + 1}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {userTeam && (activeTab === 'treino' || activeTab === 'quali' || activeTab === 'estrategia') && (
            <WeekendPanel
              key={`${league.season}-${league.gpIndex}`}
              leagueCode={leagueCode}
              team={userTeam}
              teams={league.teams}
              gpIndex={league.gpIndex}
              view={activeTab}
              onLeagueChanged={fetchLeague}
            />
          )}
          {userTeam && activeTab === 'carro' && (
            <CarPanel leagueCode={leagueCode} team={userTeam} isLocked={league.isLocked} onChanged={fetchLeague} onGoToRnd={() => setActiveTab('pd')} />
          )}
          {userTeam && activeTab === 'equipe' && <TeamPanel team={userTeam} drivers={allDrivers} leagueCode={leagueCode} season={league.season} gpIndex={league.gpIndex} onChanged={fetchLeague} />}
          {userTeam && activeTab === 'pd' && (
            <RndPanel leagueCode={leagueCode} team={userTeam} teams={league.teams} onGoToCar={() => setActiveTab('carro')} onChanged={fetchLeague} />
          )}
          {activeTab === 'paddock' && <PaddockPanel leagueCode={leagueCode} teams={league.teams} onChanged={fetchLeague} />}
          {activeTab === 'hall' && <HallOfFamePanel hall={league.hallOfFame ?? []} drivers={allDrivers} teams={league.teams} />}
          {userTeam && activeTab === 'mercado' && <MarketPanel leagueCode={leagueCode} onChanged={fetchLeague} />}
          {userTeam && activeTab === 'financas' && <FinancePanel leagueCode={leagueCode} team={userTeam} onChanged={fetchLeague} />}

          {activeTab === 'campeonato' && (
            <ChampionshipPanel teams={league.teams} drivers={allDrivers} results={league.raceResults ?? []} myTeamId={userTeam?.id} />
          )}
          {userTeam && activeTab === 'rivais' && <RivalsPanel teams={league.teams} myTeam={userTeam} season={league.season} results={league.raceResults ?? []} leagueCode={league.code} />}
        </div>
      </main>

      {showResultsModal && <RaceResultsModal leagueCode={leagueCode} onClose={() => setShowResultsModal(false)} />}
    </div>
  );
}

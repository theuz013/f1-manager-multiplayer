import React, { useState, useEffect, useRef } from 'react';
import { TEAMS, CIRCUITS, SEASON_CALENDAR_SIZE } from '@f1m/core';
import SnakeDraftRoom from './components/SnakeDraftRoom';
import LeagueDashboard from './components/LeagueDashboard';
import LoginScreen, { AuthUser } from './components/LoginScreen';
import DrawReveal, { DrawItem } from './components/DrawReveal';
import './legacy.css';
import './solo.css';

interface CareerSaveRecord {
  id: string;
  name: string;
  difficulty: string;
  season: number;
  gpIndex: number;
  teamId: string;
  updatedAt: string;
  user: {
    username: string;
    name: string;
  };
  saveData: string;
}

interface MyLeague {
  code: string;
  name: string;
  status: string;
  season: number;
  gpIndex: number;
  isAdmin: boolean;
  teamId: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  SETUP: 'Sala de espera',
  TEAM_DRAFT: 'Draft de equipes',
  PILOT_DRAFT: 'Draft de pilotos',
  SEASON: 'Em temporada',
  ENDED: 'Encerrada'
};

interface LeagueDetails {
  id: string;
  code: string;
  name: string;
  status: 'SETUP' | 'TEAM_DRAFT' | 'PILOT_DRAFT' | 'SEASON' | 'ENDED';
  season: number;
  gpIndex: number;
  intervalHours: number;
  nextRaceAt: string | null;
  isLocked: boolean;
  admin: {
    username: string;
    name: string;
  };
  members: {
    id: string;
    teamDraftOrder: number | null;
    user: { id: string; username: string; name: string };
  }[];
  teams: {
    id: string;
    teamId: string;
    isAI: boolean;
    budget: number;
    points: number;
    draftOrder: number | null;
    user?: {
      id: string;
      username: string;
      name: string;
    };
    contracts?: any[];
  }[];
}

export default function App() {
  const [activeMode, setActiveMode] = useState<'manager' | 'multiplayer' | 'database'>('multiplayer');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const username = user?.username ?? '';

  // Estados Multiplayer (Ligas Privadas Assíncronas)
  const [activeLeagueCode, setActiveLeagueCode] = useState<string | null>(null);
  const [activeLeague, setActiveLeague] = useState<LeagueDetails | null>(null);
  const [joinLeagueCodeInput, setJoinLeagueCodeInput] = useState('');
  const [newLeagueName, setNewLeagueName] = useState('');
  const [mpLoading, setMpLoading] = useState(false);
  const [mpError, setMpError] = useState<string | null>(null);
  const [headerInfo, setHeaderInfo] = useState<{ budget: number; label: string } | null>(null);
  const [reveal, setReveal] = useState<{ key: string; title: string; items: DrawItem[] } | null>(null);

  // Estados Banco de Dados (Saves de Carreira)
  const [savedCareers, setSavedCareers] = useState<CareerSaveRecord[]>([]);
  const [loadingCareers, setLoadingCareers] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!localStorage.getItem('f1m_token')) return setAuthChecked(true);
    const check = (attempt: number): Promise<void> =>
      fetch('/api/auth/me')
        .then(async (res) => {
          if (res.status === 401) return localStorage.removeItem('f1m_token');
          if (!res.ok) throw new Error(String(res.status));
          setUser(await res.json());
        })
        // Servidor fora do ar (ex.: reiniciando) não derruba a sessão: tenta de novo
        .catch(() => (attempt < 5 ? new Promise((r) => setTimeout(r, 2000)).then(() => check(attempt + 1)) : undefined));
    check(0).finally(() => setAuthChecked(true));
  }, []);

  // Ligas do usuário: listadas no lobby para ele escolher qual abrir
  const [myLeagues, setMyLeagues] = useState<MyLeague[]>([]);
  useEffect(() => {
    if (!user || activeLeagueCode) return;
    fetch('/api/leagues')
      .then((res) => (res.ok ? res.json() : []))
      .then(setMyLeagues)
      .catch(() => {});
  }, [user, activeLeagueCode]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('f1m_token');
    setActiveLeagueCode(null);
    setActiveLeague(null);
    setMyLeagues([]);
    setUser(null);
  }

  // Carregar dados conforme o modo ativo
  useEffect(() => {
    if (activeMode === 'multiplayer') {
      if (activeLeagueCode) fetchActiveLeague(activeLeagueCode);
    } else if (activeMode === 'database') {
      fetchCareers();
    }
  }, [activeMode, activeLeagueCode]);

  // Lobby se atualiza sozinho enquanto os outros participantes entram e escolhem
  const lobbyPhase = activeLeague?.status === 'SETUP' || activeLeague?.status === 'TEAM_DRAFT';
  useEffect(() => {
    if (!activeLeagueCode || !lobbyPhase) return;
    const id = setInterval(() => fetchActiveLeague(activeLeagueCode), 4000);
    return () => clearInterval(id);
  }, [activeLeagueCode, lobbyPhase]);

  // Mostra cada sorteio uma vez por navegador, na fase em que ele acabou de acontecer
  useEffect(() => {
    if (!activeLeague || reveal) return;
    const { code, status } = activeLeague;
    if (status === 'TEAM_DRAFT' && !localStorage.getItem(`f1m_draw_${code}_teams`)) {
      setReveal({
        key: `f1m_draw_${code}_teams`,
        title: 'Ordem de escolha das equipes',
        items: activeLeague.members.map((m) => ({ label: m.user.name || m.user.username }))
      });
    } else if (status === 'PILOT_DRAFT' && !localStorage.getItem(`f1m_draw_${code}_pilots`)) {
      setReveal({
        key: `f1m_draw_${code}_pilots`,
        title: 'Ordem do Draft de Pilotos',
        items: [...activeLeague.teams]
          .sort((a, b) => (a.draftOrder ?? 99) - (b.draftOrder ?? 99))
          .map((t) => {
            const def = TEAMS.find((d) => d.id === t.teamId);
            return { label: def?.name ?? t.teamId, color: def?.color, sub: t.user ? `👤 ${t.user.name || t.user.username}` : '🤖 IA' };
          })
      });
    }
  }, [activeLeague, reveal]);

  function closeReveal() {
    if (reveal) localStorage.setItem(reveal.key, '1');
    setReveal(null);
  }

  async function handleDrawTeamOrder() {
    if (!activeLeagueCode) return;
    try {
      const res = await fetch(`/api/leagues/${activeLeagueCode}/draw-team-order`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao sortear');
      setActiveLeague(data);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function fetchActiveLeague(code: string) {
    try {
      const res = await fetch(`/api/leagues/${code}`);
      if (res.ok) {
        const data = await res.json();
        setActiveLeague(data);
      } else {
        setActiveLeagueCode(null);
      }
    } catch {
      setActiveLeagueCode(null);
    }
  }

  async function fetchCareers() {
    setLoadingCareers(true);
    try {
      const res = await fetch('/api/careers');
      if (res.ok) {
        const data = await res.json();
        setSavedCareers(data);
      }
    } catch {
      console.warn('Erro ao carregar carreiras salvas');
    } finally {
      setLoadingCareers(false);
    }
  }

  async function handleCreateLeague() {
    if (!username.trim()) {
      setMpError('Por favor, informe seu nome de gerente.');
      return;
    }
    setMpLoading(true);
    setMpError(null);
    try {
      const res = await fetch('/api/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newLeagueName || `Liga dos Campeões F1`,
          username
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar liga');
      setActiveLeagueCode(data.code);
      setActiveLeague(data);
      setNewLeagueName('');
    } catch (err: any) {
      setMpError(err.message);
    } finally {
      setMpLoading(false);
    }
  }

  async function handleJoinLeague(code: string) {
    if (!code) return;
    setMpLoading(true);
    setMpError(null);
    try {
      const res = await fetch(`/api/leagues/${code.toUpperCase()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao entrar na liga');
      setActiveLeagueCode(data.code);
      setActiveLeague(data);
      setJoinLeagueCodeInput('');
    } catch (err: any) {
      setMpError(err.message);
    } finally {
      setMpLoading(false);
    }
  }

  async function handleSelectTeam(teamId: string) {
    if (!activeLeagueCode) return;
    try {
      const res = await fetch(`/api/leagues/${activeLeagueCode}/select-team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          teamId
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao selecionar equipe');
      setActiveLeague(data);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleStartDraft() {
    if (!activeLeagueCode) return;
    try {
      const res = await fetch(`/api/leagues/${activeLeagueCode}/start-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao iniciar draft');
      await fetchActiveLeague(activeLeagueCode);
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleLoadCareerIntoManager(career: CareerSaveRecord) {
    try {
      localStorage.setItem('box-save-v5', career.saveData);
      setActiveMode('manager');
      if (iframeRef.current) {
        iframeRef.current.contentWindow?.location.reload();
      }
    } catch {
      alert('Erro ao carregar carreira para a sessão atual.');
    }
  }

  async function handleDeleteCareer(id: string) {
    if (!confirm('Deseja realmente excluir este save do banco de dados SQLite?')) return;
    try {
      await fetch(`/api/careers/${id}`, { method: 'DELETE' });
      fetchCareers();
    } catch {
      alert('Erro ao excluir carreira.');
    }
  }

  const isLeagueAdmin = activeLeague?.admin.username === username;
  const myLeagueTeam = activeLeagueCode ? activeLeague?.teams.find((t) => t.user?.username === username) : undefined;
  const myTeamDef = myLeagueTeam && TEAMS.find((t) => t.id === myLeagueTeam.teamId);
  const teamOwnerIds = new Set(activeLeague?.teams.map((t) => t.user?.id).filter(Boolean));
  const currentPicker =
    activeLeague?.status === 'TEAM_DRAFT' ? activeLeague.members.find((m) => !teamOwnerIds.has(m.user.id)) : undefined;
  const allTeamsPicked = activeLeague?.status === 'TEAM_DRAFT' && !currentPicker;
  const isMyTurn = currentPicker?.user.username === username;

  if (!authChecked) return null;
  if (!user) return <LoginScreen onLogin={setUser} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {reveal && <DrawReveal key={reveal.key} title={reveal.title} items={reveal.items} onClose={closeReveal} />}
      {/* Header Chrome Unificado (Design System Autêntico) */}
      <header className="chrome" style={{ flexShrink: 0 }}>
        <div className="top">
          <div className="brand">
            <span style={{ fontSize: '1.5rem', marginRight: '4px' }}>🏎️</span>
            F1 MANAGER <span>2026</span>
          </div>

          {/* Seletor de Modos Principal */}
          <nav className="tabs" style={{ marginLeft: '16px' }}>
            <button
              className={activeMode === 'manager' ? 'on' : ''}
              onClick={() => setActiveMode('manager')}
            >
              🏁 Modo Manager (Solo)
            </button>
            <button
              className={activeMode === 'multiplayer' ? 'on' : ''}
              onClick={() => setActiveMode('multiplayer')}
            >
              🌐 Modo Multiplayer
            </button>
            <button
              className={activeMode === 'database' ? 'on' : ''}
              onClick={() => setActiveMode('database')}
            >
              💾 Banco de Dados (SQLite)
            </button>
          </nav>

          {/* Stats Bar / Perfil do Gerente */}
          <div className="stats">
            <span style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
              Gerente: <b style={{ color: '#fff' }}>{username}</b>
            </span>
            {headerInfo && activeLeagueCode && (
              <>
                <button className={`ghost cash ${headerInfo.budget < 0 ? 'neg' : ''}`} title="Caixa da equipe">
                  R$ {headerInfo.budget.toFixed(1).replace('.', ',')} mi
                </button>
                <span>{headerInfo.label}</span>
              </>
            )}
            <button className="small-btn" onClick={handleLogout}>Sair</button>
            {myTeamDef && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  fontSize: '0.85rem'
                }}
              >
                <i className="team-chip" style={{ background: myTeamDef.color }} />
                <b>{myTeamDef.name}</b>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Conteúdo Dinâmico por Modo */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* MODO MANAGER: Carrega a interface completa clássica com sincronização automática com o SQLite */}
        <div
          style={{
            display: activeMode === 'manager' ? 'block' : 'none',
            width: '100%',
            height: '100%'
          }}
        >
          <iframe
            ref={iframeRef}
            src="/legacy-manager.html"
            title="F1 Manager Authentic Mode"
            style={{
              width: '100%',
              height: '100%',
              border: 0,
              display: 'block',
              backgroundColor: 'var(--bg)'
            }}
          />
        </div>

        {/* MODO MULTIPLAYER: Ligas Privadas Assíncronas (Especificação v1.0) */}
        {activeMode === 'multiplayer' && (
          <div style={{ height: '100%', overflowY: 'auto', padding: '24px' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gap: '24px' }}>
              {/* Notificação de Erro */}
              {mpError && (
                <div
                  style={{
                    background: 'var(--danger-strong)',
                    border: '1px solid var(--danger)',
                    borderRadius: '8px',
                    padding: '12px 16px',
                    color: '#fff'
                  }}
                >
                  ⚠️ {mpError}
                </div>
              )}

              {/* Sub-Visão: Se já estamos dentro de uma liga */}
              {activeLeagueCode && activeLeague ? (
                <>
                  {/* Status 1: DRAFT_TEAM (Escolha de Equipes no Grid de 11) */}
                  {(activeLeague.status === 'SETUP' || activeLeague.status === 'TEAM_DRAFT') && (
                    <div className="card" style={{ display: 'grid', gap: '20px' }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderBottom: '1px solid var(--line)',
                          paddingBottom: '16px'
                        }}
                      >
                        <div>
                          <span className="badge green" style={{ marginBottom: '6px' }}>
                            CÓDIGO DA LIGA: {activeLeague.code}
                          </span>
                          <h2>
                            {activeLeague.name} — {activeLeague.status === 'SETUP' ? 'Sala de Espera' : 'Draft de Equipes'}
                          </h2>
                          <p style={{ color: 'var(--muted)', margin: 0, fontSize: '0.9rem' }}>
                            {activeLeague.status === 'SETUP'
                              ? 'Compartilhe o código com os participantes. Quando todos entrarem, o administrador sorteia a ordem de escolha das equipes.'
                              : allTeamsPicked
                              ? 'Todos escolheram. As equipes restantes ficam com a IA. Aguardando o sorteio do Draft de Pilotos.'
                              : `Vez de ${currentPicker?.user.name || currentPicker?.user.username} escolher a equipe.`}
                          </p>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                          {isLeagueAdmin && activeLeague.status === 'SETUP' && (
                            <button className="primary" onClick={handleDrawTeamOrder}>
                              🎲 Sortear ordem das equipes
                            </button>
                          )}
                          {isLeagueAdmin && allTeamsPicked && (
                            <button className="primary" onClick={handleStartDraft}>
                              🎲 Sortear ordem do Draft de Pilotos
                            </button>
                          )}
                          <button onClick={() => setActiveLeagueCode(null)}>Sair da Liga</button>
                        </div>
                      </div>

                      {/* Participantes e ordem sorteada */}
                      <div>
                        <h3>
                          {activeLeague.status === 'SETUP' ? 'Participantes' : 'Ordem de escolha'} ({activeLeague.members.length}/11)
                        </h3>
                        <ol style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {activeLeague.members.map((m) => {
                            const team = activeLeague.teams.find((t) => t.user?.id === m.user.id);
                            const def = team && TEAMS.find((d) => d.id === team.teamId);
                            const isTurn = currentPicker?.id === m.id;
                            return (
                              <li
                                key={m.id}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: '8px',
                                  background: 'var(--panel-2)',
                                  border: `1px solid ${isTurn ? 'var(--accent)' : 'var(--line)'}`,
                                  fontSize: '0.88rem'
                                }}
                              >
                                {m.teamDraftOrder && <b style={{ color: 'var(--accent)', marginRight: '6px' }}>{m.teamDraftOrder}º</b>}
                                {m.user.name || m.user.username}
                                {m.user.username === activeLeague.admin.username && ' 👑'}
                                {def && <span style={{ color: def.color, marginLeft: '6px' }}>● {def.name}</span>}
                                {isTurn && <span style={{ color: 'var(--accent)', marginLeft: '6px' }}>⏳ escolhendo</span>}
                              </li>
                            );
                          })}
                        </ol>
                      </div>

                      {/* Grid de 11 Equipes Equalizadas */}
                      <div>
                        <h3>Equipes no Grid ({activeLeague.teams.filter(t => !t.isAI).length}/11 com gerente)</h3>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: '14px',
                            marginTop: '12px'
                          }}
                        >
                          {TEAMS.map((team) => {
                            const leagueTeam = activeLeague.teams.find((t) => t.teamId === team.id);
                            const isMine = leagueTeam?.user?.username === username;
                            const isOccupiedByOther = !isMine && leagueTeam && !leagueTeam.isAI;

                            return (
                              <div
                                key={team.id}
                                style={{
                                  background: 'var(--panel-2)',
                                  border: `1px solid ${isMine ? 'var(--accent)' : isOccupiedByOther ? 'var(--line)' : '#3b3b48'}`,
                                  borderRadius: '8px',
                                  padding: '14px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  justifyContent: 'space-between',
                                  gap: '12px',
                                  boxShadow: isMine ? '0 0 10px rgba(255, 24, 1, 0.25)' : 'none'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div
                                    style={{
                                      width: '14px',
                                      height: '14px',
                                      borderRadius: '50%',
                                      backgroundColor: team.color
                                    }}
                                  />
                                  <div>
                                    <b style={{ display: 'block', color: '#fff' }}>{team.name}</b>
                                    <span style={{ fontSize: '0.8rem', color: isMine ? 'var(--accent)' : 'var(--muted)' }}>
                                      {isMine
                                        ? '👑 Sua Equipe'
                                        : isOccupiedByOther
                                        ? `👤 ${leagueTeam?.user?.name || leagueTeam?.user?.username}`
                                        : activeLeague.status === 'SETUP' ? '🔒 Aguardando sorteio' : '🤖 Disponível (Será IA)'}
                                    </span>
                                  </div>
                                </div>

                                <div>
                                  {!isOccupiedByOther && !isMine && isMyTurn && (
                                    <button
                                      className="small-btn primary"
                                      style={{ width: '100%' }}
                                      onClick={() => handleSelectTeam(team.id)}
                                    >
                                      Escolher Esta Equipe
                                    </button>
                                  )}
                                  {isMine && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 'bold' }}>
                                      ✓ Equipe Confirmada
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Status 2: DRAFT_PILOT (Snake Draft dos Potes 1 e 2) */}
                  {activeLeague.status === 'PILOT_DRAFT' && (
                    <div>
                      <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={() => setActiveLeagueCode(null)} style={{ background: '#222', border: '1px solid #333', color: '#aaa', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>
                          Voltar ao Lobby
                        </button>
                      </div>
                      <SnakeDraftRoom
                        leagueCode={activeLeagueCode}
                        username={username}
                        onDraftCompleted={() => fetchActiveLeague(activeLeagueCode)}
                      />
                    </div>
                  )}

                  {/* Status 3 & 4: SEASON ou FINISHED (Central de Operações da Temporada) */}
                  {(activeLeague.status === 'SEASON' || activeLeague.status === 'ENDED') && (
                    <LeagueDashboard
                      leagueCode={activeLeagueCode}
                      username={username}
                      onLeaveLeague={() => setActiveLeagueCode(null)}
                      onHeaderInfo={setHeaderInfo}
                    />
                  )}
                </>
              ) : (
                /* Sub-Visão: Lobby Geral de Ligas (Minhas ligas / Criar / Entrar) */
                <div className="stack">
                {myLeagues.length > 0 && (
                  <div className="card">
                    <h2>Minhas ligas</h2>
                    <table className="table compact">
                      <tbody>
                        {myLeagues.map((l) => {
                          const t = l.teamId ? TEAMS.find((d) => d.id === l.teamId) : undefined;
                          return (
                            <tr key={l.code}>
                              <td>
                                <b>{l.name}</b>
                                {l.isAdmin && <span className="muted small"> · administrador</span>}
                              </td>
                              <td>
                                {t ? (
                                  <>
                                    <i className="team-chip" style={{ background: t.color }} /> {t.name}
                                  </>
                                ) : (
                                  <span className="muted">sem equipe ainda</span>
                                )}
                              </td>
                              <td className="muted">
                                {STATUS_LABEL[l.status] ?? l.status}
                                {l.status === 'SEASON' && ` · GP ${l.gpIndex + 1}`}
                              </td>
                              <td className="right">
                                <button className="small-btn primary" onClick={() => setActiveLeagueCode(l.code)}>
                                  Abrir
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="grid two" style={{ gap: '24px' }}>
                  {/* Card Criar Liga */}
                  <div className="card" style={{ display: 'grid', gap: '14px' }}>
                    <h2>🏆 Criar Liga Privada F1</h2>
                    <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                      Crie um campeonato de 12 Grandes Prêmios com grid fixo de 11 equipes equalizadas,
                      Snake Draft de pilotos e corridas simuladas a cada 48h.
                    </p>

                    <div>
                      <label style={{ display: 'block', marginBottom: '6px', color: 'var(--label)' }}>
                        Nome da Liga:
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Liga dos Campeões 2026"
                        value={newLeagueName}
                        onChange={(e) => setNewLeagueName(e.target.value)}
                      />
                    </div>

                    <button
                      className="primary"
                      onClick={handleCreateLeague}
                      disabled={mpLoading}
                      style={{ marginTop: '8px' }}
                    >
                      {mpLoading ? 'Criando Liga...' : '🏁 Fundar Liga & Abrir Draft'}
                    </button>
                  </div>

                  {/* Card Entrar com Código */}
                  <div className="card" style={{ display: 'grid', gap: '14px', alignContent: 'start' }}>
                    <h2>Entrar em Liga Existente</h2>
                    <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                      Recebeu um código de convite de 6 dígitos? Digite abaixo para ingressar no grid:
                    </p>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="Ex: F1M7K9"
                        value={joinLeagueCodeInput}
                        onChange={(e) => setJoinLeagueCodeInput(e.target.value.toUpperCase())}
                        style={{ textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}
                      />
                      <button
                        className="primary"
                        onClick={() => handleJoinLeague(joinLeagueCodeInput)}
                        disabled={mpLoading || !joinLeagueCodeInput.trim()}
                      >
                        Entrar
                      </button>
                    </div>
                  </div>
                </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODO BANCO DE DADOS: Lista de Carreira salvas no SQLite */}
        {activeMode === 'database' && (
          <div style={{ height: '100%', overflowY: 'auto', padding: '24px' }}>
            <div className="card" style={{ maxWidth: '1000px', margin: '0 auto', display: 'grid', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2>Saves de Carreira no Banco de Dados (SQLite)</h2>
                  <p style={{ color: 'var(--muted)', margin: 0 }}>
                    Todos os saves sincronizados automaticamente do Modo Manager ficam guardados de forma
                    permanente no banco de dados.
                  </p>
                </div>
                <button onClick={fetchCareers} disabled={loadingCareers}>
                  {loadingCareers ? 'Atualizando...' : '🔄 Atualizar'}
                </button>
              </div>

              {savedCareers.length === 0 ? (
                <div
                  style={{
                    padding: '32px',
                    textAlign: 'center',
                    background: 'var(--panel-2)',
                    borderRadius: '8px',
                    color: 'var(--muted)'
                  }}
                >
                  Nenhum save de carreira encontrado no banco de dados SQLite ainda.
                  <br />
                  Inicie ou jogue no <b>Modo Manager</b> e seu progresso será salvo automaticamente aqui!
                </div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nome da Carreira</th>
                      <th>Gerente</th>
                      <th>Equipe</th>
                      <th>Temporada / GP</th>
                      <th>Última Atualização</th>
                      <th style={{ textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedCareers.map((c) => {
                      const team = TEAMS.find((t) => t.id === c.teamId);
                      return (
                        <tr key={c.id}>
                          <td>
                            <b>{c.name}</b>
                          </td>
                          <td>{c.user?.name || c.user?.username || 'Você'}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <span
                                style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  backgroundColor: team?.color || 'var(--accent)'
                                }}
                              />
                              {team?.name || c.teamId}
                            </span>
                          </td>
                          <td>
                            T{c.season} • GP {c.gpIndex + 1}
                          </td>
                          <td>{new Date(c.updatedAt).toLocaleString('pt-BR')}</td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                className="primary"
                                style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                onClick={() => handleLoadCareerIntoManager(c)}
                              >
                                Carregar no Jogo
                              </button>
                              <button
                                className="danger"
                                style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                onClick={() => handleDeleteCareer(c.id)}
                              >
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

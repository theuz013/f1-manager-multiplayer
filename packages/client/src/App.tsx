import React, { useState } from 'react';
import { TEAMS, CIRCUITS, TeamDefinition } from '@f1m/core';

export default function App() {
  const [selectedTeam, setSelectedTeam] = useState<TeamDefinition>(TEAMS[0]);
  const [roomCode, setRoomCode] = useState('');
  const [username, setUsername] = useState('Chefe de Equipe');
  const [activeTab, setActiveTab] = useState<'lobby' | 'equipes' | 'calendario'>('lobby');

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px' }}>
      {/* Top Bar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '20px',
          borderBottom: '1px solid var(--line)',
          marginBottom: '24px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              backgroundColor: selectedTeam.color
            }}
          />
          <h1
            style={{
              margin: 0,
              fontSize: '1.8rem',
              fontFamily: 'var(--display)',
              letterSpacing: '0.05em'
            }}
          >
            F1 MANAGER <span style={{ color: 'var(--accent)' }}>MULTIPLAYER</span>
          </h1>
        </div>

        <nav style={{ display: 'flex', gap: '8px' }}>
          {(['lobby', 'equipes', 'calendario'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? 'var(--accent)' : 'var(--panel)',
                color: activeTab === tab ? '#000' : 'var(--text)',
                border: '1px solid var(--line)',
                borderRadius: '6px',
                padding: '8px 16px',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'uppercase'
              }}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content */}
      {activeTab === 'lobby' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Card Criar Sala */}
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              padding: '24px'
            }}
          >
            <h2 style={{ fontFamily: 'var(--display)', marginTop: 0 }}>Criar Nova Sala Multiplayer</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>
              Inicie um campeonato com 12 GPs para até 11 jogadores gerenciarem suas próprias equipes.
            </p>

            <div style={{ margin: '16px 0' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--muted)' }}>
                Seu Nome de Gerente:
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  color: '#fff',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ margin: '16px 0' }}>
              <label style={{ display: 'block', marginBottom: '6px', color: 'var(--muted)' }}>
                Equipe Escolhida:
              </label>
              <select
                value={selectedTeam.id}
                onChange={e => {
                  const t = TEAMS.find(x => x.id === e.target.value);
                  if (t) setSelectedTeam(t);
                }}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  color: '#fff'
                }}
              >
                {TEAMS.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} (Tier {t.tier} · {t.style})
                  </option>
                ))}
              </select>
            </div>

            <button
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--accent)',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
                marginTop: '12px'
              }}
              onClick={() => alert('Sala criada! Código de compartilhamento gerado.')}
            >
              Criar Campeonato
            </button>
          </div>

          {/* Card Entrar na Sala */}
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              padding: '24px'
            }}
          >
            <h2 style={{ fontFamily: 'var(--display)', marginTop: 0 }}>Entrar com Código</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>
              Digite o código de 6 dígitos fornecido pelo host para entrar no grid.
            </p>

            <div style={{ margin: '24px 0' }}>
              <input
                type="text"
                placeholder="Ex: INTERL"
                value={roomCode}
                onChange={e => setRoomCode(e.target.value.toUpperCase())}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '1.2rem',
                  letterSpacing: '0.2em',
                  textAlign: 'center',
                  background: 'var(--panel-2)',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  color: '#fff',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              disabled={!roomCode}
              style={{
                width: '100%',
                padding: '12px',
                background: roomCode ? 'var(--accent)' : 'var(--panel-2)',
                color: roomCode ? '#000' : 'var(--muted)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: roomCode ? 'pointer' : 'default'
              }}
              onClick={() => alert(`Buscando sala ${roomCode}...`)}
            >
              Conectar à Sala
            </button>
          </div>
        </div>
      )}

      {/* Guia de Equipes */}
      {activeTab === 'equipes' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {TEAMS.map((t, idx) => (
            <div
              key={t.id}
              style={{
                background: 'var(--panel)',
                border: `2px solid ${t.id === selectedTeam.id ? t.color : 'var(--line)'}`,
                borderRadius: '10px',
                padding: '16px',
                cursor: 'pointer'
              }}
              onClick={() => setSelectedTeam(t)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '1.1rem', color: t.color }}>{t.name}</span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    background: 'var(--panel-2)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--line)'
                  }}
                >
                  Tier {t.tier}
                </span>
              </div>
              <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
                Estilo: <strong>{t.style}</strong>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Guia do Calendário */}
      {activeTab === 'calendario' && (
        <div>
          <h2 style={{ fontFamily: 'var(--display)' }}>12 Etapas por Temporada (Pool de 18 Circuitos)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {CIRCUITS.map((c, idx) => (
              <div
                key={c.id}
                style={{
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  padding: '16px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '1.05rem' }}>{c.gp}</strong>
                  <span style={{ color: 'var(--accent)' }}>{c.laps} voltas</span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '4px 0' }}>{c.circuito}</div>
                <p style={{ fontSize: '0.85rem', color: '#ccc', margin: '8px 0 0' }}>{c.dica}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


import React, { useState, useEffect } from 'react';
import { CIRCUITS, TEAMS } from '@f1m/core';

interface RaceResultsModalProps {
  leagueCode: string;
  onClose: () => void;
}

export default function RaceResultsModal({ leagueCode, onClose }: RaceResultsModalProps) {
  const [resultsList, setResultsList] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchResults() {
      try {
        setLoading(true);
        const res = await fetch(`/api/leagues/${leagueCode}/results`);
        if (!res.ok) throw new Error('Não foi possível carregar os resultados das corridas.');
        const data = await res.json();
        setResultsList(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, [leagueCode]);

  const currentResult = resultsList[selectedIndex] || null;
  const circuit = currentResult
    ? CIRCUITS.find(c => c.id === currentResult.circuitId) || CIRCUITS[currentResult.gpIndex] || CIRCUITS[0]
    : null;

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(5, 5, 10, 0.88)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div className="f1-card" style={{
        maxWidth: '900px',
        width: '100%',
        maxHeight: '92vh',
        overflowY: 'auto',
        background: '#15151e',
        border: '1px solid #2b2b36',
        borderRadius: '10px',
        padding: '24px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.85)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2b2b36', paddingBottom: '14px', marginBottom: '18px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🏁 Resultados Oficiais de Corrida
            </h2>
            <div style={{ fontSize: '0.85rem', color: '#9090a0', marginTop: '4px' }}>
              Liga {leagueCode.toUpperCase()} • Temporada Oficial
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9090a0',
              fontSize: '1.5rem',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>
            Carregando resultados da FIA...
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#ff6666' }}>{error}</div>
        ) : resultsList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#888' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🏎️</div>
            <h3>Nenhuma corrida disputada ainda nesta temporada.</h3>
            <p style={{ fontSize: '0.9rem', color: '#aaa' }}>
              O primeiro Grande Prêmio será simulado no horário previsto pelo calendário oficial da liga!
            </p>
          </div>
        ) : (
          <div>
            {/* GP Selector Tabs / Dropdown */}
            {resultsList.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '16px' }}>
                {resultsList.map((res, idx) => (
                  <button
                    key={res.id}
                    onClick={() => setSelectedIndex(idx)}
                    style={{
                      background: selectedIndex === idx ? '#ff1801' : '#1c1c24',
                      color: '#fff',
                      border: '1px solid #2b2b36',
                      padding: '6px 14px',
                      borderRadius: '4px',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      fontWeight: selectedIndex === idx ? 'bold' : 'normal'
                    }}
                  >
                    GP {res.gpIndex + 1}
                  </button>
                ))}
              </div>
            )}

            {/* Circuit & GP Info */}
            <div style={{ background: '#1c1c24', padding: '14px 18px', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#00d2be', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                  Etapa {currentResult.gpIndex + 1}
                </span>
                <h3 style={{ margin: '2px 0 0 0', fontSize: '1.2rem', color: '#fff' }}>
                  {circuit?.gp || 'Grande Prêmio'}
                </h3>
                <div style={{ fontSize: '0.82rem', color: '#9090a0' }}>
                  {circuit?.circuito} • {circuit?.laps} Voltas
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#aaa' }}>
                <div>Safety Cars: <strong style={{ color: '#ffb800' }}>{currentResult.safetyCarCount}</strong></div>
                {currentResult.fastestLapDriverId && (
                  <div>Volta Mais Rápida: <strong style={{ color: '#d050ff' }}>{currentResult.fastestLapDriverId} (1 pt)</strong></div>
                )}
              </div>
            </div>

            {/* Podium Render */}
            {currentResult.results && currentResult.results.length >= 3 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                marginBottom: '24px',
                alignItems: 'end'
              }}>
                {/* 2nd Place */}
                <div style={{
                  background: 'linear-gradient(180deg, #1f232b 0%, #171821 100%)',
                  border: '1px solid #a8b0c0',
                  borderRadius: '8px',
                  padding: '16px 12px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.6rem', marginBottom: '4px' }}>🥈</div>
                  <div style={{ fontSize: '0.75rem', color: '#a8b0c0', fontWeight: 'bold' }}>2º LUGAR</div>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#fff', marginTop: '4px' }}>
                    {currentResult.results[1]?.driverName || currentResult.results[1]?.driverId}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    {currentResult.results[1]?.teamName || currentResult.results[1]?.teamId}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#00d2be', fontWeight: 'bold' }}>
                    +18 pts
                  </div>
                </div>

                {/* 1st Place */}
                <div style={{
                  background: 'linear-gradient(180deg, #2b2512 0%, #1c1a14 100%)',
                  border: '2px solid #ffd700',
                  borderRadius: '8px',
                  padding: '20px 12px',
                  textAlign: 'center',
                  transform: 'translateY(-6px)'
                }}>
                  <div style={{ fontSize: '2.2rem', marginBottom: '4px' }}>🥇</div>
                  <div style={{ fontSize: '0.8rem', color: '#ffd700', fontWeight: 'bold' }}>VENCEDOR</div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.15rem', color: '#fff', marginTop: '4px' }}>
                    {currentResult.results[0]?.driverName || currentResult.results[0]?.driverId}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#aaa' }}>
                    {currentResult.results[0]?.teamName || currentResult.results[0]?.teamId}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '1rem', color: '#ffd700', fontWeight: 'bold' }}>
                    +25 pts
                  </div>
                </div>

                {/* 3rd Place */}
                <div style={{
                  background: 'linear-gradient(180deg, #261c16 0%, #1a1715 100%)',
                  border: '1px solid #cd7f32',
                  borderRadius: '8px',
                  padding: '16px 12px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.6rem', marginBottom: '4px' }}>🥉</div>
                  <div style={{ fontSize: '0.75rem', color: '#cd7f32', fontWeight: 'bold' }}>3º LUGAR</div>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#fff', marginTop: '4px' }}>
                    {currentResult.results[2]?.driverName || currentResult.results[2]?.driverId}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>
                    {currentResult.results[2]?.teamName || currentResult.results[2]?.teamId}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#00d2be', fontWeight: 'bold' }}>
                    +15 pts
                  </div>
                </div>
              </div>
            )}

            {/* Results Table */}
            <div style={{ marginBottom: '24px' }}>
              <h4 style={{ color: '#00d2be', fontSize: '0.95rem', marginBottom: '10px', textTransform: 'uppercase' }}>
                Classificação Completa da Prova
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#1c1c24', color: '#9090a0', textAlign: 'left', borderBottom: '1px solid #2b2b36' }}>
                      <th style={{ padding: '8px 10px' }}>Pos</th>
                      <th style={{ padding: '8px 10px' }}>Piloto</th>
                      <th style={{ padding: '8px 10px' }}>Equipe</th>
                      <th style={{ padding: '8px 10px' }}>Grid</th>
                      <th style={{ padding: '8px 10px' }}>Tempo / Intervalo</th>
                      <th style={{ padding: '8px 10px' }}>Pits</th>
                      <th style={{ padding: '8px 10px' }}>Melhor Volta</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Pontos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(currentResult.results || []).map((row: any, i: number) => {
                      const isFL = row.hasFastestLap || currentResult.fastestLapDriverId === row.driverId;
                      const teamInfo = TEAMS.find(t => t.id === row.teamId);
                      return (
                        <tr
                          key={i}
                          style={{
                            borderBottom: '1px solid #22222d',
                            background: i % 2 === 0 ? '#15151e' : '#181822'
                          }}
                        >
                          <td style={{ padding: '8px 10px', fontWeight: 'bold', color: i < 3 ? '#ff1801' : '#fff' }}>
                            {row.position || i + 1}
                          </td>
                          <td style={{ padding: '8px 10px', fontWeight: 'bold', color: '#fff' }}>
                            {row.driverName || row.driverId}
                            {isFL && <span style={{ marginLeft: '6px', color: '#d050ff', fontSize: '0.75rem' }}>🟣 VR</span>}
                          </td>
                          <td style={{ padding: '8px 10px', color: teamInfo?.color || '#aaa' }}>
                            {teamInfo?.name || row.teamId}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#888' }}>
                            P{row.gridPosition || '-'}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#ccc', fontFamily: 'monospace' }}>
                            {row.timeGap || (i === 0 ? 'Vencedor' : '-')}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#888' }}>
                            {row.pitCount ?? 1}
                          </td>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: isFL ? '#d050ff' : '#888' }}>
                            {row.fastestLapTime || '-'}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: row.points > 0 ? '#00d2be' : '#555' }}>
                            {row.points > 0 ? `+${row.points}` : '0'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Event Radio Log */}
            {currentResult.events && currentResult.events.length > 0 && (
              <div>
                <h4 style={{ color: '#00d2be', fontSize: '0.95rem', marginBottom: '10px', textTransform: 'uppercase' }}>
                  Destaques & Rádio da Corrida
                </h4>
                <div style={{ background: '#1c1c24', padding: '12px 16px', borderRadius: '6px', maxHeight: '180px', overflowY: 'auto', fontSize: '0.8rem', lineHeight: 1.6 }}>
                  {currentResult.events.map((ev: any, idx: number) => {
                    // Eventos do motor vêm como { lap, kind, text }; formato antigo era texto puro
                    const text: string = typeof ev === 'string' ? ev : ev.text ?? '';
                    const kind: string = typeof ev === 'string' ? '' : ev.kind ?? '';
                    const color = kind === 'safetyCar' || text.includes('Safety Car') ? '#ffd700' : kind === 'quebra' || kind === 'colisao' || text.includes('abandono') ? '#ff5050' : '#bbb';
                    return (
                      <div key={idx} style={{ color }}>
                        • {typeof ev === 'string' ? '' : `V${ev.lap} · `}
                        {text}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid #2b2b36', paddingTop: '16px' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '8px 24px', background: '#222', border: '1px solid #333', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

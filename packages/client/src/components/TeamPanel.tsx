import React, { useState, useEffect } from 'react';
import { releaseCost } from '@f1m/core';
import { money, teamDef, type DriverContract, type LeagueTeam } from './LeagueDashboard';
import { teamAssets } from '../teamAssets';
import Helmet from './Helmet';

// ── tipos de staff ─────────────────────────────────────────────────────────
interface StaffMember { id: string; role: string; name: string; skill: number; personality: string; salary: number }
interface StaffRole { role: string; info: { name: string; effect: string }; member: StaffMember | null; poolCandidates: StaffMember[] }
interface FacilityInfo { id: string; info: { name: string; effect: string }; level: number; maxLevel: number; upgradeCost: number | null }
interface StaffData { staff: StaffRole[]; facilities: FacilityInfo[]; maintenance: number; cap: { used: number; limit: number } }

const PERSONALITY: Record<string, string> = { inovador: 'Inovador', metodico: 'Metódico', motivador: 'Motivador', exigente: 'Exigente' };

// Mesmas siglas e faixas do cartão de piloto do modo solo
const STATS: [keyof DriverContract, string, string][] = [
  ['talento', 'RIT', 'Ritmo de corrida (talento)'],
  ['classificacao', 'VOL', 'Volta lançada (classificação)'],
  ['gestaoPneus', 'PNE', 'Gestão de pneus'],
  ['concentracao', 'FOC', 'Concentração'],
  ['agressividade', 'ATQ', 'Ataque (agressividade)'],
  ['experiencia', 'EXP', 'Experiência'],
  ['condicionamento', 'FÍS', 'Condicionamento físico'],
  ['potencial', 'POT', 'Potencial']
];

const TIER_LABEL: Record<string, string> = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', elite: 'Elite', craque: 'Craque' };
const tier = (d: DriverContract) =>
  d.talento >= 92 ? 'craque' : d.ger >= 85 ? 'elite' : d.ger >= 75 ? 'ouro' : d.ger >= 65 ? 'prata' : 'bronze';

const ROLE_ORDER: Record<string, number> = { titular1: 0, titular2: 1, reserva: 2 };
const ROLE_LABEL: Record<string, string> = { titular1: 'P1', titular2: 'P2', reserva: 'Reserva' };

export default function TeamPanel({
  team,
  drivers,
  leagueCode,
  season,
  gpIndex,
  onChanged
}: {
  team: LeagueTeam;
  drivers: DriverContract[];
  leagueCode: string;
  season: number;
  gpIndex: number;
  onChanged: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [staffData, setStaffData] = useState<StaffData | null>(null);
  const [staffMsg, setStaffMsg] = useState<string | null>(null);
  const [expandRole, setExpandRole] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/leagues/${leagueCode}/staff`).then(r => r.json()).then(setStaffData);
  }, [leagueCode]);

  async function post(action: string, body: object) {
    const res = await fetch(`/api/leagues/${leagueCode}/market/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    setMsg(res.ok ? data.message ?? null : `⚠️ ${data.error}`);
    onChanged();
  }

  async function hireStaff(staffId: string) {
    const res = await fetch(`/api/leagues/${leagueCode}/staff/hire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId })
    });
    const data = await res.json();
    setStaffMsg(res.ok ? `✅ ${data.message}` : `⚠️ ${data.error}`);
    if (res.ok) {
      setExpandRole(null);
      fetch(`/api/leagues/${leagueCode}/staff`).then(r => r.json()).then(setStaffData);
      onChanged();
    }
  }

  async function upgradeFacility(facilityId: string) {
    const res = await fetch(`/api/leagues/${leagueCode}/facilities/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facilityId })
    });
    const data = await res.json();
    setStaffMsg(res.ok ? `✅ ${data.message}` : `⚠️ ${data.error}`);
    if (res.ok) {
      fetch(`/api/leagues/${leagueCode}/staff`).then(r => r.json()).then(setStaffData);
      onChanged();
    }
  }
  // Reserva entra no lugar do P2; o P2 clicado vira P1 (troca com o P1)
  function promote(d: DriverContract) {
    const t1 = team.drivers.find((x) => x.role === 'titular1')!;
    const t2 = team.drivers.find((x) => x.role === 'titular2')!;
    if (d.role === 'reserva') return post('starters', { titular1: t1.id, titular2: d.id });
    return post('starters', { titular1: d.id, titular2: t1.id === d.id ? t2.id : t1.id });
  }
  const def = teamDef(team.teamId);
  const assets = teamAssets(team.teamId);
  const payroll = team.drivers.reduce((sum, d) => sum + d.salario, 0);
  const sorted = [...team.drivers].sort((a, b) => (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3));

  return (
    <div className="stack">
      <div className="card hero" style={{ '--hero': def?.color } as React.CSSProperties}>
        <div className="hero-id">
          <img className="badge-logo" src={assets.logo} alt={def?.name} style={{ height: '37px', maxWidth: '125px' }} />
          <div>
            <h2>{def?.name}</h2>
            <p className="muted">Folha por GP: {money(payroll)} em salários.</p>
          </div>
        </div>
        <div className="car-photo" role="img" aria-label={`Carro da ${def?.name}`} style={{ maxWidth: '520px', aspectRatio: `${assets.ar} / 1` }}>
          <img src={assets.car} alt="" />
        </div>
      </div>

      <div className="stack">
        <div className="row" style={{ alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="muted small">Hierarquia:</span>
          {sorted.map((d) => (
            <button
              key={d.id}
              className="ghost small-btn"
              title={d.role === 'titular1' ? 'Piloto principal' : d.role === 'reserva' ? 'Clique para colocar como titular' : 'Clique para definir como P1'}
              style={{
                border: '1px solid',
                borderColor: d.role === 'titular1' ? 'var(--accent)' : 'var(--line)',
                color: d.role === 'titular1' ? 'var(--accent)' : 'var(--muted)',
                fontWeight: d.role === 'titular1' ? 700 : 400,
                display: 'flex',
                gap: '4px',
                alignItems: 'center'
              }}
              disabled={d.role === 'titular1'}
              onClick={() => promote(d)}
            >
              <span style={{ fontSize: '11px', fontWeight: 700 }}>{ROLE_LABEL[d.role] ?? d.role}</span>
              <span>{d.name}</span>
            </button>
          ))}
          <span className="muted small">(só titulares correm; mudanças até o fim do treino livre)</span>
        </div>
        {msg && <p className="tip small" style={{ margin: 0 }}>{msg}</p>}
      </div>

      {/* Teto de gastos */}
      {staffData && (
        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span className="muted small">Teto de gastos (pesquisa + fabricação + instalações)</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              <b style={{ color: staffData.cap.used / staffData.cap.limit > 0.85 ? 'var(--red)' : 'var(--accent)' }}>
                {money(staffData.cap.used)}
              </b>
              <span className="muted"> / {money(staffData.cap.limit)}</span>
            </span>
          </div>
          <div style={{ height: '4px', background: 'var(--line)', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, (staffData.cap.used / staffData.cap.limit) * 100)}%`, background: staffData.cap.used / staffData.cap.limit > 0.85 ? 'var(--red)' : 'var(--accent)', borderRadius: '2px', transition: 'width .3s' }} />
          </div>
        </div>
      )}

      <div className="grid two">
        {sorted.map((d) => {
          const [first, ...rest] = d.name.split(' ');
          const t = tier(d);
          const pos = drivers.findIndex((x) => x.id === d.id) + 1;
          return (
            <div key={d.id} className="card driver" style={{ '--driver': def?.color } as React.CSSProperties}>
              <div className="driver-head">
                <Helmet id={d.driverId} title={d.name} />
                <div className="driver-id">
                  <h3>{d.name}</h3>
                  <div className="muted small dh-meta">
                    {d.role === 'titular1' ? 'P1' : 'P2'} · {d.age} anos
                  </div>
                  <div className="dh-chips">
                    <span className="trait">{d.personalidade.charAt(0).toUpperCase() + d.personalidade.slice(1)}</span>
                  </div>
                  <div className="form">
                    <span className="form-chip">{pos}º</span>
                  </div>
                </div>
                <div className="driver-pts">
                  <b>{d.points}</b>
                  <span>pontos</span>
                </div>
              </div>
              <div className="driver-body">
                <div
                  className={`pilot-card ${t} md`}
                  title={`${d.name}: geral ${d.ger} (${TIER_LABEL[t]})`}
                  style={{ '--team-c': def?.color } as React.CSSProperties}
                >
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
                        <dd>{d[key] as number}</dd>
                        <dt>{abbr}</dt>
                      </div>
                    ))}
                  </dl>
                  <div className="pc-foot">{d.age} anos</div>
                </div>
                <div className="driver-facts">
                  <div className="facts">
                    <div>
                      <b>{d.wins}</b>
                      <span>vitórias</span>
                    </div>
                    <div>
                      <b>{d.podiums}</b>
                      <span>pódios</span>
                    </div>
                    <div>
                      <b>{d.poles}</b>
                      <span>poles</span>
                    </div>
                  </div>
                  <p className="muted small">
                    Salário {money(d.salario)} por GP · contrato até a temporada {d.contractEnds}
                  </p>
                  {team.drivers.length > 2 && (
                    <button
                      className="ghost small-btn"
                      onClick={() => {
                        const cost = releaseCost(d.salario, d.contractEnds, season, gpIndex);
                        if (window.confirm(`Rescindir o contrato de ${d.name}? A multa é de ${money(cost)} e ele volta ao mercado como piloto livre.`)) post('release', { contractId: d.id });
                      }}
                    >
                      Rescindir contrato
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Equipe técnica */}
      {staffData && (
        <div className="card">
          <h3 style={{ margin: '0 0 12px' }}>Equipe técnica</h3>
          {staffMsg && <p className="tip small" style={{ margin: '0 0 10px' }}>{staffMsg}</p>}
          <div className="stack" style={{ gap: '10px' }}>
            {staffData.staff.map((r) => (
              <div key={r.role}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div className="row" style={{ gap: '6px', alignItems: 'center' }}>
                      <b style={{ fontSize: '13px' }}>{r.info.name}</b>
                      {r.member && <span className="trait" style={{ fontSize: '11px' }}>{r.member.skill}</span>}
                    </div>
                    {r.member
                      ? <p className="muted small" style={{ margin: '2px 0 0' }}>{r.member.name} · {PERSONALITY[r.member.personality] ?? r.member.personality} · {money(r.member.salary)}/GP</p>
                      : <p className="muted small" style={{ margin: '2px 0 0', color: 'var(--red)' }}>Vaga sem titular</p>
                    }
                    <p className="muted" style={{ fontSize: '11px', margin: '2px 0 0', opacity: .7 }}>{r.info.effect}</p>
                  </div>
                  {r.poolCandidates.length > 0 && gpIndex <= 2 && (
                    <button className="ghost small-btn" onClick={() => setExpandRole(expandRole === r.role ? null : r.role)}>
                      {expandRole === r.role ? 'Fechar' : 'Contratar'}
                    </button>
                  )}
                </div>
                {expandRole === r.role && (
                  <div style={{ marginTop: '8px', background: 'var(--bg2)', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {r.poolCandidates.map((c) => (
                      <div key={c.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <div>
                          <span style={{ fontSize: '13px' }}>{c.name}</span>
                          <span className="muted small" style={{ marginLeft: '6px' }}>Hab {c.skill} · {PERSONALITY[c.personality] ?? c.personality} · {money(c.salary)}/GP · luvas {money(c.salary * 2)}</span>
                        </div>
                        <button className="ghost small-btn" onClick={() => {
                          if (window.confirm(`Contratar ${c.name}? Luvas de ${money(c.salary * 2)} debitadas agora.`)) hireStaff(c.id);
                        }}>Contratar</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instalações */}
      {staffData && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0 }}>Instalações</h3>
            <span className="muted small">Manutenção: {money(staffData.maintenance)}/GP</span>
          </div>
          <div className="grid two" style={{ gap: '10px' }}>
            {staffData.facilities.map((f) => (
              <div key={f.id} className="card" style={{ padding: '12px', background: 'var(--bg2)' }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                  <div>
                    <b style={{ fontSize: '13px' }}>{f.info.name}</b>
                    <p className="muted small" style={{ margin: '3px 0 0' }}>{f.info.effect}</p>
                  </div>
                  <span className="trait" style={{ fontSize: '12px', flexShrink: 0 }}>Nv {f.level}</span>
                </div>
                {/* barra de nível */}
                <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                  {Array.from({ length: f.maxLevel }).map((_, i) => (
                    <div key={i} style={{ flex: 1, height: '4px', borderRadius: '2px', background: i < f.level ? 'var(--accent)' : 'var(--line)' }} />
                  ))}
                </div>
                {f.upgradeCost !== null && (
                  <button
                    className="ghost small-btn"
                    style={{ marginTop: '8px', width: '100%', textAlign: 'center' }}
                    onClick={() => {
                      if (window.confirm(`Melhorar ${f.info.name} para nível ${f.level + 1}? Custo: ${money(f.upgradeCost!)}.`)) upgradeFacility(f.id);
                    }}
                  >
                    Melhorar → Nv {f.level + 1} ({money(f.upgradeCost)})
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

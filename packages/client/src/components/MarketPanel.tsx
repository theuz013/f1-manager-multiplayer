import React, { useEffect, useState } from 'react';
import { MAX_ROSTER, signingBonus } from '@f1m/core';
import { money, teamDef } from './LeagueDashboard';
import Helmet from './Helmet';

interface FreeAgent {
  driverId: string;
  name: string;
  age: number;
  ger: number;
  potencial: number;
  personalidade: string;
  talento: number;
  classificacao: number;
  gestaoPneus: number;
  asking: number;
  bonus: number;
  attemptsLeft: number;
}

interface Contracted extends Omit<FreeAgent, 'asking' | 'bonus' | 'attemptsLeft'> {
  contractId: string;
  salario: number;
  contractEnds: number;
  role: string;
  leagueTeamId: string;
  teamId: string;
  isAI: boolean;
  manager: string | null;
  value: number;
  release: number;
}

interface Offer {
  id: string;
  status: string;
  fee: number;
  counterFee: number | null;
  salary: number;
  expiresAt: string;
  driverName: string;
  direction: 'enviada' | 'recebida';
  otherTeam: string;
}

interface Market {
  open: boolean;
  closesAt: string | null;
  reason: string;
  myTeamId: string | null;
  myBudget: number;
  freeAgents: FreeAgent[];
  contracted: Contracted[];
  offers: Offer[];
  history: { id: string; gpIndex: number; season: number; text: string }[];
}

const STATUS: Record<string, string> = {
  PENDING: 'aguardando resposta',
  COUNTER_OFFER: 'contraproposta',
  COUNTER_ACCEPTED: 'contraproposta aceita',
  REJECTED: 'recusada',
  DRIVER_REFUSED: 'piloto recusou',
  COMPLETED: 'concluída',
  CANCELLED: 'retirada',
  EXPIRED: 'expirou'
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });

type Target = { kind: 'livre'; d: FreeAgent } | { kind: 'contrato'; d: Contracted };

export default function MarketPanel({ leagueCode, onChanged }: { leagueCode: string; onChanged: () => void }) {
  const [m, setM] = useState<Market | null>(null);
  const [filter, setFilter] = useState<'todos' | 'livres' | 'equipes'>('todos');
  const [sort, setSort] = useState<'ger' | 'potencial' | 'pedida' | 'age'>('ger');
  const [target, setTarget] = useState<Target | null>(null);
  const [salary, setSalary] = useState('');
  const [fee, setFee] = useState('');
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [counter, setCounter] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/leagues/${leagueCode}/market`);
    if (res.ok) setM(await res.json());
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [leagueCode]);

  async function post(action: string, body: object) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/leagues/${leagueCode}/market/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      setMsg(res.ok ? data.message ?? 'Feito.' : `⚠️ ${data.error}`);
      if (res.ok && data.ok !== false) setTarget(null);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!m) return <div className="card"><p className="muted">Carregando o mercado...</p></div>;

  const mine = m.contracted.filter((c) => c.leagueTeamId === m.myTeamId);
  const full = mine.length >= MAX_ROSTER;
  const rows: Target[] = [
    ...(filter !== 'equipes' ? m.freeAgents.map((d) => ({ kind: 'livre' as const, d })) : []),
    ...(filter !== 'livres' ? m.contracted.filter((c) => c.leagueTeamId !== m.myTeamId).map((d) => ({ kind: 'contrato' as const, d })) : [])
  ].sort((a, b) => {
    const pay = (t: Target) => (t.kind === 'livre' ? t.d.asking : t.d.salario);
    if (sort === 'pedida') return pay(a) - pay(b);
    if (sort === 'age') return a.d.age - b.d.age;
    return (b.d as any)[sort] - (a.d as any)[sort];
  });
  const openOffers = m.offers.filter((o) => ['PENDING', 'COUNTER_OFFER'].includes(o.status));
  const pastOffers = m.offers.filter((o) => !['PENDING', 'COUNTER_OFFER'].includes(o.status)).slice(0, 6);

  function choose(t: Target) {
    setTarget(t);
    setMsg(null);
    setReleaseId(null);
    if (t.kind === 'livre') setSalary(t.d.asking.toFixed(2));
    else {
      setSalary((t.d.salario * 1.15).toFixed(2));
      setFee((t.d.value * 1.2).toFixed(2));
    }
  }

  const sal = Number(salary.replace(',', '.')) || 0;
  const releaseCost = releaseId ? mine.find((c) => c.contractId === releaseId)?.release ?? 0 : 0;

  return (
    <div className="stack">
      <div className="card">
        <div className="lap-head">
          <h3>Mercado de pilotos</h3>
          <b className={m.open ? '' : 'loss'}>{m.open ? `Aberto até ${when(m.closesAt!)}` : 'Fechado'}</b>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {m.open
            ? `Caixa ${money(m.myBudget)} · elenco ${mine.length}/${MAX_ROSTER} (2 titulares + 1 reserva). Pilotos livres cobram luvas de 3× o salário; para tirar um piloto de outra equipe, a equipe dele precisa aceitar a multa e o piloto precisa topar o salário.`
            : m.reason}
        </p>
        {msg && <p className="tip small" style={{ marginBottom: 0 }}>{msg}</p>}
      </div>

      {openOffers.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--warn)' }}>
          <h3>Propostas em andamento</h3>
          <table className="table compact">
            <tbody>
              {openOffers.map((o) => {
                const counterVal = Number((counter[o.id] ?? '').replace(',', '.'));
                return (
                  <tr key={o.id}>
                    <td>
                      <b>{o.driverName}</b>
                      <div className="muted small">
                        {o.direction === 'recebida' ? `${o.otherTeam} quer comprar` : `Sua proposta à ${o.otherTeam}`} · multa {money(o.fee)}
                        {o.counterFee ? ` · contraproposta ${money(o.counterFee)}` : ''} · salário {money(o.salary)}/GP · expira {when(o.expiresAt)}
                      </div>
                    </td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      {o.direction === 'recebida' && o.status === 'PENDING' && (
                        <span className="row" style={{ gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button className="small-btn primary" disabled={busy || !m.open} onClick={() => post('respond', { offerId: o.id, action: 'accept' })}>
                            Aceitar
                          </button>
                          <button className="small-btn ghost" disabled={busy || !m.open} onClick={() => post('respond', { offerId: o.id, action: 'reject' })}>
                            Recusar
                          </button>
                          <input
                            type="number"
                            step="0.1"
                            min={o.fee}
                            placeholder="Contraproposta"
                            aria-label="Valor da contraproposta em milhões"
                            style={{ width: '120px' }}
                            value={counter[o.id] ?? ''}
                            onChange={(e) => setCounter({ ...counter, [o.id]: e.target.value })}
                          />
                          <button
                            className="small-btn"
                            disabled={busy || !m.open || !(counterVal > o.fee)}
                            onClick={() => post('respond', { offerId: o.id, action: 'counter', counterFee: counterVal })}
                          >
                            Contrapropor
                          </button>
                        </span>
                      )}
                      {o.direction === 'enviada' && o.status === 'COUNTER_OFFER' && (
                        <span className="row" style={{ gap: '6px', justifyContent: 'flex-end' }}>
                          <button className="small-btn primary" disabled={busy || !m.open} onClick={() => post('respond', { offerId: o.id, action: 'accept' })}>
                            Pagar {money(o.counterFee!)}
                          </button>
                          <button className="small-btn ghost" disabled={busy || !m.open} onClick={() => post('respond', { offerId: o.id, action: 'reject' })}>
                            Recusar
                          </button>
                        </span>
                      )}
                      {o.direction === 'enviada' && o.status === 'PENDING' && (
                        <span className="row" style={{ gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <span className="muted small">aguardando</span>
                          <button className="small-btn ghost" disabled={busy} onClick={() => post('respond', { offerId: o.id, action: 'cancel' })}>
                            Retirar
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {target && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <h3>Negociação: {target.d.name}</h3>
          {target.kind === 'livre' ? (
            <>
              <p>
                Pedida dele: <b>{money(target.d.asking)}/GP</b>.
              </p>
              {full && (
                <div style={{ display: 'grid', gap: '6px', margin: '6px 0' }}>
                  <b className="small">Quem dá lugar?</b>
                  {mine.map((c) => (
                    <button
                      key={c.contractId}
                      className={releaseId === c.contractId ? 'primary' : 'ghost'}
                      style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: '8px' }}
                      onClick={() => setReleaseId(c.contractId)}
                    >
                      <span>
                        {releaseId === c.contractId ? '●' : '○'} {c.name} · GER {c.ger}
                        {c.role === 'reserva' ? ' · reserva' : ''}
                      </span>
                      <span className="small nowrap">rescisão {money(c.release)}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="small" style={{ display: 'grid', gap: '4px', padding: '10px', border: '1px solid var(--line)', borderRadius: '10px', margin: '8px 0' }}>
                <div className="muted">Quanto custa fechar agora</div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Luvas de {target.d.name} (3× o salário)</span>
                  <b className="num nowrap">{money(signingBonus(sal))}</b>
                </div>
                {releaseId && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Rescisão de {mine.find((c) => c.contractId === releaseId)?.name}</span>
                    <b className="num nowrap">{money(releaseCost)}</b>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '4px' }}>
                  <b>Total</b>
                  <b className="num nowrap">{money(signingBonus(sal) + releaseCost)}</b>
                </div>
                <div className="muted">
                  Seu caixa: {money(m.myBudget)} · {m.myBudget >= signingBonus(sal) + releaseCost ? 'suficiente' : 'insuficiente'} · depois, {money(sal)}/GP de salário.
                </div>
              </div>
            </>
          ) : (
            <p className="muted small">
              {teamDef(target.d.teamId)?.name} ({target.d.isAI ? 'IA' : target.d.manager}) · valor de mercado {money(target.d.value)} · salário atual{' '}
              {money(target.d.salario)}/GP · {cap(target.d.personalidade)}. A equipe decide a multa; depois {target.d.name} decide se aceita o salário.
            </p>
          )}
          <div className="neg-form">
            {target.kind === 'contrato' && (
              <label className="neg-row">
                <span>Multa para a equipe (R$ mi)</span>
                <input type="number" inputMode="decimal" step="0.1" min="0" value={fee} onChange={(e) => setFee(e.target.value)} />
              </label>
            )}
            <label className="neg-row">
              <span>Salário (R$ mi/GP)</span>
              <input type="number" inputMode="decimal" step="0.05" min="0" value={salary} onChange={(e) => setSalary(e.target.value)} />
            </label>
            <div className="neg-btns">
              <button
                className="primary"
                disabled={busy || !m.open || (target.kind === 'livre' && full && !releaseId)}
                onClick={() =>
                  target.kind === 'livre'
                    ? post('sign', { driverId: target.d.driverId, salary: sal, releaseContractId: releaseId })
                    : post('offer', { contractId: target.d.contractId, fee: Number(fee.replace(',', '.')), salary: sal })
                }
              >
                Enviar proposta
              </button>
              <button className="ghost" onClick={() => setTarget(null)}>
                Desistir
              </button>
            </div>
          </div>
          {target.kind === 'livre' && <p className="muted small">Tentativas restantes: {target.d.attemptsLeft}.</p>}
        </div>
      )}

      <div className="mkx">
        <div className="mkx-tools">
          <div className="mkx-chips">
            {(
              [
                ['todos', 'Todos', m.freeAgents.length + m.contracted.length - mine.length],
                ['livres', 'Livres agora', m.freeAgents.length],
                ['equipes', 'Em outras equipes', m.contracted.length - mine.length]
              ] as const
            ).map(([k, label, n]) => (
              <button key={k} className={`mkx-chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
                {label}
                <span>{n}</span>
              </button>
            ))}
          </div>
          <label className="mkx-sort">
            Ordenar
            <select value={sort} onChange={(e) => setSort(e.target.value as any)}>
              <option value="ger">Nota (GER)</option>
              <option value="potencial">Potencial</option>
              <option value="pedida">Salário</option>
              <option value="age">Idade</option>
            </select>
          </label>
        </div>
        <div className="mkx-head">
          <span>GER</span>
          <span>Piloto</span>
          <span>Situação</span>
          <span>Atributos</span>
          <span>Potencial</span>
          <span className="r">Pedida/GP</span>
          <span></span>
        </div>
        {rows.map((t) => {
          const d = t.d;
          const key = t.kind === 'livre' ? d.driverId : t.d.contractId;
          const team = t.kind === 'contrato' ? teamDef(t.d.teamId) : null;
          return (
            <div key={key} className={`mkx-row ${target && (target.kind === 'livre' ? target.d.driverId : target.d.contractId) === key ? 'sel' : ''}`}>
              <div className={`mkx-ger ${d.ger >= 85 ? 'top' : d.ger >= 75 ? 'good' : ''}`}>{d.ger}</div>
              <div className="mkx-name">
                <div className="n">
                  <Helmet id={d.driverId} size={20} />
                  <b>{d.name}</b>
                </div>
                <div className="s">
                  {d.age} anos <span className="trait">{cap(d.personalidade)}</span>
                </div>
              </div>
              <div className="mkx-team">
                {t.kind === 'livre' ? (
                  <span className="mkx-free">Livre</span>
                ) : (
                  <>
                    <span className="t">
                      <i className="team-chip" style={{ background: team?.color }} />
                      {team?.name}
                      {t.d.role === 'reserva' ? ' (reserva)' : ''}
                    </span>
                    <span className="s">
                      {t.d.isAI ? 'IA' : t.d.manager} · contrato até T{t.d.contractEnds}
                    </span>
                  </>
                )}
              </div>
              <div className="mkx-attrs">
                {(
                  [
                    ['TAL', d.talento],
                    ['CLA', d.classificacao],
                    ['PNE', d.gestaoPneus]
                  ] as const
                ).map(([lbl, v]) => (
                  <div key={lbl} className="mkx-bar">
                    <span>{lbl}</span>
                    <i>
                      <b style={{ width: `${v}%` }} />
                    </i>
                    <em>{v}</em>
                  </div>
                ))}
              </div>
              <div className="mkx-pot">{d.potencial > d.ger ? d.potencial : <span className="muted">—</span>}</div>
              <div className="mkx-pay">{money(t.kind === 'livre' ? t.d.asking : t.d.salario)}</div>
              <div className="mkx-act">
                {t.kind === 'livre' && t.d.attemptsLeft === 0 ? (
                  <span className="muted small">Encerrou a conversa</span>
                ) : (
                  <button className={t.kind === 'livre' ? 'primary' : 'ghost'} disabled={!m.open} onClick={() => choose(t)}>
                    {t.kind === 'livre' ? 'Contratar' : 'Proposta'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid two">
        <div className="card">
          <h3>Histórico de transferências</h3>
          {m.history.length === 0 && <p className="muted small">Nenhuma movimentação ainda.</p>}
          <ul className="news">
            {m.history.map((h) => (
              <li key={h.id}>
                <span className="muted small">GP {h.gpIndex + 1}</span> {h.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3>Suas propostas encerradas</h3>
          {pastOffers.length === 0 && <p className="muted small">Nada por aqui ainda.</p>}
          <table className="table compact">
            <tbody>
              {pastOffers.map((o) => (
                <tr key={o.id}>
                  <td>
                    {o.driverName}
                    <div className="muted small">
                      {o.direction === 'enviada' ? `para a ${o.otherTeam}` : `da ${o.otherTeam}`} · {money(o.counterFee ?? o.fee)}
                    </div>
                  </td>
                  <td className={`right small ${o.status === 'COMPLETED' ? 'gain' : 'muted'}`}>{STATUS[o.status] ?? o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { money, type LeagueTeam } from './LeagueDashboard';
import SponsorsCard from './SponsorsCard';

interface LedgerEntry {
  id: string;
  season: number;
  gpIndex: number;
  kind: string;
  amount: number;
  label: string;
  createdAt: string;
}

const KIND_LABELS: Record<string, string> = {
  contratacao: 'Contratações de pilotos',
  salario: 'Salários de pilotos',
  fabricacao: 'Equipe técnica (salários)',
  manutencao: 'Manutenção das instalações',
  instalacao: 'Instalações e contratações',
  engenheiros: 'Engenheiros de P&D',
  pesquisa: 'Projetos de P&D',
  espionagem: 'Inteligência (espionagem)',
  premio: 'Prêmios',
  troca: 'Troca de peças',
  luvas: 'Luvas de pilotos',
  transferencia: 'Transferências',
  rescisao: 'Rescisões',
  verba: 'Verba da categoria',
  patrocinio: 'Patrocínios'
};

const signed = (v: number) => `${v < 0 ? '−' : '+'} ${money(Math.abs(v))}`;

export default function FinancePanel({ leagueCode, team, onChanged }: { leagueCode: string; team: LeagueTeam; onChanged: () => void }) {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/leagues/${leagueCode}/ledger`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setEntries(data);
      })
      .catch((err) => setError(err.message));
  }, [leagueCode, team.budget]);

  const list = entries ?? [];
  const income = list.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const spend = list.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0);
  const totals = list.reduce<Record<string, number>>((acc, e) => {
    acc[e.kind] = (acc[e.kind] ?? 0) + e.amount;
    return acc;
  }, {});

  return (
    <div className="stack">
      <div className="kpis">
        <div className={`kpi ${team.budget < 0 ? 'bad' : ''}`}>
          <span className="kpi-label">Saldo</span>
          <span className="kpi-value">{money(team.budget)}</span>
          <span className="kpi-sub">Orçamento único da equipe</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Receitas</span>
          <span className="kpi-value gain">{money(income)}</span>
          <span className="kpi-sub">Prêmios, patrocínios e verba</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Despesas</span>
          <span className="kpi-value loss">{money(Math.abs(spend))}</span>
          <span className="kpi-sub">Inclui contratações e salários</span>
        </div>
      </div>

      <SponsorsCard leagueCode={leagueCode} onChanged={onChanged} />

      <div className="grid two">
        <div className="card">
          <h3>Resumo por categoria</h3>
          <table className="table compact">
            <tbody>
              {Object.entries(totals).map(([kind, total]) => (
                <tr key={kind}>
                  <td>{KIND_LABELS[kind] ?? kind}</td>
                  <td className={`num right ${total < 0 ? 'loss' : 'gain'}`}>{signed(total)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Resultado</td>
                <td className="num right">{signed(income + spend)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Transações</h3>
          {error && <p className="small" role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
          {entries === null && !error && <p className="muted small">Carregando...</p>}
          {entries?.length === 0 && <p className="muted small">Nenhuma movimentação ainda.</p>}
          {list.length > 0 && (
            <table className="table compact">
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td className="muted">
                      T{e.season} · GP {e.gpIndex + 1}
                    </td>
                    <td>{e.label}</td>
                    <td className={`num right ${e.amount < 0 ? 'loss' : 'gain'}`}>{signed(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

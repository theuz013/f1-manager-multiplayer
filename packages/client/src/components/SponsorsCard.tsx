import React, { useEffect, useState } from 'react';
import { SPONSOR_KIND_LABEL, SPONSOR_TARGET_LABEL, type SponsorKind, type SponsorTarget } from '@f1m/core';
import { money } from './LeagueDashboard';

interface Sponsor {
  id: string;
  name: string;
  size: string;
  kind: SponsorKind;
  target: SponsorTarget;
  perGp: number;
  bonus: number;
  gpsLeft: number;
  goal: number | null;
  seasonBonus: number;
}

interface SponsorInfo {
  appeal: number;
  maxSecondary: number;
  active: Sponsor[];
  offers: Sponsor[];
}

const SIZE_LABEL: Record<string, string> = { global: 'marca global', nacional: 'marca nacional', local: 'marca local' };

function terms(s: Sponsor) {
  if (s.kind === 'master') return `${money(s.perGp)} por GP por ${s.gpsLeft} GPs · bônus de ${money(s.seasonBonus)} se terminar em ${s.goal}º ou melhor`;
  if (s.kind === 'ocasiao') return `${money(s.bonus)} só neste GP, se ${SPONSOR_TARGET_LABEL[s.target]}`;
  return `${money(s.perGp)} por GP por ${s.gpsLeft} GPs · +${money(s.bonus)} quando ${SPONSOR_TARGET_LABEL[s.target]}`;
}

export default function SponsorsCard({ leagueCode, onChanged }: { leagueCode: string; onChanged: () => void }) {
  const [info, setInfo] = useState<SponsorInfo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/leagues/${leagueCode}/sponsors`);
    if (res.ok) setInfo(await res.json());
  }
  useEffect(() => {
    load();
  }, [leagueCode]);

  async function accept(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/leagues/${leagueCode}/sponsors/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorId: id })
      });
      const data = await res.json();
      setMsg(res.ok ? data.message : `⚠️ ${data.error}`);
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (!info) return null;
  const hasMaster = info.active.some((s) => s.kind === 'master');
  const secondaries = info.active.filter((s) => s.kind === 'secundario').length;
  const hasOccasion = info.active.some((s) => s.kind === 'ocasiao');
  const canSign = (s: Sponsor) =>
    s.kind === 'master' ? !hasMaster : s.kind === 'ocasiao' ? !hasOccasion : secondaries < info.maxSecondary;

  return (
    <div className="card patrocinio">
      <div className="lap-head">
        <h3>Patrocínios</h3>
        <span className="small">
          Atratividade comercial <b>{info.appeal}</b>
          <small className="muted">/100</small>
        </span>
      </div>
      <div className="fit-bar" style={{ margin: '4px 0 8px' }}>
        <i style={{ width: `${info.appeal}%` }} />
      </div>
      <p className="muted small">
        Sobe com a posição no campeonato, vitórias e pódios. Marcas maiores pagam mais. Master: um por vez. Secundários: até {info.maxSecondary}. Ação de ocasião:
        vale só para o GP atual.
      </p>
      {msg && <p className="tip small">{msg}</p>}

      <h4 style={{ margin: '10px 0 4px' }}>Contratos ativos</h4>
      {info.active.length === 0 ? (
        <p className="muted small">Nenhum contrato ainda.</p>
      ) : (
        <table className="table compact">
          <tbody>
            {info.active.map((s) => (
              <tr key={s.id}>
                <td>
                  <b>{s.name}</b>
                  <div className="muted small">
                    {SPONSOR_KIND_LABEL[s.kind]} · {SIZE_LABEL[s.size]}
                  </div>
                </td>
                <td className="small">{terms(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h4 style={{ margin: '12px 0 4px' }}>Ofertas deste GP</h4>
      {info.offers.length === 0 ? (
        <p className="muted small">Nenhuma oferta agora. Novas propostas chegam depois de cada GP.</p>
      ) : (
        <table className="table compact">
          <tbody>
            {info.offers.map((s) => (
              <tr key={s.id}>
                <td>
                  <b>{s.name}</b>
                  <div className="muted small">
                    {SPONSOR_KIND_LABEL[s.kind]} · {SIZE_LABEL[s.size]}
                  </div>
                </td>
                <td className="small">{terms(s)}</td>
                <td className="right">
                  <button className="small-btn primary" disabled={busy || !canSign(s)} onClick={() => accept(s.id)} title={canSign(s) ? '' : 'Não cabe no seu quadro de patrocínios'}>
                    Assinar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

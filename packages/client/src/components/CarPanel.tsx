import React, { useState } from 'react';
import { CAR_PARTS, CAR_PART_LABELS, MAX_PART_LEVEL, partFabricationCost, partReplaceCost } from '@f1m/core';
import { money, type LeagueTeam } from './LeagueDashboard';

// Descrições das peças iguais às do modo solo
const PART_HINTS: Record<string, string> = {
  chassi: 'Base de tudo: curvas e retas',
  motor: 'Potência nas retas',
  asaDianteira: 'Entrada de curva',
  asaTraseira: 'Tração e curvas: vale mais em pista travada',
  suspensao: 'Zebras e curvas: deixa o carro mais fácil de acertar',
  freios: 'Frenagens fortes',
  cambio: 'Aceleração'
};

export default function CarPanel({
  leagueCode,
  team,
  isLocked,
  onChanged,
  onGoToRnd
}: {
  leagueCode: string;
  team: LeagueTeam;
  isLocked: boolean;
  onChanged: () => void;
  onGoToRnd: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const levels: Record<string, number> = {
    ...Object.fromEntries(CAR_PARTS.map((p) => [p, 5])),
    ...(team.carLevels ? JSON.parse(team.carLevels) : {})
  };
  const wear: Record<string, number> = team.carWear ? JSON.parse(team.carWear) : {};
  const fabrica: number = team.facilities ? JSON.parse(team.facilities).fabrica : 2;
  const designs: Record<string, number> = team.rndJson ? JSON.parse(team.rndJson).designs : {};

  async function act(action: 'replace' | 'fabricate', part: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueCode}/car/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onChanged();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Carro</h2>
      <p className="muted">
        Nível melhora o ritmo. Novos níveis saem do P&D e depois precisam ser fabricados. Desgaste tira rendimento e sobe a cada GP. Toda peça nova vem com desgaste zero.
      </p>
      {isLocked && <p className="tip small">🔒 Grid fechado: o carro não pode ser alterado até o fim do GP.</p>}
      {error && (
        <p role="alert" className="small" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      )}

      <div className="parts">
        {CAR_PARTS.map((part) => {
          const lvl = levels[part];
          const w = wear[part] ?? 0;
          const replaceCost = partReplaceCost(part, lvl, fabrica);
          const hasDesign = (designs[part] ?? lvl) > lvl;
          const fabCost = hasDesign && lvl < MAX_PART_LEVEL ? partFabricationCost(part, lvl + 1, fabrica) : null;
          return (
            <div key={part} className="part">
              <div className="part-head">
                <div>
                  <b>{CAR_PART_LABELS[part]}</b>
                  <div className="muted small">{PART_HINTS[part]}</div>
                </div>
                <b className="num part-lv">{lvl}</b>
              </div>
              <div className="pips" aria-label={`Nível ${lvl} de ${MAX_PART_LEVEL}`}>
                {Array.from({ length: MAX_PART_LEVEL }, (_, i) => (
                  <i key={i} className={i < lvl ? 'on' : ''} />
                ))}
              </div>
              <div className="part-wear">
                <span className="muted small">Desgaste</span>
                <div className={`bar small wear ${w >= 80 ? 'danger' : w >= 50 ? 'warn' : ''}`}>
                  <div style={{ width: `${w}%` }} />
                </div>
                <span className="num small">{w}%</span>
              </div>
              <div className="part-btns">
                {fabCost !== null ? (
                  <button className="primary" disabled={isLocked || busy || team.budget < fabCost} onClick={() => act('fabricate', part)}>
                    Fabricar {lvl + 1} · {money(fabCost)}
                  </button>
                ) : lvl >= MAX_PART_LEVEL ? (
                  <button className="ghost" disabled>
                    Nível máximo
                  </button>
                ) : (
                  <button className="ghost" onClick={onGoToRnd}>
                    Desenvolver no P&D
                  </button>
                )}
                <button
                  disabled={isLocked || busy || w === 0 || team.budget < replaceCost}
                  onClick={() => act('replace', part)}
                >
                  Trocar · {money(replaceCost)}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

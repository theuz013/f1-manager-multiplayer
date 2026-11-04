// Regras do mercado de pilotos do multiplayer (inspiradas no modo solo e na especificação §13–20)

export const MAX_ROSTER = 3;
export const MIN_ROSTER = 2;
export const SIGNING_BONUS_FACTOR = 3; // luvas = 3× o salário por GP
export const NEGOTIATION_ATTEMPTS = 3;
export const OFFENSIVE_RATIO = 0.7;
export const OFFER_TTL_HOURS = 24;
export const GPS_PER_SEASON = 12;

export interface MarketDriver {
  ger: number;
  age: number;
  potencial: number;
  personalidade: string;
  salario: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Valor de mercado (R$ mi) usado como referência de multa e pela IA. */
export function marketValue(d: Pick<MarketDriver, 'ger' | 'age' | 'potencial'>) {
  const base = Math.max(0, d.ger - 60) * 0.35;
  const upside = Math.max(0, d.potencial - d.ger) * 0.15;
  const youth = d.age <= 23 ? 1 : d.age >= 33 ? -1 : 0;
  return round2(Math.max(1, base + upside + youth));
}

/** Salário que o piloto livre pede (R$ mi por GP). */
export function askingSalary(d: MarketDriver, buyerPosition: number, teams: number) {
  let f = 1;
  if (d.personalidade === 'ambicioso') f += buyerPosition > teams / 2 ? 0.2 : 0; // cobra mais de equipe fraca
  if (d.personalidade === 'leal') f -= 0.05;
  if (d.age <= 22) f -= 0.05; // jovem aceita menos por uma vaga
  return round2(d.salario * f);
}

export function signingBonus(salary: number) {
  return round2(salary * SIGNING_BONUS_FACTOR);
}

/** GPs restantes de contrato a partir do GP atual. */
export function remainingGps(contractEnds: number, season: number, gpIndex: number) {
  return Math.max(0, (contractEnds - season) * GPS_PER_SEASON + (GPS_PER_SEASON - gpIndex));
}

/** Rescisão: metade dos salários que faltam no contrato. */
export function releaseCost(salario: number, contractEnds: number, season: number, gpIndex: number) {
  return round2(salario * remainingGps(contractEnds, season, gpIndex) * 0.5);
}

export type FreeAgentAnswer = { verdict: 'aceita' } | { verdict: 'recusa'; ask: number } | { verdict: 'ofensiva' };

export function freeAgentAnswer(offered: number, asking: number): FreeAgentAnswer {
  if (offered >= asking) return { verdict: 'aceita' };
  if (offered < asking * OFFENSIVE_RATIO) return { verdict: 'ofensiva' };
  return { verdict: 'recusa', ask: asking };
}

/**
 * Piloto sob contrato decide se troca de equipe depois que as equipes chegaram a um acordo.
 * Posição: 1 = líder do construtores.
 */
export function transferAnswer(d: MarketDriver, offeredSalary: number, buyerPosition: number, currentPosition: number) {
  let need = 1.1;
  let reason = 'quer um aumento de pelo menos 10%';
  if (d.personalidade === 'leal') {
    need = 1.35;
    reason = 'é leal à equipe e só sai com aumento de 35%';
  } else if (d.personalidade === 'ambicioso') {
    if (buyerPosition > currentPosition) return { accept: false, reason: 'é ambicioso e não quer ir para uma equipe pior colocada' };
    need = 1.0;
    reason = 'é ambicioso: vai para equipe melhor sem exigir aumento';
  } else if (d.personalidade === 'calmo') {
    need = 1.15;
    reason = 'prefere estabilidade e pede 15% a mais';
  }
  const accept = offeredSalary >= d.salario * need;
  return { accept, reason: accept ? 'aceitou as condições' : reason, minimum: round2(d.salario * need) };
}

export type OwnerAnswer = { action: 'accept' } | { action: 'counter'; fee: number } | { action: 'reject'; reason: string };

/** Resposta automática de uma equipe da IA a uma proposta pelo seu piloto. */
export function aiOwnerAnswer(fee: number, value: number, rosterSize: number): OwnerAnswer {
  if (rosterSize <= MIN_ROSTER) return { action: 'reject', reason: 'a equipe não tem reposição para o piloto' };
  if (fee >= value * 1.2) return { action: 'accept' };
  if (fee >= value * 0.8) return { action: 'counter', fee: round2(value * 1.4) };
  return { action: 'reject', reason: 'valor muito abaixo do que o piloto vale' };
}

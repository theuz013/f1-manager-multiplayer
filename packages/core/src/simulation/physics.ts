import { SetupParameter, CarSetup } from '../constants/carParts.js';
import { CarPartsMap, CarPartStatus } from '../types/index.js';
import { CircuitDefinition } from '../constants/circuits.js';

export const F1_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;
export const GP_PRIZE_MONEY = [6.8, 5.5, 4.7, 3.8, 3.4, 3.0, 2.6, 2.1, 1.7, 1.3] as const;

export interface PRNG {
  next: () => number;
  range: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  gauss: () => number;
  chance: (prob: number) => boolean;
  pick: <T>(arr: T[]) => T;
}

/**
 * Gerador determinístico baseado em semente (fe)
 */
export function createPRNG(seed: number): PRNG {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 1831565813) >>> 0;
    let a = s;
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
  const range = (min: number, max: number) => min + next() * (max - min);
  const int = (min: number, max: number) => Math.floor(range(min, max + 1));
  const gauss = () => {
    const a = Math.max(next(), 1e-9);
    const b = next();
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
  };
  const chance = (prob: number) => next() < prob;
  const pick = <T>(arr: T[]) => arr[Math.floor(next() * arr.length)];

  return { next, range, int, gauss, chance, pick };
}

/**
 * Hash determinístico de string para uint32 (Un)
 */
export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pesos das peças do carro de acordo com a exigência do circuito (Lp)
 */
export function getCarPartWeights(circuit: CircuitDefinition): Record<string, number> {
  const p = circuit.potencia;
  const raw: Record<string, number> = {
    chassi: 0.2,
    motor: 0.1 + 0.3 * p,
    asaDianteira: 0.05 + 0.15 * (1 - p),
    asaTraseira: 0.05 + 0.15 * (1 - p),
    suspensao: 0.1,
    freios: 0.08,
    cambio: 0.08
  };
  const total = Object.values(raw).reduce((sum, v) => sum + v, 0);
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / total]));
}

/**
 * Desempenho geral do carro no circuito (Cs)
 */
export function calculateCarPerformance(car: CarPartsMap, circuit: CircuitDefinition): number {
  const weights = getCarPartWeights(circuit);
  let perf = 0;
  for (const part of Object.keys(weights)) {
    const status = car[part as keyof CarPartsMap] || { level: 5, wear: 0 };
    perf += weights[part] * status.level * (1 - (status.wear / 100) * 0.25);
  }
  return perf;
}

/**
 * Fator de bônus por nível das peças de fábrica (Op)
 */
export function getFacilityBonus(car: CarPartsMap): number {
  const parts = ['chassi', 'suspensao', 'asaDianteira', 'asaTraseira'] as const;
  const avgLevel = parts.reduce((acc, p) => acc + (car[p]?.level ?? 5), 0) / parts.length;
  return 1.25 - avgLevel * 0.05;
}

/**
 * Penalidade de tempo por erro no acerto do carro (Qc)
 */
export function calculateSetupPenalty(
  setup: CarSetup,
  circuit: CircuitDefinition,
  car?: CarPartsMap
): number {
  const params: (keyof CarSetup)[] = ['asas', 'motor', 'freios', 'cambio', 'suspensao'];
  let totalDelta = 0;
  for (const param of params) {
    totalDelta += Math.abs(setup[param] - circuit.idealSetup[param]);
  }
  const bonus = car ? getFacilityBonus(car) : 1;
  return totalDelta * 0.006 * bonus;
}

/**
 * Bônus de tempo de volta do piloto por talento e experiência (Dp)
 */
export function calculateDriverPaceBonus(talent: number, experience: number): number {
  return -(talent - 50) * 0.01 - (experience - 50) * 0.004;
}

/**
 * Bônus de volta rápida em classificação (Fp)
 */
export function calculateQualiPaceBonus(qualifyingSkill: number): number {
  return -(qualifyingSkill - 50) * 0.004;
}

/**
 * Tempo de volta base calculado pelo motor de física (Vc)
 */
export function calculateLapTime(
  car: CarPartsMap,
  setup: CarSetup,
  driver: { talento: number; experiencia: number },
  circuit: CircuitDefinition
): number {
  const carPerf = calculateCarPerformance(car, circuit);
  const setupPenalty = calculateSetupPenalty(setup, circuit, car);
  const driverBonus = calculateDriverPaceBonus(driver.talento, driver.experiencia);

  return circuit.baseLap - (carPerf - 5.5) * 0.22 + setupPenalty + driverBonus;
}

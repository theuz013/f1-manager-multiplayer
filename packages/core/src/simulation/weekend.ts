import { CarSetup, SETUP_PARAMETERS } from '../constants/carParts.js';
import { CircuitDefinition } from '../constants/circuits.js';
import { CarPartsMap } from '../types/index.js';
import { calculateLapTime, calculateQualiPaceBonus, createPRNG, hashString } from './physics.js';
import { TIRE_SPECS } from './tires.js';

// Regras do fim de semana portadas do modo solo (v1.4.4)
export const PRACTICE_BASE_LAPS = 10;
export const QUALI_RUNS: Record<1 | 2 | 3, number> = { 1: 3, 2: 3, 3: 2 };
export const QUALI_ERROR_CHANCE = 0.05;
const FEEDBACK_DEADZONE = 5;
const TRACK_EVOLUTION = 0.15;

export const SETUP_LABELS: Record<keyof CarSetup, { name: string; low: string; high: string }> = {
  asas: { name: 'Asas', low: 'pouca carga', high: 'muita carga' },
  motor: { name: 'Mapa do motor', low: 'econômico', high: 'máximo' },
  freios: { name: 'Balanço de freio', low: 'dianteiro', high: 'traseiro' },
  cambio: { name: 'Relação do câmbio', low: 'curta', high: 'longa' },
  suspensao: { name: 'Suspensão', low: 'macia', high: 'dura' }
};

const FEEDBACK: Record<keyof CarSetup, { high: string; low: string }> = {
  asas: { high: 'o carro está lento nas retas, tem asa demais', low: 'falta aderência nas curvas rápidas' },
  motor: { high: 'o motor está no limite, esquenta e perde rendimento', low: 'falta potência na saída das curvas' },
  freios: { high: 'a traseira trava nas frenagens', low: 'a dianteira trava quando eu freio forte' },
  cambio: { high: 'as marchas estão longas, falta aceleração', low: 'as marchas estão curtas, bate no limitador na reta' },
  suspensao: { high: 'o carro está duro demais e pula nas zebras', low: 'o carro está mole e balança muito' }
};

const HOUR = 3600_000;

export type WeekendMilestone = 'practiceEnd' | 'q1End' | 'q2End' | 'q3End' | 'lockAt' | 'raceAt';

/** Marcos do GP (T = largada) com o que acontece em cada um, usados pelo botão de admin. */
export function weekendMilestones(raceAt: Date | string, gpNumber: number) {
  const T = new Date(raceAt).getTime();
  const at = (h: number) => new Date(T - h * HOUR);
  return [
    { key: 'practiceEnd', at: at(24), label: 'Encerrar o treino livre e abrir o Q1', effect: 'O treino livre e as mudanças no carro terminam. O Q1 abre com 3 voltas por piloto.' },
    { key: 'q1End', at: at(20), label: 'Encerrar o Q1 e abrir o Q2', effect: 'Quem não marcou volta faz uma automática. Os 6 mais lentos são eliminados.' },
    { key: 'q2End', at: at(16), label: 'Encerrar o Q2 e abrir o Q3', effect: 'Quem não marcou volta faz uma automática. Mais 6 pilotos são eliminados.' },
    { key: 'q3End', at: at(12), label: 'Encerrar o Q3 e definir o grid', effect: 'O grid de largada é publicado e o acerto entra em parque fechado.' },
    { key: 'lockAt', at: at(1), label: 'Fechar o grid (trava 1h antes da largada)', effect: 'Estratégias ficam travadas: ninguém altera mais nada até a corrida.' },
    { key: 'raceAt', at: at(0), label: `Largar a corrida do GP ${gpNumber} agora`, effect: `A corrida é simulada, os resultados saem e a liga passa para o GP ${gpNumber + 1}.` }
  ] as { key: WeekendMilestone; at: Date; label: string; effect: string }[];
}

export function nextWeekendMilestone(raceAt: Date | string, gpNumber: number, now = Date.now()) {
  return weekendMilestones(raceAt, gpNumber).find((m) => m.at.getTime() > now) ?? null;
}

export interface WeekendDriver {
  id: string;
  talento: number;
  experiencia: number;
  classificacao: number;
  concentracao: number;
  personalidade?: string;
  readBonus?: number; // engenheiro de corrida: leitura mais precisa do piloto
}

export interface LapReading {
  time: number;
  fit: number;
  feedback: string[];
  hints: Partial<Record<keyof CarSetup, number>>;
  deleted?: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function practiceLapLimit(simulador: number, engineerSkill = 0) {
  return PRACTICE_BASE_LAPS + (simulador - 1) * 2 + (engineerSkill >= 70 ? 2 : 0);
}

/** Cada piloto tem uma preferência pessoal (±12) em cima do ideal da pista, fixa pelo ID. */
export function driverIdealSetup(circuit: CircuitDefinition, driverId: string): CarSetup {
  const rng = createPRNG(hashString(`pref-${driverId}`));
  return Object.fromEntries(
    SETUP_PARAMETERS.map((p) => [p, clamp(Math.round(circuit.idealSetup[p] + (rng.next() * 24 - 12)), 0, 100)])
  ) as unknown as CarSetup;
}

// Penalidade de acerto em relação ao ideal do piloto: reaproveita a física do core trocando o ideal da pista
function lapBase(car: CarPartsMap, setup: CarSetup, driver: WeekendDriver, circuit: CircuitDefinition) {
  return calculateLapTime(car, setup, driver, { ...circuit, idealSetup: driverIdealSetup(circuit, driver.id) });
}

function readSetup(setup: CarSetup, ideal: CarSetup, driver: WeekendDriver, rng: ReturnType<typeof createPRNG>) {
  const noise = Math.max(1, 4 - driver.experiencia * 0.03 - (driver.readBonus ?? 0) * 0.4);
  const feedback: string[] = [];
  const hints: LapReading['hints'] = {};
  let total = 0;
  for (const p of SETUP_PARAMETERS) {
    total += Math.abs(setup[p] - ideal[p]);
    const felt = setup[p] - ideal[p] + rng.gauss() * noise;
    const size = Math.abs(felt);
    if (size < FEEDBACK_DEADZONE) continue;
    feedback.push(`${size > 25 ? 'Muito' : size > 12 ? 'Bastante' : 'Um pouco'}: ${felt > 0 ? FEEDBACK[p].high : FEEDBACK[p].low}.`);
    const hint = clamp(-Math.round(felt / 5) * 5, -setup[p], 100 - setup[p]);
    if (hint) hints[p] = hint;
  }
  if (!feedback.length) feedback.push('O carro está ótimo, não mexeria em nada.');
  const fit = Math.round(clamp(100 - (total / SETUP_PARAMETERS.length) * 2.5 + rng.gauss() * 1.5, 0, 100));
  return { feedback, hints, fit };
}

export function practiceLap(car: CarPartsMap, setup: CarSetup, driver: WeekendDriver, circuit: CircuitDefinition, seed: number): LapReading {
  const rng = createPRNG(seed);
  const reading = readSetup(setup, driverIdealSetup(circuit, driver.id), driver, rng);
  const time = lapBase(car, setup, driver, circuit) + 0.4 + rng.gauss() * 0.06;
  return { time: Math.round(time * 1000) / 1000, ...reading };
}

export function qualiLap(
  car: CarPartsMap,
  setup: CarSetup,
  driver: WeekendDriver,
  circuit: CircuitDefinition,
  session: 1 | 2 | 3,
  seed: number
): LapReading {
  const rng = createPRNG(seed);
  const reading = readSetup(setup, driverIdealSetup(circuit, driver.id), driver, rng);
  let pers = 0;
  if (driver.personalidade === 'perfeccionista') pers = 5;
  else if (driver.personalidade === 'calmo') pers = 4;
  else if (driver.personalidade === 'leal') pers = -2;
  const focus = clamp(driver.concentracao + pers, 5, 100);
  const time =
    lapBase(car, setup, driver, circuit) +
    calculateQualiPaceBonus(driver.classificacao) +
    TIRE_SPECS.macio.offset -
    1.6 -
    TRACK_EVOLUTION * (session - 1) +
    rng.gauss() * 0.18 * (1.3 - focus / 100);
  return { time: Math.round(time * 1000) / 1000, ...reading, deleted: rng.next() < QUALI_ERROR_CHANCE };
}

/** Faixa onde o engenheiro acha que está o ideal de cada ajuste, cruzando as dicas das voltas. */
export function engineerRange(laps: { setup: CarSetup; hints: LapReading['hints'] }[]) {
  const withHints = laps.filter((l) => l.hints);
  if (!withHints.length) return null;
  const out = {} as Record<keyof CarSetup, { lo: number; hi: number }>;
  for (const p of SETUP_PARAMETERS) {
    let lo = 0;
    let hi = 100;
    for (const lap of withHints) {
      const h = lap.hints[p] ?? 0;
      const center = lap.setup[p] + h;
      const spread = FEEDBACK_DEADZONE + 1 + Math.abs(h) * 0.2;
      const nlo = Math.max(lo, center - spread);
      const nhi = Math.min(hi, center + spread);
      if (nlo <= nhi) {
        lo = nlo;
        hi = nhi;
      } else {
        lo = Math.max(0, center - spread);
        hi = Math.min(100, center + spread);
      }
    }
    out[p] = { lo: Math.round(lo), hi: Math.round(hi) };
  }
  return out;
}

/** Quantos pilotos seguem vivos ao começar a sessão (22 → 16 → 10). */
export function aliveCount(total: number, session: 1 | 2 | 3) {
  const cut = total >= 22 ? 6 : clamp(Math.min(5, Math.floor(total / 4)), 0, total);
  return total - cut * (session - 1);
}

export interface QualiLapRecord {
  driverId: string;
  session: number;
  time: number;
  deleted: boolean;
}

/**
 * Monta classificação a partir das voltas: quem está fora em cada sessão e o grid final
 * (Q3 pelo tempo do Q3, depois eliminados do Q2 e do Q1 pelo tempo da sessão em que caíram).
 */
export function qualiStandings(driverIds: string[], laps: QualiLapRecord[], closedSessions: number) {
  const best = (id: string, s: number) => {
    const t = laps.filter((l) => l.driverId === id && l.session === s && !l.deleted).map((l) => l.time);
    return t.length ? Math.min(...t) : Infinity;
  };
  const out: Record<string, number> = {};
  let alive = [...driverIds];
  for (const s of [1, 2] as const) {
    if (closedSessions < s) break;
    const sorted = [...alive].sort((a, b) => best(a, s) - best(b, s));
    const keep = aliveCount(driverIds.length, (s + 1) as 2 | 3);
    sorted.slice(keep).forEach((id) => (out[id] = s));
    alive = sorted.slice(0, keep);
  }
  let grid: string[] | null = null;
  if (closedSessions >= 3) {
    const q3 = [...alive].sort((a, b) => best(a, 3) - best(b, 3));
    const fell = (s: number) => driverIds.filter((id) => out[id] === s).sort((a, b) => best(a, s) - best(b, s));
    grid = [...q3, ...fell(2), ...fell(1)];
  }
  return { out, alive, grid, best };
}

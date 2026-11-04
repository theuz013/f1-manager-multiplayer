import { calculateGER, calculateSalary } from './ratings.js';
import { createPRNG, hashString } from './physics.js';
import { SOLO_DRIVERS } from '../constants/soloDrivers.js';

export const POT_1_FEE = 5.0; // R$ 5.0 mi valor fixo de contratação Pote 1
export const POT_2_FEE = 2.0; // R$ 2.0 mi valor fixo de contratação Pote 2

export type Personality = 'ambicioso' | 'perfeccionista' | 'calmo' | 'explosivo' | 'leal';
export const PERSONALITIES: Personality[] = ['ambicioso', 'perfeccionista', 'calmo', 'explosivo', 'leal'];

export interface DraftDriver {
  id: string;
  name: string;
  age: number;
  pot: 1 | 2;
  ger: number;
  talento: number;
  classificacao: number;
  gestaoPneus: number;
  concentracao: number;
  experiencia: number;
  condicionamento: number;
  agressividade: number;
  potencial: number;
  personalidade: Personality;
  signingFee: number;
  salario: number; // Por GP
}

/**
 * Gera um piloto balanceado para os potes do Snake Draft
 */
function createDraftDriver(
  id: string,
  name: string,
  pot: 1 | 2,
  seed: number,
  targetGER: number,
  ageRange: [number, number],
  personalidade: Personality
): DraftDriver {
  const rng = createPRNG(seed);
  const age = rng.int(ageRange[0], ageRange[1]);

  // Atributos variam mantendo o GER alvo muito próximo (±1 ponto)
  const delta = rng.int(-1, 1);
  const talento = targetGER + delta;
  const classificacao = Math.max(50, Math.min(99, talento + rng.int(-4, 4)));
  const gestaoPneus = Math.max(50, Math.min(99, talento + rng.int(-4, 4)));
  const concentracao = Math.max(50, Math.min(99, talento + rng.int(-4, 4)));
  const experiencia = Math.max(40, Math.min(99, Math.round(age * 2.8 + rng.int(-3, 3))));
  const condicionamento = Math.max(50, Math.min(99, 95 - Math.max(0, age - 26) * 2 + rng.int(-3, 3)));
  const agressividade = rng.int(45, 88);

  const raw = {
    talento,
    classificacao,
    gestaoPneus,
    concentracao,
    experiencia,
    condicionamento,
    agressividade
  };
  const ger = calculateGER(raw);
  const salario = calculateSalary(talento);
  const potencial = pot === 1 ? Math.min(95, ger + rng.int(1, 4)) : Math.min(96, ger + rng.int(8, 16));

  return {
    id,
    name,
    age,
    pot,
    ger,
    talento,
    classificacao,
    gestaoPneus,
    concentracao,
    experiencia,
    condicionamento,
    agressividade,
    potencial,
    personalidade,
    signingFee: pot === 1 ? POT_1_FEE : POT_2_FEE,
    salario
  };
}

export interface DraftPools {
  pot1: DraftDriver[]; // 11 pilotos de Elite
  pot2: DraftDriver[]; // 14 pilotos de Desenvolvimento
}

/**
 * Gera os Potes 1 e 2 para a liga multiplayer de acordo com a Especificação Oficial
 */
export function generateDraftPools(leagueSeed: number): DraftPools {
  const rng = createPRNG(leagueSeed);
  // Nomes e personalidades do modo solo: elite vem do grid inicial, desenvolvimento dos reservas e promessas
  const shuffle = <T,>(items: T[]) => {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const elite = shuffle(SOLO_DRIVERS.filter((d) => d.talento !== null)).slice(0, 11);
  const prospects = shuffle(SOLO_DRIVERS.filter((d) => d.talento === null)).slice(0, 14);

  // Pote 1: 11 pilotos de Elite (GER alvo: 85, diferença máx 1-2 pts)
  const pot1 = elite.map((d, i) =>
    createDraftDriver(`p1-${i + 1}`, d.name, 1, leagueSeed ^ hashString(d.name) ^ (i * 1009), 85, [27, 30], d.personalidade as Personality)
  );

  // Pote 2: 14 pilotos de Desenvolvimento (GER alvo: 74, diferença máx 1-2 pts, jovens)
  const pot2 = prospects.map((d, i) =>
    createDraftDriver(`p2-${i + 1}`, d.name, 2, leagueSeed ^ hashString(d.name) ^ (i * 2011), 74, [20, 22], d.personalidade as Personality)
  );

  return { pot1, pot2 };
}

/**
 * Ordem do Snake Draft para N equipes:
 * Rodada 1: 0, 1, 2, ..., N-1
 * Rodada 2: N-1, N-2, ..., 0
 */
export function getSnakeDraftOrder(teamsCount: number = 11): { round: 1 | 2; teamIndex: number; pot: 1 | 2 }[] {
  const order: { round: 1 | 2; teamIndex: number; pot: 1 | 2 }[] = [];

  // Round 1 - Pote 1 (1 ao 11)
  for (let i = 0; i < teamsCount; i++) {
    order.push({ round: 1, teamIndex: i, pot: 1 });
  }

  // Round 2 - Pote 2 (Invertido: 11 ao 1)
  for (let i = teamsCount - 1; i >= 0; i--) {
    order.push({ round: 2, teamIndex: i, pot: 2 });
  }

  return order;
}

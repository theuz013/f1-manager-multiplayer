export const DRIVER_ATTRIBUTE_WEIGHTS = [
  ['talento', 0.34],
  ['classificacao', 0.14],
  ['gestaoPneus', 0.12],
  ['concentracao', 0.12],
  ['experiencia', 0.10],
  ['condicionamento', 0.10],
  ['agressividade', 0.08]
] as const;

export type DriverTier = 'bronze' | 'prata' | 'ouro' | 'elite' | 'craque' | 'lenda';

export interface DriverAttributes {
  talento: number;
  classificacao?: number;
  gestaoPneus?: number;
  concentracao?: number;
  experiencia?: number;
  condicionamento?: number;
  agressividade?: number;
  lenda?: boolean;
  hof?: string | null;
  idade?: number;
  potencial?: number;
  pot0?: number;
}

/**
 * Fórmula oficial do F1 Manager para o GER (Overall) do piloto
 * fo(e): talento tem peso 70% direto + 30% da média ponderada dos atributos secundários.
 */
export function calculateGER(driver: DriverAttributes): number {
  const secondary = DRIVER_ATTRIBUTE_WEIGHTS.filter(([attr]) => attr !== 'talento');
  const totalWeight = secondary.reduce((acc, [, w]) => acc + w, 0);
  
  const weightedSum = secondary.reduce((acc, [attr, w]) => {
    const val = (driver as any)[attr] ?? driver.talento;
    return acc + val * w;
  }, 0);
  
  const secondaryAvg = weightedSum / totalWeight;
  return Math.round(driver.talento * 0.7 + secondaryAvg * 0.3);
}

/**
 * Classificação visual do piloto em Tiers (s3):
 * Bronze (<65), Prata (65-74), Ouro (75-84), Elite (85-91), Craque (92+), Lenda (96+ ou Hall of Fame)
 */
export function getDriverTier(ger: number, driver?: DriverAttributes): DriverTier {
  if (driver && (driver.hof === 'lenda' || (driver.talento >= 96 && driver.lenda))) {
    return 'lenda';
  }
  if (driver && (driver.hof === 'craque' || driver.talento >= 92)) {
    return 'craque';
  }
  if (ger >= 85) return 'elite';
  if (ger >= 75) return 'ouro';
  if (ger >= 65) return 'prata';
  return 'bronze';
}

/**
 * Fórmula oficial de salário por GP do F1 Manager (Es):
 * Ke(0.1 + (talento / 100)**3 * 1.8) R$ milhões por GP.
 */
export function calculateSalary(talento: number): number {
  const sal = 0.1 + Math.pow(talento / 100, 3) * 1.8;
  return Math.round(sal * 100) / 100;
}

/**
 * Declínio de atributos por idade (__ageDec):
 * Até 30 anos: estável (0)
 * De 31 a 33: -1 por ano
 * 34 em diante: 3 + (idade - 33) * 2
 */
export function calculateAgeDecay(age: number): number {
  if (age <= 30) return 0;
  if (age <= 33) return age - 30;
  return 3 + (age - 33) * 2;
}

/**
 * Teto de potencial ajustado pela idade (__capD)
 */
export function calculatePotentialCap(driver: DriverAttributes): number {
  const maxCap = driver.lenda ? 98 : 95;
  const initialPot = Math.min(maxCap, driver.pot0 ?? driver.potencial ?? 80);
  const decay = driver.idade ? calculateAgeDecay(driver.idade) : 0;
  return Math.max(50, initialPot - decay);
}


export type TireCompound = 'macio' | 'medio' | 'duro' | 'intermediario' | 'chuva';

export interface TireSpec {
  label: string;
  offset: number;     // Delta de tempo em segundos por volta
  deg: number;        // Desgaste por volta
  life: number;       // Vida útil ideal em voltas
  color: string;      // Cor oficial da Pirelli / UI
}

export const TIRE_SPECS: Record<TireCompound, TireSpec> = {
  macio: {
    label: 'Macio',
    offset: -0.7,
    deg: 0.08,
    life: 18,
    color: '#e8443a'
  },
  medio: {
    label: 'Médio',
    offset: 0,
    deg: 0.038,
    life: 33,
    color: '#f2c94c'
  },
  duro: {
    label: 'Duro',
    offset: 0.42,
    deg: 0.022,
    life: 48,
    color: '#e6e6e6'
  },
  intermediario: {
    label: 'Intermediário',
    offset: 0,
    deg: 0.06,
    life: 30,
    color: '#3ecf5a'
  },
  chuva: {
    label: 'Chuva',
    offset: 0,
    deg: 0.05,
    life: 35,
    color: '#3b8bff'
  }
};

export const RAIN_THRESHOLD = 0.12;
export const HEAVY_RAIN_THRESHOLD = 0.55;

/**
 * Determina a condição de pista pelo índice de chuva (Hc)
 */
export function getTrackCondition(rainIndex: number): 'seco' | 'intermediario' | 'chuva' {
  if (rainIndex < RAIN_THRESHOLD) return 'seco';
  if (rainIndex < HEAVY_RAIN_THRESHOLD) return 'intermediario';
  return 'chuva';
}

/**
 * Penalidade por usar composto inadequado para o clima (zp)
 */
export function calculateWeatherTirePenalty(compound: TireCompound, rainIndex: number): number {
  let penalty = rainIndex * 7;
  if (compound === 'intermediario') {
    if (rainIndex < 0.2) penalty += 2.5 + (0.2 - rainIndex) * 10;
    else if (rainIndex > 0.6) penalty += (rainIndex - 0.6) * 15;
  } else if (compound === 'chuva') {
    if (rainIndex < 0.5) penalty += 1 + (0.5 - rainIndex) * 12;
  } else {
    // Pneu slick no molhado
    penalty += rainIndex * 28;
  }
  return penalty;
}

/**
 * Degradação de pneu por volta (qp)
 */
export function calculateTirePaceLoss(
  compound: TireCompound,
  ageInLaps: number,
  tireManagementFactor: number,
  circuitTireWear: number
): number {
  const spec = TIRE_SPECS[compound];
  const effectiveLaps = ageInLaps * tireManagementFactor;
  const maxLife = spec.life / circuitTireWear;
  
  let loss = spec.offset + spec.deg * effectiveLaps * circuitTireWear;
  if (effectiveLaps > maxLife) {
    loss += (effectiveLaps - maxLife) * 0.45; // Cliff de desgaste
  }
  return loss;
}


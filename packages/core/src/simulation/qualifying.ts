import { CarSetup } from '../constants/carParts.js';
import { CarPartsMap } from '../types/index.js';
import { CircuitDefinition } from '../constants/circuits.js';
import { calculateLapTime, calculateQualiPaceBonus, createPRNG } from './physics.js';
import { TIRE_SPECS } from './tires.js';

export interface SimQualifyingEntry {
  driver: {
    id: string;
    name: string;
    talento: number;
    classificacao: number;
    experiencia: number;
    concentracao: number;
    moral?: number;
    personalidade?: string;
    sec?: string;
  };
  car: CarPartsMap;
  setup: CarSetup;
  teamId: string;
}

export interface QualifyingResult {
  grid: string[];                     // IDs dos pilotos ordenados por posição (P1 a P22)
  times: Record<string, number>;      // Melhores tempos em segundos
  details: {
    position: number;
    driverId: string;
    teamId: string;
    time: number;
    gap: number;                      // Distância para a pole em segundos
  }[];
}

/**
 * Simula a sessão de Classificação (Hv):
 * Utiliza o pneu Macio, bônus de volta rápida do piloto e variância gaussiana.
 */
export function simulateQualifying(
  entries: SimQualifyingEntry[],
  circuit: CircuitDefinition,
  seed: number
): QualifyingResult {
  const rng = createPRNG(seed ^ 20903);
  const times: Record<string, number> = {};

  for (const entry of entries) {
    const d = entry.driver;
    
    // Foco e personalidade sob pressão na qualificação (Ps)
    let bonusPersonalidade = 0;
    if (d.personalidade === 'perfeccionista') bonusPersonalidade = 5;
    else if (d.personalidade === 'calmo') bonusPersonalidade = 4;
    else if (d.personalidade === 'leal') bonusPersonalidade = -2;
    else if (d.personalidade === 'explosivo') {
      const m = d.moral ?? 60;
      bonusPersonalidade = m > 70 ? 6 : m < 45 ? -6 : 0;
    }
    const foco = Math.max(5, Math.min(100, d.concentracao + ((d.moral ?? 60) - 50) * 0.2 + bonusPersonalidade));

    const baseTime = calculateLapTime(entry.car, entry.setup, d, circuit);
    const qualiBonus = calculateQualiPaceBonus(d.classificacao);
    const tireOffset = TIRE_SPECS.macio.offset;

    // Dispersão estocástica (gaussiana) ponderada pelo foco
    const variance = rng.gauss() * 0.18 * (1.3 - foco / 100);
    const lapTime = baseTime + qualiBonus + tireOffset - 1.6 + variance;

    times[d.id] = Math.round(lapTime * 1000) / 1000;
  }

  const sortedGrid = [...entries].sort((a, b) => times[a.driver.id] - times[b.driver.id]);
  const poleTime = times[sortedGrid[0].driver.id];

  const details = sortedGrid.map((entry, idx) => ({
    position: idx + 1,
    driverId: entry.driver.id,
    teamId: entry.teamId,
    time: times[entry.driver.id],
    gap: Math.round((times[entry.driver.id] - poleTime) * 1000) / 1000
  }));

  return {
    grid: sortedGrid.map(e => e.driver.id),
    times,
    details
  };
}

import { CarPart } from '../constants/carParts.js';

// Fórmulas do modo solo (v1.4.4), sem o desconto de recuperação por distância ao líder
export const MAX_PART_LEVEL = 10;

const PART_WEIGHT: Record<CarPart, number> = {
  motor: 1.2,
  chassi: 1.15,
  asaDianteira: 0.9,
  asaTraseira: 0.9,
  suspensao: 0.75,
  freios: 0.6,
  cambio: 0.6
};

const round1 = (v: number) => Math.round(v * 10) / 10;
const factoryFactor = (fabrica: number) => 1 - (fabrica - 1) * 0.07;

/** Troca a peça gasta por uma nova do mesmo nível (zera o desgaste). */
export function partReplaceCost(part: CarPart, level: number, fabrica: number) {
  return round1((0.5 + level * 0.18) * factoryFactor(fabrica) * PART_WEIGHT[part]);
}

/** Fabrica e instala a peça no nível indicado (desgaste zerado). */
export function partFabricationCost(part: CarPart, targetLevel: number, fabrica: number) {
  return round1((0.6 + targetLevel * 0.4) * factoryFactor(fabrica) * PART_WEIGHT[part]);
}

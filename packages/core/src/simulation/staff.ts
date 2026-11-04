import { FIRST_NAMES, LAST_NAMES } from '../constants/names.js';
import { createPRNG, hashString } from './physics.js';

// Funcionários e instalações do modo solo (v1.4.4)
export const STAFF_ROLES = ['diretorTecnico', 'chefeAero', 'engenheiroCorrida', 'chefeBox'] as const;
export type StaffRoleId = (typeof STAFF_ROLES)[number];

export const STAFF_INFO: Record<StaffRoleId, { name: string; effect: string }> = {
  diretorTecnico: { name: 'Diretor técnico', effect: 'Acelera o P&D. Quanto melhor, mais rápido os projetos terminam.' },
  chefeAero: { name: 'Chefe de aerodinâmica', effect: 'Acelera chassi e asas e estreita a faixa ideal de asas e suspensão no treino.' },
  engenheiroCorrida: { name: 'Engenheiro de corrida', effect: 'Leitura mais precisa dos pilotos no treino (acima de 70, mais 2 voltas).' },
  chefeBox: { name: 'Chefe de box', effect: 'Paradas mais rápidas e regulares.' }
};

export const STAFF_PERSONALITIES = ['inovador', 'metodico', 'motivador', 'exigente'] as const;
export const STAFF_START_SKILL = 60;
export const STAFF_SIGNING_FACTOR = 2; // luvas = 2× o salário por GP

export const FACILITIES = ['pesquisa', 'tunel', 'fabrica', 'simulador', 'confiabilidade'] as const;
export type FacilityId = (typeof FACILITIES)[number];
export const MAX_FACILITY = 5;
export const FACILITY_INFO: Record<FacilityId, { name: string; effect: (level: number) => string }> = {
  pesquisa: { name: 'Centro de pesquisa', effect: (l) => `${3 + l * 2} engenheiros para os projetos de P&D.` },
  tunel: { name: 'Túnel de vento', effect: (l) => (l === 1 ? 'Básico: sem bônus em chassi e asas.' : `Projetos de chassi e asas ${Math.round((l - 1) * 8)}% mais rápidos.`) },
  fabrica: { name: 'Fábrica', effect: (l) => (l === 1 ? 'Básica: preço cheio para fabricar e trocar peças.' : `Fabricar e trocar peças custa ${Math.round((l - 1) * 7)}% menos.`) },
  simulador: { name: 'Simulador', effect: (l) => `${10 + (l - 1) * 2} voltas de treino por GP.` },
  confiabilidade: { name: 'Dep. de confiabilidade', effect: (l) => l === 1 ? 'Básico: sem redução de desgaste.' : `Peças desgastam ${(l - 1) * 1.5}% menos por GP.` }
};

// shortcut: teto calibrado para a economia atual do multiplayer (verba + prêmios + patrocínios); revisar quando a economia for fechada (§23)
export const SPENDING_CAP = 75;
export const CAP_KINDS = ['pesquisa', 'fabricacao', 'instalacao'];

const r2 = (v: number) => Math.round(v * 100) / 100;

export function staffSalary(skill: number) {
  return r2(Math.min(0.8, 0.04 + (skill / 100) ** 3 * 0.7));
}

export function facilityUpgradeCost(level: number) {
  return 4 + level * 3;
}

export function facilityMaintenance(f: Record<FacilityId, number>) {
  return r2(FACILITIES.reduce((s, k) => s + (f[k] ?? (k === 'confiabilidade' ? 1 : 2)), 0) * 0.12);
}

/** Fator de redução de desgaste por GP pela instalação de confiabilidade (0 = sem redução). */
export function facilityWearReduction(confiabilidadeLevel: number) {
  return confiabilidadeLevel <= 1 ? 0 : (confiabilidadeLevel - 1) * 1.5;
}

/** Multiplicador de pontos de P&D pelo diretor técnico e, nas peças aerodinâmicas, pelo chefe de aerodinâmica. */
export function staffRndFactor(director: { skill: number; personality: string } | null, aero: { skill: number } | null, aeroPart: boolean) {
  const dt = director ? (0.75 + director.skill / 200) * (director.personality === 'exigente' ? 1.1 : 1) : 1;
  const ae = aeroPart && aero ? 0.85 + aero.skill / 330 : 1;
  return dt * ae;
}

/** Fator da faixa ideal de asas e suspensão no treino: abaixo de 1 estreita a faixa. */
export function aeroBandFactor(aeroSkill: number) {
  return 1.3 - aeroSkill / 200;
}

/** Bônus de leitura do engenheiro de corrida no treino (reduz o ruído do feedback). */
export function engineerReadBonus(skill: number) {
  return (skill - 50) * 0.05;
}

export interface StaffCandidate {
  role: StaffRoleId;
  name: string;
  skill: number;
  personality: string;
  salary: number;
}

/** Profissionais disponíveis no mercado da liga para a temporada. */
export function generateStaffPool(seed: string, perRole = 3): StaffCandidate[] {
  const rng = createPRNG(hashString(seed));
  const used = new Set<string>();
  const out: StaffCandidate[] = [];
  for (const role of STAFF_ROLES) {
    for (let i = 0; i < perRole; i++) {
      let name = '';
      for (let k = 0; k < 30 && (!name || used.has(name)); k++) name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
      used.add(name);
      const skill = Math.round(48 + rng.next() * 44);
      out.push({ role, name, skill, personality: STAFF_PERSONALITIES[Math.floor(rng.next() * 4)], salary: staffSalary(skill) });
    }
  }
  return out;
}

/** Equipe técnica inicial igual para todos (mesma habilidade, nomes diferentes). */
export function startingStaff(seed: string): StaffCandidate[] {
  const rng = createPRNG(hashString(`inicial-${seed}`));
  return STAFF_ROLES.map((role) => ({
    role,
    name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
    skill: STAFF_START_SKILL,
    personality: STAFF_PERSONALITIES[Math.floor(rng.next() * 4)],
    salary: staffSalary(STAFF_START_SKILL)
  }));
}

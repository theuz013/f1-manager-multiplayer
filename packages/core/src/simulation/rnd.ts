import { CAR_PARTS, CarPart } from '../constants/carParts.js';
import { MAX_PART_LEVEL } from './carCosts.js';

// P&D do multiplayer, adaptado do solo (v1.4.4) para níveis inteiros
export const ENGINEER_POINTS_PER_GP = 7;
export const ENGINEER_SALARY = 0.1; // R$ mi por engenheiro alocado, por GP
const AERO_PARTS: CarPart[] = ['chassi', 'asaDianteira', 'asaTraseira'];
const PART_WEIGHT: Record<CarPart, number> = {
  motor: 1.2,
  chassi: 1.15,
  asaDianteira: 0.9,
  asaTraseira: 0.9,
  suspensao: 0.75,
  freios: 0.6,
  cambio: 0.6
};

export interface RndProject {
  part: CarPart;
  engineers: number;
  progress: number;
  required: number;
}

export interface RndState {
  designs: Record<CarPart, number>; // maior nível já projetado de cada peça (liberado para fabricar)
  projects: RndProject[];
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function engineersAvailable(pesquisa: number) {
  return 3 + pesquisa * 2;
}

export function projectCost(part: CarPart, design: number) {
  return round1((1.2 + 0.55 * (design + 1)) * PART_WEIGHT[part]);
}

export function projectRequired(design: number) {
  return 60 + design * 15;
}

export const isAeroPart = (part: CarPart) => AERO_PARTS.includes(part);

/** `staff` multiplica o ganho (diretor técnico e chefe de aerodinâmica; ver staffRndFactor). */
export function projectGain(project: Pick<RndProject, 'part' | 'engineers'>, tunel: number, staff = 1) {
  const aero = AERO_PARTS.includes(project.part) ? 1 + (tunel - 1) * 0.08 : 1;
  return Math.round(project.engineers * ENGINEER_POINTS_PER_GP * aero * staff);
}

export function emptyRnd(levels: Record<CarPart, number>): RndState {
  return { designs: { ...levels }, projects: [] };
}

/** Avança os projetos em um GP. Devolve o novo estado e as peças que ficaram prontas para fabricar. */
export function advanceRnd(rnd: RndState, tunel: number, staffFor: (part: CarPart) => number = () => 1) {
  const designs = { ...rnd.designs };
  const done: { part: CarPart; level: number }[] = [];
  const projects = rnd.projects
    .map((p) => ({ ...p, progress: p.progress + projectGain(p, tunel, staffFor(p.part)) }))
    .filter((p) => {
      if (p.progress < p.required) return true;
      designs[p.part] = Math.min(MAX_PART_LEVEL, designs[p.part] + 1);
      done.push({ part: p.part, level: designs[p.part] });
      return false;
    });
  return { rnd: { designs, projects }, done };
}

export function engineersInUse(rnd: RndState) {
  return rnd.projects.reduce((s, p) => s + p.engineers, 0);
}

export function gpsToFinish(p: RndProject, tunel: number, staff = 1) {
  const gain = projectGain(p, tunel, staff);
  return gain > 0 ? Math.ceil(Math.max(0, p.required - p.progress) / gain) : Infinity;
}

export const RND_PARTS = CAR_PARTS;

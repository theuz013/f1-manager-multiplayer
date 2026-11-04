import {
  CAR_PARTS,
  CAR_PART_LABELS,
  CarPart,
  ENGINEER_SALARY,
  MAX_PART_LEVEL,
  advanceRnd,
  emptyRnd,
  engineersAvailable,
  engineersInUse,
  gpsToFinish,
  partFabricationCost,
  partReplaceCost,
  projectCost,
  projectRequired,
  TEAMS,
  CIRCUITS,
  hashString,
  type RndState
} from '@f1m/core';
import { prisma } from './db.js';
import { readCar } from './carService.js';
import { postPaddock } from './paddockService.js';
import { ensureStaff, getTeamFactors } from './staffService.js';

type TeamRow = { id: string; rndJson: string | null; carLevels: string | null; carWear: string | null; facilities: string | null };

export function readRnd(team: TeamRow): RndState {
  const { levels } = readCar(team);
  if (!team.rndJson) return emptyRnd(levels);
  const r = JSON.parse(team.rndJson) as RndState;
  // Peça fabricada acima do projetado (dados antigos) conta como projetada
  for (const p of CAR_PARTS) r.designs[p] = Math.max(r.designs[p] ?? levels[p], levels[p]);
  return r;
}

function facilitiesOf(team: TeamRow) {
  const f = team.facilities ? JSON.parse(team.facilities) : {};
  return { pesquisa: f.pesquisa ?? 2, tunel: f.tunel ?? 2, fabrica: f.fabrica ?? 2 };
}

async function myTeam(code: string, userId: string) {
  const league = await prisma.league.findUnique({ where: { code: code.toUpperCase() } });
  if (!league) throw new Error('Liga não encontrada.');
  const team = await prisma.leagueTeam.findFirst({ where: { leagueId: league.id, userId } });
  if (!team) throw new Error('Você não gerencia nenhuma equipe nesta liga.');
  return { league, team };
}

export async function getRnd(code: string, userId: string) {
  const { team } = await myTeam(code, userId);
  const rnd = readRnd(team);
  const fac = facilitiesOf(team);
  const { levels } = readCar(team);
  return {
    engineers: engineersAvailable(fac.pesquisa),
    inUse: engineersInUse(rnd),
    salaryPerEngineer: ENGINEER_SALARY,
    budget: team.budget,
    parts: CAR_PARTS.map((p) => {
      const project = rnd.projects.find((x) => x.part === p) ?? null;
      return {
        part: p,
        level: levels[p],
        design: rnd.designs[p],
        startCost: projectCost(p, rnd.designs[p]),
        required: projectRequired(rnd.designs[p]),
        maxed: rnd.designs[p] >= MAX_PART_LEVEL,
        project: project && { ...project, gpsLeft: gpsToFinish(project, fac.tunel) }
      };
    })
  };
}

async function save(teamId: string, rnd: RndState) {
  await prisma.leagueTeam.update({ where: { id: teamId }, data: { rndJson: JSON.stringify(rnd) } });
}

export async function startProject(code: string, userId: string, part: string, engineers: number) {
  if (!(CAR_PARTS as readonly string[]).includes(part)) throw new Error('Peça inválida.');
  const { league, team } = await myTeam(code, userId);
  if (league.status !== 'SEASON') throw new Error('O P&D funciona durante a temporada.');
  const p = part as CarPart;
  const rnd = readRnd(team);
  const total = engineersAvailable(facilitiesOf(team).pesquisa);
  if (!(engineers >= 1)) throw new Error('Coloque pelo menos um engenheiro no projeto.');
  if (engineersInUse(rnd) + engineers > total) throw new Error('Não há engenheiros livres suficientes. Tire engenheiros de outro projeto.');
  if (rnd.projects.some((x) => x.part === p)) throw new Error('Já existe um projeto para essa peça.');
  if (rnd.designs[p] >= MAX_PART_LEVEL) throw new Error('Essa peça já está no nível máximo.');

  const cost = projectCost(p, rnd.designs[p]);
  const debited = await prisma.leagueTeam.updateMany({
    where: { id: team.id, budget: { gte: cost }, rndJson: team.rndJson },
    data: {
      budget: { decrement: cost },
      rndJson: JSON.stringify({ ...rnd, projects: [...rnd.projects, { part: p, engineers, progress: 0, required: projectRequired(rnd.designs[p]) }] })
    }
  });
  if (debited.count === 0) throw new Error(`Orçamento insuficiente (R$ ${cost.toFixed(1)} mi) ou o P&D mudou. Tente de novo.`);
  await prisma.ledgerEntry.create({
    data: { leagueTeamId: team.id, season: league.season, gpIndex: league.gpIndex, kind: 'pesquisa', amount: -cost, label: `P&D: início do projeto ${CAR_PART_LABELS[p]} nível ${rnd.designs[p] + 1}` }
  });
  await maybeRumor(league.id, league.season, league.gpIndex, team.id, team.teamId, p);
  return { ok: true, message: `Projeto iniciado: ${CAR_PART_LABELS[p]} nível ${rnd.designs[p] + 1}.` };
}

// Metade dos projetos vaza para o paddock como rumor, sem revelar números
async function maybeRumor(leagueId: string, season: number, gpIndex: number, leagueTeamId: string, teamId: string, part: CarPart) {
  if (hashString(`rumor-${leagueTeamId}-${season}-${gpIndex}-${part}`) % 2) return;
  const name = TEAMS.find((t) => t.id === teamId)?.name;
  const lines = [
    `🗣️ Rumor no paddock: a ${name} estaria trabalhando em ${CAR_PART_LABELS[part].toLowerCase()} nova.`,
    `🗣️ Dizem que a fábrica da ${name} está focada em ${CAR_PART_LABELS[part].toLowerCase()}.`
  ];
  await postPaddock(leagueId, season, gpIndex, 'rumor', lines[hashString(leagueTeamId + part) % lines.length], { leagueTeamId });
}

export async function setProjectEngineers(code: string, userId: string, part: string, engineers: number) {
  const { team } = await myTeam(code, userId);
  const rnd = readRnd(team);
  const project = rnd.projects.find((x) => x.part === part);
  if (!project) throw new Error('Esse projeto não existe mais.');
  if (!(engineers >= 1)) throw new Error('Um projeto precisa de pelo menos um engenheiro. Para parar, cancele o projeto.');
  if (engineersInUse(rnd) - project.engineers + engineers > engineersAvailable(facilitiesOf(team).pesquisa)) {
    throw new Error('Não há engenheiros livres suficientes.');
  }
  project.engineers = engineers;
  await save(team.id, rnd);
  return { ok: true };
}

/** Turno extra de P&D: paga R$ 2 mi e aplica 1 GP extra de progresso em todos os projetos ativos. */
export async function extraShift(code: string, userId: string) {
  const COST = 2;
  const { league, team } = await myTeam(code, userId);
  if (league.status !== 'SEASON') throw new Error('Turno extra só pode ser usado durante a temporada.');
  const rnd = readRnd(team);
  if (!rnd.projects.length) throw new Error('Não há projetos em andamento para acelerar.');
  if (team.budget < COST) throw new Error(`Orçamento insuficiente (R$ ${COST} mi necessário).`);

  const fac = facilitiesOf(team);
  await ensureStaff(league.id, team.id, team.teamId, league.season);
  const { staffFor } = await getTeamFactors(league.id, team.id, league.season);
  const { rnd: next, done } = advanceRnd(rnd, fac.tunel, staffFor);

  await prisma.leagueTeam.update({ where: { id: team.id }, data: { budget: { decrement: COST }, rndJson: JSON.stringify(next) } });
  await prisma.ledgerEntry.create({ data: { leagueTeamId: team.id, season: league.season, gpIndex: league.gpIndex, kind: 'pesquisa', amount: -COST, label: 'Turno extra de P&D' } });

  const doneMsg = done.length ? ` Projetos concluídos: ${done.map(d => d.part).join(', ')}.` : '';
  return { ok: true, message: `Turno extra aplicado.${doneMsg}`, done };
}

export async function cancelProject(code: string, userId: string, part: string) {
  const { team } = await myTeam(code, userId);
  const rnd = readRnd(team);
  if (!rnd.projects.some((x) => x.part === part)) throw new Error('Esse projeto não existe mais.');
  rnd.projects = rnd.projects.filter((x) => x.part !== part);
  await save(team.id, rnd);
  return { ok: true, message: 'Projeto cancelado. O valor investido não volta.' };
}

/**
 * Depois de cada GP: avança os projetos de todas as equipes e cobra o salário dos engenheiros alocados.
 * Devolve o nível médio do carro de cada equipe (gráfico de evolução em Rivais).
 */
export async function rndAfterRace(leagueId: string, season: number, gpIndex: number) {
  const teams = await prisma.leagueTeam.findMany({ where: { leagueId } });
  for (const team of teams) {
    await ensureStaff(leagueId, team.id, team.teamId, season);
    const factors = await getTeamFactors(leagueId, team.id, season);
    const rnd = readRnd(team);
    const { rnd: next, done } = advanceRnd(rnd, facilitiesOf(team).tunel, factors.staffFor);
    const wages = Math.round(engineersInUse(rnd) * ENGINEER_SALARY * 100) / 100;
    await prisma.leagueTeam.update({ where: { id: team.id }, data: { rndJson: JSON.stringify(next), budget: { decrement: wages } } });
    const entries = [
      ...(wages > 0 ? [{ kind: 'engenheiros', amount: -wages, label: `P&D: salário de ${engineersInUse(rnd)} engenheiros` }] : []),
      ...done.map((d) => ({ kind: 'pesquisa', amount: 0, label: `P&D concluído: ${CAR_PART_LABELS[d.part]} nível ${d.level} pronta para fabricar` }))
    ];
    if (entries.length) await prisma.ledgerEntry.createMany({ data: entries.map((e) => ({ ...e, leagueTeamId: team.id, season, gpIndex })) });
  }
}

export function carAverages(teams: TeamRow[]) {
  return Object.fromEntries(
    teams.map((t) => {
      const { levels } = readCar(t);
      return [t.id, Math.round((CAR_PARTS.reduce((s, p) => s + levels[p], 0) / CAR_PARTS.length) * 100) / 100];
    })
  );
}

/** IA desenvolve como os humanos: troca peças muito gastas, fabrica o que o P&D liberou e abre projetos. */
export async function aiDevelopTurn(leagueId: string, season: number, gpIndex: number) {
  const teams = await prisma.leagueTeam.findMany({ where: { leagueId, isAI: true } });
  for (const team of teams) {
    const fac = facilitiesOf(team);
    const { levels, wear } = readCar(team);
    const rnd = readRnd(team);
    let budget = team.budget;
    const spend: { kind: string; amount: number; label: string }[] = [];
    const reserve = 8;
    const upgrades: string[] = [];

    for (const p of CAR_PARTS) {
      if (wear[p] >= 80 && budget - partReplaceCost(p, levels[p], fac.fabrica) >= reserve / 2) {
        const c = partReplaceCost(p, levels[p], fac.fabrica);
        budget -= c;
        wear[p] = 0;
        spend.push({ kind: 'troca', amount: -c, label: `Troca de peça gasta: ${CAR_PART_LABELS[p]}` });
      }
    }
    for (const p of [...CAR_PARTS].sort((a, b) => rnd.designs[b] - levels[b] - (rnd.designs[a] - levels[a]))) {
      if (rnd.designs[p] <= levels[p]) continue;
      const c = partFabricationCost(p, levels[p] + 1, fac.fabrica);
      if (budget - c < reserve) break;
      budget -= c;
      levels[p] += 1;
      wear[p] = 0;
      spend.push({ kind: 'fabricacao', amount: -c, label: `Fabricação: ${CAR_PART_LABELS[p]} nível ${levels[p]}` });
      upgrades.push(`${CAR_PART_LABELS[p].toLowerCase()} nível ${levels[p]}`);
    }
    const free = engineersAvailable(fac.pesquisa) - engineersInUse(rnd);
    const target = CAR_PARTS.filter((p) => !rnd.projects.some((x) => x.part === p) && rnd.designs[p] < MAX_PART_LEVEL).sort(
      (a, b) => rnd.designs[a] - rnd.designs[b]
    )[0];
    if (free > 0 && target && budget - projectCost(target, rnd.designs[target]) >= reserve) {
      const c = projectCost(target, rnd.designs[target]);
      budget -= c;
      rnd.projects.push({ part: target, engineers: free, progress: 0, required: projectRequired(rnd.designs[target]) });
      spend.push({ kind: 'pesquisa', amount: -c, label: `P&D: início do projeto ${CAR_PART_LABELS[target]} nível ${rnd.designs[target] + 1}` });
      await maybeRumor(leagueId, season, gpIndex, team.id, team.teamId, target);
    }
    if (upgrades.length) {
      const gp = CIRCUITS[gpIndex % CIRCUITS.length].gp;
      await postPaddock(leagueId, season, gpIndex, 'pd', `🔧 A ${TEAMS.find((t) => t.id === team.teamId)?.name} leva ${upgrades.join(' e ')} para o ${gp}.`, { leagueTeamId: team.id });
    }
    if (!spend.length) continue;
    await prisma.leagueTeam.update({
      where: { id: team.id },
      data: { budget, carLevels: JSON.stringify(levels), carWear: JSON.stringify(wear), rndJson: JSON.stringify(rnd) }
    });
    await prisma.ledgerEntry.createMany({ data: spend.map((e) => ({ ...e, leagueTeamId: team.id, season, gpIndex })) });
  }
}

import { CIRCUITS, TEAMS, CAR_PARTS, CAR_PART_LABELS, CarPart, MAX_PART_LEVEL, partFabricationCost, partReplaceCost } from '@f1m/core';
import { prisma } from './db.js';
import { weekendPhase } from './weekendService.js';
import { readRnd } from './rndService.js';
import { postPaddock } from './paddockService.js';

const DEFAULT_LEVELS = Object.fromEntries(CAR_PARTS.map((p) => [p, 5])) as Record<CarPart, number>;
const DEFAULT_WEAR = Object.fromEntries(CAR_PARTS.map((p) => [p, 0])) as Record<CarPart, number>;

export function readCar(team: { carLevels: string | null; carWear: string | null; facilities: string | null }) {
  return {
    levels: { ...DEFAULT_LEVELS, ...(team.carLevels ? JSON.parse(team.carLevels) : {}) } as Record<CarPart, number>,
    wear: { ...DEFAULT_WEAR, ...(team.carWear ? JSON.parse(team.carWear) : {}) } as Record<CarPart, number>,
    fabrica: (team.facilities ? JSON.parse(team.facilities).fabrica : 2) as number
  };
}

/**
 * Troca (zera desgaste) ou fabrica o próximo nível de uma peça, pagando do orçamento da equipe
 */
export async function carAction(leagueCode: string, userId: string, action: 'replace' | 'fabricate', part: string) {
  if (!(CAR_PARTS as readonly string[]).includes(part)) throw new Error('Peça inválida.');
  const p = part as CarPart;

  const league = await prisma.league.findUnique({
    where: { code: leagueCode.toUpperCase() },
    include: { teams: true }
  });
  if (!league) throw new Error('Liga não encontrada.');
  if (league.status !== 'SEASON') throw new Error('O carro só pode ser alterado durante a temporada.');
  if (league.isLocked) throw new Error('🔒 Configurações travadas: falta menos de 1h para a largada.');
  if (league.nextRaceAt && weekendPhase(league.nextRaceAt) !== 'practice') {
    throw new Error('Parque fechado: peças só podem ser trocadas ou fabricadas até o fim do treino livre.');
  }

  const team = league.teams.find((t) => t.userId === userId);
  if (!team) throw new Error('Você não gerencia nenhuma equipe nesta liga.');

  const { levels, wear, fabrica } = readCar(team);
  let cost: number;
  let label: string;

  if (action === 'replace') {
    if (wear[p] === 0) throw new Error('A peça já está nova.');
    cost = partReplaceCost(p, levels[p], fabrica);
    label = `Troca de peça gasta: ${CAR_PART_LABELS[p]}`;
    wear[p] = 0;
  } else {
    if (levels[p] >= MAX_PART_LEVEL) throw new Error('A peça já está no nível máximo.');
    if (readRnd(team).designs[p] < levels[p] + 1) throw new Error('Não há versão nova dessa peça. Desenvolva uma no P&D.');
    const target = levels[p] + 1;
    cost = partFabricationCost(p, target, fabrica);
    label = `Fabricação: ${CAR_PART_LABELS[p]} nível ${target}`;
    levels[p] = target;
    wear[p] = 0;
  }

  if (team.budget < cost) throw new Error(`Orçamento insuficiente (custo R$ ${cost.toFixed(1)} mi).`);

  // Só grava se saldo e carro ainda forem os lidos: evita gasto duplo ou perda de alteração em requisições simultâneas
  const debited = await prisma.leagueTeam.updateMany({
    where: { id: team.id, budget: { gte: cost }, carLevels: team.carLevels, carWear: team.carWear },
    data: {
      budget: { decrement: cost },
      carLevels: JSON.stringify(levels),
      carWear: JSON.stringify(wear)
    }
  });
  if (debited.count === 0) throw new Error('O carro ou o orçamento mudou enquanto você operava. Tente novamente.');

  await prisma.ledgerEntry.create({
    data: {
      leagueTeamId: team.id,
      season: league.season,
      gpIndex: league.gpIndex,
      kind: action === 'replace' ? 'troca' : 'fabricacao',
      amount: -cost,
      label
    }
  });

  if (action === 'fabricate') {
    const gp = CIRCUITS[league.gpIndex % CIRCUITS.length].gp;
    await postPaddock(league.id, league.season, league.gpIndex, 'pd', `🔧 A ${TEAMS.find((t) => t.id === team.teamId)?.name} leva ${CAR_PART_LABELS[p].toLowerCase()} nível ${levels[p]} para o ${gp}.`, { leagueTeamId: team.id });
  }
  return { ok: true, cost, levels, wear };
}

export async function getTeamLedger(leagueCode: string, userId: string) {
  const team = await prisma.leagueTeam.findFirst({
    where: { userId, league: { code: leagueCode.toUpperCase() } }
  });
  if (!team) throw new Error('Você não gerencia nenhuma equipe nesta liga.');
  return prisma.ledgerEntry.findMany({ where: { leagueTeamId: team.id }, orderBy: { createdAt: 'desc' } });
}

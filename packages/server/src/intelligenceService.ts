/**
 * Fase 11 — Espionagem (limitada) e moral dos pilotos.
 *
 * Espionagem:
 *  - Custa R$ 3 mi, sujeito ao teto de gastos.
 *  - Devolve o nível médio do carro alvo + nível de cada instalação (sem detalhe de peça individual).
 *  - A equipe alvo recebe aviso no paddock: "Atividade suspeita detectada".
 *  - 1 espionagem por equipe por GP.
 *
 * Moral:
 *  - Calculado dinamicamente: base 70, +5 por vitória, +3 por pódio, -6 por abandono, limitado a [40, 100].
 *  - Usado em race.ts via driver.moral (já existe no tipo).
 */

import { TEAMS, CAR_PARTS } from '@f1m/core';
import { prisma } from './db.js';
import { readCar } from './carService.js';
import { capUsed } from './staffService.js';
import { postPaddock } from './paddockService.js';

const ESPIONAGE_COST = 3;

export async function espionage(code: string, userId: string, targetLeagueTeamId: string) {
  const league = await prisma.league.findUnique({
    where: { code: code.toUpperCase() },
    include: { teams: true }
  });
  if (!league) throw new Error('Liga não encontrada.');
  if (league.status !== 'SEASON') throw new Error('Espionagem só é possível durante a temporada.');

  const myTeam = league.teams.find((t) => t.userId === userId);
  if (!myTeam) throw new Error('Você não gerencia nenhuma equipe nesta liga.');

  const targetTeam = league.teams.find((t) => t.id === targetLeagueTeamId);
  if (!targetTeam) throw new Error('Equipe alvo não encontrada nesta liga.');
  if (targetTeam.id === myTeam.id) throw new Error('Não é possível espionar a própria equipe.');

  // 1 espionagem por equipe por GP (checa no ledger)
  const alreadySpied = await prisma.ledgerEntry.findFirst({
    where: { leagueTeamId: myTeam.id, season: league.season, gpIndex: league.gpIndex, kind: 'espionagem' }
  });
  if (alreadySpied) throw new Error('Você já usou a espionagem neste GP.');

  const used = await capUsed(myTeam.id, league.season);
  if (used + ESPIONAGE_COST > 75) throw new Error('Teto de gastos insuficiente para a operação.');
  if (myTeam.budget < ESPIONAGE_COST) throw new Error(`Orçamento insuficiente (R$ ${ESPIONAGE_COST} mi necessário).`);

  // Cobra o custo
  await prisma.leagueTeam.update({ where: { id: myTeam.id }, data: { budget: { decrement: ESPIONAGE_COST } } });
  await prisma.ledgerEntry.create({
    data: { leagueTeamId: myTeam.id, season: league.season, gpIndex: league.gpIndex, kind: 'espionagem', amount: -ESPIONAGE_COST, label: `Espionagem: ${TEAMS.find(t => t.id === targetTeam.teamId)?.name ?? targetTeam.teamId}` }
  });

  // Coleta info da equipe alvo
  const { levels } = readCar(targetTeam);
  const avgLevel = Math.round((CAR_PARTS.reduce((s, p) => s + levels[p], 0) / CAR_PARTS.length) * 10) / 10;
  const targetFac = targetTeam.facilities ? JSON.parse(targetTeam.facilities) : {};

  // Notifica a equipe alvo no paddock
  const myTeamName = TEAMS.find(t => t.id === myTeam.teamId)?.name ?? 'Equipe desconhecida';
  await postPaddock(
    league.id,
    league.season,
    league.gpIndex,
    'espionagem',
    `🕵️ Atividade suspeita detectada nos sistemas da equipe. Uma operação de inteligência foi registrada.`,
    { leagueTeamId: targetTeam.id }
  );

  return {
    ok: true,
    targetTeamId: targetTeam.teamId,
    carAvgLevel: avgLevel,
    // Nível das instalações (valor exato, sem nome de peça)
    facilities: {
      pesquisa: targetFac.pesquisa ?? 2,
      tunel: targetFac.tunel ?? 2,
      fabrica: targetFac.fabrica ?? 2,
      simulador: targetFac.simulador ?? 1,
      confiabilidade: targetFac.confiabilidade ?? 1
    },
    message: `Operação concluída. Nível médio do carro alvo: ${avgLevel}.`
  };
}

/** Calcula moral de um piloto com base nos resultados da temporada atual. */
export async function getDriverMoral(driverId: string, leagueId: string, season: number): Promise<number> {
  // Busca últimos 5 GPs deste piloto nesta liga/temporada
  const races = await prisma.leagueRaceResult.findMany({
    where: { leagueId, season },
    orderBy: { gpIndex: 'desc' },
    take: 5
  });

  let moral = 70;
  for (const race of races) {
    const results = JSON.parse(race.resultsJson) as Array<{ driverId: string; position: number; retired: boolean }>;
    const r = results.find(x => x.driverId === driverId);
    if (!r) continue;
    if (r.retired) moral -= 6;
    else if (r.position === 1) moral += 5;
    else if (r.position <= 3) moral += 3;
    else if (r.position <= 10) moral += 1;
    else moral -= 2;
  }
  return Math.max(40, Math.min(100, moral));
}

/** Injeta moral real nos configs da corrida (chamado no raceService antes de simulateGrandPrix). */
export async function enrichWithMoral(
  configs: Array<{ driver: { id: string; moral?: number } }>,
  leagueId: string,
  season: number
) {
  for (const cfg of configs) {
    cfg.driver.moral = await getDriverMoral(cfg.driver.id, leagueId, season);
  }
}

import { CAR_PARTS } from '@f1m/core';
import { prisma } from './db.js';
import { recordChampions } from './raceService.js';
import { RACE_INTERVAL_HOURS } from './leagueService.js';
import { postPaddock } from './paddockService.js';
import { refreshSponsorOffers } from './sponsorService.js';

// shortcut: verba igual para todas as equipes a cada temporada; trocar pela regra de premiação/receitas quando a economia for definida (§23)
export const SEASON_ALLOWANCE = 20;

/**
 * Admin encerra a temporada terminada e abre a próxima:
 * grava campeões e classificação final, zera pontos, renova contratos e libera verba igual para todos.
 */
export async function startNextSeason(code: string, userId: string) {
  const league = await prisma.league.findUnique({
    where: { code: code.toUpperCase() },
    include: { teams: { include: { drivers: true } } }
  });
  if (!league) throw new Error('Liga não encontrada.');
  if (league.adminId !== userId) throw new Error('Apenas o administrador pode abrir a próxima temporada.');
  if (league.status !== 'ENDED') throw new Error('A temporada atual ainda não terminou.');

  const season = league.season;
  await recordChampions(league.id, season);

  // Guarda a classificação final antes de zerar os pontos
  const standings = {
    constructors: [...league.teams].sort((a, b) => b.points - a.points).map((t) => ({ teamId: t.teamId, points: t.points })),
    drivers: league.teams
      .flatMap((t) => t.drivers.map((d) => ({ name: d.name, teamId: t.teamId, points: d.points, wins: d.wins, podiums: d.podiums })))
      .sort((a, b) => b.points - a.points)
  };
  await prisma.hallOfFame.update({
    where: { leagueId_season: { leagueId: league.id, season } },
    data: { standingsJson: JSON.stringify(standings) }
  });

  const zeroWear = JSON.stringify(Object.fromEntries(CAR_PARTS.map((p) => [p, 0])));
  for (const team of league.teams) {
    await prisma.leagueTeam.update({
      where: { id: team.id },
      data: { points: 0, budget: { increment: SEASON_ALLOWANCE }, carWear: zeroWear, setup: null }
    });
    await prisma.ledgerEntry.create({
      data: { leagueTeamId: team.id, season: season + 1, gpIndex: 0, kind: 'verba', amount: SEASON_ALLOWANCE, label: `Verba da categoria · temporada ${season + 1}` }
    });
    for (const d of team.drivers) {
      // shortcut: sem entressafra ainda, todo contrato é renovado por mais uma temporada com o mesmo salário
      await prisma.driverContract.update({
        where: { id: d.id },
        data: { points: 0, age: d.age + 1, contractEnds: Math.max(d.contractEnds, season + 1) }
      });
    }
  }
  await prisma.draftPoolDriver.updateMany({ where: { leagueId: league.id, isDrafted: false }, data: { age: { increment: 1 } } });

  const nextRaceAt = new Date(Date.now() + RACE_INTERVAL_HOURS * 3600_000);
  await prisma.league.update({
    where: { id: league.id },
    data: {
      season: season + 1,
      gpIndex: 0,
      status: 'SEASON',
      nextRaceAt,
      lockedAt: new Date(nextRaceAt.getTime() - 3600_000),
      isLocked: false,
      qualiSession: 0,
      gridJson: null
    }
  });
  await postPaddock(league.id, season + 1, 0, 'temporada', `🚦 Começa a temporada ${season + 1}! Pontos zerados, carros revisados e R$ ${SEASON_ALLOWANCE} mi de verba para cada equipe.`);
  await refreshSponsorOffers(league.id);
  const champ = await prisma.hallOfFame.findUnique({ where: { leagueId_season: { leagueId: league.id, season } } });
  return {
    ok: true,
    message: `Temporada ${season} registrada no Hall da Fama (campeão: ${champ?.driverName}). Temporada ${season + 1} aberta: treino livre do GP 1 começou.`
  };
}

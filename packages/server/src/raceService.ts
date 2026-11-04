import { prisma } from './db.js';
import { closeDueSessions, readSetups } from './weekendService.js';
import { aiMarketTurn, expireOffers } from './marketService.js';
import { aiDevelopTurn, carAverages, rndAfterRace } from './rndService.js';
import { postPaddock } from './paddockService.js';
import { paySponsorsAfterRace, paySeasonBonuses, refreshSponsorOffers } from './sponsorService.js';
import { ensureStaff, getTeamFactors, staffCostsAfterRace, aiStaffTurn } from './staffService.js';
import { enrichWithMoral } from './intelligenceService.js';
import { triggerOccasionalEvents } from './eventService.js';
import {
  TEAMS,
  CIRCUITS,
  simulateGrandPrix,
  RaceDriverConfig,
  hashString,
  facilityWearReduction
} from '@f1m/core';

/**
 * Salva a preparação e estratégia da equipe para o próximo GP
 */
export async function saveTeamRaceStrategy(
  leagueCode: string,
  username: string,
  data: {
    setup?: { asas: number; motor: number; freios: number; cambio: number; suspensao: number };
    tacticPace?: 'atacar' | 'equilibrado' | 'conservar';
    strategy?: { compounds: any[]; pitLaps: number[]; risk?: boolean };
  }
) {
  const code = leagueCode.toUpperCase();
  const league = await prisma.league.findUnique({
    where: { code },
    include: { teams: { include: { user: true } } }
  });

  if (!league) throw new Error('Liga não encontrada.');
  if (league.status !== 'SEASON') {
    throw new Error('A liga não está na fase de temporada regular.');
  }
  if (league.isLocked) {
    throw new Error('🔒 As configurações das equipes já foram travadas para este GP (Grid Fechado a 1h da largada).');
  }

  const team = league.teams.find(t => t.user?.username === username);
  if (!team) {
    throw new Error('Você não gerencia nenhuma equipe nesta liga.');
  }

  const updatedTeam = await prisma.leagueTeam.update({
    where: { id: team.id },
    data: {
      tacticPace: data.tacticPace || team.tacticPace,
      strategy: data.strategy ? JSON.stringify(data.strategy) : team.strategy
    }
  });

  return { ok: true, message: 'Estratégia salva com sucesso!', team: updatedTeam };
}

/**
 * Simula automaticamente o Grande Prêmio agendado no servidor
 */
export async function simulateScheduledRace(leagueId: string) {
  // Garante classificação completa antes da largada (sessões não jogadas são feitas pelas equipes)
  await closeDueSessions(leagueId, true);

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    include: {
      teams: {
        include: { drivers: true }
      }
    }
  });

  if (!league || league.status !== 'SEASON') return null;

  const gpIndex = league.gpIndex;
  const circuit = CIRCUITS[gpIndex % CIRCUITS.length];
  const raceSeed = hashString(`${league.id}-S${league.season}-GP${gpIndex}`);

  // 1. Montar as 22 configurações de corrida (2 pilotos por equipe)
  const configs: RaceDriverConfig[] = [];

  for (const team of league.teams) {
    // Peças do carro
    const carParts = team.carLevels
      ? JSON.parse(team.carLevels)
      : { chassi: 5, motor: 5, asaDianteira: 5, asaTraseira: 5, suspensao: 5, freios: 5, cambio: 5 };
    const carWear = team.carWear
      ? JSON.parse(team.carWear)
      : { chassi: 0, motor: 0, asaDianteira: 0, asaTraseira: 0, suspensao: 0, freios: 0, cambio: 0 };

    const car = Object.fromEntries(
      Object.keys(carParts).map(part => [
        part,
        { level: carParts[part] || 5, wear: carWear[part] || 0 }
      ])
    ) as any;

    const setups = readSetups(team, team.drivers.map(d => d.driverId), circuit.idealSetup);

    // Estratégia de pneus
    const strategy = team.strategy
      ? JSON.parse(team.strategy)
      : { compounds: ['medio', 'duro'], pitLaps: [Math.round(circuit.laps * 0.45)], initialPace: team.tacticPace };

    // Fatores da equipe técnica (pitCrew do chefeBox)
    await ensureStaff(league.id, team.id, team.teamId, league.season);
    const factors = await getTeamFactors(league.id, team.id, league.season);

    // Só os titulares correm; a reserva recebe salário mas fica no box
    for (const driver of team.drivers.filter(d => d.role === 'titular1' || d.role === 'titular2')) {
      configs.push({
        driver: {
          id: driver.driverId,
          name: driver.name,
          talento: driver.talento,
          classificacao: driver.classificacao,
          experiencia: driver.experiencia,
          concentracao: driver.concentracao,
          gestaoPneus: driver.gestaoPneus,
          agressividade: driver.agressividade,
          moral: 70,
          personalidade: driver.personalidade
        },
        car,
        setup: setups[driver.driverId],
        teamId: team.id,
        strategy: {
          compounds: strategy.compounds || ['medio', 'duro'],
          pitLaps: strategy.pitLaps || [Math.round(circuit.laps * 0.45)],
          risk: strategy.risk || false,
          initialPace: team.tacticPace as any || 'equilibrado'
        },
        pitCrew: factors.pitCrew
      });
    }
  }

  // 2. Enriquecer configs com moral dos pilotos (Fase 11) e simular
  await enrichWithMoral(configs, league.id, league.season);
  const simulation = simulateGrandPrix(configs, circuit, raceSeed, league.gridJson ? JSON.parse(league.gridJson) : undefined);

  // 3. Persistir o resultado da corrida no banco de dados
  const pole = simulation.results.reduce((prev, cur) => (cur.gridPosition < prev.gridPosition ? cur : prev));
  const winner = simulation.results[0];
  const fastestLap = simulation.fastestLap;

  const raceRecord = await prisma.leagueRaceResult.create({
    data: {
      leagueId: league.id,
      season: league.season,
      gpIndex,
      circuitId: circuit.id,
      poleDriverId: pole.driverId,
      winnerDriverId: winner.driverId,
      fastestLapDriverId: fastestLap?.driverId || winner.driverId,
      fastestLapTime: fastestLap?.time || 80.0,
      safetyCarCount: simulation.safetyCarLaps.length > 0 ? 1 : 0,
      resultsJson: JSON.stringify(simulation.results),
      eventsJson: JSON.stringify(simulation.events)
    }
  });

  // 3b. Mural do paddock: resumo da corrida
  {
    const nameOf = (id: string) => league.teams.flatMap(t => t.drivers).find(d => d.driverId === id)?.name ?? id;
    const finishers = simulation.results.filter(r => !r.retired);
    const podium = finishers.slice(0, 3).map(r => nameOf(r.driverId));
    const lapStr = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
    await postPaddock(
      league.id,
      league.season,
      gpIndex,
      'corrida',
      `🏁 ${podium[0]} vence o ${circuit.gp}! Pódio completo com ${podium[1]} e ${podium[2]}. Pole de ${nameOf(pole.driverId)}.` +
        (fastestLap ? ` Volta mais rápida: ${nameOf(fastestLap.driverId)} (${lapStr(fastestLap.time)}).` : '')
    );
    const dnf = simulation.results.filter(r => r.retired);
    if (dnf.length)
      await postPaddock(league.id, league.season, gpIndex, 'corrida', `💥 Abandonos no ${circuit.gp}: ${dnf.map(r => `${nameOf(r.driverId)}${r.retireReason ? ` (${r.retireReason})` : ''}`).join(', ')}.`);
    if (simulation.safetyCarLaps.length)
      await postPaddock(league.id, league.season, gpIndex, 'corrida', `🚨 Safety Car na pista no ${circuit.gp} (${simulation.safetyCarLaps.length} voltas neutralizadas).`);
  }

  // 4. Atualizar estatísticas dos pilotos (pontos, vitórias, pódios, poles)
  for (const res of simulation.results) {
    const driverContract = await prisma.driverContract.findFirst({
      where: {
        driverId: res.driverId,
        team: { leagueId: league.id }
      }
    });

    if (driverContract) {
      await prisma.driverContract.update({
        where: { id: driverContract.id },
        data: {
          points: { increment: res.points },
          wins: { increment: res.position === 1 ? 1 : 0 },
          podiums: { increment: res.position <= 3 ? 1 : 0 },
          poles: { increment: res.gridPosition === 1 ? 1 : 0 },
          fastestLaps: { increment: res.fastestLap ? 1 : 0 }
        }
      });
    }
  }

  // 5. Atualizar finanças e carros das equipes
  for (const team of league.teams) {
    const teamDriverResults = simulation.results.filter(r => r.teamId === team.id);
    const prizeWon = teamDriverResults.reduce((acc, r) => acc + r.prizeMoney, 0);
    const salaryCost = team.drivers.reduce((acc, d) => acc + d.salario, 0);
    const netCashflow = prizeWon - salaryCost;

    // Desgaste natural de peças (+10% a 15% por GP)
    const currentWear = team.carWear
      ? JSON.parse(team.carWear)
      : { chassi: 0, motor: 0, asaDianteira: 0, asaTraseira: 0, suspensao: 0, freios: 0, cambio: 0 };
    const confiLevel = team.facilities ? (JSON.parse(team.facilities).confiabilidade ?? 1) : 1;
    const wearMult = 1 - facilityWearReduction(confiLevel) / 100;
    for (const part of Object.keys(currentWear)) {
      currentWear[part] = Math.min(100, Math.round(currentWear[part] + 7 * circuit.desgastePecas * wearMult));
    }

    const constructorPts = simulation.constructorPoints[team.id] || 0;

    const entries = [
      { kind: 'premio', amount: prizeWon, label: `Premiação ${circuit.gp}` },
      ...team.drivers.map(d => ({ kind: 'salario', amount: -d.salario, label: `Salário ${d.name} (${circuit.gp})` }))
    ].filter(e => e.amount !== 0);
    await prisma.ledgerEntry.createMany({
      data: entries.map(e => ({ ...e, leagueTeamId: team.id, season: league.season, gpIndex }))
    });

    await prisma.leagueTeam.update({
      where: { id: team.id },
      data: {
        points: { increment: constructorPts },
        budget: { increment: netCashflow },
        carWear: JSON.stringify(currentWear)
      }
    });
  }

  // 5a. Patrocínios: cota por GP e bônus de meta
  await paySponsorsAfterRace(
    league.id,
    league.season,
    gpIndex,
    simulation.results,
    Object.fromEntries(league.teams.map(t => [t.id, t.drivers.filter(d => d.role === 'titular1' || d.role === 'titular2').length]))
  );

  // 5b. P&D avança em todas as equipes e o nível dos carros entra no histórico (gráfico de Rivais)
  await rndAfterRace(league.id, league.season, gpIndex);

  // 5c. Salários e manutenção da equipe técnica
  await staffCostsAfterRace(league.id, league.season, gpIndex);

  // 5d. IA contrata e melhora instalações (apenas nos primeiros GPs)
  await aiStaffTurn(league.id, league.season, gpIndex);

  // 5e. Eventos ocasionais por equipe (Fase 9)
  await triggerOccasionalEvents(league.id, league.season, gpIndex);
  const teamsAfter = await prisma.leagueTeam.findMany({ where: { leagueId: league.id } });
  await prisma.leagueRaceResult.update({ where: { id: raceRecord.id }, data: { carAvgJson: JSON.stringify(carAverages(teamsAfter)) } });

  // 6. Avançar o calendário ou encerrar a temporada
  const isSeasonEnd = gpIndex >= 11; // 12 GPs por temporada (0 a 11)

  if (isSeasonEnd) {
    await paySeasonBonuses(league.id, league.season);
    await recordChampions(league.id, league.season);
  }

  if (isSeasonEnd) {
    await prisma.league.update({
      where: { id: league.id },
      data: {
        status: 'ENDED',
        nextRaceAt: null,
        lockedAt: null,
        isLocked: false,
        qualiSession: 0,
        gridJson: null
      }
    });
  } else {
    const nextGP = gpIndex + 1;
    const now = new Date();
    const nextRaceAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // Daqui a 48 horas
    const lockedAt = new Date(nextRaceAt.getTime() - 60 * 60 * 1000);   // 1 hora antes

    await prisma.league.update({
      where: { id: league.id },
      data: {
        gpIndex: nextGP,
        nextRaceAt,
        lockedAt,
        isLocked: false,
        qualiSession: 0,
        gridJson: null
      }
    });
  }

  // Mercado reabre com o novo GP: IA completa elencos e faz suas propostas
  if (!isSeasonEnd) {
    await aiMarketTurn(league.id).catch(err => console.error('[Mercado IA]', err));
    await aiDevelopTurn(league.id, league.season, gpIndex + 1).catch(err => console.error('[P&D IA]', err));
    await refreshSponsorOffers(league.id).catch(err => console.error('[Patrocínio]', err));
  }

  return simulation;
}

/**
 * Worker do Scheduler: executa periodicamente verificando prazos e corridas
 */
export async function runSchedulerTick() {
  const now = new Date();

  await expireOffers();

  // 0. Encerrar sessões de classificação cujo horário passou (Q1 em T−20h, Q2 em T−16h, Q3 em T−12h)
  const seasonLeagues = await prisma.league.findMany({ where: { status: 'SEASON', qualiSession: { lt: 3 } }, select: { id: true, code: true } });
  for (const l of seasonLeagues) {
    try {
      await closeDueSessions(l.id);
    } catch (err) {
      console.error(`❌ [Scheduler] Erro ao encerrar classificação da Liga ${l.code}:`, err);
    }
  }

  // 1. Verificar travamento de equipes (T - 1 hora)
  const leaguesToLock = await prisma.league.findMany({
    where: {
      status: 'SEASON',
      isLocked: false,
      lockedAt: { lte: now }
    }
  });

  for (const l of leaguesToLock) {
    await prisma.league.update({
      where: { id: l.id },
      data: { isLocked: true }
    });
    console.log(`🔒 [Scheduler] Liga ${l.code}: Grid fechado e estratégias travadas a 1h da largada!`);
  }

  // 2. Verificar corridas agendadas para largada (T)
  const leaguesToSimulate = await prisma.league.findMany({
    where: {
      status: 'SEASON',
      nextRaceAt: { lte: now }
    }
  });

  for (const l of leaguesToSimulate) {
    console.log(`🏁 [Scheduler] Iniciando simulação do GP ${l.gpIndex + 1} da Liga ${l.code}...`);
    try {
      await simulateScheduledRace(l.id);
      console.log(`✅ [Scheduler] GP ${l.gpIndex + 1} da Liga ${l.code} simulado e publicado com sucesso!`);
    } catch (err) {
      console.error(`❌ [Scheduler] Erro ao simular GP da Liga ${l.code}:`, err);
    }
  }
}


/** Grava os campeões da temporada no Hall da Fama da liga. */
export async function recordChampions(leagueId: string, season: number) {
  const teams = await prisma.leagueTeam.findMany({
    where: { leagueId },
    include: { drivers: true, user: { select: { name: true, username: true } } }
  });
  const constructor = [...teams].sort((a, b) => b.points - a.points)[0];
  const driver = teams
    .flatMap(t => t.drivers.map(d => ({ d, t })))
    .sort((a, b) => b.d.points - a.d.points || b.d.wins - a.d.wins)[0];
  if (!constructor || !driver) return;
  const champion = await prisma.hallOfFame.findUnique({ where: { leagueId_season: { leagueId, season } } });
  if (!champion) {
    await postPaddock(
      leagueId,
      season,
      11,
      'temporada',
      `🏆 ${driver.d.name} é o campeão de pilotos da temporada ${season} (${driver.d.points} pts). A ${TEAMS.find(t => t.id === constructor.teamId)?.name} leva o título de construtores.`
    );
  }
  await prisma.hallOfFame.upsert({
    where: { leagueId_season: { leagueId, season } },
    update: {},
    create: {
      leagueId,
      season,
      driverName: driver.d.name,
      driverTeamId: driver.t.teamId,
      driverPoints: driver.d.points,
      driverWins: driver.d.wins,
      constructorTeamId: constructor.teamId,
      constructorManager: constructor.isAI ? 'IA' : constructor.user?.name || constructor.user?.username || '',
      constructorPoints: constructor.points
    }
  });
}

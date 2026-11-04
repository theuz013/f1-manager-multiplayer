import { randomInt } from 'crypto';
import { prisma } from './db.js';
import { refreshSponsorOffers } from './sponsorService.js';
import {
  TEAMS,
  CIRCUITS,
  generateDraftPools,
  getSnakeDraftOrder,
  createPRNG,
  hashString
} from '@f1m/core';

export const DRAFT_PICK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos por escolha
export const RACE_INTERVAL_HOURS = 48; // Intervalo de 48 horas entre GPs

/**
 * Cria uma nova Liga Privada com as 11 equipes equalizadas no grid
 */
export async function createLeague(adminUsername: string, leagueName?: string) {
  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: { username: adminUsername, name: adminUsername }
  });

  // Gerar código único de 6 caracteres maiúsculos
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  const league = await prisma.league.create({
    data: {
      code,
      name: leagueName || `Liga F1 ${code}`,
      adminId: admin.id,
      status: 'SETUP',
      season: 1,
      gpIndex: 0
    }
  });

  // Criar 11 Equipes Equalizadas
  // Ninguém tem equipe ao criar: a escolha acontece no Draft de Equipes
  const teamsData = TEAMS.map((t) => ({
    leagueId: league.id,
    teamId: t.id,
    userId: null,
    isAI: true,
    budget: 40.0,                        // Orçamento único equalizado de R$ 40 mi
    reputation: 60,
    carLevels: JSON.stringify({
      chassi: 5, motor: 5, asaDianteira: 5, asaTraseira: 5, suspensao: 5, freios: 5, cambio: 5
    }),
    carWear: JSON.stringify({
      chassi: 0, motor: 0, asaDianteira: 0, asaTraseira: 0, suspensao: 0, freios: 0, cambio: 0
    }),
    facilities: JSON.stringify({ pesquisa: 2, tunel: 2, fabrica: 2, simulador: 2 }),
    tacticPace: 'equilibrado'
  }));

  await prisma.leagueTeam.createMany({ data: teamsData });
  await prisma.leagueMember.create({ data: { leagueId: league.id, userId: admin.id } });

  return getLeagueDetails(code);
}

function shuffle<T>(items: T[]) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Admin sorteia a ordem em que os participantes escolhem suas equipes
 */
export async function drawTeamOrder(leagueCode: string, adminUsername: string) {
  const code = leagueCode.toUpperCase();
  const league = await prisma.league.findUnique({
    where: { code },
    include: { admin: true, members: true }
  });

  if (!league) throw new Error('Liga não encontrada.');
  if (league.admin.username !== adminUsername) throw new Error('Apenas o administrador pode realizar o sorteio.');
  if (league.status !== 'SETUP') throw new Error('O sorteio das equipes já foi realizado.');

  const order = shuffle(league.members);
  for (let i = 0; i < order.length; i++) {
    await prisma.leagueMember.update({ where: { id: order[i].id }, data: { teamDraftOrder: i + 1 } });
  }
  await prisma.league.update({ where: { id: league.id }, data: { status: 'TEAM_DRAFT' } });

  return getLeagueDetails(code);
}

/**
 * Jogador entra na Liga
 */
export async function joinLeague(leagueCode: string, username: string) {
  const code = leagueCode.toUpperCase();
  const league = await prisma.league.findUnique({
    where: { code },
    include: { members: { include: { user: true } } }
  });

  if (!league) throw new Error('Liga não encontrada.');
  // Quem já participa pode reabrir a liga em qualquer fase
  if (league.members.some(m => m.user.username === username)) return getLeagueDetails(code);

  if (league.status !== 'SETUP') {
    throw new Error('As inscrições desta liga já foram encerradas (sorteio realizado).');
  }
  if (league.members.length >= TEAMS.length) {
    throw new Error('A liga já tem 11 participantes.');
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new Error('Usuário não encontrado.');
  await prisma.leagueMember.create({ data: { leagueId: league.id, userId: user.id } });

  return getLeagueDetails(code);
}

/**
 * Participante escolhe sua equipe, apenas na sua vez do Draft de Equipes
 */
export async function selectTeam(leagueCode: string, username: string, teamId: string) {
  const code = leagueCode.toUpperCase();
  const league = await prisma.league.findUnique({
    where: { code },
    include: { teams: true, members: { include: { user: true }, orderBy: { teamDraftOrder: 'asc' } } }
  });

  if (!league) throw new Error('Liga não encontrada.');
  if (league.status !== 'TEAM_DRAFT') throw new Error('O Draft de Equipes não está aberto.');

  const ownerIds = new Set(league.teams.map(t => t.userId).filter(Boolean));
  const current = league.members.find(m => !ownerIds.has(m.userId));
  if (!current) throw new Error('Todos os participantes já escolheram suas equipes.');
  if (current.user.username !== username) {
    throw new Error(`Não é a sua vez. Agora quem escolhe é ${current.user.name}.`);
  }

  const targetTeam = league.teams.find(t => t.teamId === teamId);
  if (!targetTeam) throw new Error('Equipe inválida.');
  if (!targetTeam.isAI) throw new Error('Esta equipe já foi escolhida por outro participante.');

  await prisma.leagueTeam.update({
    where: { id: targetTeam.id },
    data: { userId: current.userId, isAI: false }
  });

  return getLeagueDetails(code);
}

/**
 * Inicia o Snake Draft de Pilotos
 */
export async function startPilotDraft(leagueCode: string, adminUsername: string) {
  const code = leagueCode.toUpperCase();
  const league = await prisma.league.findUnique({
    where: { code },
    include: { admin: true, teams: true, members: true }
  });

  if (!league) throw new Error('Liga não encontrada.');
  if (league.admin.username !== adminUsername) {
    throw new Error('Apenas o administrador da liga pode iniciar o Draft de Pilotos.');
  }
  if (league.status !== 'TEAM_DRAFT') {
    throw new Error('O Draft de Pilotos só pode ser sorteado após o Draft de Equipes.');
  }
  if (league.teams.filter(t => t.userId).length < league.members.length) {
    throw new Error('Ainda há participantes sem equipe.');
  }

  const leagueSeed = hashString(league.id);
  const rng = createPRNG(leagueSeed);

  // 1. Sortear ordem aleatória das 11 equipes (1 a 11)
  const shuffledTeams = [...league.teams];
  for (let i = shuffledTeams.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [shuffledTeams[i], shuffledTeams[j]] = [shuffledTeams[j], shuffledTeams[i]];
  }

  for (let i = 0; i < shuffledTeams.length; i++) {
    await prisma.leagueTeam.update({
      where: { id: shuffledTeams[i].id },
      data: { draftOrder: i + 1 }
    });
  }

  // 2. Gerar Potes 1 e 2
  const pools = generateDraftPools(leagueSeed);
  const poolData = [
    ...pools.pot1.map(p => ({
      leagueId: league.id,
      driverId: p.id,
      name: p.name,
      pot: 1,
      age: p.age,
      ger: p.ger,
      talento: p.talento,
      classificacao: p.classificacao,
      gestaoPneus: p.gestaoPneus,
      concentracao: p.concentracao,
      experiencia: p.experiencia,
      condicionamento: p.condicionamento,
      agressividade: p.agressividade,
      potencial: p.potencial,
      personalidade: p.personalidade,
      signingFee: p.signingFee,
      salario: p.salario
    })),
    ...pools.pot2.map(p => ({
      leagueId: league.id,
      driverId: p.id,
      name: p.name,
      pot: 2,
      age: p.age,
      ger: p.ger,
      talento: p.talento,
      classificacao: p.classificacao,
      gestaoPneus: p.gestaoPneus,
      concentracao: p.concentracao,
      experiencia: p.experiencia,
      condicionamento: p.condicionamento,
      agressividade: p.agressividade,
      potencial: p.potencial,
      personalidade: p.personalidade,
      signingFee: p.signingFee,
      salario: p.salario
    }))
  ];

  await prisma.draftPoolDriver.deleteMany({ where: { leagueId: league.id } });
  await prisma.draftPoolDriver.createMany({ data: poolData });

  // 3. Gerar as 22 escolhas do Snake Draft
  const snakeOrder = getSnakeDraftOrder(11);
  const now = new Date();

  await prisma.draftPick.deleteMany({ where: { leagueId: league.id } });

  const picksData = snakeOrder.map((step, idx) => ({
    leagueId: league.id,
    leagueTeamId: shuffledTeams[step.teamIndex].id,
    round: step.round,
    pickNumber: idx + 1,
    pot: step.pot,
    deadline: new Date(now.getTime() + (idx + 1) * DRAFT_PICK_TIMEOUT_MS)
  }));

  await prisma.draftPick.createMany({ data: picksData });

  await prisma.league.update({
    where: { id: league.id },
    data: { status: 'PILOT_DRAFT' }
  });

  // 4. Se a primeira escolha for de uma equipe de IA, processar escolhas da IA
  await processAIPicks(league.id);

  return getDraftState(code);
}

/**
 * Jogador realiza a escolha de um piloto na sua vez do Snake Draft
 */
export async function makeDraftPick(leagueCode: string, username: string, driverId: string) {
  const code = leagueCode.toUpperCase();
  const league = await prisma.league.findUnique({
    where: { code },
    include: { teams: { include: { user: true } } }
  });

  if (!league) throw new Error('Liga não encontrada.');
  if (league.status !== 'PILOT_DRAFT') {
    throw new Error('A liga não está em fase de Draft de Pilotos.');
  }

  // Buscar a escolha atual pendente
  const currentPick = await prisma.draftPick.findFirst({
    where: { leagueId: league.id, driverId: null },
    orderBy: { pickNumber: 'asc' },
    include: { leagueTeam: { include: { user: true } } }
  });

  if (!currentPick) {
    throw new Error('Todas as escolhas do Draft já foram concluídas.');
  }

  // Validar se é a vez do jogador
  if (currentPick.leagueTeam.isAI || currentPick.leagueTeam.user?.username !== username) {
    throw new Error(`Não é a sua vez de escolher. A vez atual é da equipe ${currentPick.leagueTeam.teamId}.`);
  }

  // Buscar piloto no pote
  const poolDriver = await prisma.draftPoolDriver.findFirst({
    where: {
      leagueId: league.id,
      driverId,
      pot: currentPick.pot,
      isDrafted: false
    }
  });

  if (!poolDriver) {
    throw new Error('Piloto indisponível ou não pertence ao pote da rodada atual.');
  }

  // Validar orçamento
  if (currentPick.leagueTeam.budget < poolDriver.signingFee) {
    throw new Error(`Orçamento insuficiente para pagar o valor de contratação fixo (R$ ${poolDriver.signingFee} mi).`);
  }

  // Executar a contratação
  await executeContract(currentPick.leagueTeam.id, poolDriver);

  // Registrar a escolha
  await prisma.draftPick.update({
    where: { id: currentPick.id },
    data: {
      driverId: poolDriver.driverId,
      pickedAt: new Date(),
      autoPicked: false
    }
  });

  // Atualizar deadline da próxima escolha
  const nextPick = await prisma.draftPick.findFirst({
    where: { leagueId: league.id, driverId: null },
    orderBy: { pickNumber: 'asc' }
  });

  if (nextPick) {
    await prisma.draftPick.update({
      where: { id: nextPick.id },
      data: { deadline: new Date(Date.now() + DRAFT_PICK_TIMEOUT_MS) }
    });
  }

  // Processar escolhas consecutivas de IA se houver
  await processAIPicks(league.id);

  // Verificar se o draft terminou
  await checkDraftCompletion(league.id);

  return getDraftState(code);
}

/**
 * Cria o contrato e desconta o signing fee do caixa
 */
async function executeContract(teamId: string, poolDriver: any) {
  await prisma.driverContract.create({
    data: {
      leagueTeamId: teamId,
      driverId: poolDriver.driverId,
      name: poolDriver.name,
      age: poolDriver.age,
      ger: poolDriver.ger,
      talento: poolDriver.talento,
      classificacao: poolDriver.classificacao,
      gestaoPneus: poolDriver.gestaoPneus,
      concentracao: poolDriver.concentracao,
      experiencia: poolDriver.experiencia,
      condicionamento: poolDriver.condicionamento,
      agressividade: poolDriver.agressividade,
      potencial: poolDriver.potencial,
      personalidade: poolDriver.personalidade,
      salario: poolDriver.salario,
      contractEnds: 1,
      role: poolDriver.pot === 1 ? 'titular1' : 'titular2'
    }
  });

  const team = await prisma.leagueTeam.update({
    where: { id: teamId },
    data: {
      budget: { decrement: poolDriver.signingFee }
    },
    include: { league: true }
  });

  await prisma.ledgerEntry.create({
    data: {
      leagueTeamId: teamId,
      season: team.league.season,
      gpIndex: team.league.gpIndex,
      kind: 'contratacao',
      amount: -poolDriver.signingFee,
      label: `Contratação: ${poolDriver.name} (Pote ${poolDriver.pot})`
    }
  });

  await prisma.draftPoolDriver.update({
    where: { id: poolDriver.id },
    data: {
      isDrafted: true,
      draftedByTeamId: teamId
    }
  });
}

/**
 * Processa escolhas automáticas para equipes de IA consecutivas
 */
async function processAIPicks(leagueId: string) {
  let hasAIPicks = true;

  while (hasAIPicks) {
    const currentPick = await prisma.draftPick.findFirst({
      where: { leagueId, driverId: null },
      orderBy: { pickNumber: 'asc' },
      include: { leagueTeam: true }
    });

    if (!currentPick || !currentPick.leagueTeam.isAI) {
      hasAIPicks = false;
      break;
    }

    // A IA escolhe o melhor piloto disponível do pote
    const availableDrivers = await prisma.draftPoolDriver.findMany({
      where: {
        leagueId,
        pot: currentPick.pot,
        isDrafted: false
      },
      orderBy: [{ ger: 'desc' }, { talento: 'desc' }]
    });

    if (availableDrivers.length === 0) {
      hasAIPicks = false;
      break;
    }

    const chosen = availableDrivers[0];
    await executeContract(currentPick.leagueTeam.id, chosen);

    await prisma.draftPick.update({
      where: { id: currentPick.id },
      data: {
        driverId: chosen.driverId,
        pickedAt: new Date(),
        autoPicked: true
      }
    });

    // Atualiza o prazo da próxima
    const nextPick = await prisma.draftPick.findFirst({
      where: { leagueId, driverId: null },
      orderBy: { pickNumber: 'asc' }
    });
    if (nextPick) {
      await prisma.draftPick.update({
        where: { id: nextPick.id },
        data: { deadline: new Date(Date.now() + DRAFT_PICK_TIMEOUT_MS) }
      });
    }
  }
}

/**
 * Verifica se o draft terminou e avança a liga para a temporada regular (SEASON)
 */
async function checkDraftCompletion(leagueId: string) {
  const pendingPicks = await prisma.draftPick.count({
    where: { leagueId, driverId: null }
  });

  if (pendingPicks === 0) {
    const now = new Date();
    const nextRaceAt = new Date(now.getTime() + RACE_INTERVAL_HOURS * 60 * 60 * 1000);
    const lockedAt = new Date(nextRaceAt.getTime() - 60 * 60 * 1000); // 1 hora antes

    await prisma.league.update({
      where: { id: leagueId },
      data: {
        status: 'SEASON',
        gpIndex: 0,
        nextRaceAt,
        lockedAt,
        isLocked: false
      }
    });
    await refreshSponsorOffers(leagueId);
  }
}

/**
 * Consulta o estado completo da Liga
 */
export async function getLeagueDetails(leagueCode: string) {
  const code = leagueCode.toUpperCase();
  const league = await prisma.league.findUnique({
    where: { code },
    include: {
      admin: { select: { id: true, username: true, name: true } },
      members: {
        include: { user: { select: { id: true, username: true, name: true } } },
        orderBy: [{ teamDraftOrder: 'asc' }, { joinedAt: 'asc' }]
      },
      teams: {
        include: {
          user: { select: { id: true, username: true, name: true } },
          drivers: true
        },
        orderBy: { points: 'desc' }
      },
      raceResults: {
        orderBy: { gpIndex: 'desc' }
      },
      hallOfFame: { orderBy: { season: 'desc' } }
    }
  });

  if (!league) throw new Error('Liga não encontrada.');

  return league;
}

/**
 * Consulta o estado do Snake Draft e pilotos dos potes
 */
export async function getDraftState(leagueCode: string) {
  const code = leagueCode.toUpperCase();
  const league = await prisma.league.findUnique({
    where: { code }
  });

  if (!league) throw new Error('Liga não encontrada.');

  const poolDrivers = await prisma.draftPoolDriver.findMany({
    where: { leagueId: league.id },
    orderBy: [{ pot: 'asc' }, { ger: 'desc' }]
  });

  const picks = await prisma.draftPick.findMany({
    where: { leagueId: league.id },
    include: {
      leagueTeam: {
        include: { user: { select: { username: true, name: true } } }
      }
    },
    orderBy: { pickNumber: 'asc' }
  });

  const currentPick = picks.find(p => !p.driverId) || null;

  return {
    leagueCode: league.code,
    status: league.status,
    totalPicks: picks.length,
    completedPicksCount: picks.filter(p => p.driverId).length,
    currentPick,
    picks,
    availablePot1: poolDrivers.filter(d => d.pot === 1 && !d.isDrafted),
    availablePot2: poolDrivers.filter(d => d.pot === 2 && !d.isDrafted),
    allDrivers: poolDrivers
  };
}


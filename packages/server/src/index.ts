import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { TEAMS, CIRCUITS, SEASON_CALENDAR_SIZE } from '@f1m/core';
import { prisma } from './db.js';
import { hashPassword, verifyPassword, createSession, userFromToken } from './auth.js';
import { carAction, getTeamLedger } from './carService.js';
import { startNextSeason } from './seasonService.js';
import { getSponsors, acceptSponsor } from './sponsorService.js';
import { getStaff, hireStaff, upgradeFacility } from './staffService.js';
import { espionage } from './intelligenceService.js';
import { getPaddock, giveInterview, replyToCritic, postMessage } from './paddockService.js';
import { getRnd, startProject, setProjectEngineers, cancelProject, extraShift } from './rndService.js';
import { getMarket, signFreeAgent, makeOffer, respondOffer, releaseDriver, setStarters } from './marketService.js';
import { getWeekendState, saveDriverSetup, runPracticeLap, runQualiLap, advanceWeekend, describeAdvance } from './weekendService.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: string; username: string; name: string };
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../../client/dist');
import {
  createLeague,
  joinLeague,
  selectTeam,
  drawTeamOrder,
  startPilotDraft,
  makeDraftPick,
  getLeagueDetails,
  getDraftState
} from './leagueService.js';
import {
  saveTeamRaceStrategy,
  simulateScheduledRace,
  runSchedulerTick
} from './raceService.js';

const fastify = Fastify({
  logger: true
});

await fastify.register(cors, {
  origin: '*'
});

await fastify.register(websocket);

// Servir frontend compilado estático diretamente da porta do servidor
try {
  await fastify.register(fastifyStatic, {
    root: clientDistPath,
    prefix: '/'
  });
} catch (e) {
  console.warn('Aviso: pasta client/dist não encontrada ou fastifyStatic falhou:', e);
}

// Rota de Healthcheck
fastify.get('/health', async () => {
  return {
    status: 'ok',
    game: 'F1 Manager Multiplayer & Solo',
    version: '1.4.4',
    teamsCount: TEAMS.length,
    circuitsCount: CIRCUITS.length,
    seasonCalendarSize: SEASON_CALENDAR_SIZE
  };
});

// Metadados estáticos do Core
fastify.get('/api/teams', async () => {
  return TEAMS;
});

fastify.get('/api/circuits', async () => {
  return CIRCUITS;
});

// ==========================================
// AUTENTICAÇÃO (usuário + senha, token de sessão)
// ==========================================

const publicUser = (u: { id: string; username: string; name: string }) => ({ id: u.id, username: u.username, name: u.name });

fastify.post<{ Body: { username?: string; password?: string } }>('/api/auth/register', async (req, reply) => {
  const username = req.body.username?.trim() ?? '';
  const password = req.body.password ?? '';
  if (!/^[\w.-]{3,20}$/.test(username)) {
    return reply.code(400).send({ error: 'Usuário deve ter 3 a 20 caracteres (letras, números, . _ -).' });
  }
  if (password.length < 6) return reply.code(400).send({ error: 'A senha deve ter pelo menos 6 caracteres.' });

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing?.passwordHash) return reply.code(409).send({ error: 'Este usuário já existe.' });

  // shortcut: contas antigas sem senha podem ser reivindicadas por quem registrar primeiro, ok só em dev
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: hashPassword(password) } })
    : await prisma.user.create({ data: { username, name: username, passwordHash: hashPassword(password) } });

  return reply.code(201).send({ token: await createSession(user.id), user: publicUser(user) });
});

fastify.post<{ Body: { username?: string; password?: string } }>('/api/auth/login', async (req, reply) => {
  const user = await prisma.user.findUnique({ where: { username: req.body.username?.trim() ?? '' } });
  if (!user?.passwordHash || !verifyPassword(req.body.password ?? '', user.passwordHash)) {
    return reply.code(401).send({ error: 'Usuário ou senha inválidos.' });
  }
  return { token: await createSession(user.id), user: publicUser(user) };
});

fastify.get('/api/auth/me', async (req, reply) => {
  const user = await userFromToken(req.headers.authorization);
  if (!user) return reply.code(401).send({ error: 'Sessão inválida.' });
  return publicUser(user);
});

fastify.post('/api/auth/logout', async (req) => {
  const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
  await prisma.session.deleteMany({ where: { token } });
  return { ok: true };
});

fastify.decorateRequest('user', null as any);
fastify.addHook('preHandler', async (req, reply) => {
  if (!req.url.startsWith('/api/careers') && !req.url.startsWith('/api/leagues')) return;
  const user = await userFromToken(req.headers.authorization);
  if (!user) return reply.code(401).send({ error: 'Faça login para continuar.' });
  req.user = publicUser(user);
});

// ==========================================
// MODO MANAGER (CARREIRA SOLO / PERSISTÊNCIA)
// ==========================================

// Listar carreiras salvas do usuário logado
fastify.get('/api/careers', async (req) => {
  const careers = await prisma.career.findMany({
    where: { userId: req.user.id },
    orderBy: { updatedAt: 'desc' },
    include: {
      user: {
        select: { id: true, username: true, name: true }
      }
    }
  });
  return careers;
});

// Obter uma carreira específica pelo ID
fastify.get<{ Params: { id: string } }>('/api/careers/:id', async (req, reply) => {
  const career = await prisma.career.findFirst({
    where: { id: req.params.id, userId: req.user.id },
    include: { user: { select: { id: true, username: true, name: true } } }
  });
  if (!career) {
    return reply.code(404).send({ error: 'Carreira não encontrada' });
  }
  return career;
});

// Salvar / Atualizar Carreira Solo no Banco de Dados
fastify.post<{
  Body: {
    id?: string;
    name?: string;
    teamId: string;
    difficulty?: string;
    season: number;
    gpIndex: number;
    saveData: any;
  };
}>('/api/careers', async (req, reply) => {
  const { id, name, teamId, difficulty, season, gpIndex, saveData } = req.body;
  const user = req.user;

  if (id) {
    const owner = await prisma.career.findUnique({ where: { id }, select: { userId: true } });
    if (owner && owner.userId !== user.id) return reply.code(403).send({ error: 'Esta carreira pertence a outro usuário.' });
  }

  const serializedSave = typeof saveData === 'string' ? saveData : JSON.stringify(saveData);
  const careerName = name || `Carreira ${teamId.toUpperCase()} (T${season} GP${gpIndex + 1})`;

  let career;
  if (id) {
    career = await prisma.career.upsert({
      where: { id },
      update: {
        name: careerName,
        difficulty: difficulty || 'medio',
        season,
        gpIndex,
        teamId,
        saveData: serializedSave
      },
      create: {
        id,
        userId: user.id,
        name: careerName,
        difficulty: difficulty || 'medio',
        season,
        gpIndex,
        teamId,
        saveData: serializedSave
      }
    });
  } else {
    career = await prisma.career.create({
      data: {
        userId: user.id,
        name: careerName,
        difficulty: difficulty || 'medio',
        season,
        gpIndex,
        teamId,
        saveData: serializedSave
      }
    });
  }

  return reply.code(201).send(career);
});

// Excluir carreira
fastify.delete<{ Params: { id: string } }>('/api/careers/:id', async (req, reply) => {
  const { count } = await prisma.career.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
  if (count === 0) return reply.code(404).send({ error: 'Carreira não encontrada' });
  return { ok: true, message: 'Carreira removida com sucesso' };
});

// ==========================================
// ESPECIFICAÇÃO MULTIPLAYER 1.0 (LIGAS PRIVADAS)
// ==========================================

// Ligas das quais o usuário logado participa (nunca lista ligas de outros)
fastify.get('/api/leagues', async (req) => {
  const leagues = await prisma.league.findMany({
    where: { members: { some: { userId: req.user.id } } },
    orderBy: { updatedAt: 'desc' },
    include: { teams: { where: { userId: req.user.id }, select: { teamId: true } } }
  });
  return leagues.map((l) => ({
    code: l.code,
    name: l.name,
    status: l.status,
    season: l.season,
    gpIndex: l.gpIndex,
    isAdmin: l.adminId === req.user.id,
    teamId: l.teams[0]?.teamId ?? null
  }));
});

// Criar nova Liga Privada
fastify.post<{ Body: { name?: string } }>('/api/leagues', async (req, reply) => {
  try {
    const league = await createLeague(req.user.username, req.body.name);
    return reply.code(201).send(league);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Obter detalhes de uma Liga
fastify.get<{ Params: { code: string } }>('/api/leagues/:code', async (req, reply) => {
  try {
    const league = await getLeagueDetails(req.params.code);
    return league;
  } catch (err: any) {
    return reply.code(404).send({ error: err.message });
  }
});

// Entrar em uma Liga por código
fastify.post<{ Params: { code: string } }>(
  '/api/leagues/:code/join',
  async (req, reply) => {
    try {
      const league = await joinLeague(req.params.code, req.user.username);
      broadcastLeagueEvent(req.params.code.toUpperCase(), { type: 'LEAGUE_UPDATED', league });
      return league;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }
);

// Admin sorteia a ordem de escolha das equipes
fastify.post<{ Params: { code: string } }>('/api/leagues/:code/draw-team-order', async (req, reply) => {
  try {
    const league = await drawTeamOrder(req.params.code, req.user.username);
    broadcastLeagueEvent(req.params.code.toUpperCase(), { type: 'LEAGUE_UPDATED', league });
    return league;
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Escolher equipe na sua vez do Draft de Equipes
fastify.post<{ Params: { code: string }; Body: { teamId: string } }>(
  '/api/leagues/:code/select-team',
  async (req, reply) => {
    const { teamId } = req.body;
    if (!teamId) {
      return reply.code(400).send({ error: 'Equipe é obrigatória.' });
    }

    try {
      const league = await selectTeam(req.params.code, req.user.username, teamId);
      broadcastLeagueEvent(req.params.code.toUpperCase(), { type: 'LEAGUE_UPDATED', league });
      return league;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }
);

// Iniciar o Snake Draft de Pilotos (Admin)
fastify.post<{ Params: { code: string } }>(
  '/api/leagues/:code/start-draft',
  async (req, reply) => {
    try {
      const draftState = await startPilotDraft(req.params.code, req.user.username);
      broadcastLeagueEvent(req.params.code.toUpperCase(), { type: 'DRAFT_STARTED', draftState });
      return draftState;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }
);

// Obter o estado atual do Draft e Pilotos Disponíveis
fastify.get<{ Params: { code: string } }>('/api/leagues/:code/draft', async (req, reply) => {
  try {
    const draftState = await getDraftState(req.params.code);
    return draftState;
  } catch (err: any) {
    return reply.code(404).send({ error: err.message });
  }
});

// Fazer uma escolha no Snake Draft
fastify.post<{ Params: { code: string }; Body: { driverId: string } }>(
  '/api/leagues/:code/draft/pick',
  async (req, reply) => {
    const { driverId } = req.body;
    if (!driverId) {
      return reply.code(400).send({ error: 'Piloto é obrigatório.' });
    }

    try {
      const draftState = await makeDraftPick(req.params.code, req.user.username, driverId);
      broadcastLeagueEvent(req.params.code.toUpperCase(), { type: 'DRAFT_PICK_MADE', draftState });
      return draftState;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }
);

// Salvar Estratégia de Corrida para o próximo GP (bloqueado se isLocked for true)
fastify.post<{
  Params: { code: string };
  Body: {
    setup?: { asas: number; motor: number; freios: number; cambio: number; suspensao: number };
    tacticPace?: 'atacar' | 'equilibrado' | 'conservar';
    strategy?: { compounds: any[]; pitLaps: number[]; risk?: boolean };
  };
}>('/api/leagues/:code/strategy', async (req, reply) => {
  const { setup, tacticPace, strategy } = req.body;

  try {
    const res = await saveTeamRaceStrategy(req.params.code, req.user.username, { setup, tacticPace, strategy });
    return res;
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Carro: trocar peça gasta ou fabricar o próximo nível
fastify.post<{ Params: { code: string; action: string }; Body: { part: string } }>(
  '/api/leagues/:code/car/:action',
  async (req, reply) => {
    const { action } = req.params;
    if (action !== 'replace' && action !== 'fabricate') return reply.code(404).send({ error: 'Ação inválida.' });
    try {
      return await carAction(req.params.code, req.user.id, action, req.body?.part);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }
);

// Fim de semana: treino livre, classificação ao vivo e grid
fastify.get<{ Params: { code: string } }>('/api/leagues/:code/weekend', async (req, reply) => {
  try {
    return await getWeekendState(req.params.code, req.user.id);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

fastify.post<{ Params: { code: string; action: string }; Body: { driverId?: string; setup?: unknown; step?: string } }>(
  '/api/leagues/:code/weekend/:action',
  async (req, reply) => {
    const { code, action } = req.params;
    const driverId = req.body?.driverId ?? '';
    try {
      let result;
      if (action === 'setup') result = await saveDriverSetup(code, req.user.id, driverId, req.body?.setup);
      else if (action === 'practice') result = await runPracticeLap(code, req.user.id, driverId);
      else if (action === 'quali') result = await runQualiLap(code, req.user.id, driverId);
      else if (action === 'advance') {
        const adv = await advanceWeekend(code, req.user.id, (req.body as any)?.step);
        await runSchedulerTick();
        result = adv.step ? { step: adv.step, message: await describeAdvance(adv.step, adv.leagueId!, adv.gpIndex!) } : { step: null, message: 'Nada a avançar.' };
      } else return reply.code(404).send({ error: 'Ação inválida.' });
      if (action !== 'setup') broadcastLeagueEvent(code.toUpperCase(), { type: 'WEEKEND_UPDATED' });
      return result;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }
);

// Patrocínios: ofertas da janela e contratos ativos
fastify.get<{ Params: { code: string } }>('/api/leagues/:code/sponsors', async (req, reply) => {
  try {
    return await getSponsors(req.params.code, req.user.id);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

fastify.post<{ Params: { code: string }; Body: { sponsorId?: string } }>('/api/leagues/:code/sponsors/accept', async (req, reply) => {
  try {
    return await acceptSponsor(req.params.code, req.user.id, String(req.body?.sponsorId ?? ''));
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Mural do paddock: feed, entrevista pós-GP, respostas, mensagens e comunicados
fastify.get<{ Params: { code: string } }>('/api/leagues/:code/paddock', async (req, reply) => {
  try {
    return await getPaddock(req.params.code, req.user.id);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

fastify.post<{ Params: { code: string; action: string }; Body: Record<string, any> }>(
  '/api/leagues/:code/paddock/:action',
  async (req, reply) => {
    const { code, action } = req.params;
    const b = req.body ?? {};
    try {
      let result;
      if (action === 'interview') result = await giveInterview(code, req.user.id, String(b.tone ?? ''), b.targetTeamId ? String(b.targetTeamId) : undefined);
      else if (action === 'reply') result = await replyToCritic(code, req.user.id, String(b.postId ?? ''), String(b.tone ?? ''));
      else if (action === 'message') result = await postMessage(code, req.user.id, String(b.text ?? ''), false);
      else if (action === 'announce') result = await postMessage(code, req.user.id, String(b.text ?? ''), true);
      else return reply.code(404).send({ error: 'Ação inválida.' });
      broadcastLeagueEvent(code.toUpperCase(), { type: 'PADDOCK_UPDATED' });
      return result;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }
);

// Admin encerra a temporada terminada e abre a próxima
fastify.post<{ Params: { code: string } }>('/api/leagues/:code/next-season', async (req, reply) => {
  try {
    const result = await startNextSeason(req.params.code, req.user.id);
    broadcastLeagueEvent(req.params.code.toUpperCase(), { type: 'LEAGUE_UPDATED' });
    return result;
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// P&D: projetos de novas versões das peças
fastify.get<{ Params: { code: string } }>('/api/leagues/:code/rnd', async (req, reply) => {
  try {
    return await getRnd(req.params.code, req.user.id);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

fastify.post<{ Params: { code: string; action: string }; Body: { part?: string; engineers?: number } }>(
  '/api/leagues/:code/rnd/:action',
  async (req, reply) => {
    const { code, action } = req.params;
    const part = String(req.body?.part ?? '');
    const engineers = Number(req.body?.engineers);
    try {
      if (action === 'start') return await startProject(code, req.user.id, part, engineers);
      if (action === 'engineers') return await setProjectEngineers(code, req.user.id, part, engineers);
      if (action === 'cancel') return await cancelProject(code, req.user.id, part);
      if (action === 'extra-shift') return await extraShift(code, req.user.id);
      return reply.code(404).send({ error: 'Ação inválida.' });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }
);

// Mercado de pilotos: livres, propostas entre equipes, rescisões e titulares
fastify.get<{ Params: { code: string } }>('/api/leagues/:code/market', async (req, reply) => {
  try {
    return await getMarket(req.params.code, req.user.id);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

fastify.post<{ Params: { code: string; action: string }; Body: Record<string, any> }>(
  '/api/leagues/:code/market/:action',
  async (req, reply) => {
    const { code, action } = req.params;
    const b = req.body ?? {};
    try {
      let result;
      if (action === 'sign') result = await signFreeAgent(code, req.user.id, String(b.driverId ?? ''), Number(b.salary), b.releaseContractId || undefined);
      else if (action === 'offer') result = await makeOffer(code, req.user.id, String(b.contractId ?? ''), Number(b.fee), Number(b.salary));
      else if (action === 'respond') result = await respondOffer(code, req.user.id, String(b.offerId ?? ''), String(b.action ?? ''), Number(b.counterFee));
      else if (action === 'release') result = await releaseDriver(code, req.user.id, String(b.contractId ?? ''));
      else if (action === 'starters') result = await setStarters(code, req.user.id, String(b.titular1 ?? ''), String(b.titular2 ?? ''));
      else return reply.code(404).send({ error: 'Ação inválida.' });
      broadcastLeagueEvent(code.toUpperCase(), { type: 'MARKET_UPDATED' });
      return result;
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  }
);

// Finanças: livro-caixa da equipe do usuário
fastify.get<{ Params: { code: string } }>('/api/leagues/:code/ledger', async (req, reply) => {
  try {
    return await getTeamLedger(req.params.code, req.user.id);
  } catch (err: any) {
    return reply.code(400).send({ error: err.message });
  }
});

// Listar Resultados de Corridas da Liga
fastify.get<{ Params: { code: string } }>('/api/leagues/:code/results', async (req, reply) => {
  const code = req.params.code.toUpperCase();
  const league = await prisma.league.findUnique({ where: { code } });
  if (!league) return reply.code(404).send({ error: 'Liga não encontrada.' });

  const results = await prisma.leagueRaceResult.findMany({
    where: { leagueId: league.id },
    orderBy: { gpIndex: 'desc' }
  });

  return results.map(r => ({
    id: r.id,
    season: r.season,
    gpIndex: r.gpIndex,
    circuitId: r.circuitId,
    simulatedAt: r.simulatedAt,
    poleDriverId: r.poleDriverId,
    winnerDriverId: r.winnerDriverId,
    fastestLapDriverId: r.fastestLapDriverId,
    safetyCarCount: r.safetyCarCount,
    results: JSON.parse(r.resultsJson),
    events: JSON.parse(r.eventsJson)
  }));
});

// Forçar simulação do GP atual (utilizado para testes rápidos ou pelo admin)
fastify.post<{ Params: { code: string } }>('/api/leagues/:code/simulate-now', async (req, reply) => {
  const code = req.params.code.toUpperCase();
  const league = await prisma.league.findUnique({ where: { code } });
  if (!league) return reply.code(404).send({ error: 'Liga não encontrada.' });
  if (league.adminId !== req.user.id) return reply.code(403).send({ error: 'Apenas o administrador pode forçar a simulação.' });
  if (league.status !== 'SEASON') return reply.code(400).send({ error: 'A liga não está em temporada regular.' });

  try {
    const raceOutput = await simulateScheduledRace(league.id);
    broadcastLeagueEvent(code, { type: 'RACE_SIMULATED', gpIndex: league.gpIndex, raceOutput });
    return { ok: true, message: `GP ${league.gpIndex + 1} simulado com sucesso!`, raceOutput };
  } catch (err: any) {
    return reply.code(500).send({ error: err.message });
  }
});

// ── Equipe técnica e instalações ──────────────────────────────────────────
fastify.get<{ Params: { code: string } }>('/api/leagues/:code/staff', async (req, reply) => {
  try { return await getStaff(req.params.code, req.user.id); }
  catch (err: any) { return reply.code(400).send({ error: err.message }); }
});

fastify.post<{ Params: { code: string }; Body: { staffId: string } }>('/api/leagues/:code/staff/hire', async (req, reply) => {
  try { return await hireStaff(req.params.code, req.user.id, req.body.staffId); }
  catch (err: any) { return reply.code(400).send({ error: err.message }); }
});

fastify.post<{ Params: { code: string }; Body: { facilityId: string } }>('/api/leagues/:code/facilities/upgrade', async (req, reply) => {
  try { return await upgradeFacility(req.params.code, req.user.id, req.body.facilityId); }
  catch (err: any) { return reply.code(400).send({ error: err.message }); }
});

fastify.post<{ Params: { code: string }; Body: { targetLeagueTeamId: string } }>('/api/leagues/:code/espionage', async (req, reply) => {
  try { return await espionage(req.params.code, req.user.id, req.body.targetLeagueTeamId); }
  catch (err: any) { return reply.code(400).send({ error: err.message }); }
});

// Map de conexões ativas WebSocket por código de liga
const leagueSockets = new Map<string, Set<any>>();

function broadcastLeagueEvent(leagueCode: string, payload: any) {
  const sockets = leagueSockets.get(leagueCode);
  if (!sockets) return;
  const msg = JSON.stringify(payload);
  for (const socket of sockets) {
    if (socket.readyState === 1) {
      socket.send(msg);
    }
  }
}

// WebSocket para telemetria, drafts e bate-papo da liga
fastify.register(async function (fastifyInstance) {
  fastifyInstance.get('/ws/league/:code', { websocket: true }, (socket, req) => {
    const params = req.params as { code?: string };
    const leagueCode = params.code?.toUpperCase() || '';

    if (!leagueSockets.has(leagueCode)) {
      leagueSockets.set(leagueCode, new Set());
    }
    leagueSockets.get(leagueCode)!.add(socket);

    socket.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        const sockets = leagueSockets.get(leagueCode);
        if (sockets) {
          const payload = JSON.stringify({ type: 'SYNC_EVENT', sender: leagueCode, data });
          for (const s of sockets) {
            if (s !== socket && s.readyState === 1) {
              s.send(payload);
            }
          }
        }
      } catch (err) {
        socket.send(JSON.stringify({ type: 'ERROR', message: 'Formato inválido' }));
      }
    });

    socket.on('close', () => {
      const sockets = leagueSockets.get(leagueCode);
      if (sockets) {
        sockets.delete(socket);
        if (sockets.size === 0) {
          leagueSockets.delete(leagueCode);
        }
      }
    });
  });
});

// Inicialização do Scheduler periódico em segundo plano (roda a cada 15 segundos)
setInterval(runSchedulerTick, 15000);

const PORT = Number(process.env.PORT) || 3001;

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`🏎️ F1 Manager Server rodando com SQLite/Prisma em http://localhost:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}

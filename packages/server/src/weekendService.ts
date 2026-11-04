import {
  CIRCUITS,
  CarSetup,
  SETUP_PARAMETERS,
  QUALI_RUNS,
  createPRNG,
  driverIdealSetup,
  hashString,
  nextWeekendMilestone,
  practiceLap,
  practiceLapLimit,
  qualiLap,
  qualiStandings
} from '@f1m/core';
import { prisma } from './db.js';
import { readCar } from './carService.js';
import { postPaddock } from './paddockService.js';
import { ensureStaff, getTeamFactors } from './staffService.js';

const H = 3600_000;

// Linha do tempo do GP (T = largada): treino até T−24h, Q1/Q2/Q3 em janelas de 4h, grid em T−12h, trava em T−1h
export function weekendWindows(raceAt: Date) {
  const T = raceAt.getTime();
  return {
    practiceEnd: new Date(T - 24 * H),
    q1End: new Date(T - 20 * H),
    q2End: new Date(T - 16 * H),
    q3End: new Date(T - 12 * H),
    lockAt: new Date(T - 1 * H),
    raceAt
  };
}

export type WeekendPhase = 'practice' | 'q1' | 'q2' | 'q3' | 'grid';

export function weekendPhase(raceAt: Date, now = new Date()): WeekendPhase {
  const w = weekendWindows(raceAt);
  if (now < w.practiceEnd) return 'practice';
  if (now < w.q1End) return 'q1';
  if (now < w.q2End) return 'q2';
  if (now < w.q3End) return 'q3';
  return 'grid';
}

function sessionsDueClosed(raceAt: Date, now = new Date()) {
  const w = weekendWindows(raceAt);
  return [w.q1End, w.q2End, w.q3End].filter((d) => now >= d).length;
}

export function readSetups(team: { setup: string | null }, driverIds: string[], fallback: CarSetup): Record<string, CarSetup> {
  const raw = team.setup ? JSON.parse(team.setup) : {};
  // Formato antigo: um único acerto para a equipe inteira
  const legacy = raw && typeof raw.asas === 'number' ? raw : null;
  return Object.fromEntries(driverIds.map((id) => [id, legacy ?? raw[id] ?? fallback]));
}

function sanitizeSetup(s: any): CarSetup {
  return Object.fromEntries(
    SETUP_PARAMETERS.map((p) => [p, Math.round(Math.max(0, Math.min(100, Number(s?.[p]) || 0)))])
  ) as unknown as CarSetup;
}

// IA chega perto do ideal de cada piloto, com erro de até ±8 por ajuste
function aiSetup(circuitIdx: number, driverId: string, seed: string): CarSetup {
  const ideal = driverIdealSetup(CIRCUITS[circuitIdx % CIRCUITS.length], driverId);
  const rng = createPRNG(hashString(`ai-setup-${seed}-${driverId}`));
  return sanitizeSetup(Object.fromEntries(SETUP_PARAMETERS.map((p) => [p, ideal[p] + (rng.next() * 16 - 8)])));
}

async function loadWeekend(leagueCode: string) {
  const league = await prisma.league.findUnique({
    where: { code: leagueCode.toUpperCase() },
    include: { teams: { include: { drivers: { where: { role: { in: ['titular1', 'titular2'] } } }, user: { select: { id: true, username: true, name: true } } } } }
  });
  if (!league) throw new Error('Liga não encontrada.');
  if (league.status !== 'SEASON' || !league.nextRaceAt) throw new Error('A liga não está em temporada.');
  return league;
}

type LoadedLeague = Awaited<ReturnType<typeof loadWeekend>>;

const circuitOf = (l: { gpIndex: number }) => CIRCUITS[l.gpIndex % CIRCUITS.length];
const allDriverIds = (l: LoadedLeague) => l.teams.flatMap((t) => t.drivers.map((d) => d.driverId));

async function lapsOf(l: LoadedLeague) {
  return prisma.weekendLap.findMany({
    where: { leagueId: l.id, season: l.season, gpIndex: l.gpIndex },
    orderBy: { createdAt: 'asc' }
  });
}

function ownTeam(l: LoadedLeague, userId: string, driverId: string) {
  const team = l.teams.find((t) => t.userId === userId);
  if (!team) throw new Error('Você não gerencia nenhuma equipe nesta liga.');
  const driver = team.drivers.find((d) => d.driverId === driverId);
  if (!driver) throw new Error('Esse piloto não é da sua equipe.');
  return { team, driver };
}

async function recordLap(
  l: LoadedLeague,
  team: LoadedLeague['teams'][number],
  driver: LoadedLeague['teams'][number]['drivers'][number],
  session: 0 | 1 | 2 | 3,
  setup: CarSetup,
  auto: boolean,
  n: number
) {
  const { levels, wear } = readCar(team);
  const car = Object.fromEntries(Object.keys(levels).map((p) => [p, { level: (levels as any)[p], wear: (wear as any)[p] }])) as any;
  const seed = hashString(`${l.id}-S${l.season}-GP${l.gpIndex}-${driver.driverId}-s${session}-${n}`);
  const reading =
    session === 0
      ? practiceLap(car, setup, { ...driver, id: driver.driverId, readBonus: (team as any)._readBonus ?? 0 }, circuitOf(l), seed)
      : qualiLap(car, setup, { ...driver, id: driver.driverId }, circuitOf(l), session, seed);
  return prisma.weekendLap.create({
    data: {
      leagueId: l.id,
      season: l.season,
      gpIndex: l.gpIndex,
      leagueTeamId: team.id,
      driverId: driver.driverId,
      session,
      setupJson: JSON.stringify(setup),
      time: reading.time,
      deleted: !!reading.deleted,
      fit: reading.fit,
      feedbackJson: JSON.stringify(reading.feedback),
      hintsJson: JSON.stringify(reading.hints),
      auto
    }
  });
}

export async function getWeekendState(leagueCode: string, userId: string) {
  const l = await loadWeekend(leagueCode);
  const laps = await lapsOf(l);
  const phase = weekendPhase(l.nextRaceAt!);
  const myTeam = l.teams.find((t) => t.userId === userId) ?? null;
  const circuit = circuitOf(l);
  const ids = allDriverIds(l);
  const qualiLaps = laps.filter((x) => x.session > 0);
  const st = qualiStandings(ids, qualiLaps, l.qualiSession);
  const currentSession = phase === 'q1' ? 1 : phase === 'q2' ? 2 : phase === 'q3' ? 3 : null;

  const timing = l.teams.flatMap((t) =>
    t.drivers.map((d) => ({
      driverId: d.driverId,
      name: d.name,
      leagueTeamId: t.id,
      teamId: t.teamId,
      best: [1, 2, 3].map((s) => (Number.isFinite(st.best(d.driverId, s)) ? st.best(d.driverId, s) : null)),
      out: st.out[d.driverId] ?? null
    }))
  );

  const myDriverIds = myTeam?.drivers.map((d) => d.driverId) ?? [];
  const runsLeft = Object.fromEntries(
    myDriverIds.map((id) => {
      if (!currentSession || st.out[id] || l.qualiSession !== currentSession - 1) return [id, 0];
      const used = qualiLaps.filter((x) => x.driverId === id && x.session === currentSession).length;
      return [id, Math.max(0, QUALI_RUNS[currentSession as 1 | 2 | 3] - used)];
    })
  );

  const simulador = myTeam?.facilities ? JSON.parse(myTeam.facilities).simulador ?? 2 : 2;
  let engineerSkill = 0;
  let aeroBand = 1;
  if (myTeam) {
    await ensureStaff(l.id, myTeam.id, myTeam.teamId, l.season);
    const factors = await getTeamFactors(l.id, myTeam.id, l.season);
    engineerSkill = factors.engineerSkill;
    aeroBand = factors.aeroBand;
    // Injeta readBonus no objeto team para o recordLap usar
    (myTeam as any)._readBonus = factors.readBonus;
  }

  return {
    gpIndex: l.gpIndex,
    season: l.season,
    circuitId: circuit.id,
    phase,
    currentSession,
    qualiSession: l.qualiSession,
    windows: weekendWindows(l.nextRaceAt!),
    isLocked: l.isLocked,
    practiceLimit: practiceLapLimit(simulador, engineerSkill),
    aeroBand,
    practiceUsed: myTeam ? laps.filter((x) => x.session === 0 && x.leagueTeamId === myTeam.id).length : 0,
    setups: myTeam ? readSetups(myTeam, myDriverIds, circuit.idealSetup) : {},
    myLaps: myTeam
      ? laps
          .filter((x) => x.leagueTeamId === myTeam.id)
          .map((x) => ({
            id: x.id,
            driverId: x.driverId,
            session: x.session,
            setup: JSON.parse(x.setupJson),
            time: x.time,
            deleted: x.deleted,
            fit: x.fit,
            feedback: JSON.parse(x.feedbackJson),
            hints: JSON.parse(x.hintsJson),
            auto: x.auto
          }))
      : [],
    timing,
    runsLeft,
    grid: l.gridJson ? JSON.parse(l.gridJson) : st.grid
  };
}

export async function saveDriverSetup(leagueCode: string, userId: string, driverId: string, setup: any) {
  const l = await loadWeekend(leagueCode);
  if (weekendPhase(l.nextRaceAt!) === 'grid') throw new Error('Parque fechado: o acerto fica travado depois da classificação.');
  const { team } = ownTeam(l, userId, driverId);
  const ids = team.drivers.map((d) => d.driverId);
  const setups = readSetups(team, ids, circuitOf(l).idealSetup);
  setups[driverId] = sanitizeSetup(setup);
  await prisma.leagueTeam.update({ where: { id: team.id }, data: { setup: JSON.stringify(setups) } });
  return { ok: true, setup: setups[driverId] };
}

export async function runPracticeLap(leagueCode: string, userId: string, driverId: string) {
  const l = await loadWeekend(leagueCode);
  if (weekendPhase(l.nextRaceAt!) !== 'practice') throw new Error('O treino livre já terminou neste GP.');
  const { team, driver } = ownTeam(l, userId, driverId);
  const used = await prisma.weekendLap.count({
    where: { leagueId: l.id, season: l.season, gpIndex: l.gpIndex, leagueTeamId: team.id, session: 0 }
  });
  const simulador = team.facilities ? JSON.parse(team.facilities).simulador ?? 2 : 2;
  if (used >= practiceLapLimit(simulador)) throw new Error('Acabaram as voltas de treino deste GP.');
  const setup = readSetups(team, [driverId], circuitOf(l).idealSetup)[driverId];
  return recordLap(l, team, driver, 0, setup, false, used);
}

export async function runQualiLap(leagueCode: string, userId: string, driverId: string) {
  const l = await loadWeekend(leagueCode);
  const phase = weekendPhase(l.nextRaceAt!);
  const session = phase === 'q1' ? 1 : phase === 'q2' ? 2 : phase === 'q3' ? 3 : null;
  if (!session) throw new Error('Nenhuma sessão de classificação aberta agora.');
  if (l.qualiSession !== session - 1) throw new Error('A sessão anterior ainda está sendo encerrada. Tente em instantes.');
  const { team, driver } = ownTeam(l, userId, driverId);

  const laps = await lapsOf(l);
  const st = qualiStandings(allDriverIds(l), laps.filter((x) => x.session > 0), l.qualiSession);
  if (st.out[driverId]) throw new Error(`${driver.name} foi eliminado no Q${st.out[driverId]}.`);
  const used = laps.filter((x) => x.driverId === driverId && x.session === session).length;
  if (used >= QUALI_RUNS[session]) throw new Error(`${driver.name} já usou todas as voltas do Q${session}.`);

  const setup = readSetups(team, [driverId], circuitOf(l).idealSetup)[driverId];
  return recordLap(l, team, driver, session, setup, false, used);
}

/**
 * Encerra uma sessão: a IA faz todas as voltas, e piloto humano sem volta na sessão
 * faz uma sozinho com o acerto salvo (como no solo). No fim do Q3 grava o grid.
 */
async function closeSession(l: LoadedLeague, session: 1 | 2 | 3) {
  const laps = await lapsOf(l);
  const st = qualiStandings(allDriverIds(l), laps.filter((x) => x.session > 0), session - 1);
  const circuit = circuitOf(l);

  for (const team of l.teams) {
    const setups = readSetups(team, team.drivers.map((d) => d.driverId), circuit.idealSetup);
    for (const d of team.drivers) {
      if (st.out[d.driverId]) continue;
      const used = laps.filter((x) => x.driverId === d.driverId && x.session === session).length;
      const toRun = team.isAI ? QUALI_RUNS[session] - used : used === 0 ? 1 : 0;
      const setup = team.isAI ? aiSetup(l.gpIndex, d.driverId, `${l.id}-${l.season}-${l.gpIndex}`) : setups[d.driverId];
      for (let n = 0; n < toRun; n++) await recordLap(l, team, d, session, setup, true, used + n);
    }
  }

  const data: { qualiSession: number; gridJson?: string } = { qualiSession: session };
  if (session === 3) {
    const all = await lapsOf(l);
    data.gridJson = JSON.stringify(qualiStandings(allDriverIds(l), all.filter((x) => x.session > 0), 3).grid);
  }
  // Só avança se ninguém encerrou essa sessão antes (scheduler e admin podem coincidir)
  const moved = await prisma.league.updateMany({ where: { id: l.id, qualiSession: session - 1 }, data });
  if (moved.count === 0) return;

  const after = await lapsOf(l);
  const fin = qualiStandings(allDriverIds(l), after.filter((x) => x.session > 0), session);
  const name = (id: string) => l.teams.flatMap((t) => t.drivers).find((d) => d.driverId === id)?.name ?? id;
  const gp = circuitOf(l).gp;
  if (session === 3 && fin.grid) {
    await postPaddock(l.id, l.season, l.gpIndex, 'quali', `⏱️ Pole position de ${name(fin.grid[0])} no ${gp}! Primeira fila completa com ${name(fin.grid[1])}; ${name(fin.grid[2])} larga em 3º.`);
  } else {
    const out = Object.entries(fin.out).filter(([, s]) => s === session).map(([id]) => name(id));
    await postPaddock(l.id, l.season, l.gpIndex, 'quali', `⏱️ Fim do Q${session} no ${gp}. Eliminados: ${out.join(', ')}.`);
  }
}

/** Fecha as sessões cujo horário já passou. Com `all`, fecha todas (corrida forçada pelo admin). */
export async function closeDueSessions(leagueId: string, all = false) {
  for (;;) {
    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { code: true } });
    if (!league) return;
    const l = await loadWeekend(league.code);
    const due = all ? 3 : sessionsDueClosed(l.nextRaceAt!);
    if (l.qualiSession >= due) return;
    await closeSession(l, (l.qualiSession + 1) as 1 | 2 | 3);
  }
}

/** Admin: adianta o relógio do GP até o próximo marco (fim do treino, de cada Q, trava, largada). */
export async function advanceWeekend(leagueCode: string, userId: string, expected?: string) {
  const l = await loadWeekend(leagueCode);
  if (l.adminId !== userId) throw new Error('Apenas o administrador pode adiantar o fim de semana.');
  const now = Date.now();
  const next = nextWeekendMilestone(l.nextRaceAt!, l.gpIndex + 1, now);
  if (!next) return { step: null };
  // Evita avançar dois passos com cliques repetidos: só executa o passo que o admin confirmou
  if (expected && expected !== next.key) throw new Error('A fase já mudou. Confira o novo passo antes de avançar de novo.');
  const shift = next.at.getTime() - now;
  await prisma.league.update({
    where: { id: l.id },
    data: {
      nextRaceAt: new Date(l.nextRaceAt!.getTime() - shift),
      lockedAt: l.lockedAt ? new Date(l.lockedAt.getTime() - shift) : null
    }
  });
  return { step: next.key, label: next.label, gpIndex: l.gpIndex, leagueId: l.id };
}

/** Texto de resultado depois do avanço, para o admin saber o que aconteceu. */
export async function describeAdvance(step: string, leagueId: string, gpIndex: number) {
  const league = await prisma.league.findUnique({ where: { id: leagueId } });
  if (!league) return 'Feito.';
  if (step === 'practiceEnd') return 'Treino livre encerrado. O Q1 está aberto.';
  if (step === 'lockAt') return 'Grid fechado: estratégias travadas até a largada.';
  if (step === 'raceAt') {
    const r = await prisma.leagueRaceResult.findFirst({ where: { leagueId, gpIndex }, orderBy: { simulatedAt: 'desc' } });
    const winner = r && (await prisma.driverContract.findFirst({ where: { driverId: r.winnerDriverId, team: { leagueId } } }));
    const nextGp = league.status === 'ENDED' ? 'Temporada encerrada.' : `Agora é o treino livre do GP ${league.gpIndex + 1}.`;
    return `Corrida do GP ${gpIndex + 1} simulada${winner ? `: vitória de ${winner.name}` : ''}. ${nextGp}`;
  }
  const l = await loadWeekend(league.code);
  const laps = (await lapsOf(l)).filter((x) => x.session > 0);
  const st = qualiStandings(allDriverIds(l), laps, l.qualiSession);
  const name = (id: string) => l.teams.flatMap((t) => t.drivers).find((d) => d.driverId === id)?.name ?? id;
  if (step === 'q3End' && st.grid) return `Q3 encerrado. Pole: ${name(st.grid[0])}. Grid publicado.`;
  const session = step === 'q1End' ? 1 : 2;
  const out = Object.entries(st.out).filter(([, s]) => s === session).map(([id]) => name(id));
  return `Q${session} encerrado. Eliminados: ${out.join(', ') || 'ninguém'}. O Q${session + 1} está aberto.`;
}

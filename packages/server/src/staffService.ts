import {
  STAFF_ROLES,
  STAFF_INFO,
  FACILITIES,
  FACILITY_INFO,
  MAX_FACILITY,
  SPENDING_CAP,
  CAP_KINDS,
  staffSalary,
  facilityUpgradeCost,
  facilityMaintenance,
  staffRndFactor,
  aeroBandFactor,
  engineerReadBonus,
  generateStaffPool,
  startingStaff,
  type StaffRoleId,
  type FacilityId,
  hashString,
  isAeroPart
} from '@f1m/core';
import { prisma } from './db.js';
import { postPaddock } from './paddockService.js';

// ── helpers ────────────────────────────────────────────────────────────────

function facilitiesOf(team: { facilities: string | null }) {
  const f = team.facilities ? JSON.parse(team.facilities) : {};
  return Object.fromEntries(FACILITIES.map((k) => [k, f[k] ?? (k === 'simulador' || k === 'confiabilidade' ? 1 : 2)])) as Record<FacilityId, number>;
}

async function myTeam(code: string, userId: string) {
  const league = await prisma.league.findUnique({ where: { code: code.toUpperCase() } });
  if (!league) throw new Error('Liga não encontrada.');
  const team = await prisma.leagueTeam.findFirst({ where: { leagueId: league.id, userId } });
  if (!team) throw new Error('Você não gerencia nenhuma equipe nesta liga.');
  return { league, team };
}

export async function capUsed(leagueTeamId: string, season: number): Promise<number> {
  const rows = await prisma.ledgerEntry.findMany({
    where: { leagueTeamId, season, kind: { in: CAP_KINDS as string[] }, amount: { lt: 0 } }
  });
  return Math.round(rows.reduce((s, r) => s + Math.abs(r.amount), 0) * 100) / 100;
}

// ── ensure ─────────────────────────────────────────────────────────────────

/** Garante que a equipe tem sua equipe técnica inicial (cria se faltar). */
export async function ensureStaff(leagueId: string, leagueTeamId: string, teamId: string, season: number) {
  const existing = await prisma.staffMember.count({ where: { leagueId, leagueTeamId, season } });
  if (existing > 0) return;
  const candidates = startingStaff(`${leagueId}-${leagueTeamId}`);
  await prisma.staffMember.createMany({
    data: candidates.map((c) => ({
      leagueId,
      leagueTeamId,
      season,
      role: c.role,
      name: c.name,
      skill: c.skill,
      personality: c.personality,
      salary: c.salary
    }))
  });
}

/** Garante que a liga tem um pool de candidatos para a temporada. */
export async function ensurePool(leagueId: string, season: number) {
  const existing = await prisma.staffMember.count({ where: { leagueId, leagueTeamId: null, season } });
  if (existing > 0) return;
  const candidates = generateStaffPool(`pool-${leagueId}-${season}`, 3);
  await prisma.staffMember.createMany({
    data: candidates.map((c) => ({
      leagueId,
      leagueTeamId: null,
      season,
      role: c.role,
      name: c.name,
      skill: c.skill,
      personality: c.personality,
      salary: c.salary
    }))
  });
}

// ── getStaff ───────────────────────────────────────────────────────────────

export async function getStaff(code: string, userId: string) {
  const { league, team } = await myTeam(code, userId);
  await ensureStaff(league.id, team.id, team.teamId, league.season);
  await ensurePool(league.id, league.season);

  const staff = await prisma.staffMember.findMany({
    where: { leagueId: league.id, leagueTeamId: team.id, season: league.season }
  });
  const pool = await prisma.staffMember.findMany({
    where: { leagueId: league.id, leagueTeamId: null, season: league.season }
  });
  const fac = facilitiesOf(team);
  const maintenance = facilityMaintenance(fac);
  const used = await capUsed(team.id, league.season);

  const staffInfo = STAFF_ROLES.map((role) => {
    const member = staff.find((s) => s.role === role) ?? null;
    return {
      role,
      info: STAFF_INFO[role],
      member,
      poolCandidates: pool.filter((p) => p.role === role)
    };
  });

  const facilities = FACILITIES.map((id) => ({
    id,
    info: { name: FACILITY_INFO[id].name, effect: FACILITY_INFO[id].effect(fac[id]) },
    level: fac[id],
    maxLevel: MAX_FACILITY,
    upgradeCost: fac[id] < MAX_FACILITY ? facilityUpgradeCost(fac[id]) : null
  }));

  return {
    staff: staffInfo,
    facilities,
    maintenance,
    cap: { used, limit: SPENDING_CAP }
  };
}

// ── hireStaff ──────────────────────────────────────────────────────────────

/** Janela de mercado para funcionários: dois primeiros GPs de cada temporada. */
function isMarketOpen(gpIndex: number) {
  return gpIndex <= 2;
}

export async function hireStaff(code: string, userId: string, staffId: string) {
  const { league, team } = await myTeam(code, userId);
  if (!isMarketOpen(league.gpIndex)) throw new Error('A janela de contratações de funcionários está fechada. Só é possível contratar nos dois primeiros GPs.');

  const candidate = await prisma.staffMember.findUnique({ where: { id: staffId } });
  if (!candidate || candidate.leagueId !== league.id || candidate.leagueTeamId !== null) {
    throw new Error('Candidato não encontrado no pool desta liga.');
  }

  const role = candidate.role as StaffRoleId;
  const bonus = Math.round(candidate.salary * 2 * 100) / 100; // luvas = 2× salário

  const used = await capUsed(team.id, league.season);
  if (used + bonus > SPENDING_CAP) throw new Error(`Teto de gastos insuficiente. Essa contratação custaria R$ ${bonus.toFixed(1)} mi em luvas.`);
  if (team.budget < bonus) throw new Error(`Orçamento insuficiente para as luvas (R$ ${bonus.toFixed(1)} mi).`);

  // Libera o atual (se houver) de volta ao pool
  const current = await prisma.staffMember.findFirst({
    where: { leagueId: league.id, leagueTeamId: team.id, season: league.season, role }
  });
  if (current) {
    await prisma.staffMember.update({ where: { id: current.id }, data: { leagueTeamId: null } });
  }

  // Contrata o candidato
  await prisma.staffMember.update({ where: { id: staffId }, data: { leagueTeamId: team.id } });
  await prisma.leagueTeam.update({ where: { id: team.id }, data: { budget: { decrement: bonus } } });
  await prisma.ledgerEntry.create({
    data: {
      leagueTeamId: team.id,
      season: league.season,
      gpIndex: league.gpIndex,
      kind: 'instalacao',
      amount: -bonus,
      label: `Luvas: contratação de ${candidate.name} (${STAFF_INFO[role].name})`
    }
  });
  await postPaddock(
    league.id,
    league.season,
    league.gpIndex,
    'equipe',
    `🧑‍🔧 ${STAFF_INFO[role].name} novo na equipe: ${candidate.name} (habilidade ${candidate.skill}).`,
    { leagueTeamId: team.id }
  );
  return { ok: true, message: `${candidate.name} contratado como ${STAFF_INFO[role].name}.` };
}

// ── upgradeFacility ────────────────────────────────────────────────────────

export async function upgradeFacility(code: string, userId: string, facilityId: string) {
  if (!(FACILITIES as readonly string[]).includes(facilityId)) throw new Error('Instalação inválida.');
  const fac_id = facilityId as FacilityId;
  const { league, team } = await myTeam(code, userId);
  if (league.status !== 'SEASON') throw new Error('As instalações só podem ser melhoradas durante a temporada.');

  const fac = facilitiesOf(team);
  if (fac[fac_id] >= MAX_FACILITY) throw new Error('Essa instalação já está no nível máximo.');

  const cost = facilityUpgradeCost(fac[fac_id]);
  const used = await capUsed(team.id, league.season);
  if (used + cost > SPENDING_CAP) throw new Error(`Teto de gastos excedido. Melhoria custaria R$ ${cost.toFixed(1)} mi.`);
  if (team.budget < cost) throw new Error(`Orçamento insuficiente (R$ ${cost.toFixed(1)} mi).`);

  const newLevel = fac[fac_id] + 1;
  fac[fac_id] = newLevel;
  await prisma.leagueTeam.update({
    where: { id: team.id },
    data: { budget: { decrement: cost }, facilities: JSON.stringify(fac) }
  });
  await prisma.ledgerEntry.create({
    data: {
      leagueTeamId: team.id,
      season: league.season,
      gpIndex: league.gpIndex,
      kind: 'instalacao',
      amount: -cost,
      label: `Instalação: ${FACILITY_INFO[fac_id].name} → nível ${newLevel}`
    }
  });
  await postPaddock(
    league.id,
    league.season,
    league.gpIndex,
    'equipe',
    `🏗️ ${FACILITY_INFO[fac_id].name} expandida para o nível ${newLevel}.`,
    { leagueTeamId: team.id }
  );
  return { ok: true, message: `${FACILITY_INFO[fac_id].name} agora no nível ${newLevel}.` };
}

// ── after race ─────────────────────────────────────────────────────────────

/** Cobra salários de funcionários e manutenção das instalações após cada GP. */
export async function staffCostsAfterRace(leagueId: string, season: number, gpIndex: number) {
  const teams = await prisma.leagueTeam.findMany({ where: { leagueId } });
  for (const team of teams) {
    await ensureStaff(leagueId, team.id, team.teamId, season);
    const staff = await prisma.staffMember.findMany({ where: { leagueId, leagueTeamId: team.id, season } });
    const fac = facilitiesOf(team);
    const totalSalary = Math.round(staff.reduce((s, m) => s + m.salary, 0) * 100) / 100;
    const maint = facilityMaintenance(fac);
    const totalCost = Math.round((totalSalary + maint) * 100) / 100;
    if (totalCost <= 0) continue;
    await prisma.leagueTeam.update({ where: { id: team.id }, data: { budget: { decrement: totalCost } } });
    const entries = [];
    if (totalSalary > 0) entries.push({ kind: 'fabricacao', amount: -totalSalary, label: `Salários da equipe técnica (GP ${gpIndex + 1})` });
    if (maint > 0) entries.push({ kind: 'manutencao', amount: -maint, label: `Manutenção das instalações (GP ${gpIndex + 1})` });
    if (entries.length) {
      await prisma.ledgerEntry.createMany({ data: entries.map((e) => ({ ...e, leagueTeamId: team.id, season, gpIndex })) });
    }
  }
}

// ── factors for other services ─────────────────────────────────────────────

/** Busca funcionários de uma equipe e devolve as funções de fator usadas pelos serviços de P&D/treino/corrida. */
export async function getTeamFactors(leagueId: string, leagueTeamId: string, season: number) {
  const staff = await prisma.staffMember.findMany({ where: { leagueId, leagueTeamId, season } });
  const byRole = (role: StaffRoleId) => staff.find((s) => s.role === role) ?? null;
  const dt = byRole('diretorTecnico');
  const aero = byRole('chefeAero');
  const eng = byRole('engenheiroCorrida');
  const box = byRole('chefeBox');
  return {
    staffFor: (part: string) => staffRndFactor(dt ? { skill: dt.skill, personality: dt.personality } : null, aero ? { skill: aero.skill } : null, isAeroPart(part as any)),
    aeroBand: aero ? aeroBandFactor(aero.skill) : 1,
    engineerSkill: eng?.skill ?? 0,
    readBonus: eng ? engineerReadBonus(eng.skill) : 0,
    pitCrew: box?.skill ?? 60
  };
}

// ── AI turn ────────────────────────────────────────────────────────────────

/** IA contrata funcionários e melhora instalações de forma simples. */
export async function aiStaffTurn(leagueId: string, season: number, gpIndex: number) {
  if (!isMarketOpen(gpIndex)) return;
  await ensurePool(leagueId, season);
  const teams = await prisma.leagueTeam.findMany({ where: { leagueId, isAI: true } });
  for (const team of teams) {
    await ensureStaff(leagueId, team.id, team.teamId, season);
    const staff = await prisma.staffMember.findMany({ where: { leagueId, leagueTeamId: team.id, season } });
    const pool = await prisma.staffMember.findMany({ where: { leagueId, leagueTeamId: null, season } });
    let budget = team.budget;
    const used = await capUsed(team.id, season);
    let capLeft = SPENDING_CAP - used;

    // Tenta melhorar um funcionário se houver candidato melhor disponível
    for (const member of staff) {
      const better = pool.filter((p) => p.role === member.role && p.skill > member.skill + 10);
      if (!better.length) continue;
      const best = better.reduce((a, b) => (a.skill > b.skill ? a : b));
      const bonus = Math.round(best.salary * 2 * 100) / 100;
      if (budget < bonus + 5 || capLeft < bonus) continue;
      await prisma.staffMember.update({ where: { id: member.id }, data: { leagueTeamId: null } });
      await prisma.staffMember.update({ where: { id: best.id }, data: { leagueTeamId: team.id } });
      await prisma.leagueTeam.update({ where: { id: team.id }, data: { budget: { decrement: bonus } } });
      await prisma.ledgerEntry.create({ data: { leagueTeamId: team.id, season, gpIndex, kind: 'instalacao', amount: -bonus, label: `IA: contratação de ${best.name}` } });
      budget -= bonus;
      capLeft -= bonus;
    }
  }
}

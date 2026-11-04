import {
  MAX_SECONDARY,
  SEASON_CALENDAR_SIZE,
  SPONSOR_KIND_LABEL,
  TEAMS,
  generateSponsorOffers,
  sponsorAppeal,
  sponsorTargetMet,
  type SponsorTarget
} from '@f1m/core';
import { prisma } from './db.js';
import { postPaddock } from './paddockService.js';

const teamName = (teamId: string) => TEAMS.find((t) => t.id === teamId)?.name ?? teamId;

async function loadLeague(leagueId: string) {
  return prisma.league.findUniqueOrThrow({ where: { id: leagueId }, include: { teams: { include: { drivers: true } } } });
}
type League = Awaited<ReturnType<typeof loadLeague>>;

function standing(l: League, teamId: string) {
  const sorted = [...l.teams].sort((a, b) => b.points - a.points);
  const team = l.teams.find((t) => t.id === teamId)!;
  const wins = team.drivers.reduce((s, d) => s + d.wins, 0);
  const podiums = team.drivers.reduce((s, d) => s + d.podiums, 0);
  const position = sorted.findIndex((t) => t.id === teamId) + 1;
  return { position, appeal: sponsorAppeal(position, l.teams.length, wins, podiums) };
}

async function sign(l: League, sponsorId: string) {
  const s = await prisma.sponsor.update({ where: { id: sponsorId }, data: { status: 'ativo' } });
  // Uma oferta aceita derruba as outras do mesmo tipo que não cabem mais
  if (s.kind === 'master' || s.kind === 'ocasiao') {
    await prisma.sponsor.deleteMany({ where: { leagueTeamId: s.leagueTeamId, status: 'oferta', kind: s.kind } });
  }
  if (s.kind === 'master') {
    const team = l.teams.find((t) => t.id === s.leagueTeamId)!;
    await postPaddock(l.id, l.season, l.gpIndex, 'mercado', `🤝 A ${teamName(team.teamId)} fecha patrocínio master com a ${s.name}.`, { leagueTeamId: team.id });
  }
  return s;
}

/**
 * Renova as ofertas de todas as equipes para o GP atual. A IA assina na hora o que couber.
 * Chamado na abertura de cada GP (após a corrida anterior, no fim do draft e na virada de temporada).
 */
export async function refreshSponsorOffers(leagueId: string) {
  const l = await loadLeague(leagueId);
  if (l.status !== 'SEASON') return;
  await prisma.sponsor.deleteMany({ where: { leagueId, status: 'oferta' } });
  const taken = new Set((await prisma.sponsor.findMany({ where: { leagueId, status: 'ativo' } })).map((s) => s.name));

  for (const team of l.teams) {
    const active = await prisma.sponsor.findMany({ where: { leagueTeamId: team.id, status: 'ativo' } });
    const { position, appeal } = standing(l, team.id);
    const offers = generateSponsorOffers({
      seed: `${l.id}-${team.id}-S${l.season}-GP${l.gpIndex}`,
      appeal,
      position,
      teams: l.teams.length,
      gpsLeft: SEASON_CALENDAR_SIZE - l.gpIndex,
      gpsPerSeason: SEASON_CALENDAR_SIZE,
      needMaster: !active.some((s) => s.kind === 'master'),
      secondarySlots: MAX_SECONDARY - active.filter((s) => s.kind === 'secundario').length,
      taken
    });
    const created = [];
    for (const o of offers) {
      created.push(
        await prisma.sponsor.create({
          data: {
            leagueId,
            leagueTeamId: team.id,
            season: l.season,
            offerGp: l.gpIndex,
            name: o.name,
            size: o.size,
            kind: o.kind,
            target: o.target,
            perGp: o.perGp,
            bonus: o.bonus,
            gpsLeft: o.gps,
            goal: o.goal,
            seasonBonus: o.seasonBonus
          }
        })
      );
    }
    if (!team.isAI) continue;
    // IA: maior master, secundários até o limite e a ação de ocasião
    const master = created.filter((s) => s.kind === 'master').sort((a, b) => b.perGp - a.perGp)[0];
    if (master) await sign(l, master.id);
    let slots = MAX_SECONDARY - active.filter((s) => s.kind === 'secundario').length;
    for (const s of created.filter((x) => x.kind === 'secundario').sort((a, b) => b.perGp + b.bonus - (a.perGp + a.bonus))) {
      if (slots-- <= 0) break;
      await sign(l, s.id);
    }
    const occasion = created.find((s) => s.kind === 'ocasiao');
    if (occasion) await sign(l, occasion.id);
  }
}

export async function getSponsors(code: string, userId: string) {
  const league = await prisma.league.findUnique({ where: { code: code.toUpperCase() } });
  if (!league) throw new Error('Liga não encontrada.');
  const l = await loadLeague(league.id);
  const team = l.teams.find((t) => t.userId === userId);
  if (!team) throw new Error('Você não gerencia nenhuma equipe nesta liga.');
  // Liga criada antes dos patrocínios: gera as ofertas na primeira consulta
  if (l.status === 'SEASON' && !(await prisma.sponsor.count({ where: { leagueTeamId: team.id, offerGp: l.gpIndex, season: l.season } }))) {
    await refreshSponsorOffers(l.id);
  }
  const all = await prisma.sponsor.findMany({ where: { leagueTeamId: team.id, status: { in: ['oferta', 'ativo'] } }, orderBy: { createdAt: 'asc' } });
  return {
    appeal: standing(l, team.id).appeal,
    maxSecondary: MAX_SECONDARY,
    active: all.filter((s) => s.status === 'ativo'),
    offers: all.filter((s) => s.status === 'oferta')
  };
}

export async function acceptSponsor(code: string, userId: string, sponsorId: string) {
  const league = await prisma.league.findUnique({ where: { code: code.toUpperCase() } });
  if (!league) throw new Error('Liga não encontrada.');
  const l = await loadLeague(league.id);
  if (l.isLocked) throw new Error('🔒 Grid fechado: contratos de patrocínio só depois da corrida.');
  const team = l.teams.find((t) => t.userId === userId);
  if (!team) throw new Error('Você não gerencia nenhuma equipe nesta liga.');
  const offer = await prisma.sponsor.findUnique({ where: { id: sponsorId } });
  if (!offer || offer.leagueTeamId !== team.id || offer.status !== 'oferta') throw new Error('Essa oferta não está mais disponível.');
  const active = await prisma.sponsor.findMany({ where: { leagueTeamId: team.id, status: 'ativo' } });
  if (offer.kind === 'master' && active.some((s) => s.kind === 'master')) throw new Error('A equipe já tem um patrocinador master.');
  if (offer.kind === 'secundario' && active.filter((s) => s.kind === 'secundario').length >= MAX_SECONDARY) {
    throw new Error(`Limite de ${MAX_SECONDARY} patrocinadores secundários.`);
  }
  if (offer.kind === 'ocasiao' && active.some((s) => s.kind === 'ocasiao')) throw new Error('Já existe uma ação de ocasião para este GP.');
  await sign(l, offer.id);
  const label = SPONSOR_KIND_LABEL[offer.kind as keyof typeof SPONSOR_KIND_LABEL];
  return { ok: true, message: `${label} ${offer.kind === 'ocasiao' ? 'assinada' : 'assinado'} com a ${offer.name}.` };
}

/** Paga os patrocínios depois da corrida: cota por GP e bônus de meta. */
export async function paySponsorsAfterRace(
  leagueId: string,
  season: number,
  gpIndex: number,
  results: { teamId: string; position: number; retired: boolean }[],
  racingByTeam: Record<string, number>
) {
  const active = await prisma.sponsor.findMany({ where: { leagueId, status: 'ativo' } });
  for (const s of active) {
    const rows = results.filter((r) => r.teamId === s.leagueTeamId);
    const finishes = rows.map((r) => (r.retired ? null : r.position));
    while (finishes.length < (racingByTeam[s.leagueTeamId] ?? 2)) finishes.push(null);
    const met = s.kind !== 'master' && sponsorTargetMet(s.target as SponsorTarget, finishes);
    const amount = Math.round((s.perGp + (met ? s.bonus : 0)) * 100) / 100;
    if (amount > 0) {
      await prisma.leagueTeam.update({ where: { id: s.leagueTeamId }, data: { budget: { increment: amount } } });
      await prisma.ledgerEntry.create({
        data: {
          leagueTeamId: s.leagueTeamId,
          season,
          gpIndex,
          kind: 'patrocinio',
          amount,
          label: `${s.name} (${s.kind === 'master' ? 'master' : s.kind === 'ocasiao' ? 'ocasião' : 'secundário'})${met ? ' + bônus de meta' : ''}`
        }
      });
    }
    const left = s.gpsLeft - 1;
    await prisma.sponsor.update({ where: { id: s.id }, data: { gpsLeft: left, status: left <= 0 || s.kind === 'ocasiao' ? 'encerrado' : 'ativo' } });
  }
}

/** Fim de temporada: master paga o bônus se a equipe terminou na posição combinada ou melhor. */
export async function paySeasonBonuses(leagueId: string, season: number) {
  const l = await loadLeague(leagueId);
  // Masters que valeram nesta temporada: ativos agora ou encerrados durante ela
  const masters = await prisma.sponsor.findMany({
    where: { leagueId, kind: 'master', goal: { not: null }, OR: [{ status: 'ativo' }, { status: 'encerrado', season }] }
  });
  const paid = new Set<string>();
  for (const s of masters) {
    if (paid.has(s.leagueTeamId)) continue;
    const { position } = standing(l, s.leagueTeamId);
    if (s.goal && position <= s.goal && s.seasonBonus > 0) {
      paid.add(s.leagueTeamId);
      await prisma.leagueTeam.update({ where: { id: s.leagueTeamId }, data: { budget: { increment: s.seasonBonus } } });
      await prisma.ledgerEntry.create({
        data: { leagueTeamId: s.leagueTeamId, season, gpIndex: 11, kind: 'patrocinio', amount: s.seasonBonus, label: `${s.name}: bônus de temporada (meta ${s.goal}º, terminou ${position}º)` }
      });
    }
  }
}

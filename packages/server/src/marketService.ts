import {
  MAX_ROSTER,
  MIN_ROSTER,
  NEGOTIATION_ATTEMPTS,
  OFFER_TTL_HOURS,
  aiOwnerAnswer,
  askingSalary,
  createPRNG,
  freeAgentAnswer,
  hashString,
  marketValue,
  releaseCost,
  signingBonus,
  transferAnswer
} from '@f1m/core';
import { TEAMS } from '@f1m/core';
import { prisma } from './db.js';
import { weekendPhase, weekendWindows } from './weekendService.js';

const TITULAR = ['titular1', 'titular2'];
const teamName = (teamId: string) => TEAMS.find((t) => t.id === teamId)?.name ?? teamId;

async function loadLeague(code: string) {
  const league = await prisma.league.findUnique({
    where: { code: code.toUpperCase() },
    include: { teams: { include: { drivers: true, user: { select: { id: true, username: true, name: true } } } } }
  });
  if (!league) throw new Error('Liga não encontrada.');
  return league;
}
type League = Awaited<ReturnType<typeof loadLeague>>;
type Team = League['teams'][number];

// Mercado abre entre as corridas: do fim do GP anterior até o fim do treino livre
function marketWindow(l: League) {
  if (l.status !== 'SEASON' || !l.nextRaceAt) return { open: false, closesAt: null as Date | null, reason: 'O mercado abre na temporada regular.' };
  const open = weekendPhase(l.nextRaceAt) === 'practice' && !l.isLocked;
  return {
    open,
    closesAt: weekendWindows(l.nextRaceAt).practiceEnd,
    reason: open ? '' : 'Mercado fechado durante a classificação e a corrida. Reabre depois do GP.'
  };
}

function requireOpen(l: League) {
  const w = marketWindow(l);
  if (!w.open) throw new Error(w.reason);
  return w;
}

function myTeamOf(l: League, userId: string) {
  const t = l.teams.find((x) => x.userId === userId);
  if (!t) throw new Error('Você não gerencia nenhuma equipe nesta liga.');
  return t;
}

function positionOf(l: League, teamId: string) {
  return [...l.teams].sort((a, b) => b.points - a.points).findIndex((t) => t.id === teamId) + 1;
}

async function event(l: League, kind: string, text: string) {
  await prisma.marketEvent.create({ data: { leagueId: l.id, season: l.season, gpIndex: l.gpIndex, kind, text } });
}

async function ledger(l: League, leagueTeamId: string, kind: string, amount: number, label: string) {
  if (amount === 0) return;
  await prisma.ledgerEntry.create({ data: { leagueTeamId, season: l.season, gpIndex: l.gpIndex, kind, amount, label } });
}

// Débito só acontece se houver saldo no momento da gravação
async function debit(teamId: string, amount: number) {
  if (amount <= 0) return;
  const r = await prisma.leagueTeam.updateMany({ where: { id: teamId, budget: { gte: amount } }, data: { budget: { decrement: amount } } });
  if (r.count === 0) throw new Error(`Orçamento insuficiente (R$ ${amount.toFixed(2)} mi).`);
}

/** Garante dois titulares: promove a reserva se uma vaga de titular ficou aberta. */
async function fixRoles(teamId: string) {
  const drivers = await prisma.driverContract.findMany({ where: { leagueTeamId: teamId }, orderBy: { ger: 'desc' } });
  const has = (r: string) => drivers.some((d) => d.role === r);
  for (const slot of TITULAR) {
    if (has(slot)) continue;
    const reserve = drivers.find((d) => !TITULAR.includes(d.role));
    if (!reserve) break;
    await prisma.driverContract.update({ where: { id: reserve.id }, data: { role: slot } });
    reserve.role = slot;
  }
}

function freeRole(team: Team) {
  const used = team.drivers.map((d) => d.role);
  return TITULAR.find((r) => !used.includes(r)) ?? 'reserva';
}

async function releaseContract(l: League, team: Team, contractId: string, reasonLabel: string) {
  const c = team.drivers.find((d) => d.id === contractId);
  if (!c) throw new Error('Esse piloto não é da sua equipe.');
  const cost = releaseCost(c.salario, c.contractEnds, l.season, l.gpIndex);
  await debit(team.id, cost);
  await ledger(l, team.id, 'rescisao', -cost, `Rescisão: ${c.name}`);
  await prisma.driverContract.delete({ where: { id: c.id } });
  const pool = await prisma.draftPoolDriver.findFirst({ where: { leagueId: l.id, driverId: c.driverId } });
  if (pool) {
    await prisma.draftPoolDriver.update({ where: { id: pool.id }, data: { isDrafted: false, draftedByTeamId: null } });
  } else {
    await prisma.draftPoolDriver.create({
      data: {
        leagueId: l.id, driverId: c.driverId, name: c.name, pot: 2, age: c.age, ger: c.ger, talento: c.talento,
        classificacao: c.classificacao, gestaoPneus: c.gestaoPneus, concentracao: c.concentracao, experiencia: c.experiencia,
        condicionamento: c.condicionamento, agressividade: c.agressividade, potencial: c.potencial, personalidade: c.personalidade,
        signingFee: 0, salario: c.salario, isDrafted: false
      }
    });
  }
  await event(l, 'rescisao', `${teamName(team.teamId)} rescindiu com ${c.name} (${reasonLabel}, multa de R$ ${cost.toFixed(2)} mi).`);
  return cost;
}

// ---------------------------------------------------------------- consulta

export async function getMarket(code: string, userId: string) {
  const l = await loadLeague(code);
  const w = marketWindow(l);
  const me = l.teams.find((t) => t.userId === userId) ?? null;
  const myPos = me ? positionOf(l, me.id) : l.teams.length;

  const pool = await prisma.draftPoolDriver.findMany({ where: { leagueId: l.id, isDrafted: false }, orderBy: { ger: 'desc' } });
  const negotiations = me
    ? await prisma.marketNegotiation.findMany({ where: { leagueTeamId: me.id, season: l.season, gpIndex: l.gpIndex } })
    : [];
  const offers = me
    ? await prisma.transferOffer.findMany({
        where: { leagueId: l.id, OR: [{ fromTeamId: me.id }, { toTeamId: me.id }] },
        include: { driverContract: true },
        orderBy: { createdAt: 'desc' },
        take: 30
      })
    : [];
  const history = await prisma.marketEvent.findMany({ where: { leagueId: l.id }, orderBy: { createdAt: 'desc' }, take: 40 });

  return {
    open: w.open,
    closesAt: w.closesAt,
    reason: w.reason,
    myTeamId: me?.id ?? null,
    myBudget: me?.budget ?? 0,
    rosterLimits: { min: MIN_ROSTER, max: MAX_ROSTER },
    freeAgents: pool.map((p) => {
      const neg = negotiations.find((n) => n.driverId === p.driverId);
      const ask = askingSalary({ ...p, age: p.age }, myPos, l.teams.length);
      return {
        driverId: p.driverId, name: p.name, age: p.age, ger: p.ger, potencial: p.potencial, personalidade: p.personalidade,
        talento: p.talento, classificacao: p.classificacao, gestaoPneus: p.gestaoPneus,
        asking: ask, bonus: signingBonus(ask),
        attemptsLeft: neg ? (neg.closed ? 0 : NEGOTIATION_ATTEMPTS - neg.attempts) : NEGOTIATION_ATTEMPTS
      };
    }),
    contracted: l.teams.flatMap((t) =>
      t.drivers.map((d) => ({
        contractId: d.id, driverId: d.driverId, name: d.name, age: d.age, ger: d.ger, potencial: d.potencial,
        personalidade: d.personalidade, talento: d.talento, classificacao: d.classificacao, gestaoPneus: d.gestaoPneus,
        salario: d.salario, contractEnds: d.contractEnds, role: d.role,
        leagueTeamId: t.id, teamId: t.teamId, isAI: t.isAI, manager: t.user?.name ?? t.user?.username ?? null,
        value: marketValue(d), release: releaseCost(d.salario, d.contractEnds, l.season, l.gpIndex)
      }))
    ),
    offers: offers.map((o) => ({
      id: o.id, status: o.status, fee: o.transferFee, counterFee: o.counterFee, salary: o.offeredSalary,
      expiresAt: o.expiresAt, driverName: o.driverContract.name, contractId: o.driverContractId,
      direction: o.fromTeamId === me?.id ? 'enviada' : 'recebida',
      otherTeam: teamName(l.teams.find((t) => t.id === (o.fromTeamId === me?.id ? o.toTeamId : o.fromTeamId))?.teamId ?? '')
    })),
    history: history.map((h) => ({ id: h.id, gpIndex: h.gpIndex, season: h.season, kind: h.kind, text: h.text, createdAt: h.createdAt }))
  };
}

// ---------------------------------------------------------------- piloto livre

export async function signFreeAgent(code: string, userId: string, driverId: string, salary: number, releaseContractId?: string) {
  const l = await loadLeague(code);
  requireOpen(l);
  const team = myTeamOf(l, userId);
  if (!(salary > 0)) throw new Error('Informe um salário válido.');
  const pool = await prisma.draftPoolDriver.findFirst({ where: { leagueId: l.id, driverId, isDrafted: false } });
  if (!pool) throw new Error('Esse piloto não está livre.');
  if (team.drivers.length >= MAX_ROSTER && !releaseContractId) throw new Error(`Elenco cheio (${MAX_ROSTER} pilotos): escolha quem dá lugar.`);

  const key = { leagueTeamId_driverId_season_gpIndex: { leagueTeamId: team.id, driverId, season: l.season, gpIndex: l.gpIndex } };
  const neg = await prisma.marketNegotiation.upsert({
    where: key,
    update: {},
    create: { leagueId: l.id, leagueTeamId: team.id, driverId, season: l.season, gpIndex: l.gpIndex }
  });
  if (neg.closed || neg.attempts >= NEGOTIATION_ATTEMPTS) throw new Error(`${pool.name} não quer mais conversa com a sua equipe neste GP.`);

  const asking = askingSalary(pool, positionOf(l, team.id), l.teams.length);
  const answer = freeAgentAnswer(salary, asking);
  if (answer.verdict !== 'aceita') {
    const attempts = neg.attempts + 1;
    const closed = answer.verdict === 'ofensiva' || attempts >= NEGOTIATION_ATTEMPTS;
    await prisma.marketNegotiation.update({ where: { id: neg.id }, data: { attempts, closed } });
    const left = closed ? 0 : NEGOTIATION_ATTEMPTS - attempts;
    return {
      ok: false,
      message:
        answer.verdict === 'ofensiva'
          ? `${pool.name} achou a proposta ofensiva e encerrou a conversa.`
          : `${pool.name} recusou: pede R$ ${answer.ask.toFixed(2)} mi por GP. ${left ? `Tentativas restantes: ${left}.` : 'Ele encerrou a conversa.'}`
    };
  }

  const bonus = signingBonus(salary);
  const release = releaseContractId ? team.drivers.find((d) => d.id === releaseContractId) : null;
  if (releaseContractId && !release) throw new Error('Esse piloto não é da sua equipe.');
  const releaseFee = release ? releaseCost(release.salario, release.contractEnds, l.season, l.gpIndex) : 0;
  if (team.budget < bonus + releaseFee) throw new Error(`Orçamento insuficiente: luvas R$ ${bonus.toFixed(2)} mi + rescisão R$ ${releaseFee.toFixed(2)} mi.`);

  // Marca o piloto antes de pagar: se outra equipe fechou ao mesmo tempo, esta desiste
  const claimed = await prisma.draftPoolDriver.updateMany({ where: { id: pool.id, isDrafted: false }, data: { isDrafted: true, draftedByTeamId: team.id } });
  if (claimed.count === 0) throw new Error(`${pool.name} acabou de assinar com outra equipe.`);
  try {
    if (release) await releaseContract(l, team, release.id, `dar lugar a ${pool.name}`);
    await debit(team.id, bonus);
  } catch (err) {
    await prisma.draftPoolDriver.update({ where: { id: pool.id }, data: { isDrafted: false, draftedByTeamId: null } });
    throw err;
  }
  const fresh = await prisma.leagueTeam.findUniqueOrThrow({ where: { id: team.id }, include: { drivers: true } });
  await prisma.driverContract.create({
    data: {
      leagueTeamId: team.id, driverId: pool.driverId, name: pool.name, age: pool.age, ger: pool.ger, talento: pool.talento,
      classificacao: pool.classificacao, gestaoPneus: pool.gestaoPneus, concentracao: pool.concentracao, experiencia: pool.experiencia,
      condicionamento: pool.condicionamento, agressividade: pool.agressividade, potencial: pool.potencial, personalidade: pool.personalidade,
      salario: salary, contractEnds: l.season, role: freeRole(fresh as any)
    }
  });
  await prisma.marketNegotiation.update({ where: { id: neg.id }, data: { closed: true } });
  await ledger(l, team.id, 'luvas', -bonus, `Luvas: ${pool.name}`);
  await fixRoles(team.id);
  await event(l, 'livre', `${teamName(team.teamId)} contratou ${pool.name} (livre) por R$ ${salary.toFixed(2)} mi/GP e luvas de R$ ${bonus.toFixed(2)} mi.`);
  return { ok: true, message: `${pool.name} assinou com a ${teamName(team.teamId)}!` };
}

// ---------------------------------------------------------------- transferência entre equipes

async function concludeTransfer(l: League, offerId: string) {
  const offer = await prisma.transferOffer.findUniqueOrThrow({ where: { id: offerId }, include: { driverContract: true } });
  const fresh = await loadLeague(l.code);
  const buyer = fresh.teams.find((t) => t.id === offer.fromTeamId)!;
  const seller = fresh.teams.find((t) => t.id === offer.toTeamId)!;
  const c = offer.driverContract;
  const fee = offer.counterFee && offer.status === 'COUNTER_ACCEPTED' ? offer.counterFee : offer.transferFee;

  if (seller.drivers.length <= MIN_ROSTER) {
    await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'REJECTED' } });
    return { ok: false, message: `${teamName(seller.teamId)} ficaria com menos de ${MIN_ROSTER} pilotos: contrate uma reposição antes de vender.` };
  }
  if (buyer.drivers.length >= MAX_ROSTER) {
    await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'REJECTED' } });
    return { ok: false, message: `${teamName(buyer.teamId)} já tem ${MAX_ROSTER} pilotos.` };
  }

  const decision = transferAnswer(c, offer.offeredSalary, positionOf(fresh, buyer.id), positionOf(fresh, seller.id));
  if (!decision.accept) {
    await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'DRIVER_REFUSED' } });
    await event(l, 'proposta', `${c.name} recusou ir para a ${teamName(buyer.teamId)}: ${decision.reason}.`);
    return { ok: false, message: `As equipes chegaram a um acordo, mas ${c.name} recusou: ${decision.reason}.` };
  }

  await debit(buyer.id, fee);
  await prisma.leagueTeam.update({ where: { id: seller.id }, data: { budget: { increment: fee } } });
  await ledger(l, buyer.id, 'transferencia', -fee, `Compra de ${c.name} (${teamName(seller.teamId)})`);
  await ledger(l, seller.id, 'transferencia', fee, `Venda de ${c.name} para a ${teamName(buyer.teamId)}`);
  await prisma.driverContract.update({
    where: { id: c.id },
    data: { leagueTeamId: buyer.id, salario: offer.offeredSalary, role: freeRole(buyer) }
  });
  await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'COMPLETED' } });
  await prisma.transferOffer.updateMany({
    where: { driverContractId: c.id, id: { not: offer.id }, status: { in: ['PENDING', 'COUNTER_OFFER'] } },
    data: { status: 'CANCELLED' }
  });
  await fixRoles(seller.id);
  await fixRoles(buyer.id);
  await event(
    l,
    'transferencia',
    `${c.name} trocou a ${teamName(seller.teamId)} pela ${teamName(buyer.teamId)}: multa de R$ ${fee.toFixed(2)} mi e salário de R$ ${offer.offeredSalary.toFixed(2)} mi/GP.`
  );
  return { ok: true, message: `Transferência concluída: ${c.name} agora é da ${teamName(buyer.teamId)}.` };
}

async function aiRespondAsSeller(l: League, offerId: string) {
  const offer = await prisma.transferOffer.findUniqueOrThrow({ where: { id: offerId }, include: { driverContract: true } });
  const seller = l.teams.find((t) => t.id === offer.toTeamId)!;
  const ans = aiOwnerAnswer(offer.transferFee, marketValue(offer.driverContract), seller.drivers.length);
  if (ans.action === 'accept') return concludeTransfer(l, offer.id);
  if (ans.action === 'counter') {
    await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'COUNTER_OFFER', counterFee: ans.fee } });
    return { ok: false, message: `${teamName(seller.teamId)} fez contraproposta: R$ ${ans.fee.toFixed(2)} mi.` };
  }
  await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'REJECTED' } });
  return { ok: false, message: `${teamName(seller.teamId)} recusou: ${ans.reason}.` };
}

export async function makeOffer(code: string, userId: string, contractId: string, fee: number, salary: number) {
  const l = await loadLeague(code);
  const w = requireOpen(l);
  const buyer = myTeamOf(l, userId);
  return createOffer(l, buyer, contractId, fee, salary, w.closesAt!);
}

async function createOffer(l: League, buyer: Team, contractId: string, fee: number, salary: number, closesAt: Date) {
  if (!(fee >= 0) || !(salary > 0)) throw new Error('Informe multa e salário válidos.');
  const seller = l.teams.find((t) => t.drivers.some((d) => d.id === contractId));
  if (!seller) throw new Error('Piloto não encontrado.');
  if (seller.id === buyer.id) throw new Error('Esse piloto já é da sua equipe.');
  if (buyer.budget < fee) throw new Error(`Orçamento insuficiente para a multa (R$ ${fee.toFixed(2)} mi).`);
  if (buyer.drivers.length >= MAX_ROSTER) throw new Error(`Elenco cheio (${MAX_ROSTER} pilotos): rescinda com alguém antes.`);
  const open = await prisma.transferOffer.count({
    where: { driverContractId: contractId, fromTeamId: buyer.id, status: { in: ['PENDING', 'COUNTER_OFFER'] } }
  });
  if (open) throw new Error('Você já tem uma proposta aberta por esse piloto.');

  const expiresAt = new Date(Math.min(Date.now() + OFFER_TTL_HOURS * 3600_000, closesAt.getTime()));
  const offer = await prisma.transferOffer.create({
    data: { leagueId: l.id, driverContractId: contractId, fromTeamId: buyer.id, toTeamId: seller.id, transferFee: fee, offeredSalary: salary, expiresAt }
  });
  const driver = seller.drivers.find((d) => d.id === contractId)!;
  await event(l, 'proposta', `${teamName(buyer.teamId)} fez proposta de R$ ${fee.toFixed(2)} mi por ${driver.name} (${teamName(seller.teamId)}).`);
  if (seller.isAI) return aiRespondAsSeller(l, offer.id);
  return { ok: true, message: `Proposta enviada à ${teamName(seller.teamId)}. Ela tem até ${expiresAt.toLocaleString('pt-BR')} para responder.` };
}

export async function respondOffer(code: string, userId: string, offerId: string, action: string, counterFee?: number) {
  const l = await loadLeague(code);
  requireOpen(l);
  const me = myTeamOf(l, userId);
  const offer = await prisma.transferOffer.findUnique({ where: { id: offerId }, include: { driverContract: true } });
  if (!offer || offer.leagueId !== l.id) throw new Error('Proposta não encontrada.');
  if (offer.expiresAt < new Date()) throw new Error('Essa proposta expirou.');
  const isSeller = offer.toTeamId === me.id;
  const isBuyer = offer.fromTeamId === me.id;

  if (offer.status === 'PENDING' && isSeller) {
    if (action === 'accept') return concludeTransfer(l, offer.id);
    if (action === 'reject') {
      await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'REJECTED' } });
      return { ok: true, message: 'Proposta recusada.' };
    }
    if (action === 'counter') {
      if (!(counterFee! > offer.transferFee)) throw new Error('A contraproposta precisa ser maior que a oferta.');
      await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'COUNTER_OFFER', counterFee } });
      const buyer = l.teams.find((t) => t.id === offer.fromTeamId)!;
      if (buyer.isAI) {
        // IA aceita contraproposta de até 1,5× o valor de mercado, se tiver caixa
        const ok = counterFee! <= marketValue(offer.driverContract) * 1.5 && buyer.budget >= counterFee!;
        if (!ok) {
          await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'REJECTED' } });
          return { ok: false, message: `${teamName(buyer.teamId)} recusou a contraproposta.` };
        }
        await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'COUNTER_ACCEPTED' } });
        return concludeTransfer(l, offer.id);
      }
      return { ok: true, message: 'Contraproposta enviada.' };
    }
  }
  if (offer.status === 'COUNTER_OFFER' && isBuyer) {
    if (action === 'accept') {
      await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'COUNTER_ACCEPTED' } });
      return concludeTransfer(l, offer.id);
    }
    if (action === 'reject') {
      await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'REJECTED' } });
      return { ok: true, message: 'Contraproposta recusada.' };
    }
  }
  if (['PENDING', 'COUNTER_OFFER'].includes(offer.status) && isBuyer && action === 'cancel') {
    await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'CANCELLED' } });
    return { ok: true, message: 'Proposta retirada.' };
  }
  throw new Error('Essa ação não está disponível para esta proposta.');
}

// ---------------------------------------------------------------- elenco

export async function releaseDriver(code: string, userId: string, contractId: string) {
  const l = await loadLeague(code);
  requireOpen(l);
  const team = myTeamOf(l, userId);
  if (team.drivers.length <= MIN_ROSTER) throw new Error(`A equipe precisa de pelo menos ${MIN_ROSTER} pilotos.`);
  const cost = await releaseContract(l, team, contractId, 'decisão da equipe');
  await fixRoles(team.id);
  return { ok: true, message: `Contrato rescindido. Multa de R$ ${cost.toFixed(2)} mi.` };
}

export async function setStarters(code: string, userId: string, titular1: string, titular2: string) {
  const l = await loadLeague(code);
  if (l.status === 'SEASON' && l.nextRaceAt && weekendPhase(l.nextRaceAt) !== 'practice') {
    throw new Error('Os titulares só mudam até o fim do treino livre.');
  }
  const team = myTeamOf(l, userId);
  const ids = team.drivers.map((d) => d.id);
  if (titular1 === titular2 || !ids.includes(titular1) || !ids.includes(titular2)) throw new Error('Escolha dois pilotos diferentes do seu elenco.');
  for (const d of team.drivers) {
    const role = d.id === titular1 ? 'titular1' : d.id === titular2 ? 'titular2' : 'reserva';
    if (role !== d.role) await prisma.driverContract.update({ where: { id: d.id }, data: { role } });
  }
  return { ok: true };
}

// ---------------------------------------------------------------- rotinas

export async function expireOffers() {
  await prisma.transferOffer.updateMany({
    where: { status: { in: ['PENDING', 'COUNTER_OFFER'] }, expiresAt: { lte: new Date() } },
    data: { status: 'EXPIRED' }
  });
}

/** Rodada da IA no mercado, depois de cada GP: completa o elenco e às vezes tenta reforço. */
export async function aiMarketTurn(leagueId: string) {
  const ref = await prisma.league.findUnique({ where: { id: leagueId }, select: { code: true } });
  if (!ref) return;
  let l = await loadLeague(ref.code);
  const w = marketWindow(l);
  if (!w.open) return;
  const rng = createPRNG(hashString(`ai-market-${l.id}-${l.season}-${l.gpIndex}`));

  for (const team of l.teams.filter((t) => t.isAI)) {
    l = await loadLeague(ref.code);
    const me = l.teams.find((t) => t.id === team.id)!;
    try {
      if (me.drivers.length < MIN_ROSTER) {
        const pool = await prisma.draftPoolDriver.findMany({ where: { leagueId: l.id, isDrafted: false }, orderBy: { ger: 'desc' } });
        const pick = pool.find((p) => me.budget - signingBonus(askingSalary(p, positionOf(l, me.id), l.teams.length)) >= 5);
        if (pick) {
          const salary = askingSalary(pick, positionOf(l, me.id), l.teams.length);
          await prisma.draftPoolDriver.update({ where: { id: pick.id }, data: { isDrafted: true, draftedByTeamId: me.id } });
          await debit(me.id, signingBonus(salary));
          await ledger(l, me.id, 'luvas', -signingBonus(salary), `Luvas: ${pick.name}`);
          await prisma.driverContract.create({
            data: {
              leagueTeamId: me.id, driverId: pick.driverId, name: pick.name, age: pick.age, ger: pick.ger, talento: pick.talento,
              classificacao: pick.classificacao, gestaoPneus: pick.gestaoPneus, concentracao: pick.concentracao, experiencia: pick.experiencia,
              condicionamento: pick.condicionamento, agressividade: pick.agressividade, potencial: pick.potencial, personalidade: pick.personalidade,
              salario: salary, contractEnds: l.season, role: freeRole(me)
            }
          });
          await fixRoles(me.id);
          await event(l, 'livre', `${teamName(me.teamId)} contratou ${pick.name} (livre) por R$ ${salary.toFixed(2)} mi/GP.`);
        }
        continue;
      }
      if (rng.next() > 0.25 || me.drivers.length >= MAX_ROSTER) continue;
      const weakest = Math.min(...me.drivers.filter((d) => TITULAR.includes(d.role)).map((d) => d.ger));
      const target = l.teams
        .filter((t) => t.id !== me.id && t.drivers.length > MIN_ROSTER)
        .flatMap((t) => t.drivers)
        .filter((d) => d.ger >= weakest + 4)
        .sort((a, b) => b.ger - a.ger)[0];
      if (!target) continue;
      const fee = Math.round(marketValue(target) * 1.1 * 100) / 100;
      if (me.budget < fee + 5) continue;
      await createOffer(l, me, target.id, fee, Math.round(target.salario * 1.2 * 100) / 100, w.closesAt!);
    } catch (err) {
      console.error(`[Mercado IA] ${teamName(team.teamId)}:`, err);
    }
  }
}

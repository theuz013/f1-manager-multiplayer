import { CIRCUITS, TEAMS, hashString } from '@f1m/core';
import { prisma } from './db.js';

const teamName = (teamId: string) => TEAMS.find((t) => t.id === teamId)?.name ?? teamId;
const MAX_MESSAGE = 280;

export async function postPaddock(
  leagueId: string,
  season: number,
  gpIndex: number,
  kind: string,
  text: string,
  extra: { authorUserId?: string; leagueTeamId?: string; targetTeamId?: string; replyToId?: string } = {}
) {
  return prisma.paddockPost.create({ data: { leagueId, season, gpIndex, kind, text, ...extra } });
}

// Falas variadas, escolhidas de forma determinística para não repetir sempre a mesma
const pick = (options: string[], seed: string) => options[hashString(seed) % options.length];

export const INTERVIEW_TONES = {
  elogiar: 'Elogiar a equipe',
  cobrar: 'Cobrar os pilotos',
  criticar: 'Criticar um rival',
  neutro: 'Resposta neutra'
} as const;

export const REPLY_TONES = {
  rebater: 'Rebater',
  ironizar: 'Ironizar',
  classe: 'Responder com classe'
} as const;

function interviewText(tone: string, manager: string, team: string, target: string | null, best: number | null, gp: string, seed: string) {
  const res = best === null ? 'sem terminar a corrida' : best === 1 ? 'com a vitória' : best <= 3 ? `com pódio (${best}º)` : best <= 10 ? `nos pontos (${best}º)` : `fora dos pontos (${best}º)`;
  if (tone === 'elogiar')
    return pick(
      [
        `🎙️ ${manager} (${team}) sai do ${gp} ${res}: "Orgulho de cada pessoa da fábrica. Esse resultado é de todo mundo."`,
        `🎙️ ${manager} (${team}): "A equipe trabalhou demais nesse fim de semana. Saímos ${res} e vamos buscar mais."`
      ],
      seed
    );
  if (tone === 'cobrar')
    return pick(
      [
        `🎙️ ${manager} (${team}) cobra os pilotos depois do ${gp}: "O carro tinha mais. Espero mais dos dois na próxima."`,
        `🎙️ ${manager} (${team}), ${res}: "Não é o nível que a gente quer. Os pilotos sabem disso."`
      ],
      seed
    );
  if (tone === 'criticar' && target)
    return pick(
      [
        `🎙️ ${manager} (${team}) dispara contra a ${target}: "Eles correm no limite do regulamento. Tem coisa ali que precisa ser olhada."`,
        `🎙️ ${manager} (${team}) provoca a ${target}: "Muito barulho para pouco resultado. Na pista a conversa é outra."`,
        `🎙️ ${manager} (${team}) sobre a ${target}: "Foram desleais na pista hoje. A gente não esquece."`
      ],
      seed
    );
  return pick(
    [`🎙️ ${manager} (${team}) depois do ${gp}: "Um passo de cada vez. Agora é focar na próxima etapa."`, `🎙️ ${manager} (${team}): "Corrida de aprendizado. Temos dados para trabalhar."`],
    seed
  );
}

function replyText(tone: string, manager: string, team: string, critic: string, seed: string) {
  if (tone === 'ironizar')
    return pick(
      [
        `↪️ ${manager} (${team}) responde à ${critic}: "Que bom que eles prestam tanta atenção em nós. Deve ser a vista de trás."`,
        `↪️ ${manager} (${team}): "A ${critic} fala muito. Deve sobrar tempo, já que no pódio não aparecem."`,
        `↪️ ${manager} (${team}) sobre a ${critic}: "Fico lisonjeado. Eles pensam mais em nós do que no próprio carro."`
      ],
      seed
    );
  if (tone === 'classe')
    return pick(
      [
        `↪️ ${manager} (${team}) responde à ${critic}: "Respeito todos os rivais. A resposta a gente dá na pista."`,
        `↪️ ${manager} (${team}): "Não vou entrar nessa. Foco total no nosso trabalho."`,
        `↪️ ${manager} (${team}) sobre a ${critic}: "Cada um cuida da sua garagem. A nossa está tranquila."`
      ],
      seed
    );
  return pick(
    [
      `↪️ ${manager} (${team}) rebate a ${critic}: "Tudo dentro do regulamento. Se tiverem prova, que levem aos comissários."`,
      `↪️ ${manager} (${team}) devolve: "A ${critic} devia se preocupar com o próprio carro."`,
      `↪️ ${manager} (${team}) responde à ${critic}: "Quem perde na pista tenta ganhar no microfone."`
    ],
    seed
  );
}

async function loadLeague(code: string) {
  const league = await prisma.league.findUnique({
    where: { code: code.toUpperCase() },
    include: { teams: { include: { user: { select: { id: true, name: true, username: true } } } } }
  });
  if (!league) throw new Error('Liga não encontrada.');
  return league;
}
type League = Awaited<ReturnType<typeof loadLeague>>;
const managerName = (t: League['teams'][number]) => (t.isAI ? 'O chefe de equipe' : t.user?.name || t.user?.username || '');

/** Última corrida disputada: a entrevista vale para ela até a próxima largada. */
async function lastRace(l: League) {
  return prisma.leagueRaceResult.findFirst({ where: { leagueId: l.id }, orderBy: [{ season: 'desc' }, { gpIndex: 'desc' }] });
}

export async function getPaddock(code: string, userId: string) {
  const l = await loadLeague(code);
  const me = l.teams.find((t) => t.userId === userId) ?? null;
  const [posts, market, race] = await Promise.all([
    prisma.paddockPost.findMany({ where: { leagueId: l.id }, orderBy: { createdAt: 'desc' }, take: 200 }),
    prisma.marketEvent.findMany({ where: { leagueId: l.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    lastRace(l)
  ]);

  let pendingInterview = null;
  if (me && race) {
    const done = posts.some((p) => p.kind === 'entrevista' && p.leagueTeamId === me.id && p.season === race.season && p.gpIndex === race.gpIndex);
    if (!done) {
      const rows: { teamId: string; position: number; retired: boolean }[] = JSON.parse(race.resultsJson);
      const mine = rows.filter((r) => r.teamId === me.id && !r.retired).map((r) => r.position);
      const best = mine.length ? Math.min(...mine) : null;
      const gp = CIRCUITS.find((c) => c.id === race.circuitId)?.gp ?? `GP ${race.gpIndex + 1}`;
      pendingInterview = {
        season: race.season,
        gpIndex: race.gpIndex,
        gp,
        question:
          best === null
            ? `Os dois carros abandonaram o ${gp}. O que aconteceu?`
            : best === 1
            ? `Vitória no ${gp}! Qual o recado depois desse resultado?`
            : best <= 3
            ? `Pódio no ${gp}. A equipe está no caminho certo?`
            : best <= 10
            ? `Pontos no ${gp}. Dava para mais?`
            : `Fora dos pontos no ${gp}. O que falta?`,
        tones: INTERVIEW_TONES
      };
    }
  }

  const replied = new Set(posts.filter((p) => p.kind === 'resposta').map((p) => p.replyToId));
  const pendingReplies = me
    ? posts
        .filter((p) => p.kind === 'entrevista' && p.targetTeamId === me.id && !replied.has(p.id))
        .map((p) => ({ postId: p.id, text: p.text, from: teamName(l.teams.find((t) => t.id === p.leagueTeamId)?.teamId ?? '') }))
    : [];

  const feed = [
    ...posts.map((p) => ({
      id: p.id,
      kind: p.kind,
      text: p.text,
      season: p.season,
      gpIndex: p.gpIndex,
      createdAt: p.createdAt,
      replyToId: p.replyToId,
      teamId: l.teams.find((t) => t.id === p.leagueTeamId)?.teamId ?? null
    })),
    ...market.map((m) => ({ id: m.id, kind: 'mercado', text: m.text, season: m.season, gpIndex: m.gpIndex, createdAt: m.createdAt, replyToId: null, teamId: null }))
  ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return { feed, pendingInterview, pendingReplies, replyTones: REPLY_TONES, isAdmin: l.adminId === userId, myTeamId: me?.id ?? null };
}

export async function giveInterview(code: string, userId: string, tone: string, targetTeamId?: string) {
  const l = await loadLeague(code);
  const me = l.teams.find((t) => t.userId === userId);
  if (!me) throw new Error('Você não gerencia nenhuma equipe nesta liga.');
  if (!(tone in INTERVIEW_TONES)) throw new Error('Escolha uma resposta.');
  const state = await getPaddock(code, userId);
  const iv = state.pendingInterview;
  if (!iv) throw new Error('Não há entrevista pendente agora. Ela abre depois de cada GP.');
  const target = tone === 'criticar' ? l.teams.find((t) => t.id === targetTeamId && t.id !== me.id) : undefined;
  if (tone === 'criticar' && !target) throw new Error('Escolha qual rival criticar.');

  const race = await lastRace(l);
  const rows: { teamId: string; position: number; retired: boolean }[] = race ? JSON.parse(race.resultsJson) : [];
  const mine = rows.filter((r) => r.teamId === me.id && !r.retired).map((r) => r.position);
  const text = interviewText(
    tone,
    managerName(me),
    teamName(me.teamId),
    target ? teamName(target.teamId) : null,
    mine.length ? Math.min(...mine) : null,
    iv.gp,
    `${me.id}-${iv.season}-${iv.gpIndex}-${tone}`
  );
  const post = await postPaddock(l.id, iv.season, iv.gpIndex, 'entrevista', text, {
    authorUserId: userId,
    leagueTeamId: me.id,
    targetTeamId: target?.id
  });

  // A IA não deixa crítica sem resposta
  if (target?.isAI) {
    const tones = Object.keys(REPLY_TONES);
    const t = tones[hashString(post.id) % tones.length];
    await postPaddock(l.id, iv.season, iv.gpIndex, 'resposta', replyText(t, managerName(target), teamName(target.teamId), teamName(me.teamId), `ia-${target.id}-${post.id}`), {
      leagueTeamId: target.id,
      replyToId: post.id
    });
  }
  return { ok: true, message: target ? `Entrevista publicada. A ${teamName(target.teamId)} foi avisada.` : 'Entrevista publicada no mural.' };
}

export async function replyToCritic(code: string, userId: string, postId: string, tone: string) {
  const l = await loadLeague(code);
  const me = l.teams.find((t) => t.userId === userId);
  if (!me) throw new Error('Você não gerencia nenhuma equipe nesta liga.');
  if (!(tone in REPLY_TONES)) throw new Error('Escolha uma resposta.');
  const original = await prisma.paddockPost.findUnique({ where: { id: postId } });
  if (!original || original.leagueId !== l.id || original.targetTeamId !== me.id) throw new Error('Essa crítica não foi para a sua equipe.');
  if (await prisma.paddockPost.count({ where: { replyToId: postId, kind: 'resposta' } })) throw new Error('Você já respondeu.');
  const critic = l.teams.find((t) => t.id === original.leagueTeamId);
  await postPaddock(l.id, original.season, original.gpIndex, 'resposta', replyText(tone, managerName(me), teamName(me.teamId), teamName(critic?.teamId ?? ''), postId + tone), {
    authorUserId: userId,
    leagueTeamId: me.id,
    replyToId: postId
  });
  return { ok: true, message: 'Resposta publicada no mural.' };
}

export async function postMessage(code: string, userId: string, raw: string, asAnnouncement: boolean) {
  const l = await loadLeague(code);
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Escreva uma mensagem.');
  if (text.length > MAX_MESSAGE) throw new Error(`Mensagem muito longa (máximo ${MAX_MESSAGE} caracteres).`);
  const me = l.teams.find((t) => t.userId === userId);
  const member = await prisma.leagueMember.findFirst({ where: { leagueId: l.id, userId } });
  if (!member && !me) throw new Error('Você não participa desta liga.');
  if (asAnnouncement && l.adminId !== userId) throw new Error('Apenas o administrador publica comunicados.');
  // Freio contra spam: uma mensagem a cada 10 segundos por pessoa
  const recent = await prisma.paddockPost.count({ where: { leagueId: l.id, authorUserId: userId, kind: { in: ['mensagem', 'admin'] }, createdAt: { gte: new Date(Date.now() - 10_000) } } });
  if (recent) throw new Error('Aguarde alguns segundos antes de mandar outra mensagem.');
  const user = l.teams.find((t) => t.userId === userId)?.user ?? (await prisma.user.findUnique({ where: { id: userId } }));
  const who = user?.name || user?.username || 'Gerente';
  await postPaddock(l.id, l.season, l.gpIndex, asAnnouncement ? 'admin' : 'mensagem', asAnnouncement ? `📢 Comunicado do administrador: ${text}` : `💬 ${who}${me ? ` (${teamName(me.teamId)})` : ''}: ${text}`, {
    authorUserId: userId,
    leagueTeamId: me?.id
  });
  return { ok: true };
}

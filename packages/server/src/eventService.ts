/**
 * Fase 9 — Eventos ocasionais por equipe.
 * Disparados após cada GP com probabilidade por tipo.
 * Cada evento afeta o orçamento e/ou o paddock de UMA equipe.
 */
import { TEAMS, hashString } from '@f1m/core';
import { prisma } from './db.js';
import { postPaddock } from './paddockService.js';

type EventKind =
  | 'bonus_patrocinio'      // patrocinador extra não-planejado
  | 'dano_fabrica'          // acidente na fábrica, paga R$
  | 'multa_tecnica'         // protesto técnico, paga multa
  | 'bonus_fabricante'      // bônus do fabricante de motor
  | 'roubo_funcionario'     // funcionário vai para concorrente (apenas mensagem, sem custo)
  | 'problema_logistico'    // peças atrasam, +wear em 1 peça aleatória
  | 'oportunidade_peças';   // peças da categoria com desconto (desconto na próxima troca)

interface OccasionalEvent {
  kind: EventKind;
  prob: number; // por GP, por equipe
  budget: (seed: number) => number; // positivo = receita, negativo = custo; 0 = sem efeito financeiro
  ledgerKind: string;
  paddockMsg: (teamName: string, seed: number) => string;
  applyFn?: (leagueTeamId: string, season: number, gpIndex: number, seed: number) => Promise<void>;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

const EVENTS: OccasionalEvent[] = [
  {
    kind: 'bonus_patrocinio',
    prob: 0.12,
    budget: (s) => r2(0.5 + (s % 10) * 0.08),
    ledgerKind: 'patrocinio',
    paddockMsg: (t) => `💰 ${t} recebeu um bônus inesperado de patrocínio após o GP!`
  },
  {
    kind: 'dano_fabrica',
    prob: 0.08,
    budget: (s) => -r2(0.4 + (s % 7) * 0.07),
    ledgerKind: 'instalacao',
    paddockMsg: (t, s) => `🔥 Incidente na fábrica da ${t}: prejuízo de R$ ${r2(0.4 + (s % 7) * 0.07).toFixed(1)} mi.`
  },
  {
    kind: 'multa_tecnica',
    prob: 0.06,
    budget: (s) => -r2(0.3 + (s % 5) * 0.06),
    ledgerKind: 'fabricacao',
    paddockMsg: (t, s) => `⚖️ Protesto técnico: ${t} paga multa de R$ ${r2(0.3 + (s % 5) * 0.06).toFixed(1)} mi aos fiscais.`
  },
  {
    kind: 'bonus_fabricante',
    prob: 0.10,
    budget: (s) => r2(0.3 + (s % 8) * 0.05),
    ledgerKind: 'patrocinio',
    paddockMsg: (t) => `🏭 Fabricante de motor libera bônus de performance para a ${t}.`
  },
  {
    kind: 'roubo_funcionario',
    prob: 0.07,
    budget: () => 0,
    ledgerKind: 'fabricacao',
    paddockMsg: (t) => `🕵️ Rumores: um engenheiro de topo da ${t} estaria sendo sondado por outra equipe.`
  },
  {
    kind: 'problema_logistico',
    prob: 0.09,
    budget: () => 0,
    ledgerKind: 'fabricacao',
    paddockMsg: (t) => `📦 ${t} enfrenta atrasos logísticos: peças chegam com desgaste adicional.`,
    applyFn: async (leagueTeamId) => {
      const team = await prisma.leagueTeam.findUnique({ where: { id: leagueTeamId } });
      if (!team) return;
      const wear = team.carWear ? JSON.parse(team.carWear) : {};
      // Adiciona +10% wear em uma peça aleatória (a mais nova)
      const parts = Object.entries(wear) as [string, number][];
      if (!parts.length) return;
      const [part] = parts.reduce((a, b) => a[1] < b[1] ? a : b);
      wear[part] = Math.min(100, (wear[part] ?? 0) + 10);
      await prisma.leagueTeam.update({ where: { id: leagueTeamId }, data: { carWear: JSON.stringify(wear) } });
    }
  },
  {
    kind: 'oportunidade_peças',
    prob: 0.08,
    budget: (s) => r2(0.2 + (s % 6) * 0.04),
    ledgerKind: 'patrocinio',
    paddockMsg: (t) => `🛠️ ${t} aproveitou lote de peças da categoria: economia extra no almoxarifado.`
  }
];

/**
 * Sorteia e aplica eventos ocasionais para todas as equipes após um GP.
 * Usa seed determinística para ser reproduzível.
 */
export async function triggerOccasionalEvents(leagueId: string, season: number, gpIndex: number) {
  const teams = await prisma.leagueTeam.findMany({ where: { leagueId } });

  for (const team of teams) {
    const teamDef = TEAMS.find((t) => t.id === team.teamId);
    const teamName = teamDef?.name ?? 'Equipe';

    for (const ev of EVENTS) {
      // Seed por equipe + GP + tipo de evento → determinístico mas diferente para cada um
      const seed = hashString(`evt-${leagueId}-${team.id}-s${season}-gp${gpIndex}-${ev.kind}`);
      const roll = (seed % 100) / 100; // 0–1 determinístico

      if (roll >= ev.prob) continue;

      // Seed secundária para o valor do evento
      const valueSeed = hashString(`evtval-${seed}`) % 100;
      const budgetDelta = ev.budget(valueSeed);

      // Aplica efeito financeiro
      if (budgetDelta !== 0) {
        await prisma.leagueTeam.update({
          where: { id: team.id },
          data: { budget: { increment: budgetDelta } }
        });
        await prisma.ledgerEntry.create({
          data: {
            leagueTeamId: team.id,
            season,
            gpIndex,
            kind: ev.ledgerKind,
            amount: budgetDelta,
            label: `Evento: ${ev.kind.replace(/_/g, ' ')}`
          }
        });
      }

      // Aplica efeito especial (ex: desgaste)
      if (ev.applyFn) await ev.applyFn(team.id, season, gpIndex, valueSeed);

      // Post no paddock — visível para todos
      await postPaddock(leagueId, season, gpIndex, 'evento', ev.paddockMsg(teamName, valueSeed), { leagueTeamId: team.id });

      // Máximo 1 evento por equipe por GP para não saturar
      break;
    }
  }
}

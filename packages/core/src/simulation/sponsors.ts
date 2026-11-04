import { createPRNG, hashString } from './physics.js';

// Patrocínios do modo solo (v1.4.4), sem a meta da diretoria: a meta do master é combinada com o próprio patrocinador
export const SPONSOR_BRANDS = {
  global: ['Audemars Piquet', 'Maison Cartelle', 'Veyron Privé', 'Breitling Grand', 'Bulgari Sport', 'Patek Moreau', 'Hublot Racing'],
  nacional: ['Château Valmont', 'Grand Cru Brasil', 'Masseto Premium', 'Villa Rothschild', 'Arca Lumière', 'Domaine Vilamont', 'Tifosi Gioielli'],
  local: ['Atelier Beaumont', 'Cigar Lounge Noir', 'Riviera Yachts', 'Maison Épure', 'Opus Caviar', 'Le Cèdre Spa', 'Velours & Co']
} as const;

export type SponsorSize = keyof typeof SPONSOR_BRANDS;
export type SponsorKind = 'master' | 'secundario' | 'ocasiao';
export type SponsorTarget = 'doisCarros' | 'pontos' | 'top10' | 'top5' | 'podio';

export const SPONSOR_KIND_LABEL: Record<SponsorKind, string> = { master: 'Master', secundario: 'Secundário', ocasiao: 'Ação de ocasião' };
export const SPONSOR_TARGET_LABEL: Record<SponsorTarget, string> = {
  pontos: 'marcar pontos com pelo menos um carro',
  doisCarros: 'terminar a corrida com os dois carros',
  top10: 'colocar os dois carros no top 10',
  top5: 'terminar um carro no top 5',
  podio: 'subir ao pódio'
};
const TARGET_WEIGHT: Record<SponsorTarget, number> = { doisCarros: 0.5, pontos: 0.9, top10: 1.4, top5: 1.8, podio: 2.6 };
const SIZE_FACTOR: Record<SponsorSize, number> = { global: 1.15, nacional: 1, local: 0.85 };
export const MAX_SECONDARY = 3;

export interface SponsorOffer {
  name: string;
  size: SponsorSize;
  kind: SponsorKind;
  target: SponsorTarget;
  perGp: number;
  bonus: number;
  gps: number;
  goal: number | null;
  seasonBonus: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Atratividade comercial 0–100: posição no campeonato e resultados da temporada. */
export function sponsorAppeal(position: number, teams: number, wins: number, podiums: number) {
  return Math.round(clamp(35 + ((teams - position) / Math.max(1, teams - 1)) * 40 + wins * 3 + podiums, 0, 100));
}

function sizeFor(appeal: number, roll: number, kind: SponsorKind): SponsorSize {
  const t = appeal + roll + (kind === 'master' ? 10 : kind === 'ocasiao' ? -10 : 0);
  return t >= 70 ? 'global' : t >= 42 ? 'nacional' : 'local';
}
const reach = (appeal: number, size: SponsorSize) => (0.7 + appeal / 150) * SIZE_FACTOR[size];
const targetsFor = (appeal: number): SponsorTarget[] =>
  appeal >= 70 ? ['top10', 'top5', 'podio'] : appeal >= 45 ? ['pontos', 'top10', 'top5', 'podio'] : ['doisCarros', 'pontos', 'top10', 'top5'];

/**
 * Ofertas da janela atual para uma equipe. `needMaster` e `secondarySlots` dizem o que ainda cabe no contrato dela.
 * Determinístico pela semente (mesma janela, mesmas ofertas).
 */
export function generateSponsorOffers(opts: {
  seed: string;
  appeal: number;
  position: number;
  teams: number;
  gpsLeft: number;
  gpsPerSeason: number;
  needMaster: boolean;
  secondarySlots: number;
  taken: Set<string>;
}): SponsorOffer[] {
  const rng = createPRNG(hashString(opts.seed));
  const range = (a: number, b: number) => a + rng.next() * (b - a);
  const int = (a: number, b: number) => Math.floor(range(a, b + 1));
  const name = (size: SponsorSize) => {
    const free = SPONSOR_BRANDS[size].filter((n) => !opts.taken.has(n));
    const list = free.length ? free : [...SPONSOR_BRANDS[size]];
    const n = list[int(0, list.length - 1)];
    opts.taken.add(n);
    return n;
  };
  const targets = targetsFor(opts.appeal);
  const offers: SponsorOffer[] = [];

  if (opts.needMaster && opts.gpsLeft > 0) {
    for (let i = 0; i < 2; i++) {
      const size = sizeFor(opts.appeal, range(-15, 15), 'master');
      const years = int(1, 3);
      const base = (2.4 * reach(opts.appeal, size) + range(-0.15, 0.25)) * (1.06 - years * 0.04);
      const goal = clamp(opts.position + int(-1, 1), 1, opts.teams);
      offers.push({
        name: name(size),
        size,
        kind: 'master',
        target: 'pontos',
        perGp: r1(base * 0.82),
        bonus: 0,
        gps: opts.gpsLeft + (years - 1) * opts.gpsPerSeason,
        goal,
        seasonBonus: r1(base * (2 + (opts.position - goal) * 0.8))
      });
    }
  }
  for (let i = 0; i < Math.min(3, Math.max(0, opts.secondarySlots + 1)); i++) {
    const size = sizeFor(opts.appeal, range(-15, 15), 'secundario');
    const target = targets[int(0, targets.length - 1)];
    const u = 0.6 * reach(opts.appeal, size) + range(-0.1, 0.15);
    offers.push({
      name: name(size),
      size,
      kind: 'secundario',
      target,
      perGp: r1(u * (1.25 - TARGET_WEIGHT[target] * 0.12) * 0.82),
      bonus: r1(u * TARGET_WEIGHT[target]),
      gps: Math.min(Math.max(1, opts.gpsLeft), int(3, 8)),
      goal: null,
      seasonBonus: 0
    });
  }
  if (opts.gpsLeft > 0) {
    const size = sizeFor(opts.appeal, range(-15, 15), 'ocasiao');
    const pool = targets.filter((t) => t !== 'doisCarros');
    const target = pool[int(0, pool.length - 1)];
    offers.push({
      name: name(size),
      size,
      kind: 'ocasiao',
      target,
      perGp: 0,
      bonus: r1(0.5 * reach(opts.appeal, size) * TARGET_WEIGHT[target] + 0.3),
      gps: 1,
      goal: null,
      seasonBonus: 0
    });
  }
  return offers;
}

/** Meta do patrocinador na corrida. `finishes`: posição de cada carro da equipe (null = abandonou). */
export function sponsorTargetMet(target: SponsorTarget, finishes: (number | null)[]) {
  const done = finishes.filter((p): p is number => p !== null);
  if (target === 'doisCarros') return finishes.length >= 2 && done.length === finishes.length;
  if (target === 'pontos') return done.some((p) => p <= 10);
  if (target === 'top10') return finishes.length >= 2 && done.length === finishes.length && done.every((p) => p <= 10);
  if (target === 'top5') return done.some((p) => p <= 5);
  return done.some((p) => p <= 3);
}

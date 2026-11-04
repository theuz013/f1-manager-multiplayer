// IDs da liga (bot0..bot10) → nomes dos arquivos em /logos e /cars (extraídos do modo solo)
const ASSETS: Record<string, { logo: string; car: string; ar: number }> = {
  bot0: { logo: 'vellaro', car: 'vellaro', ar: 3.103 },
  bot1: { logo: 'mcapex', car: 'mcapex', ar: 3.09 },
  bot2: { logo: 'bluefalcon', car: 'bluefalcon', ar: 3.038 },
  bot3: { logo: 'westbourne', car: 'westbourne', ar: 3.103 },
  bot4: { logo: 'aureston', car: 'aureston', ar: 3.0 },
  bot5: { logo: 'alpino', car: 'alpino', ar: 3.051 },
  bot6: { logo: 'hawkstone', car: 'hawkstone', ar: 3.103 },
  bot7: { logo: '4letters', car: '4letters', ar: 3.038 },
  bot8: { logo: 'caldwell', car: 'caldwell', ar: 3.13 },
  bot9: { logo: 'youngbulls', car: 'ragingbulls', ar: 3.077 },
  bot10: { logo: 'silverarrow', car: 'silver', ar: 3.0 }
};

export function teamAssets(teamId: string) {
  const a = ASSETS[teamId] ?? ASSETS.bot0;
  return { logo: `/logos/${a.logo}.webp`, car: `/cars/${a.car}.webp`, ar: a.ar };
}

export interface TeamDefinition {
  id: string;
  name: string;
  color: string;
  tier: number;
  style: 'agressivo' | 'equilibrado' | 'conservador';
  logo?: string;
}

export const TEAMS: TeamDefinition[] = [
  {
    "id": "bot0",
    "name": "Scuderia Vellaro",
    "color": "#e10600",
    "tier": 8,
    "style": "agressivo",
    "logo": "scuderiavellaro.webp"
  },
  {
    "id": "bot1",
    "name": "McApex GP",
    "color": "#ff7a00",
    "tier": 8,
    "style": "equilibrado",
    "logo": "mcapexgp.webp"
  },
  {
    "id": "bot2",
    "name": "Blue Falcon Racing",
    "color": "#1f3cc4",
    "tier": 7,
    "style": "agressivo",
    "logo": "bluefalconracing.webp"
  },
  {
    "id": "bot3",
    "name": "Westbourne Motorsport",
    "color": "#3d7bff",
    "tier": 7,
    "style": "equilibrado",
    "logo": "westbournemotorsport.webp"
  },
  {
    "id": "bot4",
    "name": "Aureston Racing",
    "color": "#0f6b45",
    "tier": 6,
    "style": "conservador",
    "logo": "aurestonracing.webp"
  },
  {
    "id": "bot5",
    "name": "Alpino F1",
    "color": "#ff2d95",
    "tier": 5,
    "style": "equilibrado",
    "logo": "alpinof1.webp"
  },
  {
    "id": "bot6",
    "name": "Hawkstone Racing",
    "color": "#7b2cff",
    "tier": 5,
    "style": "agressivo",
    "logo": "hawkstoneracing.webp"
  },
  {
    "id": "bot7",
    "name": "4Letters Racing",
    "color": "#d7f20f",
    "tier": 4,
    "style": "conservador",
    "logo": "4lettersracing.webp"
  },
  {
    "id": "bot8",
    "name": "Cadwell Grand Prix",
    "color": "#c9973a",
    "tier": 3.5,
    "style": "equilibrado",
    "logo": "cadwellgrandprix.webp"
  },
  {
    "id": "bot9",
    "name": "Young Bulls GP",
    "color": "#8e1230",
    "tier": 3.5,
    "style": "agressivo",
    "logo": "youngbullsgp.webp"
  },
  {
    "id": "bot10",
    "name": "Silver Arrow Racing",
    "color": "#19c3c7",
    "tier": 6,
    "style": "conservador",
    "logo": "silverarrowracing.webp"
  }
];

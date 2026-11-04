import { CarSetup } from './carParts.js';

export interface CircuitDefinition {
  id: string;
  gp: string;
  circuito: string;
  laps: number;
  baseLap: number;
  potencia: number;
  desgastePneu: number;
  ultrapassagem: number;
  desgastePecas: number;
  pitLoss: number;
  chuva: number;
  idealSetup: CarSetup;
  dica: string;
}

export const CIRCUITS: CircuitDefinition[] = [
  {
    "id": "es",
    "gp": "GP da Espanha",
    "circuito": "Circuito de Montmeló",
    "laps": 66,
    "baseLap": 78,
    "potencia": 0.5,
    "desgastePneu": 1.2,
    "ultrapassagem": 0.6,
    "desgastePecas": 1,
    "pitLoss": 22,
    "chuva": 0.1,
    "idealSetup": {
      "asas": 62,
      "motor": 55,
      "freios": 50,
      "cambio": 50,
      "suspensao": 58
    },
    "dica": "Pista completa, de curvas médias e rápidas. Pede carga aerodinâmica média para alta e castiga os pneus."
  },
  {
    "id": "mc",
    "gp": "GP do Principado",
    "circuito": "Circuito de Monte Carlo",
    "laps": 78,
    "baseLap": 74,
    "potencia": 0.1,
    "desgastePneu": 0.7,
    "ultrapassagem": 0.95,
    "desgastePecas": 1.2,
    "pitLoss": 20,
    "chuva": 0.12,
    "idealSetup": {
      "asas": 95,
      "motor": 35,
      "freios": 40,
      "cambio": 15,
      "suspensao": 25
    },
    "dica": "Rua estreita e lenta: asa no máximo, câmbio bem curto e suspensão macia para as ondulações. Ultrapassar é quase impossível, a classificação decide."
  },
  {
    "id": "ca",
    "gp": "GP do Canadá",
    "circuito": "Circuito da Ilha Notre-Dame",
    "laps": 70,
    "baseLap": 75,
    "potencia": 0.75,
    "desgastePneu": 0.9,
    "ultrapassagem": 0.3,
    "desgastePecas": 1.25,
    "pitLoss": 19,
    "chuva": 0.25,
    "idealSetup": {
      "asas": 30,
      "motor": 72,
      "freios": 35,
      "cambio": 62,
      "suspensao": 45
    },
    "dica": "Retas longas e freadas fortes em chicanes. Pouca asa, motor forte e freio puxado para a frente. Os freios sofrem."
  },
  {
    "id": "at",
    "gp": "GP da Áustria",
    "circuito": "Circuito de Spielberg",
    "laps": 71,
    "baseLap": 66,
    "potencia": 0.7,
    "desgastePneu": 1,
    "ultrapassagem": 0.35,
    "desgastePecas": 1.05,
    "pitLoss": 21,
    "chuva": 0.25,
    "idealSetup": {
      "asas": 38,
      "motor": 70,
      "freios": 55,
      "cambio": 58,
      "suspensao": 55
    },
    "dica": "Volta curta, com subidas e retas. Carga baixa para média e motor forte."
  },
  {
    "id": "gb",
    "gp": "GP da Grã-Bretanha",
    "circuito": "Circuito de Northamptonshire",
    "laps": 52,
    "baseLap": 89,
    "potencia": 0.55,
    "desgastePneu": 1.3,
    "ultrapassagem": 0.4,
    "desgastePecas": 1,
    "pitLoss": 21,
    "chuva": 0.35,
    "idealSetup": {
      "asas": 58,
      "motor": 60,
      "freios": 55,
      "cambio": 62,
      "suspensao": 75
    },
    "dica": "Curvas de altíssima velocidade. Suspensão dura e carga média. Desgaste de pneu alto."
  },
  {
    "id": "hu",
    "gp": "GP da Hungria",
    "circuito": "Circuito de Mogyoród",
    "laps": 70,
    "baseLap": 78,
    "potencia": 0.2,
    "desgastePneu": 1.1,
    "ultrapassagem": 0.85,
    "desgastePecas": 0.95,
    "pitLoss": 21,
    "chuva": 0.15,
    "idealSetup": {
      "asas": 88,
      "motor": 42,
      "freios": 48,
      "cambio": 28,
      "suspensao": 50
    },
    "dica": "Travada e sinuosa, quase um circuito de rua. Muita asa e câmbio curto. Difícil de ultrapassar."
  },
  {
    "id": "be",
    "gp": "GP da Bélgica",
    "circuito": "Circuito das Ardenas",
    "laps": 44,
    "baseLap": 107,
    "potencia": 0.7,
    "desgastePneu": 1.1,
    "ultrapassagem": 0.3,
    "desgastePecas": 1.1,
    "pitLoss": 20,
    "chuva": 0.45,
    "idealSetup": {
      "asas": 35,
      "motor": 74,
      "freios": 52,
      "cambio": 72,
      "suspensao": 62
    },
    "dica": "A volta mais longa do ano. Retas enormes e curvas rápidas como a Eau Rouge: pouca asa, câmbio longo e suspensão firme."
  },
  {
    "id": "it",
    "gp": "GP da Itália",
    "circuito": "Autódromo do Parque Real",
    "laps": 53,
    "baseLap": 82,
    "potencia": 0.95,
    "desgastePneu": 0.85,
    "ultrapassagem": 0.25,
    "desgastePecas": 1.15,
    "pitLoss": 24,
    "chuva": 0.12,
    "idealSetup": {
      "asas": 8,
      "motor": 92,
      "freios": 45,
      "cambio": 90,
      "suspensao": 40
    },
    "dica": "O templo da velocidade. Asa quase zero, motor no máximo e câmbio bem longo."
  },
  {
    "id": "jp",
    "gp": "GP do Japão",
    "circuito": "Circuito de Mie",
    "laps": 53,
    "baseLap": 92,
    "potencia": 0.45,
    "desgastePneu": 1.25,
    "ultrapassagem": 0.65,
    "desgastePecas": 1,
    "pitLoss": 22,
    "chuva": 0.3,
    "idealSetup": {
      "asas": 66,
      "motor": 55,
      "freios": 50,
      "cambio": 55,
      "suspensao": 68
    },
    "dica": "O traçado em oito: sequência de curvas em S que pede carga e suspensão firme. Exige muito dos pilotos."
  },
  {
    "id": "br",
    "gp": "GP do Brasil",
    "circuito": "Autódromo de Interlagos",
    "laps": 71,
    "baseLap": 72,
    "potencia": 0.6,
    "desgastePneu": 1.05,
    "ultrapassagem": 0.3,
    "desgastePecas": 1.05,
    "pitLoss": 21,
    "chuva": 0.4,
    "idealSetup": {
      "asas": 50,
      "motor": 64,
      "freios": 48,
      "cambio": 55,
      "suspensao": 42
    },
    "dica": "Sentido anti-horário, cheio de subidas e ondulações. Carga média e suspensão mais macia. A reta dos boxes favorece ultrapassagens."
  },
  {
    "id": "bh",
    "gp": "GP do Bahrein",
    "circuito": "Circuito de Sakhir",
    "laps": 57,
    "baseLap": 92,
    "potencia": 0.6,
    "desgastePneu": 1.3,
    "ultrapassagem": 0.3,
    "desgastePecas": 1.05,
    "pitLoss": 22,
    "chuva": 0.02,
    "idealSetup": {
      "asas": 45,
      "motor": 66,
      "freios": 45,
      "cambio": 58,
      "suspensao": 50
    },
    "dica": "Freadas fortes e asfalto abrasivo: os pneus traseiros sofrem. Corrida à noite no deserto, chuva quase impossível."
  },
  {
    "id": "au",
    "gp": "GP da Austrália",
    "circuito": "Circuito do Parque Albert",
    "laps": 58,
    "baseLap": 80,
    "potencia": 0.55,
    "desgastePneu": 0.95,
    "ultrapassagem": 0.55,
    "desgastePecas": 1,
    "pitLoss": 19,
    "chuva": 0.15,
    "idealSetup": {
      "asas": 52,
      "motor": 60,
      "freios": 50,
      "cambio": 55,
      "suspensao": 45
    },
    "dica": "Circuito de parque, rápido e com muros perto. Carga média e suspensão mais macia; um erro custa caro."
  },
  {
    "id": "nl",
    "gp": "GP da Holanda",
    "circuito": "Circuito das Dunas",
    "laps": 72,
    "baseLap": 72,
    "potencia": 0.3,
    "desgastePneu": 1.1,
    "ultrapassagem": 0.8,
    "desgastePecas": 1,
    "pitLoss": 21,
    "chuva": 0.3,
    "idealSetup": {
      "asas": 80,
      "motor": 50,
      "freios": 52,
      "cambio": 40,
      "suspensao": 62
    },
    "dica": "Estreita, ondulada e com curvas inclinadas no meio das dunas. Muita carga e suspensão firme; ultrapassar é difícil."
  },
  {
    "id": "az",
    "gp": "GP do Azerbaijão",
    "circuito": "Circuito da Cidade Velha",
    "laps": 51,
    "baseLap": 103,
    "potencia": 0.8,
    "desgastePneu": 0.8,
    "ultrapassagem": 0.3,
    "desgastePecas": 1.15,
    "pitLoss": 20,
    "chuva": 0.05,
    "idealSetup": {
      "asas": 30,
      "motor": 82,
      "freios": 42,
      "cambio": 80,
      "suspensao": 40
    },
    "dica": "Reta de dois quilômetros e um trecho travado junto às muralhas: pouca asa e câmbio longo, sem esquecer das curvas lentas. Safety Car é comum."
  },
  {
    "id": "sg",
    "gp": "GP de Singapura",
    "circuito": "Circuito da Baía",
    "laps": 62,
    "baseLap": 95,
    "potencia": 0.15,
    "desgastePneu": 0.9,
    "ultrapassagem": 0.85,
    "desgastePecas": 1.3,
    "pitLoss": 28,
    "chuva": 0.3,
    "idealSetup": {
      "asas": 92,
      "motor": 40,
      "freios": 42,
      "cambio": 22,
      "suspensao": 30
    },
    "dica": "Rua noturna, quente e longa. Asa no máximo e câmbio curto; freios e pilotos sofrem com o calor. Parar no box custa caro."
  },
  {
    "id": "us",
    "gp": "GP dos Estados Unidos",
    "circuito": "Circuito das Américas",
    "laps": 56,
    "baseLap": 96,
    "potencia": 0.55,
    "desgastePneu": 1.15,
    "ultrapassagem": 0.4,
    "desgastePecas": 1.05,
    "pitLoss": 20,
    "chuva": 0.15,
    "idealSetup": {
      "asas": 58,
      "motor": 62,
      "freios": 52,
      "cambio": 58,
      "suspensao": 48
    },
    "dica": "Um pouco de tudo: subida forte na largada, sequência de curvas rápidas e uma reta longa. O asfalto ondulado pede suspensão mais macia."
  },
  {
    "id": "mx",
    "gp": "GP do México",
    "circuito": "Autódromo dos Irmãos",
    "laps": 71,
    "baseLap": 79,
    "potencia": 0.65,
    "desgastePneu": 0.85,
    "ultrapassagem": 0.4,
    "desgastePecas": 1.2,
    "pitLoss": 22,
    "chuva": 0.1,
    "idealSetup": {
      "asas": 80,
      "motor": 75,
      "freios": 48,
      "cambio": 60,
      "suspensao": 45
    },
    "dica": "Na altitude o ar é rarefeito: mesmo com asa no máximo o carro tem pouca carga, e o motor sofre para respirar. Reta enorme para o vácuo."
  },
  {
    "id": "ae",
    "gp": "GP de Abu Dhabi",
    "circuito": "Circuito da Ilha",
    "laps": 58,
    "baseLap": 86,
    "potencia": 0.6,
    "desgastePneu": 0.8,
    "ultrapassagem": 0.45,
    "desgastePecas": 1,
    "pitLoss": 21,
    "chuva": 0.01,
    "idealSetup": {
      "asas": 50,
      "motor": 64,
      "freios": 50,
      "cambio": 60,
      "suspensao": 52
    },
    "dica": "Corrida ao entardecer: duas retas longas e um setor final travado. Carga média; os pneus duram bastante."
  }
];

export const SEASON_CALENDAR_SIZE = 12; // Kg = 12 GPs por temporada

import { CarPart, CarSetup } from '../constants/carParts.js';

export type DriverRole = 'titular' | 'reserva' | 'promessa' | 'livre';

export interface Driver {
  id: string;
  name: string;
  age: number;
  talento: number;         // 1-99
  classificacao: number;   // habilidade de volta rápida
  potencial: number;       // teto de evolução
  consistencia?: number;
  ritmo?: number;
  gestaoPneus?: number;
  chuva?: number;
  moral: number;           // 0-100
  salario: number;         // R$ milhões por GP
  contratoAte: number;     // Temporada de término
  teamId: string;
  role?: DriverRole;
  isGenerational?: boolean;
  titles?: number;
  wins?: number;
  podiums?: number;
  points?: number;
  retired?: boolean;
}

export type StaffRole = 'diretorTecnico' | 'chefeAero' | 'engenheiroCorrida' | 'chefeBox';

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  habilidade: number;      // 1-99
  salario: number;         // R$ milhões por GP
  contratoAte: number;
  teamId: string;
}

export interface CarPartStatus {
  level: number;           // 1-10
  wear: number;            // 0-100 (%)
}

export type CarPartsMap = Record<CarPart, CarPartStatus>;

export interface TeamFacilities {
  pesquisa: number;        // nível 1-5
  tunel: number;           // nível 1-5
  fabrica: number;         // nível 1-5
  simulador: number;       // nível 1-5
}

export interface Team {
  id: string;
  name: string;
  color: string;
  isPlayer: boolean;
  style: 'agressivo' | 'equilibrado' | 'conservador';
  car: CarPartsMap;
  budget: number;          // R$ milhões
  cash: number;            // Caixa líquido atual
  reputacao: number;       // 1-100
  driverIds: string[];
  staffIds?: string[];
  facilities: TeamFacilities;
}

export interface PracticeLap {
  driverId: string;
  lapNumber: number;
  time: number;            // segundos
  setup: CarSetup;
  feedback: string[];
  fit?: number;            // 0-100% de precisão do acerto
}

export interface QualifyingEntry {
  driverId: string;
  teamId: string;
  gridPosition: number;
  q1?: number;
  q2?: number;
  q3?: number;
  bestTime: number;
}

export interface RaceDriverResult {
  driverId: string;
  teamId: string;
  position: number;
  gridPosition: number;
  points: number;
  totalTime: number;
  fastestLap: boolean;
  retired: boolean;
  retireReason?: string;
  stops: number;
}

export interface GrandPrixResult {
  gpIndex: number;
  circuitId: string;
  driverResults: RaceDriverResult[];
  constructorPoints: Record<string, number>;
}

export interface FinancialEntry {
  id: string;
  season: number;
  gpIndex: number;
  kind: 'premio' | 'patrocinio' | 'salario' | 'pesquisa' | 'fabricacao' | 'multa' | 'investimento' | 'outros';
  amount: number;          // Positivo = receita, negativo = despesa
  label: string;
}

export interface BoardExpectation {
  position: number;        // Alvo no campeonato de construtores
  text: string;
  confidence: number;      // 0-100%
  patience: number;
  legacyProtected?: boolean;
}

export interface GameSave {
  version: 5;
  seed: number;
  season: number;
  gpIndex: number;
  stage: 'preparacao' | 'corrida' | 'fim';
  weekend: boolean;
  trackOrder: string[];    // IDs dos 12 circuitos da temporada
  teams: Team[];
  drivers: Driver[];
  freeAgents: Driver[];
  academy: Driver[];
  staff: StaffMember[];
  staffMarket: StaffMember[];
  facilities: TeamFacilities;
  board: BoardExpectation;
  ledger: FinancialEntry[];
  practice: PracticeLap[];
  quali: {
    stage: 'q1' | 'q2' | 'q3' | 'done';
    grid: QualifyingEntry[];
  } | null;
  lastResult: GrandPrixResult | null;
  history: GrandPrixResult[];
}


import { CarSetup } from '../constants/carParts.js';
import { CarPartsMap } from '../types/index.js';
import { CircuitDefinition } from '../constants/circuits.js';
import { createPRNG, calculateLapTime, F1_POINTS, GP_PRIZE_MONEY } from './physics.js';
import { TireCompound, TIRE_SPECS, calculateTirePaceLoss, calculateWeatherTirePenalty, getTrackCondition } from './tires.js';
import { simulateQualifying, SimQualifyingEntry } from './qualifying.js';

export interface RaceDriverConfig {
  driver: {
    id: string;
    name: string;
    talento: number;
    classificacao: number;
    experiencia: number;
    concentracao: number;
    gestaoPneus: number;
    agressividade: number;
    moral?: number;
    personalidade?: string;
  };
  car: CarPartsMap;
  setup: CarSetup;
  teamId: string;
  strategy: {
    compounds: TireCompound[];
    pitLaps: number[];
    risk?: boolean;
    initialPace?: 'atacar' | 'equilibrado' | 'conservar';
  };
  pitCrew?: number; // habilidade do chefe de box (paradas mais rápidas e regulares)
}

export interface RaceEvent {
  lap: number;
  time: number;
  kind: 'largada' | 'box' | 'ultrapassagem' | 'colisao' | 'safetyCar' | 'quebra' | 'penalidade' | 'voltaRapida';
  text: string;
  driverIds: string[];
}

export interface DriverRaceResult {
  position: number;
  driverId: string;
  teamId: string;
  gridPosition: number;
  totalTime: number;
  gap: string;
  points: number;
  prizeMoney: number;
  fastestLap: boolean;
  stops: number;
  retired: boolean;
  retireReason?: string;
}

export interface RaceSimulationOutput {
  trackId: string;
  seed: number;
  totalLaps: number;
  finishOrder: string[];
  results: DriverRaceResult[];
  constructorPoints: Record<string, number>;
  events: RaceEvent[];
  weather: number[];
  fastestLap: {
    driverId: string;
    time: number;
    lap: number;
  } | null;
  safetyCarLaps: number[];
}

export function generateWeather(circuit: CircuitDefinition, seed: number): number[] {
  const rng = createPRNG(seed ^ 49421);
  const laps = circuit.laps;
  const weather = new Array(laps + 1).fill(0);
  const willRain = rng.chance(circuit.chuva);

  if (willRain) {
    const rainStart = Math.round(laps * rng.range(0.15, 0.7));
    const rainEnd = Math.min(laps, rainStart + Math.round(laps * rng.range(0.1, 0.35)));
    const rainIntensity = rng.range(0.3, 0.95);

    let cur = 0;
    for (let lap = 1; lap <= laps; lap++) {
      if (lap >= rainStart && lap <= rainEnd) {
        cur = Math.min(rainIntensity, cur + 0.08);
      } else {
        cur = Math.max(0, cur - 0.06);
      }
      weather[lap] = Math.round(cur * 100) / 100;
    }
  }
  return weather;
}

/**
 * Motor completo de simulação de Grande Prêmio (head-to-head / lap-by-lap)
 */
export function simulateGrandPrix(
  configs: RaceDriverConfig[],
  circuit: CircuitDefinition,
  seed: number,
  presetGrid?: string[]
): RaceSimulationOutput {
  const rng = createPRNG(seed);
  const eventRng = createPRNG(seed ^ 31745);
  const events: RaceEvent[] = [];
  const safetyCarLaps: number[] = [];

  // 1. Sessão de Classificação para definir o grid inicial
  const qualiEntries: SimQualifyingEntry[] = configs.map(c => ({
    driver: c.driver,
    car: c.car,
    setup: c.setup,
    teamId: c.teamId
  }));
  // Grid vindo da classificação jogada; sem ele, o motor classifica sozinho
  const validGrid = presetGrid && presetGrid.length === configs.length && configs.every(c => presetGrid.includes(c.driver.id));
  const quali = { grid: validGrid ? presetGrid : simulateQualifying(qualiEntries, circuit, seed).grid };

  // 2. Previsão de Clima da Corrida
  const weather = generateWeather(circuit, seed);

  // 3. Inicialização dos carros na pista
  const driversMap = new Map(configs.map(c => [c.driver.id, c]));
  
  interface CarRuntime {
    config: RaceDriverConfig;
    gridPos: number;
    compound: TireCompound;
    tyreAge: number;
    pitStopCount: number;
    cumulativeTime: number;
    out: boolean;
    outReason?: string;
    pace: 'atacar' | 'equilibrado' | 'conservar';
  }

  const grid: CarRuntime[] = quali.grid.map((driverId, idx) => {
    const cfg = driversMap.get(driverId)!;
    // Pequeno atraso na largada dependente da posição e experiência
    const launchDelay = idx * 0.3 + Math.abs(rng.gauss()) * 0.5 * (1.2 - cfg.driver.experiencia / 100);
    return {
      config: cfg,
      gridPos: idx + 1,
      compound: cfg.strategy.compounds[0] || 'medio',
      tyreAge: 0,
      pitStopCount: 0,
      cumulativeTime: launchDelay,
      out: false,
      pace: cfg.strategy.initialPace || 'equilibrado'
    };
  });

  events.push({
    lap: 1,
    time: 0,
    kind: 'largada',
    text: `Luzes apagadas! Largada para o ${circuit.gp}. ${configs.find(c => c.driver.id === quali.grid[0])?.driver.name} larga na pole position.`,
    driverIds: [quali.grid[0]]
  });

  let fastestLapRecord: { driverId: string; time: number; lap: number } | null = null;
  let safetyCarActive = false;
  let safetyCarRemaining = 0;

  // 4. Loop Volta a Volta da Corrida
  for (let lap = 1; lap <= circuit.laps; lap++) {
    const currentRain = weather[lap] || 0;
    const trackCond = getTrackCondition(currentRain);

    // Gestão do Safety Car
    if (safetyCarActive) {
      safetyCarRemaining--;
      if (safetyCarRemaining <= 0) {
        safetyCarActive = false;
        events.push({
          lap,
          time: 0,
          kind: 'safetyCar',
          text: `Safety Car recolhido aos boxes. Corrida reiniciada na volta ${lap}!`,
          driverIds: []
        });
      } else {
        safetyCarLaps.push(lap);
      }
    }

    // Processamento de cada piloto nesta volta
    for (const car of grid) {
      if (car.out) continue;

      const d = car.config.driver;
      car.tyreAge++;

      // Parada de Box Planejada ou por Clima
      const plannedPit = car.config.strategy.pitLaps.includes(lap);
      const isWetCompound = car.compound === 'intermediario' || car.compound === 'chuva';
      const needsRainTires = (trackCond === 'chuva' && car.compound !== 'chuva') ||
                             (trackCond === 'intermediario' && !isWetCompound);
      const needsSlickTires = trackCond === 'seco' && isWetCompound;

      if (plannedPit || needsRainTires || needsSlickTires) {
        car.pitStopCount++;
        const nextCompoundIndex = Math.min(car.pitStopCount, car.config.strategy.compounds.length - 1);
        
        let targetCompound = car.config.strategy.compounds[nextCompoundIndex] || 'duro';
        if (trackCond === 'chuva') targetCompound = 'chuva';
        else if (trackCond === 'intermediario') targetCompound = 'intermediario';
        else if (trackCond === 'seco' && (targetCompound === 'chuva' || targetCompound === 'intermediario')) {
          targetCompound = 'medio';
        }

        car.compound = targetCompound;
        car.tyreAge = 0;
        const crew = car.config.pitCrew ?? 60;
        const pitLoss = circuit.pitLoss + (safetyCarActive ? -8 : 0) + (60 - crew) * 0.03 + rng.range(-0.5, 0.8 * (1.3 - crew / 100));
        car.cumulativeTime += pitLoss;

        events.push({
          lap,
          time: Math.round(car.cumulativeTime),
          kind: 'box',
          text: `${d.name} entra nos boxes na volta ${lap} e troca para pneus ${TIRE_SPECS[car.compound].label} (+${pitLoss.toFixed(1)}s).`,
          driverIds: [d.id]
        });
      }

      // Cálculo do Tempo da Volta
      const baseLap = calculateLapTime(car.config.car, car.config.setup, d, circuit);
      const tyrePaceLoss = calculateTirePaceLoss(car.compound, car.tyreAge, 1 - (d.gestaoPneus - 50) / 250, circuit.desgastePneu);
      const weatherPenalty = calculateWeatherTirePenalty(car.compound, currentRain);
      
      const paceModifier = car.pace === 'atacar' ? -0.3 : car.pace === 'conservar' ? 0.35 : 0;
      const lapTime = (safetyCarActive ? circuit.baseLap * 1.35 : baseLap) + tyrePaceLoss + weatherPenalty + paceModifier + rng.gauss() * 0.22;

      car.cumulativeTime += lapTime;

      // Registro de Melhor Volta
      if (!safetyCarActive && (!fastestLapRecord || lapTime < fastestLapRecord.time)) {
        fastestLapRecord = { driverId: d.id, time: Math.round(lapTime * 1000) / 1000, lap };
      }

      // Risco de Falha Mecânica
      const carParts = Object.values(car.config.car) as { level: number; wear: number }[];
      const avgWear = carParts.reduce((acc, p) => acc + (p?.wear || 0), 0) / carParts.length;
      if (avgWear > 75 && eventRng.chance(0.003 + (avgWear - 75) * 0.0006)) {
        car.out = true;
        car.outReason = 'Problema de Confiabilidade';
        events.push({
          lap,
          time: Math.round(car.cumulativeTime),
          kind: 'quebra',
          text: `💥 ${d.name} abandonou a corrida na volta ${lap} com falha mecânica!`,
          driverIds: [d.id]
        });
      }
    }

    // Verificação de Toques e Safety Car
    if (!safetyCarActive && lap < circuit.laps - 3) {
      if (eventRng.chance(0.015)) {
        const activeCars = grid.filter(c => !c.out);
        if (activeCars.length >= 2) {
          const victim = eventRng.pick(activeCars);
          victim.out = true;
          victim.outReason = 'Colisão / Acidente';
          safetyCarActive = true;
          safetyCarRemaining = eventRng.int(3, 5);

          events.push({
            lap,
            time: Math.round(victim.cumulativeTime),
            kind: 'colisao',
            text: `⚠️ Acidente com ${victim.config.driver.name}! Safety Car na pista na volta ${lap}.`,
            driverIds: [victim.config.driver.id]
          });
        }
      }
    }
  }

  // 5. Ordem Final e Pontuação
  const activeFinished = grid.filter(c => !c.out).sort((a, b) => a.cumulativeTime - b.cumulativeTime);
  const retiredCars = grid.filter(c => c.out);
  const finalOrder = [...activeFinished, ...retiredCars];
  const leaderTime = activeFinished[0]?.cumulativeTime || 0;

  const constructorPoints: Record<string, number> = {};
  const results: DriverRaceResult[] = finalOrder.map((car, idx) => {
    const isTop10 = idx < 10 && !car.out;
    let points = isTop10 ? F1_POINTS[idx] : 0;
    
    // Ponto extra da volta mais rápida se terminar no top 10
    const hasFastestLap = fastestLapRecord?.driverId === car.config.driver.id && isTop10;
    if (hasFastestLap) {
      points += 1;
    }

    const prize = isTop10 ? GP_PRIZE_MONEY[idx] : 0.8;
    const teamId = car.config.teamId;
    constructorPoints[teamId] = (constructorPoints[teamId] || 0) + points;

    let gapStr = 'DNF';
    if (!car.out) {
      if (idx === 0) gapStr = 'Líder';
      else gapStr = `+${(car.cumulativeTime - leaderTime).toFixed(3)}s`;
    }

    return {
      position: idx + 1,
      driverId: car.config.driver.id,
      teamId,
      gridPosition: car.gridPos,
      totalTime: Math.round(car.cumulativeTime * 1000) / 1000,
      gap: gapStr,
      points,
      prizeMoney: prize,
      fastestLap: hasFastestLap,
      stops: car.pitStopCount,
      retired: car.out,
      retireReason: car.outReason
    };
  });

  return {
    trackId: circuit.id,
    seed,
    totalLaps: circuit.laps,
    finishOrder: finalOrder.map(c => c.config.driver.id),
    results,
    constructorPoints,
    events,
    weather,
    fastestLap: fastestLapRecord,
    safetyCarLaps
  };
}

import {
  calculateGER,
  getDriverTier,
  calculateSalary,
  calculateAgeDecay,
  generateDraftPools,
  getSnakeDraftOrder,
  simulateGrandPrix,
  CIRCUITS,
  TEAMS,
  RaceDriverConfig,
  partReplaceCost,
  partFabricationCost,
  qualiStandings,
  freeAgentAnswer,
  sponsorTargetMet,
  generateSponsorOffers,
  advanceRnd,
  type RndState,
  projectGain,
  transferAnswer,
  aiOwnerAnswer,
  releaseCost,
  driverIdealSetup
} from '../../index.js';

function runTests() {
  console.log('🏎️ Iniciando Bateria de Testes dos Motores de Simulação...\n');

  // Custos de peça: mesmas fórmulas do modo solo (fábrica nível 2)
  console.assert(partReplaceCost('motor', 5, 2) === 1.6, 'troca do motor nv5 deve custar 1.6');
  console.assert(partFabricationCost('motor', 6, 2) === 3.3, 'fabricar motor nv6 deve custar 3.3');
  console.assert(partFabricationCost('freios', 6, 2) < partFabricationCost('motor', 6, 2), 'freios mais baratos que motor');

  // P&D: 3 engenheiros, 21 pts/GP, nível 5 pede 135 pts → pronto no 7º GP
  let rs: RndState = { designs: { chassi: 5, motor: 5, asaDianteira: 5, asaTraseira: 5, suspensao: 5, freios: 5, cambio: 5 }, projects: [{ part: 'motor' as const, engineers: 3, progress: 0, required: 135 }] };
  console.assert(projectGain({ part: 'motor', engineers: 3 }, 2) === 21, 'ganho do motor sem túnel');
  let gps = 0; while (rs.projects.length && gps < 20) { rs = advanceRnd(rs, 2).rnd; gps++; }
  console.assert(gps === 7 && rs.designs.motor === 6, 'projeto de motor conclui em 7 GPs e libera nível 6');

  // Patrocínio: metas por corrida e ofertas
  console.assert(sponsorTargetMet('podio', [3, 12]) && !sponsorTargetMet('podio', [4, null]), 'pódio');
  console.assert(sponsorTargetMet('top10', [2, 9]) && !sponsorTargetMet('top10', [2, null]), 'dois no top 10');
  console.assert(!sponsorTargetMet('doisCarros', [1, null]) && sponsorTargetMet('pontos', [10, null]), 'dois carros / pontos');
  const offers = generateSponsorOffers({ seed: 'x', appeal: 50, position: 6, teams: 11, gpsLeft: 12, gpsPerSeason: 12, needMaster: true, secondarySlots: 3, taken: new Set() });
  console.assert(offers.filter((o) => o.kind === 'master').length === 2 && offers.some((o) => o.kind === 'ocasiao'), 'ofertas de master e ocasião');
  console.assert(new Set(offers.map((o) => o.name)).size === offers.length, 'marcas sem repetir');

  // Mercado
  console.assert(freeAgentAnswer(1, 1).verdict === 'aceita' && freeAgentAnswer(0.6, 1).verdict === 'ofensiva' && freeAgentAnswer(0.9, 1).verdict === 'recusa', 'piloto livre responde pela pedida');
  const leal = { ger: 80, age: 28, potencial: 82, personalidade: 'leal', salario: 1 };
  console.assert(!transferAnswer(leal, 1.2, 1, 5).accept && transferAnswer(leal, 1.4, 1, 5).accept, 'leal exige 35%');
  console.assert(!transferAnswer({ ...leal, personalidade: 'ambicioso' }, 5, 6, 2).accept, 'ambicioso não desce no grid');
  console.assert(aiOwnerAnswer(10, 5, 2).action === 'reject' && aiOwnerAnswer(6, 5, 3).action === 'accept', 'IA protege elenco mínimo');
  console.assert(releaseCost(1, 1, 1, 0) === 6, 'rescisão = metade dos 12 GPs restantes');

  // Classificação: 22 pilotos → 16 → 10, grid com os 22 sem repetição
  const ids = Array.from({ length: 22 }, (_, i) => `d${i}`);
  const qlaps = [1, 2, 3].flatMap((s) => ids.map((id, i) => ({ driverId: id, session: s, time: 80 + i * 0.1, deleted: false })));
  const st = qualiStandings(ids, qlaps, 3);
  console.assert(st.grid?.length === 22 && new Set(st.grid).size === 22, 'grid deve ter 22 pilotos únicos');
  console.assert(st.grid?.[0] === 'd0' && Object.values(st.out).filter((s) => s === 1).length === 6, 'Q1 elimina 6, pole é o mais rápido');
  console.assert(st.out['d21'] === 1 && st.out['d15'] === 2, 'cortes do Q1 e Q2 corretos');
  const ideal = driverIdealSetup(CIRCUITS[0], 'p1-1');
  console.assert(JSON.stringify(ideal) === JSON.stringify(driverIdealSetup(CIRCUITS[0], 'p1-1')), 'ideal do piloto é determinístico');

  // 1. Teste de Cálculo de GER
  const eliteDriver = {
    talento: 86,
    classificacao: 88,
    gestaoPneus: 85,
    concentracao: 84,
    experiencia: 80,
    condicionamento: 90,
    agressividade: 70
  };
  const ger = calculateGER(eliteDriver);
  console.log(`✅ [GER] Piloto com talento 86 -> GER calculado: ${ger}`);
  if (ger < 84 || ger > 87) {
    throw new Error(`GER inesperado: ${ger}`);
  }

  // 2. Teste de Tiers
  const tierElite = getDriverTier(ger);
  const tierOuro = getDriverTier(78);
  const tierPrata = getDriverTier(68);
  const tierLenda = getDriverTier(97, { talento: 97, lenda: true });
  console.log(`✅ [Tiers] 85: ${tierElite}, 78: ${tierOuro}, 68: ${tierPrata}, 97: ${tierLenda}`);
  if (tierElite !== 'elite' || tierOuro !== 'ouro' || tierPrata !== 'prata' || tierLenda !== 'lenda') {
    throw new Error('Falha na classificação dos Tiers de Piloto');
  }

  // 3. Teste de Salário
  const sal85 = calculateSalary(85);
  const sal75 = calculateSalary(75);
  console.log(`✅ [Salário] Talento 85: R$ ${sal85} mi/GP, Talento 75: R$ ${sal75} mi/GP`);
  if (sal85 <= sal75 || sal85 <= 0) {
    throw new Error('Fórmula de salário inválida');
  }

  // 4. Teste de Declínio por Idade
  const decay28 = calculateAgeDecay(28);
  const decay32 = calculateAgeDecay(32);
  const decay35 = calculateAgeDecay(35);
  console.log(`✅ [Idade] 28 anos: -${decay28}, 32 anos: -${decay32}, 35 anos: -${decay35}`);
  if (decay28 !== 0 || decay32 !== 2 || decay35 !== 7) {
    throw new Error('Cálculo de declínio por idade incorreto');
  }

  // 5. Teste de Geração dos Potes do Snake Draft
  const pools = generateDraftPools(42);
  console.log(`✅ [Draft Pools] Pote 1 (Elite): ${pools.pot1.length} pilotos | Pote 2 (Dev): ${pools.pot2.length} pilotos`);
  if (pools.pot1.length !== 11 || pools.pot2.length < 11) {
    throw new Error('Quantidade incorreta de pilotos nos potes');
  }
  
  // Validar GERs do Pote 1 (diferença máx desejada 1-2 pontos, em torno de 85)
  const pot1Gers = pools.pot1.map(p => p.ger);
  const pot1Min = Math.min(...pot1Gers);
  const pot1Max = Math.max(...pot1Gers);
  console.log(`✅ [Pote 1 GERs] Mín: ${pot1Min}, Máx: ${pot1Max} (Diff: ${pot1Max - pot1Min})`);
  if (pot1Max - pot1Min > 3 || pot1Min < 83 || pot1Max > 87) {
    throw new Error(`Pote 1 fora da tolerância de equilíbrio competitivo: ${pot1Gers}`);
  }

  // Validar GERs do Pote 2 (desenvolvimento, em torno de 74)
  const pot2Gers = pools.pot2.map(p => p.ger);
  const pot2Min = Math.min(...pot2Gers);
  const pot2Max = Math.max(...pot2Gers);
  console.log(`✅ [Pote 2 GERs] Mín: ${pot2Min}, Máx: ${pot2Max} (Diff: ${pot2Max - pot2Min})`);
  if (pot2Max - pot2Min > 3 || pot2Min < 72 || pot2Max > 76) {
    throw new Error(`Pote 2 fora da tolerância de equilíbrio competitivo: ${pot2Gers}`);
  }

  // 6. Teste de Ordem do Snake Draft (11 equipes)
  const draftOrder = getSnakeDraftOrder(11);
  console.log(`✅ [Snake Draft] Total de escolhas: ${draftOrder.length}`);
  if (draftOrder.length !== 22) {
    throw new Error('Snake Draft deve ter exatamente 22 escolhas (2 por equipe)');
  }
  if (draftOrder[0].teamIndex !== 0 || draftOrder[10].teamIndex !== 10) {
    throw new Error('Rodada 1 do Snake Draft incorreta');
  }
  if (draftOrder[11].teamIndex !== 10 || draftOrder[21].teamIndex !== 0) {
    throw new Error('Rodada 2 (Invertida) do Snake Draft incorreta');
  }

  // 7. Teste de Simulação Completa de Grande Prêmio
  const circuit = CIRCUITS[0]; // GP da Espanha (66 voltas)
  const defaultCar = {
    chassi: { level: 5, wear: 0 },
    motor: { level: 5, wear: 0 },
    asaDianteira: { level: 5, wear: 0 },
    asaTraseira: { level: 5, wear: 0 },
    suspensao: { level: 5, wear: 0 },
    freios: { level: 5, wear: 0 },
    cambio: { level: 5, wear: 0 }
  };
  const defaultSetup = circuit.idealSetup;

  // Montar grid com 22 carros (2 por equipe das 11 equipes)
  const configs: RaceDriverConfig[] = [];
  let dCount = 0;
  for (const team of TEAMS) {
    for (let carNum = 1; carNum <= 2; carNum++) {
      dCount++;
      configs.push({
        driver: {
          id: `driver-${dCount}`,
          name: `Piloto ${dCount}`,
          talento: 75 + (dCount % 12),
          classificacao: 75 + (dCount % 10),
          experiencia: 70,
          concentracao: 80,
          gestaoPneus: 78,
          agressividade: 65,
          moral: 70
        },
        car: defaultCar,
        setup: defaultSetup,
        teamId: team.id,
        strategy: {
          compounds: ['medio', 'duro'],
          pitLaps: [26],
          initialPace: 'equilibrado'
        }
      });
    }
  }

  const raceOutput = simulateGrandPrix(configs, circuit, 12345);
  console.log(`✅ [Simulação GP] ${circuit.gp}: ${raceOutput.results.length} carros processados, Vencedor: ${raceOutput.results[0].driverId} (+${raceOutput.results[0].points} pts)`);
  console.log(`✅ [Eventos de Corrida] ${raceOutput.events.length} incidentes/rádios/boxes registrados.`);

  if (raceOutput.results.length !== 22) {
    throw new Error('Grid de chegada incompleto');
  }
  if (raceOutput.results[0].points < 25) {
    throw new Error('Pontuação do vencedor incorreta');
  }

  console.log('\n🚀 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
}

runTests();


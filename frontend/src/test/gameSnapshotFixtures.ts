import type {
  DecisionPlayerPhaseWorkspace,
  GamePhase,
  GameSnapshot,
  MarketPlayerPhaseWorkspace,
  NationalState,
  PhaseSettlementWorkspace,
  PhaseWorkspace,
  RankingWorkspace,
  SettlementPlayerPhaseWorkspace,
} from "../types";

function getPhaseLabel(phase: GamePhase): string {
  switch (phase) {
    case "decision":
      return "国家决策";
    case "market":
      return "市场出售";
    case "settlement":
      return "财政结算";
    default:
      return String(phase);
  }
}

export function createNationalState(overrides: Partial<NationalState> = {}): NationalState {
  return {
    countryId: "britain",
    domesticSalesRevenue: 12,
    overseasSalesRevenue: 18,
    nationalIncome: 30,
    cumulativeNationalIncome: 60,
    incomeAllocationRatio: {
      domesticMarket: 3,
      factory: 3,
      governmentFiscal: 4,
    },
    budgetPools: {
      domesticMarket: 12,
      factory: 15,
      governmentFiscal: 24,
    },
    techPoints: 5,
    militaryPoints: 1,
    productionCapacity: {
      handicraft: 2,
      mechanized: 0,
      steam: 0,
      electrified: 0,
    },
    pendingProductionCapacity: {
      handicraft: 0,
      mechanized: 0,
      steam: 0,
      electrified: 0,
    },
    goodsStock: {
      // 2.0: only phase1_goods key used post-Phase1; legacy multi-goods keys removed
      phase1_goods: 8,
    },
    rawMaterialUsage: {},
    research: {},
    researchFacilities: {},
    unlockedTechs: [],
    goodsAllocation: {},
    army: {
      infantry: 2,
    },
    navy: {
      fleets: 1,
    },
    administrationCapacity: 1,
    ideologyLevels: {
      liberalism: 2,
      egalitarianism: 1,
      nationalism: 3,
    },
    reforms: [],
    policies: [],
    incomeSummary: {
      currentRound: 30,
    },
    establishedDiplomacy: ["middle_east"],
    colonizationUnlocked: false,
    usedAbilities: [],
    temporaryEffects: {
      domesticMarketCapacityBonus: 0,
      domesticPriceBonus: 0,
      overseasMarketCapacityBonus: 0,
      overseasPriceBonus: 0,
      productionOutputMultiplier: 1,
    },
    ...overrides,
  };
}

export function createDecisionPlayerWorkspace(
  overrides: Partial<DecisionPlayerPhaseWorkspace> = {},
): DecisionPlayerPhaseWorkspace {
  return {
    countryCode: "britain",
    countryLabel: "英国",
    budgetPools: {
      domesticMarket: 12,
      factory: 15,
      governmentFiscal: 24,
    },
    incomeAllocationRatio: {
      domesticMarket: 3,
      factory: 3,
      governmentFiscal: 4,
    },
    techPoints: 5,
    militaryPoints: 1,
    routeSummaries: [
      {
        routeId: "handicraft",
        routeLabel: "手工业",
        currentCapacity: 2,
        pendingCapacity: 0,
        availableBatchesThisRound: 2,
      },
      {
        routeId: "mechanized",
        routeLabel: "机械化",
        currentCapacity: 0,
        pendingCapacity: 0,
        availableBatchesThisRound: 0,
      },
    ],
    productionOptions: [
      {
        goodsId: "coal",
        label: "煤炭",
        routeId: "handicraft",
        routeLabel: "手工业",
        unitBudgetCost: 2,
        unitOutput: 1,
        domesticReferencePrice: 4,
        overseasReferencePriceMin: 4,
        overseasReferencePriceMax: 6,
        priceAdjustment: 1,
        priceTrend: "up",
        maxQuantity: 2,
        lockedReason: null,
        usageHint: "工业基础品，适合稳定出货。",
      },
      {
        goodsId: "steel",
        label: "钢铁",
        routeId: "mechanized",
        routeLabel: "机械化",
        unitBudgetCost: 3,
        unitOutput: 1,
        domesticReferencePrice: 6,
        overseasReferencePriceMin: 7,
        overseasReferencePriceMax: 10,
        priceAdjustment: -1,
        priceTrend: "down",
        maxQuantity: 0,
        lockedReason: "需要研究「珍妮纺织机」",
        usageHint: "工业主力品，适合中期放大收入。",
      },
    ],
    expansionOptions: [
      {
        routeId: "handicraft",
        routeLabel: "手工业",
        unitBudgetCost: 8,
        capacityDelta: 1,
        maxQuantity: 1,
        lockedReason: null,
      },
    ],
    upgradeOptions: [
      {
        routeId: "mechanized",
        routeLabel: "机械化",
        sourceRouteId: "handicraft",
        sourceRouteLabel: "手工业",
        unitBudgetCost: 10,
        capacityDelta: 1,
        maxQuantity: 0,
        lockedReason: "需要研究「珍妮纺织机」",
      },
    ],
    newFactoryOptions: [
      {
        routeId: "handicraft",
        routeLabel: "手工业",
        unitBudgetCost: 12,
        capacityDelta: 1,
        maxQuantity: 1,
        lockedReason: null,
      },
    ],
    activeEvents: [],
    nationalAbility: {
      abilityId: "workshop_of_the_world",
      label: "世界工厂",
      description: "本回合所有生产订单产出翻倍。",
      requiresTargetIdeology: false,
      isAvailable: true,
    },
    techTree: {
      chains: [
        {
          chainId: "industrial",
          label: "工业链",
          techs: [
            { techId: "textile_tech", label: "纺织技术", budgetPool: "factory", budgetCost: 8, threshold: 3, progress: 0, effectiveThreshold: 3, isUnlocked: false, isActive: false, canResearch: true, isDiscovered: false, breakthroughAttempts: 0, unlocksGoods: [], unlocksRoutes: [] },
            { techId: "spinning_jenny", label: "珍妮纺织机", budgetPool: "factory", budgetCost: 12, threshold: 5, progress: 0, effectiveThreshold: 5, isUnlocked: false, isActive: false, canResearch: true, isDiscovered: false, breakthroughAttempts: 0, unlocksGoods: ["steel"], unlocksRoutes: ["mechanized"] },
            { techId: "steam_engine", label: "蒸汽引擎", budgetPool: "factory", budgetCost: 18, threshold: 8, progress: 0, effectiveThreshold: 8, isUnlocked: false, isActive: false, canResearch: false, isDiscovered: false, breakthroughAttempts: 0, unlocksGoods: [], unlocksRoutes: [] },
          ],
        },
        {
          chainId: "commerce",
          label: "商业链",
          techs: [
            { techId: "market_economy", label: "市场经济", threshold: 3, progress: 0, effectiveThreshold: 3, isUnlocked: false, isActive: false, canResearch: true, isDiscovered: false, breakthroughAttempts: 0 },
          ],
        },
        {
          chainId: "governance",
          label: "治理链",
          techs: [
            { techId: "admin_reform", label: "行政改革", threshold: 4, progress: 0, effectiveThreshold: 4, isUnlocked: false, isActive: false, canResearch: true, isDiscovered: false, breakthroughAttempts: 0 },
          ],
        },
      ],
      researchFacilities: 1,
      facilityCost: 10,
      progressPerFacility: 2,
      activeResearch: null,
    },
    domesticMarketActions: [
      {
        actionId: "market_fair",
        label: "博览会",
        cost: 5,
        description: "扩大国内市场承接能力。",
        lockedReason: null,
        effects: { domesticMarketCapacityDelta: 2 },
      },
      {
        actionId: "consumer_subsidy",
        label: "消费补贴",
        cost: 8,
        description: "提高国内市场承接能力并抬升价格。",
        lockedReason: "需要研究「市场经济」",
        effects: { domesticMarketCapacityDelta: 2, domesticPriceBonusDelta: 1 },
      },
    ],
    governmentActions: {
      pointPurchaseCosts: {
        tech: 2,
        military: 4,
      },
      strategies: [
        {
          actionId: "trade_agreement",
          label: "贸易协定",
          cost: 6,
          description: "改善海外出售价格。",
          techPointDelta: 0,
          militaryPointDelta: 0,
          lockedReason: null,
          ratioDelta: {
            governmentFiscal: 0,
          },
          effects: { overseasMarketCapacityDelta: 1, overseasPriceBonusDelta: 2 },
        },
        {
          actionId: "industrial_policy",
          label: "产业政策",
          cost: 12,
          description: "推动产业升级，并获得 1 点科技点。",
          techPointDelta: 1,
          militaryPointDelta: 0,
          lockedReason: "需要研究「行政改革」",
          ratioDelta: {
            factory: 0.2,
            governmentFiscal: -0.2,
          },
          effects: { domesticPriceBonusDelta: 1, overseasPriceBonusDelta: 1 },
        },
      ],
    },
    governmentReforms: {
      administrationCapacity: 3,
      adminPurchaseCost: 8,
      completedReforms: [],
      activePolicies: [],
      ideologyLevels: {
        liberalism: 2,
        egalitarianism: 1,
        nationalism: 3,
      },
      ideologyMin: 1,
      ideologyMax: 9,
      revolutionThreshold: 7,
      terminalReformsByIdeology: {},
      availableReforms: [
        {
          reformId: "admin_bureau",
          path: "national",
          label: "行政局",
          adminCost: 2,
          isCompleted: false,
          isBlocked: false,
          effects: {},
          unlocksPolicies: [],
        },
        {
          reformId: "free_press",
          path: "freedom",
          label: "自由报刊",
          adminCost: 1,
          isCompleted: false,
          isBlocked: false,
          effects: {},
          unlocksPolicies: [],
        },
      ],
      availablePolicies: [
        {
          policyId: "trade_agreement",
          label: "贸易协定",
          adminCostPerTurn: 1,
          budgetCost: 6,
          description: "改善海外出售价格。",
          isActive: false,
          requiresReform: null,
          isUnlocked: true,
        },
        {
          policyId: "industrial_policy",
          label: "产业政策",
          adminCostPerTurn: 1,
          budgetCost: 12,
          description: "推动产业升级，并获得 1 点科技点。",
          isActive: false,
          requiresReform: "admin_bureau",
          isUnlocked: false,
        },
      ],
    },
    militaryWorkspace: {
      militaryPoints: 1,
      army: {
        infantry: 2,
      },
      navy: {
        fleets: 1,
      },
      controlledRegions: 1,
      establishedDiplomacy: ["middle_east"],
      overseasCapacity: 2,
      regionAccessStatus: [
        {
          regionId: "africa",
          label: "非洲",
          accessLevel: "concession",
          isAccessible: true,
          isDiplomacyEstablished: false,
          isColonized: false,
          controller: null,
          acceptedGoods: ["rubber", "cotton", "minerals"],
        },
        {
          regionId: "middle_east",
          label: "中东",
          accessLevel: "concession",
          isAccessible: true,
          isDiplomacyEstablished: true,
          isColonized: false,
          controller: null,
          acceptedGoods: ["oil", "tea"],
        },
      ],
      availableMilitaryActions: [
        {
          actionId: "naval_drill",
          label: "海军演练",
          cost: 6,
          maxPerRound: 2,
          description: "提升军事点并扩展海外市场承接力。",
          effects: { militaryPointsDelta: 1, overseasMarketCapacityDelta: 1 },
        },
        {
          actionId: "recruit_infantry",
          label: "征募步兵",
          cost: 4,
          maxPerRound: 3,
          description: "征募步兵部队，增加军事影响力。",
          effects: { militaryPointsDelta: 1 },
        },
      ],
      availableDiplomacyActions: [
        {
          actionId: "establish_africa",
          label: "与非洲建交",
          cost: 7,
          targetRegion: "africa",
          targetRegionLabel: "非洲",
          description: "与非洲建立外交关系，永久开放贸易通道。",
          isEstablished: false,
        },
        {
          actionId: "establish_middle_east",
          label: "与中东建交",
          cost: 7,
          targetRegion: "middle_east",
          targetRegionLabel: "中东",
          description: "与中东建立外交关系，永久开放贸易通道。",
          isEstablished: true,
        },
      ],
      colonizationCapability: {
        isUnlocked: false,
        unlockCost: 10,
        militaryPointCost: 3,
        incomePerColonyPerRound: 5,
        maxColonizationsPerRound: 1,
      },
      colonizationOptions: [
        {
          regionId: "africa",
          regionLabel: "非洲",
          controller: null,
          isColonized: false,
          militaryPointCost: 3,
          canColonize: false,
          lockedReason: "需先永久解锁殖民扩张",
        },
        {
          regionId: "middle_east",
          regionLabel: "中东",
          controller: null,
          isColonized: false,
          militaryPointCost: 3,
          canColonize: false,
          lockedReason: "需先永久解锁殖民扩张",
        },
      ],
      oceanNodes: [],
    },
    ...overrides,
  };
}

export function createMarketPlayerWorkspace(
  overrides: Partial<MarketPlayerPhaseWorkspace> = {},
): MarketPlayerPhaseWorkspace {
  return {
    countryCode: "britain",
    countryLabel: "英国",
    budgetPools: {
      domesticMarket: 14,
      factory: 16,
      governmentFiscal: 20,
    },
    sellableInventory: [
      {
        goodsId: "grain",
        label: "粮食",
        quantity: 4,
        priceAdjustment: 1,
        priceTrend: "up",
        domesticReferencePrice: 3,
        overseasReferencePrices: [
          {
            regionId: "asia_pacific",
            label: "亚太",
            unitPrice: 4,
          },
        ],
      },
      {
        goodsId: "steel",
        label: "钢铁",
        quantity: 1,
        priceAdjustment: -1,
        priceTrend: "down",
        domesticReferencePrice: 6,
        overseasReferencePrices: [
          {
            regionId: "europe",
            label: "欧洲",
            unitPrice: 7,
          },
        ],
      },
    ],
    domesticMarketCapacity: 4,
    overseasMarketCapacity: 5,
    regionAccessStatus: [
      {
        regionId: "africa",
        label: "非洲",
        accessLevel: "concession",
        isAccessible: true,
        isDiplomacyEstablished: false,
        isColonized: false,
        controller: null,
        acceptedGoods: ["rubber", "cotton", "minerals"],
      },
      {
        regionId: "middle_east",
        label: "中东",
        accessLevel: "concession",
        isAccessible: true,
        isDiplomacyEstablished: true,
        isColonized: false,
        controller: null,
        acceptedGoods: ["oil", "tea"],
      },
    ],
    ...overrides,
  };
}

export function createSettlementPlayerWorkspace(
  overrides: Partial<SettlementPlayerPhaseWorkspace> = {},
): SettlementPlayerPhaseWorkspace {
  return {
    countryCode: "britain",
    countryLabel: "英国",
    domesticSalesRevenue: 12,
    overseasSalesRevenue: 18,
    nationalIncome: 30,
    budgetAllocation: {
      domesticMarket: 9,
      factory: 9,
      governmentFiscal: 12,
    },
    nextRatio: {
      domesticMarket: 3,
      factory: 3,
      governmentFiscal: 4,
    },
    ...overrides,
  };
}

function createPlayersForPhase(
  phase: GamePhase,
): PhaseWorkspace["players"] {
  switch (phase) {
    case "decision":
      return {
        "player-1": createDecisionPlayerWorkspace(),
        "player-2": createDecisionPlayerWorkspace({
          countryCode: "france",
          countryLabel: "法国",
        }),
      };
    case "market":
      return {
        "player-1": createMarketPlayerWorkspace(),
        "player-2": createMarketPlayerWorkspace({
          countryCode: "france",
          countryLabel: "法国",
        }),
      };
    case "settlement":
      return {
        "player-1": createSettlementPlayerWorkspace(),
        "player-2": createSettlementPlayerWorkspace({
          countryCode: "france",
          countryLabel: "法国",
        }),
      };
    default:
      return {
        "player-1": createDecisionPlayerWorkspace(),
        "player-2": createDecisionPlayerWorkspace({
          countryCode: "france",
          countryLabel: "法国",
        }),
      };
  }
}

export function createPhaseWorkspace(
  phase: GamePhase,
  overrides: Partial<PhaseWorkspace> = {},
): PhaseWorkspace {
  const players = createPlayersForPhase(phase);
  switch (phase) {
    case "decision":
      return {
        phase,
        phaseLabel: getPhaseLabel(phase),
        submittedPlayerIds: [],
        availableActionsByPlayer: players as Record<string, DecisionPlayerPhaseWorkspace>,
        players: players as Record<string, DecisionPlayerPhaseWorkspace>,
        ...overrides,
      };
    case "market":
      return {
        phase,
        phaseLabel: getPhaseLabel(phase),
        submittedPlayerIds: [],
        saleOptionsByPlayer: players as Record<string, MarketPlayerPhaseWorkspace>,
        players: players as Record<string, MarketPlayerPhaseWorkspace>,
        ...overrides,
      };
    case "settlement":
      return {
        phase,
        phaseLabel: getPhaseLabel(phase),
        submittedPlayerIds: [],
        settlementByPlayer: players as Record<string, SettlementPlayerPhaseWorkspace>,
        players: players as Record<string, SettlementPlayerPhaseWorkspace>,
        ...overrides,
      };
    default:
      return {
        phase: "decision",
        phaseLabel: getPhaseLabel("decision"),
        submittedPlayerIds: [],
        availableActionsByPlayer: players as Record<string, DecisionPlayerPhaseWorkspace>,
        players: players as Record<string, DecisionPlayerPhaseWorkspace>,
        ...overrides,
      };
  }
}

export function createRankingWorkspace(
  overrides: Partial<RankingWorkspace> = {},
): RankingWorkspace {
  return {
    leader: "player-1",
    standings: [
      {
        rank: 1,
        playerId: "player-1",
        countryId: "britain",
        cumulativeNationalIncome: 60,
        tieBreak: {
          productionCapacity: 3,
          controlledRegions: 1,
          budgetPoolsTotal: 45,
        },
      },
      {
        rank: 2,
        playerId: "player-2",
        countryId: "france",
        cumulativeNationalIncome: 54,
        tieBreak: {
          productionCapacity: 2,
          controlledRegions: 1,
          budgetPoolsTotal: 40,
        },
      },
    ],
    ...overrides,
  };
}

export function createSettlementWorkspace(
  overrides: Partial<PhaseSettlementWorkspace> = {},
): PhaseSettlementWorkspace {
  return {
    settledPhase: "market",
    phaseLabel: "市场出售",
    headline: "市场出售阶段已经完成结算，国家收入已进入三池分账。",
    summaryCards: [
      {
        playerId: "player-1",
        countryId: "britain",
        nationalIncome: 30,
        budgetAllocation: {
          domesticMarket: 9,
          factory: 9,
          governmentFiscal: 12,
        },
      },
    ],
    summaryLines: [
      "本轮国家收入已经重新分配到国内消费市场、工厂和政府财政三池。",
    ],
    autoSubmittedPlayerIds: [],
    previousPhase: "market",
    ...overrides,
  };
}

export function createGameSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
  const phase = overrides.phase ?? "market";
  const nationalStateByPlayer = overrides.nationalStateByPlayer ?? {
    "player-1": createNationalState(),
    "player-2": createNationalState({
      countryId: "france",
      cumulativeNationalIncome: 54,
      budgetPools: {
        domesticMarket: 10,
        factory: 14,
        governmentFiscal: 16,
      },
      domesticSalesRevenue: 10,
      overseasSalesRevenue: 14,
      nationalIncome: 24,
    }),
  };

  return {
    snapshotId: "snapshot-1",
    gameId: "game-1",
    round: 2,
    maxRounds: 15,
    phase,
    rulesVersion: "2.0",
    phaseDeadlineAt: "2026-03-30T12:01:30.000Z",
    nationalStateByPlayer,
    regionStates: [],
    oceanNodeStates: [],
    ranking: createRankingWorkspace().standings,
    phaseWorkspace: createPhaseWorkspace(phase),
    rankingWorkspace: createRankingWorkspace(),
    lastSettlementSummary: {
      settledPhase: "market",
      summary: "market settled",
    },
    lastSettlementWorkspace: createSettlementWorkspace(),
    activeEvents: [],
    marketPriceAdjustments: {},
    eventDeck: [],
    ...overrides,
  };
}

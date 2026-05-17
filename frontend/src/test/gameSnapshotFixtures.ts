import i18n from "../i18n";
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
      return i18n.t("game:phase.decision");
    case "market":
      return i18n.t("game:phase.market");
    case "settlement":
      return i18n.t("game:phase.settlement");
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
    domesticMarketCapacity: 4,
    overseasMarketCapacity: 5,
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
    countryLabel: i18n.t("game:country.britain"),
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
        routeLabel: i18n.t("game:productionRoute.handicraft"),
        currentCapacity: 2,
        pendingCapacity: 0,
        availableBatchesThisRound: 2,
      },
      {
        routeId: "mechanized",
        routeLabel: i18n.t("game:productionRoute.mechanized"),
        currentCapacity: 0,
        pendingCapacity: 0,
        availableBatchesThisRound: 0,
      },
    ],
    productionOptions: [
      {
        goodsId: "coal",
        label: i18n.t("game:goods.coal"),
        routeId: "handicraft",
        routeLabel: i18n.t("game:productionRoute.handicraft"),
        unitBudgetCost: 2,
        unitOutput: 1,
        domesticReferencePrice: 4,
        overseasReferencePriceMin: 4,
        overseasReferencePriceMax: 6,
        priceAdjustment: 1,
        priceTrend: "up",
        maxQuantity: 2,
        lockedReason: null,
        usageHint: i18n.t("game:factory.productionHint.stable", "工业基础品，适合稳定出货。"),
      },
      {
        goodsId: "steel",
        label: i18n.t("game:goods.steel"),
        routeId: "mechanized",
        routeLabel: i18n.t("game:productionRoute.mechanized"),
        unitBudgetCost: 3,
        unitOutput: 1,
        domesticReferencePrice: 6,
        overseasReferencePriceMin: 7,
        overseasReferencePriceMax: 10,
        priceAdjustment: -1,
        priceTrend: "down",
        maxQuantity: 0,
        lockedReason: i18n.t("game:research.prerequisiteNeeded", "需要研究「珍妮纺织机」"),
        usageHint: i18n.t("game:factory.productionHint.main", "工业主力品，适合中期放大收入。"),
      },
    ],
    expansionOptions: [
      {
        routeId: "handicraft",
        routeLabel: i18n.t("game:productionRoute.handicraft"),
        unitBudgetCost: 8,
        capacityDelta: 1,
        maxQuantity: 1,
        lockedReason: null,
      },
    ],
    upgradeOptions: [],
    newFactoryOptions: [
      {
        routeId: "handicraft",
        routeLabel: i18n.t("game:productionRoute.handicraft"),
        unitBudgetCost: 12,
        capacityDelta: 2,
        maxQuantity: 1,
        lockedReason: null,
      },
    ],
    factoryActions: [
      {
        actionId: "factory_raw_procurement",
        label: i18n.t("game:factory.action.rawProcurement", "原料统购"),
        cost: 3,
        description: i18n.t("game:factory.action.rawProcurementDesc", "立刻补充本回合原材料。"),
        lockedReason: null,
        effects: { rawMaterialsDelta: 4 },
      },
    ],
    activeEvents: [],
    nationalAbility: {
      abilityId: "workshop_of_the_world",
      label: i18n.t("game:factory.nationalAbility.workshopOfTheWorld", "世界工厂"),
      description: i18n.t("game:factory.nationalAbility.workshopOfTheWorldDesc", "本回合所有生产订单产出翻倍。"),
      requiresTargetIdeology: false,
      isAvailable: true,
    },
    techTree: {
      chains: [
        {
          chainId: "industrial",
          label: i18n.t("game:research.chain.industrial", "工业链"),
          techs: [
            { techId: "textile_tech", label: i18n.t("game:research.tech.textileTech", "纺织技术"), budgetPool: "factory", budgetCost: 8, threshold: 3, progress: 0, effectiveThreshold: 3, isUnlocked: false, isActive: false, canResearch: true, isDiscovered: false, breakthroughAttempts: 0, unlocksGoods: [], unlocksRoutes: [] },
            { techId: "spinning_jenny", label: i18n.t("game:technology.spinning_jenny"), budgetPool: "factory", budgetCost: 12, threshold: 5, progress: 0, effectiveThreshold: 5, isUnlocked: false, isActive: false, canResearch: true, isDiscovered: false, breakthroughAttempts: 0, unlocksGoods: ["steel"], unlocksRoutes: ["mechanized"] },
            { techId: "steam_engine", label: i18n.t("game:technology.steam_engine"), budgetPool: "factory", budgetCost: 18, threshold: 8, progress: 0, effectiveThreshold: 8, isUnlocked: false, isActive: false, canResearch: false, isDiscovered: false, breakthroughAttempts: 0, unlocksGoods: [], unlocksRoutes: [] },
          ],
        },
        {
          chainId: "commerce",
          label: i18n.t("game:research.chain.commerce", "商业链"),
          techs: [
            { techId: "market_economy", label: i18n.t("game:research.tech.marketEconomy", "市场经济"), threshold: 3, progress: 0, effectiveThreshold: 3, isUnlocked: false, isActive: false, canResearch: true, isDiscovered: false, breakthroughAttempts: 0 },
          ],
        },
        {
          chainId: "governance",
          label: i18n.t("game:research.chain.governance", "治理链"),
          techs: [
            { techId: "admin_reform", label: i18n.t("game:research.tech.adminReform", "行政改革"), threshold: 4, progress: 0, effectiveThreshold: 4, isUnlocked: false, isActive: false, canResearch: true, isDiscovered: false, breakthroughAttempts: 0 },
          ],
        },
      ],
      researchFacilities: 1,
      facilityCost: 10,
      progressPerFacility: 2,
      breakthroughDieSides: 10,
      activeResearch: null,
    },
    domesticMarketActions: [],
    governmentActions: {
      pointPurchaseCosts: {
        tech: 2,
        military: 6,
      },
      strategies: [
        {
          actionId: "market_subsidy",
          label: i18n.t("game:government.strategy.marketSubsidy", "市场补贴"),
          cost: 0,
          description: i18n.t("game:government.strategy.marketSubsidyDesc", "动用行政力组织本轮内需补贴，扩大国内承接量。"),
          techPointDelta: 0,
          militaryPointDelta: 0,
          lockedReason: null,
          effects: { domesticMarketCapacityDelta: 2 },
        },
        {
          actionId: "price_control",
          label: i18n.t("game:government.strategy.priceControl", "价格管制"),
          cost: 0,
          description: i18n.t("game:government.strategy.priceControlDesc", "动用行政力调控本轮国内收购价格。"),
          techPointDelta: 0,
          militaryPointDelta: 0,
          lockedReason: null,
          effects: { domesticPriceBonusDelta: 2 },
        },
        {
          actionId: "trade_promotion",
          label: i18n.t("game:government.strategy.tradePromotion", "贸易促进"),
          cost: 0,
          description: i18n.t("game:government.strategy.tradePromotionDesc", "动用行政力协调贸易渠道，扩大本回合海外市场容量。"),
          techPointDelta: 0,
          militaryPointDelta: 0,
          lockedReason: null,
          effects: { overseasMarketCapacityDelta: 2 },
        },
        {
          actionId: "expand_research",
          label: i18n.t("game:government.strategy.expandResearch", "建立研究院"),
          cost: 6,
          description: i18n.t("game:government.strategy.expandResearchDesc", "从政府财政建设一所研究院，永久增加每回合研究进度。"),
          techPointDelta: 0,
          militaryPointDelta: 0,
          lockedReason: null,
          effects: { researchFacilityDelta: { academy: 1 } },
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
          label: i18n.t("game:government.reform.adminBureau", "行政局"),
          adminCost: 2,
          isCompleted: false,
          isBlocked: false,
          effects: {},
          unlocksPolicies: [],
        },
        {
          reformId: "free_press",
          path: "freedom",
          label: i18n.t("game:government.reform.freePress", "自由报刊"),
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
          label: i18n.t("game:government.policy.tradeAgreement", "贸易协定"),
          adminCostPerTurn: 1,
          budgetCost: 6,
          description: i18n.t("game:government.policy.tradeAgreementDesc", "改善海外出售价格。"),
          isActive: false,
          requiresReform: null,
          isUnlocked: true,
        },
        {
          policyId: "industrial_policy",
          label: i18n.t("game:government.policy.industrialPolicy", "产业政策"),
          adminCostPerTurn: 1,
          budgetCost: 12,
          description: i18n.t("game:government.policy.industrialPolicyDesc", "推动产业升级，并获得 1 点科技点。"),
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
          label: i18n.t("game:region.africa"),
          accessLevel: "concession",
          isAccessible: true,
          lockReason: null,
          isDiplomacyEstablished: false,
          canCompete: false,
          competitionLockedReason: "diplomacy_not_established",
          competitionRewardCapacityBonus: 8,
          competitionRewardPriceBonus: 1,
          competitionMinimumPower: 1,
          isColonized: false,
          controller: null,
          acceptedGoods: ["rubber", "cotton", "minerals"],
          priceMultiplier: 1.2,
        },
        {
          regionId: "middle_east",
          label: i18n.t("game:region.middle_east"),
          accessLevel: "concession",
          isAccessible: true,
          lockReason: null,
          isDiplomacyEstablished: true,
          canCompete: true,
          competitionLockedReason: null,
          competitionRewardCapacityBonus: 8,
          competitionRewardPriceBonus: 1,
          competitionMinimumPower: 1,
          isColonized: false,
          controller: null,
          acceptedGoods: ["oil", "tea"],
          priceMultiplier: 1.2,
        },
      ],
      availableMilitaryActions: [
        {
          actionId: "naval_drill",
          label: i18n.t("game:military.action.navalDrill", "海军演练"),
          cost: 1,
          maxPerRound: 2,
          description: i18n.t("game:military.action.navalDrillDesc", "消耗军事点开展海军演练，扩展本轮海外市场承接力。"),
          effects: { overseasMarketCapacityDelta: 1 },
        },
        {
          actionId: "recruit_infantry",
          label: i18n.t("game:military.action.recruitInfantry", "征募步兵"),
          cost: 1,
          maxPerRound: 3,
          description: i18n.t("game:military.action.recruitInfantryDesc", "消耗军事点征募步兵部队。"),
          effects: { armyDelta: { infantry: 1 } },
        },
      ],
      availableDiplomacyActions: [
        {
          actionId: "establish_africa",
          label: i18n.t("game:military.diplomacy.establishAfrica", "与非洲建交"),
          cost: 7,
          targetRegion: "africa",
          targetRegionLabel: i18n.t("game:region.africa"),
          description: i18n.t("game:military.diplomacy.establishAfricaDesc", "与非洲建立外交关系，永久开放贸易通道。"),
          isEstablished: false,
        },
        {
          actionId: "establish_middle_east",
          label: i18n.t("game:military.diplomacy.establishMiddleEast", "与中东建交"),
          cost: 7,
          targetRegion: "middle_east",
          targetRegionLabel: i18n.t("game:region.middle_east"),
          description: i18n.t("game:military.diplomacy.establishMiddleEastDesc", "与中东建立外交关系，永久开放贸易通道。"),
          isEstablished: true,
        },
      ],
      colonizationCapability: {
        isUnlocked: false,
        unlockCost: 0,
        budgetCost: 0,
        incomePerColonyPerRound: 0,
        maxColonizationsPerRound: 0,
      },
      colonizationOptions: [],
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
    countryLabel: i18n.t("game:country.britain"),
    budgetPools: {
      domesticMarket: 14,
      factory: 16,
      governmentFiscal: 20,
    },
    sellableInventory: [
      {
        goodsId: "grain",
        label: i18n.t("game:goods.grain"),
        quantity: 4,
        priceAdjustment: 1,
        priceTrend: "up",
        domesticReferencePrice: 3,
        overseasReferencePrices: [
          {
            regionId: "asia_pacific",
            label: i18n.t("game:region.asia_pacific"),
            unitPrice: 4,
          },
        ],
      },
      {
        goodsId: "steel",
        label: i18n.t("game:goods.steel"),
        quantity: 1,
        priceAdjustment: -1,
        priceTrend: "down",
        domesticReferencePrice: 6,
        overseasReferencePrices: [
          {
            regionId: "europe",
            label: i18n.t("game:region.europe"),
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
        label: i18n.t("game:region.africa"),
        accessLevel: "concession",
        isAccessible: true,
        lockReason: null,
        isDiplomacyEstablished: false,
        canCompete: false,
        competitionLockedReason: "diplomacy_not_established",
        competitionRewardCapacityBonus: 8,
        competitionRewardPriceBonus: 1,
        competitionMinimumPower: 1,
        isColonized: false,
        controller: null,
        acceptedGoods: ["rubber", "cotton", "minerals"],
        priceMultiplier: 1.2,
      },
      {
        regionId: "middle_east",
        label: i18n.t("game:region.middle_east"),
        accessLevel: "concession",
        isAccessible: true,
        lockReason: null,
        isDiplomacyEstablished: true,
        canCompete: true,
        competitionLockedReason: null,
        competitionRewardCapacityBonus: 8,
        competitionRewardPriceBonus: 1,
        competitionMinimumPower: 1,
        isColonized: false,
        controller: null,
        acceptedGoods: ["oil", "tea"],
        priceMultiplier: 1.2,
      },
    ],
    overseasCompetition: {
      availableArmy: { infantry: 1, artillery: 0 },
      rewardCapacityBonus: 8,
      rewardPriceBonus: 1,
      infantryPower: 1,
      artilleryPower: 2,
      minimumPower: 1,
    },
    phase1Economy: {
      capacityByMode: {},
      rawMaterials: 10,
      goodsInventory: 5,
      productionModes: [],
      domesticDemand: 3,
      equilibriumPrice: 4,
      domesticPricePreview: 4,
      investmentPool: 12,
      incomeAllocationRatio: {},
      marketMetrics: {},
    },
    phase1GoodsAvailable: 5,
    ...overrides,
  };
}

export function createSettlementPlayerWorkspace(
  overrides: Partial<SettlementPlayerPhaseWorkspace> = {},
): SettlementPlayerPhaseWorkspace {
  return {
    countryCode: "britain",
    countryLabel: i18n.t("game:country.britain"),
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
          countryLabel: i18n.t("game:country.france"),
        }),
      };
    case "market":
      return {
        "player-1": createMarketPlayerWorkspace(),
        "player-2": createMarketPlayerWorkspace({
          countryCode: "france",
          countryLabel: i18n.t("game:country.france"),
        }),
      };
    case "settlement":
      return {
        "player-1": createSettlementPlayerWorkspace(),
        "player-2": createSettlementPlayerWorkspace({
          countryCode: "france",
          countryLabel: i18n.t("game:country.france"),
        }),
      };
    default:
      return {
        "player-1": createDecisionPlayerWorkspace(),
        "player-2": createDecisionPlayerWorkspace({
          countryCode: "france",
          countryLabel: i18n.t("game:country.france"),
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
    phaseLabel: i18n.t("game:phase.market"),
    headline: i18n.t("game:settlement.headline", "市场出售阶段已经完成结算，国家收入已重新分配。"),
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
      i18n.t("game:settlement.summaryLine", "本轮国家收入已经重新分配到民间购买力、工厂和政府财政。"),
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

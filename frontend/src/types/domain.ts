export type CountryCode = "britain" | "france" | "prussia" | "austria" | "russia";

export type RoomStatus = "waiting" | "readying" | "in_game" | "finished";
export type GamePhase = "decision" | "market" | "settlement";

export type PlayerSubmissionStatus =
  | "pending"
  | "submitted"
  | "timeout_auto_submitted";

export type ConnectionStatus = "online" | "offline_recoverable";
export type RegionAccessLevel = "closed" | "open" | "concession" | "colony";
export type IdeologyKey = "liberalism" | "egalitarianism" | "nationalism";
export type PriceTrend = "up" | "down" | "flat";

export interface RoomMember {
  playerId: string;
  nickname: string;
  selectedCountry: CountryCode | null;
  connectionStatus: ConnectionStatus;
  isReady: boolean;
  memberType?: "human" | "bot";
  botProfileKey?: string | null;
}

export interface RoomContext {
  roomCode: string;
  status: RoomStatus;
  hostPlayerId: string;
  memberPlayerIds: string[];
  members: RoomMember[];
  countrySlots: Record<string, string | null>;
  currentGameId: string | null;
  lastActivityAt: string | null;
}

export interface PlayerSession {
  playerId: string;
  sessionId: string;
  nickname: string;
  roomCode: string | null;
  selectedCountry: CountryCode | null;
  connectionStatus: ConnectionStatus;
  lastSeenAt: string | null;
}

export interface GameContext {
  gameId: string;
  roomCode: string;
  currentRound: number;
  totalRounds: number;
  currentPhase: GamePhase;
  isFinished: boolean;
  activeSnapshotId: string | null;
}

export interface IncomeAllocationRatio {
  domesticMarket: number;
  factory: number;
  governmentFiscal: number;
}

export interface BudgetPools {
  domesticMarket: number;
  factory: number;
  governmentFiscal: number;
}

export interface ActiveEvent {
  eventId: string;
  label: string;
  description: string;
  remainingRounds: number;
  effects?: Record<string, unknown>;
}

export interface NationalAbility {
  abilityId: string;
  label: string;
  description: string;
  requiresTargetIdeology: boolean;
  isAvailable: boolean;
}

export interface NationalState {
  countryId: CountryCode;
  domesticSalesRevenue: number;
  overseasSalesRevenue: number;
  nationalIncome: number;
  cumulativeNationalIncome: number;
  incomeAllocationRatio: IncomeAllocationRatio;
  budgetPools: BudgetPools;
  techPoints: number;
  militaryPoints: number;
  productionCapacity: Record<string, number>;
  pendingProductionCapacity: Record<string, number>;
  goodsStock: Record<string, number>;
  rawMaterialUsage: Record<string, number>;
  research: Record<string, number>;
  researchFacilities: Record<string, number>;
  unlockedTechs: string[];
  unlockedTalents: string[];
  goodsAllocation: Record<string, number>;
  army: Record<string, number>;
  navy: Record<string, number>;
  administrationCapacity: number;
  ideologyLevels: Record<string, number>;
  reforms: string[];
  policies: string[];
  incomeSummary: Record<string, unknown>;
  establishedDiplomacy: string[];
  colonizationUnlocked: boolean;
  usedAbilities: string[];
  temporaryEffects: Record<string, unknown>;
}

export type PlayerState = NationalState;

export interface RegionState {
  regionId: string;
  accessLevel: RegionAccessLevel;
  marketSupply: Record<string, number>;
  marketPrice: Record<string, number>;
  controller: string | null;
  garrison: Record<string, number>;
  independence: number;
  resourceLimit: Record<string, number>;
}

export interface OceanNodeState {
  nodeId: string;
  navyByCountry: Record<string, number>;
  controller: string | null;
  isBlockaded: boolean;
  reachableRoutes: string[];
}

export interface RankingTieBreak {
  productionCapacity: number;
  controlledRegions: number;
  budgetPoolsTotal: number;
}

export interface RankingEntry {
  rank: number;
  playerId: string;
  countryId: CountryCode;
  cumulativeNationalIncome: number;
  tieBreak: RankingTieBreak;
}

export type RankingStanding = RankingEntry;

export interface ProductionOrder {
  goodsId: string;
  quantity: number;
}

export interface ExpansionOrder {
  routeId: string;
  quantity: number;
}

export interface UpgradeOrder {
  routeId: string;
  quantity: number;
}

export interface NewFactoryOrder {
  routeId: string;
  quantity: number;
}

export interface FactoryPlan {
  productionOrders: ProductionOrder[];
  expansionOrders: ExpansionOrder[];
  upgradeOrders: UpgradeOrder[];
  newFactoryOrders: NewFactoryOrder[];
}

export interface DomesticMarketActionSelection {
  actionId: string;
}

export interface DomesticMarketPlan {
  domesticMarketActions: DomesticMarketActionSelection[];
}

export interface PointPurchase {
  pointType: "tech" | "military";
  quantity: number;
}

export interface GovernmentActionSelection {
  actionId: string;
}

export interface TechResearchSelection {
  techId: string;
}

export interface GovernmentPlan {
  pointPurchases: PointPurchase[];
  strategySelections: GovernmentActionSelection[];
  techResearch: TechResearchSelection[];
  adminPurchases?: number;
}

export interface MilitaryActionSelection {
  actionId: string;
}

export interface DiplomacyActionSelection {
  actionId: string;
}

export interface ColonizationActionSelection {
  targetRegionId: string;
}

export interface ConquestActionSelection {
  regionId: string;
  infantry: number;
  artillery: number;
}

export interface LootingActionSelection {
  regionId: string;
  resourceType: string;
}

export interface OceanNodeOption {
  nodeId: string;
  navyByCountry: Record<string, number>;
  controller: string | null;
  isBlockaded: boolean;
  myFleet: number;
}

export interface ColonizationOption {
  regionId: string;
  regionLabel: string;
  controller: string | null;
  isColonized: boolean;
  militaryPointCost: number;
  canColonize: boolean;
  lockedReason: string | null;
  independence?: number;
  garrison?: Record<string, number>;
  resourceLimit?: Record<string, number>;
}

export interface ColonizationCapability {
  isUnlocked: boolean;
  unlockCost: number;
  militaryPointCost: number;
  incomePerColonyPerRound: number;
  maxColonizationsPerRound: number;
}

export interface MilitaryPlan {
  unlockColonization: boolean;
  militaryActions: MilitaryActionSelection[];
  diplomacyActions: DiplomacyActionSelection[];
  colonizationActions: ColonizationActionSelection[];
  navalDeployment: Record<string, number>;
  conquestActions: ConquestActionSelection[];
  lootingActions: LootingActionSelection[];
}

export interface TalentNodeOption {
  nodeId: string;
  label: string;
  techPointCost: number;
  description: string;
  permanentEffects: Record<string, number | Record<string, number>>;
  isUnlocked: boolean;
  canUnlock: boolean;
}

export interface TalentBranchOption {
  branchId: string;
  label: string;
  nodes: TalentNodeOption[];
}

export interface TalentUnlockSelection {
  nodeId: string;
}

export interface TalentPlan {
  talentUnlocks: TalentUnlockSelection[];
}

export interface AbilitySelection {
  abilityId: string;
  targetIdeology?: IdeologyKey;
}

export interface DecisionSubmission {
  factoryPlan: FactoryPlan;
  domesticMarketPlan: DomesticMarketPlan;
  governmentPlan: GovernmentPlan;
  militaryPlan: MilitaryPlan;
  talentPlan: TalentPlan;
  abilitySelection?: AbilitySelection;
  researchTarget?: string;
}

export interface SaleOrder {
  goodsId: string;
  market: "domestic" | "overseas";
  quantity: number;
  regionId?: string;
}

export interface Phase1ExternalAllocation {
  marketId: string;
  quantity: number;
}

export interface Phase1MarketPayload {
  domesticAllocation: number;
  externalAllocations: Phase1ExternalAllocation[];
}

export interface MarketSubmission {
  saleOrders: SaleOrder[];
  phase1Market?: Phase1MarketPayload;
}

export interface FactoryRouteSummary {
  routeId: string;
  routeLabel: string;
  currentCapacity: number;
  pendingCapacity: number;
  availableBatchesThisRound: number;
}

export interface FactoryProductionOption {
  goodsId: string;
  label: string;
  routeId: string;
  routeLabel: string;
  unitBudgetCost: number;
  unitOutput: number;
  domesticReferencePrice: number;
  overseasReferencePriceMin: number;
  overseasReferencePriceMax: number;
  priceAdjustment: number;
  priceTrend: PriceTrend;
  maxQuantity: number;
  lockedReason: string | null;
  usageHint: string;
}

export interface FactoryExpansionOption {
  routeId: string;
  routeLabel: string;
  unitBudgetCost: number;
  capacityDelta: number;
  maxQuantity: number;
  lockedReason: string | null;
}

export interface FactoryUpgradeOption {
  routeId: string;
  routeLabel: string;
  sourceRouteId: string;
  sourceRouteLabel: string;
  unitBudgetCost: number;
  capacityDelta: number;
  maxQuantity: number;
  lockedReason: string | null;
}

export interface FactoryNewFactoryOption {
  routeId: string;
  routeLabel: string;
  unitBudgetCost: number;
  capacityDelta: number;
  maxQuantity: number;
  lockedReason: string | null;
}

export interface DecisionActionOption {
  actionId: string;
  label: string;
  cost: number;
  description?: string;
  techPointCost?: number;
  militaryPointCost?: number;
  techPointDelta?: number;
  militaryPointDelta?: number;
  ratioDelta?: Partial<IncomeAllocationRatio>;
  effects?: Record<string, number | Record<string, number>>;
  lockedReason: string | null;
}

export interface MilitaryActionOption {
  actionId: string;
  label: string;
  cost: number;
  maxPerRound: number;
  description?: string;
  effects?: Record<string, number | Record<string, number>>;
}

export interface DiplomacyActionOption {
  actionId: string;
  label: string;
  cost: number;
  targetRegion: string;
  targetRegionLabel: string;
  description?: string;
  isEstablished: boolean;
}

export type RegionLockReason =
  | "diplomacy_not_established"
  | "route_blocked";

export interface RegionAccessStatus {
  regionId: string;
  label: string;
  accessLevel: RegionAccessLevel;
  isAccessible: boolean;
  lockReason: RegionLockReason | null;
  isDiplomacyEstablished: boolean;
  isColonized: boolean;
  controller: string | null;
  acceptedGoods: string[];
  priceMultiplier: number;
}

export interface TechTreeChainTech {
  techId: string;
  label: string;
  budgetPool?: string;
  budgetCost?: number;
  unlocksGoods?: string[];
  unlocksRoutes?: string[];
  threshold: number;
  progress: number;
  effectiveThreshold: number;
  isUnlocked: boolean;
  isActive: boolean;
  canResearch: boolean;
  isDiscovered: boolean;
  breakthroughAttempts: number;
}

export interface TechTreeChain {
  chainId: string;
  label: string;
  techs: TechTreeChainTech[];
}

export interface TechTreeData {
  chains: TechTreeChain[];
  researchFacilities: number;
  facilityCost: number;
  progressPerFacility: number;
  activeResearch: string | null;
}

export interface TechTreeNode {
  techId: string;
  label: string;
  budgetPool: string;
  budgetCost: number;
  prerequisites: string[];
  isUnlocked: boolean;
  canResearch: boolean;
  unlocksGoods: string[];
  unlocksActions: string[];
  unlocksRoutes: string[];
}

export interface Phase1ProductionMode {
  mode: string;
  label: string;
  inputRatio: number;
  outputRatio: number;
  demandCoefficient: number;
  buildCost: number | null;
  upgradeCost: number | null;
  currentCapacity: number;
  requiredTech: string | null;
  isAvailable: boolean;
}

export interface Phase1EconomyWorkspace {
  capacityByMode: Record<string, number>;
  rawMaterials: number;
  goodsInventory: number;
  productionModes: Phase1ProductionMode[];
  domesticDemand: number;
  equilibriumPrice: number;
  domesticPricePreview: number;
  investmentPool: number;
  incomeAllocationRatio: Record<string, number>;
  marketMetrics: Record<string, number>;
  poolDeltaPreview?: {
    consumption: number;
    investment: number;
    fiscal: number;
  };
  consumptionPool?: number;
}

export interface DecisionPlayerPhaseWorkspace {
  countryCode: CountryCode;
  countryLabel: string;
  budgetPools: BudgetPools;
  incomeAllocationRatio: IncomeAllocationRatio;
  techPoints: number;
  militaryPoints: number;
  routeSummaries: FactoryRouteSummary[];
  productionOptions: FactoryProductionOption[];
  expansionOptions: FactoryExpansionOption[];
  upgradeOptions: FactoryUpgradeOption[];
  newFactoryOptions: FactoryNewFactoryOption[];
  activeEvents: ActiveEvent[];
  nationalAbility: NationalAbility | null;
  techTree: TechTreeData;
  domesticMarketActions: DecisionActionOption[];
  governmentActions: {
    pointPurchaseCosts: {
      tech: number;
      military: number;
    };
    strategies: DecisionActionOption[];
  };
  militaryWorkspace: {
    militaryPoints: number;
    army: Record<string, number>;
    navy: Record<string, number>;
    controlledRegions: number;
    establishedDiplomacy: string[];
    overseasCapacity: number;
    regionAccessStatus: RegionAccessStatus[];
    availableMilitaryActions: MilitaryActionOption[];
    availableDiplomacyActions: DiplomacyActionOption[];
    colonizationCapability: ColonizationCapability;
    colonizationOptions: ColonizationOption[];
    oceanNodes: OceanNodeOption[];
  };
  researchWorkspace: {
    techPoints: number;
    talentBranches: TalentBranchOption[];
    unlockedTalentCount: number;
  };
  governmentReforms?: GovernmentReformsWorkspace;
  phase1Economy?: Phase1EconomyWorkspace;
}

export interface ReformOption {
  reformId: string;
  path: "freedom" | "equality" | "national";
  label: string;
  adminCost: number;
  isCompleted: boolean;
  isBlocked: boolean;
  effects: Record<string, unknown>;
  unlocksPolicies: string[];
}

export interface PolicyOption {
  policyId: string;
  label: string;
  adminCostPerTurn: number;
  budgetCost: number;
  description: string;
  isActive: boolean;
  requiresReform: string | null;
  isUnlocked: boolean;
}

export interface GovernmentReformsWorkspace {
  administrationCapacity: number;
  adminPurchaseCost: number;
  completedReforms: string[];
  activePolicies: string[];
  ideologyLevels: Record<string, number>;
  ideologyMin: number;
  ideologyMax: number;
  revolutionThreshold: number;
  terminalReformsByIdeology: Record<string, string>;
  availableReforms: ReformOption[];
  availablePolicies: PolicyOption[];
}

export interface MarketInventoryOption {
  goodsId: string;
  label: string;
  quantity: number;
  priceAdjustment: number;
  priceTrend: PriceTrend;
}

export interface MarketRegionReferencePrice {
  regionId: string;
  label: string;
  unitPrice: number;
}

export interface MarketPlayerPhaseWorkspace {
  countryCode: CountryCode;
  countryLabel: string;
  budgetPools: BudgetPools;
  sellableInventory: Array<
    MarketInventoryOption & {
      domesticReferencePrice: number;
      overseasReferencePrices: MarketRegionReferencePrice[];
    }
  >;
  domesticMarketCapacity: number;
  overseasMarketCapacity: number;
  regionAccessStatus: RegionAccessStatus[];
  phase1Economy?: Phase1EconomyWorkspace;
  phase1GoodsAvailable?: number;
}

export interface SettlementPlayerPhaseWorkspace {
  countryCode: CountryCode;
  countryLabel: string;
  domesticSalesRevenue: number;
  overseasSalesRevenue: number;
  nationalIncome: number;
  budgetAllocation: BudgetPools;
  nextRatio: IncomeAllocationRatio;
  phase1Economy?: Phase1EconomyWorkspace;
}

export type PlayerPhaseWorkspace =
  | DecisionPlayerPhaseWorkspace
  | MarketPlayerPhaseWorkspace
  | SettlementPlayerPhaseWorkspace;

export interface DecisionPhaseWorkspace {
  phase: "decision";
  phaseLabel: string;
  submittedPlayerIds: string[];
  availableActionsByPlayer: Record<string, DecisionPlayerPhaseWorkspace>;
  players: Record<string, DecisionPlayerPhaseWorkspace>;
}

export interface MarketPhaseWorkspace {
  phase: "market";
  phaseLabel: string;
  submittedPlayerIds: string[];
  saleOptionsByPlayer: Record<string, MarketPlayerPhaseWorkspace>;
  players: Record<string, MarketPlayerPhaseWorkspace>;
}

export interface SettlementPhaseWorkspace {
  phase: "settlement";
  phaseLabel: string;
  submittedPlayerIds: string[];
  settlementByPlayer: Record<string, SettlementPlayerPhaseWorkspace>;
  players: Record<string, SettlementPlayerPhaseWorkspace>;
}

export type PhaseWorkspace =
  | DecisionPhaseWorkspace
  | MarketPhaseWorkspace
  | SettlementPhaseWorkspace;

export interface RankingWorkspace {
  leader: string | null;
  standings: RankingEntry[];
}

export interface PhaseSettlementCard {
  playerId: string;
  countryId: CountryCode;
  nationalIncome: number;
  colonyIncome?: number;
  budgetAllocation: BudgetPools;
}

export interface PhaseSettlementWorkspace {
  settledPhase: GamePhase | string | null;
  phaseLabel: string;
  headline: string;
  summaryCards: PhaseSettlementCard[];
  summaryLines: string[];
  autoSubmittedPlayerIds: string[];
  previousPhase: GamePhase | null;
}

export interface GameSnapshot {
  snapshotId: string;
  gameId: string;
  round: number;
  maxRounds: number;
  phase: GamePhase;
  rulesVersion?: string;
  phaseDeadlineAt: string | null;
  nationalStateByPlayer: Record<string, NationalState>;
  regionStates: RegionState[];
  oceanNodeStates: OceanNodeState[];
  ranking: RankingEntry[];
  phaseWorkspace: PhaseWorkspace;
  rankingWorkspace: RankingWorkspace;
  lastSettlementSummary: Record<string, unknown>;
  lastSettlementWorkspace: PhaseSettlementWorkspace | null;
  activeEvents: ActiveEvent[];
  marketPriceAdjustments: Record<string, number>;
  eventDeck?: string[];
}

export interface PlayerTurnInput {
  gameId: string;
  roundNo: number;
  phase: GamePhase;
  playerId: string;
  submissionStatus: PlayerSubmissionStatus;
  payload: Record<string, unknown>;
  submittedAt: string | null;
  isTimeoutGenerated: boolean;
}

export interface GameLog {
  gameId: string;
  roundNo: number;
  phase: GamePhase | null;
  kind: string;
  message: string;
  details: Record<string, unknown>;
  createdAt: string | null;
}

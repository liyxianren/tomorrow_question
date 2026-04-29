from __future__ import annotations

from typing import Any, Literal, NotRequired, TypedDict

from .enums import ConnectionStatus, CountryCode, GamePhase, PlayerSubmissionStatus, RegionAccessLevel, RoomStatus


class RoomMemberPayload(TypedDict):
    playerId: str
    nickname: str
    selectedCountry: CountryCode | None
    connectionStatus: ConnectionStatus
    isReady: bool
    memberType: NotRequired[Literal["human", "bot"]]
    botProfileKey: NotRequired[str | None]


class RoomPayload(TypedDict):
    roomCode: str
    status: RoomStatus
    hostPlayerId: str
    memberPlayerIds: list[str]
    members: list[RoomMemberPayload]
    countrySlots: dict[str, str | None]
    currentGameId: str | None
    lastActivityAt: str | None


class PlayerSessionPayload(TypedDict):
    playerId: str
    sessionId: str
    nickname: str
    roomCode: str | None
    selectedCountry: CountryCode | None
    connectionStatus: ConnectionStatus
    lastSeenAt: str | None


class GamePayload(TypedDict):
    gameId: str
    roomCode: str
    currentRound: int
    totalRounds: int
    currentPhase: GamePhase
    isFinished: bool
    activeSnapshotId: str | None


class IncomeAllocationRatioPayload(TypedDict):
    domesticMarket: float
    factory: float
    governmentFiscal: float


class BudgetPoolsPayload(TypedDict):
    domesticMarket: int
    factory: int
    governmentFiscal: int


class Phase1CapacityByModePayload(TypedDict):
    idle: int
    handicraft: int
    mechanized: int
    steam: int
    electrified: int


class Phase1MarketMetricsPayload(TypedDict):
    demand: float
    supply: float
    equilibriumPrice: float
    finalPrice: float
    soldQuantity: float
    unsoldQuantity: float
    revenue: float


class Phase1IncomeAllocationRatioPayload(TypedDict):
    consumption: float
    investment: float
    fiscal: float


class Phase1EconomyPayload(TypedDict):
    rawMaterials: int
    goodsInventory: int
    capacityByMode: Phase1CapacityByModePayload
    marketMetrics: Phase1MarketMetricsPayload
    incomeAllocationRatio: Phase1IncomeAllocationRatioPayload


class NationalStatePayload(TypedDict):
    countryId: CountryCode
    domesticSalesRevenue: int
    overseasSalesRevenue: int
    nationalIncome: int
    cumulativeNationalIncome: int
    incomeAllocationRatio: IncomeAllocationRatioPayload
    budgetPools: BudgetPoolsPayload
    techPoints: int
    militaryPoints: int
    productionCapacity: dict[str, int]
    pendingProductionCapacity: dict[str, int]
    goodsStock: dict[str, int]
    rawMaterialUsage: dict[str, int]
    research: dict[str, int]
    researchFacilities: dict[str, int]
    unlockedTechs: list[str]
    goodsAllocation: dict[str, int]
    army: dict[str, int]
    navy: dict[str, int]
    administrationCapacity: int
    ideologyLevels: dict[str, int]
    reforms: list[str]
    policies: list[str]
    completedReforms: list[str]
    activePolicies: list[str]
    incomeSummary: dict[str, Any]
    unlockedTalents: list[str]
    establishedDiplomacy: list[str]
    usedAbilities: list[str]
    temporaryEffects: dict[str, Any]
    phase1Economy: Phase1EconomyPayload


class RegionStatePayload(TypedDict):
    regionId: str
    accessLevel: RegionAccessLevel
    marketSupply: dict[str, int]
    marketPrice: dict[str, int]
    controller: str | None
    garrison: dict[str, int]
    independence: int
    resourceLimit: dict[str, int]


class OceanNodeStatePayload(TypedDict):
    nodeId: str
    navyByCountry: dict[str, int]
    controller: str | None
    isBlockaded: bool
    reachableRoutes: list[str]


class RankingEntryPayload(TypedDict):
    rank: int
    playerId: str
    countryId: CountryCode
    cumulativeNationalIncome: int
    tieBreak: dict[str, int]


class ProductionOrderPayload(TypedDict):
    goodsId: str
    quantity: int


class ExpansionOrderPayload(TypedDict):
    routeId: str
    quantity: int


class UpgradeOrderPayload(TypedDict):
    routeId: str
    quantity: int


class NewFactoryOrderPayload(TypedDict):
    routeId: str
    quantity: int


class FactoryPlanPayload(TypedDict):
    productionOrders: list[ProductionOrderPayload]
    expansionOrders: list[ExpansionOrderPayload]
    upgradeOrders: list[UpgradeOrderPayload]
    newFactoryOrders: list[NewFactoryOrderPayload]


class DomesticMarketActionSelectionPayload(TypedDict):
    actionId: str


class DomesticMarketPlanPayload(TypedDict):
    domesticMarketActions: list[DomesticMarketActionSelectionPayload]


class PointPurchasePayload(TypedDict):
    pointType: Literal["tech", "military"]
    quantity: int


class GovernmentActionSelectionPayload(TypedDict):
    actionId: str


class TechResearchSelectionPayload(TypedDict):
    techId: str


class GovernmentPlanPayload(TypedDict):
    pointPurchases: list[PointPurchasePayload]
    strategySelections: list[GovernmentActionSelectionPayload]
    techResearch: list[TechResearchSelectionPayload]


class MilitaryActionSelectionPayload(TypedDict):
    actionId: str


class DiplomacyActionSelectionPayload(TypedDict):
    actionId: str


class ConquestActionSelectionPayload(TypedDict, total=False):
    regionId: str
    infantry: int
    artillery: int


class LootingActionSelectionPayload(TypedDict, total=False):
    regionId: str
    resourceType: str


class MilitaryPlanPayload(TypedDict, total=False):
    militaryActions: list[MilitaryActionSelectionPayload]
    diplomacyActions: list[DiplomacyActionSelectionPayload]
    conquestActions: list[ConquestActionSelectionPayload]
    lootingActions: list[LootingActionSelectionPayload]
    navalDeployment: dict[str, int]


class AbilitySelectionPayload(TypedDict, total=False):
    abilityId: str
    targetIdeology: Literal["liberalism", "egalitarianism", "nationalism"]


class Phase1BuildOrderPayload(TypedDict):
    mode: str
    quantity: int


class Phase1UpgradeOrderPayload(TypedDict):
    sourceMode: str
    targetMode: str
    quantity: int


class Phase1ProductionPayload(TypedDict, total=False):
    rawMaterialAssignments: dict[str, int]
    buildOrders: list[Phase1BuildOrderPayload]
    upgradeOrders: list[Phase1UpgradeOrderPayload]


class DecisionSubmissionPayload(TypedDict):
    factoryPlan: FactoryPlanPayload
    domesticMarketPlan: DomesticMarketPlanPayload
    governmentPlan: GovernmentPlanPayload
    militaryPlan: MilitaryPlanPayload
    abilitySelection: NotRequired[AbilitySelectionPayload]
    phase1Production: NotRequired[Phase1ProductionPayload]


class SaleOrderPayload(TypedDict):
    goodsId: str
    market: Literal["domestic", "overseas"]
    quantity: int
    regionId: NotRequired[str]


class Phase1ExternalAllocationPayload(TypedDict):
    marketId: str
    quantity: int


class Phase1MarketPayload(TypedDict, total=False):
    domesticAllocation: int
    externalAllocations: list[Phase1ExternalAllocationPayload]


class MarketSubmissionPayload(TypedDict):
    saleOrders: list[SaleOrderPayload]
    phase1Market: NotRequired[Phase1MarketPayload]


class GameSnapshotPayload(TypedDict):
    snapshotId: str
    gameId: str
    round: int
    maxRounds: int
    phase: GamePhase
    rulesVersion: str
    phaseDeadlineAt: str | None
    nationalStateByPlayer: dict[str, NationalStatePayload]
    regionStates: list[RegionStatePayload]
    oceanNodeStates: list[OceanNodeStatePayload]
    ranking: list[RankingEntryPayload]
    phaseWorkspace: dict[str, Any]
    rankingWorkspace: dict[str, Any]
    lastSettlementSummary: dict[str, Any]
    lastSettlementWorkspace: dict[str, Any] | None
    activeEvents: list[dict[str, Any]]
    marketPriceAdjustments: dict[str, int]
    eventDeck: list[str]
    lootedRegionsThisTurn: NotRequired[list[str]]


class PlayerTurnInputPayload(TypedDict):
    gameId: str
    roundNo: int
    phase: GamePhase
    playerId: str
    submissionStatus: PlayerSubmissionStatus
    payload: dict[str, Any]
    submittedAt: str | None
    isTimeoutGenerated: bool


class GameLogPayload(TypedDict):
    gameId: str
    roundNo: int
    phase: GamePhase | None
    kind: str
    message: str
    details: dict[str, Any]
    createdAt: str | None


class RoomContextPayload(TypedDict):
    room: RoomPayload
    activeGame: NotRequired[GamePayload | None]
    activeSnapshot: NotRequired[GameSnapshotPayload | None]

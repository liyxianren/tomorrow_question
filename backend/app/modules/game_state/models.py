from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Mapping

from app.contracts.enums import CountryCode, GamePhase, RegionAccessLevel
from app.contracts.models import (
    GamePayload,
    GameSnapshotPayload,
    NationalStatePayload,
    OceanNodeStatePayload,
    Phase1EconomyPayload,
    RankingEntryPayload,
    RegionStatePayload,
)


RULES_VERSION_V2 = "v2"
DEFAULT_INCOME_ALLOCATION_RATIO = {
    "domesticMarket": 3.0,
    "factory": 3.0,
    "governmentFiscal": 4.0,
}
DEFAULT_TEMPORARY_EFFECTS = {
    "domesticMarketCapacityBonus": 0,
    "domesticPriceBonus": 0,
    "overseasMarketCapacityBonus": 0,
    "overseasPriceBonus": 0,
    "productionOutputMultiplier": 1,
}

# Phase-1 economy (2.0) scaffolding. Held side-by-side with the legacy
# runtime fields above; gameplay still reads the legacy structures.
DEFAULT_PHASE1_CAPACITY_BY_MODE: dict[str, int] = {
    "idle": 0,
    "handicraft": 0,
    "mechanized": 0,
    "steam": 0,
    "electrified": 0,
}
DEFAULT_PHASE1_MARKET_METRICS: dict[str, float] = {
    "demand": 0,
    "supply": 0,
    "equilibriumPrice": 0,
    "finalPrice": 0,
    "soldQuantity": 0,
    "unsoldQuantity": 0,
    "revenue": 0,
}
# M1 normalized 5:3:2 split; sits alongside legacy income_allocation_ratio.
DEFAULT_PHASE1_INCOME_ALLOCATION_RATIO: dict[str, float] = {
    "consumption": 0.5,
    "investment": 0.3,
    "fiscal": 0.2,
}


def _copy_int_mapping(values: Mapping[str, int]) -> dict[str, int]:
    return {key: int(value) for key, value in values.items()}


def _copy_float_mapping(values: Mapping[str, float]) -> dict[str, float]:
    return {key: float(value) for key, value in values.items()}


def _copy_string_list(values: list[str]) -> list[str]:
    return list(values)


def _copy_any_mapping(values: Mapping[str, Any]) -> dict[str, Any]:
    return deepcopy(dict(values))


def _serialize_datetime(value: datetime | None) -> str | None:
    return None if value is None else value.isoformat()


def _parse_datetime(value: str | None) -> datetime | None:
    return None if value is None else datetime.fromisoformat(value)


@dataclass(slots=True)
class Phase1EconomyState:
    raw_materials: int = 0
    goods_inventory: int = 0
    capacity_by_mode: dict[str, int] = field(
        default_factory=lambda: dict(DEFAULT_PHASE1_CAPACITY_BY_MODE)
    )
    market_metrics: dict[str, float] = field(
        default_factory=lambda: dict(DEFAULT_PHASE1_MARKET_METRICS)
    )
    income_allocation_ratio: dict[str, float] = field(
        default_factory=lambda: dict(DEFAULT_PHASE1_INCOME_ALLOCATION_RATIO)
    )

    def to_payload(self) -> Phase1EconomyPayload:
        return {
            "rawMaterials": int(self.raw_materials),
            "goodsInventory": int(self.goods_inventory),
            "capacityByMode": _copy_int_mapping(
                {**DEFAULT_PHASE1_CAPACITY_BY_MODE, **self.capacity_by_mode}
            ),
            "marketMetrics": _copy_float_mapping(
                {**DEFAULT_PHASE1_MARKET_METRICS, **self.market_metrics}
            ),
            "incomeAllocationRatio": _copy_float_mapping(
                {**DEFAULT_PHASE1_INCOME_ALLOCATION_RATIO, **self.income_allocation_ratio}
            ),
        }

    @classmethod
    def from_payload(cls, payload: Phase1EconomyPayload | None) -> "Phase1EconomyState":
        if payload is None:
            return cls()
        return cls(
            raw_materials=int(payload.get("rawMaterials", 0)),
            goods_inventory=int(payload.get("goodsInventory", 0)),
            capacity_by_mode=_copy_int_mapping(
                {**DEFAULT_PHASE1_CAPACITY_BY_MODE, **payload.get("capacityByMode", {})}
            ),
            market_metrics=_copy_float_mapping(
                {**DEFAULT_PHASE1_MARKET_METRICS, **payload.get("marketMetrics", {})}
            ),
            income_allocation_ratio=_copy_float_mapping(
                {**DEFAULT_PHASE1_INCOME_ALLOCATION_RATIO, **payload.get("incomeAllocationRatio", {})}
            ),
        )


@dataclass(slots=True)
class PlayerState:
    player_id: str
    country: CountryCode
    domestic_sales_revenue: int = 0
    overseas_sales_revenue: int = 0
    national_income: int = 0
    cumulative_national_income: int = 0
    income_allocation_ratio: dict[str, float] = field(
        default_factory=lambda: dict(DEFAULT_INCOME_ALLOCATION_RATIO)
    )
    budget_pools: dict[str, int] = field(
        default_factory=lambda: {"domesticMarket": 0, "factory": 0, "governmentFiscal": 0}
    )
    tech_points: int = 1
    army_cap: int = 3
    production_capacity: dict[str, int] = field(default_factory=dict)
    pending_production_capacity: dict[str, int] = field(default_factory=dict)
    # Only key 'phase1_goods' used post-Phase1; dict retained for legacy compatibility
    goods_stock: dict[str, int] = field(default_factory=dict)
    raw_material_usage: dict[str, int] = field(default_factory=dict)
    research: dict[str, int] = field(default_factory=dict)
    research_facilities: dict[str, int] = field(default_factory=dict)
    unlocked_techs: list[str] = field(default_factory=list)
    active_research: str | None = None
    research_progress: dict[str, int] = field(default_factory=dict)
    breakthrough_attempts: dict[str, int] = field(default_factory=dict)
    goods_allocation: dict[str, int] = field(default_factory=dict)
    army: dict[str, int] = field(default_factory=dict)
    navy: dict[str, int] = field(default_factory=dict)
    administration_capacity: int = 1
    base_admin_capacity: int = 1
    ideology_levels: dict[str, int] = field(default_factory=dict)
    reforms: list[str] = field(default_factory=list)
    policies: list[str] = field(default_factory=list)
    completed_reforms: list[str] = field(default_factory=list)
    active_policies: list[str] = field(default_factory=list)
    income_summary: dict[str, Any] = field(default_factory=dict)
    controlled_regions_bonus: int = 0
    established_diplomacy: list[str] = field(default_factory=list)
    colonization_unlocked: bool = False
    unlocked_talents: list[str] = field(default_factory=list)
    used_abilities: list[str] = field(default_factory=list)
    temporary_effects: dict[str, Any] = field(default_factory=lambda: dict(DEFAULT_TEMPORARY_EFFECTS))
    phase1_economy: Phase1EconomyState = field(default_factory=Phase1EconomyState)

    def to_payload(self) -> NationalStatePayload:
        return {
            "countryId": self.country,
            "domesticSalesRevenue": int(self.domestic_sales_revenue),
            "overseasSalesRevenue": int(self.overseas_sales_revenue),
            "nationalIncome": int(self.national_income),
            "cumulativeNationalIncome": int(self.cumulative_national_income),
            "incomeAllocationRatio": _copy_float_mapping(self.income_allocation_ratio),
            "budgetPools": _copy_int_mapping(self.budget_pools),
            "techPoints": int(self.tech_points),
            "armyCap": int(self.army_cap),
            "productionCapacity": _copy_int_mapping(self.production_capacity),
            "pendingProductionCapacity": _copy_int_mapping(self.pending_production_capacity),
            "goodsStock": _copy_int_mapping(self.goods_stock),
            "rawMaterialUsage": _copy_int_mapping(self.raw_material_usage),
            "research": _copy_int_mapping(self.research),
            "researchFacilities": _copy_int_mapping(self.research_facilities),
            "unlockedTechs": _copy_string_list(self.unlocked_techs),
            "activeResearch": self.active_research,
            "researchProgress": _copy_int_mapping(self.research_progress),
            "breakthroughAttempts": _copy_int_mapping(self.breakthrough_attempts),
            "goodsAllocation": _copy_int_mapping(self.goods_allocation),
            "army": _copy_int_mapping(self.army),
            "navy": _copy_int_mapping(self.navy),
            "administrationCapacity": int(self.administration_capacity),
            "baseAdministrationCapacity": int(self.base_admin_capacity),
            "ideologyLevels": _copy_int_mapping(self.ideology_levels),
            "reforms": _copy_string_list(self.reforms),
            "policies": _copy_string_list(self.policies),
            "completedReforms": _copy_string_list(self.completed_reforms),
            "activePolicies": _copy_string_list(self.active_policies),
            "incomeSummary": deepcopy(self.income_summary),
            "unlockedTalents": _copy_string_list(self.unlocked_talents),
            "establishedDiplomacy": _copy_string_list(self.established_diplomacy),
            "colonizationUnlocked": bool(self.colonization_unlocked),
            "usedAbilities": _copy_string_list(self.used_abilities),
            "temporaryEffects": _copy_any_mapping(self.temporary_effects),
            "phase1Economy": self.phase1_economy.to_payload(),
        }

    @classmethod
    def from_payload(cls, player_id: str, payload: NationalStatePayload) -> "PlayerState":
        return cls(
            player_id=player_id,
            country=CountryCode(payload["countryId"]),
            domestic_sales_revenue=int(payload["domesticSalesRevenue"]),
            overseas_sales_revenue=int(payload["overseasSalesRevenue"]),
            national_income=int(payload["nationalIncome"]),
            cumulative_national_income=int(payload["cumulativeNationalIncome"]),
            income_allocation_ratio=_copy_float_mapping(payload["incomeAllocationRatio"]),
            budget_pools=_copy_int_mapping(payload["budgetPools"]),
            tech_points=int(payload["techPoints"]),
            army_cap=int(payload.get("armyCap", 3)),
            production_capacity=_copy_int_mapping(payload["productionCapacity"]),
            pending_production_capacity=_copy_int_mapping(payload["pendingProductionCapacity"]),
            goods_stock=_copy_int_mapping(payload["goodsStock"]),
            raw_material_usage=_copy_int_mapping(payload["rawMaterialUsage"]),
            research=_copy_int_mapping(payload["research"]),
            research_facilities=_copy_int_mapping(payload["researchFacilities"]),
            unlocked_techs=_copy_string_list(payload["unlockedTechs"]),
            active_research=payload.get("activeResearch"),
            research_progress=_copy_int_mapping(payload.get("researchProgress", {})),
            breakthrough_attempts=_copy_int_mapping(payload.get("breakthroughAttempts", {})),
            goods_allocation=_copy_int_mapping(payload["goodsAllocation"]),
            army=_copy_int_mapping(payload["army"]),
            navy=_copy_int_mapping(payload["navy"]),
            administration_capacity=int(payload["administrationCapacity"]),
            base_admin_capacity=int(payload.get("baseAdministrationCapacity", int(payload["administrationCapacity"]))),
            ideology_levels=_copy_int_mapping(payload["ideologyLevels"]),
            reforms=_copy_string_list(payload["reforms"]),
            policies=_copy_string_list(payload["policies"]),
            completed_reforms=_copy_string_list(payload.get("completedReforms", [])),
            active_policies=_copy_string_list(payload.get("activePolicies", [])),
            income_summary=deepcopy(payload["incomeSummary"]),
            unlocked_talents=_copy_string_list(payload.get("unlockedTalents", [])),
            established_diplomacy=_copy_string_list(payload.get("establishedDiplomacy", [])),
            colonization_unlocked=bool(payload.get("colonizationUnlocked", False)),
            used_abilities=_copy_string_list(payload.get("usedAbilities", [])),
            temporary_effects=_copy_any_mapping(payload.get("temporaryEffects", DEFAULT_TEMPORARY_EFFECTS)),
            phase1_economy=Phase1EconomyState.from_payload(payload.get("phase1Economy")),
        )


@dataclass(slots=True)
class RegionState:
    region_id: str
    access_level: RegionAccessLevel
    market_supply: dict[str, int] = field(default_factory=dict)
    market_price: dict[str, int] = field(default_factory=dict)
    controller: str | None = None
    garrison: dict[str, int] = field(default_factory=dict)
    independence: int = 0
    resource_limit: dict[str, int] = field(default_factory=dict)

    def to_payload(self) -> RegionStatePayload:
        return {
            "regionId": self.region_id,
            "accessLevel": self.access_level,
            "marketSupply": _copy_int_mapping(self.market_supply),
            "marketPrice": _copy_int_mapping(self.market_price),
            "controller": self.controller,
            "garrison": _copy_int_mapping(self.garrison),
            "independence": self.independence,
            "resourceLimit": _copy_int_mapping(self.resource_limit),
        }

    @classmethod
    def from_payload(cls, payload: RegionStatePayload) -> "RegionState":
        return cls(
            region_id=payload["regionId"],
            access_level=RegionAccessLevel(payload["accessLevel"]),
            market_supply=_copy_int_mapping(payload["marketSupply"]),
            market_price=_copy_int_mapping(payload["marketPrice"]),
            controller=payload["controller"],
            garrison=_copy_int_mapping(payload["garrison"]),
            independence=int(payload["independence"]),
            resource_limit=_copy_int_mapping(payload["resourceLimit"]),
        )


@dataclass(slots=True)
class OceanNodeState:
    node_id: str
    navy_by_country: dict[str, int] = field(default_factory=dict)
    controller: str | None = None
    is_blockaded: bool = False
    reachable_routes: list[str] = field(default_factory=list)

    def total_power(self) -> int:
        return sum(self.navy_by_country.values())

    def to_payload(self) -> OceanNodeStatePayload:
        return {
            "nodeId": self.node_id,
            "navyByCountry": _copy_int_mapping(self.navy_by_country),
            "controller": self.controller,
            "isBlockaded": self.is_blockaded,
            "reachableRoutes": _copy_string_list(self.reachable_routes),
        }

    @classmethod
    def from_payload(cls, payload: OceanNodeStatePayload) -> "OceanNodeState":
        return cls(
            node_id=payload["nodeId"],
            navy_by_country=_copy_int_mapping(payload["navyByCountry"]),
            controller=payload["controller"],
            is_blockaded=bool(payload["isBlockaded"]),
            reachable_routes=_copy_string_list(payload["reachableRoutes"]),
        )


@dataclass(slots=True)
class GameSnapshot:
    snapshot_id: str
    game_id: str
    round_no: int
    max_rounds: int = 15
    phase: GamePhase = GamePhase.DECISION
    rules_version: str = RULES_VERSION_V2
    phase_deadline_at: datetime | None = None
    player_states: list[PlayerState] = field(default_factory=list)
    region_states: list[RegionState] = field(default_factory=list)
    ocean_node_states: list[OceanNodeState] = field(default_factory=list)
    ranking: list[RankingEntryPayload] = field(default_factory=list)
    last_settlement_summary: dict[str, Any] = field(default_factory=dict)
    phase_workspace: dict[str, Any] = field(default_factory=dict)
    ranking_workspace: dict[str, Any] = field(default_factory=dict)
    last_settlement_workspace: dict[str, Any] | None = None
    active_events: list[dict[str, Any]] = field(default_factory=list)
    market_price_adjustments: dict[str, int] = field(default_factory=dict)
    event_deck: list[str] = field(default_factory=list)
    looted_regions_this_turn: set[str] = field(default_factory=set)

    def to_payload(self) -> GameSnapshotPayload:
        from .workspaces import build_phase_settlement_workspace, build_phase_workspace, build_ranking_workspace

        phase_workspace = deepcopy(self.phase_workspace) if self.phase_workspace else build_phase_workspace(self)
        ranking_workspace = deepcopy(self.ranking_workspace) if self.ranking_workspace else build_ranking_workspace(self)
        last_settlement_workspace = (
            deepcopy(self.last_settlement_workspace)
            if self.last_settlement_workspace is not None
            else build_phase_settlement_workspace(self)
        )
        ranking = deepcopy(self.ranking) if self.ranking else ranking_workspace.get("standings", [])
        return {
            "snapshotId": self.snapshot_id,
            "gameId": self.game_id,
            "round": self.round_no,
            "maxRounds": self.max_rounds,
            "phase": self.phase,
            "rulesVersion": self.rules_version,
            "phaseDeadlineAt": _serialize_datetime(self.phase_deadline_at),
            "nationalStateByPlayer": {
                player_state.player_id: player_state.to_payload() for player_state in self.player_states
            },
            "regionStates": [region_state.to_payload() for region_state in self.region_states],
            "oceanNodeStates": [node_state.to_payload() for node_state in self.ocean_node_states],
            "ranking": deepcopy(ranking),
            "phaseWorkspace": phase_workspace,
            "rankingWorkspace": ranking_workspace,
            "lastSettlementSummary": deepcopy(self.last_settlement_summary),
            "lastSettlementWorkspace": last_settlement_workspace,
            "activeEvents": deepcopy(self.active_events),
            "marketPriceAdjustments": _copy_int_mapping(self.market_price_adjustments),
            "eventDeck": _copy_string_list(self.event_deck),
            "lootedRegionsThisTurn": sorted(self.looted_regions_this_turn),
        }

    @classmethod
    def from_payload(cls, payload: GameSnapshotPayload) -> "GameSnapshot":
        snapshot = cls(
            snapshot_id=payload["snapshotId"],
            game_id=payload["gameId"],
            round_no=int(payload["round"]),
            max_rounds=int(payload["maxRounds"]),
            phase=GamePhase(payload["phase"]),
            rules_version=str(payload.get("rulesVersion") or ""),
            phase_deadline_at=_parse_datetime(payload["phaseDeadlineAt"]),
            player_states=[
                PlayerState.from_payload(player_id, state_payload)
                for player_id, state_payload in payload["nationalStateByPlayer"].items()
            ],
            region_states=[RegionState.from_payload(item) for item in payload["regionStates"]],
            ocean_node_states=[OceanNodeState.from_payload(item) for item in payload["oceanNodeStates"]],
            ranking=deepcopy(payload.get("ranking", [])),
            last_settlement_summary=deepcopy(payload.get("lastSettlementSummary", {})),
            phase_workspace=deepcopy(payload.get("phaseWorkspace", {})),
            ranking_workspace=deepcopy(payload.get("rankingWorkspace", {})),
            last_settlement_workspace=deepcopy(payload.get("lastSettlementWorkspace")),
            active_events=deepcopy(payload.get("activeEvents", [])),
            market_price_adjustments=_copy_int_mapping(payload.get("marketPriceAdjustments", {})),
            event_deck=_copy_string_list(payload.get("eventDeck", [])),
            looted_regions_this_turn=set(payload.get("lootedRegionsThisTurn", []) or []),
        )
        if snapshot.rules_version != RULES_VERSION_V2:
            raise ValueError("Legacy snapshot is not compatible with rulesVersion v2. Please restart the room.")
        if not _snapshot_has_complete_workspaces(snapshot):
            from .workspaces import hydrate_snapshot_workspaces

            hydrate_snapshot_workspaces(snapshot)
        return snapshot


def _snapshot_has_complete_workspaces(snapshot: GameSnapshot) -> bool:
    phase_workspace_ready = _phase_workspace_is_complete(snapshot)
    ranking_workspace_ready = (
        isinstance(snapshot.ranking_workspace, Mapping)
        and isinstance(snapshot.ranking_workspace.get("standings"), list)
    )
    settlement_workspace_ready = (
        snapshot.last_settlement_workspace is None
        if not snapshot.last_settlement_summary
        else (
            isinstance(snapshot.last_settlement_workspace, Mapping)
            and isinstance(snapshot.last_settlement_workspace.get("summaryCards"), list)
        )
    )
    return phase_workspace_ready and ranking_workspace_ready and settlement_workspace_ready


def _phase_workspace_is_complete(snapshot: GameSnapshot) -> bool:
    phase_workspace = snapshot.phase_workspace
    if not isinstance(phase_workspace, Mapping):
        return False
    if phase_workspace.get("phase") != snapshot.phase:
        return False

    players = phase_workspace.get("players")
    if not isinstance(players, Mapping):
        return False

    if snapshot.phase == GamePhase.DECISION:
        required_keys = (
            "routeSummaries",
            "productionOptions",
            "expansionOptions",
            "upgradeOptions",
            "newFactoryOptions",
            "activeEvents",
            "techTree",
            "domesticMarketActions",
            "baseBudgetPools",
            "marketRegulationAllowance",
            "governmentActions",
            "militaryWorkspace",
            "nationalAbility",
        )
    elif snapshot.phase == GamePhase.MARKET:
        required_keys = (
            "sellableInventory",
            "domesticMarketCapacity",
            "overseasMarketCapacity",
            "regionAccessStatus",
        )
    else:
        required_keys = (
            "budgetAllocation",
            "nextRatio",
        )

    for player_state in snapshot.player_states:
        player_workspace = players.get(player_state.player_id)
        if not isinstance(player_workspace, Mapping):
            return False
        for key in required_keys:
            if key not in player_workspace:
                return False
        if snapshot.phase == GamePhase.DECISION:
            list_keys = (
                "routeSummaries",
                "productionOptions",
                "expansionOptions",
                "upgradeOptions",
                "newFactoryOptions",
                "activeEvents",
                "domesticMarketActions",
            )
            if not all(isinstance(player_workspace.get(key), list) for key in list_keys):
                return False
            if not isinstance(player_workspace.get("techTree"), Mapping):
                return False
            if player_workspace.get("nationalAbility") is not None and not isinstance(player_workspace.get("nationalAbility"), Mapping):
                return False
            if not isinstance(player_workspace.get("governmentActions"), Mapping):
                return False
        if snapshot.phase == GamePhase.MARKET:
            if not isinstance(player_workspace.get("sellableInventory"), list):
                return False
        if snapshot.phase == GamePhase.SETTLEMENT:
            if not isinstance(player_workspace.get("budgetAllocation"), Mapping):
                return False
    return True


@dataclass(slots=True)
class Game:
    game_id: str
    room_code: str
    current_round: int = 1
    total_rounds: int = 15
    current_phase: GamePhase = GamePhase.DECISION
    is_finished: bool = False
    active_snapshot_id: str | None = None

    def set_active_snapshot(self, snapshot: GameSnapshot) -> None:
        self.current_round = snapshot.round_no
        self.current_phase = snapshot.phase
        self.active_snapshot_id = snapshot.snapshot_id

    def to_payload(self) -> GamePayload:
        return {
            "gameId": self.game_id,
            "roomCode": self.room_code,
            "currentRound": self.current_round,
            "totalRounds": self.total_rounds,
            "currentPhase": self.current_phase,
            "isFinished": self.is_finished,
            "activeSnapshotId": self.active_snapshot_id,
        }

    @classmethod
    def from_payload(cls, payload: GamePayload) -> "Game":
        return cls(
            game_id=payload["gameId"],
            room_code=payload["roomCode"],
            current_round=int(payload["currentRound"]),
            total_rounds=int(payload["totalRounds"]),
            current_phase=GamePhase(payload["currentPhase"]),
            is_finished=bool(payload["isFinished"]),
            active_snapshot_id=payload["activeSnapshotId"],
        )

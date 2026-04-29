from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.contracts.enums import RegionAccessLevel


@dataclass(frozen=True, slots=True)
class GlobalBalanceConfig:
    total_rounds: int
    phase_duration_seconds: int
    base_income_per_round: int
    base_overseas_capacity: int
    ranking_tie_break_order: tuple[str, ...]
    raw_materials_per_turn: int = 0


@dataclass(frozen=True, slots=True)
class CountryBalanceConfig:
    budget_pools: dict[str, int]
    income_allocation_ratio: dict[str, float]
    tech_points: int
    military_points: int
    production_capacity: dict[str, int]
    goods_stock: dict[str, int]
    army: dict[str, int]
    navy: dict[str, int]
    administration_capacity: int
    research_facilities: dict[str, int]
    ideology_levels: dict[str, int]
    initial_goods: tuple[str, ...] = ()
    initial_diplomacy: tuple[str, ...] = ()
    initial_raw_materials: int = 0
    raw_materials_per_turn: int = 20


@dataclass(frozen=True, slots=True)
class ProductionBalanceConfig:
    levels: tuple[str, ...]
    output_multipliers: dict[str, int]
    expansion_costs: dict[str, int]
    upgrade_costs: dict[str, int]
    new_factory_costs: dict[str, int]
    upgrade_source_levels: dict[str, str]
    goods: dict[str, "ProductionGoodConfig"]


@dataclass(frozen=True, slots=True)
class ProductionGoodConfig:
    goods_id: str
    label: str
    route_id: str
    unit_budget_cost: int
    unit_output: int
    domestic_reference_price: int
    overseas_base_price: int
    demand_threshold: int
    price_floor: int
    price_ceiling: int
    overseas_price_ceiling: int
    usage_hint: str


@dataclass(frozen=True, slots=True)
class TechnologyBalanceConfig:
    research_facility_cost: int
    research_facility_progress_per_turn: int
    breakthrough_die_sides: int
    route_unlocks: dict[str, list[str]]
    chains: dict[str, "ResearchChainConfig"]


@dataclass(frozen=True, slots=True)
class ChainTechConfig:
    tech_id: str
    label: str
    threshold: int


@dataclass(frozen=True, slots=True)
class ResearchChainConfig:
    chain_id: str
    label: str
    techs: tuple[ChainTechConfig, ...]


@dataclass(frozen=True, slots=True)
class MarketBalanceConfig:
    region_goods_premiums: dict[str, dict[str, int]]


@dataclass(frozen=True, slots=True)
class RegionBlueprintConfig:
    region_id: str
    access_level: RegionAccessLevel
    resource_limit: dict[str, int]
    required_nodes: tuple[str, ...]
    colonizable: bool = False
    price_multiplier: float = 1.0
    min_army: int = 1


@dataclass(frozen=True, slots=True)
class OceanNodeBlueprintConfig:
    node_id: str
    reachable_routes: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class RegionsBalanceConfig:
    region_blueprints: dict[str, RegionBlueprintConfig]
    ocean_node_blueprints: dict[str, OceanNodeBlueprintConfig]


@dataclass(frozen=True, slots=True)
class MilitaryBalanceConfig:
    army_unit_cost: int
    navy_unit_cost: int
    ocean_control_threshold: int
    independence_threshold: int
    colonization_unlock_cost: int = 10
    colonization_military_point_cost: int = 3
    colonization_income_per_colony_per_round: int = 5
    max_colonizations_per_round: int = 1


@dataclass(frozen=True, slots=True)
class MilitaryActionConfig:
    action_id: str
    label: str
    budget_pool_cost: int
    max_per_round: int
    effects: dict[str, Any] = field(default_factory=dict)
    description: str = ""
    military_point_cost: int = 0


@dataclass(frozen=True, slots=True)
class DiplomacyActionConfig:
    action_id: str
    label: str
    budget_pool_cost: int
    target_region: str
    description: str = ""


@dataclass(frozen=True, slots=True)
class DecisionActionConfig:
    action_id: str
    label: str
    budget_pool_cost: int
    tech_point_cost: int = 0
    military_point_cost: int = 0
    ratio_delta: dict[str, float] = field(default_factory=dict)
    effects: dict[str, Any] = field(default_factory=dict)
    description: str = ""


@dataclass(frozen=True, slots=True)
class DecisionActionsBalanceConfig:
    domestic_market_actions: dict[str, DecisionActionConfig]
    government_actions: dict[str, DecisionActionConfig]


@dataclass(frozen=True, slots=True)
class MilitaryActionsBalanceConfig:
    military_actions: dict[str, MilitaryActionConfig]
    diplomacy_actions: dict[str, DiplomacyActionConfig]


@dataclass(frozen=True, slots=True)
class TalentNodeConfig:
    node_id: str
    branch: str
    label: str
    tech_point_cost: int
    description: str
    permanent_effects: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class TalentBranchConfig:
    branch_id: str
    label: str
    unlock_order: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class TalentTreeConfig:
    branches: dict[str, TalentBranchConfig]
    nodes: dict[str, TalentNodeConfig]


@dataclass(frozen=True, slots=True)
class ResearchActionsBalanceConfig:
    talent_tree: TalentTreeConfig


@dataclass(frozen=True, slots=True)
class PoliticsNaturalShiftRule:
    signal_key: str
    high_threshold: int
    high_shift: int
    low_threshold: int
    low_shift: int


@dataclass(frozen=True, slots=True)
class PoliticsMilestoneConfig:
    level: int
    label: str
    effects: dict[str, Any]
    penalty: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class PoliticsBalanceConfig:
    ideology_keys: tuple[str, ...]
    administration_cost: int
    ideology_min: int
    ideology_max: int
    revolution_threshold: int
    terminal_reforms_by_ideology: dict[str, str]
    natural_shift_rules: dict[str, PoliticsNaturalShiftRule]
    policy_trade_open: dict[str, bool]
    reform_admin_support: dict[str, int]
    reform_research_bonus: dict[str, int]
    milestones: dict[str, dict[int, PoliticsMilestoneConfig]]


@dataclass(frozen=True, slots=True)
class EventConfig:
    event_id: str
    label: str
    description: str
    round_range: tuple[int, int]
    conditions: dict[str, Any]
    global_effects: dict[str, Any]
    duration_rounds: int = 1
    weight: int = 1


@dataclass(frozen=True, slots=True)
class EventsBalanceConfig:
    events: tuple[EventConfig, ...]


@dataclass(frozen=True, slots=True)
class AbilityConfig:
    ability_id: str
    label: str
    description: str
    uses_per_game: int
    effects: dict[str, Any]
    requires_target_ideology: bool = False


@dataclass(frozen=True, slots=True)
class AbilitiesBalanceConfig:
    national_abilities: dict[str, AbilityConfig]


@dataclass(frozen=True, slots=True)
class ReformConfig:
    reform_id: str
    label: str
    path: str
    admin_cost: int
    effects: dict[str, Any] = field(default_factory=dict)
    unlocks_policies: tuple[str, ...] = ()
    blocks_other_paths: tuple[str, ...] = ()
    requires_reforms: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class PolicyConfig:
    policy_id: str
    label: str
    admin_cost_per_turn: int
    budget_cost: int
    effects: dict[str, Any] = field(default_factory=dict)
    description: str = ""
    max_per_round: int = 1
    requires_reform: str | None = None


@dataclass(frozen=True, slots=True)
class ReformsBalanceConfig:
    reforms: dict[str, ReformConfig]
    regular_policies: dict[str, PolicyConfig]


@dataclass(frozen=True, slots=True)
class BalanceConfig:
    global_config: GlobalBalanceConfig
    countries: dict[str, CountryBalanceConfig]
    production: ProductionBalanceConfig
    technology: TechnologyBalanceConfig
    market: MarketBalanceConfig
    regions: RegionsBalanceConfig
    military: MilitaryBalanceConfig
    military_actions: MilitaryActionsBalanceConfig
    research_actions: ResearchActionsBalanceConfig
    politics: PoliticsBalanceConfig
    decision_actions: DecisionActionsBalanceConfig
    events: EventsBalanceConfig
    abilities: AbilitiesBalanceConfig
    reforms: ReformsBalanceConfig

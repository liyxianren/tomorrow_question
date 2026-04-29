from __future__ import annotations

import json
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterator

from app.contracts.enums import CountryCode, RegionAccessLevel

from .models import (
    AbilitiesBalanceConfig,
    AbilityConfig,
    BalanceConfig,
    ChainTechConfig,
    CountryBalanceConfig,
    DecisionActionConfig,
    DecisionActionsBalanceConfig,
    DiplomacyActionConfig,
    EventConfig,
    EventsBalanceConfig,
    GlobalBalanceConfig,
    MarketBalanceConfig,
    MilitaryBalanceConfig,
    MilitaryActionConfig,
    MilitaryActionsBalanceConfig,
    OceanNodeBlueprintConfig,
    PolicyConfig,
    ReformConfig,
    ReformsBalanceConfig,
    ResearchActionsBalanceConfig,
    ResearchChainConfig,
    TalentNodeConfig,
    TalentBranchConfig,
    TalentTreeConfig,
    PoliticsBalanceConfig,
    PoliticsMilestoneConfig,
    PoliticsNaturalShiftRule,
    ProductionGoodConfig,
    ProductionBalanceConfig,
    RegionBlueprintConfig,
    RegionsBalanceConfig,
    TechnologyBalanceConfig,
)


DEFAULT_BALANCE_CONFIG_DIR = Path(__file__).resolve().parents[3] / "config" / "balance"
GROUP_FILE_NAMES: tuple[str, ...] = (
    "global",
    "countries",
    "production",
    "technology",
    "market",
    "regions",
    "military",
    "military_actions",
    "research_actions",
    "politics",
    "decision_actions",
    "events",
    "abilities",
    "reforms",
)
SUPPORTED_RANKING_TIE_BREAK_KEYS = ("productionCapacity", "controlledRegions", "budgetPoolsTotal")
SUPPORTED_NATURAL_SHIFT_SIGNAL_KEYS = ("domesticStrength", "industryStrength", "externalBalance")

_ACTIVE_BALANCE_CONFIG_DIR: Path | None = None


class BalanceConfigError(ValueError):
    pass


def load_balance_config(config_dir: str | Path) -> BalanceConfig:
    resolved_dir = Path(config_dir).resolve()
    return _load_balance_config_cached(str(resolved_dir))


def get_balance_config(config_dir: str | Path | None = None) -> BalanceConfig:
    if config_dir is not None:
        return load_balance_config(config_dir)

    active_dir = _ACTIVE_BALANCE_CONFIG_DIR
    if active_dir is not None and active_dir.exists():
        return load_balance_config(active_dir)
    return load_balance_config(DEFAULT_BALANCE_CONFIG_DIR)


def set_active_balance_config_dir(config_dir: str | Path) -> BalanceConfig:
    global _ACTIVE_BALANCE_CONFIG_DIR
    resolved_dir = Path(config_dir).resolve()
    config = load_balance_config(resolved_dir)
    _ACTIVE_BALANCE_CONFIG_DIR = resolved_dir
    return config


def reset_active_balance_config_dir() -> None:
    global _ACTIVE_BALANCE_CONFIG_DIR
    _ACTIVE_BALANCE_CONFIG_DIR = None


@contextmanager
def use_balance_config_dir(config_dir: str | Path) -> Iterator[None]:
    global _ACTIVE_BALANCE_CONFIG_DIR
    previous_dir = _ACTIVE_BALANCE_CONFIG_DIR
    set_active_balance_config_dir(config_dir)
    try:
        yield
    finally:
        _ACTIVE_BALANCE_CONFIG_DIR = previous_dir


@lru_cache(maxsize=16)
def _load_balance_config_cached(config_dir: str) -> BalanceConfig:
    resolved_dir = Path(config_dir)
    if not resolved_dir.exists():
        raise BalanceConfigError(f"Balance config directory does not exist: {resolved_dir}")

    raw_groups = {group_name: _read_group_json(resolved_dir, group_name) for group_name in GROUP_FILE_NAMES}
    return _build_balance_config(raw_groups)


def _read_group_json(config_dir: Path, group_name: str) -> dict[str, Any]:
    group_path = config_dir / f"{group_name}.json"
    if not group_path.exists():
        raise BalanceConfigError(f"Missing balance config group file: {group_path}")

    try:
        raw_payload = json.loads(group_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise BalanceConfigError(f"Invalid JSON in balance config file: {group_path}") from exc

    if not isinstance(raw_payload, dict):
        raise BalanceConfigError(f"Balance config group must be a JSON object: {group_path}")
    return raw_payload


def _build_balance_config(raw_groups: dict[str, dict[str, Any]]) -> BalanceConfig:
    global_config = _build_global_config(raw_groups["global"])
    production = _build_production_config(raw_groups["production"])
    technology = _build_technology_config(raw_groups["technology"], production=production)
    market = _build_market_config(raw_groups["market"])
    regions = _build_regions_config(raw_groups["regions"])
    military = _build_military_config(raw_groups["military"])
    military_actions = _build_military_actions_config(raw_groups["military_actions"], regions=regions)
    research_actions = _build_research_actions_config(raw_groups["research_actions"])
    politics = _build_politics_config(raw_groups["politics"])
    countries = _build_countries_config(raw_groups["countries"])
    decision_actions = _build_decision_actions_config(raw_groups["decision_actions"])
    events = _build_events_config(raw_groups["events"])
    abilities = _build_abilities_config(raw_groups["abilities"])
    reforms = _build_reforms_config(
        raw_groups["reforms"],
        decision_actions_payload=raw_groups["decision_actions"],
    )

    _validate_countries(countries, production=production)
    _validate_production(production)
    _validate_technology(
        technology=technology,
        production=production,
        decision_actions=decision_actions,
        military_actions=military_actions,
    )
    _validate_regions(regions)
    _validate_market(market, regions=regions)

    return BalanceConfig(
        global_config=global_config,
        countries=countries,
        production=production,
        technology=technology,
        market=market,
        regions=regions,
        military=military,
        military_actions=military_actions,
        research_actions=research_actions,
        politics=politics,
        decision_actions=decision_actions,
        events=events,
        abilities=abilities,
        reforms=reforms,
    )


def _build_global_config(payload: dict[str, Any]) -> GlobalBalanceConfig:
    ranking_tie_break_order = _require_string_tuple(payload.get("rankingTieBreakOrder"), "global.rankingTieBreakOrder")
    if not ranking_tie_break_order:
        raise BalanceConfigError("global.rankingTieBreakOrder must not be empty.")
    for key in ranking_tie_break_order:
        if key not in SUPPORTED_RANKING_TIE_BREAK_KEYS:
            raise BalanceConfigError(f"Unsupported ranking tie-break key: {key}")

    return GlobalBalanceConfig(
        total_rounds=_require_non_negative_int(payload.get("totalRounds"), "global.totalRounds"),
        phase_duration_seconds=_require_non_negative_int(payload.get("phaseDurationSeconds"), "global.phaseDurationSeconds"),
        base_income_per_round=_require_non_negative_int(payload.get("baseIncomePerRound", 0), "global.baseIncomePerRound"),
        base_overseas_capacity=_require_non_negative_int(payload.get("baseOverseasCapacity", 2), "global.baseOverseasCapacity"),
        ranking_tie_break_order=ranking_tie_break_order,
        raw_materials_per_turn=_require_non_negative_int(
            payload.get("rawMaterialsPerTurn", 0),
            "global.rawMaterialsPerTurn",
        ),
    )


def _build_countries_config(payload: dict[str, Any]) -> dict[str, CountryBalanceConfig]:
    raw_countries = _require_dict(payload.get("countries"), "countries.countries")
    countries: dict[str, CountryBalanceConfig] = {}
    for country_key, raw_country in raw_countries.items():
        country_value = _require_dict(raw_country, f"countries.countries.{country_key}")
        countries[str(country_key)] = CountryBalanceConfig(
            budget_pools=_require_non_negative_int_mapping(country_value.get("budgetPools"), f"countries.{country_key}.budgetPools"),
            income_allocation_ratio=_require_float_mapping(
                country_value.get("incomeAllocationRatio"),
                f"countries.{country_key}.incomeAllocationRatio",
            ),
            tech_points=_require_non_negative_int(country_value.get("techPoints"), f"countries.{country_key}.techPoints"),
            military_points=_require_non_negative_int(
                country_value.get("militaryPoints"),
                f"countries.{country_key}.militaryPoints",
            ),
            production_capacity=_require_int_mapping(country_value.get("productionCapacity"), f"countries.{country_key}.productionCapacity"),
            goods_stock=_require_int_mapping(country_value.get("goodsStock"), f"countries.{country_key}.goodsStock"),
            army=_require_int_mapping(country_value.get("army"), f"countries.{country_key}.army"),
            navy=_require_int_mapping(country_value.get("navy"), f"countries.{country_key}.navy"),
            administration_capacity=_require_non_negative_int(country_value.get("administrationCapacity"), f"countries.{country_key}.administrationCapacity"),
            research_facilities=_require_int_mapping(country_value.get("researchFacilities"), f"countries.{country_key}.researchFacilities"),
            ideology_levels=_require_int_mapping(country_value.get("ideologyLevels"), f"countries.{country_key}.ideologyLevels"),
            initial_goods=_require_string_tuple(country_value.get("initialGoods", []), f"countries.{country_key}.initialGoods"),
            initial_diplomacy=tuple(str(item) for item in country_value.get("initialDiplomacy", [])),
            initial_raw_materials=_require_non_negative_int(
                country_value.get("initialRawMaterials", 0),
                f"countries.{country_key}.initialRawMaterials",
            ),
            raw_materials_per_turn=_require_non_negative_int(
                country_value.get("rawMaterialsPerTurn", 20),
                f"countries.{country_key}.rawMaterialsPerTurn",
            ),
        )
    return countries


def _build_production_config(payload: dict[str, Any]) -> ProductionBalanceConfig:
    return ProductionBalanceConfig(
        levels=_require_string_tuple(payload.get("levels"), "production.levels"),
        output_multipliers=_require_int_mapping(payload.get("outputMultipliers"), "production.outputMultipliers"),
        expansion_costs=_require_non_negative_int_mapping(payload.get("expansionCosts"), "production.expansionCosts"),
        upgrade_costs=_require_non_negative_int_mapping(payload.get("upgradeCosts"), "production.upgradeCosts"),
        new_factory_costs=_require_non_negative_int_mapping(payload.get("newFactoryCosts"), "production.newFactoryCosts"),
        upgrade_source_levels=_require_string_mapping(payload.get("upgradeSourceLevels"), "production.upgradeSourceLevels"),
        goods=_build_goods_config(payload.get("goods")),
    )


def _build_goods_config(value: Any) -> dict[str, ProductionGoodConfig]:
    mapping = _require_dict(value, "production.goods")
    normalized: dict[str, ProductionGoodConfig] = {}
    for goods_id, raw_goods in mapping.items():
        goods = _require_dict(raw_goods, f"production.goods.{goods_id}")
        normalized[str(goods_id)] = ProductionGoodConfig(
            goods_id=str(goods_id),
            label=_require_non_empty_string(goods.get("label"), f"production.goods.{goods_id}.label"),
            route_id=_require_non_empty_string(goods.get("routeId"), f"production.goods.{goods_id}.routeId"),
            unit_budget_cost=_require_non_negative_int(
                goods.get("unitBudgetCost"),
                f"production.goods.{goods_id}.unitBudgetCost",
            ),
            unit_output=_require_non_negative_int(
                goods.get("unitOutput"),
                f"production.goods.{goods_id}.unitOutput",
            ),
            domestic_reference_price=_require_non_negative_int(
                goods.get("domesticReferencePrice"),
                f"production.goods.{goods_id}.domesticReferencePrice",
            ),
            overseas_base_price=_require_non_negative_int(
                goods.get("overseasBasePrice"),
                f"production.goods.{goods_id}.overseasBasePrice",
            ),
            demand_threshold=_require_non_negative_int(
                goods.get("demandThreshold"),
                f"production.goods.{goods_id}.demandThreshold",
            ),
            price_floor=_require_non_negative_int(
                goods.get("priceFloor"),
                f"production.goods.{goods_id}.priceFloor",
            ),
            price_ceiling=_require_non_negative_int(
                goods.get("priceCeiling"),
                f"production.goods.{goods_id}.priceCeiling",
            ),
            overseas_price_ceiling=_require_non_negative_int(goods.get("overseasPriceCeiling"), f"production.goods.{goods_id}.overseasPriceCeiling"),
            usage_hint=str(goods.get("usageHint") or ""),
        )
    return normalized


def _build_technology_config(payload: dict[str, Any], *, production: ProductionBalanceConfig) -> TechnologyBalanceConfig:
    route_unlocks = _require_string_mapping(payload.get("routeUnlocks"), "technology.routeUnlocks")
    chains = _build_chains(payload.get("chains"))
    for route_key in route_unlocks:
        if route_key not in production.levels:
            raise BalanceConfigError(f"technology.routeUnlocks references unknown production route: {route_key}")
    return TechnologyBalanceConfig(
        research_facility_cost=_require_non_negative_int(
            payload.get("researchFacilityCost"), "technology.researchFacilityCost"
        ),
        research_facility_progress_per_turn=_require_non_negative_int(
            payload.get("researchFacilityProgressPerTurn"), "technology.researchFacilityProgressPerTurn"
        ),
        breakthrough_die_sides=_require_non_negative_int(
            payload.get("breakthroughDieSides"), "technology.breakthroughDieSides"
        ),
        route_unlocks=route_unlocks,
        chains=chains,
    )


def _build_chains(value: Any) -> dict[str, ResearchChainConfig]:
    mapping = _require_dict(value, "technology.chains")
    normalized: dict[str, ResearchChainConfig] = {}
    for chain_id, raw_chain in mapping.items():
        chain = _require_dict(raw_chain, f"technology.chains.{chain_id}")
        raw_techs = chain.get("techs")
        if not isinstance(raw_techs, list):
            raise BalanceConfigError(f"technology.chains.{chain_id}.techs must be a list.")
        techs: list[ChainTechConfig] = []
        for index, raw_tech in enumerate(raw_techs):
            tech = _require_dict(raw_tech, f"technology.chains.{chain_id}.techs[{index}]")
            techs.append(
                ChainTechConfig(
                    tech_id=_require_non_empty_string(
                        tech.get("id"), f"technology.chains.{chain_id}.techs[{index}].id"
                    ),
                    label=_require_non_empty_string(
                        tech.get("label"), f"technology.chains.{chain_id}.techs[{index}].label"
                    ),
                    threshold=_require_non_negative_int(
                        tech.get("threshold"), f"technology.chains.{chain_id}.techs[{index}].threshold"
                    ),
                )
            )
        normalized[str(chain_id)] = ResearchChainConfig(
            chain_id=str(chain_id),
            label=_require_non_empty_string(chain.get("label"), f"technology.chains.{chain_id}.label"),
            techs=tuple(techs),
        )
    return normalized


def _build_market_config(payload: dict[str, Any]) -> MarketBalanceConfig:
    raw_premiums = _require_dict(payload.get("regionGoodsPremiums"), "market.regionGoodsPremiums")
    region_goods_premiums = {}
    for region_id, goods_premiums in raw_premiums.items():
        region_goods_premiums[str(region_id)] = {
            str(k): int(v) for k, v in _require_dict(goods_premiums, f"market.regionGoodsPremiums.{region_id}").items()
        }
    return MarketBalanceConfig(region_goods_premiums=region_goods_premiums)


def _build_regions_config(payload: dict[str, Any]) -> RegionsBalanceConfig:
    raw_regions = payload.get("regions")
    if not isinstance(raw_regions, list):
        raise BalanceConfigError("regions.regions must be a list.")
    raw_ocean_nodes = payload.get("oceanNodes")
    if not isinstance(raw_ocean_nodes, list):
        raise BalanceConfigError("regions.oceanNodes must be a list.")

    region_blueprints: dict[str, RegionBlueprintConfig] = {}
    for index, raw_region in enumerate(raw_regions):
        region = _require_dict(raw_region, f"regions.regions[{index}]")
        region_id = _require_non_empty_string(region.get("regionId"), f"regions.regions[{index}].regionId")
        region_blueprints[region_id] = RegionBlueprintConfig(
            region_id=region_id,
            access_level=RegionAccessLevel(_require_non_empty_string(region.get("accessLevel"), f"regions.regions[{index}].accessLevel")),
            resource_limit=_require_int_mapping(region.get("resourceLimit"), f"regions.regions[{index}].resourceLimit"),
            required_nodes=_require_string_tuple(region.get("requiredNodes"), f"regions.regions[{index}].requiredNodes"),
            colonizable=bool(region.get("colonizable", False)),
            price_multiplier=float(region.get("priceMultiplier", 1.0)),
        )

    ocean_node_blueprints: dict[str, OceanNodeBlueprintConfig] = {}
    for index, raw_node in enumerate(raw_ocean_nodes):
        node = _require_dict(raw_node, f"regions.oceanNodes[{index}]")
        node_id = _require_non_empty_string(node.get("nodeId"), f"regions.oceanNodes[{index}].nodeId")
        ocean_node_blueprints[node_id] = OceanNodeBlueprintConfig(
            node_id=node_id,
            reachable_routes=_require_string_tuple(node.get("reachableRoutes"), f"regions.oceanNodes[{index}].reachableRoutes"),
        )

    return RegionsBalanceConfig(region_blueprints=region_blueprints, ocean_node_blueprints=ocean_node_blueprints)


def _build_military_config(payload: dict[str, Any]) -> MilitaryBalanceConfig:
    return MilitaryBalanceConfig(
        army_unit_cost=_require_non_negative_int(payload.get("armyUnitCost"), "military.armyUnitCost"),
        navy_unit_cost=_require_non_negative_int(payload.get("navyUnitCost"), "military.navyUnitCost"),
        ocean_control_threshold=_require_non_negative_int(payload.get("oceanControlThreshold"), "military.oceanControlThreshold"),
        independence_threshold=_require_non_negative_int(payload.get("independenceThreshold"), "military.independenceThreshold"),
        colonization_unlock_cost=_require_non_negative_int(
            payload.get("colonizationUnlockCost", 10),
            "military.colonizationUnlockCost",
        ),
        colonization_military_point_cost=_require_non_negative_int(
            payload.get("colonizationMilitaryPointCost", 3),
            "military.colonizationMilitaryPointCost",
        ),
        colonization_income_per_colony_per_round=_require_non_negative_int(
            payload.get("colonizationIncomePerColonyPerRound", 5),
            "military.colonizationIncomePerColonyPerRound",
        ),
        max_colonizations_per_round=max(
            1,
            _require_non_negative_int(
                payload.get("maxColonizationsPerRound", 1),
                "military.maxColonizationsPerRound",
            ),
        ),
    )


def _build_military_actions_config(
    payload: dict[str, Any],
    *,
    regions: RegionsBalanceConfig,
) -> MilitaryActionsBalanceConfig:
    return MilitaryActionsBalanceConfig(
        military_actions=_build_military_action_mapping(
            payload.get("militaryActions"),
            "military_actions.militaryActions",
        ),
        diplomacy_actions=_build_diplomacy_action_mapping(
            payload.get("diplomacyActions"),
            "military_actions.diplomacyActions",
            regions=regions,
        ),
    )


def _build_research_actions_config(payload: dict[str, Any]) -> ResearchActionsBalanceConfig:
    return ResearchActionsBalanceConfig(
        talent_tree=_build_talent_tree_config(
            payload.get("talentTree"),
            "research_actions.talentTree",
        ),
    )


def _build_talent_tree_config(value: Any, field_name: str) -> TalentTreeConfig:
    raw = _require_dict(value, field_name)
    raw_branches = _require_dict(raw.get("branches"), f"{field_name}.branches")
    branches: dict[str, TalentBranchConfig] = {}
    for branch_id, raw_branch in raw_branches.items():
        branch = _require_dict(raw_branch, f"{field_name}.branches.{branch_id}")
        unlock_order_raw = branch.get("unlockOrder")
        if not isinstance(unlock_order_raw, list):
            raise BalanceConfigError(f"{field_name}.branches.{branch_id}.unlockOrder must be a list")
        branches[str(branch_id)] = TalentBranchConfig(
            branch_id=str(branch_id),
            label=_require_non_empty_string(branch.get("label"), f"{field_name}.branches.{branch_id}.label"),
            unlock_order=tuple(str(item) for item in unlock_order_raw),
        )

    raw_nodes = _require_dict(raw.get("nodes"), f"{field_name}.nodes")
    nodes: dict[str, TalentNodeConfig] = {}
    for node_id, raw_node in raw_nodes.items():
        node = _require_dict(raw_node, f"{field_name}.nodes.{node_id}")
        nodes[str(node_id)] = TalentNodeConfig(
            node_id=str(node_id),
            branch=_require_non_empty_string(node.get("branch"), f"{field_name}.nodes.{node_id}.branch"),
            label=_require_non_empty_string(node.get("label"), f"{field_name}.nodes.{node_id}.label"),
            tech_point_cost=_require_non_negative_int(node.get("techPointCost"), f"{field_name}.nodes.{node_id}.techPointCost"),
            description=str(node.get("description", "")),
            permanent_effects=dict(node.get("permanentEffects", {})),
        )

    for branch_id, branch_config in branches.items():
        for node_id in branch_config.unlock_order:
            if node_id not in nodes:
                raise BalanceConfigError(f"{field_name}.branches.{branch_id}.unlockOrder references unknown node: {node_id}")

    return TalentTreeConfig(branches=branches, nodes=nodes)


def _build_politics_config(payload: dict[str, Any]) -> PoliticsBalanceConfig:
    ideology_keys = _require_string_tuple(payload.get("ideologyKeys"), "politics.ideologyKeys")
    return PoliticsBalanceConfig(
        ideology_keys=ideology_keys,
        administration_cost=_require_non_negative_int(payload.get("administrationCost"), "politics.administrationCost"),
        ideology_min=_require_int(payload.get("ideologyMin"), "politics.ideologyMin"),
        ideology_max=_require_int(payload.get("ideologyMax"), "politics.ideologyMax"),
        revolution_threshold=_require_non_negative_int(payload.get("revolutionThreshold"), "politics.revolutionThreshold"),
        terminal_reforms_by_ideology=_require_string_mapping(payload.get("terminalReformsByIdeology"), "politics.terminalReformsByIdeology"),
        natural_shift_rules=_build_natural_shift_rules(payload.get("naturalShiftRules"), ideology_keys=ideology_keys),
        policy_trade_open=_require_bool_mapping(payload.get("policyTradeOpen"), "politics.policyTradeOpen"),
        reform_admin_support=_require_int_mapping(payload.get("reformAdminSupport"), "politics.reformAdminSupport"),
        reform_research_bonus=_require_int_mapping(payload.get("reformResearchBonus"), "politics.reformResearchBonus"),
        milestones=_build_milestones(payload.get("milestones"), ideology_keys=ideology_keys),
    )


def _build_decision_actions_config(payload: dict[str, Any]) -> DecisionActionsBalanceConfig:
    return DecisionActionsBalanceConfig(
        domestic_market_actions=_build_action_mapping(
            payload.get("domesticMarketActions"),
            "decision_actions.domesticMarketActions",
        ),
        government_actions=_build_action_mapping(payload.get("governmentActions"), "decision_actions.governmentActions"),
    )


def _build_events_config(payload: dict[str, Any]) -> EventsBalanceConfig:
    raw_events = payload.get("events")
    if not isinstance(raw_events, list):
        raise BalanceConfigError("events.events must be a list.")
    events: list[EventConfig] = []
    for index, raw_event in enumerate(raw_events):
        event = _require_dict(raw_event, f"events.events[{index}]")
        round_range_raw = event.get("roundRange")
        if not isinstance(round_range_raw, list) or len(round_range_raw) != 2:
            raise BalanceConfigError(f"events.events[{index}].roundRange must be a 2-item list.")
        events.append(
            EventConfig(
                event_id=_require_non_empty_string(event.get("eventId"), f"events.events[{index}].eventId"),
                label=_require_non_empty_string(event.get("label"), f"events.events[{index}].label"),
                description=_require_non_empty_string(event.get("description"), f"events.events[{index}].description"),
                round_range=(
                    _require_non_negative_int(round_range_raw[0], f"events.events[{index}].roundRange[0]"),
                    _require_non_negative_int(round_range_raw[1], f"events.events[{index}].roundRange[1]"),
                ),
                conditions=_require_dict(event.get("conditions"), f"events.events[{index}].conditions"),
                global_effects=_require_dict(event.get("globalEffects"), f"events.events[{index}].globalEffects"),
                duration_rounds=_require_non_negative_int(
                    event.get("durationRounds", 1),
                    f"events.events[{index}].durationRounds",
                ),
                weight=max(
                    1,
                    _require_non_negative_int(event.get("weight", 1), f"events.events[{index}].weight"),
                ),
            )
        )
    return EventsBalanceConfig(events=tuple(events))


def _build_abilities_config(payload: dict[str, Any]) -> AbilitiesBalanceConfig:
    mapping = _require_dict(payload.get("nationalAbilities"), "abilities.nationalAbilities")
    national_abilities: dict[str, AbilityConfig] = {}
    for country_key, raw_ability in mapping.items():
        ability = _require_dict(raw_ability, f"abilities.nationalAbilities.{country_key}")
        national_abilities[str(country_key)] = AbilityConfig(
            ability_id=_require_non_empty_string(
                ability.get("abilityId"),
                f"abilities.nationalAbilities.{country_key}.abilityId",
            ),
            label=_require_non_empty_string(
                ability.get("label"),
                f"abilities.nationalAbilities.{country_key}.label",
            ),
            description=_require_non_empty_string(
                ability.get("description"),
                f"abilities.nationalAbilities.{country_key}.description",
            ),
            uses_per_game=max(
                1,
                _require_non_negative_int(
                    ability.get("usesPerGame", 1),
                    f"abilities.nationalAbilities.{country_key}.usesPerGame",
                ),
            ),
            effects=_require_dict(
                ability.get("effects"),
                f"abilities.nationalAbilities.{country_key}.effects",
            ),
            requires_target_ideology=bool(ability.get("requiresTargetIdeology", False)),
        )
    return AbilitiesBalanceConfig(national_abilities=national_abilities)


def _build_reforms_config(
    payload: dict[str, Any],
    *,
    decision_actions_payload: dict[str, Any],
) -> ReformsBalanceConfig:
    raw_reforms = _require_dict(payload.get("reforms"), "reforms.reforms")
    reforms: dict[str, ReformConfig] = {}
    for path_key, raw_path_list in raw_reforms.items():
        if not isinstance(raw_path_list, list):
            raise BalanceConfigError(f"reforms.reforms.{path_key} must be a list.")
        for index, raw_reform in enumerate(raw_path_list):
            reform = _require_dict(raw_reform, f"reforms.reforms.{path_key}[{index}]")
            reform_id = _require_non_empty_string(
                reform.get("reformId"),
                f"reforms.reforms.{path_key}[{index}].reformId",
            )
            if reform_id in reforms:
                raise BalanceConfigError(f"reforms.reforms duplicates reformId: {reform_id}")
            reforms[reform_id] = ReformConfig(
                reform_id=reform_id,
                label=_require_non_empty_string(
                    reform.get("label"),
                    f"reforms.reforms.{path_key}[{index}].label",
                ),
                path=_require_non_empty_string(
                    reform.get("path"),
                    f"reforms.reforms.{path_key}[{index}].path",
                ),
                admin_cost=_require_non_negative_int(
                    reform.get("adminCost"),
                    f"reforms.reforms.{path_key}[{index}].adminCost",
                ),
                effects=_require_dict(
                    reform.get("effects", {}),
                    f"reforms.reforms.{path_key}[{index}].effects",
                ),
                unlocks_policies=_require_string_tuple(
                    reform.get("unlocksPolicies", []),
                    f"reforms.reforms.{path_key}[{index}].unlocksPolicies",
                ),
                blocks_other_paths=_require_string_tuple(
                    reform.get("blocksOtherPaths", []),
                    f"reforms.reforms.{path_key}[{index}].blocksOtherPaths",
                ),
                requires_reforms=_require_string_tuple(
                    reform.get("requiresReforms", []),
                    f"reforms.reforms.{path_key}[{index}].requiresReforms",
                ),
            )

    raw_policies = _require_dict(
        decision_actions_payload.get("regularPolicies"),
        "decision_actions.regularPolicies",
    )
    regular_policies: dict[str, PolicyConfig] = {}
    for policy_id, raw_policy in raw_policies.items():
        policy = _require_dict(raw_policy, f"decision_actions.regularPolicies.{policy_id}")
        requires_reform = policy.get("requiresReform")
        if requires_reform is not None:
            requires_reform = _require_non_empty_string(
                requires_reform,
                f"decision_actions.regularPolicies.{policy_id}.requiresReform",
            )
        regular_policies[str(policy_id)] = PolicyConfig(
            policy_id=str(policy_id),
            label=_require_non_empty_string(
                policy.get("label"),
                f"decision_actions.regularPolicies.{policy_id}.label",
            ),
            admin_cost_per_turn=_require_non_negative_int(
                policy.get("adminCostPerTurn"),
                f"decision_actions.regularPolicies.{policy_id}.adminCostPerTurn",
            ),
            budget_cost=_require_non_negative_int(
                policy.get("budgetCost", 0),
                f"decision_actions.regularPolicies.{policy_id}.budgetCost",
            ),
            effects=_require_dict(
                policy.get("effects", {}),
                f"decision_actions.regularPolicies.{policy_id}.effects",
            ),
            description=str(policy.get("description") or ""),
            max_per_round=max(
                1,
                _require_non_negative_int(
                    policy.get("maxPerRound", 1),
                    f"decision_actions.regularPolicies.{policy_id}.maxPerRound",
                ),
            ),
            requires_reform=requires_reform,
        )

    return ReformsBalanceConfig(reforms=reforms, regular_policies=regular_policies)


def _build_action_mapping(value: Any, field_name: str) -> dict[str, DecisionActionConfig]:
    mapping = _require_dict(value, field_name)
    normalized: dict[str, DecisionActionConfig] = {}
    for action_id, raw_action in mapping.items():
        action = _require_dict(raw_action, f"{field_name}.{action_id}")
        normalized[str(action_id)] = DecisionActionConfig(
            action_id=str(action_id),
            label=_require_non_empty_string(action.get("label"), f"{field_name}.{action_id}.label"),
            budget_pool_cost=_require_non_negative_int(
                action.get("budgetPoolCost"),
                f"{field_name}.{action_id}.budgetPoolCost",
            ),
            tech_point_cost=_require_non_negative_int(
                action.get("techPointCost", 0),
                f"{field_name}.{action_id}.techPointCost",
            ),
            military_point_cost=_require_non_negative_int(
                action.get("militaryPointCost", 0),
                f"{field_name}.{action_id}.militaryPointCost",
            ),
            ratio_delta=_require_float_mapping(
                action.get("ratioDelta", {}),
                f"{field_name}.{action_id}.ratioDelta",
            ),
            effects=_require_dict(action.get("effects"), f"{field_name}.{action_id}.effects"),
            description=str(action.get("description") or ""),
        )
    return normalized


def _build_military_action_mapping(value: Any, field_name: str) -> dict[str, MilitaryActionConfig]:
    mapping = _require_dict(value, field_name)
    normalized: dict[str, MilitaryActionConfig] = {}
    for action_id, raw_action in mapping.items():
        action = _require_dict(raw_action, f"{field_name}.{action_id}")
        normalized[str(action_id)] = MilitaryActionConfig(
            action_id=str(action_id),
            label=_require_non_empty_string(action.get("label"), f"{field_name}.{action_id}.label"),
            budget_pool_cost=_require_non_negative_int(
                action.get("budgetPoolCost"),
                f"{field_name}.{action_id}.budgetPoolCost",
            ),
            max_per_round=max(
                1,
                _require_non_negative_int(action.get("maxPerRound", 1), f"{field_name}.{action_id}.maxPerRound"),
            ),
            effects=_require_dict(action.get("effects"), f"{field_name}.{action_id}.effects"),
            description=str(action.get("description") or ""),
            military_point_cost=int(action.get("militaryPointCost", 0)),
        )
    return normalized


def _build_diplomacy_action_mapping(
    value: Any,
    field_name: str,
    *,
    regions: RegionsBalanceConfig,
) -> dict[str, DiplomacyActionConfig]:
    mapping = _require_dict(value, field_name)
    valid_region_ids = set(regions.region_blueprints)
    normalized: dict[str, DiplomacyActionConfig] = {}
    for action_id, raw_action in mapping.items():
        action = _require_dict(raw_action, f"{field_name}.{action_id}")
        target_region = _require_non_empty_string(action.get("targetRegion"), f"{field_name}.{action_id}.targetRegion")
        if target_region not in valid_region_ids:
            raise BalanceConfigError(f"{field_name}.{action_id}.targetRegion references unknown region: {target_region}")
        normalized[str(action_id)] = DiplomacyActionConfig(
            action_id=str(action_id),
            label=_require_non_empty_string(action.get("label"), f"{field_name}.{action_id}.label"),
            budget_pool_cost=_require_non_negative_int(
                action.get("budgetPoolCost"),
                f"{field_name}.{action_id}.budgetPoolCost",
            ),
            target_region=target_region,
            description=str(action.get("description") or ""),
        )
    return normalized


def _build_natural_shift_rules(value: Any, *, ideology_keys: tuple[str, ...]) -> dict[str, PoliticsNaturalShiftRule]:
    mapping = _require_dict(value, "politics.naturalShiftRules")
    normalized: dict[str, PoliticsNaturalShiftRule] = {}

    for ideology_key, raw_rule in mapping.items():
        if ideology_key not in ideology_keys:
            raise BalanceConfigError(f"politics.naturalShiftRules.{ideology_key} references unsupported ideology.")

        rule = _require_dict(raw_rule, f"politics.naturalShiftRules.{ideology_key}")
        signal_key = _require_non_empty_string(rule.get("signalKey"), f"politics.naturalShiftRules.{ideology_key}.signalKey")
        if signal_key not in SUPPORTED_NATURAL_SHIFT_SIGNAL_KEYS:
            raise BalanceConfigError(
                f"politics.naturalShiftRules.{ideology_key}.signalKey references unsupported signal: {signal_key}"
            )

        normalized[str(ideology_key)] = PoliticsNaturalShiftRule(
            signal_key=signal_key,
            high_threshold=_require_int(rule.get("highThreshold"), f"politics.naturalShiftRules.{ideology_key}.highThreshold"),
            high_shift=_require_int(rule.get("highShift"), f"politics.naturalShiftRules.{ideology_key}.highShift"),
            low_threshold=_require_int(rule.get("lowThreshold"), f"politics.naturalShiftRules.{ideology_key}.lowThreshold"),
            low_shift=_require_int(rule.get("lowShift"), f"politics.naturalShiftRules.{ideology_key}.lowShift"),
        )

    if set(normalized) != set(ideology_keys):
        raise BalanceConfigError("politics.naturalShiftRules must define every ideology exactly once.")
    return normalized


def _build_milestones(value: Any, *, ideology_keys: tuple[str, ...]) -> dict[str, dict[int, PoliticsMilestoneConfig]]:
    mapping = _require_dict(value, "politics.milestones")
    normalized: dict[str, dict[int, PoliticsMilestoneConfig]] = {}
    for ideology_key, raw_ideology_milestones in mapping.items():
        if ideology_key not in ideology_keys:
            raise BalanceConfigError(f"politics.milestones.{ideology_key} references unsupported ideology.")
        ideology_milestones = _require_dict(raw_ideology_milestones, f"politics.milestones.{ideology_key}")
        normalized[str(ideology_key)] = {}
        for raw_level, raw_milestone in ideology_milestones.items():
            milestone = _require_dict(raw_milestone, f"politics.milestones.{ideology_key}.{raw_level}")
            level = _require_non_negative_int(raw_level, f"politics.milestones.{ideology_key}.{raw_level}")
            normalized[str(ideology_key)][level] = PoliticsMilestoneConfig(
                level=level,
                label=_require_non_empty_string(
                    milestone.get("label"),
                    f"politics.milestones.{ideology_key}.{raw_level}.label",
                ),
                effects=_require_dict(
                    milestone.get("effects"),
                    f"politics.milestones.{ideology_key}.{raw_level}.effects",
                ),
                penalty=_require_dict(
                    milestone.get("penalty", {}),
                    f"politics.milestones.{ideology_key}.{raw_level}.penalty",
                ),
            )
    return normalized


def _validate_countries(
    countries: dict[str, CountryBalanceConfig],
    *,
    production: ProductionBalanceConfig | None = None,
) -> None:
    if set(countries) != {country.value for country in CountryCode}:
        raise BalanceConfigError("countries.countries must contain every country exactly once.")
    if production is None:
        return
    valid_goods_ids = set(production.goods)
    for country_key, country in countries.items():
        for goods_id in country.initial_goods:
            if goods_id not in valid_goods_ids:
                raise BalanceConfigError(f"countries.{country_key}.initialGoods references unknown goods: {goods_id}")


def _validate_technology(
    *,
    technology: TechnologyBalanceConfig,
    production: ProductionBalanceConfig,
    decision_actions: DecisionActionsBalanceConfig,
    military_actions: MilitaryActionsBalanceConfig,
) -> None:
    del decision_actions, military_actions  # reserved for future chain-based unlocks
    all_tech_ids: set[str] = set()
    for chain_id, chain in technology.chains.items():
        for tech in chain.techs:
            if tech.tech_id in all_tech_ids:
                raise BalanceConfigError(
                    f"technology.chains duplicates tech id: {tech.tech_id} (chain {chain_id})"
                )
            all_tech_ids.add(tech.tech_id)
    for route_key, technology_key in technology.route_unlocks.items():
        if technology_key not in all_tech_ids:
            raise BalanceConfigError(f"technology.routeUnlocks references unknown technology: {technology_key}")
        if route_key not in production.levels:
            raise BalanceConfigError(f"technology.routeUnlocks references unknown route: {route_key}")


def _validate_production(production: ProductionBalanceConfig) -> None:
    levels = set(production.levels)
    if "idle" not in levels:
        raise BalanceConfigError("production.levels must contain idle.")

    if set(production.output_multipliers) != levels:
        raise BalanceConfigError("production.outputMultipliers must define every production level exactly once.")

    for route_id in production.expansion_costs:
        if route_id not in levels or route_id == "idle":
            raise BalanceConfigError(f"production.expansionCosts references unknown route: {route_id}")

    if set(production.upgrade_costs) != set(production.upgrade_source_levels):
        raise BalanceConfigError("production.upgradeCosts must match production.upgradeSourceLevels exactly.")

    for route_id, source_route in production.upgrade_source_levels.items():
        if route_id not in levels or route_id == "idle":
            raise BalanceConfigError(f"production.upgradeSourceLevels references invalid target route: {route_id}")
        if source_route not in levels or source_route == route_id:
            raise BalanceConfigError(f"production.upgradeSourceLevels.{route_id} references invalid source route: {source_route}")

    for route_id in production.new_factory_costs:
        if route_id not in levels or route_id == "idle":
            raise BalanceConfigError(f"production.newFactoryCosts references invalid route: {route_id}")

    for goods_id, goods in production.goods.items():
        if goods.route_id not in levels or goods.route_id == "idle":
            raise BalanceConfigError(f"production.goods.{goods_id} references invalid route: {goods.route_id}")
        if goods.unit_output <= 0:
            raise BalanceConfigError(f"production.goods.{goods_id}.unitOutput must be >= 1.")
        if goods.price_floor > goods.price_ceiling:
            raise BalanceConfigError(f"production.goods.{goods_id}.priceFloor must be <= priceCeiling.")
        if not (goods.price_floor <= goods.domestic_reference_price <= goods.price_ceiling):
            raise BalanceConfigError(
                f"production.goods.{goods_id}.domesticReferencePrice must stay within floor/ceiling."
            )


def _validate_regions(regions: RegionsBalanceConfig) -> None:
    ocean_node_ids = set(regions.ocean_node_blueprints)
    for region_blueprint in regions.region_blueprints.values():
        missing_nodes = sorted(set(region_blueprint.required_nodes) - ocean_node_ids)
        if missing_nodes:
            raise BalanceConfigError(
                f"regions.{region_blueprint.region_id}.requiredNodes references unknown ocean nodes: {', '.join(missing_nodes)}"
            )


def _validate_market(market: MarketBalanceConfig, *, regions: RegionsBalanceConfig) -> None:
    expected_region_ids = set(regions.region_blueprints)
    actual_region_ids = set(market.region_goods_premiums)
    if actual_region_ids != expected_region_ids:
        raise BalanceConfigError("market.regionGoodsPremiums must define every region exactly once.")


def _require_dict(value: Any, field_name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise BalanceConfigError(f"{field_name} must be an object.")
    return value


def _require_non_empty_string(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise BalanceConfigError(f"{field_name} must be a non-empty string.")
    return value.strip()


def _require_string_tuple(value: Any, field_name: str) -> tuple[str, ...]:
    if not isinstance(value, list):
        raise BalanceConfigError(f"{field_name} must be a list of strings.")
    return tuple(_require_non_empty_string(item, f"{field_name}[{index}]") for index, item in enumerate(value))


def _require_string_mapping(value: Any, field_name: str) -> dict[str, str]:
    mapping = _require_dict(value, field_name)
    return {str(key): _require_non_empty_string(item, f"{field_name}.{key}") for key, item in mapping.items()}


def _require_bool_mapping(value: Any, field_name: str) -> dict[str, bool]:
    mapping = _require_dict(value, field_name)
    normalized: dict[str, bool] = {}
    for key, item in mapping.items():
        if not isinstance(item, bool):
            raise BalanceConfigError(f"{field_name}.{key} must be a boolean.")
        normalized[str(key)] = item
    return normalized


def _require_int_mapping(value: Any, field_name: str) -> dict[str, int]:
    mapping = _require_dict(value, field_name)
    normalized: dict[str, int] = {}
    for key, item in mapping.items():
        normalized[str(key)] = _require_int(item, f"{field_name}.{key}")
    return normalized


def _require_non_negative_int_mapping(value: Any, field_name: str) -> dict[str, int]:
    mapping = _require_dict(value, field_name)
    normalized: dict[str, int] = {}
    for key, item in mapping.items():
        normalized[str(key)] = _require_non_negative_int(item, f"{field_name}.{key}")
    return normalized


def _require_float_mapping(value: Any, field_name: str) -> dict[str, float]:
    mapping = _require_dict(value, field_name)
    normalized: dict[str, float] = {}
    for key, item in mapping.items():
        normalized[str(key)] = _require_float(item, f"{field_name}.{key}")
    return normalized


def _require_int(value: Any, field_name: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise BalanceConfigError(f"{field_name} must be an integer.") from exc


def _require_non_negative_int(value: Any, field_name: str) -> int:
    normalized = _require_int(value, field_name)
    if normalized < 0:
        raise BalanceConfigError(f"{field_name} must be >= 0.")
    return normalized


def _require_float(value: Any, field_name: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise BalanceConfigError(f"{field_name} must be a float.") from exc

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import datetime
from uuid import uuid4

from app.contracts.enums import CountryCode, GamePhase
from app.modules.balance_config import get_balance_config

from .models import (
    DEFAULT_PHASE1_CAPACITY_BY_MODE,
    Game,
    GameSnapshot,
    OceanNodeState,
    Phase1EconomyState,
    PlayerState,
    RegionState,
    RULES_VERSION_V2,
)
from .workspaces import hydrate_snapshot_workspaces


INITIAL_GAME_PHASE = GamePhase.DECISION


def create_game(*, room_code: str, game_id: str | None = None, total_rounds: int | None = None) -> Game:
    balance_config = get_balance_config()
    return Game(
        game_id=game_id or uuid4().hex,
        room_code=room_code,
        current_round=1,
        total_rounds=balance_config.global_config.total_rounds if total_rounds is None else total_rounds,
        current_phase=INITIAL_GAME_PHASE,
        is_finished=False,
        active_snapshot_id=None,
    )


def create_initial_snapshot(
    *,
    game: Game,
    player_assignments: Mapping[str, CountryCode] | Iterable[tuple[str, CountryCode]],
    snapshot_id: str | None = None,
    phase_deadline_at: datetime | None = None,
) -> GameSnapshot:
    balance_config = get_balance_config()
    ordered_assignments = _normalize_player_assignments(player_assignments)
    snapshot = GameSnapshot(
        snapshot_id=snapshot_id or uuid4().hex,
        game_id=game.game_id,
        round_no=1,
        max_rounds=game.total_rounds,
        phase=INITIAL_GAME_PHASE,
        rules_version=RULES_VERSION_V2,
        phase_deadline_at=phase_deadline_at,
        player_states=[_build_player_state(player_id=player_id, country=country) for player_id, country in ordered_assignments],
        region_states=[_build_region_state(blueprint) for blueprint in balance_config.regions.region_blueprints.values()],
        ocean_node_states=[_build_ocean_node_state(blueprint) for blueprint in balance_config.regions.ocean_node_blueprints.values()],
        ranking=[],
        last_settlement_summary={},
    )
    hydrate_snapshot_workspaces(snapshot)
    game.set_active_snapshot(snapshot)
    game.current_round = 1
    game.current_phase = INITIAL_GAME_PHASE
    return snapshot


def _normalize_player_assignments(
    player_assignments: Mapping[str, CountryCode] | Iterable[tuple[str, CountryCode]],
) -> list[tuple[str, CountryCode]]:
    if isinstance(player_assignments, Mapping):
        items = list(player_assignments.items())
    else:
        items = list(player_assignments)

    normalized_by_country: dict[CountryCode, str] = {}
    seen_player_ids: set[str] = set()
    for player_id, raw_country in items:
        if player_id in seen_player_ids:
            raise ValueError(f"Duplicate player_id in assignments: {player_id}")
        seen_player_ids.add(player_id)
        country = CountryCode(raw_country)
        if country in normalized_by_country:
            raise ValueError(f"Country assigned more than once: {country.value}")
        normalized_by_country[country] = player_id

    expected_countries = set(CountryCode)
    if set(normalized_by_country) != expected_countries:
        raise ValueError("player_assignments must contain each country exactly once.")

    return [(normalized_by_country[country], country) for country in CountryCode]


def _build_player_state(*, player_id: str, country: CountryCode) -> PlayerState:
    balance_config = get_balance_config()
    baseline = balance_config.countries[country.value]
    production_levels = balance_config.production.levels
    technology_tracks = tuple(balance_config.technology.tech_tree)
    ideology_keys = balance_config.politics.ideology_keys
    goods_stock_keys = tuple(
        dict.fromkeys(
            [
                *baseline.goods_stock.keys(),
                *(goods_key for region in balance_config.regions.region_blueprints.values() for goods_key in region.resource_limit),
            ]
        )
    )

    seeded_capacity_by_mode = dict(DEFAULT_PHASE1_CAPACITY_BY_MODE)
    for mode, value in baseline.production_capacity.items():
        seeded_capacity_by_mode[mode] = int(value)

    return PlayerState(
        player_id=player_id,
        country=country,
        domestic_sales_revenue=0,
        overseas_sales_revenue=0,
        national_income=0,
        cumulative_national_income=0,
        income_allocation_ratio={key: float(value) for key, value in baseline.income_allocation_ratio.items()},
        budget_pools={key: int(value) for key, value in baseline.budget_pools.items()},
        tech_points=int(baseline.tech_points),
        military_points=int(baseline.military_points),
        production_capacity={key: int(value) for key, value in baseline.production_capacity.items()},
        pending_production_capacity={level: 0 for level in production_levels},
        goods_stock={key: int(baseline.goods_stock.get(key, 0)) for key in goods_stock_keys},
        raw_material_usage={},
        research={tech: 0 for tech in technology_tracks},
        research_facilities={key: int(value) for key, value in baseline.research_facilities.items()},
        unlocked_techs=[],
        goods_allocation={},
        army={key: int(value) for key, value in baseline.army.items()},
        navy={key: int(value) for key, value in baseline.navy.items()},
        administration_capacity=int(baseline.administration_capacity),
        ideology_levels={key: int(baseline.ideology_levels.get(key, 0)) for key in ideology_keys},
        reforms=[],
        policies=[],
        income_summary={
            "domesticMarketCapacity": 0,
            "overseasMarketCapacity": 0,
            "domesticPriceBonus": 0,
            "overseasPriceBonus": 0,
        },
        established_diplomacy=list(baseline.initial_diplomacy),
        colonization_unlocked=False,
        used_abilities=[],
        phase1_economy=Phase1EconomyState(
            raw_materials=int(baseline.initial_raw_materials),
            capacity_by_mode=seeded_capacity_by_mode,
        ),
    )


def _build_region_state(blueprint) -> RegionState:
    return RegionState(
        region_id=blueprint.region_id,
        access_level=blueprint.access_level,
        market_supply={},
        market_price={},
        controller=None,
        garrison={country.value: 0 for country in CountryCode},
        independence=0,
        resource_limit={key: int(value) for key, value in blueprint.resource_limit.items()},
    )


def _build_ocean_node_state(blueprint) -> OceanNodeState:
    return OceanNodeState(
        node_id=blueprint.node_id,
        navy_by_country={country.value: 0 for country in CountryCode},
        controller=None,
        is_blockaded=False,
        reachable_routes=list(blueprint.reachable_routes),
    )

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.contracts.enums import ErrorCode, GamePhase, PlayerSubmissionStatus
from app.modules.balance_config import get_balance_config
from app.modules.game_state.budgeting import calculate_market_regulation_allowance
from app.modules.game_state.effects import apply_effects
from app.modules.game_state.factory_economy import (
    action_locked_reason,
    current_route_capacity,
    expansion_unit_budget_cost,
    new_factory_unit_budget_cost,
    route_locked_reason,
    upgrade_unit_budget_cost,
)
from app.modules.game_state.market_access import is_region_accessible, resolve_domestic_market_capacity
from app.modules.game_state.models import Game, GameSnapshot
from app.modules.game_state.phase_deadline import deadline_has_passed
from app.modules.game_state.phase_state import PhaseSubmissionState
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.room.models import Room
from app.modules.rules.common import (
    POINT_PURCHASE_COSTS,
    default_decision_submission_payload,
    default_market_submission_payload,
)
from app.modules.rules.route_utils import check_route_accessible


PHASE1_GOODS_KEY = "phase1_goods"


@dataclass(slots=True)
class PhaseSubmissionError(Exception):
    error_code: ErrorCode
    message: str
    details: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


@dataclass(slots=True)
class PhaseSubmissionResult:
    player_turn_input: PlayerTurnInput
    updated_phase_state: PhaseSubmissionState


@dataclass(slots=True)
class TimeoutAutoSubmitResult:
    generated_inputs: list[PlayerTurnInput]
    updated_phase_state: PhaseSubmissionState


def build_player_turn_input(
    *,
    game_id: str,
    round_no: int,
    phase: GamePhase,
    player_id: str,
    payload: dict[str, object],
    submitted_at: datetime,
) -> PlayerTurnInput:
    return PlayerTurnInput(
        game_id=game_id,
        round_no=round_no,
        phase=phase,
        player_id=player_id,
        submission_status=PlayerSubmissionStatus.SUBMITTED,
        payload=_normalize_submission_payload(phase=phase, payload=payload),
        submitted_at=submitted_at,
        is_timeout_generated=False,
    )


def build_timeout_player_turn_input(
    *,
    game_id: str,
    round_no: int,
    phase: GamePhase,
    player_id: str,
    submitted_at: datetime,
) -> PlayerTurnInput:
    payload = default_decision_submission_payload() if phase == GamePhase.DECISION else default_market_submission_payload()
    return PlayerTurnInput(
        game_id=game_id,
        round_no=round_no,
        phase=phase,
        player_id=player_id,
        submission_status=PlayerSubmissionStatus.TIMEOUT_AUTO_SUBMITTED,
        payload=payload,
        submitted_at=submitted_at,
        is_timeout_generated=True,
    )


class PhaseSubmissionService:
    def submit(
        self,
        *,
        room: Room,
        game: Game,
        snapshot: GameSnapshot,
        phase_state: PhaseSubmissionState,
        player_id: str,
        requested_phase: GamePhase,
        payload: dict[str, object],
        submitted_at: datetime,
    ) -> PhaseSubmissionResult:
        self._validate_membership(room=room, player_id=player_id)
        self._validate_phase(
            game=game,
            snapshot=snapshot,
            phase_state=phase_state,
            requested_phase=requested_phase,
        )
        self._validate_deadline(snapshot=snapshot, submitted_at=submitted_at)
        self._validate_submission_state(phase_state=phase_state, player_id=player_id)
        normalized_payload = _normalize_submission_payload(phase=snapshot.phase, payload=payload)
        self._validate_normalized_payload(
            snapshot=snapshot,
            player_id=player_id,
            phase=snapshot.phase,
            payload=normalized_payload,
        )

        turn_input = build_player_turn_input(
            game_id=game.game_id,
            round_no=snapshot.round_no,
            phase=snapshot.phase,
            player_id=player_id,
            payload=normalized_payload,
            submitted_at=submitted_at,
        )
        return PhaseSubmissionResult(
            player_turn_input=turn_input,
            updated_phase_state=phase_state.with_submission(turn_input),
        )

    def auto_submit_timeouts(
        self,
        *,
        snapshot: GameSnapshot,
        phase_state: PhaseSubmissionState,
        triggered_at: datetime,
    ) -> TimeoutAutoSubmitResult:
        if not deadline_has_passed(deadline_at=snapshot.phase_deadline_at, now=triggered_at):
            return TimeoutAutoSubmitResult(generated_inputs=[], updated_phase_state=phase_state)

        updated_phase_state = phase_state
        generated_inputs: list[PlayerTurnInput] = []
        for player_id in updated_phase_state.pending_player_ids:
            turn_input = build_timeout_player_turn_input(
                game_id=snapshot.game_id,
                round_no=snapshot.round_no,
                phase=snapshot.phase,
                player_id=player_id,
                submitted_at=triggered_at,
            )
            generated_inputs.append(turn_input)
            updated_phase_state = updated_phase_state.with_submission(turn_input)

        return TimeoutAutoSubmitResult(
            generated_inputs=generated_inputs,
            updated_phase_state=updated_phase_state,
        )

    def _validate_membership(self, *, room: Room, player_id: str) -> None:
        if not room.has_member(player_id):
            raise PhaseSubmissionError(
                ErrorCode.NOT_ROOM_MEMBER,
                "Player is not a member of the current room.",
            )

    def _validate_phase(
        self,
        *,
        game: Game,
        snapshot: GameSnapshot,
        phase_state: PhaseSubmissionState,
        requested_phase: GamePhase,
    ) -> None:
        current_phase = snapshot.phase
        if current_phase == GamePhase.SETTLEMENT:
            raise PhaseSubmissionError(
                ErrorCode.PHASE_MISMATCH,
                "Settlement is a system phase and does not accept player submissions.",
            )
        if requested_phase != current_phase or game.current_phase != current_phase or phase_state.phase != current_phase:
            raise PhaseSubmissionError(
                ErrorCode.PHASE_MISMATCH,
                "Submission phase does not match the active game phase.",
            )

    def _validate_deadline(self, *, snapshot: GameSnapshot, submitted_at: datetime) -> None:
        if deadline_has_passed(deadline_at=snapshot.phase_deadline_at, now=submitted_at):
            raise PhaseSubmissionError(
                ErrorCode.DEADLINE_PASSED,
                "The current phase deadline has already passed.",
            )

    def _validate_submission_state(self, *, phase_state: PhaseSubmissionState, player_id: str) -> None:
        if phase_state.has_submitted(player_id):
            raise PhaseSubmissionError(
                ErrorCode.ALREADY_SUBMITTED,
                "The player has already submitted for the current phase.",
            )

    def _validate_normalized_payload(
        self,
        *,
        snapshot: GameSnapshot,
        player_id: str,
        phase: GamePhase,
        payload: dict[str, Any],
    ) -> None:
        player_state = next((player for player in snapshot.player_states if player.player_id == player_id), None)
        if player_state is None:
            raise PhaseSubmissionError(ErrorCode.INVALID_SUBMISSION, "Player state is missing from snapshot.")

        if phase == GamePhase.DECISION:
            _validate_decision_payload(snapshot=snapshot, player_state=player_state, payload=payload)
        if phase == GamePhase.MARKET:
            _validate_market_payload(snapshot=snapshot, player_state=player_state, payload=payload)


def _normalize_submission_payload(*, phase: GamePhase, payload: dict[str, object]) -> dict[str, Any]:
    if phase == GamePhase.DECISION:
        return _normalize_decision_submission(payload)
    if phase == GamePhase.MARKET:
        return _normalize_market_submission(payload)
    raise PhaseSubmissionError(
        ErrorCode.PHASE_MISMATCH,
        "Settlement is a system phase and does not accept player submissions.",
    )


def _validate_market_payload(*, snapshot: GameSnapshot, player_state, payload: dict[str, Any]) -> None:
    balance = get_balance_config()
    for order in payload.get("saleOrders", []):
        if str(order.get("market") or "") != "overseas":
            continue

        region_id = str(order.get("regionId") or "")
        if not region_id:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                "Overseas market sale order requires regionId.",
            )

        region_state = next((region for region in snapshot.region_states if region.region_id == region_id), None)
        if region_state is None:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Overseas market region {region_id} is invalid.",
            )
        if not is_region_accessible(
            region_state.access_level,
            region_id=region_id,
            established_diplomacy=player_state.established_diplomacy,
        ):
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Overseas market region {region_id} is not accessible.",
            )

    phase1_market = payload.get("phase1Market") or {}
    _validate_external_competition_deployments(
        snapshot=snapshot,
        player_state=player_state,
        phase1_market=phase1_market,
        balance=balance,
    )
    domestic_allocation_raw = phase1_market.get("domesticAllocation")
    if isinstance(domestic_allocation_raw, (int, float)) and not isinstance(domestic_allocation_raw, bool):
        domestic_allocation = max(0, int(domestic_allocation_raw))
        if domestic_allocation > 0:
            total_goods = max(0, int(player_state.phase1_economy.goods_inventory))
            if domestic_allocation > total_goods:
                raise PhaseSubmissionError(
                    ErrorCode.INVALID_SUBMISSION,
                    f"Domestic market allocation ({domestic_allocation}) exceeds available goods inventory ({total_goods}).",
                )
            from app.modules.rules.phase1_economy import calculate_domestic_demand
            domestic_demand = int(calculate_domestic_demand(player_state.phase1_economy.capacity_by_mode))
            if domestic_allocation > domestic_demand:
                raise PhaseSubmissionError(
                    ErrorCode.INVALID_SUBMISSION,
                    f"Domestic market allocation ({domestic_allocation}) exceeds domestic demand ({domestic_demand}).",
                )
            domestic_capacity = max(0, int(resolve_domestic_market_capacity(player_state)))
            if domestic_allocation > domestic_capacity:
                raise PhaseSubmissionError(
                    ErrorCode.INVALID_SUBMISSION,
                    f"Domestic market allocation ({domestic_allocation}) exceeds domestic market capacity ({domestic_capacity}).",
                )


def _validate_external_competition_deployments(
    *,
    snapshot: GameSnapshot,
    player_state,
    phase1_market: dict[str, Any],
    balance,
) -> None:
    raw_deployments = phase1_market.get("externalCompetitionDeployments", [])
    if raw_deployments is None:
        return
    if not isinstance(raw_deployments, list):
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Market submission.phase1Market.externalCompetitionDeployments must be a list.",
        )

    regions_by_id = {region.region_id: region for region in snapshot.region_states}
    seen_regions: set[str] = set()
    total_infantry = 0
    total_artillery = 0
    minimum_power = int(balance.market.overseas_competition.minimum_power)
    infantry_power = int(balance.market.overseas_competition.infantry_power)
    artillery_power = int(balance.market.overseas_competition.artillery_power)

    for index, raw_deployment in enumerate(raw_deployments):
        if not isinstance(raw_deployment, dict):
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Market submission.phase1Market.externalCompetitionDeployments[{index}] must be an object.",
            )
        region_id = str(raw_deployment.get("marketId") or "").strip()
        if not region_id:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Market submission.phase1Market.externalCompetitionDeployments[{index}].marketId must be a non-empty string.",
            )
        if region_id in seen_regions:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Overseas competition region {region_id} is duplicated in this submission.",
            )
        seen_regions.add(region_id)

        region_state = regions_by_id.get(region_id)
        if region_state is None:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Overseas competition region {region_id} is invalid.",
            )
        if region_id not in player_state.established_diplomacy:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Overseas competition region {region_id} requires established diplomacy.",
            )
        if not check_route_accessible(player_state.country.value, region_id, snapshot, balance):
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Overseas competition region {region_id} route is blocked.",
            )

        try:
            infantry = max(0, int(raw_deployment.get("infantry", 0) or 0))
            artillery = max(0, int(raw_deployment.get("artillery", 0) or 0))
        except (TypeError, ValueError) as exc:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Overseas competition region {region_id} deployment must use integer army counts.",
            ) from exc
        power = infantry * infantry_power + artillery * artillery_power
        if power < minimum_power:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Overseas competition region {region_id} deployment power is below minimum.",
            )
        total_infantry += infantry
        total_artillery += artillery

    available_infantry = int(player_state.army.get("infantry", 0))
    available_artillery = int(player_state.army.get("artillery", 0))
    if total_infantry > available_infantry or total_artillery > available_artillery:
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Overseas competition deployment exceeds available army.",
            details={
                "reason": (
                    f"海外争夺兵力不足：计划步兵 {total_infantry}/{available_infantry}，"
                    f"炮兵 {total_artillery}/{available_artillery}"
                ),
            },
        )


def _normalize_decision_submission(payload: dict[str, object]) -> dict[str, Any]:
    normalized = default_decision_submission_payload()

    factory_plan = payload.get("factoryPlan")
    if not isinstance(factory_plan, dict):
        raise PhaseSubmissionError(ErrorCode.INVALID_SUBMISSION, "Decision submission.factoryPlan must be an object.")
    normalized["factoryPlan"]["productionOrders"] = _normalize_order_list(factory_plan.get("productionOrders"), "goodsId")
    normalized["factoryPlan"]["expansionOrders"] = _normalize_order_list(factory_plan.get("expansionOrders"), "routeId")
    normalized["factoryPlan"]["upgradeOrders"] = _normalize_upgrade_orders(factory_plan.get("upgradeOrders"))
    normalized["factoryPlan"]["newFactoryOrders"] = _normalize_order_list(factory_plan.get("newFactoryOrders"), "routeId")
    normalized["factoryPlan"]["factoryActions"] = _normalize_action_list(factory_plan.get("factoryActions") or [])

    domestic_plan = payload.get("domesticMarketPlan")
    if not isinstance(domestic_plan, dict):
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Decision submission.domesticMarketPlan must be an object.",
        )
    normalized["domesticMarketPlan"]["domesticMarketActions"] = _normalize_action_list(
        domestic_plan.get("domesticMarketActions")
    )

    government_plan = payload.get("governmentPlan")
    if not isinstance(government_plan, dict):
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Decision submission.governmentPlan must be an object.",
        )
    normalized["governmentPlan"]["pointPurchases"] = _normalize_point_purchase_list(
        government_plan.get("pointPurchases") or []
    )
    normalized["governmentPlan"]["strategySelections"] = _normalize_action_list(
        government_plan.get("strategySelections") or []
    )
    normalized["governmentPlan"]["techResearch"] = _normalize_tech_research_list(
        government_plan.get("techResearch") or []
    )
    raw_admin_purchases = government_plan.get("adminPurchases")
    try:
        normalized["governmentPlan"]["adminPurchases"] = max(0, int(raw_admin_purchases or 0))
    except (TypeError, ValueError) as exc:
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Decision submission.governmentPlan.adminPurchases must be a non-negative integer.",
        ) from exc

    raw_reforms = payload.get("reforms")
    if isinstance(raw_reforms, list):
        normalized["reforms"] = [
            str(item).strip() for item in raw_reforms if isinstance(item, str) and item.strip()
        ]
    raw_activate = payload.get("activatePolicies")
    if isinstance(raw_activate, list):
        normalized["activatePolicies"] = [
            str(item).strip() for item in raw_activate if isinstance(item, str) and item.strip()
        ]
    raw_deactivate = payload.get("deactivatePolicies")
    if isinstance(raw_deactivate, list):
        normalized["deactivatePolicies"] = [
            str(item).strip() for item in raw_deactivate if isinstance(item, str) and item.strip()
        ]

    military_plan = payload.get("militaryPlan")
    if military_plan is None:
        military_plan = {
            "unlockColonization": False,
            "militaryActions": [],
            "diplomacyActions": [],
            "colonizationActions": [],
        }
    if not isinstance(military_plan, dict):
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Decision submission.militaryPlan must be an object.",
        )
    normalized["militaryPlan"]["militaryActions"] = _normalize_action_list(
        military_plan.get("militaryActions", [])
    )
    normalized["militaryPlan"]["diplomacyActions"] = _normalize_action_list(
        military_plan.get("diplomacyActions", [])
    )
    normalized["militaryPlan"]["unlockColonization"] = bool(military_plan.get("unlockColonization", False))
    normalized["militaryPlan"]["colonizationActions"] = military_plan.get("colonizationActions", [])
    normalized["militaryPlan"]["lootingActions"] = military_plan.get("lootingActions", [])
    normalized["militaryPlan"]["navalDeployment"] = military_plan.get("navalDeployment", {})
    normalized["militaryPlan"]["conquestActions"] = military_plan.get("conquestActions", [])

    talent_plan = payload.get("talentPlan")
    if isinstance(talent_plan, dict):
        normalized["talentPlan"]["talentUnlocks"] = _normalize_talent_unlock_list(
            talent_plan.get("talentUnlocks", [])
        )

    ability_selection = payload.get("abilitySelection")
    if isinstance(ability_selection, dict) and not ability_selection:
        ability_selection = None
    if ability_selection is not None:
        normalized_ability_selection = _normalize_ability_selection(ability_selection)
        if normalized_ability_selection:
            normalized["abilitySelection"] = normalized_ability_selection

    phase1_production = payload.get("phase1Production")
    if isinstance(phase1_production, dict):
        raw_assignments = phase1_production.get("rawMaterialAssignments")
        if isinstance(raw_assignments, dict) and raw_assignments:
            normalized["phase1Production"] = phase1_production

    raw_research_target = payload.get("researchTarget")
    if isinstance(raw_research_target, str) and raw_research_target.strip():
        normalized["researchTarget"] = raw_research_target.strip()

    return normalized


def _normalize_market_submission(payload: dict[str, object]) -> dict[str, Any]:
    normalized = default_market_submission_payload()
    raw_orders = payload.get("saleOrders")
    if raw_orders is None:
        raw_orders = []
    if not isinstance(raw_orders, list):
        raise PhaseSubmissionError(ErrorCode.INVALID_SUBMISSION, "Market submission.saleOrders must be a list.")

    orders: list[dict[str, Any]] = []
    for index, raw_order in enumerate(raw_orders):
        if not isinstance(raw_order, dict):
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Market submission.saleOrders[{index}] must be an object.",
            )
        goods_id = raw_order.get("goodsId")
        market = raw_order.get("market")
        quantity = raw_order.get("quantity")
        if not isinstance(goods_id, str) or not goods_id.strip():
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Market submission.saleOrders[{index}].goodsId must be a non-empty string.",
            )
        if market not in {"domestic", "overseas"}:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Market submission.saleOrders[{index}].market must be domestic or overseas.",
            )
        try:
            normalized_quantity = max(0, int(quantity))
        except (TypeError, ValueError) as exc:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Market submission.saleOrders[{index}].quantity must be an integer.",
            ) from exc
        order: dict[str, Any] = {
            "goodsId": goods_id.strip(),
            "market": market,
            "quantity": normalized_quantity,
        }
        region_id = raw_order.get("regionId")
        if isinstance(region_id, str) and region_id.strip():
            order["regionId"] = region_id.strip()
        orders.append(order)
    normalized["saleOrders"] = orders

    phase1_market = payload.get("phase1Market")
    if isinstance(phase1_market, dict):
        normalized_phase1_market: dict[str, Any] = {}
        raw_domestic = phase1_market.get("domesticAllocation")
        if isinstance(raw_domestic, (int, float)) and not isinstance(raw_domestic, bool) and raw_domestic >= 0:
            normalized_phase1_market["domesticAllocation"] = max(0, int(raw_domestic))
        has_domestic_allocation = "domesticAllocation" in normalized_phase1_market
        has_external_allocations = "externalAllocations" in phase1_market
        external_allocations = _normalize_phase1_external_allocations(
            phase1_market.get("externalAllocations")
        )
        if external_allocations or (has_domestic_allocation and has_external_allocations):
            normalized_phase1_market["externalAllocations"] = external_allocations
        has_external_competition_deployments = "externalCompetitionDeployments" in phase1_market
        external_competition_deployments = _normalize_external_competition_deployments(
            phase1_market.get("externalCompetitionDeployments")
        )
        if external_competition_deployments or (
            has_domestic_allocation and has_external_competition_deployments
        ):
            normalized_phase1_market["externalCompetitionDeployments"] = external_competition_deployments
        if normalized_phase1_market:
            normalized["phase1Market"] = normalized_phase1_market
    return normalized


def _normalize_phase1_external_allocations(value: object) -> list[dict[str, int | str]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Market submission.phase1Market.externalAllocations must be a list.",
        )
    normalized: list[dict[str, int | str]] = []
    for index, raw_item in enumerate(value):
        if not isinstance(raw_item, dict):
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Market submission.phase1Market.externalAllocations[{index}] must be an object.",
            )
        market_id = raw_item.get("marketId")
        if not isinstance(market_id, str) or not market_id.strip():
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Market submission.phase1Market.externalAllocations[{index}].marketId must be a non-empty string.",
            )
        try:
            quantity = max(0, int(raw_item.get("quantity", 0) or 0))
        except (TypeError, ValueError) as exc:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Market submission.phase1Market.externalAllocations[{index}].quantity must be an integer.",
            ) from exc
        if quantity > 0:
            normalized.append({"marketId": market_id.strip(), "quantity": quantity})
    return normalized


def _normalize_external_competition_deployments(value: object) -> list[dict[str, int | str]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Market submission.phase1Market.externalCompetitionDeployments must be a list.",
        )
    normalized: list[dict[str, int | str]] = []
    for index, raw_item in enumerate(value):
        if not isinstance(raw_item, dict):
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Market submission.phase1Market.externalCompetitionDeployments[{index}] must be an object.",
            )
        market_id = raw_item.get("marketId")
        if not isinstance(market_id, str) or not market_id.strip():
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Market submission.phase1Market.externalCompetitionDeployments[{index}].marketId must be a non-empty string.",
            )
        try:
            infantry = max(0, int(raw_item.get("infantry", 0) or 0))
            artillery = max(0, int(raw_item.get("artillery", 0) or 0))
        except (TypeError, ValueError) as exc:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Market submission.phase1Market.externalCompetitionDeployments[{index}] must use integer army counts.",
            ) from exc
        if infantry > 0 or artillery > 0:
            normalized.append(
                {
                    "marketId": market_id.strip(),
                    "infantry": infantry,
                    "artillery": artillery,
                }
            )
    return normalized


def _normalize_order_list(value: object, id_key: str) -> list[dict[str, int | str]]:
    if value is None:
        value = []
    if not isinstance(value, list):
        raise PhaseSubmissionError(ErrorCode.INVALID_SUBMISSION, f"Decision submission.{id_key} orders must be a list.")

    normalized: list[dict[str, int | str]] = []
    for index, raw_item in enumerate(value):
        if not isinstance(raw_item, dict):
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Decision submission order[{index}] must be an object.",
            )
        raw_id = raw_item.get(id_key)
        raw_quantity = raw_item.get("quantity")
        if not isinstance(raw_id, str) or not raw_id.strip():
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Decision submission order[{index}].{id_key} must be a non-empty string.",
            )
        try:
            quantity = max(0, int(raw_quantity))
        except (TypeError, ValueError) as exc:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Decision submission order[{index}].quantity must be an integer.",
            ) from exc
        normalized.append({id_key: raw_id.strip(), "quantity": quantity})
    return normalized


def _normalize_upgrade_orders(value: object) -> list[dict[str, int | str]]:
    """Upgrade orders use routeId (target mode name), e.g. 'mechanized'."""
    if value is None:
        value = []
    if not isinstance(value, list):
        raise PhaseSubmissionError(ErrorCode.INVALID_SUBMISSION, "Decision submission.upgradeOrders must be a list.")

    normalized: list[dict[str, int | str]] = []
    for index, raw_item in enumerate(value):
        if not isinstance(raw_item, dict):
            continue
        # Accept both routeId and targetMode as the target
        route_id = str(raw_item.get("routeId") or raw_item.get("targetMode") or "").strip()
        if not route_id:
            continue
        try:
            quantity = max(0, int(raw_item.get("quantity", 0)))
        except (TypeError, ValueError):
            continue
        if quantity <= 0:
            continue
        normalized.append({"routeId": route_id, "quantity": quantity})
    return normalized


def _normalize_action_list(value: object) -> list[dict[str, str]]:
    if not isinstance(value, list):
        raise PhaseSubmissionError(ErrorCode.INVALID_SUBMISSION, "Action selections must be a list.")

    normalized: list[dict[str, str]] = []
    for index, raw_item in enumerate(value):
        if not isinstance(raw_item, dict):
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Action selection[{index}] must be an object.",
            )
        action_id = raw_item.get("actionId")
        if not isinstance(action_id, str) or not action_id.strip():
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Action selection[{index}].actionId must be a non-empty string.",
            )
        normalized.append({"actionId": action_id.strip()})
    return normalized


def _normalize_point_purchase_list(value: object) -> list[dict[str, int | str]]:
    if not isinstance(value, list):
        raise PhaseSubmissionError(ErrorCode.INVALID_SUBMISSION, "Point purchases must be a list.")

    normalized: list[dict[str, int | str]] = []
    for index, raw_item in enumerate(value):
        if not isinstance(raw_item, dict):
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Point purchase[{index}] must be an object.",
            )
        point_type = raw_item.get("pointType")
        raw_quantity = raw_item.get("quantity")
        if point_type not in {"tech", "military"}:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Point purchase[{index}].pointType must be tech or military.",
            )
        try:
            quantity = max(0, int(raw_quantity))
        except (TypeError, ValueError) as exc:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Point purchase[{index}].quantity must be an integer.",
            ) from exc
        normalized.append({"pointType": point_type, "quantity": quantity})
    return normalized


def _normalize_ability_selection(value: object) -> dict[str, str]:
    if not isinstance(value, dict):
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Decision submission.abilitySelection must be an object.",
        )

    ability_id = value.get("abilityId")
    if not isinstance(ability_id, str) or not ability_id.strip():
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Decision submission.abilitySelection.abilityId must be a non-empty string.",
        )

    normalized = {"abilityId": ability_id.strip()}
    target_ideology = value.get("targetIdeology")
    if target_ideology is not None:
        if target_ideology not in {"liberalism", "egalitarianism", "nationalism"}:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                "Decision submission.abilitySelection.targetIdeology must be a supported ideology.",
            )
        normalized["targetIdeology"] = str(target_ideology)
    return normalized


def _normalize_tech_research_list(value: object) -> list[dict[str, str]]:
    if not isinstance(value, list):
        raise PhaseSubmissionError(ErrorCode.INVALID_SUBMISSION, "Tech research selections must be a list.")

    normalized: list[dict[str, str]] = []
    for index, raw_item in enumerate(value):
        if not isinstance(raw_item, dict):
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Tech research[{index}] must be an object.",
            )
        tech_id = raw_item.get("techId")
        if not isinstance(tech_id, str) or not tech_id.strip():
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Tech research[{index}].techId must be a non-empty string.",
            )
        normalized.append({"techId": tech_id.strip()})
    return normalized


def _normalize_talent_unlock_list(value: object) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []

    normalized: list[dict[str, str]] = []
    for index, raw_item in enumerate(value):
        if not isinstance(raw_item, dict):
            continue
        node_id = raw_item.get("nodeId")
        if not isinstance(node_id, str) or not node_id.strip():
            continue
        normalized.append({"nodeId": node_id.strip()})
    return normalized


def _phase1_production_unit_budget_cost(balance) -> int:
    goods = balance.production.goods.get(PHASE1_GOODS_KEY)
    if goods is None:
        return 1
    return max(0, int(goods.unit_budget_cost))


def _player_state_with_active_event_effects(snapshot: GameSnapshot, player_state):
    if not snapshot.active_events:
        return player_state
    preview_player = deepcopy(player_state)
    for event in snapshot.active_events:
        effects = event.get("effects")
        if isinstance(effects, dict):
            apply_effects(preview_player, effects)
    return preview_player


def _validate_decision_payload(*, snapshot: GameSnapshot, player_state, payload: dict[str, Any]) -> None:
    player_state = _player_state_with_active_event_effects(snapshot, player_state)
    balance = get_balance_config()
    factory_budget = int(player_state.budget_pools.get("factory", 0))
    domestic_budget = int(player_state.budget_pools.get("domesticMarket", 0))
    government_budget = int(player_state.budget_pools.get("governmentFiscal", 0))
    shared_route_usage: dict[str, int] = {}
    upgradeable_source_capacity = {
        route_id: current_route_capacity(player_state, route_id)
        for route_id in balance.production.levels
        if route_id != "idle"
    }

    factory_spend = 0
    factory_capacity_delta = 0
    raw_materials_delta = 0
    selected_factory_actions: set[str] = set()
    for selection in payload.get("factoryPlan", {}).get("factoryActions", []):
        action_id = str(selection.get("actionId") or "")
        action = balance.decision_actions.factory_actions.get(action_id)
        if action is None:
            raise PhaseSubmissionError(ErrorCode.INVALID_SUBMISSION, f"Unknown factory action: {action_id}")
        if action_locked_reason(player_state, action_id) is not None:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Factory action {action_id} requires required technology.",
            )
        if action_id in selected_factory_actions:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Factory action {action_id} is duplicated in this submission.",
            )
        selected_factory_actions.add(action_id)
        factory_spend += int(action.budget_pool_cost)
        factory_capacity_delta += int(action.effects.get("phase1ProductionRawCapacityDelta", 0))
        raw_materials_delta += int(action.effects.get("rawMaterialsDelta", 0))
        factory_budget += int(action.effects.get("factoryBudgetDelta", 0))
        domestic_budget += int(action.effects.get("domesticMarketBudgetDelta", 0))
        government_budget += int(action.effects.get("governmentFiscalBudgetDelta", 0))
        government_budget += int(action.effects.get("governmentFiscalDelta", 0))

    for order in payload.get("factoryPlan", {}).get("productionOrders", []):
        quantity = max(0, int(order.get("quantity", 0)))
        if quantity <= 0:
            continue
        # 2.0: productionOrders are legacy pass-through; budget validation is handled by phase1Production rules
        # We still count them against factory budget to prevent abuse
        factory_spend += quantity

    for order in payload.get("factoryPlan", {}).get("expansionOrders", []):
        route_id = str(order.get("routeId") or "")
        if current_route_capacity(player_state, route_id) <= 0:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Expansion route {route_id} is not unlocked.",
            )
        quantity = max(0, int(order.get("quantity", 0)))
        factory_spend += quantity * expansion_unit_budget_cost(player_state, route_id)

    for order in payload.get("factoryPlan", {}).get("upgradeOrders", []):
        route_id = str(order.get("routeId") or "")
        source_route = balance.production.upgrade_source_levels.get(route_id)
        if source_route is None:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Upgrade route {route_id} is invalid.",
            )
        if route_locked_reason(player_state, route_id) is not None:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Upgrade route {route_id} requires route technology.",
            )
        quantity = max(0, int(order.get("quantity", 0)))
        if quantity > max(0, int(upgradeable_source_capacity.get(source_route, 0))):
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Upgrade route {route_id} has no available source route capacity.",
            )
        upgradeable_source_capacity[source_route] = max(
            0,
            int(upgradeable_source_capacity.get(source_route, 0)) - quantity,
        )
        factory_spend += quantity * upgrade_unit_budget_cost(player_state, route_id)

    for order in payload.get("factoryPlan", {}).get("newFactoryOrders", []):
        route_id = str(order.get("routeId") or "")
        if route_id not in balance.production.new_factory_costs:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"New factory route {route_id} is invalid.",
            )
        if route_locked_reason(player_state, route_id) is not None:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"New factory route {route_id} requires route technology.",
            )
        quantity = max(0, int(order.get("quantity", 0)))
        factory_spend += quantity * new_factory_unit_budget_cost(player_state, route_id)

    phase1_production = payload.get("phase1Production")
    if isinstance(phase1_production, dict):
        raw_assignments = phase1_production.get("rawMaterialAssignments")
        if isinstance(raw_assignments, dict):
            production_unit_cost = _phase1_production_unit_budget_cost(balance)
            available_raw = max(0, int(player_state.phase1_economy.raw_materials) + raw_materials_delta)
            capacity_by_mode = player_state.phase1_economy.capacity_by_mode
            total_capacity_limit = max(
                0,
                sum(
                    max(0, int(capacity_by_mode.get(mode, 0)))
                    for mode in capacity_by_mode
                    if mode != "idle"
                )
                + factory_capacity_delta,
            )
            for mode, raw_amount in raw_assignments.items():
                try:
                    requested = max(0, int(raw_amount))
                except (TypeError, ValueError):
                    requested = 0
                if str(mode) not in capacity_by_mode:
                    continue
                capped = min(
                    requested,
                    max(0, int(capacity_by_mode.get(str(mode), 0))),
                    available_raw,
                    total_capacity_limit,
                )
                if capped <= 0:
                    continue
                factory_spend += capped * production_unit_cost
                available_raw -= capped
                total_capacity_limit -= capped

    if factory_spend > factory_budget:
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Factory budget exceeded for the submitted plan.",
            details={"reason": f"工厂预算超支：计划 {factory_spend} > 可用 {factory_budget}"},
        )

    domestic_spend = 0
    for selection in payload.get("domesticMarketPlan", {}).get("domesticMarketActions", []):
        action_id = str(selection.get("actionId") or "")
        action = balance.decision_actions.domestic_market_actions.get(action_id)
        if action is None:
            raise PhaseSubmissionError(ErrorCode.INVALID_SUBMISSION, f"Unknown domesticMarket action: {action_id}")
        if action_locked_reason(player_state, action_id) is not None:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Domestic action {action_id} requires required technology.",
            )
        domestic_spend += int(action.budget_pool_cost)
    if domestic_spend > domestic_budget:
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Domestic market budget exceeded for the submitted plan.",
            details={"reason": f"国民消费预算超支：计划 {domestic_spend} > 可用 {domestic_budget}"},
        )

    core_government_spend = 0
    market_regulation_spend = 0
    admin_cost = max(1, int(balance.politics.administration_cost))

    raw_admin_purchase = payload.get("governmentPlan", {}).get("adminPurchases")
    try:
        admin_quantity = max(0, int(raw_admin_purchase or 0))
    except (TypeError, ValueError):
        admin_quantity = 0
    core_government_spend += admin_quantity * admin_cost

    point_costs = POINT_PURCHASE_COSTS
    for purchase in payload.get("governmentPlan", {}).get("pointPurchases", []):
        point_type = str(purchase.get("pointType") or "")
        if point_type not in point_costs:
            continue
        core_government_spend += max(0, int(purchase.get("quantity", 0))) * point_costs[point_type]

    # Market-regulation strategies use a one-turn allowance derived from
    # domesticMarket first; only overflow spends base government fiscal.
    for selection in payload.get("governmentPlan", {}).get("strategySelections", []):
        action_id = str(selection.get("actionId") or "")
        market_action = balance.decision_actions.domestic_market_actions.get(action_id)
        if market_action is not None:
            market_regulation_spend += int(market_action.budget_pool_cost)
            continue
        action = balance.decision_actions.government_actions.get(action_id)
        if action is not None:
            core_government_spend += int(action.budget_pool_cost)

    # Validate activatePolicies budget cost
    for raw_id in payload.get("activatePolicies") or []:
        policy_id = str(raw_id or "").strip()
        if not policy_id:
            continue
        policy = balance.reforms.regular_policies.get(policy_id)
        if policy is None:
            continue
        if policy_id in player_state.active_policies:
            continue  # already active, no cost
        core_government_spend += int(policy.budget_cost)

    military_plan_spend = 0
    military_point_spend = 0
    military_action_counts: dict[str, int] = {}
    for selection in payload.get("militaryPlan", {}).get("militaryActions", []):
        action_id = str(selection.get("actionId") or "")
        action = balance.military_actions.military_actions.get(action_id)
        if action is None:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Unknown military action: {action_id}",
                details={"rejectedActions": [{"actionId": action_id, "reason": "未知军事动作"}]},
            )
        if action_locked_reason(player_state, action_id) is not None:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Military action {action_id} requires required technology.",
                details={"rejectedActions": [{"actionId": action_id, "reason": "缺少前置科技"}]},
            )
        military_action_counts[action_id] = military_action_counts.get(action_id, 0) + 1
        if military_action_counts[action_id] > int(action.max_per_round):
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Military action {action_id} exceeds maxPerRound.",
                details={
                    "rejectedActions": [
                        {
                            "actionId": action_id,
                            "reason": f"超过本轮上限 {int(action.max_per_round)}",
                            "count": military_action_counts[action_id],
                            "maxPerRound": int(action.max_per_round),
                        }
                    ]
                },
            )
        military_plan_spend += int(action.budget_pool_cost)
        military_point_spend += int(action.military_point_cost)

    selected_diplomacy_regions: set[str] = set()
    for selection in payload.get("militaryPlan", {}).get("diplomacyActions", []):
        action_id = str(selection.get("actionId") or "")
        action = balance.military_actions.diplomacy_actions.get(action_id)
        if action is None:
            raise PhaseSubmissionError(ErrorCode.INVALID_SUBMISSION, f"Unknown diplomacy action: {action_id}")
        if action_locked_reason(player_state, action_id) is not None:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Diplomacy action {action_id} requires required technology.",
            )
        if action.target_region in player_state.established_diplomacy:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Diplomacy target {action.target_region} has already been established.",
            )
        if action.target_region in selected_diplomacy_regions:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Diplomacy target {action.target_region} is duplicated in this submission.",
            )
        selected_diplomacy_regions.add(action.target_region)
        military_plan_spend += int(action.budget_pool_cost)

    # Validate unlockColonization budget cost
    if payload.get("militaryPlan", {}).get("unlockColonization", False) and not player_state.colonization_unlocked:
        military_plan_spend += int(balance.military.colonization_unlock_cost)

    colonization_actions = payload.get("militaryPlan", {}).get("colonizationActions", []) or []
    if player_state.colonization_unlocked or payload.get("militaryPlan", {}).get("unlockColonization", False):
        selected_diplomacy = {
            balance.military_actions.diplomacy_actions[str(selection.get("actionId") or "")].target_region
            for selection in payload.get("militaryPlan", {}).get("diplomacyActions", [])
            if str(selection.get("actionId") or "") in balance.military_actions.diplomacy_actions
        }
        available_diplomacy = set(player_state.established_diplomacy) | selected_diplomacy
        regions_by_id = {region.region_id: region for region in snapshot.region_states}
        valid_colonization_count = 0
        for action in colonization_actions:
            if valid_colonization_count >= int(balance.military.max_colonizations_per_round):
                break
            region_id = str(action.get("targetRegionId") or "")
            blueprint = balance.regions.region_blueprints.get(region_id)
            region_state = regions_by_id.get(region_id)
            if blueprint is None or region_state is None or not blueprint.colonizable:
                continue
            if region_state.controller == player_state.country.value:
                continue
            if region_id not in available_diplomacy:
                continue
            valid_colonization_count += 1
        military_point_spend += valid_colonization_count * int(balance.military.colonization_budget_cost)

    # Validate total military spend against remaining government fiscal budget
    remaining_budget = int(player_state.budget_pools.get("governmentFiscal", 0))
    # Subtract what was already allocated by government plan
    remaining_budget -= int(payload.get("governmentPlan", {}).get("totalSpend", 0) or 0)
    if military_point_spend > remaining_budget:
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Government fiscal exceeded for the submitted military plan.",
            details={
                "reason": (
                    f"政府财政不足：军事计划 {military_point_spend} > "
                    f"可用 {remaining_budget}"
                ),
            },
        )

    market_allowance = calculate_market_regulation_allowance(max(0, domestic_budget - domestic_spend))
    market_regulation_fiscal_overflow = max(0, market_regulation_spend - market_allowance)
    fiscal_spend = core_government_spend + market_regulation_fiscal_overflow + military_plan_spend
    if fiscal_spend > government_budget:
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Government fiscal budget exceeded for the submitted plan.",
            details={
                "reason": (
                    f"政府财政预算超支：计划 {fiscal_spend} > "
                    f"可用 {government_budget}（市场调节额度 {market_allowance}）"
                ),
            },
        )

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.contracts.enums import ErrorCode, GamePhase, PlayerSubmissionStatus
from app.modules.balance_config import get_balance_config
from app.modules.game_state.factory_economy import (
    action_locked_reason,
    current_route_capacity,
    route_locked_reason,
)
from app.modules.game_state.market_access import is_region_accessible
from app.modules.game_state.models import Game, GameSnapshot
from app.modules.game_state.phase_deadline import deadline_has_passed
from app.modules.game_state.phase_state import PhaseSubmissionState
from app.modules.game_state.turn_input import PlayerTurnInput
from app.modules.room.models import Room
from app.modules.rules.common import default_decision_submission_payload, default_market_submission_payload


@dataclass(slots=True)
class PhaseSubmissionError(Exception):
    error_code: ErrorCode
    message: str

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
            player_state.military_points,
            region_id=region_id,
            established_diplomacy=player_state.established_diplomacy,
        ):
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Overseas market region {region_id} is not accessible.",
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
        raw_domestic = phase1_market.get("domesticAllocation")
        if isinstance(raw_domestic, (int, float)) and not isinstance(raw_domestic, bool) and raw_domestic >= 0:
            normalized["phase1Market"] = phase1_market
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


def _validate_decision_payload(*, snapshot: GameSnapshot, player_state, payload: dict[str, Any]) -> None:
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
        factory_spend += quantity * int(balance.production.expansion_costs.get(route_id, 0))

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
        factory_spend += quantity * int(balance.production.upgrade_costs.get(route_id, 0))

    for order in payload.get("factoryPlan", {}).get("newFactoryOrders", []):
        route_id = str(order.get("routeId") or "")
        if route_id != "handicraft":
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                "New factory orders only handicraft is supported.",
            )
        quantity = max(0, int(order.get("quantity", 0)))
        factory_spend += quantity * int(balance.production.new_factory_costs.get(route_id, 0))

    if factory_spend > factory_budget:
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Factory budget exceeded for the submitted plan.",
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
        )

    government_spend = 0
    admin_cost = max(1, int(balance.politics.administration_cost))

    raw_admin_purchase = payload.get("governmentPlan", {}).get("adminPurchases")
    try:
        admin_quantity = max(0, int(raw_admin_purchase or 0))
    except (TypeError, ValueError):
        admin_quantity = 0
    government_spend += admin_quantity * admin_cost

    military_plan_spend = 0
    military_action_counts: dict[str, int] = {}
    for selection in payload.get("militaryPlan", {}).get("militaryActions", []):
        action_id = str(selection.get("actionId") or "")
        action = balance.military_actions.military_actions.get(action_id)
        if action is None:
            raise PhaseSubmissionError(ErrorCode.INVALID_SUBMISSION, f"Unknown military action: {action_id}")
        if action_locked_reason(player_state, action_id) is not None:
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Military action {action_id} requires required technology.",
            )
        military_action_counts[action_id] = military_action_counts.get(action_id, 0) + 1
        if military_action_counts[action_id] > int(action.max_per_round):
            raise PhaseSubmissionError(
                ErrorCode.INVALID_SUBMISSION,
                f"Military action {action_id} exceeds maxPerRound.",
            )
        military_plan_spend += int(action.budget_pool_cost)

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

    if government_spend + military_plan_spend > government_budget:
        raise PhaseSubmissionError(
            ErrorCode.INVALID_SUBMISSION,
            "Government fiscal budget exceeded for the submitted plan.",
        )

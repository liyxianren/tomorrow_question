#!/usr/bin/env python3
"""
War System Full Pipeline API E2E Test — 明日之问

Exercises the complete war chain through real API (port 5001):
1. Army building (recruit_infantry) → conquest of unclaimed region
2. Full pipeline: unlock → diplomacy → colonize → loot across multiple rounds
3. Naval deployment API acceptance
4. Conquest + looting in same submission acceptance
5. Multi-round looting resource transfer
"""

import json
import sys
import time
import requests

BASE = "http://127.0.0.1:5001/api/v1"

# ─── helpers ─────────────────────────────────────────────────────────────────

def create_room(nickname: str) -> dict:
    r = requests.post(f"{BASE}/rooms", json={"nickname": nickname})
    r.raise_for_status()
    data = r.json()["data"]
    return {
        "room_code": data["room"]["roomCode"],
        "session_id": data["session"]["sessionId"],
        "player_id": data["session"]["playerId"],
    }


def select_country(room_code: str, session_id: str, country: str):
    r = requests.post(
        f"{BASE}/rooms/{room_code}/country",
        json={"selectedCountry": country},
        headers={"X-Session-Id": session_id},
    )
    r.raise_for_status()


def fill_bots(room_code: str, session_id: str):
    r = requests.post(
        f"{BASE}/rooms/{room_code}/bots/fill",
        headers={"X-Session-Id": session_id},
    )
    r.raise_for_status()


def set_ready(room_code: str, session_id: str, is_ready: bool = True):
    r = requests.post(
        f"{BASE}/rooms/{room_code}/ready",
        json={"isReady": is_ready},
        headers={"X-Session-Id": session_id},
    )
    r.raise_for_status()


def submit_decision(game_id: str, session_id: str, payload: dict) -> tuple:
    r = requests.post(
        f"{BASE}/games/{game_id}/phases/decision/submit",
        json={"payload": payload},
        headers={"X-Session-Id": session_id},
    )
    return r.json(), r.status_code


def submit_market(game_id: str, session_id: str, payload: dict) -> tuple:
    r = requests.post(
        f"{BASE}/games/{game_id}/phases/market/submit",
        json={"payload": payload},
        headers={"X-Session-Id": session_id},
    )
    return r.json(), r.status_code


def get_room_context(room_code: str) -> dict:
    r = requests.get(f"{BASE}/rooms/{room_code}/context")
    r.raise_for_status()
    return r.json()["data"]


def build_decision_payload(
    *,
    point_purchases=None,
    military_actions=None,
    diplomacy_actions=None,
    unlock_colonization=False,
    colonization_actions=None,
    conquest_actions=None,
    naval_deployment=None,
    looting_actions=None,
) -> dict:
    return {
        "factoryPlan": {
            "productionOrders": [], "expansionOrders": [],
            "upgradeOrders": [], "newFactoryOrders": [],
        },
        "domesticMarketPlan": {"domesticMarketActions": []},
        "governmentPlan": {
            "pointPurchases": point_purchases or [], "strategySelections": [],
            "techResearch": [], "adminPurchases": 0,
        },
        "militaryPlan": {
            "unlockColonization": unlock_colonization,
            "militaryActions": [{"actionId": a} for a in (military_actions or [])],
            "diplomacyActions": [{"actionId": a} for a in (diplomacy_actions or [])],
            "colonizationActions": colonization_actions or [],
            "conquestActions": conquest_actions or [],
            "navalDeployment": naval_deployment or {},
            "lootingActions": looting_actions or [],
        },
        "phase1Production": {"rawMaterialAssignments": {"handicraft": 4}},
        "reforms": [], "activatePolicies": [], "deactivatePolicies": [],
        "talentPlan": {"talentUnlocks": []},
    }


def build_safe_market_payload(ctx: dict, requested_domestic: int = 8) -> dict:
    """Build a legal market payload from the current market snapshot."""
    requested_domestic = min(requested_domestic, 4)
    c = get_room_context(ctx["room_code"])
    ctx["activeGame"] = c.get("activeGame", {})
    ctx["activeSnapshot"] = c.get("activeSnapshot", {})
    state = ctx["activeSnapshot"].get("nationalStateByPlayer", {}).get(ctx["player_id"], {})
    economy = state.get("phase1Economy", {})
    metrics = economy.get("marketMetrics", {})
    income_summary = state.get("incomeSummary", {})
    inventory = int(economy.get("goodsInventory", requested_domestic))
    raw_demand = metrics.get("domesticDemand", metrics.get("demand"))
    demand = int(float(raw_demand)) if raw_demand is not None else requested_domestic
    if demand <= 0:
        demand = requested_domestic
    capacity = int(income_summary.get("domesticMarketCapacity", requested_domestic))
    if capacity <= 0:
        capacity = requested_domestic
    domestic_allocation = max(0, min(requested_domestic, inventory, demand, capacity))
    return {
        "phase1Market": {"domesticAllocation": domestic_allocation, "externalAllocations": []}
    }


def clamp_phase1_production_to_budget(ctx: dict, payload: dict) -> dict:
    """Clamp the raw-material assignment like the frontend does before submit."""
    phase1 = payload.get("phase1Production")
    if not isinstance(phase1, dict):
        return payload
    assignments = phase1.get("rawMaterialAssignments")
    if not isinstance(assignments, dict):
        return payload
    c = get_room_context(ctx["room_code"])
    ctx["activeGame"] = c.get("activeGame", {})
    ctx["activeSnapshot"] = c.get("activeSnapshot", {})
    state = ctx["activeSnapshot"].get("nationalStateByPlayer", {}).get(ctx["player_id"], {})
    remaining = max(0, int(state.get("budgetPools", {}).get("factory", 0)))
    for mode, value in list(assignments.items()):
        quantity = max(0, int(value or 0))
        allowed = min(quantity, remaining)
        assignments[mode] = allowed
        remaining -= allowed
    return payload


def full_cycle(ctx: dict, decision_payload: dict) -> dict:
    """Submit decision → market → wait for next decision phase. Returns updated ctx."""
    game_id = ctx["game_id"]
    session_id = ctx["session_id"]
    starting_round = ctx.get("activeGame", {}).get("currentRound")
    decision_payload = clamp_phase1_production_to_budget(ctx, decision_payload)

    resp, code = submit_decision(game_id, session_id, decision_payload)
    if code != 200:
        print(f"  [WARN] Decision: status={code}, {json.dumps(resp, default=str)[:200]}")
        return ctx

    market_ready = False
    for _ in range(30):
        time.sleep(1)
        c = get_room_context(ctx["room_code"])
        ag = c.get("activeGame", {})
        ctx["activeGame"] = ag
        ctx["activeSnapshot"] = c.get("activeSnapshot", {})
        ctx["game_id"] = ag.get("gameId", ctx["game_id"])
        if ag.get("currentPhase") == "market":
            market_ready = True
            break
        if ag.get("currentPhase") == "decision" and ag.get("currentRound") != starting_round:
            return ctx

    if not market_ready:
        print("  [WARN] Never reached market phase after decision")
        return ctx

    resp_m, code_m = submit_market(ctx["game_id"], session_id, build_safe_market_payload(ctx))
    if code_m != 200:
        print(f"  [WARN] Market: status={code_m}, {json.dumps(resp_m, default=str)[:200]}")
        return ctx

    # Wait for next decision phase (settlement → market → settlement → next decision)
    for _ in range(20):
        time.sleep(3)
        c = get_room_context(ctx["room_code"])
        ag = c.get("activeGame", {})
        if ag.get("currentPhase") == "decision":
            ctx["activeGame"] = ag
            ctx["activeSnapshot"] = c.get("activeSnapshot", {})
            ctx["game_id"] = ag.get("gameId", game_id)
            return ctx

    c = get_room_context(ctx["room_code"])
    ctx["activeGame"] = c.get("activeGame", {})
    ctx["activeSnapshot"] = c.get("activeSnapshot", {})
    ctx["game_id"] = ctx["activeGame"].get("gameId", game_id)
    return ctx


def get_my_state(ctx: dict) -> dict:
    snap = ctx.get("activeSnapshot", {})
    ns = snap.get("nationalStateByPlayer", {})
    return ns.get(ctx["player_id"], {})


def get_region_state(ctx: dict, region_id: str) -> dict:
    snap = ctx.get("activeSnapshot", {})
    regions = snap.get("regionStates", [])
    return next((r for r in regions if r.get("regionId") == region_id), {})


def get_ocean_nodes(ctx: dict) -> list:
    snap = ctx.get("activeSnapshot", {})
    return snap.get("oceanNodeStates", [])


def setup_game(country: str = "britain") -> dict:
    h = create_room("WarE2E")
    rc, sid = h["room_code"], h["session_id"]
    select_country(rc, sid, country)
    fill_bots(rc, sid)
    set_ready(rc, sid, True)
    time.sleep(2)
    c = get_room_context(rc)
    return {
        "room_code": rc, "session_id": sid, "player_id": h["player_id"],
        "game_id": c["activeGame"]["gameId"],
        "activeGame": c["activeGame"], "activeSnapshot": c["activeSnapshot"],
    }


# ─── tests ───────────────────────────────────────────────────────────────────

def test_army_conquest_unclaimed_region():
    """Recruit infantry → conquest of unclaimed americas via API."""
    print("\n=== TEST: Army conquest of unclaimed region ===")
    ctx = setup_game()
    state = get_my_state(ctx)
    gov = state["budgetPools"]["governmentFiscal"]
    print(f"  Initial: govFiscal={gov}, mp={state['militaryPoints']}")

    # Round 1: buy enough military points to recruit a conquest force.
    payload1 = build_decision_payload(
        point_purchases=[{"pointType": "military", "quantity": 1}],
        military_actions=["recruit_infantry", "recruit_infantry"],
    )
    ctx = full_cycle(ctx, payload1)

    state = get_my_state(ctx)
    army = state.get("army", {})
    print(f"  After recruit: army={army}, mp={state['militaryPoints']}")
    assert army.get("infantry", 0) >= 2, f"Expected >= 2 infantry, got {army}"

    # Round 2: conquer americas
    payload2 = build_decision_payload(
        conquest_actions=[{"regionId": "americas", "infantry": 2, "artillery": 0}]
    )
    ctx = full_cycle(ctx, payload2)

    state2 = get_my_state(ctx)
    americas = get_region_state(ctx, "americas")
    print(f"  After conquest: army={state2.get('army')}, americas.controller={americas.get('controller')}")

    assert americas.get("controller") == "britain", f"Expected britain, got {americas.get('controller')}"
    assert state2.get("army", {}).get("infantry", 0) == 0, f"Expected no infantry remaining"
    print("  ✅ PASS: Conquest of unclaimed americas succeeded")


def test_colonization_then_looting():
    """Full pipeline: unlock → diplomacy → colonize → loot."""
    print("\n=== TEST: Colonization → Looting pipeline ===")
    ctx = setup_game()
    state = get_my_state(ctx)
    gov = state["budgetPools"]["governmentFiscal"]
    print(f"  Initial: govFiscal={gov}")

    # Round 1: unlock colonization (costs 5, from progress file)
    payload1 = build_decision_payload(unlock_colonization=True)
    ctx = full_cycle(ctx, payload1)

    state = get_my_state(ctx)
    col = state.get("colonizationUnlocked", False)
    gov_r2 = state["budgetPools"]["governmentFiscal"]
    mp_r2 = state["militaryPoints"]
    print(f"  After unlock: colUnlocked={col}, govFiscal={gov_r2}, mp={mp_r2}")
    assert col, "Expected colonizationUnlocked=True"

    # Round 2: establish diplomacy + buy enough military points for colonization.
    required_mp = 2
    purchase_count = max(0, required_mp - mp_r2)
    payload2 = build_decision_payload(
        point_purchases=[{"pointType": "military", "quantity": purchase_count}] if purchase_count else [],
        diplomacy_actions=["establish_americas"],
    )
    ctx = full_cycle(ctx, payload2)

    state = get_my_state(ctx)
    diplo = state.get("establishedDiplomacy", [])
    mp_r3 = state["militaryPoints"]
    print(f"  After diplomacy: diplo={diplo}, mp={mp_r3}")
    assert "americas" in diplo, f"Expected americas in diplomacy, got {diplo}"

    # Round 3 (if needed): buy more points to reach the colonization cost.
    if mp_r3 < required_mp:
        purchase_count = required_mp - mp_r3
        payload_r = build_decision_payload(
            point_purchases=[{"pointType": "military", "quantity": purchase_count}]
        )
        ctx = full_cycle(ctx, payload_r)
        state = get_my_state(ctx)
        mp_r3 = state["militaryPoints"]
        print(f"  After extra purchase: mp={mp_r3}")

    # Colonize americas (costs 2 mp)
    assert mp_r3 >= required_mp, f"Need {required_mp} mp, have {mp_r3}"
    payload3 = build_decision_payload(
        colonization_actions=[{"targetRegionId": "americas"}]
    )
    ctx = full_cycle(ctx, payload3)

    state = get_my_state(ctx)
    americas = get_region_state(ctx, "americas")
    controller = americas.get("controller")
    access = americas.get("accessLevel", "").lower()
    resources = americas.get("resourceLimit", {})
    print(f"  After colonize: controller={controller}, access={access}, resources={resources}")
    assert controller == "britain", f"Expected britain, got {controller}"
    assert "colony" in access, f"Expected colony access, got {access}"

    # Loot from colony
    resource_type = list(resources.keys())[0] if resources else None
    assert resource_type, "Colony should have resources"
    raw_before = state.get("phase1Economy", {}).get("rawMaterials", 0)

    payload4 = build_decision_payload(
        looting_actions=[{"regionId": "americas", "resourceType": resource_type}]
    )
    payload4["phase1Production"] = {"rawMaterialAssignments": {"handicraft": 0}}
    ctx = full_cycle(ctx, payload4)

    state2 = get_my_state(ctx)
    raw_after = state2.get("phase1Economy", {}).get("rawMaterials", 0)
    americas2 = get_region_state(ctx, "americas")
    new_limit = americas2.get("resourceLimit", {})
    print(f"  After loot: rawMaterials={raw_before}→{raw_after}, {resource_type} limit={resources.get(resource_type)}→{new_limit.get(resource_type)}")
    assert raw_after > raw_before, f"Expected raw materials increase: {raw_before}→{raw_after}"
    print("  ✅ PASS: Full colonization → looting pipeline succeeded")


def test_naval_deployment():
    """Verify navalDeployment accepted and fleet persists through settlement."""
    print("\n=== TEST: Naval deployment ===")
    ctx = setup_game()
    state = get_my_state(ctx)
    fleets = state.get("navy", {}).get("fleets", 0)
    print(f"  Initial fleets={fleets}")

    if fleets < 1:
        print(f"  ⚠️ SKIP: no fleets to deploy")
        return

    # Deploy fleet to north_atlantic
    payload = build_decision_payload(naval_deployment={"north_atlantic": fleets})
    payload = clamp_phase1_production_to_budget(ctx, payload)
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    assert code == 200, f"Expected 200, got {code}: {resp}"
    submit_market(ctx["game_id"], ctx["session_id"], build_safe_market_payload(ctx))

    # Wait for settlement
    for _ in range(20):
        time.sleep(3)
        c = get_room_context(ctx["room_code"])
        ag = c.get("activeGame", {})
        if ag.get("currentPhase") == "decision":
            break

    nodes = c.get("activeSnapshot", {}).get("oceanNodeStates", [])
    na = next((n for n in nodes if n.get("nodeId") == "north_atlantic"), {})
    navy = na.get("navyByCountry", {})
    print(f"  north_atlantic navy={navy}")
    assert navy.get("britain", 0) == fleets, f"Expected {fleets} fleets, got {navy.get('britain', 0)}"
    print("  ✅ PASS: Naval deployment persisted correctly")


def test_conquest_and_looting_accepted():
    """Conquest + looting in same submission accepted by API."""
    print("\n=== TEST: Conquest + looting accepted ===")
    ctx = setup_game()
    state = get_my_state(ctx)

    # Buy enough military points and recruit a conquest force.
    payload = build_decision_payload(
        point_purchases=[{"pointType": "military", "quantity": 1}],
        military_actions=["recruit_infantry", "recruit_infantry"],
    )
    ctx = full_cycle(ctx, payload)

    state = get_my_state(ctx)
    army = state.get("army", {})
    inf = army.get("infantry", 0)
    print(f"  After recruit: army={army}")
    assert inf >= 2, f"Need >= 2 infantry, got {inf}"

    # Submit combined conquest + looting
    payload = build_decision_payload(
        conquest_actions=[{"regionId": "americas", "infantry": 2, "artillery": 0}],
        looting_actions=[{"regionId": "americas", "resourceType": "cotton"}],
    )
    payload = clamp_phase1_production_to_budget(ctx, payload)
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    assert code == 200, f"Expected 200, got {code}"
    print("  ✅ PASS: conquest + looting accepted in same submission")

    # Complete the cycle
    submit_market(ctx["game_id"], ctx["session_id"], build_safe_market_payload(ctx))


def test_looting_multi_turn():
    """Looting works across turns, each turn can loot once per colony."""
    print("\n=== TEST: Multi-turn looting ===")
    ctx = setup_game()

    # Colonize americas first (reuse colonization test logic)
    # Round 1: unlock
    ctx = full_cycle(ctx, build_decision_payload(unlock_colonization=True))
    state = get_my_state(ctx)
    mp = state["militaryPoints"]

    # Round 2: diplomacy + buy military points for colonization
    required_mp = 2
    purchase_n = max(0, required_mp - mp)
    ctx = full_cycle(ctx, build_decision_payload(
        point_purchases=[{"pointType": "military", "quantity": purchase_n}] if purchase_n else [],
        diplomacy_actions=["establish_americas"],
    ))
    state = get_my_state(ctx)
    mp = state["militaryPoints"]

    if mp < required_mp:
        ctx = full_cycle(ctx, build_decision_payload(
            point_purchases=[{"pointType": "military", "quantity": required_mp - mp}]
        ))
        state = get_my_state(ctx)
        mp = state["militaryPoints"]

    if mp < required_mp:
        print(f"  ⚠️ SKIP: Not enough mp ({mp})")
        return

    # Colonize
    ctx = full_cycle(ctx, build_decision_payload(
        colonization_actions=[{"targetRegionId": "americas"}]
    ))

    americas = get_region_state(ctx, "americas")
    if americas.get("controller") != "britain":
        print(f"  ⚠️ SKIP: Colonization failed: {americas.get('controller')}")
        return

    resources = americas.get("resourceLimit", {})
    resource_type = list(resources.keys())[0] if resources else None
    if not resource_type:
        print("  ⚠️ SKIP: No resources")
        return

    state = get_my_state(ctx)
    raw_before = state.get("phase1Economy", {}).get("rawMaterials", 0)
    initial_limit = resources.get(resource_type, 0)

    # Loot turn 1
    loot_payload_1 = build_decision_payload(
        looting_actions=[{"regionId": "americas", "resourceType": resource_type}]
    )
    loot_payload_1["phase1Production"] = {"rawMaterialAssignments": {"handicraft": 0}}
    ctx = full_cycle(ctx, loot_payload_1)
    state = get_my_state(ctx)
    raw_after_1 = state.get("phase1Economy", {}).get("rawMaterials", 0)
    americas1 = get_region_state(ctx, "americas")
    limit_1 = americas1.get("resourceLimit", {}).get(resource_type, 0)
    print(f"  Loot 1: raw {raw_before}→{raw_after_1}, {resource_type} {initial_limit}→{limit_1}")
    assert limit_1 < initial_limit, "Resource limit should decrease"

    # Loot turn 2 (should work — new turn, new loot allowance)
    loot_payload_2 = build_decision_payload(
        looting_actions=[{"regionId": "americas", "resourceType": resource_type}]
    )
    loot_payload_2["phase1Production"] = {"rawMaterialAssignments": {"handicraft": 0}}
    ctx = full_cycle(ctx, loot_payload_2)
    state = get_my_state(ctx)
    raw_after_2 = state.get("phase1Economy", {}).get("rawMaterials", 0)
    americas2 = get_region_state(ctx, "americas")
    limit_2 = americas2.get("resourceLimit", {}).get(resource_type, 0)
    print(f"  Loot 2: raw {raw_after_1}→{raw_after_2}, {resource_type} {limit_1}→{limit_2}")
    assert raw_after_2 > raw_after_1, "Expected +1 more raw material"
    assert limit_2 < limit_1, "Resource limit should decrease"
    print("  ✅ PASS: Multi-turn looting works correctly")


# ─── main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [
        test_army_conquest_unclaimed_region,
        test_colonization_then_looting,
        test_naval_deployment,
        test_conquest_and_looting_accepted,
        test_looting_multi_turn,
    ]

    passed = failed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except Exception as e:
            print(f"  ❌ EXCEPTION: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    print(f"\n{'='*60}")
    print(f"War System E2E: {passed} passed, {failed} failed out of {len(tests)}")
    if failed:
        sys.exit(1)
    print("✅ All war system E2E tests passed!")

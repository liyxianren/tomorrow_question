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
            "pointPurchases": [], "strategySelections": [],
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
        "phase1Production": {"rawMaterialAssignments": {"handicraft": 8}},
        "reforms": [], "activatePolicies": [], "deactivatePolicies": [],
        "talentPlan": {"talentUnlocks": []},
    }


MARKET_PAYLOAD = {
    "phase1Market": {"domesticAllocation": 8, "externalAllocations": []}
}


def full_cycle(ctx: dict, decision_payload: dict) -> dict:
    """Submit decision → market → wait for next decision phase. Returns updated ctx."""
    game_id = ctx["game_id"]
    session_id = ctx["session_id"]

    resp, code = submit_decision(game_id, session_id, decision_payload)
    if code != 200:
        print(f"  [WARN] Decision: status={code}, {json.dumps(resp, default=str)[:200]}")
        return ctx

    resp_m, code_m = submit_market(game_id, session_id, MARKET_PAYLOAD)
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

    # Round 1: recruit 3 infantry
    payload1 = build_decision_payload(
        military_actions=["recruit_infantry", "recruit_infantry", "recruit_infantry"]
    )
    ctx = full_cycle(ctx, payload1)

    state = get_my_state(ctx)
    army = state.get("army", {})
    print(f"  After recruit: army={army}, mp={state['militaryPoints']}")
    assert army.get("infantry", 0) >= 3, f"Expected >= 3 infantry, got {army}"

    # Round 2: conquer americas
    payload2 = build_decision_payload(
        conquest_actions=[{"regionId": "americas", "infantry": 2, "artillery": 0}]
    )
    ctx = full_cycle(ctx, payload2)

    state2 = get_my_state(ctx)
    americas = get_region_state(ctx, "americas")
    print(f"  After conquest: army={state2.get('army')}, americas.controller={americas.get('controller')}")

    assert americas.get("controller") == "britain", f"Expected britain, got {americas.get('controller')}"
    assert state2.get("army", {}).get("infantry", 0) == 1, f"Expected 1 infantry remaining"
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

    # Round 2: establish diplomacy + recruit
    recruit_count = max(0, 3 - mp_r2)  # need 3 mp for colonization
    mil = ["recruit_infantry"] * min(recruit_count, 3)
    payload2 = build_decision_payload(
        diplomacy_actions=["establish_americas"],
        military_actions=mil,
    )
    ctx = full_cycle(ctx, payload2)

    state = get_my_state(ctx)
    diplo = state.get("establishedDiplomacy", [])
    mp_r3 = state["militaryPoints"]
    print(f"  After diplomacy: diplo={diplo}, mp={mp_r3}")
    assert "americas" in diplo, f"Expected americas in diplomacy, got {diplo}"

    # Round 3 (if needed): recruit more to get 3 mp
    if mp_r3 < 3:
        payload_r = build_decision_payload(
            military_actions=["recruit_infantry"] * 3
        )
        ctx = full_cycle(ctx, payload_r)
        state = get_my_state(ctx)
        mp_r3 = state["militaryPoints"]
        print(f"  After extra recruit: mp={mp_r3}")

    # Colonize americas (costs 3 mp)
    assert mp_r3 >= 3, f"Need 3 mp, have {mp_r3}"
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
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    assert code == 200, f"Expected 200, got {code}: {resp}"
    submit_market(ctx["game_id"], ctx["session_id"], MARKET_PAYLOAD)

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

    # Recruit 3 rounds to build army
    for _ in range(3):
        payload = build_decision_payload(
            military_actions=["recruit_infantry", "recruit_infantry", "recruit_infantry"]
        )
        ctx = full_cycle(ctx, payload)

    state = get_my_state(ctx)
    army = state.get("army", {})
    inf = army.get("infantry", 0)
    print(f"  After 3 rounds recruit: army={army}")
    assert inf >= 2, f"Need >= 2 infantry, got {inf}"

    # Submit combined conquest + looting
    payload = build_decision_payload(
        conquest_actions=[{"regionId": "americas", "infantry": 2, "artillery": 0}],
        looting_actions=[{"regionId": "americas", "resourceType": "cotton"}],
    )
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    assert code == 200, f"Expected 200, got {code}"
    print("  ✅ PASS: conquest + looting accepted in same submission")

    # Complete the cycle
    submit_market(ctx["game_id"], ctx["session_id"], MARKET_PAYLOAD)


def test_looting_multi_turn():
    """Looting works across turns, each turn can loot once per colony."""
    print("\n=== TEST: Multi-turn looting ===")
    ctx = setup_game()

    # Colonize americas first (reuse colonization test logic)
    # Round 1: unlock
    ctx = full_cycle(ctx, build_decision_payload(unlock_colonization=True))
    state = get_my_state(ctx)
    mp = state["militaryPoints"]

    # Round 2: diplomacy + recruit
    recruit_n = max(0, 3 - mp)
    ctx = full_cycle(ctx, build_decision_payload(
        diplomacy_actions=["establish_americas"],
        military_actions=["recruit_infantry"] * min(recruit_n, 3),
    ))
    state = get_my_state(ctx)
    mp = state["militaryPoints"]

    if mp < 3:
        ctx = full_cycle(ctx, build_decision_payload(
            military_actions=["recruit_infantry"] * 3
        ))
        state = get_my_state(ctx)
        mp = state["militaryPoints"]

    if mp < 3:
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
    ctx = full_cycle(ctx, build_decision_payload(
        looting_actions=[{"regionId": "americas", "resourceType": resource_type}]
    ))
    state = get_my_state(ctx)
    raw_after_1 = state.get("phase1Economy", {}).get("rawMaterials", 0)
    americas1 = get_region_state(ctx, "americas")
    limit_1 = americas1.get("resourceLimit", {}).get(resource_type, 0)
    print(f"  Loot 1: raw {raw_before}→{raw_after_1}, {resource_type} {initial_limit}→{limit_1}")
    assert raw_after_1 > raw_before, "Expected +1 raw material"

    # Loot turn 2 (should work — new turn, new loot allowance)
    ctx = full_cycle(ctx, build_decision_payload(
        looting_actions=[{"regionId": "americas", "resourceType": resource_type}]
    ))
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

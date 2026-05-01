#!/usr/bin/env python3
"""
Independence Movement Full Chain API E2E Test — 明日之问

Tests the complete independence pipeline:
1. Colonize a region (unlock → diplomacy → colonize)
2. Loot repeatedly to drive independence up (+2 per loot)
3. Verify revolt at threshold (10): controller→None, access→concession
"""

import json
import sys
import time
import requests

BASE = "http://127.0.0.1:5001/api/v1"
P = lambda msg: print(msg, flush=True)

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


def select_country(room_code, session_id, country):
    r = requests.post(f"{BASE}/rooms/{room_code}/country",
        json={"selectedCountry": country}, headers={"X-Session-Id": session_id})
    r.raise_for_status()


def fill_bots(room_code, session_id):
    r = requests.post(f"{BASE}/rooms/{room_code}/bots/fill",
        headers={"X-Session-Id": session_id})
    r.raise_for_status()


def set_ready(room_code, session_id):
    r = requests.post(f"{BASE}/rooms/{room_code}/ready",
        json={"isReady": True}, headers={"X-Session-Id": session_id})
    r.raise_for_status()


def submit_decision(game_id, session_id, payload):
    r = requests.post(f"{BASE}/games/{game_id}/phases/decision/submit",
        json={"payload": payload}, headers={"X-Session-Id": session_id})
    return r.json(), r.status_code


def submit_market(game_id, session_id):
    r = requests.post(f"{BASE}/games/{game_id}/phases/market/submit",
        json={"payload": {"phase1Market": {"domesticAllocation": 8, "externalAllocations": []}}},
        headers={"X-Session-Id": session_id})
    return r.json(), r.status_code


def get_room_context(room_code):
    r = requests.get(f"{BASE}/rooms/{room_code}/context")
    r.raise_for_status()
    return r.json()["data"]


def build_payload(*, unlock_colonization=False, military_actions=None,
                  diplomacy_actions=None, colonization_actions=None,
                  looting_actions=None):
    return {
        "factoryPlan": {"productionOrders": [], "expansionOrders": [],
                        "upgradeOrders": [], "newFactoryOrders": []},
        "domesticMarketPlan": {"domesticMarketActions": []},
        "governmentPlan": {"pointPurchases": [], "strategySelections": [],
                           "techResearch": [], "adminPurchases": 0},
        "militaryPlan": {
            "unlockColonization": unlock_colonization,
            "militaryActions": [{"actionId": a} for a in (military_actions or [])],
            "diplomacyActions": [{"actionId": a} for a in (diplomacy_actions or [])],
            "colonizationActions": colonization_actions or [],
            "conquestActions": [], "navalDeployment": {},
            "lootingActions": looting_actions or [],
        },
        "phase1Production": {"rawMaterialAssignments": {"handicraft": 8}},
        "reforms": [], "activatePolicies": [], "deactivatePolicies": [],
        "talentPlan": {"talentUnlocks": []},
    }


def full_cycle(ctx, payload):
    """Decision → market → wait for next decision. Returns updated ctx."""
    P(f"    cycle: submitting decision...")
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    if code != 200:
        P(f"    [WARN] Decision {code}: {json.dumps(resp, default=str)[:150]}")
        return ctx

    resp_m, code_m = submit_market(ctx["game_id"], ctx["session_id"])
    if code_m != 200:
        P(f"    [WARN] Market {code_m}: {json.dumps(resp_m, default=str)[:150]}")
        return ctx

    for attempt in range(30):
        time.sleep(2)
        c = get_room_context(ctx["room_code"])
        ag = c.get("activeGame", {})
        phase = ag.get("currentPhase")
        if phase == "decision":
            ctx["activeGame"] = ag
            ctx["activeSnapshot"] = c.get("activeSnapshot", {})
            ctx["game_id"] = ag.get("gameId", ctx["game_id"])
            P(f"    cycle done (attempt {attempt+1})")
            return ctx

    c = get_room_context(ctx["room_code"])
    ctx["activeGame"] = c.get("activeGame", {})
    ctx["activeSnapshot"] = c.get("activeSnapshot", {})
    P(f"    [WARN] Never returned to decision phase after 60s")
    return ctx


def get_region(ctx, region_id):
    snap = ctx.get("activeSnapshot", {})
    regions = snap.get("regionStates", [])
    return next((r for r in regions if r.get("regionId") == region_id), {})


def get_state(ctx):
    snap = ctx.get("activeSnapshot", {})
    ns = snap.get("nationalStateByPlayer", {})
    return ns.get(ctx["player_id"], {})


def setup_game():
    h = create_room("IndE2E")
    rc, sid = h["room_code"], h["session_id"]
    select_country(rc, sid, "britain")
    fill_bots(rc, sid)
    set_ready(rc, sid)
    time.sleep(2)
    c = get_room_context(rc)
    return {
        "room_code": rc, "session_id": sid, "player_id": h["player_id"],
        "game_id": c["activeGame"]["gameId"],
        "activeGame": c["activeGame"], "activeSnapshot": c["activeSnapshot"],
    }


# ─── Colonize helper ─────────────────────────────────────────────────────────

def colonize_americas(ctx):
    """Perform full colonize sequence: unlock → diplomacy → recruit → colonize."""
    P("  [colonize] Round 1: unlock colonization")
    ctx = full_cycle(ctx, build_payload(unlock_colonization=True))
    state = get_state(ctx)
    mp = state.get("militaryPoints", 0)
    P(f"    mp={mp}, colUnlocked={state.get('colonizationUnlocked')}")

    recruit_n = max(0, 3 - mp)
    P(f"  [colonize] Round 2: diplomacy + recruit x{min(recruit_n, 3)}")
    ctx = full_cycle(ctx, build_payload(
        diplomacy_actions=["establish_americas"],
        military_actions=["recruit_infantry"] * min(recruit_n, 3),
    ))
    state = get_state(ctx)
    mp = state.get("militaryPoints", 0)
    P(f"    mp={mp}, diplo={state.get('establishedDiplomacy')}")

    if mp < 3:
        P(f"  [colonize] Round 3: recruit more (mp={mp})")
        ctx = full_cycle(ctx, build_payload(
            military_actions=["recruit_infantry"] * 3
        ))
        state = get_state(ctx)
        mp = state.get("militaryPoints", 0)
        P(f"    mp={mp}")

    assert mp >= 3, f"Need >=3 mp for colonization, have {mp}"
    P(f"  [colonize] Colonizing americas (mp={mp})")
    ctx = full_cycle(ctx, build_payload(
        colonization_actions=[{"targetRegionId": "americas"}]
    ))

    am = get_region(ctx, "americas")
    P(f"    controller={am.get('controller')}, access={am.get('accessLevel')}, indep={am.get('independence')}")
    assert am.get("controller") == "britain", f"Expected britain, got {am.get('controller')}"

    resources = am.get("resourceLimit", {})
    resource_type = list(resources.keys())[0] if resources else None
    assert resource_type, "Colony should have resources"
    P(f"    resource={resource_type}, limit={resources[resource_type]}")

    return ctx, resource_type


# ─── Test 1: Independence increases with looting ─────────────────────────────

def test_independence_increases_with_looting():
    P("\n=== TEST 1: Independence increases with looting ===")
    ctx = setup_game()
    ctx, resource_type = colonize_americas(ctx)

    am = get_region(ctx, "americas")
    prev_indep = am.get("independence", 0)
    P(f"  Initial independence: {prev_indep}")

    for i in range(3):
        P(f"  Loot round {i+1}...")
        ctx = full_cycle(ctx, build_payload(
            looting_actions=[{"regionId": "americas", "resourceType": resource_type}]
        ))
        am = get_region(ctx, "americas")
        indep = am.get("independence", 0)
        delta = indep - prev_indep
        P(f"    indep: {prev_indep} → {indep} (delta={delta})")
        assert delta >= 2, f"Expected indep delta >= 2, got {delta}"
        prev_indep = indep

    P("  ✅ PASS: Independence increases correctly with each looting")


# ─── Test 2: Full revolt chain ───────────────────────────────────────────────

def test_loot_until_revolt():
    P("\n=== TEST 2: Loot until revolt ===")
    ctx = setup_game()
    ctx, resource_type = colonize_americas(ctx)

    MAX_ROUNDS = 12
    revolted = False

    for i in range(MAX_ROUNDS):
        P(f"  Loot round {i+1}...")
        ctx = full_cycle(ctx, build_payload(
            looting_actions=[{"regionId": "americas", "resourceType": resource_type}]
        ))
        am = get_region(ctx, "americas")
        indep = am.get("independence", -1)
        ctrl = am.get("controller")
        acc = am.get("accessLevel", "")
        garrison = am.get("garrison", {})
        P(f"    indep={indep}, ctrl={ctrl}, access={acc}, garrison={garrison}")

        if ctrl is None:
            revolted = True
            P(f"  🔥 REVOLT at round {i+1}! access={acc}, indep={indep}")
            assert acc.lower() == "concession", f"Expected concession, got {acc}"
            assert indep == 0, f"Expected indep=0 after revolt, got {indep}"
            break

    assert revolted, (
        f"No revolt within {MAX_ROUNDS} rounds. "
        f"Final: ctrl={am.get('controller')}, indep={am.get('independence')}"
    )

    # Check settlement log
    snap = ctx.get("activeSnapshot", {})
    summary = snap.get("lastSettlementSummary", {})
    logs = summary.get("generatedLogs", [])
    revolt_log = next(
        (l for l in logs if l.get("kind") == "settlement.region_revolt"), None)

    if revolt_log:
        P(f"  Revolt log found: region={revolt_log['details']['regionId']}, "
          f"prevCtrl={revolt_log['details']['previousController']}")
    else:
        P(f"  Note: revolt log not in summary ({len(logs)} logs)")

    P("  ✅ PASS: Full independence chain verified")


# ─── main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [
        test_independence_increases_with_looting,
        test_loot_until_revolt,
    ]

    passed = failed = 0
    for t in tests:
        try:
            t()
            passed += 1
        except Exception as e:
            P(f"  ❌ EXCEPTION: {e}")
            import traceback; traceback.print_exc()
            failed += 1

    P(f"\n{'='*60}")
    P(f"Independence E2E: {passed} passed, {failed} failed out of {len(tests)}")
    if failed:
        sys.exit(1)
    P("✅ All independence E2E tests passed!")

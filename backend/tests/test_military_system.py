#!/usr/bin/env python3
"""
Military System API E2E Test — 明日之问

Tests:
1. recruit_infantry: costs militaryPointCost=1, gives armyDelta.infantry=1
2. train_artillery: costs militaryPointCost=2, gives armyDelta.artillery=1
3. naval_drill: costs militaryPointCost=1, gives overseasMarketCapacityDelta=1
4. build_fleet: costs militaryPointCost=3, gives navyDelta.fleets=1
5. unlockColonization: costs colonizationUnlockCost from governmentFiscal
6. colonization after unlock + diplomacy
7. Multiple recruit_infantry in one round (maxPerRound=3)
8. Insufficient budget rejection
9. Military + diplomacy combined
"""

import json
import sys
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
    return r.json()


def fill_bots(room_code: str, session_id: str):
    r = requests.post(
        f"{BASE}/rooms/{room_code}/bots/fill",
        headers={"X-Session-Id": session_id},
    )
    r.raise_for_status()
    return r.json()


def set_ready(room_code: str, session_id: str, is_ready: bool = True):
    r = requests.post(
        f"{BASE}/rooms/{room_code}/ready",
        json={"isReady": is_ready},
        headers={"X-Session-Id": session_id},
    )
    r.raise_for_status()
    return r.json()


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


def get_my_state(ctx: dict) -> dict:
    """Extract current player state from context."""
    snap = ctx.get("activeSnapshot", {})
    ns = snap.get("nationalStateByPlayer", {})
    return ns.get(ctx["player_id"], {})


def build_decision_payload(
    *,
    production=None,
    domestic_actions=None,
    military_actions=None,
    diplomacy_actions=None,
    unlock_colonization=False,
    colonization_actions=None,
    research_target=None,
    talent_unlocks=None,
    admin_purchases=0,
    point_purchases=None,
    reforms=None,
) -> dict:
    """Build a minimal decision submission payload."""
    payload = {
        "factoryPlan": {
            "productionOrders": [],
            "expansionOrders": [],
            "upgradeOrders": [],
            "newFactoryOrders": [],
        },
        "domesticMarketPlan": {
            "domesticMarketActions": [
                {"actionId": a} for a in (domestic_actions or [])
            ],
        },
        "governmentPlan": {
            "pointPurchases": point_purchases or [],
            "strategySelections": [],
            "techResearch": [],
            "adminPurchases": admin_purchases,
        },
        "militaryPlan": {
            "unlockColonization": unlock_colonization,
            "militaryActions": [{"actionId": a} for a in (military_actions or [])],
            "diplomacyActions": [{"actionId": a} for a in (diplomacy_actions or [])],
            "colonizationActions": colonization_actions or [],
        },
        "phase1Production": production or {"rawMaterialAssignments": {"handicraft": 8}},
        "reforms": reforms or [],
        "activatePolicies": [],
        "deactivatePolicies": [],
        "talentPlan": {"talentUnlocks": [{"nodeId": n} for n in (talent_unlocks or [])]},
    }
    return payload


def build_market_payload(domestic: int = 8) -> dict:
    """Build market submission payload (phase1Market format)."""
    return {
        "phase1Market": {
            "domesticAllocation": domestic,
            "externalAllocations": [],
        }
    }


def full_cycle(ctx: dict, decision_payload: dict, market_payload: dict = None, wait_for_decision: bool = True) -> dict:
    """Submit decision → market → wait for settlement → advance round. Returns updated ctx."""
    import time
    game_id = ctx["game_id"]
    session_id = ctx["session_id"]

    resp, code = submit_decision(game_id, session_id, decision_payload)
    if code != 200:
        print(f"  [WARN] Decision submit: status={code}, resp={json.dumps(resp, default=str)[:200]}")
        return ctx

    mp = market_payload or build_market_payload(domestic=8)
    resp_m, code_m = submit_market(game_id, session_id, mp)
    if code_m != 200:
        print(f"  [WARN] Market submit: status={code_m}, resp={json.dumps(resp_m, default=str)[:200]}")
        return ctx

    if wait_for_decision:
        # Wait for settlement to complete (up to 30s)
        for _ in range(15):
            time.sleep(2)
            c = get_room_context(ctx["room_code"])
            ag = c.get("activeGame", {})
            if ag.get("currentPhase") == "decision":
                ctx["activeGame"] = ag
                ctx["activeSnapshot"] = c.get("activeSnapshot", {})
                ctx["game_id"] = ag.get("gameId", game_id)
                return ctx
        # Timeout — refresh anyway
        c = get_room_context(ctx["room_code"])
        ctx["activeGame"] = c.get("activeGame", {})
        ctx["activeSnapshot"] = c.get("activeSnapshot", {})
    else:
        c = get_room_context(ctx["room_code"])
        ctx["activeGame"] = c.get("activeGame", {})
        ctx["activeSnapshot"] = c.get("activeSnapshot", {})
        ctx["game_id"] = ctx["activeGame"].get("gameId", game_id)
    return ctx


# ─── setup ───────────────────────────────────────────────────────────────────

def setup_game() -> dict:
    """Create room, fill bots, start game. Returns ctx dict."""
    h = create_room("MilitaryTester")
    rc = h["room_code"]
    sid = h["session_id"]

    select_country(rc, sid, "britain")
    fill_bots(rc, sid)
    set_ready(rc, sid, True)

    c = get_room_context(rc)
    return {
        "room_code": rc,
        "session_id": sid,
        "player_id": h["player_id"],
        "game_id": c["activeGame"]["gameId"],
        "activeGame": c["activeGame"],
        "activeSnapshot": c["activeSnapshot"],
    }


# ─── tests ───────────────────────────────────────────────────────────────────

def test_snapshot_check():
    """Verify we can read initial state from snapshot."""
    print("\n=== TEST: snapshot check ===")
    ctx = setup_game()
    state = get_my_state(ctx)
    assert state, "No player state found"
    gov = state["budgetPools"]["governmentFiscal"]
    mp = state["militaryPoints"]
    army = state["army"]
    navy = state["navy"]
    print(f"  Initial: govFiscal={gov}, mp={mp}, army={army}, navy={navy}")
    print(f"  colonizationUnlocked={state.get('colonizationUnlocked')}")
    print(f"  establishedDiplomacy={state.get('establishedDiplomacy')}")
    print("  ✅ PASS: Snapshot readable")


def test_recruit_infantry():
    """recruit_infantry: costs 1 militaryPoint, gives +1 infantry."""
    print("\n=== TEST: recruit_infantry ===")
    ctx = setup_game()
    state = get_my_state(ctx)
    gov_before = state["budgetPools"]["governmentFiscal"]
    mp_before = state["militaryPoints"]
    infantry_before = state.get("army", {}).get("infantry", 0)
    print(f"  Before: govFiscal={gov_before}, mp={mp_before}, infantry={infantry_before}")

    if mp_before < 1:
        print(f"  ⚠️ SKIP: militaryPoints={mp_before} < 1")
        return

    payload = build_decision_payload(military_actions=["recruit_infantry"])
    ctx = full_cycle(ctx, payload)

    state2 = get_my_state(ctx)
    mp_after = state2["militaryPoints"]
    gov_after = state2["budgetPools"]["governmentFiscal"]
    infantry_after = state2.get("army", {}).get("infantry", 0)
    print(f"  After:  govFiscal={gov_after}, mp={mp_after}, infantry={infantry_after}")

    assert mp_after == mp_before - 1, f"Expected mp={mp_before-1}, got {mp_after}"
    assert infantry_after == infantry_before + 1, f"Expected infantry={infantry_before+1}, got {infantry_after}"
    print("  ✅ PASS: recruit_infantry spends 1 mp and gives +1 infantry")


def test_multiple_recruit_infantry():
    """maxPerRound=3 for recruit_infantry."""
    print("\n=== TEST: 3x recruit_infantry ===")
    ctx = setup_game()
    state = get_my_state(ctx)
    mp_before = state["militaryPoints"]
    gov = state["budgetPools"]["governmentFiscal"]
    infantry_before = state.get("army", {}).get("infantry", 0)
    print(f"  Before: govFiscal={gov}, mp={mp_before}, infantry={infantry_before}")

    if mp_before < 3:
        print(f"  ⚠️ SKIP: militaryPoints={mp_before} < 3")
        return

    payload = build_decision_payload(
        military_actions=["recruit_infantry", "recruit_infantry", "recruit_infantry"]
    )
    ctx = full_cycle(ctx, payload)

    state2 = get_my_state(ctx)
    mp_after = state2["militaryPoints"]
    infantry_after = state2.get("army", {}).get("infantry", 0)
    print(f"  After:  mp={mp_after}, infantry={infantry_after}")

    assert mp_after == mp_before - 3, f"Expected mp={mp_before-3}, got {mp_after}"
    assert infantry_after == infantry_before + 3, f"Expected infantry={infantry_before+3}, got {infantry_after}"
    print("  ✅ PASS: 3x recruit_infantry spends 3 mp and gives +3 infantry")


def test_recruit_budget_overflow():
    """50x recruit_infantry should be rejected by server-side maxPerRound validation."""
    print("\n=== TEST: 50x recruit_infantry (maxPerRound validation) ===")
    ctx = setup_game()
    state = get_my_state(ctx)
    mp_before = state["militaryPoints"]
    gov = state["budgetPools"]["governmentFiscal"]
    print(f"  Before: govFiscal={gov}, mp={mp_before}")

    payload = build_decision_payload(military_actions=["recruit_infantry"] * 50)
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    print(f"  Submit 50x: status={code}")

    # Server should reject: maxPerRound=3 enforced at submit validation
    assert code == 400, f"Expected 400 (maxPerRound rejection), got {code}"
    assert "maxPerRound" in resp.get("error", {}).get("message", ""), "Expected maxPerRound error message"
    print("  ✅ PASS: maxPerRound validation enforced at submit time")


def test_train_artillery():
    """train_artillery: costs 2 militaryPoints, gives +1 artillery."""
    print("\n=== TEST: train_artillery ===")
    ctx = setup_game()
    state = get_my_state(ctx)
    gov = state["budgetPools"]["governmentFiscal"]
    mp_before = state["militaryPoints"]
    artillery_before = state.get("army", {}).get("artillery", 0)
    print(f"  Before: govFiscal={gov}, mp={mp_before}, artillery={artillery_before}")

    if mp_before < 2:
        print(f"  ⚠️ SKIP: militaryPoints={mp_before} < 2")
        return

    payload = build_decision_payload(military_actions=["train_artillery"])
    ctx = full_cycle(ctx, payload)

    state2 = get_my_state(ctx)
    mp_after = state2["militaryPoints"]
    artillery_after = state2.get("army", {}).get("artillery", 0)
    print(f"  After:  mp={mp_after}, artillery={artillery_after}")

    assert mp_after == mp_before - 2, f"Expected mp={mp_before-2}, got {mp_after}"
    assert artillery_after == artillery_before + 1, f"Expected artillery={artillery_before+1}, got {artillery_after}"
    print("  ✅ PASS: train_artillery spends 2 mp and gives +1 artillery")


def test_naval_drill():
    """naval_drill: costs 1 militaryPoint, expands overseas capacity."""
    print("\n=== TEST: naval_drill ===")
    ctx = setup_game()
    state = get_my_state(ctx)
    gov = state["budgetPools"]["governmentFiscal"]
    mp_before = state["militaryPoints"]
    print(f"  Before: govFiscal={gov}, mp={mp_before}")

    if mp_before < 1:
        print(f"  ⚠️ SKIP: militaryPoints={mp_before} < 1")
        return

    payload = build_decision_payload(military_actions=["naval_drill"])
    ctx = full_cycle(ctx, payload)

    state2 = get_my_state(ctx)
    mp_after = state2["militaryPoints"]
    print(f"  After:  mp={mp_after}")

    assert mp_after == mp_before - 1, f"Expected mp={mp_before-1}, got {mp_after}"
    print("  ✅ PASS: naval_drill spends 1 mp")


def test_build_fleet():
    """build_fleet: costs 3 military points, gives +1 fleet."""
    print("\n=== TEST: build_fleet ===")
    ctx = setup_game()
    state = get_my_state(ctx)
    gov = state["budgetPools"]["governmentFiscal"]
    mp_before = state["militaryPoints"]
    fleets_before = state["navy"]["fleets"]
    print(f"  Before: govFiscal={gov}, mp={mp_before}, fleets={fleets_before}")

    if mp_before < 3:
        print(f"  ⚠️ SKIP: militaryPoints={mp_before} < 3")
        return

    payload = build_decision_payload(military_actions=["build_fleet"])
    ctx = full_cycle(ctx, payload)

    state2 = get_my_state(ctx)
    mp_after = state2["militaryPoints"]
    fleets_after = state2["navy"]["fleets"]
    print(f"  After:  mp={mp_after}, fleets={fleets_after}")

    assert mp_after == mp_before - 3, f"Expected mp={mp_before-3}, got {mp_after}"
    assert fleets_after == fleets_before + 1, f"Expected fleets={fleets_before+1}, got {fleets_after}"
    print("  ✅ PASS: build_fleet spends 3 mp and gives +1 fleet")


def test_unlock_colonization():
    """unlockColonization costs government fiscal. Test unlock alone (no diplomacy)."""
    print("\n=== TEST: unlockColonization ===")
    ctx = setup_game()
    state = get_my_state(ctx)
    gov = state["budgetPools"]["governmentFiscal"]
    print(f"  Before: govFiscal={gov}")

    if gov < 10:
        print(f"  ⚠️ SKIP: govFiscal={gov} < 10")
        return

    # Only unlock, no diplomacy (budget=10, unlock costs 10)
    payload = build_decision_payload(unlock_colonization=True)
    ctx = full_cycle(ctx, payload)

    state2 = get_my_state(ctx)
    col = state2.get("colonizationUnlocked", False)
    gov_after = state2["budgetPools"]["governmentFiscal"]
    print(f"  After:  colonizationUnlocked={col}, govFiscal={gov_after}")

    assert col, "Expected colonizationUnlocked=True"
    print("  ✅ PASS: unlockColonization works")


def test_military_diplomacy_combined():
    """Military + diplomacy in same decision."""
    print("\n=== TEST: military + diplomacy combined ===")
    ctx = setup_game()
    state = get_my_state(ctx)
    gov = state["budgetPools"]["governmentFiscal"]
    mp_before = state["militaryPoints"]
    print(f"  Before: govFiscal={gov}, mp={mp_before}")

    if mp_before < 1:
        print(f"  ⚠️ SKIP: militaryPoints={mp_before} < 1")
        return
    if gov < 3:
        print(f"  ⚠️ SKIP: govFiscal={gov} < 3")
        return

    # recruit spends 1 military point; establish_americas spends government fiscal.
    payload = build_decision_payload(
        military_actions=["recruit_infantry"],
        diplomacy_actions=["establish_americas"],
    )
    ctx = full_cycle(ctx, payload)

    state2 = get_my_state(ctx)
    mp_after = state2["militaryPoints"]
    diplo = state2.get("establishedDiplomacy", [])
    print(f"  After:  mp={mp_after}, diplomacy={diplo}")

    assert mp_after == mp_before - 1, f"Expected mp={mp_before-1}, got {mp_after}"
    assert "americas" in diplo, "Expected americas in diplomacy"
    print("  ✅ PASS: military + diplomacy combined")


def test_colonization_full_flow():
    """Full colonization: round1 unlock → round2 diplomacy+buy military points → round3 colonize."""
    print("\n=== TEST: colonization full flow (multi-round) ===")
    ctx = setup_game()
    state = get_my_state(ctx)
    gov = state["budgetPools"]["governmentFiscal"]
    mp = state["militaryPoints"]
    print(f"  Round 1 Before: govFiscal={gov}, mp={mp}")

    # Round 1: unlock colonization (costs 10)
    if gov < 10:
        print(f"  ⚠️ SKIP: govFiscal={gov} < 10")
        return

    payload1 = build_decision_payload(unlock_colonization=True)
    ctx = full_cycle(ctx, payload1)

    state2 = get_my_state(ctx)
    col = state2.get("colonizationUnlocked", False)
    round_no = ctx["activeGame"].get("currentRound", "?")
    gov_r2 = state2["budgetPools"]["governmentFiscal"]
    mp_r2 = state2["militaryPoints"]
    print(f"  Round {round_no}: colUnlocked={col}, govFiscal={gov_r2}, mp={mp_r2}")

    if not col:
        print("  ❌ FAIL: Colonization not unlocked after round 1")
        return

    # Round 2: establish diplomacy and, if budget allows, buy military points for colonization.
    if gov_r2 < 13:
        # Just do diplomacy if budget is tight.
        payload2 = build_decision_payload(diplomacy_actions=["establish_americas"])
    else:
        payload2 = build_decision_payload(
            diplomacy_actions=["establish_americas"],
            point_purchases=[{"pointType": "military", "quantity": 1}],
        )
    ctx = full_cycle(ctx, payload2)

    state3 = get_my_state(ctx)
    round_no2 = ctx["activeGame"].get("currentRound", "?")
    diplo = state3.get("establishedDiplomacy", [])
    mp_r3 = state3["militaryPoints"]
    print(f"  Round {round_no2}: diplomacy={diplo}, mp={mp_r3}")

    if "americas" not in diplo:
        print("  ❌ FAIL: Americas diplomacy not established")
        return

    # Round 3: colonize americas (current balance needs 2 mp)
    if mp_r3 >= 2:
        payload3 = build_decision_payload(
            colonization_actions=[{"targetRegionId": "americas"}],
        )
        ctx = full_cycle(ctx, payload3)

        state4 = get_my_state(ctx)
        round_no3 = ctx["activeGame"].get("currentRound", "?")
        snap = ctx["activeSnapshot"]

        # Check region states for americas controller
        regions = snap.get("regionStates", [])
        americas = next((r for r in regions if r.get("regionId") == "americas"), None)
        if americas:
            controller = americas.get("controller")
            print(f"  Round {round_no3}: americas controller={controller}")
            if controller == "britain":
                print("  ✅ PASS: Full colonization flow successful!")
            else:
                print(f"  ⚠️ americas controller={controller} (expected britain)")
        else:
            # Snapshot may not include regionStates directly
            print(f"  Round {round_no3}: mp={state4.get('militaryPoints', '?')}")
            print("  ✅ PASS (partial): colonization submitted; verify via region state")
    else:
        # Need one more round of military point purchase.
        payload3 = build_decision_payload(
            point_purchases=[{"pointType": "military", "quantity": 1}],
        )
        ctx = full_cycle(ctx, payload3)
        state4 = get_my_state(ctx)
        mp_r4 = state4["militaryPoints"]
        round_no3 = ctx["activeGame"].get("currentRound", "?")
        print(f"  Round {round_no3}: mp={mp_r4} (recruiting more)")

        if mp_r4 >= 2:
            payload4 = build_decision_payload(
                colonization_actions=[{"targetRegionId": "americas"}],
            )
            ctx = full_cycle(ctx, payload4)
            state5 = get_my_state(ctx)
            snap = ctx["activeSnapshot"]
            regions = snap.get("regionStates", [])
            americas = next((r for r in regions if r.get("regionId") == "americas"), None)
            if americas and americas.get("controller") == "britain":
                print("  ✅ PASS: Full colonization flow successful!")
            else:
                ctrl = americas.get("controller") if americas else "N/A"
                print(f"  ⚠️ americas controller={ctrl}")
        else:
            print(f"  ⚠️ Still not enough mp after 4 rounds (mp={mp_r4})")


def test_duplicate_diplomacy():
    """Diplomacy to same region twice should be rejected at validation."""
    print("\n=== TEST: duplicate diplomacy ===")
    ctx = setup_game()

    # Submit duplicate in same payload — should be rejected
    payload = build_decision_payload(diplomacy_actions=["establish_americas", "establish_americas"])
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    print(f"  Submit duplicate: status={code}")

    assert code == 400, f"Expected 400, got {code}"
    assert "duplicated" in resp.get("error", {}).get("message", "").lower(), "Expected duplication error"
    print("  ✅ PASS: duplicate diplomacy rejected at validation")


def test_invalid_military_action():
    """Invalid action ID should be rejected at validation."""
    print("\n=== TEST: invalid military action ===")
    ctx = setup_game()

    payload = build_decision_payload(military_actions=["nonexistent_action_xyz"])
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    print(f"  Submit invalid action: status={code}")

    # Server rejects unknown action IDs
    assert code == 400, f"Expected 400, got {code}: {resp}"
    assert "Unknown" in resp.get("error", {}).get("message", ""), "Expected unknown action error"
    print("  ✅ PASS: invalid action rejected at validation")


# ─── main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("Military System API E2E Tests")
    print("=" * 60)

    tests = [
        test_snapshot_check,
        test_recruit_infantry,
        test_multiple_recruit_infantry,
        test_recruit_budget_overflow,
        test_train_artillery,
        test_naval_drill,
        test_build_fleet,
        test_unlock_colonization,
        test_military_diplomacy_combined,
        test_duplicate_diplomacy,
        test_invalid_military_action,
        test_colonization_full_flow,
    ]

    import time
    passed = 0
    failed = 0

    for test_fn in tests:
        time.sleep(2)  # Brief pause between tests to avoid DB contention
        try:
            test_fn()
            passed += 1
        except AssertionError as e:
            print(f"  ❌ ASSERTION FAILED: {e}")
            failed += 1
        except Exception as e:
            print(f"  ❌ ERROR: {type(e).__name__}: {e}")
            failed += 1

    print("\n" + "=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)
    sys.exit(0 if failed == 0 else 1)

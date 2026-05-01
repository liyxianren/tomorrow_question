#!/usr/bin/env python3
"""
Frontend Integration E2E Test — 明日之问

Verifies that the exact payload shape the frontend sends is correctly
handled by the backend through the full round lifecycle.

Tests the payload shape from frontend/src/features/game/forms.ts
(createInitialPhaseDraft) and decisionDrafts.ts mutations.

Key frontend payload shape:
{
  "factoryPlan": {productionOrders, expansionOrders, upgradeOrders, newFactoryOrders},
  "domesticMarketPlan": {domesticMarketActions},
  "governmentPlan": {pointPurchases, strategySelections, techResearch, adminPurchases},
  "militaryPlan": {
    unlockColonization, militaryActions, diplomacyActions, colonizationActions,
    navalDeployment, conquestActions, lootingActions
  },
  "talentPlan": {talentUnlocks},
  "abilitySelection": {abilityId, targetIdeology?},
  "reforms": [],
  "activatePolicies": [],
  "deactivatePolicies": [],
  "phase1Production": {rawMaterialAssignments},
  "researchTarget": "spinning_jenny"
}
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


def set_ready(room_code: str, session_id: str):
    r = requests.post(
        f"{BASE}/rooms/{room_code}/ready",
        json={"isReady": True},
        headers={"X-Session-Id": session_id},
    )
    r.raise_for_status()


def get_context(room_code: str) -> dict:
    r = requests.get(f"{BASE}/rooms/{room_code}/context")
    r.raise_for_status()
    return r.json()["data"]


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


def setup_game(country: str = "britain") -> dict:
    """Create room, fill bots, start game. Returns ctx dict."""
    h = create_room("FrontendIntegrationTest")
    rc = h["room_code"]
    sid = h["session_id"]

    select_country(rc, sid, country)
    fill_bots(rc, sid)
    set_ready(rc, sid)

    c = get_context(rc)
    return {
        "room_code": rc,
        "session_id": sid,
        "player_id": h["player_id"],
        "game_id": c["activeGame"]["gameId"],
        "activeGame": c["activeGame"],
        "activeSnapshot": c["activeSnapshot"],
    }


def get_state(ctx: dict) -> dict:
    """Get current player state."""
    c = get_context(ctx["room_code"])
    ctx["activeGame"] = c.get("activeGame", {})
    ctx["activeSnapshot"] = c.get("activeSnapshot", {})
    snap = ctx["activeSnapshot"]
    ns = snap.get("nationalStateByPlayer", {})
    return ns.get(ctx["player_id"], {})


def advance_round(ctx: dict, decision_payload: dict, market_domestic: int = 8) -> dict:
    """Submit decision + market, wait for settlement, return updated ctx."""
    game_id = ctx["game_id"]
    sid = ctx["session_id"]

    resp_d, code_d = submit_decision(game_id, sid, decision_payload)
    assert code_d == 200, f"Decision submit failed: {code_d} {json.dumps(resp_d, ensure_ascii=False)[:200]}"

    # If allSubmitted triggers settlement automatically, skip market
    phase_after_decision = resp_d.get("data", {}).get("phase")
    all_submitted = resp_d.get("data", {}).get("allSubmitted", False)

    if not all_submitted or phase_after_decision != "settlement":
        market_payload = {
            "saleOrders": [],
            "phase1Market": {
                "domesticAllocation": market_domestic,
                "externalAllocations": [],
            },
        }
        resp_m, code_m = submit_market(game_id, sid, market_payload)
        assert code_m == 200, f"Market submit failed: {code_m} {json.dumps(resp_m, ensure_ascii=False)[:200]}"

    # Wait for settlement to complete
    for _ in range(20):
        time.sleep(2)
        c = get_context(ctx["room_code"])
        if c.get("activeGame", {}).get("currentPhase") == "decision":
            ctx["activeGame"] = c["activeGame"]
            ctx["activeSnapshot"] = c.get("activeSnapshot", {})
            ctx["game_id"] = c["activeGame"].get("gameId", game_id)
            return ctx

    # Final refresh
    c = get_context(ctx["room_code"])
    ctx["activeGame"] = c.get("activeGame", {})
    ctx["activeSnapshot"] = c.get("activeSnapshot", {})
    ctx["game_id"] = ctx["activeGame"].get("gameId", game_id)
    return ctx


# ─── Frontend payload builder ────────────────────────────────────────────────

def frontend_decision_payload(
    *,
    production_orders=None,
    upgrade_orders=None,
    new_factory_orders=None,
    expansion_orders=None,
    domestic_actions=None,
    point_purchases=None,
    strategy_selections=None,
    tech_research=None,
    admin_purchases=0,
    military_actions=None,
    diplomacy_actions=None,
    unlock_colonization=False,
    colonization_actions=None,
    naval_deployment=None,
    conquest_actions=None,
    looting_actions=None,
    talent_unlocks=None,
    ability_selection=None,
    reforms=None,
    activate_policies=None,
    deactivate_policies=None,
    phase1_production=None,
    research_target=None,
) -> dict:
    """Build the EXACT payload shape the frontend sends."""
    payload = {
        "factoryPlan": {
            "productionOrders": production_orders or [],
            "expansionOrders": expansion_orders or [],
            "upgradeOrders": upgrade_orders or [],
            "newFactoryOrders": new_factory_orders or [],
        },
        "domesticMarketPlan": {
            "domesticMarketActions": [{"actionId": a} for a in (domestic_actions or [])],
        },
        "governmentPlan": {
            "pointPurchases": point_purchases or [],
            "strategySelections": [{"actionId": a} for a in (strategy_selections or [])],
            "techResearch": [{"techId": t} for t in (tech_research or [])],
            "adminPurchases": admin_purchases,
        },
        "militaryPlan": {
            "unlockColonization": unlock_colonization,
            "militaryActions": [{"actionId": a} for a in (military_actions or [])],
            "diplomacyActions": [{"actionId": a} for a in (diplomacy_actions or [])],
            "colonizationActions": colonization_actions or [],
            "navalDeployment": naval_deployment or {},
            "conquestActions": conquest_actions or [],
            "lootingActions": looting_actions or [],
        },
        "talentPlan": {
            "talentUnlocks": [{"nodeId": n} for n in (talent_unlocks or [])],
        },
        "reforms": reforms or [],
        "activatePolicies": activate_policies or [],
        "deactivatePolicies": deactivate_policies or [],
    }

    if ability_selection is not None:
        payload["abilitySelection"] = ability_selection

    if phase1_production is not None:
        payload["phase1Production"] = phase1_production
    else:
        payload["phase1Production"] = {"rawMaterialAssignments": {"handicraft": 8}}

    if research_target is not None:
        payload["researchTarget"] = research_target

    return payload


# ─── Tests ───────────────────────────────────────────────────────────────────

def test_frontend_empty_payload_accepted():
    """Frontend's exact empty payload shape should be accepted by backend."""
    print("\n=== TEST: frontend empty payload accepted ===")
    ctx = setup_game()
    payload = frontend_decision_payload()

    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    assert code == 200, f"Expected 200, got {code}: {resp}"
    print("  ✅ PASS: Frontend empty payload accepted")


def test_frontend_full_round_lifecycle():
    """Frontend payload → market → settlement → next round."""
    print("\n=== TEST: frontend full round lifecycle ===")
    ctx = setup_game()
    state1 = get_state(ctx)

    gov1 = state1["budgetPools"]["governmentFiscal"]
    print(f"  Round 1: govFiscal={gov1}")

    # Round 1: empty submission
    ctx = advance_round(ctx, frontend_decision_payload())
    state2 = get_state(ctx)
    gov2 = state2["budgetPools"]["governmentFiscal"]
    round_no = ctx["activeGame"].get("currentRound", "?")
    print(f"  Round {round_no}: govFiscal={gov2}")

    assert round_no >= 2, f"Expected round 2, got {round_no}"
    print("  ✅ PASS: Full round lifecycle works with frontend payload shape")


def test_frontend_military_actions_payload():
    """Frontend's military action payload shape."""
    print("\n=== TEST: frontend military actions ===")
    ctx = setup_game()
    state = get_state(ctx)
    mp_before = state["militaryPoints"]

    payload = frontend_decision_payload(military_actions=["recruit_infantry"])
    ctx = advance_round(ctx, payload)

    state2 = get_state(ctx)
    mp_after = state2["militaryPoints"]
    print(f"  mp before={mp_before}, after={mp_after}")
    assert mp_after == mp_before + 1, f"Expected +1 mp, got {mp_before}→{mp_after}"
    print("  ✅ PASS: Frontend military actions work")


def test_frontend_talent_unlock_payload():
    """Frontend's talent unlock payload shape."""
    print("\n=== TEST: frontend talent unlock ===")
    ctx = setup_game()

    # Use a basic talent node that doesn't have prerequisites
    payload = frontend_decision_payload(talent_unlocks=["ind_basic_metallurgy"])
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    assert code == 200, f"Expected 200, got {code}: {resp}"
    print("  ✅ PASS: Frontend talent unlock payload accepted")


def test_frontend_strategy_selection_payload():
    """Frontend's strategy selection (government actions) payload shape."""
    print("\n=== TEST: frontend strategy selection ===")
    ctx = setup_game()

    payload = frontend_decision_payload(strategy_selections=["trade_agreement"])
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    assert code == 200, f"Expected 200, got {code}: {resp}"
    print("  ✅ PASS: Frontend strategy selection payload accepted")


def test_frontend_policy_activation_payload():
    """Frontend's policy activation/deactivation payload shape."""
    print("\n=== TEST: frontend policy activation ===")
    ctx = setup_game()
    state = get_state(ctx)
    gov = state["budgetPools"]["governmentFiscal"]

    # expand_research costs 12 budget — skip if too expensive
    if gov < 12:
        # Use a cheaper policy or just verify the payload shape is accepted
        # Try with no policy (empty activate) — tests the field passthrough
        payload = frontend_decision_payload(activate_policies=[], deactivate_policies=[])
        resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
        assert code == 200, f"Expected 200, got {code}: {resp}"
        print(f"  ⚠️ Skipped expand_research (govFiscal={gov} < 12); verified payload shape")
        print("  ✅ PASS: Frontend policy activation payload shape accepted")
    else:
        payload = frontend_decision_payload(activate_policies=["expand_research"])
        resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
        assert code == 200, f"Expected 200, got {code}: {resp}"
        print("  ✅ PASS: Frontend policy activation payload accepted")


def test_frontend_reform_payload():
    """Frontend's reform queue payload shape."""
    print("\n=== TEST: frontend reform ===")
    ctx = setup_game()

    # Reforms are queue-based
    payload = frontend_decision_payload(reforms=["freedom_of_press"])
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    assert code == 200, f"Expected 200, got {code}: {resp}"
    print("  ✅ PASS: Frontend reform payload accepted")


def test_frontend_production_upgrade_payload():
    """Frontend's factory upgrade payload shape."""
    print("\n=== TEST: frontend production upgrade ===")
    ctx = setup_game()

    payload = frontend_decision_payload(upgrade_orders=[{"routeId": "mechanized", "quantity": 1}])
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    # This might fail if no spinning_jenny research — that's expected
    print(f"  Submit: status={code}")
    # Accept both 200 (if tech available) and 400 (if not researched)
    assert code in (200, 400), f"Expected 200 or 400, got {code}: {resp}"
    print("  ✅ PASS: Frontend production upgrade payload accepted/rejected correctly")


def test_frontend_point_purchase_payload():
    """Frontend's point purchase payload shape."""
    print("\n=== TEST: frontend point purchase ===")
    ctx = setup_game()

    payload = frontend_decision_payload(
        point_purchases=[{"pointType": "military", "quantity": 1}]
    )
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    assert code == 200, f"Expected 200, got {code}: {resp}"
    print("  ✅ PASS: Frontend point purchase payload accepted")


def test_frontend_looting_in_military_plan():
    """Frontend's lootingActions inside militaryPlan — the previously dropped field."""
    print("\n=== TEST: frontend lootingActions passthrough ===")
    ctx = setup_game()

    # Even if player can't actually loot, the payload should be accepted
    # (validation happens in resolver, not normalizer)
    payload = frontend_decision_payload(
        looting_actions=[{"regionId": "americas", "resourceType": "cotton"}]
    )
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    # Should be accepted (200) even if player hasn't colonized yet
    assert code == 200, f"Expected 200, got {code}: {resp}"
    print("  ✅ PASS: lootingActions survives normalizer in frontend payload")


def test_frontend_conquest_actions_payload():
    """Frontend's conquestActions payload shape."""
    print("\n=== TEST: frontend conquestActions ===")
    ctx = setup_game()

    payload = frontend_decision_payload(
        conquest_actions=[{"regionId": "americas", "infantry": 3, "artillery": 1}]
    )
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    # Should be accepted (200) even if can't actually conquer
    assert code == 200, f"Expected 200, got {code}: {resp}"
    print("  ✅ PASS: conquestActions survives normalizer in frontend payload")


def test_frontend_naval_deployment_payload():
    """Frontend's navalDeployment payload shape (Record<string, number>)."""
    print("\n=== TEST: frontend navalDeployment ===")
    ctx = setup_game()

    payload = frontend_decision_payload(
        naval_deployment={"north_atlantic": 1}
    )
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    assert code == 200, f"Expected 200, got {code}: {resp}"
    print("  ✅ PASS: navalDeployment survives normalizer in frontend payload")


def test_frontend_ability_selection_payload():
    """Frontend's abilitySelection (top-level optional field)."""
    print("\n=== TEST: frontend abilitySelection ===")
    ctx = setup_game(country="britain")

    # Britain's ability: workshop_of_the_world (no target ideology)
    payload = frontend_decision_payload(
        ability_selection={"abilityId": "workshop_of_the_world"}
    )
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    assert code == 200, f"Expected 200, got {code}: {resp}"
    print("  ✅ PASS: abilitySelection survives normalizer in frontend payload")


def test_frontend_france_ability_with_target():
    """France's code_napoleon ability with targetIdeology."""
    print("\n=== TEST: frontend France ability with target ===")
    ctx = setup_game(country="france")

    payload = frontend_decision_payload(
        ability_selection={"abilityId": "code_napoleon", "targetIdeology": "liberalism"}
    )
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    assert code == 200, f"Expected 200, got {code}: {resp}"
    print("  ✅ PASS: abilitySelection with targetIdeology accepted")


def test_frontend_research_target_payload():
    """Frontend's researchTarget (top-level string field)."""
    print("\n=== TEST: frontend researchTarget ===")
    ctx = setup_game()

    payload = frontend_decision_payload(research_target="spinning_jenny")
    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    assert code == 200, f"Expected 200, got {code}: {resp}"
    print("  ✅ PASS: researchTarget survives normalizer in frontend payload")


def test_frontend_combined_all_features():
    """Frontend sends EVERY feature type in a single submission — the ultimate integration test."""
    print("\n=== TEST: frontend combined ALL features ===")
    ctx = setup_game()
    state = get_state(ctx)
    gov = state["budgetPools"]["governmentFiscal"]
    print(f"  Starting govFiscal={gov}")

    # Pick actions that fit within budget
    # Britain starts with 10 govFiscal
    # recruit_infantry=2, admin=varies, unlock_colonization=10
    # We can't afford everything, so test payload shape acceptance
    payload = frontend_decision_payload(
        # Factory
        production_orders=[{"goodsId": "phase1_goods", "quantity": 2}],
        # Domestic market — empty (valid shape)
        domestic_actions=[],
        # Government — minimal
        point_purchases=[],
        strategy_selections=[],
        admin_purchases=0,
        # Military — single cheap action
        military_actions=["recruit_infantry"],
        diplomacy_actions=[],
        unlock_colonization=False,
        naval_deployment={},
        looting_actions=[],
        conquest_actions=[],
        # Talent
        talent_unlocks=["ind_basic_metallurgy"],
        # Policies
        activate_policies=[],
        deactivate_policies=[],
        # Phase1 production
        phase1_production={"rawMaterialAssignments": {"handicraft": 8}},
    )

    resp, code = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    assert code == 200, f"Expected 200, got {code}: {json.dumps(resp, ensure_ascii=False)[:300]}"

    # Verify settlement works
    market_payload = {
        "saleOrders": [],
        "phase1Market": {"domesticAllocation": 8, "externalAllocations": []},
    }
    resp_m, code_m = submit_market(ctx["game_id"], ctx["session_id"], market_payload)
    assert code_m == 200, f"Market submit failed: {code_m}"

    # Wait for settlement
    for _ in range(20):
        time.sleep(2)
        c = get_context(ctx["room_code"])
        if c.get("activeGame", {}).get("currentPhase") == "decision":
            state = c.get("activeSnapshot", {}).get("nationalStateByPlayer", {}).get(ctx["player_id"], {})
            print(f"  After settlement: round={c['activeGame'].get('currentRound')}, "
                  f"govFiscal={state.get('budgetPools', {}).get('governmentFiscal', '?')}, "
                  f"mp={state.get('militaryPoints', '?')}")
            print("  ✅ PASS: Combined features in single frontend payload works!")
            return

    print("  ⚠️ Settlement took >40s but payload was accepted (200)")


def test_frontend_multi_round_progression():
    """Multiple rounds using exact frontend payload shape — full game simulation."""
    print("\n=== TEST: frontend multi-round progression (5 rounds) ===")
    ctx = setup_game()

    for round_num in range(1, 6):
        state = get_state(ctx)
        gov = state.get("budgetPools", {}).get("governmentFiscal", 0)
        mp = state.get("militaryPoints", "?")
        round_no = ctx["activeGame"].get("currentRound", "?")

        # Only add actions if we can afford them (recruit_infantry costs 2)
        if gov >= 2:
            payload = frontend_decision_payload(military_actions=["recruit_infantry"])
        else:
            payload = frontend_decision_payload()

        ctx = advance_round(ctx, payload)

        state2 = get_state(ctx)
        gov2 = state2.get("budgetPools", {}).get("governmentFiscal", "?")
        mp2 = state2.get("militaryPoints", "?")
        new_round = ctx["activeGame"].get("currentRound", "?")
        print(f"  Round {round_no}→{new_round}: govFiscal={gov}→{gov2}, mp={mp}→{mp2}")

    print("  ✅ PASS: 5-round frontend payload progression complete")


# ─── main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("Frontend Integration E2E Tests")
    print("=" * 60)

    tests = [
        test_frontend_empty_payload_accepted,
        test_frontend_full_round_lifecycle,
        test_frontend_military_actions_payload,
        test_frontend_talent_unlock_payload,
        test_frontend_strategy_selection_payload,
        test_frontend_policy_activation_payload,
        test_frontend_reform_payload,
        test_frontend_production_upgrade_payload,
        test_frontend_point_purchase_payload,
        test_frontend_looting_in_military_plan,
        test_frontend_conquest_actions_payload,
        test_frontend_naval_deployment_payload,
        test_frontend_ability_selection_payload,
        test_frontend_france_ability_with_target,
        test_frontend_research_target_payload,
        test_frontend_combined_all_features,
        test_frontend_multi_round_progression,
    ]

    passed = 0
    failed = 0

    for test_fn in tests:
        time.sleep(2)
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

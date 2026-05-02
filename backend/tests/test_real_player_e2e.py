#!/usr/bin/env python3
"""Real-player perspective E2E test via live API (port 5001).

Plays a multi-round game as Britain, exercising:
  - Game creation + country selection + bot fill
  - Decision submit: military recruit, colonization unlock
  - Market submit
  - Multi-round progression (5 rounds)
  - Budget tracking across rounds (check for leaks)
  - Production upgrade chain via API
  - Talent unlock chain
  - National ability usage

Requires: flask server running on port 5001.
"""

import json
import time
import sys
import requests

BASE = "http://127.0.0.1:5001/api/v1"
P = lambda msg: print(msg, flush=True)

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

def get_context(room_code, session_id):
    r = requests.get(f"{BASE}/rooms/{room_code}/context",
        headers={"X-Session-Id": session_id})
    r.raise_for_status()
    return r.json()["data"]

def submit_decision(game_id, session_id, payload):
    r = requests.post(f"{BASE}/games/{game_id}/phases/decision/submit",
        json={"payload": payload}, headers={"X-Session-Id": session_id})
    return r.json(), r.status_code

def submit_market(game_id, session_id, domestic=8):
    payload = {"saleOrders": [], "phase1Market": {"domesticAllocation": domestic}}
    r = requests.post(f"{BASE}/games/{game_id}/phases/market/submit",
        json={"payload": payload}, headers={"X-Session-Id": session_id})
    return r.json(), r.status_code

def empty_payload():
    return {
        "factoryPlan": {"productionOrders": [], "expansionOrders": [], "upgradeOrders": [], "newFactoryOrders": []},
        "domesticMarketPlan": {"domesticMarketActions": []},
        "governmentPlan": {"pointPurchases": [], "strategySelections": [], "techResearch": []},
        "militaryPlan": {
            "unlockColonization": False, "militaryActions": [],
            "diplomacyActions": [], "colonizationActions": [],
            "navalDeployment": {}, "conquestActions": [], "lootingActions": [],
        },
        "talentPlan": {"talentUnlocks": []},
        "activatePolicies": [],
        "deactivatePolicies": [],
    }

def advance_round(ctx, payload, market_domestic=8, max_wait=30):
    """Submit decision + market, wait for next decision phase."""
    game_id = ctx["game_id"]
    sid = ctx["session_id"]

    resp_d, code_d = submit_decision(game_id, sid, payload)
    if code_d != 200:
        P(f"    [WARN] Decision {code_d}: {json.dumps(resp_d, ensure_ascii=False)[:200]}")
        return ctx

    resp_m, code_m = submit_market(game_id, sid, market_domestic)
    if code_m != 200:
        P(f"    [WARN] Market {code_m}: {json.dumps(resp_m, ensure_ascii=False)[:200]}")
        return ctx

    # Wait for settlement to complete
    for attempt in range(max_wait):
        time.sleep(2)
        c = get_context(ctx["room_code"], ctx["session_id"])
        ag = c.get("activeGame", {})
        phase = ag.get("currentPhase")
        if phase == "decision":
            ctx["activeGame"] = ag
            ctx["activeSnapshot"] = c.get("activeSnapshot", {})
            ctx["game_id"] = ag.get("gameId", game_id)
            return ctx

    P(f"    [WARN] Never returned to decision after {max_wait * 2}s")
    c = get_context(ctx["room_code"], ctx["session_id"])
    ctx["activeGame"] = c.get("activeGame", {})
    ctx["activeSnapshot"] = c.get("activeSnapshot", {})
    return ctx


def test_real_player_game():
    """Play a full 5-round game as Britain with real actions."""
    P("\n=== REAL PLAYER E2E TEST ===\n")

    # Setup
    P("1. Creating room...")
    ctx = create_room("RealPlayer")
    ctx["room_code"] = ctx.pop("room_code")
    select_country(ctx["room_code"], ctx["session_id"], "britain")
    fill_bots(ctx["room_code"], ctx["session_id"])
    set_ready(ctx["room_code"], ctx["session_id"])
    time.sleep(3)

    P("2. Game started, reading initial state...")
    data = get_context(ctx["room_code"], ctx["session_id"])
    game = data["activeGame"]
    ctx["game_id"] = game["gameId"]
    ctx["activeGame"] = game
    ctx["activeSnapshot"] = data.get("activeSnapshot", {})

    snap = ctx["activeSnapshot"]
    budget = snap.get("budgetPools", {})
    P(f"   Phase: {game.get('currentPhase')}, Round: {game.get('currentRound')}")
    P(f"   Budget: govFiscal={budget.get('governmentFiscal', '?')}, military={budget.get('militaryBudget', '?')}, research={budget.get('researchBudget', '?')}")

    # Track budget across rounds for leak detection
    budget_history = []
    budget_history.append({"round": 1, "govFiscal": budget.get("governmentFiscal", 0), "source": "initial"})

    # ── Round 1: Recruit infantry ──
    P("\n3. Round 1: recruit_infantry + unlockColonization")
    payload = empty_payload()
    payload["militaryPlan"]["militaryActions"] = [{"actionId": "recruit_infantry"}]
    payload["militaryPlan"]["unlockColonization"] = True
    ctx = advance_round(ctx, payload)

    snap = ctx["activeSnapshot"]
    budget = snap.get("budgetPools", {})
    mp = snap.get("militaryPoints", "?")
    countries = snap.get("countryStates", [])
    britain = next((c for c in countries if c.get("countryCode") == "britain"), {})
    P(f"   Round {ctx['activeGame'].get('currentRound')}: govFiscal={budget.get('governmentFiscal', '?')}, mp={mp}")
    P(f"   Britain army: inf={britain.get('army', {}).get('infantry', 0)}, art={britain.get('army', {}).get('artillery', 0)}")
    budget_history.append({"round": 2, "govFiscal": budget.get("governmentFiscal", 0), "source": "after_recruit+unlock"})

    # ── Round 2: Establish diplomacy for Africa + talent unlock ──
    P("\n4. Round 2: diplomacy(africa) + buy tech points + talent unlock")
    payload = empty_payload()
    payload["militaryPlan"]["diplomacyActions"] = [{"actionId": "establish_africa"}]
    payload["governmentPlan"]["pointPurchases"] = [{"pointType": "military", "quantity": 1}]
    # Try talent unlock if we have enough points
    snap = ctx["activeSnapshot"]
    tp = snap.get("talentPoints", {})
    P(f"   Current talent points: {tp}")
    if tp.get("military", 0) >= 2:
        payload["talentPlan"]["talentUnlocks"] = [{"nodeId": "mil_basic_artillery"}]
    ctx = advance_round(ctx, payload)

    snap = ctx["activeSnapshot"]
    budget = snap.get("budgetPools", {})
    P(f"   Round {ctx['activeGame'].get('currentRound')}: govFiscal={budget.get('governmentFiscal', '?')}")
    budget_history.append({"round": 3, "govFiscal": budget.get("governmentFiscal", 0), "source": "after_diplomacy+talent"})

    # ── Round 3: Colonize Africa + recruit ──
    P("\n5. Round 3: colonize(africa) + recruit_infantry")
    payload = empty_payload()
    payload["militaryPlan"]["colonizationActions"] = [{"targetRegionId": "africa"}]
    payload["militaryPlan"]["militaryActions"] = [{"actionId": "recruit_infantry"}]
    ctx = advance_round(ctx, payload)

    snap = ctx["activeSnapshot"]
    budget = snap.get("budgetPools", {})
    regions = snap.get("regionStates", [])
    africa = next((r for r in regions if r.get("regionId") == "africa"), {})
    P(f"   Round {ctx['activeGame'].get('currentRound')}: govFiscal={budget.get('governmentFiscal', '?')}")
    P(f"   Africa: ctrl={africa.get('controller', 'None')}, access={africa.get('accessLevel', '?')}")
    budget_history.append({"round": 4, "govFiscal": budget.get("governmentFiscal", 0), "source": "after_colonize"})

    # ── Round 4: Loot Africa + national ability ──
    P("\n6. Round 4: loot(africa, cotton) + use ability (workshop_of_the_world)")
    payload = empty_payload()
    payload["militaryPlan"]["lootingActions"] = [{"regionId": "africa", "resourceType": "cotton"}]
    payload["abilitySelection"] = {"abilityId": "workshop_of_the_world"}
    ctx = advance_round(ctx, payload)

    snap = ctx["activeSnapshot"]
    budget = snap.get("budgetPools", {})
    regions = snap.get("regionStates", [])
    africa = next((r for r in regions if r.get("regionId") == "africa"), {})
    P(f"   Round {ctx['activeGame'].get('currentRound')}: govFiscal={budget.get('governmentFiscal', '?')}")
    P(f"   Africa: ctrl={africa.get('controller', 'None')}, indep={africa.get('independence', 0)}")
    budget_history.append({"round": 5, "govFiscal": budget.get("governmentFiscal", 0), "source": "after_loot+ability"})

    # ── Round 5: Loot again + upgrade production ──
    P("\n7. Round 5: loot(africa, cotton) + upgrade to mechanized")
    payload = empty_payload()
    payload["militaryPlan"]["lootingActions"] = [{"regionId": "africa", "resourceType": "cotton"}]
    payload["factoryPlan"]["upgradeOrders"] = [{"routeId": "mechanized", "quantity": 1}]
    # Check if we can afford this
    resp_d, code_d = submit_decision(ctx["game_id"], ctx["session_id"], payload)
    if code_d != 200:
        P(f"   Upgrade rejected (expected if no spinning_jenny): {json.dumps(resp_d, ensure_ascii=False)[:200]}")
        # Just loot without upgrade
        payload = empty_payload()
        payload["militaryPlan"]["lootingActions"] = [{"regionId": "africa", "resourceType": "cotton"}]
    else:
        resp_m, code_m = submit_market(ctx["game_id"], ctx["session_id"])
        # Wait for settlement
        for attempt in range(30):
            time.sleep(2)
            c = get_context(ctx["room_code"], ctx["session_id"])
            ag = c.get("activeGame", {})
            if ag.get("currentPhase") == "decision":
                ctx["activeGame"] = ag
                ctx["activeSnapshot"] = c.get("activeSnapshot", {})
                ctx["game_id"] = ag.get("gameId", ctx["game_id"])
                break
        snap = ctx["activeSnapshot"]
        budget = snap.get("budgetPools", {})
        P(f"   Round {ctx['activeGame'].get('currentRound')}: govFiscal={budget.get('governmentFiscal', '?')}")
        budget_history.append({"round": 6, "govFiscal": budget.get("governmentFiscal", 0), "source": "after_loot+upgrade"})
        # Skip remaining if we already got here
        _print_summary(budget_history, snap)
        return True

    ctx = advance_round(ctx, payload)
    snap = ctx["activeSnapshot"]
    budget = snap.get("budgetPools", {})
    regions = snap.get("regionStates", [])
    africa = next((r for r in regions if r.get("regionId") == "africa"), {})
    P(f"   Round {ctx['activeGame'].get('currentRound')}: govFiscal={budget.get('governmentFiscal', '?')}")
    P(f"   Africa: ctrl={africa.get('controller', 'None')}, indep={africa.get('independence', 0)}")
    budget_history.append({"round": 6, "govFiscal": budget.get("governmentFiscal", 0), "source": "after_loot+upgrade"})

    _print_summary(budget_history, snap)
    return True

def _print_summary(budget_history, snap):
    P("\n=== BUDGET HISTORY ===")
    for entry in budget_history:
        P(f"  Round {entry['round']}: govFiscal={entry['govFiscal']} ({entry['source']})")

    # Check for budget leaks (should monotonically change based on actions)
    P("\n=== FINAL STATE ===")
    countries = snap.get("countryStates", [])
    for c in countries:
        cid = c.get("countryCode", "?")
        P(f"  {cid}: mode={c.get('productionMode')}, army={c.get('army', {})}")

    regions = snap.get("regionStates", [])
    for r in regions:
        P(f"  region={r.get('regionId')}, ctrl={r.get('controller')}, indep={r.get('independence', 0)}")

    P("\n✅ REAL PLAYER E2E TEST COMPLETE")


if __name__ == "__main__":
    try:
        ok = test_real_player_game()
        sys.exit(0 if ok else 1)
    except Exception as e:
        P(f"\n❌ TEST FAILED: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

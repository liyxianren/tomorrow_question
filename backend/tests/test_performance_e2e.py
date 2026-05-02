#!/usr/bin/env python3
"""Performance E2E test: concurrent game creation & submission."""

import requests
import json
import time
import concurrent.futures

BASE = "http://127.0.0.1:5001/api/v1"


def create_room(nickname):
    r = requests.post(f"{BASE}/rooms", json={"nickname": nickname})
    r.raise_for_status()
    data = r.json()["data"]
    return {
        "room_code": data["room"]["roomCode"],
        "session_id": data["session"]["sessionId"],
        "player_id": data["session"]["playerId"],
    }


def select_country(room_code, session_id, country):
    r = requests.post(
        f"{BASE}/rooms/{room_code}/country",
        json={"selectedCountry": country},
        headers={"X-Session-Id": session_id},
    )
    r.raise_for_status()


def fill_bots(room_code, session_id):
    r = requests.post(
        f"{BASE}/rooms/{room_code}/bots/fill",
        headers={"X-Session-Id": session_id},
    )
    r.raise_for_status()


def set_ready(room_code, session_id):
    r = requests.post(
        f"{BASE}/rooms/{room_code}/ready",
        json={"isReady": True},
        headers={"X-Session-Id": session_id},
    )
    r.raise_for_status()


def get_context(room_code):
    r = requests.get(f"{BASE}/rooms/{room_code}/context")
    r.raise_for_status()
    return r.json()["data"]


def empty_decision():
    return {
        "payload": {
            "factoryPlan": {
                "productionOrders": [],
                "expansionOrders": [],
                "upgradeOrders": [],
                "newFactoryOrders": [],
            },
            "domesticMarketPlan": {"domesticMarketActions": []},
            "governmentPlan": {
                "pointPurchases": [],
                "strategySelections": [],
                "techResearch": [],
            },
            "militaryPlan": {
                "unlockColonization": False,
                "militaryActions": [],
                "diplomacyActions": [],
                "colonizationActions": [],
                "navalDeployment": {},
                "conquestActions": [],
                "lootingActions": [],
            },
        }
    }


def create_and_start_game():
    h = create_room("PerfTest")
    rc, sid = h["room_code"], h["session_id"]
    select_country(rc, sid, "britain")
    fill_bots(rc, sid)
    set_ready(rc, sid)
    time.sleep(0.5)
    c = get_context(rc)
    game = c.get("activeGame", {})
    return rc, sid, game.get("gameId"), c


def submit_decision(game_id, session_id):
    r = requests.post(
        f"{BASE}/games/{game_id}/phases/decision/submit",
        json=empty_decision(),
        headers={"X-Session-Id": session_id},
    )
    return r.status_code, r.json()


def submit_market(game_id, session_id):
    payload = {
        "payload": {
            "saleOrders": [],
            "phase1Market": {"domesticAllocation": 8, "externalAllocations": []},
        }
    }
    r = requests.post(
        f"{BASE}/games/{game_id}/phases/market/submit",
        json=payload,
        headers={"X-Session-Id": session_id},
    )
    return r.status_code, r.json()


def wait_for_decision_phase(room_code, timeout=30):
    """Wait for game to return to decision phase (settlement complete)."""
    for _ in range(timeout):
        time.sleep(1)
        c = get_context(room_code)
        game = c.get("activeGame", {})
        if game.get("currentPhase") == "decision":
            return c
    return get_context(room_code)


def main():
    # Test 1: Single game creation
    print("=== Test 1: Single Game Creation ===")
    start = time.time()
    rc, sid, gid, ctx = create_and_start_game()
    elapsed = time.time() - start
    print(f"  Game created in {elapsed:.2f}s, game_id={gid}")
    assert gid, "Game not started"
    assert elapsed < 5, f"Game creation too slow: {elapsed:.2f}s"

    # Test 2: Single decision submit
    print("\n=== Test 2: Single Decision Submit ===")
    start = time.time()
    code, resp = submit_decision(gid, sid)
    elapsed = time.time() - start
    all_sub = resp.get("data", {}).get("allSubmitted", False)
    phase = resp.get("data", {}).get("phase", "?")
    settlement = resp.get("data", {}).get("settlementTriggered", False)
    print(f"  Decision: {elapsed:.3f}s, status={code}, allSubmitted={all_sub}")
    assert code == 200, f"Submit failed: {code}"

    # Submit market phase
    print("\n=== Test 2b: Market Submit ===")
    start = time.time()
    mcode, mresp = submit_market(gid, sid)
    elapsed = time.time() - start
    print(f"  Market: {elapsed:.3f}s, status={mcode}")

    # Test 3: Wait for settlement & next round
    print("\n=== Test 3: Settlement & Next Round ===")
    settle_start = time.time()
    c = wait_for_decision_phase(rc)
    settle_elapsed = time.time() - settle_start
    game = c.get("activeGame", {})
    print(f"  Next round in {settle_elapsed:.1f}s: round={game.get('currentRound', '?')}")

    # Test 4: Concurrent game creation (5 parallel)
    print("\n=== Test 4: Concurrent Game Creation (5 parallel) ===")
    start = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(create_and_start_game) for _ in range(5)]
        results = list(concurrent.futures.as_completed(futures))
    elapsed = time.time() - start
    games_data = [f.result() for f in results]
    games_ok = sum(1 for _, _, gid, _ in games_data if gid)
    print(f"  {games_ok}/5 games created in {elapsed:.2f}s")
    assert games_ok == 5, f"Only {games_ok}/5 games created"

    # Test 5: Concurrent decision submits (each in separate game)
    print("\n=== Test 5: Concurrent Decision Submits (5 games) ===")
    start = time.time()

    def submit_for(r):
        _, s, g, _ = r
        if g:
            return submit_decision(g, s)
        return 0, {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(submit_for, r) for r in games_data]
        submit_results = [f.result() for f in concurrent.futures.as_completed(futures)]
    elapsed = time.time() - start
    codes = [c for c, _ in submit_results]
    ok = sum(1 for c in codes if c == 200)
    print(f"  {ok}/5 submits OK in {elapsed:.3f}s, codes={codes}")
    assert ok == 5, f"Only {ok}/5 submits succeeded"

    print("\n✅ All performance tests passed")


if __name__ == "__main__":
    main()

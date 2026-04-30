from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.contracts.enums import CountryCode
from app.modules.balance_config import BalanceConfigError, get_balance_config, use_balance_config_dir
from app.modules.game_state.factory import create_game


class BalanceConfigTests(unittest.TestCase):
    def test_default_balance_config_bundle_parses_into_new_three_phase_structure(self) -> None:
        config = get_balance_config()

        self.assertEqual(config.global_config.total_rounds, 15)
        self.assertEqual(config.global_config.phase_duration_seconds, 15)
        self.assertEqual(
            config.global_config.ranking_tie_break_order,
            ("productionCapacity", "controlledRegions", "budgetPoolsTotal"),
        )
        self.assertEqual(set(config.countries), {country.value for country in CountryCode})
        self.assertIn("consumer_subsidy", config.decision_actions.domestic_market_actions)
        self.assertIn("expand_shipping_lines", config.decision_actions.government_actions)
        self.assertNotIn("military_draft", config.decision_actions.government_actions)
        self.assertNotIn("raise_expeditionary_force", config.decision_actions.government_actions)
        self.assertNotIn("colonial_charter", config.decision_actions.government_actions)
        self.assertIn("recruit_infantry", config.military_actions.military_actions)
        self.assertIn("establish_africa", config.military_actions.diplomacy_actions)
        self.assertEqual(config.production.goods["phase1_goods"].route_id, "handicraft")
        self.assertEqual(config.production.goods["phase1_goods"].unit_budget_cost, 1)
        self.assertEqual(config.production.goods["phase1_goods"].demand_threshold, 30)
        self.assertEqual(config.production.goods["phase1_goods"].price_floor, 2)
        self.assertEqual(config.production.goods["phase1_goods"].price_ceiling, 12)
        self.assertEqual(config.production.upgrade_costs["electrified"], 30)
        self.assertEqual(config.production.new_factory_costs["handicraft"], 12)
        self.assertEqual(config.market.region_goods_premiums["middle_east"]["steel"], 3)
        self.assertEqual(config.countries["britain"].initial_goods, ("phase1_goods",))
        self.assertEqual(config.technology.chains["mechanical"].techs[0].tech_id, "spinning_jenny")
        self.assertEqual(config.technology.route_unlocks["mechanized"], ["spinning_jenny"])
        self.assertGreaterEqual(len(config.events.events), 8)
        self.assertEqual(config.events.events[0].duration_rounds, 1)
        self.assertEqual(
            config.abilities.national_abilities["britain"].ability_id,
            "workshop_of_the_world",
        )
        self.assertEqual(
            config.politics.milestones["liberalism"][5].label,
            "产业自由化",
        )

    def test_create_game_uses_total_rounds_from_active_balance_config(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir) / "balance"
            config_dir.mkdir(parents=True, exist_ok=True)

            source_dir = ROOT / "config" / "balance"
            for source_path in source_dir.glob("*.json"):
                payload = json.loads(source_path.read_text(encoding="utf-8"))
                if source_path.name == "global.json":
                    payload["totalRounds"] = 9
                (config_dir / source_path.name).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

            with use_balance_config_dir(config_dir):
                game = create_game(room_code="ROOM01", game_id="game-1")

            self.assertEqual(game.total_rounds, 9)

    def test_missing_decision_actions_file_fails_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir) / "balance"
            config_dir.mkdir(parents=True, exist_ok=True)
            source_dir = ROOT / "config" / "balance"
            for source_path in source_dir.glob("*.json"):
                if source_path.name == "decision_actions.json":
                    continue
                (config_dir / source_path.name).write_text(source_path.read_text(encoding="utf-8"), encoding="utf-8")

            with self.assertRaises(BalanceConfigError):
                get_balance_config(config_dir)

    def test_missing_military_actions_file_fails_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir) / "balance"
            config_dir.mkdir(parents=True, exist_ok=True)
            source_dir = ROOT / "config" / "balance"
            for source_path in source_dir.glob("*.json"):
                if source_path.name == "military_actions.json":
                    continue
                (config_dir / source_path.name).write_text(source_path.read_text(encoding="utf-8"), encoding="utf-8")

            with self.assertRaises(BalanceConfigError):
                get_balance_config(config_dir)

    def test_invalid_country_initial_goods_fails_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir) / "balance"
            config_dir.mkdir(parents=True, exist_ok=True)
            source_dir = ROOT / "config" / "balance"
            for source_path in source_dir.glob("*.json"):
                payload = json.loads(source_path.read_text(encoding="utf-8"))
                if source_path.name == "countries.json":
                    payload["countries"]["britain"]["initialGoods"] = ["unknown_goods"]
                (config_dir / source_path.name).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

            with self.assertRaises(BalanceConfigError):
                get_balance_config(config_dir)

    def test_invalid_tech_chain_duplicate_id_fails_validation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            config_dir = Path(temp_dir) / "balance"
            config_dir.mkdir(parents=True, exist_ok=True)
            source_dir = ROOT / "config" / "balance"
            for source_path in source_dir.glob("*.json"):
                payload = json.loads(source_path.read_text(encoding="utf-8"))
                if source_path.name == "technology.json":
                    # Duplicate a tech_id across chains to trigger validation error.
                    payload["chains"]["mechanical"]["techs"][0]["id"] = "leyden_jar"
                (config_dir / source_path.name).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

            with self.assertRaises(BalanceConfigError):
                get_balance_config(config_dir)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import create_app
from app.config import Settings


class SettingsRoutesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_path = Path(self.temp_dir.name)
        self.database_path = self.temp_path / "settings.sqlite3"
        self.config_dir = self.temp_path / "balance"
        shutil.copytree(ROOT / "config" / "balance", self.config_dir)

        settings = Settings(
            app_env="test",
            secret_key="test-secret",
            host="127.0.0.1",
            port=5000,
            database_path=str(self.database_path),
            frontend_dist=str(self.temp_path / "frontend-dist"),
            socketio_async_mode="threading",
            cors_allowed_origins=["http://localhost:5173"],
            debug=False,
            balance_config_dir=str(self.config_dir),
        )
        self.app = create_app(settings)
        self.client = self.app.test_client()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_get_settings_exposes_all_numeric_balance_json_values(self) -> None:
        response = self.client.get("/api/v1/settings")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        numeric_config = payload["data"]["numericConfig"]

        breakthrough_entry = next(
            entry
            for entry in numeric_config["technology.json"]
            if entry["path"] == ["breakthroughDieSides"]
        )
        self.assertEqual(breakthrough_entry["pathLabel"], "breakthroughDieSides")
        self.assertEqual(breakthrough_entry["label"], "科技突破骰子面数")
        self.assertEqual(breakthrough_entry["value"], 10)
        self.assertTrue(
            any(
                entry["pathLabel"] == "events[0].roundRange[0]"
                and "开始回合" in entry["label"]
                for entry in numeric_config["events.json"]
            )
        )
        self.assertTrue(
            any(
                entry["pathLabel"].endswith(".adminCost")
                for entry in numeric_config["reforms.json"]
            )
        )

    def test_post_settings_updates_numeric_values_by_json_path(self) -> None:
        response = self.client.post(
            "/api/v1/settings",
            json={
                "production": {"newFactoryCosts": {}, "upgradeCosts": {}},
                "countries": {},
                "global": {"baseIncomePerRound": 0},
                "regions": {},
                "government": {
                    "administrationCost": 10,
                    "ideologyMin": 0,
                    "ideologyMax": 10,
                    "naturalShiftRules": {},
                },
                "numericConfig": {
                    "technology.json": [
                        {"path": ["breakthroughDieSides"], "value": 12},
                        {
                            "path": ["chains", "industrialization", "techs", 0, "threshold"],
                            "value": 4,
                        },
                    ],
                    "events.json": [
                        {"path": ["events", 0, "roundRange", 1], "value": 6},
                        {"path": ["events", 0, "weight"], "value": 3},
                    ],
                },
            },
        )

        self.assertEqual(response.status_code, 200)
        technology = json.loads((self.config_dir / "technology.json").read_text(encoding="utf-8"))
        events = json.loads((self.config_dir / "events.json").read_text(encoding="utf-8"))

        self.assertEqual(technology["breakthroughDieSides"], 12)
        self.assertEqual(technology["chains"]["industrialization"]["techs"][0]["threshold"], 4)
        self.assertEqual(events["events"][0]["roundRange"][1], 6)
        self.assertEqual(events["events"][0]["weight"], 3)

    def test_post_settings_rejects_fraction_for_integer_json_target(self) -> None:
        response = self.client.post(
            "/api/v1/settings",
            json={
                "production": {"newFactoryCosts": {}, "upgradeCosts": {}},
                "countries": {},
                "global": {"baseIncomePerRound": 0},
                "regions": {},
                "government": {
                    "administrationCost": 10,
                    "ideologyMin": 0,
                    "ideologyMax": 10,
                    "naturalShiftRules": {},
                },
                "numericConfig": {
                    "technology.json": [
                        {"path": ["breakthroughDieSides"], "value": 12.5},
                    ],
                },
            },
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertFalse(payload["ok"])


if __name__ == "__main__":
    unittest.main()

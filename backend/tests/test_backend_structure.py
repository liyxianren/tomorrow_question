from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class BackendStructureTests(unittest.TestCase):
    def test_run_entry_exists(self) -> None:
        self.assertTrue((ROOT / "run.py").exists())

    def test_required_modules_exist(self) -> None:
        required_modules = {
            "room",
            "session",
            "game_state",
            "rules",
            "settlement",
            "realtime",
            "persistence",
        }

        module_root = ROOT / "app" / "modules"
        actual_modules = {path.name for path in module_root.iterdir() if path.is_dir()}
        self.assertTrue(required_modules.issubset(actual_modules))

    def test_rules_module_only_exposes_active_phase_files(self) -> None:
        rules_root = ROOT / "app" / "modules" / "rules"
        actual_files = {path.name for path in rules_root.iterdir() if path.is_file()}

        self.assertEqual(
            actual_files,
            {
                "__init__.py",
                "common.py",
                "decision.py",
                "market.py",
                "phase1_economy.py",
                "route_utils.py",
                "settlement.py",
            },
        )


if __name__ == "__main__":
    unittest.main()

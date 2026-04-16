import { spawnSync } from "node:child_process";
import path from "node:path";

function resolveBackendDatabasePath(): string {
  return process.env.E2E_BACKEND_DB_PATH
    ?? process.env.PLAYWRIGHT_BACKEND_DB_PATH
    ?? path.resolve(process.cwd(), "..", "data", "tomorrow_question.sqlite3");
}

function resolvePythonCommand(): string {
  return process.env.E2E_PYTHON_BIN ?? "python";
}

export async function expireActivePhaseDeadline(gameId: string): Promise<void> {
  const dbPath = resolveBackendDatabasePath();
  const result = spawnSync(
    resolvePythonCommand(),
    [
      "-c",
      [
        "import json, sqlite3, sys",
        "from datetime import UTC, datetime, timedelta",
        "db_path, game_id = sys.argv[1:3]",
        "conn = sqlite3.connect(db_path)",
        "conn.row_factory = sqlite3.Row",
        "game_row = conn.execute('SELECT active_snapshot_id FROM games WHERE game_id = ?', (game_id,)).fetchone()",
        "assert game_row is not None, f'game {game_id} not found'",
        "snapshot_id = game_row['active_snapshot_id']",
        "snapshot_row = conn.execute('SELECT payload_json FROM snapshots WHERE snapshot_id = ?', (snapshot_id,)).fetchone()",
        "assert snapshot_row is not None, f'snapshot {snapshot_id} not found'",
        "payload = json.loads(snapshot_row['payload_json'])",
        "expired_at = (datetime.now(UTC) - timedelta(seconds=5)).isoformat()",
        "payload['phaseDeadlineAt'] = expired_at",
        "conn.execute('UPDATE snapshots SET phase_deadline_at = ?, payload_json = ? WHERE snapshot_id = ?', (expired_at, json.dumps(payload, ensure_ascii=True, separators=(\",\", \":\"), sort_keys=True), snapshot_id))",
        "conn.commit()",
        "conn.close()",
      ].join('; '),
      dbPath,
      gameId,
    ],
    {
      cwd: path.resolve(process.cwd(), ".."),
      encoding: "utf-8",
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "failed to expire active phase deadline");
  }
}

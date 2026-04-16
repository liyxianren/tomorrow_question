MODULE_BOUNDARIES = {
    "bot": "Provide server-managed AI seat filling and per-phase auto-submission for room testing.",
    "room": "Manage room lifecycle, country selection, ready state, and start conditions.",
    "session": "Manage player identity, session recovery, and reconnect semantics.",
    "game_state": "Own the Game and GameSnapshot truth for rounds, phases, and public state.",
    "rules": "Run decision, market, and settlement calculations only.",
    "settlement": "Advance phases, resolve timeouts, generate logs, and finalize games.",
    "realtime": "Handle socket authentication, room broadcasts, and snapshot sync events.",
    "persistence": "Provide SQLite-backed room, session, game, snapshot, and log storage.",
}

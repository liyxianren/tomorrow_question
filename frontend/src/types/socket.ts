export const SOCKET_EVENT_NAMES = {
  roomUpdated: "room.updated",
  gameStarted: "game.started",
  gamePhaseStarted: "game.phase_started",
  gamePhaseTimer: "game.phase_timer",
  gamePhaseSettled: "game.phase_settled",
  gameFinished: "game.finished",
  gameSnapshotSync: "game.snapshot_sync",
} as const;

export type SocketEventName =
  (typeof SOCKET_EVENT_NAMES)[keyof typeof SOCKET_EVENT_NAMES];

export interface SocketEnvelope<TPayload = Record<string, unknown>> {
  roomCode: string;
  gameId?: string | null;
  serverTime: string;
  payload: TPayload;
}

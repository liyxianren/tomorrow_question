import type {
  GameContext,
  GameLog,
  GameSnapshot,
  FinalResultResponse,
  PhaseSettlementWorkspace,
  PlayerSession,
  PlayerTurnInput,
  PlayerSubmissionStatus,
  RankingWorkspace,
  RoomContext,
} from "../../../types";


export type FrontendSocketState = "idle" | "connecting" | "connected" | "disconnected";

export interface GamePhaseStartedPayload {
  game: GameContext;
  snapshot: GameSnapshot;
  submissionStatusByPlayerId: Record<string, PlayerSubmissionStatus>;
}

export interface GamePhaseSettledPayload {
  game: GameContext;
  snapshot: GameSnapshot;
  logs: GameLog[];
  autoSubmittedPlayerIds: string[];
  rankingWorkspace: RankingWorkspace;
  lastSettlementWorkspace: PhaseSettlementWorkspace;
}

export interface GameFinishedPayload extends FinalResultResponse {}

export interface GameSnapshotSyncPayload {
  room: RoomContext;
  game: GameContext;
  snapshot: GameSnapshot;
}

export interface GameRuntimeState {
  room: RoomContext | null;
  game: GameContext | null;
  snapshot: GameSnapshot | null;
  session: PlayerSession | null;
  recoveredTurnInputs: PlayerTurnInput[];
  recoveredLogs: GameLog[];
  socketState: FrontendSocketState;
  secondsRemaining: number | null;
  submissionStatusByPlayerId: Record<string, PlayerSubmissionStatus>;
  latestSettlement: GamePhaseSettledPayload | null;
  finalResult: GameFinishedPayload | null;
  hasRecoveredFromServer: boolean;
  isCurrentPlayerSubmitted: boolean;
  canSubmitCurrentPhase: boolean;
}

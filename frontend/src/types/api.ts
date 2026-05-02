import type {
  GameContext,
  GameLog,
  GameSnapshot,
  PlayerSession,
  PlayerTurnInput,
  RoomContext,
  RoomStatus,
} from "./domain";

export type ApiErrorCode =
  | "INVALID_SESSION"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_ALREADY_IN_GAME"
  | "ROOM_ACTION_FORBIDDEN"
  | "COUNTRY_TAKEN"
  | "NOT_ROOM_MEMBER"
  | "NOT_READYABLE"
  | "GAME_NOT_FOUND"
  | "PHASE_MISMATCH"
  | "DEADLINE_PASSED"
  | "ALREADY_SUBMITTED"
  | "INVALID_SUBMISSION"
  | "RECOVERY_NOT_AVAILABLE";

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface RoomContextResponse {
  room: RoomContext;
  activeGame?: GameContext | null;
  activeSnapshot?: GameSnapshot | null;
}

export interface SessionContextResponse extends RoomContextResponse {
  session: PlayerSession;
  activeTurnInputs?: PlayerTurnInput[];
  gameLogs?: GameLog[];
}

export interface FinalRankingTieBreakResponse {
  productionCapacity: number;
  controlledRegions: number;
  budgetPoolsTotal: number;
}

export interface FinalRankingEntryResponse {
  rank: number;
  playerId: string;
  country: string | null;
  nickname: string;
  totalIncome: number;
  cumulativeNationalIncome?: number;
  tieBreak: FinalRankingTieBreakResponse;
}

export interface FinalResultTurningPointCardResponse {
  title: string;
  detail: string;
}

export interface FinalResultResponse {
  game: GameContext;
  snapshot: GameSnapshot;
  finalRanking: FinalRankingEntryResponse[];
  finalLogs: GameLog[];
  whyRankChanged?: string[];
  turningPointCards?: FinalResultTurningPointCardResponse[];
  replayGuidance?: string[];
}

export interface WaitingRoomSummaryResponse {
  roomCode: string;
  hostNickname: string;
  memberCount: number;
  maxPlayers: number;
  status: RoomStatus;
  readyCount: number;
  selectedCountriesCount: number;
  hasActiveGame: boolean;
}

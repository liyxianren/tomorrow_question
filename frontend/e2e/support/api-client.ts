import type {
  FinalResultResponse,
  GameContext,
  GameLog,
  GamePhase,
  GameSnapshot,
  PlayerSession,
  PlayerTurnInput,
  RoomContext,
} from "../../src/types";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiFailure = {
  ok: false;
  error?: {
    code?: string;
    message?: string;
  };
};

type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  sessionId?: string | null;
};

export type SessionContextResponse = {
  session: PlayerSession;
  room: RoomContext;
  activeGame?: GameContext | null;
  activeSnapshot?: GameSnapshot | null;
  activeTurnInputs?: PlayerTurnInput[];
  gameLogs?: GameLog[];
};

export type RoomContextResponse = {
  room: RoomContext;
  activeGame?: GameContext | null;
  activeSnapshot?: GameSnapshot | null;
};

export class E2eApiError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "E2eApiError";
    this.status = status;
    this.code = code;
  }
}

export function resolveApiBaseUrl(): string {
  return process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:5000";
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers();

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (options.sessionId) {
    headers.set("X-Session-Id", options.sessionId);
  }

  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.ok) {
    const message = payload.ok ? `Request failed with status ${response.status}` : payload.error?.message ?? "Request failed";
    const code = payload.ok ? undefined : payload.error?.code;
    throw new E2eApiError(message, response.status, code);
  }

  return payload.data;
}

export function createRoom(nickname: string): Promise<SessionContextResponse> {
  return request<SessionContextResponse>("/api/v1/rooms", {
    method: "POST",
    body: { nickname },
  });
}

export function joinRoom(roomCode: string, nickname: string): Promise<SessionContextResponse> {
  return request<SessionContextResponse>("/api/v1/rooms/join", {
    method: "POST",
    body: {
      roomCode,
      nickname,
    },
  });
}

export function restoreSession(sessionId: string): Promise<SessionContextResponse> {
  return request<SessionContextResponse>("/api/v1/sessions/restore", {
    method: "POST",
    sessionId,
  });
}

export function getRoomContext(roomCode: string, sessionId: string): Promise<RoomContextResponse> {
  return request<RoomContextResponse>(`/api/v1/rooms/${roomCode}/context`, {
    method: "GET",
    sessionId,
  });
}

export function selectCountry(roomCode: string, sessionId: string, selectedCountry: string): Promise<unknown> {
  return request(`/api/v1/rooms/${roomCode}/country`, {
    method: "POST",
    sessionId,
    body: { selectedCountry },
  });
}

export function setReady(roomCode: string, sessionId: string, isReady: boolean): Promise<unknown> {
  return request(`/api/v1/rooms/${roomCode}/ready`, {
    method: "POST",
    sessionId,
    body: { isReady },
  });
}

export function submitPhase(
  gameId: string,
  phase: GamePhase,
  sessionId: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  return request(`/api/v1/games/${gameId}/phases/${phase}/submit`, {
    method: "POST",
    sessionId,
    body: {
      payload,
    },
  });
}

export function getFinalResult(gameId: string, sessionId: string): Promise<FinalResultResponse> {
  return request<FinalResultResponse>(`/api/v1/games/${gameId}/final-result`, {
    method: "GET",
    sessionId,
  });
}

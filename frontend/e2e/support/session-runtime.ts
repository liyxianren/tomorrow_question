import {
  type ApiResponse,
  type BackgroundPlayer,
  type BackgroundPlayerSeed,
  type CountryCode,
  type SessionContextResponse,
  getApiBaseUrl,
} from "./types";


type RequestOptions = {
  method?: string;
  body?: unknown;
  sessionId?: string | null;
};

async function requestJson<T>(
  path: string,
  { method = "GET", body, sessionId = null }: RequestOptions = {},
): Promise<T> {
  const headers = new Headers({
    Accept: "application/json",
  });

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (sessionId) {
    headers.set("X-Session-Id", sessionId);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !payload.ok) {
    const errorMessage = payload.ok ? `HTTP ${response.status}` : payload.error.message;
    throw new Error(`backend request failed path=${path} detail=${errorMessage}`);
  }

  return payload.data;
}

async function joinRoomAsBackgroundPlayer(
  roomCode: string,
  seed: BackgroundPlayerSeed,
): Promise<BackgroundPlayer> {
  const joined = await requestJson<SessionContextResponse>("/api/v1/rooms/join", {
    method: "POST",
    body: {
      nickname: seed.nickname,
      roomCode,
    },
    sessionId: null,
  });
  await waitForBackgroundMembership(joined.session.sessionId, roomCode);

  return {
    nickname: seed.nickname,
    country: seed.country,
    playerId: joined.session.playerId,
    sessionId: joined.session.sessionId,
  };
}

async function waitForBackgroundMembership(sessionId: string, roomCode: string): Promise<void> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const restored = await requestJson<SessionContextResponse>("/api/v1/sessions/restore", {
      method: "POST",
      sessionId,
    });

    if (restored.room.roomCode === roomCode) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`background player failed to restore into room=${roomCode}`);
}

async function waitForBackgroundCountry(sessionId: string, expectedCountry: CountryCode): Promise<void> {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const restored = await requestJson<{ session: { selectedCountry?: string | null } }>("/api/v1/sessions/restore", {
      method: "POST",
      sessionId,
    });

    if (restored.session.selectedCountry === expectedCountry) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`background player failed to select country=${expectedCountry}`);
}

export async function createBackgroundPlayers(
  roomCode: string,
  seeds: BackgroundPlayerSeed[],
): Promise<BackgroundPlayer[]> {
  const players: BackgroundPlayer[] = [];

  for (const seed of seeds) {
    players.push(await joinRoomAsBackgroundPlayer(roomCode, seed));
  }

  return players;
}

export async function selectPlayerCountry(
  player: Pick<BackgroundPlayer, "sessionId">,
  roomCode: string,
  country: CountryCode,
): Promise<void> {
  await requestJson<unknown>(`/api/v1/rooms/${roomCode}/country`, {
    method: "POST",
    sessionId: player.sessionId,
    body: {
      selectedCountry: country,
    },
  });
  await waitForBackgroundCountry(player.sessionId, country);
}

export async function markPlayerReady(
  player: Pick<BackgroundPlayer, "sessionId">,
  roomCode: string,
  isReady: boolean,
): Promise<void> {
  await requestJson<unknown>(`/api/v1/rooms/${roomCode}/ready`, {
    method: "POST",
    sessionId: player.sessionId,
    body: {
      isReady,
    },
  });
}

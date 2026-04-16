import type { GameContext, GamePhase, GameSnapshot } from "../../src/types";
import {
  createRoom,
  getRoomContext,
  joinRoom,
  resolveApiBaseUrl,
  restoreSession,
  selectCountry,
  setReady,
  submitPhase,
} from "./api-client";

const SESSION_STORAGE_KEY = "tomorrow-question.session-id";
const COUNTRY_ORDER = ["britain", "france", "prussia", "austria", "russia"] as const;

type CountryCode = (typeof COUNTRY_ORDER)[number];

export type PreparedPlayer = {
  nickname: string;
  sessionId: string;
  playerId: string;
  country: CountryCode;
};

export type PreparedGameContext = {
  apiBaseUrl: string;
  frontendBaseUrl: string;
  roomCode: string;
  primaryPlayer: PreparedPlayer;
  helperPlayers: PreparedPlayer[];
  allPlayers: PreparedPlayer[];
  gameId: string;
  phase: GamePhase;
  round: number;
};

type RuntimeSnapshot = {
  roomCode: string;
  game: GameContext;
  snapshot: GameSnapshot;
};

function resolveFrontendBaseUrl(): string {
  return process.env.E2E_FRONTEND_BASE_URL ?? "http://127.0.0.1:5173";
}

function createNickname(country: CountryCode): string {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  return `e2e-${country}-${suffix}`;
}

function createSubmissionPayload(phase: GamePhase): Record<string, unknown> {
  if (phase === "decision") {
    return {
      factoryPlan: {
        productionOrders: [],
        expansionOrders: [],
        upgradeOrders: [],
        newFactoryOrders: [],
      },
      domesticMarketPlan: {
        domesticMarketActions: [],
      },
      governmentPlan: {
        pointPurchases: [],
        strategySelections: [],
      },
    };
  }

  if (phase === "market") {
    return {
      saleOrders: [],
    };
  }

  throw new Error(`Phase ${phase} does not accept player submissions.`);
}

async function pollUntil<T>(
  load: () => Promise<T | null>,
  predicate: (value: T) => boolean,
  options: { timeoutMs?: number; intervalMs?: number; message: string },
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const intervalMs = options.intervalMs ?? 250;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await load();
    if (value && predicate(value)) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(options.message);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getRuntimeSnapshot(sessionId: string, roomCode: string): Promise<RuntimeSnapshot | null> {
  const restored = await restoreSession(sessionId);
  const game = restored.activeGame ?? null;
  const snapshot = restored.activeSnapshot ?? null;

  if (game && snapshot) {
    return {
      roomCode: restored.room.roomCode,
      game,
      snapshot,
    };
  }

  const context = await getRoomContext(roomCode, sessionId);
  if (!context.activeGame || !context.activeSnapshot) {
    return null;
  }

  return {
    roomCode: context.room.roomCode,
    game: context.activeGame,
    snapshot: context.activeSnapshot,
  };
}

async function waitForGameStart(primarySessionId: string, roomCode: string): Promise<RuntimeSnapshot> {
  return pollUntil(
    () => getRuntimeSnapshot(primarySessionId, roomCode),
    (runtime) => Boolean(runtime.game.gameId && runtime.snapshot.snapshotId),
    {
      message: "Timed out waiting for game start after all players became ready.",
    },
  );
}

async function waitForPhaseAdvance(
  sessionId: string,
  roomCode: string,
  previousSnapshotId: string,
  previousRound: number,
  previousPhase: GamePhase,
): Promise<RuntimeSnapshot> {
  return pollUntil(
    () => getRuntimeSnapshot(sessionId, roomCode),
    (runtime) =>
      runtime.game.isFinished ||
      runtime.snapshot.snapshotId !== previousSnapshotId ||
      runtime.snapshot.round !== previousRound ||
      runtime.snapshot.phase !== previousPhase,
    {
      message: `Timed out waiting for phase advance from ${previousPhase}.`,
    },
  );
}

async function waitForPlayerCountry(sessionId: string, country: CountryCode): Promise<void> {
  await pollUntil(
    async () => {
      const restored = await restoreSession(sessionId);
      return restored.session.selectedCountry === country ? restored : null;
    },
    () => true,
    {
      message: `Timed out waiting for session country ${country} to become visible before ready.`,
    },
  );
}

export async function prepareStartedGame(): Promise<PreparedGameContext> {
  const [primaryCountry, ...helperCountries] = COUNTRY_ORDER;
  const primaryResponse = await createRoom(createNickname(primaryCountry));
  const primaryPlayer: PreparedPlayer = {
    nickname: primaryResponse.session.nickname,
    sessionId: primaryResponse.session.sessionId,
    playerId: primaryResponse.session.playerId,
    country: primaryCountry,
  };

  const helperPlayers: PreparedPlayer[] = [];
  for (const country of helperCountries) {
    const response = await joinRoom(primaryResponse.room.roomCode, createNickname(country));
    helperPlayers.push({
      nickname: response.session.nickname,
      sessionId: response.session.sessionId,
      playerId: response.session.playerId,
      country,
    });
  }

  const allPlayers = [primaryPlayer, ...helperPlayers];

  for (const player of allPlayers) {
    await selectCountry(primaryResponse.room.roomCode, player.sessionId, player.country);
    await waitForPlayerCountry(player.sessionId, player.country);
  }

  for (const player of allPlayers) {
    await setReady(primaryResponse.room.roomCode, player.sessionId, true);
  }

  const runtime = await waitForGameStart(primaryPlayer.sessionId, primaryResponse.room.roomCode);

  return {
    apiBaseUrl: resolveApiBaseUrl(),
    frontendBaseUrl: resolveFrontendBaseUrl(),
    roomCode: primaryResponse.room.roomCode,
    primaryPlayer,
    helperPlayers,
    allPlayers,
    gameId: runtime.game.gameId,
    phase: runtime.snapshot.phase,
    round: runtime.snapshot.round,
  };
}

export async function submitCurrentPhaseForHelperPlayers(context: PreparedGameContext): Promise<RuntimeSnapshot> {
  const runtime = await getRuntimeSnapshot(context.primaryPlayer.sessionId, context.roomCode);
  if (!runtime) {
    throw new Error("Game runtime is not available when submitting helper players.");
  }

  if (runtime.snapshot.phase !== "settlement") {
    await Promise.all(
      context.helperPlayers.map((player) =>
        submitPhase(
          runtime.game.gameId,
          runtime.snapshot.phase,
          player.sessionId,
          createSubmissionPayload(runtime.snapshot.phase),
        ),
      ),
    );
  }

  const advanced = await waitForPhaseAdvance(
    context.primaryPlayer.sessionId,
    context.roomCode,
    runtime.snapshot.snapshotId,
    runtime.snapshot.round,
    runtime.snapshot.phase,
  );

  context.gameId = advanced.game.gameId;
  context.phase = advanced.snapshot.phase;
  context.round = advanced.snapshot.round;

  return advanced;
}

export async function driveGameToFinished(context: PreparedGameContext): Promise<void> {
  const initialRuntime = await getRuntimeSnapshot(context.primaryPlayer.sessionId, context.roomCode);
  if (!initialRuntime) {
    throw new Error("Game runtime is not available before driveGameToFinished.");
  }
  let runtime: RuntimeSnapshot = initialRuntime;

  for (let step = 0; step < 80; step += 1) {
    if (runtime.game.isFinished) {
      context.phase = runtime.snapshot.phase;
      context.round = runtime.snapshot.round;
      return;
    }

    if (runtime.snapshot.phase !== "settlement") {
      await Promise.all(
        context.allPlayers.map((player) =>
          submitPhase(
            runtime.game.gameId,
            runtime.snapshot.phase,
            player.sessionId,
            createSubmissionPayload(runtime.snapshot.phase),
          ),
        ),
      );
    }

    runtime = await waitForPhaseAdvance(
      context.primaryPlayer.sessionId,
      context.roomCode,
      runtime.snapshot.snapshotId,
      runtime.snapshot.round,
      runtime.snapshot.phase,
    );
    await sleep(100);

    context.gameId = runtime.game.gameId;
    context.phase = runtime.snapshot.phase;
    context.round = runtime.snapshot.round;

    if (runtime.game.isFinished) {
      return;
    }
  }

  throw new Error("Timed out driving the game to finished within 80 phase submissions.");
}

export { SESSION_STORAGE_KEY };

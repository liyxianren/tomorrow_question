import i18n from "../../../i18n";
import { ApiRequestError } from "../../../services/http";
import type { GameContext, GameSnapshot, PlayerSession, RoomContext, RoomMember } from "../../../types";


export type PendingRoomAction = "country" | "ready" | "fillBots" | "removeBot" | null;
export type RoomFlowTone = "neutral" | "success" | "error";
export type RoomSocketState = "idle" | "connecting" | "connected" | "disconnected";

export type RoomFlowMessage = {
  tone: RoomFlowTone;
  text: string;
};

export type RoomFlowStatus = {
  message: RoomFlowMessage;
};

type RoomFlowStepId =
  | "enter_room"
  | "identify_player"
  | "select_country"
  | "ready"
  | "wait_for_others"
  | "start_game";

export function formatRequestError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.code ? `${error.message} (${error.code})` : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return i18n.t("room:errors.genericError");
}

export function createFallbackRoom(roomCode: string): RoomContext {
  return {
    roomCode,
    status: "waiting",
    hostPlayerId: "",
    memberPlayerIds: [],
    members: [],
    countrySlots: {
      britain: null,
      france: null,
      prussia: null,
      austria: null,
      russia: null,
    },
    currentGameId: null,
    lastActivityAt: null,
  };
}

export function isRoomPayload(value: unknown): value is RoomContext {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RoomContext>;
  return typeof candidate.roomCode === "string" && Array.isArray(candidate.members);
}

export function isGamePayload(value: unknown): value is GameContext {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GameContext>;
  return typeof candidate.gameId === "string" && typeof candidate.roomCode === "string";
}

export function isSnapshotPayload(value: unknown): value is GameSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GameSnapshot>;
  return typeof candidate.snapshotId === "string" && typeof candidate.gameId === "string";
}

export function getCurrentMember(room: RoomContext, session: PlayerSession | null): RoomMember | null {
  if (!session?.playerId) {
    return null;
  }

  return room.members.find((member) => member.playerId === session.playerId) ?? null;
}

function getCurrentStepId({
  room,
  currentMember,
  isLoadingContext,
  loadError,
  activeGame,
}: {
  room: RoomContext;
  currentMember: RoomMember | null;
  isLoadingContext: boolean;
  loadError: string | null;
  activeGame: GameContext | null;
}): RoomFlowStepId {
  if (isLoadingContext || !room.roomCode) {
    return "enter_room";
  }

  if (loadError) {
    return "enter_room";
  }

  if (activeGame?.gameId || room.currentGameId) {
    return "start_game";
  }

  if (!currentMember) {
    return "identify_player";
  }

  if (!currentMember.selectedCountry) {
    return "select_country";
  }

  if (!currentMember.isReady) {
    return "ready";
  }

  const everyoneReady = room.members.length === 5 && room.members.every((member) => member.isReady && member.selectedCountry);

  if (everyoneReady) {
    return "start_game";
  }

  return "wait_for_others";
}

function getDefaultMessage({
  currentStepId,
  room,
  currentMember,
  loadError,
}: {
  currentStepId: RoomFlowStepId;
  room: RoomContext;
  currentMember: RoomMember | null;
  loadError: string | null;
}): RoomFlowMessage {
  switch (currentStepId) {
    case "enter_room":
      return {
        tone: loadError ? "error" : "neutral",
        text: loadError ?? i18n.t("common:loading"),
      };
    case "identify_player":
      return {
        tone: "neutral",
        text: i18n.t("common:loading"),
      };
    case "select_country":
      return {
        tone: "neutral",
        text: i18n.t("room:countrySelection.title"),
      };
    case "ready":
      return {
        tone: "neutral",
        text: `${i18n.t("game:country." + (currentMember?.selectedCountry ?? "britain"))} - ${i18n.t("room:actions.ready")}`,
      };
    case "wait_for_others":
      return {
        tone: "neutral",
        text: i18n.t("room:status.readying"),
      };
    case "start_game":
      return {
        tone: "success",
        text: i18n.t("room:status.in_game"),
      };
  }
}

export function resolveRoomFlowStatus({
  room,
  currentMember,
  isLoadingContext,
  loadError,
  activeGame,
  messageOverride,
}: {
  room: RoomContext;
  currentMember: RoomMember | null;
  isLoadingContext: boolean;
  loadError: string | null;
  activeGame: GameContext | null;
  messageOverride: RoomFlowMessage | null;
}): RoomFlowStatus {
  const currentStepId = getCurrentStepId({
    room,
    currentMember,
    isLoadingContext,
    loadError,
    activeGame,
  });
  return {
    message: messageOverride ?? getDefaultMessage({
      currentStepId,
      room,
      currentMember,
      loadError,
    }),
  };
}

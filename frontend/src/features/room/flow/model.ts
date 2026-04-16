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

  return "请求失败，请稍后再试。";
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
        text: loadError ?? "正在进入房间并恢复上下文。",
      };
    case "identify_player":
      return {
        tone: "neutral",
        text: "正在识别你的玩家身份，请稍候。",
      };
    case "select_country":
      return {
        tone: "neutral",
        text: "先选择你要代表的国家，然后再准备。",
      };
    case "ready":
      return {
        tone: "neutral",
        text: `已选择国家：${currentMember?.selectedCountry ?? "未选国家"}，现在可以点击准备。`,
      };
    case "wait_for_others":
      return {
        tone: "neutral",
        text: "你已准备完成，等待其他玩家准备后自动开局。",
      };
    case "start_game":
      return {
        tone: "success",
        text: "房间已开局，正在进入游戏。",
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

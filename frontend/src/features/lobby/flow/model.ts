import { ApiRequestError } from "../../../services/http";


export type LobbyPendingAction = "create" | "join" | "restore" | null;
export type LobbyFlowTone = "neutral" | "success" | "error";

export type LobbyFlowMessage = {
  tone: LobbyFlowTone;
  text: string;
};

export type LobbyStatusViewModel = {
  tone: LobbyFlowTone;
  title: string;
  description: string;
};

export function normalizeNickname(value: string): string {
  return value.trim();
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase();
}

export function formatRequestError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.code ? `${error.message} (${error.code})` : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "请求失败，请稍后再试。";
}

export function resolveLobbyStatusViewModel({
  pendingAction,
  message,
}: {
  pendingAction: LobbyPendingAction;
  message: LobbyFlowMessage | null;
}): LobbyStatusViewModel | null {
  if (pendingAction === "create") {
    return {
      tone: "neutral",
      title: "正在创建房间",
      description: "创建完成后会自动进入房间。",
    };
  }

  if (pendingAction === "join") {
    return {
      tone: "neutral",
      title: "正在加入房间",
      description: "正在核对房间码，成功后会直接带你进入房间。",
    };
  }

  if (pendingAction === "restore") {
    return {
      tone: "neutral",
      title: "正在找回上次进度",
      description: "如果上次会话仍然有效，你会直接回到原房间或原对局。",
    };
  }

  if (message) {
    return {
      tone: message.tone,
      title: message.tone === "error" ? "这次操作没有完成" : "操作已更新",
      description: message.text,
    };
  }

  return null;
}

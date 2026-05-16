import { ApiRequestError } from "../../../services/http";
import i18n from "../../../i18n";


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

  return i18n.t("common:loadFailed");
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
      title: i18n.t("lobby:statusNotice.creatingTitle"),
      description: i18n.t("lobby:statusNotice.creatingDesc"),
    };
  }

  if (pendingAction === "join") {
    return {
      tone: "neutral",
      title: i18n.t("lobby:statusNotice.joiningTitle"),
      description: i18n.t("lobby:statusNotice.joiningDesc"),
    };
  }

  if (pendingAction === "restore") {
    return {
      tone: "neutral",
      title: i18n.t("lobby:statusNotice.restoringTitle"),
      description: i18n.t("lobby:statusNotice.restoringDesc"),
    };
  }

  if (message) {
    return {
      tone: message.tone,
      title: message.tone === "error" ? i18n.t("lobby:statusNotice.errorTitle") : i18n.t("lobby:statusNotice.successTitle"),
      description: message.text,
    };
  }

  return null;
}

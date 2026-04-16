import { resolveSessionRoute } from "../../../app/sessionRecovery";
import type { RoomContextResponse, SessionContextResponse, WaitingRoomSummaryResponse } from "../../../types";
import type { LocalProfile } from "./identityStorage";


export type CurrentIdentityCardViewModel = {
  displayName: string;
  helperText: string;
  profileIdLabel: string;
  profileIdValue: string;
  actionLabel: string;
};

export type RecoverableSessionViewModel = {
  profileDisplayName: string;
  profileIdValue: string;
  description: string;
  sessionStateLabel: string;
  sessionStateValue: string;
  restoreLabel: string;
  clearLabel: string;
  canRestore: boolean;
};

export type RecentRoomCardViewModel = {
  roomCode: string;
  statusLabel: string;
  memberCountLabel: string;
  detail: string;
  targetLabel: string;
  targetPath: string | null;
  isUnavailable: boolean;
};

export type WaitingRoomCardViewModel = {
  roomCode: string;
  hostLabel: string;
  memberCountLabel: string;
  readyCountLabel: string;
  selectedCountriesLabel: string;
  joinLabel: string;
};

export type LobbyPrimaryActionViewModel = {
  createDescription: string;
  createTitle: string;
  joinDescription: string;
  joinTitle: string;
};

export type InviteEntryViewModel = {
  description: string;
  isInviteEntry: boolean;
  joinButtonLabel: string;
  roomCode: string;
};

export type RecoverableGameBannerViewModel = {
  title: string;
  description: string;
  actionLabel: string;
  targetPath: string;
};

function maskSessionId(sessionId: string): string {
  if (sessionId.length <= 12) {
    return sessionId;
  }

  return `${sessionId.slice(0, 6)}...${sessionId.slice(-4)}`;
}

function mapRoomStatus(status: string): string {
  switch (status) {
    case "waiting":
    case "readying":
      return "等待开局";
    case "in_game":
      return "进行中";
    case "finished":
      return "已结束";
    default:
      return "状态待确认";
  }
}

export function buildCurrentIdentityCardViewModel(
  profile: LocalProfile | null,
): CurrentIdentityCardViewModel {
  if (!profile) {
    return {
      displayName: "尚未绑定显示姓名",
      helperText: "先确认显示姓名后，才能在这台设备上创建房间、加入房间或继续上次会话。",
      profileIdLabel: "本机识别号",
      profileIdValue: "确认身份后自动生成",
      actionLabel: "确认身份",
    };
  }

  return {
    displayName: profile.displayName,
    helperText: "这台设备会用这个身份创建房间、加入房间和继续上次会话。",
    profileIdLabel: "本机识别号",
    profileIdValue: profile.profileId,
    actionLabel: "更换显示姓名",
  };
}

export function buildRecoverableSessionViewModel({
  profile,
  storedSessionId,
  isBusy,
}: {
  profile: LocalProfile | null;
  storedSessionId: string | null;
  isBusy: boolean;
}): RecoverableSessionViewModel {
  return {
    profileDisplayName: profile?.displayName ?? "尚未绑定显示姓名",
    profileIdValue: profile?.profileId ?? "确认身份后自动生成",
    description: "可直接回到原房间或原对局。",
    sessionStateLabel: storedSessionId ? "已保存的进度" : "当前状态",
    sessionStateValue: storedSessionId
      ? `这台设备还记得上次会话：${maskSessionId(storedSessionId)}`
      : "当前没有可以继续的上次会话。",
    restoreLabel: isBusy ? "恢复中..." : "恢复上次会话",
    clearLabel: "清除会话记录",
    canRestore: Boolean(storedSessionId),
  };
}

export function buildWaitingRoomCardViewModel(
  room: WaitingRoomSummaryResponse,
): WaitingRoomCardViewModel {
  return {
    roomCode: room.roomCode,
    hostLabel: `房主 ${room.hostNickname}`,
    memberCountLabel: `${room.memberCount} / ${room.maxPlayers} 人`,
    readyCountLabel: `${room.readyCount} 人已准备开局`,
    selectedCountriesLabel: `已选 ${room.selectedCountriesCount} 个国家`,
    joinLabel: `加入 ${room.roomCode}`,
  };
}

export function buildLobbyPrimaryActionViewModel(): LobbyPrimaryActionViewModel {
  return {
    createDescription: "你来当房主。创建后把房间码发给其他玩家，所有人准备完成后会自动开局。",
    createTitle: "创建新房间",
    joinDescription: "如果朋友已经建好房间，你只需要输入房间码就能直接进入房间。",
    joinTitle: "输入房间码加入",
  };
}

export function buildInviteEntryViewModel(roomCode: string, isInviteEntry: boolean): InviteEntryViewModel | null {
  if (!roomCode) {
    return null;
  }

  return {
    description: isInviteEntry
      ? `好友已经把房间码带给你了，确认身份后就能直接加入 ${roomCode}。`
      : `房间码 ${roomCode} 已经替你填好，确认身份后就能直接加入。`,
    isInviteEntry,
    joinButtonLabel: `加入 ${roomCode}`,
    roomCode,
  };
}

export function buildRecoverableGameBannerViewModel(
  response: SessionContextResponse,
): RecoverableGameBannerViewModel {
  const target = resolveSessionRoute(response);
  const actionLabel = response.activeGame?.gameId
    ? response.activeGame.isFinished
      ? "查看结算"
      : "回到对局"
    : `回到房间 ${response.room.roomCode}`;

  return {
    title: "继续上次进度",
    description: "已为你找回上次离开的进度，可以直接回到原来的房间或对局。",
    actionLabel,
    targetPath: target.path,
  };
}

export function buildUnavailableRecentRoomCard(roomCode: string): RecentRoomCardViewModel {
  return {
    roomCode,
    statusLabel: "暂时无法读取",
    memberCountLabel: "人数信息不可用",
    detail: "这个入口暂时不可用，你仍可以通过房间码重新加入。",
    targetLabel: "稍后再试",
    targetPath: null,
    isUnavailable: true,
  };
}

export function buildRecentRoomCard(context: RoomContextResponse): RecentRoomCardViewModel {
  const hasActiveGame = Boolean(context.activeGame?.gameId);
  const target = hasActiveGame ? resolveSessionRoute(context as SessionContextResponse) : null;

  return {
    roomCode: context.room.roomCode,
    statusLabel: mapRoomStatus(context.room.status),
    memberCountLabel: `${context.room.members.length} / 5 位玩家`,
    detail: hasActiveGame ? "上次离开时，这个房间已经进入对局或完成结算。" : "你可以回到房间继续准备或等待开局。",
    targetLabel: hasActiveGame
      ? context.activeGame?.isFinished
        ? "查看结算"
        : "回到对局"
      : "进入房间",
    targetPath: hasActiveGame ? target?.path ?? null : `/room/${context.room.roomCode}`,
    isUnavailable: false,
  };
}

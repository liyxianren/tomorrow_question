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
  availableSeatLabel: string;
  readyCountLabel: string;
  selectedCountriesLabel: string;
  statusLabel: string;
  activityLabel: string;
  occupancyPercent: number;
  memberPreview: string[];
  joinLabel: string;
  isJoinable: boolean;
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

const COUNTRY_LABEL_BY_CODE: Record<string, string> = {
  britain: "英国",
  france: "法国",
  prussia: "普鲁士",
  austria: "奥地利",
  russia: "俄国",
};

export function buildCurrentIdentityCardViewModel(
  profile: LocalProfile | null,
): CurrentIdentityCardViewModel {
  if (!profile) {
    return {
      displayName: "尚未设置昵称",
      helperText: "设置昵称后，才能在这台设备上创建或加入房间。",
      profileIdLabel: "本机识别号",
      profileIdValue: "保存昵称后自动生成",
      actionLabel: "设置昵称",
    };
  }

  return {
    displayName: profile.displayName,
    helperText: "创建房间和加入房间时会使用这个昵称。",
    profileIdLabel: "本机识别号",
    profileIdValue: profile.profileId,
    actionLabel: "修改昵称",
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
    description: "可回到之前离开的房间或对局。",
    sessionStateLabel: storedSessionId ? "保存的进度" : "当前状态",
    sessionStateValue: storedSessionId
      ? `这台设备保存了进度：${maskSessionId(storedSessionId)}`
      : "当前没有可恢复的进度。",
    restoreLabel: isBusy ? "恢复中..." : "恢复进度",
    clearLabel: "清除记录",
    canRestore: Boolean(storedSessionId),
  };
}

export function buildWaitingRoomCardViewModel(
  room: WaitingRoomSummaryResponse,
): WaitingRoomCardViewModel {
  const maxPlayers = Math.max(room.maxPlayers || 5, 1);
  const memberCount = Math.max(room.memberCount || room.members?.length || 0, 0);
  const availableSeatCount = Math.max(room.availableSeatCount ?? maxPlayers - memberCount, 0);
  const readyCount = Math.max(room.readyCount || 0, 0);
  const selectedCountriesCount = Math.max(room.selectedCountriesCount || 0, 0);
  const memberPreview = (room.members ?? [])
    .slice(0, maxPlayers)
    .map((member) => {
      const countryLabel = member.selectedCountry ? COUNTRY_LABEL_BY_CODE[member.selectedCountry] : null;
      return countryLabel ? `${member.nickname} · ${countryLabel}` : member.nickname;
    })
    .filter(Boolean);
  const isJoinable = room.isJoinable ?? (availableSeatCount > 0 && !room.hasActiveGame);

  return {
    roomCode: room.roomCode,
    hostLabel: `房主 ${room.hostNickname || "未显示"}`,
    memberCountLabel: `${memberCount} / ${maxPlayers} 人`,
    availableSeatLabel: `${availableSeatCount} 个空位`,
    readyCountLabel: `准备 ${readyCount} / ${memberCount}`,
    selectedCountriesLabel: `已选 ${selectedCountriesCount} / ${maxPlayers} 个国家`,
    statusLabel: isJoinable ? "可直接加入" : "暂不可加入",
    activityLabel: room.lastActivityAt ? "最近有活动" : "等待刷新",
    occupancyPercent: Math.min(100, Math.round((memberCount / maxPlayers) * 100)),
    memberPreview: memberPreview.length > 0 ? memberPreview : [room.hostNickname || "等待房主信息"],
    joinLabel: `加入 ${room.roomCode}`,
    isJoinable,
  };
}

export function buildLobbyPrimaryActionViewModel(): LobbyPrimaryActionViewModel {
  return {
    createDescription: "当前没有合适房间时，你可以直接创建一局，再邀请其他玩家加入。",
    createTitle: "创建新房间",
    joinDescription: "如果朋友发来了房间码，可以在这里输入并加入私密房间。",
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
    title: "可恢复的进度",
    description: "已找到之前离开的房间或对局。",
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

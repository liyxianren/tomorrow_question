import { resolveSessionRoute } from "../../../app/sessionRecovery";
import type { RoomContextResponse, SessionContextResponse, WaitingRoomSummaryResponse } from "../../../types";
import i18n from "../../../i18n";
import { getCountryLabel } from "../../game/panelGlossary";
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
      return i18n.t("lobby:recentRoomCard.statusWaiting");
    case "in_game":
      return i18n.t("lobby:recentRoomCard.statusInGame");
    case "finished":
      return i18n.t("lobby:recentRoomCard.statusFinished");
    default:
      return i18n.t("lobby:recentRoomCard.statusUnknown");
  }
}

/** Country labels are resolved via i18n:game namespace — use getCountryLabel(). */

export function buildCurrentIdentityCardViewModel(
  profile: LocalProfile | null,
): CurrentIdentityCardViewModel {
  if (!profile) {
    return {
      displayName: i18n.t("lobby:identityCard.noProfileDisplayName"),
      helperText: i18n.t("lobby:identityCard.noProfileHelperText"),
      profileIdLabel: i18n.t("lobby:identityCard.profileIdLabel"),
      profileIdValue: i18n.t("lobby:identityCard.noProfileIdValue"),
      actionLabel: i18n.t("lobby:identityCard.actionSet"),
    };
  }

  return {
    displayName: profile.displayName,
    helperText: i18n.t("lobby:identityCard.hasProfileHelperText"),
    profileIdLabel: i18n.t("lobby:identityCard.profileIdLabel"),
    profileIdValue: profile.profileId,
    actionLabel: i18n.t("lobby:identityCard.actionChange"),
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
  const sessionStateLabel = i18n.t("lobby:identityCard.sessionStateLabel");

  return {
    profileDisplayName: profile?.displayName ?? i18n.t("lobby:identityCard.notBoundName"),
    profileIdValue: profile?.profileId ?? i18n.t("lobby:identityCard.notBoundIdValue"),
    description: i18n.t("lobby:identityCard.description"),
    sessionStateLabel,
    sessionStateValue: storedSessionId
      ? i18n.t("lobby:identityCard.hasProgressPrefix") + maskSessionId(storedSessionId)
      : i18n.t("lobby:identityCard.noProgress"),
    restoreLabel: isBusy ? i18n.t("lobby:identityCard.restoringLabel") : i18n.t("lobby:identityCard.restoreLabel"),
    clearLabel: i18n.t("lobby:identityCard.clearLabel"),
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
      const countryLabel = member.selectedCountry ? getCountryLabel(member.selectedCountry) : null;
      return countryLabel ? `${member.nickname} · ${countryLabel}` : member.nickname;
    })
    .filter(Boolean);
  const isJoinable = room.isJoinable ?? (availableSeatCount > 0 && !room.hasActiveGame);
  const waitingHostLabel = i18n.t("lobby:roomCard.waitingHost");
  const hostName = room.hostNickname || waitingHostLabel;

  return {
    roomCode: room.roomCode,
    hostLabel: i18n.t("lobby:roomCard.hostLabel", { name: hostName }),
    memberCountLabel: i18n.t("lobby:roomCard.members", { count: memberCount, max: maxPlayers }),
    availableSeatLabel: i18n.t("lobby:roomCard.availableSeats", { count: availableSeatCount }),
    readyCountLabel: i18n.t("lobby:roomCard.readyCount", { ready: readyCount, total: memberCount }),
    selectedCountriesLabel: i18n.t("lobby:roomCard.selectedCountries", { count: selectedCountriesCount, max: maxPlayers }),
    statusLabel: isJoinable ? i18n.t("lobby:roomCard.statusJoinable") : i18n.t("lobby:roomCard.statusUnavailable"),
    activityLabel: room.lastActivityAt ? i18n.t("lobby:roomCard.activityRecent") : i18n.t("lobby:roomCard.activityWaiting"),
    occupancyPercent: Math.min(100, Math.round((memberCount / maxPlayers) * 100)),
    memberPreview: memberPreview.length > 0 ? memberPreview : [waitingHostLabel],
    joinLabel: i18n.t("lobby:roomCard.joinLabel", { code: room.roomCode }),
    isJoinable,
  };
}

export function buildLobbyPrimaryActionViewModel(): LobbyPrimaryActionViewModel {
  return {
    createDescription: i18n.t("lobby:entryForm.createDescription"),
    createTitle: i18n.t("lobby:entryForm.createTitle"),
    joinDescription: i18n.t("lobby:entryForm.joinDescription"),
    joinTitle: i18n.t("lobby:entryForm.joinTitle"),
  };
}

export function buildInviteEntryViewModel(roomCode: string, isInviteEntry: boolean): InviteEntryViewModel | null {
  if (!roomCode) {
    return null;
  }

  return {
    description: isInviteEntry
      ? i18n.t("lobby:entryForm.inviteDescriptionWithCode", { code: roomCode })
      : i18n.t("lobby:entryForm.inviteDescriptionPrefilled", { code: roomCode }),
    isInviteEntry,
    joinButtonLabel: i18n.t("lobby:entryForm.inviteJoinButton", { code: roomCode }),
    roomCode,
  };
}

export function buildRecoverableGameBannerViewModel(
  response: SessionContextResponse,
): RecoverableGameBannerViewModel {
  const target = resolveSessionRoute(response);
  const actionLabel = response.activeGame?.gameId
    ? response.activeGame.isFinished
      ? i18n.t("lobby:recentRoomCard.actionViewSettlement")
      : i18n.t("lobby:recentRoomCard.actionBackToGame")
    : i18n.t("lobby:recentRoomCard.actionEnterRoom");

  return {
    title: i18n.t("lobby:continueBanner.title"),
    description: i18n.t("lobby:continueBanner.description"),
    actionLabel,
    targetPath: target.path,
  };
}

export function buildUnavailableRecentRoomCard(roomCode: string): RecentRoomCardViewModel {
  return {
    roomCode,
    statusLabel: i18n.t("lobby:recentRoomCard.statusUnavailable"),
    memberCountLabel: i18n.t("lobby:recentRoomCard.memberCountUnavailable"),
    detail: i18n.t("lobby:recentRoomCard.unavailableDetail"),
    targetLabel: i18n.t("lobby:recentRoomCard.retryLabel"),
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
    memberCountLabel: i18n.t("lobby:recentRoomCard.membersLabel", { count: context.room.members.length }),
    detail: hasActiveGame ? i18n.t("lobby:recentRoomCard.detailInGame") : i18n.t("lobby:recentRoomCard.detailWaiting"),
    targetLabel: hasActiveGame
      ? context.activeGame?.isFinished
        ? i18n.t("lobby:recentRoomCard.actionViewSettlement")
        : i18n.t("lobby:recentRoomCard.actionBackToGame")
      : i18n.t("lobby:recentRoomCard.actionEnterRoom"),
    targetPath: hasActiveGame ? target?.path ?? null : `/room/${context.room.roomCode}`,
    isUnavailable: false,
  };
}

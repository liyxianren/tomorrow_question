import i18n from "../../i18n";
import type { CountryCode, GameContext, RoomContext, RoomMember } from "../../types";

import type { PendingRoomAction, RoomFlowMessage } from "./flow/model";

const countryOrder: CountryCode[] = [
  "britain",
  "france",
  "prussia",
  "austria",
  "russia",
];

export type RoomPreparationStatusLabel =
  | "no_country"
  | "has_country"
  | "is_ready"
  | "waiting_for_others"
  | "game_starting";

const statusLabelDisplay: Record<RoomPreparationStatusLabel, string> = {
  no_country: "room:countrySelection.noSelection",
  has_country: "room:status.readying",
  is_ready: "room:actions.ready",
  waiting_for_others: "room:status.waiting",
  game_starting: "room:status.in_game",
};

function statusLabelText(key: RoomPreparationStatusLabel): string {
  return i18n.t(statusLabelDisplay[key]);
}

export type RoomHeaderViewModel = {
  roomCode: string;
  roomStatusLabel: string;
  playerName: string;
  roleLabel: string;
  playerStatusLabel: string;
  countryLabel: string;
  helperMessage: string | null;
};

export type RoomCountrySlotViewModel = {
  country: CountryCode;
  label: string;
  occupantLabel: string;
  statusLabel: string;
  isSelectable: boolean;
  isSelected: boolean;
};

export type RoomMemberViewModel = {
  playerId: string;
  nickname: string;
  identityLabel: string;
  countryLabel: string;
  connectionLabel: string;
  readyLabel: string;
  memberTypeBadge: string | null;
  canRemoveBot: boolean;
};

export type RoomAiControlsViewModel = {
  title: string;
  description: string;
  helperText: string;
  fillButtonLabel: string;
  fillButtonDisabled: boolean;
  showFillButton: boolean;
  isHighlighted: boolean;
};

export type RoomPrimaryActionViewModel = {
  title: string;
  nextStepTitle: string;
  nextStepDescription: string;
  buttonLabel: string;
  buttonDisabled: boolean;
  canToggleReady: boolean;
  readySummary: string;
  memberSummary: string;
  selectedCountrySummary: string;
  readyStateSummary: string;
  waitingTitle: string;
  waitingDescription: string;
  waitingItems: string[];
  startChecklistTitle: string;
  startChecklist: string[];
  autoStartRule: string;
  blockingReason: string | null;
};

export type RoomLaunchChecklistViewModel = RoomPrimaryActionViewModel;

export type RoomPreparationViewModel = {
  header: RoomHeaderViewModel;
  countrySlots: RoomCountrySlotViewModel[];
  members: RoomMemberViewModel[];
  primaryAction: RoomPrimaryActionViewModel;
  aiControls: RoomAiControlsViewModel | null;
};

type CreateRoomPreparationViewModelParams = {
  room: RoomContext;
  currentMember: RoomMember | null;
  pendingAction: PendingRoomAction;
  activeGame: GameContext | null;
  helperMessage: RoomFlowMessage | null;
};

export function getCountryLabel(country: CountryCode | null): string {
  if (!country) {
    return i18n.t("room:countrySelection.noSelection");
  }

  return i18n.t(`game:country.${country}`);
}

function getCurrentStatusLabel(
  currentMember: RoomMember | null,
  activeGame: GameContext | null,
  room: RoomContext,
): RoomPreparationStatusLabel {
  if (activeGame?.gameId || room.currentGameId || room.status === "in_game") {
    return "game_starting";
  }

  if (!currentMember?.selectedCountry) {
    return "no_country";
  }

  if (!currentMember.isReady) {
    return "has_country";
  }

  return "is_ready";
}

function getRoomStatusLabel(
  currentStatusLabel: RoomPreparationStatusLabel,
): string {
  if (currentStatusLabel === "game_starting") {
    return i18n.t("room:status.in_game");
  }

  return i18n.t("room:status.waiting");
}

function getActionDescription(
  currentStatusLabel: RoomPreparationStatusLabel,
  waitingItems: string[],
): string {
  switch (currentStatusLabel) {
    case "no_country":
      return statusLabelText("no_country");
    case "has_country":
      return statusLabelText("has_country");
    case "is_ready":
      if (waitingItems.length === 0) {
        return i18n.t("room:status.readying");
      }

      return statusLabelText("waiting_for_others");
    case "waiting_for_others":
      return statusLabelText("waiting_for_others");
    case "game_starting":
      return statusLabelText("game_starting");
  }
}

function getActionTitle(
  currentStatusLabel: RoomPreparationStatusLabel,
  currentMember: RoomMember | null,
): string {
  switch (currentStatusLabel) {
    case "no_country":
      return i18n.t("room:countrySelection.noSelection");
    case "has_country":
      return `${i18n.t("room:countrySelection.title")}: ${getCountryLabel(currentMember?.selectedCountry ?? null)}`;
    case "is_ready":
      return i18n.t("room:actions.ready");
    case "waiting_for_others":
      return i18n.t("room:status.waiting");
    case "game_starting":
      return i18n.t("room:status.in_game");
  }
}

function getActionButtonLabel(
  pendingAction: PendingRoomAction,
  currentMember: RoomMember | null,
): string {
  if (pendingAction === "ready") {
    return currentMember?.isReady
      ? `${i18n.t("room:actions.unready")}...`
      : `${i18n.t("room:actions.ready")}...`;
  }

  if (currentMember?.isReady) {
    return i18n.t("room:actions.unready");
  }

  return i18n.t("room:actions.ready");
}

function createWaitingItems(room: RoomContext, currentMember: RoomMember | null): string[] {
  const waitingItems = room.members.flatMap((member) => {
    if (member.playerId === currentMember?.playerId) {
      return [];
    }

    if (!member.selectedCountry) {
      return [`${member.nickname}: ${i18n.t("room:countrySelection.noSelection")}`];
    }

    if (!member.isReady) {
      return [`${member.nickname}: ${i18n.t("room:actions.unready")}`];
    }

    return [];
  });
  const remainingSeats = Math.max(5 - room.members.length, 0);

  if (remainingSeats > 0) {
    waitingItems.push(i18n.t("room:memberCount", { count: room.members.length, max: 5 }));
  }

  return waitingItems;
}

function getWaitingDescription(
  currentStatusLabel: RoomPreparationStatusLabel,
  isHost: boolean,
  waitingItems: string[],
): string {
  if (currentStatusLabel === "game_starting") {
    return i18n.t("room:status.in_game");
  }

  if (currentStatusLabel === "no_country") {
    return i18n.t("room:countrySelection.noSelection");
  }

  if (currentStatusLabel === "has_country") {
    return i18n.t("room:countrySelection.confirm");
  }

  if (waitingItems.length === 0) {
    return i18n.t("room:status.readying");
  }

  return isHost
    ? i18n.t("room:members.host")
    : i18n.t("room:status.waiting");
}

function createStartChecklist(
  room: RoomContext,
  currentMember: RoomMember | null,
  waitingItems: string[],
): string[] {
  return [
    currentMember?.selectedCountry
      ? `${i18n.t("room:countrySelection.title")}: ${getCountryLabel(currentMember.selectedCountry)}`
      : i18n.t("room:countrySelection.noSelection"),
    currentMember?.isReady
      ? i18n.t("room:actions.ready")
      : i18n.t("room:actions.unready"),
    waitingItems.length === 0
      ? i18n.t("room:status.readying")
      : i18n.t("room:status.waiting"),
  ];
}

function resolveBlockingReason(
  currentStatusLabel: RoomPreparationStatusLabel,
  currentMember: RoomMember | null,
  waitingItems: string[],
): string | null {
  if (currentStatusLabel === "game_starting") {
    return null;
  }

  if (!currentMember?.selectedCountry) {
    return i18n.t("room:countrySelection.noSelection");
  }

  if (!currentMember.isReady) {
    return i18n.t("room:actions.unready");
  }

  if (waitingItems.length > 0) {
    return i18n.t("room:status.waiting");
  }

  return null;
}

function createHeaderViewModel(
  room: RoomContext,
  currentMember: RoomMember | null,
  currentStatusLabel: RoomPreparationStatusLabel,
  helperMessage: RoomFlowMessage | null,
): RoomHeaderViewModel {
  const isHost = currentMember?.playerId === room.hostPlayerId;

  return {
    roomCode: room.roomCode,
    roomStatusLabel: getRoomStatusLabel(currentStatusLabel),
    playerName: currentMember?.nickname ?? i18n.t("room:members.empty"),
    roleLabel: isHost ? i18n.t("room:members.host") : i18n.t("room:members.you"),
    playerStatusLabel: statusLabelText(currentStatusLabel),
    countryLabel: getCountryLabel(currentMember?.selectedCountry ?? null),
    helperMessage: helperMessage?.tone === "error" ? helperMessage.text : null,
  };
}

function createCountrySlotsViewModel(
  room: RoomContext,
  currentMember: RoomMember | null,
  pendingAction: PendingRoomAction,
): RoomCountrySlotViewModel[] {
  return countryOrder.map((country) => {
    const occupantId = room.countrySlots[country] ?? null;
    const occupant = room.members.find((member) => member.playerId === occupantId) ?? null;
    const isSelected = currentMember?.selectedCountry === country;
    const isSelectable = Boolean(
      currentMember?.playerId &&
      (!occupantId || occupantId === currentMember.playerId) &&
      pendingAction !== "country",
    );

    return {
      country,
      label: getCountryLabel(country),
      occupantLabel: occupant
        ? occupant.memberType === "bot"
          ? `${occupant.nickname} (AI)`
          : occupant.nickname
        : i18n.t("room:members.empty"),
      statusLabel: isSelected
        ? i18n.t("room:members.you")
        : occupant
          ? i18n.t("room:countrySelection.taken")
          : i18n.t("room:countrySelection.title"),
      isSelectable,
      isSelected,
    };
  });
}

function createMemberViewModel(room: RoomContext, currentMember: RoomMember | null): RoomMemberViewModel[] {
  const isHost = currentMember?.playerId === room.hostPlayerId;
  return room.members.map((member) => {
    const isBot = member.memberType === "bot";
    const identityParts = isBot
      ? ["AI"]
      : [member.playerId === room.hostPlayerId ? i18n.t("room:members.host") : i18n.t("room:members.you")];

    if (member.playerId === currentMember?.playerId) {
      identityParts.push(i18n.t("room:members.you"));
    }

    return {
      playerId: member.playerId,
      nickname: member.nickname,
      identityLabel: identityParts.join(" / "),
      countryLabel: getCountryLabel(member.selectedCountry),
      connectionLabel: isBot
        ? i18n.t("common:backendUnavailable")
        : member.connectionStatus === "online"
          ? "online"
          : "offline",
      readyLabel: member.isReady ? i18n.t("room:actions.ready") : i18n.t("room:actions.unready"),
      memberTypeBadge: isBot ? "AI" : null,
      canRemoveBot: Boolean(isHost && isBot && room.status !== "in_game" && room.status !== "finished"),
    };
  });
}

function createPrimaryActionViewModel(
  room: RoomContext,
  currentMember: RoomMember | null,
  pendingAction: PendingRoomAction,
  currentStatusLabel: RoomPreparationStatusLabel,
): RoomPrimaryActionViewModel {
  const readyCount = room.members.filter((member) => member.isReady).length;
  const isHost = currentMember?.playerId === room.hostPlayerId;
  const canToggleReady =
    currentStatusLabel !== "game_starting" && Boolean(currentMember?.selectedCountry);
  const waitingItems = createWaitingItems(room, currentMember);
  const selectedCountryLabel = getCountryLabel(currentMember?.selectedCountry ?? null);

  return {
    title: getActionTitle(currentStatusLabel, currentMember),
    nextStepTitle: i18n.t("room:countrySelection.confirm"),
    nextStepDescription: getActionDescription(
      currentStatusLabel,
      waitingItems,
    ),
    buttonLabel: getActionButtonLabel(pendingAction, currentMember),
    buttonDisabled: !canToggleReady || pendingAction === "country" || !currentMember,
    canToggleReady,
    readySummary: i18n.t("room:readyCount", { ready: readyCount, total: room.members.length || 5 }),
    memberSummary: i18n.t("room:memberCount", { count: room.members.length, max: 5 }),
    selectedCountrySummary:
      currentMember?.selectedCountry
        ? `${i18n.t("room:countrySelection.title")}: ${selectedCountryLabel}`
        : i18n.t("room:countrySelection.noSelection"),
    readyStateSummary: currentMember?.isReady
      ? i18n.t("room:actions.ready")
      : i18n.t("room:actions.unready"),
    waitingTitle: waitingItems.length > 0
      ? i18n.t("room:status.waiting")
      : i18n.t("room:status.readying"),
    waitingDescription: getWaitingDescription(currentStatusLabel, Boolean(isHost), waitingItems),
    waitingItems,
    startChecklistTitle: i18n.t("room:status.readying"),
    startChecklist: createStartChecklist(room, currentMember, waitingItems),
    autoStartRule: i18n.t("room:status.readying"),
    blockingReason: resolveBlockingReason(currentStatusLabel, currentMember, waitingItems),
  };
}

function createAiControlsViewModel(
  room: RoomContext,
  currentMember: RoomMember | null,
  pendingAction: PendingRoomAction,
): RoomAiControlsViewModel | null {
  const isHost = currentMember?.playerId === room.hostPlayerId;
  if (!isHost || room.status === "in_game" || room.status === "finished") {
    return null;
  }

  const botCount = room.members.filter((member) => member.memberType === "bot").length;
  const emptySeats = Math.max(5 - room.members.length, 0);
  return {
    title: i18n.t("room:ai.title"),
    description: emptySeats > 0
      ? i18n.t("room:ai.description", { count: emptySeats })
      : i18n.t("room:ai.fullDescription"),
    helperText: botCount > 0
      ? i18n.t("room:ai.botCount", { count: botCount })
      : i18n.t("room:ai.emptyHelper"),
    fillButtonLabel:
      pendingAction === "fillBots"
        ? i18n.t("room:ai.filling")
        : emptySeats > 0
          ? i18n.t("room:ai.fillButton")
          : i18n.t("room:errors.roomFull"),
    fillButtonDisabled: pendingAction === "fillBots" || emptySeats <= 0,
    showFillButton: true,
    isHighlighted: emptySeats > 0,
  };
}

export function createRoomPreparationViewModel({
  room,
  currentMember,
  pendingAction,
  activeGame,
  helperMessage,
}: CreateRoomPreparationViewModelParams): RoomPreparationViewModel {
  const currentStatusLabel = getCurrentStatusLabel(currentMember, activeGame, room);

  return {
    header: createHeaderViewModel(room, currentMember, currentStatusLabel, helperMessage),
    countrySlots: createCountrySlotsViewModel(room, currentMember, pendingAction),
    members: createMemberViewModel(room, currentMember),
    primaryAction: createPrimaryActionViewModel(room, currentMember, pendingAction, currentStatusLabel),
    aiControls: createAiControlsViewModel(room, currentMember, pendingAction),
  };
}

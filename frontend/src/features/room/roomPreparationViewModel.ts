import type { CountryCode, GameContext, RoomContext, RoomMember } from "../../types";

import type { PendingRoomAction, RoomFlowMessage } from "./flow/model";


const countryLabels: Record<CountryCode, string> = {
  britain: "英国",
  france: "法国",
  prussia: "普鲁士",
  austria: "奥地利",
  russia: "俄罗斯",
};

const countryOrder: CountryCode[] = [
  "britain",
  "france",
  "prussia",
  "austria",
  "russia",
];

export type RoomPreparationStatusLabel =
  | "未选国家"
  | "已选国家"
  | "已准备开局"
  | "等待其他玩家"
  | "房间已开局，正在进入游戏";

export type RoomHeaderViewModel = {
  roomCode: string;
  roomStatusLabel: "等待其他玩家" | "房间已开局，正在进入游戏";
  playerName: string;
  roleLabel: string;
  playerStatusLabel: RoomPreparationStatusLabel;
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
    return "未选国家";
  }

  return countryLabels[country];
}

function getCurrentStatusLabel(
  currentMember: RoomMember | null,
  activeGame: GameContext | null,
  room: RoomContext,
): RoomPreparationStatusLabel {
  if (activeGame?.gameId || room.currentGameId || room.status === "in_game") {
    return "房间已开局，正在进入游戏";
  }

  if (!currentMember?.selectedCountry) {
    return "未选国家";
  }

  if (!currentMember.isReady) {
    return "已选国家";
  }

  return "已准备开局";
}

function getRoomStatusLabel(
  currentStatusLabel: RoomPreparationStatusLabel,
): RoomHeaderViewModel["roomStatusLabel"] {
  if (currentStatusLabel === "房间已开局，正在进入游戏") {
    return currentStatusLabel;
  }

  return "等待其他玩家";
}

function getActionDescription(
  currentStatusLabel: RoomPreparationStatusLabel,
  waitingItems: string[],
): string {
  switch (currentStatusLabel) {
    case "未选国家":
      return "先选择一个国家，再点准备开局。满足后会自动开局。";
    case "已选国家":
      return "现在点准备开局，之后就只需要等待自动开局。满足后会自动开局。";
    case "已准备开局":
      if (waitingItems.length === 0) {
        return "所有条件都已经满足，房间会自动进入第 1 回合。";
      }

      return "你已准备，接下来只需要等其他玩家补齐条件。";
    case "等待其他玩家":
      return "等待其他玩家。";
    case "房间已开局，正在进入游戏":
      return "房间已开局，正在进入游戏。";
  }
}

function getActionTitle(
  currentStatusLabel: RoomPreparationStatusLabel,
  currentMember: RoomMember | null,
): string {
  switch (currentStatusLabel) {
    case "未选国家":
      return "你尚未选定国家";
    case "已选国家":
      return `已选国家：${getCountryLabel(currentMember?.selectedCountry ?? null)}`;
    case "已准备开局":
      return "你已准备开局";
    case "等待其他玩家":
      return "等待其他玩家";
    case "房间已开局，正在进入游戏":
      return "房间已开局，正在进入游戏";
  }
}

function getActionButtonLabel(
  pendingAction: PendingRoomAction,
  currentMember: RoomMember | null,
): string {
  if (pendingAction === "ready") {
    return currentMember?.isReady ? "正在取消准备..." : "正在准备开局...";
  }

  if (currentMember?.isReady) {
    return "取消准备";
  }

  return "准备开局";
}

function createWaitingItems(room: RoomContext, currentMember: RoomMember | null): string[] {
  const waitingItems = room.members.flatMap((member) => {
    if (member.playerId === currentMember?.playerId) {
      return [];
    }

    if (!member.selectedCountry) {
      return [`${member.nickname}：还没有选国家`];
    }

    if (!member.isReady) {
      return [`${member.nickname}：尚未准备开局`];
    }

    return [];
  });
  const remainingSeats = Math.max(5 - room.members.length, 0);

  if (remainingSeats > 0) {
    waitingItems.push(`还差 ${remainingSeats} 人进入房间`);
  }

  return waitingItems;
}

function getWaitingDescription(
  currentStatusLabel: RoomPreparationStatusLabel,
  isHost: boolean,
  waitingItems: string[],
): string {
  if (currentStatusLabel === "房间已开局，正在进入游戏") {
    return "房间已开局，正在进入游戏。";
  }

  if (currentStatusLabel === "未选国家") {
    return "先完成你的选国，再回来点准备开局。";
  }

  if (currentStatusLabel === "已选国家") {
    return "点准备后，这一项就会变成已完成，接下来只等房间自动开局。";
  }

  if (waitingItems.length === 0) {
    return "房间已满足开局条件，接下来会自动进入第 1 回合引导。";
  }

  return isHost
    ? "你是房主，全员准备开局后会自动开局。"
    : "你已准备，接下来等待房主和其他玩家。";
}

function createStartChecklist(
  room: RoomContext,
  currentMember: RoomMember | null,
  waitingItems: string[],
): string[] {
  return [
    currentMember?.selectedCountry
      ? `已完成：你当前代表 ${getCountryLabel(currentMember.selectedCountry)}。`
      : "待完成：先选择一个国家。",
    currentMember?.isReady
      ? "已完成：你已经点了准备。"
      : "待完成：选择国家后再点准备。",
    waitingItems.length === 0
      ? "已满足：房间人数和准备状态已经满足自动开局条件。"
      : `待完成：房间还有 ${waitingItems.length} 项条件未满足。`,
  ];
}

function resolveBlockingReason(
  currentStatusLabel: RoomPreparationStatusLabel,
  currentMember: RoomMember | null,
  waitingItems: string[],
): string | null {
  if (currentStatusLabel === "房间已开局，正在进入游戏") {
    return null;
  }

  if (!currentMember?.selectedCountry) {
    return "你还没有选国家，所以还不能进入准备流程。这里没有单独的手动开始按钮，因为只有所有人都准备完毕后系统才会自动开局。";
  }

  if (!currentMember.isReady) {
    return "你可以先点准备。这里没有单独的手动开始按钮，因为房间会在所有玩家都准备完成后自动开局。";
  }

  if (waitingItems.length > 0) {
    return "你已经准备好了。这里没有单独的手动开始按钮，因为房间只能在所有玩家都准备完成后自动开局。";
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
    playerName: currentMember?.nickname ?? "等待识别",
    roleLabel: isHost ? "房主" : "成员",
    playerStatusLabel: currentStatusLabel,
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
          ? `${occupant.nickname}（AI）`
          : occupant.nickname
        : "空闲",
      statusLabel: isSelected ? "当前是你" : occupant ? "已被选择" : "可选择",
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
      ? ["AI 补位"]
      : [member.playerId === room.hostPlayerId ? "房主" : "成员"];

    if (member.playerId === currentMember?.playerId) {
      identityParts.push("你");
    }

    return {
      playerId: member.playerId,
      nickname: member.nickname,
      identityLabel: identityParts.join(" / "),
      countryLabel: getCountryLabel(member.selectedCountry),
      connectionLabel: isBot
        ? "服务器托管"
        : member.connectionStatus === "online"
          ? "在线"
          : "离线后可恢复",
      readyLabel: member.isReady ? "已准备开局" : "尚未准备开局",
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
    currentStatusLabel !== "房间已开局，正在进入游戏" && Boolean(currentMember?.selectedCountry);
  const waitingItems = createWaitingItems(room, currentMember);
  const selectedCountryLabel = getCountryLabel(currentMember?.selectedCountry ?? null);

  return {
    title: getActionTitle(currentStatusLabel, currentMember),
    nextStepTitle: "下一步",
    nextStepDescription: getActionDescription(
      currentStatusLabel,
      waitingItems,
    ),
    buttonLabel: getActionButtonLabel(pendingAction, currentMember),
    buttonDisabled: !canToggleReady || pendingAction === "country" || !currentMember,
    canToggleReady,
    readySummary: `${readyCount} / ${room.members.length || 5} 人已准备开局`,
    memberSummary: `${room.members.length} / 5 人已进入房间`,
    selectedCountrySummary:
      currentMember?.selectedCountry ? `已选国家：${selectedCountryLabel}` : "你尚未选定国家",
    readyStateSummary: currentMember?.isReady ? "你已准备开局" : "你尚未准备开局",
    waitingTitle: waitingItems.length > 0 ? "离开局还差什么" : "开局条件已齐",
    waitingDescription: getWaitingDescription(currentStatusLabel, Boolean(isHost), waitingItems),
    waitingItems,
    startChecklistTitle: "开局前检查清单",
    startChecklist: createStartChecklist(room, currentMember, waitingItems),
    autoStartRule: "自动开局规则：5 名玩家全部进入房间、都选好国家并全部点下准备后，系统会自动跳转到第 1 回合，不提供单独的手动开始按钮。",
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
    title: "AI 补位",
    description: "需要快速开局时，房主可以把剩余席位补成服务器托管的 AI，并让它们自动参与后续每个阶段。",
    helperText: botCount > 0
      ? "当前房间里已有 AI。若想让真人加入，先踢出 AI 释放席位。"
      : "当前还没有 AI。补满后，AI 会自动选国、自动 ready，并在对局中自动提交。",
    fillButtonLabel:
      pendingAction === "fillBots"
        ? "正在补满 AI..."
        : emptySeats > 0
          ? `一键补满 AI（还差 ${emptySeats} 席）`
          : "房间已满",
    fillButtonDisabled: pendingAction === "fillBots" || emptySeats <= 0,
    showFillButton: true,
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

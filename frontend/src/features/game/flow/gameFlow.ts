import i18n from "../../../i18n";
import type { GamePhase, GameSnapshot, PlayerState, PlayerSubmissionStatus, RoomMember } from "../../../types";

import type { GameRuntimeState } from "../runtime/types";


export const GAME_FLOW_STEP_LABELS = [
  i18n.t("game:flow.stepRestoring", "恢复当前回合/阶段"),
  i18n.t("game:flow.stepViewing", "查看局势"),
  i18n.t("game:flow.stepFilling", "填写阶段"),
  i18n.t("game:flow.stepSubmitting", "提交"),
  i18n.t("game:flow.stepWaitingSettlement", "等待结算"),
  i18n.t("game:flow.stepViewingResults", "查看阶段结果"),
  i18n.t("game:flow.stepNextPhase", "进入下一阶段/最终结算"),
] as const;

export type GameFlowStepLabel = (typeof GAME_FLOW_STEP_LABELS)[number];

export type GameFlowState = {
  currentPlayerId: string | null;
  currentPlayerState: PlayerState | null;
  currentSnapshot: GameSnapshot | null;
  currentStepLabel: GameFlowStepLabel;
  isEditable: boolean;
  hasSubmitted: boolean;
  isWaitingSettlement: boolean;
  shouldRedirectToSettlement: boolean;
  statusMessage: string;
  stepLabels: readonly GameFlowStepLabel[];
  playerStatuses: Array<{
    playerId: string;
    nickname: string;
    isCurrentPlayer: boolean;
    statusLabel: string;
  }>;
};

export type PhaseActionStatusViewModel = {
  badge: string;
  description: string;
  kind: "loading" | "actionable" | "submitted" | "settled" | "finished" | "unavailable";
  showSubmitAction: boolean;
  title: string;
};

type CreateGameFlowStateArgs = {
  runtimeState: GameRuntimeState;
  isLoadingContext: boolean;
  settlementTargetPath: string | null;
};

export function createGameFlowState({
  runtimeState,
  isLoadingContext,
  settlementTargetPath,
}: CreateGameFlowStateArgs): GameFlowState {
  const currentPlayerId = runtimeState.session?.playerId ?? null;
  const currentSnapshot = runtimeState.snapshot ?? null;
  const currentPlayerState =
    currentPlayerId && currentSnapshot
      ? currentSnapshot.nationalStateByPlayer?.[currentPlayerId] ?? null
      : null;
  const currentSubmissionStatus = currentPlayerId
    ? resolveSubmissionStatus({
        runtimeState,
        member: null,
      })
    : i18n.t("game:flow.waitingSync", "等待同步");
  const hasSubmitted =
    Boolean(runtimeState.finalResult) ||
    currentSubmissionStatus === i18n.t("game:flow.submitted", "已提交") ||
    currentSubmissionStatus === i18n.t("game:flow.timeoutAutoSubmitted", "超时自动补交") ||
    runtimeState.isCurrentPlayerSubmitted;
  const shouldRedirectToSettlement = Boolean(settlementTargetPath && runtimeState.finalResult);
  const isEditable = Boolean(
    currentSnapshot &&
      currentPlayerState &&
      !isLoadingContext &&
      runtimeState.canSubmitCurrentPhase &&
      !hasSubmitted &&
      !runtimeState.finalResult,
  );
  const isWaitingSettlement =
    !shouldRedirectToSettlement && !runtimeState.latestSettlement && hasSubmitted && !runtimeState.finalResult;
  const currentStepLabel = resolveCurrentStepLabel({
    hasCurrentSnapshot: Boolean(currentSnapshot),
    hasCurrentPlayerState: Boolean(currentPlayerState),
    hasLatestSettlement: Boolean(runtimeState.latestSettlement),
    hasFinalResult: Boolean(runtimeState.finalResult),
    isEditable,
    isLoadingContext,
    isWaitingSettlement,
  });

  return {
    currentPlayerId,
    currentPlayerState,
    currentSnapshot,
    currentStepLabel,
    isEditable,
    hasSubmitted,
    isWaitingSettlement,
    shouldRedirectToSettlement,
    statusMessage: resolveStatusMessage({
      currentStepLabel,
      hasFinalResult: Boolean(runtimeState.finalResult),
      isEditable,
      isWaitingSettlement,
    }),
    stepLabels: GAME_FLOW_STEP_LABELS,
    playerStatuses: (runtimeState.room?.members ?? []).map((member) => ({
      playerId: member.playerId,
      nickname: member.nickname,
      isCurrentPlayer: member.playerId === currentPlayerId,
      statusLabel: resolveSubmissionStatus({
        runtimeState,
        member,
      }),
    })),
  };
}

function resolveCurrentStepLabel({
  hasCurrentSnapshot,
  hasCurrentPlayerState,
  hasLatestSettlement,
  hasFinalResult,
  isEditable,
  isLoadingContext,
  isWaitingSettlement,
}: {
  hasCurrentSnapshot: boolean;
  hasCurrentPlayerState: boolean;
  hasLatestSettlement: boolean;
  hasFinalResult: boolean;
  isEditable: boolean;
  isLoadingContext: boolean;
  isWaitingSettlement: boolean;
}): GameFlowStepLabel {
  if (hasFinalResult) {
    return i18n.t("game:flow.stepNextPhase", "进入下一阶段/最终结算");
  }

  if (isLoadingContext || !hasCurrentSnapshot || !hasCurrentPlayerState) {
    return i18n.t("game:flow.stepRestoring", "恢复当前回合/阶段");
  }

  if (hasLatestSettlement) {
    return i18n.t("game:flow.stepViewingResults", "查看阶段结果");
  }

  if (isWaitingSettlement) {
    return i18n.t("game:flow.stepWaitingSettlement", "等待结算");
  }

  if (isEditable) {
    return i18n.t("game:flow.stepFilling", "填写阶段");
  }

  return i18n.t("game:flow.stepViewing", "查看局势");
}

function resolveStatusMessage({
  currentStepLabel,
  hasFinalResult,
  isEditable,
  isWaitingSettlement,
}: {
  currentStepLabel: GameFlowStepLabel;
  hasFinalResult: boolean;
  isEditable: boolean;
  isWaitingSettlement: boolean;
}): string {
  if (hasFinalResult) {
    return i18n.t("game:flow.statusFinalResult", "最终结果已经生成，正在进入结算页。");
  }

  if (currentStepLabel === GAME_FLOW_STEP_LABELS[0]) {
    return i18n.t("game:flow.statusRestoring", "正在恢复当前回合与阶段，请稍候。");
  }

  if (currentStepLabel === GAME_FLOW_STEP_LABELS[5]) {
    return i18n.t("game:flow.statusViewResults", "本阶段已经完成结算，请先查看结果并等待进入下一阶段。");
  }

  if (isWaitingSettlement) {
    return i18n.t("game:flow.statusWaitingSettlement", "你已提交，系统会在所有玩家完成后开始结算。");
  }

  if (isEditable) {
    return i18n.t("game:flow.statusEditable", "当前可以填写并提交本阶段操作。");
  }

  return i18n.t("game:flow.statusViewingSituation", "请先查看当前局势，再决定本阶段要执行的操作。");
}

function resolveSubmissionStatus({
  runtimeState,
  member,
}: {
  runtimeState: GameRuntimeState;
  member: RoomMember | null;
}): string {
  const playerId = member?.playerId ?? runtimeState.session?.playerId ?? null;
  const status = playerId ? runtimeState.submissionStatusByPlayerId[playerId] : undefined;

  return formatSubmissionStatus(status, Boolean(runtimeState.snapshot || runtimeState.finalResult));
}

function formatSubmissionStatus(status: PlayerSubmissionStatus | undefined, hasGameState: boolean): string {
  switch (status) {
    case "pending":
      return i18n.t("game:flow.pendingSubmit", "待提交");
    case "submitted":
      return i18n.t("game:flow.submitted", "已提交");
    case "timeout_auto_submitted":
      return i18n.t("game:flow.timeoutAutoSubmitted", "超时自动补交");
    default:
      return hasGameState ? i18n.t("game:flow.pendingSubmit", "待提交") : i18n.t("game:flow.waitingSync", "等待同步");
  }
}

export function createPhaseActionStatusViewModel({
  currentPhase,
  flowState,
  runtimeState,
}: {
  currentPhase: GamePhase | null;
  flowState: GameFlowState;
  runtimeState: GameRuntimeState;
}): PhaseActionStatusViewModel {
  const phaseLabel = currentPhase ? getPhaseLabel(currentPhase) : "当前阶段";
  const currentPlayerStatus = flowState.currentPlayerId
    ? runtimeState.submissionStatusByPlayerId[flowState.currentPlayerId]
    : undefined;
  const pendingOtherPlayers = Object.entries(runtimeState.submissionStatusByPlayerId).filter(
    ([playerId, status]) => playerId !== flowState.currentPlayerId && status === "pending",
  ).length;

  if (flowState.shouldRedirectToSettlement || runtimeState.finalResult) {
    return {
      kind: "finished",
      badge: "已结束",
      title: "本局已经结束，正在进入结果页",
      description: "最终结果已经生成，稍后会自动跳转到结果页。",
      showSubmitAction: false,
    };
  }

  if (flowState.currentStepLabel === "恢复当前回合/阶段" || !runtimeState.snapshot || !flowState.currentPlayerState) {
    return {
      kind: "loading",
      badge: "同步中",
      title: "正在同步你的本阶段信息",
      description: "请稍候，系统正在恢复当前回合、阶段和你的可操作内容。",
      showSubmitAction: false,
    };
  }

  if (runtimeState.latestSettlement) {
    return {
      kind: "settled",
      badge: "已结算",
      title: "上一阶段已经结算完成",
      description: "先阅读下方结果反馈，再准备当前阶段的新安排。",
      showSubmitAction: false,
    };
  }

  if (currentPlayerStatus === "timeout_auto_submitted") {
    return {
      kind: "submitted",
      badge: "系统代交",
      title: "你已错过截止时间，系统已代你提交",
      description: pendingOtherPlayers > 0
        ? `这一阶段已按超时规则代交；接下来若还有玩家未提交就继续等待，全部完成后系统会结算，并在结算后展示阶段结果再推进。`
        : "这一阶段已按超时规则代交；系统正在结算，结算完成后会先展示阶段结果，再推进到下一阶段。",
      showSubmitAction: false,
    };
  }

  if (flowState.hasSubmitted || flowState.isWaitingSettlement) {
    if (pendingOtherPlayers > 0) {
      return {
        kind: "submitted",
        badge: "等待玩家",
        title: "你已提交，正在等待其他玩家完成本阶段",
        description: `你已完成本阶段提交，正在等待 ${pendingOtherPlayers} 名玩家提交；结算完成后会先展示阶段结果，再推进到下一阶段。`,
        showSubmitAction: false,
      };
    }

    return {
      kind: "submitted",
      badge: "系统结算中",
      title: "所有玩家已提交，系统正在结算",
      description: "所有玩家都已完成操作，系统正在汇总本阶段结果；结算完成后会先展示阶段结果，再推进到下一阶段。",
      showSubmitAction: false,
    };
  }

  if (flowState.isEditable) {
    return {
      kind: "actionable",
      badge: "可提交",
      title: `现在轮到你完成${phaseLabel}安排`,
      description: "确认本阶段操作无误后即可提交，系统会在所有玩家完成后统一结算。",
      showSubmitAction: true,
    };
  }

  return {
    kind: "unavailable",
    badge: "暂不可提交",
    title: `当前还不能提交${phaseLabel}安排`,
    description: "请先阅读阶段目标与结果反馈，等待系统同步到可操作状态。",
    showSubmitAction: false,
  };
}

function getPhaseLabel(phase: GamePhase): string {
  switch (phase) {
    case "decision":
      return "国家决策";
    case "market":
      return "市场出售";
    case "settlement":
      return "财政结算";
    default:
      return phase;
  }
}

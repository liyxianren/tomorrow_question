import { getCountryLabel } from "../panelGlossary";
import type { GameFinishedPayload } from "../runtime/types";


type SettlementRouteState = {
  result?: GameFinishedPayload | null;
  roomCode?: string | null;
};

type CreateSettlementPageStateArgs = {
  gameId: string | undefined;
  result?: GameFinishedPayload | null;
  roomCode?: string | null;
  routeState?: SettlementRouteState | null;
};

type SettlementArchiveStat = {
  label: string;
  value: string;
};

type SettlementRankingRow = {
  countryLabel: string;
  nickname: string;
  playerId: string;
  rank: number;
  tieBreakSummary: string;
  cumulativeNationalIncome: number;
};

type SettlementTimelineEntry = {
  key: string;
  label: string;
  message: string;
  meta: string;
};

type SettlementTurningPointCard = {
  title: string;
  detail: string;
};

export type SettlementPageState = {
  archiveStats: SettlementArchiveStat[];
  finalResult: GameFinishedPayload | null;
  gameIdLabel: string;
  heroDescription: string;
  heroTitle: string;
  highlights: string[];
  lobbyTargetPath: string;
  missingResultMessage: string | null;
  rankingRows: SettlementRankingRow[];
  roomTargetPath: string;
  timelineEntries: SettlementTimelineEntry[];
  replayGuidance: string[];
  turningPointCards: SettlementTurningPointCard[];
  whyRankChanged: string[];
};

export function createSettlementPageState({
  gameId,
  result,
  roomCode,
  routeState,
}: CreateSettlementPageStateArgs): SettlementPageState {
  const finalResult = result ?? routeState?.result ?? null;
  const resolvedRoomCode = roomCode ?? routeState?.roomCode ?? finalResult?.game.roomCode ?? null;
  const leadingEntry = Array.isArray(finalResult?.finalRanking) ? finalResult.finalRanking[0] : null;
  const leadingCountry = getResolvedLeaderLabel(leadingEntry?.country, leadingEntry?.nickname);
  const leadingIncome = resolveRankingIncome(leadingEntry);
  const rankingRows = finalResult?.finalRanking.map((entry) => ({
    countryLabel: getResolvedLeaderLabel(entry.country, entry.nickname),
    nickname: entry.nickname,
    playerId: entry.playerId,
    rank: entry.rank,
    tieBreakSummary: formatTieBreakSummary(entry.tieBreak),
    cumulativeNationalIncome: resolveRankingIncome(entry) ?? 0,
  })) ?? [];
  const timelineEntries = finalResult?.finalLogs.map((log, index) => ({
    key: `${log.kind}-${log.createdAt ?? index}`,
    label: log.phase ? getPhaseLabel(log.phase) : "终局裁定",
    message: sanitizeFinalLogMessage(log.message, log.roundNo, log.phase),
    meta: createTimelineMeta(log.roundNo, log.createdAt),
  })) ?? [];
  const whyRankChanged = finalResult?.whyRankChanged?.length
    ? finalResult.whyRankChanged
    : buildFallbackWhyRankChanged(finalResult);
  const turningPointCards = finalResult?.turningPointCards ?? buildFallbackTurningPoints(finalResult);
  const replayGuidance = finalResult?.replayGuidance?.length
    ? finalResult.replayGuidance
    : buildFallbackReplayGuidance(finalResult);
  const highlights = finalResult
    ? [
        leadingIncome === null
          ? `${leadingCountry} 位列最终第一。`
          : `${leadingCountry} 以 ${leadingIncome} 累计国家收入位列第一。`,
        turningPointCards[0]
          ? turningPointCards[0].detail
          : "本局已结束，你可以通过最终排名和日志回顾整局走向。",
      ]
    : [];

  return {
    archiveStats: finalResult
      ? [
          {
            label: "终局冠军",
            value: leadingCountry,
          },
          {
            label: "最终回合",
            value: `${finalResult.game.currentRound} / ${finalResult.game.totalRounds}`,
          },
          {
            label: "终局日志",
            value: `${timelineEntries.length} 条`,
          },
        ]
      : [],
    finalResult,
    gameIdLabel: gameId ?? finalResult?.game.gameId ?? "未指定",
    heroDescription: finalResult
      ? "这里汇总最终排名、关键结果摘要与终局时间线，用来快速复盘这局是怎样收束的。"
      : "当前还没有可展示的结果，你可以返回大厅或原房间后再重新进入。",
    heroTitle: finalResult ? "终局已归档" : "暂时没有可展示的结果",
    highlights,
    lobbyTargetPath: "/lobby",
    missingResultMessage: finalResult ? null : "当前还没有可展示的对局结果，请返回大厅或原房间重新进入。",
    rankingRows,
    roomTargetPath: resolvedRoomCode ? `/room/${resolvedRoomCode}` : "/",
    timelineEntries,
    replayGuidance,
    turningPointCards,
    whyRankChanged,
  };
}

function getResolvedLeaderLabel(country: string | null | undefined, nickname: string | null | undefined): string {
  if (country) {
    return getCountryLabel(country);
  }

  if (nickname && nickname.trim().length > 0) {
    return nickname;
  }

  return "领先玩家";
}

function formatTieBreakSummary(tieBreak: {
  productionCapacity: number;
  controlledRegions: number;
  budgetPoolsTotal: number;
}): string {
  return `总产能：${tieBreak.productionCapacity}，控制区域数：${tieBreak.controlledRegions}，资源总额：${tieBreak.budgetPoolsTotal ?? 0}`;
}

function getPhaseLabel(phase: string): string {
  switch (phase) {
    case "decision":
      return "国家决策";
    case "settlement":
      return "财政结算";
    case "market":
      return "市场出售";
    default:
      return phase;
  }
}

function createTimelineMeta(roundNo: number, createdAt: string | null): string {
  const roundLabel = Number.isFinite(roundNo) ? `第 ${roundNo} 回合` : "未知回合";
  const timeLabel = createdAt ? createdAt.replace("T", " ").replace("Z", "") : "时间未记录";

  return `${roundLabel} · ${timeLabel}`;
}

function buildFallbackWhyRankChanged(finalResult: GameFinishedPayload | null): string[] {
  const first = finalResult?.finalRanking[0];
  const second = finalResult?.finalRanking[1];

  if (!first) {
    return [];
  }

  if (!second) {
    return [
      `${getResolvedLeaderLabel(first.country, first.nickname)}这局主打“稳增长”，把领先收入守到了终局。`,
      "如果下一局要追分，就要先抢节奏，再保市场权限，把差距换成下轮空间。",
    ];
  }

  return [
    `${getResolvedLeaderLabel(first.country, first.nickname)}这局主打“稳增长”，最终累计国家收入 ${resolveRankingIncome(first) ?? 0}，领先 ${getResolvedLeaderLabel(second.country, second.nickname)} ${(resolveRankingIncome(first) ?? 0) - (resolveRankingIncome(second) ?? 0)}。`,
    `${getResolvedLeaderLabel(second.country, second.nickname)}如果要追上，下一局要先“抢节奏”，再“保市场权限”，把局面换成自己的下轮空间。`,
  ];
}

function buildFallbackTurningPoints(finalResult: GameFinishedPayload | null): SettlementTurningPointCard[] {
  if (!finalResult?.finalLogs?.length) {
    return [];
  }

  return finalResult.finalLogs.slice(0, 2).map((log) => ({
    title: `${Number.isFinite(log.roundNo) ? `第 ${log.roundNo} 回合` : "未知回合"}：${log.phase ? getPhaseLabel(log.phase) : "终局裁定"}`,
    detail: sanitizeFinalLogMessage(log.message, log.roundNo, log.phase),
  }));
}

function sanitizeFinalLogMessage(message: string, roundNo: number, phase: string | null): string {
  const trimmed = message.trim();
  if (trimmed.includes("completed national income allocation")) {
    const countryKey = trimmed.split(" ", 1)[0];
    return `${getCountryLabel(countryKey)}完成第 ${roundNo} 回合财政分配。`;
  }
  if (trimmed === "settlement settled.") {
    return "终局财政结算已完成。";
  }
  if (trimmed === "market settled.") {
    return "市场出售阶段已完成。";
  }
  if (trimmed === "decision settled.") {
    return "国家决策阶段已完成。";
  }
  if (trimmed.endsWith(" settled.") && phase) {
    return `${getPhaseLabel(phase)}阶段已完成。`;
  }
  return message;
}

function buildFallbackReplayGuidance(finalResult: GameFinishedPayload | null): string[] {
  const first = finalResult?.finalRanking[0];
  const second = finalResult?.finalRanking[1];

  if (!first) {
    return [];
  }

  if (!second) {
    return [
      "下一局继续“稳增长”，把收入链条守住，再把领先优势换成下轮空间。",
      "如果你想加速扩张，就先“抢节奏”，确认自己还握着市场权限。",
    ];
  }

  return [
    `如果你是 ${getResolvedLeaderLabel(second.country, second.nickname)}，下一局先“抢节奏”，再“保市场权限”，别让领先只停留在阶段内。`,
    `如果你是 ${getResolvedLeaderLabel(first.country, first.nickname)}，继续“稳增长”，把优势滚到后续回合，换成更大的下轮空间。`,
  ];
}

function resolveRankingIncome(
  entry: GameFinishedPayload["finalRanking"][number] | null | undefined,
): number | null {
  if (!entry) {
    return null;
  }

  if (typeof entry.cumulativeNationalIncome === "number") {
    return entry.cumulativeNationalIncome;
  }

  return typeof entry.totalIncome === "number" ? entry.totalIncome : null;
}

import i18n, { translateBackend } from "../../../i18n";
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
    label: log.phase ? getPhaseLabel(log.phase) : i18n.t("game:settlement.finalRuling", "终局裁定"),
    message: sanitizeFinalLogMessage(log.message, log.roundNo, log.phase),
    meta: createTimelineMeta(log.roundNo, log.createdAt),
  })) ?? [];
  const whyRankChanged = finalResult?.whyRankChanged?.length
    ? finalResult.whyRankChanged.map((line) => translateBackend(line))
    : buildFallbackWhyRankChanged(finalResult);
  const turningPointCards = finalResult?.turningPointCards
    ? finalResult.turningPointCards.map((card) => ({
        title: translateBackend(card.title),
        detail: translateBackend(card.detail),
      }))
    : buildFallbackTurningPoints(finalResult);
  const replayGuidance = finalResult?.replayGuidance?.length
    ? finalResult.replayGuidance.map((line) => translateBackend(line))
    : buildFallbackReplayGuidance(finalResult);
  const highlights = finalResult
    ? [
        leadingIncome === null
          ? i18n.t("game:settlement.highlightFirstNoIncome", "{{country}} 位列最终第一。", { country: leadingCountry })
          : i18n.t("game:settlement.highlightFirstWithIncome", "{{country}} 以 {{income}} 累计国家收入位列第一。", { country: leadingCountry, income: leadingIncome }),
        turningPointCards[0]
          ? turningPointCards[0].detail
          : i18n.t("game:settlement.highlightDefault", "本局已结束，你可以通过最终排名和日志回顾整局走向。"),
      ]
    : [];

  return {
    archiveStats: finalResult
      ? [
          {
            label: i18n.t("game:settlement.finalChampion", "终局冠军"),
            value: leadingCountry,
          },
          {
            label: i18n.t("game:settlement.finalRound", "最终回合"),
            value: `${finalResult.game.currentRound} / ${finalResult.game.totalRounds}`,
          },
          {
            label: i18n.t("game:settlement.finalLogs", "终局日志"),
            value: i18n.t("game:settlement.logCount", "{{count}} 条", { count: timelineEntries.length }),
          },
        ]
      : [],
    finalResult,
    gameIdLabel: gameId ?? finalResult?.game.gameId ?? i18n.t("game:settlement.unspecified", "未指定"),
    heroDescription: finalResult
      ? i18n.t("game:settlement.heroDescriptionHasResult", "这里汇总最终排名、关键结果摘要与终局时间线，用来快速复盘这局是怎样收束的。")
      : i18n.t("game:settlement.heroDescriptionNoResult", "当前还没有可展示的结果，你可以返回大厅或原房间后再重新进入。"),
    heroTitle: finalResult ? i18n.t("game:settlement.heroTitleArchived", "终局已归档") : i18n.t("game:settlement.heroTitleNoResult", "暂时没有可展示的结果"),
    highlights,
    lobbyTargetPath: "/lobby",
    missingResultMessage: finalResult ? null : i18n.t("game:settlement.missingResult", "当前还没有可展示的对局结果，请返回大厅或原房间重新进入。"),
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

  return i18n.t("game:settlement.leadingPlayer", "领先玩家");
}

function formatTieBreakSummary(tieBreak: {
  productionCapacity: number;
  controlledRegions: number;
  budgetPoolsTotal: number;
}): string {
  return i18n.t("game:settlement.tieBreakSummary", "总产能：{{production}}，控制区域数：{{regions}}，资源总额：{{budget}}", { production: tieBreak.productionCapacity, regions: tieBreak.controlledRegions, budget: tieBreak.budgetPoolsTotal ?? 0 });
}

function getPhaseLabel(phase: string): string {
  switch (phase) {
    case "decision":
      return i18n.t("game:phase.decision", "国家决策");
    case "settlement":
      return i18n.t("game:phase.settlement", "财政结算");
    case "market":
      return i18n.t("game:phase.market", "市场出售");
    default:
      return phase;
  }
}

function createTimelineMeta(roundNo: number, createdAt: string | null): string {
  const roundLabel = Number.isFinite(roundNo) ? i18n.t("game:settlement.roundLabel", "第 {{round}} 回合", { round: roundNo }) : i18n.t("game:settlement.unknownRound", "未知回合");
  const timeLabel = createdAt ? createdAt.replace("T", " ").replace("Z", "") : i18n.t("game:settlement.timeNotRecorded", "时间未记录");

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
      i18n.t("game:settlement.whyRankChangedSingle", "{{country}} this game focused on steady growth and defended its lead to the end.", { country: getResolvedLeaderLabel(first.country, first.nickname) }),
      i18n.t("game:settlement.whyRankChangedCatchUp", "In the next game, gain tempo first, secure market access, and turn the gap into next-round space."),
    ];
  }

  return [
    i18n.t("game:settlement.whyRankChangedTwo1", "{{country}} focused on steady growth this game, ending with cumulative national income {{income}}, leading {{secondCountry}} by {{diff}}.", { country: getResolvedLeaderLabel(first.country, first.nickname), income: resolveRankingIncome(first) ?? 0, secondCountry: getResolvedLeaderLabel(second.country, second.nickname), diff: (resolveRankingIncome(first) ?? 0) - (resolveRankingIncome(second) ?? 0) }),
    i18n.t("game:settlement.whyRankChangedTwo2", "If {{country}} wants to catch up, first gain tempo and then secure market access to create space for the next round.", { country: getResolvedLeaderLabel(second.country, second.nickname) }),
  ];
}

function buildFallbackTurningPoints(finalResult: GameFinishedPayload | null): SettlementTurningPointCard[] {
  if (!finalResult?.finalLogs?.length) {
    return [];
  }

  return finalResult.finalLogs.slice(0, 2).map((log) => ({
    title: i18n.t("game:settlement.turningPointTitle", {
      round: Number.isFinite(log.roundNo) ? i18n.t("game:settlement.roundLabel", "Round {{round}}", { round: log.roundNo }) : i18n.t("game:settlement.unknownRound", "Unknown Round"),
      phase: log.phase ? getPhaseLabel(log.phase) : i18n.t("game:settlement.finalRuling", "Final Ruling"),
      defaultValue: "{{round}}: {{phase}}",
    }),
    detail: sanitizeFinalLogMessage(log.message, log.roundNo, log.phase),
  }));
}

function sanitizeFinalLogMessage(message: string, roundNo: number, phase: string | null): string {
  const trimmed = message.trim();
  if (
    trimmed.includes("completed national income allocation")
    || (trimmed.includes(" completed Round ") && trimmed.endsWith(" fiscal allocation."))
  ) {
    const countryKey = trimmed.split(" ", 1)[0].toLowerCase();
    return i18n.t("game:settlement.logIncomeAllocation", "{{country}}完成第 {{round}} 回合财政分配。", { country: getCountryLabel(countryKey), round: roundNo });
  }
  if (trimmed === "settlement settled." || trimmed === "Final fiscal settlement is complete.") {
    return i18n.t("game:settlement.logSettlementCompleted", "终局财政结算已完成。");
  }
  if (trimmed === "market settled.") {
    return i18n.t("game:settlement.logMarketCompleted", "市场出售阶段已完成。");
  }
  if (trimmed === "decision settled.") {
    return i18n.t("game:settlement.logDecisionCompleted", "国家决策阶段已完成。");
  }
  if (trimmed.endsWith(" settled.") && phase) {
    return i18n.t("game:settlement.logPhaseCompleted", "{{phase}}阶段已完成。", { phase: getPhaseLabel(phase) });
  }
  return translateBackend(message);
}

function buildFallbackReplayGuidance(finalResult: GameFinishedPayload | null): string[] {
  const first = finalResult?.finalRanking[0];
  const second = finalResult?.finalRanking[1];

  if (!first) {
    return [];
  }

  if (!second) {
    return [
      i18n.t("game:settlement.replayGuidanceSingle1", "Next game, continue steady growth to keep the income chain and turn the lead into next-round space."),
      i18n.t("game:settlement.replayGuidanceSingle2", "If you want to accelerate expansion, first gain tempo and confirm you still hold market access."),
    ];
  }

  return [
    i18n.t("game:settlement.replayGuidanceTwo1", "If you are {{country}}, first gain tempo and then secure market access - don't let your lead stay only within the phase.", { country: getResolvedLeaderLabel(second.country, second.nickname) }),
    i18n.t("game:settlement.replayGuidanceTwo2", "If you are {{country}}, continue steady growth and roll the advantage into later rounds for bigger next-round space.", { country: getResolvedLeaderLabel(first.country, first.nickname) }),
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

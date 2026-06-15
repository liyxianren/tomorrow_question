import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useParams } from "react-router-dom";

import { GameLeftRail } from "../components/game/layout/GameLeftRail";
import { GamePageShell } from "../components/game/layout/GamePageShell";
import { PhaseHeaderBar } from "../components/game/layout/PhaseHeaderBar";
import { createSettlementPageState } from "../features/game/flow/settlementFlow";
import { getCountryLabel } from "../features/game/panelGlossary";
import type { GameFinishedPayload } from "../features/game/runtime/types";
import { fetchFinalResult } from "../services/game";
import i18n, { translateBackend } from "../i18n";
import type { GameLog } from "../types/domain";

const LOG_CATEGORY_ORDER = ["final", "military", "overseas", "decision", "events", "economy", "other"] as const;
type LogCategory = (typeof LOG_CATEGORY_ORDER)[number];

const LOG_CATEGORY_EMOJI: Record<LogCategory, string> = {
  final: "🏆",
  events: "⚠️",
  economy: "💰",
  military: "⚔️",
  overseas: "⛵",
  decision: "🏛",
  other: "📋",
};

const LOG_TRUNCATE_LENGTH = 80;

function categorizeLogKind(kind: string): LogCategory {
  const k = (kind ?? "").toLowerCase();
  if (k.includes("revolt") || k.includes("rebel") || k.includes("crisis")) return "events";
  if (k.includes("final")) return "final";
  if (k.includes("military") || k.includes("conquest") || k.includes("war") || k.includes("colon") || k.includes("naval") || k.includes("loot")) return "military";
  if (k.includes("overseas") || k.includes("route") || k.includes("peace") || k.includes("treaty")) return "overseas";
  if (k.startsWith("market") || k.startsWith("settlement") || k.includes("budget") || k.includes("income")) return "economy";
  if (k.startsWith("decision") || k.includes("reform") || k.includes("policy")) return "decision";
  return "other";
}

function getLogCategoryMeta(category: LogCategory): { label: string; emoji: string } {
  return {
    label: i18n.t(`pages:settlement.logCategory.${category}`),
    emoji: LOG_CATEGORY_EMOJI[category],
  };
}

function formatLabelValue(label: string, value: string | number): string {
  const separator = i18n.language?.startsWith("zh") ? "：" : ": ";
  return `${label}${separator}${value}`;
}

type SettlementRouteState = {
  result?: GameFinishedPayload | null;
  roomCode?: string | null;
};

type SettlementPageProps = {
  result?: GameFinishedPayload | null;
  roomCode?: string | null;
};

export function SettlementPage({ result, roomCode }: SettlementPageProps) {
  const { t } = useTranslation("pages");
  const { gameId } = useParams();
  const location = useLocation();
  const routeState = (location.state as SettlementRouteState | null) ?? null;
  const routeResult = result ?? routeState?.result ?? null;
  const routeRoomCode = roomCode ?? routeState?.roomCode ?? null;
  const [resolvedResult, setResolvedResult] = useState<GameFinishedPayload | null>(routeResult);
  const [resolvedRoomCode, setResolvedRoomCode] = useState<string | null>(
    routeRoomCode ?? routeResult?.game.roomCode ?? null,
  );
  const [isLoadingResult, setIsLoadingResult] = useState(!routeResult && Boolean(gameId));

  useEffect(() => {
    setResolvedResult(routeResult);
    setResolvedRoomCode(routeRoomCode ?? routeResult?.game.roomCode ?? null);
    setIsLoadingResult(!routeResult && Boolean(gameId));
  }, [gameId, routeResult, routeRoomCode]);

  useEffect(() => {
    if (routeResult || !gameId) {
      return;
    }

    const currentGameId = gameId;
    let disposed = false;

    async function loadFinalResult(): Promise<void> {
      setIsLoadingResult(true);
      try {
        const payload = await fetchFinalResult(currentGameId);
        if (disposed) {
          return;
        }

        setResolvedResult(payload);
        setResolvedRoomCode(payload.game.roomCode);
      } catch {
        if (!disposed) {
          setResolvedResult(null);
        }
      } finally {
        if (!disposed) {
          setIsLoadingResult(false);
        }
      }
    }

    void loadFinalResult();

    return () => {
      disposed = true;
    };
  }, [gameId, routeResult]);

  const pageState = createSettlementPageState({
    gameId,
    result: resolvedResult,
    roomCode: resolvedRoomCode,
    routeState,
  });
  const finalLogs = useMemo(() => resolvedResult?.finalLogs ?? [], [resolvedResult]);
  const leaderPlayerId = pageState.rankingRows[0]?.playerId ?? null;
  const timelineLogs = useMemo(
    () => prioritizeFinalLogs(finalLogs, leaderPlayerId),
    [finalLogs, leaderPlayerId],
  );

  const groupedLogs = useMemo(() => groupLogsByCategory(timelineLogs), [timelineLogs]);
  const leaderIncome = pageState.rankingRows[0]?.cumulativeNationalIncome ?? null;
  const runnerUpIncome = pageState.rankingRows[1]?.cumulativeNationalIncome ?? null;

  if (isLoadingResult && !pageState.finalResult) {
    return (
      <section className="panel settlement-dossier settlement-dossier--loading">
        <p style={{ margin: 0 }}>{i18n.t("pages:settlement.loadingArchives")}</p>
      </section>
    );
  }

  const leftRailCards = pageState.finalResult
    ? [
        {
          eyebrow: i18n.t("pages:settlement.finalArchiveEyebrow"),
          title: i18n.t("pages:settlement.archiveSummary"),
          tone: "accent" as const,
          body: pageState.heroDescription,
          metrics: pageState.archiveStats.map((item) => ({ label: item.label, value: item.value })),
        },
        {
          eyebrow: i18n.t("pages:settlement.keyTurningPoints"),
          title: i18n.t("pages:settlement.howItTurned"),
          lines: pageState.turningPointCards.map((card) => `${card.title} · ${card.detail}`),
        },
      ]
    : [
        {
          eyebrow: i18n.t("pages:settlement.finalArchiveEyebrow"),
          title: i18n.t("pages:settlement.noResult"),
          body: pageState.missingResultMessage ?? i18n.t("pages:settlement.noResultAvailable"),
        },
      ];

  const assistRailCards = pageState.finalResult
    ? [
        {
          eyebrow: i18n.t("pages:settlement.assistEyebrow"),
          title: i18n.t("pages:settlement.keyResultsSummary"),
          tone: "accent" as const,
          lines: pageState.highlights,
        },
        {
          eyebrow: i18n.t("pages:settlement.rankingReview"),
          title: i18n.t("pages:settlement.whyStoppedHere"),
          lines: pageState.whyRankChanged,
        },
        {
          eyebrow: i18n.t("pages:settlement.nextGameAdvice"),
          title: i18n.t("pages:settlement.ifAnotherGame"),
          lines: pageState.replayGuidance,
        },
      ]
    : [
        {
          eyebrow: i18n.t("pages:settlement.assistEyebrow"),
          title: i18n.t("pages:settlement.waitingResultSync"),
          body: pageState.missingResultMessage ?? i18n.t("pages:settlement.noResultAvailable"),
        },
      ];

  return (
    <GamePageShell
      assistRail={<GameLeftRail cards={assistRailCards} title={i18n.t("pages:settlement.assistEyebrow")} />}
      assistRailLabel={i18n.t("pages:settlement.assistEyebrow")}
      assistRailTestId="settlement-assist-rail"
      layoutPreset="wide-a"
      centerStage={
        <div className="game-center-stage__stack settlement-center-stage">
          <PhaseHeaderBar
            body={pageState.heroDescription}
            eyebrow={i18n.t("pages:settlement.finalReviewEyebrow")}
            pills={pageState.archiveStats.map((item) => `${item.label} ${item.value}`)}
            title={pageState.heroTitle}
          />
          <div className="settlement-dossier__actions settlement-dossier__actions--stage">
            <Link className="button button--primary" data-testid="settlement-back-lobby" to={pageState.lobbyTargetPath}>
              {i18n.t("pages:settlement.backToLobbyTriumph")}
            </Link>
            <Link
              className="button"
              data-testid="settlement-back-room"
              to={pageState.roomTargetPath}
            >
              {i18n.t("pages:settlement.restartEra")}
            </Link>
          </div>

          {pageState.finalResult ? (
            <div className="settlement-command-center">
              <section className="panel settlement-dossier__panel" data-testid="settlement-ranking-panel">
                <p className="panel__eyebrow settlement-dossier__panel-eyebrow">{i18n.t("pages:settlement.finalRankingTable")}</p>
                <h2 className="settlement-dossier__panel-title">{i18n.t("pages:settlement.whoStandsOnTop")}</h2>
                {pageState.rankingRows.length === 0 ? (
                  <p>{i18n.t("pages:settlement.noRankingData")}</p>
                ) : (
                  <ol className="settlement-dossier__ranking-list">
                    {pageState.rankingRows.map((row) => {
                      const delta = row.rank === 1
                        ? (runnerUpIncome != null ? row.cumulativeNationalIncome - runnerUpIncome : null)
                        : (leaderIncome != null ? row.cumulativeNationalIncome - leaderIncome : null);
                      return (
                        <li key={`${row.rank}-${row.playerId}`} className="settlement-dossier__ranking-row">
                          <div className="settlement-dossier__ranking-header">
                            <strong>{i18n.t("pages:settlement.rankPosition", { rank: row.rank })}</strong>
                            <span>{row.countryLabel}</span>
                            <span className="settlement-dossier__ranking-player">{row.nickname}</span>
                          </div>
                          <p className="settlement-dossier__ranking-income">
                            {formatLabelValue(i18n.t("pages:settlement.cumulativeIncomeLabel"), row.cumulativeNationalIncome)}
                            {delta != null ? (
                              <RankingDelta delta={delta} isLeader={row.rank === 1} />
                            ) : null}
                          </p>
                          <p className="settlement-dossier__ranking-tiebreak">{formatLabelValue(i18n.t("pages:settlement.tieBreakLabel"), row.tieBreakSummary)}</p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              <section className="panel settlement-dossier__panel settlement-dossier__panel--timeline" data-testid="settlement-final-logs">
                <p className="panel__eyebrow settlement-dossier__panel-eyebrow">{i18n.t("pages:settlement.finalLogTimeline")}</p>
                <h2 className="settlement-dossier__panel-title">{i18n.t("pages:settlement.lastDecisiveRecords")}</h2>
                {finalLogs.length === 0 ? (
                  <p>{i18n.t("pages:settlement.noFinalLogs")}</p>
                ) : (
                  <div className="settlement-dossier__timeline-groups">
                    {groupedLogs.map((group) => {
                      const categoryMeta = getLogCategoryMeta(group.category);
                      return (
                        <section
                          key={group.category}
                          className="settlement-dossier__timeline-group"
                          data-testid={`settlement-log-group-${group.category}`}
                        >
                          <header className="settlement-dossier__timeline-group-header">
                            <span aria-hidden="true">{categoryMeta.emoji}</span>
                            <strong>{categoryMeta.label}</strong>
                            <span className="settlement-dossier__timeline-group-count">{i18n.t("pages:settlement.entryCount", { count: group.entries.length })}</span>
                          </header>
                          <ol className="settlement-dossier__timeline">
                            {group.entries.map((entry, index) => (
                              <li key={`${group.category}-${entry.key}-${index}`} className="settlement-dossier__timeline-item">
                                <div className="settlement-dossier__timeline-meta">
                                  <strong>
                                    <span aria-hidden="true" style={{ marginRight: 4 }}>{categoryMeta.emoji}</span>
                                    {entry.label}
                                  </strong>
                                  <span>{entry.meta}</span>
                                </div>
                                <LogMessage message={entry.message} />
                              </li>
                            ))}
                          </ol>
                        </section>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <section className="panel settlement-dossier__panel">
              <p>{pageState.missingResultMessage}</p>
            </section>
          )}
        </div>
      }
      centerStageTestId="settlement-center-stage"
      leftRail={<GameLeftRail cards={leftRailCards} title={i18n.t("pages:settlement.finalArchiveEyebrow")} />}
      leftRailLabel={i18n.t("pages:settlement.finalArchiveEyebrow")}
      leftRailTestId="settlement-left-rail"
      situationBar={
        <div className="settlement-status-bar">
          <div className="settlement-status-bar__title">{formatLabelValue(i18n.t("pages:settlement.archiveIdLabel"), pageState.gameIdLabel)}</div>
          <div className="settlement-status-bar__meta">
            {pageState.finalResult
              ? `${i18n.t("pages:settlement.finalRoundLabel")} ${pageState.finalResult.game.currentRound} / ${pageState.finalResult.game.totalRounds}`
              : i18n.t("pages:settlement.waitingResultSync")}
          </div>
        </div>
      }
    />
  );
}

type GroupedLogEntry = {
  key: string;
  label: string;
  message: string;
  meta: string;
};

type GroupedLogSection = {
  category: LogCategory;
  entries: GroupedLogEntry[];
};

function groupLogsByCategory(logs: GameLog[]): GroupedLogSection[] {
  const buckets = new Map<LogCategory, GroupedLogEntry[]>();
  logs.forEach((log, index) => {
    const category = categorizeLogKind(log.kind);
    const categoryMeta = getLogCategoryMeta(category);
    const entry: GroupedLogEntry = {
      key: `${log.kind}-${log.createdAt ?? index}`,
      label: log.phase ? formatPhaseLabel(log.phase) : categoryMeta.label,
      message: sanitizeFinalLogMessage(log.message, log.roundNo, log.phase),
      meta: formatLogMeta(log.roundNo, log.createdAt),
    };
    const list = buckets.get(category) ?? [];
    list.push(entry);
    buckets.set(category, list);
  });

  return LOG_CATEGORY_ORDER
    .filter((cat) => buckets.has(cat))
    .map((category) => ({ category, entries: buckets.get(category) ?? [] }));
}

function prioritizeFinalLogs(logs: GameLog[], leaderPlayerId: string | null): GameLog[] {
  return [...logs].sort((a, b) => {
    const priorityDelta = getFinalLogPriority(b, leaderPlayerId) - getFinalLogPriority(a, leaderPlayerId);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const roundDelta = (b.roundNo ?? 0) - (a.roundNo ?? 0);
    if (roundDelta !== 0) {
      return roundDelta;
    }

    return getLogTimeValue(b.createdAt) - getLogTimeValue(a.createdAt);
  });
}

function getFinalLogPriority(log: GameLog, leaderPlayerId: string | null): number {
  const category = categorizeLogKind(log.kind);
  const detailsPlayerId = typeof log.details?.playerId === "string" ? log.details.playerId : null;
  let score = 0;

  if (detailsPlayerId && leaderPlayerId && detailsPlayerId === leaderPlayerId) {
    score += 80;
  }

  switch (category) {
    case "final":
      score += 100;
      break;
    case "military":
      score += 70;
      break;
    case "overseas":
      score += 60;
      break;
    case "decision":
      score += 55;
      break;
    case "events":
      score += 50;
      break;
    case "economy":
      score += log.kind === "settlement.resolved" ? 20 : 35;
      break;
    default:
      score += 10;
  }

  return score;
}

function getLogTimeValue(createdAt: string | null): number {
  if (!createdAt) {
    return 0;
  }
  const value = Date.parse(createdAt);
  return Number.isFinite(value) ? value : 0;
}

function formatPhaseLabel(phase: string): string {
  switch (phase) {
    case "decision":
      return i18n.t("game:phase.decision");
    case "settlement":
      return i18n.t("game:phase.settlement");
    case "market":
      return i18n.t("game:phase.market");
    default:
      return phase;
  }
}

function sanitizeFinalLogMessage(message: string, roundNo: number, phase: string | null): string {
  const trimmed = message.trim();
  if (
    trimmed.includes("completed national income allocation")
    || (trimmed.includes(" completed Round ") && trimmed.endsWith(" fiscal allocation."))
  ) {
    const countryKey = trimmed.split(" ", 1)[0].toLowerCase();
    return `${getCountryLabel(countryKey)}${i18n.t("pages:settlement.completedAllocation", { round: roundNo })}`;
  }
  if (trimmed === "settlement settled." || trimmed === "Final fiscal settlement is complete.") {
    return i18n.t("pages:settlement.finalSettlementComplete");
  }
  if (trimmed === "market settled.") {
    return i18n.t("pages:settlement.marketSettlementComplete");
  }
  if (trimmed === "decision settled.") {
    return i18n.t("pages:settlement.decisionSettlementComplete");
  }
  if (trimmed.endsWith(" settled.") && phase) {
    return `${formatPhaseLabel(phase)}${i18n.t("pages:settlement.phaseSettlementComplete")}`;
  }
  return translateBackend(message);
}

function formatLogMeta(roundNo: number, createdAt: string | null): string {
  const roundLabel = Number.isFinite(roundNo) ? i18n.t("pages:settlement.roundLabel", { round: roundNo }) : i18n.t("pages:settlement.unknownRound");
  const timeLabel = createdAt ? createdAt.replace("T", " ").replace("Z", "") : i18n.t("pages:settlement.timeNotRecorded");
  return `${roundLabel} · ${timeLabel}`;
}

function LogMessage({ message }: { message: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = message.length > LOG_TRUNCATE_LENGTH;

  if (!isLong) {
    return <p className="settlement-dossier__timeline-message">{message}</p>;
  }

  return (
    <div className="settlement-dossier__timeline-message">
      <p style={{ margin: 0 }}>
        {expanded ? message : `${message.slice(0, LOG_TRUNCATE_LENGTH)}…`}
      </p>
      <button
        aria-expanded={expanded}
        className="gp-btn"
        onClick={() => setExpanded((value) => !value)}
        style={{ marginTop: 6, padding: "2px 10px", fontSize: 12 }}
        type="button"
      >
        {expanded ? i18n.t("pages:settlement.collapse") : i18n.t("pages:settlement.expand")}
      </button>
    </div>
  );
}

function RankingDelta({ delta, isLeader }: { delta: number; isLeader: boolean }) {
  if (delta === 0) {
    return (
      <span className="settlement-dossier__ranking-delta" style={{ marginLeft: 8, color: "var(--game-text-secondary)" }}>
        {i18n.t("pages:settlement.even")}
      </span>
    );
  }

  const arrow = delta > 0 ? "▲" : "▼";
  const color = delta > 0 ? "#3fb27f" : "#e76161";
  const label = isLeader
    ? i18n.t("pages:settlement.leadingBy", { amount: Math.abs(delta) })
    : i18n.t("pages:settlement.trailingBy", { amount: Math.abs(delta) });

  return (
    <span
      className="settlement-dossier__ranking-delta"
      data-testid="ranking-delta"
      style={{ marginLeft: 8, color, fontWeight: 600 }}
    >
      {arrow} {label}
    </span>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { GameLeftRail } from "../components/game/layout/GameLeftRail";
import { GamePageShell } from "../components/game/layout/GamePageShell";
import { PhaseHeaderBar } from "../components/game/layout/PhaseHeaderBar";
import { createSettlementPageState } from "../features/game/flow/settlementFlow";
import { getCountryLabel } from "../features/game/panelGlossary";
import type { GameFinishedPayload } from "../features/game/runtime/types";
import { fetchFinalResult } from "../services/game";
import type { GameLog } from "../types/domain";

const LOG_CATEGORY_ORDER = ["final", "military", "diplomacy", "decision", "events", "economy", "other"] as const;
type LogCategory = (typeof LOG_CATEGORY_ORDER)[number];

const LOG_CATEGORY_META: Record<LogCategory, { label: string; emoji: string }> = {
  final: { label: "终局裁定", emoji: "🏆" },
  events: { label: "事件与异常", emoji: "⚠️" },
  economy: { label: "经济与财政", emoji: "💰" },
  military: { label: "军事与征服", emoji: "⚔️" },
  diplomacy: { label: "外交关系", emoji: "🤝" },
  decision: { label: "国家决策", emoji: "🏛" },
  other: { label: "其他记录", emoji: "📋" },
};

const LOG_TRUNCATE_LENGTH = 80;

function categorizeLogKind(kind: string): LogCategory {
  const k = (kind ?? "").toLowerCase();
  if (k.includes("revolt") || k.includes("rebel") || k.includes("crisis")) return "events";
  if (k.includes("final")) return "final";
  if (k.includes("military") || k.includes("conquest") || k.includes("war") || k.includes("colon") || k.includes("naval") || k.includes("loot")) return "military";
  if (k.includes("diplomacy") || k.includes("peace") || k.includes("treaty")) return "diplomacy";
  if (k.startsWith("market") || k.startsWith("settlement") || k.includes("budget") || k.includes("income")) return "economy";
  if (k.startsWith("decision") || k.includes("reform") || k.includes("policy")) return "decision";
  return "other";
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
        <p style={{ margin: 0 }}>正在整理这局的终局档案，请稍候。</p>
      </section>
    );
  }

  const leftRailCards = pageState.finalResult
    ? [
        {
          eyebrow: "最终国家档案",
          title: "档案摘要",
          tone: "accent" as const,
          body: pageState.heroDescription,
          metrics: pageState.archiveStats.map((item) => ({ label: item.label, value: item.value })),
        },
        {
          eyebrow: "关键转折",
          title: "这局是怎么转向的",
          lines: pageState.turningPointCards.map((card) => `${card.title} · ${card.detail}`),
        },
      ]
    : [
        {
          eyebrow: "最终国家档案",
          title: "暂无结果",
          body: pageState.missingResultMessage ?? "当前还没有可展示的对局结果。",
        },
      ];

  const assistRailCards = pageState.finalResult
    ? [
        {
          eyebrow: "终局判断辅助",
          title: "关键结果摘要",
          tone: "accent" as const,
          lines: pageState.highlights,
        },
        {
          eyebrow: "排名复盘",
          title: "为什么停在这里",
          lines: pageState.whyRankChanged,
        },
        {
          eyebrow: "下局建议",
          title: "如果再来一局",
          lines: pageState.replayGuidance,
        },
      ]
    : [
        {
          eyebrow: "终局判断辅助",
          title: "等待结果同步",
          body: pageState.missingResultMessage ?? "当前还没有可展示的对局结果。",
        },
      ];

  return (
    <GamePageShell
      assistRail={<GameLeftRail cards={assistRailCards} title="终局判断辅助" />}
      assistRailLabel="终局判断辅助"
      assistRailTestId="settlement-assist-rail"
      layoutPreset="wide-a"
      centerStage={
        <div className="game-center-stage__stack settlement-center-stage">
          <PhaseHeaderBar
            body={pageState.heroDescription}
            eyebrow="终局复盘"
            pills={pageState.archiveStats.map((item) => `${item.label} ${item.value}`)}
            title={pageState.heroTitle}
          />
          <div className="settlement-dossier__actions settlement-dossier__actions--stage">
            <Link className="button button--primary" data-testid="settlement-back-lobby" to={pageState.lobbyTargetPath}>
              凯旋并返回大厅
            </Link>
            <Link
              className="button"
              data-testid="settlement-back-room"
              to={pageState.roomTargetPath}
            >
              重开纪元
            </Link>
          </div>

          {pageState.finalResult ? (
            <div className="settlement-command-center">
              <section className="panel settlement-dossier__panel" data-testid="settlement-ranking-panel">
                <p className="panel__eyebrow settlement-dossier__panel-eyebrow">最终排名主表</p>
                <h2 className="settlement-dossier__panel-title">最后谁站在榜首</h2>
                {pageState.rankingRows.length === 0 ? (
                  <p>当前结算结果未附带最终排名。</p>
                ) : (
                  <ol className="settlement-dossier__ranking-list">
                    {pageState.rankingRows.map((row) => {
                      const delta = row.rank === 1
                        ? (runnerUpIncome != null ? row.cumulativeNationalIncome - runnerUpIncome : null)
                        : (leaderIncome != null ? row.cumulativeNationalIncome - leaderIncome : null);
                      return (
                        <li key={`${row.rank}-${row.playerId}`} className="settlement-dossier__ranking-row">
                          <div className="settlement-dossier__ranking-header">
                            <strong>第 {row.rank} 名</strong>
                            <span>{row.countryLabel}</span>
                            <span className="settlement-dossier__ranking-player">{row.nickname}</span>
                          </div>
                          <p className="settlement-dossier__ranking-income">
                            累计国家收入：{row.cumulativeNationalIncome}
                            {delta != null ? (
                              <RankingDelta delta={delta} isLeader={row.rank === 1} />
                            ) : null}
                          </p>
                          <p className="settlement-dossier__ranking-tiebreak">同分比较：{row.tieBreakSummary}</p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              <section className="panel settlement-dossier__panel settlement-dossier__panel--timeline" data-testid="settlement-final-logs">
                <p className="panel__eyebrow settlement-dossier__panel-eyebrow">终局日志时间线</p>
                <h2 className="settlement-dossier__panel-title">最后几条决定性记录</h2>
                {finalLogs.length === 0 ? (
                  <p>当前结果未附带最终日志。</p>
                ) : (
                  <div className="settlement-dossier__timeline-groups">
                    {groupedLogs.map((group) => (
                      <section
                        key={group.category}
                        className="settlement-dossier__timeline-group"
                        data-testid={`settlement-log-group-${group.category}`}
                      >
                        <header className="settlement-dossier__timeline-group-header">
                          <span aria-hidden="true">{LOG_CATEGORY_META[group.category].emoji}</span>
                          <strong>{LOG_CATEGORY_META[group.category].label}</strong>
                          <span className="settlement-dossier__timeline-group-count">{group.entries.length} 条</span>
                        </header>
                        <ol className="settlement-dossier__timeline">
                          {group.entries.map((entry, index) => (
                            <li key={`${group.category}-${entry.key}-${index}`} className="settlement-dossier__timeline-item">
                              <div className="settlement-dossier__timeline-meta">
                                <strong>
                                  <span aria-hidden="true" style={{ marginRight: 4 }}>{LOG_CATEGORY_META[group.category].emoji}</span>
                                  {entry.label}
                                </strong>
                                <span>{entry.meta}</span>
                              </div>
                              <LogMessage message={entry.message} />
                            </li>
                          ))}
                        </ol>
                      </section>
                    ))}
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
      leftRail={<GameLeftRail cards={leftRailCards} title="最终国家档案" />}
      leftRailLabel="最终国家档案"
      leftRailTestId="settlement-left-rail"
      situationBar={
        <div className="settlement-status-bar">
          <div className="settlement-status-bar__title">终局档案号：{pageState.gameIdLabel}</div>
          <div className="settlement-status-bar__meta">
            {pageState.finalResult
              ? `终局回合 ${pageState.finalResult.game.currentRound} / ${pageState.finalResult.game.totalRounds}`
              : "等待终局结果同步"}
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
    const entry: GroupedLogEntry = {
      key: `${log.kind}-${log.createdAt ?? index}`,
      label: log.phase ? formatPhaseLabel(log.phase) : LOG_CATEGORY_META[category].label,
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
    case "diplomacy":
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
      return "国家决策";
    case "settlement":
      return "财政结算";
    case "market":
      return "市场出售";
    default:
      return phase;
  }
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
    return `${formatPhaseLabel(phase)}阶段已完成。`;
  }
  return message;
}

function formatLogMeta(roundNo: number, createdAt: string | null): string {
  const roundLabel = Number.isFinite(roundNo) ? `第 ${roundNo} 回合` : "未知回合";
  const timeLabel = createdAt ? createdAt.replace("T", " ").replace("Z", "") : "时间未记录";
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
        {expanded ? "收起" : "展开"}
      </button>
    </div>
  );
}

function RankingDelta({ delta, isLeader }: { delta: number; isLeader: boolean }) {
  if (delta === 0) {
    return (
      <span className="settlement-dossier__ranking-delta" style={{ marginLeft: 8, color: "var(--game-text-secondary)" }}>
        持平
      </span>
    );
  }

  const arrow = delta > 0 ? "▲" : "▼";
  const color = delta > 0 ? "#3fb27f" : "#e76161";
  const label = isLeader ? `领先 ${Math.abs(delta)}` : `落后 ${Math.abs(delta)}`;

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

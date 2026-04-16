import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { GameLeftRail } from "../components/game/layout/GameLeftRail";
import { GamePageShell } from "../components/game/layout/GamePageShell";
import { PhaseHeaderBar } from "../components/game/layout/PhaseHeaderBar";
import { createSettlementPageState } from "../features/game/flow/settlementFlow";
import type { GameFinishedPayload } from "../features/game/runtime/types";
import { fetchFinalResult } from "../services/game";

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
                    {pageState.rankingRows.map((row) => (
                      <li key={`${row.rank}-${row.playerId}`} className="settlement-dossier__ranking-row">
                        <div className="settlement-dossier__ranking-header">
                          <strong>第 {row.rank} 名</strong>
                          <span>{row.countryLabel}</span>
                          <span className="settlement-dossier__ranking-player">{row.nickname}</span>
                        </div>
                        <p className="settlement-dossier__ranking-income">累计国家收入：{row.cumulativeNationalIncome}</p>
                        <p className="settlement-dossier__ranking-tiebreak">同分比较：{row.tieBreakSummary}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="panel settlement-dossier__panel settlement-dossier__panel--timeline" data-testid="settlement-final-logs">
                <p className="panel__eyebrow settlement-dossier__panel-eyebrow">终局日志时间线</p>
                <h2 className="settlement-dossier__panel-title">最后几条决定性记录</h2>
                {finalLogs.length === 0 ? (
                  <p>当前结果未附带最终日志。</p>
                ) : (
                  <ol className="settlement-dossier__timeline">
                    {pageState.timelineEntries.map((entry) => (
                      <li key={entry.key} className="settlement-dossier__timeline-item">
                        <div className="settlement-dossier__timeline-meta">
                          <strong>{entry.label}</strong>
                          <span>{entry.meta}</span>
                        </div>
                        <p className="settlement-dossier__timeline-message">{entry.message}</p>
                      </li>
                    ))}
                  </ol>
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

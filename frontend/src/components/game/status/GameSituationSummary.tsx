import type { ResourceStripViewModel, TopWorkflowViewModel } from "../../../features/game/flow/gameWorkbench";
import type { DecisionStepId } from "../../../features/game/flow/decisionFlow";
import type { GameRuntimeState } from "../../../features/game/runtime/types";
import {
  formatSeconds,
  getCountryLabel,
  getPhaseLabel,
  getSocketStateLabel,
} from "../../../features/game/labels";

type GameSituationSummaryProps = {
  runtimeState: GameRuntimeState;
  isLoading: boolean;
  resourceStrip?: ResourceStripViewModel;
  workflow?: TopWorkflowViewModel;
  onWorkflowStepChange?: (step: DecisionStepId) => void;
};

export function GameSituationSummary({
  runtimeState,
  isLoading,
  resourceStrip = null,
  workflow = null,
  onWorkflowStepChange,
}: GameSituationSummaryProps) {
  const currentRound = runtimeState.snapshot?.round ?? runtimeState.game?.currentRound ?? 0;
  const totalRounds = runtimeState.snapshot?.maxRounds ?? runtimeState.game?.totalRounds ?? 15;
  const currentPhase = runtimeState.snapshot?.phase ?? runtimeState.game?.currentPhase ?? null;
  const currentPlayer = runtimeState.room?.members.find((member) => member.playerId === runtimeState.session?.playerId) ?? null;
  const currentPlayerId = currentPlayer?.playerId ?? runtimeState.session?.playerId ?? null;
  const currentCountry = currentPlayer?.selectedCountry ?? runtimeState.session?.selectedCountry ?? null;
  const currentPlayerState = currentPlayerId
    ? runtimeState.snapshot?.nationalStateByPlayer[currentPlayerId] ?? null
    : null;
  const activeEvents = runtimeState.snapshot?.activeEvents ?? [];

  return (
    <div className="game-situation-bar">
      <div className="game-situation-bar__mainline">
        <div className="game-situation-bar__identity">
          <div className="game-situation-pill game-situation-pill--country">
            <span className="game-situation-pill__label">统治国家</span>
            <strong data-testid="game-country" className="game-situation-pill__value">
              {currentCountry ? getCountryLabel(currentCountry) : "待分配国家"}
            </strong>
          </div>
          <div className="game-situation-bar__commander">
            {currentCountry ? `国家代表 - ${getCountryLabel(currentCountry)}` : currentPlayer?.nickname ?? runtimeState.session?.nickname ?? "接入频段..."}
          </div>
        </div>

        <div className="game-situation-bar__round">
          <span data-testid="game-round" className="game-situation-bar__round-text">
            第 {currentRound} / {totalRounds} 回合
          </span>
          <span data-testid="game-phase" className="game-situation-bar__phase-text">
            当前阶段：{currentPhase ? getPhaseLabel(currentPhase) : "通讯同步中"}
          </span>
        </div>

        <div className="game-situation-bar__meta">
          {runtimeState.secondsRemaining !== null ? (
            <div className="game-situation-pill">
              <span className="game-situation-pill__label">阶段时钟</span>
              <strong className="game-situation-pill__value">{formatSeconds(runtimeState.secondsRemaining)}</strong>
            </div>
          ) : null}
          <div
            data-testid="game-connection"
            className="game-situation-bar__connection"
            style={{
              color: runtimeState.socketState === "connected" ? "var(--color-success)" : "var(--color-danger)",
            }}
          >
            {isLoading ? "同步中" : getSocketStateLabel(runtimeState.socketState)}
          </div>
        </div>
      </div>

      {workflow?.steps.length ? (
        <div className="game-situation-bar__workflow" data-testid="game-workflow-bar">
          {workflow.steps.map((step) => (
            <button
              key={step.id}
              aria-pressed={step.isActive}
              className={step.isActive ? "game-situation-workflow-chip game-situation-workflow-chip--active" : "game-situation-workflow-chip"}
              data-testid={`game-workflow-step-${step.id}`}
              onClick={() => onWorkflowStepChange?.(step.id)}
              type="button"
            >
              <span className="game-situation-workflow-chip__title">{step.label}</span>
              <span className="game-situation-workflow-chip__state">{step.statusLabel}</span>
            </button>
          ))}
        </div>
      ) : null}

      {resourceStrip ? (
        <div className="game-situation-bar__resource-strip" data-testid="game-resource-strip">
          {resourceStrip.metrics.map((metric) => (
            <span
              key={metric.label}
              className={metric.tone === "warning"
                ? "game-situation-resource-pill game-situation-resource-pill--warning"
                : "game-situation-resource-pill"
              }
            >
              <span className="game-situation-resource-pill__label">{metric.label}</span>
              <span className="game-situation-resource-pill__value">{metric.value}</span>
            </span>
          ))}
        </div>
      ) : null}

      {runtimeState.snapshot ? (
        <div
          className="game-situation-bar__intel-strip"
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "1fr",
          }}
        >
          <section
            data-testid="game-active-events"
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: 16,
              padding: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <strong>国际事件</strong>
              <span style={{ color: "var(--game-text-secondary)", fontSize: 13 }}>
                {activeEvents.length > 0 ? `${activeEvents.length} 条生效中` : "本轮暂无事件"}
              </span>
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {activeEvents.length > 0 ? activeEvents.map((event) => (
                <article
                  key={event.eventId}
                  data-testid={`game-active-event-${event.eventId}`}
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    borderRadius: 12,
                    padding: "10px 12px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <strong>{event.label}</strong>
                    <span style={{ color: "var(--game-text-secondary)", fontSize: 13 }}>
                      剩余 {event.remainingRounds} 回合
                    </span>
                  </div>
                  <p style={{ margin: "6px 0 0", color: "var(--game-text-secondary)", fontSize: 13 }}>
                    {event.description}
                  </p>
                </article>
              )) : (
                <div style={{ color: "var(--game-text-secondary)", fontSize: 13 }}>
                  当前没有处于生效期的国际事件。
                </div>
              )}
            </div>
          </section>

          {currentPlayerState ? (
            <section
              data-testid="game-ideology-panel"
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 16,
                padding: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>意识形态与改革</strong>
                <span style={{ color: "var(--game-text-secondary)", fontSize: 13 }}>
                  {currentPlayerState.reforms.length > 0 ? `已激活 ${currentPlayerState.reforms.length} 项改革` : "尚未激活改革"}
                </span>
              </div>
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {IDEOLOGY_ORDER.map((ideologyKey) => {
                  const level = clampIdeologyLevel(currentPlayerState.ideologyLevels[ideologyKey] ?? 0);
                  return (
                    <div key={ideologyKey}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span>{IDEOLOGY_LABELS[ideologyKey]}</span>
                        <strong>{level} / 10</strong>
                      </div>
                      <div
                        style={{
                          background: "rgba(255, 255, 255, 0.08)",
                          borderRadius: 999,
                          height: 8,
                          marginTop: 6,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            background: "linear-gradient(90deg, #f1c27d 0%, #f97316 100%)",
                            borderRadius: 999,
                            height: "100%",
                            width: `${level * 10}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                {currentPlayerState.reforms.length > 0 ? currentPlayerState.reforms.map((reform) => (
                  <span
                    key={reform}
                    style={{
                      background: "rgba(249, 115, 22, 0.16)",
                      borderRadius: 999,
                      color: "#ffd7aa",
                      fontSize: 12,
                      padding: "4px 10px",
                    }}
                  >
                    {reform}
                  </span>
                )) : (
                  <span style={{ color: "var(--game-text-secondary)", fontSize: 13 }}>
                    继续推进内需、工业和外部扩张，才能触发 5/10 级改革节点。
                  </span>
                )}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const IDEOLOGY_ORDER = ["liberalism", "egalitarianism", "nationalism"] as const;

const IDEOLOGY_LABELS: Record<(typeof IDEOLOGY_ORDER)[number], string> = {
  liberalism: "自由主义",
  egalitarianism: "平等主义",
  nationalism: "民族主义",
};

function clampIdeologyLevel(value: number): number {
  return Math.max(0, Math.min(10, Number.isFinite(value) ? value : 0));
}

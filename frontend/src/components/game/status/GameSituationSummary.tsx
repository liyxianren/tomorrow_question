import { useTranslation } from "react-i18next";
import i18n, { translateBackend } from "../../../i18n";
import { buildEffectMetrics } from "../../../features/game/decisionShared";
import type { ResourceStripViewModel, TopWorkflowViewModel } from "../../../features/game/flow/gameWorkbench";
import type { DecisionStepId } from "../../../features/game/flow/decisionFlow";
import type { GameRuntimeState } from "../../../features/game/runtime/types";
import type { ActiveEvent } from "../../../types";
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
  const { t } = useTranslation();
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
            <span className="game-situation-pill__label">{t("game:situation.rulingCountry")}</span>
            <strong data-testid="game-country" className="game-situation-pill__value">
              {currentCountry ? getCountryLabel(currentCountry) : t("game:situation.countryPending")}
            </strong>
          </div>
          <div className="game-situation-bar__commander">
            {currentCountry ? `${t("game:situation.countryRepresentative")} - ${getCountryLabel(currentCountry)}` : currentPlayer?.nickname ?? runtimeState.session?.nickname ?? t("game:situation.connecting")}
          </div>
        </div>

        <div className="game-situation-bar__round">
          <span data-testid="game-round" className="game-situation-bar__round-text">
            {t("game:situation.roundText")} {currentRound} / {totalRounds}
          </span>
          <span data-testid="game-phase" className="game-situation-bar__phase-text">
            {t("game:situation.phaseLabel")}：{currentPhase ? getPhaseLabel(currentPhase) : t("game:situation.phaseSyncing")}
          </span>
        </div>

        <div className="game-situation-bar__meta">
          {runtimeState.secondsRemaining !== null ? (
            <div className="game-situation-pill">
              <span className="game-situation-pill__label">{t("game:situation.phaseClock")}</span>
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
            {isLoading ? t("game:situation.syncing") : getSocketStateLabel(runtimeState.socketState)}
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
              <strong>{t("game:situation.internationalEvents")}</strong>
              <span style={{ color: "var(--game-text-secondary)", fontSize: 13 }}>
                {activeEvents.length > 0 ? `${activeEvents.length} ${t("game:situation.eventsActive")}` : t("game:situation.noEventsThisRound")}
              </span>
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {activeEvents.length > 0 ? activeEvents.map((event) => (
                <ActiveEventCard key={event.eventId} event={event} />
              )) : (
                <div style={{ color: "var(--game-text-secondary)", fontSize: 13 }}>
                  {t("game:situation.noActiveEvents")}
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
                <strong>{t("game:situation.ideologyAndReforms")}</strong>
                <span style={{ color: "var(--game-text-secondary)", fontSize: 13 }}>
                  {currentPlayerState.reforms.length > 0 ? `${currentPlayerState.reforms.length} ${t("game:situation.reformsActive")}` : t("game:situation.noReformsActive")}
                </span>
              </div>
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {IDEOLOGY_ORDER.map((ideologyKey) => {
                  const level = clampIdeologyLevel(currentPlayerState.ideologyLevels[ideologyKey] ?? 0);
                  return (
                    <div key={ideologyKey}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span>{getIdeologyLabel(ideologyKey)}</span>
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
                    {t("game:situation.pushReformsHint")}
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

function ActiveEventCard({ event }: { event: ActiveEvent }) {
  const { t } = useTranslation();
  const effectMetrics = buildEffectMetrics(
    event.effects as Record<string, number | Record<string, number>> | undefined,
  );

  return (
    <article
      data-testid={`game-active-event-${event.eventId}`}
      style={{
        background: "rgba(255, 255, 255, 0.03)",
        borderRadius: 12,
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <strong>{translateBackend(event.label)}</strong>
        <span style={{ color: "var(--game-text-secondary)", fontSize: 13 }}>
          {t("game:situation.remainingRounds")} {event.remainingRounds}
        </span>
      </div>
      <p style={{ margin: "6px 0 0", color: "var(--game-text-secondary)", fontSize: 13 }}>
        {translateBackend(event.description)}
      </p>
      {effectMetrics.length > 0 ? (
        <div
          aria-label={t("game:situation.eventEffects", "事件效果")}
          style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}
        >
          {effectMetrics.map((metric) => (
            <span
              key={`${metric.label}-${metric.value}`}
              style={{
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: 999,
                color: metric.tone === "negative" ? "var(--color-danger)" : metric.tone === "positive" ? "var(--color-success)" : "var(--game-text-secondary)",
                fontSize: 12,
                padding: "2px 8px",
              }}
            >
              {metric.label} {metric.value}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

const IDEOLOGY_ORDER = ["liberalism", "egalitarianism", "nationalism"] as const;

function getIdeologyLabel(key: string): string {
  return i18n.t(`game:ideology.${key}`);
}

function clampIdeologyLevel(value: number): number {
  return Math.max(0, Math.min(10, Number.isFinite(value) ? value : 0));
}

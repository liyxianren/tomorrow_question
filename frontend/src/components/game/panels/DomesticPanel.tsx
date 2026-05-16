import { useTranslation } from "react-i18next";
import i18n, { translateBackend } from "../../../i18n";
import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import {
  calculateDecisionMarketReferencePrice,
  formatSignedValue,
} from "../../../features/game/decisionShared";
import { DecisionStatStrip } from "./shared/DecisionStatStrip";
import "./DomesticPanel.css";

const EFFECT_KEYS = [
  "domesticMarketCapacityDelta",
  "domesticPriceBonusDelta",
  "handicraftCapacityDelta",
  "overseasMarketCapacityDelta",
] as const;

function getEffectLabel(key: (typeof EFFECT_KEYS)[number]): string {
  const map: Record<string, string> = {
    domesticMarketCapacityDelta: i18n.t("game:domestic.effectCapacityDelta", "Domestic Capacity"),
    domesticPriceBonusDelta: i18n.t("game:domestic.effectPriceBonus", "Domestic Price"),
    handicraftCapacityDelta: i18n.t("game:productionRoute.handicraft"),
    overseasMarketCapacityDelta: i18n.t("game:domestic.effectOverseasCapacity", "Overseas Capacity"),
  };
  return map[key] ?? key;
}

function formatNumber(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100) / 100}`;
}

function sumEffect(
  actions: DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"],
  effectKey: (typeof EFFECT_KEYS)[number],
): number {
  return actions.reduce((sum, action) => {
    const value = action.effects?.[effectKey];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

function hasMarketPreviewEffect(action: DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"][number]): boolean {
  return EFFECT_KEYS.some((key) => typeof action.effects?.[key] === "number");
}

export interface DomesticPanelProps {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingDomesticBudget: number;
}

export function DomesticPanel({
  workspace,
  draft,
  remainingDomesticBudget,
}: DomesticPanelProps) {
  const { t } = useTranslation();
  const queuedStrategyIds = new Set(
    draft.governmentPlan.strategySelections.map((item) => item.actionId),
  );
  const selectedMarketStrategies = workspace.governmentActions.strategies.filter((action) =>
    queuedStrategyIds.has(action.actionId) && hasMarketPreviewEffect(action),
  );
  const selectedCapacityDelta = sumEffect(selectedMarketStrategies, "domesticMarketCapacityDelta");
  const selectedPriceDelta = sumEffect(selectedMarketStrategies, "domesticPriceBonusDelta");
  const selectedEffectSummary = EFFECT_KEYS
    .map((key) => ({ key, value: sumEffect(selectedMarketStrategies, key) }))
    .filter((item) => item.value !== 0);

  const phase1Economy = workspace.phase1Economy;
  const baseDomesticCapacity = workspace.domesticMarketCapacity
    ?? phase1Economy?.domesticDemand
    ?? undefined;
  const projectedDomesticCapacity = baseDomesticCapacity != null
    ? Math.max(0, baseDomesticCapacity + selectedCapacityDelta)
    : undefined;
  const referencePrice = calculateDecisionMarketReferencePrice(phase1Economy, selectedPriceDelta);
  const projectedDomesticDemand = phase1Economy?.domesticDemand != null
    ? Math.max(0, phase1Economy.domesticDemand)
    : undefined;
  const domesticPriceHint = phase1Economy
    ? [
        `${t("game:domestic.equilibriumPriceLabel")} ${formatNumber(referencePrice.basePrice)}`,
        `${t("game:government.marketDemand")} ${formatSignedValue(referencePrice.existingPriceBonus)}`,
        selectedPriceDelta !== 0 ? `${t("game:domestic.governmentAdjustment")} ${formatSignedValue(selectedPriceDelta)}` : null,
        `${t("game:market.capacityLimit")} ${referencePrice.priceCeiling}`,
        referencePrice.isCapped ? t("game:domestic.equilibriumPriceCapped") : null,
      ].filter(Boolean).join(", ")
    : null;

  return (
    <div className="domestic-panel" data-testid="domestic-panel">
      <div className="domestic-panel__header">
        <h3 className="domestic-panel__title">🏛️ {t("game:domestic.title")}</h3>
        <span className="domestic-panel__budget">{t("game:domestic.marketPreview")}</span>
      </div>

      <DecisionStatStrip
        items={[
          {
            icon: "💰",
            value: remainingDomesticBudget,
            label: t("game:domestic.consumerPurchasingPower"),
          },
          {
            icon: "🧺",
            value: projectedDomesticDemand != null ? formatNumber(projectedDomesticDemand) : "—",
            label: t("game:market.demand"),
          },
          {
            icon: "📦",
            value: projectedDomesticCapacity != null ? formatNumber(projectedDomesticCapacity) : "—",
            label: t("game:domestic.capacityCapLabel"),
          },
          {
            icon: "🏷️",
            value: referencePrice.price != null ? formatNumber(referencePrice.price) : "—",
            label: referencePrice.isCapped ? t("game:domestic.equilibriumPriceCapped") : t("game:domestic.equilibriumPriceLabel"),
          },
        ]}
      />

      <div className="domestic-panel--v2">
        <div className="domestic-panel--v2__left">
          <div className="domestic-market-card">
            <h4 className="domestic-section-label">📈 {t("game:domestic.domesticEconomyPreview")}</h4>
            <p className="domestic-section-note">
              {t("game:domestic.domesticEconomyDesc")}
            </p>
            <div className="domestic-panel--v2__metrics">
              <div className="gp-metric">
                <span className="gp-metric__label">{t("game:domestic.equilibriumPriceLabel")}</span>
                <span className="gp-metric__value">
                  {phase1Economy?.equilibriumPrice != null ? `${formatNumber(phase1Economy.equilibriumPrice)} ${t("game:market.fiscalPerUnit")}` : "—"}
                </span>
                {phase1Economy ? (
                  <span className="gp-metric__hint">
                    {domesticPriceHint}; {t("game:domestic.priceNoteHint")}
                  </span>
                ) : null}
              </div>
              <div className="gp-metric">
                <span className="gp-metric__label">{t("game:domestic.capacityCapLabel")}</span>
                <span className="gp-metric__value">
                  {projectedDomesticCapacity != null ? `${formatNumber(projectedDomesticCapacity)} ${t("game:flow.items")}` : "—"}
                </span>
                {selectedCapacityDelta !== 0 ? (
                  <span className="gp-metric__hint">
                    {t("game:domestic.currentCapacity", { capacity: formatNumber(baseDomesticCapacity), delta: `${selectedCapacityDelta > 0 ? "+" : ""}${selectedCapacityDelta}` })}
                  </span>
                ) : null}
              </div>
              <div className="gp-metric">
                <span className="gp-metric__label">{t("game:domestic.governmentAdjustment")}</span>
                <span className="gp-metric__value">
                  {selectedMarketStrategies.length > 0 ? `${selectedMarketStrategies.length} ${t("game:flow.strategies")}` : t("common:notAvailable")}
                </span>
                {selectedEffectSummary.length > 0 ? (
                  <span className="gp-metric__hint">
                    {selectedEffectSummary
                      .map((item) => `${getEffectLabel(item.key)} ${item.value > 0 ? "+" : ""}${item.value}`)
                      .join(", ")}
                  </span>
                ) : (
                  <span className="gp-metric__hint">
                    {t("game:domestic.governmentAdjustmentHint")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="domestic-panel--v2__right">
          <h4 className="domestic-section-label">🏛️ {t("game:domestic.thisRoundGovernmentRegulation")}</h4>
          <div className="domestic-selected-effects">
            {selectedMarketStrategies.length > 0 ? (
              selectedMarketStrategies.map((action) => (
                <div key={action.actionId} className="domestic-selected-effects__row">
                  <strong>{translateBackend(action.label)}</strong>
                  <span>
                    {EFFECT_KEYS
                      .map((key) => {
                        const value = action.effects?.[key];
                        return typeof value === "number" && value !== 0
                          ? `${getEffectLabel(key)} ${value > 0 ? "+" : ""}${value}`
                          : null;
                      })
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              ))
            ) : (
              <p className="domestic-panel__empty">
                {t("game:domestic.noMarketRegulation")}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

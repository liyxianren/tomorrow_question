import { useTranslation } from "react-i18next";
import i18n, { translateBackend } from "../../../i18n";
import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import type { ParameterInspector } from "../../../features/game/parameterInspector";
import {
  calculateDecisionMarketReferencePrice,
  calculateRatioPreview,
  formatSignedValue,
} from "../../../features/game/decisionShared";
import { calculateDomesticMarketPreview } from "../../../features/game/marketMath";
import { DecisionStatStrip } from "./shared/DecisionStatStrip";
import "./DomesticPanel.css";

const EFFECT_KEYS = [
  "domesticMarketCapacityDelta",
  "domesticPriceBonusDelta",
  "handicraftCapacityDelta",
  "overseasMarketCapacityDelta",
] as const;

const MARKET_POLICY_ACTION_IDS = new Set(["trade_promotion"]);

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

function formatRatioValue(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
}

function formatIncomeRatio(ratio: { domesticMarket?: number; factory?: number; governmentFiscal?: number }): string {
  return [
    formatRatioValue(ratio.domesticMarket),
    formatRatioValue(ratio.factory),
    formatRatioValue(ratio.governmentFiscal),
  ].join(" / ");
}

function allocateIncomeByRatio(
  income: number,
  ratio: { domesticMarket?: number; factory?: number; governmentFiscal?: number },
) {
  const safeIncome = Math.max(0, Math.floor(Number.isFinite(income) ? income : 0));
  const domesticWeight = Math.max(0, ratio.domesticMarket ?? 0);
  const factoryWeight = Math.max(0, ratio.factory ?? 0);
  const governmentWeight = Math.max(0, ratio.governmentFiscal ?? 0);
  const totalWeight = domesticWeight + factoryWeight + governmentWeight;
  if (safeIncome <= 0 || totalWeight <= 0) {
    return { domesticMarket: 0, factory: 0, governmentFiscal: 0 };
  }
  const domesticMarket = Math.floor(safeIncome * (domesticWeight / totalWeight));
  const factory = Math.floor(safeIncome * (factoryWeight / totalWeight));
  return {
    domesticMarket,
    factory,
    governmentFiscal: safeIncome - domesticMarket - factory,
  };
}

function calculateProjectedGoodsInventory(
  phase1Economy: DecisionPlayerPhaseWorkspace["phase1Economy"],
  draft: PhaseDraftByPhase["decision"],
): number {
  if (!phase1Economy) {
    return 0;
  }
  const assignments = draft.phase1Production?.rawMaterialAssignments ?? {};
  const produced = phase1Economy.productionModes.reduce((sum, mode) => {
    const assigned = Math.max(0, Math.floor(assignments[mode.mode] ?? 0));
    return sum + assigned * Math.max(0, mode.outputRatio ?? 0);
  }, 0);
  return Math.max(0, (phase1Economy.goodsInventory ?? 0) + produced);
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

function buildMarketPolicyStrategies(
  strategies: DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"],
): DecisionPlayerPhaseWorkspace["governmentActions"]["strategies"] {
  const configured = strategies.filter((strategy) => MARKET_POLICY_ACTION_IDS.has(strategy.actionId));
  if (configured.length > 0) {
    return configured;
  }

  return [
    {
      actionId: "trade_promotion",
      label: i18n.t("game:government.strategy.tradePromotion", "Trade Promotion"),
      cost: 0,
      description: i18n.t("game:government.strategy.tradePromotionDesc", "Spend administrative power coordinating trade channels, permanently increasing overseas market capacity."),
      techPointDelta: 0,
      militaryPointDelta: 0,
      lockedReason: null,
      effects: { overseasMarketCapacityDelta: 2 },
      isMarketRegulation: true,
    },
  ];
}

export interface DomesticPanelProps {
  workspace: DecisionPlayerPhaseWorkspace;
  draft: PhaseDraftByPhase["decision"];
  remainingDomesticBudget: number;
  parameterInspector?: ParameterInspector;
}

export function DomesticPanel({
  workspace,
  draft,
  remainingDomesticBudget,
  parameterInspector,
}: DomesticPanelProps) {
  const { t } = useTranslation();
  const queuedStrategyIds = new Set(
    draft.governmentPlan.strategySelections.map((item) => item.actionId),
  );
  const marketPolicyStrategies = buildMarketPolicyStrategies(workspace.governmentActions.strategies);
  const selectedMarketStrategies = marketPolicyStrategies.filter((action) =>
    queuedStrategyIds.has(action.actionId) && hasMarketPreviewEffect(action),
  );
  const selectedCapacityDelta = sumEffect(selectedMarketStrategies, "domesticMarketCapacityDelta");
  const selectedPriceDelta = sumEffect(selectedMarketStrategies, "domesticPriceBonusDelta");
  const selectedEffectSummary = EFFECT_KEYS
    .map((key) => ({ key, value: sumEffect(selectedMarketStrategies, key) }))
    .filter((item) => item.value !== 0);

  const phase1Economy = workspace.phase1Economy;
  const baseDomesticCapacity = phase1Economy?.domesticSoftCap
    ?? workspace.domesticMarketCapacity
    ?? phase1Economy?.domesticDemand
    ?? undefined;
  const projectedDomesticCapacity = baseDomesticCapacity != null
    ? Math.max(0, baseDomesticCapacity + selectedCapacityDelta)
    : undefined;
  const referencePrice = calculateDecisionMarketReferencePrice(phase1Economy, selectedPriceDelta);
  const projectedIncomeRatio = calculateRatioPreview(workspace, draft);
  const projectedGoodsInventory = calculateProjectedGoodsInventory(phase1Economy, draft);
  const estimatedDomesticRevenue = phase1Economy && projectedDomesticCapacity != null
    ? calculateDomesticMarketPreview({
        allocation: projectedGoodsInventory,
        softCap: projectedDomesticCapacity,
        equilibriumPrice: referencePrice.basePrice ?? 0,
        minimumPrice: referencePrice.minimumPrice,
        maximumPrice: referencePrice.maximumPrice,
        priceBonus: referencePrice.existingPriceBonus + selectedPriceDelta,
      }).revenue
    : 0;
  const estimatedBudgetAllocation = allocateIncomeByRatio(estimatedDomesticRevenue, projectedIncomeRatio);
  const projectedDomesticDemand = phase1Economy?.domesticDemand != null
    ? Math.max(0, phase1Economy.domesticDemand)
    : undefined;
  const normalPriceVolume = projectedDomesticCapacity != null && Number.isFinite(projectedDomesticCapacity)
    ? Math.max(1, projectedDomesticCapacity)
    : undefined;
  const shortageExampleQuantity = normalPriceVolume != null
    ? Math.max(1, Math.floor(normalPriceVolume * 0.5))
    : undefined;
  const balancedExampleQuantity = normalPriceVolume;
  const surplusExampleQuantity = normalPriceVolume != null
    ? Math.max(normalPriceVolume + 1, Math.ceil(normalPriceVolume * 1.5))
    : undefined;
  const domesticPriceHint = phase1Economy
    ? [
        t("game:domestic.referencePricePlain", {
          pool: formatNumber(remainingDomesticBudget),
          capacity: formatNumber(projectedDomesticCapacity),
          price: formatNumber(referencePrice.basePrice),
          defaultValue: "Domestic purchasing power is {{pool}} fiscal, and the domestic market can normally absorb about {{capacity}} goods, so the reference price is about {{price}} fiscal per good.",
        }),
        t("game:domestic.allocationPricePlain", {
          minimum: formatNumber(referencePrice.minimumPrice),
          maximum: formatNumber(referencePrice.maximumPrice),
          defaultValue: "This is not the final transaction price. The sales page still checks actual allocation: fewer goods raise the price; too many goods push price down, clamped between {{minimum}} and {{maximum}} fiscal per good.",
        }),
        referencePrice.existingPriceBonus !== 0
          ? `${t("game:domestic.existingPriceBonus", "Existing Price Adjustment")} ${formatSignedValue(referencePrice.existingPriceBonus)}`
          : null,
        selectedPriceDelta !== 0 ? `${t("game:domestic.policyPriceAdjustment", "This-Round Price Adjustment")} ${formatSignedValue(selectedPriceDelta)}` : null,
        `${t("game:market.minimumPrice", "Minimum Price")} ${formatNumber(referencePrice.minimumPrice)}`,
        `${t("game:market.maximumPrice", "Maximum Price")} ${formatNumber(referencePrice.maximumPrice)}`,
        referencePrice.isFloored ? t("game:domestic.equilibriumPriceFloored", "Equilibrium reference price floored") : null,
      ].filter(Boolean).join(", ")
    : null;
  const domesticReferencePriceLabel = t("game:domestic.domesticReferencePriceLabel", "Domestic Reference Price");
  const domesticPriceAdjustmentHint = [
    referencePrice.existingPriceBonus !== 0
      ? `${t("game:domestic.existingPriceBonus", "Existing Price Adjustment")} ${formatSignedValue(referencePrice.existingPriceBonus)}`
      : null,
    selectedPriceDelta !== 0
      ? `${t("game:domestic.policyPriceAdjustment", "This-Round Price Adjustment")} ${formatSignedValue(selectedPriceDelta)}`
      : null,
    referencePrice.isFloored ? t("game:domestic.equilibriumPriceFloored", "Equilibrium reference price floored") : null,
  ].filter(Boolean).join(", ");
  const domesticEconomyDescription = phase1Economy
    ? t("game:domestic.domesticEconomyDescWithValues", {
        pool: formatNumber(remainingDomesticBudget),
        demand: formatNumber(projectedDomesticDemand),
        capacity: formatNumber(projectedDomesticCapacity),
        price: formatNumber(referencePrice.basePrice),
        minimum: formatNumber(referencePrice.minimumPrice),
        maximum: formatNumber(referencePrice.maximumPrice),
        defaultValue: "Current consumer purchasing power is {{pool}}, domestic demand is {{demand}}, and the pricing soft cap is {{capacity}}, so the equilibrium reference price is about {{price}}. The sales phase adjusts by actual allocation; price range {{minimum}} to {{maximum}}.",
      })
    : t("game:domestic.domesticEconomyDesc");

  return (
    <div className="domestic-panel" data-testid="domestic-panel">
      <div className="domestic-panel__header">
        <h3 className="domestic-panel__title">🏛️ {t("game:domestic.title")}</h3>
        <span className="domestic-panel__budget">{t("game:domestic.marketPreview")}</span>
      </div>
      {parameterInspector?.render("domestic.preview", {
        title: t("game:domestic.marketPreview"),
        currentEffect: t("game:domestic.domesticEconomyDesc"),
      })}

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
            label: t("game:domestic.normalAbsorption", "Normal absorption"),
          },
          {
            icon: "🏷️",
            value: referencePrice.price != null ? formatNumber(referencePrice.price) : "—",
            label: referencePrice.isFloored ? t("game:domestic.equilibriumPriceFloored", "Floored") : domesticReferencePriceLabel,
          },
        ]}
      />

      <div className="domestic-market-card__formula-row" data-testid="domestic-income-allocation-preview">
        <MarketValueChip label={t("game:market.incomeAllocationRatio", "Income Allocation This Round")} value={formatIncomeRatio(projectedIncomeRatio)} tone="accent" />
        <MarketValueChip label={t("game:settlement.consumerPurchasingPower", "Consumer Purchasing Power")} value={`+${formatNumber(estimatedBudgetAllocation.domesticMarket)}`} />
        <MarketValueChip label={t("game:market.estimatedFactoryBudget", "Factory Budget")} value={`+${formatNumber(estimatedBudgetAllocation.factory)}`} />
        <MarketValueChip label={t("game:settlement.governmentFiscal", "Government Finance")} value={`+${formatNumber(estimatedBudgetAllocation.governmentFiscal)}`} />
      </div>

      <div
        className={[
          "domestic-panel--v2",
          selectedEffectSummary.length === 0 && "domestic-panel--v2--single",
        ].filter(Boolean).join(" ")}
      >
        <div className="domestic-panel--v2__left">
          <div className="domestic-market-card">
            <h4 className="domestic-section-label">📈 {t("game:domestic.domesticEconomyPreview")}</h4>
            <p className="domestic-section-note">
              {domesticEconomyDescription}
            </p>
            {phase1Economy ? (
              <div className="domestic-market-card__formula" aria-label={domesticPriceHint ?? undefined}>
                <div className="domestic-market-card__formula-head">
                  <span>{domesticReferencePriceLabel}</span>
                  <strong>{formatNumber(referencePrice.price)} {t("game:market.fiscalPerUnit")}</strong>
                </div>
                <p className="domestic-market-card__formula-copy">
                  {t("game:domestic.referencePricePlain", {
                    pool: formatNumber(remainingDomesticBudget),
                    capacity: formatNumber(projectedDomesticCapacity),
                    price: formatNumber(referencePrice.basePrice),
                    defaultValue: "Domestic purchasing power is {{pool}} fiscal, and the domestic market can normally absorb about {{capacity}} goods, so the reference price is about {{price}} fiscal per good.",
                  })}
                </p>
                <div className="domestic-market-card__formula-row">
                  <MarketValueChip label={t("game:domestic.purchasingPowerPlain", "Domestic purchasing power")} value={`${formatNumber(remainingDomesticBudget)} ${t("game:settlement.fiscalUnit")}`} />
                  <MarketValueChip label={t("game:domestic.normalPriceVolume", "Normal-price sales")} value={`${formatNumber(projectedDomesticCapacity)} ${t("game:goods.unit")}`} />
                  <MarketValueChip
                    label={t("game:domestic.referencePriceCalculation", "Reference price math")}
                    value={`${formatNumber(remainingDomesticBudget)} ÷ ${formatNumber(projectedDomesticCapacity)} ≈ ${formatNumber(referencePrice.basePrice)}`}
                    tone="accent"
                  />
                </div>
                <div className="domestic-market-card__impact">
                  <strong className="domestic-market-card__impact-title">{t("game:domestic.impactTitle", "How allocation changes price")}</strong>
                  <div className="domestic-market-card__impact-head">
                    <span>{t("game:domestic.impactAllocation", "Allocation")}</span>
                    <span>{t("game:domestic.impactFeeling", "Market state")}</span>
                    <span>{t("game:domestic.impactPrice", "Price result")}</span>
                  </div>
                  <DomesticImpactRow
                    allocation={t("game:domestic.impactShortageAllocation", {
                      quantity: formatNumber(shortageExampleQuantity),
                      capacity: formatNumber(normalPriceVolume),
                      defaultValue: "{{quantity}} goods, below {{capacity}}",
                    })}
                    feeling={t("game:domestic.impactShortageFeeling", "Shortage; buyers compete for goods")}
                    price={t("game:domestic.impactShortagePrice", {
                      price: formatNumber(referencePrice.basePrice),
                      defaultValue: "Unit price above {{price}}",
                    })}
                  />
                  <DomesticImpactRow
                    allocation={t("game:domestic.impactBalancedAllocation", {
                      quantity: formatNumber(balancedExampleQuantity),
                      capacity: formatNumber(normalPriceVolume),
                      defaultValue: "{{quantity}} goods, near {{capacity}}",
                    })}
                    feeling={t("game:domestic.impactBalancedFeeling", "Supply and demand near balance")}
                    price={t("game:domestic.impactBalancedPrice", {
                      price: formatNumber(referencePrice.basePrice),
                      defaultValue: "Unit price about {{price}}",
                    })}
                  />
                  <DomesticImpactRow
                    allocation={t("game:domestic.impactSurplusAllocation", {
                      quantity: formatNumber(surplusExampleQuantity),
                      capacity: formatNumber(normalPriceVolume),
                      defaultValue: "{{quantity}} goods, above {{capacity}}",
                    })}
                    feeling={t("game:domestic.impactSurplusFeeling", "Dumping goods; market cannot absorb them")}
                    price={t("game:domestic.impactSurplusPrice", {
                      price: formatNumber(referencePrice.basePrice),
                      minimum: formatNumber(referencePrice.minimumPrice),
                      defaultValue: "Unit price below {{price}}, minimum {{minimum}}",
                    })}
                  />
                </div>
                <div className="domestic-market-card__formula-foot">
                  <span>
                    {t("game:domestic.transactionPriceRange", "Transaction Price Range")} {formatNumber(referencePrice.minimumPrice)} - {formatNumber(referencePrice.maximumPrice)} {t("game:market.fiscalPerUnit")}
                  </span>
                  <strong>{domesticPriceAdjustmentHint || t("game:domestic.noMarketAdjustment", "No extra price adjustment currently.")}</strong>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {selectedEffectSummary.length > 0 ? (
          <div className="domestic-panel--v2__right">
            <h4 className="domestic-section-label">🏛️ {t("game:domestic.thisRoundMarketAdjustment", "This-Round Market Adjustment")}</h4>
            <div className="domestic-selected-effects">
              {selectedMarketStrategies.map((action) => (
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
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MarketValueChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent";
}) {
  return (
    <span className={["domestic-market-card__chip", tone && `domestic-market-card__chip--${tone}`].filter(Boolean).join(" ")}>
      <span className="domestic-market-card__chip-label">{label}</span>
      <strong className="domestic-market-card__chip-value">{value}</strong>
    </span>
  );
}

function DomesticImpactRow({
  allocation,
  feeling,
  price,
}: {
  allocation: string;
  feeling: string;
  price: string;
}) {
  return (
    <div className="domestic-market-card__impact-row">
      <span>{allocation}</span>
      <span>{feeling}</span>
      <strong>{price}</strong>
    </div>
  );
}

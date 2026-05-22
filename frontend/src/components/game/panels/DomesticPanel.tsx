import { useTranslation } from "react-i18next";
import i18n, { translateBackend } from "../../../i18n";
import type { DecisionPlayerPhaseWorkspace } from "../../../types";
import type { PhaseDraftByPhase } from "../../../features/game/forms";
import type { ParameterInspector } from "../../../features/game/parameterInspector";
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
      label: i18n.t("game:government.strategy.tradePromotion", "贸易促进"),
      cost: 0,
      description: i18n.t("game:government.strategy.tradePromotionDesc", "动用行政力协调贸易渠道，永久提高海外市场承接上限。"),
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
          defaultValue: "市民本轮一共准备 {{pool}} 财政买货，国内市场正常能吃下约 {{capacity}} 件商品，所以平均每件的参考价约 {{price}} 财政。",
        }),
        t("game:domestic.allocationPricePlain", {
          minimum: formatNumber(referencePrice.minimumPrice),
          maximum: formatNumber(referencePrice.maximumPrice),
          defaultValue: "这不是最终成交价。出售阶段如果投放较少，价格会上浮；一次投放太多，价格会被压低，最终限制在 {{minimum}} 到 {{maximum}} 财政/件。",
        }),
        referencePrice.existingPriceBonus !== 0
          ? `${t("game:domestic.existingPriceBonus", "已有价格调整")} ${formatSignedValue(referencePrice.existingPriceBonus)}`
          : null,
        selectedPriceDelta !== 0 ? `${t("game:domestic.policyPriceAdjustment", "本轮价格调整")} ${formatSignedValue(selectedPriceDelta)}` : null,
        `${t("game:market.minimumPrice", "最低价")} ${formatNumber(referencePrice.minimumPrice)}`,
        `${t("game:market.maximumPrice", "最高价")} ${formatNumber(referencePrice.maximumPrice)}`,
        referencePrice.isFloored ? t("game:domestic.equilibriumPriceFloored", "均衡参考价已触底") : null,
      ].filter(Boolean).join(", ")
    : null;
  const domesticReferencePriceLabel = t("game:domestic.domesticReferencePriceLabel", "国内参考价");
  const domesticPriceAdjustmentHint = [
    referencePrice.existingPriceBonus !== 0
      ? `${t("game:domestic.existingPriceBonus", "已有价格调整")} ${formatSignedValue(referencePrice.existingPriceBonus)}`
      : null,
    selectedPriceDelta !== 0
      ? `${t("game:domestic.policyPriceAdjustment", "本轮价格调整")} ${formatSignedValue(selectedPriceDelta)}`
      : null,
    referencePrice.isFloored ? t("game:domestic.equilibriumPriceFloored", "均衡参考价已触底") : null,
  ].filter(Boolean).join("，");
  const domesticEconomyDescription = phase1Economy
    ? t("game:domestic.domesticEconomyDescWithValues", {
        pool: formatNumber(remainingDomesticBudget),
        demand: formatNumber(projectedDomesticDemand),
        capacity: formatNumber(projectedDomesticCapacity),
        price: formatNumber(referencePrice.basePrice),
        minimum: formatNumber(referencePrice.minimumPrice),
        maximum: formatNumber(referencePrice.maximumPrice),
        defaultValue: "当前民间购买力 {{pool}}，国内需求 {{demand}}，定价软上限 {{capacity}}，所以均衡参考价约 {{price}}。出售阶段会按实际投放量上下调整；价格范围 {{minimum}} 到 {{maximum}}。",
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
            label: t("game:domestic.normalAbsorption", "正常承接量"),
          },
          {
            icon: "🏷️",
            value: referencePrice.price != null ? formatNumber(referencePrice.price) : "—",
            label: referencePrice.isFloored ? t("game:domestic.equilibriumPriceFloored", "已触底") : domesticReferencePriceLabel,
          },
        ]}
      />

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
                    defaultValue: "市民本轮一共准备 {{pool}} 财政买货，国内市场正常能吃下约 {{capacity}} 件商品，所以平均每件的参考价约 {{price}} 财政。",
                  })}
                </p>
                <div className="domestic-market-card__formula-row">
                  <MarketValueChip label={t("game:domestic.purchasingPowerPlain", "国内总购买力")} value={`${formatNumber(remainingDomesticBudget)} 财政`} />
                  <MarketValueChip label={t("game:domestic.normalPriceVolume", "正常价销量")} value={`${formatNumber(projectedDomesticCapacity)} 件`} />
                  <MarketValueChip
                    label={t("game:domestic.referencePriceCalculation", "参考价算法")}
                    value={`${formatNumber(remainingDomesticBudget)} ÷ ${formatNumber(projectedDomesticCapacity)} ≈ ${formatNumber(referencePrice.basePrice)}`}
                    tone="accent"
                  />
                </div>
                <div className="domestic-market-card__impact">
                  <strong className="domestic-market-card__impact-title">{t("game:domestic.impactTitle", "投放后价格怎么变")}</strong>
                  <div className="domestic-market-card__impact-head">
                    <span>{t("game:domestic.impactAllocation", "投放情况")}</span>
                    <span>{t("game:domestic.impactFeeling", "市场状态")}</span>
                    <span>{t("game:domestic.impactPrice", "价格结果")}</span>
                  </div>
                  <DomesticImpactRow
                    allocation={t("game:domestic.impactShortageAllocation", {
                      quantity: formatNumber(shortageExampleQuantity),
                      capacity: formatNumber(normalPriceVolume),
                      defaultValue: "{{quantity}} 件，少于 {{capacity}}",
                    })}
                    feeling={t("game:domestic.impactShortageFeeling", "市场缺货，买方抢货")}
                    price={t("game:domestic.impactShortagePrice", {
                      price: formatNumber(referencePrice.basePrice),
                      defaultValue: "单价高于 {{price}}",
                    })}
                  />
                  <DomesticImpactRow
                    allocation={t("game:domestic.impactBalancedAllocation", {
                      quantity: formatNumber(balancedExampleQuantity),
                      capacity: formatNumber(normalPriceVolume),
                      defaultValue: "{{quantity}} 件，接近 {{capacity}}",
                    })}
                    feeling={t("game:domestic.impactBalancedFeeling", "供需接近平衡")}
                    price={t("game:domestic.impactBalancedPrice", {
                      price: formatNumber(referencePrice.basePrice),
                      defaultValue: "单价约 {{price}}",
                    })}
                  />
                  <DomesticImpactRow
                    allocation={t("game:domestic.impactSurplusAllocation", {
                      quantity: formatNumber(surplusExampleQuantity),
                      capacity: formatNumber(normalPriceVolume),
                      defaultValue: "{{quantity}} 件，超过 {{capacity}}",
                    })}
                    feeling={t("game:domestic.impactSurplusFeeling", "商品倾销，市场吃不下")}
                    price={t("game:domestic.impactSurplusPrice", {
                      price: formatNumber(referencePrice.basePrice),
                      minimum: formatNumber(referencePrice.minimumPrice),
                      defaultValue: "单价低于 {{price}}，最低 {{minimum}}",
                    })}
                  />
                </div>
                <div className="domestic-market-card__formula-foot">
                  <span>
                    {t("game:domestic.transactionPriceRange", "成交价范围")} {formatNumber(referencePrice.minimumPrice)} - {formatNumber(referencePrice.maximumPrice)} {t("game:market.fiscalPerUnit")}
                  </span>
                  <strong>{domesticPriceAdjustmentHint || t("game:domestic.noMarketAdjustment", "当前没有额外价格调整")}</strong>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {selectedEffectSummary.length > 0 ? (
          <div className="domestic-panel--v2__right">
            <h4 className="domestic-section-label">🏛️ {t("game:domestic.thisRoundMarketAdjustment", "本轮市场调整")}</h4>
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

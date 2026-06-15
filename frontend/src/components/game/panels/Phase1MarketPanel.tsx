import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n, { translateBackend } from "../../../i18n";

import type {
  BudgetPools,
  IncomeAllocationRatio,
  OverseasCompetitionLockReason,
  Phase1EconomyWorkspace,
  Phase1ExternalCompetitionDeployment,
  Phase1ExternalAllocation,
  RegionAccessStatus,
} from "../../../types";
import {
  buildRegionRouteBlockadeDetail,
  getRegionAccessLevelLabel,
} from "../../../features/game/decisionShared";
import { getCountryLabel, getRegionLabel } from "../../../features/game/panelGlossary";
import {
  calculateDomesticMarketPreview,
  DOMESTIC_PRICE_CEILING_RATIO,
  DOMESTIC_PRICE_FLOOR_RATIO,
  getFixedOverseasPrice,
  type DomesticMarketPreview,
} from "../../../features/game/marketMath";
import "./Phase1MarketPanel.css";

function getLockReasonLabel(
  region: RegionAccessStatus,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const reason = region.lockReason;
  if (reason === "route_blocked") {
    return buildRegionRouteBlockadeDetail(region)
      ?? t("game:validateCompetitionRouteBlocked", { defaultValue: "Route is blockaded" });
  }
  const map: Record<string, string> = {
    route_blocked: t("game:validateCompetitionRouteBlocked", { defaultValue: "Route is blockaded" }),
  };
  if (reason && reason in map) {
    return map[reason];
  }
  return t("game:validateCompetitionNotAvailable", { defaultValue: "Cannot enter" });
}

function getCompetitionLockReasonLabel(
  reason: OverseasCompetitionLockReason | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const map: Record<string, string> = {
    route_blocked: t("game:validateCompetitionRouteBlocked", { defaultValue: "Route is blockaded" }),
    no_army: t("game:validateCompetitionNoArmy", { defaultValue: "No deployable army" }),
  };
  if (reason && reason in map) {
    return map[reason];
  }
  return t("game:validateCompetitionNotAvailable", { defaultValue: "Cannot compete" });
}

type OverseasCompetitionConfig = {
  availableArmy: Record<string, number>;
  rewardCapacityBonus: number;
  infantryPower: number;
  artilleryPower: number;
  minimumPower: number;
};

type Phase1MarketPanelProps = {
  phase1Economy: Phase1EconomyWorkspace;
  goodsInventory: number;
  domesticMarketCapacity: number;
  overseasMarketCapacity: number;
  overseasCompetition?: OverseasCompetitionConfig;
  budgetPools: BudgetPools;
  regionAccessStatus: RegionAccessStatus[];
  draftAllocation: number;
  externalAllocations: Phase1ExternalAllocation[];
  competitionDeployments: Phase1ExternalCompetitionDeployment[];
  onAllocationChange: (domesticAllocation: number) => void;
  onExternalAllocationChange: (marketId: string, quantity: number) => void;
  onCompetitionDeploymentChange: (marketId: string, infantry: number, artillery: number) => void;
  incomeAllocationRatio?: IncomeAllocationRatio;
  readOnly?: boolean;
};

export function Phase1MarketPanel({
  phase1Economy,
  goodsInventory,
  domesticMarketCapacity,
  overseasMarketCapacity,
  overseasCompetition,
  budgetPools,
  regionAccessStatus,
  draftAllocation,
  externalAllocations,
  competitionDeployments,
  onAllocationChange,
  onExternalAllocationChange,
  onCompetitionDeploymentChange,
  incomeAllocationRatio,
  readOnly = false,
}: Phase1MarketPanelProps) {
  const { t } = useTranslation();
  const totalGoods = Math.max(0, goodsInventory);
  const domesticDemand = Math.max(0, phase1Economy.domesticDemand ?? 0);
  const equilibriumPrice = phase1Economy.equilibriumPrice ?? 0;
  const domesticPriceBonus = phase1Economy.domesticPriceBonus ?? 0;
  const domesticCapacityBonus = phase1Economy.domesticMarketCapacityBonus ?? 0;
  const overseasCapacityBonus = phase1Economy.overseasMarketCapacityBonus ?? 0;
  const policyDomesticCapacityBonus = phase1Economy.governmentDomesticMarketCapacityBonus ?? 0;
  const policyDomesticPriceBonus = phase1Economy.governmentDomesticPriceBonus ?? 0;
  const policyOverseasCapacityBonus = phase1Economy.governmentOverseasMarketCapacityBonus ?? 0;
  const domesticSoftCap = Math.max(1, phase1Economy.domesticSoftCap ?? domesticMarketCapacity ?? domesticDemand);
  const minimumDomesticPrice = phase1Economy.minimumDomesticPrice
    ?? Math.max(0, equilibriumPrice * DOMESTIC_PRICE_FLOOR_RATIO);
  const maximumDomesticPrice = phase1Economy.domesticPriceCeiling
    ?? Math.max(0, equilibriumPrice * DOMESTIC_PRICE_CEILING_RATIO);
  const consumerPool = budgetPools.domesticMarket ?? 0;
  const pricingPool = phase1Economy.consumptionPool ?? consumerPool;
  const marketAdjustmentLabels = {
    domesticCapacity: t("game:government.effect.domesticCapacity", "Domestic Capacity"),
    domesticPrice: t("game:government.effect.domesticPrice", "Domestic Price"),
    overseasCapacity: t("game:government.effect.overseasCapacity", "Overseas Capacity"),
  };
  const activeGovernmentAdjustments = buildMarketAdjustmentLabels({
    domesticCapacity: policyDomesticCapacityBonus,
    domesticPrice: policyDomesticPriceBonus,
    overseasCapacity: policyOverseasCapacityBonus,
    labels: marketAdjustmentLabels,
  });
  const netMarketAdjustments = buildMarketAdjustmentLabels({
    domesticCapacity: domesticCapacityBonus,
    domesticPrice: domesticPriceBonus,
    overseasCapacity: overseasCapacityBonus,
    labels: marketAdjustmentLabels,
  });
  const activeGovernmentAdjustmentText = activeGovernmentAdjustments.join(" · ");
  const netMarketAdjustmentText = netMarketAdjustments.join(" · ");
  const shouldShowNetAdjustments =
    netMarketAdjustments.length > 0 && netMarketAdjustmentText !== activeGovernmentAdjustmentText;
  const shouldShowMarketAdjustmentBanner = activeGovernmentAdjustments.length > 0 || shouldShowNetAdjustments;

  const externalAllocationTotal = externalAllocations.reduce(
    (sum, item) => sum + Math.max(0, item.quantity),
    0,
  );
  const overseasRegions = regionAccessStatus.filter((status) => status.regionId !== "domestic");
  const competitionConfig = overseasCompetition ?? {
    availableArmy: {},
    rewardCapacityBonus: 0,
    infantryPower: 1,
    artilleryPower: 2,
    minimumPower: 1,
  };
  const competitionDeploymentByRegion = new Map<string, Phase1ExternalCompetitionDeployment>(
    competitionDeployments.map((deployment) => [deployment.marketId, deployment]),
  );
  const rewardCapacityByRegion = new Map<string, number>();
  for (const region of overseasRegions) {
    const deployment = competitionDeploymentByRegion.get(region.regionId);
    const power = calculateDeploymentPower(deployment, competitionConfig);
    if (region.canCompete && power >= competitionConfig.minimumPower) {
      const rewardCapacity = region.competitionRewardCapacityBonus ?? competitionConfig.rewardCapacityBonus;
      rewardCapacityByRegion.set(region.regionId, Math.max(0, rewardCapacity));
    }
  }

  const domesticLimit = Math.floor(Math.max(
    0,
    totalGoods - externalAllocationTotal,
  ));
  const clampedDomestic = clamp(draftAllocation, 0, domesticLimit);

  useEffect(() => {
    if (!readOnly && draftAllocation !== clampedDomestic) {
      onAllocationChange(clampedDomestic);
    }
  }, [clampedDomestic, draftAllocation, onAllocationChange, readOnly]);

  const marketLabel = (key: string) => {
    const map: Record<string, string> = {
      notAllocated: t("game:market.notAllocated"),
      noDemand: t("game:market.noDemand"),
      supplyDemandBalanced: t("game:market.supplyDemandBalanced"),
      shortage: t("game:market.shortage"),
      surplus: t("game:market.surplus"),
    };
    return map[key] ?? key;
  };

  const preview = useMemo(
    () => calculatePreview(
      clampedDomestic,
      domesticSoftCap,
      equilibriumPrice,
      domesticPriceBonus,
      minimumDomesticPrice,
      maximumDomesticPrice,
      marketLabel,
    ),
    [
      clampedDomestic,
      domesticSoftCap,
      equilibriumPrice,
      domesticPriceBonus,
      minimumDomesticPrice,
      maximumDomesticPrice,
      marketLabel,
    ],
  );

  const totalAllocated = clampedDomestic + externalAllocationTotal;
  const overseasAuditRows = buildOverseasAuditRows({
    regions: overseasRegions,
    allocations: externalAllocations,
    inventoryAfterDomestic: Math.max(0, totalGoods - clampedDomestic),
    overseasMarketCapacity,
    rewardCapacityByRegion,
  });
  const overseasAuditRowsByRegion = new Map(
    overseasAuditRows.map((row) => [row.regionId, row]),
  );
  const overseasAuditRevenue = overseasAuditRows.reduce((sum, row) => sum + row.revenue, 0);
  const backendSnapshotPrice = phase1Economy.domesticPricePreview ?? 0;
  const totalEstimatedRevenue = preview.revenue + overseasAuditRevenue;
  const estimatedBudgetAllocation = allocateIncomeByRatio(
    totalEstimatedRevenue,
    incomeAllocationRatio ?? {
      domesticMarket: 3,
      factory: 3,
      governmentFiscal: 4,
    },
  );
  const domesticFactor = domesticPriceFactor(clampedDomestic, domesticSoftCap);

  let remainingInventoryForOverseasPreview = Math.max(0, totalGoods - clampedDomestic);
  let remainingOverseasCapacityForPreview = Math.max(0, overseasMarketCapacity);
  const rewardCapacityForPreview = new Map(rewardCapacityByRegion);
  const overseasRevenue = externalAllocations.reduce((sum, alloc) => {
    if (remainingInventoryForOverseasPreview <= 0) {
      return sum;
    }
    const region = overseasRegions.find((r) => r.regionId === alloc.marketId);
    if (!region?.isAccessible) {
      return sum;
    }
    const unitPrice = getFixedOverseasPrice(region);
    const regionRewardCapacity = Math.max(0, rewardCapacityForPreview.get(alloc.marketId) ?? 0);
    const rewardSold = Math.min(Math.max(0, alloc.quantity), remainingInventoryForOverseasPreview, regionRewardCapacity);
    const sharedSold = Math.min(
      Math.max(0, alloc.quantity - rewardSold),
      Math.max(0, remainingInventoryForOverseasPreview - rewardSold),
      remainingOverseasCapacityForPreview,
    );
    const sold = rewardSold + sharedSold;
    if (sold <= 0) {
      return sum;
    }
    rewardCapacityForPreview.set(alloc.marketId, Math.max(0, regionRewardCapacity - rewardSold));
    remainingOverseasCapacityForPreview -= sharedSold;
    remainingInventoryForOverseasPreview -= sold;
    return sum + sold * unitPrice;
  }, 0);

  function handleDomesticDelta(delta: number) {
    if (readOnly) {
      return;
    }
    onAllocationChange(clamp(clampedDomestic + delta, 0, domesticLimit));
  }

  function handleDomesticZero() {
    if (readOnly) {
      return;
    }
    onAllocationChange(0);
  }

  function handleDomesticMax() {
    if (readOnly) {
      return;
    }
    onAllocationChange(domesticLimit);
  }

  return (
    <section className="phase1-market" data-testid="phase1-market-panel">
      {/* ── Summary Bar ── */}
      <div className="phase1-market__summary">
        <div className="phase1-market__stat">
          <span className="phase1-market__stat-value">{totalGoods}</span>
          <span className="phase1-market__stat-label">{t("game:market.goodsInventory")}</span>
        </div>
        <div className="phase1-market__stat">
          <span className="phase1-market__stat-value">{formatNumber(domesticDemand)}</span>
          <span className="phase1-market__stat-label">{t("game:market.demand")}</span>
        </div>
        <div className="phase1-market__stat">
          <span className="phase1-market__stat-value">{consumerPool}</span>
          <span className="phase1-market__stat-label">{t("game:market.pricingPool")}</span>
        </div>
        <div className="phase1-market__stat">
          <span className="phase1-market__stat-value">{formatNumber(domesticSoftCap)}</span>
          <span className="phase1-market__stat-label">{t("game:market.capacityLimit")}</span>
        </div>
      </div>

      {shouldShowMarketAdjustmentBanner ? (
        <div
          className={[
            "phase1-market__policy-banner",
            activeGovernmentAdjustments.length > 0 && "phase1-market__policy-banner--active",
          ].filter(Boolean).join(" ")}
          data-testid="phase1-market-government-adjustments"
        >
          <strong>{t("game:market.marketAdjustmentSummary", "市场容量调整")}</strong>
          <span>
            {activeGovernmentAdjustments.length > 0
              ? activeGovernmentAdjustmentText
              : t("game:market.marketNetAdjustmentHint", "当前存在事件、既有状态或竞争带来的市场调整")}
          </span>
          {shouldShowNetAdjustments ? (
            <span className="phase1-market__policy-banner-net">
              {t("game:market.netAdjustmentWithValue", {
                label: t("game:market.netAdjustment", "Current net adjustment"),
                value: netMarketAdjustmentText,
                defaultValue: "{{label}}: {{value}}",
              })}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ── Domestic Market Card ── */}
      <article className="phase1-market__card phase1-market__card--domestic">
        <header className="phase1-market__card-header">
          <span className="phase1-market__card-name">{t("game:market.domesticMarket")}</span>
          <span className={`phase1-market__balance phase1-market__balance--${preview.tone}`}>
            {preview.balanceLabel}
          </span>
        </header>

        <div className="phase1-market__stepper">
          <button
            type="button"
            className="phase1-market__stepper-btn"
            disabled={readOnly || clampedDomestic <= 0}
            onClick={() => handleDomesticDelta(-1)}
            aria-label={t("game:market.reduceDomestic")}
          >
            −
          </button>
          <button
            type="button"
            className="phase1-market__stepper-zero"
            disabled={readOnly || clampedDomestic <= 0}
            onClick={handleDomesticZero}
            aria-label={t("game:market.clearDomestic")}
          >
            0
          </button>
          <span className="phase1-market__stepper-value">{clampedDomestic}</span>
          <button
            type="button"
            className="phase1-market__stepper-btn"
            disabled={readOnly || clampedDomestic >= domesticLimit}
            onClick={() => handleDomesticDelta(1)}
            aria-label={t("game:market.increaseDomestic")}
          >
            +
          </button>
          <button
            type="button"
            className="phase1-market__stepper-max"
            disabled={readOnly || clampedDomestic >= domesticLimit}
            onClick={handleDomesticMax}
            aria-label={t("game:market.maxDomestic")}
          >
            MAX
          </button>
        </div>

        <div className="phase1-market__preview-grid">
          <div className="phase1-market__preview-block">
            <span className="phase1-market__preview-label">{t("game:market.estimatedUnitPrice", "预计单价")}</span>
            <strong className="phase1-market__preview-value">{formatNumber(preview.price)} {t("game:market.fiscalPerUnit")}</strong>
          </div>
          <div className="phase1-market__preview-block">
            <span className="phase1-market__preview-label">{t("game:market.estimatedSold")}</span>
            <strong className="phase1-market__preview-value">{preview.soldQty}</strong>
          </div>
          <div className="phase1-market__preview-block">
            <span className="phase1-market__preview-label">{t("game:market.revenue")}</span>
            <strong className="phase1-market__preview-value phase1-market__preview-value--gold">{preview.revenue}</strong>
          </div>
        </div>
        <div className="phase1-market__calculation phase1-market__calculation--domestic" data-testid="phase1-market-domestic-calculation">
          <div className="phase1-market__calculation-head">
            <span>{t("game:market.domesticCalculationTitle", "国内价格怎么算")}</span>
            <strong>{formatNumber(preview.price)} {t("game:market.fiscalPerUnit")}</strong>
          </div>
          <div className="phase1-market__formula-row" aria-label={t("game:market.domesticReferenceCalculation", {
            pool: formatNumber(pricingPool),
            softCap: formatNumber(domesticSoftCap),
            reference: formatNumber(equilibriumPrice),
            defaultValue: "民间购买力 {{pool}} ÷ 国内承接量 {{softCap}} = 正常单价 {{reference}}。",
          })}>
            <FormulaChip label={t("game:domestic.consumerPurchasingPower", "民间购买力")} value={formatNumber(pricingPool)} />
            <span className="phase1-market__formula-operator">÷</span>
            <FormulaChip label={t("game:market.domesticCapacity", "国内承接量")} value={formatNumber(domesticSoftCap)} />
            <span className="phase1-market__formula-operator">=</span>
            <FormulaChip label={t("game:market.referencePrice", "正常单价")} value={formatNumber(equilibriumPrice)} tone="accent" />
          </div>
          {clampedDomestic > 0 ? (
            <div className="phase1-market__formula-row phase1-market__formula-row--secondary">
              <FormulaChip label={t("game:market.allocated", "投放")} value={formatNumber(clampedDomestic)} />
              <FormulaChip label={t("game:market.allocationFactor", "投放系数")} value={formatNumber(domesticFactor)} />
              <FormulaChip label={t("game:market.priceBeforeFloor", "夹取前价")} value={formatNumber(preview.priceBeforeFloor)} />
              <FormulaChip label={t("game:market.minimumPrice", "最低价")} value={formatNumber(minimumDomesticPrice)} />
              <FormulaChip label={t("game:market.maximumPrice", "最高价")} value={formatNumber(maximumDomesticPrice)} />
            </div>
          ) : (
            <p className="phase1-market__calculation-hint">
              {t("game:market.domesticAllocationEmptyCalculation", {
                minimum: formatNumber(minimumDomesticPrice),
                maximum: formatNumber(maximumDomesticPrice),
                defaultValue: "当前未投放国内商品，只显示公式参考价；选择投放量后会按投放量重新计算，价格限制在 {{minimum}} 到 {{maximum}}。",
              })}
            </p>
          )}
          <div className="phase1-market__formula-result">
            <span>{t("game:market.revenue")}</span>
            <strong>{formatNumber(preview.soldQty)} × {formatNumber(preview.price)} = {formatNumber(preview.revenue)}</strong>
          </div>
          <div className="phase1-market__formula-row phase1-market__formula-row--secondary">
            <FormulaChip label={t("game:market.incomeAllocationRatio", "本轮收入分配")} value={formatIncomeRatio(incomeAllocationRatio)} tone="accent" />
            <FormulaChip label={t("game:settlement.consumerPurchasingPower", "民间购买力")} value={`+${formatNumber(estimatedBudgetAllocation.domesticMarket)}`} />
            <FormulaChip label={t("game:settlement.factoryBudget", "工厂预算")} value={`+${formatNumber(estimatedBudgetAllocation.factory)}`} />
            <FormulaChip label={t("game:settlement.governmentFiscal", "政府财政")} value={`+${formatNumber(estimatedBudgetAllocation.governmentFiscal)}`} />
          </div>
        </div>
      </article>

      {/* ── Overseas Market Cards ── */}
      {overseasRegions.length > 0 && (
        <div className="phase1-market__regions-grid">
          {overseasRegions.map((region) => {
            const allocation = externalAllocations.find((item) => item.marketId === region.regionId);
            const quantity = allocation?.quantity ?? 0;
            const accessible = region.isAccessible;
            const competitionDeployment = competitionDeploymentByRegion.get(region.regionId);
            const competitionPower = calculateDeploymentPower(competitionDeployment, competitionConfig);
            const regionRewardCapacity = rewardCapacityByRegion.get(region.regionId) ?? 0;
            const sharedCapacityUsedByOtherRegions = externalAllocations.reduce((sum, item) => {
              if (item.marketId === region.regionId) {
                return sum;
              }
              const rewardCapacity = rewardCapacityByRegion.get(item.marketId) ?? 0;
              return sum + Math.max(0, Math.max(0, item.quantity) - rewardCapacity);
            }, 0);
            const inventoryRemainingForRegion = Math.max(
              0,
              totalGoods - clampedDomestic - (externalAllocationTotal - quantity),
            );
            const marketCapacityForRegion = Math.max(
              0,
              regionRewardCapacity + Math.max(0, overseasMarketCapacity - sharedCapacityUsedByOtherRegions),
            );
            const maxForRegion = Math.max(
              0,
              Math.min(
                inventoryRemainingForRegion,
                marketCapacityForRegion,
              ),
            );
            const overseasPrice = getFixedOverseasPrice(region);
            const regionAudit = overseasAuditRowsByRegion.get(region.regionId);
            const actualOverseasSold = regionAudit?.sold ?? 0;
            const actualOverseasRevenue = regionAudit?.revenue ?? 0;
            const rewardSold = regionAudit?.rewardSold ?? 0;
            const sharedSold = regionAudit?.sharedSold ?? 0;
            const activeRewardCapacity = regionAudit?.rewardCapacity ?? 0;
            const usedInfantryOutsideRegion = competitionDeployments.reduce(
              (sum, item) => item.marketId === region.regionId ? sum : sum + Math.max(0, item.infantry),
              0,
            );
            const usedArtilleryOutsideRegion = competitionDeployments.reduce(
              (sum, item) => item.marketId === region.regionId ? sum : sum + Math.max(0, item.artillery),
              0,
            );
            const maxInfantryForRegion = Math.max(
              0,
              Math.floor(competitionConfig.availableArmy.infantry ?? 0) - usedInfantryOutsideRegion,
            );
            const maxArtilleryForRegion = Math.max(
              0,
              Math.floor(competitionConfig.availableArmy.artillery ?? 0) - usedArtilleryOutsideRegion,
            );
            const competitionLockedReason = region.competitionLockedReason ?? null;
            const canCompete = Boolean(region.canCompete);
            const marketStatus = buildRegionMarketStatus(region, t);
            const displayRegionLabel = getDisplayRegionLabel(region);

            function handleRegionDelta(delta: number) {
              if (readOnly) {
                return;
              }
              onExternalAllocationChange(region.regionId, clamp(quantity + delta, 0, maxForRegion));
            }

            function handleRegionZero() {
              if (readOnly) {
                return;
              }
              onExternalAllocationChange(region.regionId, 0);
            }

            function handleRegionMax() {
              if (readOnly) {
                return;
              }
              onExternalAllocationChange(region.regionId, maxForRegion);
            }

            function handleCompetitionDelta(unit: "infantry" | "artillery", delta: number) {
              if (readOnly || !canCompete) {
                return;
              }
              const nextInfantry = unit === "infantry"
                ? clamp((competitionDeployment?.infantry ?? 0) + delta, 0, maxInfantryForRegion)
                : clamp(competitionDeployment?.infantry ?? 0, 0, maxInfantryForRegion);
              const nextArtillery = unit === "artillery"
                ? clamp((competitionDeployment?.artillery ?? 0) + delta, 0, maxArtilleryForRegion)
                : clamp(competitionDeployment?.artillery ?? 0, 0, maxArtilleryForRegion);
              onCompetitionDeploymentChange(region.regionId, nextInfantry, nextArtillery);
            }

            const cardClass = [
              "phase1-market__card",
              "phase1-market__card--overseas",
              !accessible && "phase1-market__card--locked",
              accessible && region.isBlockaded && "phase1-market__card--exclusive",
              accessible && (quantity > 0 || competitionPower > 0) && "phase1-market__card--active",
            ]
              .filter(Boolean)
              .join(" ");

            const lockHint = !accessible ? getLockReasonLabel(region, t) : null;
            const competitionLockHint = competitionLockedReason
              ? getCompetitionLockReasonLabel(competitionLockedReason, t)
              : null;

            return (
              <article key={region.regionId} className={cardClass}>
                <header className="phase1-market__card-header">
                  <span className="phase1-market__card-name">{displayRegionLabel}</span>
                  {accessible ? (
                    <span className={`phase1-market__card-badge phase1-market__card-badge--${marketStatus.tone}`}>
                      {marketStatus.badge}
                    </span>
                  ) : (
                    <span className="phase1-market__card-lock" title={marketStatus.hint ?? lockHint ?? i18n.t("common:notAvailable")}>
                      <svg className="phase1-market__card-lock-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="7" width="10" height="7" rx="1.5" />
                        <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                      </svg>
                      {marketStatus.badge}
                    </span>
                  )}
                </header>

                {marketStatus.hint ? (
                  <p className="phase1-market__card-lock-hint">{marketStatus.hint}</p>
                ) : null}

                {!accessible && lockHint && lockHint !== marketStatus.hint ? (
                  <p className="phase1-market__card-lock-hint">{lockHint}</p>
                ) : null}

                <div className="phase1-market__overseas-price">
                  <span className="phase1-market__overseas-price-label">{t("game:market.fixedOverseasPrice", "区域固定价")}</span>
                  <strong className="phase1-market__overseas-price-value">{formatNumber(overseasPrice)} {t("game:market.fiscalPerUnit")}</strong>
                </div>
                {accessible ? (
                  <div className="phase1-market__calculation phase1-market__calculation--overseas">
                    <div className="phase1-market__formula-row" aria-label={t("game:market.overseasCapacityCalculation", {
                      quantity: formatNumber(quantity),
                      sharedCapacity: formatNumber(overseasMarketCapacity),
                      rewardCapacity: formatNumber(activeRewardCapacity),
                      sold: formatNumber(actualOverseasSold),
                      defaultValue: "投放 {{quantity}}；本轮共享海外容量 {{sharedCapacity}}，该区域竞争额外容量 {{rewardCapacity}}，当前实际成交 {{sold}}。",
                    })}>
                      <FormulaChip label={t("game:market.allocated", "投放")} value={formatNumber(quantity)} />
                      <FormulaChip label={t("game:market.actualSold", "成交")} value={formatNumber(actualOverseasSold)} tone="accent" />
                      <FormulaChip label={t("game:market.sharedCapacity", "共享容量")} value={`${formatNumber(sharedSold)} / ${formatNumber(overseasMarketCapacity)}`} />
                      <FormulaChip label={t("game:market.competitionCapacity", "竞争容量")} value={`${formatNumber(rewardSold)} / ${formatNumber(activeRewardCapacity)}`} />
                    </div>
                    <div className="phase1-market__formula-result">
                      <span>{t("game:market.revenue")}</span>
                      <strong>{formatNumber(actualOverseasSold)} × {formatNumber(overseasPrice)} = {formatNumber(actualOverseasRevenue)}</strong>
                    </div>
                  </div>
                ) : (
                  <p className="phase1-market__price-note">
                    {t("game:market.fixedOverseasPriceLockedNote", {
                      price: formatNumber(overseasPrice),
                      quantity,
                      defaultValue: "固定价 {{price}}，但当前区域不可出售；投放 {{quantity}} 也会按成交 0、收入 0 处理，容量视为 0。",
                    })}
                  </p>
                )}

                {accessible ? (
                  <>
                    <div className="phase1-market__stepper">
                      <button
                        type="button"
                        className="phase1-market__stepper-btn"
                        disabled={readOnly || quantity <= 0}
                        onClick={() => handleRegionDelta(-1)}
                        aria-label={t("game:market.reduceRegion", { region: displayRegionLabel })}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="phase1-market__stepper-zero"
                        disabled={readOnly || quantity <= 0}
                        onClick={handleRegionZero}
                        aria-label={t("game:market.clearRegion", { region: displayRegionLabel })}
                      >
                        0
                      </button>
                      <span className="phase1-market__stepper-value">{quantity}</span>
                      <button
                        type="button"
                        className="phase1-market__stepper-btn"
                        disabled={readOnly || quantity >= maxForRegion}
                        onClick={() => handleRegionDelta(1)}
                        aria-label={t("game:market.increaseRegion", { region: displayRegionLabel })}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="phase1-market__stepper-max"
                        disabled={readOnly || quantity >= maxForRegion}
                        onClick={handleRegionMax}
                        aria-label={t("game:market.maxRegion", { region: displayRegionLabel })}
                      >
                        MAX
                      </button>
                    </div>

                    <div className="phase1-market__competition">
                      <div className="phase1-market__competition-header">
                        <span className="phase1-market__competition-title">{t("game:market.competition")}</span>
                        {canCompete ? (
                          <span className="phase1-market__competition-power">{t("game:military.militaryPoints")} {competitionPower}</span>
                        ) : (
                          <span className="phase1-market__competition-lock">{competitionLockHint ?? t("game:market.cannotCompete")}</span>
                        )}
                      </div>
                      {canCompete ? (
                        <>
                          <div className="phase1-market__unit-controls">
                            <UnitStepper
                              label={t("game:market.infantry")}
                              ariaContext={displayRegionLabel}
                              value={competitionDeployment?.infantry ?? 0}
                              max={maxInfantryForRegion}
                              readOnly={readOnly}
                              onDelta={(delta) => handleCompetitionDelta("infantry", delta)}
                            />
                            <UnitStepper
                              label={t("game:market.artillery")}
                              ariaContext={displayRegionLabel}
                              value={competitionDeployment?.artillery ?? 0}
                              max={maxArtilleryForRegion}
                              readOnly={readOnly}
                              onDelta={(delta) => handleCompetitionDelta("artillery", delta)}
                            />
                          </div>
                          <p className="phase1-market__price-note">
                            {t("game:market.competitionCaptureNote", {
                              capacity: region.competitionRewardCapacityBonus ?? competitionConfig.rewardCapacityBonus,
                              estimated: regionRewardCapacity > 0
                                ? `${getInlineSeparator()}${t("game:market.extraCapacityActive", "extra capacity active")}`
                                : "",
                              minPower: `${getInlineSeparator()}${t("game:military.militaryPointsRequired", { points: region.competitionMinimumPower ?? competitionConfig.minimumPower })}`,
                            })}
                          </p>
                        </>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="phase1-market__footer">
        <span className="phase1-market__footer-row">
          <span className="phase1-market__footer-label">{t("game:market.totalAllocated")}</span>
          <span className="phase1-market__footer-value">{totalAllocated} / {totalGoods}</span>
        </span>
        <span className="phase1-market__footer-row">
          <span className="phase1-market__footer-label">{t("game:market.totalEstimatedRevenue")}</span>
          <span className="phase1-market__footer-value phase1-market__footer-value--highlight">{preview.revenue + overseasRevenue} {t("game:settlement.fiscalUnit")}</span>
        </span>
      </div>

      <details className="phase1-market__audit" data-testid="phase1-market-audit">
        <summary className="phase1-market__audit-summary">
          <span>{t("game:market.auditSummaryTitle", "Market Calculation Check")}</span>
          <span>
            {t("game:market.auditCurrentEstimate", {
              domestic: formatNumber(preview.revenue),
              overseas: formatNumber(overseasAuditRevenue),
              total: formatNumber(totalEstimatedRevenue),
              defaultValue: "Current estimate: domestic {{domestic}} · overseas {{overseas}} · total {{total}}",
            })}
          </span>
        </summary>
        <p className="phase1-market__audit-note">
          {t(
            "game:market.auditNote",
            "This panel is for calculation verification. Backend reference data is the baseline when the sales phase starts; after changing allocations, use the current allocation calculation for sold price, sold quantity, and revenue.",
          )}
        </p>
        <div className="phase1-market__audit-grid">
          <section className="phase1-market__audit-section">
            <h4>{t("game:market.auditBackendReference", "Backend Reference Data")}</h4>
            <dl className="phase1-market__audit-list">
              <AuditMetric label={t("game:market.auditGoodsInventory", "Goods Inventory")} value={formatNumber(totalGoods)} />
              <AuditMetric label={t("game:market.auditConsumerPurchasingPower", "Consumer Purchasing Power")} value={formatNumber(phase1Economy.consumptionPool ?? consumerPool)} />
              <AuditMetric label={t("game:market.auditDomesticDemand", "Domestic Demand")} value={formatNumber(domesticDemand)} />
              <AuditMetric label={t("game:market.auditPricingSoftCapK", "Pricing Soft Cap K")} value={formatNumber(domesticSoftCap)} />
              <AuditMetric label={t("game:market.auditBasePriceP0", "Base Price P0")} value={formatNumber(equilibriumPrice)} />
              <AuditMetric label={t("game:market.auditPriceBonus", "Price Bonus")} value={formatSignedNumber(domesticPriceBonus)} />
              <AuditMetric label={t("game:market.auditMinimumPrice", "Minimum Price")} value={formatNumber(minimumDomesticPrice)} />
              <AuditMetric label={t("game:market.auditMaximumPrice", "Maximum Price")} value={formatNumber(maximumDomesticPrice)} />
              <AuditMetric label={t("game:market.auditBackendReferenceSoldPrice", "Backend Reference Sold Price")} value={formatNumber(backendSnapshotPrice)} testId="phase1-market-audit-backend-price" />
              <AuditMetric label={t("game:market.auditBackendReferencePreClampPrice", "Backend Reference Pre-Clamp Price")} value={formatNumber(phase1Economy.domesticPriceBeforeFloor ?? backendSnapshotPrice)} />
              <AuditMetric label={t("game:market.auditSharedOverseasCapacity", "Shared Overseas Capacity")} value={formatNumber(overseasMarketCapacity)} />
            </dl>
          </section>

          <section className="phase1-market__audit-section">
            <h4>{t("game:market.auditCurrentAllocation", "Current Allocation Calculation")}</h4>
            <dl className="phase1-market__audit-list">
              <AuditMetric label={t("game:market.auditDomesticAllocationQ", "Domestic Allocation Q")} value={formatNumber(clampedDomestic)} />
              <AuditMetric label={t("game:market.auditSupplyDemandAdjustment", "Supply-Demand Adjustment")} value={formatNumber(preview.supplyAdjustedPrice)} />
              <AuditMetric label={t("game:market.auditPreClampPrice", "Pre-Clamp Price")} value={formatNumber(preview.priceBeforeFloor)} />
              <AuditMetric label={t("game:market.auditDomesticSoldPrice", "Domestic Sold Price")} value={formatNumber(preview.price)} testId="phase1-market-audit-domestic-price" />
              <AuditMetric label={t("game:market.auditDomesticSoldQuantity", "Domestic Sold Quantity")} value={formatNumber(preview.soldQty)} />
              <AuditMetric label={t("game:market.auditDomesticRevenue", "Domestic Revenue")} value={formatNumber(preview.revenue)} testId="phase1-market-audit-domestic-revenue" />
              <AuditMetric label={t("game:market.auditOverseasRevenue", "Overseas Revenue")} value={formatNumber(overseasAuditRevenue)} />
              <AuditMetric label={t("game:market.auditTotalEstimatedRevenue", "Total Estimated Revenue")} value={formatNumber(totalEstimatedRevenue)} />
            </dl>
          </section>
        </div>

        <div className="phase1-market__audit-table-wrap">
          <table className="phase1-market__audit-table">
            <thead>
              <tr>
                <th>{t("game:market.auditRegion", "Region")}</th>
                <th>{t("game:market.auditFixedPrice", "Fixed Price")}</th>
                <th>{t("game:market.auditAllocation", "Allocation")}</th>
                <th>{t("game:market.auditCompetitionCapacity", "Competition Capacity")}</th>
                <th>{t("game:market.auditCompetitionSold", "Competition Sold")}</th>
                <th>{t("game:market.auditSharedSold", "Shared Sold")}</th>
                <th>{t("game:market.auditRevenue", "Revenue")}</th>
                <th>{t("game:market.auditStatus", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {overseasAuditRows.map((row) => (
                <tr key={row.regionId}>
                  <td>{row.label}</td>
                  <td>{formatNumber(row.fixedPrice)}</td>
                  <td>{formatNumber(row.requested)}</td>
                  <td>{formatNumber(row.rewardCapacity)}</td>
                  <td>{formatNumber(row.rewardSold)}</td>
                  <td>{formatNumber(row.sharedSold)}</td>
                  <td>{formatNumber(row.revenue)}</td>
                  <td>{formatAuditRegionStatus(row, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function AuditMetric({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
  testId?: string;
}) {
  return (
    <div className={["phase1-market__audit-metric", tone && `phase1-market__audit-metric--${tone}`].filter(Boolean).join(" ")}>
      <dt>{label}</dt>
      <dd data-testid={testId}>{value}</dd>
    </div>
  );
}

function FormulaChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent";
}) {
  return (
    <span className={["phase1-market__formula-chip", tone && `phase1-market__formula-chip--${tone}`].filter(Boolean).join(" ")}>
      <span className="phase1-market__formula-chip-label">{label}</span>
      <strong className="phase1-market__formula-chip-value">{value}</strong>
    </span>
  );
}

type OverseasAuditRow = {
  regionId: string;
  label: string;
  isAccessible: boolean;
  isBlockaded: boolean;
  blockadeController: string | null;
  fixedPrice: number;
  requested: number;
  rewardCapacity: number;
  rewardSold: number;
  sharedSold: number;
  sold: number;
  revenue: number;
};

function buildOverseasAuditRows({
  regions,
  allocations,
  inventoryAfterDomestic,
  overseasMarketCapacity,
  rewardCapacityByRegion,
}: {
  regions: RegionAccessStatus[];
  allocations: Phase1ExternalAllocation[];
  inventoryAfterDomestic: number;
  overseasMarketCapacity: number;
  rewardCapacityByRegion: Map<string, number>;
}): OverseasAuditRow[] {
  const rows = new Map<string, OverseasAuditRow>();
  for (const region of regions) {
    rows.set(region.regionId, {
      regionId: region.regionId,
      label: getDisplayRegionLabel(region),
      isAccessible: Boolean(region.isAccessible),
      isBlockaded: Boolean(region.isBlockaded),
      blockadeController: region.blockadeController ?? null,
      fixedPrice: getFixedOverseasPrice(region),
      requested: 0,
      rewardCapacity: Math.max(0, rewardCapacityByRegion.get(region.regionId) ?? 0),
      rewardSold: 0,
      sharedSold: 0,
      sold: 0,
      revenue: 0,
    });
  }

  let remainingInventory = Math.max(0, inventoryAfterDomestic);
  let remainingSharedCapacity = Math.max(0, overseasMarketCapacity);
  const rewardRemaining = new Map(rewardCapacityByRegion);
  for (const allocation of allocations) {
    if (!allocation.marketId) {
      continue;
    }
    const row = rows.get(allocation.marketId);
    if (!row) {
      continue;
    }
    const requested = Math.max(0, allocation.quantity);
    row.requested += requested;
    if (requested <= 0 || remainingInventory <= 0 || !row.isAccessible) {
      continue;
    }
    const rewardCapacity = Math.max(0, rewardRemaining.get(allocation.marketId) ?? 0);
    const rewardSold = Math.min(requested, remainingInventory, rewardCapacity);
    const sharedSold = Math.min(
      Math.max(0, requested - rewardSold),
      Math.max(0, remainingInventory - rewardSold),
      remainingSharedCapacity,
    );
    const sold = rewardSold + sharedSold;
    if (sold <= 0) {
      continue;
    }
    row.rewardSold += rewardSold;
    row.sharedSold += sharedSold;
    row.sold += sold;
    row.revenue += sold * row.fixedPrice;
    remainingInventory -= sold;
    remainingSharedCapacity -= sharedSold;
    rewardRemaining.set(allocation.marketId, Math.max(0, rewardCapacity - rewardSold));
  }

  return regions.map((region) => rows.get(region.regionId)).filter((row): row is OverseasAuditRow => Boolean(row));
}

function buildRegionMarketStatus(
  region: RegionAccessStatus,
  t: (key: string, options?: Record<string, unknown>) => string,
): { badge: string; tone: "open" | "exclusive" | "blocked"; hint: string | null } {
  const controller = region.blockadeController ? getCountryLabel(region.blockadeController) : null;
  if (region.isAccessible && region.isBlockaded) {
    return {
      badge: t("game:market.regionExclusiveByPlayer", { defaultValue: "Exclusive Access" }),
      tone: "exclusive",
      hint: t(
        "game:market.regionExclusiveByPlayerHint",
        { defaultValue: "You are blockading this region: you can continue selling here, while other countries cannot sell here or compete for the market." },
      ),
    };
  }
  if (!region.isAccessible && region.lockReason === "route_blocked") {
    return {
      badge: t("game:market.regionBlocked", { defaultValue: "Blocked" }),
      tone: "blocked",
      hint: controller
        ? t(
            "game:market.regionBlockedByCountryHint",
            { country: controller, defaultValue: "{{country}} is blockading this region. You cannot sell here, and capacity is treated as 0." },
          )
        : t("game:market.regionBlockedHint", { defaultValue: "This region is blockaded. You cannot sell here, and capacity is treated as 0." }),
    };
  }
  return {
    badge: getRegionAccessLevelLabel(region.accessLevel),
    tone: "open",
    hint: null,
  };
}

function formatAuditRegionStatus(
  row: OverseasAuditRow,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (row.isAccessible && row.isBlockaded) {
    return t("game:market.auditStatusExclusive", { defaultValue: "Exclusive Access" });
  }
  if (!row.isAccessible && row.isBlockaded) {
    return row.blockadeController
      ? t("game:market.auditStatusBlockadedByCountry", {
          country: getCountryLabel(row.blockadeController),
          defaultValue: "Blockaded by {{country}}",
        })
      : t("game:market.auditStatusBlockaded", { defaultValue: "Blocked" });
  }
  return row.isAccessible
    ? t("game:market.auditStatusOpen", { defaultValue: "Open" })
    : t("game:market.auditStatusUnavailable", { defaultValue: "Cannot sell" });
}

function getDisplayRegionLabel(region: RegionAccessStatus): string {
  const fromRegionId = getRegionLabel(region.regionId);
  if (fromRegionId && fromRegionId !== region.regionId) {
    return fromRegionId;
  }
  return translateBackend(region.label);
}

function getInlineSeparator(): string {
  return i18n.language?.startsWith("zh") ? "，" : ", ";
}

function UnitStepper({
  label,
  ariaContext,
  value,
  max,
  readOnly,
  onDelta,
}: {
  label: string;
  ariaContext?: string;
  value: number;
  max: number;
  readOnly: boolean;
  onDelta: (delta: number) => void;
}) {
  const ariaUnitLabel = ariaContext ? `${ariaContext}${label}` : label;
  return (
    <div className="phase1-market__unit-stepper">
      <span className="phase1-market__unit-label">{label}</span>
      <button
        type="button"
        className="phase1-market__stepper-btn"
        disabled={readOnly || value <= 0}
        onClick={() => onDelta(-1)}
        aria-label={i18n.t("game:market.reduceUnit", { unit: ariaUnitLabel })}
      >
        −
      </button>
      <span className="phase1-market__unit-value">{value}</span>
      <button
        type="button"
        className="phase1-market__stepper-btn"
        disabled={readOnly || value >= max}
        onClick={() => onDelta(1)}
        aria-label={i18n.t("game:market.increaseUnit", { unit: ariaUnitLabel })}
      >
        +
      </button>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function calculateDeploymentPower(
  deployment: Phase1ExternalCompetitionDeployment | undefined,
  config: OverseasCompetitionConfig,
): number {
  if (!deployment) {
    return 0;
  }
  return (
    Math.max(0, deployment.infantry) * Math.max(0, config.infantryPower)
    + Math.max(0, deployment.artillery) * Math.max(0, config.artilleryPower)
  );
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return `${Math.round(value * 100) / 100}`;
}

function formatRatioValue(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded}`;
}

function formatIncomeRatio(ratio: IncomeAllocationRatio | undefined): string {
  const safeRatio = ratio ?? {
    domesticMarket: 3,
    factory: 3,
    governmentFiscal: 4,
  };
  return [
    formatRatioValue(safeRatio.domesticMarket),
    formatRatioValue(safeRatio.factory),
    formatRatioValue(safeRatio.governmentFiscal),
  ].join(" / ");
}

function allocateIncomeByRatio(income: number, ratio: IncomeAllocationRatio): BudgetPools {
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

function formatSignedNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function domesticPriceFactor(allocation: number, domesticSoftCap: number): number {
  const safeSoftCap = Math.max(1, domesticSoftCap);
  return 2 - Math.max(0, allocation) / safeSoftCap;
}

type PreviewResult = DomesticMarketPreview & {
  priceBeforeFloor: number;
  balanceLabel: string;
};

function calculatePreview(
  allocation: number,
  domesticSoftCap: number,
  equilibriumPrice: number,
  domesticPriceBonus: number,
  minimumDomesticPrice: number,
  maximumDomesticPrice: number,
  getLabel: (key: string) => string,
): PreviewResult {
  const preview = calculateDomesticMarketPreview({
    allocation,
    softCap: domesticSoftCap,
    equilibriumPrice,
    minimumPrice: minimumDomesticPrice,
    maximumPrice: maximumDomesticPrice,
    priceBonus: domesticPriceBonus,
  });

  return {
    ...preview,
    balanceLabel: getLabel(preview.balanceKey),
  };
}

function formatSignedValue(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function buildMarketAdjustmentLabels({
  domesticCapacity,
  domesticPrice,
  overseasCapacity,
  labels,
}: {
  domesticCapacity: number;
  domesticPrice: number;
  overseasCapacity: number;
  labels: {
    domesticCapacity: string;
    domesticPrice: string;
    overseasCapacity: string;
  };
}): string[] {
  return [
    domesticCapacity !== 0
      ? `${labels.domesticCapacity} ${formatSignedValue(domesticCapacity)}`
      : null,
    domesticPrice !== 0
      ? `${labels.domesticPrice} ${formatSignedValue(domesticPrice)}`
      : null,
    overseasCapacity !== 0
      ? `${labels.overseasCapacity} ${formatSignedValue(overseasCapacity)}`
      : null,
  ].filter((item): item is string => Boolean(item));
}

import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n, { translateBackend } from "../../../i18n";

import type {
  BudgetPools,
  OverseasCompetitionLockReason,
  Phase1EconomyWorkspace,
  Phase1ExternalCompetitionDeployment,
  Phase1ExternalAllocation,
  RegionAccessStatus,
  RegionLockReason,
} from "../../../types";
import { getRegionAccessLevelLabel } from "../../../features/game/decisionShared";
import {
  MIN_SURPLUS_PRICE_RATIO,
  SHORTAGE_PRICE_DAMPING,
  SURPLUS_PRICE_DAMPING,
} from "../../../constants/priceCurves";
import "./Phase1MarketPanel.css";

function getLockReasonLabel(
  reason: RegionLockReason | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const map: Record<string, string> = {
    diplomacy_not_established: t("game:validateCompetitionNeedDiplomacy", { defaultValue: "Requires diplomacy first" }),
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
    diplomacy_not_established: t("game:validateCompetitionNeedDiplomacy", { defaultValue: "Requires diplomacy first" }),
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
  rewardPriceBonus: number;
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
  readOnly = false,
}: Phase1MarketPanelProps) {
  const { t } = useTranslation();
  const totalGoods = Math.max(0, goodsInventory);
  const domesticDemand = Math.max(0, phase1Economy.domesticDemand ?? 0);
  const equilibriumPrice = phase1Economy.equilibriumPrice ?? 0;
  const domesticPricePreview = phase1Economy.domesticPricePreview ?? equilibriumPrice;
  const domesticPriceBeforeCap = phase1Economy.domesticPriceBeforeCap ?? domesticPricePreview;
  const domesticPriceBonus = phase1Economy.domesticPriceBonus ?? 0;
  const overseasPriceBonus = phase1Economy.overseasPriceBonus ?? 0;
  const domesticCapacityBonus = phase1Economy.domesticMarketCapacityBonus ?? 0;
  const overseasCapacityBonus = phase1Economy.overseasMarketCapacityBonus ?? 0;
  const policyDomesticCapacityBonus = phase1Economy.governmentDomesticMarketCapacityBonus ?? 0;
  const policyDomesticPriceBonus = phase1Economy.governmentDomesticPriceBonus ?? 0;
  const policyOverseasCapacityBonus = phase1Economy.governmentOverseasMarketCapacityBonus ?? 0;
  const policyOverseasPriceBonus = phase1Economy.governmentOverseasPriceBonus ?? 0;
  const domesticPriceCeiling = phase1Economy.domesticPriceCeiling ?? 8;
  const overseasPriceCeiling = phase1Economy.overseasPriceCeiling ?? 24;
  const consumerPool = budgetPools.domesticMarket ?? 0;
  const marketAdjustmentLabels = {
    domesticCapacity: t("game:government.effect.domesticCapacity", "国内容量"),
    domesticPrice: t("game:government.effect.domesticPrice", "国内价格"),
    overseasCapacity: t("game:government.effect.overseasCapacity", "海外容量"),
    overseasPrice: t("game:effect.overseasPriceBonusDelta", "海外价格"),
  };
  const activeGovernmentAdjustments = buildMarketAdjustmentLabels({
    domesticCapacity: policyDomesticCapacityBonus,
    domesticPrice: policyDomesticPriceBonus,
    overseasCapacity: policyOverseasCapacityBonus,
    overseasPrice: policyOverseasPriceBonus,
    labels: marketAdjustmentLabels,
  });
  const netMarketAdjustments = buildMarketAdjustmentLabels({
    domesticCapacity: domesticCapacityBonus,
    domesticPrice: domesticPriceBonus,
    overseasCapacity: overseasCapacityBonus,
    overseasPrice: overseasPriceBonus,
    labels: marketAdjustmentLabels,
  });
  const activeGovernmentAdjustmentText = activeGovernmentAdjustments.join(" · ");
  const netMarketAdjustmentText = netMarketAdjustments.join(" · ");
  const shouldShowNetAdjustments =
    netMarketAdjustments.length > 0 && netMarketAdjustmentText !== activeGovernmentAdjustmentText;

  const externalAllocationTotal = externalAllocations.reduce(
    (sum, item) => sum + Math.max(0, item.quantity),
    0,
  );
  const overseasRegions = regionAccessStatus.filter((status) => status.regionId !== "domestic");
  const competitionConfig = overseasCompetition ?? {
    availableArmy: {},
    rewardCapacityBonus: 0,
    rewardPriceBonus: 0,
    infantryPower: 1,
    artilleryPower: 2,
    minimumPower: 1,
  };
  const competitionDeploymentByRegion = new Map<string, Phase1ExternalCompetitionDeployment>(
    competitionDeployments.map((deployment) => [deployment.marketId, deployment]),
  );
  const rewardCapacityByRegion = new Map<string, number>();
  const competitionPriceBonusByRegion = new Map<string, number>();
  for (const region of overseasRegions) {
    const deployment = competitionDeploymentByRegion.get(region.regionId);
    const power = calculateDeploymentPower(deployment, competitionConfig);
    if (region.canCompete && power >= competitionConfig.minimumPower) {
      const rewardCapacity = region.competitionRewardCapacityBonus ?? competitionConfig.rewardCapacityBonus;
      const rewardPrice = region.competitionRewardPriceBonus ?? competitionConfig.rewardPriceBonus;
      rewardCapacityByRegion.set(region.regionId, Math.max(0, rewardCapacity));
      competitionPriceBonusByRegion.set(region.regionId, Math.max(0, rewardPrice));
    }
  }

  const domesticLimit = Math.floor(Math.max(
    0,
    Math.min(
      totalGoods - externalAllocationTotal,
      phase1Economy?.domesticDemand ?? totalGoods,
      domesticMarketCapacity,
    ),
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
      domesticDemand,
      equilibriumPrice,
      domesticPricePreview,
      domesticPriceBeforeCap,
      domesticPriceBonus,
      domesticPriceCeiling,
      marketLabel,
    ),
    [
      clampedDomestic,
      domesticDemand,
      equilibriumPrice,
      domesticPricePreview,
      domesticPriceBeforeCap,
      domesticPriceBonus,
      domesticPriceCeiling,
      marketLabel,
    ],
  );

  const totalAllocated = clampedDomestic + externalAllocationTotal;

  let remainingInventoryForOverseasPreview = Math.max(0, totalGoods - clampedDomestic);
  let remainingOverseasCapacityForPreview = Math.max(0, overseasMarketCapacity);
  const rewardCapacityForPreview = new Map(rewardCapacityByRegion);
  const overseasRevenue = externalAllocations.reduce((sum, alloc) => {
    if (remainingInventoryForOverseasPreview <= 0) {
      return sum;
    }
    const region = overseasRegions.find((r) => r.regionId === alloc.marketId);
    const mult = region?.priceMultiplier ?? 1.0;
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
    const competitionPriceBonus = competitionPriceBonusByRegion.get(alloc.marketId) ?? 0;
    return sum + sold * calculateOverseasPrice(
      equilibriumPrice,
      mult,
      overseasPriceBonus + competitionPriceBonus,
      overseasPriceCeiling,
    ).price;
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
          <span className="phase1-market__stat-value">{domesticLimit}</span>
          <span className="phase1-market__stat-label">{t("game:market.capacityLimit")}</span>
        </div>
      </div>

      <div
        className={[
          "phase1-market__policy-banner",
          activeGovernmentAdjustments.length > 0 && "phase1-market__policy-banner--active",
        ].filter(Boolean).join(" ")}
        data-testid="phase1-market-government-adjustments"
      >
        <strong>{t("game:market.governmentAdjustment", "政府市场政策")}</strong>
        <span>
          {activeGovernmentAdjustments.length > 0
            ? activeGovernmentAdjustmentText
            : shouldShowNetAdjustments
              ? t("game:market.noGovernmentPolicyButNetAdjustments", "本轮暂无政府市场政策；下方净调整来自事件、既有市场状态或军事竞争。")
              : t("game:market.noGovernmentAdjustment", "本轮暂无政府市场政策")}
        </span>
        {shouldShowNetAdjustments ? (
          <span className="phase1-market__policy-banner-net">
            {t("game:market.netAdjustment", "当前净调整")}：{netMarketAdjustmentText}
          </span>
        ) : null}
      </div>

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
            <span className="phase1-market__preview-label">{t("game:market.price")}</span>
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
        <p className="phase1-market__price-note">
          {buildDomesticPriceNote(preview, domesticPriceBonus, domesticPriceCeiling, t)}
        </p>
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
            const regionRewardPrice = competitionPriceBonusByRegion.get(region.regionId) ?? 0;
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
            const multiplier = region.priceMultiplier ?? 1.0;
            const overseasPrice = calculateOverseasPrice(equilibriumPrice, multiplier, overseasPriceBonus, overseasPriceCeiling);
            const competitionPrice = calculateOverseasPrice(
              equilibriumPrice,
              multiplier,
              overseasPriceBonus + regionRewardPrice,
              overseasPriceCeiling,
            );
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
            const hasCompetitionPriceBonus = canCompete
              && competitionPower >= competitionConfig.minimumPower
              && regionRewardPrice > 0;

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
              accessible && (quantity > 0 || competitionPower > 0) && "phase1-market__card--active",
            ]
              .filter(Boolean)
              .join(" ");

            const lockHint = !accessible ? getLockReasonLabel(region.lockReason, t) : null;
            const competitionLockHint = competitionLockedReason
              ? accessible && competitionLockedReason === "diplomacy_not_established"
                ? t("game:market.openMarketNoCompetition", "开放市场可直接投放；市场争夺需要先建立双边外交。")
                : getCompetitionLockReasonLabel(competitionLockedReason, t)
              : null;

            return (
              <article key={region.regionId} className={cardClass}>
                <header className="phase1-market__card-header">
                  <span className="phase1-market__card-name">{region.label}</span>
                  {accessible ? (
                    <span className="phase1-market__card-badge">{getRegionAccessLevelLabel(region.accessLevel)}</span>
                  ) : (
                    <span className="phase1-market__card-lock" title={lockHint ?? i18n.t("common:notAvailable")}>
                      <svg className="phase1-market__card-lock-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="7" width="10" height="7" rx="1.5" />
                        <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                      </svg>
                      {t("game:market.notYetOpen")}
                    </span>
                  )}
                </header>

                {!accessible && lockHint ? (
                  <p className="phase1-market__card-lock-hint">{lockHint}</p>
                ) : null}

                {accessible ? (
                  <>
                    <div className="phase1-market__stepper">
                      <button
                        type="button"
                        className="phase1-market__stepper-btn"
                        disabled={readOnly || quantity <= 0}
                        onClick={() => handleRegionDelta(-1)}
                        aria-label={t("game:market.reduceRegion", { region: region.label })}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="phase1-market__stepper-zero"
                        disabled={readOnly || quantity <= 0}
                        onClick={handleRegionZero}
                        aria-label={t("game:market.clearRegion", { region: region.label })}
                      >
                        0
                      </button>
                      <span className="phase1-market__stepper-value">{quantity}</span>
                      <button
                        type="button"
                        className="phase1-market__stepper-btn"
                        disabled={readOnly || quantity >= maxForRegion}
                        onClick={() => handleRegionDelta(1)}
                        aria-label={t("game:market.increaseRegion", { region: region.label })}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="phase1-market__stepper-max"
                        disabled={readOnly || quantity >= maxForRegion}
                        onClick={handleRegionMax}
                        aria-label={t("game:market.maxRegion", { region: region.label })}
                      >
                        MAX
                      </button>
                    </div>

                    <div className="phase1-market__overseas-price">
                      <span className="phase1-market__overseas-price-label">{t("game:market.basePrice")}</span>
                      <strong className="phase1-market__overseas-price-value">{formatNumber(overseasPrice.price)} {t("game:market.fiscalPerUnit")}</strong>
                    </div>
                    {hasCompetitionPriceBonus ? (
                      <div className="phase1-market__overseas-price phase1-market__overseas-price--reward">
                        <span className="phase1-market__overseas-price-label">{t("game:market.successPrice")}</span>
                        <strong className="phase1-market__overseas-price-value">{formatNumber(competitionPrice.price)} {t("game:market.fiscalPerUnit")}</strong>
                      </div>
                    ) : null}
                    <p className="phase1-market__price-note">
                      {t("game:market.overseasPriceNote", {
                        base: formatNumber(overseasPrice.basePrice),
                        bonus: formatSignedValue(overseasPriceBonus),
                        captureBonus: hasCompetitionPriceBonus ? `，${t("game:market.competition")} +${regionRewardPrice}` : "",
                        ceiling: overseasPriceCeiling,
                        capped: (hasCompetitionPriceBonus ? competitionPrice.isCapped : overseasPrice.isCapped) ? `，${t("game:market.domesticPriceNote_capped")}` : "",
                      })}
                    </p>
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
                              value={competitionDeployment?.infantry ?? 0}
                              max={maxInfantryForRegion}
                              readOnly={readOnly}
                              onDelta={(delta) => handleCompetitionDelta("infantry", delta)}
                            />
                            <UnitStepper
                              label={t("game:market.artillery")}
                              value={competitionDeployment?.artillery ?? 0}
                              max={maxArtilleryForRegion}
                              readOnly={readOnly}
                              onDelta={(delta) => handleCompetitionDelta("artillery", delta)}
                            />
                          </div>
                          <p className="phase1-market__price-note">
                            {t("game:market.competitionCaptureNote", {
                              capacity: region.competitionRewardCapacityBonus ?? competitionConfig.rewardCapacityBonus,
                              price: region.competitionRewardPriceBonus ?? competitionConfig.rewardPriceBonus,
                              estimated: regionRewardCapacity > 0
                                ? `，${t("game:market.estimatedSold")} ${formatNumber(competitionPrice.price)} ${t("game:market.fiscalPerUnit")}`
                                : "",
                              minPower: `，${t("game:military.militaryPointsRequired", { points: region.competitionMinimumPower ?? competitionConfig.minimumPower })}`,
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
    </section>
  );
}

function UnitStepper({
  label,
  value,
  max,
  readOnly,
  onDelta,
}: {
  label: string;
  value: number;
  max: number;
  readOnly: boolean;
  onDelta: (delta: number) => void;
}) {
  return (
    <div className="phase1-market__unit-stepper">
      <span className="phase1-market__unit-label">{label}</span>
      <button
        type="button"
        className="phase1-market__stepper-btn"
        disabled={readOnly || value <= 0}
        onClick={() => onDelta(-1)}
        aria-label={i18n.t("game:market.reduceUnit", { unit: label })}
      >
        −
      </button>
      <span className="phase1-market__unit-value">{value}</span>
      <button
        type="button"
        className="phase1-market__stepper-btn"
        disabled={readOnly || value >= max}
        onClick={() => onDelta(1)}
        aria-label={i18n.t("game:market.increaseUnit", { unit: label })}
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

function clampPrice(value: number, max = 8): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(1, Math.min(max, value));
}

function calculateOverseasPrice(
  equilibriumPrice: number,
  multiplier: number,
  bonus: number,
  ceiling: number,
): OverseasPriceBreakdown {
  const basePrice = Math.floor(equilibriumPrice * multiplier);
  const priceBeforeCap = basePrice + bonus;
  return {
    basePrice,
    priceBeforeCap,
    price: Math.max(1, Math.min(ceiling, priceBeforeCap)),
    isCapped: priceBeforeCap > ceiling,
  };
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return `${Math.round(value * 100) / 100}`;
}

type PreviewResult = {
  price: number;
  supplyAdjustedPrice: number;
  priceBeforeCap: number;
  isPriceCapped: boolean;
  soldQty: number;
  revenue: number;
  balanceLabel: string;
  tone: "shortage" | "surplus" | "balanced";
};

type OverseasPriceBreakdown = {
  basePrice: number;
  priceBeforeCap: number;
  price: number;
  isCapped: boolean;
};

function calculatePreview(
  allocation: number,
  demand: number,
  equilibriumPrice: number,
  fallbackPrice: number,
  fallbackPriceBeforeCap: number,
  domesticPriceBonus: number,
  domesticPriceCeiling: number,
  getLabel: (key: string) => string,
): PreviewResult {
  if (allocation <= 0) {
    const referencePrice = clampPrice(fallbackPrice, domesticPriceCeiling);
    return {
      price: referencePrice,
      supplyAdjustedPrice: Math.max(1, referencePrice - domesticPriceBonus),
      priceBeforeCap: fallbackPriceBeforeCap,
      isPriceCapped: fallbackPriceBeforeCap > domesticPriceCeiling,
      soldQty: 0,
      revenue: 0,
      balanceLabel: getLabel("notAllocated"),
      tone: "balanced",
    };
  }

  const soldQty = Math.min(allocation, demand);

  if (demand <= 0) {
    return {
      price: 0,
      supplyAdjustedPrice: 0,
      priceBeforeCap: 0,
      isPriceCapped: false,
      soldQty: 0,
      revenue: 0,
      balanceLabel: getLabel("noDemand"),
      tone: "surplus",
    };
  }

  const ratio = allocation / demand;
  let price = equilibriumPrice;
  let balanceLabel = getLabel("supplyDemandBalanced");
  let tone: PreviewResult["tone"] = "balanced";

  if (ratio < 1) {
    const scale = 1 + (1 - ratio) * SHORTAGE_PRICE_DAMPING;
    price = equilibriumPrice * scale;
    balanceLabel = getLabel("shortage");
    tone = "shortage";
  } else if (ratio > 1) {
    const scale = Math.max(MIN_SURPLUS_PRICE_RATIO, 1 - (ratio - 1) * SURPLUS_PRICE_DAMPING);
    price = equilibriumPrice * scale;
    balanceLabel = getLabel("surplus");
    tone = "surplus";
  }

  const priceBeforeCap = price + domesticPriceBonus;
  const clampedPrice = clampPrice(priceBeforeCap, domesticPriceCeiling);

  return {
    price: clampedPrice,
    supplyAdjustedPrice: price,
    priceBeforeCap,
    isPriceCapped: priceBeforeCap > domesticPriceCeiling,
    soldQty,
    revenue: Math.floor(soldQty * clampedPrice),
    balanceLabel,
    tone,
  };
}

function buildDomesticPriceNote(
  preview: PreviewResult,
  domesticPriceBonus: number,
  domesticPriceCeiling: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (preview.soldQty <= 0) {
    return t("game:market.noAllocationPriceNote", { ceiling: domesticPriceCeiling });
  }

  return [
    `${t("game:market.supplyDemandBalanced")} ${formatNumber(preview.supplyAdjustedPrice)}`,
    `${t("game:effect.domesticPriceBonusDelta", { defaultValue: "国内价格" })} ${formatSignedValue(domesticPriceBonus)}`,
    `${t("game:market.priceBeforeCap", { defaultValue: "封顶前价格" })} ${formatNumber(preview.priceBeforeCap)}`,
    `${t("game:market.capacityLimit")} ${domesticPriceCeiling}`,
    preview.isPriceCapped ? t("game:market.domesticPriceNote_capped") : null,
  ].filter(Boolean).join("，");
}

function formatSignedValue(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function buildMarketAdjustmentLabels({
  domesticCapacity,
  domesticPrice,
  overseasCapacity,
  overseasPrice,
  labels,
}: {
  domesticCapacity: number;
  domesticPrice: number;
  overseasCapacity: number;
  overseasPrice: number;
  labels: {
    domesticCapacity: string;
    domesticPrice: string;
    overseasCapacity: string;
    overseasPrice: string;
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
    overseasPrice !== 0
      ? `${labels.overseasPrice} ${formatSignedValue(overseasPrice)}`
      : null,
  ].filter((item): item is string => Boolean(item));
}

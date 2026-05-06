import { useEffect, useMemo } from "react";

import type {
  BudgetPools,
  Phase1EconomyWorkspace,
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

const LOCK_REASON_LABELS: Record<RegionLockReason, string> = {
  diplomacy_not_established: "需要建立外交关系",
  route_blocked: "航线被封锁",
};

function lockReasonLabel(reason: RegionLockReason | null | undefined): string {
  if (reason && reason in LOCK_REASON_LABELS) {
    return LOCK_REASON_LABELS[reason];
  }
  return "暂不可进入";
}

type Phase1MarketPanelProps = {
  phase1Economy: Phase1EconomyWorkspace;
  goodsInventory: number;
  domesticMarketCapacity: number;
  overseasMarketCapacity: number;
  budgetPools: BudgetPools;
  regionAccessStatus: RegionAccessStatus[];
  draftAllocation: number;
  externalAllocations: Phase1ExternalAllocation[];
  onAllocationChange: (domesticAllocation: number) => void;
  onExternalAllocationChange: (marketId: string, quantity: number) => void;
  readOnly?: boolean;
};

export function Phase1MarketPanel({
  phase1Economy,
  goodsInventory,
  domesticMarketCapacity,
  overseasMarketCapacity,
  budgetPools,
  regionAccessStatus,
  draftAllocation,
  externalAllocations,
  onAllocationChange,
  onExternalAllocationChange,
  readOnly = false,
}: Phase1MarketPanelProps) {
  const totalGoods = Math.max(0, goodsInventory);
  const domesticDemand = Math.max(0, phase1Economy.domesticDemand ?? 0);
  const equilibriumPrice = phase1Economy.equilibriumPrice ?? 0;
  const domesticPricePreview = phase1Economy.domesticPricePreview ?? equilibriumPrice;
  const domesticPriceBeforeCap = phase1Economy.domesticPriceBeforeCap ?? domesticPricePreview;
  const domesticPriceBonus = phase1Economy.domesticPriceBonus ?? 0;
  const overseasPriceBonus = phase1Economy.overseasPriceBonus ?? 0;
  const domesticPriceCeiling = phase1Economy.domesticPriceCeiling ?? 8;
  const overseasPriceCeiling = phase1Economy.overseasPriceCeiling ?? 24;
  const consumerPool = budgetPools.domesticMarket ?? 0;

  const externalAllocationTotal = externalAllocations.reduce(
    (sum, item) => sum + Math.max(0, item.quantity),
    0,
  );

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

  const preview = useMemo(
    () => calculatePreview(
      clampedDomestic,
      domesticDemand,
      equilibriumPrice,
      domesticPricePreview,
      domesticPriceBeforeCap,
      domesticPriceBonus,
      domesticPriceCeiling,
    ),
    [
      clampedDomestic,
      domesticDemand,
      equilibriumPrice,
      domesticPricePreview,
      domesticPriceBeforeCap,
      domesticPriceBonus,
      domesticPriceCeiling,
    ],
  );

  const overseasRegions = regionAccessStatus.filter((status) => status.regionId !== "domestic");
  const totalAllocated = clampedDomestic + externalAllocationTotal;

  let remainingOverseasCapacityForPreview = Math.max(0, overseasMarketCapacity);
  const overseasRevenue = externalAllocations.reduce((sum, alloc) => {
    if (remainingOverseasCapacityForPreview <= 0) {
      return sum;
    }
    const region = overseasRegions.find((r) => r.regionId === alloc.marketId);
    const mult = region?.priceMultiplier ?? 1.0;
    const sold = Math.min(Math.max(0, alloc.quantity), remainingOverseasCapacityForPreview);
    remainingOverseasCapacityForPreview -= sold;
    return sum + sold * calculateOverseasPrice(equilibriumPrice, mult, overseasPriceBonus, overseasPriceCeiling).price;
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
          <span className="phase1-market__stat-label">商品库存</span>
        </div>
        <div className="phase1-market__stat">
          <span className="phase1-market__stat-value">{formatNumber(domesticDemand)}</span>
          <span className="phase1-market__stat-label">市场需求</span>
        </div>
        <div className="phase1-market__stat">
          <span className="phase1-market__stat-value">{consumerPool}</span>
          <span className="phase1-market__stat-label">定价池</span>
        </div>
        <div className="phase1-market__stat">
          <span className="phase1-market__stat-value">{domesticLimit}</span>
          <span className="phase1-market__stat-label">投放上限</span>
        </div>
      </div>

      {/* ── Domestic Market Card ── */}
      <article className="phase1-market__card phase1-market__card--domestic">
        <header className="phase1-market__card-header">
          <span className="phase1-market__card-name">国内市场</span>
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
            aria-label="减少国内市场投放"
          >
            −
          </button>
          <button
            type="button"
            className="phase1-market__stepper-zero"
            disabled={readOnly || clampedDomestic <= 0}
            onClick={handleDomesticZero}
            aria-label="国内市场投放清零"
          >
            0
          </button>
          <span className="phase1-market__stepper-value">{clampedDomestic}</span>
          <button
            type="button"
            className="phase1-market__stepper-btn"
            disabled={readOnly || clampedDomestic >= domesticLimit}
            onClick={() => handleDomesticDelta(1)}
            aria-label="增加国内市场投放"
          >
            +
          </button>
          <button
            type="button"
            className="phase1-market__stepper-max"
            disabled={readOnly || clampedDomestic >= domesticLimit}
            onClick={handleDomesticMax}
            aria-label="国内市场投放最大"
          >
            MAX
          </button>
        </div>

        <div className="phase1-market__preview-grid">
          <div className="phase1-market__preview-block">
            <span className="phase1-market__preview-label">价格</span>
            <strong className="phase1-market__preview-value">{formatNumber(preview.price)} 财政/件</strong>
          </div>
          <div className="phase1-market__preview-block">
            <span className="phase1-market__preview-label">预计成交</span>
            <strong className="phase1-market__preview-value">{preview.soldQty}</strong>
          </div>
          <div className="phase1-market__preview-block">
            <span className="phase1-market__preview-label">收入</span>
            <strong className="phase1-market__preview-value phase1-market__preview-value--gold">{preview.revenue}</strong>
          </div>
        </div>
        <p className="phase1-market__price-note">
          {buildDomesticPriceNote(preview, domesticPriceBonus, domesticPriceCeiling)}
        </p>
      </article>

      {/* ── Overseas Market Cards ── */}
      {overseasRegions.length > 0 && (
        <div className="phase1-market__regions-grid">
          {overseasRegions.map((region) => {
            const allocation = externalAllocations.find((item) => item.marketId === region.regionId);
            const quantity = allocation?.quantity ?? 0;
            const accessible = region.isAccessible;
            const maxForRegion = Math.max(
              0,
              Math.min(
                totalGoods - clampedDomestic - externalAllocationTotal + quantity,
                overseasMarketCapacity - externalAllocationTotal + quantity,
              ),
            );
            const multiplier = region.priceMultiplier ?? 1.0;
            const overseasPrice = calculateOverseasPrice(equilibriumPrice, multiplier, overseasPriceBonus, overseasPriceCeiling);

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

            const cardClass = [
              "phase1-market__card",
              "phase1-market__card--overseas",
              !accessible && "phase1-market__card--locked",
              accessible && quantity > 0 && "phase1-market__card--active",
            ]
              .filter(Boolean)
              .join(" ");

            const lockHint = !accessible ? lockReasonLabel(region.lockReason) : null;

            return (
              <article key={region.regionId} className={cardClass}>
                <header className="phase1-market__card-header">
                  <span className="phase1-market__card-name">{region.label}</span>
                  {accessible ? (
                    <span className="phase1-market__card-badge">{getRegionAccessLevelLabel(region.accessLevel)}</span>
                  ) : (
                    <span className="phase1-market__card-lock" title={lockHint ?? "未开放"}>
                      <svg className="phase1-market__card-lock-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="7" width="10" height="7" rx="1.5" />
                        <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                      </svg>
                      未开放
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
                        aria-label={`减少${region.label}投放`}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="phase1-market__stepper-zero"
                        disabled={readOnly || quantity <= 0}
                        onClick={handleRegionZero}
                        aria-label={`${region.label}投放清零`}
                      >
                        0
                      </button>
                      <span className="phase1-market__stepper-value">{quantity}</span>
                      <button
                        type="button"
                        className="phase1-market__stepper-btn"
                        disabled={readOnly || quantity >= maxForRegion}
                        onClick={() => handleRegionDelta(1)}
                        aria-label={`增加${region.label}投放`}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="phase1-market__stepper-max"
                        disabled={readOnly || quantity >= maxForRegion}
                        onClick={handleRegionMax}
                        aria-label={`${region.label}投放最大`}
                      >
                        MAX
                      </button>
                    </div>

                    <div className="phase1-market__overseas-price">
                      <span className="phase1-market__overseas-price-label">海外价格</span>
                      <strong className="phase1-market__overseas-price-value">{formatNumber(overseasPrice.price)} 财政/件</strong>
                    </div>
                    <p className="phase1-market__price-note">
                      基础 {formatNumber(overseasPrice.basePrice)} + 海外加成 {formatSignedValue(overseasPriceBonus)}
                      ，上限 {overseasPriceCeiling}{overseasPrice.isCapped ? "，已按上限成交" : ""}
                    </p>
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
          <span className="phase1-market__footer-label">总投放</span>
          <span className="phase1-market__footer-value">{totalAllocated} / {totalGoods}</span>
        </span>
        <span className="phase1-market__footer-row">
          <span className="phase1-market__footer-label">预计总收入</span>
          <span className="phase1-market__footer-value phase1-market__footer-value--highlight">{preview.revenue + overseasRevenue} 财政</span>
        </span>
      </div>
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
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
      balanceLabel: "未投放",
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
      balanceLabel: "无需求",
      tone: "surplus",
    };
  }

  const ratio = allocation / demand;
  let price = equilibriumPrice;
  let balanceLabel = "供需均衡";
  let tone: PreviewResult["tone"] = "balanced";

  if (ratio < 1) {
    const scale = 1 + (1 - ratio) * SHORTAGE_PRICE_DAMPING;
    price = equilibriumPrice * scale;
    balanceLabel = "供不应求";
    tone = "shortage";
  } else if (ratio > 1) {
    const scale = Math.max(MIN_SURPLUS_PRICE_RATIO, 1 - (ratio - 1) * SURPLUS_PRICE_DAMPING);
    price = equilibriumPrice * scale;
    balanceLabel = "供过于求";
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
): string {
  if (preview.soldQty <= 0) {
    return `未投放时仅显示参考价；实际成交会按投放量重新计算，价格上限 ${domesticPriceCeiling}。`;
  }

  return [
    `供需价 ${formatNumber(preview.supplyAdjustedPrice)}`,
    `国内加成 ${formatSignedValue(domesticPriceBonus)}`,
    `成交前 ${formatNumber(preview.priceBeforeCap)}`,
    `上限 ${domesticPriceCeiling}`,
    preview.isPriceCapped ? "已按上限成交" : null,
  ].filter(Boolean).join("，");
}

function formatSignedValue(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

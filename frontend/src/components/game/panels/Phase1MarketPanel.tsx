import { useMemo } from "react";

import type {
  BudgetPools,
  Phase1EconomyWorkspace,
  Phase1ExternalAllocation,
  RegionAccessStatus,
} from "../../../types";
import { getRegionAccessLevelLabel } from "../../../features/game/decisionShared";
import "./Phase1MarketPanel.css";

type Phase1MarketPanelProps = {
  phase1Economy: Phase1EconomyWorkspace;
  goodsInventory: number;
  budgetPools: BudgetPools;
  regionAccessStatus: RegionAccessStatus[];
  draftAllocation: number;
  externalAllocations: Phase1ExternalAllocation[];
  onAllocationChange: (domesticAllocation: number) => void;
  onExternalAllocationChange: (marketId: string, quantity: number) => void;
};

export function Phase1MarketPanel({
  phase1Economy,
  goodsInventory,
  budgetPools,
  regionAccessStatus,
  draftAllocation,
  externalAllocations,
  onAllocationChange,
  onExternalAllocationChange,
}: Phase1MarketPanelProps) {
  const totalGoods = Math.max(0, goodsInventory);
  const domesticDemand = Math.max(0, phase1Economy.domesticDemand ?? 0);
  const equilibriumPrice = phase1Economy.equilibriumPrice ?? 0;
  const domesticPricePreview = phase1Economy.domesticPricePreview ?? equilibriumPrice;
  const consumerPool = budgetPools.domesticMarket ?? 0;

  const externalAllocationTotal = externalAllocations.reduce(
    (sum, item) => sum + Math.max(0, item.quantity),
    0,
  );

  const clampedDomestic = clamp(draftAllocation, 0, totalGoods);

  const preview = useMemo(
    () => calculatePreview(clampedDomestic, domesticDemand, equilibriumPrice, domesticPricePreview),
    [clampedDomestic, domesticDemand, equilibriumPrice, domesticPricePreview],
  );

  const overseasRegions = regionAccessStatus.filter((status) => status.regionId !== "domestic");
  const totalAllocated = clampedDomestic + externalAllocationTotal;

  function handleDomesticDelta(delta: number) {
    onAllocationChange(clamp(clampedDomestic + delta, 0, totalGoods));
  }

  function handleDomesticZero() {
    onAllocationChange(0);
  }

  function handleDomesticMax() {
    onAllocationChange(totalGoods);
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
          <span className="phase1-market__stat-value">{domesticDemand}</span>
          <span className="phase1-market__stat-label">市场需求</span>
        </div>
        <div className="phase1-market__stat">
          <span className="phase1-market__stat-value">{consumerPool}</span>
          <span className="phase1-market__stat-label">购买力</span>
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
            disabled={clampedDomestic <= 0}
            onClick={() => handleDomesticDelta(-1)}
            aria-label="减少国内市场投放"
          >
            −
          </button>
          <button
            type="button"
            className="phase1-market__stepper-zero"
            disabled={clampedDomestic <= 0}
            onClick={handleDomesticZero}
            aria-label="国内市场投放清零"
          >
            0
          </button>
          <span className="phase1-market__stepper-value">{clampedDomestic}</span>
          <button
            type="button"
            className="phase1-market__stepper-btn"
            disabled={clampedDomestic >= totalGoods}
            onClick={() => handleDomesticDelta(1)}
            aria-label="增加国内市场投放"
          >
            +
          </button>
          <button
            type="button"
            className="phase1-market__stepper-max"
            disabled={clampedDomestic >= totalGoods}
            onClick={handleDomesticMax}
            aria-label="国内市场投放最大"
          >
            MAX
          </button>
        </div>

        <div className="phase1-market__preview-grid">
          <div className="phase1-market__preview-block">
            <span className="phase1-market__preview-label">价格</span>
            <strong className="phase1-market__preview-value">{preview.price}</strong>
          </div>
          <div className="phase1-market__preview-block">
            <span className="phase1-market__preview-label">可售出</span>
            <strong className="phase1-market__preview-value">{preview.soldQty}</strong>
          </div>
          <div className="phase1-market__preview-block">
            <span className="phase1-market__preview-label">收入</span>
            <strong className="phase1-market__preview-value phase1-market__preview-value--gold">{preview.revenue}</strong>
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
            const maxForRegion = Math.max(0, totalGoods - clampedDomestic - externalAllocationTotal + quantity);
            const overseasPrice = Math.round(equilibriumPrice * 1.2 * 100) / 100;

            function handleRegionDelta(delta: number) {
              onExternalAllocationChange(region.regionId, clamp(quantity + delta, 0, maxForRegion));
            }

            function handleRegionZero() {
              onExternalAllocationChange(region.regionId, 0);
            }

            function handleRegionMax() {
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

            return (
              <article key={region.regionId} className={cardClass}>
                <header className="phase1-market__card-header">
                  <span className="phase1-market__card-name">{region.label}</span>
                  {accessible ? (
                    <span className="phase1-market__card-badge">{getRegionAccessLevelLabel(region.accessLevel)}</span>
                  ) : (
                    <span className="phase1-market__card-lock" title={region.isColonized ? "已被殖民" : "未开放"}>
                      <svg className="phase1-market__card-lock-icon" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="7" width="10" height="7" rx="1.5" />
                        <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                      </svg>
                      未开放
                    </span>
                  )}
                </header>

                {accessible ? (
                  <>
                    <div className="phase1-market__stepper">
                      <button
                        type="button"
                        className="phase1-market__stepper-btn"
                        disabled={quantity <= 0}
                        onClick={() => handleRegionDelta(-1)}
                        aria-label={`减少${region.label}投放`}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="phase1-market__stepper-zero"
                        disabled={quantity <= 0}
                        onClick={handleRegionZero}
                        aria-label={`${region.label}投放清零`}
                      >
                        0
                      </button>
                      <span className="phase1-market__stepper-value">{quantity}</span>
                      <button
                        type="button"
                        className="phase1-market__stepper-btn"
                        disabled={quantity >= maxForRegion}
                        onClick={() => handleRegionDelta(1)}
                        aria-label={`增加${region.label}投放`}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="phase1-market__stepper-max"
                        disabled={quantity >= maxForRegion}
                        onClick={handleRegionMax}
                        aria-label={`${region.label}投放最大`}
                      >
                        MAX
                      </button>
                    </div>

                    <div className="phase1-market__overseas-price">
                      <span className="phase1-market__overseas-price-label">海外价格</span>
                      <strong className="phase1-market__overseas-price-value">{overseasPrice}</strong>
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
          <span className="phase1-market__footer-label">总投放</span>
          <span className="phase1-market__footer-value">{totalAllocated} / {totalGoods}</span>
        </span>
        <span className="phase1-market__footer-row">
          <span className="phase1-market__footer-label">预计总收入</span>
          <span className="phase1-market__footer-value phase1-market__footer-value--highlight">{preview.revenue}</span>
        </span>
      </div>
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

type PreviewResult = {
  price: number;
  soldQty: number;
  revenue: number;
  balanceLabel: string;
  tone: "shortage" | "surplus" | "balanced";
};

function calculatePreview(
  allocation: number,
  demand: number,
  equilibriumPrice: number,
  fallbackPrice: number,
): PreviewResult {
  if (allocation <= 0) {
    return {
      price: fallbackPrice,
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
    const scale = 1 + (1 - ratio) * 0.5;
    price = Math.round(equilibriumPrice * scale);
    balanceLabel = "供不应求";
    tone = "shortage";
  } else if (ratio > 1) {
    const scale = Math.max(0.5, 1 - (ratio - 1) * 0.3);
    price = Math.round(equilibriumPrice * scale);
    balanceLabel = "供过于求";
    tone = "surplus";
  }

  return {
    price,
    soldQty,
    revenue: soldQty * price,
    balanceLabel,
    tone,
  };
}

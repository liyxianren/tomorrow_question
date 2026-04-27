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

  const clampedAllocation = clamp(draftAllocation, 0, totalGoods);

  const preview = useMemo(
    () => calculatePreview(clampedAllocation, domesticDemand, equilibriumPrice, domesticPricePreview),
    [clampedAllocation, domesticDemand, equilibriumPrice, domesticPricePreview],
  );

  const overseasRegions = regionAccessStatus.filter((status) => status.regionId !== "domestic");

  const remainingForExternal = Math.max(0, totalGoods - clampedAllocation);

  return (
    <section className="phase1-market" data-testid="phase1-market-panel">
      <div className="phase1-market__header">
        <h3 className="phase1-market__title">📊 统一商品市场（2.0）</h3>
        <span className="phase1-market__subtitle">基于供需的均衡价格机制</span>
      </div>

      <div className="phase1-market__summary">
        <SummaryPill label="可售商品" value={totalGoods} />
        <SummaryPill label="本国需求" value={domesticDemand} />
        <SummaryPill label="消费池" value={consumerPool} />
        <SummaryPill label="均衡价格" value={equilibriumPrice} accent />
      </div>

      <article className="phase1-market__card">
        <div className="phase1-market__card-header">
          <strong>国内市场投放</strong>
          <span className="phase1-market__card-hint">
            滑动调整投放量，价格根据供需关系实时浮动
          </span>
        </div>

        <div className="phase1-market__price-display">
          <div className="phase1-market__price-block">
            <span className="phase1-market__price-label">实时价格</span>
            <strong className="phase1-market__price-value">{preview.price}</strong>
            <span className={`phase1-market__balance phase1-market__balance--${preview.tone}`}>
              {preview.balanceLabel}
            </span>
          </div>
          <div className="phase1-market__price-block">
            <span className="phase1-market__price-label">预计成交量</span>
            <strong className="phase1-market__price-value">{preview.soldQty}</strong>
            <span className="phase1-market__balance">min(投放, 需求)</span>
          </div>
          <div className="phase1-market__price-block">
            <span className="phase1-market__price-label">预计收入</span>
            <strong className="phase1-market__price-value">{preview.revenue}</strong>
            <span className="phase1-market__balance">{preview.soldQty} × {preview.price}</span>
          </div>
        </div>

        <div className="phase1-market__slider-row">
          <input
            aria-label="国内市场投放量"
            className="phase1-market__slider"
            max={totalGoods}
            min={0}
            onChange={(event) => onAllocationChange(clamp(Number(event.target.value), 0, totalGoods))}
            step={1}
            type="range"
            value={clampedAllocation}
          />
          <input
            aria-label="国内市场投放量数字输入"
            className="phase1-market__slider-input"
            max={totalGoods}
            min={0}
            onChange={(event) => onAllocationChange(clamp(Number(event.target.value), 0, totalGoods))}
            type="number"
            value={clampedAllocation}
          />
          <span className="phase1-market__slider-max">/ {totalGoods}</span>
        </div>

        <p className="phase1-market__feedback">
          按当前投放 <strong>{clampedAllocation}</strong> → 价格 <strong>{preview.price}</strong> → 预计收入 <strong>{preview.revenue}</strong>
        </p>
      </article>

      {overseasRegions.length > 0 ? (
        <article className="phase1-market__card">
          <div className="phase1-market__card-header">
            <strong>海外市场投放</strong>
            <span className="phase1-market__card-hint">
              剩余可投放：{remainingForExternal} / {totalGoods}
            </span>
          </div>
          <div className="phase1-market__regions">
            {overseasRegions.map((region) => {
              const allocation = externalAllocations.find((item) => item.marketId === region.regionId);
              const quantity = allocation?.quantity ?? 0;
              const accessible = region.isAccessible;
              return (
                <div
                  key={region.regionId}
                  className={`phase1-market__region${accessible ? "" : " phase1-market__region--locked"}`}
                >
                  <div className="phase1-market__region-info">
                    <strong>{region.label}</strong>
                    <span className="phase1-market__region-access">
                      {getRegionAccessLevelLabel(region.accessLevel)}
                    </span>
                  </div>
                  <div className="phase1-market__region-controls">
                    {accessible ? (
                      <input
                        aria-label={`${region.label}投放量`}
                        className="phase1-market__region-input"
                        min={0}
                        onChange={(event) => onExternalAllocationChange(
                          region.regionId,
                          clamp(Number(event.target.value), 0, totalGoods),
                        )}
                        type="number"
                        value={quantity}
                      />
                    ) : (
                      <span className="phase1-market__region-locked">未开放</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {externalAllocationTotal > 0 ? (
            <p className="phase1-market__feedback">
              海外合计已投放 <strong>{externalAllocationTotal}</strong> 件
            </p>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}

function SummaryPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className={`phase1-market__pill${accent ? " phase1-market__pill--accent" : ""}`}>
      <span className="phase1-market__pill-label">{label}</span>
      <strong className="phase1-market__pill-value">{value}</strong>
    </div>
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
  let balanceLabel = "供需平衡";
  let tone: PreviewResult["tone"] = "balanced";

  if (ratio < 1) {
    const scale = 1 + (1 - ratio) * 0.5;
    price = Math.round(equilibriumPrice * scale);
    balanceLabel = `短缺 +${Math.round((scale - 1) * 100)}%`;
    tone = "shortage";
  } else if (ratio > 1) {
    const scale = Math.max(0.5, 1 - (ratio - 1) * 0.3);
    price = Math.round(equilibriumPrice * scale);
    balanceLabel = `过剩 ${Math.round((scale - 1) * 100)}%`;
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

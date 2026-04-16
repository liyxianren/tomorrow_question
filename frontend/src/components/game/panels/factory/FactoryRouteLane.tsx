import type { FactoryProductionOption } from "../../../../types";
import type { PhaseDraftByPhase } from "../../../../features/game/forms";
import { getProductionOrderQuantity } from "../../../../features/game/decisionDrafts";
import { formatPriceTrendText } from "../../../../features/game/decisionShared";

export function FactoryRouteLane({
  routeId,
  routeLabel,
  currentCapacity,
  pendingCapacity,
  remainingBatches,
  totalBatches,
  productionOptions,
  draft,
  remainingBudget,
  onQuantityChange,
}: {
  routeId: string;
  routeLabel: string;
  currentCapacity: number;
  pendingCapacity: number;
  remainingBatches: number;
  totalBatches: number;
  productionOptions: FactoryProductionOption[];
  draft: PhaseDraftByPhase["decision"];
  remainingBudget: number;
  onQuantityChange: (goodsId: string, quantity: number) => void;
}) {
  return (
    <section data-testid={`factory-route-lane-${routeId}`}>
      <h4 className="factory-section-label">{routeLabel}</h4>

      {productionOptions.length > 0 ? (
        <div className="factory-actions">
          {productionOptions.map((option) => {
            const quantity = getProductionOrderQuantity(draft, option.goodsId);
            const canIncrease = quantity < option.maxQuantity
              && remainingBatches > 0
              && remainingBudget >= option.unitBudgetCost;

            return (
              <div
                key={option.goodsId}
                className={`factory-action-card ${quantity > 0 ? "factory-action-card--selected" : ""}`}
              >
                <div className="factory-action-card__head">
                  <span className="factory-action-card__icon">📦</span>
                  <span className="factory-action-card__name">{option.label}</span>
                  <span className="factory-action-card__cost">{option.unitBudgetCost}/批</span>
                </div>
                <p className="factory-action-card__desc">
                  {option.usageHint}
                </p>
                <div className="factory-action-card__effects">
                  <span className="factory-action-card__effect-tag">产量 {option.unitOutput}/批</span>
                  <span className="factory-action-card__effect-tag">国内 {option.domesticReferencePrice}</span>
                  <span className="factory-action-card__effect-tag">海外 {option.overseasReferencePriceMin}-{option.overseasReferencePriceMax}</span>
                  <span className="factory-action-card__effect-tag">{formatPriceTrendText(option.priceTrend, option.priceAdjustment)}</span>
                </div>
                {quantity > 0 ? (
                  <p className="factory-action-card__desc">
                    已安排 {quantity} 批，消耗 {quantity * option.unitBudgetCost} 工厂预算，产出 {quantity * option.unitOutput} 件商品。
                  </p>
                ) : null}
                <div className="factory-action-card__footer">
                  <span className="factory-action-card__count">{quantity}/{option.maxQuantity}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      aria-label={`减少生产 ${option.label}`}
                      className="factory-action-card__btn"
                      disabled={quantity <= 0}
                      type="button"
                      onClick={() => onQuantityChange(option.goodsId, quantity - 1)}
                    >
                      −
                    </button>
                    <button
                      aria-label={`增加生产 ${option.label}`}
                      className={`factory-action-card__btn ${quantity > 0 ? "factory-action-card__btn--active" : ""}`}
                      disabled={!canIncrease}
                      type="button"
                      onClick={() => onQuantityChange(option.goodsId, quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="factory-panel__empty">
          {totalBatches > 0
            ? "当前没有可排产商品，先通过工业研究解锁新货品。"
            : "当前路线没有可用批次，需先通过建设改造或研究解锁产线。"}
        </p>
      )}
    </section>
  );
}

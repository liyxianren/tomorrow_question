import type { MarketGoodCardViewModel, MarketSellRowViewModel } from "../../../features/game/marketDeck/types";

type MarketSellCardProps = {
  card: MarketGoodCardViewModel;
  onQuantityChange: (goodsId: string, regionId: string | null, quantity: number) => void;
};

export function MarketSellCard({ card, onQuantityChange }: MarketSellCardProps) {
  return (
    <article className="gp-market-card">
      <div className="gp-market-card__header">
        <span className="gp-market-card__name">{card.label}</span>
        <div className="gp-market-card__header-pills">
          <span className="gp-market-card__pill gp-market-card__pill--stock">
            库存 {card.stock}
          </span>
          <span className={`gp-market-card__pill gp-market-card__pill--trend-${card.trendTone}`}>
            {card.priceTrendText}
          </span>
        </div>
      </div>

      <div className="gp-market-card__body">
        {card.sellRows.map((row) => (
          <SellRow
            key={row.regionId ?? "domestic"}
            goodsId={card.goodsId}
            goodsLabel={card.label}
            row={row}
            onQuantityChange={onQuantityChange}
          />
        ))}
      </div>

      <div className={`gp-market-card__footer ${card.remainingStock < 0 ? "gp-market-card__footer--warn" : ""}`}>
        <span>
          已分配 <strong>{card.totalAllocated}</strong> / {card.stock} 件
        </span>
        <span>
          剩余库存 <strong>{card.remainingStock}</strong>
        </span>
      </div>
    </article>
  );
}

function SellRow({
  goodsId,
  goodsLabel,
  row,
  onQuantityChange,
}: {
  goodsId: string;
  goodsLabel: string;
  row: MarketSellRowViewModel;
  onQuantityChange: (goodsId: string, regionId: string | null, quantity: number) => void;
}) {
  if (row.isLocked) {
    return (
      <div className="gp-sell-row gp-sell-row--locked">
        <div className="gp-sell-row__info">
          <div className="gp-sell-row__market-line">
            <span className="gp-sell-row__market">{row.regionLabel}</span>
            {row.accessBadge ? (
              <span className="gp-sell-row__access-badge">{row.accessBadge}</span>
            ) : null}
          </div>
          <span className="gp-sell-row__price">参考价 {row.unitPrice}</span>
        </div>
        <div className="gp-sell-row__locked-reason">
          🔒 {row.lockedReason}
        </div>
      </div>
    );
  }

  return (
    <div className="gp-sell-row">
      <div className="gp-sell-row__info">
        <div className="gp-sell-row__market-line">
          <span className="gp-sell-row__market">{row.regionLabel}</span>
          {row.accessBadge ? (
            <span className="gp-sell-row__access-badge">{row.accessBadge}</span>
          ) : null}
        </div>
        <span className="gp-sell-row__price">参考价 {row.unitPrice}</span>
      </div>
      <div className="gp-sell-row__controls">
        <div className="gp-stepper">
          <button
            aria-label={`减少${goodsLabel}${row.regionLabel}卖量`}
            className="gp-stepper-btn"
            disabled={row.quantity <= 0}
            type="button"
            onClick={() => onQuantityChange(goodsId, row.regionId, row.quantity - 1)}
          >
            −
          </button>
          <span className="gp-stepper-value">{row.quantity}</span>
          <button
            aria-label={`增加${goodsLabel}${row.regionLabel}卖量`}
            className="gp-stepper-btn"
            disabled={row.quantity >= row.maxQuantity}
            type="button"
            onClick={() => onQuantityChange(goodsId, row.regionId, Math.min(row.quantity + 1, row.maxQuantity))}
          >
            +
          </button>
        </div>
        {row.revenuePreview > 0 ? (
          <span className="gp-sell-row__revenue">收入 {row.revenuePreview}</span>
        ) : null}
      </div>
    </div>
  );
}

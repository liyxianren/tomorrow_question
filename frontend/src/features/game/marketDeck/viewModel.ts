import type { MarketPlayerPhaseWorkspace, PriceTrend, RegionAccessStatus } from "../../../types";
import type { PhaseDraftByPhase } from "../forms";
import { formatPriceTrendText, getRegionAccessLevelLabel } from "../decisionShared";
import type { MarketDeckViewModel, MarketGoodCardViewModel, MarketSellRowViewModel } from "./types";

export function buildMarketDeckViewModel(
  workspace: MarketPlayerPhaseWorkspace,
  draft: PhaseDraftByPhase["market"],
): MarketDeckViewModel {
  const regionAccessMap = new Map<string, RegionAccessStatus>();
  for (const status of workspace.regionAccessStatus ?? []) {
    regionAccessMap.set(status.regionId, status);
  }

  // 计算全局已用承接力
  let totalDomesticUsed = 0;
  let totalOverseasUsed = 0;
  for (const order of draft.saleOrders) {
    if (order.market === "domestic") {
      totalDomesticUsed += order.quantity;
    } else {
      totalOverseasUsed += order.quantity;
    }
  }

  let totalDomesticRevenue = 0;
  let totalOverseasRevenue = 0;

  const goodCards: MarketGoodCardViewModel[] = workspace.sellableInventory.map((item) => {
    const sellRows: MarketSellRowViewModel[] = [];

    // 本商品已分配总量
    const goodTotalAllocated = draft.saleOrders
      .filter((o) => o.goodsId === item.goodsId)
      .reduce((sum, o) => sum + o.quantity, 0);
    const goodRemainingStock = item.quantity - goodTotalAllocated;

    // Domestic row
    const domesticQty = getSaleOrderQuantity(draft, item.goodsId, "domestic");
    const domesticRevenue = domesticQty * item.domesticReferencePrice;
    totalDomesticRevenue += domesticRevenue;
    const domesticRemaining = workspace.domesticMarketCapacity - totalDomesticUsed;
    sellRows.push({
      regionId: null,
      regionLabel: "国内市场",
      accessBadge: null,
      unitPrice: item.domesticReferencePrice,
      isLocked: false,
      lockedReason: null,
      quantity: domesticQty,
      maxQuantity: domesticQty + Math.min(goodRemainingStock, Math.max(0, domesticRemaining)),
      revenuePreview: domesticRevenue,
    });

    // Overseas rows
    const overseasRemaining = workspace.overseasMarketCapacity - totalOverseasUsed;
    for (const price of item.overseasReferencePrices) {
      const regionAccess = regionAccessMap.get(price.regionId);
      const isLocked = regionAccess ? !regionAccess.isAccessible : true;
      const lockedReason = isLocked ? getLockedReason(regionAccess) : null;
      const accessBadge = regionAccess ? getRegionAccessLevelLabel(regionAccess.accessLevel) : null;
      const qty = isLocked ? 0 : getSaleOrderQuantity(draft, item.goodsId, "overseas", price.regionId);
      const revenue = qty * price.unitPrice;
      totalOverseasRevenue += revenue;

      sellRows.push({
        regionId: price.regionId,
        regionLabel: price.label,
        accessBadge,
        unitPrice: price.unitPrice,
        isLocked,
        lockedReason,
        quantity: qty,
        maxQuantity: isLocked ? 0 : qty + Math.min(goodRemainingStock, Math.max(0, overseasRemaining)),
        revenuePreview: revenue,
      });
    }

    const totalAllocated = sellRows.reduce((sum, row) => sum + row.quantity, 0);

    return {
      goodsId: item.goodsId,
      label: item.label,
      stock: item.quantity,
      priceTrendText: formatPriceTrendText(item.priceTrend, item.priceAdjustment),
      trendTone: getTrendTone(item.priceTrend),
      sellRows,
      totalAllocated,
      remainingStock: item.quantity - totalAllocated,
    };
  });

  return {
    domesticMarketCapacity: workspace.domesticMarketCapacity,
    overseasMarketCapacity: workspace.overseasMarketCapacity,
    goodCards,
    totalDomesticRevenue,
    totalOverseasRevenue,
    totalNationalIncome: totalDomesticRevenue + totalOverseasRevenue,
  };
}

function getLockedReason(regionAccess: RegionAccessStatus | undefined): string {
  if (!regionAccess) return "区域不可达";
  if (!regionAccess.isDiplomacyEstablished) return "需要建交";
  return "需要军事点";
}

function getTrendTone(trend: PriceTrend): "up" | "down" | "flat" {
  if (trend === "up") return "up";
  if (trend === "down") return "down";
  return "flat";
}

function getSaleOrderQuantity(
  draft: PhaseDraftByPhase["market"],
  goodsId: string,
  market: "domestic" | "overseas",
  regionId?: string,
): number {
  return draft.saleOrders.find((item) => {
    if (item.goodsId !== goodsId || item.market !== market) return false;
    return market === "domestic" ? true : item.regionId === regionId;
  })?.quantity ?? 0;
}

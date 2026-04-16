export interface MarketSellRowViewModel {
  regionId: string | null;
  regionLabel: string;
  accessBadge: string | null;
  unitPrice: number;
  isLocked: boolean;
  lockedReason: string | null;
  quantity: number;
  maxQuantity: number;
  revenuePreview: number;
}

export interface MarketGoodCardViewModel {
  goodsId: string;
  label: string;
  stock: number;
  priceTrendText: string;
  trendTone: "up" | "down" | "flat";
  sellRows: MarketSellRowViewModel[];
  totalAllocated: number;
  remainingStock: number;
}

export interface MarketDeckViewModel {
  domesticMarketCapacity: number;
  overseasMarketCapacity: number;
  goodCards: MarketGoodCardViewModel[];
  totalDomesticRevenue: number;
  totalOverseasRevenue: number;
  totalNationalIncome: number;
}

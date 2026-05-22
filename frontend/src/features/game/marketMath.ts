import type {
  MarketPlayerPhaseWorkspace,
  Phase1ExternalAllocation,
  Phase1ExternalCompetitionDeployment,
  RegionAccessStatus,
} from "../../types";

export type DomesticMarketTone = "shortage" | "surplus" | "balanced";

export type DomesticMarketPreview = {
  price: number;
  supplyAdjustedPrice: number;
  priceBeforeFloor: number;
  soldQty: number;
  revenue: number;
  balanceKey: "notAllocated" | "noDemand" | "supplyDemandBalanced" | "shortage" | "surplus";
  tone: DomesticMarketTone;
  shortageRate: number;
  surplusRate: number;
};

export const DOMESTIC_PRICE_FLOOR_RATIO = 0.1;
export const DOMESTIC_PRICE_CEILING_RATIO = 2;

function resolveMinimumPrice(equilibriumPrice: number, minimumPrice?: number): number {
  if (typeof minimumPrice === "number" && Number.isFinite(minimumPrice)) {
    return Math.max(0, minimumPrice);
  }
  return Math.max(0, equilibriumPrice * DOMESTIC_PRICE_FLOOR_RATIO);
}

function resolveMaximumPrice(equilibriumPrice: number, maximumPrice?: number): number {
  if (typeof maximumPrice === "number" && Number.isFinite(maximumPrice)) {
    return Math.max(0, maximumPrice);
  }
  return Math.max(0, equilibriumPrice * DOMESTIC_PRICE_CEILING_RATIO);
}

export function calculateDomesticMarketPrice({
  allocation,
  softCap,
  equilibriumPrice,
  minimumPrice,
  maximumPrice,
  priceBonus = 0,
}: {
  allocation: number;
  softCap: number;
  equilibriumPrice: number;
  minimumPrice?: number;
  maximumPrice?: number;
  priceBonus?: number;
}): number {
  const safeSoftCap = Math.max(0, softCap);
  const safeAllocation = Math.max(0, allocation);
  const safeMinimum = resolveMinimumPrice(equilibriumPrice, minimumPrice);
  const safeMaximum = Math.max(safeMinimum, resolveMaximumPrice(equilibriumPrice, maximumPrice));
  if (safeSoftCap <= 0) {
    return safeMinimum;
  }
  return Math.min(
    safeMaximum,
    Math.max(
      safeMinimum,
      equilibriumPrice * (2 - safeAllocation / safeSoftCap) + priceBonus,
    ),
  );
}

export function calculateDomesticMarketPreview({
  allocation,
  softCap,
  equilibriumPrice,
  minimumPrice,
  maximumPrice,
  priceBonus = 0,
}: {
  allocation: number;
  softCap: number;
  equilibriumPrice: number;
  minimumPrice?: number;
  maximumPrice?: number;
  priceBonus?: number;
}): DomesticMarketPreview {
  const safeAllocation = Math.max(0, Math.floor(Number.isFinite(allocation) ? allocation : 0));
  const safeSoftCap = Math.max(0, softCap);
  const supplyAdjustedPrice = calculateDomesticMarketPrice({
    allocation: safeAllocation,
    softCap: safeSoftCap,
    equilibriumPrice,
    minimumPrice,
    maximumPrice,
    priceBonus: 0,
  });
  const price = calculateDomesticMarketPrice({
    allocation: safeAllocation,
    softCap: safeSoftCap,
    equilibriumPrice,
    minimumPrice,
    maximumPrice,
    priceBonus,
  });

  const priceBeforeFloor = safeSoftCap > 0
    ? equilibriumPrice * (2 - safeAllocation / safeSoftCap) + priceBonus
    : 0;

  if (safeAllocation <= 0) {
    return {
      price,
      supplyAdjustedPrice,
      priceBeforeFloor,
      soldQty: 0,
      revenue: 0,
      balanceKey: "notAllocated",
      tone: "balanced",
      shortageRate: 0,
      surplusRate: 0,
    };
  }

  if (safeSoftCap <= 0) {
    return {
      price: 0,
      supplyAdjustedPrice: 0,
      priceBeforeFloor: 0,
      soldQty: 0,
      revenue: 0,
      balanceKey: "noDemand",
      tone: "surplus",
      shortageRate: 0,
      surplusRate: 0,
    };
  }

  const shortageRate = safeAllocation < safeSoftCap
    ? (safeSoftCap - safeAllocation) / safeSoftCap
    : 0;
  const surplusRate = safeAllocation > safeSoftCap
    ? (safeAllocation - safeSoftCap) / safeSoftCap
    : 0;
  const tone: DomesticMarketTone = shortageRate > 0
    ? "shortage"
    : surplusRate > 0
      ? "surplus"
      : "balanced";
  const balanceKey = shortageRate > 0
    ? "shortage"
    : surplusRate > 0
      ? "surplus"
      : "supplyDemandBalanced";

  return {
    price,
    supplyAdjustedPrice,
    priceBeforeFloor,
    soldQty: safeAllocation,
    revenue: Math.round(safeAllocation * price),
    balanceKey,
    tone,
    shortageRate,
    surplusRate,
  };
}

export function calculatePhase1MarketRevenue({
  domesticAllocation,
  externalAllocations,
  externalCompetitionDeployments,
  regionAccessStatus,
  overseasCompetition,
  overseasMarketCapacity,
  domesticSoftCap,
  equilibriumPrice,
  minimumDomesticPrice,
  maximumDomesticPrice,
  domesticPriceBonus = 0,
}: {
  domesticAllocation: number;
  externalAllocations: Phase1ExternalAllocation[];
  externalCompetitionDeployments: Phase1ExternalCompetitionDeployment[];
  regionAccessStatus: RegionAccessStatus[];
  overseasCompetition: MarketPlayerPhaseWorkspace["overseasCompetition"] | undefined;
  overseasMarketCapacity: number;
  domesticSoftCap: number;
  equilibriumPrice: number;
  minimumDomesticPrice?: number;
  maximumDomesticPrice?: number;
  domesticPriceBonus?: number;
}): number {
  const domesticPreview = calculateDomesticMarketPreview({
    allocation: domesticAllocation,
    softCap: domesticSoftCap,
    equilibriumPrice,
    minimumPrice: minimumDomesticPrice,
    maximumPrice: maximumDomesticPrice,
    priceBonus: domesticPriceBonus,
  });
  return domesticPreview.revenue + calculateOverseasRevenue({
    externalAllocations,
    externalCompetitionDeployments,
    regionAccessStatus,
    overseasCompetition,
    overseasMarketCapacity,
  });
}

function calculateOverseasRevenue({
  externalAllocations,
  externalCompetitionDeployments,
  regionAccessStatus,
  overseasCompetition,
  overseasMarketCapacity,
}: {
  externalAllocations: Phase1ExternalAllocation[];
  externalCompetitionDeployments: Phase1ExternalCompetitionDeployment[];
  regionAccessStatus: RegionAccessStatus[];
  overseasCompetition: MarketPlayerPhaseWorkspace["overseasCompetition"] | undefined;
  overseasMarketCapacity: number;
}): number {
  const competitionConfig = overseasCompetition ?? {
    availableArmy: {},
    rewardCapacityBonus: 0,
    infantryPower: 1,
    artilleryPower: 2,
    minimumPower: 1,
  };
  const deploymentByRegion = new Map<string, Phase1ExternalCompetitionDeployment>(
    externalCompetitionDeployments.map((deployment) => [deployment.marketId, deployment]),
  );
  const rewardCapacityByRegion = new Map<string, number>();
  for (const region of regionAccessStatus) {
    const deployment = deploymentByRegion.get(region.regionId);
    const power = deployment
      ? Math.max(0, deployment.infantry) * Math.max(0, competitionConfig.infantryPower)
        + Math.max(0, deployment.artillery) * Math.max(0, competitionConfig.artilleryPower)
      : 0;
    if (region.canCompete && power >= competitionConfig.minimumPower) {
      rewardCapacityByRegion.set(
        region.regionId,
        Math.max(0, region.competitionRewardCapacityBonus ?? competitionConfig.rewardCapacityBonus),
      );
    }
  }

  let remainingOverseasCapacity = Math.max(0, overseasMarketCapacity);
  const rewardCapacityRemaining = new Map(rewardCapacityByRegion);
  return externalAllocations.reduce((sum, allocation) => {
    const region = regionAccessStatus.find((item) => item.regionId === allocation.marketId);
    if (!region?.isAccessible) {
      return sum;
    }
    const rewardCapacity = Math.max(0, rewardCapacityRemaining.get(allocation.marketId) ?? 0);
    const requested = Math.max(0, allocation.quantity);
    const rewardSold = Math.min(requested, rewardCapacity);
    const sharedSold = Math.min(
      Math.max(0, requested - rewardSold),
      remainingOverseasCapacity,
    );
    const sold = rewardSold + sharedSold;
    if (sold <= 0) {
      return sum;
    }
    rewardCapacityRemaining.set(allocation.marketId, Math.max(0, rewardCapacity - rewardSold));
    remainingOverseasCapacity -= sharedSold;
    return sum + sold * getFixedOverseasPrice(region);
  }, 0);
}

export function getFixedOverseasPrice(region: RegionAccessStatus | undefined): number {
  if (region?.fixedOverseasPrice != null && Number.isFinite(region.fixedOverseasPrice)) {
    return Math.max(0, region.fixedOverseasPrice);
  }
  const fallback: Record<string, number> = {
    europe: 8,
    americas: 7,
    asia_pacific: 6,
    middle_east: 5,
    africa: 4,
  };
  return fallback[region?.regionId ?? ""] ?? 0;
}

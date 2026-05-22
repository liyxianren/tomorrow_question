import { describe, expect, it } from "vitest";

import {
  calculateDomesticMarketPreview,
  calculateDomesticMarketPrice,
} from "./marketMath";

describe("marketMath domestic pricing", () => {
  it("uses the provided equilibrium price when normal supply matches demand", () => {
    const price = calculateDomesticMarketPrice({
      allocation: 24,
      softCap: 24,
      equilibriumPrice: 21 / 24,
    });

    expect(price).toBe(0.875);
  });

  it("still lowers price after overselling demand and rounds revenue", () => {
    const preview = calculateDomesticMarketPreview({
      allocation: 36,
      softCap: 24,
      equilibriumPrice: 1,
    });

    expect(preview.price).toBe(0.5);
    expect(preview.revenue).toBe(18);
  });
});

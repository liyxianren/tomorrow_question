import { describe, expect, it } from "vitest";

import i18n from "../../../../i18n";
import type { FactoryExpansionOption, FactoryNewFactoryOption, FactoryUpgradeOption } from "../../../../types";

import { getConstructionTitle } from "./FactoryPanel";

describe("FactoryPanel construction titles", () => {
  it("interpolates Chinese route labels for construction actions", async () => {
    await i18n.changeLanguage("zh");

    const expansionOption: FactoryExpansionOption = {
      routeId: "handicraft",
      routeLabel: "手工业",
      unitBudgetCost: 4,
      capacityDelta: 1,
      maxQuantity: 2,
      lockedReason: null,
    };
    const upgradeOption: FactoryUpgradeOption = {
      ...expansionOption,
      routeId: "mechanized",
      routeLabel: "机械化",
      sourceRouteId: "handicraft",
      sourceRouteLabel: "手工业",
    };
    const newFactoryOption: FactoryNewFactoryOption = {
      ...expansionOption,
      routeId: "steam",
      routeLabel: "蒸汽",
    };

    expect(getConstructionTitle(expansionOption, "expansion")).toBe("扩建 手工业");
    expect(getConstructionTitle(upgradeOption, "upgrade")).toBe("升级到 机械化");
    expect(getConstructionTitle(newFactoryOption, "newFactory")).toBe("新建 蒸汽 工厂");
  });

  it("interpolates the phase-1 allocation counter", async () => {
    await i18n.changeLanguage("zh");

    expect(i18n.t("game:factory.allocatedCount", { assigned: 2, total: 5 })).toBe("已分配 2/5 份");
  });
});

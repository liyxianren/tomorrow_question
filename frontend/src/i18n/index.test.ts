import { describe, expect, it } from "vitest";

import i18n, { translateBackend } from "./index";

async function withLanguage<T>(language: string, run: () => T | Promise<T>): Promise<T> {
  const previousLanguage = i18n.language || "zh";
  await i18n.changeLanguage(language);
  try {
    return await run();
  } finally {
    await i18n.changeLanguage(previousLanguage);
  }
}

describe("game i18n additions", () => {
  it("translates newly added backend gameplay labels", async () => {
    await withLanguage("en", () => {
      expect(translateBackend("全球贸易竞赛")).toBe("Global Trade Race");
      expect(translateBackend("全球通商")).toBe("Global Commerce");
      expect(translateBackend("民族复兴")).toBe("National Revival");
      expect(translateBackend("海外事务局")).toBe("Overseas Affairs Bureau");
      expect(translateBackend("动用行政力组织本轮内需补贴，扩大国内承接量。")).toBe(
        "Spend administrative power to organize domestic-demand subsidies this round, expanding domestic capacity.",
      );
      expect(translateBackend("动用行政力协调贸易渠道，扩大本回合海外市场容量。")).toBe(
        "Spend administrative power to coordinate trade channels, expanding overseas market capacity this round.",
      );
      expect(translateBackend("动用行政力调控本轮国内收购价格。")).toBe(
        "Spend administrative power to regulate domestic purchase prices this round.",
      );
    });
  });

  it("defines market-policy panel copy in both supported languages", async () => {
    await withLanguage("zh", () => {
      expect(i18n.t("game:government.marketPolicyActions")).toBe("市场政策");
      expect(i18n.t("game:government.selectedMarketPolicies", { count: 2 })).toBe("已选 2 项");
      expect(i18n.t("game:government.strategy.tradePromotionDesc")).toBe(
        "动用行政力协调贸易渠道，扩大本回合海外市场容量。",
      );
    });

    await withLanguage("en", () => {
      expect(i18n.t("game:government.marketPolicyActions")).toBe("Market Policies");
      expect(i18n.t("game:government.selectedMarketPolicies", { count: 2 })).toBe("2 selected");
      expect(i18n.t("game:government.strategy.tradePromotionDesc")).toBe(
        "Spend administrative power to coordinate trade channels, expanding overseas market capacity this round.",
      );
    });
  });

  it("interpolates newly added factory construction labels and errors", async () => {
    await withLanguage("zh", () => {
      expect(i18n.t("game:factory.newFactoryAction", { label: "机械化工业" })).toBe("新建 机械化工业 工厂");
      expect(i18n.t("game:submit.errorExpansionNotUnlocked", { route: "steam" })).toBe(
        "生产线 steam 尚未解锁，无法扩张。",
      );
    });

    await withLanguage("en", () => {
      expect(i18n.t("game:factory.newFactoryAction", { label: "Mechanized" })).toBe("Build New Mechanized Factory");
      expect(i18n.t("game:submit.errorExpansionNotUnlocked", { route: "steam" })).toBe(
        "Production route steam is not unlocked and cannot be expanded.",
      );
    });
  });

  it("defines market preview and settlement clarification copy in both supported languages", async () => {
    await withLanguage("zh", () => {
      expect(i18n.t("game:market.governmentAdjustment")).toBe("政府市场政策");
      expect(i18n.t("game:market.noGovernmentAdjustment")).toBe("本轮暂无政府市场政策");
      expect(i18n.t("game:market.netAdjustment")).toBe("当前净调整");
      expect(i18n.t("game:domestic.existingPriceBonus")).toBe("已有价格调整");
      expect(i18n.t("game:settlement.effectiveRatio")).toBe("本轮有效回流比例");
    });

    await withLanguage("en", () => {
      expect(i18n.t("game:market.governmentAdjustment")).toBe("Government Market Policy");
      expect(i18n.t("game:market.noGovernmentAdjustment")).toBe("No government market policy this round");
      expect(i18n.t("game:market.netAdjustment")).toBe("Current net adjustment");
      expect(i18n.t("game:domestic.existingPriceBonus")).toBe("Existing Price Adjustment");
      expect(i18n.t("game:settlement.effectiveRatio")).toBe("Effective Return Ratio");
    });
  });
});

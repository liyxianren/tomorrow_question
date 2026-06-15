import { describe, expect, it } from "vitest";

import i18n, { resolveInitialLanguage, translateBackend } from "./index";

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
  it("resolves the startup language from explicit persisted Chinese only", () => {
    const storageWith = (value: string | null): Pick<Storage, "getItem"> => ({
      getItem: (key) => (key === "app_locale" ? value : null),
    });

    expect(resolveInitialLanguage(storageWith("zh"))).toBe("zh");
    expect(resolveInitialLanguage(storageWith("zh-CN"))).toBe("zh");
    expect(resolveInitialLanguage(storageWith("en"))).toBe("en");
    expect(resolveInitialLanguage(storageWith(null))).toBe("en");
    expect(
      resolveInitialLanguage({
        getItem: () => {
          throw new Error("localStorage unavailable");
        },
      }),
    ).toBe("en");
  });

  it("defaults to English when no persisted language has been chosen", () => {
    expect(i18n.options.fallbackLng).toEqual(["en"]);
    expect(i18n.options.lng).toBe("en");
  });

  it("uses English resources for previously missing gameplay keys in English mode", async () => {
    await withLanguage("en", () => {
      expect(i18n.t("game:government.reformPendingActivation")).toBe("Implemented, active next round");
      expect(i18n.t("game:government.policyUnlocksNextRound")).toBe("Unlocks next round");
    });
  });

  it("syncs document metadata with the active language", async () => {
    await withLanguage("en", () => {
      expect(document.documentElement.lang).toBe("en");
      expect(document.title).toBe("Tomorrow Question");
    });

    await withLanguage("zh", () => {
      expect(document.documentElement.lang).toBe("zh-CN");
      expect(document.title).toBe("19世纪工业化列强策略游戏");
    });
  });

  it("translates newly added backend gameplay labels", async () => {
    await withLanguage("en", () => {
      expect(translateBackend("全球贸易竞赛")).toBe("Global Trade Race");
      expect(translateBackend("全球通商")).toBe("Global Commerce");
      expect(translateBackend("民族复兴")).toBe("National Revival");
      expect(translateBackend("海外事务局")).toBe("Overseas Affairs Bureau");
      expect(translateBackend("动用行政力组织内需补贴，永久提高国内市场承接上限。")).toBe(
        "Spend administrative power on domestic-demand subsidies, permanently increasing domestic market capacity.",
      );
      expect(translateBackend("动用行政力协调贸易渠道，永久提高海外市场承接上限。")).toBe(
        "Spend administrative power coordinating trade channels, permanently increasing overseas market capacity.",
      );
      expect(translateBackend("动用行政力调控本轮国内收购价格。")).toBe(
        "Spend administrative power to regulate domestic purchase prices this round.",
      );
    });
  });

  it("does not leak Chinese for representative backend gameplay labels in English", async () => {
    await withLanguage("en", () => {
      const samples = [
        "手工业",
        "闲置",
        "机械化工业",
        "贸易促进",
        "军国体制",
        "美洲",
        "非洲",
        "陆军 +1",
        "政府预算 -3",
        "先吃掉原材料",
        "当前有 25 原材料，优先安排投料；每投 1 原材料会占用 1 工厂预算，剩余预算再考虑升级或扩建。",
        "可考虑制定宪法",
        "托拉斯制度会锁定路线",
        "最终改革：实施后锁定平等之路、民族之路。",
        "可殖民美洲",
        "消耗 3 陆军，之后每回合原材料 +3。",
        "扩大选举权，提高大众政治参与和国内承接能力；会推高民族主义压力。",
        "扶持大型企业集团，作为自由路线最终改革锁定平等与民族路线；收入分配推向工厂并降低升级成本，但会激化平等主义。",
        "社会福利",
        "将本轮收入更多导向民间购买力，缓和平等主义压力。",
        "罢工谈判",
        "与工会谈判，本回合产出减半，显著缓和平等主义压力。",
        "总动员令",
        "将当前非闲置产能的一半转化为等量陆军，并激化平等主义压力。",
        "镇压自由主义",
        "镇压Liberalism",
        "消耗 3 陆军压制自由主义思潮压力。",
      ];

      for (const sample of samples) {
        expect(translateBackend(sample)).not.toMatch(/[\u4e00-\u9fff]/);
      }
    });
  });

  it("coerces localized backend label objects into renderable text", async () => {
    await withLanguage("zh", () => {
      expect(translateBackend({ zh: "工业化主线", en: "Industrialization Path" })).toBe("工业化主线");
      expect(translateBackend(["英国", "法国"])).toBe("英国、法国");
    });

    await withLanguage("en", () => {
      expect(translateBackend({ zh: "工业化主线", en: "Industrialization Path" })).toBe("Industrialization Path");
      expect(translateBackend({ label: "珍妮纺纱机" })).toBe("Spinning Jenny");
      expect(translateBackend(["英国", "法国"])).toBe("Britain, France");
    });
  });

  it("defines market-policy panel copy in both supported languages", async () => {
    await withLanguage("zh", () => {
      expect(i18n.t("game:government.marketPolicyActions")).toBe("市场政策");
      expect(i18n.t("game:government.selectedMarketPolicies", { count: 2 })).toBe("已选 2 项");
      expect(i18n.t("game:government.strategy.tradePromotionDesc")).toBe(
        "动用行政力协调贸易渠道，永久提高海外市场承接上限。",
      );
    });

    await withLanguage("en", () => {
      expect(i18n.t("game:government.marketPolicyActions")).toBe("Market Policies");
      expect(i18n.t("game:government.selectedMarketPolicies", { count: 2 })).toBe("2 selected");
      expect(i18n.t("game:government.strategy.tradePromotionDesc")).toBe(
        "Spend administrative power coordinating trade channels, permanently increasing overseas market capacity.",
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
      expect(i18n.t("game:market.governmentAdjustment")).toBe("市场容量调整");
      expect(i18n.t("game:market.noGovernmentAdjustment")).toBe("本轮暂无市场调整");
      expect(i18n.t("game:market.netAdjustment")).toBe("当前净调整");
      expect(i18n.t("game:domestic.existingPriceBonus")).toBe("已有价格调整");
      expect(i18n.t("game:settlement.effectiveRatio")).toBe("本轮有效回流比例");
    });

    await withLanguage("en", () => {
      expect(i18n.t("game:market.governmentAdjustment")).toBe("Market Capacity Adjustment");
      expect(i18n.t("game:market.noGovernmentAdjustment")).toBe("No market adjustment this round");
      expect(i18n.t("game:market.netAdjustment")).toBe("Current net adjustment");
      expect(i18n.t("game:domestic.existingPriceBonus")).toBe("Existing Price Adjustment");
      expect(i18n.t("game:settlement.effectiveRatio")).toBe("Effective Return Ratio");
    });
  });
});

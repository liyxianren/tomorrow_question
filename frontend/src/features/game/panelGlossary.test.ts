import { describe, expect, it } from "vitest";

import i18n from "../../i18n";

import { getCountryLabel, getReformLabel, getRegionLabel } from "./panelGlossary";

async function withLanguage<T>(language: string, run: () => T | Promise<T>): Promise<T> {
  const previousLanguage = i18n.language || "zh";
  await i18n.changeLanguage(language);
  try {
    return await run();
  } finally {
    await i18n.changeLanguage(previousLanguage);
  }
}

describe("panelGlossary", () => {
  it("translates backend Chinese labels in English mode", async () => {
    await withLanguage("en", () => {
      expect(getCountryLabel("英国")).toBe("Britain");
      expect(getRegionLabel("欧洲")).toBe("Europe");
      expect(getRegionLabel("亚太")).toBe("Asia-Pacific");
      expect(getReformLabel("劳工保护")).toBe("Labor Protection");
      expect(getReformLabel("公共教育")).toBe("Public Education");
      expect(getReformLabel("国防动员")).toBe("National Defense Mobilization");
      expect(getReformLabel("社会保障")).toBe("Social Security");
    });
  });
});

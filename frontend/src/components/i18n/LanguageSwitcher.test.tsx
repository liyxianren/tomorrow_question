import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import i18n from "../../i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";

describe("LanguageSwitcher", () => {
  it("does not display Chinese text in English mode", async () => {
    await i18n.changeLanguage("en");

    render(<LanguageSwitcher />);

    const switcher = screen.getByTestId("language-switcher");

    expect(switcher).toHaveAccessibleName("Language");
    expect(switcher).toHaveTextContent("English");
    expect(switcher).toHaveTextContent("Chinese");
    expect(switcher.textContent).not.toMatch(/[\u3400-\u9FFF]/);
  });
});

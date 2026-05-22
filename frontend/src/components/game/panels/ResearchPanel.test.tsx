import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import i18n from "../../../i18n";
import type { TechTreeData } from "../../../types";

import { ResearchPanel } from "./ResearchPanel";

describe("ResearchPanel", () => {
  it("renders localized backend label objects and expands route unlock hints without crashing", async () => {
    await i18n.changeLanguage("zh");

    const techTree = {
      chains: [
        {
          chainId: "industrialization",
          label: { zh: "工业化主线", en: "Industrialization Path" },
          techs: [
            {
              techId: "spinning_jenny",
              label: { zh: "珍妮纺纱机", en: "Spinning Jenny" },
              threshold: 3,
              progress: 0,
              effectiveThreshold: 3,
              isUnlocked: false,
              isActive: false,
              canResearch: true,
              isDiscovered: false,
              breakthroughAttempts: 0,
              unlocksGoods: [],
              unlocksRoutes: ["mechanized"],
            },
          ],
        },
      ],
      researchFacilities: 1,
      facilityCost: 6,
      progressPerFacility: 1,
      breakthroughDieSides: 10,
      activeResearch: null,
    } as unknown as TechTreeData;

    render(
      <ResearchPanel
        techTree={techTree}
        selectedTechIds={new Set()}
        onToggleTech={vi.fn()}
        onToggleResearchFacility={vi.fn()}
        remainingGovernmentBudget={10}
        isResearchFacilitySelected={false}
      />,
    );

    expect(screen.getAllByText(/工业化主线/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText(/珍妮纺纱机/));
    expect(screen.getByText("解锁生产方式：机械化工业")).toBeInTheDocument();
  });

  it("disables facility construction when every technology is unlocked and no target is active", async () => {
    await i18n.changeLanguage("zh");
    const techTree = {
      chains: [
        {
          chainId: "industrialization",
          label: "工业化主线",
          techs: [
            {
              techId: "spinning_jenny",
              label: "珍妮纺纱机",
              threshold: 3,
              progress: 3,
              effectiveThreshold: 3,
              isUnlocked: true,
              isActive: false,
              canResearch: false,
              isDiscovered: true,
              breakthroughAttempts: 0,
              unlocksGoods: [],
              unlocksRoutes: [],
            },
          ],
        },
      ],
      researchFacilities: 12,
      facilityCost: 6,
      progressPerFacility: 1,
      breakthroughDieSides: 10,
      activeResearch: null,
    } as unknown as TechTreeData;
    const onToggleResearchFacility = vi.fn();

    render(
      <ResearchPanel
        techTree={techTree}
        selectedTechIds={new Set()}
        onToggleTech={vi.fn()}
        onToggleResearchFacility={onToggleResearchFacility}
        remainingGovernmentBudget={100}
        isResearchFacilitySelected={false}
      />,
    );

    const button = screen.getByRole("button", { name: "当前没有可研究目标" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onToggleResearchFacility).not.toHaveBeenCalled();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PhaseAnnounce } from "./PhaseAnnounce";

describe("PhaseAnnounce", () => {
  it("remounts the overlay when the phase changes before the previous animation completes", () => {
    const { rerender } = render(<PhaseAnnounce phase="decision" round={1} />);

    const firstOverlay = screen.getByTestId("phase-announce");
    expect(firstOverlay).toHaveTextContent("第1回合：决策");

    rerender(<PhaseAnnounce phase="market" round={1} />);

    const secondOverlay = screen.getByTestId("phase-announce");
    expect(secondOverlay).toHaveTextContent("第1回合：出售");
    expect(secondOverlay).not.toBe(firstOverlay);
  });
});

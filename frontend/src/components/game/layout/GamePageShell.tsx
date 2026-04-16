import type { ReactNode } from "react";

type GamePageShellProps = {
  assistRail: ReactNode;
  assistRailLabel: string;
  assistRailTestId: string;
  centerStage: ReactNode;
  centerStageTestId: string;
  leftRail?: ReactNode;
  leftRailLabel?: string;
  leftRailTestId?: string;
  layoutPreset?: "default" | "wide-a" | "two-col";
  situationBar: ReactNode;
};

export function GamePageShell({
  situationBar,
  leftRail,
  leftRailLabel,
  leftRailTestId,
  layoutPreset = "default",
  centerStage,
  centerStageTestId,
  assistRail,
  assistRailLabel,
  assistRailTestId,
}: GamePageShellProps) {
  const rootClassName =
    layoutPreset === "two-col"
      ? "game-workbench game-workbench--two-col"
      : layoutPreset === "wide-a"
        ? "game-workbench game-workbench--wide-a"
        : "game-workbench";

  return (
    <div className={rootClassName} data-layout-preset={layoutPreset}>
      <div className="game-workbench__topbar">
        <div className="game-workbench__topbar-inner">
          {situationBar}
        </div>
      </div>

      <div className="game-workbench__stack game-workbench__stack--command-center">
        {leftRail ? (
          <details className="game-workbench__rail game-workbench__rail--left" data-testid={leftRailTestId} open>
            <summary className="game-workbench__rail-summary">{leftRailLabel}</summary>
            <div className="game-workbench__rail-body">
              {leftRail}
            </div>
          </details>
        ) : null}

        <main className="game-workbench__center-stage" data-testid={centerStageTestId}>
          {centerStage}
        </main>

        <details className="game-workbench__rail game-workbench__rail--assist" data-testid={assistRailTestId} open>
          <summary className="game-workbench__rail-summary">{assistRailLabel}</summary>
          <div className="game-workbench__rail-body">
            {assistRail}
          </div>
        </details>
      </div>
    </div>
  );
}

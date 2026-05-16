import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type ScenarioCard = {
  title: string;
  lines: string[];
};

export type GameCommandDockViewModel = {
  draftSummary: {
    emptyText: string;
    lines: string[];
  };
  outcomePreview: {
    emptyText: string;
    headline: string;
    lines: string[];
    scenarioCards: ScenarioCard[];
  };
  riskPanel: {
    emptyText: string;
    lines: string[];
  };
};

type GameCommandDockProps = {
  actionNode: ReactNode;
  statusNode: ReactNode;
  viewModel: GameCommandDockViewModel;
};

export function GameCommandDock({ actionNode, statusNode, viewModel }: GameCommandDockProps) {
  const { t } = useTranslation();
  return (
    <div className="game-command-dock__stack">
      <DockCard eyebrow={t("game:commandDock.linkStatus")} title={t("game:commandDock.currentStatus")}>
        {statusNode}
      </DockCard>

      <DockCard eyebrow={t("game:commandDock.draftSummary")} title={t("game:commandDock.draftSummary")}>
        <LineList emptyText={viewModel.draftSummary.emptyText} lines={viewModel.draftSummary.lines} />
      </DockCard>

      <DockCard eyebrow={t("game:commandDock.outcomeHeadline")} title={t("game:commandDock.outcomePreview")}>
        <p className="game-command-dock__headline">{viewModel.outcomePreview.headline}</p>
        <LineList emptyText={viewModel.outcomePreview.emptyText} lines={viewModel.outcomePreview.lines} />
        {viewModel.outcomePreview.scenarioCards.map((card) => (
          <div key={card.title} className="game-command-dock__line-list" style={{ marginTop: 12 }}>
            <div className="game-command-dock__eyebrow">{card.title}</div>
            {card.lines.map((line) => (
              <div className="game-command-dock__line" key={`${card.title}-${line}`}>
                {line}
              </div>
            ))}
          </div>
        ))}
      </DockCard>

      <DockCard eyebrow={t("game:commandDock.riskRadar")} title={t("game:commandDock.currentRisk")}>
        <LineList emptyText={viewModel.riskPanel.emptyText} lines={viewModel.riskPanel.lines} tone="warning" />
      </DockCard>

      <DockCard eyebrow={t("game:commandDock.finalConfirm")} title={t("game:commandDock.submitAction")}>
        {actionNode}
      </DockCard>
    </div>
  );
}

function DockCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="game-command-dock__card">
      <div className="game-command-dock__eyebrow">{eyebrow}</div>
      <h2 className="game-command-dock__title">{title}</h2>
      <div className="game-command-dock__body">{children}</div>
    </article>
  );
}

function LineList({
  lines,
  emptyText,
  tone = "default",
}: {
  lines: string[];
  emptyText: string;
  tone?: "default" | "warning";
}) {
  if (lines.length === 0) {
    return <p className="game-command-dock__empty">{emptyText}</p>;
  }

  return (
    <div className="game-command-dock__line-list">
      {lines.map((line) => (
        <div
          className={
            tone === "warning"
              ? "game-command-dock__line game-command-dock__line--warning"
              : "game-command-dock__line"
          }
          key={line}
        >
          {line}
        </div>
      ))}
    </div>
  );
}

import type { ReactNode } from "react";

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
  return (
    <div className="game-command-dock__stack">
      <DockCard eyebrow="链路状态" title="当前状态">
        {statusNode}
      </DockCard>

      <DockCard eyebrow="当前草稿" title="草稿摘要">
        <LineList emptyText={viewModel.draftSummary.emptyText} lines={viewModel.draftSummary.lines} />
      </DockCard>

      <DockCard eyebrow="提交后会怎样" title="结果预演">
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

      <DockCard eyebrow="风险雷达" title="当前风险">
        <LineList emptyText={viewModel.riskPanel.emptyText} lines={viewModel.riskPanel.lines} tone="warning" />
      </DockCard>

      <DockCard eyebrow="最终确认" title="提交动作">
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

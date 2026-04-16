type TaskStripMetric = {
  label: string;
  value: string | number;
};

type TaskStripCard = {
  body: string;
  eyebrow: string;
  lines: string[];
  title: string;
};

export type GameTaskStripViewModel = {
  loopStrip: {
    body: string;
    steps: Array<{
      label: string;
      tone: "past" | "current" | "next" | "default";
    }>;
  };
  primaryMission: TaskStripCard;
  rankingStrip: TaskStripCard;
  resourceStrip: TaskStripCard & {
    metrics: TaskStripMetric[];
  };
  settlementStrip: TaskStripCard;
};

type GameTaskStripProps = {
  viewModel: GameTaskStripViewModel;
};

export function GameTaskStrip({ viewModel }: GameTaskStripProps) {
  return (
    <div data-testid="game-task-strip">
      <div className="game-task-strip__loop" data-testid="game-loop-strip">
        <div className="game-task-strip__loop-eyebrow">经营循环</div>
        <div className="game-task-strip__loop-body">{viewModel.loopStrip.body}</div>
        <div className="game-task-strip__line-list">
          {viewModel.loopStrip.steps.map((step) => (
            <div
              key={`${step.label}-${step.tone}`}
              className={`game-task-strip__line ${step.tone === "current" ? "game-task-strip__line--current" : step.tone === "next" ? "game-task-strip__line--next" : ""}`}
            >
              {step.label}
            </div>
          ))}
        </div>
      </div>

      <div className="game-task-strip">
        <TaskCard
          body={viewModel.primaryMission.body}
          eyebrow={viewModel.primaryMission.eyebrow}
          lines={viewModel.primaryMission.lines}
          testId="game-task-strip-primary"
          title={viewModel.primaryMission.title}
          tone="primary"
        />
        <TaskCard
          body={viewModel.resourceStrip.body}
          eyebrow={viewModel.resourceStrip.eyebrow}
          lines={viewModel.resourceStrip.metrics.map((metric) => `${metric.label} ${metric.value}`)}
          title={viewModel.resourceStrip.title}
          tone="resource"
        />
        <TaskCard
          body={viewModel.settlementStrip.body}
          eyebrow={viewModel.settlementStrip.eyebrow}
          lines={viewModel.settlementStrip.lines}
          testId="game-settlement-panel"
          title={viewModel.settlementStrip.title}
          tone="settlement"
        />
        <TaskCard
          body={viewModel.rankingStrip.body}
          eyebrow={viewModel.rankingStrip.eyebrow}
          lines={viewModel.rankingStrip.lines}
          testId="game-ranking-panel"
          title={viewModel.rankingStrip.title}
          tone="ranking"
        />
      </div>
    </div>
  );
}

function TaskCard({
  eyebrow,
  title,
  body,
  lines,
  tone,
  testId,
}: {
  eyebrow: string;
  title: string;
  body: string;
  lines: string[];
  tone: "primary" | "resource" | "settlement" | "ranking";
  testId?: string;
}) {
  return (
    <article
      className={`game-task-strip__card game-task-strip__card--${tone}`}
      data-testid={testId}
    >
      <div className="game-task-strip__eyebrow">{eyebrow}</div>
      <h2 className="game-task-strip__title">{title}</h2>
      <p className="game-task-strip__body">{body}</p>
      <div className="game-task-strip__line-list">
        {lines.map((line, index) => (
          <div key={`${title}-${index}-${line}`} className="game-task-strip__line">
            {line}
          </div>
        ))}
      </div>
    </article>
  );
}

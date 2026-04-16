import type { ReactNode } from "react";

type AssistCard = {
  eyebrow: string;
  title: string;
  body?: string;
  lines?: string[];
  tone?: "default" | "warning" | "accent";
};

type SubmitCard = AssistCard & {
  draftSummaryLines: string[];
  warningLines: string[];
};

type GameAssistRailProps = {
  title: string;
  checklist: AssistCard;
  blocking?: AssistCard | null;
  submit: SubmitCard;
  actionNode: ReactNode;
};

export function GameAssistRail({
  title,
  checklist,
  blocking,
  submit,
  actionNode,
}: GameAssistRailProps) {
  return (
    <div className="game-rail-stack">
      <div className="game-rail-heading">{title}</div>
      <AssistCardView card={checklist} />
      {blocking ? <AssistCardView card={blocking} /> : null}
      <div className="game-rail-divider" />
      <article className="game-rail-card game-rail-card--submit">
        {submit.warningLines.length > 0 ? (
          <div className="game-rail-card__line-list game-rail-card__warn-box">
            {submit.warningLines.map((line) => (
              <div key={`${submit.title}-warning-${line}`} className="game-rail-card__line">
                {line}
              </div>
            ))}
          </div>
        ) : null}
        <div className="game-assist-rail__action">{actionNode}</div>
      </article>
    </div>
  );
}

function AssistCardView({ card }: { card: AssistCard }) {
  const className =
    card.tone === "accent"
      ? "game-rail-card game-rail-card--accent"
      : card.tone === "warning"
        ? "game-rail-card game-rail-card--warning"
        : "game-rail-card";

  return (
    <article className={className}>
      <div className="game-rail-card__eyebrow">{card.eyebrow}</div>
      <h2 className="game-rail-card__title">{card.title}</h2>
      {card.body ? <p className="game-rail-card__body">{card.body}</p> : null}
      {card.lines?.length ? (
        <div className="game-rail-card__line-list">
          {card.lines.map((line) => (
            <div key={`${card.title}-${line}`} className="game-rail-card__line">
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

type RailMetric = {
  label: string;
  value: string | number;
};

type RailCard = {
  eyebrow: string;
  title: string;
  body?: string;
  lines?: string[];
  metrics?: RailMetric[];
  testId?: string;
  tone?: "default" | "accent" | "warning";
};

type GameLeftRailProps = {
  title: string;
  cards: RailCard[];
};

export function GameLeftRail({ title, cards }: GameLeftRailProps) {
  return (
    <div className="game-rail-stack">
      <div className="game-rail-heading">{title}</div>
      {cards.map((card) => (
        <article
          key={`${card.eyebrow}-${card.title}`}
          data-testid={card.testId}
          className={
            card.tone === "accent"
              ? "game-rail-card game-rail-card--accent"
              : card.tone === "warning"
                ? "game-rail-card game-rail-card--warning"
                : "game-rail-card"
          }
        >
          <div className="game-rail-card__eyebrow">{card.eyebrow}</div>
          <h2 className="game-rail-card__title">{card.title}</h2>
          {card.body ? <p className="game-rail-card__body">{card.body}</p> : null}
          {card.metrics?.length ? (
            <div className="game-rail-card__metrics">
              {card.metrics.map((metric) => (
                <div key={`${card.title}-${metric.label}`} className="game-rail-card__metric">
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>
          ) : null}
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
      ))}
    </div>
  );
}

type PhaseHeaderBarProps = {
  eyebrow: string;
  title: string;
  body: string;
  pills: string[];
};

export function PhaseHeaderBar({ eyebrow, title, body, pills }: PhaseHeaderBarProps) {
  return (
    <article className="phase-header-bar" data-testid="phase-header-bar">
      <div className="phase-header-bar__eyebrow">{eyebrow}</div>
      <div className="phase-header-bar__main">
        <div>
          <h2 className="phase-header-bar__title">{title}</h2>
          <p className="phase-header-bar__body">{body}</p>
        </div>
        {pills.length > 0 ? (
          <div className="phase-header-bar__pills">
            {pills.map((pill) => (
              <span key={pill} className="phase-header-bar__pill">
                {pill}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

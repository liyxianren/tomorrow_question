import "./DecisionStatStrip.css";

export type DecisionStatStripItem = {
  icon?: string;
  value: string | number;
  label: string;
  tone?: "critical" | "warning";
};

export type DecisionStatStripProps = {
  items: DecisionStatStripItem[];
  testId?: string;
};

export function DecisionStatStrip({ items, testId }: DecisionStatStripProps) {
  return (
    <div className="dss" data-testid={testId}>
      {items.map((item, index) => {
        const toneClass = item.tone ? ` dss__item--${item.tone}` : "";
        return (
          <div key={`${item.label}-${index}`} className={`dss__item${toneClass}`}>
            {item.icon ? <span className="dss__icon" aria-hidden="true">{item.icon}</span> : null}
            <strong className="dss__value">{item.value}</strong>
            <span className="dss__label">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface FactoryIntelItem {
  id: string;
  title: string;
  routeLabel: string;
  lockedReason: string;
  description: string;
  badges: string[];
}

export function FactoryIntelPanel({
  items,
}: {
  items: FactoryIntelItem[];
}) {
  return (
    <section data-testid="factory-intel-panel">
      <h3 className="factory-section-label">工业情报</h3>
      {items.length > 0 ? (
        <div className="factory-actions">
          {items.map((item) => (
            <div key={item.id} className="factory-action-card factory-action-card--disabled">
              <div className="factory-action-card__head">
                <span className="factory-action-card__icon">🔒</span>
                <span className="factory-action-card__name">{item.title}</span>
              </div>
              <p className="factory-action-card__desc">{item.description}</p>
              <div className="factory-action-card__effects">
                {item.badges.map((badge) => (
                  <span key={`${item.id}-${badge}`} className="factory-action-card__effect-tag">{badge}</span>
                ))}
              </div>
              <div className="factory-action-card__footer">
                <span className="factory-action-card__status">{item.lockedReason}</span>
                <span className="factory-action-card__effect-tag">{item.routeLabel}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="factory-panel__empty">当前没有待观察的锁定商品，工业情报区会在新商品尚未解锁时提醒你。</p>
      )}
    </section>
  );
}

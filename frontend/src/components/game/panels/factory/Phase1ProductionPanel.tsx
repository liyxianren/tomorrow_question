import type { Phase1ProductionMode } from "../../../../types";
import "./Phase1ProductionPanel.css";

export function Phase1ProductionPanel({
  modes,
  rawMaterials,
  investmentPool,
  domesticDemand,
  equilibriumPrice,
  domesticPricePreview,
  goodsInventory,
  assignments,
  onAssignmentChange,
}: {
  modes: Phase1ProductionMode[];
  rawMaterials: number;
  investmentPool: number;
  domesticDemand: number;
  equilibriumPrice: number;
  domesticPricePreview: number;
  goodsInventory: number;
  assignments: Record<string, number>;
  onAssignmentChange?: (mode: string, quantity: number) => void;
}) {
  const totalAssigned = sumValues(assignments);
  const remainingRawMaterials = Math.max(rawMaterials - totalAssigned, 0);
  const totalOutput = modes.reduce((sum, mode) => {
    const assigned = assignments[mode.mode] ?? 0;
    return sum + assigned * mode.outputRatio;
  }, 0);

  return (
    <section className="phase1-production-panel" data-testid="phase1-production-panel">
      <div className="phase1-production-panel__summary">
        <div className="phase1-production-panel__summary-item">
          <span className="phase1-production-panel__summary-label">原材料</span>
          <span className="phase1-production-panel__summary-value">
            {remainingRawMaterials} / {rawMaterials}
          </span>
        </div>
        <div className="phase1-production-panel__summary-item">
          <span className="phase1-production-panel__summary-label">投资池</span>
          <span className="phase1-production-panel__summary-value">{investmentPool}</span>
        </div>
        <div className="phase1-production-panel__summary-item">
          <span className="phase1-production-panel__summary-label">商品库存</span>
          <span className="phase1-production-panel__summary-value">{goodsInventory}</span>
        </div>
        <div className="phase1-production-panel__summary-item">
          <span className="phase1-production-panel__summary-label">预计需求</span>
          <span className="phase1-production-panel__summary-value">{domesticDemand}</span>
        </div>
        <div className="phase1-production-panel__summary-item">
          <span className="phase1-production-panel__summary-label">均衡价</span>
          <span className="phase1-production-panel__summary-value">{equilibriumPrice}</span>
        </div>
        <div className="phase1-production-panel__summary-item">
          <span className="phase1-production-panel__summary-label">国内成交价预测</span>
          <span className="phase1-production-panel__summary-value">{domesticPricePreview}</span>
        </div>
      </div>

      <div className="phase1-production-panel__grid">
        {modes.map((mode) => {
          const assigned = assignments[mode.mode] ?? 0;
          const expectedOutput = assigned * mode.outputRatio;
          const expectedDemand = mode.currentCapacity * mode.demandCoefficient;
          const isLocked = !mode.isAvailable;
          const noCapacity = mode.currentCapacity <= 0;
          const inputDisabled = isLocked || noCapacity || !onAssignmentChange;
          const inputMax = Math.min(mode.currentCapacity, rawMaterials);

          function handleChange(raw: string) {
            if (!onAssignmentChange) {
              return;
            }
            const numeric = Number(raw);
            const safe = Number.isFinite(numeric) ? Math.floor(Math.max(0, numeric)) : 0;
            const clamped = Math.min(safe, mode.currentCapacity);
            onAssignmentChange(mode.mode, clamped);
          }

          const cardClassName = [
            "phase1-mode-card",
            isLocked ? "phase1-mode-card--locked" : "",
            assigned > 0 ? "phase1-mode-card--active" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <article key={mode.mode} className={cardClassName}>
              <header className="phase1-mode-card__header">
                <div className="phase1-mode-card__title-group">
                  <span className="phase1-mode-card__name">{mode.label}</span>
                  <span className="phase1-mode-card__mode-id">{mode.mode}</span>
                </div>
                {isLocked ? (
                  <span className="phase1-mode-card__lock-tag">
                    🔒 {mode.requiredTech ? `需 ${mode.requiredTech}` : "未解锁"}
                  </span>
                ) : null}
              </header>

              <dl className="phase1-mode-card__stats">
                <div className="phase1-mode-card__stat">
                  <dt>当前产能</dt>
                  <dd>{mode.currentCapacity}</dd>
                </div>
                <div className="phase1-mode-card__stat">
                  <dt>效率</dt>
                  <dd>
                    {mode.inputRatio} 原材料 → {mode.outputRatio} 商品
                  </dd>
                </div>
                <div className="phase1-mode-card__stat">
                  <dt>需求系数</dt>
                  <dd>{mode.demandCoefficient} / 产能</dd>
                </div>
                {mode.buildCost !== null ? (
                  <div className="phase1-mode-card__stat">
                    <dt>新建成本</dt>
                    <dd>{mode.buildCost}</dd>
                  </div>
                ) : null}
                {mode.upgradeCost !== null ? (
                  <div className="phase1-mode-card__stat">
                    <dt>升级成本</dt>
                    <dd>{mode.upgradeCost}</dd>
                  </div>
                ) : null}
                <div className="phase1-mode-card__stat">
                  <dt>预计创造需求</dt>
                  <dd>{expectedDemand}</dd>
                </div>
              </dl>

              <div className="phase1-mode-card__assign">
                <label className="phase1-mode-card__assign-label" htmlFor={`phase1-assign-${mode.mode}`}>
                  分配原材料
                </label>
                <input
                  id={`phase1-assign-${mode.mode}`}
                  className="phase1-mode-card__input"
                  type="number"
                  min={0}
                  max={inputMax}
                  step={1}
                  value={assigned}
                  disabled={inputDisabled}
                  onChange={(event) => handleChange(event.target.value)}
                  aria-label={`为 ${mode.label} 分配原材料`}
                />
                <span className="phase1-mode-card__assign-hint">
                  上限 {inputMax}（产能 {mode.currentCapacity}）
                </span>
              </div>

              <footer className="phase1-mode-card__footer">
                <span className="phase1-mode-card__output-label">预计产出</span>
                <span className="phase1-mode-card__output-value">{expectedOutput}</span>
              </footer>
            </article>
          );
        })}
      </div>

      <div className="phase1-production-panel__total">
        <span className="phase1-production-panel__total-label">总预计产出</span>
        <span className="phase1-production-panel__total-value">{totalOutput}</span>
        <span className="phase1-production-panel__total-meta">
          已分配原材料 {totalAssigned} / {rawMaterials}
        </span>
      </div>
    </section>
  );
}

function sumValues(values: Record<string, number>): number {
  return Object.values(values).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

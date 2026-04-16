import { DECISION_STEP_ORDER, getDecisionStepLabel, type DecisionStepId } from "../../../features/game/flow/decisionFlow";
import "./DecisionStepTabs.css";

export function DecisionStepTabs({
  activeStep,
  onStepSelect,
}: {
  activeStep: DecisionStepId;
  onStepSelect: (step: DecisionStepId) => void;
}) {
  return (
    <nav className="decision-step-tabs" aria-label="决策步骤切换" data-testid="decision-step-tabs">
      {DECISION_STEP_ORDER.map((step) => (
        <button
          key={step}
          aria-label={getDecisionStepLabel(step)}
          aria-pressed={step === activeStep}
          className={`decision-step-tabs__tab${step === activeStep ? " decision-step-tabs__tab--active" : ""}`}
          data-testid={`decision-step-tab-${step}`}
          type="button"
          onClick={() => onStepSelect(step)}
        >
          {getDecisionTabLabel(step)}
        </button>
      ))}
    </nav>
  );
}

function getDecisionTabLabel(step: DecisionStepId): string {
  switch (step) {
    case "factory":
      return "工业区";
    case "domestic":
      return "市民广场";
    case "government":
      return "议会厅";
    case "military":
      return "军事要塞";
    case "research":
      return "研究院";
    default:
      return step;
  }
}

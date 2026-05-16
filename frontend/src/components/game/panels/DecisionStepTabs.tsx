import { useTranslation } from "react-i18next";
import { DECISION_STEP_ORDER, getDecisionStepLabel, type DecisionStepId } from "../../../features/game/flow/decisionFlow";
import "./DecisionStepTabs.css";

export function DecisionStepTabs({
  activeStep,
  onStepSelect,
}: {
  activeStep: DecisionStepId;
  onStepSelect: (step: DecisionStepId) => void;
}) {
  const { t } = useTranslation();

  return (
    <nav className="decision-step-tabs" aria-label={t("game:stepLabel.decisionStepTabs", "Decision Step Tabs")} data-testid="decision-step-tabs">
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
          {getDecisionTabLabel(step, t)}
        </button>
      ))}
    </nav>
  );
}

function getDecisionTabLabel(step: DecisionStepId, t: (key: string, options?: Record<string, unknown>) => string = (k) => k): string {
  return t(`game:stepLabel.${step}` as any, { defaultValue: step } as any) || getDecisionStepLabel(step);
}

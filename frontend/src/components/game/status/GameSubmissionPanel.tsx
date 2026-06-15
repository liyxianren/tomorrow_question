import { useTranslation } from "react-i18next";
import i18n from "../../../i18n";
import type { PhaseActionStatusViewModel } from "../../../features/game/flow/gameFlow";


type GameSubmissionPanelProps = {
  status: PhaseActionStatusViewModel;
};

export function GameSubmissionPanel({ status }: GameSubmissionPanelProps) {
  const { t } = useTranslation();
  const playerFacingStatus = getPlayerFacingStatus(status);
  const rhythmMessage = getRhythmMessage(status);

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        padding: 16,
        borderRadius: 16,
        background: "rgba(255, 255, 255, 0.03)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
        }}
      >
        <span
          data-testid="game-phase-status-badge"
          style={{
            padding: "6px 12px",
            borderRadius: 999,
            background: "rgba(212, 160, 95, 0.14)",
            color: "#f1c98c",
          }}
        >
          {formatStatusLabel(t("game:submit.currentStatus"), playerFacingStatus)}
        </span>
        <strong data-testid="game-flow-status-message">{status.title}</strong>
      </div>
      <p style={{ margin: 0 }}>{status.description}</p>
      {rhythmMessage ? <p style={{ margin: 0, color: "rgba(255,255,255,0.68)" }}>{rhythmMessage}</p> : null}
    </div>
  );
}

function formatStatusLabel(label: string, value: string): string {
  const separator = i18n.language?.startsWith("zh") ? "：" : ": ";
  return `${label}${separator}${value}`;
}

function getPlayerFacingStatus(status: PhaseActionStatusViewModel): string {
  switch (status.kind) {
    case "actionable":
      return i18n.t("game:submit.canSubmitLabel");
    case "submitted":
      return status.badge;
    case "settled":
      return i18n.t("game:submit.phaseSettled");
    case "finished":
      return i18n.t("game:submit.gameFinished");
    default:
      return i18n.t("game:submit.battleSyncing");
  }
}

function getRhythmMessage(status: PhaseActionStatusViewModel): string | null {
  switch (status.kind) {
    case "submitted":
      if (status.badge.includes(i18n.t("game:flow.badgeSystemSettling"))) {
        return i18n.t("game:flow.rhythmAllSubmitted");
      }
      if (status.badge.includes(i18n.t("game:flow.badgeAutoSubmit"))) {
        return i18n.t("game:flow.rhythmAutoSubmitted");
      }
      return i18n.t("game:flow.rhythmWaiting");
    case "settled":
      return i18n.t("game:flow.rhythmSettled");
    case "actionable":
      return i18n.t("game:flow.rhythmActionable");
    default:
      return null;
  }
}

import type { PhaseActionStatusViewModel } from "../../../features/game/flow/gameFlow";


type GameSubmissionPanelProps = {
  status: PhaseActionStatusViewModel;
};

export function GameSubmissionPanel({ status }: GameSubmissionPanelProps) {
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
          当前状态：{playerFacingStatus}
        </span>
        <strong data-testid="game-flow-status-message">{status.title}</strong>
      </div>
      <p style={{ margin: 0 }}>{status.description}</p>
      {rhythmMessage ? <p style={{ margin: 0, color: "rgba(255,255,255,0.68)" }}>{rhythmMessage}</p> : null}
    </div>
  );
}

function getPlayerFacingStatus(status: PhaseActionStatusViewModel): string {
  switch (status.kind) {
    case "actionable":
      return "可提交";
    case "submitted":
      return status.badge;
    case "settled":
      return "阶段已结算";
    case "finished":
      return "本局已结束";
    default:
      return "战局同步中";
  }
}

function getRhythmMessage(status: PhaseActionStatusViewModel): string | null {
  switch (status.kind) {
    case "submitted":
      if (status.badge.includes("结算中")) {
        return "所有玩家都已完成操作，系统正在汇总本阶段动作并准备推进。";
      }
      if (status.badge.includes("系统代交")) {
        return "你这一阶段已经被系统锁定提交，接下来只能等待其他玩家或系统推进。";
      }
      return "全部玩家提交后，系统会自动结算并推进到下一阶段。";
    case "settled":
      return "先确认上一阶段发生了什么，再决定这轮是否调整经营主线。";
    case "actionable":
      return "完成左侧安排后，在这里确认提交；提交后会进入等待结算。";
    default:
      return null;
  }
}

import type { LobbyStatusViewModel } from "../../features/lobby/flow/model";
import { bodyTextStyle, createBadgeStyle, sectionCardStyle } from "./styles";


type LobbyFlowStatusCardProps = {
  flowStatus: LobbyStatusViewModel;
};

export function LobbyFlowStatusCard({ flowStatus }: LobbyFlowStatusCardProps) {
  return (
    <section className="panel" data-testid="lobby-flow-panel" style={sectionCardStyle}>
      <span style={createBadgeStyle(flowStatus.tone)}>{flowStatus.title}</span>
      <p data-testid="lobby-flow-message" style={bodyTextStyle}>
        {flowStatus.description}
      </p>
    </section>
  );
}

import type { LobbyStatusViewModel } from "../../features/lobby/flow/model";
import {
  bodyTextStyle,
  createBadgeStyle,
  sectionCardStyle,
} from "./styles";


type LobbyStatusNoticeProps = {
  viewModel: LobbyStatusViewModel;
};

export function LobbyStatusNotice({ viewModel }: LobbyStatusNoticeProps) {
  return (
    <section className="panel" style={{ ...sectionCardStyle, padding: 18 }}>
      <span style={createBadgeStyle(viewModel.tone)}>{viewModel.title}</span>
      <p style={bodyTextStyle}>{viewModel.description}</p>
    </section>
  );
}

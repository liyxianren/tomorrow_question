import { Link } from "react-router-dom";

import type { RecoverableGameBannerViewModel } from "../../features/lobby/flow/viewModel";
import {
  bodyTextStyle,
  createButtonStyle,
  eyebrowStyle,
  sectionCardStyle,
  sectionTitleStyle,
} from "./styles";


type LobbyContinueBannerProps = {
  viewModel: RecoverableGameBannerViewModel | null;
};

export function LobbyContinueBanner({ viewModel }: LobbyContinueBannerProps) {
  if (!viewModel) {
    return null;
  }

  return (
    <section className="panel" data-testid="lobby-continue-banner" style={sectionCardStyle}>
      <p className="panel__eyebrow" style={eyebrowStyle}>
        已保存进度
      </p>
      <h2 style={sectionTitleStyle}>继续上次进度</h2>
      <h3 style={{ marginTop: 12, fontSize: 18 }}>{viewModel.title}</h3>
      <p style={bodyTextStyle}>{viewModel.description}</p>
      <p style={{ ...bodyTextStyle, marginTop: 8 }}>你可以直接回到上次离开的房间或对局。</p>

      <div style={{ marginTop: 18 }}>
        <Link
          style={{
            ...createButtonStyle({ variant: "primary" }),
            display: "inline-flex",
            textDecoration: "none",
          }}
          to={viewModel.targetPath}
        >
          {viewModel.actionLabel}
        </Link>
      </div>
    </section>
  );
}

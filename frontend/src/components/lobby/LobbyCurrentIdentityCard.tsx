import {
  actionRowStyle,
  bodyTextStyle,
  createButtonStyle,
  eyebrowStyle,
  helperTextStyle,
  mutedMonoStyle,
  sectionCardStyle,
  sectionTitleStyle,
  subCardStyle,
} from "./styles";
import type { CurrentIdentityCardViewModel } from "../../features/lobby/flow/viewModel";


type LobbyCurrentIdentityCardProps = {
  viewModel: CurrentIdentityCardViewModel;
  onChangeIdentity: () => void;
};

export function LobbyCurrentIdentityCard({
  viewModel,
  onChangeIdentity,
}: LobbyCurrentIdentityCardProps) {
  return (
    <section
      aria-label="当前身份"
      className="panel"
      data-testid="lobby-current-identity-panel"
      style={sectionCardStyle}
    >
      <p className="panel__eyebrow" style={eyebrowStyle}>
        当前身份
      </p>
      <h2 style={sectionTitleStyle}>当前身份</h2>
      <p style={bodyTextStyle}>{viewModel.helperText}</p>

      <div style={{
          padding: 24,
          borderRadius: 20,
          background: "linear-gradient(135deg, rgba(30, 24, 20, 0.8) 0%, rgba(14, 10, 8, 0.9) 100%)",
          border: "1px solid rgba(212, 175, 55, 0.15)",
          borderLeft: "6px solid #8c2a2a",
          marginTop: 24,
          display: "grid",
          gap: 12,
          boxShadow: "inset 0 0 40px rgba(0,0,0,0.6), 0 10px 20px rgba(0,0,0,0.3)"
      }}>
        <strong data-testid="lobby-current-identity" style={{ fontSize: 24, fontFamily: "var(--font-serif)", color: "#f4efe6", letterSpacing: "0.05em" }}>
          {viewModel.displayName}
        </strong>
        <span style={{ ...helperTextStyle, color: "rgba(212, 175, 55, 0.6)", marginTop: 4 }}>{viewModel.profileIdLabel}</span>
        <span data-testid="lobby-current-profile-id" style={{ ...mutedMonoStyle, padding: "8px 12px", background: "rgba(0,0,0,0.4)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)", fontSize: 13 }}>
          {viewModel.profileIdValue}
        </span>
      </div>

      <div style={{ ...actionRowStyle, marginTop: 18 }}>
        <button
          className="button"
          data-testid="lobby-change-identity-button"
          onClick={onChangeIdentity}
          style={createButtonStyle({ variant: "secondary" })}
          type="button"
        >
          {viewModel.actionLabel}
        </button>
      </div>
    </section>
  );
}

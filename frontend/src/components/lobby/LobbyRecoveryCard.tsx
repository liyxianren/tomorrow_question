import { buildRecoverableSessionViewModel, type RecoverableSessionViewModel } from "../../features/lobby/flow/viewModel";
import {
  actionRowStyle,
  bodyTextStyle,
  createButtonStyle,
  eyebrowStyle,
  infoGridStyle,
  mutedMonoStyle,
  sectionCardStyle,
  sectionTitleStyle,
  subCardStyle,
} from "./styles";


type LobbyRecoveryCardProps = {
  viewModel?: RecoverableSessionViewModel;
  profileDisplayName?: string | null;
  profileId?: string | null;
  storedSessionId?: string | null;
  isBusy: boolean;
  onRestore: () => void;
  onClear: () => void;
};

export function LobbyRecoveryCard({
  viewModel,
  profileDisplayName,
  profileId,
  storedSessionId,
  isBusy,
  onRestore,
  onClear,
}: LobbyRecoveryCardProps) {
  const resolvedViewModel =
    viewModel ??
    buildRecoverableSessionViewModel({
      profile:
        profileDisplayName && profileId
          ? {
              profileId,
              displayName: profileDisplayName,
              boundSessionId: storedSessionId ?? null,
              recentRoomCodes: [],
              lastActiveGameId: null,
              updatedAt: "",
            }
          : null,
      storedSessionId: storedSessionId ?? null,
      isBusy,
    });

  return (
    <section
      aria-label="继续上次会话"
      className="panel"
      data-testid="lobby-recovery-card"
      style={sectionCardStyle}
    >
      <p className="panel__eyebrow" style={eyebrowStyle}>
        上次会话
      </p>
      <h2 style={sectionTitleStyle}>继续上次会话</h2>
      <p style={bodyTextStyle}>{resolvedViewModel.description}</p>

      <div style={infoGridStyle}>
        <div style={{ ...subCardStyle, display: "grid", gap: 6 }}>
          <strong>当前身份</strong>
          <span data-testid="lobby-recovery-profile-name">{resolvedViewModel.profileDisplayName}</span>
          <span data-testid="lobby-recovery-profile-id" style={mutedMonoStyle}>
            {resolvedViewModel.profileIdValue}
          </span>
        </div>

        <div style={subCardStyle}>
          <strong>{resolvedViewModel.sessionStateLabel}</strong>
          <p style={{ ...bodyTextStyle, marginTop: 8 }}>{resolvedViewModel.sessionStateValue}</p>
        </div>

        <div style={actionRowStyle}>
          <button
            data-testid="lobby-restore-button"
            disabled={!resolvedViewModel.canRestore || isBusy}
            onClick={onRestore}
            style={createButtonStyle({
              variant: resolvedViewModel.canRestore ? "primary" : "secondary",
            })}
            type="button"
          >
            {resolvedViewModel.restoreLabel}
          </button>

          <button
            data-testid="lobby-clear-session-button"
            disabled={!resolvedViewModel.canRestore || isBusy}
            onClick={onClear}
            style={createButtonStyle({ variant: "secondary" })}
            type="button"
          >
            {resolvedViewModel.clearLabel}
          </button>
        </div>
      </div>
    </section>
  );
}

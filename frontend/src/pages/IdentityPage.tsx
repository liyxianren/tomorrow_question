import { IdentityGateForm } from "../components/lobby/IdentityGateForm";
import { LobbyRecoveryCard } from "../components/lobby/LobbyRecoveryCard";
import { bodyTextStyle, heroCardStyle, pageStackStyle } from "../components/lobby/styles";
import { useIdentityGateController } from "../features/lobby/flow/useIdentityGateController";
import { getStoredProfile } from "../features/lobby/flow/identityStorage";
import { buildRecoverableSessionViewModel } from "../features/lobby/flow/viewModel";


type IdentityPageProps = {
  onIdentityConfirmed?: () => void;
};

export function IdentityPage({ onIdentityConfirmed }: IdentityPageProps) {
  const {
    nickname,
    profileId,
    storedSessionId,
    pendingAction,
    message,
    setNickname,
    handleContinue,
    handleRestore,
    handleClearStoredSession,
    handleClearIdentity,
  } = useIdentityGateController({
    onIdentityConfirmed,
  });
  const storedProfile = getStoredProfile();
  const recoveryCard = buildRecoverableSessionViewModel({
    profile:
      storedProfile && storedProfile.profileId === profileId
        ? storedProfile
        : storedProfile
          ? { ...storedProfile, displayName: nickname.trim() || storedProfile.displayName }
          : null,
    storedSessionId,
    isBusy: pendingAction === "restore",
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 30,
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "rgba(11, 8, 6, 0.76)",
        backdropFilter: "blur(12px)",
      }}
    >
      <section
        aria-labelledby="identity-gate-title"
        aria-modal="true"
        data-testid="identity-gate-modal"
        role="dialog"
        style={{
          width: "min(880px, calc(100vw - 32px))",
          ...heroCardStyle,
        }}
      >
        <div style={pageStackStyle}>
          <h2 id="identity-gate-title" style={{ margin: 0, fontSize: 32, fontFamily: "var(--font-serif)", color: "var(--color-accent-strong)", borderBottom: "1px solid rgba(212, 175, 55, 0.25)", paddingBottom: 16 }}>先确认你的显示昵称</h2>
          <p style={bodyTextStyle}>这个昵称会作为你在这台设备上的默认身份，用来创建房间、加入房间和恢复上次进度。</p>

          <IdentityGateForm
            message={message?.text ?? null}
            nickname={nickname}
            onContinue={handleContinue}
            onNicknameChange={setNickname}
            onClearIdentity={handleClearIdentity}
            profileId={profileId}
          />

          <LobbyRecoveryCard
            viewModel={recoveryCard}
            isBusy={pendingAction === "restore"}
            onClear={handleClearStoredSession}
            onRestore={handleRestore}
          />
        </div>
      </section>
    </div>
  );
}

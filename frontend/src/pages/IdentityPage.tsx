import { IdentityGateForm } from "../components/lobby/IdentityGateForm";
import { useIdentityGateController } from "../features/lobby/flow/useIdentityGateController";
import "./IdentityPage.css";


type IdentityPageProps = {
  onIdentityConfirmed?: () => void;
  onCancel?: () => void;
  canCancel?: boolean;
};

export function IdentityPage({ onIdentityConfirmed, onCancel, canCancel = false }: IdentityPageProps) {
  const {
    nickname,
    profileId,
    message,
    setNickname,
    handleContinue,
    handleClearIdentity,
  } = useIdentityGateController({
    onIdentityConfirmed,
  });

  return (
    <div
      className="identity-gate-overlay"
    >
      <section
        aria-labelledby="identity-gate-title"
        aria-modal="true"
        className="identity-gate-modal"
        data-testid="identity-gate-modal"
        role="dialog"
      >
        <div className="identity-gate-modal__scene" aria-hidden="true">
          <div className="identity-gate-modal__scene-copy">
            <p>进入大厅前</p>
            <strong>确认你的桌边席位</strong>
          </div>
        </div>

        <div className="identity-gate-modal__form">
          <div>
            <p className="panel__eyebrow">本机身份</p>
            <h2 id="identity-gate-title">显示昵称</h2>
            <p>这个名字会显示在房间成员列表和对局中。</p>
          </div>
          <IdentityGateForm
            canCancel={canCancel}
            message={message?.text ?? null}
            nickname={nickname}
            onCancel={onCancel}
            onContinue={handleContinue}
            onNicknameChange={setNickname}
            onClearIdentity={handleClearIdentity}
            profileId={profileId}
          />
        </div>
      </section>
    </div>
  );
}

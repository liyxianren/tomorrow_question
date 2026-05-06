import {
  fieldStyle,
  mutedMonoStyle,
} from "./styles";


type IdentityGateFormProps = {
  nickname: string;
  profileId: string | null;
  onNicknameChange: (value: string) => void;
  onContinue: () => void;
  onClearIdentity: () => void;
  onCancel?: () => void;
  canCancel?: boolean;
  message: string | null;
};

export function IdentityGateForm({
  nickname,
  profileId,
  onNicknameChange,
  onContinue,
  onClearIdentity,
  onCancel,
  canCancel = false,
  message,
}: IdentityGateFormProps) {
  return (
    <section className="identity-gate-form">
      <div className="identity-gate-form__header">
        <h3>填写昵称</h3>
        <p>输入一个容易识别的名字。之后可以在大厅里修改。</p>
      </div>

      <div className="identity-gate-form__body">
        <label>
          <span>昵称</span>
          <input
            aria-label="昵称"
            autoComplete="nickname"
            data-testid="identity-nickname-input"
            maxLength={24}
            onChange={(event) => onNicknameChange(event.target.value)}
            placeholder="例如：test、Alex、维多利亚"
            style={fieldStyle}
            value={nickname}
          />
        </label>

        <div className="identity-gate-form__profile">
          <strong>本机身份码</strong>
          <span data-testid="identity-profile-id" style={{ ...mutedMonoStyle, color: "var(--color-accent)" }}>
             {profileId ?? "保存昵称后自动生成"}
          </span>
        </div>

        <div className="identity-gate-form__actions">
          <button
            className="identity-gate-form__button identity-gate-form__button--primary"
            data-testid="identity-continue-button"
            onClick={onContinue}
            type="button"
          >
            保存并进入大厅
          </button>

          {canCancel ? (
            <button
              className="identity-gate-form__button identity-gate-form__button--secondary"
              data-testid="identity-cancel-button"
              onClick={onCancel}
              type="button"
            >
              取消
            </button>
          ) : null}
        </div>

        <div className="identity-gate-form__status" data-testid="identity-status-message">
          {message ?? "昵称只保存在这台设备上，用于识别你的房间席位。"}
        </div>

        {profileId ? (
          <button
            className="identity-gate-form__clear"
            data-testid="identity-clear-profile-button"
            onClick={onClearIdentity}
            type="button"
          >
            清除本机身份
          </button>
        ) : null}
      </div>
    </section>
  );
}

import {
  actionRowStyle,
  bodyTextStyle,
  createButtonStyle,
  fieldStyle,
  helperTextStyle,
  infoGridStyle,
  mutedMonoStyle,
  sectionCardStyle,
  sectionTitleStyle,
  subCardStyle,
} from "./styles";


type IdentityGateFormProps = {
  nickname: string;
  profileId: string | null;
  onNicknameChange: (value: string) => void;
  onContinue: () => void;
  onClearIdentity: () => void;
  message: string | null;
};

export function IdentityGateForm({
  nickname,
  profileId,
  onNicknameChange,
  onContinue,
  onClearIdentity,
  message,
}: IdentityGateFormProps) {
  return (
    <section className="panel" style={sectionCardStyle}>
      <h2 id="identity-gate-title" style={{ ...sectionTitleStyle, color: "var(--color-accent-strong)" }}>
        署名与印章
      </h2>
      <p style={bodyTextStyle}>您的名字将被铭记于帝国的最高机密档案中。这是您进入维也纳会议与前线指挥部的唯一凭证。</p>

      <div style={infoGridStyle}>
        <label>
          <span style={helperTextStyle}>领袖代号</span>
          <input
            aria-label="领袖代号"
            autoComplete="nickname"
            data-testid="identity-nickname-input"
            maxLength={24}
            onChange={(event) => onNicknameChange(event.target.value)}
            placeholder="例如：俾斯麦、维多利亚、或您的尊号"
            style={fieldStyle}
            value={nickname}
          />
        </label>

        <div style={{ ...subCardStyle, display: "grid", gap: 6 }}>
          <strong>绝密通讯码</strong>
          <span data-testid="identity-profile-id" style={{ ...mutedMonoStyle, color: "var(--color-accent)" }}>
             {profileId ?? "尚未签署"}
          </span>
        </div>

        <div style={actionRowStyle}>
          <button
            data-testid="identity-continue-button"
            onClick={onContinue}
            style={createButtonStyle({ variant: "primary" })}
            type="button"
          >
            加盖印章并进入大厅
          </button>

          <button
            data-testid="identity-clear-profile-button"
            onClick={onClearIdentity}
            style={createButtonStyle({ variant: "secondary" })}
            type="button"
          >
            销毁当前档案
          </button>
        </div>

        <div data-testid="identity-status-message" style={subCardStyle}>
          {message ?? "请务必妥善保管本档案。在波谲云诡的列国之间，这份信任是您重新建立外交线与重掌权柄的基石。"}
        </div>
      </div>
    </section>
  );
}

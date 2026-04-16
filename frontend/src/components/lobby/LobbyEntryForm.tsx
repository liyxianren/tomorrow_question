import {
  actionRowStyle,
  bodyTextStyle,
  createButtonStyle,
  fieldStyle,
  helperTextStyle,
  infoGridStyle,
  sectionCardStyle,
  sectionTitleStyle,
  subCardStyle,
} from "./styles";
import type {
  InviteEntryViewModel,
  LobbyPrimaryActionViewModel,
} from "../../features/lobby/flow/viewModel";
import { buildLobbyPrimaryActionViewModel } from "../../features/lobby/flow/viewModel";


type PendingAction = "create" | "join" | "restore" | null;

type LobbyEntryFormProps = {
  inviteEntry?: InviteEntryViewModel | null;
  roomCode: string;
  onRoomCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  isBusy: boolean;
  pendingAction: PendingAction;
  viewModel?: LobbyPrimaryActionViewModel;
};

export function LobbyEntryForm({
  inviteEntry,
  roomCode,
  onRoomCodeChange,
  onCreateRoom,
  onJoinRoom,
  isBusy,
  pendingAction,
  viewModel,
}: LobbyEntryFormProps) {
  const resolvedViewModel = viewModel ?? buildLobbyPrimaryActionViewModel();

  return (
    <section className="panel" style={sectionCardStyle}>
      <p className="panel__eyebrow">开始这一局</p>
      <div
        style={{
          display: "grid",
          gap: 24,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          alignItems: "stretch",
        }}
      >
        <article
          style={{
            ...subCardStyle,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 36,
            background: "linear-gradient(145deg, rgba(35, 42, 53, 0.7) 0%, rgba(14, 18, 26, 0.9) 100%)",
            border: "1px solid rgba(212, 175, 55, 0.25)",
            boxShadow: "inset 0 0 60px rgba(0,0,0,0.4), 0 12px 24px rgba(0,0,0,0.3)",
          }}
        >
          <div>
            <h2 style={{ ...sectionTitleStyle, color: "#fceb9c", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ display: "inline-block", width: 8, height: 8, background: "#fceb9c", borderRadius: "50%", boxShadow: "0 0 10px #fceb9c" }} />
              {resolvedViewModel.createTitle}
            </h2>
            <p style={{ ...bodyTextStyle, marginTop: 16 }}>{resolvedViewModel.createDescription}</p>
          </div>
          
          <div style={{ marginTop: 32 }}>
            <button
              data-testid="lobby-create-room-button"
              disabled={isBusy}
              onClick={onCreateRoom}
              style={{
                ...createButtonStyle({
                  variant: "primary",
                  active: pendingAction === "create",
                }),
                width: "100%",
                padding: "16px 32px",
                fontSize: 18,
                letterSpacing: "0.15em",
                boxShadow: "0 12px 32px rgba(212, 175, 55, 0.2), inset 0 2px 0 rgba(255,255,255,0.4)",
              }}
              type="button"
            >
              {pendingAction === "create" ? "创建房间中..." : "创建房间"}
            </button>
          </div>
        </article>

        <article
          style={{
            ...subCardStyle,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: "100%",
            padding: 36,
            gap: 24,
            background: "rgba(8, 10, 15, 0.8)",
            border: "1px solid rgba(80, 95, 120, 0.3)",
            boxShadow: "inset 0 0 30px rgba(0,0,0,0.6)",
          }}
        >
          <div style={{ display: "grid", gap: 20, minHeight: 0 }}>
            <h2 style={{ ...sectionTitleStyle, fontSize: 22, color: "var(--color-text-muted)" }}>
              {resolvedViewModel.joinTitle}
            </h2>
            <p style={{ ...bodyTextStyle, fontSize: 13, color: "rgba(255, 255, 255, 0.4)" }}>
              {resolvedViewModel.joinDescription}
            </p>
          </div>

          {inviteEntry ? (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 12,
                background: "rgba(242, 195, 122, 0.08)",
                borderLeft: "3px solid #fceb9c",
              }}
            >
              <p style={{ ...helperTextStyle, color: "#fceb9c" }}>{inviteEntry.description}</p>
            </div>
          ) : null}

          <div style={{ ...infoGridStyle, marginTop: 32 }}>
            <label>
              <span style={{ ...helperTextStyle, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 11 }}>任务密钥 (Room Code)</span>
              <input
                aria-label="房间码"
                autoCapitalize="characters"
                data-testid="lobby-room-code-input"
                disabled={isBusy}
                maxLength={12}
                onChange={(event) => onRoomCodeChange(event.target.value)}
                placeholder="输入房间码"
                style={{
                  ...fieldStyle,
                  fontFamily: "monospace",
                  letterSpacing: "0.2em",
                  fontSize: 16,
                  textAlign: "center",
                }}
                value={roomCode}
              />
            </label>

            <div style={{ ...actionRowStyle, marginTop: 8 }}>
              <button
                data-testid="lobby-join-room-button"
                disabled={isBusy}
                onClick={onJoinRoom}
                style={{
                  ...createButtonStyle({
                    variant: "secondary",
                    active: pendingAction === "join",
                  }),
                  width: "100%",
                  background: "rgba(30, 40, 56, 0.5)",
                  border: "1px solid rgba(80, 95, 120, 0.5)",
                  color: "var(--color-text-muted)",
                }}
                type="button"
              >
                {pendingAction === "join" ? "加入房间中..." : inviteEntry?.joinButtonLabel ?? "加入房间"}
              </button>
            </div>

            <p style={{ ...helperTextStyle, fontSize: 12, opacity: 0.6, marginTop: 8, textAlign: "center" }}>
              输入正确房间码后会直接进入对应房间。
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}

import {
  fieldStyle,
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
    <section aria-label="创建和房间码入口" className="lobby-entry">
      <div className="lobby-entry__header">
        <p>备用入口</p>
        <h2>没有可加入房间？</h2>
      </div>
      <div className="lobby-entry__grid">
        <article className="lobby-action-card lobby-action-card--create">
          <div>
            <span className="lobby-action-card__tag">创建房间</span>
            <h2>
              {resolvedViewModel.createTitle}
            </h2>
            <p>{resolvedViewModel.createDescription}</p>
          </div>
          
          <div className="lobby-action-card__footer">
            <button
              className="lobby-action-button lobby-action-button--primary"
              data-testid="lobby-create-room-button"
              disabled={isBusy}
              onClick={onCreateRoom}
              data-active={pendingAction === "create" ? "true" : "false"}
              type="button"
            >
              {pendingAction === "create" ? "创建房间中..." : "创建房间"}
            </button>
          </div>
        </article>

        <article className="lobby-action-card lobby-action-card--join">
          <div className="lobby-action-card__content">
            <span className="lobby-action-card__tag">房间码</span>
            <h2>
              {resolvedViewModel.joinTitle}
            </h2>
            <p>
              {resolvedViewModel.joinDescription}
            </p>
          </div>

          {inviteEntry ? (
            <div className="lobby-invite-note">
              <p>{inviteEntry.description}</p>
            </div>
          ) : null}

          <div className="lobby-join-form">
            <label>
              <span>房间码</span>
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
                  letterSpacing: 0,
                  fontSize: 16,
                  textAlign: "center",
                }}
                value={roomCode}
              />
            </label>

            <div>
              <button
                className="lobby-action-button lobby-action-button--secondary"
                data-testid="lobby-join-room-button"
                disabled={isBusy}
                onClick={onJoinRoom}
                data-active={pendingAction === "join" ? "true" : "false"}
                type="button"
              >
                {pendingAction === "join" ? "加入房间中..." : inviteEntry?.joinButtonLabel ?? "加入房间"}
              </button>
            </div>

            <p className="lobby-join-form__hint">
              输入正确房间码后会直接进入对应房间。
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}

import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("lobby");
  const resolvedViewModel = viewModel ?? buildLobbyPrimaryActionViewModel();

  return (
    <section aria-label={t("entryForm.ariaLabel")} className="lobby-entry">
      <div className="lobby-entry__header">
        <p>{t("entryForm.eyebrow")}</p>
        <h2>{t("entryForm.headerTitle")}</h2>
      </div>
      <div className="lobby-entry__grid">
        <article className="lobby-action-card lobby-action-card--create">
          <div>
            <span className="lobby-action-card__tag">{t("entryForm.createTag")}</span>
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
              {pendingAction === "create" ? t("entryForm.creatingButton") : t("entryForm.createButton")}
            </button>
          </div>
        </article>

        <article className="lobby-action-card lobby-action-card--join">
          <div className="lobby-action-card__content">
            <span className="lobby-action-card__tag">{t("entryForm.roomCodeTag")}</span>
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
              <span>{t("entryForm.roomCodeLabel")}</span>
              <input
                aria-label={t("entryForm.roomCodeLabel")}
                autoCapitalize="characters"
                data-testid="lobby-room-code-input"
                disabled={isBusy}
                maxLength={12}
                onChange={(event) => onRoomCodeChange(event.target.value)}
                placeholder={t("entryForm.roomCodePlaceholder")}
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
                {pendingAction === "join" ? t("entryForm.joiningButton") : inviteEntry?.joinButtonLabel ?? t("entryForm.joinButton")}
              </button>
            </div>

            <p className="lobby-join-form__hint">
              {t("entryForm.joinHint")}
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}

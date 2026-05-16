import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import type { RoomHeaderViewModel } from "../../features/room/roomPreparationViewModel";
import { getCountryLabel } from "../../features/room/roomPreparationViewModel";
import type { RoomContext, RoomMember } from "../../types";


type RoomHeaderPanelViewModelProps = {
  viewModel: RoomHeaderViewModel;
  onCopyRoomCode: () => void;
  onCopyInviteLink: () => void;
  hasCopiedRoomCode: boolean;
  hasCopiedInviteLink: boolean;
  onReturnToLobby?: () => void;
  isReturningToLobby?: boolean;
};

type RoomHeaderPanelLegacyProps = {
  room: RoomContext;
  currentPlayer: RoomMember | null;
  socketState: "idle" | "connecting" | "connected" | "disconnected";
  isLoading: boolean;
  statusMessage: string;
};

type RoomHeaderPanelProps = RoomHeaderPanelViewModelProps | RoomHeaderPanelLegacyProps;

export function RoomHeaderPanel(props: RoomHeaderPanelProps) {
  const { t } = useTranslation("room");
  const resolvedViewModel = "viewModel" in props ? props.viewModel : createLegacyHeaderViewModel(props);
  const resolvedOnCopyRoomCode = "onCopyRoomCode" in props ? props.onCopyRoomCode : () => undefined;
  const resolvedOnCopyInviteLink = "onCopyInviteLink" in props ? props.onCopyInviteLink : () => undefined;
  const resolvedHasCopiedRoomCode = "hasCopiedRoomCode" in props ? props.hasCopiedRoomCode : false;
  const resolvedHasCopiedInviteLink = "hasCopiedInviteLink" in props ? props.hasCopiedInviteLink : false;
  const resolvedOnReturnToLobby = "onReturnToLobby" in props ? props.onReturnToLobby : undefined;
  const resolvedIsReturningToLobby = "isReturningToLobby" in props ? Boolean(props.isReturningToLobby) : false;

  return (
    <section className="room-panel room-command-panel">
      <div className="room-command-panel__title-block">
        <p className="room-panel__eyebrow">{t("eyebrow")}</p>
        <h1>{t("status.readying")}</h1>
        <p>{t("status.waiting")}</p>
      </div>

      <div
        aria-live="polite"
        className="room-command-panel__status"
        data-testid="room-status-banner"
        role="status"
      >
        <div className="room-command-panel__meta-card">
          <span>{t("members.title")}</span>
          <strong>{resolvedViewModel.playerName}</strong>
          <small>{resolvedViewModel.roleLabel} · {resolvedViewModel.countryLabel}</small>
        </div>
        <div className="room-command-panel__meta-card">
          <span>{resolvedViewModel.playerStatusLabel}</span>
          <strong>{resolvedViewModel.playerStatusLabel}</strong>
          <small>{resolvedViewModel.roomStatusLabel}</small>
        </div>

        <span className="room-chip" data-testid="room-code">
          {resolvedViewModel.roomCode || t("status.waiting")}
        </span>
        <span className="room-chip">{resolvedViewModel.roomStatusLabel}</span>
      </div>

      <div className="room-command-panel__actions">
        <button
          className="room-button"
          onClick={resolvedOnCopyRoomCode}
          type="button"
        >
          {resolvedHasCopiedRoomCode ? t("actions.codeCopied") : t("actions.copyCode")}
        </button>
        <button
          className="room-button"
          onClick={resolvedOnCopyInviteLink}
          type="button"
        >
          {resolvedHasCopiedInviteLink ? t("actions.codeCopied") : t("actions.copyCode")}
        </button>
        {resolvedOnReturnToLobby ? (
          <button
            className="room-button room-button--danger"
            disabled={resolvedIsReturningToLobby}
            onClick={resolvedOnReturnToLobby}
            type="button"
          >
            {resolvedIsReturningToLobby ? `${t("actions.leave")}...` : t("actions.leave")}
          </button>
        ) : null}
      </div>

      {(resolvedViewModel.helperMessage) && (
        <div className="room-command-panel__message">
          <span className="room-chip">
            {resolvedViewModel.helperMessage}
          </span>
        </div>
      )}
    </section>
  );
}

function createLegacyHeaderViewModel({
  room,
  currentPlayer,
  statusMessage,
}: RoomHeaderPanelLegacyProps): RoomHeaderViewModel {
  return {
    roomCode: room.roomCode,
    roomStatusLabel: room.status === "in_game" ? i18n.t("room:status.in_game") : i18n.t("room:status.waiting"),
    playerName: currentPlayer?.nickname ?? i18n.t("room:members.empty"),
    roleLabel: currentPlayer?.playerId === room.hostPlayerId ? i18n.t("room:members.host") : i18n.t("room:members.you"),
    playerStatusLabel: room.status === "in_game"
      ? i18n.t("room:status.in_game")
      : currentPlayer?.isReady
        ? i18n.t("room:actions.ready")
        : currentPlayer?.selectedCountry
          ? i18n.t("room:countrySelection.title")
          : i18n.t("room:countrySelection.noSelection"),
    countryLabel: getCountryLabel(currentPlayer?.selectedCountry ?? null),
    helperMessage: statusMessage || null,
  };
}

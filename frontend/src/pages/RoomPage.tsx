import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { CountrySelectionPanel } from "../components/room/CountrySelectionPanel";
import { RoomHeaderPanel } from "../components/room/RoomHeaderPanel";
import { RoomMembersPanel } from "../components/room/RoomMembersPanel";
import { RoomReadyPanel } from "../components/room/RoomReadyPanel";
import { clearStoredProfileSession } from "../features/lobby/flow/identityStorage";
import { useRoomFlowController } from "../features/room/flow/useRoomFlowController";
import { apiRequest, clearSessionId } from "../services/http";
import "./RoomPage.css";


export function RoomPage() {
  const { t } = useTranslation("room");
  const navigate = useNavigate();
  const {
    currentMember,
    pendingAction,
    room,
    viewModel,
    handleFillBots,
    handleRemoveBot,
    handleSelectCountry,
    handleToggleReady,
  } = useRoomFlowController();
  const [hasCopiedRoomCode, setHasCopiedRoomCode] = useState(false);
  const [hasCopiedInviteLink, setHasCopiedInviteLink] = useState(false);
  const [isReturningToLobby, setReturningToLobby] = useState(false);
  const [isReadyNoticeDismissed, setReadyNoticeDismissed] = useState(false);
  const shouldShowReadyWaitingNotice = Boolean(
    currentMember?.isReady &&
    room.status !== "in_game" &&
    room.status !== "finished" &&
    !isReadyNoticeDismissed,
  );

  useEffect(() => {
    if (!currentMember?.isReady || room.status === "in_game" || room.status === "finished") {
      setReadyNoticeDismissed(false);
    }
  }, [currentMember?.isReady, room.status]);

  async function handleCopyRoomCode(): Promise<void> {
    if (!viewModel.header.roomCode) {
      return;
    }

    await navigator.clipboard?.writeText(viewModel.header.roomCode);
    setHasCopiedRoomCode(true);
  }

  async function handleCopyInviteLink(): Promise<void> {
    if (!viewModel.header.roomCode) {
      return;
    }

    const inviteBaseUrl = `${window.location.protocol}//${window.location.hostname || window.location.host}`;
    const inviteLink = `${inviteBaseUrl}/lobby?roomCode=${viewModel.header.roomCode}&from=invite`;
    await navigator.clipboard?.writeText(inviteLink);
    setHasCopiedInviteLink(true);
  }

  async function handleReturnToLobby(): Promise<void> {
    if (!viewModel.header.roomCode) {
      navigate("/lobby");
      return;
    }

    setReturningToLobby(true);
    try {
      await apiRequest(`/api/v1/rooms/${viewModel.header.roomCode}/leave`, {
        method: "POST",
      });
    } catch {
      // Returning to the lobby should still clear stale local recovery state if the room has already closed.
    } finally {
      clearSessionId();
      clearStoredProfileSession();
      navigate("/lobby");
      setReturningToLobby(false);
    }
  }

  return (
    <section className="room-page">
      <div className="room-page__backdrop" />
      <div className="room-page__inner">
        <RoomHeaderPanel
          hasCopiedInviteLink={hasCopiedInviteLink}
          hasCopiedRoomCode={hasCopiedRoomCode}
          isReturningToLobby={isReturningToLobby}
          onCopyInviteLink={handleCopyInviteLink}
          onCopyRoomCode={handleCopyRoomCode}
          onReturnToLobby={() => {
            void handleReturnToLobby();
          }}
          viewModel={viewModel.header}
        />

        <div className="room-page__layout">
          <main className="room-page__country-stage">
            <CountrySelectionPanel
              isBusy={pendingAction === "country"}
              onSelectCountry={handleSelectCountry}
              slots={viewModel.countrySlots}
            />
          </main>
          
          <aside className="room-page__side-rail" aria-label={t("sideRailAriaLabel")}>
            <RoomMembersPanel
              isBusy={pendingAction === "removeBot"}
              members={viewModel.members}
              onRemoveBot={handleRemoveBot}
            />
            <RoomReadyPanel
              aiControls={viewModel.aiControls}
              isBusy={pendingAction === "ready"}
              onFillBots={handleFillBots}
              onToggleReady={handleToggleReady}
              viewModel={viewModel.primaryAction}
            />
          </aside>
        </div>

        <p className="room-page__expiry" data-testid="room-expiry-notice">
          {t("roomExpiryNotice")}
        </p>
      </div>

      {shouldShowReadyWaitingNotice ? (
        <div className="room-ready-notice" data-testid="room-ready-waiting-notice" role="dialog" aria-modal="true">
          <button
            aria-label={t("common:close")}
            className="room-ready-notice__close"
            onClick={() => setReadyNoticeDismissed(true)}
            type="button"
          >
            ×
          </button>
          <div className="room-ready-notice__content">
            <p className="room-ready-notice__eyebrow">{t("readyNotice.eyebrow")}</p>
            <h2>{t("readyNotice.title")}</h2>
            <p>{t("readyNotice.body")}</p>
            <div className="room-ready-notice__line" />
            <span>{t("readyNotice.footer")}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

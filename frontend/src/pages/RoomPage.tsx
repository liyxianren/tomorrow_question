import { useState } from "react";
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
    pendingAction,
    viewModel,
    handleFillBots,
    handleRemoveBot,
    handleSelectCountry,
    handleToggleReady,
  } = useRoomFlowController();
  const [hasCopiedRoomCode, setHasCopiedRoomCode] = useState(false);
  const [hasCopiedInviteLink, setHasCopiedInviteLink] = useState(false);
  const [isReturningToLobby, setReturningToLobby] = useState(false);

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
          
          <aside className="room-page__side-rail" aria-label="房间状态和开局操作">
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
    </section>
  );
}

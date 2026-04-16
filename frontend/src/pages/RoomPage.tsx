import { useState } from "react";

import { CountrySelectionPanel } from "../components/room/CountrySelectionPanel";
import { RoomHeaderPanel } from "../components/room/RoomHeaderPanel";
import { RoomMembersPanel } from "../components/room/RoomMembersPanel";
import { RoomReadyPanel } from "../components/room/RoomReadyPanel";
import { useRoomFlowController } from "../features/room/flow/useRoomFlowController";


export function RoomPage() {
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

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        marginTop: "-32px",
        padding: "32px 16px",
        background: "url(/room-bg.png) center center / cover no-repeat fixed",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0, // cover the entire container
          background: "linear-gradient(180deg, rgba(8, 10, 15, 0.4) 0%, rgba(8, 10, 15, 0.95) 100%)",
          zIndex: 0,
        }}
      />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", display: "grid", gap: 24 }}>
        <RoomHeaderPanel
          hasCopiedInviteLink={hasCopiedInviteLink}
          hasCopiedRoomCode={hasCopiedRoomCode}
          onCopyInviteLink={handleCopyInviteLink}
          onCopyRoomCode={handleCopyRoomCode}
          viewModel={viewModel.header}
        />

        <div className="room-layout-grid">
          <div style={{ display: "grid", gap: 24 }}>
            <CountrySelectionPanel
              isBusy={pendingAction === "country"}
              onSelectCountry={handleSelectCountry}
              slots={viewModel.countrySlots}
            />
          </div>
          
          <div style={{ display: "grid", gap: 24 }}>
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
          </div>
        </div>
      </div>
    </div>
  );
}

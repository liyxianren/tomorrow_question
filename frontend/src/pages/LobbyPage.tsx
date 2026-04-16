import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { LobbyContinueBanner } from "../components/lobby/LobbyContinueBanner";
import { LobbyCurrentIdentityCard } from "../components/lobby/LobbyCurrentIdentityCard";
import { LobbyEntryForm } from "../components/lobby/LobbyEntryForm";
import { LobbyStatusNotice } from "../components/lobby/LobbyStatusNotice";
import { LobbyWaitingRoomsSection } from "../components/lobby/LobbyWaitingRoomsSection";
import {
  bodyTextStyle,
  pageStackStyle,
} from "../components/lobby/styles";
import { HeroSection } from "../components/ui/HeroSection";
import { getStoredProfile } from "../features/lobby/flow/identityStorage";
import { useIdentityGateController } from "../features/lobby/flow/useIdentityGateController";
import { normalizeRoomCode } from "../features/lobby/flow/model";
import { useLobbyFlowController } from "../features/lobby/flow/useLobbyFlowController";
import {
  buildCurrentIdentityCardViewModel,
  buildInviteEntryViewModel,
  buildLobbyPrimaryActionViewModel,
} from "../features/lobby/flow/viewModel";
import { IdentityPage } from "./IdentityPage";


export function LobbyPage() {
  const [searchParams] = useSearchParams();
  const [profileVersion, setProfileVersion] = useState(0);
  const [isIdentityGateOpen, setIdentityGateOpen] = useState(false);
  const profile = useMemo(() => getStoredProfile(), [profileVersion]);
  const inviteRoomCode = normalizeRoomCode(searchParams.get("roomCode") ?? "");
  const isInviteEntry = searchParams.get("from") === "invite";
  const inviteEntry = useMemo(
    () => buildInviteEntryViewModel(inviteRoomCode, isInviteEntry),
    [inviteRoomCode, isInviteEntry],
  );
  const primaryActionViewModel = useMemo(() => buildLobbyPrimaryActionViewModel(), []);
  useIdentityGateController({
    onIdentityConfirmed: () => {
      setProfileVersion((value) => value + 1);
      setIdentityGateOpen(false);
    },
  });
  const {
    roomCode,
    waitingRooms,
    recoverableBanner,
    statusViewModel,
    pendingAction,
    isBusy,
    isLoadingWaitingRooms,
    waitingRoomsError,
    setRoomCode,
    handleCreateRoom,
    handleJoinRoom,
    handleJoinWaitingRoom,
  } = useLobbyFlowController(profile, {
    initialRoomCode: inviteEntry?.roomCode ?? "",
  });
  const shouldBlockIdentity = !profile?.displayName || !profile.profileId;
  const visibleProfile = profile ?? getStoredProfile();
  const currentIdentityCard = buildCurrentIdentityCardViewModel(visibleProfile);

  return (
    <section style={pageStackStyle}>
      <HeroSection
        backgroundImage="/lobby-bg.png"
        description="流程很简单：输入昵称 -> 创建或加入房间 -> 选择国家 -> 全员准备 -> 自动开局。"
        eyebrow="房间大厅"
        title="先确认身份，再创建或加入房间"
      />

      <div
        style={{
          display: "grid",
          gap: 18,
          gridTemplateColumns: "minmax(0, 1.35fr) minmax(280px, 0.85fr)",
        }}
      >
        <LobbyEntryForm
          inviteEntry={inviteEntry}
          isBusy={isBusy || shouldBlockIdentity}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onRoomCodeChange={setRoomCode}
          pendingAction={pendingAction}
          roomCode={roomCode}
          viewModel={primaryActionViewModel}
        />

        {recoverableBanner ? <LobbyContinueBanner viewModel={recoverableBanner} /> : null}
      </div>

      <LobbyWaitingRoomsSection
        errorMessage={waitingRoomsError}
        isBusy={isBusy || shouldBlockIdentity}
        isLoading={isLoadingWaitingRooms}
        onJoinRoom={handleJoinWaitingRoom}
        rooms={waitingRooms}
      />

      <LobbyCurrentIdentityCard
        onChangeIdentity={() => setIdentityGateOpen(true)}
        viewModel={currentIdentityCard}
      />

      {statusViewModel ? <LobbyStatusNotice viewModel={statusViewModel} /> : null}

      {shouldBlockIdentity || isIdentityGateOpen ? (
        <IdentityPage
          onIdentityConfirmed={() => {
            setProfileVersion((value) => value + 1);
            setIdentityGateOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

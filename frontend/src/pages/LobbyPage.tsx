import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { LobbyContinueBanner } from "../components/lobby/LobbyContinueBanner";
import { LobbyCurrentIdentityCard } from "../components/lobby/LobbyCurrentIdentityCard";
import { LobbyEntryForm } from "../components/lobby/LobbyEntryForm";
import { LobbyStatusNotice } from "../components/lobby/LobbyStatusNotice";
import { LobbyWaitingRoomsSection } from "../components/lobby/LobbyWaitingRoomsSection";
import {
  eyebrowStyle,
} from "../components/lobby/styles";
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
import "./LobbyPage.css";


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
    handleRefreshWaitingRooms,
  } = useLobbyFlowController(profile, {
    initialRoomCode: inviteEntry?.roomCode ?? "",
  });
  const shouldBlockIdentity = !profile?.displayName || !profile.profileId;
  const visibleProfile = profile ?? getStoredProfile();
  const currentIdentityCard = buildCurrentIdentityCardViewModel(visibleProfile);
  const identityGateOpen = shouldBlockIdentity || isIdentityGateOpen;

  return (
    <section className="lobby-page">
      <div className="lobby-page__inner">
        <div className="lobby-page__command-deck">
          <section aria-labelledby="lobby-page-title" className="lobby-page__brief">
            <p className="panel__eyebrow" style={eyebrowStyle}>房间大厅</p>
            <h1 className="lobby-page__title" id="lobby-page-title">创建或加入一局</h1>
            <p className="lobby-page__lead">
              先确认显示昵称，再从可加入房间中直接进入；没有合适房间时再创建新房间。只有收到邀请时才需要输入房间码。
            </p>
            <div aria-label="进入房间流程" className="lobby-page__flow">
              <span>确认昵称</span>
              <span>创建或加入</span>
              <span>选择国家</span>
              <span>准备开局</span>
            </div>
          </section>

          <LobbyCurrentIdentityCard
            onChangeIdentity={() => setIdentityGateOpen(true)}
            viewModel={currentIdentityCard}
          />
        </div>

        {recoverableBanner ? <LobbyContinueBanner viewModel={recoverableBanner} /> : null}

        <div className="lobby-main-grid">
          <LobbyWaitingRoomsSection
            errorMessage={waitingRoomsError}
            isBusy={isBusy || shouldBlockIdentity}
            isLoading={isLoadingWaitingRooms}
            onJoinRoom={handleJoinWaitingRoom}
            onRefresh={handleRefreshWaitingRooms}
            rooms={waitingRooms}
          />

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
        </div>

        {statusViewModel ? <LobbyStatusNotice viewModel={statusViewModel} /> : null}
      </div>

      {identityGateOpen ? (
        <IdentityPage
          canCancel={!shouldBlockIdentity}
          onCancel={() => setIdentityGateOpen(false)}
          onIdentityConfirmed={() => {
            setProfileVersion((value) => value + 1);
            setIdentityGateOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}

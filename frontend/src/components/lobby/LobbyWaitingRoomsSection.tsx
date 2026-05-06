import type { WaitingRoomCardViewModel } from "../../features/lobby/flow/viewModel";
import {
  bodyTextStyle,
  createBadgeStyle,
  eyebrowStyle,
  sectionCardStyle,
  sectionTitleStyle,
} from "./styles";


type LobbyWaitingRoomsSectionProps = {
  rooms: WaitingRoomCardViewModel[];
  isBusy: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  onJoinRoom: (roomCode: string) => void;
  onRefresh: () => void;
};

export function LobbyWaitingRoomsSection({
  rooms,
  isBusy,
  isLoading,
  errorMessage,
  onJoinRoom,
  onRefresh,
}: LobbyWaitingRoomsSectionProps) {
  let content: JSX.Element;

  if (errorMessage) {
    content = (
      <div className="lobby-waiting-empty lobby-waiting-empty--error">
        <strong>暂时没能读取房间列表</strong>
        <p>网络或后端服务可能刚好在刷新。你可以重试，或使用右侧房间码加入。</p>
        <button className="lobby-secondary-button" onClick={onRefresh} type="button">
          重新读取
        </button>
      </div>
    );
  } else if (isLoading && rooms.length === 0) {
    content = (
      <div className="lobby-waiting-empty">
        <strong>正在读取可加入房间</strong>
        <p>系统会优先显示人数更多、离开局更近的房间。</p>
      </div>
    );
  } else if (rooms.length === 0) {
    content = (
      <div className="lobby-waiting-empty">
        <strong>当前没有公开等待房间</strong>
        <p>可以直接创建一局，或者让朋友把房间码发给你后从备用入口加入。</p>
      </div>
    );
  } else {
    content = (
      <div className="lobby-waiting-list">
        {rooms.map((room) => (
          <article
            className="lobby-waiting-room"
            data-testid={`lobby-waiting-room-${room.roomCode}`}
            key={room.roomCode}
          >
            <div className="lobby-waiting-room__head">
              <div>
                <strong>{room.roomCode}</strong>
                <p>{room.hostLabel}</p>
              </div>
              <span style={createBadgeStyle(room.isJoinable ? "success" : "neutral")}>{room.statusLabel}</span>
            </div>

            <div
              aria-label={`${room.memberCountLabel}，${room.availableSeatLabel}`}
              className="lobby-waiting-room__meter"
            >
              <span style={{ width: `${room.occupancyPercent}%` }} />
            </div>

            <div className="lobby-waiting-room__stats">
              <span>{room.memberCountLabel}</span>
              <span>{room.availableSeatLabel}</span>
              <span>{room.readyCountLabel}</span>
              <span>{room.selectedCountriesLabel}</span>
            </div>

            <div className="lobby-waiting-room__members" aria-label="当前成员">
              {room.memberPreview.map((member) => (
                <span key={`${room.roomCode}-${member}`}>{member}</span>
              ))}
            </div>

            <div>
              <button
                className="lobby-action-button lobby-action-button--ready"
                disabled={isBusy || !room.isJoinable}
                onClick={() => onJoinRoom(room.roomCode)}
                type="button"
              >
                {room.joinLabel}
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <section
      aria-label="可加入的房间"
      className="panel lobby-waiting-panel"
      data-testid="lobby-waiting-rooms-panel"
      style={sectionCardStyle}
    >
      <div className="lobby-waiting-panel__head">
        <div>
          <p className="panel__eyebrow" style={eyebrowStyle}>公开房间</p>
          <h2 style={sectionTitleStyle}>可加入的房间</h2>
          <p style={bodyTextStyle}>优先加入列表里的房间；只有朋友发来私密房间码时，才需要手动输入。</p>
        </div>
        <button className="lobby-secondary-button" disabled={isLoading} onClick={onRefresh} type="button">
          {isLoading ? "读取中..." : "刷新列表"}
        </button>
      </div>
      {content}
    </section>
  );
}

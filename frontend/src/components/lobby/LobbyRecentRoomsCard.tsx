import type { RecentRoomCardViewModel } from "../../features/lobby/flow/viewModel";
import {
  bodyTextStyle,
  createBadgeStyle,
  createButtonStyle,
  eyebrowStyle,
  helperTextStyle,
  listStyle,
  sectionCardStyle,
  sectionTitleStyle,
  subCardStyle,
} from "./styles";


type LobbyRecentRoomsCardProps = {
  rooms: RecentRoomCardViewModel[];
  onOpenRoom: (targetPath: string) => void;
};

export function LobbyRecentRoomsCard({ rooms, onOpenRoom }: LobbyRecentRoomsCardProps) {
  return (
    <section
      aria-label="最近房间"
      className="panel"
      data-testid="lobby-recent-rooms-panel"
      style={sectionCardStyle}
    >
      <p className="panel__eyebrow" style={eyebrowStyle}>
        最近房间
      </p>
      <h2 style={sectionTitleStyle}>最近房间</h2>
      <p style={bodyTextStyle}>最多保留 3 个你最近进入过的房间入口。</p>

      {rooms.length === 0 ? (
        <div style={{ ...subCardStyle, marginTop: 18 }}>
          <p style={helperTextStyle}>你还没有最近房间记录。创建房间或加入房间后，这里会自动保留最近入口。</p>
        </div>
      ) : (
        <div style={listStyle}>
          {rooms.map((room) => (
            <article
              className="panel"
              data-testid={`lobby-recent-room-${room.roomCode}`}
              key={room.roomCode}
              style={{ ...subCardStyle, display: "grid", gap: 12 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <strong style={{ fontSize: 18 }}>{room.roomCode}</strong>
                <span style={createBadgeStyle(room.isUnavailable ? "error" : "neutral")}>
                  {room.statusLabel}
                </span>
              </div>

              <p style={helperTextStyle}>{room.memberCountLabel}</p>
              <p style={helperTextStyle}>{room.detail}</p>

              <div>
                <button
                  className="button"
                  disabled={!room.targetPath}
                  onClick={() => {
                    if (room.targetPath) {
                      onOpenRoom(room.targetPath);
                    }
                  }}
                  style={createButtonStyle({
                    variant: room.targetPath ? "secondary" : "secondary",
                  })}
                  type="button"
                >
                  {room.targetLabel}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

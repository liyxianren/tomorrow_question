import type { WaitingRoomCardViewModel } from "../../features/lobby/flow/viewModel";
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


type LobbyWaitingRoomsSectionProps = {
  rooms: WaitingRoomCardViewModel[];
  isBusy: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  onJoinRoom: (roomCode: string) => void;
};

export function LobbyWaitingRoomsSection({
  rooms,
  isBusy,
  isLoading,
  errorMessage,
  onJoinRoom,
}: LobbyWaitingRoomsSectionProps) {
  let content: JSX.Element;

  if (errorMessage) {
    content = (
      <div style={{ ...subCardStyle, marginTop: 18 }}>
        <p style={helperTextStyle}>暂时没能读取等待中的房间，请稍后刷新再试。</p>
      </div>
    );
  } else if (isLoading && rooms.length === 0) {
    content = (
      <div style={{ ...subCardStyle, marginTop: 18 }}>
        <p style={helperTextStyle}>正在查看现在有哪些房间可以加入。</p>
      </div>
    );
  } else if (rooms.length === 0) {
    content = (
      <div style={{ ...subCardStyle, marginTop: 18 }}>
        <p style={helperTextStyle}>现在还没有等待中的房间。你可以先创建一局，再邀请朋友输入房间码加入。</p>
      </div>
    );
  } else {
    content = (
      <div style={listStyle}>
        {rooms.map((room) => (
          <article
            className="panel"
            data-testid={`lobby-waiting-room-${room.roomCode}`}
            key={room.roomCode}
            style={{
              padding: 24,
              borderRadius: 16,
              background: "linear-gradient(90deg, rgba(22, 30, 26, 0.7) 0%, rgba(14, 18, 16, 0.4) 100%)",
              border: "1px solid rgba(131, 196, 138, 0.2)",
              borderLeft: "4px solid #8dac7d",
              boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              display: "grid",
              gap: 16,
              transition: "transform 0.2s ease, box-shadow 0.2s ease",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <strong style={{ fontSize: 24, fontFamily: "monospace", color: "#d9f0db", letterSpacing: "0.15em" }}>{room.roomCode}</strong>
              <span style={createBadgeStyle("success")}>可加入</span>
            </div>

            <p style={{ ...helperTextStyle, color: "rgba(255, 255, 255, 0.6)", fontSize: 13 }}>{room.hostLabel}</p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 12,
              }}
            >
              <span style={{ ...helperTextStyle, background: "rgba(0,0,0,0.2)", padding: "4px 8px", borderRadius: 4 }}>{room.memberCountLabel}</span>
              <span style={{ ...helperTextStyle, background: "rgba(0,0,0,0.2)", padding: "4px 8px", borderRadius: 4 }}>{room.readyCountLabel}</span>
              <span style={{ ...helperTextStyle, background: "rgba(0,0,0,0.2)", padding: "4px 8px", borderRadius: 4 }}>{room.selectedCountriesLabel}</span>
            </div>

            <div style={{ marginTop: 8 }}>
              <button
                disabled={isBusy}
                onClick={() => onJoinRoom(room.roomCode)}
                style={{
                  ...createButtonStyle({ variant: "primary" }),
                  width: "100%",
                  background: "rgba(131, 196, 138, 0.15)",
                  border: "1px solid rgba(131, 196, 138, 0.4)",
                  color: "#d9f0db",
                  boxShadow: "none",
                }}
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
      aria-label="等待中的房间"
      className="panel"
      data-testid="lobby-waiting-rooms-panel"
      style={sectionCardStyle}
    >
      <p className="panel__eyebrow" style={eyebrowStyle}>公开阵线 / Public Fronts</p>
      <h2 style={sectionTitleStyle}>等待中的房间</h2>
      <p style={bodyTextStyle}>这里仅显示最高统帅部收到的活跃作战房间电报。你可以检阅目前的前线响应状态，或者直接加入一场已开始筹备的对局。</p>
      {content}
    </section>
  );
}

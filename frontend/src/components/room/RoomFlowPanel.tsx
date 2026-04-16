import type { RoomFlowStatus } from "../../features/room/flow/model";


type RoomFlowPanelProps = {
  flowStatus: RoomFlowStatus;
};

export function RoomFlowPanel({ flowStatus }: RoomFlowPanelProps) {
  return (
    <section className="panel" data-testid="room-flow-panel">
      <p style={{ margin: 0 }}>{flowStatus.message.text}</p>
    </section>
  );
}

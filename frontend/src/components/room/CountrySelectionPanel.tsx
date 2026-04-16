import type { CSSProperties } from "react";

import type { CountryCode } from "../../types";
import type { RoomCountrySlotViewModel } from "../../features/room/roomPreparationViewModel";
import { getCountryLabel } from "../../features/room/roomPreparationViewModel";
import type { RoomContext } from "../../types";


type CountrySelectionPanelViewModelProps = {
  slots: RoomCountrySlotViewModel[];
  isBusy: boolean;
  onSelectCountry: (country: CountryCode) => void;
};

type CountrySelectionPanelLegacyProps = {
  room: RoomContext;
  currentPlayerId: string | null;
  isBusy: boolean;
  onSelectCountry: (country: CountryCode) => void;
};

type CountrySelectionPanelProps = CountrySelectionPanelViewModelProps | CountrySelectionPanelLegacyProps;

const buttonStyle = {
  padding: "20px 24px",
  borderRadius: 16,
  border: "1px solid rgba(80, 95, 120, 0.3)",
  background: "linear-gradient(135deg, rgba(30, 36, 44, 0.5) 0%, rgba(14, 18, 26, 0.6) 100%)",
  backdropFilter: "blur(12px)",
  color: "#f4efe6",
  cursor: "pointer",
  textAlign: "left",
  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  position: "relative",
  overflow: "hidden",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
} satisfies CSSProperties;

export function CountrySelectionPanel({
  isBusy,
  onSelectCountry,
  ...rest
}: CountrySelectionPanelProps) {
  const slots = "slots" in rest
    ? rest.slots
    : Object.entries(rest.room.countrySlots).map(([country, occupantId]) => {
        const occupant = rest.room.members.find((member) => member.playerId === occupantId) ?? null;
        const isSelected = rest.room.members.find((member) => member.playerId === rest.currentPlayerId)?.selectedCountry === country;

        return {
          country: country as CountryCode,
          label: getCountryLabel(country as CountryCode),
          occupantLabel: occupant?.nickname ?? "空闲",
          statusLabel: isSelected ? "当前是你" : occupant ? "已被选择" : "可选择",
          isSelectable: !occupantId || occupantId === rest.currentPlayerId,
          isSelected,
        };
      });

  return (
    <section className="panel" data-testid="room-country-panel" style={{ background: "rgba(10, 15, 20, 0.8)", border: "1px solid rgba(212, 175, 55, 0.25)", boxShadow: "0 24px 48px rgba(0,0,0,0.6), inset 0 0 60px rgba(0,0,0,0.5)" }}>
      <p className="panel__eyebrow" style={{ color: "#fceb9c", letterSpacing: "0.2em" }}>第 1 步</p>
      <h2 style={{ fontFamily: "var(--font-serif)", fontSize: 28, margin: "12px 0 16px", color: "var(--color-accent-strong)" }}>选择你的国家</h2>
      <p style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: 14, lineHeight: 1.6 }}>先在这里锁定你本局代表的国家。只有选好国家后，你才可以点准备并进入自动开局等待。</p>

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gap: 12,
        }}
      >
        {slots.map((slot) => {
          return (
            <button
              aria-label={`${slot.label} ${slot.statusLabel}`}
              data-testid={`room-country-${slot.country}`}
              disabled={isBusy || !slot.isSelectable}
              key={slot.country}
              onClick={() => onSelectCountry(slot.country)}
              style={{
                ...buttonStyle,
                border: slot.isSelected ? "1px solid rgba(212, 175, 55, 0.8)" : (slot.isSelectable ? buttonStyle.border : "1px solid rgba(255, 0, 0, 0.1)"),
                background: slot.isSelected ? "linear-gradient(135deg, rgba(212, 175, 55, 0.3) 0%, rgba(26, 32, 44, 0.8) 100%)" : (slot.isSelectable ? buttonStyle.background : "rgba(30, 20, 20, 0.4)"),
                boxShadow: slot.isSelected ? "inset 0 0 20px rgba(212, 175, 55, 0.2), 0 8px 16px rgba(0,0,0,0.5)" : "none",
                opacity: slot.isSelectable ? 1 : 0.4,
                transform: slot.isSelected ? "translateY(-2px) scale(1.01)" : "none",
              }}
              type="button"
            >
              <div>
                <strong style={{ fontSize: 22, fontFamily: "var(--font-serif)", color: slot.isSelected ? "#fceb9c" : "var(--color-text)", letterSpacing: "0.1em", textShadow: slot.isSelected ? "0 0 10px rgba(212, 175, 55, 0.5)" : "none" }}>{slot.label}</strong>
                <div style={{ marginTop: 8, color: "var(--color-text-muted)", fontSize: 13, letterSpacing: "0.05em" }}>当前占位：<span style={{ color: slot.isSelected ? "#fff" : "inherit" }}>{slot.occupantLabel}</span></div>
              </div>
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "center",
                padding: "8px 12px", 
                borderRadius: 8, 
                background: slot.isSelected ? "rgba(131, 196, 138, 0.2)" : (slot.isSelectable ? "rgba(255, 255, 255, 0.05)" : "rgba(240, 138, 113, 0.1)"),
                fontSize: 12, 
                textTransform: "uppercase", 
                letterSpacing: "0.1em", 
                color: slot.isSelected ? "#d9f0db" : (slot.isSelectable ? "rgba(255,255,255,0.6)" : "var(--color-error)") 
              }}>
                {slot.statusLabel}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

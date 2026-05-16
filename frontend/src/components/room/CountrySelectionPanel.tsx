import { useTranslation } from "react-i18next";
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

export function CountrySelectionPanel({
  isBusy,
  onSelectCountry,
  ...rest
}: CountrySelectionPanelProps) {
  const { t } = useTranslation("room");
  const slots = "slots" in rest
    ? rest.slots
    : Object.entries(rest.room.countrySlots).map(([country, occupantId]) => {
        const occupant = rest.room.members.find((member) => member.playerId === occupantId) ?? null;
        const isSelected = rest.room.members.find((member) => member.playerId === rest.currentPlayerId)?.selectedCountry === country;

        return {
          country: country as CountryCode,
          label: getCountryLabel(country as CountryCode),
          occupantLabel: occupant?.nickname ?? t("members.empty"),
          statusLabel: isSelected ? t("members.you") : occupant ? t("countrySelection.taken") : t("countrySelection.title"),
          isSelectable: !occupantId || occupantId === rest.currentPlayerId,
          isSelected,
        };
      });

  return (
    <section className="room-panel room-country-panel" data-testid="room-country-panel">
      <div className="room-country-panel__head">
        <div>
          <p className="room-panel__eyebrow">{t("eyebrow")}</p>
          <h2 className="room-panel__title">{t("countrySelection.title")}</h2>
        </div>
        <p className="room-panel__body">{t("status.waiting")}</p>
      </div>

      <div className="room-country-grid">
        {slots.map((slot) => {
          return (
            <button
              aria-label={`${slot.label} ${slot.statusLabel}`}
              className={`room-country-card${slot.isSelected ? " room-country-card--selected" : ""}`}
              data-country={slot.country}
              data-testid={`room-country-${slot.country}`}
              disabled={isBusy || !slot.isSelectable}
              key={slot.country}
              onClick={() => onSelectCountry(slot.country)}
              type="button"
            >
              <div>
                <span className="room-country-card__kicker">{t("countrySelection.title")}</span>
                <strong className="room-country-card__name">{slot.label}</strong>
                <div className="room-country-card__occupant">{slot.occupantLabel}</div>
              </div>
              <span className="room-country-card__badge">
                {slot.statusLabel}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

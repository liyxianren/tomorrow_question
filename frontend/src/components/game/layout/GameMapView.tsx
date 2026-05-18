import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { MapBuilding } from "../map/MapBuilding";
import { GameMapModal } from "../map/GameMapModal";
import "../map/GameMap.css";
import type { MapBuildingDef } from "../../../features/game/flow/useMapViewState";

type GameMapViewProps = {
  situationBar: ReactNode;
  buildings: MapBuildingDef[];
  activeModalId: string | null;
  modalTitle: string;
  modalVariant?: string | null;
  modalContent: ReactNode | null;
  mapImage: string;
  onBuildingClick: (id: string) => void;
  onModalClose: () => void;
  bottomDock: ReactNode;
  inlineContent?: ReactNode;
  showBackLink?: boolean;
};

export function GameMapView({
  situationBar,
  buildings,
  activeModalId,
  modalTitle,
  modalVariant,
  modalContent,
  mapImage,
  onBuildingClick,
  onModalClose,
  bottomDock,
  inlineContent,
  showBackLink = true,
}: GameMapViewProps) {
  const { t } = useTranslation();
  return (
    <div className="game-map-view" data-testid="game-map-view">
      <aside className="game-map-sidebar">
        {showBackLink ? (
          <Link className="game-map-sidebar__back" to="/lobby">{t("common:backToLobby")}</Link>
        ) : null}
        <div className="game-map-sidebar__info">
          {situationBar}
        </div>
        <div className="game-map-sidebar__spacer" />
        <div className="game-map-sidebar__action">
          {bottomDock}
        </div>
      </aside>

      <div className="game-map-canvas">
        <div className="game-map-canvas__backdrop">
          <img src={mapImage} alt="Map" className="game-map-canvas__image" />
          <div className="game-map-canvas__overlay" />
        </div>

        {buildings.map((building) => (
          <MapBuilding
            key={building.id}
            id={building.id}
            isActive={activeModalId === building.id}
            label={building.label}
            metric={building.metric}
            onClick={() => onBuildingClick(building.id)}
            subtitle={building.subtitle}
            x={building.x}
            y={building.y}
          />
        ))}

        {inlineContent ? (
          <div className="game-map-canvas__inline">
            {inlineContent}
          </div>
        ) : null}
      </div>

      <GameMapModal
        isOpen={!!activeModalId && !!modalContent}
        onClose={onModalClose}
        resetKey={modalVariant ?? activeModalId}
        title={modalTitle}
        variant={modalVariant ?? activeModalId}
      >
        {modalContent}
      </GameMapModal>
    </div>
  );
}

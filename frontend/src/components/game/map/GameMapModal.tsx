import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

type GameMapModalProps = {
  isOpen: boolean;
  title: string;
  variant?: string | null;
  resetKey?: string | null;
  onClose: () => void;
  children: ReactNode;
};

export function GameMapModal({ isOpen, title, variant, resetKey, onClose, children }: GameMapModalProps) {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    bodyRef.current?.scrollTo?.({ top: 0 });
  }, [isOpen, resetKey]);

  if (!isOpen) return null;

  return (
    <div className="game-map-modal" onClick={onClose} data-testid="map-modal">
      <div
        className={[
          "game-map-modal__panel",
          variant ? `game-map-modal__panel--${variant}` : null,
        ].filter(Boolean).join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="game-map-modal__header">
          <h2 className="game-map-modal__title">{title}</h2>
          <button className="game-map-modal__close" onClick={onClose} type="button" aria-label={t("common:close")}>
            ✕
          </button>
        </div>
        <div className="game-map-modal__body" ref={bodyRef}>
          {children}
        </div>
      </div>
    </div>
  );
}

import { useEffect, type ReactNode } from "react";

type GameMapModalProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function GameMapModal({ isOpen, title, onClose, children }: GameMapModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="game-map-modal" onClick={onClose} data-testid="map-modal">
      <div
        className="game-map-modal__panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="game-map-modal__header">
          <h2 className="game-map-modal__title">{title}</h2>
          <button className="game-map-modal__close" onClick={onClose} type="button" aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="game-map-modal__body">
          {children}
        </div>
      </div>
    </div>
  );
}

type MapBuildingProps = {
  id: string;
  label: string;
  subtitle: string;
  metric: string;
  isActive?: boolean;
  x?: number;
  y?: number;
  onClick: () => void;
};

export function MapBuilding({
  id,
  label,
  subtitle,
  metric,
  isActive = false,
  x = 50,
  y = 50,
  onClick,
}: MapBuildingProps) {
  const className = [
    "game-map-building",
    `game-map-building--${id}`,
    isActive ? "game-map-building--active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      data-testid={`map-building-${id}`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <button
        className="game-map-building__pin"
        onClick={onClick}
        type="button"
        aria-label={label}
      >
        <span className="game-map-building__ping" />
        <span className="game-map-building__dot" />
      </button>

      <div className="game-map-building__tooltip" onClick={onClick}>
        <span className="game-map-building__label">{label}</span>
        <span className="game-map-building__subtitle">{subtitle}</span>
        <span className="game-map-building__metric">{metric}</span>
      </div>
    </div>
  );
}


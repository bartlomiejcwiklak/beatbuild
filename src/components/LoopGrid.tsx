interface LoopGridProps {
  buttonMap: string;
  activeButtons: boolean[];
  onToggle: (index: number) => void;
}

const GRID_SIZE = 4;

export default function LoopGrid({ buttonMap, activeButtons, onToggle }: LoopGridProps) {
  return (
    <div className="loop-grid">
      {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, index) => {
        const x = (index % GRID_SIZE) * (100 / (GRID_SIZE - 1));
        const y = Math.floor(index / GRID_SIZE) * (100 / (GRID_SIZE - 1));

        return (
          <button
            key={index}
            className={`loop-pad ${activeButtons[index] ? "active" : ""}`}
            onClick={() => onToggle(index)}
            aria-label={`Toggle loop ${index + 1}`}
            style={{
              backgroundImage: `url("${buttonMap}")`,
              backgroundSize: `${GRID_SIZE * 100}% ${GRID_SIZE * 100}%`,
              backgroundPosition: `${x}% ${y}%`
            }}
          />
        );
      })}
    </div>
  );
}


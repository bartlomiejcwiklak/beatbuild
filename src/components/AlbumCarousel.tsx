import { CSSProperties, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AlbumPreset } from "../types";

interface AlbumCarouselProps {
  albums: AlbumPreset[];
  selectedIndex: number;
  onSelect: (delta: number) => void;
}

interface DragState {
  dragging: boolean;
  startX: number;
  startRotation: number;
  lastX: number;
  lastTime: number;
  velocity: number;
}

export default function AlbumCarousel({ albums, selectedIndex, onSelect }: AlbumCarouselProps) {
  const [rotationY, setRotationY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [transitionClass, setTransitionClass] = useState("");
  const dragStateRef = useRef<DragState>({
    dragging: false,
    startX: 0,
    startRotation: 0,
    lastX: 0,
    lastTime: 0,
    velocity: 0
  });
  const inertiaFrameRef = useRef<number | null>(null);
  const arrowTimersRef = useRef<number[]>([]);
  const isArrowTransitionRef = useRef(false);
  const rotationRef = useRef(0);

  const current = albums[selectedIndex];
  const prev = albums[(selectedIndex - 1 + albums.length) % albums.length];
  const next = albums[(selectedIndex + 1) % albums.length];

  useEffect(() => {
    rotationRef.current = rotationY;
  }, [rotationY]);

  useEffect(() => {
    setRotationY(0);
    rotationRef.current = 0;
  }, [selectedIndex]);

  useEffect(
    () => () => {
      if (inertiaFrameRef.current) {
        cancelAnimationFrame(inertiaFrameRef.current);
      }
      arrowTimersRef.current.forEach((timer) => clearTimeout(timer));
    },
    []
  );

  const angle = ((rotationY % 360) + 360) % 360;
  const glintPeak = 26;
  const angularDistance = Math.abs((((angle - glintPeak + 540) % 360) - 180));
  const glintStrength = Math.max(0.12, 1 - angularDistance / 65);

  const cdStyle = useMemo(
    () =>
      ({
        transform: `rotateY(${rotationY}deg)`,
        transition: isDragging ? "none" : "transform 180ms ease-out",
        "--glint-opacity": (0.08 + glintStrength * 0.62).toFixed(3),
        "--glint-shift": `${(angle / 360) * 70}%`
      }) as CSSProperties,
    [rotationY, isDragging, angle, glintStrength]
  );

  const stopInertia = () => {
    if (inertiaFrameRef.current) {
      cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
  };

  const startDrag = (clientX: number) => {
    stopInertia();
    const now = performance.now();
    dragStateRef.current = {
      dragging: true,
      startX: clientX,
      startRotation: rotationRef.current,
      lastX: clientX,
      lastTime: now,
      velocity: 0
    };
    setIsDragging(true);
  };

  const moveDrag = (clientX: number) => {
    const state = dragStateRef.current;
    if (!state.dragging) {
      return;
    }

    const delta = clientX - state.startX;
    const nextRotation = state.startRotation + delta * 0.55;
    setRotationY(nextRotation);
    rotationRef.current = nextRotation;

    const now = performance.now();
    const dt = Math.max(8, now - state.lastTime);
    const dx = clientX - state.lastX;
    const instantaneousVelocity = (dx / dt) * 0.55;
    state.velocity = state.velocity * 0.72 + instantaneousVelocity * 0.28;
    state.lastX = clientX;
    state.lastTime = now;
  };

  const endDrag = () => {
    if (!dragStateRef.current.dragging) {
      return;
    }

    dragStateRef.current.dragging = false;
    setIsDragging(false);

    const state = dragStateRef.current;
    let velocity = Math.max(-1.35, Math.min(1.35, state.velocity));
    let momentumRotation = rotationRef.current;
    let lastTime = performance.now();

    if (Math.abs(velocity) < 0.03) {
      return;
    }

    const friction = 0.92;
    const step = (now: number) => {
      const dtFactor = (now - lastTime) / 16.666;
      lastTime = now;

      momentumRotation += velocity * 16.666 * dtFactor;
      setRotationY(momentumRotation);
      rotationRef.current = momentumRotation;

      velocity *= Math.pow(friction, dtFactor);
      if (Math.abs(velocity) < 0.012) {
        inertiaFrameRef.current = null;
        return;
      }

      inertiaFrameRef.current = requestAnimationFrame(step);
    };

    inertiaFrameRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => moveDrag(event.clientX);
    const onPointerUp = () => endDrag();

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isArrowTransitionRef.current) {
      return;
    }
    startDrag(event.clientX);
  };

  const handleArrow = (direction: number) => {
    if (isArrowTransitionRef.current) {
      return;
    }

    stopInertia();
    isArrowTransitionRef.current = true;
    setIsDragging(false);
    setTransitionClass(direction > 0 ? "album-transition-out-right" : "album-transition-out-left");

    const outTimer = window.setTimeout(() => {
      onSelect(direction);
      setRotationY(0);
      rotationRef.current = 0;
      setTransitionClass(direction > 0 ? "album-transition-in-right" : "album-transition-in-left");
    }, 180);

    const inTimer = window.setTimeout(() => {
      setTransitionClass("");
      isArrowTransitionRef.current = false;
    }, 430);

    arrowTimersRef.current.push(outTimer, inTimer);
  };

  return (
    <div className="album-picker">
      <button className="arrow-btn" onClick={() => handleArrow(-1)} aria-label="Previous album">
        ◀
      </button>

      <div className="carousel-stage">
        <div className="album-side album-side-left">
          <img src={prev.coverFront} alt={`${prev.title} preview`} />
        </div>

        <div
          className={`album-center ${isDragging ? "is-dragging" : ""}`}
          onPointerDown={handlePointerDown}
          role="button"
          tabIndex={0}
          aria-label="Rotate album case"
        >
          <div className={`jewel-case ${transitionClass}`} style={cdStyle}>
            <div className="case-face case-front">
              <img src={current.coverFront} alt={`${current.title} front cover`} />
            </div>
            <div className="case-face case-back">
              <img src={current.coverBack} alt={`${current.title} back cover`} />
            </div>
            <div className="case-side case-spine-left" />
            <div className="case-side case-edge-right" />
            <div className="case-side case-edge-top" />
            <div className="case-side case-edge-bottom" />
            <div className="case-overlay case-overlay-front" />
            <div className="case-overlay case-overlay-back" />
            <div className="case-gloss" />
          </div>
        </div>

        <div className="album-side album-side-right">
          <img src={next.coverFront} alt={`${next.title} preview`} />
        </div>
      </div>

      <button className="arrow-btn" onClick={() => handleArrow(1)} aria-label="Next album">
        ▶
      </button>
    </div>
  );
}


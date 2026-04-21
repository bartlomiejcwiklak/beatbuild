import { CSSProperties, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { AlbumPreset } from "../types";

interface AlbumCarouselProps {
  albums: AlbumPreset[];
  selectedIndex: number;
  onSelect: (delta: number) => void;
}

export default function AlbumCarousel({ albums, selectedIndex, onSelect }: AlbumCarouselProps) {
  const [rotationY, setRotationY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [transitionClass, setTransitionClass] = useState("");
  const arrowTimersRef = useRef<number[]>([]);
  const isArrowTransitionRef = useRef(false);
  const rotationRef = useRef(0);
  const dragRef = useRef({
    dragging: false,
    startX: 0,
    startRotation: 0
  });

  const current = albums[selectedIndex];
  const prev = albums[(selectedIndex - 1 + albums.length) % albums.length];
  const next = albums[(selectedIndex + 1) % albums.length];

  useEffect(() => {
    const snapRotation = Math.round(rotationRef.current / 360) * 360;
    setRotationY(snapRotation);
    rotationRef.current = snapRotation;
  }, [selectedIndex]);

  useEffect(() => {
    rotationRef.current = rotationY;
  }, [rotationY]);

  useEffect(
    () => () => {
      arrowTimersRef.current.forEach((timer) => clearTimeout(timer));
    },
    []
  );

  const cardStyle = useMemo(
    () =>
      ({
        transform: `rotateX(12deg) rotateY(${rotationY - 24}deg)`,
        transition: isDragging ? "none" : "transform 140ms ease-out"
      }) as CSSProperties,
    [isDragging, rotationY]
  );

  const startDrag = (clientX: number) => {
    dragRef.current = {
      dragging: true,
      startX: clientX,
      startRotation: rotationRef.current
    };
    setIsDragging(true);
  };

  const moveDrag = (clientX: number) => {
    if (!dragRef.current.dragging) {
      return;
    }
    const delta = clientX - dragRef.current.startX;
    setRotationY(dragRef.current.startRotation + delta * 0.45);
  };

  const endDrag = () => {
    if (!dragRef.current.dragging) {
      return;
    }
    dragRef.current.dragging = false;
    setIsDragging(false);
  };

  useEffect(() => {
    const onPointerMove = (event: globalThis.PointerEvent) => moveDrag(event.clientX);
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
    event.preventDefault();
    startDrag(event.clientX);
  };

  const handleArrow = (direction: number) => {
    if (isArrowTransitionRef.current) {
      return;
    }

    isArrowTransitionRef.current = true;
    setTransitionClass(direction > 0 ? "album-transition-out-right" : "album-transition-out-left");

    const outTimer = window.setTimeout(() => {
      onSelect(direction);
      const snapRotation = Math.round(rotationRef.current / 360) * 360;
      setRotationY(snapRotation);
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
        <div
          className="album-side album-side-left"
          onClick={() => handleArrow(-1)}
          role="button"
          tabIndex={0}
          aria-label="Previous album"
        >
          <img src={prev.coverFront} alt={`${prev.title} preview`} draggable={false} />
        </div>

        <div
          className={`album-center ${isDragging ? "is-dragging" : ""}`}
          onPointerDown={handlePointerDown}
          role="button"
          tabIndex={0}
          aria-label="Rotate album cover"
        >
          <div className={`album-hero ${transitionClass}`} aria-label={`${current.title} cover`}>
            <div className="album-hero-main" style={cardStyle}>
              <div className="album-hero-face album-hero-front">
                <img src={current.coverFront} alt={`${current.title} front cover`} draggable={false} />
              </div>
              <div className="album-hero-face album-hero-back">
                <img src={current.coverBack} alt={`${current.title} back cover`} draggable={false} />
              </div>
              <div className="album-hero-face album-hero-left">
                {current.spine && <img src={current.spine} alt={`${current.title} left spine`} draggable={false} />}
              </div>
              <div className="album-hero-face album-hero-right"></div>
              <div className="album-hero-face album-hero-top"></div>
              <div className="album-hero-face album-hero-bottom"></div>
            </div>
          </div>
        </div>

        <div
          className="album-side album-side-right"
          onClick={() => handleArrow(1)}
          role="button"
          tabIndex={0}
          aria-label="Next album"
        >
          <img src={next.coverFront} alt={`${next.title} preview`} draggable={false} />
        </div>
      </div>

      <button className="arrow-btn" onClick={() => handleArrow(1)} aria-label="Next album">
        ▶
      </button>
    </div>
  );
}


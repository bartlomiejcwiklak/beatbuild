import { useEffect, useMemo, useRef, useState } from "react";
import AlbumCarousel from "./components/AlbumCarousel";
import LoopGrid from "./components/LoopGrid";
import { createLoopEngine } from "./audio/loopEngine";

const LOOP_COUNT = 16;

const normalizePreset = (preset) => {
  const folderPath = `/musicassets/${preset.folder}`;
  const loops = preset.loops.map((loopName) => `${folderPath}/${loopName}`);

  return {
    ...preset,
    coverFront: `${folderPath}/${preset.coverFront}`,
    coverBack: `${folderPath}/${preset.coverBack}`,
    buttonMap: `${folderPath}/${preset.buttonMap}`,
    loops
  };
};

export default function App() {
  const engineRef = useRef(createLoopEngine());
  const [screen, setScreen] = useState("menu");
  const [albums, setAlbums] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeButtons, setActiveButtons] = useState(new Array(LOOP_COUNT).fill(false));
  const [isPlaying, setIsPlaying] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadAlbums = async () => {
      try {
        const response = await fetch("/musicassets/albums.json");
        if (!response.ok) {
          throw new Error("Could not load album manifest.");
        }

        const manifest = await response.json();
        if (!Array.isArray(manifest) || manifest.length === 0) {
          throw new Error("Album manifest is empty.");
        }

        if (mounted) {
          setAlbums(manifest.map(normalizePreset));
        }
      } catch (error) {
        if (mounted) {
          setLoadError(error.message);
        }
      }
    };

    loadAlbums();

    return () => {
      mounted = false;
      engineRef.current.destroy();
    };
  }, []);

  const selectedAlbum = useMemo(() => albums[selectedIndex], [albums, selectedIndex]);

  const shiftAlbum = (delta) => {
    setSelectedIndex((current) => (current + delta + albums.length) % albums.length);
  };

  const handleStart = async () => {
    if (!selectedAlbum) {
      return;
    }

    await engineRef.current.loadPreset(selectedAlbum);
    await engineRef.current.start();

    setIsPlaying(true);
    setActiveButtons(new Array(LOOP_COUNT).fill(false));
    setScreen("player");
  };

  const handleToggleButton = (index) => {
    setActiveButtons((previous) => {
      const next = [...previous];
      next[index] = !next[index];
      engineRef.current.setActive(index, next[index]);
      return next;
    });
  };

  const handlePauseToggle = async () => {
    const next = !isPlaying;
    await engineRef.current.setPlaying(next);
    setIsPlaying(next);
  };

  const handleBackToMenu = async () => {
    await engineRef.current.setPlaying(false);
    engineRef.current.destroy();
    setActiveButtons(new Array(LOOP_COUNT).fill(false));
    setIsPlaying(true);
    setScreen("menu");
  };

  if (loadError) {
    return (
      <main className="app-shell">
        <p className="error-message">{loadError}</p>
        <p className="error-hint">Check `public/musicassets/albums.json` and preset folders.</p>
      </main>
    );
  }

  if (!albums.length) {
    return (
      <main className="app-shell">
        <p>Loading albums...</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      {screen === "menu" ? (
        <section className="menu-screen">
          <h1 className="logo">BeatBuild</h1>
          <AlbumCarousel albums={albums} selectedIndex={selectedIndex} onSelect={shiftAlbum} />
          <h2 className="album-title">{selectedAlbum.title}</h2>
          <button className="primary-btn" onClick={handleStart}>
            Start
          </button>
        </section>
      ) : (
        <section className="player-screen">
          <header className="player-header">
            <button className="secondary-btn" onClick={handleBackToMenu}>
              Back
            </button>
            <h2>{selectedAlbum.title}</h2>
            <button className="secondary-btn" onClick={handlePauseToggle}>
              {isPlaying ? "Pause" : "Play"}
            </button>
          </header>
          <LoopGrid
            buttonMap={selectedAlbum.buttonMap}
            activeButtons={activeButtons}
            onToggle={handleToggleButton}
          />
        </section>
      )}
    </main>
  );
}

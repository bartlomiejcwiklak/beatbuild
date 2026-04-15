import { useEffect, useMemo, useRef, useState } from "react";
import AlbumCarousel from "./components/AlbumCarousel";
import LoopGrid from "./components/LoopGrid";
import { createLoopEngine } from "./audio/loopEngine";

const LOOP_COUNT = 16;
const BASE_URL = import.meta.env.BASE_URL;
const MAIN_LOGO_SRC =
  "file:///C:/Users/bartl/.cursor/projects/c-Users-bartl-Desktop-beatbuild/assets/c__Users_bartl_AppData_Roaming_Cursor_User_workspaceStorage_27ebd4792ac6eeebbdadd4b07e0d817c_images_logo-33a587b3-07c2-4155-8b94-74ad07db858c.png";

const resolvePublicAsset = (relativePath) => `${BASE_URL}${relativePath}`;

const normalizePreset = (preset) => {
  const folderPath = resolvePublicAsset(`musicassets/${preset.folder}`);
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
  const [logoSrc, setLogoSrc] = useState(MAIN_LOGO_SRC);
  const [masterVolume, setMasterVolume] = useState(0.95);

  useEffect(() => {
    let mounted = true;

    const loadAlbums = async () => {
      try {
        const response = await fetch(resolvePublicAsset("musicassets/albums.json"));
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
    engineRef.current.setMasterVolume(masterVolume);
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

  const handleMasterVolumeChange = (event) => {
    const value = Number(event.target.value);
    setMasterVolume(value);
    engineRef.current.setMasterVolume(value);
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
          <h1 className="logo">
            <img
              className="logo-image"
              src={logoSrc}
              alt="BeatBuild"
              onError={() => setLogoSrc(resolvePublicAsset("logo.png"))}
            />
          </h1>
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
          <div className="master-volume-row">
            <label className="master-volume-label" htmlFor="master-volume">
              Master
            </label>
            <input
              id="master-volume"
              className="master-volume-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={masterVolume}
              onChange={handleMasterVolumeChange}
              aria-label="Master volume"
            />
            <span className="master-volume-value" aria-hidden="true">
              {Math.round(masterVolume * 100)}
            </span>
          </div>
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

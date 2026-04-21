import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import AlbumCarousel from "./components/AlbumCarousel";
import LoopGrid from "./components/LoopGrid";
import { createLoopEngine } from "./audio/loopEngine";
import type { AlbumManifestEntry, AlbumPreset } from "./types";

const LOOP_COUNT = 16;
const BASE_URL = import.meta.env.BASE_URL;
const MAIN_LOGO_SRC =
  "file:///C:/Users/bartl/.cursor/projects/c-Users-bartl-Desktop-beatbuild/assets/c__Users_bartl_AppData_Roaming_Cursor_User_workspaceStorage_27ebd4792ac6eeebbdadd4b07e0d817c_images_logo-33a587b3-07c2-4155-8b94-74ad07db858c.png";

const resolvePublicAsset = (relativePath: string) => `${BASE_URL}${relativePath}`;

const normalizePreset = (preset: AlbumManifestEntry): AlbumPreset => {
  const folderPath = resolvePublicAsset(`musicassets/${preset.folder}`);
  const loops = preset.loops.map((loopName) => `${folderPath}/${loopName}`);

  return {
    ...preset,
    coverFront: `${folderPath}/${preset.coverFront}`,
    coverBack: `${folderPath}/${preset.coverBack}`,
    buttonMap: `${folderPath}/${preset.buttonMap}`,
    ...(preset.spine ? { spine: `${folderPath}/${preset.spine}` } : {}),
    loops
  };
};

export default function App() {
  const engineRef = useRef(createLoopEngine());
  const [screen, setScreen] = useState<"menu" | "player">("menu");
  const [albums, setAlbums] = useState<AlbumPreset[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeButtons, setActiveButtons] = useState<boolean[]>(new Array(LOOP_COUNT).fill(false));
  const [isPlaying, setIsPlaying] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [logoSrc, setLogoSrc] = useState(MAIN_LOGO_SRC);
  const [masterVolume, setMasterVolume] = useState(0.95);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadAlbums = async () => {
      try {
        const response = await fetch(resolvePublicAsset("musicassets/albums.json"));
        if (!response.ok) {
          throw new Error("Could not load album manifest.");
        }

        const manifest: unknown = await response.json();
        if (!Array.isArray(manifest) || manifest.length === 0) {
          throw new Error("Album manifest is empty.");
        }

        if (mounted) {
          setAlbums((manifest as AlbumManifestEntry[]).map(normalizePreset));
        }
      } catch (error: unknown) {
        if (mounted) {
          setLoadError(error instanceof Error ? error.message : "Failed to load album manifest.");
        }
      }
    };

    void loadAlbums();

    return () => {
      mounted = false;
      engineRef.current.destroy();
    };
  }, []);

  const selectedAlbum = useMemo(() => albums[selectedIndex], [albums, selectedIndex]);

  const shiftAlbum = (delta: number) => {
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

  const handleToggleButton = (index: number) => {
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

  const handleMasterVolumeChange = (event: ChangeEvent<HTMLInputElement>) => {
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
          <button
            className="settings-btn icon-btn"
            type="button"
            aria-label="Open settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
          {settingsOpen ? (
            <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
              <aside className="settings-panel" role="dialog" aria-label="Project settings" onClick={(e) => e.stopPropagation()}>
                <header className="settings-header">
                  <h3 className="settings-title">Settings</h3>
                  <button className="settings-close-btn" onClick={() => setSettingsOpen(false)} aria-label="Close settings">✕</button>
                </header>
                <div className="settings-volume-row">
                  <label className="master-volume-label" htmlFor="menu-master-volume">
                    Master
                  </label>
                  <input
                    id="menu-master-volume"
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
                <p className="settings-info">
                  beatbuild is a loop-based music toy. pick a sample album and create your own beat by toggling pads.
                </p>
                <p className="settings-info">
                  made with <span className="heart">♥</span> by @ohhbaro, inspired by incredibox.
                </p>
                <a
                  href="https://github.com/bartlomiejcwiklak/beatbuild"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="github-link"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                  </svg>
                  View on GitHub
                </a>
              </aside>
            </div>
          ) : null}
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
          <LoopGrid buttonMap={selectedAlbum.buttonMap} activeButtons={activeButtons} onToggle={handleToggleButton} />
        </section>
      )}
    </main>
  );
}


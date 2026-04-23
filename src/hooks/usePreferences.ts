import { useState, useEffect } from "react";

export interface UserPreferences {
  visualizerEnabled: boolean;
  visualizerIntensity: number;
  clearPadsOnReturn: boolean;
  reduceMotion: boolean;
  showMetronome: boolean;
}

const DEFAULT_PREFS: UserPreferences = {
  visualizerEnabled: true,
  visualizerIntensity: 1.0,
  clearPadsOnReturn: true,
  reduceMotion: false,
  showMetronome: true,
};

const STORAGE_KEY = "beatbuild-prefs";

export function usePreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_PREFS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error("Failed to load preferences", e);
    }
    return DEFAULT_PREFS;
  });

  const updatePreference = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error("Failed to save preferences", e);
      }
      return next;
    });
  };

  return { preferences, updatePreference };
}

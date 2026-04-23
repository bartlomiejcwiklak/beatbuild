export interface AlbumPreset {
  id: string;
  title: string;
  folder: string;
  coverFront: string;
  coverBack: string;
  buttonMap: string;
  spine?: string;
  themeHue: number;
  themeSaturation: number;
  bpm: number;
  isNew?: boolean;
  loops: string[];
}

export type AlbumManifestEntry = AlbumPreset;


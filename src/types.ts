export interface SidechainConfig {
  triggerIndices: number[];
  targetIndices: number[];
}

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
  sidechain?: SidechainConfig;
}

export type AlbumManifestEntry = AlbumPreset;


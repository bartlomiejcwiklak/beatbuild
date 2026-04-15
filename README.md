# BeatBuild

An Incredibox-inspired music loop composer built with Vite + React.

## Run

1. Install Node.js (includes `npm`) if needed.
2. Install dependencies:
   - `npm install`
3. Start the dev server:
   - `npm run dev`

## Asset pipeline

All music presets live in `public/musicassets`.

- Add a folder per preset (`dance1`, `dance2`, etc.)
- Place these files in each folder:
  - `cover-front.jpeg`
  - `cover-back.jpeg`
  - `button-map.jpeg`
  - `loop01.mp3` ... `loop16.mp3`
- Register each preset in `public/musicassets/albums.json`

The button map uses a 4x4 split:
- top-left tile -> button 1
- top-right tile of first row -> button 4
- ...
- bottom-right tile -> button 16

## Behavior

- Menu screen with album picker and rotatable 3D CD box
- Previous/next album previews fade in/out on the sides
- Player screen with 16 toggle pads in a 4x4 grid
- Loops are started in sync, then toggled via mute/unmute
- Global pause/play stops and resumes the full transport

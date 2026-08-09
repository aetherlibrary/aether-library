# UI art assets

Runtime art for the Classic Library UI. All artwork is an independent,
replaceable asset: swapping a file here reskins the app without touching code.
Never edit production art in place — replace the file.

## Expected files

- `classic_library_bg.png` — the library scene (4:3, 1440×1080). Final
  production art, provided by the artist. Used as the main library panel
  image and, under a warm parchment wash, as the start menu backdrop.
  The app falls back to a plain parchment stage while it is missing.

- `book.png` — the interactive open book on the council table. A horizontal
  2-frame sprite sheet, 40×30 px per frame (80×30 total): frame 1 resting,
  frame 2 page mid-flip (shown while hovered). Placeholder art; an artist can
  replace the file with any sheet of the same frame layout.

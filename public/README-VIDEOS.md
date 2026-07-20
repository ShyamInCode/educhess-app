# Where to put your media files

Drop these files directly into this `public/` folder (same level as this note):

## Videos
- `homepage.mp4` — plays in the hero section on the Home page
- `chess.mp4` — plays at the top of the Chess curriculum page
- `maths.mp4` — plays at the top of the Maths curriculum page
- `english.mp4` — plays at the top of the English curriculum page
- `coding.mp4` — plays at the top of the Coding curriculum page
- `finance.mp4` — plays at the top of the Financial Literacy curriculum page

## Images
- `educhess_title.png` — the EduChess wordmark/logo shown in the navbar in place of the text brand name
- `educhess_logo.png` — the site favicon (browser tab icon), referenced from `index.html`

Both image files should be PNGs (`image/png`).

Vite serves everything in `public/` from the site root, so `public/homepage.mp4`
becomes reachable at `/homepage.mp4`, `public/educhess_title.png` becomes
reachable at `/educhess_title.png`, etc. — which is exactly what `src/App.jsx`
and `index.html` reference.
No code changes needed once the files are in place; just `npm run dev` (or rebuild) after adding them.

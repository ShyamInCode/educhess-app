# EduChess — "Learn Through Chess" Prototype

A luxury, single-page EdTech prototype built with React + Tailwind CSS.

## Run it locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Build for production

```bash
npm run build
npm run preview
```

## Videos

The app expects three video files in `public/` (Vite serves this folder from the
site root): `homepage.mp4`, `maths.mp4`, `english.mp4`. See `public/README-VIDEOS.md`
for details. Until they're added, the video players will simply show as empty —
everything else in the app works fine without them.

## Structure

- `src/App.jsx` — the entire application (navbar, homepage quest, subjects,
  curriculum accordions, quiz widget, pricing, resources, contact form).
- `src/main.jsx` — React entry point.
- `src/index.css` — Tailwind directives.
- `tailwind.config.js` / `postcss.config.js` — Tailwind setup.

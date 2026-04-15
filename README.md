# ARM Online

**Auto Replay Music Online** — A browser-based music player with a 3D coverflow interface, dynamic album-art theming, and a full playback UI. Built entirely with vanilla HTML, CSS, and JavaScript — no frameworks, no bundlers.

---

## Overview

ARM Online is a front-end portfolio project that recreates the feel of a native music app in the browser. The UI centers around an interactive 3D carousel (coverflow) where you can browse albums, select tracks, and control playback — all without a single npm install.

---

## Features

- **3D Coverflow Gallery** — Physics-based carousel with momentum scrolling, drag support (mouse + touch), and smooth `requestAnimationFrame` animation
- **Dynamic Theming** — Album art is sampled on the client via `<canvas>` to extract a color palette; the background gradient and text contrast update in real time as you browse
- **Full Playback Controls** — Play / Pause, Previous, Next, seekable progress bar, current time and duration display
- **Search** — Live search across all albums and tracks with a floating results panel
- **Login Screen** — Credential gate with session-based greeting and logout
- **Mock Audio Engine** — A custom `MockAudioPlayer` class that mirrors the `HTMLAudioElement` API exactly (`play()`, `pause()`, `load()`, `currentTime`, `duration`, events: `timeupdate`, `loadedmetadata`, `ended`) so the entire player UI works without real audio files on disk
- **Data-driven** — Album catalog is loaded at runtime from a single `data/albums.json` file; adding a new album requires only a JSON entry and a `cover.jpg`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 (semantic, ARIA-labelled) |
| Styles | CSS3 — custom properties, `backdrop-filter`, `perspective`, `transform3d`, `clip-path` |
| Logic | ES6+ Vanilla JavaScript — classes, async/await, `EventTarget`, `Canvas API`, `requestAnimationFrame` |
| Data | JSON (static file, fetched at runtime) |
| Audio | `MockAudioPlayer` (custom class, no external dependency) |
| Build | None — zero dependencies, zero bundler |

---

## Project Structure

```
ARM ONLINE 1.0/
├── index.html              # App entry point
├── css/
│   └── styles.css          # All styles — layout, coverflow, player, theming
├── js/
│   ├── audio-service.js    # MockAudioPlayer — simulates HTMLAudioElement
│   └── app.js              # Application logic (~800 lines)
├── data/
│   └── albums.json         # Album + track catalog
├── img/
│   └── logo.png
└── music/
    ├── mbdtf/cover.jpg
    ├── tpab/cover.jpg
    ├── meteora/cover.jpg
    ├── mcla/cover.jpg
    ├── hangover/cover.jpg
    └── futurenostalgia/cover.jpg
```

---

## How It Works

### 3D Coverflow
Each album card is absolutely positioned on a track. Every frame, `renderCoverflow()` calculates each card's `translate3d`, `rotateY`, `scale`, and `opacity` based on its distance from the current float index. A `coverflowLoop()` running on `requestAnimationFrame` handles inertia, pointer drag velocity, and smooth settling to the nearest album.

### Dynamic Background
When an album is selected, its cover image is drawn onto a hidden `<canvas>`. The pixel data is sampled to compute a dominant color palette. CSS custom properties (`--bg-dark`, `--bg-bright`) are updated live, and text color is flipped between dark and light based on the computed luminance.

### Mock Audio Player
`MockAudioPlayer extends EventTarget` and exposes the exact same API surface as `HTMLAudioElement`. `play()` returns a resolved `Promise`, `load()` fires `loadedmetadata` after a 50ms timeout with a randomly simulated duration (3:00 – 5:30), and an `setInterval` ticker advances `currentTime` every 250ms and dispatches `timeupdate` until the track ends.

---

## Album Catalog

| Album | Artist | Year | Genre | Tracks |
|---|---|---|---|---|
| My Beautiful Dark Twisted Fantasy | Kanye West | 2010 | Hip-Hop | 13 |
| To Pimp A Butterfly | Kendrick Lamar | 2015 | Hip-Hop | 16 |
| Meteora | Linkin Park | 2003 | Rock | 13 |
| Midnight Club: Los Angeles OST | Rockstar Games | 2008 | Electronic | 16 |
| Future Nostalgia | Dua Lipa | 2020 | Pop | 8 |
| Hangover | Orishi | — | — | 1 |

---

## Running Locally

No installation required. Open `index.html` directly in a browser, or serve the folder with any static server:

```bash
npx serve .
# or
python -m http.server
```

> **Note:** The app uses `fetch()` to load `data/albums.json`, so it needs to be served over HTTP — opening the file directly with `file://` will block the request in most browsers.

---

## Screenshots

> *(Add screenshots here)*

---

## License

This project is for portfolio and educational purposes. Album artwork belongs to their respective rights holders and is used here solely as UI demonstration assets.

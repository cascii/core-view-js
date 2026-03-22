# @cascii/core-view

TypeScript library for loading, animating, and rendering ASCII art frames. Provides the core engine behind cascii viewers — handling frame parsing, playback control, font sizing, and canvas rendering.

## Install

```bash
npm install @cascii/core-view
```

## Quick start

```ts
import {FramePlayer, LoopMode} from '@cascii/core-view';

const player = new FramePlayer(30);
player.getController().setLoopMode(LoopMode.Loop);

// Load frames from URLs
await player.loadFromUrls(['/frames/frame_001.txt', '/frames/frame_002.txt']);

// Auto-fit font size to a container
player.fitToContainer(containerWidth, containerHeight);

// Play and tick
player.play();
setInterval(() => {
  if (player.tick()) {
    const text = player.currentText();
    // render text to DOM or canvas
  }
}, player.intervalMs());
```

## Modules

### Data types (`data.ts`)

- **`Frame`** — A single frame with text content and optional color data (`.cframe`)
- **`CFrameData`** — Parsed `.cframe` binary: width x height grid of characters with per-pixel RGB
- **`FrameFile`** — File metadata with path, name, and extracted frame index

### Animation (`animation.ts`)

- **`AnimationController`** — Playback state machine with play/pause/stop, loop modes (`Once`, `Loop`), range playback, seeking, and frame stepping
- **`AnimationState`** — `Stopped`, `Playing`, `Finished`

### Parser (`parser.ts`)

- **`parseCframe(data: Uint8Array)`** — Parse `.cframe` binary format (8-byte header + width*height*4 body)
- **`parseCframeText(data: Uint8Array)`** — Extract plain text from `.cframe` data

### Color (`color.ts`)

- **`parseColor(s: string)`** — Parse named colors (14 built-in) and hex (`#RGB`, `#RRGGBB`)
- **`FrameColors`** — Foreground/background color pair with CSS output

### Sizing (`sizing.ts`)

- **`FontSizing`** — Calculate optimal font size to fit N columns x M rows into a container, with configurable char-width and line-height ratios
- **`charPosition(col, row, fontSize)`** — Pixel position of a character in the grid

### Rendering (`render.ts`)

- **`renderCframe(cframe, config)`** — Batch consecutive same-color characters into `TextBatch` objects for efficient drawing
- **`renderToCanvas` / `renderToOffscreenCanvas`** — Draw colored frames to HTML canvas
- **`renderTextToCanvas`** — Draw plain text frames to canvas
- **`FrameCanvasCache`** — Cache pre-rendered canvases with font-size-aware invalidation

### Loader (`loader.ts`)

Two-phase loading for progressive display:

1. **Text phase** — Load `.txt` frames (fast, enables immediate playback)
2. **Color phase** — Load `.cframe` binaries (background, enables colored rendering)

- **`FrameDataProvider`** — Interface for platform-agnostic I/O (`getFrameFiles`, `readFrameText`, `readCframeBytes`)
- **`LoadingProgress`** / **`FrameLoaderState`** — Track loading state and progress

### Player (`player.ts`)

- **`FramePlayer`** — High-level orchestrator combining animation, sizing, rendering, and caching
  - `load(provider, directory)` — Load via a `FrameDataProvider`
  - `loadFromUrls(urls)` — Load directly from URL list
  - `fitToContainer(width, height)` — Auto-size font to fit container
  - `tickAndRender(canvas)` — Combined tick + canvas render
  - `preCacheAll()` — Pre-render all colored frames to offscreen canvases

### Details (`details.ts`)

- **`parseDetailsToml(s: string)`** — Parse project metadata (fps, colors, dimensions) from TOML
- **`detailsFrameColors(details)`** — Extract foreground/background colors from project details

## Project structure

```
src/
  animation.ts    Animation controller and playback state
  color.ts        Color parsing (named + hex)
  data.ts         Core data types (Frame, CFrameData, FrameFile)
  details.ts      Project metadata parsing
  index.ts        Public API exports
  loader.ts       Two-phase frame loading
  parser.ts       .cframe binary parser
  player.ts       High-level player orchestrator
  render.ts       Batched rendering and canvas output
  sizing.ts       Font sizing calculations
test/
  animation.test.ts
  color.test.ts
  data.test.ts
  details.test.ts
  loader.test.ts
  parser.test.ts
  render.test.ts
  sizing.test.ts
```

## Scripts

```bash
npm run build       # Build ESM + CJS with type declarations
npm test            # Run tests
npm run test:watch  # Run tests in watch mode
```

## License

MIT

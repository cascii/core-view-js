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
- **`CFrameData`** — Parsed `.cframe` binary with characters, foreground RGB, and optional per-cell background RGB
- **`PackedCFrameBlob`** — Packed multi-frame foreground/background data with lazy frame decoding
- **`FrameFile`** — File metadata with path, name, and extracted frame index

### Animation (`animation.ts`)

- **`AnimationController`** — Playback state machine with play/pause/stop, loop modes (`Once`, `Loop`), range playback, seeking, and frame stepping
- **`AnimationState`** — `Stopped`, `Playing`, `Finished`

### Parser (`parser.ts`)

- **`parseCframe(data: Uint8Array)`** — Parse foreground-only or background-extended `.cframe` data
- **`parseCframeText(data: Uint8Array)`** — Extract plain text from `.cframe` data
- **`parsePackedCframes(data: Uint8Array)`** — Parse foreground-only, flagged-background, and legacy-background packed animations
- **`encodeCframe(frame)`** — Validate and encode a frame, including its optional background extension
- **`splitCframeExtension(data)`** — Split the legacy frame body from a trailing extension for byte-level editing

### Color (`color.ts`)

- **`parseColor(s: string)`** — Parse named colors (14 built-in) and hex (`#RGB`, `#RRGGBB`)
- **`FrameColors`** — Foreground/background color pair with CSS output

### Sizing (`sizing.ts`)

- **`FontSizing`** — Calculate optimal font size to fit N columns x M rows into a container, with configurable char-width and line-height ratios
- **`calculateFontSizeFromMeasuredSize(...)`** — Scale from host-measured glyph/block dimensions
- **`charPosition(col, row, fontSize)`** — Pixel position of a character in the grid

### Rendering (`render.ts`)

- **`renderCframe(cframe, config)`** — Batch foreground glyphs and per-cell backgrounds into optimized draw commands
- **`renderCframeWithMetrics(cframe, charWidth, lineHeight)`** — Generate commands using host-measured glyph metrics
- **`renderToCanvas` / `renderToOffscreenCanvas`** — Draw foreground colors, cell backgrounds, and optional text strokes to HTML canvas
- **`renderTextToCanvas`** — Draw plain text frames to canvas
- **`FrameCanvasCache`** — Cache pre-rendered canvases with full render-configuration invalidation

`RenderConfig.textStrokeWidth` enables stroked/bolder glyph rendering. `RenderConfig.backgroundColor`
sets the whole-canvas background; it is composited before any per-cell backgrounds stored in the frame.

### Loader (`loader.ts`)

Two-phase loading for progressive display:

1. **Text phase** — Load `.txt` frames (fast, enables immediate playback)
2. **Color phase** — Load `.cframe` binaries (background, enables colored rendering)

- **`FrameDataProvider`** — Interface for platform-agnostic I/O (`getFrameFiles`, `readFrameText`, `readCframeBytes`)
- **`LoadingProgress`** / **`FrameLoaderState`** — Track loading state and progress

Text reads are issued in ordered concurrent batches. Background color loading and pre-caching yield
between frames so browser input and animation remain responsive.

### Player (`player.ts`)

- **`FramePlayer`** — High-level orchestrator combining animation, sizing, rendering, and caching
  - `load(provider, directory)` — Load via a `FrameDataProvider`
  - `loadFromUrls(urls)` — Load directly from URL list
  - `fitToContainer(width, height)` — Auto-size font to fit container
  - `tickAndRender(canvas)` — Combined tick + canvas render
  - `preCacheAll()` — Pre-render all colored frames to offscreen canvases
  - `refreshRenderKey()` — Refresh cached DPR/config state after direct config changes or monitor moves

### Details (`details.ts`)

- **`parseDetailsToml(s: string)`** — Parse project metadata (fps, colors, dimensions) from TOML
- **`detailsFrameColors(details)`** — Extract foreground/background colors from project details
- Supports the `fit_cell_backgrounds` project flag

## Binary background extensions

The legacy single-frame body remains unchanged:

```text
width:u32 + height:u32 + width*height*(char:u8, r:u8, g:u8, b:u8)
```

A background-aware frame appends a one-byte extension flag followed by
`width*height*3` bytes of background RGB. The parser also accepts the earlier
flag-less background payload.

Packed animations use the same foreground body and optional background extension
for every frame. Foreground-only packed blobs remain fully backward compatible.

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

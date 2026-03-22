// src/data.ts
var FrameFile = class {
  constructor(path, name, index) {
    this.path = path;
    this.name = name;
    this.index = index;
  }
  static extractIndex(stem, fallback) {
    const prefixed = stem.match(/^frame_(\d+)$/);
    if (prefixed) return parseInt(prefixed[1], 10);
    const digits = stem.replace(/\D/g, "");
    return digits.length > 0 ? parseInt(digits, 10) : fallback;
  }
};
var CFrameData = class {
  constructor(width, height, chars, rgb) {
    this.width = width;
    this.height = height;
    this.chars = chars;
    this.rgb = rgb;
  }
  charAt(row, col) {
    if (row < this.height && col < this.width) {
      return this.chars[row * this.width + col];
    }
    return null;
  }
  rgbAt(row, col) {
    if (row < this.height && col < this.width) {
      const idx = (row * this.width + col) * 3;
      return [this.rgb[idx], this.rgb[idx + 1], this.rgb[idx + 2]];
    }
    return null;
  }
  shouldSkip(row, col) {
    const idx = row * this.width + col;
    const ch = this.chars[idx];
    const r = this.rgb[idx * 3];
    const g = this.rgb[idx * 3 + 1];
    const b = this.rgb[idx * 3 + 2];
    return ch === 32 || r < 5 && g < 5 && b < 5;
  }
  pixelCount() {
    return this.width * this.height;
  }
};
var Frame = class _Frame {
  constructor(content, cframe = null) {
    this.content = content;
    this.cframe = cframe;
  }
  static textOnly(content) {
    return new _Frame(content, null);
  }
  static withColor(content, cframe) {
    return new _Frame(content, cframe);
  }
  hasColor() {
    return this.cframe !== null;
  }
  dimensions() {
    const lines = this.content.split("\n");
    const rows = lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
    const cols = lines.reduce((max, l) => Math.max(max, l.length), 0);
    return [cols, rows];
  }
};

// src/parser.ts
var ParseError = class _ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "ParseError";
  }
  static fileTooSmall(expected, actual) {
    return new _ParseError(`File too small: expected at least ${expected} bytes, got ${actual}`);
  }
  static sizeMismatch(expected, actual) {
    return new _ParseError(`File size mismatch: expected ${expected} bytes, got ${actual}`);
  }
  static invalidDimensions(width, height) {
    return new _ParseError(`Invalid dimensions: ${width}x${height}`);
  }
};
var HEADER_SIZE = 8;
function readU32LE(data, offset) {
  return data[offset] | data[offset + 1] << 8 | data[offset + 2] << 16 | data[offset + 3] << 24 >>> 0;
}
function parseCframe(data) {
  if (data.length < HEADER_SIZE) {
    throw ParseError.fileTooSmall(HEADER_SIZE, data.length);
  }
  const width = readU32LE(data, 0);
  const height = readU32LE(data, 4);
  if (width === 0 || height === 0) {
    throw ParseError.invalidDimensions(width, height);
  }
  const pixelCount = width * height;
  const expectedSize = HEADER_SIZE + pixelCount * 4;
  if (data.length < expectedSize) {
    throw ParseError.sizeMismatch(expectedSize, data.length);
  }
  const chars = new Uint8Array(pixelCount);
  const rgb = new Uint8Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i++) {
    const offset = HEADER_SIZE + i * 4;
    chars[i] = data[offset];
    rgb[i * 3] = data[offset + 1];
    rgb[i * 3 + 1] = data[offset + 2];
    rgb[i * 3 + 2] = data[offset + 3];
  }
  return new CFrameData(width, height, chars, rgb);
}
function parseCframeText(data) {
  if (data.length < HEADER_SIZE) {
    throw ParseError.fileTooSmall(HEADER_SIZE, data.length);
  }
  const width = readU32LE(data, 0);
  const height = readU32LE(data, 4);
  if (width === 0 || height === 0) {
    throw ParseError.invalidDimensions(width, height);
  }
  const pixelCount = width * height;
  const expectedSize = HEADER_SIZE + pixelCount * 4;
  if (data.length < expectedSize) {
    throw ParseError.sizeMismatch(expectedSize, data.length);
  }
  let text = "";
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;
      const offset = HEADER_SIZE + idx * 4;
      text += String.fromCharCode(data[offset]);
    }
    text += "\n";
  }
  return text;
}

// src/animation.ts
var LoopMode = /* @__PURE__ */ ((LoopMode2) => {
  LoopMode2["Once"] = "once";
  LoopMode2["Loop"] = "loop";
  return LoopMode2;
})(LoopMode || {});
var AnimationState = /* @__PURE__ */ ((AnimationState2) => {
  AnimationState2["Stopped"] = "stopped";
  AnimationState2["Playing"] = "playing";
  AnimationState2["Finished"] = "finished";
  return AnimationState2;
})(AnimationState || {});
var AnimationController = class {
  constructor(fps) {
    this._currentFrame = 0;
    this._frameCount = 0;
    this._state = "stopped" /* Stopped */;
    this._loopMode = "loop" /* Loop */;
    this._rangeStart = 0;
    this._rangeEnd = 1;
    this._fps = Math.max(1, fps);
  }
  setFrameCount(count) {
    this._frameCount = count;
    if (this._currentFrame >= count && count > 0) {
      this._currentFrame = count - 1;
    }
  }
  get frameCount() {
    return this._frameCount;
  }
  setFps(fps) {
    this._fps = Math.max(1, fps);
  }
  get fps() {
    return this._fps;
  }
  intervalMs() {
    return Math.max(1, Math.floor(1e3 / this._fps));
  }
  setLoopMode(mode) {
    this._loopMode = mode;
    if (mode === "loop" /* Loop */ && this._state === "finished" /* Finished */) {
      this._state = "stopped" /* Stopped */;
    }
  }
  get loopMode() {
    return this._loopMode;
  }
  setRange(start, end) {
    this._rangeStart = Math.max(0, Math.min(1, start));
    this._rangeEnd = Math.max(this._rangeStart + 0.01, Math.max(0, Math.min(1, end)));
    const [startFrame, endFrame] = this.rangeFrames();
    if (this._currentFrame < startFrame || this._currentFrame > endFrame) {
      this._currentFrame = startFrame;
    }
  }
  range() {
    return [this._rangeStart, this._rangeEnd];
  }
  rangeFrames() {
    if (this._frameCount === 0) return [0, 0];
    const maxIdx = this._frameCount - 1;
    const start = Math.round(this._rangeStart * maxIdx);
    const end = Math.round(this._rangeEnd * maxIdx);
    return [start, end];
  }
  rangeFrameCount() {
    const [start, end] = this.rangeFrames();
    return Math.max(0, end - start) + 1;
  }
  play() {
    if (this._frameCount > 0 && this._state !== "finished" /* Finished */) {
      this._state = "playing" /* Playing */;
    }
  }
  pause() {
    if (this._state === "playing" /* Playing */) {
      this._state = "stopped" /* Stopped */;
    }
  }
  toggle() {
    switch (this._state) {
      case "playing" /* Playing */:
        this.pause();
        break;
      case "stopped" /* Stopped */:
        this.play();
        break;
      case "finished" /* Finished */: {
        const [start] = this.rangeFrames();
        this._currentFrame = start;
        this._state = "playing" /* Playing */;
        break;
      }
    }
  }
  stop() {
    this._state = "stopped" /* Stopped */;
    const [start] = this.rangeFrames();
    this._currentFrame = start;
  }
  get state() {
    return this._state;
  }
  isPlaying() {
    return this._state === "playing" /* Playing */;
  }
  get currentFrame() {
    return this._currentFrame;
  }
  setCurrentFrame(frame) {
    if (this._frameCount === 0) {
      this._currentFrame = 0;
      return;
    }
    const [start, end] = this.rangeFrames();
    this._currentFrame = Math.max(start, Math.min(end, frame));
  }
  seek(percentage) {
    if (this._frameCount === 0) return;
    const [start, end] = this.rangeFrames();
    const rangeLen = end - start;
    const target = Math.round(start + Math.max(0, Math.min(1, percentage)) * rangeLen);
    this._currentFrame = Math.max(start, Math.min(end, target));
  }
  position() {
    const [start, end] = this.rangeFrames();
    if (end <= start) return 0;
    return (this._currentFrame - start) / (end - start);
  }
  tick() {
    if (this._state !== "playing" /* Playing */ || this._frameCount === 0) {
      return false;
    }
    const [start, end] = this.rangeFrames();
    if (this._currentFrame < start) {
      this._currentFrame = start;
      return true;
    }
    if (this._currentFrame >= end) {
      if (this._loopMode === "loop" /* Loop */) {
        this._currentFrame = start;
        return true;
      } else {
        this._state = "finished" /* Finished */;
        return false;
      }
    }
    this._currentFrame += 1;
    return true;
  }
  stepForward() {
    if (this._frameCount === 0) return;
    this.pause();
    const [start, end] = this.rangeFrames();
    this._currentFrame = this._currentFrame >= end ? start : this._currentFrame + 1;
  }
  stepBackward() {
    if (this._frameCount === 0) return;
    this.pause();
    const [start, end] = this.rangeFrames();
    this._currentFrame = this._currentFrame <= start ? end : this._currentFrame - 1;
  }
  reset() {
    this._currentFrame = 0;
    this._state = "stopped" /* Stopped */;
    this._rangeStart = 0;
    this._rangeEnd = 1;
  }
};

// src/color.ts
function parseColor(s) {
  const trimmed = s.trim();
  if (trimmed.startsWith("#")) return parseHex(trimmed);
  return parseNamed(trimmed);
}
function parseHex(s) {
  const hex = s.slice(1);
  if (hex.length === 3) {
    const r = parseInt(hex[0], 16);
    const g = parseInt(hex[1], 16);
    const b = parseInt(hex[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return [r * 17, g * 17, b * 17];
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return [r, g, b];
  }
  return null;
}
var NAMED_COLORS = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  pink: [255, 192, 203],
  brown: [139, 69, 19]
};
function parseNamed(s) {
  return NAMED_COLORS[s.toLowerCase()] ?? null;
}
var FrameColors = class _FrameColors {
  constructor(foreground, background) {
    this.foreground = foreground;
    this.background = background;
  }
  static fromStrings(fg, bg) {
    return new _FrameColors(
      parseColor(fg) ?? [255, 255, 255],
      parseColor(bg) ?? [0, 0, 0]
    );
  }
  foregroundCss() {
    const [r, g, b] = this.foreground;
    return `rgb(${r},${g},${b})`;
  }
  backgroundCss() {
    const [r, g, b] = this.background;
    return `rgb(${r},${g},${b})`;
  }
};

// src/sizing.ts
var FontSizing = class _FontSizing {
  constructor() {
    this.charWidthRatio = 0.6;
    this.lineHeightRatio = 1.11;
    this.minFontSize = 1;
    this.maxFontSize = 50;
    this.padding = 20;
  }
  static calculate(cols, rows, containerWidth, containerHeight) {
    return new _FontSizing().calculateFontSize(cols, rows, containerWidth, containerHeight);
  }
  calculateFontSize(cols, rows, containerWidth, containerHeight) {
    if (cols === 0 || rows === 0) return this.minFontSize;
    const availableWidth = containerWidth - this.padding;
    const availableHeight = containerHeight - this.padding;
    if (availableWidth <= 0 || availableHeight <= 0) return this.minFontSize;
    const maxFontFromWidth = availableWidth / (cols * this.charWidthRatio);
    const maxFontFromHeight = availableHeight / (rows * this.lineHeightRatio);
    const optimal = Math.min(maxFontFromWidth, maxFontFromHeight);
    return Math.max(this.minFontSize, Math.min(this.maxFontSize, optimal));
  }
  charWidth(fontSize) {
    return fontSize * this.charWidthRatio;
  }
  lineHeight(fontSize) {
    return fontSize * this.lineHeightRatio;
  }
  canvasDimensions(cols, rows, fontSize) {
    return [cols * this.charWidth(fontSize), rows * this.lineHeight(fontSize)];
  }
};
function charPosition(col, row, fontSize) {
  const sizing = new FontSizing();
  return [col * sizing.charWidth(fontSize), row * sizing.lineHeight(fontSize)];
}

// src/render.ts
var RenderConfig = class {
  constructor(fontSize = 10) {
    this.fontSize = fontSize;
    this.sizing = new FontSizing();
  }
  charWidth() {
    return this.sizing.charWidth(this.fontSize);
  }
  lineHeight() {
    return this.sizing.lineHeight(this.fontSize);
  }
};
function textBatchColorString(batch) {
  return `rgb(${batch.color[0]},${batch.color[1]},${batch.color[2]})`;
}
function renderCframe(cframe, config) {
  const charWidth = config.charWidth();
  const lineHeight = config.lineHeight();
  const canvasWidth = cframe.width * charWidth;
  const canvasHeight = cframe.height * lineHeight;
  const batches = [];
  const { width, height } = cframe;
  for (let row = 0; row < height; row++) {
    let col = 0;
    while (col < width) {
      const idx = row * width + col;
      const ch = cframe.chars[idx];
      const r = cframe.rgb[idx * 3];
      const g = cframe.rgb[idx * 3 + 1];
      const b = cframe.rgb[idx * 3 + 2];
      if (ch === 32 || r < 5 && g < 5 && b < 5) {
        col++;
        continue;
      }
      let batchText = String.fromCharCode(ch);
      const startCol = col;
      col++;
      while (col < width) {
        const nextIdx = row * width + col;
        const nextCh = cframe.chars[nextIdx];
        const nr = cframe.rgb[nextIdx * 3];
        const ng = cframe.rgb[nextIdx * 3 + 1];
        const nb = cframe.rgb[nextIdx * 3 + 2];
        if (nr === r && ng === g && nb === b && nextCh !== 32 && !(nr < 5 && ng < 5 && nb < 5)) {
          batchText += String.fromCharCode(nextCh);
          col++;
        } else {
          break;
        }
      }
      batches.push({ text: batchText, x: startCol * charWidth, y: row * lineHeight, color: [r, g, b] });
    }
  }
  return { width: canvasWidth, height: canvasHeight, batches };
}
function renderToCanvas(cframe, canvas, config) {
  const result = renderCframe(cframe, config);
  canvas.width = Math.ceil(result.width);
  canvas.height = Math.ceil(result.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2d context");
  ctx.clearRect(0, 0, result.width, result.height);
  ctx.font = `${config.fontSize.toFixed(2)}px monospace`;
  ctx.textBaseline = "top";
  for (const batch of result.batches) {
    ctx.fillStyle = textBatchColorString(batch);
    ctx.fillText(batch.text, batch.x, batch.y);
  }
}
function renderToOffscreenCanvas(cframe, config) {
  const canvas = document.createElement("canvas");
  renderToCanvas(cframe, canvas, config);
  return canvas;
}
function drawCachedCanvas(target, cached) {
  target.width = cached.width;
  target.height = cached.height;
  const ctx = target.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2d context");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(cached, 0, 0);
}
function drawFrameFromCache(target, cache, frameIndex) {
  const cached = cache.get(frameIndex);
  if (cached) {
    drawCachedCanvas(target, cached);
    return true;
  }
  return false;
}
function renderTextToCanvas(canvas, text, config) {
  const lines = text.split("\n");
  const rows = lines.length;
  const cols = lines.reduce((max, l) => Math.max(max, l.length), 0);
  const charWidth = config.charWidth();
  const lineHeight = config.lineHeight();
  const canvasWidth = cols * charWidth;
  const canvasHeight = rows * lineHeight;
  canvas.width = Math.ceil(canvasWidth);
  canvas.height = Math.ceil(canvasHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2d context");
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.font = `${config.fontSize.toFixed(2)}px monospace`;
  ctx.textBaseline = "top";
  ctx.fillStyle = "white";
  for (let row = 0; row < lines.length; row++) {
    if (lines[row].length > 0) {
      ctx.fillText(lines[row], 0, row * lineHeight);
    }
  }
}
var FrameCanvasCache = class {
  constructor(frameCount = 0) {
    this.fontSizeKey = 0;
    this.canvases = new Array(frameCount).fill(null);
  }
  resize(frameCount) {
    if (this.canvases.length !== frameCount) {
      const newCanvases = new Array(frameCount).fill(null);
      for (let i = 0; i < Math.min(this.canvases.length, frameCount); i++) {
        newCanvases[i] = this.canvases[i];
      }
      this.canvases = newCanvases;
    }
  }
  clear() {
    this.canvases = [];
    this.fontSizeKey = 0;
  }
  invalidateForFontSizeKey(fontSizeKey) {
    if (this.fontSizeKey === fontSizeKey) return false;
    this.fontSizeKey = fontSizeKey;
    this.canvases.fill(null);
    return true;
  }
  store(frameIndex, canvas) {
    if (frameIndex < this.canvases.length) {
      this.canvases[frameIndex] = canvas;
    }
  }
  get(frameIndex) {
    return this.canvases[frameIndex] ?? null;
  }
  has(frameIndex) {
    return this.canvases[frameIndex] != null;
  }
};

// src/details.ts
function parseDetailsToml(s) {
  const details = {};
  for (const line of s.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("[")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    switch (key) {
      case "version":
        details.version = value;
        break;
      case "frames":
        details.frames = parseInt(value, 10);
        break;
      case "luminance":
        details.luminance = parseInt(value, 10);
        break;
      case "font_ratio":
        details.font_ratio = parseFloat(value);
        break;
      case "columns":
        details.columns = parseInt(value, 10);
        break;
      case "fps":
        details.fps = parseInt(value, 10);
        break;
      case "output":
        details.output = value;
        break;
      case "audio":
        details.audio = value === "true";
        break;
      case "background_color":
        details.background_color = value;
        break;
      case "color":
        details.color = value;
        break;
    }
  }
  return details;
}
function detailsFrameColors(details) {
  return FrameColors.fromStrings(details.color ?? "white", details.background_color ?? "black");
}

// src/loader.ts
var LoadingPhase = /* @__PURE__ */ ((LoadingPhase2) => {
  LoadingPhase2["Idle"] = "idle";
  LoadingPhase2["LoadingText"] = "loading_text";
  LoadingPhase2["LoadingColors"] = "loading_colors";
  LoadingPhase2["Complete"] = "complete";
  return LoadingPhase2;
})(LoadingPhase || {});
var LoadingProgress = class {
  constructor() {
    this.textLoaded = 0;
    this.textTotal = 0;
    this.colorLoaded = 0;
    this.colorTotal = 0;
  }
  reset(total) {
    this.textLoaded = 0;
    this.textTotal = total;
    this.colorLoaded = 0;
    this.colorTotal = total;
  }
  textPercent() {
    if (this.textTotal === 0) return 0;
    return Math.floor(this.textLoaded / this.textTotal * 100);
  }
  colorPercent() {
    if (this.colorTotal === 0) return 0;
    return Math.floor(this.colorLoaded / this.colorTotal * 100);
  }
  textComplete() {
    return this.textTotal > 0 && this.textLoaded >= this.textTotal;
  }
  colorComplete() {
    return this.colorTotal > 0 && this.colorLoaded >= this.colorTotal;
  }
  textMessage() {
    if (this.textTotal > 0) {
      return `Loading frames... ${this.textLoaded} / ${this.textTotal} (${this.textPercent()}%)`;
    }
    return "Loading frames...";
  }
  colorMessage() {
    if (this.colorTotal > 0 && !this.colorComplete()) {
      return `Loading colors: ${this.colorPercent()}%`;
    }
    return null;
  }
};
var FrameLoaderState = class {
  constructor() {
    this.phase = "idle" /* Idle */;
    this.progress = new LoadingProgress();
    this.frames = [];
    this.framePaths = [];
    this.error = null;
  }
  reset() {
    this.phase = "idle" /* Idle */;
    this.progress = new LoadingProgress();
    this.frames = [];
    this.framePaths = [];
    this.error = null;
  }
  startLoading(frameFiles) {
    this.reset();
    this.phase = "loading_text" /* LoadingText */;
    this.progress.reset(frameFiles.length);
    this.framePaths = frameFiles.map((f) => f.path);
  }
  addTextFrame(content) {
    this.frames.push(Frame.textOnly(content));
    this.progress.textLoaded++;
  }
  finishTextLoading() {
    if (this.frames.length === 0) {
      this.error = "No frames found";
      this.phase = "idle" /* Idle */;
    } else {
      this.phase = "loading_colors" /* LoadingColors */;
    }
  }
  setFrameColor(index, cframe) {
    if (index < this.frames.length) {
      this.frames[index].cframe = cframe;
    }
    this.progress.colorLoaded++;
    if (this.progress.colorComplete()) {
      this.phase = "complete" /* Complete */;
    }
  }
  skipFrameColor() {
    this.progress.colorLoaded++;
    if (this.progress.colorComplete()) {
      this.phase = "complete" /* Complete */;
    }
  }
  setError(error) {
    this.error = error;
    this.phase = "idle" /* Idle */;
  }
  canPlay() {
    return this.frames.length > 0 && (this.phase === "loading_colors" /* LoadingColors */ || this.phase === "complete" /* Complete */);
  }
  hasAnyColor() {
    return this.frames.some((f) => f.hasColor());
  }
  getFrame(index) {
    return this.frames[index] ?? null;
  }
  frameCount() {
    return this.frames.length;
  }
  getFramePath(index) {
    return this.framePaths[index] ?? null;
  }
};
async function loadTextFrames(provider, directory) {
  const frameFiles = await provider.getFrameFiles(directory);
  if (frameFiles.length === 0) {
    throw new Error("No frames found in directory");
  }
  const frames = [];
  for (const frameFile of frameFiles) {
    const content = await provider.readFrameText(frameFile.path);
    frames.push(Frame.textOnly(content));
  }
  return [frames, frameFiles];
}
async function loadColorFrames(provider, frameFiles, onFrame, yieldFn) {
  const total = frameFiles.length;
  for (let i = 0; i < total; i++) {
    await yieldFn();
    const bytes = await provider.readCframeBytes(frameFiles[i].path);
    let cframe = null;
    if (bytes) {
      try {
        cframe = parseCframe(bytes);
      } catch {
        cframe = null;
      }
    }
    onFrame(i, total, cframe);
    await yieldFn();
  }
}
function yieldToEventLoop() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// src/player.ts
async function loadFramesFromUrls(urls) {
  const texts = await Promise.all(urls.map((u) => fetch(u).then((r) => r.text())));
  return texts.map((t) => Frame.textOnly(t));
}
var FramePlayer = class {
  constructor(fps) {
    this.frames = [];
    this._frameFiles = [];
    this._colorReady = false;
    this.controller = new AnimationController(fps);
    this.config = new RenderConfig();
    this.sizing = new FontSizing();
    this.cache = new FrameCanvasCache();
  }
  // ── Loading ───────────────────────────────────────────────────────
  async load(provider, directory) {
    const [frames, frameFiles] = await loadTextFrames(provider, directory);
    this.controller.setFrameCount(frames.length);
    this.cache.resize(frames.length);
    this.frames = frames;
    this._frameFiles = frameFiles;
  }
  async loadFromUrls(urls) {
    const frames = await loadFramesFromUrls(urls);
    this.controller.setFrameCount(frames.length);
    this.cache.resize(frames.length);
    this.frames = frames;
    this._frameFiles = [];
  }
  get frameFiles() {
    return this._frameFiles;
  }
  setFrameColor(index, cframe) {
    if (index < this.frames.length) {
      this.frames[index].cframe = cframe;
    }
  }
  get colorReady() {
    return this._colorReady;
  }
  set colorReady(ready) {
    this._colorReady = ready;
  }
  // ── Playback ──────────────────────────────────────────────────────
  play() {
    this.controller.play();
  }
  pause() {
    this.controller.pause();
  }
  toggle() {
    this.controller.toggle();
  }
  stop() {
    this.controller.stop();
  }
  tick() {
    return this.controller.tick();
  }
  stepForward() {
    this.controller.stepForward();
  }
  stepBackward() {
    this.controller.stepBackward();
  }
  seek(pct) {
    this.controller.seek(pct);
  }
  position() {
    return this.controller.position();
  }
  setFps(fps) {
    this.controller.setFps(fps);
  }
  intervalMs() {
    return this.controller.intervalMs();
  }
  isPlaying() {
    return this.controller.isPlaying();
  }
  get currentFrame() {
    return this.controller.currentFrame;
  }
  get frameCount() {
    return this.frames.length;
  }
  // ── Content access ────────────────────────────────────────────────
  currentText() {
    return this.frames[this.controller.currentFrame]?.content ?? null;
  }
  getText(index) {
    return this.frames[index]?.content ?? null;
  }
  hasColorAt(index) {
    return this.frames[index]?.hasColor() ?? false;
  }
  hasAnyColor() {
    return this.frames.some((f) => f.hasColor());
  }
  dimensions() {
    if (this.frames.length === 0) return null;
    return this.frames[0].dimensions();
  }
  getFrames() {
    return this.frames;
  }
  // ── Sizing ────────────────────────────────────────────────────────
  fitToContainer(width, height) {
    const dims = this.dimensions();
    if (!dims) return;
    const [cols, rows] = dims;
    const fontSize = this.sizing.calculateFontSize(cols, rows, width, height);
    this.config.fontSize = fontSize;
    this.config.sizing = this.sizing;
    const key = Math.floor(fontSize * 100);
    this.cache.invalidateForFontSizeKey(key);
  }
  get fontSize() {
    return this.config.fontSize;
  }
  get renderConfig() {
    return this.config;
  }
  fontSizeCss() {
    const dims = this.dimensions();
    if (!dims) return "";
    const [cols, rows] = dims;
    const fs = this.config.fontSize;
    const lh = this.config.lineHeight();
    const [w, h] = this.sizing.canvasDimensions(cols, rows, fs);
    return `font-size: ${fs.toFixed(2)}px; line-height: ${lh.toFixed(2)}px; width: ${w.toFixed(2)}px; height: ${h.toFixed(2)}px;`;
  }
  // ── Advanced access ───────────────────────────────────────────────
  getController() {
    return this.controller;
  }
  getCache() {
    return this.cache;
  }
  // ── Canvas rendering ──────────────────────────────────────────────
  renderCurrent(canvas) {
    return this.renderFrame(this.controller.currentFrame, canvas);
  }
  renderFrame(index, canvas) {
    if (!this._colorReady) return false;
    if (drawFrameFromCache(canvas, this.cache, index)) return true;
    const cframe = this.frames[index]?.cframe;
    if (!cframe) return false;
    const offscreen = renderToOffscreenCanvas(cframe, this.config);
    this.cache.store(index, offscreen);
    drawCachedCanvas(canvas, offscreen);
    return true;
  }
  preCacheFrame(index) {
    if (this.cache.has(index)) return false;
    const cframe = this.frames[index]?.cframe;
    if (!cframe) return false;
    try {
      const offscreen = renderToOffscreenCanvas(cframe, this.config);
      this.cache.store(index, offscreen);
      return true;
    } catch {
      return false;
    }
  }
  tickAndRender(canvas) {
    if (!this.isPlaying()) return;
    this.tick();
    const idx = this.currentFrame;
    if (!this.renderCurrent(canvas)) {
      const text = this.frames[idx]?.content;
      if (text) {
        renderTextToCanvas(canvas, text, this.config);
      }
    }
  }
  async loadColors(provider) {
    const frameFiles = [...this._frameFiles];
    await loadColorFrames(
      provider,
      frameFiles,
      (index, _total, cframe) => {
        if (cframe) this.setFrameColor(index, cframe);
      },
      yieldToEventLoop
    );
  }
  async preCacheAll() {
    const count = this.frameCount;
    for (let i = 0; i < count; i++) {
      this.preCacheFrame(i);
      await yieldToEventLoop();
    }
    this._colorReady = true;
  }
};
export {
  AnimationController,
  AnimationState,
  CFrameData,
  FontSizing,
  Frame,
  FrameCanvasCache,
  FrameColors,
  FrameFile,
  FrameLoaderState,
  FramePlayer,
  LoadingPhase,
  LoadingProgress,
  LoopMode,
  ParseError,
  RenderConfig,
  charPosition,
  detailsFrameColors,
  drawCachedCanvas,
  drawFrameFromCache,
  loadColorFrames,
  loadFramesFromUrls,
  loadTextFrames,
  parseCframe,
  parseCframeText,
  parseColor,
  parseDetailsToml,
  renderCframe,
  renderTextToCanvas,
  renderToCanvas,
  renderToOffscreenCanvas,
  textBatchColorString,
  yieldToEventLoop
};
//# sourceMappingURL=index.js.map
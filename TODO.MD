# TODO

## Strict parity with `cascii-core-view`

The major runtime features are implemented. The items below remain before the
TypeScript package can claim strict behavioral parity with the Rust crate.

### Metadata parsing

- [ ] Replace the simplified `details.toml` line parser with a standards-compliant TOML parser.
- [ ] Match Rust behavior for escaped strings, comments, tables, numeric types, invalid values, and parse errors.
- [ ] Add shared valid and invalid `ProjectDetails` fixtures, including `fit_cell_backgrounds`.

### Cross-language conformance

- [ ] Create fixtures consumed by both repositories for foreground-only, flagged-background, and legacy-background `.cframe` files.
- [ ] Create shared packed-animation fixtures, including malformed extension flags and frame-count mismatches.
- [ ] Compare decoded characters, foreground RGB, background RGB, and reconstructed text across both implementations.
- [ ] Compare render-command output, including text batches, background rectangle batches, measured metrics, and black backgrounds.
- [ ] Compare animation transitions, range calculations, seeking, frame intervals, and loop behavior.
- [ ] Compare color parsing, font sizing, and frame-dimension behavior.

### API and error semantics

- [ ] Audit every public Rust API and document its TypeScript equivalent or why it is not applicable.
- [ ] Give `ParseError` structured variants and fields equivalent to the Rust error enum instead of relying only on message strings.
- [ ] Align `FrameFile.extractIndex` behavior for malformed `frame_` prefixes and fallback values.
- [ ] Document intentional language-specific differences such as thrown exceptions versus `Result`, promises versus futures, and JavaScript object serialization versus Rust `serde`.

### Browser rendering validation

- [ ] Add browser-based tests for DPR changes, render-key refreshes, cache invalidation, and unchanged backing-store dimensions.
- [ ] Verify canvas composition order: global background, per-cell backgrounds, text stroke, then foreground fill.
- [ ] Verify cached and uncached rendering produce identical pixels for foreground-only and background-aware frames.

### Release tracking

- [ ] Maintain a parity matrix linking Rust crate releases to TypeScript package releases.
- [ ] Re-run the shared conformance suite before claiming parity in release notes.

## Rust-specific capabilities

Rust feature flags such as `serde`, `toml`, and `web` should not be copied
literally into the npm package. Their JavaScript equivalents should be
documented and tested where relevant.

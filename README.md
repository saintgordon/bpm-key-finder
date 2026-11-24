# BPM & Key Finder — Saint Gordon Collective (`TOOL / 005`)

> **Instant In-Browser BPM, Musical Key & Camelot Analyzer** — 100% client-side, built in the editorial monochrome studio style of [Saint Gordon Collective](https://saintgordon.vercel.app).

- **Live App:** [https://saintgordon.github.io/bpm-key-finder/](https://saintgordon.github.io/bpm-key-finder/)
- **Companion Tool:** [Reverb & Delay Counter](https://saintgordon.github.io/reverb-delay-counter/)
- **Source:** [https://github.com/saintgordon/bpm-key-finder](https://github.com/saintgordon/bpm-key-finder)

---

## Overview

Drop a song or an entire beat pack directly into your browser — see the **BPM**, **Musical Key**, and **Camelot Code** immediately in unmistakable Saint Gordon typography, verify both by ear in one click (**Click Track** & **Hear Key**), and copy.

Zero uploads, zero server calls, zero build step, zero external runtime dependencies — pure vanilla ES Modules and the Web Audio API.

### Clean Studio Workflow

- **Drop Anywhere:** Drag & drop a single file or a full folder anywhere on the page (WAV, MP3, FLAC, M4A, AAC, OGG, and AIFF on Safari). Once loaded, the dropzone collapses into a sleek 1-line bar so the result card sits right above the fold.
- **Giant Side-by-Side Readouts:** Crisp integer BPM (`124`, or `128.5` when fractional) with `÷2` / `×2` toggles and 1-click copy, paired with Musical Key, solid-paper Camelot stamp (`11A`), Relative Key, `# / ♭` toggle, and 1-click copy.
- **1-Click Ear Verification:** Built-in waveform scrubber (`Space` to play/pause) with a beat-locked **Click Track** (`M`) and warm triad **Hear Key** (`C`) audition button.
- **Direct Reverb & Delay Cross-Link:** Jump straight into [Reverb & Delay Counter](https://saintgordon.github.io/reverb-delay-counter/) pre-loaded with your detected BPM.
- **Collapsible Studio Details (Closed by Default):** Expand *More Details* anytime for runner-up BPM & Key candidates, manual **Tap Tempo** (`T`), clickable **12-Note Chromagram**, and an interactive **24-segment SVG Camelot Wheel**.
- **Automatic Batch Queue (2+ Tracks):** Drop multiple tracks or a folder to inspect every track in a compact table and export to **CSV** or **Markdown Report (`.md`)**.

---

## Upgraded DSP Algorithms

All audio analysis lives in [js/music-analyzer.js](js/music-analyzer.js) with zero DOM dependencies:

### 1. BPM Detection Engine (`60–195 BPM`)
- **4-Band SuperFlux Onset Detection (Böck & Widmer 2013):** `1024`-pt Hann FFT (`256`-pt hop, ~43 fps at ~11 kHz) across four perceptual drum bands — Kick/808 (`40–130 Hz`), Snare body (`130–400 Hz`), Snare crack/clap (`400–2000 Hz`), and Hi-hats (`2000–5200 Hz`) — using a 2-frame frequency max-filter (`[k-1, k, k+1]`) to reject vocal vibrato and synth wobble, auto-reweighting across active bands, and adaptive local-mean thresholding.
- **Multi-Window Autocorrelation + Comb Tempogram Consensus:** Trims silent/ambient beatless intros and combines unbiased autocorrelation + harmonic comb spectra across up to 3 high-energy ~30s windows plus the full active body.
- **Octave / Half-Time vs Double-Time Verification:** Uses pulse-train alternating-beat phase-fold symmetry (across both full-band and kick/snare low-mid bands) to stop 8th-note hi-hats from falsely doubling grooves (e.g. keeping 92 BPM boom-bap at 92 instead of 184).
- **Ultra-Fine Phase-Fold Refinement & DAW Integer Snap:** Refines peaks to `0.02 BPM`, cleanly snaps integer beats (`124.0` instead of `123.9`) while preserving genuine fractional tempos (`128.5`), and computes millisecond-accurate `beatOffsetSec` for the beat-locked Click Track.

### 2. Musical Key Detection Engine (HPCP + Bass-Root Disambiguator)
- **High-Resolution 8192-pt FFT (`binHz ≈ 1.35 Hz`):** Cleanly resolves low 808s and bass notes down to `40 Hz` across up to 88 active frames in under 250 ms.
- **Harmonic-Percussive Tonal Peak Isolation (HPCP):** Computes an `O(1)` flanking spectral noise floor (`±7` bins) per frame, keeping only genuine tonal peaks with parabolic log-power sub-bin interpolation and automatic global micro-tuning estimation (handles `A4 = 432 Hz` / varispeed masters).
- **Harmonic Overtone Attenuation & Per-Frame L2 Normalization:** Discounts 2nd, 3rd (Perfect Fifth), and 5th (Major Third) overtones when their fundamental is present in the same frame so rich sawtooth/square synths don't jump up a fifth, and L2-normalizes each frame weighted by tonal clarity so drum-only hits or single loud stabs never skew the progression.
- **Dedicated Bass / 808 Root Chromagram (`40–210 Hz`):** Tracks low-register root pitch classes with structural anchor weighting (first/last 15% of active audio) to reliably separate relative Major vs relative Minor keys (e.g. `C Major 8B` vs `A Minor 8A`).
- **Multi-Profile Ensemble:** Correlates via Pearson's *r* against **Sha'ath (2011) EDMA (50%)**, **Temperley (2007) (30%)**, and **Krumhansl-Kessler (1982) (20%)**, combined with a calibrated bass-root tonic disambiguator.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause active track |
| `M` | Toggle beat-locked **Click Track** |
| `C` | Play detected key triad chord (**Hear Key**) |
| `T` | **Tap Tempo** (opens Details drawer) |

---

## Cross-Browser Compatibility & Tests

- Tested for zero-build static deployment across **Chrome, Safari (macOS & iOS), Firefox, and Edge** down to `360px` viewport width.
- Dual Promise/callback `decodeAudioDataSafe` wrapper for full Safari/iOS Web Audio compatibility.

```bash
# Run syntax checks and full DSP accuracy test suite (Node 20+)
node --check js/music-analyzer.js js/audio-audition.js js/camelot-wheel.js js/app.js
node --test tests/music-analyzer.test.mjs
```

---

## Brand & License

- Built by **[Saint Gordon Collective](https://saintgordon.vercel.app)** — *Independent sound. Imperfect by design.*
- Code licensed under the [MIT License](LICENSE). Bundled display fonts follow [assets/fonts/ENGRAVERS-LICENSE-NOTES.md](assets/fonts/ENGRAVERS-LICENSE-NOTES.md) and [assets/fonts/OFL.txt](assets/fonts/OFL.txt).

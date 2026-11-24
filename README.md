# BPM & Key Finder — Saint Gordon Collective (`TOOL / 005`)

> **Harmonic & Tempo Inspection Deck** — 100% client-side in your browser, built in the editorial monochrome studio style of [Saint Gordon Collective](https://saintgordon.vercel.app).

**Live App:** [https://firewallaby.github.io/bpm-key-finder/](https://firewallaby.github.io/bpm-key-finder/)

---

## Overview

Drop a single master or an entire folder of beats directly into your browser to measure exact **BPM**, **Musical Key**, **Camelot & Open Key codes**, and **12-Note Chromagram** — then immediately verify every result by ear with a **beat-locked metronome click overlay**, **triad chord auditioner**, **sustained tonic drone**, and **interactive SVG Camelot wheel**.

Zero uploads, zero server calls, zero external dependencies — pure vanilla ES Modules and the Web Audio API.

### Studio Capabilities

- **Single & Batch Audio Queue:** Drag & drop individual tracks or entire beat folders (WAV, MP3, FLAC, M4A, AAC, OGG, and AIFF on Safari). Select any track in the queue to load it into the Harmonic Deck, view harmonic compatibility badges (`MATCH`, `REL`, `+1`, `−1`, `+2`) against the active track, and export the entire session to **CSV** or **Markdown**.
- **Interactive Tempo Verification:** Instant `÷2` / `×2` half/double-time toggle, top-3 tempo peak selector, live **Tap Tempo** (`T`), interactive waveform scrubber with **beat-grid tick overlay**, beat-locked **Metronome Click Overlay** (`M`), and `−20 ms` / `+20 ms` / `Snap Beat 1 (B)` grid alignment.
- **Audition-by-Ear Key Verification:** Instant `# / ♭` enharmonic toggle, **Play Key Chord** (`C`), sustained **Tonic Drone** (`D`), and clickable top-4 key hypotheses so you can audition alternative relative keys or fifths directly over the playing audio.
- **12-Note Chromagram & Interactive Camelot Wheel:** Monochrome pitch-class profile highlighting the tonic and diatonic scale tones (click any bar to hear the pitch), paired with a 24-segment interactive SVG Camelot wheel (`1A–12A` inner Minor, `1B–12B` outer Major) and compatible transitions matrix.
- **Quick Delay Timing Strip & Tag Copy:** Live beat-synced delay/reverb timings (`1/4`, `1/8`, `1/8 Dotted`, `1/16`, `1 Bar` in ms) plus one-click BPM & Key tag copy (e.g., `124 BPM · F#m (11A)`).

---

## DSP Algorithm Overview

All audio analysis lives in [js/music-analyzer.js](js/music-analyzer.js) with zero DOM dependencies:

1. **Zero-Phase Anti-Aliased Decimation:** Multi-channel audio is summed to mono and decimated to ~11,025–12,000 Hz using a symmetric triangular FIR kernel (`sinc²` stopband rejection, zero phase distortion), allowing a full 6-minute stereo 44.1 kHz master to analyze in under 300 ms.
2. **Multi-Band Onset BPM Detection (`60–195 BPM`):**
   - Computes 1024-sample Hann-windowed radix-2 FFT frames (`256`-sample hop) with log-compressed spectral flux across two independently normalized bands: **Low (`40–220 Hz`)** for kicks/sub-transients and **Mid/High (`220–4000 Hz`)** for snares, hats, and clicks.
   - Applies adaptive local-mean thresholding, unbiased autocorrelation, forward harmonic comb reinforcement (`L`, `2L`, `3L`, `4L`) with a gentle log-BPM perceptual prior centered at 120 BPM, and fine phase-folded refinement for `0.1 BPM` accuracy plus `beatOffsetSec` beat-1 phase sync.
3. **Chromagram & Sha'ath Key Detection:**
   - Samples up to 110 Hann-windowed `4096`-point FFT frames across the active non-silent body of the track, weighted by frame RMS.
   - Estimates global micro-tuning deviation from `A4 = 440 Hz` (e.g., `432 Hz` masters) and maps `55–2600 Hz` bins onto the 12 chromatic pitch classes using Gaussian pitch weighting and octave density balance.
   - Correlates the normalized chromagram via Pearson's *r* against all 24 **Sha'ath** modern pop/electronic/hip-hop major and minor key profiles.

---

## Camelot Harmonic Mixing Wheel Guide

| Transition | Rule | Musical Effect |
|---|---|---|
| **Exact Match** | Same code (e.g., `11A → 11A`) | Identical tonic & mode — seamless layering |
| **Relative Key** | Switch letter (`11A ↔ 11B`) | Same key signature; shifts between Minor mood and Major lift |
| **−1 Step** | Subtract 1, same ring (`11A → 10A`) | Moves down a fifth (subdominant) — deeper, moodier energy |
| **+1 Step** | Add 1, same ring (`11A → 12A`) | Moves up a fifth (dominant) — brighter tension & forward motion |
| **+2 Energy Boost** | Add 2, same ring (`11A → 1A`) | Whole-tone lift — dramatic peak-hour DJ energy shift |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause active track |
| `M` | Toggle beat-locked **Metronome Click Overlay** |
| `C` | Audition active **Key Triad Chord** |
| `D` | Toggle sustained **Tonic Drone** |
| `T` | **Tap Tempo** |
| `B` | Snap **Beat 1** to current playhead position |
| `H` | Cycle `÷2` Half-Time / `×2` Double-Time / Detected BPM |
| `R` | Restart track from `00:00.0` |

---

## Cross-Browser Notes

- **Chrome, Edge, Firefox, Safari (macOS & iOS):** 100% native Web Audio API playback, `decodeAudioDataSafe` dual Promise/callback compatibility, and responsive layout down to `360px`.
- **Format Support:** `WAV`, `MP3`, `FLAC`, `M4A`, `AAC`, `OGG`, and `OPUS` work across modern desktop & mobile browsers. Native `AIFF` (`*.aif` / `*.aiff`) decoding is supported on Safari/macOS; Chrome/Firefox users will see a clear guidance notice if an AIFF file is dropped.

---

## Development & Tests

Zero build step required — pure static HTML, CSS, SVG/Canvas, and ES Modules.

```bash
# Run DSP accuracy, Camelot integrity & performance test suite (Node 20+)
node --test tests/music-analyzer.test.mjs
```

---

## Brand & License

- Built by **[Saint Gordon Collective](https://saintgordon.vercel.app)** — *Independent sound. Imperfect by design.*
- Code licensed under the [MIT License](LICENSE). Bundled display fonts follow [assets/fonts/ENGRAVERS-LICENSE-NOTES.md](assets/fonts/ENGRAVERS-LICENSE-NOTES.md) and [assets/fonts/OFL.txt](assets/fonts/OFL.txt).

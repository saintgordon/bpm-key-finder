import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMELOT_WHEEL,
  PITCH_CLASSES_SHARP,
  analyzeAudio,
  computeDelayTimings,
  detectBpm,
  detectKey,
  exportQueueToCsv,
  exportQueueToMarkdown,
  fftRadix2,
  formatTrackTag,
  getCompatibleKeys,
  getHarmonicRelation,
  getKeyByCamelot,
  getKeyInfo,
  mixAndDecimate,
} from '../js/music-analyzer.js';

/* ==========================================================================
   SYNTHETIC AUDIO GENERATORS FOR DETERMINISTIC DSP VERIFICATION
   ========================================================================== */

function midiToHz(midi, refA4 = 440) {
  return refA4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Synthesize a realistic studio kick + hi-hat/click pulse train at exact BPM.
 */
function synthPulseTrain({
  bpm,
  durationSec = 16,
  sampleRate = 44100,
  startOffsetSec = 0.0,
  mode = 'kick_click', // 'kick_click' | 'kick_only' | 'click_only' | 'hiphop_groove'
}) {
  const len = Math.floor(durationSec * sampleRate);
  const buf = new Float32Array(len);
  const beatSec = 60 / bpm;

  // Deterministic pseudo-random noise for snare/hat transients
  let rng = 0x13579bdf;
  const nextNoise = () => {
    rng = (1664525 * rng + 1013904223) >>> 0;
    return (rng / 0xffffffff) * 2 - 1;
  };

  const addKick = (tSec, gain = 0.9) => {
    const start = Math.floor(tSec * sampleRate);
    const hitLen = Math.floor(0.14 * sampleRate);
    for (let i = 0; i < hitLen && start + i < len; i++) {
      if (start + i < 0) continue;
      const t = i / sampleRate;
      const freq = 52 + 120 * Math.exp(-t * 36);
      const env = Math.exp(-t * 22);
      const click = Math.exp(-t * 180) * 0.35;
      buf[start + i] += gain * (Math.sin(2 * Math.PI * freq * t) * env + click * Math.sin(2 * Math.PI * 1400 * t));
    }
  };

  const addSnare = (tSec, gain = 0.65) => {
    const start = Math.floor(tSec * sampleRate);
    const hitLen = Math.floor(0.12 * sampleRate);
    for (let i = 0; i < hitLen && start + i < len; i++) {
      if (start + i < 0) continue;
      const t = i / sampleRate;
      const env = Math.exp(-t * 28);
      const body = Math.sin(2 * Math.PI * 195 * t) * Math.exp(-t * 35) * 0.5;
      buf[start + i] += gain * (nextNoise() * env * 0.65 + body);
    }
  };

  const addClick = (tSec, gain = 0.8, freq = 1200) => {
    const start = Math.floor(tSec * sampleRate);
    const hitLen = Math.floor(0.03 * sampleRate);
    for (let i = 0; i < hitLen && start + i < len; i++) {
      if (start + i < 0) continue;
      const t = i / sampleRate;
      const env = Math.exp(-t * 120);
      buf[start + i] += gain * Math.sin(2 * Math.PI * freq * t) * env;
    }
  };

  let beatIdx = 0;
  for (let t = startOffsetSec; t < durationSec - 0.15; t += beatSec) {
    const inBar = beatIdx % 4;
    if (mode === 'kick_click') {
      addKick(t, inBar === 0 ? 0.95 : 0.78);
      addClick(t, inBar === 0 ? 0.65 : 0.42, inBar === 0 ? 1500 : 1050);
    } else if (mode === 'kick_only') {
      addKick(t, 0.9);
    } else if (mode === 'click_only') {
      addClick(t, inBar === 0 ? 0.9 : 0.7, inBar === 0 ? 1600 : 1100);
    } else if (mode === 'hiphop_groove') {
      if (inBar === 0 || inBar === 2) addKick(t, 0.95);
      if (inBar === 1 || inBar === 3) addSnare(t, 0.75);
      // Light 8th-note closed hats
      addClick(t + beatSec * 0.5, 0.16, 3200);
    }
    beatIdx++;
  }

  return buf;
}

/**
 * Synthesize a rich harmonic chord progression (fundamental + overtones + bass root)
 * for accurate musical key detection testing.
 */
function synthChordProgression({
  chords, // Array of arrays of MIDI note numbers, e.g. [[48, 60, 64, 67], ...]
  chordDurationSec = 2.0,
  sampleRate = 44100,
  refA4 = 440,
}) {
  const totalSec = chords.length * chordDurationSec;
  const len = Math.floor(totalSec * sampleRate);
  const buf = new Float32Array(len);

  const chordSamples = Math.floor(chordDurationSec * sampleRate);
  const fadeSamples = Math.floor(0.04 * sampleRate);

  chords.forEach((midiNotes, cIdx) => {
    const start = cIdx * chordSamples;
    const end = Math.min(len, start + chordSamples);
    const scale = 0.75 / Math.max(1, midiNotes.length);

    for (let i = start; i < end; i++) {
      const local = i - start;
      const t = i / sampleRate;
      let env = 1.0;
      if (local < fadeSamples) env = local / fadeSamples;
      else if (end - i < fadeSamples) env = (end - i) / fadeSamples;

      let sample = 0;
      for (const midi of midiNotes) {
        const f0 = midiToHz(midi, refA4);
        // Warm electric-piano / synth harmonic stack (1st, 2nd, 3rd, 4th partials)
        sample +=
          Math.sin(2 * Math.PI * f0 * t) * 1.0 +
          Math.sin(2 * Math.PI * f0 * 2 * t) * 0.42 +
          Math.sin(2 * Math.PI * f0 * 3 * t) * 0.22 +
          Math.sin(2 * Math.PI * f0 * 4 * t) * 0.10;
      }
      buf[i] = sample * scale * env * 0.55;
    }
  });

  return buf;
}

/* ==========================================================================
   1. BPM DETECTION ACCURACY TESTS
   ========================================================================== */

describe('BPM Detection Engine', () => {
  it('detects 90 BPM pulse train within ±1.0 BPM', () => {
    const buf = synthPulseTrain({ bpm: 90, durationSec: 16, sampleRate: 44100 });
    const res = analyzeAudio(buf, 44100);
    assert.ok(
      Math.abs(res.bpm.bpm - 90) <= 1.0,
      `Expected ~90 BPM, got ${res.bpm.bpm} BPM (candidates: ${JSON.stringify(res.bpm.candidates)})`
    );
    assert.equal(res.bpm.bpmInt, 90);
    assert.equal(res.bpm.halfTimeBpm, Math.round((res.bpm.bpm / 2) * 10) / 10);
    assert.equal(res.bpm.doubleTimeBpm, Math.round((res.bpm.bpm * 2) * 10) / 10);
    assert.ok(res.bpm.confidence >= 70, `Expected high confidence, got ${res.bpm.confidence}%`);
    assert.ok(res.bpm.candidates.length >= 1);
  });

  it('detects 124 BPM pulse train within ±1.0 BPM (no half-time confusion)', () => {
    const buf = synthPulseTrain({ bpm: 124, durationSec: 16, sampleRate: 44100 });
    const res = analyzeAudio(buf, 44100);
    assert.ok(
      Math.abs(res.bpm.bpm - 124) <= 1.0,
      `Expected ~124 BPM, got ${res.bpm.bpm} BPM (candidates: ${JSON.stringify(res.bpm.candidates)})`
    );
    assert.equal(res.bpm.bpmInt, 124);
    assert.ok(res.bpm.confidence >= 75, `Expected high confidence, got ${res.bpm.confidence}%`);
  });

  it('detects 140 BPM pulse train within ±1.0 BPM (no half-time confusion)', () => {
    const buf = synthPulseTrain({ bpm: 140, durationSec: 16, sampleRate: 44100 });
    const res = analyzeAudio(buf, 44100);
    assert.ok(
      Math.abs(res.bpm.bpm - 140) <= 1.0,
      `Expected ~140 BPM, got ${res.bpm.bpm} BPM (candidates: ${JSON.stringify(res.bpm.candidates)})`
    );
    assert.equal(res.bpm.bpmInt, 140);
    assert.ok(res.bpm.confidence >= 75, `Expected high confidence, got ${res.bpm.confidence}%`);
  });

  it('detects pure low-band kick-only AND pure high-band click-only trains', () => {
    const kickBuf = synthPulseTrain({ bpm: 118, durationSec: 14, mode: 'kick_only' });
    const clickBuf = synthPulseTrain({ bpm: 128, durationSec: 14, mode: 'click_only' });

    const kickRes = analyzeAudio(kickBuf, 44100);
    const clickRes = analyzeAudio(clickBuf, 44100);

    assert.ok(Math.abs(kickRes.bpm.bpm - 118) <= 1.0, `Kick-only expected ~118, got ${kickRes.bpm.bpm}`);
    assert.ok(Math.abs(clickRes.bpm.bpm - 128) <= 1.0, `Click-only expected ~128, got ${clickRes.bpm.bpm}`);
  });

  it('detects hip-hop groove with kick, snare, and 8th-note hats accurately at 92 BPM', () => {
    const groove = synthPulseTrain({ bpm: 92, durationSec: 18, mode: 'hiphop_groove' });
    const res = analyzeAudio(groove, 44100);
    assert.ok(
      Math.abs(res.bpm.bpm - 92) <= 1.0,
      `Hip-hop groove expected ~92 BPM, got ${res.bpm.bpm} BPM`
    );
  });

  it('estimates beatOffsetSec aligned to the pulse phase', () => {
    const targetOffset = 0.22;
    const bpm = 120; // beat period = 0.500s
    const buf = synthPulseTrain({ bpm, durationSec: 12, startOffsetSec: targetOffset });
    const res = analyzeAudio(buf, 44100);
    const period = 60 / res.bpm.bpm;
    // Circular phase distance modulo beat period
    let diff = Math.abs(res.bpm.beatOffsetSec - targetOffset) % period;
    if (diff > period / 2) diff = period - diff;
    assert.ok(
      diff < 0.045,
      `Expected beatOffsetSec close to ${targetOffset}s, got ${res.bpm.beatOffsetSec}s (circular diff ${(diff * 1000).toFixed(1)} ms)`
    );
  });
});

/* ==========================================================================
   2. MUSICAL KEY & CHROMAGRAM DETECTION TESTS
   ========================================================================== */

describe('Musical Key & Chromagram Detection Engine', () => {
  it('identifies C Major (8B / 1d) from a rich harmonic C Major progression', () => {
    // I (C) - IV (F) - V (G) - I (C)
    const buf = synthChordProgression({
      chords: [
        [48, 60, 64, 67], // C Major
        [53, 60, 65, 69], // F Major
        [55, 59, 62, 67], // G Major
        [48, 60, 64, 67], // C Major
      ],
      chordDurationSec: 2.0,
    });
    const res = analyzeAudio(buf, 44100);
    assert.equal(res.key.key, 'C Major');
    assert.equal(res.key.tonic, 'C');
    assert.equal(res.key.mode, 'major');
    assert.equal(res.key.camelot, '8B');
    assert.equal(res.key.openKey, '1d');
    assert.equal(res.key.relativeKey, 'A Minor (8A)');
    assert.equal(res.key.chroma.length, 12);
    assert.equal(res.key.candidates.length, 4);
    assert.ok(res.key.confidence >= 55, `Expected solid confidence, got ${res.key.confidence}%`);
  });

  it('identifies A Minor (8A / 1m) from a rich harmonic A Minor progression', () => {
    // i (Am) - iv (Dm) - v (Em) - i (Am)
    const buf = synthChordProgression({
      chords: [
        [45, 57, 60, 64], // A Minor
        [50, 57, 62, 65], // D Minor
        [52, 59, 64, 67], // E Minor
        [45, 57, 60, 64], // A Minor
      ],
      chordDurationSec: 2.0,
    });
    const res = analyzeAudio(buf, 44100);
    assert.equal(res.key.key, 'A Minor');
    assert.equal(res.key.tonic, 'A');
    assert.equal(res.key.mode, 'minor');
    assert.equal(res.key.camelot, '8A');
    assert.equal(res.key.openKey, '1m');
    assert.equal(res.key.relativeKey, 'C Major (8B)');
  });

  it('identifies F# Minor (11A / 4m) with enharmonic G♭ Minor', () => {
    // i (F#m) - VI (D) - iv (Bm) - i (F#m)
    const buf = synthChordProgression({
      chords: [
        [42, 54, 57, 61], // F# Minor
        [50, 54, 57, 62], // D Major
        [47, 54, 59, 62], // B Minor
        [42, 54, 57, 61], // F# Minor
      ],
      chordDurationSec: 2.0,
    });
    const res = analyzeAudio(buf, 44100);
    assert.equal(res.key.key, 'F# Minor');
    assert.equal(res.key.tonic, 'F#');
    assert.equal(res.key.mode, 'minor');
    assert.equal(res.key.enharmonic, 'G♭ Minor');
    assert.equal(res.key.camelot, '11A');
    assert.equal(res.key.openKey, '4m');
    assert.equal(res.key.relativeKey, 'A Major (11B)');
  });

  it('identifies D Major (10B / 3d) from a rich harmonic D Major progression', () => {
    // I (D) - IV (G) - V (A) - I (D)
    const buf = synthChordProgression({
      chords: [
        [50, 62, 66, 69], // D Major
        [55, 59, 62, 67], // G Major
        [45, 57, 61, 64], // A Major
        [50, 62, 66, 69], // D Major
      ],
      chordDurationSec: 2.0,
    });
    const res = analyzeAudio(buf, 44100);
    assert.equal(res.key.key, 'D Major');
    assert.equal(res.key.tonic, 'D');
    assert.equal(res.key.mode, 'major');
    assert.equal(res.key.camelot, '10B');
    assert.equal(res.key.openKey, '3d');
    assert.equal(res.key.relativeKey, 'B Minor (10A)');
  });

  it('identifies key accurately even when tuned to A4 = 432 Hz (-32 cents)', () => {
    const buf = synthChordProgression({
      chords: [
        [42, 54, 57, 61], // F# Minor
        [47, 54, 59, 62], // B Minor
        [49, 56, 61, 64], // C# Minor
        [42, 54, 57, 61], // F# Minor
      ],
      chordDurationSec: 2.0,
      refA4: 432,
    });
    const res = analyzeAudio(buf, 44100);
    assert.equal(res.key.key, 'F# Minor');
    assert.equal(res.key.camelot, '11A');
    assert.ok(
      res.key.tuningCents <= -18 && res.key.tuningCents >= -45,
      `Expected tuning offset around -32 cents, got ${res.key.tuningCents}`
    );
  });

  it('simultaneously detects both BPM and Key on a combined beat + harmonic synth mix', () => {
    const drums = synthPulseTrain({ bpm: 124, durationSec: 12, sampleRate: 44100 });
    const chords = synthChordProgression({
      chords: [
        [42, 54, 57, 61], // F#m
        [42, 54, 57, 61], // F#m
        [50, 54, 57, 62], // D
        [45, 57, 61, 64], // A
        [47, 54, 59, 62], // Bm
        [42, 54, 57, 61], // F#m
      ],
      chordDurationSec: 2.0,
      sampleRate: 44100,
    });
    const mixed = new Float32Array(drums.length);
    for (let i = 0; i < drums.length; i++) {
      mixed[i] = 0.55 * drums[i] + 0.45 * (chords[i] || 0);
    }

    const res = analyzeAudio(mixed, 44100);
    assert.ok(Math.abs(res.bpm.bpm - 124) <= 1.0, `Mixed BPM expected ~124, got ${res.bpm.bpm}`);
    assert.equal(res.key.camelot, '11A', `Mixed Key expected 11A (F#m), got ${res.key.key} (${res.key.camelot})`);
  });
});

/* ==========================================================================
   3. COMPLETE 24-ENTRY CAMELOT WHEEL & HARMONIC SYMMETRY TESTS
   ========================================================================== */

describe('Camelot Wheel & Open Key Mapping Integrity', () => {
  const EXPECTED_CAMELOT = [
    // Minor (1A–12A)
    ['1A', 8, 'minor', '6m'],   // G#m / Abm
    ['2A', 3, 'minor', '7m'],   // Ebm / D#m
    ['3A', 10, 'minor', '8m'],  // Bbm / A#m
    ['4A', 5, 'minor', '9m'],   // Fm
    ['5A', 0, 'minor', '10m'],  // Cm
    ['6A', 7, 'minor', '11m'],  // Gm
    ['7A', 2, 'minor', '12m'],  // Dm
    ['8A', 9, 'minor', '1m'],   // Am
    ['9A', 4, 'minor', '2m'],   // Em
    ['10A', 11, 'minor', '3m'], // Bm
    ['11A', 6, 'minor', '4m'],  // F#m
    ['12A', 1, 'minor', '5m'],  // C#m
    // Major (1B–12B)
    ['1B', 11, 'major', '6d'],  // B
    ['2B', 6, 'major', '7d'],   // F# / Gb
    ['3B', 1, 'major', '8d'],   // Db / C#
    ['4B', 8, 'major', '9d'],   // Ab
    ['5B', 3, 'major', '10d'],  // Eb
    ['6B', 10, 'major', '11d'], // Bb
    ['7B', 5, 'major', '12d'],  // F
    ['8B', 0, 'major', '1d'],   // C
    ['9B', 7, 'major', '2d'],   // G
    ['10B', 2, 'major', '3d'],  // D
    ['11B', 9, 'major', '4d'],  // A
    ['12B', 4, 'major', '5d'],  // E
  ];

  it('contains all 24 unique Camelot entries matching exact circle-of-fifths & Open Key', () => {
    assert.equal(CAMELOT_WHEEL.length, 24);
    const seenCamelot = new Set();
    const seenOpenKey = new Set();
    const seenPcMode = new Set();

    for (const [code, expectedPc, expectedMode, expectedOpenKey] of EXPECTED_CAMELOT) {
      const info = getKeyByCamelot(code);
      assert.ok(info, `Missing Camelot entry for ${code}`);
      assert.equal(info.camelot, code);
      assert.equal(info.pitchClass, expectedPc, `${code} pitchClass mismatch`);
      assert.equal(info.mode, expectedMode, `${code} mode mismatch`);
      assert.equal(info.openKey, expectedOpenKey, `${code} openKey mismatch`);

      // Reverse lookup via pitchClass + mode must return the exact same Camelot code
      const rev = getKeyInfo(expectedPc, expectedMode);
      assert.equal(rev.camelot, code);

      seenCamelot.add(info.camelot);
      seenOpenKey.add(info.openKey);
      seenPcMode.add(`${info.pitchClass}:${info.mode}`);
    }

    assert.equal(seenCamelot.size, 24);
    assert.equal(seenOpenKey.size, 24);
    assert.equal(seenPcMode.size, 24);
  });

  it('preserves strict harmonic neighbor symmetry and musical fifth relationships', () => {
    for (const entry of CAMELOT_WHEEL) {
      const compat = getCompatibleKeys(entry.camelot);
      assert.ok(compat);

      // 1. Relative key symmetry: relative(relative(K)) === K, and major tonic is +3 semitones above minor tonic
      const rel = compat.relative;
      const relCompat = getCompatibleKeys(rel.camelot);
      assert.equal(relCompat.relative.camelot, entry.camelot);
      if (entry.mode === 'minor') {
        assert.equal((entry.pitchClass + 3) % 12, rel.pitchClass, `${entry.camelot} relative major should be +3 semitones`);
      } else {
        assert.equal((entry.pitchClass + 9) % 12, rel.pitchClass, `${entry.camelot} relative minor should be -3 semitones`);
      }

      // 2. +1 / -1 symmetry around 12 <-> 1 wraparound, and +1 is always a perfect fifth (+7 semitones)
      const plus = compat.plusOne;
      const minus = compat.minusOne;
      assert.equal(getCompatibleKeys(plus.camelot).minusOne.camelot, entry.camelot);
      assert.equal(getCompatibleKeys(minus.camelot).plusOne.camelot, entry.camelot);
      assert.equal((entry.pitchClass + 7) % 12, plus.pitchClass, `${entry.camelot} +1 should be +7 semitones`);
      assert.equal((entry.pitchClass + 5) % 12, minus.pitchClass, `${entry.camelot} -1 should be +5 semitones`);

      // 3. Energy Boost (+2) is always +2 semitones (whole tone up) on the same ring
      const boost = compat.energyBoost;
      assert.equal(boost.mode, entry.mode);
      assert.equal((entry.pitchClass + 2) % 12, boost.pitchClass, `${entry.camelot} +2 should be +2 semitones`);

      // 4. Harmonic relation helper matches symmetrically
      assert.equal(getHarmonicRelation(entry.camelot, entry.camelot)?.code, 'MATCH');
      assert.equal(getHarmonicRelation(entry.camelot, rel.camelot)?.code, 'REL');
      assert.equal(getHarmonicRelation(entry.camelot, plus.camelot)?.code, '+1');
      assert.equal(getHarmonicRelation(entry.camelot, minus.camelot)?.code, '−1');
      assert.equal(getHarmonicRelation(entry.camelot, boost.camelot)?.code, '+2');
    }
  });
});

/* ==========================================================================
   4. PERFORMANCE, FFT, TIMINGS, EXPORTS & EDGE CASES
   ========================================================================== */

describe('DSP Utilities, Performance & Edge Cases', () => {
  it('radix-2 FFT accurately isolates a known frequency bin', () => {
    const N = 1024;
    const fs = 1024;
    const targetBin = 37;
    const re = new Float32Array(N);
    const im = new Float32Array(N);
    for (let n = 0; n < N; n++) {
      re[n] = Math.cos((2 * Math.PI * targetBin * n) / fs);
    }
    fftRadix2(re, im);

    let peakBin = 0;
    let peakMag = 0;
    for (let k = 0; k < N / 2; k++) {
      const m = Math.hypot(re[k], im[k]);
      if (m > peakMag) {
        peakMag = m;
        peakBin = k;
      }
    }
    assert.equal(peakBin, targetBin);
    assert.ok(Math.abs(peakMag - N / 2) < 1e-2);
  });

  it('handles silent and ultra-short buffers gracefully without NaN or throwing', () => {
    const silence = new Float32Array(44100 * 4);
    const resSilent = analyzeAudio(silence, 44100);
    assert.equal(resSilent.bpm.bpm, 0);
    assert.equal(resSilent.bpm.confidence, 0);
    assert.equal(resSilent.key.confidence, 0);

    const tiny = new Float32Array(128);
    const resTiny = analyzeAudio(tiny, 44100);
    assert.equal(resTiny.bpm.bpm, 0);
    assert.equal(resTiny.key.confidence, 0);
  });

  it('analyzes a full 6-minute stereo 44.1 kHz master in under 500 ms', () => {
    // Build a 6-minute (360s) stereo buffer by tiling a 12s musical loop
    const loopSec = 12;
    const fs = 44100;
    const loopL = synthPulseTrain({ bpm: 124, durationSec: loopSec, sampleRate: fs });
    const fullLen = 360 * fs;
    const left = new Float32Array(fullLen);
    const right = new Float32Array(fullLen);
    for (let offset = 0; offset < fullLen; offset += loopL.length) {
      const copyLen = Math.min(loopL.length, fullLen - offset);
      left.set(loopL.subarray(0, copyLen), offset);
      right.set(loopL.subarray(0, copyLen), offset);
    }

    const res = analyzeAudio([left, right], fs);
    assert.ok(
      res.analysisMs < 500,
      `Expected 6-minute stereo analysis < 500 ms, took ${res.analysisMs} ms`
    );
    assert.ok(Math.abs(res.bpm.bpm - 124) <= 1.0, `6-minute BPM expected ~124, got ${res.bpm.bpm}`);
  });

  it('computes exact studio delay timings and exports valid CSV / Markdown', () => {
    const timings = computeDelayTimings(120);
    assert.equal(timings.quarterMs, 500);
    assert.equal(timings.eighthMs, 250);
    assert.equal(timings.dottedEighthMs, 375);
    assert.equal(timings.sixteenthMs, 125);
    assert.equal(timings.barMs, 2000);

    const keyFm = getKeyByCamelot('4A');
    assert.equal(formatTrackTag(128, keyFm), '128 BPM · Fm (4A)');

    const sampleQueue = [
      {
        name: 'Saint Gordon, Track "01" | Master.wav',
        effectiveBpm: 128,
        effectiveKeyInfo: keyFm,
        analysis: {
          durationSec: 204,
          bpm: { bpm: 128, confidence: 94 },
          key: { ...keyFm, confidence: 88 },
        },
      },
    ];

    const csv = exportQueueToCsv(sampleQueue);
    assert.ok(csv.includes('"Saint Gordon, Track ""01"" | Master.wav"'));
    assert.ok(csv.includes('128.0'));
    assert.ok(csv.includes('4A'));

    const md = exportQueueToMarkdown(sampleQueue);
    assert.ok(md.includes('Saint Gordon, Track "01" \\| Master.wav'));
    assert.ok(md.includes('**4A**'));
  });
});

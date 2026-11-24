import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMELOT_WHEEL,
  analyzeAudio,
  computeDelayTimings,
  exportQueueToCsv,
  exportQueueToMarkdown,
  fftRadix2,
  formatTrackTag,
  getCompatibleKeys,
  getHarmonicRelation,
  getKeyByCamelot,
  getKeyInfo,
} from '../js/music-analyzer.js';
import { generateDemoTrackBuffer } from '../js/audio-audition.js';

/* ==========================================================================
   SYNTHETIC AUDIO GENERATORS FOR REALISTIC STUDIO DSP VERIFICATION
   ========================================================================== */

function midiToHz(midi, refA4 = 440) {
  return refA4 * Math.pow(2, (midi - 69) / 12);
}

function makeNoiseRng(seedInit = 0x13579bdf) {
  let rng = seedInit >>> 0;
  return () => {
    rng = (1664525 * rng + 1013904223) >>> 0;
    return (rng / 0xffffffff) * 2 - 1;
  };
}

/**
 * Synthesize realistic drum grooves at exact BPM across multiple genres:
 *  - 'kick_click'    : 4-on-floor studio kick + click
 *  - 'kick_only'     : pure sub/kick (40–130 Hz)
 *  - 'click_only'    : pure high click (1100–1600 Hz)
 *  - 'boombap'       : kick on 1,3 + snare on 2,4 + crisp 8th-note hi-hats
 *  - 'trap_140'      : trap groove with kick/snare/16th hi-hats
 *  - 'four_on_floor' : house/EDM kick every beat + snare on 2,4 + offbeat hats
 */
function synthDrumGroove({
  bpm,
  durationSec = 16,
  sampleRate = 44100,
  startOffsetSec = 0.0,
  mode = 'kick_click',
}) {
  const len = Math.floor(durationSec * sampleRate);
  const buf = new Float32Array(len);
  const beatSec = 60 / bpm;
  const nextNoise = makeNoiseRng(0x13579bdf);

  const addKick = (tSec, gain = 0.9) => {
    const start = Math.floor(tSec * sampleRate);
    const hitLen = Math.floor(0.14 * sampleRate);
    for (let i = 0; i < hitLen && start + i < len; i++) {
      if (start + i < 0) continue;
      const t = i / sampleRate;
      const freq = 50 + 118 * Math.exp(-t * 36);
      const env = Math.exp(-t * 21);
      const click = Math.exp(-t * 185) * 0.32;
      buf[start + i] +=
        gain * (Math.sin(2 * Math.PI * freq * t) * env + click * Math.sin(2 * Math.PI * 1400 * t));
    }
  };

  const addSnare = (tSec, gain = 0.72) => {
    const start = Math.floor(tSec * sampleRate);
    const hitLen = Math.floor(0.13 * sampleRate);
    for (let i = 0; i < hitLen && start + i < len; i++) {
      if (start + i < 0) continue;
      const t = i / sampleRate;
      const env = Math.exp(-t * 26);
      const body = Math.sin(2 * Math.PI * 195 * t) * Math.exp(-t * 34) * 0.52;
      buf[start + i] += gain * (nextNoise() * env * 0.72 + body);
    }
  };

  const addHat = (tSec, gain = 0.2, open = false) => {
    const start = Math.floor(tSec * sampleRate);
    const hitLen = Math.floor((open ? 0.075 : 0.028) * sampleRate);
    let prev = 0;
    for (let i = 0; i < hitLen && start + i < len; i++) {
      if (start + i < 0) continue;
      const t = i / sampleRate;
      const env = Math.exp(-t * (open ? 45 : 135));
      const n = nextNoise();
      const hp = n - prev * 0.82;
      prev = n;
      buf[start + i] += gain * hp * env;
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
  for (let t = startOffsetSec; t < durationSec - 0.12; t += beatSec) {
    const inBar = beatIdx % 4;
    if (mode === 'kick_click') {
      addKick(t, inBar === 0 ? 0.95 : 0.78);
      addClick(t, inBar === 0 ? 0.65 : 0.42, inBar === 0 ? 1500 : 1050);
    } else if (mode === 'kick_only') {
      addKick(t, 0.92);
    } else if (mode === 'click_only') {
      addClick(t, inBar === 0 ? 0.9 : 0.7, inBar === 0 ? 1600 : 1100);
    } else if (mode === 'boombap') {
      if (inBar === 0 || inBar === 2) addKick(t, 0.95);
      if (inBar === 1 || inBar === 3) addSnare(t, 0.82);
      // Prominent 8th-note closed hi-hats (stress tests octave guard against doubling to 2x!)
      addHat(t, 0.24, false);
      if (t + beatSec * 0.5 < durationSec - 0.08) {
        addHat(t + beatSec * 0.5, 0.28, false);
      }
    } else if (mode === 'four_on_floor') {
      addKick(t, inBar === 0 ? 0.95 : 0.85);
      if (inBar === 1 || inBar === 3) addSnare(t, 0.72);
      if (t + beatSec * 0.5 < durationSec - 0.08) {
        addHat(t + beatSec * 0.5, 0.22, inBar === 3);
      }
    } else if (mode === 'trap_140') {
      // Classic trap groove: heavy 808 kick on 1 & syncopated 2.5, crisp snare on 3, 16th-note hats
      if (inBar === 0) addKick(t, 0.96);
      if (inBar === 1 && t + beatSec * 0.5 < durationSec - 0.1) addKick(t + beatSec * 0.5, 0.85);
      if (inBar === 2) addSnare(t, 0.86);
      for (let sub = 0; sub < 4; sub++) {
        const th = t + (sub * beatSec) / 4;
        if (th < durationSec - 0.05) {
          addHat(th, sub === 0 ? 0.18 : 0.12, false);
        }
      }
    }
    beatIdx++;
  }

  return buf;
}

/**
 * Synthesize a rich harmonic chord progression with configurable timbre:
 *  - 'epiano'   : warm electric piano / synth pad + bass root
 *  - 'sawtooth' : band-limited rich sawtooth/square overtones (strong 2nd, 3rd, 4th, 5th harmonics!)
 */
function synthChordProgression({
  chords,
  chordDurationSec = 2.0,
  sampleRate = 44100,
  refA4 = 440,
  timbre = 'epiano',
}) {
  const totalSec = chords.length * chordDurationSec;
  const len = Math.floor(totalSec * sampleRate);
  const buf = new Float32Array(len);

  const chordSamples = Math.floor(chordDurationSec * sampleRate);
  const fadeSamples = Math.floor(0.035 * sampleRate);

  chords.forEach((midiNotes, cIdx) => {
    const start = cIdx * chordSamples;
    const end = Math.min(len, start + chordSamples);
    const scale = 0.72 / Math.max(1, midiNotes.length);

    for (let i = start; i < end; i++) {
      const local = i - start;
      const t = i / sampleRate;
      let env = 1.0;
      if (local < fadeSamples) env = local / fadeSamples;
      else if (end - i < fadeSamples) env = (end - i) / fadeSamples;

      let sample = 0;
      for (let nIdx = 0; nIdx < midiNotes.length; nIdx++) {
        const midi = midiNotes[nIdx];
        const f0 = midiToHz(midi, refA4);
        const isBass = midi <= 55;
        const noteBoost = isBass ? 1.25 : 1.0;

        if (timbre === 'sawtooth') {
          // Band-limited sawtooth + square blend (huge 2nd, 3rd & 5th harmonics!)
          let s = 0;
          for (let h = 1; h <= 7; h++) {
            const fh = f0 * h;
            if (fh >= sampleRate * 0.42) break;
            const amp = (1 / h) * (h % 2 === 1 ? 1.15 : 0.85);
            s += Math.sin(2 * Math.PI * fh * t) * amp;
          }
          sample += s * 0.65 * noteBoost;
        } else {
          sample +=
            (Math.sin(2 * Math.PI * f0 * t) * 1.0 +
              Math.sin(2 * Math.PI * f0 * 2 * t) * 0.42 +
              Math.sin(2 * Math.PI * f0 * 3 * t) * 0.22 +
              Math.sin(2 * Math.PI * f0 * 4 * t) * 0.10) *
            noteBoost;
        }
      }
      buf[i] = sample * scale * env * 0.55;
    }
  });

  return buf;
}

/* ==========================================================================
   1. BPM DETECTION ACCURACY TESTS (REALISTIC & STRESS SCENARIOS)
   ========================================================================== */

describe('BPM Detection Engine (4-Band SuperFlux + Consensus + Integer Snap)', () => {
  it('detects 88 BPM boom-bap groove accurately', () => {
    const buf = synthDrumGroove({ bpm: 88, durationSec: 18, mode: 'boombap' });
    const res = analyzeAudio(buf, 44100);
    assert.ok(
      Math.abs(res.bpm.bpm - 88) <= 0.5,
      `Expected ~88 BPM, got ${res.bpm.bpm} BPM (candidates: ${JSON.stringify(res.bpm.candidates)})`
    );
    assert.equal(res.bpm.bpmInt, 88);
    assert.ok(res.bpm.confidence >= 65, `Expected solid confidence, got ${res.bpm.confidence}%`);
  });

  it('detects 92 BPM boom-bap with prominent 8th-note hi-hats without doubling to 184 BPM', () => {
    const groove = synthDrumGroove({ bpm: 92, durationSec: 18, mode: 'boombap' });
    const res = analyzeAudio(groove, 44100);
    assert.ok(
      Math.abs(res.bpm.bpm - 92) <= 0.5,
      `92 BPM boom-bap must NOT double to 184! Got ${res.bpm.bpm} BPM (candidates: ${JSON.stringify(res.bpm.candidates)})`
    );
    assert.equal(res.bpm.bpmInt, 92);
  });

  it('snaps 124 BPM beat cleanly to exact integer 124.0 BPM', () => {
    const buf = synthDrumGroove({ bpm: 124, durationSec: 18, mode: 'four_on_floor' });
    const res = analyzeAudio(buf, 44100);
    assert.equal(
      res.bpm.bpm,
      124.0,
      `Expected clean DAW integer snap to 124.0 BPM, got ${res.bpm.bpm} BPM`
    );
    assert.equal(res.bpm.bpmInt, 124);
    assert.equal(res.bpm.halfTimeBpm, 62);
    assert.equal(res.bpm.doubleTimeBpm, 248);
    assert.ok(res.bpm.confidence >= 75, `Expected high confidence, got ${res.bpm.confidence}%`);
  });

  it('handles 140 BPM 4-on-floor/kick-snare at 140 AND trap groove at 140 or exact half-time 70', () => {
    const fourOnFloor = synthDrumGroove({ bpm: 140, durationSec: 18, mode: 'four_on_floor' });
    const resFloor = analyzeAudio(fourOnFloor, 44100);
    assert.ok(
      Math.abs(resFloor.bpm.bpm - 140) <= 0.5,
      `140 BPM four-on-floor expected 140, got ${resFloor.bpm.bpm} BPM`
    );
    assert.equal(resFloor.bpm.bpmInt, 140);

    const trap = synthDrumGroove({ bpm: 140, durationSec: 20, mode: 'trap_140' });
    const resTrap = analyzeAudio(trap, 44100);
    const is140Or70 =
      Math.abs(resTrap.bpm.bpm - 140) <= 1.0 || Math.abs(resTrap.bpm.bpm - 70) <= 1.0;
    assert.ok(
      is140Or70,
      `140 BPM trap groove expected 140 or exact half-time 70, got ${resTrap.bpm.bpm} BPM (candidates: ${JSON.stringify(resTrap.bpm.candidates)})`
    );
  });

  it('preserves fractional tempo 128.5 BPM within ±0.2 BPM without falsely snapping to integer', () => {
    const buf = synthDrumGroove({ bpm: 128.5, durationSec: 24, mode: 'four_on_floor' });
    const res = analyzeAudio(buf, 44100);
    assert.ok(
      Math.abs(res.bpm.bpm - 128.5) <= 0.2,
      `Fractional 128.5 BPM expected within ±0.2, got ${res.bpm.bpm} BPM`
    );
  });

  it('resists strong vocal vibrato / synth pitch wobble over 116 BPM drums (SuperFlux verification)', () => {
    const fs = 44100;
    const durationSec = 18;
    const drums = synthDrumGroove({ bpm: 116, durationSec, sampleRate: fs, mode: 'four_on_floor' });
    const mixed = new Float32Array(drums.length);

    // Layer loud 6.2 Hz vibrato vocal/synth wobble (±45 cents pitch modulation + AM tremolo)
    let phase1 = 0;
    let phase2 = 0;
    for (let i = 0; i < drums.length; i++) {
      const t = i / fs;
      const vib = 1 + 0.026 * Math.sin(2 * Math.PI * 6.2 * t);
      const am = 0.72 + 0.28 * Math.sin(2 * Math.PI * 5.8 * t);
      phase1 += (2 * Math.PI * 440 * vib) / fs;
      phase2 += (2 * Math.PI * 659.25 * vib) / fs;
      const vocal = (Math.sin(phase1) + 0.6 * Math.sin(2 * phase1) + 0.7 * Math.sin(phase2)) * 0.26 * am;
      mixed[i] = 0.62 * drums[i] + vocal;
    }

    const res = analyzeAudio(mixed, fs);
    assert.ok(
      Math.abs(res.bpm.bpm - 116) <= 0.5,
      `Vibrato + 116 BPM drums expected ~116 BPM, got ${res.bpm.bpm} BPM`
    );
  });

  it('handles a 4-second silent/ambient beatless intro followed by a 120 BPM beat drop', () => {
    const fs = 44100;
    const introSec = 4.0;
    const dropSec = 16.0;
    const totalLen = Math.floor((introSec + dropSec) * fs);
    const buf = new Float32Array(totalLen);

    // Gentle beatless ambient pad during the 4s intro
    const introSamples = Math.floor(introSec * fs);
    for (let i = 0; i < introSamples; i++) {
      const t = i / fs;
      const env = Math.min(1, t / 0.8);
      buf[i] =
        0.12 *
        env *
        (Math.sin(2 * Math.PI * 220 * t) + 0.5 * Math.sin(2 * Math.PI * 330 * t));
    }

    // 120 BPM beat drop starts at t = 4.0s
    const drop = synthDrumGroove({ bpm: 120, durationSec: dropSec, sampleRate: fs, mode: 'four_on_floor' });
    buf.set(drop, introSamples);

    const res = analyzeAudio(buf, fs);
    assert.ok(
      Math.abs(res.bpm.bpm - 120) <= 0.5,
      `4s ambient intro + 120 BPM drop expected ~120 BPM, got ${res.bpm.bpm} BPM`
    );
    assert.equal(res.bpm.bpmInt, 120);
  });

  it('detects pure low-band kick-only AND pure high-band click-only trains', () => {
    const kickBuf = synthDrumGroove({ bpm: 118, durationSec: 16, mode: 'kick_only' });
    const clickBuf = synthDrumGroove({ bpm: 128, durationSec: 16, mode: 'click_only' });

    const kickRes = analyzeAudio(kickBuf, 44100);
    const clickRes = analyzeAudio(clickBuf, 44100);

    assert.ok(Math.abs(kickRes.bpm.bpm - 118) <= 0.5, `Kick-only expected ~118, got ${kickRes.bpm.bpm}`);
    assert.ok(Math.abs(clickRes.bpm.bpm - 128) <= 0.5, `Click-only expected ~128, got ${clickRes.bpm.bpm}`);
  });

  it('estimates beatOffsetSec accurately on shifted beat start', () => {
    const targetOffset = 0.22;
    const bpm = 120; // period = 0.500s
    const buf = synthDrumGroove({ bpm, durationSec: 14, startOffsetSec: targetOffset });
    const res = analyzeAudio(buf, 44100);
    const period = 60 / res.bpm.bpm;
    let diff = Math.abs(res.bpm.beatOffsetSec - targetOffset) % period;
    if (diff > period / 2) diff = period - diff;
    assert.ok(
      diff < 0.045,
      `Expected beatOffsetSec close to ${targetOffset}s, got ${res.bpm.beatOffsetSec}s (circular diff ${(diff * 1000).toFixed(1)} ms)`
    );
  });
});

/* ==========================================================================
   2. MUSICAL KEY ACCURACY TESTS (HPCP + BASS-ROOT + MULTI-PROFILE ENSEMBLE)
   ========================================================================== */

describe('Musical Key Detection Engine (HPCP + Bass-Root Disambiguator)', () => {
  it('CRITICAL: cleanly disambiguates relative keys C Major (8B) vs A Minor (8A) sharing the exact same 7 white keys', () => {
    // C Major: C - F - G - C (bass roots C2, F2, G2, C2)
    const cMajBuf = synthChordProgression({
      chords: [
        [36, 48, 60, 64, 67], // C Major
        [41, 53, 60, 65, 69], // F Major
        [43, 55, 59, 62, 67], // G Major
        [36, 48, 60, 64, 67], // C Major
      ],
      chordDurationSec: 2.0,
    });
    const resC = analyzeAudio(cMajBuf, 44100);
    assert.equal(resC.key.key, 'C Major', `Expected C Major (8B), got ${resC.key.key} (${resC.key.camelot})`);
    assert.equal(resC.key.camelot, '8B');
    assert.equal(resC.key.openKey, '1d');
    assert.equal(resC.key.relativeKey, 'A Minor (8A)');

    // A Minor: Am - F - G - Am (exact same 7 white keys! Bass roots A1, F2, G2, A1)
    const aMinBuf = synthChordProgression({
      chords: [
        [45, 57, 60, 64], // A Minor
        [41, 53, 60, 65, 69], // F Major
        [43, 55, 59, 62, 67], // G Major
        [45, 57, 60, 64], // A Minor
      ],
      chordDurationSec: 2.0,
    });
    const resAm = analyzeAudio(aMinBuf, 44100);
    assert.equal(resAm.key.key, 'A Minor', `Expected A Minor (8A), got ${resAm.key.key} (${resAm.key.camelot})`);
    assert.equal(resAm.key.camelot, '8A');
    assert.equal(resAm.key.openKey, '1m');
    assert.equal(resAm.key.relativeKey, 'C Major (8B)');
  });

  it('CRITICAL: cleanly disambiguates relative keys A Major (11B) vs F# Minor (11A) sharing the exact same 7 notes', () => {
    // A Major: A - D - E - A (bass roots A1, D2, E2, A1)
    const aMajBuf = synthChordProgression({
      chords: [
        [45, 57, 61, 64], // A Major
        [38, 50, 57, 62, 66], // D Major
        [40, 52, 56, 59, 64], // E Major
        [45, 57, 61, 64], // A Major
      ],
      chordDurationSec: 2.0,
    });
    const resA = analyzeAudio(aMajBuf, 44100);
    assert.equal(resA.key.key, 'A Major', `Expected A Major (11B), got ${resA.key.key} (${resA.key.camelot})`);
    assert.equal(resA.key.camelot, '11B');
    assert.equal(resA.key.relativeKey, 'F# Minor (11A)');

    // F# Minor: F#m - D - E - F#m (exact same 7 notes! Bass roots F#1, D2, E2, F#1)
    const fSharpMinBuf = synthChordProgression({
      chords: [
        [42, 54, 57, 61], // F# Minor
        [38, 50, 57, 62, 66], // D Major
        [40, 52, 56, 59, 64], // E Major
        [42, 54, 57, 61], // F# Minor
      ],
      chordDurationSec: 2.0,
    });
    const resFsm = analyzeAudio(fSharpMinBuf, 44100);
    assert.equal(resFsm.key.key, 'F# Minor', `Expected F# Minor (11A), got ${resFsm.key.key} (${resFsm.key.camelot})`);
    assert.equal(resFsm.key.camelot, '11A');
    assert.equal(resFsm.key.enharmonic, 'G♭ Minor');
    assert.equal(resFsm.key.relativeKey, 'A Major (11B)');
  });

  it('NOISY PERCUSSIVE MIX: nails D Minor (7A) buried under heavy broadband white-noise snares, hi-hats & kicks', () => {
    const fs = 44100;
    // Dm - Bb - C - Dm (8 seconds)
    const chords = synthChordProgression({
      chords: [
        [38, 50, 57, 62, 65], // D Minor
        [46, 58, 62, 65],     // Bb Major
        [48, 60, 64, 67],     // C Major
        [38, 50, 57, 62, 65], // D Minor
      ],
      chordDurationSec: 2.0,
      sampleRate: fs,
    });
    const drums = synthDrumGroove({ bpm: 126, durationSec: 8.0, sampleRate: fs, mode: 'boombap' });
    const nextNoise = makeNoiseRng(0xabcdef01);
    const mixed = new Float32Array(chords.length);

    for (let i = 0; i < chords.length; i++) {
      // Heavy broadband percussion noise floor + full drum kit over the chords
      const broadbandNoise = nextNoise() * 0.12;
      mixed[i] = 0.42 * chords[i] + 0.65 * (drums[i] || 0) + broadbandNoise;
    }

    const res = analyzeAudio(mixed, fs);
    assert.equal(
      res.key.key,
      'D Minor',
      `Noisy percussive mix expected D Minor (7A), got ${res.key.key} (${res.key.camelot}) — candidates: ${JSON.stringify(res.key.candidates)}`
    );
    assert.equal(res.key.camelot, '7A');
  });

  it('HARMONIC OVERTONE STRESS: rich sawtooth/square synth + bass in G Minor (6A) does NOT jump up a 5th to D Minor', () => {
    // Gm - Eb - F - Gm with strong sawtooth/square 3rd & 5th harmonics
    const sawBuf = synthChordProgression({
      chords: [
        [43, 55, 58, 62], // G Minor
        [39, 51, 55, 58], // Eb Major
        [41, 53, 57, 60], // F Major
        [43, 55, 58, 62], // G Minor
      ],
      chordDurationSec: 2.0,
      timbre: 'sawtooth',
    });

    const res = analyzeAudio(sawBuf, 44100);
    assert.equal(
      res.key.key,
      'G Minor',
      `Rich sawtooth G Minor must NOT jump to D Minor (+1 Fifth)! Got ${res.key.key} (${res.key.camelot})`
    );
    assert.equal(res.key.camelot, '6A');
  });

  it('detects detuned A4 = 432 Hz (-32 cents) track accurately in F# Minor (11A)', () => {
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

  it('DEMO BEAT VERIFICATION: generateDemoTrackBuffer nails exact 124.0 BPM AND F# Minor (11A)', () => {
    // Lightweight mock Web Audio AudioContext for Node verification of the real demo generator
    const mockCtx = {
      sampleRate: 44100,
      createBuffer(channels, length, sampleRate) {
        const chData = Array.from({ length: channels }, () => new Float32Array(length));
        return {
          numberOfChannels: channels,
          length,
          sampleRate,
          duration: length / sampleRate,
          getChannelData: (c) => chData[c],
        };
      },
    };

    const demoBuf = generateDemoTrackBuffer(mockCtx);
    const res = analyzeAudio([demoBuf.getChannelData(0), demoBuf.getChannelData(1)], demoBuf.sampleRate);

    assert.equal(res.bpm.bpm, 124.0, `Demo beat expected exact 124.0 BPM, got ${res.bpm.bpm}`);
    assert.equal(res.key.key, 'F# Minor', `Demo beat expected F# Minor (11A), got ${res.key.key} (${res.key.camelot})`);
    assert.equal(res.key.camelot, '11A');
    assert.equal(res.key.chroma.length, 12);
    assert.equal(res.key.candidates.length, 4);
  });
});

/* ==========================================================================
   3. COMPLETE 24-ENTRY CAMELOT WHEEL & HARMONIC SYMMETRY TESTS
   ========================================================================== */

describe('Camelot Wheel & Open Key Mapping Integrity', () => {
  const EXPECTED_CAMELOT = [
    // Minor (1A–12A)
    ['1A', 8, 'minor', '6m'],
    ['2A', 3, 'minor', '7m'],
    ['3A', 10, 'minor', '8m'],
    ['4A', 5, 'minor', '9m'],
    ['5A', 0, 'minor', '10m'],
    ['6A', 7, 'minor', '11m'],
    ['7A', 2, 'minor', '12m'],
    ['8A', 9, 'minor', '1m'],
    ['9A', 4, 'minor', '2m'],
    ['10A', 11, 'minor', '3m'],
    ['11A', 6, 'minor', '4m'],
    ['12A', 1, 'minor', '5m'],
    // Major (1B–12B)
    ['1B', 11, 'major', '6d'],
    ['2B', 6, 'major', '7d'],
    ['3B', 1, 'major', '8d'],
    ['4B', 8, 'major', '9d'],
    ['5B', 3, 'major', '10d'],
    ['6B', 10, 'major', '11d'],
    ['7B', 5, 'major', '12d'],
    ['8B', 0, 'major', '1d'],
    ['9B', 7, 'major', '2d'],
    ['10B', 2, 'major', '3d'],
    ['11B', 9, 'major', '4d'],
    ['12B', 4, 'major', '5d'],
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

      const rel = compat.relative;
      const relCompat = getCompatibleKeys(rel.camelot);
      assert.equal(relCompat.relative.camelot, entry.camelot);
      if (entry.mode === 'minor') {
        assert.equal((entry.pitchClass + 3) % 12, rel.pitchClass);
      } else {
        assert.equal((entry.pitchClass + 9) % 12, rel.pitchClass);
      }

      const plus = compat.plusOne;
      const minus = compat.minusOne;
      assert.equal(getCompatibleKeys(plus.camelot).minusOne.camelot, entry.camelot);
      assert.equal(getCompatibleKeys(minus.camelot).plusOne.camelot, entry.camelot);
      assert.equal((entry.pitchClass + 7) % 12, plus.pitchClass);
      assert.equal((entry.pitchClass + 5) % 12, minus.pitchClass);

      const boost = compat.energyBoost;
      assert.equal(boost.mode, entry.mode);
      assert.equal((entry.pitchClass + 2) % 12, boost.pitchClass);

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
    assert.ok(!Number.isNaN(resSilent.bpm.beatOffsetSec));

    const tiny = new Float32Array(128);
    const resTiny = analyzeAudio(tiny, 44100);
    assert.equal(resTiny.bpm.bpm, 0);
    assert.equal(resTiny.key.confidence, 0);
    assert.ok(!Number.isNaN(resTiny.bpm.bpm));
  });

  it('analyzes a full 6-minute stereo 44.1 kHz master in under 800 ms', () => {
    const fs = 44100;
    // Exact 6 bars (24 beats) at 124.0 BPM so tiling creates a seamless phase-locked 6-minute master
    const loopSec = 24 * (60 / 124);
    const loopL = synthDrumGroove({ bpm: 124, durationSec: loopSec, sampleRate: fs, mode: 'four_on_floor' });
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
      res.analysisMs < 800,
      `Expected 6-minute stereo analysis < 800 ms, took ${res.analysisMs} ms`
    );
    assert.equal(res.bpm.bpm, 124.0, `6-minute BPM expected 124.0, got ${res.bpm.bpm}`);
  });

  it('computes exact studio delay timings and exports valid CSV / Markdown with canonical GitHub Pages URL', () => {
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
    assert.ok(
      md.includes('https://saintgordon.github.io/bpm-key-finder/'),
      'Markdown report must link to https://saintgordon.github.io/bpm-key-finder/'
    );
  });
});

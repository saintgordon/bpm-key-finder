/**
 * BPM & Key Finder — Pure Studio DSP Engine (Zero DOM Dependencies)
 *
 * Designed for Saint Gordon Collective (TOOL / 005).
 * Runs identically in modern browsers (Web Audio decoded Float32Arrays) and Node.js tests.
 *
 * Algorithms:
 *  1. Anti-aliased mono downsampling (~11,025–12,000 Hz) via zero-phase triangular FIR decimation.
 *  2. 4-Band SuperFlux Onset Detection Function (Böck & Widmer 2013):
 *     1024-pt Hann FFT / 256-pt hop across 4 drum bands (Kick 40–130 Hz, Snare body 130–400 Hz,
 *     Snare crack/clap 400–2000 Hz, Hi-hats 2000–5200 Hz) with 2-frame frequency max-filter
 *     to suppress vocal vibrato & synth wobble, RMS auto-reweighting, and adaptive local-mean threshold.
 *  3. Multi-Window Autocorrelation + Harmonic Comb Tempogram Consensus (60–195 BPM) with
 *     active-body trimming, pulse-train phase-fold octave/half-time verification,
 *     ultra-fine 0.02 BPM phase-fold refinement, clean DAW integer snap, and beat-1 offset estimation.
 *  4. High-Resolution 8192-pt FFT HPCP Musical Key Detection + Bass/808 Root Disambiguator:
 *     Local spectral noise-floor tonal peak isolation, parabolic sub-bin interpolation,
 *     global A4 micro-tuning compensation, harmonic overtone attenuation, per-frame L2-normalized chroma,
 *     dedicated 40–210 Hz bass-root chromagram with structural anchor weighting, and
 *     Multi-Profile Ensemble scoring (Sha'ath EDMA + Temperley + Krumhansl-Kessler).
 *  5. Complete 24-entry Camelot & Open Key wheel mappings, harmonic compatibility matrix,
 *     delay timing strip, waveform peaks, and CSV/Markdown batch exporters.
 */

export const PITCH_CLASSES_SHARP = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

export const PITCH_CLASSES_FLAT = [
  'C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B',
];

export const PITCH_CLASSES_FLAT_ASCII = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
];

export const VALID_AUDIO_EXTENSIONS = [
  '.wav', '.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.aif', '.aiff', '.webm',
];

// Canonical pitch-class spelling per mode (follows standard DJ / music-theory conventions)
const CANONICAL_MAJOR = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F#', 'G', 'A♭', 'A', 'B♭', 'B'];
const CANONICAL_MINOR = ['C', 'C#', 'D', 'E♭', 'E', 'F', 'F#', 'G', 'G#', 'A', 'B♭', 'B'];

// Enharmonic alternate display (only for accidental pitch classes)
const ENHARMONIC_MAJOR = [
  null, 'C# Major', null, 'D# Major', null, null, 'G♭ Major', null, 'G# Major', null, 'A# Major', null,
];
const ENHARMONIC_MINOR = [
  null, 'D♭ Minor', null, 'D# Minor', null, null, 'G♭ Minor', null, 'A♭ Minor', null, 'A# Minor', null,
];

// Exact Camelot number (1..12) by pitch class (0=C .. 11=B)
// Verified against standard Mixed In Key / Camelot circle of fifths:
// Major (B): C=8B, G=9B, D=10B, A=11B, E=12B, B=1B, F#/Gb=2B, Db/C#=3B, Ab=4B, Eb=5B, Bb=6B, F=7B
// Minor (A): Am=8A, Em=9A, Bm=10A, F#m=11A, C#m=12A, G#m/Abm=1A, Ebm/D#m=2A, Bbm/A#m=3A, Fm=4A, Cm=5A, Gm=6A, Dm=7A
const CAMELOT_NUM_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const CAMELOT_NUM_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

// Major & natural minor diatonic scale intervals (semitones from tonic)
export const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
export const MINOR_SCALE_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

// Multi-Profile Ensemble Key Templates (all normalized to equal variance via Pearson's r):
// 1. Sha'ath (2011) EDMA — modern pop, electronic, hip-hop, R&B (captures Aeolian flat-7th cleanly)
const PROFILE_SHAATH_MAJOR = [6.6, 2.0, 3.5, 2.3, 4.6, 4.0, 2.5, 5.2, 2.4, 3.7, 2.3, 3.4];
const PROFILE_SHAATH_MINOR = [6.5, 2.7, 3.5, 5.4, 2.6, 3.5, 2.5, 5.2, 4.0, 2.7, 4.3, 3.2];

// 2. Temperley (2007) — balanced rock/pop/indie tonal distribution
const PROFILE_TEMPERLEY_MAJOR = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
const PROFILE_TEMPERLEY_MINOR = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 3.2, 2.8];

// 3. Krumhansl-Kessler (1982) — classic psychoacoustic harmonic hierarchy
const PROFILE_KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const PROFILE_KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function wrapCamelotNum(n) {
  return ((((n - 1) % 12) + 12) % 12) + 1;
}

function camelotNumToOpenKeyNum(camelotNum) {
  // 8B (C Major) -> 1d, 8A (A Minor) -> 1m
  return (((camelotNum - 8 + 12) % 12) + 1);
}

function buildKeyRecord(pitchClass, mode) {
  const pc = ((pitchClass % 12) + 12) % 12;
  const isMinor = mode === 'minor';
  const camelotNum = isMinor ? CAMELOT_NUM_MINOR[pc] : CAMELOT_NUM_MAJOR[pc];
  const camelotLetter = isMinor ? 'A' : 'B';
  const camelot = `${camelotNum}${camelotLetter}`;
  const openKeyNum = camelotNumToOpenKeyNum(camelotNum);
  const openKey = `${openKeyNum}${isMinor ? 'm' : 'd'}`;

  const tonic = isMinor ? CANONICAL_MINOR[pc] : CANONICAL_MAJOR[pc];
  const tonicSharp = PITCH_CLASSES_SHARP[pc];
  const tonicFlat = PITCH_CLASSES_FLAT[pc];
  const modeLabel = isMinor ? 'Minor' : 'Major';
  const shortSuffix = isMinor ? 'm' : '';

  const key = `${tonic} ${modeLabel}`;
  const keySharp = `${tonicSharp} ${modeLabel}`;
  const keyFlat = `${tonicFlat} ${modeLabel}`;
  const shortName = `${tonic}${shortSuffix}`;
  const shortNameSharp = `${tonicSharp}${shortSuffix}`;
  const shortNameFlat = `${tonicFlat}${shortSuffix}`;
  const enharmonic = isMinor ? ENHARMONIC_MINOR[pc] : ENHARMONIC_MAJOR[pc];

  const intervals = isMinor ? MINOR_SCALE_INTERVALS : MAJOR_SCALE_INTERVALS;
  const scalePitchClasses = intervals.map((step) => (pc + step) % 12);

  return {
    pitchClass: pc,
    mode: isMinor ? 'minor' : 'major',
    tonic,
    tonicSharp,
    tonicFlat,
    key,
    keySharp,
    keyFlat,
    shortName,
    shortNameSharp,
    shortNameFlat,
    enharmonic,
    camelot,
    camelotNum,
    camelotLetter,
    openKey,
    scalePitchClasses,
  };
}

// Precompute complete 24-entry lookup tables
const KEY_BY_PC_MODE = new Map();
const KEY_BY_CAMELOT = new Map();

for (let pc = 0; pc < 12; pc++) {
  for (const mode of ['minor', 'major']) {
    const rec = buildKeyRecord(pc, mode);
    KEY_BY_PC_MODE.set(`${pc}:${mode}`, rec);
    KEY_BY_CAMELOT.set(rec.camelot, rec);
  }
}

/**
 * Ordered 24-entry Camelot Wheel: 1A..12A (inner ring minor), 1B..12B (outer ring major).
 */
export const CAMELOT_WHEEL = (() => {
  const list = [];
  for (const letter of ['A', 'B']) {
    for (let num = 1; num <= 12; num++) {
      list.push(KEY_BY_CAMELOT.get(`${num}${letter}`));
    }
  }
  return Object.freeze(list);
})();

/**
 * Retrieve complete Camelot harmonic mixing compatibility entries for any Camelot code.
 */
export function getCompatibleKeys(camelotCode) {
  const base = KEY_BY_CAMELOT.get(String(camelotCode || '').toUpperCase());
  if (!base) return null;

  const { camelotNum, camelotLetter } = base;
  const oppLetter = camelotLetter === 'A' ? 'B' : 'A';
  const minusNum = wrapCamelotNum(camelotNum - 1);
  const plusNum = wrapCamelotNum(camelotNum + 1);
  const boostNum = wrapCamelotNum(camelotNum + 2);

  const pack = (code, relation, label) => {
    const k = KEY_BY_CAMELOT.get(code);
    return {
      relation,
      label,
      camelot: k.camelot,
      openKey: k.openKey,
      key: k.key,
      keySharp: k.keySharp,
      keyFlat: k.keyFlat,
      shortName: k.shortName,
      shortNameSharp: k.shortNameSharp,
      shortNameFlat: k.shortNameFlat,
      pitchClass: k.pitchClass,
      mode: k.mode,
    };
  };

  return {
    exact: pack(base.camelot, 'exact', 'Exact Match'),
    relative: pack(
      `${camelotNum}${oppLetter}`,
      'relative',
      camelotLetter === 'A' ? 'Relative Major' : 'Relative Minor'
    ),
    minusOne: pack(`${minusNum}${camelotLetter}`, 'minus1', '−1 Darker / Subdominant'),
    plusOne: pack(`${plusNum}${camelotLetter}`, 'plus1', '+1 Brighter / Dominant'),
    energyBoost: pack(`${boostNum}${camelotLetter}`, 'boost2', '+2 Energy Boost'),
  };
}

/**
 * Look up full key metadata (including relativeKey and compatibleKeys) by pitch class & mode.
 */
export function getKeyInfo(pitchClass, mode) {
  const pc = ((Number(pitchClass) % 12) + 12) % 12;
  const normalizedMode = mode === 'minor' ? 'minor' : 'major';
  const base = KEY_BY_PC_MODE.get(`${pc}:${normalizedMode}`);
  if (!base) return null;

  const compatibleKeys = getCompatibleKeys(base.camelot);
  const rel = compatibleKeys.relative;
  return {
    ...base,
    relativeKey: `${rel.key} (${rel.camelot})`,
    relativeCamelot: rel.camelot,
    compatibleKeys,
  };
}

/**
 * Look up full key metadata by Camelot code (e.g. '11A', '8B').
 */
export function getKeyByCamelot(camelotCode) {
  const rec = KEY_BY_CAMELOT.get(String(camelotCode || '').toUpperCase());
  if (!rec) return null;
  return getKeyInfo(rec.pitchClass, rec.mode);
}

/**
 * Determine harmonic mixing relationship between two Camelot codes.
 * Returns null if not directly compatible.
 */
export function getHarmonicRelation(camelotA, camelotB) {
  const a = KEY_BY_CAMELOT.get(String(camelotA || '').toUpperCase());
  const b = KEY_BY_CAMELOT.get(String(camelotB || '').toUpperCase());
  if (!a || !b) return null;

  if (a.camelot === b.camelot) {
    return { code: 'MATCH', label: 'Exact Match' };
  }
  if (a.camelotNum === b.camelotNum && a.camelotLetter !== b.camelotLetter) {
    return { code: 'REL', label: 'Relative Key' };
  }
  if (a.camelotLetter === b.camelotLetter) {
    const diff = (b.camelotNum - a.camelotNum + 12) % 12;
    if (diff === 1) return { code: '+1', label: '+1 Harmonic Lift' };
    if (diff === 11) return { code: '−1', label: '−1 Harmonic Drop' };
    if (diff === 2) return { code: '+2', label: '+2 Energy Boost' };
  }
  return null;
}

/**
 * Format key label according to accidental preference ('auto' | 'sharp' | 'flat').
 */
export function formatKeyName(keyInfo, accidentalStyle = 'auto', short = false) {
  if (!keyInfo) return '—';
  if (short) {
    if (accidentalStyle === 'sharp') return keyInfo.shortNameSharp || keyInfo.shortName;
    if (accidentalStyle === 'flat') return keyInfo.shortNameFlat || keyInfo.shortName;
    return keyInfo.shortName;
  }
  if (accidentalStyle === 'sharp') return keyInfo.keySharp || keyInfo.key;
  if (accidentalStyle === 'flat') return keyInfo.keyFlat || keyInfo.key;
  return keyInfo.key;
}

/**
 * Format compact copyable track tag, e.g. "128 BPM · Fm (4A)".
 */
export function formatTrackTag(bpm, keyInfo, accidentalStyle = 'auto') {
  const bpmStr = Number.isFinite(bpm) && bpm > 0 ? `${Math.round(bpm * 10) / 10} BPM` : '— BPM';
  if (!keyInfo) return bpmStr;
  const keyShort = formatKeyName(keyInfo, accidentalStyle, true);
  return `${bpmStr} · ${keyShort} (${keyInfo.camelot})`;
}

/**
 * Compute studio delay & reverb note timings in milliseconds for a given BPM.
 */
export function computeDelayTimings(bpm) {
  const safeBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
  const quarterMs = 60000 / safeBpm;
  const round1 = (v) => Math.round(v * 10) / 10;
  return {
    bpm: Math.round(safeBpm * 10) / 10,
    barMs: round1(quarterMs * 4),
    halfMs: round1(quarterMs * 2),
    quarterMs: round1(quarterMs),
    dottedEighthMs: round1(quarterMs * 0.75),
    eighthMs: round1(quarterMs * 0.5),
    tripletEighthMs: round1(quarterMs / 3),
    sixteenthMs: round1(quarterMs * 0.25),
  };
}

/**
 * Evaluate whether a filename has a supported audio extension and isn't hidden.
 */
export function isSupportedAudioFilename(filename) {
  const name = String(filename || '');
  if (!name || name.startsWith('.') || name.startsWith('._')) return false;
  const lower = name.toLowerCase();
  return VALID_AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Format seconds as MM:SS or MM:SS.t.
 */
export function formatTime(seconds, showTenths = false) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (showTenths) {
    const totalTenths = Math.round(safe * 10);
    const tenths = totalTenths % 10;
    const totalSeconds = Math.floor(totalTenths / 10);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
  }
  const totalSeconds = Math.floor(safe);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/* ==========================================================================
   FAST CACHED RADIX-2 COOLEY-TUKEY FFT & HANN WINDOW
   ========================================================================== */

const FFT_CACHE = new Map();

function getFftPlan(size) {
  let plan = FFT_CACHE.get(size);
  if (plan) return plan;

  if ((size & (size - 1)) !== 0 || size < 2) {
    throw new Error(`FFT size must be a power of 2, got ${size}`);
  }

  const bits = Math.round(Math.log2(size));
  const bitRev = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    let x = i;
    let rev = 0;
    for (let b = 0; b < bits; b++) {
      rev = (rev << 1) | (x & 1);
      x >>= 1;
    }
    bitRev[i] = rev;
  }

  const cosTable = new Float32Array(size / 2);
  const sinTable = new Float32Array(size / 2);
  for (let i = 0; i < size / 2; i++) {
    const angle = (-2 * Math.PI * i) / size;
    cosTable[i] = Math.cos(angle);
    sinTable[i] = Math.sin(angle);
  }

  const hann = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }

  plan = { size, bitRev, cosTable, sinTable, hann };
  FFT_CACHE.set(size, plan);
  return plan;
}

/**
 * In-place radix-2 Cooley-Tukey FFT on Float32Array / Float64Array buffers.
 */
export function fftRadix2(re, im) {
  const n = re.length;
  const { bitRev, cosTable, sinTable } = getFftPlan(n);

  // Bit-reversal permutation
  for (let i = 0; i < n; i++) {
    const j = bitRev[i];
    if (j > i) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  // Iterative butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const step = n / len;
    for (let i = 0; i < n; i += len) {
      let twIdx = 0;
      for (let j = 0; j < half; j++) {
        const wr = cosTable[twIdx];
        const wi = sinTable[twIdx];
        twIdx += step;

        const uIdx = i + j;
        const vIdx = uIdx + half;
        const vr = re[vIdx];
        const vi = im[vIdx];

        const tr = vr * wr - vi * wi;
        const ti = vr * wi + vi * wr;

        re[vIdx] = re[uIdx] - tr;
        im[vIdx] = im[uIdx] - ti;
        re[uIdx] += tr;
        im[uIdx] += ti;
      }
    }
  }
}

/* ==========================================================================
   MONO MIXING, ANTI-ALIASED DECIMATION & WAVEFORM PEAKS
   ========================================================================== */

/**
 * Mix multi-channel audio to mono and decimate cleanly with a zero-phase
 * triangular anti-aliasing FIR filter (sinc^2 stopband rejection) to ~targetRate Hz.
 * Accepts either a single Float32Array or an array of channel Float32Arrays.
 */
export function mixAndDecimate(channelsOrMono, sampleRate, targetRate = 11025) {
  const fs = Number(sampleRate) || 44100;
  let channels;
  if (Array.isArray(channelsOrMono)) {
    channels = channelsOrMono;
  } else if (channelsOrMono && typeof channelsOrMono.length === 'number') {
    channels = [channelsOrMono];
  } else {
    return { samples: new Float32Array(0), sampleRate: fs, decimationFactor: 1 };
  }

  const numChannels = channels.length;
  const length = numChannels > 0 ? channels[0].length : 0;
  if (length === 0) {
    return { samples: new Float32Array(0), sampleRate: fs, decimationFactor: 1 };
  }

  const factor = Math.max(1, Math.round(fs / targetRate));

  // If no decimation needed, just mix to mono
  if (factor === 1) {
    if (numChannels === 1 && channels[0] instanceof Float32Array) {
      return { samples: channels[0], sampleRate: fs, decimationFactor: 1 };
    }
    const mono = new Float32Array(length);
    const invCh = 1 / numChannels;
    if (numChannels === 2) {
      const ch0 = channels[0];
      const ch1 = channels[1];
      for (let i = 0; i < length; i++) {
        mono[i] = 0.5 * (ch0[i] + ch1[i]);
      }
    } else {
      for (let i = 0; i < length; i++) {
        let sum = 0;
        for (let c = 0; c < numChannels; c++) sum += channels[c][i];
        mono[i] = sum * invCh;
      }
    }
    return { samples: mono, sampleRate: fs, decimationFactor: 1 };
  }

  // Zero-phase triangular kernel of width (2 * factor - 1): weights [1, 2, ..., factor, ..., 2, 1] / factor^2
  const outLen = Math.floor(length / factor);
  const out = new Float32Array(outLen);
  const invNorm = 1 / (factor * factor * numChannels);
  const radius = factor - 1;

  if (numChannels === 1) {
    const ch0 = channels[0];
    for (let o = 0; o < outLen; o++) {
      const center = o * factor;
      let acc = ch0[center] * factor;
      for (let d = 1; d <= radius; d++) {
        const w = factor - d;
        const left = center - d;
        const right = center + d;
        if (left >= 0) acc += ch0[left] * w;
        if (right < length) acc += ch0[right] * w;
      }
      out[o] = acc * invNorm;
    }
  } else if (numChannels === 2) {
    const ch0 = channels[0];
    const ch1 = channels[1];
    for (let o = 0; o < outLen; o++) {
      const center = o * factor;
      let acc = (ch0[center] + ch1[center]) * factor;
      for (let d = 1; d <= radius; d++) {
        const w = factor - d;
        const left = center - d;
        const right = center + d;
        if (left >= 0) acc += (ch0[left] + ch1[left]) * w;
        if (right < length) acc += (ch0[right] + ch1[right]) * w;
      }
      out[o] = acc * invNorm;
    }
  } else {
    for (let o = 0; o < outLen; o++) {
      const center = o * factor;
      let acc = 0;
      for (let c = 0; c < numChannels; c++) {
        const ch = channels[c];
        acc += ch[center] * factor;
        for (let d = 1; d <= radius; d++) {
          const w = factor - d;
          const left = center - d;
          const right = center + d;
          if (left >= 0) acc += ch[left] * w;
          if (right < length) acc += ch[right] * w;
        }
      }
      out[o] = acc * invNorm;
    }
  }

  return {
    samples: out,
    sampleRate: fs / factor,
    decimationFactor: factor,
  };
}

/**
 * Extract normalized peak amplitude envelope for monochrome waveform rendering.
 */
export function computeWaveformPeaks(channelsOrMono, numBuckets = 320) {
  const channels = Array.isArray(channelsOrMono) ? channelsOrMono : [channelsOrMono];
  const peaks = new Float32Array(numBuckets);
  if (!channels.length || !channels[0] || channels[0].length === 0) return peaks;

  const length = channels[0].length;
  const numCh = channels.length;
  const samplesPerBucket = length / numBuckets;
  let globalMax = 0;

  for (let b = 0; b < numBuckets; b++) {
    const start = Math.floor(b * samplesPerBucket);
    const end = Math.min(length, Math.max(start + 1, Math.floor((b + 1) * samplesPerBucket)));
    // Stride if bucket is huge (e.g. 6-minute track) for instant rendering
    const span = end - start;
    const step = span > 256 ? Math.floor(span / 256) : 1;
    let bucketMax = 0;
    for (let i = start; i < end; i += step) {
      let val = 0;
      for (let c = 0; c < numCh; c++) {
        const a = Math.abs(channels[c][i]);
        if (a > val) val = a;
      }
      if (val > bucketMax) bucketMax = val;
    }
    peaks[b] = bucketMax;
    if (bucketMax > globalMax) globalMax = bucketMax;
  }

  if (globalMax > 1e-6) {
    const inv = 1 / globalMax;
    for (let b = 0; b < numBuckets; b++) {
      peaks[b] *= inv;
    }
  }

  return peaks;
}

/* ==========================================================================
   BPM DETECTION ENGINE (4-BAND SUPERFLUX + MULTI-WINDOW CONSENSUS + PHASE REFINE)
   ========================================================================== */

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Evaluate beat-phase folding sharpness for a specific period (in ODF frames).
 * Folding the ODF modulo `period` causes pulses locked to that exact tempo
 * to stack coherently into a razor-sharp phase peak.
 */
function evalPhaseFold(odf, startIdx, endIdx, periodFrames, numBins = 48) {
  const bins = new Float32Array(numBins);
  const counts = new Float32Array(numBins);

  for (let n = startIdx; n < endIdx; n++) {
    const v = odf[n];
    const phase = ((n % periodFrames) + periodFrames) % periodFrames;
    const fBin = (phase / periodFrames) * numBins;
    const b0 = Math.floor(fBin) % numBins;
    const b1 = (b0 + 1) % numBins;
    const frac = fBin - Math.floor(fBin);
    bins[b0] += v * (1 - frac);
    bins[b1] += v * frac;
    counts[b0] += 1 - frac;
    counts[b1] += frac;
  }

  // Normalize per-bin mean so partial end-cycles don't skew phase
  let meanVal = 0;
  for (let b = 0; b < numBins; b++) {
    bins[b] = counts[b] > 0 ? bins[b] / counts[b] : 0;
    meanVal += bins[b];
  }
  meanVal /= numBins;

  // Circular 3-tap smoothing [0.25, 0.5, 0.25] for robustness against human micro-timing
  const smooth = new Float32Array(numBins);
  let bestVal = -1;
  let bestBin = 0;
  for (let b = 0; b < numBins; b++) {
    const prev = bins[(b - 1 + numBins) % numBins];
    const curr = bins[b];
    const next = bins[(b + 1) % numBins];
    const s = 0.25 * prev + 0.5 * curr + 0.25 * next;
    smooth[b] = s;
    if (s > bestVal) {
      bestVal = s;
      bestBin = b;
    }
  }

  // Parabolic refinement on circular phase bin
  const ym = bins[(bestBin - 1 + numBins) % numBins];
  const y0 = bins[bestBin];
  const yp = bins[(bestBin + 1) % numBins];
  const denom = ym - 2 * y0 + yp;
  let delta = 0;
  if (Math.abs(denom) > 1e-12) {
    delta = clamp(0.5 * (ym - yp) / denom, -0.5, 0.5);
  }
  const refinedBin = ((bestBin + delta) % numBins + numBins) % numBins;
  const phaseFrames = (refinedBin / numBins) * periodFrames;

  const peakRatio = meanVal > 1e-9 ? bestVal / meanVal : 0;
  return { score: bestVal, peakRatio, phaseFrames, meanVal, smooth, bestBin };
}

/**
 * Measure alternating-beat symmetry at `slowPeriodFrames`:
 * Compares the phase peak at 0.5 cycles away from the main beat against the main beat.
 * High ratio (~0.75..1.0) => every half-cycle carries an equally strong structural beat (favor 2x BPM).
 * Low ratio (~0.0..0.45)  => alternating hits are weak subdivisions like 8th-note hi-hats (favor 1x BPM).
 */
function evalAlternatingSymmetry(odf, startIdx, endIdx, slowPeriodFrames, numBins = 48) {
  const fold = evalPhaseFold(odf, startIdx, endIdx, slowPeriodFrames, numBins);
  if (!fold || fold.score <= 1e-9) return 0;

  const halfShift = numBins >> 1;
  let halfPeak = 0;
  // Allow ±2 bins tolerance around 0.5 cycle for swung grooves
  for (let d = -2; d <= 2; d++) {
    const idx = (fold.bestBin + halfShift + d + numBins) % numBins;
    if (fold.smooth[idx] > halfPeak) halfPeak = fold.smooth[idx];
  }

  // Estimate trough floor from quarter-cycle regions (away from 0.0 and 0.5)
  const qShift = numBins >> 2;
  let troughSum = 0;
  let troughCnt = 0;
  for (const center of [fold.bestBin + qShift, fold.bestBin + 3 * qShift]) {
    for (let d = -2; d <= 2; d++) {
      troughSum += fold.smooth[(center + d + numBins) % numBins];
      troughCnt++;
    }
  }
  const floor = troughCnt > 0 ? troughSum / troughCnt : 0;
  const mainAbove = Math.max(1e-9, fold.score - floor);
  const halfAbove = Math.max(0, halfPeak - floor);
  return clamp(halfAbove / mainAbove, 0, 1.2);
}

/**
 * Linearly sample an autocorrelation array at a fractional lag.
 */
function sampleLinear(arr, idx) {
  if (idx < 0 || idx >= arr.length - 1) return 0;
  const i0 = Math.floor(idx);
  const frac = idx - i0;
  return arr[i0] * (1 - frac) + arr[i0 + 1] * frac;
}

/**
 * Compute unbiased autocorrelation and forward harmonic comb tempogram for one ODF slice.
 */
function computeWindowTempogram(odf, winStart, winEnd, minBpm, maxBpm, bpmStep, fps) {
  const winLen = winEnd - winStart;
  const gridCount = Math.floor((maxBpm - minBpm) / bpmStep) + 1;
  const gridRaw = new Float32Array(gridCount);

  let energy = 0;
  for (let n = winStart; n < winEnd; n++) {
    const v = odf[n];
    energy += v * v;
  }
  if (winLen < 32 || energy < 1e-8) {
    return { ac: new Float32Array(1), gridRaw, clarity: 0, energy: 0 };
  }

  const maxLagSearch = Math.ceil((60 * fps) / minBpm);
  const maxLagAc = Math.min(Math.floor(winLen * 0.65), maxLagSearch * 4 + 4);
  const ac = new Float32Array(maxLagAc + 1);
  const ac0 = energy / winLen;
  ac[0] = 1.0;

  for (let lag = 1; lag <= maxLagAc; lag++) {
    let sum = 0;
    const limit = winEnd - lag;
    for (let n = winStart; n < limit; n++) {
      sum += odf[n] * odf[n + lag];
    }
    const count = limit - winStart;
    ac[lag] = count > 0 ? sum / (count * ac0) : 0;
  }

  let maxRaw = 0;
  for (let i = 0; i < gridCount; i++) {
    const bpm = minBpm + i * bpmStep;
    const lag = (60 * fps) / bpm;

    const r1 = sampleLinear(ac, lag);
    const r2 = lag * 2 <= maxLagAc ? sampleLinear(ac, lag * 2) : r1;
    const r3 = lag * 3 <= maxLagAc ? sampleLinear(ac, lag * 3) : r1;
    const r4 = lag * 4 <= maxLagAc ? sampleLinear(ac, lag * 4) : r2;
    const rHalf = lag * 0.5 >= 2 ? sampleLinear(ac, lag * 0.5) : 0;

    // Forward multiples reinforce the true fundamental beat without falsely boosting half-tempo;
    // capped sub-harmonic term helps subdivided grooves cleanly.
    const comb =
      0.54 * r1 +
      0.24 * r2 +
      0.10 * r3 +
      0.06 * r4 +
      0.06 * Math.min(r1, rHalf);

    gridRaw[i] = comb;
    if (comb > maxRaw) maxRaw = comb;
  }

  const sorted = Float32Array.from(gridRaw).sort();
  const med = sorted[Math.floor(sorted.length * 0.5)] || 0.01;
  const clarity = clamp((maxRaw / Math.max(med, 0.01) - 1.0) / 4.0, 0.05, 1.5);

  return { ac, gridRaw, clarity, energy: ac0 };
}

/**
 * Detect tempo (BPM), half/double time, top 3 candidates, confidence (0–99),
 * and first strong beat offset in seconds (`beatOffsetSec`).
 */
export function detectBpm(monoSamples, sampleRate, options = {}) {
  const minBpm = options.minBpm ?? 60;
  const maxBpm = options.maxBpm ?? 195;
  const priorCenter = options.priorCenter ?? 120;
  const priorSigma = options.priorSigma ?? 0.65;

  const fs = Number(sampleRate) || 11025;
  const totalSamples = monoSamples ? monoSamples.length : 0;

  const emptyResult = {
    bpm: 0,
    bpmInt: 0,
    halfTimeBpm: 0,
    doubleTimeBpm: 0,
    confidence: 0,
    candidates: [],
    beatOffsetSec: 0,
  };

  if (totalSamples < Math.floor(fs * 1.5)) {
    return emptyResult;
  }

  // 1024-pt Hann FFT / 256-pt hop (~43.07 fps at 11,025 Hz)
  const fftSize = fs >= 10000 ? 1024 : 512;
  const hopSize = fftSize >> 2;
  const fps = fs / hopSize;

  // For very long tracks (> 120s), analyze a 120s body span while preserving exact global offset
  const maxWindowSamples = Math.floor(fs * 120);
  let analysisStartSample = 0;
  let analysisEndSample = totalSamples;
  if (totalSamples > maxWindowSamples) {
    analysisStartSample = Math.floor((totalSamples - maxWindowSamples) * 0.35);
    analysisStartSample = Math.floor(analysisStartSample / hopSize) * hopSize;
    analysisEndSample = analysisStartSample + maxWindowSamples;
  }

  const numFrames = Math.floor((analysisEndSample - analysisStartSample - fftSize) / hopSize) + 1;
  if (numFrames < 40) {
    return emptyResult;
  }

  const { hann } = getFftPlan(fftSize);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const halfBins = fftSize >> 1;
  const binHz = fs / fftSize;

  // 4 Perceptual Drum Bands:
  // Band 1: Kick / 808 punch (40–130 Hz)
  // Band 2: Snare body / low-mid rhythm (130–400 Hz)
  // Band 3: Snare crack / clap / consonants (400–2000 Hz)
  // Band 4: Hi-hats / crisp transients (2000–5200 Hz, capped below Nyquist)
  const maxUsableHz = Math.min(5200, fs * 0.48);
  const b1Start = Math.max(2, Math.floor(40 / binHz));
  const b1End = Math.min(halfBins - 2, Math.max(b1Start, Math.round(130 / binHz)));
  const b2Start = Math.min(halfBins - 2, b1End + 1);
  const b2End = Math.min(halfBins - 2, Math.max(b2Start, Math.round(400 / binHz)));
  const b3Start = Math.min(halfBins - 2, b2End + 1);
  const b3End = Math.min(halfBins - 2, Math.max(b3Start, Math.round(2000 / binHz)));
  const b4Start = Math.min(halfBins - 2, b3End + 1);
  const b4End = Math.min(halfBins - 2, Math.max(b4Start, Math.round(maxUsableHz / binHz)));

  const c1 = Math.max(1, b1End - b1Start + 1);
  const c2 = Math.max(1, b2End - b2Start + 1);
  const c3 = Math.max(1, b3End - b3Start + 1);
  const c4 = Math.max(1, b4End - b4Start + 1);

  const specStart = Math.max(1, b1Start - 1);
  const specEnd = Math.min(halfBins - 1, b4End + 1);

  let currMag = new Float32Array(halfBins + 1);
  let prevMag1 = new Float32Array(halfBins + 1);
  let prevMag2 = new Float32Array(halfBins + 1);

  const flux1 = new Float32Array(numFrames);
  const flux2 = new Float32Array(numFrames);
  const flux3 = new Float32Array(numFrames);
  const flux4 = new Float32Array(numFrames);

  const logGamma = 10.0;
  let sq1 = 0;
  let sq2 = 0;
  let sq3 = 0;
  let sq4 = 0;

  // SuperFlux (Böck & Widmer 2013): max-filter across [k-1, k, k+1] with 2-frame lookback
  // suppresses vocal vibrato and synth pitch/amplitude wobble while preserving crisp drum transients!
  for (let f = 0; f < numFrames; f++) {
    const offset = analysisStartSample + f * hopSize;
    for (let i = 0; i < fftSize; i++) {
      re[i] = monoSamples[offset + i] * hann[i];
      im[i] = 0;
    }
    fftRadix2(re, im);

    for (let k = specStart; k <= specEnd; k++) {
      currMag[k] = Math.log1p(logGamma * Math.hypot(re[k], im[k]));
    }

    if (f >= 1) {
      let s1 = 0;
      let s2 = 0;
      let s3 = 0;
      let s4 = 0;
      const useTwoFrames = f >= 2;

      for (let k = b1Start; k <= b1End; k++) {
        let ref = prevMag1[k - 1];
        if (prevMag1[k] > ref) ref = prevMag1[k];
        if (prevMag1[k + 1] > ref) ref = prevMag1[k + 1];
        if (useTwoFrames) {
          if (prevMag2[k - 1] > ref) ref = prevMag2[k - 1];
          if (prevMag2[k] > ref) ref = prevMag2[k];
          if (prevMag2[k + 1] > ref) ref = prevMag2[k + 1];
        }
        const d = currMag[k] - ref;
        if (d > 0) s1 += d;
      }

      for (let k = b2Start; k <= b2End; k++) {
        let ref = prevMag1[k - 1];
        if (prevMag1[k] > ref) ref = prevMag1[k];
        if (prevMag1[k + 1] > ref) ref = prevMag1[k + 1];
        if (useTwoFrames) {
          if (prevMag2[k - 1] > ref) ref = prevMag2[k - 1];
          if (prevMag2[k] > ref) ref = prevMag2[k];
          if (prevMag2[k + 1] > ref) ref = prevMag2[k + 1];
        }
        const d = currMag[k] - ref;
        if (d > 0) s2 += d;
      }

      for (let k = b3Start; k <= b3End; k++) {
        let ref = prevMag1[k - 1];
        if (prevMag1[k] > ref) ref = prevMag1[k];
        if (prevMag1[k + 1] > ref) ref = prevMag1[k + 1];
        if (useTwoFrames) {
          if (prevMag2[k - 1] > ref) ref = prevMag2[k - 1];
          if (prevMag2[k] > ref) ref = prevMag2[k];
          if (prevMag2[k + 1] > ref) ref = prevMag2[k + 1];
        }
        const d = currMag[k] - ref;
        if (d > 0) s3 += d;
      }

      for (let k = b4Start; k <= b4End; k++) {
        let ref = prevMag1[k - 1];
        if (prevMag1[k] > ref) ref = prevMag1[k];
        if (prevMag1[k + 1] > ref) ref = prevMag1[k + 1];
        if (useTwoFrames) {
          if (prevMag2[k - 1] > ref) ref = prevMag2[k - 1];
          if (prevMag2[k] > ref) ref = prevMag2[k];
          if (prevMag2[k + 1] > ref) ref = prevMag2[k + 1];
        }
        const d = currMag[k] - ref;
        if (d > 0) s4 += d;
      }

      const v1 = s1 / c1;
      const v2 = s2 / c2;
      const v3 = s3 / c3;
      const v4 = s4 / c4;
      flux1[f] = v1;
      flux2[f] = v2;
      flux3[f] = v3;
      flux4[f] = v4;
      sq1 += v1 * v1;
      sq2 += v2 * v2;
      sq3 += v3 * v3;
      sq4 += v4 * v4;
    }

    // Zero-allocation ring rotation of spectral magnitude history
    const tmp = prevMag2;
    prevMag2 = prevMag1;
    prevMag1 = currMag;
    currMag = tmp;
  }

  const rms1 = Math.sqrt(sq1 / numFrames);
  const rms2 = Math.sqrt(sq2 / numFrames);
  const rms3 = Math.sqrt(sq3 / numFrames);
  const rms4 = Math.sqrt(sq4 / numFrames);

  const maxBandRms = Math.max(rms1, rms2, rms3, rms4);
  if (maxBandRms < 1e-6) {
    return emptyResult;
  }

  // Auto-reweight across active bands (handles kick-only, click-only, or full drum mixes seamlessly)
  const rmsGateBand = Math.max(1e-5, maxBandRms * 0.04);
  const a1 = rms1 > rmsGateBand ? 0.35 : 0;
  const a2 = rms2 > rmsGateBand ? 0.20 : 0;
  const a3 = rms3 > rmsGateBand ? 0.25 : 0;
  const a4 = rms4 > rmsGateBand ? 0.20 : 0;
  const wSum = a1 + a2 + a3 + a4;
  if (wSum <= 0) return emptyResult;

  const w1 = a1 / wSum;
  const w2 = a2 / wSum;
  const w3 = a3 / wSum;
  const w4 = a4 / wSum;

  // Low/mid structural drum flux (excludes high hi-hat band) for octave verification
  const wLowMidSum = a1 + a2 + a3;
  const hasLowMid = wLowMidSum > 0;

  const flux = new Float32Array(numFrames);
  const fluxLowMid = new Float32Array(numFrames);

  for (let f = 0; f < numFrames; f++) {
    const n1 = a1 > 0 ? flux1[f] / rms1 : 0;
    const n2 = a2 > 0 ? flux2[f] / rms2 : 0;
    const n3 = a3 > 0 ? flux3[f] / rms3 : 0;
    const n4 = a4 > 0 ? flux4[f] / rms4 : 0;
    flux[f] = w1 * n1 + w2 * n2 + w3 * n3 + w4 * n4;
    if (hasLowMid) {
      fluxLowMid[f] = (a1 * n1 + a2 * n2 + a3 * n3) / wLowMidSum;
    }
  }

  // Adaptive local-mean thresholding (O(N) via prefix sums)
  const prefixFlux = new Float64Array(numFrames + 1);
  const prefixLM = new Float64Array(numFrames + 1);
  for (let f = 0; f < numFrames; f++) {
    prefixFlux[f + 1] = prefixFlux[f] + flux[f];
    if (hasLowMid) prefixLM[f + 1] = prefixLM[f] + fluxLowMid[f];
  }

  const meanHalfWin = Math.max(4, Math.round(0.35 * fps));
  const odf = new Float32Array(numFrames);
  const odfLowMid = new Float32Array(numFrames);
  const odfPrefix = new Float64Array(numFrames + 1);
  let odfEnergy = 0;

  for (let f = 0; f < numFrames; f++) {
    const lo = Math.max(0, f - meanHalfWin);
    const hi = Math.min(numFrames - 1, f + meanHalfWin);
    const invWin = 1 / (hi - lo + 1);

    const val = flux[f] - (prefixFlux[hi + 1] - prefixFlux[lo]) * invWin;
    if (val > 0) {
      odf[f] = val;
      odfEnergy += val * val;
    }
    odfPrefix[f + 1] = odfPrefix[f] + odf[f];

    if (hasLowMid) {
      const lmVal = fluxLowMid[f] - (prefixLM[hi + 1] - prefixLM[lo]) * invWin;
      if (lmVal > 0) odfLowMid[f] = lmVal;
    }
  }

  if (odfEnergy < 1e-8) {
    return emptyResult;
  }

  // Trim silent / beatless ambient intro & outro so they never dilute autocorrelation
  const localWin = Math.min(numFrames, Math.max(12, Math.round(1.5 * fps)));
  let maxLocalSum = 0;
  for (let f = 0; f <= numFrames - localWin; f++) {
    const s = odfPrefix[f + localWin] - odfPrefix[f];
    if (s > maxLocalSum) maxLocalSum = s;
  }

  let activeStart = 0;
  let activeEnd = numFrames;
  if (maxLocalSum > 1e-6 && numFrames > localWin * 2) {
    const activityThresh = maxLocalSum * 0.14;
    const pad = Math.round(0.35 * fps);
    for (let f = 0; f <= numFrames - localWin; f++) {
      if (odfPrefix[f + localWin] - odfPrefix[f] >= activityThresh) {
        activeStart = Math.max(0, f - pad);
        break;
      }
    }
    for (let f = numFrames - localWin; f >= 0; f--) {
      if (odfPrefix[f + localWin] - odfPrefix[f] >= activityThresh) {
        activeEnd = Math.min(numFrames, f + localWin + pad);
        break;
      }
    }
    if (activeEnd - activeStart < Math.min(numFrames, Math.floor(fps * 5))) {
      activeStart = 0;
      activeEnd = numFrames;
    }
  }

  // Multi-Window Autocorrelation + Comb-Filter Tempogram Consensus
  const bpmStep = 0.5;
  const gridCount = Math.floor((maxBpm - minBpm) / bpmStep) + 1;
  const gridBpm = new Float32Array(gridCount);
  const gridRaw = new Float32Array(gridCount);
  const gridScore = new Float32Array(gridCount);

  for (let i = 0; i < gridCount; i++) {
    gridBpm[i] = minBpm + i * bpmStep;
  }

  const activeLen = activeEnd - activeStart;
  const windows = [];

  // Full active body window
  const fullTempo = computeWindowTempogram(odf, activeStart, activeEnd, minBpm, maxBpm, bpmStep, fps);
  windows.push({ tempo: fullTempo, baseWeight: activeLen >= Math.floor(fps * 48) ? 0.55 : 1.0 });

  // For longer tracks (>= 48s active), add up to 3 high-energy ~30s sub-windows across early/mid/late track
  if (activeLen >= Math.floor(fps * 48)) {
    const subLen = Math.min(Math.floor(30 * fps), Math.floor(activeLen * 0.55));
    const thirdLen = Math.floor(activeLen / 3);
    const scanStep = Math.max(1, Math.floor(fps * 1.5));

    for (let seg = 0; seg < 3; seg++) {
      const segStart = activeStart + seg * thirdLen;
      const segEnd = seg === 2 ? activeEnd : Math.min(activeEnd, segStart + thirdLen + Math.floor(subLen * 0.4));
      let bestStart = Math.min(segStart, activeEnd - subLen);
      let bestSum = -1;
      const scanMax = Math.min(activeEnd - subLen, Math.max(segStart, segEnd - subLen));
      for (let s = segStart; s <= scanMax; s += scanStep) {
        const e = odfPrefix[s + subLen] - odfPrefix[s];
        if (e > bestSum) {
          bestSum = e;
          bestStart = s;
        }
      }
      if (bestSum > 1e-6) {
        const subTempo = computeWindowTempogram(
          odf,
          bestStart,
          bestStart + subLen,
          minBpm,
          maxBpm,
          bpmStep,
          fps
        );
        windows.push({ tempo: subTempo, baseWeight: 0.45 });
      }
    }
  }

  // Weighted consensus across windows
  let totalWinWeight = 0;
  for (const w of windows) {
    const wt = w.baseWeight * Math.max(0.1, w.tempo.clarity);
    totalWinWeight += wt;
    for (let i = 0; i < gridCount; i++) {
      gridRaw[i] += w.tempo.gridRaw[i] * wt;
    }
  }
  if (totalWinWeight > 0) {
    const invW = 1 / totalWinWeight;
    for (let i = 0; i < gridCount; i++) {
      gridRaw[i] *= invW;
    }
  }

  // Apply gentle perceptual tempo prior (centered at 120 BPM)
  for (let i = 0; i < gridCount; i++) {
    const bpm = gridBpm[i];
    const logDist = Math.log2(bpm / priorCenter);
    const prior = Math.exp(-0.5 * (logDist / priorSigma) * (logDist / priorSigma));
    gridScore[i] = gridRaw[i] * prior;
  }

  // Extract local maxima (parabolic interpolation on 0.5-BPM grid)
  const localPeaks = [];
  for (let i = 1; i < gridCount - 1; i++) {
    if (gridScore[i] >= gridScore[i - 1] && gridScore[i] >= gridScore[i + 1] && gridScore[i] > 0) {
      const ym = gridScore[i - 1];
      const y0 = gridScore[i];
      const yp = gridScore[i + 1];
      const denom = ym - 2 * y0 + yp;
      let delta = 0;
      if (Math.abs(denom) > 1e-12) {
        delta = clamp(0.5 * (ym - yp) / denom, -0.5, 0.5);
      }
      const interpBpm = clamp(gridBpm[i] + delta * bpmStep, minBpm, maxBpm);
      localPeaks.push({
        bpm: interpBpm,
        score: y0,
        rawComb: gridRaw[i],
      });
    }
  }

  if (localPeaks.length === 0) {
    let bestIdx = 0;
    for (let i = 1; i < gridCount; i++) {
      if (gridScore[i] > gridScore[bestIdx]) bestIdx = i;
    }
    localPeaks.push({
      bpm: gridBpm[bestIdx],
      score: gridScore[bestIdx],
      rawComb: gridRaw[bestIdx],
    });
  }

  localPeaks.sort((a, b) => b.score - a.score);

  // Deduplicate peaks within ±5 BPM
  const distinctPeaks = [];
  for (const p of localPeaks) {
    if (!distinctPeaks.some((d) => Math.abs(d.bpm - p.bpm) < 5.0)) {
      distinctPeaks.push(p);
      if (distinctPeaks.length >= 6) break;
    }
  }

  // Select the most rhythmically active ~35s slice inside [activeStart, activeEnd] for phase folding
  const foldMaxFrames = Math.min(activeLen, Math.floor(35 * fps));
  let foldStart = activeStart;
  if (activeLen > foldMaxFrames) {
    let bestWinEnergy = -1;
    const step = Math.max(1, Math.floor(fps * 1.5));
    for (let s = activeStart; s <= activeEnd - foldMaxFrames; s += step) {
      const e = odfPrefix[s + foldMaxFrames] - odfPrefix[s];
      if (e > bestWinEnergy) {
        bestWinEnergy = e;
        foldStart = s;
      }
    }
  }
  const foldEnd = Math.min(activeEnd, foldStart + foldMaxFrames);

  // Helper to sample consensus comb tempogram at any BPM
  const sampleGridRaw = (bpm) => {
    const idx = (bpm - minBpm) / bpmStep;
    return sampleLinear(gridRaw, idx);
  };
  const sampleGridScore = (bpm) => {
    const idx = (bpm - minBpm) / bpmStep;
    return sampleLinear(gridScore, idx);
  };

  // Explicit Octave / Half-Time vs Double-Time Phase-Fold Verification
  if (distinctPeaks.length > 0) {
    const primary = distinctPeaks[0];
    const halfBpm = primary.bpm * 0.5;
    const doubleBpm = primary.bpm * 2.0;

    // Guard 1: Prevent 8th-note hi-hats from doubling a 60–97 BPM beat into 120–194 BPM
    if (primary.bpm > 130 && halfBpm >= minBpm) {
      const slowPeriod = (60 * fps) / halfBpm;
      const altAll = evalAlternatingSymmetry(odf, foldStart, foldEnd, slowPeriod, 48);
      const altLow = hasLowMid
        ? evalAlternatingSymmetry(odfLowMid, foldStart, foldEnd, slowPeriod, 48)
        : altAll;
      const combHalf = sampleGridRaw(halfBpm);
      const isWeakSubdivision =
        altAll < 0.52 || (hasLowMid && altLow < 0.36 && altAll < 0.68);

      if (isWeakSubdivision && combHalf >= primary.rawComb * 0.58) {
        const existingIdx = distinctPeaks.findIndex((p) => Math.abs(p.bpm - halfBpm) < 5.0);
        const promoted =
          existingIdx >= 0
            ? distinctPeaks.splice(existingIdx, 1)[0]
            : { bpm: halfBpm, score: Math.max(sampleGridScore(halfBpm), primary.score * 0.95), rawComb: combHalf };
        promoted.score = Math.max(promoted.score, primary.score * 1.02);
        distinctPeaks.unshift(promoted);
      }
    }
    // Guard 2: Prevent true 120–195 BPM beats from collapsing to half-time (60–97 BPM)
    else if (primary.bpm < 98 && doubleBpm <= maxBpm) {
      const slowPeriod = (60 * fps) / primary.bpm;
      const altAll = evalAlternatingSymmetry(odf, foldStart, foldEnd, slowPeriod, 48);
      const altLow = hasLowMid
        ? evalAlternatingSymmetry(odfLowMid, foldStart, foldEnd, slowPeriod, 48)
        : altAll;
      const combDbl = sampleGridRaw(doubleBpm);
      const acFast = sampleLinear(fullTempo.ac, (60 * fps) / doubleBpm);
      const acSlow = sampleLinear(fullTempo.ac, slowPeriod);

      if (
        altAll >= 0.72 &&
        (!hasLowMid || altLow >= 0.62) &&
        combDbl >= primary.rawComb * 0.82 &&
        acFast >= acSlow * 0.75
      ) {
        const existingIdx = distinctPeaks.findIndex((p) => Math.abs(p.bpm - doubleBpm) < 5.0);
        const promoted =
          existingIdx >= 0
            ? distinctPeaks.splice(existingIdx, 1)[0]
            : { bpm: doubleBpm, score: Math.max(sampleGridScore(doubleBpm), primary.score * 0.95), rawComb: combDbl };
        promoted.score = Math.max(promoted.score, primary.score * 1.02);
        distinctPeaks.unshift(promoted);
      }
    }
  }

  // Ultra-Fine Phase-Fold Refinement (0.1 BPM -> 0.02 BPM) + Smart DAW Integer Snap
  const refineCandidate = (cand) => {
    const center = cand.bpm;
    const loBpm = Math.max(minBpm, center - 3.0);
    const hiBpm = Math.min(maxBpm, center + 3.0);

    let bestBpm = center;
    let bestWeighted = -1;
    let bestFold = null;

    // Coarse 0.1 BPM sweep around autocorrelation peak
    for (let b = loBpm; b <= hiBpm + 1e-6; b += 0.1) {
      const period = (60 * fps) / b;
      const fold = evalPhaseFold(odf, foldStart, foldEnd, period, 48);
      const distPenalty = 1 - 0.012 * Math.abs(b - center);
      const val = fold.score * distPenalty;
      if (val > bestWeighted) {
        bestWeighted = val;
        bestBpm = b;
        bestFold = fold;
      }
    }

    // Ultra-fine 0.02 BPM sweep around best 0.1 BPM hit
    let bestFoldScore = -1;
    const fineLo = Math.max(minBpm, bestBpm - 0.14);
    const fineHi = Math.min(maxBpm, bestBpm + 0.14);
    for (let b = fineLo; b <= fineHi + 1e-6; b += 0.02) {
      const period = (60 * fps) / b;
      const fold = evalPhaseFold(odf, foldStart, foldEnd, period, 64);
      if (fold.score > bestFoldScore) {
        bestFoldScore = fold.score;
        bestBpm = b;
        bestFold = fold;
      }
    }

    // Smart DAW Integer Snap: snaps 123.96 / 124.04 -> exact 124.0 while preserving true 128.5 BPM!
    const nearestInt = Math.round(bestBpm);
    if (
      Math.abs(bestBpm - nearestInt) <= 0.14 &&
      nearestInt >= minBpm &&
      nearestInt <= maxBpm
    ) {
      const intPeriod = (60 * fps) / nearestInt;
      const intFold = evalPhaseFold(odf, foldStart, foldEnd, intPeriod, 64);
      if (intFold.score >= bestFoldScore * 0.98) {
        bestBpm = nearestInt;
        bestFold = intFold;
      }
    }

    return {
      bpm: Math.round(bestBpm * 10) / 10,
      exactBpm: bestBpm,
      score: cand.score,
      rawComb: cand.rawComb,
      fold: bestFold,
    };
  };

  const refined = distinctPeaks.slice(0, 3).map(refineCandidate);
  const top = refined[0];
  const bpm = top.bpm;
  const bpmInt = Math.round(bpm);

  // Calibrated confidence (0..99%) from consensus comb prominence + phase-fold sharpness
  const sortedScores = Float32Array.from(gridRaw).sort();
  const medianComb = sortedScores[Math.floor(sortedScores.length * 0.5)] || 0.01;
  const peakToMedian = top.rawComb / Math.max(medianComb, 0.01);
  const acQuality = clamp((peakToMedian - 1.3) / 4.0, 0, 1);
  const phaseSharpness = top.fold ? clamp((top.fold.peakRatio - 1.4) / 3.6, 0, 1) : 0;
  const rawQuality = clamp(top.rawComb / 0.52, 0, 1);
  const confidence = Math.round(
    clamp((0.40 * acQuality + 0.35 * phaseSharpness + 0.25 * rawQuality) * 100, 5, 99)
  );

  // Compute global beatOffsetSec mapped back to t = 0 of the audio file
  const periodSec = 60 / top.exactBpm;
  const analysisStartSec = analysisStartSample / fs;
  const frameLatencySec = (fftSize * 0.68) / fs;
  const rawPhaseSec =
    analysisStartSec + (top.fold ? (top.fold.phaseFrames * hopSize) / fs : 0) + frameLatencySec;
  const beatOffsetSec =
    Math.round((((rawPhaseSec % periodSec) + periodSec) % periodSec) * 1000) / 1000;

  // Normalize top-3 candidate scores to 0..100 for UI readability
  const maxCandScore = Math.max(1e-9, top.score);
  const candidates = refined.map((c) => ({
    bpm: c.bpm,
    score: Math.round(clamp((c.score / maxCandScore) * 100, 1, 100)),
  }));

  return {
    bpm,
    bpmInt,
    halfTimeBpm: Math.round((bpm / 2) * 10) / 10,
    doubleTimeBpm: Math.round((bpm * 2) * 10) / 10,
    confidence,
    candidates,
    beatOffsetSec,
  };
}

/* ==========================================================================
   MUSICAL KEY & CHROMAGRAM ENGINE
   (8192-PT FFT HPCP + BASS-ROOT DISAMBIGUATOR + MULTI-PROFILE ENSEMBLE)
   ========================================================================== */

/**
 * Pearson product-moment correlation between two equal-length arrays.
 */
function pearsonCorrelation(x, y) {
  const n = x.length;
  let meanX = 0;
  let meanY = 0;
  for (let i = 0; i < n; i++) {
    meanX += x[i];
    meanY += y[i];
  }
  meanX /= n;
  meanY /= n;

  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denom = Math.sqrt(denX * denY);
  return denom > 1e-12 ? num / denom : 0;
}

/**
 * Detect Musical Key, Chromagram (12 normalized floats), Camelot & Open Key codes,
 * compatible keys, confidence (0–99%), micro-tuning deviation in cents, and top 4 candidates.
 */
export function detectKey(monoSamples, sampleRate, options = {}) {
  const fs = Number(sampleRate) || 11025;
  const totalSamples = monoSamples ? monoSamples.length : 0;
  const fftSize = 8192; // binHz ≈ 1.35 Hz at 11,025 Hz — resolves 808/bass cleanly down to ~40 Hz!
  const maxFrames = options.maxFrames ?? 88;
  const minFreq = options.minFreq ?? 40;
  const maxFreq = options.maxFreq ?? 2600;
  const bassMaxFreq = 210;

  const emptyKey = () => ({
    ...getKeyInfo(0, 'major'),
    confidence: 0,
    chroma: new Array(12).fill(0),
    tuningCents: 0,
    candidates: [],
  });

  if (totalSamples < 512) {
    return emptyKey();
  }

  // Span 4%–96% for full tracks (>= 24s) to preserve structural intro/outro tonic anchors
  // while skipping dead fade silence; span 0%–100% for shorter loops.
  const durationSec = totalSamples / fs;
  const spanStart = durationSec >= 24.0 ? Math.floor(totalSamples * 0.04) : 0;
  const spanEnd = durationSec >= 24.0 ? Math.floor(totalSamples * 0.96) : totalSamples;
  const available = Math.max(1, spanEnd - spanStart);

  // Candidate frame grid (up to 130 positions), filtered to active frames and capped at maxFrames
  const candCount =
    available <= fftSize
      ? 1
      : Math.min(130, Math.max(1, Math.floor((available - fftSize) / (fftSize >> 2)) + 1));

  const candStarts = new Int32Array(candCount);
  const candRms = new Float32Array(candCount);
  let maxRms = 0;

  if (candCount === 1) {
    candStarts[0] = Math.max(0, Math.min(totalSamples - fftSize, spanStart));
  } else {
    const maxStart = Math.max(spanStart, spanEnd - fftSize);
    const step = (maxStart - spanStart) / (candCount - 1);
    for (let i = 0; i < candCount; i++) {
      candStarts[i] = Math.floor(spanStart + i * step);
    }
  }

  // Fast strided RMS check across candidate frames
  for (let i = 0; i < candCount; i++) {
    const start = candStarts[i];
    const len = Math.min(fftSize, totalSamples - start);
    let sq = 0;
    let cnt = 0;
    for (let j = 0; j < len; j += 4) {
      const s = monoSamples[start + j];
      sq += s * s;
      cnt++;
    }
    const r = Math.sqrt(sq / Math.max(1, cnt));
    candRms[i] = r;
    if (r > maxRms) maxRms = r;
  }

  if (maxRms < 1e-5) {
    return emptyKey();
  }

  // Keep only active non-silent frames, subsampled evenly to at most maxFrames
  const rmsGate = Math.max(1e-5, maxRms * 0.07);
  const allActive = [];
  for (let i = 0; i < candCount; i++) {
    if (candRms[i] >= rmsGate) {
      allActive.push(i);
    }
  }
  if (allActive.length === 0) {
    return emptyKey();
  }

  const activeIndices = [];
  if (allActive.length <= maxFrames) {
    for (let i = 0; i < allActive.length; i++) activeIndices.push(allActive[i]);
  } else {
    const step = (allActive.length - 1) / (maxFrames - 1);
    for (let i = 0; i < maxFrames; i++) {
      activeIndices.push(allActive[Math.round(i * step)]);
    }
  }

  const numActive = activeIndices.length;
  const { hann } = getFftPlan(fftSize);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const halfBins = fftSize >> 1;
  const binHz = fs / fftSize;

  const minBin = Math.max(2, Math.floor(minFreq / binHz));
  const maxBin = Math.min(halfBins - 2, Math.ceil(maxFreq / binHz));
  const floorHalfWin = 7;
  const specLo = Math.max(1, minBin - floorHalfWin);
  const specHi = Math.min(halfBins - 1, maxBin + floorHalfWin);

  const power = new Float32Array(halfBins);
  const mag = new Float32Array(halfBins);
  const magPrefix = new Float64Array(halfBins + 1);

  // Pass 1: Extract tonal HPCP peaks per active frame + estimate global A4 micro-tuning
  const frameRecords = new Array(numActive);
  let tuneCos = 0;
  let tuneSin = 0;
  let tuneMag = 0;

  for (let aIdx = 0; aIdx < numActive; aIdx++) {
    const cIdx = activeIndices[aIdx];
    const start = candStarts[cIdx];
    const len = Math.min(fftSize, totalSamples - start);
    const rmsNorm = candRms[cIdx] / maxRms;
    const posNorm = numActive > 1 ? aIdx / (numActive - 1) : 0.5;

    for (let j = 0; j < len; j++) {
      re[j] = monoSamples[start + j] * hann[j];
      im[j] = 0;
    }
    for (let j = len; j < fftSize; j++) {
      re[j] = 0;
      im[j] = 0;
    }

    fftRadix2(re, im);

    // Compute magnitude, power, and magnitude prefix sum for O(1) flanking noise floor
    magPrefix[specLo] = 0;
    let totalFramePower = 0;
    for (let k = specLo; k <= specHi; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      const m = Math.sqrt(p);
      power[k] = p;
      mag[k] = m;
      magPrefix[k + 1] = magPrefix[k] + m;
      if (k >= minBin && k <= maxBin) totalFramePower += p;
    }

    const peaks = [];
    let tonalPowerSum = 0;
    let bassTonalPowerSum = 0;

    for (let k = minBin; k <= maxBin; k++) {
      const pk = power[k];
      if (pk <= 1e-18 || pk <= power[k - 1] || pk < power[k + 1]) continue;

      // Flanking local noise floor across ±7 bins (excluding 3-bin Hann mainlobe [k-1..k+1])
      const leftLo = Math.max(specLo, k - floorHalfWin);
      const leftHi = Math.max(leftLo, k - 2);
      const rightLo = Math.min(specHi, k + 2);
      const rightHi = Math.min(specHi, k + floorHalfWin);
      const leftCount = Math.max(0, leftHi - leftLo + 1);
      const rightCount = Math.max(0, rightHi - rightLo + 1);
      const flankCount = Math.max(1, leftCount + rightCount);

      const flankMagSum =
        (leftCount > 0 ? magPrefix[leftHi + 1] - magPrefix[leftLo] : 0) +
        (rightCount > 0 ? magPrefix[rightHi + 1] - magPrefix[rightLo] : 0);
      const magFloor = flankMagSum / flankCount;
      // Squaring flanking mean magnitude gives a noise floor robust to nearby chord tones
      // (for broadband white noise, (E[R])^2 ≈ 0.785 * E[R^2]; threshold 2.25x ≈ 1.77x mean power)
      const localFloor = magFloor * magFloor;

      if (pk <= localFloor * 2.25) continue;

      // Parabolic log-power sub-bin interpolation for exact peak frequency
      const lp = Math.log(Math.max(1e-20, power[k - 1]));
      const cp = Math.log(Math.max(1e-20, pk));
      const rp = Math.log(Math.max(1e-20, power[k + 1]));
      const denom = lp - 2 * cp + rp;
      const delta = Math.abs(denom) > 1e-12 ? clamp(0.5 * (lp - rp) / denom, -0.5, 0.5) : 0;
      const freq = (k + delta) * binHz;
      if (freq < minFreq || freq > maxFreq) continue;

      const snr = pk / (localFloor + 1e-20);
      const prominence = clamp((snr - 2.25) / 5.5, 0.08, 1.0);
      const excessPower = Math.max(0, pk - localFloor);
      const tonalAmp = Math.sqrt(excessPower) * prominence;
      tonalPowerSum += excessPower;

      // Accumulate global tuning reference from strong mid-register tonal peaks (110–1800 Hz)
      if (freq >= 110 && freq <= 1800 && snr > 4.5) {
        const midiEst = 69 + 12 * Math.log2(freq / 440);
        const dev = midiEst - Math.round(midiEst);
        const tw = tonalAmp;
        tuneCos += tw * Math.cos(2 * Math.PI * dev);
        tuneSin += tw * Math.sin(2 * Math.PI * dev);
        tuneMag += tw;
      }

      // Harmonic Overtone Attenuation for upper frequencies:
      // Prevents loud 3rd harmonics (Perfect Fifth!) and 5th harmonics (Major Third!)
      // on sawtooth/square synths & distorted bass from pulling the detected key up a fifth!
      let harmonicDiscount = 1.0;
      const peakMag = mag[k];
      if (freq > 220 && freq / 3 >= minFreq) {
        const k3 = Math.round((freq / 3) / binHz);
        if (k3 >= specLo + 1 && k3 <= specHi - 1) {
          const f3Mag = Math.max(mag[k3 - 1], mag[k3], mag[k3 + 1]);
          if (f3Mag > peakMag * 0.42) {
            harmonicDiscount /= 1 + 2.4 * clamp(f3Mag / (peakMag + 1e-9), 0, 1.8);
          }
        }
      }
      if (freq > 260 && freq / 2 >= minFreq) {
        const k2 = Math.round((freq / 2) / binHz);
        if (k2 >= specLo + 1 && k2 <= specHi - 1) {
          const f2Mag = Math.max(mag[k2 - 1], mag[k2], mag[k2 + 1]);
          if (f2Mag > peakMag * 0.52) {
            harmonicDiscount *= 0.72;
          }
        }
      }
      if (freq > 280 && freq / 5 >= minFreq) {
        const k5 = Math.round((freq / 5) / binHz);
        if (k5 >= specLo + 1 && k5 <= specHi - 1) {
          const f5Mag = Math.max(mag[k5 - 1], mag[k5], mag[k5 + 1]);
          if (f5Mag > peakMag * 0.65) {
            harmonicDiscount *= 0.48;
          }
        }
      }

      const isBass = freq <= bassMaxFreq;
      if (isBass) bassTonalPowerSum += excessPower;

      peaks.push({
        freq,
        amp: tonalAmp * harmonicDiscount,
        bassAmp: isBass ? tonalAmp : 0,
        isBass,
      });
    }

    const tonalClarity = totalFramePower > 1e-18 ? clamp(tonalPowerSum / totalFramePower, 0, 1) : 0;
    frameRecords[aIdx] = {
      peaks,
      rmsNorm,
      posNorm,
      tonalClarity,
      tonalPowerSum,
      bassTonalPowerSum,
    };
  }

  // Global micro-tuning offset around A4 = 440 Hz (supports 432 Hz / tape varispeed masters)
  const tuneCoherence = tuneMag > 0 ? Math.hypot(tuneCos, tuneSin) / tuneMag : 0;
  let tuningOffsetSemi = 0;
  if (tuneCoherence > 0.30) {
    tuningOffsetSemi = clamp(Math.atan2(tuneSin, tuneCos) / (2 * Math.PI), -0.42, 0.42);
  }
  const tuningCents = Math.round(tuningOffsetSemi * 100);

  // Pass 2: Build Per-Frame L2-Normalized HPCP Chroma + Dedicated Bass/808 Root Chromagram (40–210 Hz)
  const globalChroma = new Float64Array(12);
  const globalBassChroma = new Float64Array(12);
  const frameChroma = new Float64Array(12);
  const frameBass = new Float64Array(12);

  let totalTonalPowerAll = 0;
  let totalBassPowerAll = 0;
  let activeChromaFrames = 0;
  let activeBassFrames = 0;

  for (let aIdx = 0; aIdx < numActive; aIdx++) {
    const rec = frameRecords[aIdx];
    if (!rec || rec.peaks.length === 0) continue;

    frameChroma.fill(0);
    frameBass.fill(0);
    totalTonalPowerAll += rec.tonalPowerSum;
    totalBassPowerAll += rec.bassTonalPowerSum;

    for (let pIdx = 0; pIdx < rec.peaks.length; pIdx++) {
      const pk = rec.peaks[pIdx];
      const freq = pk.freq;

      // Subtle perceptual band curve: warm low-mid fundamental emphasis, gentle top rolloff
      let bandWeight = 1.0;
      if (freq < 60) {
        bandWeight = 0.72 + 0.28 * ((freq - 40) / 20);
      } else if (freq > 1500) {
        bandWeight = Math.max(0.32, 1.0 - ((freq - 1500) / 1400) * 0.68);
      }

      const midi = 69 + 12 * Math.log2(freq / 440) - tuningOffsetSemi;
      const nearest = Math.round(midi);
      const dist = midi - nearest; // [-0.5, +0.5] semitones
      const pc0 = ((nearest % 12) + 12) % 12;

      // Crisp cos^2 HPCP pitch-class proximity window (zeroes cleanly at ±0.5 semitones)
      const w0 = Math.cos(Math.PI * dist);
      const w0Sq = w0 * w0;

      const cVal = pk.amp * bandWeight;
      frameChroma[pc0] += cVal * w0Sq;

      if (Math.abs(dist) > 0.22) {
        const adjDir = dist >= 0 ? 1 : -1;
        const pc1 = (pc0 + adjDir + 12) % 12;
        const adjDist = 1 - Math.abs(dist);
        const w1 = Math.cos(Math.PI * clamp(adjDist, 0, 0.5));
        frameChroma[pc1] += cVal * (w1 * w1) * 0.5;
      }

      // Dedicated Bass / 808 Root accumulation (40–210 Hz):
      // Prefer lower fundamentals slightly so 808/bass root stands above its own 2nd harmonic
      if (pk.isBass && pk.bassAmp > 0) {
        const lowBias = 1.0 + 0.55 * clamp((160 - freq) / 110, 0, 1);
        frameBass[pc0] += pk.bassAmp * lowBias * w0Sq;
      }
    }

    // Per-frame L2 normalization so a single loud chorus stab cannot drown out the chord progression
    let l2Sq = 0;
    for (let i = 0; i < 12; i++) l2Sq += frameChroma[i] * frameChroma[i];
    if (l2Sq > 1e-18) {
      const invL2 = 1 / Math.sqrt(l2Sq);
      // Weight by tonal clarity (strips drum-only frames) & mild RMS curve
      const frameWeight = (0.25 + 0.75 * rec.tonalClarity) * Math.pow(rec.rmsNorm, 0.35);
      for (let i = 0; i < 12; i++) {
        globalChroma[i] += frameChroma[i] * invL2 * frameWeight;
      }
      activeChromaFrames++;
    }

    // Per-frame L2 normalization for Bass/Root chromagram + structural anchor bonus (first/last 15%)
    let bassL2Sq = 0;
    for (let i = 0; i < 12; i++) bassL2Sq += frameBass[i] * frameBass[i];
    if (bassL2Sq > 1e-18) {
      const invBassL2 = 1 / Math.sqrt(bassL2Sq);
      const anchorBonus = rec.posNorm <= 0.15 || rec.posNorm >= 0.85 ? 1.40 : 1.0;
      const bassFrameWeight =
        anchorBonus * (0.30 + 0.70 * rec.tonalClarity) * Math.pow(rec.rmsNorm, 0.35);
      for (let i = 0; i < 12; i++) {
        globalBassChroma[i] += frameBass[i] * invBassL2 * bassFrameWeight;
      }
      activeBassFrames++;
    }
  }

  if (activeChromaFrames === 0) {
    return emptyKey();
  }

  // Normalize global HPCP chroma to [0..1]
  let maxChroma = 0;
  for (let i = 0; i < 12; i++) {
    if (globalChroma[i] > maxChroma) maxChroma = globalChroma[i];
  }
  const chroma = new Array(12).fill(0);
  if (maxChroma > 1e-12) {
    for (let i = 0; i < 12; i++) {
      chroma[i] = Math.round((globalChroma[i] / maxChroma) * 10000) / 10000;
    }
  }

  // Normalize Bass/Root chromagram to [0..1] and calibrate bass clarity scale
  let maxBass = 0;
  let sumBass = 0;
  for (let i = 0; i < 12; i++) {
    if (globalBassChroma[i] > maxBass) maxBass = globalBassChroma[i];
    sumBass += globalBassChroma[i];
  }
  const bassChroma = new Float64Array(12);
  let bassScale = 0;
  if (maxBass > 1e-12 && activeBassFrames >= Math.max(1, Math.floor(activeChromaFrames * 0.25))) {
    for (let i = 0; i < 12; i++) {
      bassChroma[i] = globalBassChroma[i] / maxBass;
    }
    const bassEnergyRatio = totalTonalPowerAll > 1e-18 ? totalBassPowerAll / totalTonalPowerAll : 0;
    const meanBass = sumBass / 12;
    const bassConcentration = maxBass / Math.max(1e-12, meanBass);
    // Bassless bright tracks have low energyRatio -> bassScale ~ 0;
    // Real bass/808 tracks have clear peaked bass roots -> bassScale ~ 0.7..1.0
    const presenceFactor = clamp(bassEnergyRatio / 0.08, 0, 1);
    const peakFactor = clamp((bassConcentration - 1.4) / 2.2, 0, 1);
    bassScale = presenceFactor * peakFactor;
  }

  // Pass 3: Multi-Profile Ensemble Scoring (Sha'ath 50% + Temperley 30% + Krumhansl-Kessler 20%)
  // + Calibrated Bass-Root Tonic Disambiguator (solves Relative Major vs Relative Minor!)
  const hypotheses = [];
  const rotated = new Float64Array(12);

  for (let tonic = 0; tonic < 12; tonic++) {
    for (let i = 0; i < 12; i++) {
      rotated[i] = chroma[(tonic + i) % 12];
    }

    const rMaj =
      0.50 * pearsonCorrelation(rotated, PROFILE_SHAATH_MAJOR) +
      0.30 * pearsonCorrelation(rotated, PROFILE_TEMPERLEY_MAJOR) +
      0.20 * pearsonCorrelation(rotated, PROFILE_KK_MAJOR);

    const rMin =
      0.50 * pearsonCorrelation(rotated, PROFILE_SHAATH_MINOR) +
      0.30 * pearsonCorrelation(rotated, PROFILE_TEMPERLEY_MINOR) +
      0.20 * pearsonCorrelation(rotated, PROFILE_KK_MINOR);

    const bassTieBreaker =
      bassScale * (0.14 * bassChroma[tonic] + 0.04 * bassChroma[(tonic + 7) % 12]);

    hypotheses.push({
      pitchClass: tonic,
      mode: 'major',
      ensembleR: rMaj,
      correlation: rMaj + bassTieBreaker,
    });
    hypotheses.push({
      pitchClass: tonic,
      mode: 'minor',
      ensembleR: rMin,
      correlation: rMin + bassTieBreaker,
    });
  }

  hypotheses.sort((a, b) => b.correlation - a.correlation);

  const best = hypotheses[0];
  const runnerUp = hypotheses[1];
  const r1 = best.ensembleR;
  const s1 = best.correlation;
  const s2 = runnerUp ? runnerUp.correlation : 0;
  const margin = Math.max(0, s1 - s2);

  // Calibrated confidence (0..99%): balances absolute ensemble fit AND separation from runner-up
  const strengthScore = clamp((r1 - 0.14) / 0.72, 0, 1);
  const sepScore = clamp(margin / 0.18, 0, 1);
  const confidence = s1 <= 0
    ? 0
    : Math.round(clamp((0.62 * strengthScore + 0.38 * sepScore) * 100, 10, 99));

  const bestInfo = getKeyInfo(best.pitchClass, best.mode);

  const candidates = hypotheses.slice(0, 4).map((h) => {
    const info = getKeyInfo(h.pitchClass, h.mode);
    return {
      key: info.key,
      keySharp: info.keySharp,
      keyFlat: info.keyFlat,
      shortName: info.shortName,
      shortNameSharp: info.shortNameSharp,
      shortNameFlat: info.shortNameFlat,
      tonic: info.tonic,
      pitchClass: info.pitchClass,
      mode: info.mode,
      camelot: info.camelot,
      openKey: info.openKey,
      correlation: Math.round(h.correlation * 1000) / 1000,
      scorePct: Math.round(clamp(((clamp(h.correlation, -1, 1) + 1) / 2) * 100, 0, 100)),
    };
  });

  return {
    ...bestInfo,
    confidence,
    chroma,
    tuningCents,
    candidates,
  };
}

/* ==========================================================================
   UNIFIED ANALYSIS ENTRY POINT & BATCH EXPORTERS
   ========================================================================== */

/**
 * Full analysis entry point: accepts mono Float32Array or array of channel Float32Arrays
 * plus sampleRate, returning BPM, Key, Chromagram, Timings, and Waveform Peaks.
 */
export function analyzeAudio(channelsOrMono, sampleRate, options = {}) {
  const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  const fs = Number(sampleRate) || 44100;
  const channels = Array.isArray(channelsOrMono) ? channelsOrMono : [channelsOrMono];
  const numSamples = channels[0] ? channels[0].length : 0;
  const durationSec = numSamples / fs;

  const { samples: mono, sampleRate: analysisRate } = mixAndDecimate(channels, fs, 11025);
  const bpmResult = detectBpm(mono, analysisRate, options);
  const keyResult = detectKey(mono, analysisRate, options);
  const timings = computeDelayTimings(bpmResult.bpm || 120);
  const waveformPeaks = computeWaveformPeaks(channels, options.waveformBuckets ?? 320);

  const t1 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

  return {
    durationSec,
    sampleRate: fs,
    analysisSampleRate: analysisRate,
    channels: channels.length,
    bpm: bpmResult,
    key: keyResult,
    timings,
    waveformPeaks,
    analysisMs: Math.round((t1 - t0) * 10) / 10,
  };
}

/**
 * Convenience wrapper for Web Audio API AudioBuffer objects in the browser.
 */
export function analyzeAudioBuffer(audioBuffer, options = {}) {
  const channels = [];
  for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
    channels.push(audioBuffer.getChannelData(c));
  }
  return analyzeAudio(channels, audioBuffer.sampleRate, options);
}

/**
 * Escape a field for RFC 4180 CSV export.
 */
function csvCell(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Export analyzed session queue to CSV string.
 */
export function exportQueueToCsv(tracks, accidentalStyle = 'auto') {
  const headers = [
    'Track',
    'Duration',
    'BPM',
    'BPM Confidence (%)',
    'Key',
    'Camelot',
    'Open Key',
    'Key Confidence (%)',
    'Relative Key',
    'Tag',
  ];

  const rows = [headers.map(csvCell).join(',')];
  for (const t of tracks) {
    const activeBpm = t.effectiveBpm ?? t.analysis?.bpm?.bpm ?? 0;
    const keyInfo = t.effectiveKeyInfo ?? t.analysis?.key ?? null;
    const keyStr = keyInfo ? formatKeyName(keyInfo, accidentalStyle, false) : '—';
    rows.push(
      [
        t.name,
        formatTime(t.analysis?.durationSec ?? 0),
        activeBpm ? activeBpm.toFixed(1) : '—',
        t.analysis?.bpm?.confidence ?? 0,
        keyStr,
        keyInfo?.camelot ?? '—',
        keyInfo?.openKey ?? '—',
        t.analysis?.key?.confidence ?? 0,
        keyInfo?.relativeKey ?? '—',
        formatTrackTag(activeBpm, keyInfo, accidentalStyle),
      ]
        .map(csvCell)
        .join(',')
    );
  }
  return rows.join('\n');
}

/**
 * Export analyzed session queue to clean Markdown table report.
 */
export function exportQueueToMarkdown(tracks, accidentalStyle = 'auto') {
  const dateStr = new Date().toISOString().slice(0, 10);
  const lines = [
    '# BPM & Key Analysis — Saint Gordon Collective',
    '',
    `Generated: ${dateStr} · Tracks: ${tracks.length}`,
    '',
    '| # | Track | Duration | BPM | Key | Camelot | Open Key | Confidence (BPM / Key) |',
    '|---:|---|---:|---:|---|---|---|---|',
  ];

  tracks.forEach((t, idx) => {
    const safeName = String(t.name || '').replace(/\|/g, '\\|');
    const activeBpm = t.effectiveBpm ?? t.analysis?.bpm?.bpm ?? 0;
    const keyInfo = t.effectiveKeyInfo ?? t.analysis?.key ?? null;
    const keyStr = keyInfo ? formatKeyName(keyInfo, accidentalStyle, false) : '—';
    const bpmConf = t.analysis?.bpm?.confidence ?? 0;
    const keyConf = t.analysis?.key?.confidence ?? 0;
    lines.push(
      `| ${idx + 1} | ${safeName} | ${formatTime(t.analysis?.durationSec ?? 0)} | ${
        activeBpm ? activeBpm.toFixed(1) : '—'
      } | ${keyStr} | **${keyInfo?.camelot ?? '—'}** | ${
        keyInfo?.openKey ?? '—'
      } | ${bpmConf}% / ${keyConf}% |`
    );
  });

  lines.push('', '---', '*Analyzed 100% client-side with [BPM & Key Finder](https://saintgordon.github.io/bpm-key-finder/) by Saint Gordon Collective.*');
  return lines.join('\n');
}

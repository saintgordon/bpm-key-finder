/**
 * BPM & Key Finder — Pure Studio DSP Engine (Zero DOM Dependencies)
 *
 * Designed for Saint Gordon Collective (TOOL / 005).
 * Runs identically in modern browsers (Web Audio decoded Float32Arrays) and Node.js tests.
 *
 * Algorithms:
 *  1. Anti-aliased mono downsampling (~11,025–12,000 Hz) via zero-phase triangular FIR decimation.
 *  2. Multi-band onset strength function (40–220 Hz low + 220–4000 Hz mid/high) using
 *     1024-pt Hann-windowed radix-2 FFT (256-pt hop) + log spectral compression + adaptive local mean.
 *  3. Unbiased autocorrelation over 60–195 BPM + forward harmonic comb reinforcement +
 *     gentle perceptual tempo prior (centered at 120 BPM) + fine phase-folded tempo refinement (0.1 BPM)
 *     and beat-1 offset estimation (beatOffsetSec).
 *  4. 4096-pt Hann-windowed radix-2 FFT chromagram across active non-silent body (10%–90%),
 *     frame-RMS weighted, 55–2600 Hz with micro-tuning offset compensation and Gaussian pitch binning,
 *     correlated via Pearson's r against Sha'ath modern pop/electronic/hip-hop key profiles.
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

// Sha'ath (2011) pop / electronic / modern master key-profile templates
// Strongly captures Aeolian (natural minor) flat-7th & modern pop/hip-hop tonalities
const PROFILE_MAJOR = [6.6, 2.0, 3.5, 2.3, 4.6, 4.0, 2.5, 5.2, 2.4, 3.7, 2.3, 3.4];
const PROFILE_MINOR = [6.5, 2.7, 3.5, 5.4, 2.6, 3.5, 2.5, 5.2, 4.0, 2.7, 4.3, 3.2];

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
   BPM DETECTION ENGINE (MULTI-BAND ONSET + AUTOCORRELATION + PHASE REFINE)
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

  // Circular 3-tap smoothing [0.25, 0.5, 0.25] for robustness against slight human micro-timing
  let bestVal = -1;
  let bestBin = 0;
  for (let b = 0; b < numBins; b++) {
    const prev = bins[(b - 1 + numBins) % numBins];
    const curr = bins[b];
    const next = bins[(b + 1) % numBins];
    const smoothed = 0.25 * prev + 0.5 * curr + 0.25 * next;
    if (smoothed > bestVal) {
      bestVal = smoothed;
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
  return { score: bestVal, peakRatio, phaseFrames, meanVal };
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
 * Detect tempo (BPM), half/double time, top 3 candidates, confidence (0–100),
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

  // Choose FFT/hop sizes calibrated to ~11025–12000 Hz (1024 / 256 -> ~43.07 fps)
  const fftSize = fs >= 10000 ? 1024 : 512;
  const hopSize = fftSize >> 2;
  const fps = fs / hopSize;

  // For very long tracks (> 120s), analyze a 120-second active window (centered on the body)
  // while keeping global startSample so beatOffsetSec maps back to t = 0 of the full file!
  const maxWindowSamples = Math.floor(fs * 120);
  let analysisStartSample = 0;
  let analysisEndSample = totalSamples;
  if (totalSamples > maxWindowSamples) {
    // Pick the 120s slice spanning from ~12% into the track
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

  // Multi-band bin boundaries: Low (40–220 Hz) for kicks, Mid/High (220–4000 Hz) for snares/hats/transients
  const binHz = fs / fftSize;
  const lowStart = Math.max(1, Math.floor(40 / binHz));
  const lowEnd = Math.min(halfBins - 1, Math.max(lowStart + 1, Math.round(220 / binHz)));
  const highStart = Math.min(halfBins - 1, lowEnd + 1);
  const highEnd = Math.min(halfBins - 1, Math.max(highStart + 1, Math.round(4000 / binHz)));

  const lowCount = Math.max(1, lowEnd - lowStart + 1);
  const highCount = Math.max(1, highEnd - highStart + 1);

  const prevMag = new Float32Array(halfBins);
  const fluxLow = new Float32Array(numFrames);
  const fluxHigh = new Float32Array(numFrames);

  const logGamma = 10.0;
  let energyLowSq = 0;
  let energyHighSq = 0;

  for (let f = 0; f < numFrames; f++) {
    const offset = analysisStartSample + f * hopSize;
    for (let i = 0; i < fftSize; i++) {
      re[i] = monoSamples[offset + i] * hann[i];
      im[i] = 0;
    }
    fftRadix2(re, im);

    let sumLow = 0;
    let sumHigh = 0;

    for (let k = lowStart; k <= lowEnd; k++) {
      const mag = Math.log1p(logGamma * Math.hypot(re[k], im[k]));
      if (f > 0) {
        const diff = mag - prevMag[k];
        if (diff > 0) sumLow += diff;
      }
      prevMag[k] = mag;
    }

    for (let k = highStart; k <= highEnd; k++) {
      const mag = Math.log1p(logGamma * Math.hypot(re[k], im[k]));
      if (f > 0) {
        const diff = mag - prevMag[k];
        if (diff > 0) sumHigh += diff;
      }
      prevMag[k] = mag;
    }

    const vLow = sumLow / lowCount;
    const vHigh = sumHigh / highCount;
    fluxLow[f] = vLow;
    fluxHigh[f] = vHigh;
    energyLowSq += vLow * vLow;
    energyHighSq += vHigh * vHigh;
  }

  const rmsLow = Math.sqrt(energyLowSq / numFrames);
  const rmsHigh = Math.sqrt(energyHighSq / numFrames);

  if (rmsLow < 1e-6 && rmsHigh < 1e-6) {
    return emptyResult;
  }

  // Combine normalized multi-band flux (gracefully handles kick-only OR click/hat-only audio)
  const hasLow = rmsLow > 1e-5;
  const hasHigh = rmsHigh > 1e-5;
  const wLow = hasLow && hasHigh ? 0.55 : hasLow ? 1.0 : 0.0;
  const wHigh = hasLow && hasHigh ? 0.45 : hasHigh ? 1.0 : 0.0;

  const flux = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    const nl = hasLow ? fluxLow[f] / rmsLow : 0;
    const nh = hasHigh ? fluxHigh[f] / rmsHigh : 0;
    flux[f] = wLow * nl + wHigh * nh;
  }

  // Adaptive local-mean thresholding (O(N) via prefix sums)
  const prefix = new Float64Array(numFrames + 1);
  for (let f = 0; f < numFrames; f++) {
    prefix[f + 1] = prefix[f] + flux[f];
  }

  const meanHalfWin = Math.max(4, Math.round(0.35 * fps));
  const odf = new Float32Array(numFrames);
  let odfEnergy = 0;
  for (let f = 0; f < numFrames; f++) {
    const lo = Math.max(0, f - meanHalfWin);
    const hi = Math.min(numFrames - 1, f + meanHalfWin);
    const localMean = (prefix[hi + 1] - prefix[lo]) / (hi - lo + 1);
    const val = flux[f] - localMean;
    if (val > 0) {
      odf[f] = val;
      odfEnergy += val * val;
    }
  }

  if (odfEnergy < 1e-8) {
    return emptyResult;
  }

  // Unbiased autocorrelation up to 4x the slowest tempo lag (60 BPM)
  const minLag = Math.max(2, Math.floor((60 * fps) / maxBpm));
  const maxLagSearch = Math.ceil((60 * fps) / minBpm);
  const maxLagAc = Math.min(Math.floor(numFrames * 0.65), maxLagSearch * 4 + 4);

  const ac = new Float32Array(maxLagAc + 1);
  const ac0 = odfEnergy / numFrames;
  ac[0] = 1.0;

  for (let lag = 1; lag <= maxLagAc; lag++) {
    let sum = 0;
    const limit = numFrames - lag;
    for (let n = 0; n < limit; n++) {
      sum += odf[n] * odf[n + lag];
    }
    ac[lag] = sum / (limit * ac0);
  }

  // Score every tempo from minBpm to maxBpm at 0.5 BPM grid using forward harmonic comb + gentle prior
  const bpmStep = 0.5;
  const gridCount = Math.floor((maxBpm - minBpm) / bpmStep) + 1;
  const gridBpm = new Float32Array(gridCount);
  const gridRaw = new Float32Array(gridCount);
  const gridScore = new Float32Array(gridCount);

  for (let i = 0; i < gridCount; i++) {
    const bpm = minBpm + i * bpmStep;
    gridBpm[i] = bpm;
    const lag = (60 * fps) / bpm;

    const r1 = sampleLinear(ac, lag);
    const r2 = lag * 2 <= maxLagAc ? sampleLinear(ac, lag * 2) : r1;
    const r3 = lag * 3 <= maxLagAc ? sampleLinear(ac, lag * 3) : r1;
    const r4 = lag * 4 <= maxLagAc ? sampleLinear(ac, lag * 4) : r2;
    const rHalf = lag * 0.5 >= 2 ? sampleLinear(ac, lag * 0.5) : 0;

    // Forward multiples reinforce true fundamental beat without falsely boosting half-tempo;
    // capped sub-harmonic bonus helps subdivided grooves without overriding half-time suppression.
    const comb =
      0.54 * r1 +
      0.24 * r2 +
      0.10 * r3 +
      0.06 * r4 +
      0.06 * Math.min(r1, rHalf);

    const logDist = Math.log2(bpm / priorCenter);
    const prior = Math.exp(-0.5 * (logDist / priorSigma) * (logDist / priorSigma));

    gridRaw[i] = comb;
    gridScore[i] = comb * prior;
  }

  // Extract top local maxima (separated by at least 6 BPM)
  const localPeaks = [];
  for (let i = 1; i < gridCount - 1; i++) {
    if (gridScore[i] >= gridScore[i - 1] && gridScore[i] >= gridScore[i + 1] && gridScore[i] > 0) {
      // Parabolic interpolation on the 0.5-BPM grid
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
    // Fallback to global argmax on grid
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
      if (distinctPeaks.length >= 4) break;
    }
  }

  // Fine phase-folded refinement over active ~35s segment (delivers <= 0.1 BPM precision + beatOffsetSec)
  const foldMaxFrames = Math.min(numFrames, Math.floor(35 * fps));
  let foldStart = 0;
  if (numFrames > foldMaxFrames) {
    // Find the most rhythmically active 35s slice
    let bestWinEnergy = -1;
    const step = Math.max(1, Math.floor(fps * 2));
    for (let s = 0; s <= numFrames - foldMaxFrames; s += step) {
      const e = prefix[s + foldMaxFrames] - prefix[s];
      if (e > bestWinEnergy) {
        bestWinEnergy = e;
        foldStart = s;
      }
    }
  }
  const foldEnd = Math.min(numFrames, foldStart + foldMaxFrames);

  const refineCandidate = (cand) => {
    const center = cand.bpm;
    const loBpm = Math.max(minBpm, center - 3.0);
    const hiBpm = Math.min(maxBpm, center + 3.0);

    // Coarse 0.1 BPM sweep around autocorrelation peak
    let bestBpm = center;
    let bestFoldScore = -1;
    let bestFold = null;

    for (let b = loBpm; b <= hiBpm + 1e-6; b += 0.1) {
      const period = (60 * fps) / b;
      const fold = evalPhaseFold(odf, foldStart, foldEnd, period, 48);
      // Slight tie-breaker towards autocorrelation peak to guard against noise
      const distPenalty = 1 - 0.012 * Math.abs(b - center);
      const val = fold.score * distPenalty;
      if (val > bestFoldScore) {
        bestFoldScore = val;
        bestBpm = b;
        bestFold = fold;
      }
    }

    // Ultra-fine 0.02 BPM sweep around best 0.1 BPM hit
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

  // Compute confidence (0..100%) from autocorrelation periodicity + beat phase sharpness
  const sortedScores = Float32Array.from(gridRaw).sort();
  const medianComb = sortedScores[Math.floor(sortedScores.length * 0.5)] || 0.01;
  const peakToMedian = top.rawComb / Math.max(medianComb, 0.01);
  const acQuality = clamp((peakToMedian - 1.3) / 4.2, 0, 1);
  const phaseSharpness = top.fold ? clamp((top.fold.peakRatio - 1.4) / 3.8, 0, 1) : 0;
  const rawQuality = clamp(top.rawComb / 0.55, 0, 1);
  const confidence = Math.round(
    clamp((0.40 * acQuality + 0.35 * phaseSharpness + 0.25 * rawQuality) * 100, 5, 99)
  );

  // Compute global beatOffsetSec mapped back to t = 0 of the audio file
  // Spectral flux rises sharpest when the transient enters the leading half of the Hann window (~fftSize * 0.68 after frame start)
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
   MUSICAL KEY & CHROMAGRAM ENGINE (4096-PT FFT + SHA'ATH KEY PROFILES)
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
 * compatible keys, confidence (0–100%), micro-tuning deviation in cents, and top 4 candidates.
 */
export function detectKey(monoSamples, sampleRate, options = {}) {
  const fs = Number(sampleRate) || 11025;
  const totalSamples = monoSamples ? monoSamples.length : 0;
  const fftSize = 4096;
  const maxFrames = options.maxFrames ?? 110;
  const minFreq = options.minFreq ?? 55;
  const maxFreq = options.maxFreq ?? 2600;

  if (totalSamples < 512) {
    const fallback = getKeyInfo(0, 'major');
    return {
      ...fallback,
      confidence: 0,
      chroma: new Array(12).fill(0),
      tuningCents: 0,
      candidates: [],
    };
  }

  // Sample evenly across active body:
  // For full tracks (>= 24s), span 10%–90% to avoid fade-ins/outros;
  // for shorter loops/samples (< 24s), preserve bar 1 & final resolution across 0%–100%.
  const durationSec = totalSamples / fs;
  const spanStart = durationSec >= 24.0 ? Math.floor(totalSamples * 0.10) : 0;
  const spanEnd = durationSec >= 24.0 ? Math.floor(totalSamples * 0.90) : totalSamples;
  const available = Math.max(1, spanEnd - spanStart);

  const numFrames =
    available <= fftSize
      ? 1
      : Math.min(maxFrames, Math.max(1, Math.floor((available - fftSize) / (fftSize >> 2)) + 1));

  const frameStarts = new Int32Array(numFrames);
  if (numFrames === 1) {
    frameStarts[0] = Math.max(0, Math.min(totalSamples - fftSize, spanStart));
  } else {
    const maxStart = Math.max(spanStart, spanEnd - fftSize);
    const step = (maxStart - spanStart) / (numFrames - 1);
    for (let i = 0; i < numFrames; i++) {
      frameStarts[i] = Math.floor(spanStart + i * step);
    }
  }

  // Precompute frame RMS to ignore silent intros/breaks and weight frames by loudness
  const frameRms = new Float32Array(numFrames);
  let maxRms = 0;
  for (let i = 0; i < numFrames; i++) {
    const start = frameStarts[i];
    const len = Math.min(fftSize, totalSamples - start);
    let sq = 0;
    for (let j = 0; j < len; j++) {
      const s = monoSamples[start + j];
      sq += s * s;
    }
    const r = Math.sqrt(sq / Math.max(1, len));
    frameRms[i] = r;
    if (r > maxRms) maxRms = r;
  }

  if (maxRms < 1e-5) {
    const fallback = getKeyInfo(0, 'major');
    return {
      ...fallback,
      confidence: 0,
      chroma: new Array(12).fill(0),
      tuningCents: 0,
      candidates: [],
    };
  }

  const { hann } = getFftPlan(fftSize);
  const re = new Float32Array(fftSize);
  const im = new Float32Array(fftSize);
  const binHz = fs / fftSize;
  const minBin = Math.max(1, Math.floor(minFreq / binHz));
  const maxBin = Math.min((fftSize >> 1) - 1, Math.ceil(maxFreq / binHz));

  // Accumulate RMS-weighted power spectrum across all active frames
  const avgPower = new Float64Array(maxBin + 1);
  const rmsGate = Math.max(1e-5, maxRms * 0.06);
  let totalWeight = 0;

  for (let f = 0; f < numFrames; f++) {
    const weight = frameRms[f];
    if (weight < rmsGate) continue;
    totalWeight += weight;

    const start = frameStarts[f];
    const len = Math.min(fftSize, totalSamples - start);
    for (let j = 0; j < len; j++) {
      re[j] = monoSamples[start + j] * hann[j];
      im[j] = 0;
    }
    for (let j = len; j < fftSize; j++) {
      re[j] = 0;
      im[j] = 0;
    }

    fftRadix2(re, im);

    for (let k = minBin; k <= maxBin; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      avgPower[k] += p * weight;
    }
  }

  if (totalWeight <= 0) {
    const fallback = getKeyInfo(0, 'major');
    return {
      ...fallback,
      confidence: 0,
      chroma: new Array(12).fill(0),
      tuningCents: 0,
      candidates: [],
    };
  }

  // Step 1: Estimate slight global tuning deviation around A4 = 440 Hz using tonal spectral peaks
  let tuneCos = 0;
  let tuneSin = 0;
  let tuneMag = 0;
  const tuneMinBin = Math.max(minBin + 1, Math.floor(110 / binHz));
  const tuneMaxBin = Math.min(maxBin - 1, Math.ceil(1800 / binHz));

  for (let k = tuneMinBin; k <= tuneMaxBin; k++) {
    const p = avgPower[k];
    if (p > avgPower[k - 1] && p >= avgPower[k + 1] && p > 0) {
      // Parabolic frequency peak interpolation for sub-bin accuracy
      const lp = Math.log(Math.max(1e-18, avgPower[k - 1]));
      const cp = Math.log(Math.max(1e-18, p));
      const rp = Math.log(Math.max(1e-18, avgPower[k + 1]));
      const denom = lp - 2 * cp + rp;
      const delta = Math.abs(denom) > 1e-12 ? clamp(0.5 * (lp - rp) / denom, -0.5, 0.5) : 0;
      const freq = (k + delta) * binHz;
      const midi = 69 + 12 * Math.log2(freq / 440);
      const dev = midi - Math.round(midi); // [-0.5, +0.5] semitones
      const w = Math.sqrt(p);
      tuneCos += w * Math.cos(2 * Math.PI * dev);
      tuneSin += w * Math.sin(2 * Math.PI * dev);
      tuneMag += w;
    }
  }

  const tuneCoherence = tuneMag > 0 ? Math.hypot(tuneCos, tuneSin) / tuneMag : 0;
  let tuningOffsetSemi = 0;
  if (tuneCoherence > 0.35) {
    tuningOffsetSemi = clamp(Math.atan2(tuneSin, tuneCos) / (2 * Math.PI), -0.42, 0.42);
  }
  const tuningCents = Math.round(tuningOffsetSemi * 100);

  // Step 2: Map FFT bins (55–2600 Hz) onto 12 chromatic pitch classes with Gaussian bin weighting
  // Compensate octave bin density & gently taper sub-65Hz rumble / >1800Hz overtone glare
  const chromaPower = new Float64Array(12);
  const gaussSigma = 0.25; // semitones
  const inv2SigmaSq = 1 / (2 * gaussSigma * gaussSigma);

  for (let k = minBin; k <= maxBin; k++) {
    const freq = k * binHz;
    const p = avgPower[k];
    if (p <= 0) continue;

    // Subtle tonal/band shaping: slight bass warmth for harmonic root clarity, mild rolloff above 1600 Hz
    let bandWeight = 1.0;
    if (freq < 75) {
      bandWeight = 0.6 + 0.4 * ((freq - 55) / 20);
    } else if (freq > 1600) {
      bandWeight = Math.max(0.35, 1.0 - ((freq - 1600) / 1400) * 0.65);
    }

    // Divide by proportional bin-density (bins per semitone ~ freq) gently via 1 / (freq/220)^0.35
    // so upper octaves with many FFT bins don't amplify broadband hiss over fundamentals
    const octaveBalance = 1 / Math.pow(Math.max(0.5, freq / 220), 0.35);
    const weightedPower = p * bandWeight * octaveBalance;

    const midi = 69 + 12 * Math.log2(freq / 440) - tuningOffsetSemi;
    const nearest = Math.round(midi);
    const dist = midi - nearest;
    const pc0 = ((nearest % 12) + 12) % 12;

    const w0 = Math.exp(-dist * dist * inv2SigmaSq);
    chromaPower[pc0] += weightedPower * w0;

    // Smooth spillover into adjacent semitone for detuned / vibrato instruments
    const adjDir = dist >= 0 ? 1 : -1;
    const adjDist = 1 - Math.abs(dist);
    if (adjDist < 0.85) {
      const pc1 = (pc0 + adjDir + 12) % 12;
      const w1 = Math.exp(-adjDist * adjDist * inv2SigmaSq);
      chromaPower[pc1] += weightedPower * w1;
    }
  }

  // Convert accumulated pitch-class power to perceptual linear salience (sqrt) and normalize to [0..1]
  const chromaRaw = new Float64Array(12);
  let maxChroma = 0;
  for (let i = 0; i < 12; i++) {
    chromaRaw[i] = Math.sqrt(Math.max(0, chromaPower[i]));
    if (chromaRaw[i] > maxChroma) maxChroma = chromaRaw[i];
  }

  const chroma = new Array(12).fill(0);
  if (maxChroma > 1e-12) {
    for (let i = 0; i < 12; i++) {
      chroma[i] = Math.round((chromaRaw[i] / maxChroma) * 10000) / 10000;
    }
  }

  // Step 3: Correlate against all 24 Sha'ath major & minor key profiles via Pearson correlation
  const hypotheses = [];
  const rotated = new Float64Array(12);

  for (let tonic = 0; tonic < 12; tonic++) {
    for (let i = 0; i < 12; i++) {
      rotated[i] = chroma[(tonic + i) % 12];
    }

    const rMaj = pearsonCorrelation(rotated, PROFILE_MAJOR);
    const rMin = pearsonCorrelation(rotated, PROFILE_MINOR);

    hypotheses.push({ pitchClass: tonic, mode: 'major', correlation: rMaj });
    hypotheses.push({ pitchClass: tonic, mode: 'minor', correlation: rMin });
  }

  hypotheses.sort((a, b) => b.correlation - a.correlation);

  const best = hypotheses[0];
  const runnerUp = hypotheses[1];
  const r1 = best.correlation;
  const r2 = runnerUp ? runnerUp.correlation : 0;
  const margin = Math.max(0, r1 - r2);

  // Calibrated confidence (0..99%): balances absolute correlation strength & separation from #2
  const strengthScore = clamp((r1 - 0.15) / 0.72, 0, 1);
  const sepScore = clamp(margin / 0.22, 0, 1);
  const confidence = r1 <= 0
    ? 0
    : Math.round(clamp((0.68 * strengthScore + 0.32 * sepScore) * 100, 10, 99));

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
      scorePct: Math.round(clamp(((h.correlation + 1) / 2) * 100, 0, 100)),
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

  lines.push('', '---', '*Analyzed 100% client-side with [BPM & Key Finder](https://firewallaby.github.io/bpm-key-finder/) by Saint Gordon Collective.*');
  return lines.join('\n');
}

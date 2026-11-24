/**
 * Web Audio Audition, Beat-Locked Metronome Click Overlay,
 * Key Triad Chord Synth, Tonic Drone, and Cross-Browser Audio Decoding.
 *
 * Built for Saint Gordon Collective — BPM & Key Finder (TOOL / 005).
 */

/**
 * Cross-browser safe wrapper for AudioContext.decodeAudioData
 * (supports both Promise-based Chrome/Firefox/Edge and callback-based Safari/iOS).
 */
export function decodeAudioDataSafe(audioCtx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    const copy = arrayBuffer.slice(0);
    let isDone = false;
    const done = (fn, arg) => {
      if (!isDone) {
        isDone = true;
        fn(arg);
      }
    };
    try {
      const ret = audioCtx.decodeAudioData(
        copy,
        (decoded) => done(resolve, decoded),
        (err) => done(reject, err || new Error('decodeAudioData failed'))
      );
      if (ret && typeof ret.then === 'function') {
        ret.then((buf) => done(resolve, buf)).catch((err) => done(reject, err));
      }
    } catch (e) {
      done(reject, e);
    }
  });
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Generate a genuinely musical 12-second stereo 124.0 BPM · F# Minor (11A) studio loop
 * so users can immediately audition every feature of the Harmonic Deck without hunting for a file.
 */
export function generateDemoTrackBuffer(audioCtx) {
  const sampleRate = audioCtx.sampleRate || 44100;
  const bpm = 124.0;
  const beatSec = 60 / bpm;
  const beats = 24; // 6 bars of 4/4 ≈ 11.61 seconds
  const durationSec = beats * beatSec;
  const length = Math.ceil(durationSec * sampleRate);

  const buffer = audioCtx.createBuffer(2, length, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Progression in F# Minor (11A): F#m (2 bars) -> Bm (1 bar) -> C#m (1 bar) -> D (1 bar) -> F#m (1 bar)
  const barChords = [
    { bass: 42, pad: [54, 57, 61, 66] }, // F#m
    { bass: 42, pad: [54, 57, 61, 66] }, // F#m
    { bass: 47, pad: [54, 59, 62, 66] }, // Bm
    { bass: 49, pad: [56, 61, 64, 68] }, // C#m
    { bass: 50, pad: [54, 57, 62, 66] }, // D
    { bass: 42, pad: [54, 57, 61, 66] }, // F#m
  ];

  // Deterministic noise generator for crisp snares & hats
  let seed = 0x51a7901d;
  const nextNoise = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };

  // Render warm chord pads & rhythmic bassline
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const beatFloat = t / beatSec;
    const barIdx = Math.min(barChords.length - 1, Math.floor(beatFloat / 4));
    const beatInBar = beatFloat % 4;
    const fracInBeat = beatFloat % 1;
    const chord = barChords[barIdx];

    // Gentle sidechain pump on quarter-note beats
    const sidechain = 0.42 + 0.58 * Math.min(1, fracInBeat * 3.2);
    // Smooth bar crossfade envelope
    const barFadeIn = Math.min(1, beatInBar * 8);
    const barFadeOut = Math.min(1, (4 - beatInBar) * 8);
    const padEnv = sidechain * barFadeIn * barFadeOut;

    // Warm stereo-detuned pad
    let padL = 0;
    let padR = 0;
    for (let nIdx = 0; nIdx < chord.pad.length; nIdx++) {
      const f = midiToFreq(chord.pad[nIdx]);
      const detune = nIdx % 2 === 0 ? 1.0018 : 0.9982;
      const wL = Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t);
      const wR = Math.sin(2 * Math.PI * f * detune * t) + 0.25 * Math.sin(4 * Math.PI * f * detune * t);
      padL += wL;
      padR += wR;
    }
    padL *= 0.085 * padEnv;
    padR *= 0.085 * padEnv;

    // Sub/bass synth pulsing on 8th notes
    const eighthFrac = (beatFloat * 2) % 1;
    const bassEnv = Math.exp(-eighthFrac * 4.2) * (0.55 + 0.45 * sidechain);
    const fBass = midiToFreq(chord.bass);
    const bass =
      (Math.sin(2 * Math.PI * fBass * t) * 0.7 +
        Math.sin(4 * Math.PI * fBass * t) * 0.28 +
        Math.sin(6 * Math.PI * fBass * t) * 0.08) *
      0.24 *
      bassEnv;

    left[i] = padL + bass;
    right[i] = padR + bass;
  }

  // Layer punchy studio kick (beats 1, 2, 3, 4), crisp clap/snare (beats 2, 4), and 8th hats
  const addKick = (tSec, gain = 0.55) => {
    const start = Math.floor(tSec * sampleRate);
    const hitLen = Math.floor(0.16 * sampleRate);
    for (let i = 0; i < hitLen && start + i < length; i++) {
      const t = i / sampleRate;
      const freq = 48 + 115 * Math.exp(-t * 34);
      const env = Math.exp(-t * 19);
      const click = Math.exp(-t * 210) * 0.25 * Math.sin(2 * Math.PI * 1600 * t);
      const s = gain * (Math.sin(2 * Math.PI * freq * t) * env + click);
      left[start + i] += s;
      right[start + i] += s;
    }
  };

  const addSnare = (tSec, gain = 0.28) => {
    const start = Math.floor(tSec * sampleRate);
    const hitLen = Math.floor(0.11 * sampleRate);
    let lp = 0;
    for (let i = 0; i < hitLen && start + i < length; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * 26);
      const n = nextNoise();
      lp = lp * 0.35 + n * 0.65;
      const hp = n - lp * 0.6;
      const body = Math.sin(2 * Math.PI * 210 * t) * Math.exp(-t * 32) * 0.45;
      const s = gain * (hp * env * 0.72 + body);
      left[start + i] += s * 0.96;
      right[start + i] += s * 1.04;
    }
  };

  const addHat = (tSec, gain = 0.10, open = false) => {
    const start = Math.floor(tSec * sampleRate);
    const hitLen = Math.floor((open ? 0.085 : 0.035) * sampleRate);
    let prev = 0;
    for (let i = 0; i < hitLen && start + i < length; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-t * (open ? 42 : 115));
      const n = nextNoise();
      const hp = n - prev * 0.82;
      prev = n;
      const s = gain * hp * env;
      left[start + i] += s * (open ? 1.1 : 0.85);
      right[start + i] += s * (open ? 0.85 : 1.1);
    }
  };

  for (let b = 0; b < beats; b++) {
    const tBeat = b * beatSec;
    const inBar = b % 4;
    addKick(tBeat, inBar === 0 ? 0.56 : 0.48);
    if (inBar === 1 || inBar === 3) {
      addSnare(tBeat, 0.28);
    }
    addHat(tBeat, 0.06, false);
    if (tBeat + beatSec * 0.5 < durationSec - 0.08) {
      addHat(tBeat + beatSec * 0.5, 0.11, inBar === 3);
    }
  }

  // Soft-clip safety limiter
  for (let i = 0; i < length; i++) {
    left[i] = Math.tanh(left[i] * 1.15) * 0.88;
    right[i] = Math.tanh(right[i] * 1.15) * 0.88;
  }

  return buffer;
}

export class AuditionEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.trackGain = null;
    this.metroGain = null;
    this.synthGain = null;

    // Active track playback state
    this.buffer = null;
    this.source = null;
    this.isPlaying = false;
    this.startCtxTime = 0;
    this.pauseOffset = 0;
    this.volume = 0.85;

    // Metronome scheduler state
    this.metronomeEnabled = false;
    this.bpm = 120;
    this.beatOffsetSec = 0;
    this.metroTimer = null;
    this.nextClickCtxTime = 0;
    this.nextBeatIndex = 0;
    this.onMetronomeBeat = null; // optional UI beat flash callback

    // Tonic drone state
    this.droneNodes = null;
    this.droneActive = false;
    this.droneKeySig = null;

    // Playback end callback
    this.onTrackEnded = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);

      this.trackGain = this.ctx.createGain();
      this.trackGain.gain.value = 0.92;
      this.trackGain.connect(this.masterGain);

      this.metroGain = this.ctx.createGain();
      this.metroGain.gain.value = 0.72;
      this.metroGain.connect(this.masterGain);

      this.synthGain = this.ctx.createGain();
      this.synthGain.gain.value = 0.55;
      this.synthGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  async decodeFile(arrayBuffer) {
    const ctx = this.ensureContext();
    return decodeAudioDataSafe(ctx, arrayBuffer);
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, Number(val) || 0));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.015);
    }
  }

  loadTrack(audioBuffer, bpm, beatOffsetSec = 0) {
    this.stopTrack();
    this.buffer = audioBuffer || null;
    this.pauseOffset = 0;
    this.bpm = bpm > 0 ? bpm : 120;
    this.beatOffsetSec = Number.isFinite(beatOffsetSec) ? beatOffsetSec : 0;
    if (this.metronomeEnabled) {
      this._resyncMetronome();
    }
  }

  updateTempoGrid(bpm, beatOffsetSec) {
    if (Number.isFinite(bpm) && bpm > 0) {
      this.bpm = bpm;
    }
    if (Number.isFinite(beatOffsetSec)) {
      this.beatOffsetSec = beatOffsetSec;
    }
    if (this.metronomeEnabled) {
      this._resyncMetronome();
    }
  }

  getCurrentTime() {
    if (!this.buffer) return 0;
    if (!this.isPlaying || !this.ctx) {
      return Math.max(0, Math.min(this.buffer.duration, this.pauseOffset));
    }
    const elapsed = this.ctx.currentTime - this.startCtxTime;
    return Math.max(0, Math.min(this.buffer.duration, this.pauseOffset + elapsed));
  }

  getDuration() {
    return this.buffer ? this.buffer.duration : 0;
  }

  playTrack() {
    if (!this.buffer) return false;
    const ctx = this.ensureContext();
    this._stopSourceOnly();

    if (this.pauseOffset >= this.buffer.duration - 0.02) {
      this.pauseOffset = 0;
    }

    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.trackGain);

    const startAt = ctx.currentTime + 0.015;
    src.start(startAt, this.pauseOffset);

    this.source = src;
    this.startCtxTime = startAt;
    this.isPlaying = true;

    src.onended = () => {
      if (this.source === src && this.isPlaying) {
        this.isPlaying = false;
        this.source = null;
        this.pauseOffset = 0;
        if (this.metronomeEnabled) {
          this._resyncMetronome();
        }
        if (typeof this.onTrackEnded === 'function') {
          this.onTrackEnded();
        }
      }
    };

    if (this.metronomeEnabled) {
      this._resyncMetronome();
    }
    return true;
  }

  pauseTrack() {
    if (!this.isPlaying) return;
    this.pauseOffset = this.getCurrentTime();
    this._stopSourceOnly();
    this.isPlaying = false;
    if (this.metronomeEnabled) {
      this._resyncMetronome();
    }
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pauseTrack();
      return false;
    }
    return this.playTrack();
  }

  seekTo(seconds) {
    if (!this.buffer) return;
    const clamped = Math.max(0, Math.min(this.buffer.duration, Number(seconds) || 0));
    const wasPlaying = this.isPlaying;
    this._stopSourceOnly();
    this.isPlaying = false;
    this.pauseOffset = clamped;
    if (wasPlaying) {
      this.playTrack();
    } else if (this.metronomeEnabled) {
      this._resyncMetronome();
    }
  }

  restartTrack() {
    this.seekTo(0);
    if (!this.isPlaying && this.buffer) {
      this.playTrack();
    }
  }

  stopTrack() {
    this._stopSourceOnly();
    this.isPlaying = false;
    this.pauseOffset = 0;
  }

  _stopSourceOnly() {
    if (this.source) {
      try {
        this.source.onended = null;
        this.source.stop();
        this.source.disconnect();
      } catch {
        // Ignore already-stopped AudioBufferSourceNode
      }
      this.source = null;
    }
  }

  /* ========================================================================
     BEAT-LOCKED METRONOME CLICK OVERLAY (WEB AUDIO LOOKAHEAD SCHEDULER)
     ======================================================================== */

  setMetronomeEnabled(enabled) {
    const next = Boolean(enabled);
    if (next === this.metronomeEnabled) return this.metronomeEnabled;
    this.metronomeEnabled = next;

    if (this.metronomeEnabled) {
      this.ensureContext();
      this._resyncMetronome();
      this._startMetroLoop();
    } else {
      this._stopMetroLoop();
    }
    return this.metronomeEnabled;
  }

  _startMetroLoop() {
    this._stopMetroLoop();
    this.metroTimer = window.setInterval(() => this._scheduleMetronome(), 25);
    this._scheduleMetronome();
  }

  _stopMetroLoop() {
    if (this.metroTimer !== null) {
      window.clearInterval(this.metroTimer);
      this.metroTimer = null;
    }
  }

  _resyncMetronome() {
    if (!this.ctx || this.bpm <= 0) return;
    const now = this.ctx.currentTime;
    const period = 60 / this.bpm;

    if (this.isPlaying && this.buffer) {
      // Lock beat grid mathematically to current audio playback position + beatOffsetSec
      const trackNow = Math.max(0, this.pauseOffset + (now - this.startCtxTime));
      const rel = trackNow - this.beatOffsetSec;
      const nextBeatIdx = Math.ceil(rel / period - 1e-4);
      const nextTrackTime = this.beatOffsetSec + nextBeatIdx * period;
      this.nextBeatIndex = ((nextBeatIdx % 4) + 4) % 4;
      this.nextClickCtxTime = now + Math.max(0.005, nextTrackTime - trackNow);
    } else {
      // Standalone metronome mode when track is paused
      this.nextBeatIndex = 0;
      this.nextClickCtxTime = now + 0.03;
    }
  }

  _scheduleMetronome() {
    if (!this.metronomeEnabled || !this.ctx || this.bpm <= 0) return;
    const now = this.ctx.currentTime;
    const lookaheadSec = 0.11;
    const period = 60 / this.bpm;

    // Guard against browser tab sleep drift
    if (this.nextClickCtxTime < now - 0.15) {
      this._resyncMetronome();
    }

    while (this.nextClickCtxTime < now + lookaheadSec) {
      const isDownbeat = this.nextBeatIndex % 4 === 0;
      const schedTime = Math.max(now + 0.002, this.nextClickCtxTime);
      this._triggerClick(schedTime, isDownbeat);

      if (typeof this.onMetronomeBeat === 'function') {
        const delayMs = Math.max(0, (schedTime - now) * 1000);
        const beatNum = (this.nextBeatIndex % 4) + 1;
        window.setTimeout(() => {
          if (this.metronomeEnabled) {
            this.onMetronomeBeat(beatNum, isDownbeat);
          }
        }, delayMs);
      }

      this.nextClickCtxTime += period;
      this.nextBeatIndex = (this.nextBeatIndex + 1) % 4;
    }
  }

  _triggerClick(when, isDownbeat) {
    const ctx = this.ctx;
    if (!ctx || !this.metroGain) return;

    // Crisp studio woodblock/tick click (zero mud, cuts cleanly through a full master)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    const startFreq = isDownbeat ? 1760 : 1175;
    const endFreq = isDownbeat ? 1280 : 880;
    osc.frequency.setValueAtTime(startFreq, when);
    osc.frequency.exponentialRampToValueAtTime(endFreq, when + 0.018);

    const amp = isDownbeat ? 0.55 : 0.34;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(amp, when + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + (isDownbeat ? 0.032 : 0.022));

    osc.connect(gain);
    gain.connect(this.metroGain);

    osc.start(when);
    osc.stop(when + 0.04);
  }

  /* ========================================================================
     KEY CHORD AUDITION, TONIC DRONE & SINGLE-NOTE CHROMAGRAM PREVIEW
     ======================================================================== */

  /**
   * Play a warm studio triad (root bass + triad voicing) for any key so the user
   * can verify detected key and alternative candidates strictly by ear.
   */
  playKeyChord(pitchClass, mode = 'major', durationSec = 1.65) {
    const ctx = this.ensureContext();
    const pc = ((Number(pitchClass) % 12) + 12) % 12;
    const thirdInterval = mode === 'minor' ? 3 : 4;

    // Choose a warm, balanced octave voicing around C3–G4
    const rootMid = 48 + pc; // C3..B3
    const bassMidi = rootMid >= 55 ? rootMid - 12 : rootMid; // keep bass comfortable (G2..F#3)
    const notes = [
      { midi: bassMidi, amp: 0.28, type: 'sine' },
      { midi: rootMid + 12, amp: 0.22, type: 'triangle' },
      { midi: rootMid + 12 + thirdInterval, amp: 0.20, type: 'triangle' },
      { midi: rootMid + 12 + 7, amp: 0.21, type: 'sine' },
    ];

    const now = ctx.currentTime + 0.01;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.Q.value = 0.7;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.85, now + 0.028);
    env.gain.setValueAtTime(0.75, now + durationSec * 0.45);
    env.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    filter.connect(env);
    env.connect(this.synthGain);

    notes.forEach(({ midi, amp, type }, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(midiToFreq(midi), now);
      // Slight gentle roll-in strumming feel (12 ms stagger)
      const onset = now + idx * 0.012;
      g.gain.setValueAtTime(amp, onset);
      osc.connect(g);
      g.connect(filter);
      osc.start(onset);
      osc.stop(now + durationSec + 0.05);
    });
  }

  /**
   * Play a short single pitch-class tone (e.g. clicking a Chromagram bar).
   */
  playPitchNote(pitchClass, durationSec = 0.45) {
    const ctx = this.ensureContext();
    const pc = ((Number(pitchClass) % 12) + 12) % 12;
    const midi = 60 + pc; // C4..B4
    const now = ctx.currentTime + 0.005;

    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc2.type = 'triangle';
    const freq = midiToFreq(midi);
    osc.frequency.setValueAtTime(freq, now);
    osc2.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    const g2 = ctx.createGain();
    g2.gain.value = 0.25;

    osc.connect(gain);
    osc2.connect(g2);
    g2.connect(gain);
    gain.connect(this.synthGain);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + durationSec + 0.03);
    osc2.stop(now + durationSec + 0.03);
  }

  /**
   * Toggle sustained warm Tonic + Fifth + Third drone to verify key against a playing track.
   */
  toggleTonicDrone(pitchClass, mode = 'major') {
    const sig = `${((Number(pitchClass) % 12) + 12) % 12}:${mode}`;
    if (this.droneActive && this.droneKeySig === sig) {
      this.stopTonicDrone();
      return false;
    }
    this.startTonicDrone(pitchClass, mode);
    return true;
  }

  startTonicDrone(pitchClass, mode = 'major') {
    this.stopTonicDrone();
    const ctx = this.ensureContext();
    const pc = ((Number(pitchClass) % 12) + 12) % 12;
    const thirdInterval = mode === 'minor' ? 3 : 4;
    const rootMidi = 48 + pc;
    const bassMidi = rootMidi >= 55 ? rootMidi - 12 : rootMidi;

    const now = ctx.currentTime + 0.01;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(920, now);
    filter.Q.value = 0.5;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.45, now + 0.16);

    filter.connect(env);
    env.connect(this.synthGain);

    const voices = [
      { midi: bassMidi, amp: 0.42, type: 'sine', detune: 0 },
      { midi: bassMidi + 7, amp: 0.20, type: 'sine', detune: 2 },
      { midi: bassMidi + 12, amp: 0.22, type: 'triangle', detune: -3 },
      { midi: bassMidi + 12 + thirdInterval, amp: 0.14, type: 'sine', detune: 3 },
    ];

    const oscs = voices.map((v) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = v.type;
      osc.frequency.setValueAtTime(midiToFreq(v.midi), now);
      osc.detune.setValueAtTime(v.detune, now);
      g.gain.value = v.amp;
      osc.connect(g);
      g.connect(filter);
      osc.start(now);
      return osc;
    });

    this.droneNodes = { oscs, env, filter };
    this.droneActive = true;
    this.droneKeySig = `${pc}:${mode}`;
  }

  stopTonicDrone() {
    if (!this.droneNodes || !this.ctx) {
      this.droneNodes = null;
      this.droneActive = false;
      this.droneKeySig = null;
      return;
    }
    const { oscs, env } = this.droneNodes;
    const now = this.ctx.currentTime;
    try {
      env.gain.cancelScheduledValues(now);
      env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), now);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      oscs.forEach((osc) => {
        try {
          osc.stop(now + 0.16);
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }
    this.droneNodes = null;
    this.droneActive = false;
    this.droneKeySig = null;
  }

  stopAll() {
    this.stopTrack();
    this.setMetronomeEnabled(false);
    this.stopTonicDrone();
  }
}

/**
 * BPM & Key Finder (TOOL / 005) — Saint Gordon Collective
 * Interactive Studio Controller: Single & Batch Audio Analysis, Harmonic Deck,
 * Beat-Locked Metronome, Chord & Drone Audition, Chromagram, Camelot Wheel, Queue & Export.
 */

import {
  PITCH_CLASSES_FLAT,
  PITCH_CLASSES_SHARP,
  analyzeAudioBuffer,
  computeDelayTimings,
  exportQueueToCsv,
  exportQueueToMarkdown,
  formatKeyName,
  formatTime,
  formatTrackTag,
  getCompatibleKeys,
  getHarmonicRelation,
  getKeyByCamelot,
  getKeyInfo,
  isSupportedAudioFilename,
} from './music-analyzer.js';
import { AuditionEngine, generateDemoTrackBuffer } from './audio-audition.js';
import { CamelotWheelView } from './camelot-wheel.js';

const engine = new AuditionEngine();

const state = {
  tracks: [], // Array of TrackItem
  activeTrackId: null,
  accidentalStyle: 'auto', // 'auto' | 'sharp' | 'flat'
  sortMode: 'order', // 'order' | 'bpm-asc' | 'bpm-desc' | 'camelot' | 'name'
  wheelCamelot: '11A', // Currently inspected Camelot key on the SVG wheel
  standbyBpm: 120,
  tapTimes: [],
  tapBpm: null,
  isProcessing: false,
  rafId: null,
  nextId: 1,
};

const dom = {
  footerYear: document.getElementById('footer-year'),
  btnHeaderClear: document.getElementById('btn-header-clear'),

  // Dropzone
  dropzone: document.getElementById('upload-dropzone'),
  dropzoneClick: document.getElementById('dropzone-click-target'),
  fileInput: document.getElementById('file-upload-input'),
  folderInput: document.getElementById('folder-upload-input'),
  btnSelectFiles: document.getElementById('btn-select-files'),
  btnSelectFolder: document.getElementById('btn-select-folder'),
  btnLoadDemo: document.getElementById('btn-load-demo'),

  // Progress & Errors
  progressContainer: document.getElementById('analysis-progress-container'),
  progressText: document.getElementById('analysis-progress-text'),
  progressPct: document.getElementById('analysis-progress-pct'),
  progressBar: document.getElementById('analysis-progress-bar'),
  errorsBanner: document.getElementById('analysis-errors-banner'),
  errorsTitle: document.getElementById('analysis-errors-title'),
  errorsList: document.getElementById('analysis-errors-list'),
  btnDismissErrors: document.getElementById('btn-dismiss-errors'),

  // Deck header & nav
  studioDeck: document.getElementById('studio-deck'),
  deckLed: document.getElementById('deck-led'),
  deckTrackName: document.getElementById('deck-track-name'),
  deckTrackSpecs: document.getElementById('deck-track-specs'),
  deckStatePill: document.getElementById('deck-state-pill'),
  btnPrevTrack: document.getElementById('btn-prev-track'),
  btnNextTrack: document.getElementById('btn-next-track'),
  btnCopyTagTop: document.getElementById('btn-copy-tag-top'),

  // BPM Module
  bpmHeroValue: document.getElementById('bpm-hero-value'),
  bpmOctavesMeta: document.getElementById('bpm-octaves-meta'),
  bpmConfidenceBadge: document.getElementById('bpm-confidence-badge'),
  bpmOverrideBadge: document.getElementById('bpm-override-badge'),
  btnHalfBpm: document.getElementById('btn-half-bpm'),
  btnDoubleBpm: document.getElementById('btn-double-bpm'),
  btnResetBpm: document.getElementById('btn-reset-bpm'),
  btnTapTempo: document.getElementById('btn-tap-tempo'),
  tapFeedbackBar: document.getElementById('tap-feedback-bar'),
  tapFeedbackText: document.getElementById('tap-feedback-text'),
  btnClearTap: document.getElementById('btn-clear-tap'),
  bpmCandidatesList: document.getElementById('bpm-candidates-list'),

  // Key Module
  keyHeroValue: document.getElementById('key-hero-value'),
  keyRelativeMeta: document.getElementById('key-relative-meta'),
  keyCamelotBadge: document.getElementById('key-camelot-badge'),
  keyOpenkeyBadge: document.getElementById('key-openkey-badge'),
  keyConfidenceBadge: document.getElementById('key-confidence-badge'),
  keyTuningBadge: document.getElementById('key-tuning-badge'),
  btnEnharmonicToggle: document.getElementById('btn-enharmonic-toggle'),
  enharmonicModeLabel: document.getElementById('enharmonic-mode-label'),
  btnPlayChord: document.getElementById('btn-play-chord'),
  btnTonicDrone: document.getElementById('btn-tonic-drone'),
  keyCandidatesList: document.getElementById('key-candidates-list'),

  // Waveform & Transport
  waveformScrubber: document.getElementById('waveform-scrubber'),
  waveformCanvas: document.getElementById('waveform-canvas'),
  timelineProgressBar: document.getElementById('timeline-progress-bar'),
  timelinePlayhead: document.getElementById('timeline-playhead'),
  timelineCurrentTime: document.getElementById('timeline-current-time'),
  timelineTotalTime: document.getElementById('timeline-total-time'),
  waveEmptyHint: document.getElementById('wave-empty-hint'),
  btnPlayPause: document.getElementById('btn-play-pause'),
  playBtnGlyph: document.getElementById('play-btn-glyph'),
  playBtnText: document.getElementById('play-btn-text'),
  btnRestart: document.getElementById('btn-restart'),
  btnMetronome: document.getElementById('btn-metronome'),
  metroDots: document.getElementById('metro-dots'),
  btnNudgeMinus: document.getElementById('btn-nudge-minus'),
  btnSnapBeat: document.getElementById('btn-snap-beat'),
  btnNudgePlus: document.getElementById('btn-nudge-plus'),
  beatOffsetReadout: document.getElementById('beat-offset-readout'),
  volumeSlider: document.getElementById('master-volume-slider'),

  // Timing Strip
  timingQuarter: document.getElementById('timing-quarter'),
  timingEighth: document.getElementById('timing-eighth'),
  timingDotted: document.getElementById('timing-dotted'),
  timingSixteenth: document.getElementById('timing-sixteenth'),
  timingBar: document.getElementById('timing-bar'),
  copyTagPreview: document.getElementById('copy-tag-preview'),
  btnCopyTagStrip: document.getElementById('btn-copy-tag-strip'),

  // Analytics
  chromaChart: document.getElementById('chroma-chart'),
  chromaScaleNotes: document.getElementById('chroma-scale-notes'),
  camelotWheelMount: document.getElementById('camelot-wheel-mount'),
  btnWheelReset: document.getElementById('btn-wheel-reset'),
  compatActiveLabel: document.getElementById('compat-active-label'),
  compatList: document.getElementById('compat-list'),

  // Queue
  queueSection: document.getElementById('queue-section'),
  queueCountText: document.getElementById('queue-count-text'),
  queueSortSelect: document.getElementById('queue-sort-select'),
  btnAddMore: document.getElementById('btn-add-more'),
  btnExportCsv: document.getElementById('btn-export-csv'),
  btnExportMd: document.getElementById('btn-export-md'),
  queueTableBody: document.getElementById('queue-table-body'),

  toastContainer: document.getElementById('toast-container'),
};

let camelotWheel = null;

/* ==========================================================================
   HELPERS & TOASTS
   ========================================================================== */

function getActiveTrack() {
  if (state.activeTrackId === null) return null;
  return state.tracks.find((t) => t.id === state.activeTrackId) || null;
}

function getEffectiveBpm() {
  const track = getActiveTrack();
  if (track) return track.effectiveBpm;
  return state.tapBpm || state.standbyBpm;
}

function getEffectiveKeyInfo() {
  const track = getActiveTrack();
  if (track) return track.effectiveKeyInfo;
  return getKeyByCamelot(state.wheelCamelot);
}

function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `toast${isError ? ' toast-error' : ''}`;
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);
  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    window.setTimeout(() => toast.remove(), 260);
  }, 2600);
}

async function copyTextToClipboard(text, successMsg) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast(successMsg || `Copied: ${text}`);
  } catch {
    showToast('Clipboard copy blocked by browser', true);
  }
}

function triggerFileDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function nextUiFrame() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ==========================================================================
   RECURSIVE FILE & FOLDER DROP HANDLING
   ========================================================================== */

async function collectFilesFromDataTransfer(dataTransfer) {
  const files = [];
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];

  const readEntry = (entry) =>
    new Promise((resolve) => {
      if (!entry) return resolve();
      if (entry.isFile) {
        entry.file(
          (file) => {
            files.push(file);
            resolve();
          },
          () => resolve()
        );
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readBatch = () => {
          reader.readEntries(
            async (entries) => {
              if (!entries || entries.length === 0) {
                resolve();
                return;
              }
              for (const child of entries) {
                await readEntry(child);
              }
              readBatch();
            },
            () => resolve()
          );
        };
        readBatch();
      } else {
        resolve();
      }
    });

  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter(Boolean);

  if (entries.length > 0) {
    for (const entry of entries) {
      await readEntry(entry);
    }
    return files;
  }

  return Array.from(dataTransfer.files || []);
}

/* ==========================================================================
   AUDIO DECODING & BATCH ANALYSIS PIPELINE
   ========================================================================== */

async function ingestFiles(fileList) {
  const rawFiles = Array.from(fileList || []);
  if (rawFiles.length === 0) return;

  const audioFiles = [];
  const skipped = [];

  for (const file of rawFiles) {
    const name = file.name || '';
    if (name.startsWith('.') || name.startsWith('._')) continue;
    if (isSupportedAudioFilename(name) || (file.type && file.type.startsWith('audio/'))) {
      audioFiles.push(file);
    } else {
      skipped.push(`${name}: unsupported file type`);
    }
  }

  if (audioFiles.length === 0) {
    if (skipped.length > 0) {
      renderErrors(skipped);
    }
    showToast('No supported audio files found', true);
    return;
  }

  state.isProcessing = true;
  dom.progressContainer.classList.remove('hidden');
  dom.errorsBanner.classList.add('hidden');
  const errors = [...skipped];
  let firstNewTrackId = null;

  for (let i = 0; i < audioFiles.length; i++) {
    const file = audioFiles[i];
    const pct = Math.round((i / audioFiles.length) * 100);
    dom.progressText.textContent = `Analyzing ${i + 1} / ${audioFiles.length}: ${file.name}`;
    dom.progressPct.textContent = `${pct}%`;
    dom.progressBar.style.width = `${pct}%`;
    await nextUiFrame();

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await engine.decodeFile(arrayBuffer);
      const analysis = analyzeAudioBuffer(audioBuffer);
      const track = createTrackItem(file.name, audioBuffer, analysis);
      state.tracks.push(track);
      if (firstNewTrackId === null) firstNewTrackId = track.id;
    } catch (err) {
      const lower = file.name.toLowerCase();
      const hint =
        lower.endsWith('.aif') || lower.endsWith('.aiff')
          ? 'AIFF decoding requires Safari (convert to WAV/FLAC for Chrome/Firefox)'
          : err?.message || 'unable to decode audio stream';
      errors.push(`${file.name}: ${hint}`);
    }
  }

  dom.progressText.textContent = `Completed ${audioFiles.length} file${audioFiles.length === 1 ? '' : 's'}`;
  dom.progressPct.textContent = '100%';
  dom.progressBar.style.width = '100%';
  state.isProcessing = false;

  window.setTimeout(() => {
    if (!state.isProcessing) {
      dom.progressContainer.classList.add('hidden');
    }
  }, 650);

  if (errors.length > 0) {
    renderErrors(errors);
  }

  if (firstNewTrackId !== null) {
    selectTrack(firstNewTrackId);
    const addedCount = audioFiles.length - (errors.length - skipped.length);
    if (addedCount > 0) {
      showToast(
        addedCount === 1
          ? `Analyzed ${getActiveTrack()?.name || 'track'}`
          : `Analyzed ${addedCount} tracks`
      );
    }
  }
  renderQueue();
}

function createTrackItem(name, audioBuffer, analysis) {
  const detectedBpm = analysis.bpm.bpm || 120;
  const detectedKey = getKeyInfo(analysis.key.pitchClass, analysis.key.mode);
  return {
    id: state.nextId++,
    orderIndex: state.tracks.length,
    name,
    audioBuffer,
    analysis,
    // Mutable inspection overrides (half/double-time, candidate picks, beat offset nudge)
    bpmMultiplier: 1, // 0.5 | 1 | 2
    bpmOverride: null, // manual BPM override from tap or candidate
    effectiveBpm: detectedBpm,
    beatOffsetSec: analysis.bpm.beatOffsetSec || 0,
    effectiveKeyInfo: detectedKey,
    keyOverridden: false,
  };
}

function renderErrors(messages) {
  dom.errorsTitle.textContent =
    messages.length === 1
      ? '1 file could not be analyzed'
      : `${messages.length} files could not be analyzed`;
  dom.errorsList.innerHTML = messages
    .slice(0, 8)
    .map((m) => `<li>${escapeHtml(m)}</li>`)
    .join('');
  if (messages.length > 8) {
    dom.errorsList.innerHTML += `<li>…and ${messages.length - 8} more</li>`;
  }
  dom.errorsBanner.classList.remove('hidden');
}

async function loadDemoBeat() {
  const ctx = engine.ensureContext();
  dom.progressContainer.classList.remove('hidden');
  dom.progressText.textContent = 'Synthesizing & analyzing 124 BPM F#m studio groove...';
  dom.progressPct.textContent = '45%';
  dom.progressBar.style.width = '45%';
  await nextUiFrame();

  const demoBuffer = generateDemoTrackBuffer(ctx);
  const analysis = analyzeAudioBuffer(demoBuffer);
  const track = createTrackItem('Saint_Gordon_Demo_Groove_124BPM_Fm.wav', demoBuffer, analysis);
  track.name = 'Saint Gordon — Studio Demo (124 BPM · F#m).wav';
  state.tracks.push(track);

  dom.progressPct.textContent = '100%';
  dom.progressBar.style.width = '100%';
  window.setTimeout(() => dom.progressContainer.classList.add('hidden'), 350);

  selectTrack(track.id);
  renderQueue();
  showToast(`Loaded demo: ${track.effectiveBpm.toFixed(1)} BPM · ${track.effectiveKeyInfo.key} (${track.effectiveKeyInfo.camelot})`);
}

/* ==========================================================================
   TRACK SELECTION & DECK RENDERING
   ========================================================================== */

function selectTrack(trackId) {
  const track = state.tracks.find((t) => t.id === trackId);
  if (!track) return;

  const wasDroneActive = engine.droneActive;
  state.activeTrackId = track.id;
  state.tapTimes = [];
  state.tapBpm = null;
  dom.tapFeedbackBar.classList.add('hidden');

  engine.loadTrack(track.audioBuffer, track.effectiveBpm, track.beatOffsetSec);

  if (wasDroneActive) {
    engine.startTonicDrone(track.effectiveKeyInfo.pitchClass, track.effectiveKeyInfo.mode);
  }

  state.wheelCamelot = track.effectiveKeyInfo.camelot;
  if (camelotWheel) {
    camelotWheel.setDetected(track.effectiveKeyInfo.camelot);
  }

  renderDeck();
  renderQueue();
}

function navigateTrack(delta) {
  const ordered = getSortedTracks();
  if (ordered.length < 2) return;
  const idx = ordered.findIndex((t) => t.id === state.activeTrackId);
  const nextIdx = (idx + delta + ordered.length) % ordered.length;
  selectTrack(ordered[nextIdx].id);
}

function removeTrack(trackId) {
  const idx = state.tracks.findIndex((t) => t.id === trackId);
  if (idx === -1) return;
  const wasActive = state.activeTrackId === trackId;
  state.tracks.splice(idx, 1);

  if (state.tracks.length === 0) {
    clearSession();
    return;
  }

  if (wasActive) {
    const next = state.tracks[Math.min(idx, state.tracks.length - 1)];
    selectTrack(next.id);
  } else {
    renderDeckNav();
    renderQueue();
  }
}

function clearSession() {
  engine.stopAll();
  state.tracks = [];
  state.activeTrackId = null;
  state.tapTimes = [];
  state.tapBpm = null;
  state.wheelCamelot = '11A';
  dom.tapFeedbackBar.classList.add('hidden');
  dom.errorsBanner.classList.add('hidden');
  if (camelotWheel) {
    camelotWheel.setDetected(null);
    camelotWheel.setActive('11A');
  }
  renderDeck();
  renderQueue();
  showToast('Session cleared');
}

function renderDeck() {
  const track = getActiveTrack();
  const hasTrack = Boolean(track);

  dom.btnHeaderClear.classList.toggle('hidden', state.tracks.length === 0);
  renderDeckNav();

  // Deck state pill & top bar
  if (!hasTrack) {
    dom.studioDeck.dataset.state = 'standby';
    dom.deckStatePill.textContent = engine.metronomeEnabled ? 'CLICK ONLY' : 'STANDBY';
    dom.deckTrackName.textContent = 'STANDBY — DROP AUDIO OR USE TAP TEMPO & WHEEL';
    dom.deckTrackSpecs.classList.add('hidden');
  } else {
    dom.studioDeck.dataset.state = engine.isPlaying ? 'playing' : 'ready';
    dom.deckStatePill.textContent = engine.isPlaying ? 'PLAYING' : 'READY';
    dom.deckTrackName.textContent = track.name;
    const khz = (track.analysis.sampleRate / 1000).toFixed(1);
    const chLabel = track.analysis.channels === 1 ? 'MONO' : track.analysis.channels === 2 ? 'STEREO' : `${track.analysis.channels}CH`;
    dom.deckTrackSpecs.textContent = `${khz} kHz · ${chLabel} · ${track.analysis.analysisMs} ms DSP`;
    dom.deckTrackSpecs.classList.remove('hidden');
  }

  renderBpmModule(track);
  renderKeyModule(track);
  renderTransportAndWaveform(track);
  renderTimingAndTagStrip(track);
  renderChromagram(track);
  renderCamelotTransitions();
}

function renderDeckNav() {
  const hasMultiple = state.tracks.length > 1;
  dom.btnPrevTrack.classList.toggle('hidden', !hasMultiple);
  dom.btnNextTrack.classList.toggle('hidden', !hasMultiple);
  const hasTrack = Boolean(getActiveTrack());
  dom.btnCopyTagTop.disabled = !hasTrack;
  dom.btnCopyTagStrip.disabled = !hasTrack;
}

function renderBpmModule(track) {
  const effectiveBpm = getEffectiveBpm();
  const hasBpm = Boolean(track && track.analysis.bpm.bpm > 0) || Boolean(state.tapBpm);

  if (hasBpm) {
    const [wholePart, decPart] = effectiveBpm.toFixed(1).split('.');
    dom.bpmHeroValue.innerHTML = `${wholePart}<span class="bpm-dec">.${decPart}</span>`;
  } else {
    dom.bpmHeroValue.textContent = '—';
  }

  if (hasBpm) {
    const half = (effectiveBpm / 2).toFixed(1);
    const dbl = (effectiveBpm * 2).toFixed(1);
    const offsetStr = track ? ` · BEAT 1 ${track.beatOffsetSec.toFixed(3)}s` : '';
    dom.bpmOctavesMeta.textContent = `HALF ${half} · DOUBLE ${dbl}${offsetStr}`;
  } else {
    dom.bpmOctavesMeta.textContent = 'HALF — · DOUBLE —';
  }

  if (track) {
    const conf = track.analysis.bpm.confidence;
    dom.bpmConfidenceBadge.textContent = `CONF ${conf}%`;
    dom.bpmConfidenceBadge.classList.toggle('badge-bright', conf >= 75);
  } else {
    dom.bpmConfidenceBadge.textContent = state.tapBpm ? 'MANUAL TAP' : 'CONF —';
    dom.bpmConfidenceBadge.classList.remove('badge-bright');
  }

  // Override badge (Half-Time / Double-Time / Tapped / Candidate)
  let overrideLabel = '';
  if (track) {
    if (track.bpmOverride !== null) {
      overrideLabel = state.tapBpm ? 'TAPPED' : 'ALT PEAK';
    } else if (track.bpmMultiplier === 0.5) {
      overrideLabel = '÷2 HALF-TIME';
    } else if (track.bpmMultiplier === 2) {
      overrideLabel = '×2 DOUBLE-TIME';
    }
  }
  dom.bpmOverrideBadge.textContent = overrideLabel;
  dom.bpmOverrideBadge.classList.toggle('hidden', !overrideLabel);

  dom.btnHalfBpm.disabled = !hasBpm;
  dom.btnDoubleBpm.disabled = !hasBpm;
  dom.btnHalfBpm.classList.toggle('deck-pill-active', Boolean(track && track.bpmMultiplier === 0.5));
  dom.btnDoubleBpm.classList.toggle('deck-pill-active', Boolean(track && track.bpmMultiplier === 2));
  dom.btnResetBpm.classList.toggle(
    'hidden',
    !(track && (track.bpmMultiplier !== 1 || track.bpmOverride !== null))
  );

  // Tempo Candidates
  if (!track || !track.analysis.bpm.candidates.length) {
    dom.bpmCandidatesList.innerHTML =
      '<span class="micro muted-placeholder">Drop a track to inspect tempo peaks</span>';
  } else {
    dom.bpmCandidatesList.innerHTML = track.analysis.bpm.candidates
      .map((cand, idx) => {
        const isActive = Math.abs(track.effectiveBpm - cand.bpm) < 0.06;
        return `<button type="button" class="cand-chip${isActive ? ' active' : ''}" data-bpm-cand="${cand.bpm}">
          <span>${idx + 1}. ${cand.bpm.toFixed(1)} BPM</span>
          <span class="cand-score">${cand.score}%</span>
        </button>`;
      })
      .join('');
  }
}

function renderKeyModule(track) {
  const keyInfo = track ? track.effectiveKeyInfo : null;

  if (!keyInfo) {
    dom.keyHeroValue.textContent = '—';
    dom.keyRelativeMeta.textContent = 'RELATIVE: — · ENHARMONIC: —';
    dom.keyCamelotBadge.textContent = '—';
    dom.keyOpenkeyBadge.textContent = 'OPEN —';
    dom.keyConfidenceBadge.textContent = 'CONF —';
    dom.keyConfidenceBadge.classList.remove('badge-bright');
    dom.keyTuningBadge.classList.add('hidden');
    dom.keyCandidatesList.innerHTML =
      '<span class="micro muted-placeholder">Drop a track to compare top 4 key hypotheses</span>';
  } else {
    dom.keyHeroValue.textContent = formatKeyName(keyInfo, state.accidentalStyle, false);
    const enhStr = keyInfo.enharmonic ? ` · ENHARMONIC: ${keyInfo.enharmonic}` : '';
    dom.keyRelativeMeta.textContent = `RELATIVE: ${keyInfo.relativeKey}${enhStr}`;
    dom.keyCamelotBadge.textContent = keyInfo.camelot;
    dom.keyOpenkeyBadge.textContent = `OPEN ${keyInfo.openKey.toUpperCase()}`;

    const conf = track.analysis.key.confidence;
    dom.keyConfidenceBadge.textContent = track.keyOverridden ? 'AUDITIONED' : `CONF ${conf}%`;
    dom.keyConfidenceBadge.classList.toggle('badge-bright', !track.keyOverridden && conf >= 70);

    const cents = track.analysis.key.tuningCents || 0;
    if (Math.abs(cents) >= 8) {
      const sign = cents > 0 ? '+' : '';
      dom.keyTuningBadge.textContent = `TUNING ${sign}${cents}¢`;
      dom.keyTuningBadge.classList.remove('hidden');
    } else {
      dom.keyTuningBadge.classList.add('hidden');
    }

    // Top 4 Key Candidates (clicking auditions chord & previews key!)
    const cands = track.analysis.key.candidates || [];
    dom.keyCandidatesList.innerHTML = cands
      .map((c, idx) => {
        const isActive = c.camelot === keyInfo.camelot;
        const shortLabel = formatKeyName(c, state.accidentalStyle, true);
        return `<button type="button" class="cand-chip${isActive ? ' active' : ''}" data-key-cand="${c.camelot}" title="Click to audition ${escapeHtml(formatKeyName(c, state.accidentalStyle, false))} triad chord">
          <span>${idx + 1}. ${escapeHtml(shortLabel)} · ${c.camelot}</span>
          <span class="cand-score">${c.scorePct}%</span>
        </button>`;
      })
      .join('');
  }

  dom.enharmonicModeLabel.textContent =
    state.accidentalStyle === 'auto'
      ? 'AUTO'
      : state.accidentalStyle === 'sharp'
        ? 'SHARP #'
        : 'FLAT ♭';

  dom.btnTonicDrone.setAttribute('aria-pressed', String(engine.droneActive));
  dom.btnTonicDrone.classList.toggle('deck-pill-active', engine.droneActive);
}

function renderTransportAndWaveform(track) {
  const hasTrack = Boolean(track);

  dom.btnPlayPause.disabled = !hasTrack;
  dom.btnRestart.disabled = !hasTrack;
  dom.btnSnapBeat.disabled = !hasTrack;
  dom.waveEmptyHint.classList.toggle('hidden', hasTrack);

  dom.playBtnGlyph.textContent = engine.isPlaying ? '❚❚' : '▶';
  dom.playBtnText.textContent = engine.isPlaying ? 'Pause' : 'Play Track';

  dom.btnMetronome.setAttribute('aria-pressed', String(engine.metronomeEnabled));
  dom.btnMetronome.classList.toggle('deck-pill-active', engine.metronomeEnabled);

  const offset = track ? track.beatOffsetSec : 0;
  dom.beatOffsetReadout.textContent = `GRID ${offset.toFixed(3)}s`;

  const duration = track ? track.analysis.durationSec : 0;
  const current = track ? engine.getCurrentTime() : 0;
  dom.timelineCurrentTime.textContent = formatTime(current, true);
  dom.timelineTotalTime.textContent = formatTime(duration, true);
  dom.waveformScrubber.setAttribute('aria-valuemax', String(Math.round(duration * 10) / 10));

  updatePlayheadVisuals();
  drawWaveformCanvas();
}

function renderTimingAndTagStrip(track) {
  const bpm = getEffectiveBpm();
  const timings = computeDelayTimings(bpm);

  dom.timingQuarter.textContent = `${timings.quarterMs.toFixed(1)} ms`;
  dom.timingEighth.textContent = `${timings.eighthMs.toFixed(1)} ms`;
  dom.timingDotted.textContent = `${timings.dottedEighthMs.toFixed(1)} ms`;
  dom.timingSixteenth.textContent = `${timings.sixteenthMs.toFixed(1)} ms`;
  dom.timingBar.textContent = `${timings.barMs.toFixed(1)} ms`;

  if (track) {
    dom.copyTagPreview.textContent = formatTrackTag(
      track.effectiveBpm,
      track.effectiveKeyInfo,
      state.accidentalStyle
    );
  } else if (state.tapBpm) {
    dom.copyTagPreview.textContent = `${state.tapBpm.toFixed(1)} BPM (TAP)`;
  } else {
    dom.copyTagPreview.textContent = '— BPM · —';
  }
}

/* ==========================================================================
   12-NOTE CHROMAGRAM BAR CHART
   ========================================================================== */

function getPitchLabels() {
  if (state.accidentalStyle === 'flat') return PITCH_CLASSES_FLAT;
  if (state.accidentalStyle === 'sharp') return PITCH_CLASSES_SHARP;
  // Auto mode matches sharp/flat to the active key's own convention
  const keyInfo = getEffectiveKeyInfo();
  if (keyInfo && (keyInfo.tonic.includes('♭') || ['F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭'].includes(keyInfo.tonic))) {
    return PITCH_CLASSES_FLAT;
  }
  return PITCH_CLASSES_SHARP;
}

function renderChromagram(track) {
  const labels = getPitchLabels();
  const keyInfo = track ? track.effectiveKeyInfo : getKeyByCamelot(state.wheelCamelot);
  const chroma = track?.analysis?.key?.chroma || new Array(12).fill(0.08);
  const scaleSet = new Set(keyInfo ? keyInfo.scalePitchClasses : []);
  const tonicPc = keyInfo ? keyInfo.pitchClass : -1;

  dom.chromaChart.innerHTML = labels
    .map((note, pc) => {
      const val = chroma[pc] || 0;
      const pct = Math.max(4, Math.round(val * 100));
      const isTonic = pc === tonicPc;
      const inScale = scaleSet.has(pc);
      const cls = isTonic ? 'is-tonic in-scale' : inScale ? 'in-scale' : '';
      const marker = isTonic ? '★' : inScale ? '·' : '';

      return `<button type="button" class="chroma-col ${cls}" data-pc="${pc}" role="listitem" title="${note}: ${Math.round(val * 100)}% energy — click to hear pitch">
        <div class="chroma-bar-wrap">
          <span class="chroma-marker" aria-hidden="true">${marker}</span>
          <div class="chroma-bar" style="height: ${pct}%;"></div>
        </div>
        <span class="chroma-note">${note}</span>
      </button>`;
    })
    .join('');

  if (keyInfo) {
    const scaleNames = keyInfo.scalePitchClasses.map((pc) => labels[pc]).join(' · ');
    dom.chromaScaleNotes.textContent = `SCALE (${formatKeyName(keyInfo, state.accidentalStyle, true)}): ${scaleNames}`;
  } else {
    dom.chromaScaleNotes.textContent = 'SCALE TONES: —';
  }
}

/* ==========================================================================
   CAMELOT WHEEL & COMPATIBLE TRANSITIONS PANEL
   ========================================================================== */

function renderCamelotTransitions() {
  const inspected = getKeyByCamelot(state.wheelCamelot);
  if (!inspected) return;

  const track = getActiveTrack();
  const trackCamelot = track?.effectiveKeyInfo?.camelot || null;
  dom.btnWheelReset.classList.toggle('hidden', !trackCamelot || trackCamelot === inspected.camelot);

  dom.compatActiveLabel.textContent = `${inspected.camelot} · ${formatKeyName(
    inspected,
    state.accidentalStyle,
    false
  )} (Open ${inspected.openKey.toUpperCase()})`;

  const compat = getCompatibleKeys(inspected.camelot);
  const items = [
    compat.exact,
    compat.relative,
    compat.minusOne,
    compat.plusOne,
    compat.energyBoost,
  ];

  dom.compatList.innerHTML = items
    .map((item) => {
      const isExact = item.relation === 'exact';
      const keyLabel = formatKeyName(item, state.accidentalStyle, false);
      return `<button type="button" class="compat-item${isExact ? ' is-exact' : ''}" data-compat-camelot="${item.camelot}" title="Inspect ${item.camelot} and audition ${escapeHtml(keyLabel)} triad chord">
        <span class="compat-rel">${escapeHtml(item.label)}</span>
        <span class="compat-key-val">${item.camelot} · ${escapeHtml(keyLabel)}</span>
      </button>`;
    })
    .join('');
}

/* ==========================================================================
   WAVEFORM CANVAS WITH BEAT-GRID TICK OVERLAY & SCRUBBING
   ========================================================================== */

function drawWaveformCanvas() {
  const canvas = dom.waveformCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(300, Math.floor(rect.width || 900));
  const h = Math.max(56, Math.floor(rect.height || 72));

  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  // Subtle dark studio grid center hairline
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  const track = getActiveTrack();
  if (!track || !track.analysis.waveformPeaks) {
    ctx.restore();
    return;
  }

  const peaks = track.analysis.waveformPeaks;
  const duration = track.analysis.durationSec;
  const bpm = track.effectiveBpm;

  // Draw beat-grid vertical tick marks behind waveform when track isn't too dense
  if (bpm > 0 && duration > 0) {
    const periodSec = 60 / bpm;
    const totalBeats = duration / periodSec;
    // Skip beat ticks if > 400 beats would look solid; show 4-beat bar markers instead
    const stepBeats = totalBeats > 260 ? 4 : 1;
    const offset = track.beatOffsetSec % periodSec;

    for (let b = 0; ; b += stepBeats) {
      const t = offset + b * periodSec;
      if (t > duration) break;
      const x = (t / duration) * w;
      const isBar = b % 4 === 0;
      ctx.strokeStyle = isBar ? 'rgba(255, 255, 255, 0.24)' : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, isBar ? 0 : h * 0.14);
      ctx.lineTo(x, isBar ? h : h * 0.86);
      ctx.stroke();
    }
  }

  // Draw crisp monochrome mirrored waveform bars
  const barCount = peaks.length;
  const barStep = w / barCount;
  const barWidth = Math.max(1, barStep - 0.7);
  const maxBarH = h * 0.44;
  const midY = h / 2;

  ctx.fillStyle = '#cfcfcf';
  for (let i = 0; i < barCount; i++) {
    const amp = Math.max(0.03, peaks[i]);
    const barH = amp * maxBarH;
    const x = i * barStep;
    ctx.fillRect(x, midY - barH, barWidth, barH * 2);
  }

  ctx.restore();
}

function updatePlayheadVisuals() {
  const track = getActiveTrack();
  if (!track) {
    dom.timelineProgressBar.style.width = '0%';
    dom.timelinePlayhead.style.left = '0%';
    return;
  }
  const dur = track.analysis.durationSec || 1;
  const now = engine.getCurrentTime();
  const pct = Math.max(0, Math.min(100, (now / dur) * 100));

  dom.timelineProgressBar.style.width = `${pct}%`;
  dom.timelinePlayhead.style.left = `${pct}%`;
  dom.timelineCurrentTime.textContent = formatTime(now, true);
  dom.waveformScrubber.setAttribute('aria-valuenow', String(Math.round(now * 10) / 10));
}

function startAnimationLoop() {
  if (state.rafId !== null) return;
  const tick = () => {
    if (engine.isPlaying) {
      updatePlayheadVisuals();
      state.rafId = window.requestAnimationFrame(tick);
    } else {
      state.rafId = null;
      updatePlayheadVisuals();
    }
  };
  state.rafId = window.requestAnimationFrame(tick);
}

/* ==========================================================================
   SESSION QUEUE TABLE & SORTING
   ========================================================================== */

function getSortedTracks() {
  const arr = [...state.tracks];
  switch (state.sortMode) {
    case 'bpm-asc':
      return arr.sort((a, b) => a.effectiveBpm - b.effectiveBpm);
    case 'bpm-desc':
      return arr.sort((a, b) => b.effectiveBpm - a.effectiveBpm);
    case 'camelot':
      return arr.sort((a, b) => {
        const ka = a.effectiveKeyInfo;
        const kb = b.effectiveKeyInfo;
        if (ka.camelotNum !== kb.camelotNum) return ka.camelotNum - kb.camelotNum;
        return ka.camelotLetter.localeCompare(kb.camelotLetter);
      });
    case 'name':
      return arr.sort((a, b) => a.name.localeCompare(b.name));
    case 'order':
    default:
      return arr.sort((a, b) => a.orderIndex - b.orderIndex);
  }
}

function renderQueue() {
  const count = state.tracks.length;
  dom.queueSection.classList.toggle('hidden', count === 0);
  if (count === 0) return;

  dom.queueCountText.textContent = `${count} Track${count === 1 ? '' : 's'} Analyzed`;

  const activeTrack = getActiveTrack();
  const activeCamelot = activeTrack?.effectiveKeyInfo?.camelot || null;
  const sorted = getSortedTracks();

  dom.queueTableBody.innerHTML = sorted
    .map((track, idx) => {
      const isActive = track.id === state.activeTrackId;
      const keyInfo = track.effectiveKeyInfo;
      const keyLabel = formatKeyName(keyInfo, state.accidentalStyle, false);

      // Show harmonic mixing badge relative to the currently selected track!
      let compatHtml = '';
      if (activeCamelot && !isActive && count > 1) {
        const rel = getHarmonicRelation(activeCamelot, keyInfo.camelot);
        if (rel) {
          compatHtml = `<span class="compat-tag" title="Harmonically compatible with active track: ${escapeHtml(rel.label)}">${escapeHtml(rel.code)}</span>`;
        }
      }

      const modTag =
        track.bpmMultiplier === 0.5
          ? '<span class="bpm-mod-tag">÷2</span>'
          : track.bpmMultiplier === 2
            ? '<span class="bpm-mod-tag">×2</span>'
            : '';

      const bpmConf = track.analysis.bpm.confidence;
      const keyConf = track.analysis.key.confidence;

      return `<div class="queue-row${isActive ? ' active-row' : ''}" data-track-id="${track.id}" role="listitem" tabindex="0" aria-current="${isActive ? 'true' : 'false'}">
        <div class="q-col-idx mono-cell">${String(idx + 1).padStart(2, '0')}</div>
        <div class="q-col-name q-name-wrap">
          <span class="q-track-name" title="${escapeHtml(track.name)}">${escapeHtml(track.name)}</span>
          ${compatHtml}
        </div>
        <div class="q-col-dur mono-cell">${formatTime(track.analysis.durationSec)}</div>
        <div class="q-col-bpm bpm-cell">${track.effectiveBpm.toFixed(1)}${modTag}</div>
        <div class="q-col-key">${escapeHtml(keyLabel)}</div>
        <div class="q-col-cam">
          <span class="camelot-pill">${keyInfo.camelot}</span>
          <span class="openkey-mini">${keyInfo.openKey}</span>
        </div>
        <div class="q-col-conf mono-cell">${bpmConf}% / ${keyConf}%</div>
        <div class="q-col-act">
          <button type="button" class="btn-row-copy" data-copy-id="${track.id}" title="Copy BPM & Key tag">COPY</button>
          <button type="button" class="btn-remove-row" data-remove-id="${track.id}" title="Remove track from queue" aria-label="Remove ${escapeHtml(track.name)}">×</button>
        </div>
      </div>`;
    })
    .join('');
}

/* ==========================================================================
   TEMPO MODIFIERS, TAP TEMPO & METRONOME GRID ADJUSTMENTS
   ========================================================================== */

function toggleOctaveMultiplier(mult) {
  const track = getActiveTrack();
  if (!track) {
    if (state.tapBpm) {
      state.tapBpm = Math.round(state.tapBpm * mult * 10) / 10;
      engine.updateTempoGrid(state.tapBpm, 0);
      renderDeck();
    }
    return;
  }

  const baseBpm = track.bpmOverride ?? (track.analysis.bpm.bpm || 120);
  track.bpmMultiplier = track.bpmMultiplier === mult ? 1 : mult;
  track.effectiveBpm = Math.round(baseBpm * track.bpmMultiplier * 10) / 10;
  engine.updateTempoGrid(track.effectiveBpm, track.beatOffsetSec);
  renderDeck();
  renderQueue();
}

function resetTrackBpm() {
  const track = getActiveTrack();
  if (!track) return;
  track.bpmMultiplier = 1;
  track.bpmOverride = null;
  track.effectiveBpm = track.analysis.bpm.bpm || 120;
  state.tapTimes = [];
  state.tapBpm = null;
  dom.tapFeedbackBar.classList.add('hidden');
  engine.updateTempoGrid(track.effectiveBpm, track.beatOffsetSec);
  renderDeck();
  renderQueue();
}

function handleTapTempo() {
  const now = performance.now();
  // Auto-reset tap history after 2.2 seconds of pause
  if (state.tapTimes.length > 0 && now - state.tapTimes[state.tapTimes.length - 1] > 2200) {
    state.tapTimes = [];
  }
  state.tapTimes.push(now);
  if (state.tapTimes.length > 9) {
    state.tapTimes.shift();
  }

  dom.tapFeedbackBar.classList.remove('hidden');

  if (state.tapTimes.length < 2) {
    dom.tapFeedbackText.textContent = 'TAP AGAIN ON THE BEAT... (1 tap)';
    return;
  }

  let intervalSum = 0;
  for (let i = 1; i < state.tapTimes.length; i++) {
    intervalSum += state.tapTimes[i] - state.tapTimes[i - 1];
  }
  const avgMs = intervalSum / (state.tapTimes.length - 1);
  if (avgMs <= 120 || avgMs >= 2500) return;

  const bpm = Math.round((60000 / avgMs) * 10) / 10;
  state.tapBpm = bpm;
  dom.tapFeedbackText.textContent = `TAP TEMPO: ${bpm.toFixed(1)} BPM (${state.tapTimes.length} taps)`;

  const track = getActiveTrack();
  if (track) {
    track.bpmOverride = bpm;
    track.bpmMultiplier = 1;
    track.effectiveBpm = bpm;
    engine.updateTempoGrid(bpm, track.beatOffsetSec);
  } else {
    engine.updateTempoGrid(bpm, 0);
  }
  renderDeck();
  if (track) renderQueue();
}

function nudgeBeatOffset(deltaSec) {
  const track = getActiveTrack();
  if (!track) return;
  const period = 60 / Math.max(30, track.effectiveBpm);
  const next = (((track.beatOffsetSec + deltaSec) % period) + period) % period;
  track.beatOffsetSec = Math.round(next * 1000) / 1000;
  engine.updateTempoGrid(track.effectiveBpm, track.beatOffsetSec);
  dom.beatOffsetReadout.textContent = `GRID ${track.beatOffsetSec.toFixed(3)}s`;
  drawWaveformCanvas();
}

function snapBeatOneToPlayhead() {
  const track = getActiveTrack();
  if (!track) return;
  const period = 60 / Math.max(30, track.effectiveBpm);
  const nowSec = engine.getCurrentTime();
  track.beatOffsetSec = Math.round((nowSec % period) * 1000) / 1000;
  engine.updateTempoGrid(track.effectiveBpm, track.beatOffsetSec);
  dom.beatOffsetReadout.textContent = `GRID ${track.beatOffsetSec.toFixed(3)}s`;
  drawWaveformCanvas();
  showToast(`Beat 1 snapped to ${track.beatOffsetSec.toFixed(3)}s`);
}

/* ==========================================================================
   METRONOME BEAT VISUAL FLASH
   ========================================================================== */

let beatFlashTimeout = null;

engine.onMetronomeBeat = (beatNum, isDownbeat) => {
  const dots = dom.metroDots ? dom.metroDots.querySelectorAll('.metro-dot') : [];
  dots.forEach((d, idx) => {
    d.classList.toggle('lit', idx === beatNum - 1);
  });
  if (isDownbeat && dom.deckLed) {
    dom.deckLed.classList.add('beat-flash');
    window.clearTimeout(beatFlashTimeout);
    beatFlashTimeout = window.setTimeout(() => {
      dom.deckLed.classList.remove('beat-flash');
    }, 95);
  }
};

engine.onTrackEnded = () => {
  renderDeck();
};

/* ==========================================================================
   EVENT LISTENERS & INITIALIZATION
   ========================================================================== */

function bindEvents() {
  // File & Folder Pickers
  dom.btnSelectFiles.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.fileInput.value = '';
    dom.fileInput.click();
  });

  dom.btnSelectFolder.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.folderInput.value = '';
    dom.folderInput.click();
  });

  dom.dropzoneClick.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    dom.fileInput.value = '';
    dom.fileInput.click();
  });

  dom.fileInput.addEventListener('change', (e) => {
    if (e.target.files?.length) ingestFiles(e.target.files);
  });

  dom.folderInput.addEventListener('change', (e) => {
    if (e.target.files?.length) ingestFiles(e.target.files);
  });

  dom.btnAddMore.addEventListener('click', () => {
    dom.fileInput.value = '';
    dom.fileInput.click();
  });

  dom.btnLoadDemo.addEventListener('click', () => {
    loadDemoBeat();
  });

  dom.btnDismissErrors.addEventListener('click', () => {
    dom.errorsBanner.classList.add('hidden');
  });

  dom.btnHeaderClear.addEventListener('click', clearSession);

  // Drag & Drop
  let dragCounter = 0;
  dom.dropzone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    dom.dropzone.classList.add('drag-over');
  });
  dom.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  dom.dropzone.addEventListener('dragleave', () => {
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) dom.dropzone.classList.remove('drag-over');
  });
  dom.dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    dom.dropzone.classList.remove('drag-over');
    if (e.dataTransfer) {
      const files = await collectFilesFromDataTransfer(e.dataTransfer);
      if (files.length > 0) ingestFiles(files);
    }
  });

  // Deck Track Navigation & Copy Tag
  dom.btnPrevTrack.addEventListener('click', () => navigateTrack(-1));
  dom.btnNextTrack.addEventListener('click', () => navigateTrack(1));

  const copyActiveTag = () => {
    const track = getActiveTrack();
    if (!track) return;
    const tag = formatTrackTag(track.effectiveBpm, track.effectiveKeyInfo, state.accidentalStyle);
    copyTextToClipboard(tag, `Copied tag: ${tag}`);
  };
  dom.btnCopyTagTop.addEventListener('click', copyActiveTag);
  dom.btnCopyTagStrip.addEventListener('click', copyActiveTag);

  // BPM Controls
  dom.btnHalfBpm.addEventListener('click', () => toggleOctaveMultiplier(0.5));
  dom.btnDoubleBpm.addEventListener('click', () => toggleOctaveMultiplier(2));
  dom.btnResetBpm.addEventListener('click', resetTrackBpm);
  dom.btnTapTempo.addEventListener('click', handleTapTempo);
  dom.btnClearTap.addEventListener('click', () => {
    state.tapTimes = [];
    state.tapBpm = null;
    dom.tapFeedbackBar.classList.add('hidden');
    if (getActiveTrack()) {
      resetTrackBpm();
    } else {
      engine.updateTempoGrid(state.standbyBpm, 0);
      renderDeck();
    }
  });

  dom.bpmCandidatesList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-bpm-cand]');
    if (!btn) return;
    const track = getActiveTrack();
    if (!track) return;
    const bpm = parseFloat(btn.dataset.bpmCand);
    if (!Number.isFinite(bpm)) return;
    track.bpmMultiplier = 1;
    track.bpmOverride = Math.abs(bpm - track.analysis.bpm.bpm) < 0.06 ? null : bpm;
    track.effectiveBpm = bpm;
    state.tapBpm = null;
    dom.tapFeedbackBar.classList.add('hidden');
    engine.updateTempoGrid(bpm, track.beatOffsetSec);
    renderDeck();
    renderQueue();
    showToast(`Active tempo set to ${bpm.toFixed(1)} BPM`);
  });

  // Key Controls
  dom.btnEnharmonicToggle.addEventListener('click', () => {
    const order = ['auto', 'sharp', 'flat'];
    const nextIdx = (order.indexOf(state.accidentalStyle) + 1) % order.length;
    state.accidentalStyle = order[nextIdx];
    if (camelotWheel) camelotWheel.setAccidentalStyle(state.accidentalStyle);
    renderDeck();
    renderQueue();
  });

  dom.btnPlayChord.addEventListener('click', () => {
    const keyInfo = getEffectiveKeyInfo();
    if (!keyInfo) return;
    engine.playKeyChord(keyInfo.pitchClass, keyInfo.mode);
    showToast(`Auditioning ${formatKeyName(keyInfo, state.accidentalStyle, false)} (${keyInfo.camelot}) chord`);
  });

  dom.btnTonicDrone.addEventListener('click', () => {
    const keyInfo = getEffectiveKeyInfo();
    if (!keyInfo) return;
    const isOn = engine.toggleTonicDrone(keyInfo.pitchClass, keyInfo.mode);
    dom.btnTonicDrone.setAttribute('aria-pressed', String(isOn));
    dom.btnTonicDrone.classList.toggle('deck-pill-active', isOn);
    showToast(
      isOn
        ? `Tonic drone ON — ${formatKeyName(keyInfo, state.accidentalStyle, false)}`
        : 'Tonic drone OFF'
    );
  });

  // Clicking any top-4 key candidate auditions THAT chord immediately & switches active key!
  dom.keyCandidatesList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-key-cand]');
    if (!btn) return;
    const track = getActiveTrack();
    const keyInfo = getKeyByCamelot(btn.dataset.keyCand);
    if (!keyInfo) return;

    engine.playKeyChord(keyInfo.pitchClass, keyInfo.mode);
    if (track) {
      track.effectiveKeyInfo = keyInfo;
      track.keyOverridden = keyInfo.camelot !== track.analysis.key.camelot;
      state.wheelCamelot = keyInfo.camelot;
      if (camelotWheel) {
        camelotWheel.setDetected(track.analysis.key.camelot);
        camelotWheel.setActive(keyInfo.camelot);
      }
      if (engine.droneActive) {
        engine.startTonicDrone(keyInfo.pitchClass, keyInfo.mode);
      }
      renderDeck();
      renderQueue();
    }
    showToast(`Auditioning ${formatKeyName(keyInfo, state.accidentalStyle, false)} (${keyInfo.camelot})`);
  });

  // Transport & Metronome
  dom.btnPlayPause.addEventListener('click', () => {
    if (!getActiveTrack()) return;
    engine.togglePlay();
    if (engine.isPlaying) startAnimationLoop();
    renderDeck();
  });

  dom.btnRestart.addEventListener('click', () => {
    if (!getActiveTrack()) return;
    engine.restartTrack();
    startAnimationLoop();
    renderDeck();
  });

  dom.btnMetronome.addEventListener('click', () => {
    const on = engine.setMetronomeEnabled(!engine.metronomeEnabled);
    if (!on && dom.metroDots) {
      dom.metroDots.querySelectorAll('.metro-dot').forEach((d) => d.classList.remove('lit'));
    }
    renderDeck();
  });

  dom.btnNudgeMinus.addEventListener('click', () => nudgeBeatOffset(-0.02));
  dom.btnNudgePlus.addEventListener('click', () => nudgeBeatOffset(0.02));
  dom.btnSnapBeat.addEventListener('click', snapBeatOneToPlayhead);

  dom.volumeSlider.addEventListener('input', (e) => {
    engine.setVolume(parseFloat(e.target.value));
  });

  // Waveform Pointer Scrubbing
  let scrubbing = false;
  const scrubFromClientX = (clientX) => {
    const track = getActiveTrack();
    if (!track) return;
    const rect = dom.waveformScrubber.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    engine.seekTo(ratio * track.analysis.durationSec);
    updatePlayheadVisuals();
  };

  dom.waveformScrubber.addEventListener('pointerdown', (e) => {
    if (!getActiveTrack()) return;
    scrubbing = true;
    dom.waveformScrubber.setPointerCapture(e.pointerId);
    scrubFromClientX(e.clientX);
  });
  dom.waveformScrubber.addEventListener('pointermove', (e) => {
    if (scrubbing) scrubFromClientX(e.clientX);
  });
  dom.waveformScrubber.addEventListener('pointerup', () => {
    scrubbing = false;
  });
  dom.waveformScrubber.addEventListener('pointercancel', () => {
    scrubbing = false;
  });
  dom.waveformScrubber.addEventListener('keydown', (e) => {
    const track = getActiveTrack();
    if (!track) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      engine.seekTo(engine.getCurrentTime() + 5);
      updatePlayheadVisuals();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      engine.seekTo(engine.getCurrentTime() - 5);
      updatePlayheadVisuals();
    }
  });

  // Chromagram Single-Pitch Click Preview
  dom.chromaChart.addEventListener('click', (e) => {
    const col = e.target.closest('[data-pc]');
    if (!col) return;
    const pc = parseInt(col.dataset.pc, 10);
    if (Number.isFinite(pc)) {
      engine.playPitchNote(pc);
    }
  });

  // Camelot Transitions Panel Click
  dom.compatList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-compat-camelot]');
    if (!btn) return;
    const code = btn.dataset.compatCamelot;
    if (camelotWheel) {
      camelotWheel.setActive(code, { notify: true });
    }
  });

  dom.btnWheelReset.addEventListener('click', () => {
    const track = getActiveTrack();
    if (!track) return;
    state.wheelCamelot = track.effectiveKeyInfo.camelot;
    if (camelotWheel) {
      camelotWheel.setActive(state.wheelCamelot);
    }
    renderCamelotTransitions();
  });

  // Queue Sort, Row Select, Copy, Remove & Batch Exports
  dom.queueSortSelect.addEventListener('change', (e) => {
    state.sortMode = e.target.value;
    renderQueue();
  });

  dom.queueTableBody.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-remove-id]');
    if (removeBtn) {
      e.stopPropagation();
      removeTrack(parseInt(removeBtn.dataset.removeId, 10));
      return;
    }

    const copyBtn = e.target.closest('[data-copy-id]');
    if (copyBtn) {
      e.stopPropagation();
      const t = state.tracks.find((item) => item.id === parseInt(copyBtn.dataset.copyId, 10));
      if (t) {
        const tag = formatTrackTag(t.effectiveBpm, t.effectiveKeyInfo, state.accidentalStyle);
        copyTextToClipboard(tag, `Copied: ${tag}`);
      }
      return;
    }

    const row = e.target.closest('[data-track-id]');
    if (row) {
      selectTrack(parseInt(row.dataset.trackId, 10));
    }
  });

  dom.queueTableBody.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const row = e.target.closest('[data-track-id]');
      if (row && !e.target.closest('button')) {
        e.preventDefault();
        selectTrack(parseInt(row.dataset.trackId, 10));
      }
    }
  });

  dom.btnExportCsv.addEventListener('click', () => {
    if (state.tracks.length === 0) return;
    const csv = exportQueueToCsv(getSortedTracks(), state.accidentalStyle);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerFileDownload(`saint-gordon-bpm-key-${stamp}.csv`, csv, 'text/csv;charset=utf-8');
    showToast(`Exported CSV (${state.tracks.length} tracks)`);
  });

  dom.btnExportMd.addEventListener('click', () => {
    if (state.tracks.length === 0) return;
    const md = exportQueueToMarkdown(getSortedTracks(), state.accidentalStyle);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerFileDownload(`saint-gordon-bpm-key-${stamp}.md`, md, 'text/markdown;charset=utf-8');
    showToast(`Exported Markdown (${state.tracks.length} tracks)`);
  });

  // Global Studio Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) {
      return;
    }

    const key = e.key.toLowerCase();
    if (e.code === 'Space') {
      if (!getActiveTrack()) return;
      e.preventDefault();
      engine.togglePlay();
      if (engine.isPlaying) startAnimationLoop();
      renderDeck();
    } else if (key === 'm') {
      e.preventDefault();
      dom.btnMetronome.click();
    } else if (key === 'c') {
      e.preventDefault();
      dom.btnPlayChord.click();
    } else if (key === 'd') {
      e.preventDefault();
      dom.btnTonicDrone.click();
    } else if (key === 't') {
      e.preventDefault();
      handleTapTempo();
    } else if (key === 'b') {
      if (!getActiveTrack()) return;
      e.preventDefault();
      snapBeatOneToPlayhead();
    } else if (key === 'h') {
      if (!getActiveTrack()) return;
      e.preventDefault();
      const track = getActiveTrack();
      if (track.bpmMultiplier === 1) toggleOctaveMultiplier(0.5);
      else if (track.bpmMultiplier === 0.5) toggleOctaveMultiplier(2);
      else resetTrackBpm();
    } else if (key === 'r') {
      if (!getActiveTrack()) return;
      e.preventDefault();
      dom.btnRestart.click();
    }
  });

  // Redraw waveform sharply on viewport resize
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(drawWaveformCanvas, 120);
  });
}

function init() {
  if (dom.footerYear) {
    dom.footerYear.textContent = String(new Date().getFullYear());
  }

  camelotWheel = new CamelotWheelView(dom.camelotWheelMount, {
    onSelect: (keyInfo) => {
      if (!keyInfo) return;
      state.wheelCamelot = keyInfo.camelot;
      engine.playKeyChord(keyInfo.pitchClass, keyInfo.mode);
      renderCamelotTransitions();
      if (!getActiveTrack()) {
        renderChromagram(null);
      }
    },
  });

  bindEvents();
  renderDeck();
}

init();

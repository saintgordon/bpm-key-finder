/**
 * BPM & Key Finder (TOOL / 005) — Saint Gordon Collective
 * Clean, Focused Studio Controller:
 * Drop -> Instant BPM & Key -> Ear-Check (Click Track / Hear Key) -> Copy.
 */

import {
  PITCH_CLASSES_FLAT,
  PITCH_CLASSES_SHARP,
  analyzeAudioBuffer,
  exportQueueToCsv,
  exportQueueToMarkdown,
  formatKeyName,
  formatTime,
  formatTrackTag,
  getCompatibleKeys,
  getKeyByCamelot,
  getKeyInfo,
  isSupportedAudioFilename,
} from './music-analyzer.js';
import { AuditionEngine, generateDemoTrackBuffer } from './audio-audition.js';
import { CamelotWheelView } from './camelot-wheel.js';

const engine = new AuditionEngine();

const state = {
  tracks: [],
  activeTrackId: null,
  accidentalStyle: 'auto', // 'auto' | 'sharp' | 'flat'
  wheelCamelot: '11A',
  tapTimes: [],
  tapBpm: null,
  isProcessing: false,
  rafId: null,
  nextId: 1,
};

const dom = {
  footerYear: document.getElementById('footer-year'),
  pageDropOverlay: document.getElementById('page-drop-overlay'),

  // Upload & Collapsed Top Bar
  fileInput: document.getElementById('file-upload-input'),
  folderInput: document.getElementById('folder-upload-input'),
  dropzone: document.getElementById('upload-dropzone'),
  dropzoneClick: document.getElementById('dropzone-click-target'),
  btnSelectFiles: document.getElementById('btn-select-files'),
  btnSelectFolder: document.getElementById('btn-select-folder'),
  btnLoadDemo: document.getElementById('btn-load-demo'),
  compactActionBar: document.getElementById('compact-action-bar'),
  btnAddMoreBar: document.getElementById('btn-add-more-bar'),
  btnAddFolderBar: document.getElementById('btn-add-folder-bar'),
  btnClearSession: document.getElementById('btn-clear-session'),

  // Progress & Errors
  progressContainer: document.getElementById('analysis-progress-container'),
  progressText: document.getElementById('analysis-progress-text'),
  progressPct: document.getElementById('analysis-progress-pct'),
  progressBar: document.getElementById('analysis-progress-bar'),
  errorsBanner: document.getElementById('analysis-errors-banner'),
  errorsTitle: document.getElementById('analysis-errors-title'),
  errorsList: document.getElementById('analysis-errors-list'),
  btnDismissErrors: document.getElementById('btn-dismiss-errors'),

  // Hero Result Deck
  studioDeck: document.getElementById('studio-deck'),
  deckLed: document.getElementById('deck-led'),
  deckTrackName: document.getElementById('deck-track-name'),
  deckTrackSpecs: document.getElementById('deck-track-specs'),
  btnPrevTrack: document.getElementById('btn-prev-track'),
  btnNextTrack: document.getElementById('btn-next-track'),
  btnCopyAll: document.getElementById('btn-copy-all'),

  // Left: BPM
  bpmHeroValue: document.getElementById('bpm-hero-value'),
  bpmConfidenceBadge: document.getElementById('bpm-confidence-badge'),
  bpmOverrideBadge: document.getElementById('bpm-override-badge'),
  btnHalfBpm: document.getElementById('btn-half-bpm'),
  btnDoubleBpm: document.getElementById('btn-double-bpm'),
  btnResetBpm: document.getElementById('btn-reset-bpm'),
  btnCopyBpm: document.getElementById('btn-copy-bpm'),

  // Right: Key
  keyHeroValue: document.getElementById('key-hero-value'),
  keyRelativeMeta: document.getElementById('key-relative-meta'),
  keyCamelotBadge: document.getElementById('key-camelot-badge'),
  keyConfidenceBadge: document.getElementById('key-confidence-badge'),
  keyTuningBadge: document.getElementById('key-tuning-badge'),
  btnEnharmonicToggle: document.getElementById('btn-enharmonic-toggle'),
  enharmonicModeLabel: document.getElementById('enharmonic-mode-label'),
  btnCopyKey: document.getElementById('btn-copy-key'),

  // Player & Ear-Check
  btnPlayPause: document.getElementById('btn-play-pause'),
  playBtnGlyph: document.getElementById('play-btn-glyph'),
  playBtnText: document.getElementById('play-btn-text'),
  waveformScrubber: document.getElementById('waveform-scrubber'),
  waveformCanvas: document.getElementById('waveform-canvas'),
  timelineProgressBar: document.getElementById('timeline-progress-bar'),
  timelinePlayhead: document.getElementById('timeline-playhead'),
  timelineTime: document.getElementById('timeline-time'),
  btnMetronome: document.getElementById('btn-metronome'),
  metroDots: document.getElementById('metro-dots'),
  btnPlayChord: document.getElementById('btn-play-chord'),
  volumeSlider: document.getElementById('master-volume-slider'),

  // Reverb & Delay Counter Cross-Link
  reverbDelayBpm: document.getElementById('reverb-delay-bpm'),
  reverbDelayLink: document.getElementById('reverb-delay-link'),

  // Collapsible More Details Drawer
  moreDetailsDrawer: document.getElementById('more-details-drawer'),
  bpmCandidatesList: document.getElementById('bpm-candidates-list'),
  keyCandidatesList: document.getElementById('key-candidates-list'),
  btnTapTempo: document.getElementById('btn-tap-tempo'),
  tapReadout: document.getElementById('tap-readout'),
  btnClearTap: document.getElementById('btn-clear-tap'),
  chromaChart: document.getElementById('chroma-chart'),
  chromaScaleNotes: document.getElementById('chroma-scale-notes'),
  camelotWheelMount: document.getElementById('camelot-wheel-mount'),
  btnWheelReset: document.getElementById('btn-wheel-reset'),
  compatActiveLabel: document.getElementById('compat-active-label'),
  compatList: document.getElementById('compat-list'),

  // Batch Queue (2+ tracks only)
  queueSection: document.getElementById('queue-section'),
  queueCountText: document.getElementById('queue-count-text'),
  btnExportCsv: document.getElementById('btn-export-csv'),
  btnExportMd: document.getElementById('btn-export-md'),
  queueTableBody: document.getElementById('queue-table-body'),

  toastContainer: document.getElementById('toast-container'),
};

let camelotWheel = null;

/* ==========================================================================
   HELPERS
   ========================================================================== */

function getActiveTrack() {
  if (state.activeTrackId === null) return null;
  return state.tracks.find((t) => t.id === state.activeTrackId) || null;
}

function getEffectiveKeyInfo() {
  const track = getActiveTrack();
  if (track) return track.effectiveKeyInfo;
  return getKeyByCamelot(state.wheelCamelot);
}

/**
 * Format BPM cleanly: hide ".0" when exact integer (e.g. "124"), keep tenths when fractional ("128.5").
 */
function formatBpmPlain(bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) return '—';
  const rounded = Math.round(bpm * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatBpmHtml(bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) return '—';
  const rounded = Math.round(bpm * 10) / 10;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  const [whole, dec] = rounded.toFixed(1).split('.');
  return `${whole}<span class="bpm-dec">.${dec}</span>`;
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
  }, 2400);
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
   RECURSIVE FILE & FOLDER DROP COLLECTION
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
   AUDIO DECODING & ANALYSIS PIPELINE
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
    if (skipped.length > 0) renderErrors(skipped);
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

  dom.progressText.textContent = `Done (${audioFiles.length} file${audioFiles.length === 1 ? '' : 's'})`;
  dom.progressPct.textContent = '100%';
  dom.progressBar.style.width = '100%';
  state.isProcessing = false;

  window.setTimeout(() => {
    if (!state.isProcessing) {
      dom.progressContainer.classList.add('hidden');
    }
  }, 550);

  if (errors.length > 0) renderErrors(errors);

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
  const detectedBpm = analysis.bpm.bpm || 0;
  const detectedKey = getKeyInfo(analysis.key.pitchClass, analysis.key.mode);
  return {
    id: state.nextId++,
    name,
    audioBuffer,
    analysis,
    bpmMultiplier: 1,
    bpmOverride: null,
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
    .slice(0, 6)
    .map((m) => `<li>${escapeHtml(m)}</li>`)
    .join('');
  if (messages.length > 6) {
    dom.errorsList.innerHTML += `<li>…and ${messages.length - 6} more</li>`;
  }
  dom.errorsBanner.classList.remove('hidden');
}

async function loadDemoBeat() {
  const ctx = engine.ensureContext();
  dom.progressContainer.classList.remove('hidden');
  dom.progressText.textContent = 'Synthesizing & analyzing demo beat...';
  dom.progressPct.textContent = '50%';
  dom.progressBar.style.width = '50%';
  await nextUiFrame();

  const demoBuffer = generateDemoTrackBuffer(ctx);
  const analysis = analyzeAudioBuffer(demoBuffer);
  const track = createTrackItem('Saint Gordon — Demo Beat (124 BPM · F#m).wav', demoBuffer, analysis);
  state.tracks.push(track);

  dom.progressPct.textContent = '100%';
  dom.progressBar.style.width = '100%';
  window.setTimeout(() => dom.progressContainer.classList.add('hidden'), 300);

  selectTrack(track.id);
  renderQueue();
  showToast(
    `Loaded demo: ${formatBpmPlain(track.effectiveBpm)} BPM · ${track.effectiveKeyInfo.key} (${track.effectiveKeyInfo.camelot})`
  );
}

/* ==========================================================================
   TRACK SELECTION & RENDERING
   ========================================================================== */

function selectTrack(trackId) {
  const track = state.tracks.find((t) => t.id === trackId);
  if (!track) return;

  state.activeTrackId = track.id;
  state.tapTimes = [];
  state.tapBpm = null;
  dom.tapReadout.textContent = 'Ready';
  dom.btnClearTap.classList.add('hidden');

  engine.loadTrack(track.audioBuffer, track.effectiveBpm || 120, track.beatOffsetSec);

  state.wheelCamelot = track.effectiveKeyInfo.camelot;
  if (camelotWheel) {
    camelotWheel.setDetected(track.effectiveKeyInfo.camelot);
  }

  renderAll();
  // Ensure waveform canvas measures non-zero width right after revealing #studio-deck
  window.requestAnimationFrame(drawWaveformCanvas);
}

function navigateTrack(delta) {
  if (state.tracks.length < 2) return;
  const idx = state.tracks.findIndex((t) => t.id === state.activeTrackId);
  const nextIdx = (idx + delta + state.tracks.length) % state.tracks.length;
  selectTrack(state.tracks[nextIdx].id);
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
    renderAll();
  }
}

function clearSession() {
  engine.stopAll();
  state.tracks = [];
  state.activeTrackId = null;
  state.tapTimes = [];
  state.tapBpm = null;
  state.wheelCamelot = '11A';
  dom.tapReadout.textContent = 'Ready';
  dom.btnClearTap.classList.add('hidden');
  dom.errorsBanner.classList.add('hidden');
  if (camelotWheel) {
    camelotWheel.setDetected(null);
    camelotWheel.setActive('11A');
  }
  renderAll();
  showToast('Session cleared');
}

function renderAll() {
  const track = getActiveTrack();
  const hasTrack = Boolean(track);

  // Smart Dropzone collapses to 1-line bar once a track is loaded
  dom.dropzone.classList.toggle('hidden', hasTrack);
  dom.compactActionBar.classList.toggle('hidden', !hasTrack);
  dom.studioDeck.classList.toggle('hidden', !hasTrack);

  if (hasTrack) {
    renderDeck(track);
  }
  renderDetailsDrawer(track);
  renderQueue();
}

function renderDeck(track) {
  const hasMultiple = state.tracks.length > 1;
  dom.btnPrevTrack.classList.toggle('hidden', !hasMultiple);
  dom.btnNextTrack.classList.toggle('hidden', !hasMultiple);

  dom.studioDeck.dataset.state = engine.isPlaying ? 'playing' : 'ready';
  dom.deckTrackName.textContent = track.name;
  dom.deckTrackName.title = track.name;
  const khz = (track.analysis.sampleRate / 1000).toFixed(1);
  const chLabel =
    track.analysis.channels === 1
      ? 'MONO'
      : track.analysis.channels === 2
        ? 'STEREO'
        : `${track.analysis.channels}CH`;
  dom.deckTrackSpecs.textContent = `${khz} kHz · ${chLabel}`;

  // LEFT — BPM Readout
  const bpm = track.effectiveBpm;
  dom.bpmHeroValue.innerHTML = formatBpmHtml(bpm);

  const bpmConf = track.analysis.bpm.confidence;
  dom.bpmConfidenceBadge.textContent = `${bpmConf}% MATCH`;
  dom.bpmConfidenceBadge.classList.toggle('badge-bright', bpmConf >= 75);

  let overrideLabel = '';
  if (track.bpmOverride !== null) {
    overrideLabel = state.tapBpm ? 'TAPPED' : 'ALT PEAK';
  } else if (track.bpmMultiplier === 0.5) {
    overrideLabel = 'HALF-TIME';
  } else if (track.bpmMultiplier === 2) {
    overrideLabel = 'DOUBLE-TIME';
  }
  dom.bpmOverrideBadge.textContent = overrideLabel;
  dom.bpmOverrideBadge.classList.toggle('hidden', !overrideLabel);

  dom.btnHalfBpm.disabled = !(bpm > 0);
  dom.btnDoubleBpm.disabled = !(bpm > 0);
  dom.btnHalfBpm.classList.toggle('deck-pill-active', track.bpmMultiplier === 0.5);
  dom.btnDoubleBpm.classList.toggle('deck-pill-active', track.bpmMultiplier === 2);
  dom.btnResetBpm.classList.toggle(
    'hidden',
    !(track.bpmMultiplier !== 1 || track.bpmOverride !== null)
  );

  // RIGHT — Musical Key Readout
  const keyInfo = track.effectiveKeyInfo;
  dom.keyHeroValue.textContent = formatKeyName(keyInfo, state.accidentalStyle, false);
  dom.keyRelativeMeta.textContent = `Relative: ${keyInfo.relativeKey}`;
  dom.keyCamelotBadge.textContent = keyInfo.camelot;

  const keyConf = track.analysis.key.confidence;
  dom.keyConfidenceBadge.textContent = track.keyOverridden ? 'SELECTED' : `${keyConf}% MATCH`;
  dom.keyConfidenceBadge.classList.toggle('badge-bright', !track.keyOverridden && keyConf >= 70);

  const cents = track.analysis.key.tuningCents || 0;
  if (Math.abs(cents) >= 8) {
    const sign = cents > 0 ? '+' : '';
    dom.keyTuningBadge.textContent = `${sign}${cents}¢`;
    dom.keyTuningBadge.classList.remove('hidden');
  } else {
    dom.keyTuningBadge.classList.add('hidden');
  }

  dom.enharmonicModeLabel.textContent =
    state.accidentalStyle === 'auto'
      ? 'AUTO'
      : state.accidentalStyle === 'sharp'
        ? '#'
        : '♭';

  // Player & Ear-Check Controls
  dom.playBtnGlyph.textContent = engine.isPlaying ? '❚❚' : '▶';
  dom.playBtnText.textContent = engine.isPlaying ? 'Pause' : 'Play';
  dom.btnMetronome.setAttribute('aria-pressed', String(engine.metronomeEnabled));
  dom.btnMetronome.classList.toggle('deck-pill-active', engine.metronomeEnabled);

  updatePlayheadVisuals();
  drawWaveformCanvas();

  // Dynamic Reverb & Delay Counter Cross-Link
  const linkBpm = bpm > 0 ? formatBpmPlain(bpm) : '120';
  dom.reverbDelayBpm.textContent = linkBpm;
  dom.reverbDelayLink.href = `https://saintgordon.github.io/reverb-delay-counter/?bpm=${encodeURIComponent(linkBpm)}`;
}

/* ==========================================================================
   COLLAPSIBLE DETAILS DRAWER (RUNNER-UPS, TAP TEMPO, CHROMAGRAM, CAMELOT)
   ========================================================================== */

function renderDetailsDrawer(track) {
  // Runner-Up BPM Candidates
  const bpmCands = track?.analysis?.bpm?.candidates || [];
  if (!track || bpmCands.length === 0) {
    dom.bpmCandidatesList.innerHTML =
      '<span class="micro muted-note">Load a track to inspect alternate tempo peaks</span>';
  } else {
    dom.bpmCandidatesList.innerHTML = bpmCands
      .map((cand, idx) => {
        const isActive = Math.abs(track.effectiveBpm - cand.bpm) < 0.06;
        return `<button type="button" class="cand-chip${isActive ? ' active' : ''}" data-bpm-cand="${cand.bpm}">
          <span>${idx + 1}. ${formatBpmPlain(cand.bpm)} BPM</span>
          <span class="cand-score">${cand.score}%</span>
        </button>`;
      })
      .join('');
  }

  // Runner-Up Key Candidates
  const keyCands = track?.analysis?.key?.candidates || [];
  const activeCamelot = track?.effectiveKeyInfo?.camelot || null;
  if (!track || keyCands.length === 0) {
    dom.keyCandidatesList.innerHTML =
      '<span class="micro muted-note">Load a track to compare top key candidates</span>';
  } else {
    dom.keyCandidatesList.innerHTML = keyCands
      .map((c, idx) => {
        const isActive = c.camelot === activeCamelot;
        const shortLabel = formatKeyName(c, state.accidentalStyle, true);
        return `<button type="button" class="cand-chip${isActive ? ' active' : ''}" data-key-cand="${c.camelot}" title="Hear & switch to ${escapeHtml(formatKeyName(c, state.accidentalStyle, false))}">
          <span>${idx + 1}. ${escapeHtml(shortLabel)} (${c.camelot})</span>
          <span class="cand-score">${c.scorePct}%</span>
        </button>`;
      })
      .join('');
  }

  renderChromagram(track);
  renderCamelotTransitions();
}

function getPitchLabels() {
  if (state.accidentalStyle === 'flat') return PITCH_CLASSES_FLAT;
  if (state.accidentalStyle === 'sharp') return PITCH_CLASSES_SHARP;
  const keyInfo = getEffectiveKeyInfo();
  if (
    keyInfo &&
    (keyInfo.tonic.includes('♭') || ['F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭'].includes(keyInfo.tonic))
  ) {
    return PITCH_CLASSES_FLAT;
  }
  return PITCH_CLASSES_SHARP;
}

function renderChromagram(track) {
  const labels = getPitchLabels();
  const keyInfo = track ? track.effectiveKeyInfo : getKeyByCamelot(state.wheelCamelot);
  const chroma =
    Array.isArray(track?.analysis?.key?.chroma) && track.analysis.key.chroma.length === 12
      ? track.analysis.key.chroma
      : new Array(12).fill(0.08);
  const scaleSet = new Set(keyInfo ? keyInfo.scalePitchClasses : []);
  const tonicPc = keyInfo ? keyInfo.pitchClass : -1;

  dom.chromaChart.innerHTML = labels
    .map((note, pc) => {
      const val = Number(chroma[pc]) || 0;
      const pct = Math.max(4, Math.min(100, Math.round(val * 100)));
      const isTonic = pc === tonicPc;
      const inScale = scaleSet.has(pc);
      const cls = isTonic ? 'is-tonic in-scale' : inScale ? 'in-scale' : '';
      const marker = isTonic ? '★' : inScale ? '·' : '';

      return `<button type="button" class="chroma-col ${cls}" data-pc="${pc}" role="listitem" title="${note}: ${Math.round(val * 100)}% — click to hear pitch">
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
    dom.chromaScaleNotes.textContent = 'SCALE: —';
  }
}

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
  )}`;

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
      return `<button type="button" class="compat-item${isExact ? ' is-exact' : ''}" data-compat-camelot="${item.camelot}" title="Inspect ${item.camelot} and hear ${escapeHtml(keyLabel)} triad">
        <span class="compat-rel">${escapeHtml(item.label)}</span>
        <span class="compat-key-val">${item.camelot} · ${escapeHtml(keyLabel)}</span>
      </button>`;
    })
    .join('');
}

/* ==========================================================================
   WAVEFORM CANVAS & PLAYHEAD
   ========================================================================== */

function drawWaveformCanvas() {
  const canvas = dom.waveformCanvas;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(240, Math.floor(rect.width));
  const h = Math.max(44, Math.floor(rect.height));

  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

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

  // Subtle bar / beat tick marks behind waveform
  if (bpm > 0 && duration > 0) {
    const periodSec = 60 / bpm;
    const totalBeats = duration / periodSec;
    const stepBeats = totalBeats > 240 ? 4 : 1;
    const offset = track.beatOffsetSec % periodSec;

    for (let b = 0; ; b += stepBeats) {
      const t = offset + b * periodSec;
      if (t > duration) break;
      const x = (t / duration) * w;
      const isBar = b % 4 === 0;
      ctx.strokeStyle = isBar ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, isBar ? 0 : h * 0.16);
      ctx.lineTo(x, isBar ? h : h * 0.84);
      ctx.stroke();
    }
  }

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
    dom.timelineTime.textContent = '0:00 / 0:00';
    return;
  }
  const dur = track.analysis.durationSec || 1;
  const now = engine.getCurrentTime();
  const pct = Math.max(0, Math.min(100, (now / dur) * 100));

  dom.timelineProgressBar.style.width = `${pct}%`;
  dom.timelinePlayhead.style.left = `${pct}%`;
  dom.timelineTime.textContent = `${formatTime(now)} / ${formatTime(dur)}`;
  dom.waveformScrubber.setAttribute('aria-valuemax', String(Math.round(dur)));
  dom.waveformScrubber.setAttribute('aria-valuenow', String(Math.round(now)));
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
   BATCH QUEUE (ONLY VISIBLE WHEN 2+ TRACKS LOADED)
   ========================================================================== */

function renderQueue() {
  const count = state.tracks.length;
  dom.queueSection.classList.toggle('hidden', count < 2);
  if (count < 2) return;

  dom.queueCountText.textContent = `${count} Tracks Analyzed`;

  dom.queueTableBody.innerHTML = state.tracks
    .map((track) => {
      const isActive = track.id === state.activeTrackId;
      const keyInfo = track.effectiveKeyInfo;
      const keyLabel = formatKeyName(keyInfo, state.accidentalStyle, false);

      return `<div class="queue-row${isActive ? ' active-row' : ''}" data-track-id="${track.id}" role="listitem" tabindex="0" aria-current="${isActive ? 'true' : 'false'}">
        <div class="q-col-name q-track-name" title="${escapeHtml(track.name)}">${escapeHtml(track.name)}</div>
        <div class="q-col-bpm bpm-cell">${formatBpmPlain(track.effectiveBpm)}</div>
        <div class="q-col-key">${escapeHtml(keyLabel)}</div>
        <div class="q-col-cam"><span class="camelot-pill">${keyInfo.camelot}</span></div>
        <div class="q-col-act">
          <button type="button" class="btn-row-copy" data-copy-id="${track.id}" title="Copy BPM & Key">COPY</button>
          <button type="button" class="btn-remove-row" data-remove-id="${track.id}" title="Remove track" aria-label="Remove ${escapeHtml(track.name)}">×</button>
        </div>
      </div>`;
    })
    .join('');
}

/* ==========================================================================
   TEMPO MODIFIERS & MANUAL TAP TEMPO
   ========================================================================== */

function toggleOctaveMultiplier(mult) {
  const track = getActiveTrack();
  if (!track) return;

  const baseBpm = track.bpmOverride ?? (track.analysis.bpm.bpm || 120);
  track.bpmMultiplier = track.bpmMultiplier === mult ? 1 : mult;
  track.effectiveBpm = Math.round(baseBpm * track.bpmMultiplier * 10) / 10;
  engine.updateTempoGrid(track.effectiveBpm, track.beatOffsetSec);
  renderAll();
}

function resetTrackBpm() {
  const track = getActiveTrack();
  if (!track) return;
  track.bpmMultiplier = 1;
  track.bpmOverride = null;
  track.effectiveBpm = track.analysis.bpm.bpm || 0;
  state.tapTimes = [];
  state.tapBpm = null;
  dom.tapReadout.textContent = 'Ready';
  dom.btnClearTap.classList.add('hidden');
  engine.updateTempoGrid(track.effectiveBpm || 120, track.beatOffsetSec);
  renderAll();
}

function handleTapTempo() {
  const now = performance.now();
  if (state.tapTimes.length > 0 && now - state.tapTimes[state.tapTimes.length - 1] > 2200) {
    state.tapTimes = [];
  }
  state.tapTimes.push(now);
  if (state.tapTimes.length > 9) state.tapTimes.shift();

  dom.btnClearTap.classList.remove('hidden');

  if (state.tapTimes.length < 2) {
    dom.tapReadout.textContent = 'Tap again...';
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
  dom.tapReadout.textContent = `${formatBpmPlain(bpm)} BPM (${state.tapTimes.length} taps)`;

  const track = getActiveTrack();
  if (track) {
    track.bpmOverride = bpm;
    track.bpmMultiplier = 1;
    track.effectiveBpm = bpm;
    engine.updateTempoGrid(bpm, track.beatOffsetSec);
    renderAll();
  } else {
    engine.updateTempoGrid(bpm, 0);
  }
}

/* ==========================================================================
   METRONOME BEAT VISUAL PULSE
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
    }, 90);
  }
};

engine.onTrackEnded = () => {
  const track = getActiveTrack();
  if (track) renderDeck(track);
};

/* ==========================================================================
   EVENT LISTENERS & INITIALIZATION
   ========================================================================== */

function bindEvents() {
  const openFilePicker = (e) => {
    if (e) e.stopPropagation();
    dom.fileInput.value = '';
    dom.fileInput.click();
  };
  const openFolderPicker = (e) => {
    if (e) e.stopPropagation();
    dom.folderInput.value = '';
    dom.folderInput.click();
  };

  dom.btnSelectFiles.addEventListener('click', openFilePicker);
  dom.btnSelectFolder.addEventListener('click', openFolderPicker);
  dom.btnAddMoreBar.addEventListener('click', openFilePicker);
  dom.btnAddFolderBar.addEventListener('click', openFolderPicker);
  dom.btnClearSession.addEventListener('click', clearSession);

  dom.dropzoneClick.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openFilePicker();
  });

  dom.fileInput.addEventListener('change', (e) => {
    if (e.target.files?.length) ingestFiles(e.target.files);
  });

  dom.folderInput.addEventListener('change', (e) => {
    if (e.target.files?.length) ingestFiles(e.target.files);
  });

  dom.btnLoadDemo.addEventListener('click', (e) => {
    e.stopPropagation();
    loadDemoBeat();
  });

  dom.btnDismissErrors.addEventListener('click', () => {
    dom.errorsBanner.classList.add('hidden');
  });

  // Whole-Page Drag & Drop (works before AND after loading!)
  let windowDragDepth = 0;
  const hasFileDrag = (e) =>
    Boolean(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));

  window.addEventListener('dragenter', (e) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    windowDragDepth++;
    dom.pageDropOverlay.classList.remove('hidden');
    dom.dropzone.classList.add('drag-over');
    dom.compactActionBar.classList.add('drag-over');
  });

  window.addEventListener('dragover', (e) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });

  window.addEventListener('dragleave', (e) => {
    if (!hasFileDrag(e)) return;
    windowDragDepth = Math.max(0, windowDragDepth - 1);
    if (windowDragDepth === 0) {
      dom.pageDropOverlay.classList.add('hidden');
      dom.dropzone.classList.remove('drag-over');
      dom.compactActionBar.classList.remove('drag-over');
    }
  });

  window.addEventListener('drop', async (e) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    windowDragDepth = 0;
    dom.pageDropOverlay.classList.add('hidden');
    dom.dropzone.classList.remove('drag-over');
    dom.compactActionBar.classList.remove('drag-over');
    if (e.dataTransfer) {
      const files = await collectFilesFromDataTransfer(e.dataTransfer);
      if (files.length > 0) ingestFiles(files);
    }
  });

  // Deck Navigation & 1-Click Copy Buttons
  dom.btnPrevTrack.addEventListener('click', () => navigateTrack(-1));
  dom.btnNextTrack.addEventListener('click', () => navigateTrack(1));

  dom.btnCopyAll.addEventListener('click', () => {
    const track = getActiveTrack();
    if (!track) return;
    const tag = formatTrackTag(track.effectiveBpm, track.effectiveKeyInfo, state.accidentalStyle);
    copyTextToClipboard(tag, `Copied: ${tag}`);
  });

  dom.btnCopyBpm.addEventListener('click', () => {
    const track = getActiveTrack();
    if (!track || !(track.effectiveBpm > 0)) return;
    const text = `${formatBpmPlain(track.effectiveBpm)} BPM`;
    copyTextToClipboard(text, `Copied: ${text}`);
  });

  dom.btnCopyKey.addEventListener('click', () => {
    const track = getActiveTrack();
    if (!track) return;
    const k = track.effectiveKeyInfo;
    const text = `${formatKeyName(k, state.accidentalStyle, false)} (${k.camelot})`;
    copyTextToClipboard(text, `Copied: ${text}`);
  });

  // BPM & Key Readout Toggles
  dom.btnHalfBpm.addEventListener('click', () => toggleOctaveMultiplier(0.5));
  dom.btnDoubleBpm.addEventListener('click', () => toggleOctaveMultiplier(2));
  dom.btnResetBpm.addEventListener('click', resetTrackBpm);

  dom.btnEnharmonicToggle.addEventListener('click', () => {
    const order = ['auto', 'sharp', 'flat'];
    state.accidentalStyle = order[(order.indexOf(state.accidentalStyle) + 1) % order.length];
    if (camelotWheel) camelotWheel.setAccidentalStyle(state.accidentalStyle);
    renderAll();
  });

  // Player & Ear-Check Controls
  dom.btnPlayPause.addEventListener('click', () => {
    if (!getActiveTrack()) return;
    engine.togglePlay();
    if (engine.isPlaying) startAnimationLoop();
    const track = getActiveTrack();
    if (track) renderDeck(track);
  });

  dom.btnMetronome.addEventListener('click', () => {
    const on = engine.setMetronomeEnabled(!engine.metronomeEnabled);
    if (!on && dom.metroDots) {
      dom.metroDots.querySelectorAll('.metro-dot').forEach((d) => d.classList.remove('lit'));
    }
    const track = getActiveTrack();
    if (track) renderDeck(track);
  });

  dom.btnPlayChord.addEventListener('click', () => {
    const keyInfo = getEffectiveKeyInfo();
    if (!keyInfo) return;
    engine.playKeyChord(keyInfo.pitchClass, keyInfo.mode);
    showToast(`Playing ${formatKeyName(keyInfo, state.accidentalStyle, false)} (${keyInfo.camelot})`);
  });

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

  // Details Drawer: Runner-Up BPM, Runner-Up Keys, Tap Tempo, Chromagram, Camelot Wheel
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
    dom.tapReadout.textContent = 'Ready';
    dom.btnClearTap.classList.add('hidden');
    engine.updateTempoGrid(bpm, track.beatOffsetSec);
    renderAll();
    showToast(`Switched BPM to ${formatBpmPlain(bpm)}`);
  });

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
      renderAll();
    }
    showToast(`Playing ${formatKeyName(keyInfo, state.accidentalStyle, false)} (${keyInfo.camelot})`);
  });

  dom.btnTapTempo.addEventListener('click', handleTapTempo);
  dom.btnClearTap.addEventListener('click', () => {
    state.tapTimes = [];
    state.tapBpm = null;
    dom.tapReadout.textContent = 'Ready';
    dom.btnClearTap.classList.add('hidden');
    if (getActiveTrack()) {
      resetTrackBpm();
    } else {
      engine.updateTempoGrid(120, 0);
    }
  });

  dom.chromaChart.addEventListener('click', (e) => {
    const col = e.target.closest('[data-pc]');
    if (!col) return;
    const pc = parseInt(col.dataset.pc, 10);
    if (Number.isFinite(pc)) engine.playPitchNote(pc);
  });

  dom.compatList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-compat-camelot]');
    if (!btn) return;
    if (camelotWheel) {
      camelotWheel.setActive(btn.dataset.compatCamelot, { notify: true });
    }
  });

  dom.btnWheelReset.addEventListener('click', () => {
    const track = getActiveTrack();
    if (!track) return;
    state.wheelCamelot = track.effectiveKeyInfo.camelot;
    if (camelotWheel) camelotWheel.setActive(state.wheelCamelot);
    renderCamelotTransitions();
  });

  // Batch Queue Interactions & Exports
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
    const csv = exportQueueToCsv(state.tracks, state.accidentalStyle);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerFileDownload(`saint-gordon-bpm-key-${stamp}.csv`, csv, 'text/csv;charset=utf-8');
    showToast(`Exported CSV (${state.tracks.length} tracks)`);
  });

  dom.btnExportMd.addEventListener('click', () => {
    if (state.tracks.length === 0) return;
    const md = exportQueueToMarkdown(state.tracks, state.accidentalStyle);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerFileDownload(`saint-gordon-bpm-key-${stamp}.md`, md, 'text/markdown;charset=utf-8');
    showToast(`Exported Report (${state.tracks.length} tracks)`);
  });

  // Clean Keyboard Shortcuts
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
      dom.btnPlayPause.click();
    } else if (key === 'm') {
      if (!getActiveTrack() && !state.tapBpm) return;
      e.preventDefault();
      dom.btnMetronome.click();
    } else if (key === 'c') {
      e.preventDefault();
      dom.btnPlayChord.click();
    } else if (key === 't') {
      e.preventDefault();
      if (!dom.moreDetailsDrawer.open) dom.moreDetailsDrawer.open = true;
      handleTapTempo();
    }
  });

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
  renderAll();
}

init();

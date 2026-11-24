/**
 * Interactive Monochrome SVG Camelot Harmonic Mixing Wheel (24 Segments)
 *
 * Inner ring: Minor keys (1A – 12A)
 * Outer ring: Major keys (1B – 12B)
 * Strictly monochrome Saint Gordon Collective aesthetic:
 *  - Active segment: Solid paper-white (#f2f2f2) with crisp #101010 ink typography
 *  - Harmonic neighbors (Relative A<->B, -1, +1): Monochrome diagonal hatch pattern + crisp light stroke
 *  - Energy Boost (+2): Subtle dot/grid tint + dashed emphasis
 *  - Interactive: Click or Enter/Space on any segment to inspect compatible transitions & audition chord
 */

import {
  CAMELOT_WHEEL,
  formatKeyName,
  getCompatibleKeys,
  getKeyByCamelot,
} from './music-analyzer.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/**
 * Create an SVG path string for an annular wedge segment.
 */
function buildWedgePath(cx, cy, rInner, rOuter, startDeg, endDeg) {
  const p1 = polarToCartesian(cx, cy, rOuter, startDeg);
  const p2 = polarToCartesian(cx, cy, rOuter, endDeg);
  const p3 = polarToCartesian(cx, cy, rInner, endDeg);
  const p4 = polarToCartesian(cx, cy, rInner, startDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;

  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export class CamelotWheelView {
  constructor(containerEl, { onSelect } = {}) {
    this.container = containerEl;
    this.onSelect = onSelect;
    this.activeCamelot = '11A';
    this.detectedCamelot = null;
    this.accidentalStyle = 'auto';
    this.segmentNodes = new Map();
    this.hubCodeEl = null;
    this.hubKeyEl = null;
    this.hubOpenEl = null;

    this._renderBaseSvg();
  }

  _renderBaseSvg() {
    const cx = 210;
    const cy = 210;
    const rHub = 54;
    const rMid = 128;
    const rOuter = 200;

    const svg = svgEl('svg', {
      viewBox: '0 0 420 420',
      class: 'camelot-svg',
      role: 'group',
      'aria-label': 'Interactive Camelot Harmonic Mixing Wheel',
    });

    // Monochrome SVG hatch patterns for Saint Gordon editorial texture
    const defs = svgEl('defs');

    // Diagonal hatch for harmonic neighbors (-1, +1, Relative)
    const hatchNeighbor = svgEl('pattern', {
      id: 'sg-hatch-neighbor',
      width: 8,
      height: 8,
      patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(45)',
    });
    hatchNeighbor.appendChild(svgEl('rect', { width: 8, height: 8, fill: '#3f3f3f' }));
    hatchNeighbor.appendChild(
      svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 8, stroke: '#5e5e5e', 'stroke-width': 2.5 })
    );
    defs.appendChild(hatchNeighbor);

    // Finer cross-hatch for Relative Major/Minor
    const hatchRelative = svgEl('pattern', {
      id: 'sg-hatch-relative',
      width: 7,
      height: 7,
      patternUnits: 'userSpaceOnUse',
      patternTransform: 'rotate(-45)',
    });
    hatchRelative.appendChild(svgEl('rect', { width: 7, height: 7, fill: '#4e4e4e' }));
    hatchRelative.appendChild(
      svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 7, stroke: '#737373', 'stroke-width': 2.2 })
    );
    defs.appendChild(hatchRelative);

    // Subtle dark hatch for +2 Energy Boost
    const hatchBoost = svgEl('pattern', {
      id: 'sg-hatch-boost',
      width: 6,
      height: 6,
      patternUnits: 'userSpaceOnUse',
    });
    hatchBoost.appendChild(svgEl('rect', { width: 6, height: 6, fill: '#282828' }));
    hatchBoost.appendChild(svgEl('circle', { cx: 3, cy: 3, r: 0.9, fill: '#6c6c6c' }));
    defs.appendChild(hatchBoost);

    svg.appendChild(defs);

    // Subtle outer hairline frame ring
    svg.appendChild(
      svgEl('circle', {
        cx,
        cy,
        r: rOuter + 5,
        fill: 'none',
        stroke: '#333333',
        'stroke-width': 1,
        'stroke-dasharray': '3 4',
      })
    );

    const segmentsGroup = svgEl('g', { class: 'camelot-segments' });

    // Clock layout: 12 at top (-90°), 1 at -60°, 2 at -30°, ..., 11 at -120°
    for (const entry of CAMELOT_WHEEL) {
      const clockPos = entry.camelotNum % 12; // 12 -> 0 (top), 1 -> 1, ..., 11 -> 11
      const centerDeg = -90 + clockPos * 30;
      const startDeg = centerDeg - 15;
      const endDeg = centerDeg + 15;

      const isMinor = entry.camelotLetter === 'A';
      const rIn = isMinor ? rHub : rMid;
      const rOut = isMinor ? rMid : rOuter;
      const rLabelCode = isMinor ? (rHub + rMid) * 0.5 - 6 : (rMid + rOuter) * 0.5 - 8;
      const rLabelKey = isMinor ? (rHub + rMid) * 0.5 + 11 : (rMid + rOuter) * 0.5 + 10;

      const g = svgEl('g', {
        class: `camelot-seg ${isMinor ? 'ring-minor' : 'ring-major'}`,
        'data-camelot': entry.camelot,
        role: 'button',
        tabindex: '0',
        'aria-label': `${entry.camelot} — ${entry.key}`,
      });

      const path = svgEl('path', {
        d: buildWedgePath(cx, cy, rIn, rOut, startDeg, endDeg),
        class: 'camelot-wedge',
      });
      g.appendChild(path);

      const posCode = polarToCartesian(cx, cy, rLabelCode, centerDeg);
      const posKey = polarToCartesian(cx, cy, rLabelKey, centerDeg);

      const codeText = svgEl('text', {
        x: posCode.x.toFixed(1),
        y: posCode.y.toFixed(1),
        class: 'camelot-code-label',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      codeText.textContent = entry.camelot;
      g.appendChild(codeText);

      const keyText = svgEl('text', {
        x: posKey.x.toFixed(1),
        y: posKey.y.toFixed(1),
        class: 'camelot-key-label',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      keyText.textContent = entry.shortName;
      g.appendChild(keyText);

      const activate = () => {
        this.setActive(entry.camelot, { notify: true });
      };
      g.addEventListener('click', activate);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });

      segmentsGroup.appendChild(g);
      this.segmentNodes.set(entry.camelot, { g, keyText, entry });
    }

    svg.appendChild(segmentsGroup);

    // Ring labels (MINOR / MAJOR hairline dividers)
    svg.appendChild(
      svgEl('circle', {
        cx,
        cy,
        r: rMid,
        fill: 'none',
        stroke: '#555555',
        'stroke-width': 1.2,
        'pointer-events': 'none',
      })
    );

    // Center Hardware Hub Medallion
    const hub = svgEl('g', { class: 'camelot-hub', 'pointer-events': 'none' });
    hub.appendChild(
      svgEl('circle', {
        cx,
        cy,
        r: rHub - 1,
        fill: '#0f0f0f',
        stroke: '#f2f2f2',
        'stroke-width': 1.5,
      })
    );

    this.hubCodeEl = svgEl('text', {
      x: cx,
      y: cy - 12,
      class: 'camelot-hub-code',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    hub.appendChild(this.hubCodeEl);

    this.hubKeyEl = svgEl('text', {
      x: cx,
      y: cy + 9,
      class: 'camelot-hub-key',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    hub.appendChild(this.hubKeyEl);

    this.hubOpenEl = svgEl('text', {
      x: cx,
      y: cy + 26,
      class: 'camelot-hub-open',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    hub.appendChild(this.hubOpenEl);

    svg.appendChild(hub);

    this.container.innerHTML = '';
    this.container.appendChild(svg);
    this._syncVisuals();
  }

  setAccidentalStyle(style) {
    this.accidentalStyle = style || 'auto';
    for (const { keyText, entry, g } of this.segmentNodes.values()) {
      const short = formatKeyName(entry, this.accidentalStyle, true);
      const full = formatKeyName(entry, this.accidentalStyle, false);
      keyText.textContent = short;
      g.setAttribute('aria-label', `${entry.camelot} — ${full}`);
    }
    this._syncVisuals();
  }

  setDetected(camelotCode) {
    this.detectedCamelot = camelotCode ? String(camelotCode).toUpperCase() : null;
    if (this.detectedCamelot) {
      this.activeCamelot = this.detectedCamelot;
    }
    this._syncVisuals();
  }

  setActive(camelotCode, { notify = false } = {}) {
    const code = String(camelotCode || '').toUpperCase();
    if (!this.segmentNodes.has(code)) return;
    this.activeCamelot = code;
    this._syncVisuals();
    if (notify && typeof this.onSelect === 'function') {
      this.onSelect(getKeyByCamelot(code));
    }
  }

  _syncVisuals() {
    const active = getKeyByCamelot(this.activeCamelot);
    const compat = active ? getCompatibleKeys(active.camelot) : null;

    const relCode = compat?.relative?.camelot;
    const minusCode = compat?.minusOne?.camelot;
    const plusCode = compat?.plusOne?.camelot;
    const boostCode = compat?.energyBoost?.camelot;

    for (const [code, { g }] of this.segmentNodes.entries()) {
      g.classList.remove(
        'state-active',
        'state-relative',
        'state-neighbor',
        'state-boost',
        'state-detected-marker'
      );

      if (code === this.activeCamelot) {
        g.classList.add('state-active');
        g.setAttribute('aria-pressed', 'true');
      } else {
        g.setAttribute('aria-pressed', 'false');
        if (code === relCode) {
          g.classList.add('state-relative');
        } else if (code === minusCode || code === plusCode) {
          g.classList.add('state-neighbor');
        } else if (code === boostCode) {
          g.classList.add('state-boost');
        }
      }

      if (this.detectedCamelot && code === this.detectedCamelot && code !== this.activeCamelot) {
        g.classList.add('state-detected-marker');
      }
    }

    if (active && this.hubCodeEl) {
      this.hubCodeEl.textContent = active.camelot;
      this.hubKeyEl.textContent = formatKeyName(active, this.accidentalStyle, true);
      this.hubOpenEl.textContent = `OPEN ${active.openKey.toUpperCase()}`;
    }
  }
}

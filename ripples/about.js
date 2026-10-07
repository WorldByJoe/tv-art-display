/* ---------------------------------------------------------------------------
   about.js · v1.1 · 2026-10-07
   what each piece on the wall is, and what was drawn for this run of it.

   Joe, 2026-10-03: "when the remote pushes the up button, it brings up an
   information screen that describes the overall nature of the viz and (when
   appropriate) the specific parameters used in this realization." wall.js
   draws the card (Wall.toggleCard, on the up key and nav.js's 'i' button) and
   fetches this file the first time it is wanted; this file only says what
   goes on it.

   ONE ENTRY PER FILE, keyed by the file name the wall navigates to:

     ABOUT['murmuration.html'] = {
       what:   two to four plain sentences: what the system or model is, where
               its data or its rules come from, what to watch for
       params: () => [ A('Label', () => value), ... ]
     };

   params() runs when the card opens and again every second while it is up,
   so a live value stays live. Each row reads the PAGE's own state by name.
   That works because this file is a classic script in the same document:
   top-level let/const/function declarations of the page's classic scripts
   share one global scope with it. Anything inside a page's IIFE or module is
   out of reach, and those pages expose a small window.* getter instead.

   A(label, fn) calls fn inside try/catch and drops the row when it throws or
   returns nothing, so a page whose state has changed shape loses a row
   rather than its card. The helpers live inside this file's own function
   scope: a page global called `n` or `A` would otherwise collide with them,
   and a collision between top-level declarations is a SyntaxError that would
   take the whole card down on that page.

   PRIVACY. Radio Yard's card stays aggregate (letters and counts, never a
   meter id); Photographs never names anyone.

   CHANGED
     v1.1  ripples.html (pebbles in a pool)
     v1.0  first build: every ring stop
--------------------------------------------------------------------------- */
(function (global) {
  'use strict';
  const ABOUT = global.ABOUT = global.ABOUT || {};

  /* --- helpers ------------------------------------------------------------ */
  function A(k, fn) {
    try {
      const v = fn();
      if (v === undefined || v === null || v === '' || (typeof v === 'number' && !isFinite(v))) return null;
      return { k, v: String(v) };
    } catch (e) { return null; }
  }
  function n(x, d) {
    if (typeof x !== 'number' || !isFinite(x)) return null;
    return x.toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  }
  function pct(x, d) { return (typeof x === 'number' && isFinite(x)) ? (x * 100).toFixed(d == null ? 0 : d) + '%' : null; }
  function ago(ms) {
    if (typeof ms !== 'number' || !isFinite(ms)) return null;
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 90) return s + ' s ago';
    if (s < 5400) return Math.round(s / 60) + ' min ago';
    if (s < 172800) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  }
  function when(d) {
    const t = d instanceof Date ? d : new Date(d);
    if (isNaN(t)) return null;
    return t.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  /* ===== ripples.html ===== */
  ABOUT['index.html'] = {
    what: 'Pebbles dropped into a garden pool, with the water worked out from physics. Every standing wave the pool can hold is followed exactly, using the real relation between a wave’s length and its speed: ripples shorter than 1.7 cm are pulled back by surface tension and outrun the rest, longer ones by gravity. So each ring spreads into a train of ripples, bounces off the walls and crosses the others. The bright web on the floor is sunlight focused by the curved surface, traced ray by ray. The splash itself is drawn, not simulated.',
    params: () => [
      A('Scene', () => POOL.scene + ' (seed ' + POOL.seed + ')'),
      A('View', () => n(POOL.tilt) + '° from straight down'),
      A('Sun', () => n(POOL.sunEl) + '° above the horizon'),
      A('Sky', () => POOL.warm < 0.33 ? 'cool' : POOL.warm < 0.67 ? 'between' : 'warm'),
      A('Pool', () => '2.56 × 1.28 m, ' + n(POOL.depth * 100) + ' cm deep, ' + POOL.floorKind + ' floor'),
      A('Grid', () => NX + ' × ' + NZ + ' cells of ' + n(CELL * 1000, 0) + ' mm, so the shortest wave is ' + n(2 * CELL * 100, 0) + ' cm'),
      A('Slowest ripple', () => { const w = pool.waveSpeed(0.0171); return '1.7 cm long, ' + n(w.phase * 100) + ' cm/s'; }),
      A('Stones so far', () => n(POOL.stones)),
      A('Last stone', () => POOL.last && (n(POOL.last.R * 2000) + ' mm across, from ' + n(POOL.last.H * 100) + ' cm, hit at ' + n(POOL.last.U, 1) + ' m/s')),
      A('Its energy into waves', () => POOL.last && pct(POOL.last.share, 1)),
      A('Frame rate', () => POOL.fps ? n(POOL.fps) + ' fps' : null),
    ],
  };
})(window);

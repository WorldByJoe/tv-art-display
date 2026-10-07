/* ---------------------------------------------------------------------------
   about.js · v1.2 · 2026-10-07
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
     v1.2  Ripples: the pool shape, chosen with left/right, and its own hint line
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
  /* While this card is open, left/right choose the pool's shape (the page
     claims them), so the hint line says that instead of "other pieces". */
  ABOUT['index.html'] = {
    what: 'Pebbles dropped into a garden pool, with the water worked out from physics. Every standing wave the pool can hold is followed exactly, using the real link between a wave’s length and its speed: ripples shorter than 1.7 cm are pulled back by surface tension and outrun the rest, longer ones by gravity, so each ring spreads into a train that bounces off the walls. The bright web on the floor is sunlight focused by the curved surface. The splash itself is drawn, not simulated.',
    hint: (ring) => '▲ close  ·  ◀ ▶ pool shape' + (ring ? '  ·  menu: settings' : ''),
    params: () => [
      A('Pool shape', () => '◀  ' + (POOL.shapeNext || POOL.shape) + '  ▶'),
      A('Pool', () => n(POOL.area, 2) + ' m², ' + n(POOL.depth * 100) + ' cm deep, ' + POOL.floorKind + ' floor'),
      A('Its walls', () => ({ Round: 'a ripple from the centre comes back to the centre',
                              Ellipse: 'a ripple from one focus gathers at the other',
                              Egg: 'two parabolas sharing one focus' })[POOL.shape]),
      A('View and light', () => n(POOL.tilt) + '° from straight down, sun ' + n(POOL.sunEl) + '° up, ' + (POOL.warm < 0.33 ? 'cool' : POOL.warm < 0.67 ? 'mild' : 'warm') + ' sky'),
      A('Grid', () => pool.NX + ' × ' + pool.NZ + ' cells of ' + n(pool.dx * 1000, Math.round(pool.dx * 1e4) % 10 ? 1 : 0) + ' mm'),
      A('Stones so far', () => n(POOL.stones)),
      A('Last stone', () => POOL.last && (n(POOL.last.R * 2000) + ' mm across, hit at ' + n(POOL.last.U, 1) + ' m/s; ' + pct(POOL.last.share, 1) + ' of its energy into waves')),
      A('Frame rate', () => POOL.fps ? n(POOL.fps) + ' fps' : null),
    ],
  };
})(window);

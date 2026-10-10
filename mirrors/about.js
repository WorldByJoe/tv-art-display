/* ---------------------------------------------------------------------------
   about.js · v2.0 · 2026-10-10
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
     v2.0  Spinning Mirrors: eight settings (servo speed and wave properties added); Scene row dropped
     v1.9  Spinning Mirrors at 3 rpm, aligned with waves by default
     v1.8  Spinning Mirrors lies on the ground at 4 rpm; the card says so
     v1.7  Spinning Mirrors runs at 15 rpm now; the card says so
     v1.6  Spinning Mirrors: three settings on its card (down picks one, left/right change it)
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

  /* ===== mirrors.html ===== */
  /* The first eight rows are settings the page lets the viewer change while
     this card is open (it claims down/left/right); the selected one wears
     the arrows, and the hint line says so. Eight settings and four readouts
     are the card's twelve rows, so the scene's seed is left off. */
  ABOUT['index.html'] = {
    what: 'A bank of servos lying on the ground and facing up, each spinning a round mirror on a shaft cut at 45\u00b0. As a servo turns, its mirror\u2019s face sweeps a cone, so the disc shows in turn different parts of the sky, the clouds and the light. The servos turn slowly, 3 rpm unless changed below; waves of faster and slower spinning, each a travelling sinusoid with its own direction, speed and period, cross the bank and keep every servo between an eighth and twice that speed. The mirrors start aligned, so a passing wave shows as bands; started at random, they shimmer. The settings below change the mirrors, the servo speed and the waves.',
    hint: (ring) => '▲ close  ·  ▼ next setting  ·  ◀ ▶ change it' + (ring ? '  ·  menu: settings' : ''),
    params: () => [
      ...((window.MIRRORS && MIRRORS.ui) || []).map((r, i) => A(r.k, () => i === MIRRORS.sel ? '◀  ' + r.v + '  ▶' : r.v)),
      A('Viewer and light', () => 'looking down ' + n(MIRRORS.off) + '\u00b0 from vertical; light ' + n(MIRRORS.lightEl) + '\u00b0 up'),
      A('Speeds now', () => n(MIRRORS.rpmLo, 1) + '–' + n(MIRRORS.rpmHi, 1) + ' rpm'),
      A('Waves passing', () => !MIRRORS.waves ? null : MIRRORS.waves.length === 0 ? 'none' :
        MIRRORS.waves.map((w) => '±' + n(w.rpm) + ' rpm, ' + n(w.period, 1) + ' s, ' + n(w.speed, 1) + ' m/s toward ' + n((w.dir + 360) % 360) + '°').join('; ')),
      A('Frame rate', () => MIRRORS.fps ? n(MIRRORS.fps) + ' fps' : null),
    ],
  };
})(window);

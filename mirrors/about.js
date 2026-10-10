/* ---------------------------------------------------------------------------
   about.js · v1.6 · 2026-10-10
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
     v1.6  Spinning Mirrors: three settings on its card (down picks one, left/right change it)
     v1.5  mirrors.html (Spinning Mirrors)
     v1.4  Couch Analyst's Status row says Replay during a replay
     v1.3  couch.html (Couch Analyst), text from the baseball chat; reads window.COUCH
     v1.2  Ripples: the pool shape, chosen with left/right, and its own hint line
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
  /* The first three rows are settings the page lets the viewer change while
     this card is open (it claims down/left/right); the selected one wears
     the arrows, and the hint line says so. */
  ABOUT['index.html'] = {
    what: 'A wall of servos, each spinning a small round mirror on a shaft cut at 45°, so as it turns the mirror’s face sweeps a cone and the disc shows in turn sky, cloud, the light and the ground. Every servo runs at 30 rpm; waves of faster and slower spinning, each a travelling sinusoid with its own direction, speed, period and size, cross the field, up to three at a time. Started aligned, the mirrors show a passing wave as bands; started at random, they shimmer, and a wave shows only as a change in the twinkle.',
    hint: (ring) => '▲ close  ·  ▼ next setting  ·  ◀ ▶ change it' + (ring ? '  ·  menu: settings' : ''),
    params: () => [
      ...((window.MIRRORS && MIRRORS.ui) || []).map((r, i) => A(r.k, () => i === MIRRORS.sel ? '◀  ' + r.v + '  ▶' : r.v)),
      A('Viewer and light', () => n(MIRRORS.off) + '° off axis; light ' + n(MIRRORS.lightEl) + '° up, ' + n(Math.abs(MIRRORS.lightAz)) + '° ' + (MIRRORS.lightAz < 0 ? 'left' : 'right')),
      A('Speeds now', () => n(MIRRORS.rpmLo, 1) + '–' + n(MIRRORS.rpmHi, 1) + ' rpm'),
      A('Waves passing', () => !MIRRORS.waves ? null : MIRRORS.waves.length === 0 ? 'none' :
        MIRRORS.waves.map((w) => '±' + n(w.rpm) + ' rpm, ' + n(w.period, 1) + ' s, ' + n(w.speed, 1) + ' m/s toward ' + n((w.dir + 360) % 360) + '°').join('; ')),
      A('Scene', () => MIRRORS.scene + ' (seed ' + MIRRORS.seed + ')'),
      A('Frame rate', () => MIRRORS.fps ? n(MIRRORS.fps) + ' fps' : null),
    ],
  };
})(window);

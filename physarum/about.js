/* ---------------------------------------------------------------------------
   about.js · v1.0 · 2026-10-03
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

  /* ===== physarum.html ===== */
  ABOUT['index.html'] = {
    what: 'Over a hundred thousand simulated foragers follow three rules: sniff ahead, turn toward the strongest scent, then step and leave a little scent of their own, which spreads and fades. Nothing in the code describes a network, yet branching networks form, compete and reorganise, as in the slime mould Physarum. After 26 seconds the settings begin a slow wander; the pale dots are one forager in sixteen.',
    params: () => [
      A('Started as', () => species.name),
      A('State', () => walking ? 'wandering' : 'settling, ' + Math.max(0, Math.ceil((WALK.settleMs - (performance.now() - startedAt)) / 1000)) + ' s to go'),
      A('Foragers', () => n(nAgents, 0)),
      A('Grid', () => n(GW, 0) + ' × ' + n(GH, 0) + ' cells'),
      A('Sensors', () => n(species.sensorAng * 180 / Math.PI, 0) + '° either side, ' + n(species.sensorDist, 1) + ' cells ahead'),
      A('Turn', () => 'up to ' + n(species.turn * 180 / Math.PI, 0) + '° a step'),
      A('Speed', () => n(species.speed, 2) + ' cells a step'),
      A('Scent laid', () => n(species.deposit, 2) + ' a step'),
      A('Scent fades', () => n(100 * (1 - species.decay), 1) + '% a frame'),
      A('Time here', () => { const m = (performance.now() - startedAt) / 60000; return Wall.forever(CONFIG.minutes) ? n(m, 1) + ' min, left on' : n(m, 1) + ' of ' + n(Wall.holdMs(CONFIG.minutes) / 60000, 0) + ' min'; }),
    ],
  };
})(window);

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

  /* ===== gravity.html ===== */
  ABOUT['index.html'] = {
    what: 'A few hundred bodies under Newtonian gravity, rebuilt in JavaScript from Joe’s MATLAB n-body program. Every body pulls on every other, and any two that touch merge, keeping their mass and momentum. Each run sets up one of five systems and plays it for three minutes in real time, then pulls back to show what stayed bound. Colour is speed against escape speed: red bodies are fast enough to leave.',
    params: () => [
      A('Set-up', () => sim.s.name),
      A('Seed', () => sim.seed),
      A('Bodies', () => n(sim.alive, 0) + ' of ' + n(sim.n, 0) + ' left'),
      A('Mergers', () => n(sim.merges, 0) + (sim.settled ? ', now stopped' : '')),
      A('Heaviest body', () => { let mx = 0; for (let i = 0; i < sim.n; i++) if (sim.active[i] && sim.m[i] > mx) mx = sim.m[i]; return pct(mx / sim.boundMass, 0) + ' of all mass'; }),
      A('Clock', () => phase === 'run' ? Math.min(CONFIG.runSec, Math.floor((performance.now() - runStartedAt) / 1000)) + ' of ' + CONFIG.runSec + ' s' : 'pulling back'),
      A('Still bound', () => phase === 'outro' ? n(boundAtOutro, 0) + ' bodies' : null),
      A('Thrown clear', () => phase === 'outro' ? n(ejectedAtOutro, 0) + ' bodies, ' + n(ejectedMassPct, 1) + '% of mass' : null),
      A('Model constants', () => 'G ' + sim.s.G + ' · softening ' + sim.s.soft + ' · step ' + sim.s.dt),
      A('Run', () => (runIndex + 1) + ' of ' + Wall.repeats(CONFIG.runsPerTurn)),
    ],
  };
})(window);

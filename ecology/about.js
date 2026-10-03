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

  /* ===== ecology.html ===== */
  ABOUT['index.html'] = {
    what: 'An evolving community on a 160 by 90 grid of grass. Each animal inherits four traits (legs, body, mouth and eyes) and how well it provisions its young; mating needs an exact trait match and 5% of births mutate, so new species arise one small step at a time. Colour is the genome mixed as printing ink, and hunters are ringed red. In 43 earlier runs, every hunter alive late in a run descended from a grazer founder.',
    params: () => [
      A('World seed', () => seed),
      A('Grass', () => 'up to ' + world.P.grassMax + ' a square · grows ' + pct(world.P.growLo, 1) + ' to ' + pct(world.P.growHi, 1) + ' a step'),
      A('Ground', () => (world.P.wallCount ? world.P.wallCount + ' rock ridges' : 'open, no ridges') + ' · grass patches ~' + world.P.patchRange + ' squares'),
      A('Disturbance', () => world.P.disturbEvery ? 'a patch hit about every ' + n(world.P.disturbEvery, 0) + ' steps' : 'none in this world'),
      A('Newborns get', () => world.P.provLowSteps + ' or ' + world.P.provHighSteps + ' steps of upkeep, by strategy'),
      A('Founders', () => {
        const f = world.founders || [], c = f.filter(o => o.carn).length;
        return (f.length - c) + ' grazer + ' + c + ' hunter species, ' + n(f.reduce((s, o) => s + (o.count || 0), 0), 0) + ' animals';
      }),
      A('Step', () => n(world.step, 0) + (PINNED ? '' : ' of ' + n(CONFIG.restartEvery, 0))),
      A('Animals now', () => {
        let c = 0; for (const a of world.animals) if (a.carn) c++;
        return n(world.animals.length, 0) + ' · ' + n(c, 0) + ' hunters · peak ' + n(peakPop, 0);
      }),
      A('Species now', () => { const s = new Set(); for (const a of world.animals) s.add(Eco.key(a)); return n(s.size, 0); }),
      A('On screen', () => {
        const m = Math.floor((performance.now() - startedAt) / 60000), h = Wall.holdMs(CONFIG.holdMin);
        return PINNED ? m + ' min, pinned' : h >= Number.MAX_SAFE_INTEGER ? m + ' min, left on' : m + ' of ' + Math.round(h / 60000) + ' min';
      }),
    ],
  };
})(window);

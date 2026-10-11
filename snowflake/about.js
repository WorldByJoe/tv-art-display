/* ---------------------------------------------------------------------------
   about.js · v2.3 · 2026-10-11
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
     v2.3  Snowflakes: the cloud's temperature and humidity, the shape they grow, the fall
     v2.2  Kite Flying: choose the kite with left/right; mph, feet and pounds
     v2.1  Kite Flying: what the flyer is doing, the wind, the kite and its line
     v2.0  Spinning Mirrors: eight settings (servo speed and wave properties added); Scene row dropped
     v1.9  Spinning Mirrors at 3 rpm, aligned with waves by default
*/
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

  /* ===== snowflake.html ===== */
  /* The page's state is the global F (the flake now) and phase. */
  ABOUT['index.html'] = {
    what: 'One snow crystal at a time, grown from water vapour. A supercooled cloud droplet freezes into a tiny hexagonal prism, and vapour then freezes onto its edges: a lattice model of snow crystal growth (Gravner and Griffeath, 2008) in which vapour diffuses toward the crystal and joins it more easily at corners than on flat faces when the air is humid, so corners outrun facets as branches. Temperature sets plates or columns (thinnest plates and most branching near \u221215 \u00b0C, columns near \u22125 \u00b0C: the morphology diagram first mapped by Ukichiro Nakaya), and each crystal takes its own path through the cloud, so its history of temperature and humidity is written into its shape; all six arms share that history, which is why they match. Full grown it falls, slowed ten times, rocking in the cloud\u2019s eddies.',
    params: () => [
      A('Path through the cloud', () => F.path.name),
      A('Temperature', () => n(F.cond.T, 1) + ' \u00b0C (' + n(F.cond.T * 9 / 5 + 32) + ' \u00b0F)'),
      A('Humidity', () => n(F.cond.RHw * 100) + '% of water saturation; ' + n(F.cond.sigma * 100, 1) + '% over ice'),
      A('Excess vapour', () => n(F.cond.excess, 2) + ' g/m\u00b3 above ice saturation'),
      A('Growing now as', () => phase === 'grow' ? SnowEngine.habitName(F.cond.T, F.cond.sigma) : null),
      A('Began at', () => { const c = F.path.at(0); return n(c.T, 1) + ' \u00b0C, ' + n(c.RHw * 100) + '% of water saturation (' + SnowEngine.habitName(c.T, c.sigma) + ')'; }),
      A('Size', () => phase === 'nucleate' ? n(F.dropR * 2000) + ' \u00b5m droplet' :
        F.columnish ? n(F.h0 * F.cell, 2) + ' mm long, ' + n(2 * F.cr.rmax * F.cell, 2) + ' mm across'
                    : n(2 * F.cr.rmax * F.cell, 2) + ' mm across, ' + n(F.h0 * F.cell * 1000) + ' \u00b5m thick at the centre'),
      A('Falling', () => phase === 'fall' ? n(Math.abs(F.fall.vel[2]) * 100, 1) + ' cm/s; ' + n(F.fallMass * 1e6, 3) + ' mg; slowed ' + SLOWMO + ' times' : null),
      A('Lattice', () => n(F.cr.steps) + ' steps on ' + n(F.cr.W.n) + ' cells (one twelfth; the rest is symmetry)'),
      A('Frame rate', () => SNOW.fps ? n(SNOW.fps) + ' fps' : null),
    ],
  };
})(window);

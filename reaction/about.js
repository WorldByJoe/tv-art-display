/* ---------------------------------------------------------------------------
   about.js · v2.9 · 2026-10-15
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
     v2.9  Artworks: a quarter from the 120 highlights.
           Reading: the attribution's time comes from the page (15 s after the last line).
           The Race: during the race the card explains the board and the words for
           what each rider is doing (the trait card stands with the cards)
     v2.8  The Race: one steady speed of 4-8x, and passing on the singletrack at a risk
     v2.7  The Race: once the riders are on, the card explains the engine, the
           trade-offs of fibre type and every trait (the land card before that)
     v2.6  The Race: one lap laid round the map, two-track share, distance in place of laps
     v2.5  Snowflakes: three settings (kind, light, cloud strip), altitude, rime, the mitten
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

  /* ===== reaction.html ===== */
  ABOUT['index.html'] = {
    what: 'The Gray-Scott model of two chemicals on a grid: a feedstock seeping in evenly everywhere, and a self-copying substance that eats it, with the feedstock spreading twice as fast. So each patch grows but starves the ring around it, which is Turing’s 1952 idea of how spots and stripes arise with no plan. The picture is the self-copier’s concentration; once it settles, the feed and kill rates wander slowly.',
    params: () => [
      A('Started as', () => pattern.name),
      A('Now resembles', () => walking ? (nearest ? nearest.name : null) : 'still settling'),
      A('Feed rate F', () => n(wF, 4) + ' per step'),
      A('Kill rate k', () => n(wK, 4) + ' per step'),
      A('Diffusion', () => 'feedstock ' + n(CONFIG.Du, 1) + ', self-copier ' + n(CONFIG.Dv, 1)),
      A('Solver steps', () => n(ticks, 0) + ', ' + CONFIG.iters + ' a frame'),
      A('Grid', () => n(GW, 0) + ' × ' + n(GH, 0) + ' cells'),
      A('Time here', () => { const m = (performance.now() - startedAt) / 60000; return Wall.forever(CONFIG.minutes) ? n(m, 1) + ' min, left on' : n(m, 1) + ' of ' + n(Wall.holdMs(CONFIG.minutes) / 60000, 0) + ' min'; }),
    ],
  };
})(window);

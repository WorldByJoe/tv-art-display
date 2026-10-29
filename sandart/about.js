/* ---------------------------------------------------------------------------
   about.js · v3.2 · 2026-10-29
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
     v3.2  Sand Picture: a new frame each load; the card names its sands and the water's colour
     v3.1  Sand Picture (sandart.html): its card, the physics in plain words
     v3.0  Fastest Line 2.0 (descent2.html): its card
     v2.9  Artworks: a quarter from the 120 highlights.
           Reading: the attribution's time comes from the page (15 s after the last line).
           The Race: during the race the card explains the board and the words for
           what each rider is doing (the trait card stands with the cards)
     v2.8  The Race: one steady speed of 4-8x, and passing on the singletrack at a risk
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

  /* ===== sandart.html ===== */
  /* The model runs in a worker; the page keeps its latest message as M (t, the
     picture's own time in s; upper, the share of all the sand still on top;
     inWater, the share not yet landed, which counts the upper sand too; w0, each
     sand's lone sinking speed in m/s) and window.SANDFRAME, this frame's sands
     (colour, mineral, d in m) and the water's colour, in the engine's order. */
  ABOUT['index.html'] = {
    what: "Four sands, water and a little air between two panes of glass 1.2 mm apart, just after the frame is turned over. Each page load makes a new frame: four sands of random mineral, size and colour (from a mosaic painting\u2019s palette) and a new colour behind the water. The upper sand rests on a row of small bubbles, which can hold it because friction on the glass carries the sand\u2019s weight: past about 3 mm of sand the pressure on them stops growing. Sand drains through the gaps only as fast as water seeps up to take its place, slower through fine sand by the square of the grain size, and the grains beside the falling ones step into the room they leave, so the layers over each gap sag into Vs. Coarse, dense grains sink fastest, so each stream sorts as it falls. Each avalanche down a mountain lays one thin layer, fine grains under coarse: the stripes.",
    params: () => {
      const F = window.SANDFRAME || { sands: [] }, cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
      return [
        ...F.sands.map((q) => A(cap(q.colour) + ' sand', () => (q.mineral ? q.mineral + ', ' : '') + n(q.d * 1000, 2) + ' mm')),
        A('Lone grains sink', () => M && M.w0 && M.w0.map((w) => n(w * 1000)).join(', ') + ' mm/s'),
        A('Behind the water', () => F.water),
        A('Picture time', () => M && n(M.t / 60) + ' min'),
        A('Sand still on top', () => M && pct(M.upper)),
        A('Sand landed', () => M && pct(1 - M.inWater)),
      ];
    },
  };
})(window);

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

  /* ===== lightning.html ===== */
  ABOUT['index.html'] = {
    what: 'Real lightning seen from 35,786 km up by the Geostationary Lightning Mapper on a GOES weather satellite, over wherever in this hemisphere the sky was busiest. Each dot is one pulse of one flash, drawn at its recorded time and place, with every flash slowed tenfold; dot size is energy, colour is age, and the ring is the patch of cloud top the flash lit. On the wall a live feed keeps the sky about a minute old.',
    params: () => [
      A('Storm over', () => SHOW.where),
      A('Satellite', () => String(SHOW.sat).replace(/^goes-?/i, 'GOES-')
                           + (SHOW.slantKm ? ', ' + n(SHOW.slantKm, 0) + ' km away' : '')),
      A('Map frame', () => {
        const b = SHOW.box, f = (v, pos, neg) => Math.abs(v).toFixed(1) + '°' + (v < 0 ? neg : pos);
        return f(b[0], 'N', 'S') + ' to ' + f(b[1], 'N', 'S') + ', ' + f(b[2], 'E', 'W') + ' to ' + f(b[3], 'E', 'W');
      }),
      A('Clock', () => liveFeed ? 'Live, ' + Math.round(CONFIG.lagMs / 1000) + ' s behind real time'
                                : 'Replaying the last capture'),
      A('Newest flash', () => {
        const d = new Date(SHOW.t1), s = Math.max(0, (Date.now() - SHOW.t1) / 1000);
        const hm = String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' UTC';
        return hm + ', ' + (s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : Math.round(s / 3600) + ' h') + ' ago';
      }),
      A('Flashes held', () => n(held().n, 0) + ' over ' + Math.round(held().span) + ' s'),
      A('Flash rate', () => held().rate.toFixed(2) + ' per second'),
      A('Typical flash', () => { const h = held(); return h.medGroups + ' pulses over ' + h.medDur + ' ms, ' + h.medE + ' fJ'; }),
      A('Biggest glow', () => n(held().maxArea, 0) + ' km² of cloud top'),
      A('Showing this turn', () => (Wall.runCount('lightning.html') + 1) + ' of ' + Wall.repeats(1)),
    ],
  };
})(window);

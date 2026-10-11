/* ---------------------------------------------------------------------------
   about.js · v2.2 · 2026-10-10
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
     v2.2  Kite Flying: choose the kite with left/right; mph, feet and pounds
     v2.1  Kite Flying: what the flyer is doing, the wind, the kite and its line
     v2.0  Spinning Mirrors: eight settings (servo speed and wave properties added); Scene row dropped
     v1.9  Spinning Mirrors at 3 rpm, aligned with waves by default
     v1.8  Spinning Mirrors lies on the ground at 4 rpm; the card says so
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

  /* ===== kite.html ===== */
  /* While this card is open, left/right choose the kite (the page claims
     them; a choice starts a new scene with that kite), so the hint says so.
     Rows read window.KITE, which the page refreshes every frame; speeds in
     mph, lengths in feet, pull in pounds, as the page's bottom strip. */
  const MPH = 2.23694, FT = 3.28084, LB = 1 / 4.44822;
  ABOUT['index.html'] = {
    what: 'A person flying a kite in a gusty field, worked out from physics. The wind grows with height over the grass and carries its gusts downwind, so a gust that ruffles the grass by the flyer reaches the kite a few seconds later. The kite is a rigid frame with flat sails; it settles at the angle where the air\u2019s push balances on its bridle, and its bowed spar (the diamond) or swept wings (the delta) keep it steady. The dragon is a Chinese centipede: a train of discs on strings, each a small kite held at its angle, rocking in waves that run down its body. The line is a chain of small weights that sags in a lull and lies on the grass when the kite is down. With one line the flyer lets out line as the kite climbs, takes it in when it sinks and runs upwind in a lull; with two, the flyer picks a pattern and flies it, and pulling one hand back brakes that wing and turns the kite.',
    hint: (ring) => '\u25b2 close  \u00b7  \u25c0 \u25b6 choose the kite' + (ring ? '  \u00b7  menu: settings' : ''),
    params: () => [
      A('Kite', () => '\u25c0  ' + KITE.choice + '  \u25b6'),
      A('The flyer is', () => KITE.doing),
      A('Wind at 33 ft', () => n(KITE.U10 * MPH) + ' mph' + (KITE.lull > 0.3 ? ', a lull' : KITE.gust > 0.3 ? ', a gust' : '')),
      A('Wind at the kite', () => KITE.height > 2 ? n(KITE.Ukite * MPH) + ' mph' : null),
      A('Wind has turned', () => Math.abs(KITE.shift) < 1 ? 'not yet' : n(Math.abs(KITE.shift)) + '\u00b0 ' + (KITE.shift > 0 ? 'clockwise' : 'counterclockwise') + ' from the start'),
      A('Line out', () => (KITE.lines === 2 ? 'two lines of ' : '') + n(KITE.line * FT) + ' ft'),
      A('Kite now', () => n(Math.max(0, KITE.height) * FT) + ' ft up, ' + n(KITE.beta) + '\u00b0 above the hands' + (KITE.lines === 2 ? ', ' + n(KITE.speed * MPH) + ' mph' : '')),
      A('Line pull', () => n(KITE.pull * LB, 1) + ' lb'),
      A('Tree', () => KITE.tree ? 'one downwind, off to the side' : null),
      A('Scene', () => n(KITE.scene)),
      A('Frame rate', () => KITE.fps ? n(KITE.fps) + ' fps' : null),
    ],
  };
})(window);

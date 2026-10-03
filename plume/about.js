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

  /* ===== plume.html ===== */
  ABOUT['index.html'] = {
    what: 'A simulated methane leak survey on real US streets. A car with a gas analyser drives every street while hidden leaks release puffs that ride a wandering wind, and every reading, gas or clean air, updates the map: warm ground marks a likely leak, and grey turning blue then green marks streets cleared. Found leaks end green and missed ones red, then a chart shows how leak size sets the odds of being found.',
    params: () => [
      A('Neighbourhood', () => hood.name + ', ' + hood.city),
      A('Weather', () => act.name + ', ' + ({ B: 'unstable air', C: 'slightly unstable air', D: 'neutral air' }[act.stability] || 'class ' + act.stability)),
      A('Wind', () => n(windMeanSpeed * 2.23694, 0) + ' mph mean, wandering ±' + act.meanderSd + '°'),
      A('Leaks hidden', () => sources.length + ' (' + sources.slice().sort((a, b) => b.slpm - a.slpm).map(s => sig2(scfh(s.slpm))).join(', ') + ' cubic ft/h)'),
      A('Found so far', () => survey().n + ' of ' + sources.length),
      A('Pass', () => passesDone >= act.passes ? 'all ' + act.passes + ' done' : (passesDone + 1) + ' of ' + act.passes),
      A('Drive per pass', () => n(routeLenM / 1000, 1) + ' km at ' + n(CONFIG.carSpeedMs * 2.23694, 0) + ' mph, shown ' + n(paceNow(), 0) + '× real time'),
      A('Readings', () => n(samples, 0) + ' taken, ' + n(detections, 0) + ' over +' + CONFIG.detectPpm + ' ppm'),
      A('Survey', () => (actIndex + 1) + ' of ' + Wall.repeats(CONFIG.actsPerTurn)),
    ],
  };
})(window);

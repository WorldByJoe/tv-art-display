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

  /* ===== race.html ===== */
  ABOUT['index.html'] = {
    what: 'A mountain-bike race on a landscape the wall makes first: folded rock beds rained on and eroded for 300,000 model years, then frozen. A route-finder cuts a 2-5 mile loop under a grade limit with cliffs off limits, so the switchbacks are found, not drawn. Eight riders with randomly drawn power, skill, nerve, stamina and heat tolerance race two laps at four times real speed; physics sets every corner limit and crash.',
    params: () => [
      A('Seed', () => String(seed)),
      A('Stage', () => act === 1 ? (frozen ? 'Land frozen, setting the scale' : 'Land eroding')
                     : ['', '', 'Searching for a course', 'Meeting the riders', 'Racing', 'Results'][act]),
      A('Land', () => (w.nx * CONFIG.raceCell / 1000).toFixed(1) + ' × ' + (w.ny * CONFIG.raceCell / 1000).toFixed(1)
                      + ' km, ' + Math.round(w.step * w.P.dt / 1000) + ' thousand years of erosion'),
      A('Rock worn away', () => pct(w.removed, 0)),
      A('Course', () => plan ? ({ easy: 'Easy', medium: 'Middling', hard: 'Hard' }[plan.tier] || 'Course') + ', '
                      + (plan.length / 1000).toFixed(1) + ' km × ' + lapsFor() + ' laps' : null),
      A('Climb per lap', () => plan ? Math.round(plan.climb) + ' m, ' + plan.switchbacks + ' switchbacks' : null),
      A('Grades', () => plan && plan.grade ? 'average ' + (100 * plan.grade.mean).toFixed(1) + '%, steepest '
                      + Math.round(100 * plan.grade.max) + '%' : null),
      A('Race day', () => day ? Math.round(day.tempC) + ' °C, ' + Math.round(100 * day.rh) + '% humidity, sun '
                      + Math.round(day.sun) + ' W/m²' : null),
      A('Race', () => {
        if (!race) return null;
        const out = race.out ? ', ' + race.out + ' out' : '';
        const fin = race.riders.filter(r => r.finish).sort((a, b) => a.finish - b.finish);
        if (fin.length) return '#' + fin[0].num + ' ' + fin[0].name + ' won in ' + clockStr(fin[0].finish) + out;
        const ld = race.riders.find(r => r.pos === 1);
        return ld ? '#' + ld.num + ' ' + ld.name + ' leads, lap ' + Math.min(race.laps, ld.lap + 1) + ' of '
                    + race.laps + ', ' + clockStr(race.t) + ' in' + out : null;
      }),
      A('Show this turn', () => (Wall.runCount('race.html') + 1) + ' of ' + Wall.repeats(1)),
    ],
  };
})(window);

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

  /* ===== weather.html ===== */
  ABOUT['index.html'] = {
    what: 'Real surface wind and sunshine over one of three places, from the free Open-Meteo weather service: the last 18 hours and the next 18, played at 1.7 seconds an hour. The ground brightens where sunlight reaches it, and the streaks are 3,600 tracers carried by the wind. Watch the wind pick up a few hours behind the morning sun. The bar along the top is yellow in daylight, and a marker crosses the present hour.',
    params: () => [
      A('Place', () => loc.name + ', around ' + loc.city),
      A('Place in tour', () => Math.min(locIndex + 1, LOCATIONS.length) + ' of ' + LOCATIONS.length),
      A('Map time', () => clockText().replace(/\s{2,}/g, ', ')),
      A('At the city', () => localReadout().replace(/\s+·\s+/g, ' · ')),
      A('Data', () => data.source === 'live' ? 'Open-Meteo, fetched ' + ago(data.when)
                    : data.source === 'cache' ? 'Open-Meteo, saved copy from ' + ago(data.when) + ' (offline)'
                    : 'invented sample, not a forecast (offline)'),
      A('Window', () => CONFIG.pastHours + ' h back to ' + CONFIG.aheadHours + ' h ahead, ' + CONFIG.secPerHour + ' s an hour'),
      A('Wind field', () => CONFIG.gridLat + ' × ' + CONFIG.gridLon + ' points, ' + n(CONFIG.particles, 0) + ' tracers'),
      A('Ground image', () => { const w = (window.WXSAT || {})[loc.key]; return w ? 'NASA VIIRS, ' + w.days + '-day composite to ' + w.to : null; }),
      A('Lightning', () => { if (!STRIKES || !STRIKES.length) return null; const t0 = mapNowMs() - hourF * 3600e3, t1 = t0 + (data.hours - 1) * 3600e3; const k = STRIKES.filter(s => s.t >= t0 && s.t <= t1).length; return k ? n(k, 0) + ' satellite-seen flashes in this window' : null; }),
      A('Tour', () => (Wall.runCount('weather.html') + 1) + ' of ' + Wall.repeats(1)),
    ],
  };
})(window);

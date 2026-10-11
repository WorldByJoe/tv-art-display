/* ---------------------------------------------------------------------------
   about.js · v2.4 · 2026-10-11
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
     v2.4  Snowflakes: the crystal's own cloud (height, updraft, trip) and the shape grown so far
     v2.3  Snowflakes: the cloud's temperature and humidity, the shape they grow, the fall
     v2.2  Kite Flying: choose the kite with left/right; mph, feet and pounds
     v2.1  Kite Flying: what the flyer is doing, the wind, the kite and its line
     v2.0  Spinning Mirrors: eight settings (servo speed and wave properties added); Scene row dropped
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
  /* The page's state is the global F (the flake now; F.fl is the engine's
     Flake, with its cloud) and phase. */
  ABOUT['index.html'] = {
    what: 'One snow crystal at a time, grown from water vapour in a cloud. A supercooled droplet freezes into a tiny hexagonal prism; vapour then freezes onto its edges in a lattice model of snow crystal growth (Gravner and Griffeath, 2008), where vapour joins more easily at corners than on flat faces when the air is humid, so corners outrun facets as branches. Temperature sets plates or columns (the thinnest, most branched plates near −15 °C, columns near −5 °C and below about −22 °C: the diagram Ukichiro Nakaya first mapped). Each crystal grows in a cloud of its own - cold at the top, with drier layers and an updraft - and is carried up or sinks at the speed its own size gives it, so where it goes is written into its shape; all six arms share that history, which is why they match. Full grown, or once it falls out of the cloud, it falls on, slowed ten times.',
    params: () => {
      const fl = F.fl, c = F.cond, cl = fl.cloud;
      const km = (z) => n(z / 1000, 2) + ' km';
      return [
        A('Grown so far', () => phase === 'nucleate' ? 'a freezing droplet' : F.kind + ', ' + (F.columnish ? n(F.h0 * F.cell, 2) + ' mm long' : n(2 * F.cr.rmax * F.cell, 2) + ' mm across')),
        A('These conditions grow', () => phase === 'grow' ? SnowEngine.habitName(c.T, c.sigma) : null),
        A('Temperature', () => n(c.T, 1) + ' °C (' + n(c.T * 9 / 5 + 32) + ' °F)'),
        A('Humidity', () => n(c.RHw * 100) + '% of water saturation; ' + n(c.sigma * 100, 1) + '% over ice; ' + n(c.excess, 2) + ' g/m³ of vapour to spare'),
        A('Height', () => cl ? km(fl.z) + ' above the cloud base (base ' + n(cl.Tbase, 1) + ' °C, top ' + n(cl.Ttop, 1) + ' °C, ' + km(cl.top) + ' deep)' : null),
        A('Air and fall', () => cl ? 'updraft ' + n((c.w || 0) * 100) + ' cm/s; the crystal falls ' + n(fl.vFall * 100) + ' cm/s through the air' : null),
        A('Its trip', () => cl ? 'formed at ' + n(fl.T0, 1) + ' °C, ' + km(fl.z0) + '; highest ' + km(fl.zMax) + ', lowest ' + km(fl.zMin) : 'scripted: ' + fl.path.name),
        A('Cloud', () => cl ? (cl.dry.length ? cl.dry.length + ' drier layer' + (cl.dry.length > 1 ? 's' : '') + ' (' + cl.dry.map((d) => n(d.rh * 100) + '% at ' + km(d.z)).join(', ') + ')' : 'no dry layers') + '; updraft up to ' + n(cl.W0 * 100) + ' cm/s' : null),
        A('Time since it froze', () => cl ? n(fl.t / 60, 1) + ' minutes (the screen runs it in about a minute and a half)' : null),
        A('Falling', () => phase === 'fall' ? n(Math.abs(F.fall.vel[2]) * 100, 1) + ' cm/s; ' + n(F.fallMass * 1e6, 3) + ' mg; slowed ' + SLOWMO + ' times' + (fl.why === 'fell out of the cloud' ? '; it left the cloud before full size' : '') : null),
        A('Lattice', () => n(F.cr.steps) + ' steps on ' + n(F.cr.W.n) + ' cells (one twelfth; the rest is symmetry)'),
        A('Frame rate', () => SNOW.fps ? n(SNOW.fps) + ' fps' : null),
      ];
    },
  };
})(window);

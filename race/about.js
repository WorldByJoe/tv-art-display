/* ---------------------------------------------------------------------------
   about.js · v3.0 · 2026-10-20
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
     v3.0  Fastest Line 2.0 (descent2.html): its card
     v2.9  Artworks: a quarter from the 120 highlights.
           Reading: the attribution's time comes from the page (15 s after the last line).
           The Race: during the race the card explains the board and the words for
           what each rider is doing (the trait card stands with the cards)
     v2.8  The Race: one steady speed of 4-8x, and passing on the singletrack at a risk
     v2.7  The Race: once the riders are on, the card explains the engine, the
           trade-offs of fibre type and every trait (the land card before that)
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

  /* ===== race.html ===== */
  ABOUT['index.html'] = {
    /* Two cards in one (Joe, 2026-10-14: the up arrow should "provide a meaningful
       explanation of the traits and tradeoffs"). While the land forms and the
       course is cut, the card is about the land and the course; once the riders
       are on screen it is about the riders - what each trait is, and how fibre
       type trades them off. `what` is a getter so the card can switch.
       DURING THE RACE (act 4) it explains the board instead, and the one word on
       each rider's live line (Joe, 2026-10-15: "Some of those terms are unfamiliar
       to me, like pushing"); the trait card returns with the results. */
    get what() {
      if (typeof act !== 'undefined' && act === 4)
        return 'The board lists the riders in place order. Under each name is a live line: speed, watts, the reserve left, what the rider is doing, core temperature and the rock underfoot. The words for what they are doing:';
      return (typeof act !== 'undefined' && act >= 3)
        ? "Each rider's engine has three parts: aerobic power they can hold for an hour, a reserve of 10-35 kJ to spend above it, and a sprint. The reserve refills only when they ease off. Fibre type trades them off: fast-twitch muscle gives a bigger reserve and sprint but refills slowly and makes more heat; slow-twitch gives aerobic power and quick recovery. Race craft decides when the reserve is spent."
        : 'A mountain-bike race on a landscape the wall makes first: folded rock beds rained on and eroded for 300,000 model years, then frozen. A route-finder lays one 4-7 mile lap round the map under a grade limit, benching singletrack into the hillsides with switchbacks where it must, two-track on the gentle ground, and only cliffs off limits. Eight riders race it at one steady speed, 4-8 times real time; passing is easy on the two-track and a risk on the singletrack. Physics sets every corner limit and crash.';
    },
    params: () => {
      if (typeof act !== 'undefined' && act === 4) return [
        A('Sprinting', () => 'all out: off the start, and into the finish'),
        A('Attacking', () => 'a surge to pass on the two-track'),
        A('Closing a gap', () => 'chasing the rider ahead before the singletrack'),
        A('Defending', () => 'answering an attack from just behind'),
        A('Passing', () => 'going round on the singletrack, at a risk'),
        A('Held up', () => 'stuck behind a slower or fallen rider'),
        A('Climbing, descending', () => 'their own pace up or down a grade over 3%'),
        A('Pedalling', () => 'their own pace on the level'),
        A('Braking', () => 'slowing for a bend, or a descent at their limit'),
        A('Walking up, down', () => 'off the bike: too steep to climb, or past their skill to descend'),
        A('Down', () => 'crashed; up again in the seconds shown'),
        A('Cooling off', () => 'stopped: core temperature over 40 °C'),
      ];
      if (typeof act !== 'undefined' && act >= 3) {
        const sub = (typeof director !== 'undefined' && director.subject) || null;
        return [
          A('Aerobic power', () => 'W/kg held for an hour: the long climbs'),
          A('Reserve', () => 'kJ to spend above it: surges, steep pitches'),
          A('Sprint', () => 'peak watts for seconds: start and finish'),
          A('Recovery', () => 'how fast the reserve refills on easing'),
          A('Fibre type', () => 'fast: reserve, sprint; slow: aerobic, recovery'),
          A('Race craft', () => 'spends the reserve where it pays'),
          A('Descends', () => 'grip they can use braking downhill'),
          A('Reads the ground', () => 'how truly they judge the limit'),
          A('Dares', () => 'how near the limit they ride; the risk they take to pass'),
          A('Takes the heat', () => 'core heat they race at: hot days'),
          A('Body mass', () => 'more watts, fewer per kilo'),
          A('Followed rider', () => sub ? '#' + sub.num + ' ' + sub.name + ' · ' + Math.round(100 * sub.fast) + '% fast · reserve '
                                        + (sub.E / 1000).toFixed(0) + '/' + (sub.E0 / 1000).toFixed(0) + ' kJ' : null),
        ];
      }
      return [
        A('Seed', () => String(seed)),
        A('Stage', () => act === 1 ? (frozen ? 'Land frozen, setting the scale' : 'Land eroding') : (typeof courseAt !== 'undefined' && courseAt) ? 'Course laid out' : 'Searching for a course'),
        A('Land', () => (w.nx * CONFIG.raceCell / 1000).toFixed(1) + ' × ' + (w.ny * CONFIG.raceCell / 1000).toFixed(1)
                        + ' km, ' + Math.round(w.step * w.P.dt / 1000) + ' thousand years of erosion'),
        A('Rock worn away', () => pct(w.removed, 0)),
        A('Course', () => plan ? ({ easy: 'Easy', medium: 'Middling', hard: 'Hard' }[plan.tier] || 'Course') + ', one lap of '
                        + (plan.length / 1000).toFixed(1) + ' km, ' + Math.round(100 * (plan.twoTrack ? plan.twoTrack.frac : 0)) + '% two-track' : null),
        A('Climbing', () => plan ? Math.round(plan.climb) + ' m, ' + plan.switchbacks + ' switchbacks' : null),
        A('Grades', () => plan && plan.grade ? 'average ' + (100 * plan.grade.mean).toFixed(1) + '%, steepest '
                        + Math.round(100 * plan.grade.max) + '%' : null),
        A('Show this turn', () => (Wall.runCount('race.html') + 1) + ' of ' + Wall.repeats(1)),
      ];
    },
  };
})(window);

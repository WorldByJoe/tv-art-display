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

  /* ===== gameday.html ===== */
  ABOUT['index.html'] = {
    what: "A live football game from ESPN's public feed - the Vikings in the NFL or Colorado State in college - with the score, every drive drawn on the field, the players in the last play, and ESPN's own win-probability curve. It holds the wall for as long as a game is being played and for five minutes after the final whistle; with nothing on it steps aside within half a minute. A horn sounds when our team scores.",
    params: () => [
      A('Watching', () => ONLY || CONFIG.watch.map(x => x.team + (x.league === 'nfl' ? ' (NFL)' : ' (college)')).join(', ')),
      A('Game', () => (S.found && S.away && S.home) ? S.away.name + ' at ' + S.home.name : 'No game on'),
      A('League', () => S.found ? (S.league === 'nfl' ? 'NFL' : 'College football (FBS)') : null),
      A('Status', () => !S.found ? null
                      : S.state === 'in' ? 'Live, quarter ' + S.period + ', ' + S.clock
                      : S.state === 'pre' ? (S.kickoff ? 'Kickoff ' + new Date(S.kickoff).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Scheduled')
                      : S.desc),
      A('Score', () => (S.found && S.away && S.home) ? S.away.abbr + ' ' + S.away.score + ', ' + S.home.abbr + ' ' + S.home.score : null),
      A('Win chance', () => { const p = ourWin(); return p === null ? null : S.team + ' ' + (100 * p).toFixed(1) + '%, ESPN model'; }),
      A('Biggest swing', () => S.wp.length > 1 ? (100 * biggestSwing().delta).toFixed(1) + ' points on one play' : null),
      A('Drives', () => S.drives.length ? S.drives.length + ', ' + S.drives.filter(d => d.score).length + ' scoring' : null),
      A('Feed', () => S.lastFeed ? (S.stale ? 'Quiet for ' : 'Updated ') + Math.round((Date.now() - S.lastFeed) / 1000) + ' s' + (S.stale ? '' : ' ago') : null),
      A('Stays', () => {
        if (PINNED) return 'Pinned';
        if (S.found && S.state === 'in') return 'While the game is live';
        if (S.found && S.state === 'post')
          return Math.max(0, Math.ceil((CONFIG.postgameMin * 60000 - (Date.now() - (S.wentFinalAt || S.firstSeen))) / 60000)) + ' min more';
        return 'About ' + Math.max(0, Math.round(CONFIG.idleSec - (Date.now() - S.firstSeen) / 1000)) + ' s more';
      }),
    ],
  };
})(window);

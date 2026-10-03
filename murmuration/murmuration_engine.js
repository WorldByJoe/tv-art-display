/* ==========================================================================
  murmuration_engine.js · v0.6 · 2026-10-03

  A starling murmuration as an agent-based model. Pure JavaScript, no DOM, so
  the same file runs in the page and under jsc for testing.

  NO LEADER, NO DIRECTOR (Joe, 2026-10-02: "stronger biological realism in
  the bird behavior than control"). Every bird follows the same rules; nobody
  knows where the flock is going. Turns start where they start - one bird's
  private wobble, amplified by the inertia below - and the flock is only kept
  over the field by the roost the birds are all attached to.

  THE SCIENCE IT LEANS ON
    Ballerini et al. 2008 (PNAS)   each starling attends to a fixed NUMBER of
                                   nearest neighbours, about 6.5, not to every
                                   bird within a distance. Topological, so the
                                   flock holds together when it stretches thin.
    Hildenbrandt, Carere &         StarDisplay: fixed cruise speed near 10 m/s,
    Hemelrijk 2010 (Behav Ecol)    turning by banking, an attraction to the
                                   ROOST that grows outside a radius, and a
                                   preferred flying height. The roost and the
                                   height are what keep a real flock over its
                                   field; there is no camera in that model and
                                   none in this one.
    Attanasi et al. 2014           a turn starts at ONE bird and crosses the
    (Nature Physics)               flock as a wave, fast and barely damped,
                                   because birds have turning INERTIA: social
                                   forces change a bird's rate of turn, not its
                                   heading directly. Here every force is a
                                   torque on the turn rate w, which relaxes
                                   with friction gamma. Low friction = a crisp
                                   wave; high = a sluggish, smeared one. Each
                                   run draws its own damping.
    Pearce et al. 2014 (PNAS)      birds also respond to the flock as a dark
                                   MASS seen from far off, not only to their
                                   seven neighbours: a weak long-range turn
                                   toward the flock's centre. Without it the
                                   model split into wandering sub-flocks.
    Goodenough et al. 2017 (PeerJ) murmurations end at dusk, when the flock
                                   pours down into the roost. Here each bird
                                   has its own moment to go down, and a bird
                                   whose neighbours are going down goes sooner,
                                   so the descent spreads like everything else.

  UNITS: metres, seconds, radians. y is up; the field is x -200..200,
  z 0..250 (25 acres) under a 500 ft ceiling.

  WHY 250 M DEEP, AND THE ROOST NEARER (Joe, 2026-10-02: "often they are just
  too small"). What sets the flock's size on screen is where the ROOST is, not
  where the walls are - the birds roam around it and almost never reach a
  wall. So the roost moved in (90-150 m out, roaming 45-85 m round it) and the
  back wall came in behind it. Measured, 6 seeds x 5 min: median distance
  215 -> 150 m, flock 12% -> 18% of the screen wide, centre in view 97 -> 81%,
  birds near a wall still ~0. At 200 m deep the flock gained only 2 more
  points of width but a third of it was pressing the back wall at times -
  the fish bowl.

  SMALL CHUNKS, AND WHY THEY WERE AN ARTEFACT (Joe saw them, 2026-10-02).
  With every bird copying exactly its 6-7 nearest, a knot of 7-8 birds that
  are all each other's nearest is a closed loop: it hears only itself and
  peels away as one regular chunk. Real birds break such loops, and these
  are here now: a BLIND SECTOR behind the head (StarDisplay has one), so a
  bird cannot count the bird on its tail; INDIVIDUAL VARIATION in cruise speed
  and personal space, so no knot keeps a regular shape; SPEED MATCHING, since
  in real flocks speed is set mostly by the neighbours (Bialek et al. 2014,
  PNAS) - without it the individual speeds alone DOUBLED the chunks, slow
  birds dropping off the back together; and, the one that mattered most, the
  pull toward the visible mass made as strong as alignment and starting at
  6 m. Measured as the share of birds outside the flock's main connected body
  (2.5 m linkage, 4 min, 4 seeds): 20-50% typical with the pull at 3-5, 0-11%
  at four times that; the blind sector moved it only a few points either way.
  Pearce's model needs the long-range term at that strength too - it is what
  keeps real flocks whole while their edges churn.

  THE ROOST IS A TREE (Joe, 2026-10-02). When the page grows one it passes in
  its position (the roost), its perches and its crown. Flying birds steer
  round the crown; at dusk each bird has its own perch, homes on it, brakes
  hard in the last few metres as real birds do, and settles. With no tree the
  flock goes down into the field as before.

  SETTLE, FLUSH, SETTLE (Joe, 2026-10-03: "land on the tree, then flee a
  couple of times"). Real roosts do this - the flock pours in, sits, and
  something startles it out again before it finally stays. Here: once the
  roost has filled and rested a few seconds, one perched bird bolts, and each
  bird bolts a fraction of a second after any of its nearest PERCHED
  neighbours does, so the flush tears across the tree as a wave. The flock
  murmurates again, comes back, and after `flushes` of these it stays.

  CHANGED
    v0.6  settle-flush cycles: the roost fills, rests, flushes as a startle
          wave through perched neighbours, and re-forms (opts.flushes)
    v0.5  roost = the page's tree: perches, braking final approach, crown avoidance
    v0.4  field 250 m deep (was 400) with the roost brought in to match
    v0.3  rear blind sector; per-bird speed and spacing with speed matching; the
          long-range pull starts at 6 m; denser flock (personal space 0.6-1.0 m,
          the dense end of Ballerini's measured spacing)
    v0.2  the hijacked lead bird is gone; StarDisplay's roost attraction and
          preferred height keep the flock over the field; one dusk descent
          per run, individually timed and socially contagious
    v0.1  first draft (a lead bird flying a French curve)
========================================================================== */
(function (global) {
'use strict';

function rng(seed) {                       /* mulberry32 */
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const FIELD = { x0: -200, x1: 200, z0: 0, z1: 250, top: 152.4 };
const G = 9.81;
const MAXNB = 8;

/* Every behavioural number is DRAWN per run from a plausible range. */
function drawParams(r, opts) {
  const U = (a, b) => a + (b - a) * r();
  const nMin = (opts && opts.nMin) || 500, nMax = (opts && opts.nMax) || 1000;
  const K_align = U(14, 30);               // 1/s^2: turning stiffness toward neighbours' heading
  const zeta = U(0.30, 0.65);              // damping ratio of the turning wave
  return {
    n:        Math.round(U(nMin, nMax)),
    v0:       U(9.0, 11.0),                // cruise speed, m/s (StarDisplay ~10)
    nc:       r() < 0.5 ? 6 : 7,           // topological neighbours (Ballerini ~6.5)
    rSep:     U(0.6, 1.0),                 // personal space, m (Ballerini: nearest neighbour 0.7-1.5 m)
    blind:    U(30, 60) * Math.PI / 180,   // blind sector behind the head (StarDisplay has one)
    w_speed:  U(0.7, 0.9),                 // weight of neighbours' speed over a bird's own (Bialek 2014: social dominates)
    indiv:    U(0.03, 0.07),               // spread of individual cruise speeds (fraction)
    K_align,
    gamma:    2 * zeta * Math.sqrt(K_align),
    zeta,
    K_coh:    U(4.0, 7.0),                 // turn toward the local centroid
    K_sep:    U(10, 18),                   // turn away from a too-close neighbour
    K_far:    U(10, 18),                   // long-range pull toward the visible mass - as strong as alignment (Pearce 2014)
    noise:    U(0.8, 1.8),                 // rad/s^2 of private wobble - where turns begin
    wMax:     U(2.2, 3.2),                 // max turn rate, rad/s
    roost:    (opts && opts.roost) || { x: U(-40, 40), z: U(90, 150) },
    roostR:   U(45, 85),                   // free roaming radius around the roost, m
    K_roost:  U(1.5, 3.0),                 // pull back toward it beyond that
    yPref:    U(25, 60),                   // preferred flying height, m
    K_alt:    U(0.8, 1.6),                 // pull back toward it
    descSpread: U(25, 60),                 // s over which birds' own moments to go down are spread
    flapHz:   U(9, 12),
  };
}

function Flock(seed, opts) {
  const r = this.r = rng(seed);
  this.seed = seed;
  const P = this.P = drawParams(r, opts);
  const N = this.N = P.n;
  const F32 = () => new Float32Array(N);
  this.px = F32(); this.py = F32(); this.pz = F32();
  this.qx = F32(); this.qy = F32(); this.qz = F32();     // previous step, for drawing between steps
  this.fx = F32(); this.fy = F32(); this.fz = F32();     // heading (unit)
  this.gx = F32(); this.gy = F32(); this.gz = F32();     // previous heading
  this.wx = F32(); this.wy = F32(); this.wz = F32();     // turn rate
  this.sp = F32(); this.bank = F32();
  this.vi = F32(); this.si = F32();                       // this bird's own cruise speed and personal space
  this.flap = F32(); this.amp = F32(); this.glide = F32(); this.glideT = F32();
  this.landed = new Uint8Array(N);
  this.desc = new Uint8Array(N);                          // has decided to go down
  this.descAt = F32();                                    // its own moment
  this.nb = new Int32Array(N * MAXNB);
  this.nbn = new Uint8Array(N);
  this.t = 0; this.step = 0;
  this.roostAt = (opts && opts.roostAt) || 1e9;          // sim time the dusk descent may begin
  this.flushesLeft = (opts && opts.flushes) || 0;         // how many times the roost will be flushed
  this.phase = 'air';                                     // air | settling | resting | flushing
  this.fnb = new Int32Array(N * MAXNB); this.fnbn = new Uint8Array(N);   // perched neighbours
  this.launchAt = F32();
  /* The tree, if there is one: each bird gets its own perch (shared, a little
     apart, if the tree has fewer perches than birds). */
  this.crown = (opts && opts.crown) || null;
  const pr = opts && opts.perches;
  this.tx = F32(); this.ty = F32(); this.tz = F32();
  if (pr && pr.length >= 3) {
    const np = pr.length / 3, order = new Int32Array(np);
    for (let k = 0; k < np; k++) order[k] = k;
    /* the tree hands its perches over outside-in; shuffle only within the
       outer set the flock will actually fill, so the edge fills first */
    const fill = Math.min(np, Math.ceil(N * 1.4));
    for (let k = fill - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); const t = order[k]; order[k] = order[j]; order[j] = t; }
    for (let i = 0; i < N; i++) {
      const k = order[i % np], dup = Math.floor(i / np);
      this.tx[i] = pr[3 * k] + dup * 0.12; this.ty[i] = pr[3 * k + 1]; this.tz[i] = pr[3 * k + 2] + dup * 0.12;
    }
    this.hasTree = true;
  }
  /* Start as a loose ball over the roost, roughly agreed on a heading, so the
     first seconds are a flock and not a burst. */
  const cx = P.roost.x + (r() - 0.5) * 60, cy = P.yPref + 10 + r() * 20, cz = P.roost.z + (r() - 0.5) * 60;
  const h0 = r() * Math.PI * 2, rad = 2.2 * Math.cbrt(N);
  for (let i = 0; i < N; i++) {
    let x, y, z;
    do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1);
    this.px[i] = cx + x * rad; this.py[i] = cy + y * rad * 0.4; this.pz[i] = cz + z * rad;
    const h = h0 + (r() - 0.5) * 0.4;
    this.fx[i] = Math.cos(h); this.fy[i] = (r() - 0.5) * 0.1; this.fz[i] = Math.sin(h);
    norm3(this.fx, this.fy, this.fz, i);
    /* individuals differ: a normal-ish draw (sum of three uniforms), clipped */
    const g3 = (r() + r() + r() - 1.5) / 0.5;
    this.vi[i] = P.v0 * Math.max(0.88, Math.min(1.12, 1 + P.indiv * g3));
    this.si[i] = P.rSep * (0.85 + 0.3 * r());
    this.sp[i] = this.vi[i];
    this.flap[i] = r() * 6.283;
    this.glideT[i] = 0.9 + r() * 1.2;
    this.glide[i] = r() * this.glideT[i];
    this.amp[i] = 1;
    this.descAt[i] = this.roostAt + r() * P.descSpread;
  }
  this.qx.set(this.px); this.qy.set(this.py); this.qz.set(this.pz);
  this.gx.set(this.fx); this.gy.set(this.fy); this.gz.set(this.fz);
  this.cells = new Map();
}

function norm3(ax, ay, az, i) {
  const l = Math.hypot(ax[i], ay[i], az[i]) || 1;
  ax[i] /= l; ay[i] /= l; az[i] /= l;
}

/* Hash cell. 2 m, not 4: at the dense end of the spacing range a 4 m cell held
   ~100 birds and the neighbour search took the Pi from 60 to 50 fps. A bird
   with too few in reach widens its search ring by ring. */
const CS = 2;
function cellKey(ix, iy, iz) { return ((ix + 2048) * 4096 + (iy + 2048)) * 4096 + (iz + 2048); }

/* Topological neighbours: the nc nearest airborne birds. */
Flock.prototype.findNeighbours = function () {
  const N = this.N, P = this.P, cells = this.cells;
  for (const v of cells.values()) v.length = 0;
  for (let i = 0; i < N; i++) {
    if (this.landed[i]) continue;
    const k = cellKey(Math.floor(this.px[i] / CS), Math.floor(this.py[i] / CS), Math.floor(this.pz[i] / CS));
    let a = cells.get(k); if (!a) { a = []; cells.set(k, a); }
    a.push(i);
  }
  const bd = new Float32Array(MAXNB), bi = new Int32Array(MAXNB);
  const behind = -Math.cos(P.blind / 2);         // a neighbour this far round to the rear is unseen
  for (let i = 0; i < N; i++) {
    if (this.landed[i]) continue;
    const cx = Math.floor(this.px[i] / CS), cy = Math.floor(this.py[i] / CS), cz = Math.floor(this.pz[i] / CS);
    const hx = this.fx[i], hy = this.fy[i], hz = this.fz[i];
    let m = 0;
    for (let ring = 1; ring <= 6 && m < P.nc; ring++) {
      m = 0;
      for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) for (let dz = -ring; dz <= ring; dz++) {
        const a = cells.get(cellKey(cx + dx, cy + dy, cz + dz));
        if (!a) continue;
        for (let q = 0; q < a.length; q++) {
          const j = a[q]; if (j === i) continue;
          const ex = this.px[j] - this.px[i], ey = this.py[j] - this.py[i], ez = this.pz[j] - this.pz[i];
          const d2 = ex * ex + ey * ey + ez * ez;
          const dot = ex * hx + ey * hy + ez * hz;
          if (dot < 0 && dot * dot > behind * behind * d2) continue;     // in the blind sector
          if (m < P.nc) { let s = m++; while (s > 0 && bd[s - 1] > d2) { bd[s] = bd[s - 1]; bi[s] = bi[s - 1]; s--; } bd[s] = d2; bi[s] = j; }
          else if (d2 < bd[m - 1]) { let s = m - 1; while (s > 0 && bd[s - 1] > d2) { bd[s] = bd[s - 1]; bi[s] = bi[s - 1]; s--; } bd[s] = d2; bi[s] = j; }
        }
      }
    }
    this.nbn[i] = m;
    for (let s = 0; s < m; s++) this.nb[i * MAXNB + s] = bi[s];
  }
};

/* The roost's cycle: fill, rest, flush (a startle wave), fly, fill again. */
Flock.prototype.roostCycle = function () {
  const N = this.N, P = this.P, r = this.r, t = this.t;
  if (this.phase === 'air' && t > this.roostAt) { this.phase = 'settling'; this.phaseT = t; }
  if (this.phase === 'settling') {
    let down = 0; for (let i = 0; i < N; i++) down += this.landed[i];
    if (down >= 0.97 * N || t - this.phaseT > 60) {
      this.phase = 'resting'; this.phaseT = t;
      this.restUntil = this.flushesLeft > 0 ? t + 10 + r() * 14 : 1e9;
    }
  } else if (this.phase === 'resting' && t > this.restUntil) {
    this.flushesLeft--;
    this.perchedNeighbours();
    for (let i = 0; i < N; i++) this.launchAt[i] = t + 2 + r() * 2.5;    // nobody stays put long
    let first = Math.floor(r() * N), k = 0;
    while (!this.landed[first] && k++ < 100) first = Math.floor(r() * N);
    this.launchAt[first] = t;
    /* the next descent: after the flock has flown again for a while */
    this.roostAt = t + 35 + r() * 30;
    for (let i = 0; i < N; i++) { this.desc[i] = 0; this.descAt[i] = this.roostAt + r() * P.descSpread * 0.7; }
    this.phase = 'flushing'; this.phaseT = t;
  }
  if (this.phase === 'flushing') {
    const C = this.crown;
    let still = 0;
    for (let i = 0; i < N; i++) {
      if (!this.landed[i]) continue;
      if (t < this.launchAt[i]) { still++; continue; }
      /* bolt: out of the crown and up, every bird its own way */
      this.landed[i] = 0;
      let ox = this.px[i] - C.cx, oz = this.pz[i] - C.cz; const ol = Math.hypot(ox, oz) || 1;
      /* out more than up: the first render had them climb 0.65-0.95 and the
         whole burst left the top of the frame in two seconds */
      this.fx[i] = 0.9 * ox / ol + (r() - 0.5) * 0.6; this.fy[i] = 0.2 + r() * 0.3; this.fz[i] = 0.9 * oz / ol + (r() - 0.5) * 0.6;
      norm3(this.fx, this.fy, this.fz, i);
      this.sp[i] = this.vi[i] * 0.9; this.wx[i] = this.wy[i] = this.wz[i] = 0;
      for (let s = 0; s < this.fnbn[i]; s++) {
        const j = this.fnb[i * MAXNB + s];
        if (this.landed[j]) this.launchAt[j] = Math.min(this.launchAt[j], t + 0.06 + r() * 0.2);
      }
    }
    if (!still) { this.phase = 'air'; this.phaseT = t; }
  }
};

/* The nc nearest PERCHED birds of each perched bird - what a flush runs on. */
Flock.prototype.perchedNeighbours = function () {
  const N = this.N, nc = this.P.nc, C = 1.5, cells = new Map();
  const key = (x, y, z) => ((Math.floor(x / C) + 2048) * 4096 + (Math.floor(y / C) + 2048)) * 4096 + (Math.floor(z / C) + 2048);
  for (let i = 0; i < N; i++) {
    if (!this.landed[i]) continue;
    const k = key(this.px[i], this.py[i], this.pz[i]);
    let a = cells.get(k); if (!a) { a = []; cells.set(k, a); } a.push(i);
  }
  const bd = new Float32Array(MAXNB), bi = new Int32Array(MAXNB);
  for (let i = 0; i < N; i++) {
    this.fnbn[i] = 0;
    if (!this.landed[i]) continue;
    const cx = Math.floor(this.px[i] / C), cy = Math.floor(this.py[i] / C), cz = Math.floor(this.pz[i] / C);
    let m = 0;
    for (let ring = 1; ring <= 4 && m < nc; ring++) {
      m = 0;
      for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) for (let dz = -ring; dz <= ring; dz++) {
        const a = cells.get(((cx + dx + 2048) * 4096 + (cy + dy + 2048)) * 4096 + (cz + dz + 2048)); if (!a) continue;
        for (const j of a) {
          if (j === i) continue;
          const d2 = (this.px[j] - this.px[i]) ** 2 + (this.py[j] - this.py[i]) ** 2 + (this.pz[j] - this.pz[i]) ** 2;
          if (m < nc) { let s = m++; while (s > 0 && bd[s - 1] > d2) { bd[s] = bd[s - 1]; bi[s] = bi[s - 1]; s--; } bd[s] = d2; bi[s] = j; }
          else if (d2 < bd[m - 1]) { let s = m - 1; while (s > 0 && bd[s - 1] > d2) { bd[s] = bd[s - 1]; bi[s] = bi[s - 1]; s--; } bd[s] = d2; bi[s] = j; }
        }
      }
    }
    this.fnbn[i] = m;
    for (let s = 0; s < m; s++) this.fnb[i * MAXNB + s] = bi[s];
  }
};

/* Soft walls of the flight space: a turn toward the inside that grows as a
   bird presses in. The roost keeps them well inside these almost always. */
function wallPush(x, y, z, floorY, out) {
  const M = 40, MT = 25, MF = 12;
  let bx = 0, by = 0, bz = 0;
  if (x < FIELD.x0 + M) bx += (FIELD.x0 + M - x) / M;
  if (x > FIELD.x1 - M) bx -= (x - (FIELD.x1 - M)) / M;
  if (z < FIELD.z0 + M) bz += (FIELD.z0 + M - z) / M;
  if (z > FIELD.z1 - M) bz -= (z - (FIELD.z1 - M)) / M;
  if (y > FIELD.top - MT) by -= (y - (FIELD.top - MT)) / MT;
  if (y < floorY + MF) by += (floorY + MF - y) / MF;
  out[0] = bx; out[1] = by; out[2] = bz;
}

Flock.prototype.update = function (dt) {
  const N = this.N, P = this.P, r = this.r;
  this.qx.set(this.px); this.qy.set(this.py); this.qz.set(this.pz);
  this.gx.set(this.fx); this.gy.set(this.fy); this.gz.set(this.fz);
  if (this.step % 3 === 0) {
    this.findNeighbours();
    let cx = 0, cy = 0, cz = 0, c = 0;
    for (let i = 0; i < N; i++) if (!this.landed[i]) { cx += this.px[i]; cy += this.py[i]; cz += this.pz[i]; c++; }
    if (c) { this.cmx = cx / c; this.cmy = cy / c; this.cmz = cz / c; }
  }
  this.step++; this.t += dt;
  const wall = [0, 0, 0];
  const RX = P.roost.x, RZ = P.roost.z;
  if (this.hasTree) this.roostCycle();

  for (let i = 0; i < N; i++) {
    if (this.landed[i]) {
      this.amp[i] += (0 - this.amp[i]) * Math.min(1, dt * 6);
      if (this.hasTree) {                                  // settle onto the perch, no pop
        const k = Math.min(1, dt * 5);
        this.px[i] += (this.tx[i] - this.px[i]) * k; this.py[i] += (this.ty[i] - this.py[i]) * k; this.pz[i] += (this.tz[i] - this.pz[i]) * k;
      }
      continue;
    }
    const x = this.px[i], y = this.py[i], z = this.pz[i];
    const fx = this.fx[i], fy = this.fy[i], fz = this.fz[i];
    let tx = 0, ty = 0, tz = 0;
    const torque = (dx, dy, dz, k) => { tx += k * (fy * dz - fz * dy); ty += k * (fz * dx - fx * dz); tz += k * (fx * dy - fy * dx); };
    const m = this.nbn[i];
    let nDesc = 0, vNb = -1;
    /* a bird committed to its perch is listening to the flock much less -
       otherwise neighbours still up there drag it round and round the tree */
    const soc = this.desc[i] && this.hasTree ? 0.3 : 1;
    if (m) {
      let ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, sx = 0, sy = 0, sz = 0, sw = 0, vs = 0;
      for (let s = 0; s < m; s++) {
        const j = this.nb[i * MAXNB + s];
        ax += this.fx[j]; ay += this.fy[j]; az += this.fz[j];
        vs += this.sp[j];
        nDesc += this.desc[j];
        const ex = this.px[j] - x, ey = this.py[j] - y, ez = this.pz[j] - z;
        cx += ex; cy += ey; cz += ez;
        const d = Math.hypot(ex, ey, ez);
        const rs = this.si[i];
        if (d < rs && d > 1e-4) { const w = (rs - d) / rs; sx -= ex / d * w; sy -= ey / d * w; sz -= ez / d * w; sw += w; }
      }
      torque(ax / m, ay / m, az / m, P.K_align * soc);
      vNb = vs / m;
      cx /= m; cy /= m; cz /= m;
      const cl = Math.hypot(cx, cy, cz);
      if (cl > 1e-4) torque(cx / cl, cy / cl, cz / cl, P.K_coh * soc * Math.min(1, cl / 3));
      if (sw > 0) {
        const sl = Math.hypot(sx, sy, sz) || 1;
        torque(sx / sl, sy / sl, sz / sl, P.K_sep * Math.min(1, sw));
        /* and a small sideways give, so two birds never share a point */
        this.px[i] += sx * 0.8 * dt; this.py[i] += sy * 0.8 * dt; this.pz[i] += sz * 0.8 * dt;
      }
    }
    /* Dusk: a bird goes down at its own moment, or sooner once two of its
       neighbours have. Once decided, it stays decided. */
    if (!this.desc[i] && this.t > this.roostAt && (this.t > this.descAt[i] || nDesc >= 2)) this.desc[i] = 1;
    const going = this.desc[i] === 1;

    if (!going) {
      /* the visible mass (Pearce 2014) */
      if (this.cmx !== undefined) {
        const ex = this.cmx - x, ey = this.cmy - y, ez = this.cmz - z, el = Math.hypot(ex, ey, ez);
        const g = Math.min(1, Math.max(0, (el - 6) / 24));          // from 6 m out, full by 30 m
        if (g > 0) torque(ex / el, ey / el, ez / el, P.K_far * g);
      }
      /* the roost: free inside its radius, drawn back beyond it (StarDisplay) */
      const ex = RX - x, ez = RZ - z, hd = Math.hypot(ex, ez) || 1;
      if (hd > P.roostR) torque(ex / hd, 0, ez / hd, P.K_roost * Math.min(1.5, (hd - P.roostR) / 40));
      /* and the preferred height */
      const dy = P.yPref - y;
      if (Math.abs(dy) > 10) torque(0, Math.sign(dy), 0, P.K_alt * Math.min(1.5, (Math.abs(dy) - 10) / 25));
    } else if (this.hasTree) {
      /* Going to roost: home on this bird's own perch, coming down in
         proportion to distance so the approach is a falling spiral; in the
         last metres it simply flies at the perch (birds brake and flare - a
         turn-rate limit would otherwise leave it circling). */
      const ex = this.tx[i] - x, ey = this.ty[i] - y, ez = this.tz[i] - z;
      const hd = Math.hypot(ex, ez) || 1, d3 = Math.hypot(ex, ey, ez);
      if (d3 >= 8) {
        const yT = this.ty[i] + 0.45 * Math.max(0, hd - 10);
        const ddx = ex / hd, ddy = Math.max(-0.7, Math.min(0.4, (yT - y) / 15)), ddz = ez / hd;
        const dl = Math.hypot(ddx, ddy, ddz);
        torque(ddx / dl, ddy / dl, ddz / dl, 14);
      }
      /* inside 8 m the bird simply flies at its perch - applied AFTER the
         heading update below; applied here it was overwritten by it, and the
         birds circled their perches instead of landing (first test, 12-37%
         perched 80 s into the descent) */
    } else {
      /* No tree: down into the field, homing on the roost */
      const ex = RX - x, ez = RZ - z, hd = Math.hypot(ex, ez) || 1;
      const yT = Math.max(0, 0.45 * (hd - 12));
      const ddx = ex / hd, ddy = Math.max(-0.7, Math.min(0.3, (yT - y) / 15)), ddz = ez / hd;
      const dl = Math.hypot(ddx, ddy, ddz);
      torque(ddx / dl, ddy / dl, ddz / dl, 8);
    }
    /* the crown is not air: flying birds turn away from inside it */
    if (this.crown && !going) {
      const C = this.crown, qx = (x - C.cx) / (C.rx * 1.15), qy = (y - C.cy) / (C.ry * 1.15), qz = (z - C.cz) / (C.rz * 1.15);
      const q2 = qx * qx + qy * qy + qz * qz;
      if (q2 < 1) { const ql = Math.sqrt(q2) || 1; torque(qx / ql, qy / ql, qz / ql, 10 * (1 - q2)); }
    }
    wallPush(x, y, z, going ? 0 : 8, wall);
    const wl = Math.hypot(wall[0], wall[1], wall[2]);
    if (wl > 0) torque(wall[0] / wl, wall[1] / wl, wall[2] / wl, 9 * Math.min(1.5, wl));
    /* private wobble: where every turn of the whole flock begins */
    torque(r() - 0.5, r() - 0.5, r() - 0.5, P.noise);

    /* turning with inertia: torque changes the turn rate, friction bleeds it */
    let wx = this.wx[i] + (tx - P.gamma * this.wx[i]) * dt;
    let wy = this.wy[i] + (ty - P.gamma * this.wy[i]) * dt;
    let wz = this.wz[i] + (tz - P.gamma * this.wz[i]) * dt;
    const wf = wx * fx + wy * fy + wz * fz;            // no spin about the body axis
    wx -= wf * fx; wy -= wf * fy; wz -= wf * fz;
    const wm = Math.hypot(wx, wy, wz);
    if (wm > P.wMax) { wx *= P.wMax / wm; wy *= P.wMax / wm; wz *= P.wMax / wm; }
    this.wx[i] = wx; this.wy[i] = wy; this.wz[i] = wz;
    /* rotate the heading: f += (w x f) dt */
    let nfx = fx + (wy * fz - wz * fy) * dt, nfy = fy + (wz * fx - wx * fz) * dt, nfz = fz + (wx * fy - wy * fx) * dt;
    const nl = Math.hypot(nfx, nfy, nfz) || 1;
    nfx /= nl; nfy /= nl; nfz /= nl;
    if (nfy > 0.8 || nfy < -0.8) { nfy = Math.sign(nfy) * 0.8; const h = Math.hypot(nfx, nfz) || 1; nfx *= 0.6 / h; nfz *= 0.6 / h; }
    if (going && this.hasTree) {
      const ex = this.tx[i] - x, ey = this.ty[i] - y, ez = this.tz[i] - z, d3 = Math.hypot(ex, ey, ez);
      if (d3 < 8 && d3 > 1e-3) {
        const k = Math.min(1, dt * 6);
        nfx += (ex / d3 - nfx) * k; nfy += (ey / d3 - nfy) * k; nfz += (ez / d3 - nfz) * k;
        const l = Math.hypot(nfx, nfy, nfz) || 1; nfx /= l; nfy /= l; nfz /= l;
        this.wx[i] *= 0.5; this.wy[i] *= 0.5; this.wz[i] *= 0.5;   // stop turning, start flaring
      }
    }
    this.fx[i] = nfx; this.fy[i] = nfy; this.fz[i] = nfz;
    /* speed: back to cruise, slower climbing, faster diving */
    let v = this.sp[i];
    let vT = vNb > 0 ? P.w_speed * vNb + (1 - P.w_speed) * this.vi[i] : this.vi[i];
    let vMin = this.vi[i] * 0.55;
    if (going && this.hasTree) {
      const d3 = Math.hypot(this.tx[i] - this.px[i], this.ty[i] - this.py[i], this.tz[i] - this.pz[i]);
      if (d3 < 15) { vT = Math.max(2, d3 * 0.6); vMin = 1.5; }   // braking into the perch
    }
    v += ((vT - v) / 1.0 - G * 0.5 * nfy) * dt;
    v = Math.max(vMin, Math.min(this.vi[i] * 1.6, v));
    this.sp[i] = v;
    this.px[i] += nfx * v * dt; this.py[i] += nfy * v * dt; this.pz[i] += nfz * v * dt;
    /* bank into the turn, from the turn rate about vertical */
    const bT = Math.max(-1.2, Math.min(1.2, Math.atan2(v * wy, G)));
    this.bank[i] += (bT - this.bank[i]) * Math.min(1, dt * 8);
    /* flap and glide: flap while climbing or in the flap part of the cycle */
    this.flap[i] += 6.283 * P.flapHz * dt;
    this.glide[i] += dt;
    if (this.glide[i] > this.glideT[i]) this.glide[i] -= this.glideT[i];
    let aT = this.glide[i] < this.glideT[i] * 0.6 ? 1 : 0.15;
    if (nfy > 0.15) aT = 1; else if (nfy < -0.25) aT = 0.1;
    this.amp[i] += (aT - this.amp[i]) * Math.min(1, dt * 5);

    if (going && this.hasTree) {
      if (Math.hypot(this.tx[i] - this.px[i], this.ty[i] - this.py[i], this.tz[i] - this.pz[i]) < 1.2) {
        this.landed[i] = 1; this.sp[i] = 0; this.bank[i] = 0;    // on the perch
        this.fy[i] = 0; norm3(this.fx, this.fy, this.fz, i);
      }
    } else if (going && this.py[i] < 1.0) {                    // touchdown
      this.landed[i] = 1; this.py[i] = 0.08; this.sp[i] = 0;
      this.fy[i] = 0; norm3(this.fx, this.fy, this.fz, i);
      this.bank[i] = 0;
    } else if (this.py[i] < 0.6) {
      this.py[i] = 0.6; if (this.fy[i] < 0.05) { this.fy[i] = 0.05; norm3(this.fx, this.fy, this.fz, i); }
    }
  }
};

global.Murmuration = { Flock, drawParams, rng, FIELD };
})(typeof window !== 'undefined' ? window : this);

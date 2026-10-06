/* ==========================================================================
  murmuration_engine.js · v0.8 · 2026-10-03

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
    Goodenough et al. 2017 (PLoS ONE) murmurations end at dusk, when the flock
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
    v0.8  opts.vision: Pearce's projection rule - each bird turns toward the
          edges of the flock as it sees them - in place of the pull to the
          centre (big flocks only; the wall does not set it)
    v0.7  opts.scale and opts.field: a big stage for a big flock - the far
          pull's onset, roost radius, height band and walls all scale, so
          100,000 birds keep a 4,000-bird flock's spacing; scale 1 unchanged
    v0.6  settle-flush cycles: the roost fills, rests, flushes as a startle
          wave through perched neighbours, and re-forms (opts.flushes)
    v0.5  roost = the page's tree: perches, braking final approach, crown avoidance
    v0.4  field 250 m deep (was 400) with the roost brought in to match
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
const MAXNB = 16;

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
  /* A BIG FLOCK NEEDS A BIG STAGE (v0.7). Every distance that caps the
     flock's size - where the long-range pull starts, the roost's free radius,
     the preferred height and its dead band, the soft walls - was tuned at
     1,500-5,000 birds. Held fixed, they hold the flock at the same ~20 m
     whatever its number, so more birds only pack tighter: nearest neighbour
     0.65 m at 4,000, 0.46 at 20,000, 0.27 at 100,000 (2026-10-03). opts.scale
     stretches them all; the caller passes the cube root of N / 4000, which
     keeps a big flock at a 4,000-bird flock's spacing. Height grows a little
     slower (s^0.75): real big murmurations fly higher, not three times higher.
     scale 1 is the wall's flock, unchanged to the bit. */
  const S = this.S = (opts && opts.scale) || 1;
  this.field = (opts && opts.field) || FIELD;
  P.roostR *= S; P.yPref *= Math.pow(S, 0.75);
  /* opts.tune: multipliers on drawn parameters, for experiments (the draws
     themselves are untouched, so a seed still means the same evening) */
  P.give = 0.8;                                           // m/s: how fast two too-close birds slide apart
  P.farR0 = 6; P.farR1 = 24;                              // m: the far pull starts at R0 and is full by R0 + R1 (x scale)
  P.sigma = 0.02;                                         // m^2: a starling's cross-section, for what a bird can see through
  /* How hard a bird turns toward the flock's edges, as a fraction of how hard
     it turns to match its neighbours. Pearce et al. 2014 weight the two
     phi_p : phi_a = 0.03 : 0.8 to 0.1 : 0.75, so 0.04-0.13 - a gentle bias
     under a dominant alignment; "even a very weak coupling to the projection"
     keeps a flock whole. The first build used the old far pull's weight here,
     ~0.6 of alignment, and turned the flock into a disordered ball (heading
     agreement 0.12 at 20,000 birds). */
  P.visW = 0.1;
  if (opts && opts.tune) for (const k in opts.tune) if (typeof P[k] === 'number') P[k] *= opts.tune[k];
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
  this.vision = !!(opts && opts.vision);                  // Pearce's projection rule in place of the pull to the centre
  this.aniso = !!(opts && opts.shade === 'aniso');      // EXPERIMENT: a bird blocks sight by its wings and body as seen from that direction
  this.vdx = F32(); this.vdy = F32(); this.vdz = F32();   // each bird's delta: where the flock's edges lie in its view
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
  const cx = P.roost.x + (r() - 0.5) * 60 * S, cy = P.yPref + (10 + r() * 20) * S, cz = P.roost.z + (r() - 0.5) * 60 * S;
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
/* ---------------------------------------------------------------------------
   SEEING THE FLOCK (Pearce et al. 2014, PNAS; v0.8, opts.vision).
   The far pull above aims every bird at ONE point, the flock's centre. That
   keeps a small flock whole, but it crushes a big one: at 100,000 birds it
   packed them 0.27 m apart, and starting it farther out to stop the crush let
   chunks drift loosely (Joe, 2026-10-03, on the 100,000 video). Pearce's birds
   respond instead to the flock AS THEY SEE IT: projected onto a bird's view,
   the flock is dark against bright sky, and the bird turns toward the average
   direction of the EDGES between the two (delta_i). Deep inside a dense flock
   the view is dark all round and the edges cancel - nothing crushes the core.
   Near the surface of an over-dense flock a small bright patch opens outward,
   and its edge pulls the bird OUT; outside, or in a straying chunk, the flock
   is a dark patch and its edge pulls the bird BACK. The balance is a flock
   that is only partly see-through ("marginal opacity"), whatever its size.

   How it is computed here. Every third step the flying birds are binned into
   a coarse grid (SIGHT_CELL m) holding optical depth per metre: birds per
   cubic metre times a starling's cross-section (P.sigma). Each bird, on its
   own third of the steps, marches VDIR sight lines through that grid; along
   each, opacity = 1 - exp(-depth). An edge between two neighbouring sight
   lines is weighted by how much their opacity differs, and delta is the
   weighted average of the edge directions. A bird whose sampled view shows no
   edge at all is either buried in the flock (dark all round: delta = 0) or so
   far out that the flock falls between its sight lines - for that one, a far
   flock is a small dark patch, whose edge average is simply its direction,
   so delta points at the flock's centre. */
const SIGHT_CELL = 3, VDIR = 80, VSTRIDE = 3;
const VDIRS = new Float32Array(VDIR * 3);
let VMID = null, VEDGES = null;
(function () {
  const ga = Math.PI * (3 - Math.sqrt(5));                 // a Fibonacci sphere: even directions
  for (let k = 0; k < VDIR; k++) {
    const y = 1 - 2 * (k + 0.5) / VDIR, rr = Math.sqrt(1 - y * y), a = k * ga;
    VDIRS[3 * k] = Math.cos(a) * rr; VDIRS[3 * k + 1] = y; VDIRS[3 * k + 2] = Math.sin(a) * rr;
  }
  const seen = new Set(), e = [];
  for (let a = 0; a < VDIR; a++) {                         // each joined to its five nearest
    const d = [];
    for (let b = 0; b < VDIR; b++) if (b !== a) d.push([VDIRS[3 * a] * VDIRS[3 * b] + VDIRS[3 * a + 1] * VDIRS[3 * b + 1] + VDIRS[3 * a + 2] * VDIRS[3 * b + 2], b]);
    d.sort((p, q) => q[0] - p[0]);
    for (let k = 0; k < 5; k++) { const b = d[k][1], key = a < b ? a * VDIR + b : b * VDIR + a; if (!seen.has(key)) { seen.add(key); e.push(a, b); } }
  }
  VEDGES = new Int32Array(e);
  VMID = new Float32Array(e.length / 2 * 3);
  for (let k = 0; k < e.length / 2; k++) {
    const a = e[2 * k], b = e[2 * k + 1];
    const x = VDIRS[3 * a] + VDIRS[3 * b], y = VDIRS[3 * a + 1] + VDIRS[3 * b + 1], z = VDIRS[3 * a + 2] + VDIRS[3 * b + 2], l = Math.hypot(x, y, z) || 1;
    VMID[3 * k] = x / l; VMID[3 * k + 1] = y / l; VMID[3 * k + 2] = z / l;
  }
})();

Flock.prototype.buildSight = function () {
  if (this.aniso) { this.sg = buildShadeGrid(this, SIGHT_CELL, this.sg); return; }
  const N = this.N, h = SIGHT_CELL;
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let i = 0; i < N; i++) {
    if (this.landed[i]) continue;
    const x = this.px[i], y = this.py[i], z = this.pz[i];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  if (x0 > x1) { this.sg = null; return; }
  const nx = Math.min(600, Math.ceil((x1 - x0) / h) + 2), ny = Math.min(300, Math.ceil((y1 - y0) / h) + 2), nz = Math.min(600, Math.ceil((z1 - z0) / h) + 2);
  let g = this.sg;
  if (!g || g.k.length < nx * ny * nz) g = { k: new Float32Array(nx * ny * nz) };
  else g.k.fill(0, 0, nx * ny * nz);
  g.x0 = x0 - h * 0.5; g.y0 = y0 - h * 0.5; g.z0 = z0 - h * 0.5; g.nx = nx; g.ny = ny; g.nz = nz;
  const per = this.P.sigma / (h * h * h);                   // optical depth per metre added by one bird in a cell
  for (let i = 0; i < N; i++) {
    if (this.landed[i]) continue;
    const ix = Math.floor((this.px[i] - g.x0) / h), iy = Math.floor((this.py[i] - g.y0) / h), iz = Math.floor((this.pz[i] - g.z0) / h);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) continue;
    g.k[(ix * ny + iy) * nz + iz] += per;
  }
  this.sg = g;
};

const OPQ = new Float32Array(VDIR);
Flock.prototype.seeFlock = function (i) {
  if (this.aniso) return this.seeFlockAniso(i);
  const g = this.sg;
  if (!g) { this.vdx[i] = this.vdy[i] = this.vdz[i] = 0; return; }
  const h = SIGHT_CELL, nx = g.nx, ny = g.ny, nz = g.nz, k = g.k;
  const px = this.px[i], py = this.py[i], pz = this.pz[i];
  let dark = 0;
  for (let d = 0; d < VDIR; d++) {
    const dx = VDIRS[3 * d], dy = VDIRS[3 * d + 1], dz = VDIRS[3 * d + 2];
    let tau = 0, x = px + dx * h * 0.6, y = py + dy * h * 0.6, z = pz + dz * h * 0.6;
    for (let s = 0; s < 400; s++) {
      const ix = Math.floor((x - g.x0) / h), iy = Math.floor((y - g.y0) / h), iz = Math.floor((z - g.z0) / h);
      if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) {
        /* outside the grid: done if heading away from it, else step on in */
        if ((ix < 0 && dx <= 0) || (ix >= nx && dx >= 0) || (iy < 0 && dy <= 0) || (iy >= ny && dy >= 0) || (iz < 0 && dz <= 0) || (iz >= nz && dz >= 0)) break;
      } else {
        tau += k[(ix * ny + iy) * nz + iz] * h;
        if (tau > 4) break;
      }
      x += dx * h; y += dy * h; z += dz * h;
    }
    OPQ[d] = 1 - Math.exp(-tau);
    dark += OPQ[d];
  }
  let sx = 0, sy = 0, sz = 0, W = 0;
  for (let e = 0; e < VEDGES.length / 2; e++) {
    const w = Math.abs(OPQ[VEDGES[2 * e]] - OPQ[VEDGES[2 * e + 1]]);
    if (w > 0) { sx += w * VMID[3 * e]; sy += w * VMID[3 * e + 1]; sz += w * VMID[3 * e + 2]; W += w; }
  }
  if (W > 0.05) { this.vdx[i] = sx / W; this.vdy[i] = sy / W; this.vdz[i] = sz / W; return; }
  if (dark / VDIR > 0.5) { this.vdx[i] = this.vdy[i] = this.vdz[i] = 0; return; }   // buried: dark all round
  const ex = this.cmx - px, ey = this.cmy - py, ez = this.cmz - pz, el = Math.hypot(ex, ey, ez) || 1;   // too far to resolve
  this.vdx[i] = ex / el; this.vdy[i] = ey / el; this.vdz[i] = ez / el;
};

/* ---------------------------------------------------------------------------
   EXPERIMENT (Joe, 2026-10-04): A STARLING IS NOT A ROUND SPECK. Seen from
   below with its wings out it blocks several times the sky it blocks seen
   edge-on from the side, and ten times what it blocks seen nose-on. When it
   banks into a turn its wings tilt toward the vertical: views across the
   flock darken, views up through it lighten. Hemelrijk et al. 2015 (Behav
   Ecol Sociobiol) found the dark bands that sweep across murmurations come
   from exactly this - birds rolling - not from bunching.
   Here each bird is two parts, each with its own shadow:
     wings   0.018 m2 outboard of the body (a real starling: span ~38 cm,
             mean chord 6 cm, ~230 cm2 including the body strip - Ben-Gida
             et al. 2013, PLoS ONE), tilted with the bird's bank exactly as
             the page draws it, and swept through the page's own wingbeat
             (+-49 deg flapping, nearly flat gliding). The beat is averaged
             over a stroke: the birds' view is refreshed at 10 Hz, about the
             wingbeat itself, and a single instant would alias.
     body    an ellipsoid 21 x 5 x 6 cm: 24 cm2 nose-on, 99 side-on, 82 top.
   The shadow of a part along a sight line d is sqrt(d.Q.d), Q a small
   symmetric matrix (exact for the body; for the two flapping wings it stands
   in for |d.n_left| + |d.n_right|). A grid cell stores its bird count and
   the SUM of the birds' Q's; n birds sharing an orientation then shadow
   sqrt(n * d.(sum Q).d) - exact for an aligned flock, close otherwise.
   Seen from below a level, gliding bird blocks ~0.026 m2; side-on ~0.010;
   nose-on ~0.002. The round speck it replaces blocked 0.02 every way.
--------------------------------------------------------------------------- */
const A_W = 0.018, B_A = 0.105, B_B = 0.025, B_C = 0.03;
const A_TOP = Math.PI * B_A * B_B, A_SIDE = Math.PI * B_A * B_C, A_FRONT = Math.PI * B_B * B_C;
const STROKE = (function () {                    // mean cos^2 and sin^2 of the wing's tilt over a stroke, by flap amplitude
  const T = new Float32Array(66);
  for (let k = 0; k <= 32; k++) {
    const a = k / 32; let c2 = 0, s2 = 0;
    for (let j = 0; j < 64; j++) { const b = a * (0.85 * Math.sin(j / 64 * 6.2832) + 0.12); c2 += Math.cos(b) ** 2; s2 += Math.sin(b) ** 2; }
    T[2 * k] = c2 / 64; T[2 * k + 1] = s2 / 64;
  }
  return T;
})();
/* bird i's two shadow matrices, [xx yy zz xy xz yz] for the wings then the body */
function birdShade(F, i, Q) {
  let fx = F.fx[i], fy = F.fy[i], fz = F.fz[i];
  let rx = fz, rz = -fx; const rl = Math.hypot(rx, rz);
  if (rl < 1e-6) { rx = 1; rz = 0; } else { rx /= rl; rz /= rl; }               // right = up x forward (as the page draws it)
  const ux = fy * rz, uy = fz * rx - fx * rz, uz = -fy * rx;                     // up = forward x right
  const b = -F.bank[i], cb = Math.cos(b), sb = Math.sin(b);
  const Rx = rx * cb + ux * sb, Ry = uy * sb, Rz = rz * cb + uz * sb;
  const Ux = ux * cb - rx * sb, Uy = uy * cb, Uz = uz * cb - rz * sb;
  const a = Math.max(0, Math.min(1, F.amp[i])) * 32, k = Math.min(31, Math.floor(a)), t = a - k;
  const c2 = STROKE[2 * k] * (1 - t) + STROKE[2 * k + 2] * t, s2 = STROKE[2 * k + 1] * (1 - t) + STROKE[2 * k + 3] * t;
  const wu = A_W * A_W * c2, wr = A_W * A_W * s2;
  Q[0] = wu * Ux * Ux + wr * Rx * Rx; Q[1] = wu * Uy * Uy + wr * Ry * Ry; Q[2] = wu * Uz * Uz + wr * Rz * Rz;
  Q[3] = wu * Ux * Uy + wr * Rx * Ry; Q[4] = wu * Ux * Uz + wr * Rx * Rz; Q[5] = wu * Uy * Uz + wr * Ry * Rz;
  const bf = A_FRONT * A_FRONT, bs = A_SIDE * A_SIDE, bt = A_TOP * A_TOP;
  Q[6] = bf * fx * fx + bs * Rx * Rx + bt * Ux * Ux; Q[7] = bf * fy * fy + bs * Ry * Ry + bt * Uy * Uy; Q[8] = bf * fz * fz + bs * Rz * Rz + bt * Uz * Uz;
  Q[9] = bf * fx * fy + bs * Rx * Ry + bt * Ux * Uy; Q[10] = bf * fx * fz + bs * Rx * Rz + bt * Ux * Uz; Q[11] = bf * fy * fz + bs * Ry * Rz + bt * Uy * Uz;
}
/* The flying birds binned into cells of side h: a dense index grid (-1 =
   empty) and, per occupied cell, [count, wing Q sum (6), body Q sum (6)]. */
function buildShadeGrid(F, h, old) {
  const N = F.N;
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let i = 0; i < N; i++) {
    if (F.landed[i]) continue;
    const x = F.px[i], y = F.py[i], z = F.pz[i];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  if (x0 > x1) return null;
  const nx = Math.min(600, Math.ceil((x1 - x0) / h) + 2), ny = Math.min(300, Math.ceil((y1 - y0) / h) + 2), nz = Math.min(600, Math.ceil((z1 - z0) / h) + 2);
  const g = old && old.idx ? old : { idx: new Int32Array(0), forms: new Float32Array(0) };
  if (g.idx.length < nx * ny * nz) g.idx = new Int32Array(nx * ny * nz);
  g.idx.fill(-1, 0, nx * ny * nz);
  g.x0 = x0 - h * 0.5; g.y0 = y0 - h * 0.5; g.z0 = z0 - h * 0.5; g.nx = nx; g.ny = ny; g.nz = nz; g.h = h; g.aniso = true;
  if (g.forms.length < 13 * N) g.forms = new Float32Array(13 * N);
  const Q = new Float32Array(12); let used = 0;
  const fm = g.forms;
  for (let i = 0; i < N; i++) {
    if (F.landed[i]) continue;
    const ix = Math.floor((F.px[i] - g.x0) / h), iy = Math.floor((F.py[i] - g.y0) / h), iz = Math.floor((F.pz[i] - g.z0) / h);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) continue;
    const c = (ix * ny + iy) * nz + iz;
    let m = g.idx[c];
    if (m < 0) { m = g.idx[c] = used++; fm.fill(0, 13 * m, 13 * m + 13); }
    birdShade(F, i, Q);
    const o = 13 * m; fm[o]++;
    for (let k = 0; k < 12; k++) fm[o + 1 + k] += Q[k];
  }
  g.used = used;
  return g;
}
/* optical depth along a sight line from (x,y,z), direction d (unit), marched
   as the birds march theirs. aniso false: the round speck of cross-section
   sigma, from the same counts - so one grid measures both. */
function gridTau(g, x, y, z, dx, dy, dz, aniso, sigma, maxTau) {
  const h = g.h, nx = g.nx, ny = g.ny, nz = g.nz, idx = g.idx, fm = g.forms, ih2 = 1 / (h * h);
  const a0 = dx * dx, a1 = dy * dy, a2 = dz * dz, a3 = 2 * dx * dy, a4 = 2 * dx * dz, a5 = 2 * dy * dz;
  let tau = 0;
  x += dx * h * 0.6; y += dy * h * 0.6; z += dz * h * 0.6;
  for (let s = 0; s < 400; s++) {
    const ix = Math.floor((x - g.x0) / h), iy = Math.floor((y - g.y0) / h), iz = Math.floor((z - g.z0) / h);
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) {
      if ((ix < 0 && dx <= 0) || (ix >= nx && dx >= 0) || (iy < 0 && dy <= 0) || (iy >= ny && dy >= 0) || (iz < 0 && dz <= 0) || (iz >= nz && dz >= 0)) break;
    } else {
      const m = idx[(ix * ny + iy) * nz + iz];
      if (m >= 0) {
        const o = 13 * m, n = fm[o];
        if (aniso) {
          const qw = fm[o + 1] * a0 + fm[o + 2] * a1 + fm[o + 3] * a2 + fm[o + 4] * a3 + fm[o + 5] * a4 + fm[o + 6] * a5;
          const qb = fm[o + 7] * a0 + fm[o + 8] * a1 + fm[o + 9] * a2 + fm[o + 10] * a3 + fm[o + 11] * a4 + fm[o + 12] * a5;
          tau += (Math.sqrt(Math.max(0, n * qw)) + Math.sqrt(Math.max(0, n * qb))) * ih2;
        } else tau += n * sigma * ih2;
        if (tau > maxTau) break;
      }
    }
    x += dx * h; y += dy * h; z += dz * h;
  }
  return tau;
}
Flock.prototype.seeFlockAniso = function (i) {
  const g = this.sg;
  if (!g) { this.vdx[i] = this.vdy[i] = this.vdz[i] = 0; return; }
  const px = this.px[i], py = this.py[i], pz = this.pz[i];
  let dark = 0;
  for (let d = 0; d < VDIR; d++) {
    OPQ[d] = 1 - Math.exp(-gridTau(g, px, py, pz, VDIRS[3 * d], VDIRS[3 * d + 1], VDIRS[3 * d + 2], true, 0, 4));
    dark += OPQ[d];
  }
  let sx = 0, sy = 0, sz = 0, W = 0;
  for (let e = 0; e < VEDGES.length / 2; e++) {
    const w = Math.abs(OPQ[VEDGES[2 * e]] - OPQ[VEDGES[2 * e + 1]]);
    if (w > 0) { sx += w * VMID[3 * e]; sy += w * VMID[3 * e + 1]; sz += w * VMID[3 * e + 2]; W += w; }
  }
  if (W > 0.05) { this.vdx[i] = sx / W; this.vdy[i] = sy / W; this.vdz[i] = sz / W; return; }
  if (dark / VDIR > 0.5) { this.vdx[i] = this.vdy[i] = this.vdz[i] = 0; return; }
  const ex = this.cmx - px, ey = this.cmy - py, ez = this.cmz - pz, el = Math.hypot(ex, ey, ez) || 1;
  this.vdx[i] = ex / el; this.vdy[i] = ey / el; this.vdz[i] = ez / el;
};

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
function wallPush(x, y, z, floorY, out, FL, S) {
  const M = 40 * S, MT = 25 * S, MF = 12;
  let bx = 0, by = 0, bz = 0;
  if (x < FL.x0 + M) bx += (FL.x0 + M - x) / M;
  if (x > FL.x1 - M) bx -= (x - (FL.x1 - M)) / M;
  if (z < FL.z0 + M) bz += (FL.z0 + M - z) / M;
  if (z > FL.z1 - M) bz -= (z - (FL.z1 - M)) / M;
  if (y > FL.top - MT) by -= (y - (FL.top - MT)) / MT;
  if (y < floorY + MF) by += (floorY + MF - y) / MF;
  out[0] = bx; out[1] = by; out[2] = bz;
}

Flock.prototype.update = function (dt) {
  const N = this.N, P = this.P, r = this.r, S = this.S, E = P.envScale || 1;   // EXPERIMENT envScale: roost, height, walls, crown, perch keep their turn rates when gamma is raised
  this.qx.set(this.px); this.qy.set(this.py); this.qz.set(this.pz);
  this.gx.set(this.fx); this.gy.set(this.fy); this.gz.set(this.fz);
  if (this.step % 3 === 0) {
    this.findNeighbours();
    let cx = 0, cy = 0, cz = 0, c = 0;
    for (let i = 0; i < N; i++) if (!this.landed[i]) { cx += this.px[i]; cy += this.py[i]; cz += this.pz[i]; c++; }
    if (c) { this.cmx = cx / c; this.cmy = cy / c; this.cmz = cz / c; }
    if (this.vision) this.buildSight();
  }
  this.step++; this.t += dt;
  const cohort = this.step % VSTRIDE;
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
      let ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, sx = 0, sy = 0, sz = 0, sw = 0, vs = 0, rx = 0, ry = 0, rz = 0;
      for (let s = 0; s < m; s++) {
        const j = this.nb[i * MAXNB + s];
        ax += this.fx[j]; ay += this.fy[j]; az += this.fz[j];
        rx += this.wx[j]; ry += this.wy[j]; rz += this.wz[j];
        vs += this.sp[j];
        nDesc += this.desc[j];
        const ex = this.px[j] - x, ey = this.py[j] - y, ez = this.pz[j] - z;
        cx += ex; cy += ey; cz += ez;
        const d = Math.hypot(ex, ey, ez);
        const rs = this.si[i];
        if (d < rs && d > 1e-4) { const w = (rs - d) / rs; sx -= ex / d * w; sy -= ey / d * w; sz -= ez / d * w; sw += w; }
      }
      torque(ax / m, ay / m, az / m, P.K_align * soc);
      /* EXPERIMENT P.K_roll (1/s): match the neighbours' TURNING, seen as their
         roll into the turn - a bird banks before its heading swings, so this
         passes a turn on before the heading has changed (Joe, 2026-10-04) */
      if (P.K_roll) { const k = P.K_roll * soc; tx += k * (rx / m - this.wx[i]); ty += k * (ry / m - this.wy[i]); tz += k * (rz / m - this.wz[i]); }
      vNb = vs / m;
      cx /= m; cy /= m; cz /= m;
      const cl = Math.hypot(cx, cy, cz);
      if (cl > 1e-4) torque(cx / cl, cy / cl, cz / cl, P.K_coh * soc * Math.min(1, cl / 3));
      if (sw > 0) {
        const sl = Math.hypot(sx, sy, sz) || 1;
        torque(sx / sl, sy / sl, sz / sl, P.K_sep * Math.min(1, sw));
        /* and a small sideways give, so two birds never share a point */
        this.px[i] += sx * P.give * dt; this.py[i] += sy * P.give * dt; this.pz[i] += sz * P.give * dt;
      }
    }
    /* Dusk: a bird goes down at its own moment, or sooner once two of its
       neighbours have. Once decided, it stays decided. */
    if (!this.desc[i] && this.t > this.roostAt && (this.t > this.descAt[i] || nDesc >= 2)) this.desc[i] = 1;
    const going = this.desc[i] === 1;

    if (!going) {
      if (this.vision) {
        /* the flock as this bird sees it (Pearce 2014): toward the edges */
        if (i % VSTRIDE === cohort) this.seeFlock(i);
        const vx = this.vdx[i], vy = this.vdy[i], vz = this.vdz[i], vl = Math.hypot(vx, vy, vz);
        if (vl > 1e-3) torque(vx / vl, vy / vl, vz / vl, P.visW * P.K_align * Math.min(1, vl));
      } else
      /* the visible mass (Pearce 2014) */
      if (this.cmx !== undefined) {
        const ex = this.cmx - x, ey = this.cmy - y, ez = this.cmz - z, el = Math.hypot(ex, ey, ez);
        const g = Math.min(1, Math.max(0, (el - P.farR0 * S) / (P.farR1 * S)));  // from 6 m out, full by 30 m (x scale)
        if (g > 0) torque(ex / el, ey / el, ez / el, P.K_far * g);
      }
      /* the roost: free inside its radius, drawn back beyond it (StarDisplay) */
      const ex = RX - x, ez = RZ - z, hd = Math.hypot(ex, ez) || 1;
      if (hd > P.roostR) torque(ex / hd, 0, ez / hd, E * P.K_roost * Math.min(1.5, (hd - P.roostR) / (40 * S)));
      /* and the preferred height */
      const dy = P.yPref - y;
      if (Math.abs(dy) > 10 * S) torque(0, Math.sign(dy), 0, E * P.K_alt * Math.min(1.5, (Math.abs(dy) - 10 * S) / (25 * S)));
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
        torque(ddx / dl, ddy / dl, ddz / dl, E * 14);
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
      torque(ddx / dl, ddy / dl, ddz / dl, E * 8);
    }
    /* the crown is not air: flying birds turn away from inside it */
    if (this.crown && !going) {
      const C = this.crown, qx = (x - C.cx) / (C.rx * 1.15), qy = (y - C.cy) / (C.ry * 1.15), qz = (z - C.cz) / (C.rz * 1.15);
      const q2 = qx * qx + qy * qy + qz * qz;
      if (q2 < 1) { const ql = Math.sqrt(q2) || 1; torque(qx / ql, qy / ql, qz / ql, E * 10 * (1 - q2)); }
    }
    wallPush(x, y, z, going ? 0 : 8, wall, this.field, S);
    const wl = Math.hypot(wall[0], wall[1], wall[2]);
    if (wl > 0) torque(wall[0] / wl, wall[1] / wl, wall[2] / wl, E * 9 * Math.min(1.5, wl));
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

global.Murmuration = { Flock, drawParams, rng, FIELD, shade: { buildShadeGrid, gridTau, birdShade, VDIRS, VDIR } };
})(typeof window !== 'undefined' ? window : this);

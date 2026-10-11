/* ==========================================================================
  snowflake_engine.js · v0.3 · 2026-10-11

  The physics behind snowflake.html: one snow crystal growing from water
  vapour in a cloud, and then falling.

  GROWTH is the mesoscopic lattice model of Gravner & Griffeath (Physica D
  237, 2008, "Modeling snow crystal growth II"). Each cell of a hexagonal
  lattice holds three amounts of water: diffusive mass d (vapour), boundary
  mass b (a quasi-liquid layer on the crystal's edge) and crystal mass c.
  Every step:
    1  vapour diffuses (each non-crystal cell takes the mean of itself and its
       six neighbours; the crystal reflects, so vapour enters it only by
       freezing at the edge);
    2  at each edge cell a fraction 1-kappa of the vapour joins the boundary
       layer and kappa freezes straight into the crystal;
    3  an edge cell joins the crystal when its boundary layer is thick enough:
       beta for a tip (1 or 2 crystal neighbours), 1 for a flat facet (3), or
       alpha in a sheltered notch where the vapour has run out (sum of
       vapour around it below theta); 4 or more neighbours always attach;
    4  a little of the boundary layer (mu) and crystal (gamma) at the edge
       sublimates back to vapour.
  Far from the crystal the vapour is held at rho, the cloud's supply.

  WHAT THE NUMBERS MEAN PHYSICALLY. rho is the supply of vapour (how far the
  cloud is above ice saturation); beta is how hard it is for a molecule to
  stick at a tip or corner compared with a facet (attachment kinetics: large
  beta means facets win and the crystal stays a hexagon; small beta means
  corners outgrow facets and branches run); kappa, mu and gamma set how
  sticky and how leaky the edge is. The lattice model has no thickness, so
  the plate's thickening (growth on the basal faces) is carried separately:
  each cell grows thicker at the basal rate from the moment it joins.

  CONDITIONS TO PARAMETERS follow the snow-crystal morphology diagram
  (Nakaya 1954; Kobayashi 1961; Libbrecht 2005, 2019): thin plates and
  branches near -2 C and from about -10 to -22 C (thinnest, most branched
  near -15 C), columns and needles near -5 C and below about -22 C. Within a
  plate regime, more vapour means more branching: faceted plate, sectored
  plate, broad branches, stellar dendrite, fernlike dendrite. The vapour
  supply is the supersaturation over ice, and a cloud holding liquid
  droplets sits near WATER saturation, which over ice is about 1% per
  degree below zero (16% at -15 C).

  WHY EVERY FLAKE IS DIFFERENT. A crystal falls through the cloud as it
  grows, so the temperature and humidity around it change. All six arms
  feel the same history at the same moment, so they grow alike; another
  crystal takes another path. Each flake has its own Cloud and moves through
  it (Flake); a scripted Path is kept for forcing one kind.

  SYMMETRY. Only one twelfth of the lattice is computed (a 30 degree wedge);
  every other cell is the mirror or rotation of a wedge cell. That makes it
  twelve times cheaper, and makes the six arms exactly alike - which real
  arms are only nearly. The noise is per wedge cell.

  FALLING is a thin plate in still air (Faller): gravity, quasi-steady
  normal force on each of several patches of the plate (so a tilted plate
  feels a restoring torque and a spinning one is damped), and a centre of
  pressure ahead of the centre. Small light plates fall flat and rock;
  heavier ones swing wider. In SI units, real size.

  Pure JavaScript, no DOM: runs in a page or in jsc for tests.

  CHANGED
    v0.3  rime (droplets swept up from the cloud's liquid water, frozen on as
          beads, their mass in the fall); the cloud's base altitude
    v0.2  Cloud (a crystal's conditions from where it actually is) and Flake
          (one crystal's life, shared by the page and the tests); edge growth
          no thicker than the weather allows (rings; capped columns grow on the
          column's ends); sector ridges; thickening limited by vapour
          diffusion; describe() names the shape grown
    v0.1  first build
========================================================================== */
(function (global) {
'use strict';

/* ------------------------------------------------------------- random */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------- vapour */
/* Saturation vapour pressure (hPa) over liquid water and over ice (Buck 1981,
   good to 0.1% from 0 to -40 C). */
const esWater = (T) => 6.1121 * Math.exp((18.678 - T / 234.5) * (T / (257.14 + T)));
const esIce   = (T) => 6.1115 * Math.exp((23.036 - T / 333.7) * (T / (279.82 + T)));
/* Supersaturation over ice for air at relative humidity RHw (fraction, with
   respect to WATER). A cloud of supercooled droplets sits near RHw = 1. */
const sigmaIce = (T, RHw) => RHw * esWater(T) / esIce(T) - 1;
/* Vapour density excess over ice saturation, g/m^3 (the Nakaya diagram's axis). */
const excessDensity = (T, RHw) => {
  const TK = T + 273.15, Rv = 461.5;
  return 100 * (RHw * esWater(T) - esIce(T)) / (Rv * TK) * 1000;
};

/* ------------------------------------------------------------- habit */
/* The morphology diagram as two smooth functions of temperature.
   habit(T): log10 of the thickening rate (basal) over the spreading rate
   (prism) at moderate supersaturation. Negative = plates, positive =
   columns. Anchors: thick plates -1 to -3 C, columns peaking near -5 to -6
   C, plates again from -10 C with the thinnest near -15 C, columns again
   below about -22 C. */
const HABIT = [[0, -0.2], [-2, -0.35], [-3.5, 0.0], [-5, 0.85], [-6.5, 0.8], [-8.5, 0.25],
               [-10, -0.3], [-12, -0.8], [-15, -1.25], [-18, -0.9], [-21, -0.45], [-23, 0.2],
               [-25, 0.8], [-30, 0.8], [-40, 0.6]];
/* branchSigma(T): the supersaturation over ice at which branching sets in.
   Lowest near -15 C, where dendrites grow at water saturation; higher near
   -2 C and at -10 / -20 C, where it takes more vapour to branch. In the
   column regimes it is high (columns rarely branch in-plane). */
const BRANCH = [[0, 0.20], [-2, 0.13], [-3.5, 0.30], [-5, 0.45], [-7, 0.40], [-9, 0.20],
                [-11, 0.14], [-13, 0.12], [-15, 0.12], [-17, 0.14], [-19, 0.23], [-21, 0.34],
                [-23, 0.42], [-30, 0.45], [-40, 0.45]];
/* ASPECT(T): how much thicker the crystal gets per unit it spreads (dh/dr,
   both in lattice cells). Anchored on observed thickness-to-diameter
   ratios: about 1:15 at -2 C, columns several times longer than wide near
   -5 C, about 1:60 at -11 C, about 1:200 at -15 C, columns again below
   -23 C. (A first set, twice as thick in the plate range, made 3 mm plates
   ~140 um thick and fall at 1-3 m/s; real ones are 20-50 um and fall at
   0.3-0.6 m/s.) */
const ASPECT = [[0, 0.15], [-2, 0.12], [-3.5, 0.8], [-5, 6], [-6.5, 5], [-8.5, 1.2], [-10, 0.07],
                [-12, 0.025], [-15, 0.008], [-18, 0.018], [-21, 0.045], [-23, 0.8], [-26, 3], [-30, 3], [-40, 3]];
function interp(tab, T) {
  if (T >= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (T >= tab[i][0]) {
      const [t0, v0] = tab[i - 1], [t1, v1] = tab[i];
      const f = (T - t0) / (t1 - t0), s = f * f * (3 - 2 * f);   // smooth between anchors
      return v0 + (v1 - v0) * s;
    }
  }
  return tab[tab.length - 1][1];
}
const habit = (T) => interp(HABIT, T);
const branchSigma = (T) => interp(BRANCH, T);

/* CONDITIONS TO LATTICE PARAMETERS. drive = sigma / branchSigma(T). A scan
   of the lattice model over (rho, beta) (snow_tests/scan.js, 2026-10-11)
   showed beta sets the SHAPE and rho mostly the SPEED and the fineness of
   side branches:
     beta >= 2.2   faceted hexagonal plate at any rho
     beta ~ 1.9    hexagon with bulging corners; broad branches at high rho
     beta ~ 1.6    sectored plates and broad branches; stellar at high rho
     beta ~ 1.3    stellar dendrites, fernlike above rho ~ 0.52
   so drive maps onto beta, falling from 2.5 (well below branching) to 1.3
   (well above), and onto rho, rising from 0.42 to 0.60. In the column
   regimes beta rises further and rho falls: the facets barely move and the
   crystal grows almost only in length. */
const BETA_OF_DRIVE = [[0.30, 2.35], [0.50, 2.2], [0.70, 1.9], [0.90, 1.6], [1.15, 1.3], [9, 1.3]];
function betaOf(drive) {
  const t = BETA_OF_DRIVE;
  if (drive <= t[0][0]) return t[0][1];
  for (let i = 1; i < t.length; i++) if (drive <= t[i][0]) {
    const f = (drive - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
    return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * f;
  }
  return 1.3;
}
const aspect = (T) => Math.exp(interp(ASPECT.map(([t, v]) => [t, Math.log(v)]), T));
function morphology(T, sigma) {
  const s = Math.max(0, sigma), drive = s / branchSigma(T), hb = habit(T);
  const col = Math.max(0, Math.min(1, hb / 0.8));                 // 0 plate .. 1 column
  let rho = 0.50 + 0.10 * Math.max(0, Math.min(1, (drive - 0.4) / 1.0));
  let beta = betaOf(drive);
  rho = rho * (1 - 0.15 * col);
  beta = beta + 0.7 * col;
  return { rho, beta, alpha: 0.10, theta: 0.005, kappa: 0.001, mu: 0.04, gamma: 0.001,
           sigmaNoise: 0, aspect: aspect(T), drive, habit: hb, col };
}
/* A name for the shape these conditions grow now (for the card). */
function habitName(T, sigma) {
  const m = morphology(T, sigma);
  if (m.col > 0.5) return m.drive > 0.9 ? 'needle' : 'column';
  if (m.drive < 0.45) return 'hexagonal plate';
  if (m.drive < 0.75) return 'sectored plate';
  if (m.drive < 1.0) return 'broad branches';
  if (m.drive < 1.45) return 'stellar dendrite';
  return 'fernlike dendrite';
}

/* ------------------------------------------------------------- lattice */
/* Cube coordinates (x, y, z), x + y + z = 0. The twelve symmetries of the
   hexagon are the permutations of (x, y, z) with or without a sign flip, so
   a cell's canonical image is its sorted coordinates (a >= b >= c), flipped
   to (-c, -b, -a) if that makes the middle one non-negative. */
function canon(x, y, z) {
  let a = x, b = y, c = z, t;
  if (a < b) { t = a; a = b; b = t; }
  if (b < c) { t = b; b = c; c = t; }
  if (a < b) { t = a; a = b; b = t; }
  if (b < 0) { const na = -c, nb = -b, nc = -a; a = na; b = nb; c = nc; }
  return [a, b, c];
}
const DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];

/* Build the wedge: every canonical cell within hex distance R of the centre,
   each with its six neighbours as wedge indices (-1 = beyond the lattice,
   where the vapour is held at rho) and its multiplicity (how many cells of
   the full lattice it stands for). */
function buildWedge(R) {
  const key = (a, b) => a * 4096 + b;            // canonical cell is fixed by (a, b)
  const index = new Map(), A = [], B = [];
  for (let a = 0; a <= R; a++) for (let b = 0; b <= a; b++) {
    const c = -a - b;
    const cc = canon(a, b, c);
    if (cc[0] !== a || cc[1] !== b) continue;
    if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) > R) continue;
    index.set(key(a, b), A.length); A.push(a); B.push(b);
  }
  const n = A.length, nb = new Int32Array(n * 6), mult = new Uint8Array(n), dist = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = A[i], b = B[i], c = -a - b;
    for (let k = 0; k < 6; k++) {
      const x = a + DIRS[k][0], y = b + DIRS[k][1], z = c + DIRS[k][2];
      if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > R) { nb[i * 6 + k] = -1; continue; }
      const cc = canon(x, y, z);
      nb[i * 6 + k] = index.get(key(cc[0], cc[1]));
    }
    /* orbit size: count distinct images under the 12 symmetries */
    const seen = new Set();
    const p = [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
    for (const q of p) { seen.add(q.join(',')); seen.add(q.map((v) => -v).join(',')); }
    mult[i] = seen.size;
    /* Euclidean distance from the centre in cell spacings (axial to plane) */
    const px = a + b * 0.5, py = b * Math.sqrt(3) / 2;
    dist[i] = Math.hypot(px, py);
  }
  return { R, n, A: Int32Array.from(A), B: Int32Array.from(B), nb, mult, dist, index, key };
}

/* ------------------------------------------------------------- crystal */
function Crystal(opts) {
  opts = opts || {};
  this.R = opts.R || 240;
  this.W = buildWedge(this.R);
  const n = this.W.n;
  this.d = new Float32Array(n); this.b = new Float32Array(n); this.c = new Float32Array(n);
  this.a = new Uint8Array(n);                 // attached
  this.nA = new Uint8Array(n);                // crystal neighbours (kept current)
  this.tA = new Float32Array(n).fill(-1);     // step at which it attached
  this.K = new Float32Array(n);               // cumulative basal growth at attachment
  this.hA = new Float32Array(n);              // thickness the cell joined with
  this.zOff = new Float32Array(n);            // a plate grown on a column's end sits this far from the middle plane
  this.ridge = new Float32Array(n);           // fractional thickening along a plate's corner-to-centre ridge
  this.dSum = 0; this.dN = 0;                 // drive at the attachments of the outer half (fern or stellar)
  this.tip = new Uint8Array(n);               // attached as a tip (1-2 neighbours): a rib
  this.edge = [];                             // indices of boundary cells (unattached, >= 1 crystal neighbour)
  this.inEdge = new Uint8Array(n);
  this.rand = mulberry32((opts.seed >>> 0) || 1);
  this.steps = 0; this.Kb = 0; this.rmax = 0; this.mass = 0;
  this.vr = 0; this._r0 = 0; this._s0 = 0;      // radial speed, cells per step (running)
  this.kbCap = Infinity;                      // most the faces may thicken per step (set by Flake from vapour diffusion)
  this.p = opts.params || morphology(-15, 0.15);
  this.d.fill(this.p.rho);
  this.seedRadius = opts.seedRadius === undefined ? 1 : opts.seedRadius;
  for (let i = 0; i < n; i++) if (this.hexDist(i) <= this.seedRadius) this.attach(i, 2);
}
Crystal.prototype.hexDist = function (i) { const a = this.W.A[i], b = this.W.B[i]; return Math.max(a, Math.abs(b), a + b); };
Crystal.prototype.attach = function (i, nAt) {
  if (this.a[i]) return;
  /* THE THICKNESS IT JOINS WITH. A prism face spans the crystal's whole
     thickness, so a cell joining a facet (3 or more crystal neighbours)
     continues the slab at its neighbours' thickness: a column stays a
     prism with flat ends, a plate a slab. A cell joining at a branching tip
     (1 or 2) starts thinner - the edge-sharpening that keeps dendrite tips
     and branches thin while the centre thickens. */
  let hs = 0, hn = 0, zs = 0;
  const nbr = this.W.nb;
  for (let k = 0; k < 6; k++) {
    const j = nbr[i * 6 + k];
    if (j >= 0 && this.a[j]) { hs += this.hA[j] + (this.Kb - this.K[j]); zs += this.zOff[j]; hn++; }
  }
  const hp = hn ? hs / hn : 1.2;
  let zp = hn ? zs / hn : 0;
  /* how much thinner a tip starts: fully at dendritic beta (1.3), not at all
     on a faceted crystal (beta 2.0 and up), where a corner is just the end
     of a facet */
  const thin = 0.55 + 0.45 * Math.max(0, Math.min(1, (this.p.beta - 1.3) / 0.7));
  let h = nAt >= 3 ? hp : Math.max(1.0, thin * hp);
  /* THE EDGE GROWS AS THICK AS THE WEATHER ALLOWS. New growth at the edge is
     no thicker than a crystal growing here and now would be (aspect x size):
     in column weather that is no limit, in plate weather it is thin. So a
     crystal that changes from thick growth to thin leaves a step - one of the
     inner hexagonal rings real plates show - and a plate grown on a column
     stays a thin plate (before this, it inherited the column's thickness and
     the middle became one thick block). When the new growth is less than half
     as thick as the edge it grows from, it grows from the rims of the two end
     faces, where the vapour arrives first: two thin plates, one on each end -
     a capped column on a column, a split plate on a thick plate. zOff carries
     it out to the end face, and the two plates are the two faces drawn. */
  /* (in column weather there is no limit: a column's side faces span its
     whole length. Tying the limit to the width there cut a column's rim back
     while its middle lengthened - a pencil - and left no step for caps.) */
  const hEdge = (this.p.col || 0) > 0 ? Infinity : 1.2 + 1.2 * (this.p.aspect || 0) * Math.max(this.rmax, 3);
  if (h > hEdge) {
    if (h > 2 * hEdge) zp += (h - hEdge) / 2;
    h = hEdge;
  }
  this.hA[i] = h; this.zOff[i] = zp;
  /* SECTOR RIDGES. In a sectored plate the ice along each line from the centre
     to a corner stands proud: the corners grow fastest and lay down thicker
     ice behind them, dividing the plate into six sectors. Strongest at the
     sectored-plate beta (1.6-2.1), faint on a plain hexagon, none on a
     dendrite (whose arms carry their own rib). The wedge's b = 0 line is the
     line to a corner. */
  const be = this.p.beta;
  const amp = (this.p.col || 0) > 0.5 ? 0 : be < 1.5 ? 0 : be < 1.8 ? 0.55 * (be - 1.5) / 0.3 : be < 2.15 ? 0.55 : Math.max(0.18, 0.55 - (be - 2.15) * 1.6);
  const dperp = this.W.B[i] * 0.866;
  this.ridge[i] = amp * Math.exp(-(dperp * dperp) / (1.8 * 1.8));
  if (this.W.dist[i] > 0.5 * this.rmax && this.rmax > 10) { this.dSum += this.p.drive || 0; this.dN++; }
  this.a[i] = 1; this.tA[i] = this.steps; this.K[i] = this.Kb;
  this.tip[i] = nAt <= 2 ? 1 : 0;
  this.c[i] += this.b[i]; this.b[i] = 0; this.d[i] = 0;
  if (this.W.dist[i] > this.rmax) this.rmax = this.W.dist[i];
  /* neighbours' counts and the edge list */
  const nb = this.W.nb;
  for (let k = 0; k < 6; k++) {
    const j = nb[i * 6 + k];
    if (j < 0 || this.a[j]) continue;
    let m = 0;
    for (let q = 0; q < 6; q++) { const y = nb[j * 6 + q]; if (y >= 0 && this.a[y]) m++; }
    this.nA[j] = m;
    if (!this.inEdge[j]) { this.inEdge[j] = 1; this.edge.push(j); }
  }
  this.inEdge[i] = 0;
};
Crystal.prototype.setParams = function (p) { this.p = p; };
/* One update of the lattice. */
Crystal.prototype.step = function () {
  const W = this.W, n = W.n, nb = W.nb, d = this.d, a = this.a, b = this.b, c = this.c, p = this.p;
  const rho = p.rho, kap = p.kappa, mu = p.mu, gam = p.gamma, beta = p.beta, alpha = p.alpha, theta = p.theta;
  /* 1 diffusion (into a scratch copy) */
  const dn = this._dn || (this._dn = new Float32Array(n));
  for (let i = 0; i < n; i++) {
    if (a[i]) { dn[i] = 0; continue; }
    const di = d[i], o = i * 6;
    let s = di;
    for (let k = 0; k < 6; k++) {
      const j = nb[o + k];
      s += j < 0 ? rho : (a[j] ? di : d[j]);
    }
    dn[i] = s / 7;
  }
  d.set(dn);
  /* 2 freezing at the edge */
  const E = this.edge;
  for (let e = 0; e < E.length; e++) {
    const i = E[e]; if (a[i]) continue;
    const v = d[i];
    b[i] += (1 - kap) * v; c[i] += kap * v; d[i] = 0;
  }
  /* 3 attachment, decided on the state after freezing, then applied */
  const join = this._join || (this._join = []);
  join.length = 0;
  for (let e = 0; e < E.length; e++) {
    const i = E[e]; if (a[i]) continue;
    const m = this.nA[i], bi = b[i];
    let ok = false;
    if (m >= 4) ok = true;
    else if (m === 3) {
      if (bi >= 1) ok = true;
      else if (bi >= alpha) {
        let s = d[i]; const o = i * 6;
        for (let k = 0; k < 6; k++) { const j = nb[o + k]; s += j < 0 ? rho : d[j]; }
        ok = s < theta;
      }
    } else if (m >= 1) ok = bi >= beta;
    if (ok) join.push(i);
  }
  for (let q = 0; q < join.length; q++) this.attach(join[q], this.nA[join[q]]);
  /* 4 melting at the (remaining) edge */
  let w = 0;
  for (let e = 0; e < E.length; e++) {
    const i = E[e];
    if (a[i]) continue;                        // left the edge by attaching
    const bi = b[i], ci = c[i];
    b[i] = (1 - mu) * bi; c[i] = (1 - gam) * ci; d[i] += mu * bi + gam * ci;
    E[w++] = i;
  }
  E.length = w;
  /* 5 noise in the vapour, if any */
  if (p.sigmaNoise > 0) {
    const sn = p.sigmaNoise, r = this.rand;
    for (let e = 0; e < E.length; e++) { const i = E[e]; d[i] *= 1 + (r() < 0.5 ? -sn : sn); }
  }
  /* THICKENING. The basal faces grow at aspect(T) times the speed the crystal
     spreads; the floor is the speed of a bare facet at this vapour supply, so
     a column (whose facets barely move) still lengthens. */
  if (this.steps - this._s0 >= 100) {
    const v = (this.rmax - this._r0) / (this.steps - this._s0);
    this.vr = this.vr ? 0.7 * this.vr + 0.3 * v : v;
    this._r0 = this.rmax; this._s0 = this.steps;
  }
  const vfloor = 0.0018 * Math.pow(rho / 0.45, 3);
  this.Kb += Math.min((p.aspect || 0) * Math.max(this.vr, vfloor), this.kbCap);
  this.steps++;
};
/* Thickness of a crystal cell, in cells: what it joined with plus all the
   basal faces have grown since; a rib (a line of tip cells) a little
   proud of the plate around it. */
Crystal.prototype.thickness = function (i) {
  if (!this.a[i]) return 0;
  /* ribs and ridges stand proud by a share of a THIN plate's thickness (at
     most 6 cells), not of the local thickness: as a percentage they turned
     every corner of a thick column into a spike and each ridge into a fin */
  const base = this.hA[i] + (this.Kb - this.K[i]), lip = Math.min(base, 6);
  return base + lip * ((this.tip[i] ? 0.25 : 0) + this.ridge[i]);
};
/* WHAT HAS GROWN, in words (for the caption and the card): judged from the
   crystal's own geometry, not from the conditions now.
     fill  = area / area of the hexagon through its six points
     inner = the same inside 0.45 of the radius; mid 0.45-0.8; outer 0.8-1 */
Crystal.prototype.describe = function () {
  const W = this.W, R = this.rmax;
  if (R < 6) return 'hexagonal prism';
  let area = 0, aIn = 0, aMid = 0, aOut = 0, capped = false, hubR = 0;
  const h0 = this.thickness(0);
  for (let i = 0; i < W.n; i++) {
    if (!this.a[i]) continue;
    const m = W.mult[i], d = W.dist[i];
    area += m;
    if (d < 0.45 * R) aIn += m; else if (d < 0.8 * R) aMid += m; else aOut += m;
    if (this.zOff[i] > 2) capped = true;                 // plates grown on the ends of something thick
    if (this.thickness(i) > 0.55 * h0 && d > hubR) hubR = d;
  }
  const hexA = (r) => 3 * r * r;
  const fill = area / hexA(R), fIn = aIn / hexA(0.45 * R), fMid = aMid / (hexA(0.8 * R) - hexA(0.45 * R)),
        fOut = aOut / (hexA(R) - hexA(0.8 * R));
  if (h0 > 2 * R * 1.3) return h0 > 2 * R * 5 ? 'needle' : 'column';
  if (capped && h0 > 0.6 * R) return 'capped column';
  if (fill > 0.9) return h0 > 0.25 * R ? 'thick hexagonal plate' : 'hexagonal plate';
  if (fill > 0.72) return 'sectored plate';
  if (fill > 0.5) return fIn > 0.85 ? 'plate with broad branches' : 'broad-branched crystal';
  if (fIn > 0.8) return 'plate with dendritic arms';
  if (fOut > fMid + 0.12) return 'stellar dendrite with plate tips';
  const drv = this.dN ? this.dSum / this.dN : 1;
  return drv > 1.45 ? 'fernlike stellar dendrite' : 'stellar dendrite';
};
/* Totals over the full lattice (multiplicities). */
Crystal.prototype.stats = function () {
  const W = this.W; let area = 0, vol = 0, cells = 0;
  for (let i = 0; i < W.n; i++) if (this.a[i]) { area += W.mult[i]; vol += W.mult[i] * this.thickness(i); cells++; }
  return { area, vol, rmax: this.rmax, steps: this.steps, wedgeCells: cells };
};

/* ------------------------------------------------------------- the path */
/* A crystal's trip through the cloud: temperature and humidity (with
   respect to water) as smooth functions of growth progress u in [0, 1].
   Each flake draws an ARCHETYPE (where in the diagram it spends its life)
   and then wanders around it, so the set covers the diagram's variety while
   every individual is different. */
const ARCH = [
  // name, weight, T start, T end, RHw start, RHw end
  ['stellar dendrite',      0.20, -14.0, -16.0, 0.985, 1.005],
  ['fernlike dendrite',     0.10, -15.0, -15.0, 1.015, 1.030],
  ['plate to dendrite',     0.12, -11.0, -15.0, 0.930, 1.000],
  ['dendrite to plate',     0.10, -15.0, -11.0, 1.000, 0.930],
  ['sectored plate',        0.12, -13.0, -16.0, 0.930, 0.945],
  ['broad branches',        0.10, -16.0, -14.0, 0.960, 0.975],
  ['hexagonal plate',       0.08, -12.0, -18.0, 0.890, 0.905],
  ['warm plate',            0.05, -2.0,  -2.5,  1.000, 1.010],
  ['column',                0.06, -5.5,  -6.0,  0.990, 1.000],
  ['plate on a column',     0.07, -6.0,  -14.0, 0.990, 1.005],
];
function Path(seed, forceName) {
  const r = mulberry32((seed >>> 0) || 1);
  let tot = 0; for (const x of ARCH) tot += x[1];
  let pick = r() * tot, arch = ARCH[0];
  for (const x of ARCH) { if ((pick -= x[1]) <= 0) { arch = x; break; } }
  if (forceName) arch = ARCH.find((x) => x[0] === forceName) || arch;
  this.name = arch[0];
  const jT = (r() - 0.5) * 1.6, jH = (r() - 0.5) * 0.012;
  this.T0 = arch[2] + jT; this.T1 = arch[3] + jT * 0.6 + (r() - 0.5) * 1.0;
  this.H0 = arch[4] + jH; this.H1 = arch[5] + jH + (r() - 0.5) * 0.015;
  /* wander: a few slow sinusoids with random phase (the cloud is patchy) */
  this.w = [];
  for (let k = 0; k < 3; k++) this.w.push({ f: 1 + k * 1.7 + r() * 1.3, p: r() * 6.283, aT: (0.6 - 0.15 * k) * r(), aH: (0.008 - 0.002 * k) * r() });
  /* a sudden step for some flakes: a gust carries it into other air */
  this.stepAt = r() < 0.3 ? 0.35 + 0.4 * r() : -1;
  this.stepT = (r() - 0.5) * 4; this.stepH = (r() - 0.5) * 0.05;
}
Path.prototype.at = function (u) {
  const s = u * u * (3 - 2 * u);
  let T = this.T0 + (this.T1 - this.T0) * s, H = this.H0 + (this.H1 - this.H0) * s;
  for (const w of this.w) { T += w.aT * Math.sin(6.283 * w.f * u + w.p); H += w.aH * Math.sin(6.283 * w.f * u + w.p + 1.3); }
  if (this.stepAt > 0 && u > this.stepAt) { const k = Math.min(1, (u - this.stepAt) / 0.04); T += this.stepT * k; H += this.stepH * k; }
  T = Math.min(-0.5, Math.max(-35, T)); H = Math.min(1.06, Math.max(0.80, H));
  return { T, RHw: H, sigma: sigmaIce(T, H), excess: excessDensity(T, H) };
};

/* ------------------------------------------------------------- the cloud */
/* A CLOUD THE CRYSTAL ACTUALLY MOVES THROUGH (Joe, 2026-10-11: "Do you model
   the snowflake as falling from some height?"). Heights in metres above the
   cloud base. Inside the cloud:
     temperature falls with height at the moist rate, 5.5-7 C per km, from a
     base at -1 to -7 C to a top at -18 to -32 C;
     the air holds liquid droplets, so the humidity sits near water
     saturation; an updraft pushes it slightly above (droplets cannot keep
     up), 2% per m/s, at most 3%;
     up to two drier layers where outside air has been mixed in (86-96% of
     water saturation), a few hundred metres thick, drifting slowly;
     an updraft, strong from just above the base and fading near the top,
     0-1.3 m/s, swelling and fading over some minutes; about a third of
     clouds are convective (over 0.7 m/s). A small crystal falls only a few
     cm/s, so an updraft can carry it up into colder air for a while.
   Below the base the air is dry (the crystal stops growing there); above the
   top the droplets are gone and the humidity falls. */
function Cloud(seed) {
  const r = mulberry32((seed >>> 0) || 1);
  this.Tbase = -1 - 6 * r();
  this.lapse = (5.5 + 1.5 * r()) / 1000;                  // C per metre
  this.Ttop = -18 - 14 * r();
  this.top = (this.Tbase - this.Ttop) / this.lapse;       // metres above the base
  this.W0 = r() < 0.33 ? 0.7 + 0.6 * r() : 0.6 * r();
  this.Wp = 300 + 600 * r(); this.Wph = r() * 6.283;
  this.dry = [];
  const nd = r() < 0.25 ? 0 : r() < 0.6 ? 1 : 2;
  for (let k = 0; k < nd; k++) this.dry.push({ z: this.top * (0.15 + 0.7 * r()), half: 120 + 230 * r(), rh: 0.86 + 0.10 * r(),
                                             drift: (r() - 0.5) * 0.15 });
  this.patch = 0.01 + 0.02 * r();                         // in-cloud patchiness of humidity
  this.pp = r() * 6.283;
  /* the base's height above the ground (for the altitude readout) */
  this.baseAGL = 400 + 1400 * r();
  /* LIQUID WATER: the supercooled droplets the crystal can sweep up (rime).
     Most snow falls from layered clouds holding 0.01-0.08 g/m3 of liquid,
     some almost none (the ice has eaten it); convective clouds hold 0.08-0.38
     and make the heavily rimed crystals and graupel. Droplets 6-12
     micrometres in radius. (A first set, 0.03-0.8, rimed nearly every flake
     into graupel.) */
  const lw = r();
  this.lwc = this.W0 > 0.7 ? 0.08 + 0.3 * lw : lw < 0.4 ? 0.002 + 0.01 * lw : 0.01 + 0.07 * lw;
  this.rDrop = (6 + 6 * r()) * 1e-6;
}
Cloud.prototype.updraft = function (z, t) {
  if (z < 0 || z > this.top) return 0;
  /* strong from just above the base (a convective updraft starts there),
     fading only near the top */
  const shape = Math.sqrt(Math.sin(Math.PI * Math.min(1, z / this.top)));
  return this.W0 * shape * (0.55 + 0.45 * Math.sin(6.283 * t / this.Wp + this.Wph));
};
Cloud.prototype.at = function (z, t) {
  const T = this.Tbase - this.lapse * z;
  let RHw;
  if (z < 0) RHw = Math.max(0.75, 0.97 + z / 3000);                 // below the base: drier, sublimating
  else if (z > this.top) RHw = Math.max(0.80, 0.98 - (z - this.top) / 1500);
  else {
    const w = this.updraft(z, t);
    RHw = 0.985 + this.patch * Math.sin(z / 90 + this.pp) + Math.min(0.03, 0.02 * Math.max(0, w));
    for (const d of this.dry) {
      const zc = d.z + d.drift * t, k = Math.exp(-Math.pow((z - zc) / d.half, 2));
      RHw = RHw * (1 - k) + d.rh * k;
    }
  }
  const sigma = sigmaIce(T, RHw);
  /* droplets only inside the cloud, thinner where outside air has mixed in */
  let lwc = 0;
  if (z >= 0 && z <= this.top) {
    lwc = this.lwc * Math.sin(Math.PI * Math.min(1, z / this.top)) ** 0.5;
    for (const d of this.dry) lwc *= 1 - Math.exp(-Math.pow((z - (d.z + d.drift * t)) / d.half, 2));
  }
  return { T, RHw, sigma, excess: excessDensity(T, RHw), w: this.updraft(z, t), z, lwc, alt: this.baseAGL + z };
};
/* Where does ice first appear? Ice-nucleating particles become active as it
   gets colder; most crystals in clouds like these start between -10 and -25
   C, some near -6 C. */
Cloud.prototype.nucleationHeight = function (r) {
  const x = r();
  /* and in a cloud whose top is colder than -24 C, some start right up at
     the top, in column weather - the start of a capped column */
  const Tn = x < 0.12 ? -5.5 - 2.5 * r() : x < 0.70 ? -11 - 6.5 * r() : x < 0.86 || this.Ttop > -24 ? -17.5 - 6 * r()
           : this.Ttop + 0.8 + 2.5 * r();
  const z = (this.Tbase - Math.max(this.Ttop + 0.5, Math.min(this.Tbase - 0.5, Tn))) / this.lapse;
  return Math.max(30, Math.min(this.top - 30, z));
};

/* How fast a crystal of this mass and face area falls in still air: weight
   against drag, Stokes drag on a disc broadside (16 mu R v) plus form drag
   (0.5 rho Cd A v^2). Small crystals fall a few cm/s, millimetre ones about
   half a metre a second. */
function fallSpeed(mass, area, radius) {
  const mu = 1.7e-5, rhoA = 1.25, Cd = 1.2, g = 9.81;
  const a = 0.5 * rhoA * Cd * area, b = 16 * mu * radius, c = mass * g;
  return (-b + Math.sqrt(b * b + 4 * a * c)) / (2 * a);
}
/* How fast the crystal's edge (or a column's end) advances in metres per
   second at these conditions: about 2 micrometres a second for a dendrite tip
   near water saturation at -15 C, a few tenths for a faceted plate edge
   (Libbrecht's measurements). Only sets the clock; the shape comes from the
   lattice. */
function growthSpeed(T, sigma) {
  const m = morphology(T, sigma);
  /* columns lengthen slowly, a few tenths of a micrometre a second */
  const v = (0.25e-6 + 1.6e-6 * Math.max(0, Math.min(1.6, m.drive / 1.3))) * (1 - 0.6 * m.col);
  /* and everything grows in proportion to the vapour actually there to take:
     the excess density over ice, 0.26 g/m3 at water saturation near -12 C but
     about half that at -27 C, where cold air holds little vapour at all */
  const ex = excessDensity(T, (sigma + 1) * esIce(T) / esWater(T));
  return Math.max(0.03e-6, v * Math.max(0, Math.min(1.3, ex / 0.26)));
}

/* ------------------------------------------------------------- a flake's life */
/* One crystal from its frozen droplet to full size: the lattice, its size in
   real units, and where it is - in a modelled Cloud (default) or on a scripted
   Path (opts.arch, for forcing a kind). advance(n) runs n lattice steps and
   moves the crystal through the cloud for the real time those steps stand
   for. */
function Flake(seed, opts) {
  opts = opts || {};
  const r = mulberry32(((seed >>> 0) || 1) ^ 0x5bd1e995);
  this.seed = seed; this.r = r;
  this.scripted = !!opts.arch;
  if (this.scripted) {
    this.path = new Path(seed, opts.arch);
    this.cond = this.path.at(0);
  } else {
    this.cloud = new Cloud(seed);
    this.z = this.z0 = this.cloud.nucleationHeight(r);
    this.zMax = this.zMin = this.z;
    this.t = 0;
    this.cond = this.cloud.at(this.z, 0);
  }
  this.m = morphology(this.cond.T, this.cond.sigma);
  /* a crystal that starts in column weather gets a smaller lattice: it
     spreads little and grows mostly in length */
  this.columnish = this.m.col > 0.5 && (this.scripted ? this.path.name === 'column' : true);
  const R = opts.R || 210;
  this.R = this.columnish ? Math.round(R * 0.55) : R;
  this.cr = new Crystal({ R: this.R, params: this.m, seedRadius: 1, seed });
  /* full size: a plate 0.84 of the lattice across; a crystal that starts as
     a column may lengthen to 2.6 lattice radii, so a column high in a cold
     cloud keeps growing until it falls into plate weather (a capped column)
     rather than stopping as a stub */
  this.rFin = this.R * 0.84; this.hFin = this.R * (this.columnish ? 2.6 : 1.6);
  this.noise = 0.002 + 0.004 * r();
  /* real size at full growth (mm): sets mm per lattice cell */
  /* a column's full size is its LENGTH, 1-2 mm: long enough that one started
     at a cold cloud top is usually still growing when it falls into plate
     weather, where plates grow on its ends */
  this.D = this.columnish ? 1.0 + 1.0 * r() : 2.2 + 2.6 * r();
  this.cell = this.columnish ? (this.D / 2) / (this.hFin * 0.5) : (this.D / 2) / this.rFin;
  this.u = 0; this.done = false; this.why = '';
  this.vFall = 0; this.history = [];
  this.T0 = this.cond.T; this.RH0 = this.cond.RHw;
  /* RIME: droplets frozen onto the crystal, kept as beads in the full
     lattice's coordinates (not the twelfth: rime is random, not symmetric) */
  this.beads = []; this.rimeMass = 0; this._beadAcc = 0;
  this.rbead = mulberry32(((seed >>> 0) || 1) ^ 0x2545f491);
}
Flake.prototype.progress = function () {
  return Math.min(1, Math.max(this.cr.rmax / this.rFin, this.cr.thickness(0) / this.hFin));
};
Flake.prototype.advance = function (n) {
  const cr = this.cr;
  for (let k = 0; k < n && !this.done; k++) {
    if (cr.steps % 10 === 0) {
      const u0 = this.u;
      this.u = this.progress();
      {
        /* the real time these steps stood for, and (in a cloud) where the
           crystal went. A scripted path keeps the same clock, so its faces
           thicken under the same diffusion limit. */
        const du = this.u - u0;
        if (du > 0) {
          const half = (this.columnish ? this.hFin * 0.5 : this.rFin) * this.cell * 1e-3;   // m
          const dt = du * half / growthSpeed(this.cond.T, this.cond.sigma);
          if (!this.scripted) this.moveFor(dt);
          else this.t = (this.t || 0) + dt;
          /* THICKENING IS FED BY DIFFUSION. A crystal's whole mass gain is
             limited by how fast vapour diffuses to it, 4 pi C D drho (C its
             electrical capacitance: 2R/pi for a plate, about a third of the
             length for a column). Spread over its face, half of that is the
             most its faces can thicken - 0.02 um/s for a 3 mm plate, a few
             tenths of a um/s for the end of a small column. Without this a
             big plate falling through column weather near the cloud base
             thickened as fast as a column lengthens and fell at 2 m/s. */
          const st = this.statsQuick(), cm = this.cell * 1e-3;
          const Rm = Math.max(1, cr.rmax) * cm, Lm = cr.thickness(0) * cm;
          const C = Math.max(2 * Rm / Math.PI, Lm / 3), A = Math.max(1e-12, st.area * cm * cm * 0.866);
          const drho = Math.max(0, this.cond.excess) * 1e-3;                              // kg/m3
          const dhdt = 0.5 * 4 * Math.PI * C * 2.2e-5 * drho / (917 * A);                 // m/s
          cr.kbCap = dhdt * dt / 10 / cm;                                                 // cells per lattice step
        }
      }
      this.cond = this.scripted ? this.path.at(this.u) : this.cloud.at(this.z, this.t);
      this.m = morphology(this.cond.T, this.cond.sigma);
      this.m.sigmaNoise = this.noise;
      cr.setParams(this.m);
      if (this.u >= 1) { this.done = true; this.why = 'full size'; break; }
      /* below the cloud base the air is drier than ice saturation: the
         crystal has left the cloud and falls out as snow, whatever its size */
      if (!this.scripted && this.z < -40) { this.done = true; this.why = 'fell out of the cloud'; break; }
      /* in air below ice saturation (a dry layer) nothing deposits: time
         passes and the crystal moves, but the lattice does not grow */
      if (!this.scripted && this.cond.sigma < 0.004) {
        this.stalled = true;
        this.moveFor(15);
        this.cond = this.cloud.at(this.z, this.t);
        continue;
      }
      this.stalled = false;
    }
    cr.step();
  }
};
/* move through the cloud for dt real seconds: up with the updraft, down at
   the crystal's own fall speed */
Flake.prototype.moveFor = function (dt) {
  const st = this.statsQuick();
  const cellM = this.cell * 1e-3;
  const mass = 917 * st.vol * cellM * cellM * cellM * 0.866 + this.rimeMass;
  /* a column falls broadside: its drag is on its long side, not its end */
  const len = this.cr.thickness(0) * cellM, wid = 2 * Math.max(1, this.cr.rmax) * cellM;
  const area = Math.max(1e-12, st.area * cellM * cellM * 0.866, this.columnish ? len * wid : 0);
  this.vFall = fallSpeed(mass, area, Math.max(wid, this.columnish ? len : 0) / 2);
  this.mass = mass;
  let left = dt;
  while (left > 0) {
    const h = Math.min(left, 5);
    const w = this.cloud.updraft(this.z, this.t);
    this.z += (w - this.vFall) * h; this.t += h; left -= h;
  }
  this.zMax = Math.max(this.zMax, this.z); this.zMin = Math.min(this.zMin, this.z);
  this.rime(dt, area);
  if (!this.history.length || this.t - this.history[this.history.length - 1].t > 30)
    this.history.push({ t: this.t, z: this.z, T: this.cond.T, RHw: this.cond.RHw, u: this.u });
};
/* RIMING. A falling crystal sweeps up supercooled droplets in its path, and
   each freezes where it hits. How many: collection efficiency x face area x
   fall speed x droplets per m3 (from the liquid water content). Small
   crystals catch almost none - the air flowing round them carries the
   droplets aside - so the efficiency rises from zero at 0.4 mm across to 0.4
   at 2 mm. Beads land mostly on the face that leads as it falls (the
   underside) and nearer the edges, which meet the air first. */
Flake.prototype.rime = function (dt, area) {
  const c = this.cond;
  if (!c.lwc || c.T >= 0) return;
  const Dmm = 2 * Math.max(1, this.cr.rmax) * this.cell;
  const E = Math.max(0, Math.min(0.4, (Dmm - 0.4) / 4.0));
  if (E <= 0) return;
  const rd = this.cloud.rDrop, md = 1000 * 4 / 3 * Math.PI * rd * rd * rd;    // kg per droplet
  const perM3 = (c.lwc * 1e-3) / md;
  const n = E * area * this.vFall * perM3 * dt;
  this._beadAcc += n;
  const cr = this.cr, W = cr.W, r = this.rbead;
  while (this._beadAcc >= 1) {
    this._beadAcc -= 1;
    this.rimeMass += md;
    if (this.beads.length >= 1600) continue;          // enough to show; the mass still counts
    /* a crystal cell, picked with weight rising toward the rim */
    let i = -1;
    for (let tries = 0; tries < 40 && i < 0; tries++) {
      const j = (r() * W.n) | 0;
      if (cr.a[j] && r() < 0.25 + 0.75 * W.dist[j] / Math.max(1, cr.rmax)) i = j;
    }
    if (i < 0) continue;
    /* one of its twelve images: a rotation by k x 60 degrees, maybe mirrored */
    const k = (r() * 6) | 0, mir = r() < 0.5 ? -1 : 1;
    const x0 = W.A[i] + W.B[i] * 0.5, y0 = W.B[i] * 0.8660254 * mir;
    const th = k * Math.PI / 3, cs = Math.cos(th), sn = Math.sin(th);
    this.beads.push({ i, x: x0 * cs - y0 * sn + (r() - 0.5), y: x0 * sn + y0 * cs + (r() - 0.5),
                      side: r() < 0.8 ? -1 : 1, rad: rd * (0.9 + 0.3 * r()) });
  }
};
/* the shape grown, with its rime if it has any worth naming */
Flake.prototype.describe = function () {
  const base = this.cr.describe();
  const st = this.statsQuick(), cm = this.cell * 1e-3;
  const ice = 917 * st.vol * cm * cm * cm * 0.866;
  if (this.rimeMass > 2 * ice) return 'graupel (a ' + base + ' buried in rime)';
  if (this.rimeMass > 0.4 * ice) return 'heavily rimed ' + base;
  if (this.rimeMass > 0.04 * ice) return 'rimed ' + base;
  return base;
};
/* area and volume, refreshed every few hundred steps (a full pass over the
   wedge is cheap but not free) */
Flake.prototype.statsQuick = function () {
  if (!this._st || this.cr.steps - this._stAt > 200) { this._st = this.cr.stats(); this._stAt = this.cr.steps; }
  return this._st;
};

/* ------------------------------------------------------------- falling */
/* A thin rigid plate falling in still air. State in SI units, z up.
   The plate is modelled as N patches around its centre (area fractions),
   each feeling a normal force from the air rushing past it:
      F = -0.5 rho_air Cn A_k |u_n| u_n n      (u_n = normal component)
   plus a small skin drag along the plate. Because each patch sees its own
   velocity (the plate's plus rotation x position), a spinning plate is
   damped and a tilted plate in a sideslip feels a torque - the source of
   the rocking ("flutter") seen in falling snowflakes. The centre of
   pressure is shifted toward the leading edge by cpk of the radius. */
function Faller(o) {
  this.m = o.mass;                         // kg
  this.R = o.radius;                       // m
  this.A = o.area;                         // m^2 (projected area of the plate)
  this.h = o.thick || 3e-5;
  this.column = !!o.column;
  this.Cn = o.Cn || 1.6; this.cf = o.cf || 0.15; this.cpk = o.cpk === undefined ? 0.18 : o.cpk;
  /* moments of inertia of a disc (or a rod for a column), body frame: z = plate normal */
  const m = this.m, R = this.R;
  this.I = this.column ? [m * R * R / 3, m * R * R / 3, m * R * R / 6] : [m * R * R / 4, m * R * R / 4, m * R * R / 2];
  this.pos = [0, 0, 0]; this.vel = [0, 0, 0];
  this.q = [0, 0, 0, 1];                   // body to world (x, y, z, w)
  this.w = [0, 0, 0];                      // angular velocity, body frame
  /* patches: a ring of 6 plus the centre */
  this.P = [[0, 0, 0.25]];
  for (let k = 0; k < 6; k++) { const t = k * Math.PI / 3; this.P.push([0.62 * R * Math.cos(t), 0.62 * R * Math.sin(t), 0.125]); }
  this.rand = mulberry32(o.seed || 7);
  /* CLOUD TURBULENCE: a few eddies of random size and phase sweeping past,
     0.03-0.08 m/s, periods 0.15-0.8 s (a flake this small rides most of the
     air's motion; what it feels is the part that changes faster than it can
     follow). */
  const r = this.rand;
  this.eddies = [];
  for (let k = 0; k < 5; k++) this.eddies.push({ a: (0.03 + 0.05 * r()) * (k < 2 ? 1 : 0.5), w: 2 * Math.PI / (0.15 + 0.65 * r()),
                                                 p: r() * 6.283, d: [r() - 0.5, r() - 0.5, (r() - 0.5) * 0.6] });
  /* A real crystal is never perfectly symmetric, so the air turns it slowly
     about its axis; chirality is that small unbalanced twist (N m). */
  this.chirality = (r() < 0.5 ? -1 : 1) * (0.4 + 0.6 * r()) * 0.5 * 1.25 * this.cf * this.A * this.R * 0.004;
  this.t = 0;
  this.gust = [0, 0, 0];
}
function qrot(q, v) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}
function qconjrot(q, v) { return qrot([-q[0], -q[1], -q[2], q[3]], v); }
Faller.prototype.tilt = function (ax, ay) {        // set an initial tilt (radians about body x, y)
  const h = Math.hypot(ax, ay); if (h < 1e-9) return;
  const s = Math.sin(h / 2) / h; this.q = [ax * s, ay * s, 0, Math.cos(h / 2)];
};
Faller.prototype.step = function (dt) {
  const rhoA = 1.25, g = 9.81;
  this.t += dt;
  this.gust = [0, 0, 0];
  for (const e of this.eddies) {
    const v = e.a * Math.sin(e.w * this.t + e.p), m = Math.hypot(e.d[0], e.d[1], e.d[2]) || 1;
    this.gust[0] += v * e.d[0] / m; this.gust[1] += v * e.d[1] / m; this.gust[2] += v * e.d[2] / m;
  }
  let F = [0, 0, -this.m * g], Tb = [0, 0, 0];
  const nW = qrot(this.q, [0, 0, 1]);
  for (const P of this.P) {
    const rb = [P[0], P[1], 0];          // patch centre in the plate's plane; P[2] is its share of the area
    /* patch velocity in world: v + w x r (w in body, rotate to world) */
    const wxr = [this.w[1] * rb[2] - this.w[2] * rb[1], this.w[2] * rb[0] - this.w[0] * rb[2], this.w[0] * rb[1] - this.w[1] * rb[0]];
    const vr = qrot(this.q, wxr);
    const rw = qrot(this.q, rb);
    const u = [this.vel[0] + vr[0] - this.gust[0], this.vel[1] + vr[1] - this.gust[1], this.vel[2] + vr[2] - this.gust[2]];
    const un = u[0] * nW[0] + u[1] * nW[1] + u[2] * nW[2];
    const Ak = this.A * P[2];
    const fn = -0.5 * rhoA * this.Cn * Ak * Math.abs(un) * un;
    const ut = [u[0] - un * nW[0], u[1] - un * nW[1], u[2] - un * nW[2]];
    const utm = Math.hypot(ut[0], ut[1], ut[2]);
    const ft = -0.5 * rhoA * this.cf * Ak * utm;
    /* centre of pressure ahead of the patch centre, along the in-plane flow */
    let off = [0, 0, 0];
    /* ut is the in-plane part of the plate's motion through the air: the edge
       it points to is the LEADING edge, and the push acts nearer that edge.
       That is what turns a tilted falling plate back toward flat. */
    if (utm > 1e-6) { const k = this.cpk * this.R * 0.5 / utm; off = [ut[0] * k, ut[1] * k, ut[2] * k]; }
    const f = [fn * nW[0] + ft * ut[0], fn * nW[1] + ft * ut[1], fn * nW[2] + ft * ut[2]];
    F[0] += f[0]; F[1] += f[1]; F[2] += f[2];
    const arm = [rw[0] + off[0], rw[1] + off[1], rw[2] + off[2]];
    const tw = [arm[1] * f[2] - arm[2] * f[1], arm[2] * f[0] - arm[0] * f[2], arm[0] * f[1] - arm[1] * f[0]];
    const tb = qconjrot(this.q, tw);
    Tb[0] += tb[0]; Tb[1] += tb[1]; Tb[2] += tb[2];
  }
  /* rotational air damping about the normal (spin) - a disc spinning in its
     own plane only feels skin friction */
  Tb[2] -= 0.5 * rhoA * this.cf * this.A * this.R * this.R * this.R * Math.abs(this.w[2]) * this.w[2] * 0.3;
  /* the unbalanced twist grows with the airspeed through the flake */
  Tb[2] += this.chirality * (this.vel[0] * this.vel[0] + this.vel[1] * this.vel[1] + this.vel[2] * this.vel[2]);
  for (let k = 0; k < 3; k++) this.vel[k] += F[k] / this.m * dt;
  for (let k = 0; k < 3; k++) this.pos[k] += this.vel[k] * dt;
  /* Euler's equations, body frame */
  const I = this.I, w = this.w;
  const dw = [(Tb[0] - (I[2] - I[1]) * w[1] * w[2]) / I[0], (Tb[1] - (I[0] - I[2]) * w[2] * w[0]) / I[1], (Tb[2] - (I[1] - I[0]) * w[0] * w[1]) / I[2]];
  for (let k = 0; k < 3; k++) w[k] += dw[k] * dt;
  /* integrate the orientation: q' = 0.5 q * (w, 0) */
  const [x, y, z, s] = this.q, [p, qq, rr] = w;
  const nq = [x + 0.5 * dt * (s * p + y * rr - z * qq), y + 0.5 * dt * (s * qq + z * p - x * rr),
              z + 0.5 * dt * (s * rr + x * qq - y * p), s + 0.5 * dt * (-x * p - y * qq - z * rr)];
  const nn = Math.hypot(nq[0], nq[1], nq[2], nq[3]);
  this.q = [nq[0] / nn, nq[1] / nn, nq[2] / nn, nq[3] / nn];
};

const SnowEngine = { version: '0.1', mulberry32, esWater, esIce, sigmaIce, excessDensity, habit, branchSigma,
                     morphology, habitName, aspect, canon, buildWedge, Cloud, Flake, fallSpeed, growthSpeed, Crystal, Path, ARCH, Faller, qrot };
if (typeof module !== 'undefined' && module.exports) module.exports = SnowEngine;
global.SnowEngine = SnowEngine;
})(typeof window !== 'undefined' ? window : this);

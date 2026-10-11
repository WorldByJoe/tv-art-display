/* ==========================================================================
  kite_engine.js · v0.2 · 2026-10-10

  The physics of a person flying a kite in a gusty field, with no drawing
  in it: kite.html draws it, and jsc runs it bare for the tests.

  WIND. Speed grows with height by the log law over grass (roughness 3 cm),
  so a kite at 30 m feels about 20% more than the 10 m reading and a hand
  at 1.2 m about 40% less. On that sit gusts: a frozen turbulence field
  (8 plane waves per component, wavelengths 3-190 m, energies on the -5/3
  law; 16.5% of the 10 m speed along the wind, 13% across, 8.5% up and
  down) carried downwind at the wind's own speed, so the gust that ruffles
  the grass reaches the kite a few seconds later. Over that, the weather:
  a slow drift in speed and direction, lulls (the wind falls to 15-50% for
  5-18 s), surges of 25-60%, and shifts of 15-45 degrees.

  THE KITE is a rigid frame of point masses (spar ends and bridle knots)
  held by distance constraints and solved by position-based dynamics in 16
  sub-steps per 1/60 s frame (the constraints alternate with their mirror
  image each sub-step: plain Gauss-Seidel order flew the kite 5 deg off
  centre). Air acts on each flat sail panel, worked in four parts so a
  pitching or rolling kite meets the air differently at its ends (that is
  its damping): a normal force 0.5 rho V^2 A C_N with C_N = 1.2 tanh(k
  alpha), skin friction and frame drag at the panel's centroid, and a
  centre of pressure that moves from the centroid toward the leading edge
  as the angle of attack falls. That movement is what makes a kite trim:
  it settles where the centre of pressure sits over the bridle's tow point
  (the diamond near 26 deg, 6 N of pull in 5 m/s). The diamond's bowed spar
  (15 cm, about 20 deg of dihedral) is what keeps it in the middle of the
  sky; flat, it slid off to the side and fell.

  TWO LINES. A stunt kite turns because pulling one handle draws that side
  of the sail back into the air, an airbrake on that wing; here that is
  extra drag on the pulled side, 2.0 per metre the hands differ. Its swept
  wings meeting the air a little from the side push the nose back into the
  airflow, a torque flat panels do not make, carried by an equivalent fin
  at the tail. Without the brake a pull turned the kite the wrong way:
  drag tips the lines toward the nose, so the tighter line yaws it away.

  THE LINE is a chain of 24 masses whose segments resist stretching but
  not slack; each feels cross-flow drag (1.2 mm, C_d 1.1). It sags in a
  lull, bows downwind in a blow, and lies on the grass when the kite is
  down. The diamond's tail is a ribbon: a chain with drag. The dragon is a
  Chinese centipede: a train of discs on a backbone, each a small kite held
  at its trim angle. The box kite is defined but not flown in the scenes
  (Joe: "add box kites later").

  THE FLYER walks, runs and stands and holds the line's end. A small
  autopilot decides when to launch, let out line, take it in, run in a
  lull, pump, fetch a fallen kite and tug a snagged one; with two lines it
  holds an intention and flies it (see PilotAI). A tree, if
  there is one, snags any part of the kite that gets into its crown; in
  some tree scenes (o.fate) it gets its chance on purpose: the wind swings
  toward it and dies with the tree between flyer and kite, or the two-line
  pilot is careless near it.

  TESTS: kite_tests/ (jsc), see its README.

  CHANGED
    v0.2  Joe's second round: kites bigger by similarity (diamond x2.0 = 1.9 m,
          delta x1.4 = 3.2 m span, dragon x1.6); the two-line pilot flies an
          intention (sweeps, up and down, figure eights, resting high) with
          deliberate turns and small leg corrections, tugs a downed kite up;
          elastic lines (a snagged tug read thousands of pounds); a swept
          sail's yaw damping; the dragon is a centipede train (Joe's); a
          slower launch: walk back 8-22 m tugging, then line out in spurts
    v0.1  first draft
========================================================================== */
(function (root) {
'use strict';

const G = 9.81, RHO = 1.2, Z0 = 0.03, LNREF = Math.log(10 / Z0), TAU = 2 * Math.PI, DEG = Math.PI / 180;
const NSUB = 16, ITER = 2, DT = 1 / 60;
let HAND_V = 3, LEG_MAX = 0.06;                        // two-line flyer: hand speed apart (m/s), largest correction on a straight leg (m)
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function gauss(r) { const u = Math.max(1e-12, r()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r()); }
const expo = (r, mean) => -Math.log(1 - r()) * mean;

/* ================================================================== WIND
   th is the direction the wind blows TOWARD, in the ground plane:
   (cos th, 0, sin th). */
const SIGMA = [0.165, 0.13, 0.085];          // turbulence along, across, vertical, per unit 10 m speed
function Wind(r, o) {
  this.r = r;
  this.U0 = o.U0; this.th0 = o.dir || 0; this.gusty = o.gusty || 1;
  this.t = 0; this.lk = 0; this.dOU = 0;
  this.lullGap = o.lullGap || 80; this.gustGap = o.gustGap || 60; this.shiftGap = o.shiftGap || 75;
  this.nextLull = (o.calm0 == null ? 45 : o.calm0) + expo(r, this.lullGap);
  this.nextGust = 20 + expo(r, this.gustGap);
  this.nextShift = 35 + expo(r, this.shiftGap);
  this.lull = null; this.gust = null; this.sh = { a: 0, b: 0, t0: -1e9, dur: 1 };
  this.bias = o.bias || 0; this.limit = o.limit || 50 * DEG;
  this.adv = [0, 0]; this.lullS = 0; this.gustS = 0; this.shiftNow = 0;
  /* the gust field: per component, 8 plane waves (kx, kz, ky, amplitude, phase, drift) */
  const lam = [3, 5.5, 10, 18, 32, 58, 105, 190];
  const p = lam.map((l) => Math.pow(l, 2 / 3)), ps = p.reduce((a, b) => a + b, 0);
  this.M = [];
  for (let c = 0; c < 3; c++) {
    const arr = new Float64Array(lam.length * 6);
    for (let i = 0; i < lam.length; i++) {
      const ang = r() * TAU, k = TAU / (lam[i] * (0.85 + 0.3 * r()));
      arr[6 * i] = k * Math.cos(ang); arr[6 * i + 1] = k * Math.sin(ang);
      arr[6 * i + 2] = k * (0.3 + 0.4 * r()) * (r() < 0.5 ? -1 : 1);
      arr[6 * i + 3] = SIGMA[c] * Math.sqrt(2 * p[i] / ps);
      arr[6 * i + 4] = r() * TAU;
      arr[6 * i + 5] = (0.04 + 0.12 * r()) * (r() < 0.5 ? -1 : 1);
    }
    this.M.push(arr);
  }
  this.update();
}
Wind.prototype.update = function () {
  const lull = this.lull ? this.lull.depth * this.lullS : 0, gust = this.gust ? this.gust.amp * this.gustS : 0;
  this.U10 = this.U0 * Math.exp(this.lk) * (1 - lull) * (1 + gust);
  this.th = this.th0 + this.shiftNow + this.dOU;
  this.ex = Math.cos(this.th); this.ez = Math.sin(this.th);
};
/* a lull, surge or shift now (tests, and the tree scenes' bias) */
Wind.prototype.force = function (kind, o) {
  const r = this.r, t = this.t;
  o = o || {};
  if (kind === 'lull') this.lull = { t0: t, up: o.up || 3, hold: o.hold || 10, down: o.down || 6, depth: o.depth || 0.75 };
  if (kind === 'gust') this.gust = { t0: t, up: o.up || 2, hold: o.hold || 5, down: o.down || 4, amp: o.amp || 0.5 };
  if (kind === 'shift') this.sh = { a: this.shiftNow, b: clamp(o.to, -this.limit, this.limit), t0: t, dur: o.dur || (8 + 12 * r()) };
};
Wind.prototype.step = function (dt) {
  const r = this.r, t = (this.t += dt);
  this.lk += -this.lk * dt / 50 + 0.12 * Math.sqrt(2 * dt / 50) * gauss(r);
  this.dOU += -this.dOU * dt / 60 + 6 * DEG * Math.sqrt(2 * dt / 60) * gauss(r);
  if (!this.lull && t >= this.nextLull) this.lull = { t0: t, up: 2 + 4 * r(), hold: 4 + 14 * r(), down: 4 + 6 * r(), depth: 0.5 + 0.35 * r() };
  if (!this.gust && t >= this.nextGust) this.gust = { t0: t, up: 1.5 + 2.5 * r(), hold: 2 + 8 * r(), down: 3 + 5 * r(), amp: 0.25 + 0.35 * r() };
  if (t >= this.nextShift && t - this.sh.t0 > this.sh.dur) {
    const amt = (15 + 30 * r()) * DEG;
    let sg = r() < 0.5 ? -1 : 1;
    if (this.bias && r() < 0.7) sg = Math.sign(this.bias);
    let to = this.sh.b + sg * amt;
    if (Math.abs(to) > this.limit) to = this.sh.b - sg * amt;
    this.sh = { a: this.shiftNow, b: clamp(to, -this.limit, this.limit), t0: t, dur: 8 + 12 * r() };
    this.nextShift = t + this.sh.dur + expo(r, this.shiftGap);
  }
  const env = (e) => {
    const a = t - e.t0;
    return a < e.up ? smooth(a / e.up) : a < e.up + e.hold ? 1 : smooth(1 - (a - e.up - e.hold) / e.down);
  };
  this.lullS = 0; this.gustS = 0;
  if (this.lull) {
    this.lullS = env(this.lull);
    if (t - this.lull.t0 > this.lull.up + this.lull.hold + this.lull.down) { this.lull = null; this.nextLull = t + 15 + expo(r, this.lullGap); }
  }
  if (this.gust) {
    this.gustS = env(this.gust);
    if (t - this.gust.t0 > this.gust.up + this.gust.hold + this.gust.down) { this.gust = null; this.nextGust = t + 10 + expo(r, this.gustGap); }
  }
  this.shiftNow = this.sh.a + (this.sh.b - this.sh.a) * smooth((t - this.sh.t0) / this.sh.dur);
  this.update();
  this.adv[0] += this.U10 * this.ex * dt; this.adv[1] += this.U10 * this.ez * dt;
};
/* the wind vector at a point, into out[0..2] */
Wind.prototype.at = function (x, y, z, out) {
  const yy = y < 0.08 ? 0.08 : y, lz = Math.log(yy / Z0);
  const U = this.U10 * lz / LNREF;
  const qx = x - this.adv[0], qz = z - this.adv[1], t = this.t;
  let s0 = 0, s1 = 0, s2 = 0;
  const A = this.M[0], B = this.M[1], C = this.M[2];
  for (let i = 0; i < 48; i += 6) {
    s0 += A[i + 3] * Math.sin(A[i] * qx + A[i + 1] * qz + A[i + 2] * yy + A[i + 4] + A[i + 5] * t);
    s1 += B[i + 3] * Math.sin(B[i] * qx + B[i + 1] * qz + B[i + 2] * yy + B[i + 4] + B[i + 5] * t);
    s2 += C[i + 3] * Math.sin(C[i] * qx + C[i + 1] * qz + C[i + 2] * yy + C[i + 4] + C[i + 5] * t);
  }
  const g = this.U10 * this.gusty * Math.min(1, lz / 4.2);
  const u = U + s0 * g, v = s1 * g, w = s2 * g * Math.min(1, yy / 3);
  out[0] = u * this.ex - v * this.ez; out[1] = w; out[2] = u * this.ez + v * this.ex;
};
/* the along-wind speed at height y (no gusts): the log law */
Wind.prototype.mean = function (y) { return this.U10 * Math.log(Math.max(0.08, y) / Z0) / LNREF; };

/* ================================================================== PARTICLES */
function Phys(cap) {
  this.cap = cap; this.n = 0;
  const v3 = () => new Float64Array(3 * cap);
  this.x = v3(); this.p = v3(); this.v = v3(); this.f = v3(); this.kf = v3(); this.kt = v3();
  this.w = new Float64Array(cap); this.m = new Float64Array(cap); this.rad = new Float64Array(cap); this.mu = new Float64Array(cap);
  this.kin = new Uint8Array(cap); this.cat = new Uint8Array(cap); this.dn = new Float64Array(cap); this.gr = new Uint8Array(cap);
  this.crown = new Uint8Array(cap); this.noSnag = new Float64Array(cap);
  this.ci = []; this.cj = []; this.cr = []; this.ck = []; this.cl = []; this.ca = [];   // ca: compliance, m per N (0 = rigid)
}
/* cat: 0 kite frame, 1 line, 2 tail */
Phys.prototype.add = function (x, y, z, m, rad, mu, cat) {
  const i = this.n++, i3 = 3 * i;
  this.x[i3] = this.p[i3] = x; this.x[i3 + 1] = this.p[i3 + 1] = y; this.x[i3 + 2] = this.p[i3 + 2] = z;
  this.m[i] = m; this.w[i] = m > 0 ? 1 / m : 0; this.rad[i] = rad; this.mu[i] = mu; this.cat[i] = cat;
  return i;
};
/* kind 0 rigid, 1 rope (resists stretch only), 2 tether (rope that moves j only);
   line >= 0 marks a constraint pulling on that line's hand (tension) */
Phys.prototype.link = function (i, j, rest, kind, line) {
  this.ci.push(i); this.cj.push(j); this.cr.push(rest); this.ck.push(kind); this.cl.push(line == null ? -1 : line); this.ca.push(0);
  return this.ci.length - 1;
};
Phys.prototype.seal = function () {
  this.CI = Int32Array.from(this.ci); this.CJ = Int32Array.from(this.cj); this.CR = Float64Array.from(this.cr);
  this.CK = Uint8Array.from(this.ck); this.CL = Int8Array.from(this.cl); this.CA = Float64Array.from(this.ca); this.nc = this.CI.length;
};
Phys.prototype.setMass = function (i, m) { this.m[i] = m; if (!this.kin[i]) this.w[i] = m > 0 ? 1 / m : 0; };

/* ================================================================== KITES
   Body axes: x to the kite's right, y toward the nose, z out of its face on
   the bridle side (into the wind). Points are [x, y, z, mass kg]. Every
   pair of frame points is held rigid. Sails are triangles of named points
   or of body positions; 'basis' is four frame points, not in one plane,
   that every body position is written in terms of. */
const KITES = {
  diamond: {
    label: 'diamond', lines: 1, area: 0.38, U: [2.5, 3.2], scale: 2.0,
    pts: { N: [0, 0.95, 0, 0.015], L: [-0.40, 0.69, -0.15, 0.016], R: [0.40, 0.69, -0.15, 0.016], T: [0, 0, 0, 0.016], B: [0, 0.72, 0.42, 0.003] },
    basis: ['N', 'L', 'R', 'T'], nose: ['N'], foot: ['T'],
    sails: [[['N', 'L', 'T'], 1], [['N', 'T', 'R'], 1]],
    bridle: ['B'], cn: 1.2, cf: 0.03, cpk: 0.2, cd0: 0.04,
    tail: { kind: 'ribbon', at: 'T', len: 3.6, n: 18, mass: 0.014, cda: 0.0042 },
  },
  box: {
    /* a Hargrave box flown on one edge: its square cells (36 cm sides) seen
       end on are diamonds, so the two faces into the wind make a 45 degree
       V on each side - a lot of dihedral, which is why box kites fly steady */
    label: 'box', lines: 1, area: 0.46, U: [3.5, 4.2],
    pts: {
      f0: [0, 0, 0.255, 0.02], l0: [-0.255, 0, 0, 0.02], k0: [0, 0, -0.255, 0.02], r0: [0.255, 0, 0, 0.02],
      f1: [0, 1.0, 0.255, 0.02], l1: [-0.255, 1.0, 0, 0.02], k1: [0, 1.0, -0.255, 0.02], r1: [0.255, 1.0, 0, 0.02],
      B: [0, 0.645, 0.70, 0.005],
    },
    basis: ['f0', 'l0', 'r0', 'f1'], nose: ['f1', 'l1', 'k1', 'r1'], foot: ['f0', 'l0', 'k0', 'r0'],
    sails: [], bridle: ['B'], cn: 1.2, cf: 0.03, cpk: 0.2,
  },
  delta: {
    label: 'two-line delta', lines: 2, area: 0.95, U: [2.2, 2.8], scale: 1.4, turnG: 1.5,
    pts: {
      N: [0, 0.82, 0, 0.035], L: [-1.15, 0.03, -0.16, 0.05], R: [1.15, 0.03, -0.16, 0.05], T: [0, 0, 0, 0.05],
      BL: [-0.30, 0.54, 0.35, 0.006], BR: [0.30, 0.54, 0.35, 0.006],
    },
    basis: ['N', 'L', 'R', 'T'], nose: ['N'], foot: ['T'],
    sails: [[['N', 'L', 'T'], 1], [['N', 'T', 'R'], 1]],
    bridle: ['BL', 'BR'], cn: 1.2, cnk: 3.5, cf: 0.01, cpk: 0.2, cd0: 0.01, brake: 2.0, fin: { at: 'T', area: 0.6 }, yawDamp: 0.1,
  },
  dragon: {
    /* a Chinese centipede (caterpillar) dragon (Joe, 2026-10-10): a big head
       disc with the dragon's face, then a train of small discs on a backbone
       of strings, each held at its angle by its strings and balanced by a
       stick with feathers at the ends. Flown as a kite train: each disc makes
       lift and drag at its trim angle to the air it meets (see aero) */
    label: 'dragon', lines: 1, U: [3.5, 4.5],
    train: { n: 20, d: 0.40, head: 0.90, gap: 0.55, m: 0.016, headM: 0.12, trim: 33, cdx: 0.06 },
  },
};
/* the box kite's cloth: two cells, each four faces; the two in the lee of
   the others work at 0.65 */
(function boxSails() {
  const K = KITES.box, a = 0.255, cells = [[0.68, 1.0], [0, 0.32]];
  const quad = (p, q, k, y0, y1) => {
    const A = [p[0], y0, p[1]], B = [q[0], y0, q[1]], C = [q[0], y1, q[1]], D = [p[0], y1, p[1]];
    K.sails.push([[A, B, C], k]); K.sails.push([[A, C, D], k]);
  };
  const F = [0, a], Lf = [-a, 0], Bk = [0, -a], Rt = [a, 0];
  for (const [y0, y1] of cells) {                              // each split mirror-image left to right
    quad(Lf, F, 1, y0, y1); quad(Rt, F, 1, y0, y1);            // the two faces into the wind
    quad(Lf, Bk, 0.65, y0, y1); quad(Rt, Bk, 0.65, y0, y1);    // and the two behind
  }
})();

/* the four parts of a panel's midpoint split, as weights on its corners */
const SUBP = [[4 / 6, 1 / 6, 1 / 6], [1 / 6, 4 / 6, 1 / 6], [1 / 6, 1 / 6, 4 / 6], [1 / 3, 1 / 3, 1 / 3]];
/* a kite def grown by s in every length: masses and areas by s^2, so the
   trim and stability found at s = 1 carry over (forces and weights both
   scale as s^2, their moments as s^3) */
function scaleDef(d0) {
  const s = d0.scale || 1;
  if (s === 1 || d0.train) return d0;
  const d = Object.assign({}, d0), m = s * s;
  d.pts = {}; for (const [k, [x, y, z, w]] of Object.entries(d0.pts)) d.pts[k] = [x * s, y * s, z * s, w * m];
  d.sails = d0.sails.map(([tri, k]) => [tri.map((v) => (typeof v === 'string' ? v : v.map((c) => c * s))), k]);
  d.area = d0.area * m;
  if (d0.tail) d.tail = Object.assign({}, d0.tail, { len: d0.tail.len * s, mass: d0.tail.mass * m, cda: (d0.tail.cda || 0) * s, d0: (d0.tail.d0 || 0) * s, d1: (d0.tail.d1 || 0) * s });
  if (d0.fin) d.fin = Object.assign({}, d0.fin, { area: d0.fin.area * m });
  return d;
}
function buildKite(W, def) {
  const P = W.ph, K = { def, idx: {}, frame: [], body: [], S: [], bridle: [] };
  for (const name of Object.keys(def.pts)) {
    const [bx, by, bz, m] = def.pts[name];
    const i = P.add(bx, by, bz, m, 0.02, 0.6, 0);
    K.idx[name] = i; K.frame.push(i); K.body.push([bx, by, bz]);
  }
  /* every pair held rigid. Gauss-Seidel order leaves a small sideways bias
     (it flew 5 deg off centre in steady wind), so the pairs are kept twice:
     as listed, and with every point swapped for its mirror image (x -> -x);
     the sub-steps alternate between the two */
  const nF = K.frame.length, mir = [];
  for (let a = 0; a < nF; a++) {
    const A = K.body[a];
    let m = a;
    for (let b = 0; b < nF; b++) { const B = K.body[b]; if (Math.abs(A[0] + B[0]) < 1e-6 && Math.abs(A[1] - B[1]) < 1e-6 && Math.abs(A[2] - B[2]) < 1e-6) m = b; }
    mir.push(m);
  }
  const pairs = [];
  for (let a = 0; a < nF; a++) for (let b = a + 1; b < nF; b++) pairs.push([a, b]);
  const pack = (map) => {
    const I = new Int32Array(pairs.length), J = new Int32Array(pairs.length), R = new Float64Array(pairs.length);
    pairs.forEach(([a, b], q) => {
      const A = K.body[map[a]], B = K.body[map[b]];
      I[q] = K.frame[map[a]]; J[q] = K.frame[map[b]]; R[q] = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
    });
    return { I, J, R };
  };
  K.rigid = [pack(K.frame.map((_, a) => a)), pack(mir)];
  K.basis = def.basis.map((nm) => K.idx[nm]);
  const b = def.basis.map((nm) => def.pts[nm]);
  const e = [0, 1, 2].map((k) => [b[k + 1][0] - b[0][0], b[k + 1][1] - b[0][1], b[k + 1][2] - b[0][2]]);
  const det3 = (c0, c1, c2) => c0[0] * (c1[1] * c2[2] - c1[2] * c2[1]) - c1[0] * (c0[1] * c2[2] - c0[2] * c2[1]) + c2[0] * (c0[1] * c1[2] - c0[2] * c1[1]);
  const D = det3(e[0], e[1], e[2]);
  /* a body position as weights on the four basis particles (sum 1) */
  K.emb = (q) => {
    const d = [q[0] - b[0][0], q[1] - b[0][1], q[2] - b[0][2]];
    const l1 = det3(d, e[1], e[2]) / D, l2 = det3(e[0], d, e[2]) / D, l3 = det3(e[0], e[1], d) / D;
    return [1 - l1 - l2 - l3, l1, l2, l3];
  };
  K.area = 0;
  for (const [tri, scale] of def.sails) {
    const vs = tri.map((v) => (typeof v === 'string' ? def.pts[v] : v));
    const c = new Float64Array(12), cc = new Float64Array(4);
    for (let v = 0; v < 3; v++) { const w = K.emb(vs[v]); for (let j = 0; j < 4; j++) { c[4 * v + j] = w[j]; cc[j] += w[j] / 3; } }
    const sub = SUBP.map((lam) => { const w = new Float64Array(4); for (let v = 0; v < 3; v++) for (let j = 0; j < 4; j++) w[j] += lam[v] * c[4 * v + j]; return w; });
    const cx = vs.reduce((t, v) => t + v[0], 0) / 3;
    K.S.push({ c, cc, sub, scale, verts: vs, side: Math.abs(cx) < 1e-6 ? 0 : Math.sign(cx) });
  }
  const e0 = K.emb([0, 0, 0]), e1 = K.emb([1, 0, 0]), e2 = K.emb([0, 1, 0]);
  K.ex = e1.map((v, j) => v - e0[j]); K.ey = e2.map((v, j) => v - e0[j]);   // body x and y axes from the basis
  K.area = def.area;
  K.bridle = def.bridle.map((nm) => K.idx[nm]);
  K.mass = K.frame.reduce((s, i) => s + P.m[i], 0);
  K.noseI = def.nose.map((nm) => K.idx[nm]); K.footI = def.foot.map((nm) => K.idx[nm]);
  return K;
}
/* a body position in the world now */
function bodyToWorld(W, q, out) {
  const K = W.kite, w = K.emb(q), x = W.ph.x;
  out[0] = out[1] = out[2] = 0;
  for (let j = 0; j < 4; j++) { const i3 = 3 * K.basis[j]; out[0] += w[j] * x[i3]; out[1] += w[j] * x[i3 + 1]; out[2] += w[j] * x[i3 + 2]; }
  return out;
}

/* ================================================================== LINES AND TAILS */
const NLINE = 24;
function buildLine(W, hand, end, L, li, lin, dia) {
  const P = W.ph, x = P.x, parts = [hand];
  for (let k = 1; k < NLINE; k++) {
    const t = k / NLINE;
    const px = x[3 * hand] + (x[3 * end] - x[3 * hand]) * t, pz = x[3 * hand + 2] + (x[3 * end + 2] - x[3 * hand + 2]) * t;
    const py = Math.max(0.01, x[3 * hand + 1] + (x[3 * end + 1] - x[3 * hand + 1]) * t - 0.4 * Math.sin(Math.PI * t));
    parts.push(P.add(px, py, pz, lin * L / NLINE, 0.006, 0.5, 1));
  }
  parts.push(end);
  const seg = [], lra = [];
  for (let k = NLINE - 1; k >= 0; k--) seg.push(P.link(parts[k], parts[k + 1], L / NLINE, 1, k === 0 ? li : -1));
  for (let k = 1; k <= NLINE; k++) lra.push(P.link(hand, parts[k], k * L / NLINE, 2, li));
  return { parts, seg, lra, L, lin, dia, li, F: [0, 0, 0], T: 0, Ts: 0, EA: dia < 0.001 ? 10000 : 3000 };
}
/* kite line stretches: EA (N) is the pull that would double its length
   (about 3000 for one Dacron line, 10000 for each Dyneema stunt line), so a
   20 N pull stretches 30 m of Dacron by 20 cm. Without it a tug on a kite
   held fast in a tree met an immovable line and the pull read thousands */
function setLineLength(W, ln, L) {
  const P = W.ph;
  ln.L = L;
  const s = L / NLINE;
  for (let q = 0; q < ln.seg.length; q++) { P.CR[ln.seg[q]] = s; P.CA[ln.seg[q]] = s / ln.EA; }
  for (let k = 0; k < ln.lra.length; k++) { P.CR[ln.lra[k]] = (k + 1) * s; P.CA[ln.lra[k]] = (k + 1) * s / ln.EA; }
  for (let k = 1; k < NLINE; k++) P.setMass(ln.parts[k], ln.lin * s);
}
function buildTail(W, K, def) {
  const P = W.ph, at = K.idx[def.at], parts = [at], seg = def.len / def.n, x = P.x;
  for (let k = 1; k <= def.n; k++) parts.push(P.add(x[3 * at], x[3 * at + 1], x[3 * at + 2] - k * seg, def.mass / def.n, 0.02, 0.5, 2));
  for (let k = 1; k <= def.n; k++) P.link(parts[k - 1], parts[k], seg, 1, -1);
  return { def, parts, seg };
}
/* the centipede: its head is the kite's one frame particle (the line ties
   on there), the discs follow on the backbone, laid out downwind */
function buildTrainKite(W, def) {
  const P = W.ph, T = def.train;
  const H = P.add(0, 0, 0, T.headM, T.head / 2, 0.6, 0);
  const none = { I: new Int32Array(0), J: new Int32Array(0), R: new Float64Array(0) };
  return { def, idx: { H }, frame: [H], body: [[0, 0, 0]], S: [], bridle: [H], basis: null, rigid: [none, none],
           noseI: [H], footI: [H], mass: T.headM + T.n * T.m, area: Math.PI / 4 * (T.head * T.head + T.n * T.d * T.d), train: true,
           emb: () => [1, 0, 0, 0] };
}
function buildTrain(W, K, T) {
  const P = W.ph, H = K.idx.H, parts = [H], x = P.x;
  for (let k = 1; k <= T.n; k++) parts.push(P.add(x[3 * H], x[3 * H + 1], x[3 * H + 2] - k * T.gap, T.m, 0.05, 0.5, 2));
  for (let k = 1; k <= T.n; k++) P.link(parts[k - 1], parts[k], T.gap, 1, -1);
  K.footI = [parts[1]];
  return { def: { n: T.n, at: 'H' }, train: T, parts, seg: T.gap, nrm: new Float64Array(3 * (T.n + 1)) };
}

/* ================================================================== THE FLYER
   yaw: the direction faced, (cos yaw, 0, sin yaw); right = (-sin, 0, cos). */
function Person(W, x, z, yaw) {
  this.W = W; this.x = x; this.z = z; this.yaw = yaw; this.vx = 0; this.vz = 0;
  this.gx = 0; this.gz = 0; this.face = yaw; this.phase = 0; this.speed = 0; this.fwd = 0;
  this.crouch = 0; this.crouchGoal = 0; this.raise = 0; this.raiseGoal = 0; this.pump = 0; this.pumpGoal = 0;
  this.steer = 0; this.steerGoal = 0; this.power = 0; this.powerGoal = 0; this.rest = 0; this.restGoal = 0;
  this.lean = 0; this.wind = 0; this.walked = 0;
  this.hands = [[x, 1.1, z], [x, 1.1, z]];
  this.look = [x + 10, 10, z];
  this.accel = 3.2;
}
const ease = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
/* the body's frame, shared with the drawing so the drawn hands meet the
   line: pelvis height (lower in a crouch), the trunk tipped back by the lean
   and forward by a crouch, the neck at its top, shoulders 19 cm either side */
Person.prototype.body = function () {
  const fx = Math.cos(this.yaw), fz = Math.sin(this.yaw), rx = -fz, rz = fx;
  const pelvis = [this.x, 0.95 - 0.42 * this.crouch, this.z];
  const ang = this.lean - 0.55 * this.crouch, sa = Math.sin(ang), ca = Math.cos(ang);
  const td = [-fx * sa, ca, -fz * sa];
  const neck = [pelvis[0] + td[0] * 0.5, pelvis[1] + td[1] * 0.5, pelvis[2] + td[2] * 0.5];
  const sh = (side) => [neck[0] - td[0] * 0.05 + rx * 0.19 * side, neck[1] - td[1] * 0.05, neck[2] - td[2] * 0.05 + rz * 0.19 * side];
  return { f: [fx, 0, fz], r: [rx, 0, rz], pelvis, td, neck, shL: sh(-1), shR: sh(1) };
};
Person.prototype.update = function (dt) {
  const W = this.W;
  const dvx = this.gx - this.vx, dvz = this.gz - this.vz, dv = Math.hypot(dvx, dvz), a = this.accel * dt;
  if (dv > a) { this.vx += dvx / dv * a; this.vz += dvz / dv * a; } else { this.vx = this.gx; this.vz = this.gz; }
  this.x += this.vx * dt; this.z += this.vz * dt;
  const dy = wrap(this.face - this.yaw), turn = 3.0 * dt;
  this.yaw = wrap(this.yaw + clamp(dy, -turn, turn));
  const fx = Math.cos(this.yaw), fz = Math.sin(this.yaw), rx = -fz, rz = fx;
  this.speed = Math.hypot(this.vx, this.vz); this.fwd = this.vx * fx + this.vz * fz;
  this.walked += this.speed * dt;
  const cad = this.speed < 0.05 ? 0 : 1.5 + 0.45 * Math.min(4.5, this.speed);          // steps a second
  this.phase += cad * Math.PI * dt * (this.fwd < -0.1 ? -1 : 1);
  this.crouch = ease(this.crouch, this.crouchGoal, 5, dt); this.raise = ease(this.raise, this.raiseGoal, 4, dt);
  this.pump = ease(this.pump, this.pumpGoal, 9, dt); this.steer = ease(this.steer, this.steerGoal, 10, dt);
  this.power = ease(this.power, this.powerGoal, 8, dt); this.rest = ease(this.rest, this.restGoal, 2, dt);
  /* leaning into the pull, or into a run (before the hands: the shoulders
     move with the lean) */
  const Tl = W.lines.reduce((s, ln) => s + ln.Ts, 0);
  const goalLean = this.fwd > 1.8 ? -0.18 : clamp(Tl / 90, 0, 0.32) - 0.05 * Math.max(0, -this.fwd);
  this.lean = ease(this.lean, goalLean, 3, dt);
  /* the hands */
  const B0 = this.body();
  const K = W.kite, xs = W.ph.x;
  const hold = (side, fw, dn, inw) => [fx * fw - rx * inw * side, -dn, fz * fw - rz * inw * side];
  const clampReach = (S, h, max) => {
    const d = Math.hypot(h[0] - S[0], h[1] - S[1], h[2] - S[2]);
    if (d > max) for (let k = 0; k < 3; k++) h[k] = S[k] + (h[k] - S[k]) * max / d;
    return h;
  };
  const shoulder = (side) => (side > 0 ? B0.shR : B0.shL);
  const dirTo = (S, i) => {
    const dx = xs[3 * i] - S[0], dy = xs[3 * i + 1] - S[1], dz = xs[3 * i + 2] - S[2], d = Math.hypot(dx, dy, dz) || 1;
    return [dx / d, dy / d, dz / d];
  };
  if (W.lines.length === 1) {
    const S = shoulder(1), l = dirTo(S, W.lines[0].parts[Math.min(3, NLINE)]);
    const facing = Math.max(0, l[0] * fx + l[2] * fz);
    const aim = 0.35 + 0.65 * (1 - facing);                       // arm swings toward the line when it is behind
    const h0 = hold(1, 0.30, 0.24, 0.10);
    let rv = [0, 1, 2].map((k) => (1 - aim) * h0[k] + aim * l[k] * 0.48);
    rv = rv.map((v, k) => v - l[k] * 0.36 * this.pump - (k === 1 ? 0.12 * this.pump : 0));
    const up = [fx * 0.16, 0.54, fz * 0.16];
    rv = rv.map((v, k) => v + (up[k] - v) * this.raise);
    const low = [fx * 0.42, -0.95, fz * 0.42];
    rv = rv.map((v, k) => v + (low[k] - v) * this.crouch * 0.6);
    const dn = [rx * 0.10 + fx * 0.12, -0.42, rz * 0.10 + fz * 0.12];
    rv = rv.map((v, k) => v + (dn[k] - v) * this.rest);
    const hR = clampReach(S, [S[0] + rv[0], S[1] + rv[1], S[2] + rv[2]], 0.56);
    this.hands[1] = hR;
    /* the other hand rides the line just ahead, or helps hold the kite up */
    const SL = shoulder(-1);
    let hL = [hR[0] + l[0] * 0.16 - rx * 0.07, hR[1] + l[1] * 0.16 + 0.02, hR[2] + l[2] * 0.16 - rz * 0.07];
    if (this.raise > 0.01 || this.crouch > 0.01) {
      const k = Math.max(this.raise, this.crouch);
      const hL2 = [SL[0] + rv[0] + rx * 0.08, SL[1] + rv[1], SL[2] + rv[2] + rz * 0.08];
      hL = hL.map((v, j) => v + (hL2[j] - v) * k);
    }
    this.hands[0] = clampReach(SL, hL, 0.56);
  } else {
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1, S = shoulder(side), l = dirTo(S, W.lines[s].parts[Math.min(3, NLINE)]);
      const h0 = hold(side, 0.34, 0.40, -0.06);
      const back = (side > 0 ? 1 : -1) * this.steer / 2 + this.power;     // + pulls this hand back
      const h = [S[0] + h0[0] - l[0] * back, S[1] + h0[1] - l[1] * back, S[2] + h0[2] - l[2] * back];
      const up = [S[0] + fx * 0.16, S[1] + 0.54, S[2] + fz * 0.16];
      for (let k = 0; k < 3; k++) h[k] += (up[k] - h[k]) * this.raise;
      const low = [S[0] + fx * 0.42, S[1] - 0.95, S[2] + fz * 0.42];
      for (let k = 0; k < 3; k++) h[k] += (low[k] - h[k]) * this.crouch * 0.6;
      this.hands[s] = clampReach(S, h, 0.57);
    }
  }
  const kc = W.info;
  if (kc) { this.look[0] = kc.cx; this.look[1] = kc.cy; this.look[2] = kc.cz; }
  if (W.tree && W.ai && W.ai.state === 'giveup') { this.look[0] = W.tree.x; this.look[1] = W.tree.top * 0.7; this.look[2] = W.tree.z; }
};

/* ================================================================== THE WORLD */
function World(o) {
  const r = this.r = mulberry32((o.seed >>> 0) || 1);
  this.o = o; this.t = 0; this.tmp = [0, 0, 0];
  this.def = scaleDef(KITES[o.kite]);
  this.dir = o.dir || 0;
  this.wind = new Wind(r, { U0: o.U0, dir: this.dir, gusty: o.gusty, bias: o.bias, limit: o.limit, calm0: o.calm0,
                            lullGap: o.lullGap, gustGap: o.gustGap, shiftGap: o.shiftGap });
  this.ph = new Phys(1024);
  this.tree = o.tree || null;
  /* in some tree scenes the tree gets its chance: the diamond meets a lull
     while it is over the tree, the two-line pilot is careless near it */
  this.fate = !!(this.tree && o.fate); this.fateUsed = false; this.fateShift = false; this.fateT = 30 + 20 * r();
  this.snags = [];
  this.lines = [];
  this.person = new Person(this, 0, 0, this.dir);
  const nh = this.def.lines;
  this.handI = [];
  for (let h = 0; h < nh; h++) { const i = this.ph.add(0, 1.1, 0, 0, 0.01, 0, 1); this.ph.kin[i] = 1; this.handI.push(i); }
  this.kite = this.def.train ? buildTrainKite(this, this.def) : buildKite(this, this.def);
  this.tail = this.def.train ? buildTrain(this, this.kite, this.def.train) : this.def.tail ? buildTail(this, this.kite, this.def.tail) : null;
  this.L0 = o.launchL || 18;
  this.held = false;
  this.placeKite('propped', this.L0);
  for (let h = 0; h < nh; h++) {
    const ex = this.ph.x, b = this.kite.bridle[h], hd = this.handI[h];
    const d = Math.hypot(ex[3 * b] - ex[3 * hd], ex[3 * b + 1] - ex[3 * hd + 1], ex[3 * b + 2] - ex[3 * hd + 2]);
    this.lines.push(buildLine(this, hd, b, nh === 2 ? o.lineL : d + 0.3, h, nh === 2 ? 0.0004 : 0.0006, nh === 2 ? 0.0009 : 0.0012));
  }
  this.ph.seal();
  for (const ln of this.lines) setLineLength(this, ln, ln.L);       // rest lengths and stretch
  this.info = null;
  this.person.update(0);
  this.syncHands(true);
  this.measure(DT);
  this.ai = nh === 2 ? new PilotAI(this, o) : new FlyerAI(this, o);
  /* wind cache: one entry per sail, line segment and tail segment */
  this.nEl = 4 * this.kite.S.length + nh * NLINE + (this.tail ? this.tail.def.n + (this.tail.train ? 1 : 0) : 0);
  this.wc = new Float64Array(3 * this.nEl);
}
/* put the kite somewhere: 'propped' = standing on its foot at distance d
   downwind of the flyer; 'held' = up in front of the flyer's hands. Either
   way its face (the bridle side) is to the flyer and its nose tips a little
   toward the flyer, as a flying kite's does: the wind then pushes it up
   and away, where a kite leaning back would be pressed onto the grass. */
World.prototype.kitePose = function (kind, d, out) {
  const ex = this.wind.ex, ez = this.wind.ez, P = this.person;
  const lean = kind === 'held' ? 20 * DEG : 8 * DEG;
  const Y = [-Math.sin(lean) * ex, Math.cos(lean), -Math.sin(lean) * ez];
  const Z = [-Math.cos(lean) * ex, -Math.sin(lean), -Math.cos(lean) * ez];
  const X = [Y[1] * Z[2] - Y[2] * Z[1], Y[2] * Z[0] - Y[0] * Z[2], Y[0] * Z[1] - Y[1] * Z[0]];
  let o;
  if (kind === 'held') {
    const h = P.hands[1];
    o = [h[0] + ex * 0.35, h[1] + 0.05, h[2] + ez * 0.35];
  } else o = [P.x + ex * d, 0, P.z + ez * d];
  const K = this.kite;
  let minY = 1e9;
  for (let k = 0; k < K.frame.length; k++) {
    const [bx, by, bz] = K.body[k];
    const y = o[1] + bx * X[1] + by * Y[1] + bz * Z[1];
    minY = Math.min(minY, y);
  }
  if (kind !== 'held') o[1] += (K.train ? this.ph.rad[K.frame[0]] : 0.025) - minY;   // the centipede's head stands on its rim
  for (let k = 0; k < K.frame.length; k++) {
    const [bx, by, bz] = K.body[k];
    out[3 * k] = o[0] + bx * X[0] + by * Y[0] + bz * Z[0];
    out[3 * k + 1] = o[1] + bx * X[1] + by * Y[1] + bz * Z[1];
    out[3 * k + 2] = o[2] + bx * X[2] + by * Y[2] + bz * Z[2];
  }
  return out;
};
/* a propped kite leans on a tuft of grass (held still) until the flyer's
   pull starts; then it is the wind's */
World.prototype.placeKite = function (kind, d) {
  const K = this.kite, P = this.ph, pose = this.kitePose(kind, d, new Float64Array(3 * K.frame.length));
  for (let k = 0; k < K.frame.length; k++) {
    const i3 = 3 * K.frame[k];
    for (let c = 0; c < 3; c++) { P.x[i3 + c] = P.p[i3 + c] = P.kf[i3 + c] = P.kt[i3 + c] = pose[3 * k + c]; P.v[i3 + c] = 0; }
  }
  if (kind === 'propped') this.prop(true);
  if (this.tail) {                                   // the tail laid out downwind along the ground
    const at = K.idx[this.tail.def.at], ex = this.wind.ex, ez = this.wind.ez;
    for (let k = 1; k < this.tail.parts.length; k++) {
      const i3 = 3 * this.tail.parts[k];
      P.x[i3] = P.p[i3] = P.x[3 * at] + ex * k * this.tail.seg * 0.97;
      P.x[i3 + 1] = P.p[i3 + 1] = 0.02;
      P.x[i3 + 2] = P.p[i3 + 2] = P.x[3 * at + 2] + ez * k * this.tail.seg * 0.97;
      P.v[i3] = P.v[i3 + 1] = P.v[i3 + 2] = 0;
    }
  }
};
/* the flyer picks the kite up (it then moves with the hands) or lets it go */
World.prototype.holdKite = function (on) {
  const K = this.kite, P = this.ph;
  this.held = on; this.propped = false;
  for (const i of K.frame) { P.kin[i] = on ? 1 : 0; P.w[i] = on ? 0 : 1 / P.m[i]; }
  if (on) this.releaseSnags();
};
World.prototype.prop = function (on) {
  const K = this.kite, P = this.ph;
  this.propped = on;
  for (const i of K.frame) { P.kin[i] = on ? 1 : 0; P.w[i] = on ? 0 : 1 / P.m[i]; }
};
World.prototype.releaseSnags = function () { for (const s of this.snags) this.ph.noSnag[s.i] = this.t + 3; this.snags = []; };
/* kinematic targets for this frame: the hands, and the kite if held */
World.prototype.syncHands = function (jump) {
  const P = this.ph, pr = this.person;
  const set = (i, x, y, z) => {
    const i3 = 3 * i;
    P.kf[i3] = jump ? x : P.x[i3]; P.kf[i3 + 1] = jump ? y : P.x[i3 + 1]; P.kf[i3 + 2] = jump ? z : P.x[i3 + 2];
    P.kt[i3] = x; P.kt[i3 + 1] = y; P.kt[i3 + 2] = z;
    if (jump) { P.x[i3] = P.p[i3] = x; P.x[i3 + 1] = P.p[i3 + 1] = y; P.x[i3 + 2] = P.p[i3 + 2] = z; }
  };
  const nh = this.handI.length;
  for (let h = 0; h < nh; h++) { const hd = pr.hands[nh === 2 ? h : 1]; set(this.handI[h], hd[0], hd[1], hd[2]); }
  if (this.held && !this.propped) {
    const K = this.kite, pose = this.kitePose('held', 0, this.poseBuf || (this.poseBuf = new Float64Array(3 * K.frame.length)));
    for (let k = 0; k < K.frame.length; k++) set(K.frame[k], pose[3 * k], pose[3 * k + 1], pose[3 * k + 2]);
  }
};

World.prototype.step = function (dt) {
  dt = dt || DT;
  this.t += dt;
  if (this.fate && !this.fateUsed && this.def.lines === 1 && this.info) {
    const I = this.info, T = this.tree, P = this.person;
    /* the wind swings round toward the tree, then dies while the kite is over it */
    if (!this.fateShift && this.t > this.fateT) {
      this.fateShift = true;
      this.wind.force('shift', { to: Math.atan2(T.z - P.z, T.x - P.x) - this.wind.th0, dur: 14 });
    }
    /* ...and dies when the tree stands between the flyer and the kite */
    const bk = Math.atan2(I.cz - P.z, I.cx - P.x), bt = Math.atan2(T.z - P.z, T.x - P.x);
    if (this.fateShift && Math.abs(wrap(bk - bt)) < Math.atan2(T.R * 0.5, Math.hypot(T.x - P.x, T.z - P.z)) && Math.hypot(I.cx - P.x, I.cz - P.z) > Math.hypot(T.x - P.x, T.z - P.z) - 2) {
      this.wind.force('lull', { depth: 0.92, hold: 16, up: 2.5 }); this.fateUsed = true;
    }
  }
  this.wind.step(dt);
  this.ai.update(dt);
  this.person.update(dt);
  this.syncHands(false);
  this.cacheWind();
  for (const ln of this.lines) ln.F[0] = ln.F[1] = ln.F[2] = 0;
  for (const s of this.snags) s.acc = 0;
  const h = dt / NSUB;
  for (let s = 0; s < NSUB; s++) { this.sub = (this.sub || 0) + 1; this.substep(h, (s + 1) / NSUB); }
  this.measure(dt);
};

/* the wind at every sail, line segment and tail segment, once a frame */
World.prototype.cacheWind = function () {
  const K = this.kite, x = this.ph.x, wc = this.wc, o = this.tmp, wind = this.wind;
  let e = 0;
  const put = (px, py, pz) => {
    wind.at(px, py, pz, o);
    const sh = this.shelter(px, py, pz);
    wc[3 * e] = o[0] * sh; wc[3 * e + 1] = o[1] * sh; wc[3 * e + 2] = o[2] * sh; e++;
  };
  for (const S of K.S) for (let k = 0; k < 4; k++) {
    const cw = S.sub[k];
    let px = 0, py = 0, pz = 0;
    for (let j = 0; j < 4; j++) { const i3 = 3 * K.basis[j]; px += cw[j] * x[i3]; py += cw[j] * x[i3 + 1]; pz += cw[j] * x[i3 + 2]; }
    put(px, py, pz);
  }
  for (const ln of this.lines) for (let k = 0; k < NLINE; k++) {
    const a = 3 * ln.parts[k], b = 3 * ln.parts[k + 1];
    put((x[a] + x[b]) / 2, (x[a + 1] + x[b + 1]) / 2, (x[a + 2] + x[b + 2]) / 2);
  }
  if (this.tail && this.tail.train) for (const i of this.tail.parts) put(x[3 * i], x[3 * i + 1], x[3 * i + 2]);   // each disc, at itself
  else if (this.tail) for (let k = 0; k < this.tail.def.n; k++) {
    const a = 3 * this.tail.parts[k], b = 3 * this.tail.parts[k + 1];
    put((x[a] + x[b]) / 2, (x[a + 1] + x[b + 1]) / 2, (x[a + 2] + x[b + 2]) / 2);
  }
};
/* inside the tree's crown the wind is mostly broken up */
World.prototype.shelter = function (px, py, pz) {
  const T = this.tree;
  if (!T) return 1;
  let s = 1;
  for (const c of T.crown) {
    const d = Math.hypot(px - c.x, py - c.y, pz - c.z);
    if (d < c.r) s = Math.min(s, 0.25 + 0.75 * smooth((d - 0.6 * c.r) / (0.4 * c.r)));
  }
  return s;
};

World.prototype.aero = function () {
  const P = this.ph, x = P.x, v = P.v, f = P.f, K = this.kite, wc = this.wc;
  const sv = [0, 0, 0], wv = [0, 0, 0];
  let e = 0;
  /* the sails. Each panel is worked in four parts (its midpoint split),
     each with its own airflow, so a kite that pitches or rolls meets the
     air differently at its two ends: that is its aerodynamic damping.
     The centre-of-pressure travel is then added for the panel as a whole,
     as a couple, so the trim is the panel's own. */
  const SUB = SUBP;
  /* steering: on a two-line kite the side whose line is pulled shorter
     has its sail drawn back into the air, an airbrake on that wing; its
     drag swings the nose toward it (brake: extra drag coefficient per
     metre the hands differ) */
  const steer = this.def.lines === 2 ? this.person.steer : 0, brake = K.def.brake || 0;
  for (const S of K.S) {
    const c = S.c, B = K.basis;
    const pv = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let j = 0; j < 4; j++) {
      const i3 = 3 * B[j];
      for (let t = 0; t < 3; t++) { pv[3 * t] += c[4 * t + j] * x[i3]; pv[3 * t + 1] += c[4 * t + j] * x[i3 + 1]; pv[3 * t + 2] += c[4 * t + j] * x[i3 + 2]; }
    }
    const e1x = pv[3] - pv[0], e1y = pv[4] - pv[1], e1z = pv[5] - pv[2], e2x = pv[6] - pv[0], e2y = pv[7] - pv[1], e2z = pv[8] - pv[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const A2 = Math.hypot(nx, ny, nz);
    if (A2 < 1e-9) { e += 4; continue; }
    nx /= A2; ny /= A2; nz /= A2;
    const Aq = 0.125 * A2 * S.scale;                 // a quarter of the panel's area
    let sax = 0, say = 0, saz = 0, Fnt = 0;
    for (let k = 0; k < 4; k++, e++) {
      const lam = SUB[k], cw = S.sub[k];
      let vx = 0, vy = 0, vz = 0;
      for (let j = 0; j < 4; j++) { const i3 = 3 * B[j]; vx += cw[j] * v[i3]; vy += cw[j] * v[i3 + 1]; vz += cw[j] * v[i3 + 2]; }
      const ax = wc[3 * e] - vx, ay = wc[3 * e + 1] - vy, az = wc[3 * e + 2] - vz;
      sax += ax; say += ay; saz += az;
      const V2 = ax * ax + ay * ay + az * az;
      if (V2 < 1e-6) continue;
      const V = Math.sqrt(V2), vn = ax * nx + ay * ny + az * nz, alpha = Math.asin(Math.min(1, Math.abs(vn) / V));
      const q = 0.5 * RHO * V2;
      const Fn = q * Aq * K.def.cn * Math.tanh((K.def.cnk || 2) * alpha) * (vn >= 0 ? 1 : -1);
      Fnt += Fn;
      /* skin friction along the sail and the frame's drag along the air */
      const tx = ax - vn * nx, ty = ay - vn * ny, tz = az - vn * nz;
      const Ff = q * Aq * K.def.cf / V, Fd = q * Aq * ((K.def.cd0 || 0) + (S.side * steer > 0 ? brake * Math.abs(steer) : 0)) / V;
      const Fx = Fn * nx + Ff * tx + Fd * ax, Fy = Fn * ny + Ff * ty + Fd * ay, Fz = Fn * nz + Ff * tz + Fd * az;
      for (let j = 0; j < 4; j++) { const i3 = 3 * B[j], fr = cw[j]; f[i3] += Fx * fr; f[i3 + 1] += Fy * fr; f[i3 + 2] += Fz * fr; }
    }
    /* centre of pressure: on the panel's centroid when the air meets it
       square on, moving toward the leading edge by cpk of the chord as the
       angle of attack falls (a flat plate's quarter-chord at small angles) */
    const V = Math.hypot(sax, say, saz) / 4;
    if (V < 1e-3 || Fnt === 0) continue;
    const vn = (sax * nx + say * ny + saz * nz) / 4, sa = Math.min(1, Math.abs(vn) / V);
    const tx = sax / 4 - vn * nx, ty = say / 4 - vn * ny, tz = saz / 4 - vn * nz, tm = Math.hypot(tx, ty, tz);
    if (tm < 1e-6) continue;
    const ux = tx / tm, uy = ty / tm, uz = tz / tm;
    const s0 = pv[0] * ux + pv[1] * uy + pv[2] * uz, s1 = pv[3] * ux + pv[4] * uy + pv[5] * uz, s2 = pv[6] * ux + pv[7] * uy + pv[8] * uz;
    const sb = (s0 + s1 + s2) / 3, d0 = s0 - sb, d1 = s1 - sb, d2 = s2 - sb;
    const S2 = d0 * d0 + d1 * d1 + d2 * d2, dm = Math.max(Math.abs(d0), Math.abs(d1), Math.abs(d2));
    if (S2 < 1e-8) continue;
    const shift = -K.def.cpk * (1 - sa) * (Math.max(s0, s1, s2) - Math.min(s0, s1, s2));
    const kap = clamp(shift / S2, -1.5 / dm, 1.5 / dm);
    const w0 = kap * d0, w1 = kap * d1, w2 = kap * d2;            // a couple: these sum to zero
    for (let j = 0; j < 4; j++) {
      const fr = w0 * c[j] + w1 * c[4 + j] + w2 * c[8 + j], i3 = 3 * B[j];
      f[i3] += Fnt * nx * fr; f[i3 + 1] += Fnt * ny * fr; f[i3 + 2] += Fnt * nz * fr;
    }
  }
  /* sweep: a swept wing meeting the air a little from one side lifts its
     windward half more and drags it more, which turns the nose back into
     the airflow. Flat panels do not make that torque, so it is carried by
     an equivalent fin at the tail: a side force from the sideways airflow
     there (it damps turning too, since a turning tail sweeps sideways) */
  const fin = K.def.fin;
  if (fin) {
    const i3 = 3 * K.idx[fin.at], B = K.basis;
    const xv = [0, 0, 0], yv = [0, 0, 0];
    for (let j = 0; j < 4; j++) {
      const b3 = 3 * B[j];
      for (let c = 0; c < 3; c++) { xv[c] += K.ex[j] * x[b3 + c]; yv[c] += K.ey[j] * x[b3 + c]; }
    }
    const xl = Math.hypot(xv[0], xv[1], xv[2]) || 1;
    const ux = xv[0] / xl, uy = xv[1] / xl, uz = xv[2] / xl;
    const ax = wc[0] - v[i3], ay = wc[1] - v[i3 + 1], az = wc[2] - v[i3 + 2];
    const V2 = ax * ax + ay * ay + az * az, side = ax * ux + ay * uy + az * uz;
    const F = 0.5 * RHO * fin.area * 2 * Math.sqrt(V2) * side;          // 2 pi per radian of sideslip, small angles
    f[i3] += F * ux; f[i3 + 1] += F * uy; f[i3 + 2] += F * uz;
  }
  /* a swept sail resists turning in its own plane (each wing meets the air
     faster or slower as the kite yaws, and its induced drag follows);
     flat panels carry little of that, so it is added at the wing tips:
     a couple opposing the yaw rate, growing with airspeed */
  if (K.def.yawDamp && K.idx.L != null) {
    const iL = 3 * K.idx.L, iR = 3 * K.idx.R, iN = 3 * K.idx.N, iT = 3 * K.idx.T;
    let yx = x[iN] - x[iT], yy = x[iN + 1] - x[iT + 1], yz = x[iN + 2] - x[iT + 2];
    const yl = Math.hypot(yx, yy, yz) || 1; yx /= yl; yy /= yl; yz /= yl;
    const hs = 0.5 * Math.hypot(x[iR] - x[iL], x[iR + 1] - x[iL + 1], x[iR + 2] - x[iL + 2]);
    const om = ((v[iR] - v[iL]) * yx + (v[iR + 1] - v[iL + 1]) * yy + (v[iR + 2] - v[iL + 2]) * yz) / (2 * hs);
    const V = Math.hypot(wc[0] - v[iT], wc[1] - v[iT + 1], wc[2] - v[iT + 2]);
    const Fd = K.def.yawDamp * RHO * V * K.area * hs * om / 2;     // torque D om = 2 Fd hs, D = yawDamp rho V S hs^2
    f[iR] -= Fd * yx; f[iR + 1] -= Fd * yy; f[iR + 2] -= Fd * yz;
    f[iL] += Fd * yx; f[iL + 1] += Fd * yy; f[iL + 2] += Fd * yz;
  }
  /* the lines: cross-flow drag, a little skin friction along */
  for (const ln of this.lines) {
    const d = ln.dia;
    for (let k = 0; k < NLINE; k++, e++) this.ropeDrag(ln.parts[k], ln.parts[k + 1], e, d, 1.1, 0.01, 0);
  }
  /* tails */
  if (this.tail && this.tail.train) {
    /* the centipede's discs: each is a little kite its strings hold at
       `trim` deg to the air it meets, so the force on it is a flat plate's
       normal force at that angle: lift across the air (in the vertical
       plane through it), drag along it, plus the drag of its stick and
       feathers. A disc lying in the grass does not lift. */
    /* each disc also rocks a little on its balance stick, in waves that run
       down the body (pitch 5 deg, a slight sideways tilt), which is what
       gives a centipede its slow, snaking ripple */
    const T = this.tail, tr = T.train, tw = this.t;
    for (let k = 0; k <= tr.n; k++, e++) {
      const ph = 2 * Math.PI * (k / 9 - tw / 2.8);
      const al = (tr.trim + (k ? 5 * Math.sin(ph) : 0)) * DEG, ca = Math.cos(al), sa = Math.sin(al), cn = 1.1 * Math.tanh(2 * al), tilt = k ? 0.12 * Math.sin(ph * 0.7 + 1) : 0;
      const i3 = 3 * T.parts[k];
      const ax = wc[3 * e] - v[i3], ay = wc[3 * e + 1] - v[i3 + 1], az = wc[3 * e + 2] - v[i3 + 2], V2 = ax * ax + ay * ay + az * az;
      if (V2 < 1e-4) continue;
      const V = Math.sqrt(V2), wx = ax / V, wy = ay / V, wz = az / V;
      let lx = -wy * wx, ly = 1 - wy * wy, lz = -wy * wz, ll = Math.hypot(lx, ly, lz);
      if (ll < 0.05) { lx = 1; ly = 0; lz = 0; ll = 1; }
      lx /= ll; ly /= ll; lz /= ll;
      if (tilt) {                                    // lean the lift a little to one side
        const sx = wy * lz - wz * ly, sy = wz * lx - wx * lz, sz = wx * ly - wy * lx;
        lx += tilt * sx; ly += tilt * sy; lz += tilt * sz; const l2 = Math.hypot(lx, ly, lz); lx /= l2; ly /= l2; lz /= l2;
      }
      const d = k === 0 ? tr.head : tr.d, qA = 0.5 * RHO * V2 * Math.PI / 4 * d * d;
      const up = Math.min(1, Math.max(0, x[i3 + 1] - 0.05) / 0.5);
      const Fl = qA * cn * ca * up, Fd = qA * (cn * sa * up + tr.cdx);
      f[i3] += Fl * lx + Fd * wx; f[i3 + 1] += Fl * ly + Fd * wy; f[i3 + 2] += Fl * lz + Fd * wz;
      T.nrm[3 * k] = ca * lx + sa * wx; T.nrm[3 * k + 1] = ca * ly + sa * wy; T.nrm[3 * k + 2] = ca * lz + sa * wz;
    }
  } else if (this.tail) {
    const T = this.tail;
    for (let k = 0; k < T.def.n; k++, e++) this.ropeDrag(T.parts[k], T.parts[k + 1], e, 0, 0, 0, T.def.cda);
  }
  /* foliage: anything inside the crown is slowed hard */
  if (this.tree) for (let i = 0; i < P.n; i++) if (P.crown[i] && P.w[i] > 0) {
    const i3 = 3 * i, k = 6 * P.m[i];
    f[i3] -= k * v[i3]; f[i3 + 1] -= k * v[i3 + 1]; f[i3 + 2] -= k * v[i3 + 2];
  }
};
/* drag on one rope segment: cross-flow cd*dia, skin friction cf*pi*dia
   along it, or (flapping ribbon) an all-round cda per metre */
World.prototype.ropeDrag = function (i, j, e, dia, cd, cf, cda) {
  const P = this.ph, x = P.x, v = P.v, f = P.f, wc = this.wc;
  const a = 3 * i, b = 3 * j;
  let sx = x[b] - x[a], sy = x[b + 1] - x[a + 1], sz = x[b + 2] - x[a + 2];
  const len = Math.hypot(sx, sy, sz);
  if (len < 1e-6) return;
  sx /= len; sy /= len; sz /= len;
  const rx = wc[3 * e] - 0.5 * (v[a] + v[b]), ry = wc[3 * e + 1] - 0.5 * (v[a + 1] + v[b + 1]), rz = wc[3 * e + 2] - 0.5 * (v[a + 2] + v[b + 2]);
  let Fx, Fy, Fz;
  if (cda > 0) {
    const V = Math.hypot(rx, ry, rz), k = 0.5 * RHO * cda * len * V;
    Fx = k * rx; Fy = k * ry; Fz = k * rz;
  } else {
    const vt = rx * sx + ry * sy + rz * sz, nx = rx - vt * sx, ny = ry - vt * sy, nz = rz - vt * sz, vn = Math.hypot(nx, ny, nz);
    const kn = 0.5 * RHO * dia * cd * len * vn, kt = 0.5 * RHO * Math.PI * dia * cf * len * Math.abs(vt);
    Fx = kn * nx + kt * vt * sx; Fy = kn * ny + kt * vt * sy; Fz = kn * nz + kt * vt * sz;
  }
  f[a] += 0.5 * Fx; f[a + 1] += 0.5 * Fy; f[a + 2] += 0.5 * Fz;
  f[b] += 0.5 * Fx; f[b + 1] += 0.5 * Fy; f[b + 2] += 0.5 * Fz;
};

World.prototype.substep = function (h, frac) {
  const P = this.ph, n = P.n, x = P.x, p = P.p, v = P.v, f = P.f, w = P.w, m = P.m;
  f.fill(0, 0, 3 * n);
  for (let i = 0; i < n; i++) if (w[i] > 0) f[3 * i + 1] -= m[i] * G;
  this.aero();
  for (let i = 0; i < n; i++) {
    const i3 = 3 * i;
    p[i3] = x[i3]; p[i3 + 1] = x[i3 + 1]; p[i3 + 2] = x[i3 + 2];
    if (P.kin[i]) {
      x[i3] = P.kf[i3] + (P.kt[i3] - P.kf[i3]) * frac;
      x[i3 + 1] = P.kf[i3 + 1] + (P.kt[i3 + 1] - P.kf[i3 + 1]) * frac;
      x[i3 + 2] = P.kf[i3 + 2] + (P.kt[i3 + 2] - P.kf[i3 + 2]) * frac;
    } else if (w[i] > 0) {
      const hw = h * w[i];
      v[i3] += hw * f[i3]; v[i3 + 1] += hw * f[i3 + 1]; v[i3 + 2] += hw * f[i3 + 2];
      x[i3] += h * v[i3]; x[i3 + 1] += h * v[i3 + 1]; x[i3 + 2] += h * v[i3 + 2];
    }
    P.dn[i] = 0; P.gr[i] = 0;
  }
  const ih2 = 1 / (h * h);
  for (let it = 0; it < ITER; it++) { this.solve(ih2, it & 1); this.collide(h); }
  this.friction();
  const ih = 1 / h;
  for (let i = 0; i < n; i++) {
    const i3 = 3 * i;
    v[i3] = (x[i3] - p[i3]) * ih; v[i3 + 1] = (x[i3 + 1] - p[i3 + 1]) * ih; v[i3 + 2] = (x[i3 + 2] - p[i3 + 2]) * ih;
  }
};
World.prototype.solveFrame = function () {
  const P = this.ph, x = P.x, w = P.w, F = this.kite.rigid[this.sub & 1], n = F.I.length;
  for (let q = 0; q < n; q++) {
    const i = F.I[q], j = F.J[q], a = 3 * i, b = 3 * j;
    const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz), wi = w[i], wj = w[j], ws = wi + wj;
    if (ws === 0 || d < 1e-9) continue;
    const s = (d - F.R[q]) / (ws * d);
    x[a] += wi * s * dx; x[a + 1] += wi * s * dy; x[a + 2] += wi * s * dz;
    x[b] -= wj * s * dx; x[b + 1] -= wj * s * dy; x[b + 2] -= wj * s * dz;
  }
};
World.prototype.solve = function (ih2, rev) {
  this.solveFrame();
  const P = this.ph, x = P.x, w = P.w, CI = P.CI, CJ = P.CJ, CR = P.CR, CK = P.CK, CL = P.CL, nc = P.nc;
  for (let qq = 0; qq < nc; qq++) {
    const q = rev ? nc - 1 - qq : qq;
    const i = CI[q], j = CJ[q], a = 3 * i, b = 3 * j;
    const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz), kind = CK[q];
    const C = d - CR[q];
    if (kind !== 0 && C <= 0) continue;
    const wi = kind === 2 ? 0 : w[i], wj = w[j], ws = wi + wj;
    if (ws === 0 || d < 1e-9) continue;
    const lam = C / (ws + P.CA[q] * ih2), s = lam / d;      // a stretchy line gives a little instead of pulling without limit
    if (wi) { x[a] += wi * s * dx; x[a + 1] += wi * s * dy; x[a + 2] += wi * s * dz; }
    x[b] -= wj * s * dx; x[b + 1] -= wj * s * dy; x[b + 2] -= wj * s * dz;
    const li = CL[q];
    if (li >= 0) { const F = this.lines[li].F, k = lam * ih2 / d; F[0] += k * dx; F[1] += k * dy; F[2] += k * dz; }
  }
  /* snags hold a point of the kite or tail inside the tree */
  for (const sn of this.snags) {
    const a = 3 * sn.i, dx = sn.x - x[a], dy = sn.y - x[a + 1], dz = sn.z - x[a + 2], d = Math.hypot(dx, dy, dz);
    if (d > 0.03 && w[sn.i] > 0) {
      const c = (d - 0.03) / d;
      x[a] += dx * c; x[a + 1] += dy * c; x[a + 2] += dz * c;
      sn.acc += (d - 0.03) * P.m[sn.i] * ih2;
    }
  }
};
World.prototype.collide = function (h) {
  const P = this.ph, x = P.x, n = P.n, T = this.tree;
  for (let i = 0; i < n; i++) {
    if (P.w[i] === 0) continue;
    const i3 = 3 * i, r = P.rad[i];
    if (x[i3 + 1] < r) { P.dn[i] += r - x[i3 + 1]; x[i3 + 1] = r; P.gr[i] = 1; }
  }
  if (!T) return;
  for (let i = 0; i < n; i++) {
    if (P.w[i] === 0) { P.crown[i] = 0; continue; }
    const i3 = 3 * i;
    /* the trunk: a post nothing passes through */
    if (x[i3 + 1] < T.trunkH) {
      const dx = x[i3] - T.x, dz = x[i3 + 2] - T.z, d = Math.hypot(dx, dz), rr = T.trunkR + 0.02;
      if (d < rr && d > 1e-6) { x[i3] = T.x + dx / d * rr; x[i3 + 2] = T.z + dz / d * rr; }
    }
    if (Math.hypot(x[i3] - T.x, x[i3 + 1] - T.cy, x[i3 + 2] - T.z) > T.R) { P.crown[i] = 0; continue; }
    let inside = 0;
    for (const c of T.crown) {
      const dx = x[i3] - c.x, dy = x[i3 + 1] - c.y, dz = x[i3 + 2] - c.z, d = Math.hypot(dx, dy, dz);
      if (d >= c.r) continue;
      inside = 1;
      if (P.cat[i] === 1) {                              // line: drapes over the twigs
        const k = (c.r * 0.9 - d) > 0 ? (c.r * 0.9) / Math.max(d, 1e-6) : 1;
        if (k > 1) { x[i3] = c.x + dx * k; x[i3 + 1] = c.y + dy * k; x[i3 + 2] = c.z + dz * k; }
      } else if (d < c.r * 0.88 && this.t > P.noSnag[i] && !this.snags.some((s) => s.i === i)) {
        const strong = this.r() < 0.35;
        this.snags.push({ i, x: x[i3], y: x[i3 + 1], z: x[i3 + 2], str: strong ? 250 : 4 + 14 * this.r(), acc: 0 });
      }
    }
    P.crown[i] = inside;
  }
};
World.prototype.friction = function () {
  const P = this.ph, x = P.x, p = P.p, n = P.n;
  for (let i = 0; i < n; i++) {
    if (!P.gr[i]) continue;
    const i3 = 3 * i, dx = x[i3] - p[i3], dz = x[i3 + 2] - p[i3 + 2], dt = Math.hypot(dx, dz), lim = P.mu[i] * P.dn[i];
    if (dt <= lim) { x[i3] = p[i3]; x[i3 + 2] = p[i3 + 2]; }
    else { const k = 1 - lim / dt; x[i3] = p[i3] + dx * k; x[i3 + 2] = p[i3 + 2] + dz * k; }
  }
};

/* the numbers the flyer and the card look at */
World.prototype.measure = function (dt) {
  const P = this.ph, x = P.x, v = P.v, K = this.kite;
  for (const ln of this.lines) {
    const T = Math.hypot(ln.F[0], ln.F[1], ln.F[2]) / NSUB;
    ln.T = T; ln.Ts += (T - ln.Ts) * (1 - Math.exp(-dt / 0.25));
  }
  /* snags give way when pulled harder than they hold */
  if (this.snags.length) {
    const keep = [];
    for (const s of this.snags) {
      if (s.acc / NSUB > s.str) P.noSnag[s.i] = this.t + 2.5; else keep.push(s);
    }
    this.snags = keep;
  }
  let cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0, minY = 1e9;
  for (const i of K.frame) {
    cx += x[3 * i]; cy += x[3 * i + 1]; cz += x[3 * i + 2]; vx += v[3 * i]; vy += v[3 * i + 1]; vz += v[3 * i + 2];
    minY = Math.min(minY, x[3 * i + 1] - (K.train ? P.rad[i] : 0));
  }
  const nf = K.frame.length;
  cx /= nf; cy /= nf; cz /= nf; vx /= nf; vy /= nf; vz /= nf;
  const avg = (I) => { const o = [0, 0, 0]; for (const i of I) for (let c = 0; c < 3; c++) o[c] += x[3 * i + c] / I.length; return o; };
  const nose = avg(K.noseI), foot = avg(K.footI);
  let ny = [nose[0] - foot[0], nose[1] - foot[1], nose[2] - foot[2]];
  const nl = Math.hypot(ny[0], ny[1], ny[2]) || 1; ny = ny.map((c) => c / nl);
  let hx = 0, hy = 0, hz = 0;
  for (const i of this.handI) { hx += x[3 * i] / this.handI.length; hy += x[3 * i + 1] / this.handI.length; hz += x[3 * i + 2] / this.handI.length; }
  const rx = cx - hx, ry = cy - hy, rz = cz - hz, D = Math.hypot(rx, ry, rz) || 1;
  const wind = this.wind, ex = wind.ex, ez = wind.ez;
  const beta = Math.asin(clamp(ry / D, -1, 1));
  const phi = Math.atan2(rx * -ez + rz * ex, rx * ex + rz * ez);
  /* the nose's heading as the flyer sees it on the wind window: 0 up, + to the right */
  const rhx = rx / D, rhy = ry / D, rhz = rz / D;
  let ux = -rhy * rhx, uy = 1 - rhy * rhy, uz = -rhy * rhz;
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  let Rx = rhy * uz - rhz * uy, Ry = rhz * ux - rhx * uz, Rz = rhx * uy - rhy * ux;
  const Rl = Math.hypot(Rx, Ry, Rz) || 1; Rx /= Rl; Ry /= Rl; Rz /= Rl;
  const psi = Math.atan2(ny[0] * Rx + ny[1] * Ry + ny[2] * Rz, ny[0] * ux + ny[1] * uy + ny[2] * uz);
  const I = this.info || { downT: 0, beta: beta, psi: psi };
  const dbeta = (beta - I.beta) / dt, dpsi = wrap(psi - I.psi) / dt;
  const o = this.tmp; wind.at(cx, cy, cz, o);
  const air = Math.hypot(o[0] - vx, o[1] - vy, o[2] - vz);
  const speed = Math.hypot(vx, vy, vz);
  const onGround = minY < 0.1 && (speed < 1.2 || cy < 0.9);    // lying still, or dragged along the grass
  const downT = onGround ? I.downT + dt : 0;
  this.info = {
    cx, cy, cz, vx, vy, vz, height: cy, minY, D, beta, phi, psi,
    dbeta: I.dbetaS == null ? 0 : dbeta, dbetaS: (I.dbetaS || 0) + (dbeta - (I.dbetaS || 0)) * (1 - Math.exp(-dt / 0.4)),
    dpsi, dpsiS: (I.dpsiS || 0) + (dpsi - (I.dpsiS || 0)) * (1 - Math.exp(-dt / 0.12)),
    air, speed, downT, down: downT > 0.8 && !this.held, nose: ny,
    standing: ny[1] > 0.55, snag: this.snags.length > 0,
    T: this.lines.reduce((s, ln) => s + ln.Ts, 0),
  };
};

/* ================================================================== THE SINGLE-LINE FLYER */
function FlyerAI(W, o) {
  this.W = W; this.state = 'prep'; this.ts = 0; this.r = W.r;
  this.Lt = o.lineL || 35; this.Lmax = this.Lt + 15;
  this.home = [0, 0]; this.tugs = 0; this.tugN = 3 + Math.floor(W.r() * 4);
  this.ran = 0; this.ok = 0; this.pumpT = 0; this.done = false; this.log = [];
  this.Umin = W.def.U[0]; this.Uhand = W.def.U[1];
  this.Tsc = 0.5 * RHO * o.U0 * o.U0 * W.kite.area * 0.6 * (W.def.pullK || 1);   // the pull this kite usually has (pullK: its tail's share)
}
FlyerAI.prototype.go = function (s) { this.log.push([+this.W.t.toFixed(1), s]); this.state = s; this.ts = 0; this.ok = 0; };
FlyerAI.prototype.update = function (dt) {
  const W = this.W, P = W.person, I = W.info, wind = W.wind, line = W.lines[0], tree = W.tree;
  this.ts += dt;
  let L = line.L, gx = 0, gz = 0, pump = 0, crouch = 0, raise = 0, rest = 0;
  const kx = I.cx - P.x, kz = I.cz - P.z, kd = Math.hypot(kx, kz);
  const toward = kd > 0.5 ? [kx / kd, kz / kd] : [wind.ex, wind.ez], away = [-toward[0], -toward[1]];
  const yawTo = (d) => Math.atan2(d[1], d[0]);
  let face = yawTo(toward);
  const Tsc = this.Tsc, T = line.Ts, beta = I.beta / DEG;
  const hand = W.handI[0], xs = W.ph.x, b = W.kite.bridle[0];
  const handToKite = Math.hypot(xs[3 * b] - xs[3 * hand], xs[3 * b + 1] - xs[3 * hand + 1], xs[3 * b + 2] - xs[3 * hand + 2]);
  const light = wind.U0 < 4.2;
  switch (this.state) {
    case 'prep':
      if (this.ts > 3.5 && wind.U10 > this.Umin) { this.w0 = P.walked; this.go('pull'); }
      break;
    case 'pull': {
      /* walk backward a good way, tugging now and then, line fixed, until
         the kite has real height (Joe: a launch takes more steps than it
         did); jog in light air */
      if (W.propped && line.Ts > 0.15 * Tsc) W.prop(false);
      const sp = wind.U10 < this.Umin * 1.4 ? 2.6 : 1.3;
      gx = away[0] * sp; gz = away[1] * sp;
      if (sp > 2.4 && beta < 15) face = yawTo(away);
      pump = this.ts % 1.7 < 0.3 ? 0.6 : 0;
      const walked = P.walked - (this.w0 || 0);
      if (walked > 8 && I.height > 0.35 * L && beta > 30) this.go('climb');
      else if (walked > 22 || this.ts > 20) { W.prop(false); this.go(I.down ? 'down' : 'climb'); }
      break;
    }
    case 'climb': {                                 // let line out in spurts as it climbs, walking slowly back toward home
      const paying = this.ts % 2.6 < 1.4;
      if (paying && beta > 36 && T > 0.3 * Tsc) L += 1.1 * dt;
      else if (beta < 26) L -= 0.6 * dt;
      const hx = this.home[0] - P.x, hz = this.home[1] - P.z, dh = Math.hypot(hx, hz);
      if (dh > 3 && beta > 42) { gx = hx / dh * 0.45; gz = hz / dh * 0.45; }
      if (L >= this.Lt) this.go('fly');
      if (I.snag) this.go('snag');
      else if (I.down) this.go('down');
      else if (beta < 16 && T < 0.25 * Tsc && I.height < 12 && this.ts > 2) this.go('save');
      break;
    }
    case 'fly': {
      const hx = this.home[0] - P.x, hz = this.home[1] - P.z, dh = Math.hypot(hx, hz);
      if (dh > 3 && beta > 42 && T > 0.4 * Tsc) { gx = hx / dh * 0.5; gz = hz / dh * 0.5; }
      if (T > 2.2 * Tsc && L < this.Lmax) L += 0.8 * dt;                       // a strong pull: let it take line
      else if (beta < 32 && I.dbetaS < 0) L -= 0.7 * dt;                         // sinking: take line in
      else if (L < this.Lt - 0.5 && beta > 45 && T > 0.5 * Tsc) L += 0.5 * dt;   // back out to the usual length
      /* light air: pump now and then to keep it climbing */
      if (light && beta < 45) { this.pumpT += dt; pump = this.pumpT % 2.4 < 0.35 ? 1 : 0; }
      if (tree && !W.fate) {                          // keep the kite out of the tree
        const tx = I.cx - tree.x, tz = I.cz - tree.z, td = Math.hypot(tx, tz);
        if (td < tree.R + 8 && I.height < tree.top + 8) {
          const sx = P.x - tree.x, sz = P.z - tree.z, sd = Math.hypot(sx, sz) || 1;
          gx += sx / sd * 1.4; gz += sz / sd * 1.4; L -= 0.4 * dt;
        }
      }
      if (I.snag) this.go('snag');
      else if (I.down) this.go('down');
      else if (beta < 22 || (T < 0.2 * Tsc && beta < 34)) { this.ran = 0; this.go('save'); }
      break;
    }
    case 'save': {                                  // the wind has dropped: run upwind, take line in
      if (W.fate && W.fateUsed) { L = Math.max(4, L - 1.2 * dt); pump = (this.ts % 1.4) < 0.4 ? 1 : 0; if (I.snag) this.go('snag'); else if (I.down) this.go('down'); break; }   // caught out: winds in where they stand
      if (this.ran < 22) {
        const sp = clamp(1.5 + (34 - beta) * 0.12, 1.5, 4.0);
        gx = away[0] * sp; gz = away[1] * sp;
        if (sp > 2.5) face = yawTo(away);
        this.ran += P.speed * dt;
      } else { this.pumpT += dt; pump = this.pumpT % 1.6 < 0.4 ? 1 : 0; }
      L = Math.max(8, L - 0.9 * dt);
      if (beta > 36 && T > 0.45 * Tsc) { this.ok += dt; if (this.ok > 1.2) this.go('fly'); } else this.ok = 0;
      if (I.snag) this.go('snag');
      else if (I.down) this.go('down');
      break;
    }
    case 'down':                                    // it's on the grass: drag it, it may go back up
      if (wind.U10 > this.Umin || (W.fate && W.fateUsed)) { gx = away[0] * 1.3; gz = away[1] * 1.3; L = Math.max(4, L - 0.7 * dt); }
      if (I.snag) this.go('snag');
      else if (I.height > 2.5 && I.vy > 0.3) this.go('climb');
      else if (L < 8 || this.ts > 12) this.go('fetch');
      break;
    case 'fetch': {                                 // walk out to it, winding in
      const sp = clamp(kd - 0.7, 0, 1.4);
      gx = toward[0] * sp; gz = toward[1] * sp;
      L = Math.max(0.9, Math.min(L, handToKite + 0.2));
      if (kd < 1.1) this.go('pickup');
      if (I.snag) this.go('snag');
      break;
    }
    case 'pickup':
      crouch = 1;
      if (this.ts > 0.9) { W.holdKite(true); this.go('carry'); }
      break;
    case 'carry':                                   // up it goes; a hand launch if the wind will take it
      face = Math.atan2(wind.ez, wind.ex); raise = 1;
      L = Math.max(0.9, handToKite + 0.1);
      if (this.ts > 1.8) {
        if (wind.U10 > this.Uhand) { W.holdKite(false); this.go('climb'); }
        else this.go('setdown');
      }
      break;
    case 'setdown':                                 // too light to hand launch: stand it up and walk back
      crouch = 1; face = Math.atan2(wind.ez, wind.ex);
      if (this.ts > 0.8) { W.holdKite(false); W.placeKite('propped', 0.9); this.go('walkout'); }
      break;
    case 'walkout':
      gx = away[0] * 1.2; gz = away[1] * 1.2;
      L = handToKite + 0.4;
      if (L >= W.L0) this.go('prep');
      break;
    case 'snag': {                                  // tug it, a few times
      const cyc = this.ts % 2.6;
      if (cyc < 0.4) { pump = 1; gx = away[0] * 0.8; gz = away[1] * 0.8; }
      if (cyc < dt) this.tugs++;
      if (!I.snag && this.ts > 1) this.go(I.down ? 'down' : 'climb');
      else if (this.tugs > this.tugN) this.go('giveup');
      break;
    }
    case 'giveup':
      rest = 1;
      if (tree) face = Math.atan2(tree.z - P.z, tree.x - P.x);
      if (this.ts > 8) this.done = true;
      if (!I.snag) this.go(I.down ? 'down' : 'climb');
      break;
  }
  P.gx = gx; P.gz = gz; P.face = face; P.pumpGoal = pump; P.crouchGoal = crouch; P.raiseGoal = raise; P.restGoal = rest;
  setLineLength(W, line, clamp(L, 0.8, this.Lmax));
};

/* ================================================================== THE TWO-LINE PILOT
   steer > 0 pulls the right hand back: the right wing brakes and the kite
   turns right (psi grows).

   Joe, 2026-10-10: the flyer was "switching their pulling on the strings
   too rapidly ... Give them an intention, and if the wind is inconsistent
   then the kite crashes." So the pilot holds an INTENTION for a while -
   sweeping back and forth across the wind, up and down, figure eights, or
   resting high - and flies it as a real pilot does: straight legs with the
   hands level (only small, slow corrections), and turns made with one
   steady pull held until the turn is done. The hands move at most 0.8 m/s
   apart. There is no last-moment rescue beyond starting a turn up when the
   kite is low and diving; a lull or a gust in the wrong place puts it down. */
function PilotAI(W, o) {
  this.W = W; this.state = 'prep'; this.ts = 0; this.r = W.r;
  this.home = [0, 0]; this.plan = null; this.done = false; this.log = [];
  this.Umin = W.def.U[0]; this.dmax = 0.30; this.hand = 0; this.intent = '';
  this.tugs = 0; this.tugN = 3 + Math.floor(W.r() * 4);
  this.L = o.lineL; this.last = '';
}
PilotAI.prototype.go = FlyerAI.prototype.go;
/* where the tree sits in the wind window, as the pilot sees it (a careful
   pilot only: none in a scene where the tree gets its chance) */
PilotAI.prototype.treeView = function () {
  const W = this.W, T = W.tree, P = W.person, wind = W.wind;
  if (!T || W.fate) return null;
  const dx = T.x - P.x, dz = T.z - P.z, td = Math.hypot(dx, dz);
  return { ft: Math.atan2(-dx * wind.ez + dz * wind.ex, dx * wind.ex + dz * wind.ez), fw: Math.atan2(T.R, td), el: Math.atan2(T.top - 1.2, td) };
};
const INTENT = { sweep: 'sweeping it back and forth across the wind', updown: 'flying it up and down', eight: 'flying figure eights', rest: 'resting it high overhead' };
PilotAI.prototype.pick = function () {
  const r = this.r, beta = this.W.info.beta / DEG, tv = this.treeView();
  const opts = [['sweep', 3], ['updown', 2], ['eight', beta > 30 ? 3 : 1], ['rest', 0.8]].filter(([k]) => k !== this.last);
  let s = opts.reduce((a, b) => a + b[1], 0) * r(), kind = opts[0][0];
  for (const [k, w] of opts) { s -= w; if (s <= 0) { kind = k; break; } }
  this.last = kind; this.intent = INTENT[kind];
  let bt = (22 + 18 * r()) * DEG;                       // the height a sweep holds
  if (tv && Math.abs(tv.ft) - tv.fw < 0.9) bt = Math.max(bt, tv.el + 0.22);   // a careful pilot sweeps above the tree
  this.plan = { kind, side: r() < 0.5 ? -1 : 1, t: 0, mode: 'leg', legT: 0, turnDir: 0, turnAngle: 0, turned: 0, pull: 0, n: 0,
                count: kind === 'sweep' ? 4 + Math.floor(5 * r()) : kind === 'updown' ? 3 + Math.floor(4 * r()) : kind === 'eight' ? 3 + Math.floor(4 * r()) : 1,
                bt, edge: (25 + 13 * r()) * DEG, top: (58 + 10 * r()) * DEG, bottom: (16 + 8 * r()) * DEG, dur: 4 + 5 * r(), up: true, R: (3.5 + 2 * r()) * W_SCALE(this.W) };
};
const W_SCALE = (W) => W.def.scale || 1;
/* begin a turn: one hand pulled and held, toward heading `exit` (or, for a
   loop, through `angle` radians); the pull's size eases to keep the turn
   at about `rateWant` rad/s, but it is always the same hand */
PilotAI.prototype.turn = function (dir, exit, angle, rateWant) {
  const I = this.W.info, M = this.plan, G = this.W.def.turnG || 1.5;
  M.mode = 'turn'; M.turnDir = dir; M.exit = exit; M.turnAngle = angle; M.turned = 0; M.rateWant = rateWant;
  M.Ht = I.psi; M.pull = clamp(rateWant / (G * Math.max(4, I.air)), 0.05, this.dmax);
};
PilotAI.prototype.update = function (dt) {
  const W = this.W, P = W.person, I = W.info, wind = W.wind;
  this.ts += dt;
  let gx = 0, gz = 0, cmd = 0, power = 0, crouch = 0, raise = 0;
  const kx = I.cx - P.x, kz = I.cz - P.z, kd = Math.hypot(kx, kz);
  const toward = kd > 0.5 ? [kx / kd, kz / kd] : [wind.ex, wind.ez], away = [-toward[0], -toward[1]];
  let face = Math.atan2(toward[1], toward[0]);
  const beta = I.beta, psi = I.psi;
  switch (this.state) {
    case 'prep':
      if (this.ts > 2 && wind.U10 > this.Umin) this.go('launch');
      break;
    case 'launch':                                   // a sharp step back and both hands pulled
      if (W.propped && W.lines[0].Ts + W.lines[1].Ts > 1) W.prop(false);
      power = this.ts < 0.9 ? 0.22 : 0.05;
      if (this.ts < 1.2) { gx = away[0] * 1.8; gz = away[1] * 1.8; }
      if (beta > 25 * DEG && this.ts > 0.8) { this.plan = null; this.last = ''; this.go('fly'); }
      else if (this.ts > 5) { W.prop(false); this.go(I.down ? 'down' : 'fly'); }
      break;
    case 'fly': {
      if (!this.plan) this.pick();
      const M = this.plan, phi = I.phi, cosp = Math.cos(psi), sinp = Math.sin(psi);
      M.t += dt;
      const center = (k) => clamp(-phi * k, -0.35, 0.35);   // lean a leg back toward the middle of the window
      const speed = Math.max(4, I.air);
      /* a turn is a heading the pilot sweeps round at the turn's rate; a leg
         holds a heading. Either way the pilot steers the kite onto it with
         small corrections and, in a turn, one steady pull */
      let H, ff = 0;
      if (M.mode === 'turn') {
        /* what is left of the turn, measured the way it is turning (0 to 2 pi):
           a plain wrap would call a 190 deg turn already 170 deg overdone */
        const left = M.exit != null ? (((M.exit - M.Ht) * M.turnDir) % TAU + TAU) % TAU * (M.turned > 0 || Math.abs(wrap(M.exit - M.Ht)) > 1e-3 ? 1 : 0) : M.turnAngle - M.turned;
        const ahead = wrap(M.Ht - psi) * M.turnDir;            // the target never runs more than 45 deg ahead of the kite
        const step = ahead > 0.8 ? 0 : Math.min(Math.max(left, 0), M.rateWant * dt);
        M.Ht = wrap(M.Ht + M.turnDir * step); M.turned += step;
        ff = M.turnDir * M.rateWant;
        if (left <= 1e-3 || left > TAU - 0.02) { M.mode = 'leg'; M.legT = 0; M.n++; if (M.reflex) { M.cool = 1.5; M.reflex = false; } }
        H = M.Ht;
      } else {
        M.cool = Math.max(0, (M.cool || 0) - dt);
        M.legT += dt;
        H = 0;                                       // the heading this leg wants
        switch (M.kind) {
          case 'sweep':                              // across the wind, turning up at each side
            if (beta < M.bt - 12 * DEG) { H = center(0.6); break; }   // too low: climb back up first
            H = M.side * (Math.PI / 2 - clamp((M.bt - beta) * 1.2, -0.45, 0.5));
            if (M.side * phi > M.edge && M.legT > 1) { this.turn(-M.side, -M.side * Math.PI / 2, null, speed / M.R); M.side = -M.side; }
            break;
          case 'updown':                             // up the middle, over the top, and down again
            if (M.up) {
              H = center(0.6);
              if (beta > M.top && M.legT > 1) { this.turn(phi > 0 ? -1 : 1, Math.PI, null, speed / M.R); M.up = false; }
            } else {
              H = Math.PI - center(0.6) * (sinp >= 0 ? -1 : 1);
              if (beta < Math.max(M.bottom, 25 * DEG) + 1.5 * I.speed * DEG && M.legT > 0.5) { this.turn(phi > 0 ? 1 : -1, 0, null, speed / (0.8 * M.R)); M.up = true; }
            }
            break;
          case 'eight':                              // a loop one way, a moment straight, a loop the other
            H = center(0.6);                         // up and high before each loop
            if (beta > 40 * DEG && Math.cos(psi) > 0.5 && M.legT > 0.6) { this.turn(M.side, null, 2 * Math.PI, speed / (0.8 * M.R)); M.side = -M.side; }
            break;
          case 'rest':                               // up to the top of the window and hang there
            H = center(0.8);
            if (M.legT > M.dur) M.n = M.count;
            break;
        }
        /* low and diving: start a turn up, the way that swings back toward
           the middle of the window (no more than a pilot would) */
        if (!M.cool && beta < (10 + 0.8 * I.speed) * DEG && cosp < -0.2 && M.mode === 'leg') {
          const dir = Math.abs(wrap(psi)) > 2.6 ? (phi > 0 ? 1 : -1) : (sinp > 0 ? -1 : 1);
          this.turn(dir, 0, null, speed / (0.7 * M.R)); M.up = true; M.reflex = true;
        }
        if (M.mode === 'turn') H = M.Ht;
        if (M.n >= M.count && M.mode === 'leg') this.plan = null;
      }
      {
        const G = W.def.turnG || 1.5, err = wrap(H - psi);
        const rate = clamp(1.5 * err + ff, -6, 6);
        cmd = clamp(rate / (G * speed) + 0.03 * (rate - I.dpsiS), -this.dmax, this.dmax);
        /* on a leg the corrections stay small (a few cm, hard to see from
           the sofa); the big pulls are the turns */
        if (M.mode === 'leg') cmd = clamp(cmd, -LEG_MAX, LEG_MAX);
      }
      /* light air: back up to make wind, harder the lighter it is (not far);
         otherwise drift back home */
      const fromHome = Math.hypot(P.x - this.home[0], P.z - this.home[1]);
      if ((wind.U10 < this.Umin * 1.3 || I.air < 2.2 * this.Umin) && fromHome < 15 && I.height > 2) {
        const sp = wind.U10 < this.Umin ? 2.8 : 1.6;
        gx = away[0] * sp; gz = away[1] * sp;
      } else {
        const hx = this.home[0] - P.x, hz = this.home[1] - P.z, dh = Math.hypot(hx, hz);
        if (dh > 2.5) { gx = hx / dh * 0.6; gz = hz / dh * 0.6; }
      }
      if (I.snag) this.go('snag');
      else if (I.down) this.go('down');
      break;
    }
    case 'down':                                     // on the grass: relaunch if it stands, else two tugs to flip it up
      if (I.standing && this.ts > 1.5 && wind.U10 > this.Umin) this.go('launch');
      else if (this.ts > 1.5) { if ((this.tries = (this.tries || 0) + 1) <= 2 && wind.U10 > this.Umin) this.go('tug'); else { this.tries = 0; this.go('fetch'); } }
      break;
    case 'tug':
      power = this.ts < 0.5 ? 0.3 : 0;
      if (this.ts < 0.6) { gx = away[0] * 1.5; gz = away[1] * 1.5; }
      if (this.ts > 1.6) this.go(I.down ? 'down' : 'fly');
      if (!I.down && I.height > 2 && this.ts > 0.6) { this.tries = 0; this.plan = null; this.go('fly'); }
      break;
    case 'fetch': {
      const sp = clamp(kd - 0.7, 0, 2.0);                                           // a jog out to it
      gx = toward[0] * sp; gz = toward[1] * sp;
      if (kd < 1.2) this.go('setup');
      break;
    }
    case 'setup':
      crouch = 1; face = Math.atan2(wind.ez, wind.ex);
      if (this.ts > 1.0) { W.placeKite('propped', 1.0); this.go('walkback'); }
      break;
    case 'walkback': {
      gx = away[0] * 1.8; gz = away[1] * 1.8;
      if (I.D > this.L - 1.0 || this.ts > 40) this.go('prep');
      break;
    }
    case 'snag': {
      const cyc = this.ts % 2.6;
      if (cyc < 0.4) { power = 0.3; gx = away[0] * 0.8; gz = away[1] * 0.8; }
      if (cyc < dt) this.tugs++;
      if (!I.snag && this.ts > 1) this.go(I.down ? 'down' : 'fly');
      else if (this.tugs > this.tugN) this.go('giveup');
      break;
    }
    case 'giveup':
      if (W.tree) face = Math.atan2(W.tree.z - P.z, W.tree.x - P.x);
      if (this.ts > 8) this.done = true;
      break;
  }
  if (this.state !== 'fly') this.plan = this.state === 'launch' ? this.plan : null;
  /* hands move no faster than 0.8 m/s apart */
  this.hand += clamp(cmd - this.hand, -HAND_V * dt, HAND_V * dt);
  P.gx = gx; P.gz = gz; P.face = face; P.steerGoal = this.hand; P.powerGoal = power; P.crouchGoal = crouch; P.raiseGoal = raise;
};

root.KiteEngine = { setHandSpeed: (v, leg) => { HAND_V = v; if (leg != null) LEG_MAX = leg; }, World, Wind, KITES, NLINE, DT, mulberry32, bodyToWorld, setLineLength, version: '0.1' };
})(typeof window !== 'undefined' ? window : globalThis);

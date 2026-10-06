/* ==========================================================================
  murmuration_tree.js · v0.6 · 2026-10-03

  One large leafless tree for the starlings to roost in, grown fresh each run.
  Pure JavaScript (no DOM, no three.js) so it can be grown and measured under
  jsc; the page turns what it returns into meshes.

  NOT A SPECIES, BUT A TREE (Joe, 2026-10-02: random, realistic, need not match
  any real one). A handful of traits are drawn and everything else follows
  from growing:
    habit      how strongly the leader dominates - near 0 the trunk dissolves
               into a few big scaffold limbs (oak, elm), near 1 it keeps
               going up the middle (a spire with laterals)
    crook      how much each segment wanders - old oaks are crooked
    angle      how far laterals leave their parent
    droop      how much the outer, thinner orders bend down under their own
               weight; the inner ones reach up and out toward light
    spread     how much limbs are steered away from the trunk's axis
  Thickness obeys the PIPE MODEL (Leonardo's rule): at a fork the children's
  cross-sections roughly add up to the parent's, so a limb thins the way real
  wood does instead of the way a cone does.

  WHAT IT RETURNS
    tubes   [ax,ay,az, bx,by,bz, ra, rb] per segment thicker than TUBE_R -
            drawn as solid tapered cylinders
    limbs   pairs of points, 1.2-4 cm: a pixel or two wide at this distance,
            so a solid line draws them as well as a tube and far cheaper
    twigs   pairs of points for everything thinner - drawn as 1-px lines,
            which at a hundred metres is exactly the grey haze a winter crown
            makes against the sky
    perches points on the tops of near-horizontal small limbs (1-6 cm),
            16 cm apart, shoulder to shoulder - where the flock settles at dusk
    crown   the ellipsoid that holds the crown, for flying birds to steer round

  PRUNED FLAT TO THE VIEWER (Joe, 2026-10-03: "a little more 2-dimensional
  by pruning some of the big branches in the plane that goes toward and away
  from the viewer"). Given the eye (opts.eye), the big limbs - scaffold limbs
  off the trunk and the limbs off those - that head within PRUNE_DEG of the
  line of sight are never grown, and the big forks open across the view.
  The tree stays round in plan below that; it is the big structure that lies
  in a slab facing the viewer, so a roosting bird is seen against the sky
  and not behind a limb.

  CHANGED
    v0.6  FLAT TO THE VIEWER: big limbs heading toward or away from the eye
          pruned, big forks opened across the view; perches 16 cm apart, not
          22, since the pruned tree has half the wood
    v0.5  OPENER (Joe: "too dense with branches, and when the birds fly in, we
          lose them"): laterals half as frequent past the scaffold, twigs end
          at 18 mm, one order fewer
    v0.4  three weights of wood: tubes over 4 cm, small limbs as solid lines,
          twigs as faint lines - 21k tubes had the Pi at 56-60 fps
    v0.3  scaffold limbs spread instead of sweeping up into a vase; radii scale
          with the square root of the height correction, so a shortened tree
          keeps a stout trunk; perches favour the OUTER crown, where a roosting
          bird shows against the sky
    v0.2  a BIG tree, not a sapling: stouter, straighter trunk; mostly
          decurrent (spreading) habits; wider crown; fewer, finer twigs so the
          limbs - and the roosting birds - show through the haze
    v0.1  first build
========================================================================== */
(function (global) {
'use strict';

const TUBE_R = 0.04;             // below this radius a branch is a line, not a tube
const LIMB_R = 0.012;            // between the two: a small limb, a solid line; under it, twig haze
const MIN_R  = 0.009;            // nothing thinner than an 18 mm twig
const GOLDEN = 2.39996;          // phyllotaxis: successive laterals turn 137.5 deg
const PRUNE_DEG = 40;            // big limbs within this of the line of sight are pruned
const BIG = 1;                   // orders 0 and 1 shed the big limbs that get pruned

function grow(r, opts) {
  const U = (a, b) => a + (b - a) * r();
  const T = {
    habit:  Math.pow(r(), 1.6) * 0.75,   // mostly spreading; a spire now and then
    crook:  U(0.10, 0.32),
    angle:  U(40, 68) * Math.PI / 180,
    droop:  U(0.0, 0.55),
    spread: U(0.25, 0.55),
    trunkH: U(2.5, 6.0),
    trunkR: U(0.45, 0.80),
    height: U(18, 26),
    lean:   U(-0.02, 0.02),
  };
  const base = (opts && opts.base) || [0, 0, 0];
  const tubes = [], twigs = [], limbs = [];
  let perches = [];
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  let azi = r() * 6.283;
  /* the line of sight, flat on the ground, from the eye to the trunk */
  const eye = (opts && opts.eye) || [base[0], base[2] - 100];
  const sl = Math.hypot(base[0] - eye[0], base[2] - eye[1]) || 1;
  const sight = [(base[0] - eye[0]) / sl, (base[2] - eye[1]) / sl];
  const pruneCos = Math.cos(PRUNE_DEG * Math.PI / 180);
  /* how nearly a direction heads toward or away from the viewer: |cos| of
     its angle to the line of sight, on the ground; a limb going straight up
     is not deep at all */
  function depth(v) {
    const h = Math.hypot(v[0], v[2]);
    return h < 0.15 ? 0 : Math.abs(v[0] * sight[0] + v[2] * sight[1]) / h;
  }

  function rand3() {
    let x, y, z;
    do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1);
    return [x, y, z];
  }
  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  /* a direction tilted `ang` away from `d`, turned `az` around it */
  function tilt(d, ang, az) {
    const ref = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const e1 = norm(cross(d, ref)), e2 = cross(d, e1);
    const c = Math.cos(ang), s = Math.sin(ang), ca = Math.cos(az), sa = Math.sin(az);
    return norm([d[0] * c + (e1[0] * ca + e2[0] * sa) * s, d[1] * c + (e1[1] * ca + e2[1] * sa) * s, d[2] * c + (e1[2] * ca + e2[2] * sa) * s]);
  }

  function emit(a, b, ra, rb, order) {
    if (ra >= TUBE_R) tubes.push(a[0], a[1], a[2], b[0], b[1], b[2], ra, rb);
    else if (ra >= LIMB_R) limbs.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    else twigs.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b[k]); hi[k] = Math.max(hi[k], b[k]); }
    /* perches: tops of small, not-too-steep limbs */
    const mr = 0.5 * (ra + rb);
    if (order >= 2 && mr > 0.01 && mr < 0.06) {
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
      if (L > 0 && Math.abs(dy / L) < 0.65) {
        for (let s = 0.12; s < L; s += 0.16) {
          const f = s / L;
          perches.push(a[0] + dx * f, a[1] + dy * f + mr + 0.07, a[2] + dz * f);
        }
      }
    }
  }

  /* One axis: walk it segment by segment, shedding laterals, then fork or end. */
  function branch(p, d, len, r0, order) {
    if (r0 < MIN_R || order > 6) return;
    const segL = order === 0 ? 0.7 : order < 3 ? 0.5 : 0.3;
    const n = Math.max(2, Math.round(len / segL));
    const rEnd = Math.max(MIN_R, r0 * (order === 0 ? 0.75 : 0.55));
    let rr = r0;
    /* how many laterals this axis sheds, and from where */
    const latStart = order === 0 ? T.trunkH / len : 0.15 + 0.1 * r();
    const latEvery = order === 0 ? 0.45 + 0.6 * (1 - T.habit) : order < 3 ? 1.1 : 1.0;
    let nextLat = latStart * len + latEvery * r();
    let walked = 0;
    for (let k = 1; k <= n; k++) {
      const w = rand3();
      /* tropisms: reach up when thick, sag when thin, push out from the trunk */
      /* the trunk reaches up; scaffold limbs only a little, so they SPREAD */
      const up = order === 0 ? 0.10 : order === 1 ? 0.035 : 0.03 - T.droop * 0.10 * Math.min(1, (order - 1) / 4);
      const ox = p[0] - base[0], oz = p[2] - base[2], ol = Math.hypot(ox, oz) || 1;
      const out = order >= 1 ? T.spread * 0.12 : 0;
      const ck = T.crook * (order === 0 ? 0.35 : 1);          // trunks are straighter than limbs
      d = norm([d[0] + w[0] * ck * 0.5 + out * ox / ol + (order === 0 ? T.lean * 0.1 : 0),
                d[1] + w[1] * ck * 0.3 + up,
                d[2] + w[2] * ck * 0.5 + out * oz / ol]);
      const step = len / n;
      const q = [p[0] + d[0] * step, p[1] + d[1] * step, p[2] + d[2] * step];
      const rq = r0 + (rEnd - r0) * (k / n);
      emit(p, q, rr, rq, order);
      walked += step;
      /* laterals along the axis; they shorten toward the tip, and the pipe
         model takes their wood out of what continues */
      while (walked >= nextLat && k < n) {
        const frac = walked / len;
        azi += GOLDEN;
        const cr = rq * (order === 0 ? 0.55 + 0.25 * (1 - T.habit) : 0.5 + 0.2 * r());
        const clen = len * (order === 0 ? 0.75 + 0.45 * (1 - T.habit) : 0.5 + 0.25 * r()) * (1 - 0.55 * frac) * (0.8 + 0.4 * r());
        const ang = T.angle * (0.8 + 0.4 * r()) * (order === 0 ? 1.1 : 1);
        const cd = tilt(d, ang, azi);
        if (order > BIG || depth(cd) < pruneCos) branch(q, cd, clen, cr, order + 1);
        nextLat += latEvery * (0.6 + 0.8 * r()) * (order === 0 ? 1 : Math.max(0.35, len / 6));
      }
      rr = rq; p = q;
    }
    /* the axis ends: a weak leader forks into two near-equal children
       (decurrent), a strong one carries on with a smaller partner */
    if (rEnd > MIN_R * 1.5 && order < 6) {
      const forkAng = T.angle * (0.6 + 0.4 * r());
      const share = order === 0 ? 0.5 + 0.35 * T.habit : 0.5 + 0.15 * r();
      const ra = rEnd * Math.sqrt(share) * 1.05, rb = rEnd * Math.sqrt(1 - share) * 1.05;
      let az0 = r() * 6.283;
      /* a big fork opens across the view: of a few turns, the one whose
         deeper child is least deep */
      if (order <= BIG) {
        let best = 9;
        for (let j = 0, a0 = az0; j < 8; j++, a0 += Math.PI / 8) {
          const dm = Math.max(depth(tilt(d, forkAng * (1 - share), a0)), depth(tilt(d, forkAng * share, a0 + Math.PI)));
          if (dm < best) { best = dm; az0 = a0; }
        }
      }
      const lenA = len * (order === 0 ? 0.55 + 0.25 * T.habit : 0.62 + 0.1 * r());
      branch(p, tilt(d, forkAng * (1 - share), az0), lenA, ra, order + 1);
      branch(p, tilt(d, forkAng * share, az0 + Math.PI), lenA * (0.75 + 0.2 * r()), rb, order + 1);
    }
  }

  const trunkLen = T.trunkH + (T.height - T.trunkH) * (0.35 + 0.4 * T.habit);
  branch(base.slice(), norm([T.lean, 1, T.lean * 0.5]), trunkLen, T.trunkR, 0);
  /* a little root flare where the trunk meets the ground */
  tubes.push(base[0], base[1] - 0.3, base[2], base[0], base[1] + 0.6, base[2], T.trunkR * 1.45, T.trunkR * 1.05);

  /* Grown trees overshoot their drawn height (forks keep adding length), so
     the whole tree is scaled about its base to the height that was drawn -
     radii with it, so it stays the same tree, only smaller. */
  const sc = Math.min(1, T.height / Math.max(1, hi[1] - base[1]));
  if (sc < 1) {
    /* scale `pts` points per record about the base; tubes also carry two radii */
    const S = (arr, stride, pts, radii) => {
      for (let i = 0; i < arr.length; i += stride) {
        for (let k = 0; k < pts; k++) {
          const o = i + 3 * k;
          arr[o] = base[0] + (arr[o] - base[0]) * sc;
          arr[o + 1] = base[1] + (arr[o + 1] - base[1]) * sc;
          arr[o + 2] = base[2] + (arr[o + 2] - base[2]) * sc;
        }
        if (radii) { arr[i + 6] *= Math.sqrt(sc); arr[i + 7] *= Math.sqrt(sc); }
      }
    };
    S(tubes, 8, 2, true); S(twigs, 6, 2, false); S(limbs, 6, 2, false); S(perches, 3, 1, false);
    for (let k = 0; k < 3; k++) { lo[k] = base[k] + (lo[k] - base[k]) * sc; hi[k] = base[k] + (hi[k] - base[k]) * sc; }
    T.trunkH *= sc;
  }
  /* Order the perches OUTSIDE-IN by distance from the crown's axis, so the
     birds that arrive first take the silhouette edge and a big flock still
     shows against the sky instead of vanishing into the dark core. */
  {
    const ax = (lo[0] + hi[0]) / 2, az = (lo[2] + hi[2]) / 2, np = perches.length / 3;
    const idx = Array.from({ length: np }, (_, k) => k);
    const key = idx.map(k => -Math.hypot(perches[3 * k] - ax, perches[3 * k + 2] - az) - 0.35 * perches[3 * k + 1] + 3 * r());
    idx.sort((a, b) => key[a] - key[b]);
    const out = new Float32Array(perches.length);
    idx.forEach((k, j) => { out[3 * j] = perches[3 * k]; out[3 * j + 1] = perches[3 * k + 1]; out[3 * j + 2] = perches[3 * k + 2]; });
    perches = Array.from(out);
  }
  const crown = {
    cx: (lo[0] + hi[0]) / 2, cy: Math.max(T.trunkH, (lo[1] + hi[1]) / 2), cz: (lo[2] + hi[2]) / 2,
    rx: (hi[0] - lo[0]) / 2 + 2, ry: (hi[1] - Math.max(T.trunkH * 0.8, lo[1])) / 2 + 2, rz: (hi[2] - lo[2]) / 2 + 2,
  };
  return { traits: T, tubes: new Float32Array(tubes), twigs: new Float32Array(twigs), limbs: new Float32Array(limbs),
           perches: new Float32Array(perches), crown, top: hi[1] };
}

global.MurmurationTree = { grow, TUBE_R };
})(typeof window !== 'undefined' ? window : this);

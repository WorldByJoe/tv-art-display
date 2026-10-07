/* ---------------------------------------------------------------------------
   ripples_engine.js · v0.2 · 2026-10-07
   The water in a rectangular pool with vertical walls, for ripples.html.
   Pure JavaScript (no DOM), so it can be timed and tested in a shell.

   THE MODEL IS LINEAR WATER-WAVE THEORY, SOLVED EXACTLY MODE BY MODE.
   A pool with vertical, reflecting walls has standing-wave modes
   cos(m pi x / Lx) cos(n pi z / Lz), wavenumber k = pi sqrt((m/Lx)^2 + (n/Lz)^2).
   Each mode is an independent damped oscillator whose frequency is set by
   the capillary-gravity dispersion relation for water of depth h:

       omega^2 = (g k + (sigma/rho) k^3) tanh(k h)

   Long waves are driven back by gravity and get faster as they get longer;
   waves shorter than 1.7 cm are driven back by surface tension and get faster
   as they get shorter. That one relation is why a stone's ring spreads into a
   train of ripples, with the fine capillary ripples running out ahead and the
   longer gravity waves following, instead of moving out as a single ring.
   (The free Schroedinger equation is the same kind of problem with omega
   proportional to k^2; the method is the same, only the dispersion differs.)

   Because each mode is solved exactly, there is no time-step error and no
   numerical dispersion: the only approximations are linearity (small slopes)
   and the grid's shortest wave (two cells).

   DAMPING. Viscous damping of a clean surface, 2 nu k^2 (Lamb 1932, s. 348),
   which kills a 1 cm ripple in about a second and leaves long waves alone;
   plus the bottom boundary layer, k sqrt(nu omega / 2) / sinh(2kh); plus a
   small floor of FLOOR_DAMP per second standing in for the losses this model
   does not resolve (the meniscus at the walls, side-wall boundary layers,
   surface films), without which the pool's slowest sloshing modes would ring
   for ten minutes.

   A STONE is the one part that is not first-principles. Its impact is
   represented by the cavity it opens: a depression with a raised rim and
   zero net volume (a Mexican-hat profile), released from rest. Its width and
   depth grow with the stone's size and speed; the constants are chosen to
   look like real pebble splashes, not derived. Everything after that is the
   linear theory above. The splash, the jet and the droplets are drawn by the
   page; each droplet that falls back is another small cavity.

   GRID. NX x NZ cell centres, both powers of two. The height field is the
   mode sum evaluated on the grid by a fast cosine transform (DCT-III, via a
   complex FFT of the same length, Makhoul 1980); new cavities are added in
   space and moved into the modes with the forward transform (DCT-II).

   POOLS THAT ARE NOT RECTANGLES (v0.2). A round, hexagonal, elliptical or
   egg-shaped pool has no ready-made list of standing waves, so it is placed
   inside the rectangle and its wall is enforced in space: after each step
   the water BEYOND the wall is overwritten with the mirror image of the
   water inside it (height and its rate of change, reflected across the
   nearest point of the wall). A mirrored field has no slope across the
   wall, which is the condition a vertical wall imposes (no flow through it),
   so waves reflect from it as from a real wall. Inside, the propagation is
   still exact. It costs four transforms a step instead of one.

   CHANGED
     v0.2  any pool shape: opts.inside + opts.boundary, mirrored walls
     v0.1  first build
--------------------------------------------------------------------------- */
(function (global) {
  'use strict';
  const G = 9.81, SIGMA_RHO = 0.0728 / 998, NU = 1.0e-6, N_WATER = 1.333;
  const FLOOR_DAMP = 0.03;   // 1/s; see DAMPING above

  /* ------------------------------------------------------------ the FFT */
  function makeFFT(n) {
    const levels = Math.round(Math.log2(n));
    if (1 << levels !== n) throw new Error('FFT length must be a power of two: ' + n);
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0, x = i;
      for (let b = 0; b < levels; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      rev[i] = r;
    }
    const cs = new Float64Array(n / 2), sn = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / n); sn[i] = Math.sin(2 * Math.PI * i / n); }
    /* in place; sign -1 forward, +1 inverse; never scaled */
    return function fft(re, im, sign) {
      for (let i = 0; i < n; i++) {
        const j = rev[i];
        if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
      }
      for (let size = 2; size <= n; size <<= 1) {
        const half = size >> 1, step = n / size;
        for (let st = 0; st < n; st += size) {
          for (let k = 0, t = 0; k < half; k++, t += step) {
            const wr = cs[t], wi = sign * sn[t];
            const a = st + k, b = a + half;
            const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
            re[b] = re[a] - xr; im[b] = im[a] - xi;
            re[a] += xr; im[a] += xi;
          }
        }
      }
    };
  }

  /* --------------------------------------------- the cosine transforms
     One length-N transform object; each call does TWO real sequences at once
     (one as the real part, one as the imaginary part of a complex FFT). */
  function makeDCT(n) {
    const fft = makeFFT(n);
    const re = new Float64Array(n), im = new Float64Array(n);
    const c = new Float64Array(n), s = new Float64Array(n);
    for (let k = 0; k < n; k++) { c[k] = Math.cos(Math.PI * k / (2 * n)); s[k] = Math.sin(Math.PI * k / (2 * n)); }
    /* synthesis: x[i] = sum_k a[k] cos(pi k (2i+1) / 2n), for two sequences
       at once. Sequence 1 is read from a[o1 + k*st] and written to
       x[o1 + i*st]; sequence 2 likewise at o2 (o2 < 0: there is none). */
    function inv(a, x, o1, o2, st) {
      const two = o2 >= 0;
      for (let k = 0; k < n; k++) {
        const e = k ? 0.5 : 1, kk = n - k;
        const B1 = a[o1 + k * st] * e, B2 = two ? a[o2 + k * st] * e : 0;
        const C1 = k ? a[o1 + kk * st] * 0.5 : 0, C2 = (k && two) ? a[o2 + kk * st] * 0.5 : 0;
        const P1 = B1 * c[k] + C1 * s[k], Q1 = B1 * s[k] - C1 * c[k];
        const P2 = B2 * c[k] + C2 * s[k], Q2 = B2 * s[k] - C2 * c[k];
        re[k] = P1 - Q2; im[k] = Q1 + P2;
      }
      fft(re, im, 1);
      for (let j = 0; j < n / 2; j++) {
        x[o1 + 2 * j * st] = re[j]; x[o1 + (2 * j + 1) * st] = re[n - 1 - j];
        if (two) { x[o2 + 2 * j * st] = im[j]; x[o2 + (2 * j + 1) * st] = im[n - 1 - j]; }
      }
    }
    /* analysis: a[k] = (eps_k / n) sum_i x[i] cos(pi k (2i+1) / 2n), eps 1 at
       k = 0 and 2 otherwise - the exact inverse of inv(). Same addressing. */
    function fwd(x, a, o1, o2, st) {
      const two = o2 >= 0;
      for (let j = 0; j < n / 2; j++) {
        re[j] = x[o1 + 2 * j * st]; re[n - 1 - j] = x[o1 + (2 * j + 1) * st];
        im[j] = two ? x[o2 + 2 * j * st] : 0; im[n - 1 - j] = two ? x[o2 + (2 * j + 1) * st] : 0;
      }
      fft(re, im, -1);
      for (let k = 0; k < n; k++) {
        const kk = (n - k) % n, f = (k ? 2 : 1) / n;
        const V1r = (re[k] + re[kk]) / 2, V1i = (im[k] - im[kk]) / 2;
        const V2r = (im[k] + im[kk]) / 2, V2i = -(re[k] - re[kk]) / 2;
        a[o1 + k * st] = f * (V1r * c[k] + V1i * s[k]);
        if (two) a[o2 + k * st] = f * (V2r * c[k] + V2i * s[k]);
      }
    }
    return { inv, fwd };
  }

  /* ------------------------------------------------------------ the pool */
  function Pool(opts) {
    opts = opts || {};
    const NX = this.NX = opts.nx || 256, NZ = this.NZ = opts.nz || 128;
    this.dx = opts.dx || 0.01;                     // m per cell
    this.Lx = NX * this.dx; this.Lz = NZ * this.dx;
    this.depth = opts.depth || 0.3;                // m
    this.DT = opts.dt || 1 / 60;
    const M = NX * NZ;
    this.a = new Float64Array(M);                  // mode amplitudes (m)
    this.v = new Float64Array(M);                  // their rates (m/s)
    this.m11 = new Float32Array(M); this.m12 = new Float32Array(M);
    this.m21 = new Float32Array(M); this.m22 = new Float32Array(M);
    this.eta = new Float64Array(M);                // height on the grid (m)
    this.tmp = new Float64Array(M);
    this.src = new Float64Array(M); this.srcPending = false;
    this.dctX = makeDCT(NX); this.dctZ = makeDCT(NZ);
    this.t = 0; this.nstep = 0; this.etaAt = -1;
    this.setDamping(opts.floorDamp === undefined ? FLOOR_DAMP : opts.floorDamp);
    /* a shaped pool: inside(x, z) in metres from the box corner, and the
       wall as a closed polyline [[x, z], ...] in the same frame */
    this.inside = opts.inside || null;
    this.mirrorEvery = opts.mirrorEvery || 1;
    if (this.inside) this.buildMirror(opts.boundary);
  }

  /* the exact one-step propagator of every mode, for a fixed DT */
  Pool.prototype.setDamping = function (floorDamp) {
    const { NX, NZ, Lx, Lz, depth, DT } = this;
    for (let n = 0; n < NZ; n++) for (let m = 0; m < NX; m++) {
      const i = n * NX + m;
      if (i === 0) { this.m11[i] = this.m12[i] = this.m21[i] = this.m22[i] = 0; continue; }
      const kx = Math.PI * m / Lx, kz = Math.PI * n / Lz, k = Math.hypot(kx, kz);
      const w2 = (G * k + SIGMA_RHO * k * k * k) * Math.tanh(k * depth), w = Math.sqrt(w2);
      const gam = 2 * NU * k * k + k * Math.sqrt(NU * w / 2) / Math.sinh(Math.min(2 * k * depth, 700)) + floorDamp;
      const wd = Math.sqrt(Math.max(1e-12, w2 - gam * gam));
      const e = Math.exp(-gam * DT), cc = Math.cos(wd * DT), ss = Math.sin(wd * DT);
      this.m11[i] = e * (cc + gam * ss / wd); this.m12[i] = e * ss / wd;
      this.m21[i] = -e * w2 * ss / wd;        this.m22[i] = e * (cc - gam * ss / wd);
    }
  };

  /* omega and phase speed of a wave of wavelength lam (m), for the card */
  Pool.prototype.waveSpeed = function (lam) {
    const k = 2 * Math.PI / lam, w = Math.sqrt((G * k + SIGMA_RHO * k * k * k) * Math.tanh(k * this.depth));
    return { omega: w, phase: w / k };
  };

  /* advance every mode one DT, exactly; a shaped pool then has its wall
     re-imposed (every mirrorEvery steps, and whenever a stone lands) */
  Pool.prototype.step = function () {
    if (!this.inside && this.srcPending) this.flushSources();
    const a = this.a, v = this.v, m11 = this.m11, m12 = this.m12, m21 = this.m21, m22 = this.m22;
    for (let i = 0, M = a.length; i < M; i++) {
      const ai = a[i], vi = v[i];
      a[i] = m11[i] * ai + m12[i] * vi;
      v[i] = m21[i] * ai + m22[i] * vi;
    }
    this.t += this.DT; this.nstep++;
    if (this.inside && (this.srcPending || this.nstep % this.mirrorEvery === 0)) this.reflect();
  };

  /* coefficients -> grid (2-D DCT-III), x rows two at a time, then z columns */
  Pool.prototype.synthInto = function (coef, out) {
    const { NX, NZ, tmp, dctX, dctZ } = this;
    tmp.set(coef);
    for (let n = 0; n < NZ; n += 2) dctX.inv(tmp, tmp, n * NX, (n + 1) * NX, 1);
    for (let i = 0; i < NX; i += 2) dctZ.inv(tmp, out, i, i + 1, NX);
    return out;
  };
  /* grid -> coefficients (2-D DCT-II), z columns then x rows */
  Pool.prototype.fwdInto = function (field, out) {
    const { NX, NZ, tmp, dctX, dctZ } = this;
    for (let i = 0; i < NX; i += 2) dctZ.fwd(field, tmp, i, i + 1, NX);
    for (let n = 0; n < NZ; n += 2) dctX.fwd(tmp, out, n * NX, (n + 1) * NX, 1);
    return out;
  };

  /* the height field on the grid (cached when reflect() just made it) */
  Pool.prototype.synth = function () {
    if (this.etaAt === this.nstep) return this.eta;
    this.etaAt = this.nstep;
    return this.synthInto(this.a, this.eta);
  };

  /* move pending cavities (in space) into the modes: rectangular pools */
  Pool.prototype.flushSources = function () {
    const { src, tmp, a } = this;
    this.fwdInto(src, tmp);
    for (let i = 1, M = a.length; i < M; i++) a[i] += tmp[i];
    src.fill(0); this.srcPending = false; this.etaAt = -1;
  };

  /* SHAPED POOLS: the wall, re-imposed in space (see the header) */
  Pool.prototype.reflect = function () {
    const { eta, etat, src, a, v, mIdx, mW, outIdx } = this;
    this.synthInto(a, eta); this.synthInto(v, etat);
    if (this.srcPending) { for (let i = 0, M = eta.length; i < M; i++) eta[i] += src[i]; src.fill(0); this.srcPending = false; }
    for (let q = 0, n = outIdx.length; q < n; q++) {
      const c = outIdx[q], o = 4 * q;
      eta[c] = mW[o] * eta[mIdx[o]] + mW[o + 1] * eta[mIdx[o + 1]] + mW[o + 2] * eta[mIdx[o + 2]] + mW[o + 3] * eta[mIdx[o + 3]];
      etat[c] = mW[o] * etat[mIdx[o]] + mW[o + 1] * etat[mIdx[o + 1]] + mW[o + 2] * etat[mIdx[o + 2]] + mW[o + 3] * etat[mIdx[o + 3]];
    }
    this.fwdInto(eta, a); this.fwdInto(etat, v);
    this.etaAt = this.nstep;                       // eta is exactly synth(a) now
  };

  /* For every cell beyond the wall: the nearest point b of the wall, the
     mirror m = 2b - p, and four inside cells to interpolate there. Where the
     mirror falls outside again (far corners of the box, a pointed tip) it is
     pulled back toward the wall until it is inside. Done once per pool. */
  Pool.prototype.buildMirror = function (poly) {
    const { NX, NZ, dx } = this, M = NX * NZ, ins = this.inside;
    const mask = this.mask = new Uint8Array(M);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) mask[j * NX + i] = ins((i + 0.5) * dx, (j + 0.5) * dx) ? 1 : 0;
    this.etat = new Float64Array(M);
    const out = []; for (let c = 0; c < M; c++) if (!mask[c]) out.push(c);
    this.outIdx = Int32Array.from(out);
    this.mIdx = new Int32Array(4 * out.length); this.mW = new Float32Array(4 * out.length);
    const P = poly.length, px = new Float64Array(P), pz = new Float64Array(P);
    for (let k = 0; k < P; k++) { px[k] = poly[k][0]; pz[k] = poly[k][1]; }
    const cellIn = (x, z) => { const i = Math.floor(x / dx), j = Math.floor(z / dx); return i >= 0 && j >= 0 && i < NX && j < NZ && mask[j * NX + i] === 1; };
    const setW = (q, x, z) => {                   // bilinear over inside cells only
      const fx = x / dx - 0.5, fz = z / dx - 0.5, i0 = Math.floor(fx), j0 = Math.floor(fz), tx = fx - i0, tz = fz - j0;
      const cs = [[i0, j0, (1 - tx) * (1 - tz)], [i0 + 1, j0, tx * (1 - tz)], [i0, j0 + 1, (1 - tx) * tz], [i0 + 1, j0 + 1, tx * tz]];
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const [ci, cj, w] = cs[k], ok = ci >= 0 && cj >= 0 && ci < NX && cj < NZ && mask[cj * NX + ci] === 1;
        this.mIdx[4 * q + k] = ok ? cj * NX + ci : 0; this.mW[4 * q + k] = ok ? w : 0; if (ok) sum += w;
      }
      if (sum < 1e-6) return false;
      for (let k = 0; k < 4; k++) this.mW[4 * q + k] /= sum;
      return true;
    };
    for (let q = 0; q < out.length; q++) {
      const c = out[q], x = (c % NX + 0.5) * dx, z = (Math.floor(c / NX) + 0.5) * dx;
      let best = 1e18, bx = 0, bz = 0;
      for (let k = 0; k < P; k++) {               // nearest point on the wall
        const k2 = (k + 1) % P, ex = px[k2] - px[k], ez = pz[k2] - pz[k], L2 = ex * ex + ez * ez || 1e-12;
        let t = ((x - px[k]) * ex + (z - pz[k]) * ez) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = px[k] + t * ex, qz = pz[k] + t * ez, d = (qx - x) * (qx - x) + (qz - z) * (qz - z);
        if (d < best) { best = d; bx = qx; bz = qz; }
      }
      let ok = false;
      for (let f = 1; f > 0.04 && !ok; f *= 0.8) {  // the mirror, pulled in until it lands inside
        const mx = bx + f * (bx - x), mz = bz + f * (bz - z);
        if (cellIn(mx, mz)) ok = setW(q, mx, mz);
      }
      if (!ok) {                                   // last resort: the nearest inside cell
        let bd = 1e18, bc = 0;
        for (let k = 0; k < M; k++) if (mask[k]) { const d = ((k % NX + 0.5) * dx - x) ** 2 + ((Math.floor(k / NX) + 0.5) * dx - z) ** 2; if (d < bd) { bd = d; bc = k; } }
        this.mIdx[4 * q] = bc; this.mW[4 * q] = 1;
      }
    }
  };

  /* A cavity at (x, z) in pool metres from the corner: depth A (m) at the
     centre, radius s (m). Mexican-hat profile (1 - r^2/s^2) exp(-r^2/s^2),
     which has zero net volume: the water pushed out of the hole stands in
     the rim. */
  Pool.prototype.cavity = function (x, z, A, s) {
    const { NX, NZ, dx, src } = this;
    s = Math.max(s, 0.8 * dx);
    const R = 3 * s, i0 = Math.max(0, Math.floor((x - R) / dx)), i1 = Math.min(NX - 1, Math.ceil((x + R) / dx));
    const j0 = Math.max(0, Math.floor((z - R) / dx)), j1 = Math.min(NZ - 1, Math.ceil((z + R) / dx));
    const sub = s < 2 * dx ? 3 : 1, w = 1 / (sub * sub), is2 = 1 / (s * s);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      let h = 0;
      for (let q = 0; q < sub; q++) for (let p = 0; p < sub; p++) {
        const px = (i + (p + 0.5) / sub) * dx - x, pz = (j + (q + 0.5) / sub) * dx - z;
        const u = (px * px + pz * pz) * is2;
        h += (1 - u) * Math.exp(-u);
      }
      src[j * NX + i] -= A * h * w;
    }
    this.srcPending = true;
  };

  /* Size the cavity a stone opens. Radius R (m), impact speed U (m/s).
     Chosen to look like real pebble splashes (see the header): a little
     under twice the stone's radius across plus a little per m/s, depth
     growing with the square root of speed, slope at most 0.6. Returns the
     cavity and the energy it hands the waves (J): gravity's share
     (pi s^2 / 8) rho g A^2 plus surface tension's 0.75 pi sigma A^2 for this
     profile. For a 1 cm stone from a metre that is about half a percent of
     its kinetic energy; the rest goes into the splash, the jet, the sound
     and heat, which this model does not follow. */
  Pool.prototype.stone = function (x, z, R, U) {
    const s = R * (1.8 + 0.15 * U), A = Math.min(0.6 * s, 0.9 * R * Math.sqrt(U));
    this.cavity(x, z, A, s);
    const E = Math.PI * A * A * (998 * G * s * s / 8 + 0.75 * SIGMA_RHO * 998);
    return { s, A, E };
  };

  /* ------------------------------------------------------ light and slope
     Fills rgba (Uint8Array NX*NZ*4) with what the shader needs:
       R, G  the surface slope d(eta)/dx, d(eta)/dz, 128 + 254*slope (+-0.5)
       B     the sun's light reaching the floor under this cell, relative to
             flat water, x 64 (0..4)
       A     the height, 128 + eta / 0.5 mm
     The floor light is traced, not guessed: every cell's patch of sunlight is
     refracted through its own tilted surface by Snell's law and followed to
     the floor, where it is shared among the four nearest cells. Where the
     surface curves, neighbouring patches converge or spread - the bright
     network on a pool floor. sun = unit vector TOWARD the sun (x, y up, z);
     fb = the coping's height above the water, whose shadow is honoured. */
  Pool.prototype.light = function (rgba, sun, fb, ss) {
    const { NX, NZ, dx, depth, eta } = this;
    if (!this.acc || this.acc.length !== NX * NZ) { this.acc = new Float32Array(NX * NZ); this.sx = new Float32Array(NX * NZ); this.sz = new Float32Array(NX * NZ); this.acc2 = new Float32Array(NX * NZ); }
    const acc = this.acc, sx = this.sx, sz = this.sz, acc2 = this.acc2, mask = this.mask || null;
    const inv2 = 1 / (2 * dx);
    for (let j = 0; j < NZ; j++) {
      const jm = j ? j - 1 : 0, jp = j < NZ - 1 ? j + 1 : NZ - 1;
      for (let i = 0; i < NX; i++) {
        const im = i ? i - 1 : 0, ip = i < NX - 1 ? i + 1 : NX - 1, c = j * NX + i;
        sx[c] = (eta[j * NX + ip] - eta[j * NX + im]) * inv2;
        sz[c] = (eta[jp * NX + i] - eta[jm * NX + i]) * inv2;
      }
    }
    /* the sun's ray, and what flat water does with it */
    const dX = -sun[0], dY = -sun[1], dZ = -sun[2], eta1 = 1 / N_WATER;
    const flat = refract(dX, dY, dZ, 0, 1, 0, eta1);
    const E0 = sun[1] * flat[3];
    /* the coping's shadow on the water: a cell is lit only if the ray back
       toward the sun clears the coping, i.e. is still over the pool at the
       coping's height */
    const sh = sun[1] > 0.01 ? fb / sun[1] : 1e9;
    const offX = sun[0] * sh, offZ = sun[2] * sh;
    acc.fill(0);
    ss = ss || 1;
    const wsub = 1 / (ss * ss);
    for (let j = 0; j < NZ; j++) for (let q = 0; q < ss; q++) {
      const fz = j + (q + 0.5) / ss - 0.5;                 // in cell units
      const zq = (fz + 0.5) * dx;
      if (zq + offZ < 0 || zq + offZ > this.Lz) continue;
      const j0 = Math.max(0, Math.min(NZ - 2, Math.floor(fz))), tz = Math.min(1, Math.max(0, fz - j0));
      for (let i = 0; i < NX; i++) for (let p = 0; p < ss; p++) {
        const fx = i + (p + 0.5) / ss - 0.5, xq = (fx + 0.5) * dx;
        if (xq + offX < 0 || xq + offX > this.Lx) continue;
        if (mask) {                               // only water lets light down, and only past the coping
          if (!mask[j * NX + i]) continue;
          const bi = Math.floor((xq + offX) / dx), bj = Math.floor((zq + offZ) / dx);
          if (bi < 0 || bj < 0 || bi >= NX || bj >= NZ || !mask[bj * NX + bi]) continue;
        }
        let gx, gz;
        if (ss === 1) { gx = sx[j * NX + i]; gz = sz[j * NX + i]; }
        else {
          const i0 = Math.max(0, Math.min(NX - 2, Math.floor(fx))), tx = Math.min(1, Math.max(0, fx - i0));
          const c00 = j0 * NX + i0, c10 = c00 + 1, c01 = c00 + NX, c11 = c01 + 1;
          gx = (sx[c00] * (1 - tx) + sx[c10] * tx) * (1 - tz) + (sx[c01] * (1 - tx) + sx[c11] * tx) * tz;
          gz = (sz[c00] * (1 - tx) + sz[c10] * tx) * (1 - tz) + (sz[c01] * (1 - tx) + sz[c11] * tx) * tz;
        }
        const nl = 1 / Math.sqrt(1 + gx * gx + gz * gz), nx = -gx * nl, ny = nl, nz = -gz * nl;
        const cosi = -(dX * nx + dY * ny + dZ * nz);
        if (cosi <= 0) continue;
        const k = 1 - eta1 * eta1 * (1 - cosi * cosi);
        const f = eta1 * cosi - Math.sqrt(k);
        const tX = eta1 * dX + f * nx, tY = eta1 * dY + f * ny, tZ = eta1 * dZ + f * nz;
        const T = 1 - schlick(cosi);
        const flux = cosi / ny * T * wsub;                // per unit horizontal area
        const L = depth / -tY;
        const px = (xq + tX * L) / dx - 0.5, pz = (zq + tZ * L) / dx - 0.5;
        const pi = Math.floor(px), pj = Math.floor(pz);
        if (pi < -1 || pj < -1 || pi >= NX || pj >= NZ) continue;
        if (mask) { const ci = Math.round(px), cj = Math.round(pz); if (ci < 0 || cj < 0 || ci >= NX || cj >= NZ || !mask[cj * NX + ci]) continue; }
        const ux = px - pi, uz = pz - pj;
        if (pj >= 0) {
          if (pi >= 0) acc[pj * NX + pi] += flux * (1 - ux) * (1 - uz);
          if (pi + 1 < NX) acc[pj * NX + pi + 1] += flux * ux * (1 - uz);
        }
        if (pj + 1 < NZ) {
          if (pi >= 0) acc[(pj + 1) * NX + pi] += flux * (1 - ux) * uz;
          if (pi + 1 < NX) acc[(pj + 1) * NX + pi + 1] += flux * ux * uz;
        }
      }
    }
    /* a 1-2-1 blur: the sun is a disc, not a point, and the floor is rough */
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const c = j * NX + i, l = i ? c - 1 : c, r = i < NX - 1 ? c + 1 : c;
      acc2[c] = 0.25 * acc[l] + 0.5 * acc[c] + 0.25 * acc[r];
    }
    const sc = 64 / Math.max(1e-6, E0);
    let tot = 0;
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const c = j * NX + i, u = j ? c - NX : c, d = j < NZ - 1 ? c + NX : c;
      const L = 0.25 * acc2[u] + 0.5 * acc2[c] + 0.25 * acc2[d];
      tot += L;
      const o = c * 4;
      rgba[o] = clampB(128 + 254 * sx[c]);
      rgba[o + 1] = clampB(128 + 254 * sz[c]);
      rgba[o + 2] = clampB(L * sc);
      rgba[o + 3] = clampB(128 + eta[c] * 2000);
    }
    this.E0 = E0;
    this.floorLight = tot / (NX * NZ) / Math.max(1e-6, E0);   // mean, relative to flat water (shadows lower it)
    return rgba;
  };

  function clampB(v) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }
  function schlick(c) { const r0 = 0.02; const m = 1 - c; return r0 + (1 - r0) * m * m * m * m * m; }
  function refract(dX, dY, dZ, nx, ny, nz, e) {
    const cosi = -(dX * nx + dY * ny + dZ * nz), k = 1 - e * e * (1 - cosi * cosi), f = e * cosi - Math.sqrt(k);
    return [e * dX + f * nx, e * dY + f * ny, e * dZ + f * nz, 1 - schlick(cosi)];
  }

  /* largest |eta| on the grid, for tests and the card */
  Pool.prototype.maxHeight = function () { let m = 0; for (const h of this.eta) { const a = h < 0 ? -h : h; if (a > m) m = a; } return m; };

  global.Ripples = { Pool, makeDCT, makeFFT, G, SIGMA_RHO, NU, N_WATER };
})(typeof window !== 'undefined' ? window : this);

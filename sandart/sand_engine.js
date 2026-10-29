/* ==========================================================================
  sand_engine.js · v4.6 · 2026-10-29

  A moving sand picture: several sands and water between two panes of glass a
  few mm apart, just after the frame has been flipped. Pure JavaScript, no DOM,
  so the same file runs in the page and under jsc for testing.

  NO GRAINS ARE TRACKED. The panes are so close that the picture is flat, so
  the model is a 2D grid of squares about 1 mm across, and each square holds
  the FRACTION of its volume that is each sand (ph[k]; phi is their sum). At TV
  resolution a grain is about one pixel, so the page draws the grains from
  those fractions. Four sands differ in colour, grain size, density and shape;
  the deposits keep their layers; and the AIR decides where sand falls (Joe,
  2026-10-24: "add the bubbles of air that would control the movement of sand
  into the water streams").

  WHAT A REAL FRAME DOES (a 25x time-lapse, sand_tests/obs/real_reference.png):
  just after the flip the sand is packed against the top, its underside level,
  lined with a row of small bubbles; whatever hung below that line falls at once
  in clouds. Then ~10 thin streams fall from gaps in the bubble row, steady in
  place, each building a sharp cone. The upper sand's TOP sinks in V funnels
  over the gaps (an hourglass), leaving sharp ridges between them on the row.
  At the end the row unzips, the ridges fall as clouds and drape the cones, and
  the air rises to the top.

  THE PHYSICS, per step
    water     The sandy water is heavier than clear water by the sum over the
              sands of ph[k] (rho_k - rho_f), so it sinks and pushes clear water
              aside (Boussinesq). The glass drags on the flow: in a gap h the
              drag rate is 12 nu / h^2 (Hele-Shaw), and crowded sand thickens
              the water, so drag rises steeply as phi nears packing. Drag is
              implicit, so a stiff packed layer cannot blow up the step. The
              flow is a STREAMFUNCTION psi on the grid corners, so the face
              velocities are exactly divergence-free whatever the solver's
              accuracy. Inertia is kept but the water does not carry its own
              velocity: the glass damps momentum in ~80 ms.
    sinking   each sand sinks through the water at its own speed: a lone grain
              at w0_k (Ferguson & Church 2004, slowed by the panes), so the
              coarse dense black sinks 4.7x faster than the fine pale sand and a
              single stream separates as it falls. Crowding slows all of them
              by the TOTAL sand: flux_k = w0_k ph_k (1 - phi/phiM)^n / ...,
              taken through a Godunov flux of the total (Kynch's theory of
              sedimentation, made to stop at packing), and shared among the
              sands in proportion to w0_k ph_k.
    start     a frame is turned over to start, so each picture begins as the
              last one ended, rotated 180 degrees: its layered mountains become
              the UPPER SAND (Joe, 2026-10-25), its layers folded by the turn
              (foldUpper). Sand still in the water or on the sheet is first
              settled straight down onto that deposit. With
              no last picture, one is made by the same deposit rules: a series
              of pours from a few streams, each mostly one sand, landing with a
              spread-out footprint and settling by the same avalanches.
    sheet     the air rises at once as small bubbles and gathers under the
              upper sand as ONE LEVEL SHEET, near the top of its underside
              (sheetQ); the sand below that level falls as clouds. Each bubble
              that reaches it joins its RAFT: a row of lenses (a bubble wider
              than tFlat flattens), coated with sand grains so they do not
              merge. While the raft forms, the bare wet underside between lenses
              gives way; once they span the width they are packed edge to edge
              (squeezed thicker if there are too many), and HOLES open at the
              weakest joints between them - where the packing strength xi is
              lowest (a Gaussian random field of log strength with a Gaussian
              variogram, sill and range; Joe: "a geospatial model, with kernel
              and sill") - no two within dHole.
    upper     the upper sand is a stack of layered rows per sub-column resting
              on the sheet. It drains from its BOTTOM through the holes, like an
              hourglass, as fast as WATER can get in to take the sand's place: up
              through the hole and the packed grains (Darcy), so a hole passes
              pi r v_D over the arch of grains spanning it (r ~ its width g),
              v_D = k phi (rho_s - rho_f) g / mu, k by Kozeny-Carman from the
              grains at the hole (fine sand drains 7x slower than coarse). The
              sand that moves widens upward, as in a flat-bottomed silo (the
              kinematic model, Nedderman & Tuzun 1979): grains beside the falling
              ones step into the room they leave, so at height z over a hole the
              moving sand is a bell about sqrt(2 bKin z) wide, the layers sag
              into Us and Vs whose tip is the hole, and beside the hole, at the
              sheet, the sand stays put. The drained sand falls into the water
              under the hole as a stream. Its top surface slides at each sand's own angle (see
              deposit), so a V funnel opens over every hole and ridges stand
              between them. Grains creep off the ridges' steep faces into the
              holes (creepV), so a ridge backs away from its holes keeping its
              angle. In a gap this thin the panes' friction carries the sand's
              weight (Janssen: the stress on the sheet stops growing after ~3 mm
              of sand), so a lens holds up any height of sand, and rises out
              only through less than coverMin of sand: its buoyancy then beats
              the cover's weight and the panes' friction on it. Its sand falls
              past it and its place is a wide hole. Once the streams have run
              down (unzipFrac), the sheet UNZIPS, as in the time-lapse: lens
              after lens from the most thinly covered one, each tCascade, and
              the ridges drop whole, in clouds, and drape the cones. The air
              goes to the top. Sand landing on the deposit
              runs down from where it lands. (v3 hung the upper sand from the glass by friction and
              cohesion with a force field, and kept the air in pockets under
              domes; the whole wet underside shed grains, an even rain, and
              the mountains came out broad.)
    air       bubbles are Lagrangian (a centre and a radius, carried by the
              water and rising at uRise) and SLIDE along any sand they touch
              (the part of their motion into the sand is dropped). Air that
              rises out of the raft gathers at the frame's top as a BODY of air:
              af[k], the share of square k that is air, over connected OPEN
              squares (not packed sand, deposit, or sand crowded past phiDense).
              Every step each body settles exactly: from the top of its dome it
              fills down with ONE level water surface, highest squares first,
              like an upside-down lake; reaching a LIP (open water beyond it,
              higher than the surface) the air past the lip leaves under it as
              bubbles at the rate they rise. A bubble held still against sand
              or the frame's top drains into a body over about tJoin. In the
              end all the air is at the top, its underside level, as in a
              real frame. Crowded loose sand cut off inside the air falls
              through it.
    deposit   the bed is a HEIGHT per sub-column (BSUB per grid square), and
              each sub-column keeps a stack of rows (ZSUB per square, 0.3 mm)
              holding the share of each sand that landed there - the layers.
              Each sand has its own angle of repose: the angular black and
              rust stand steeper (35, 34 deg) than the round white and pale
              (32, 31); a grain on coarser grains drops into the gaps and
              holds steeper, on finer ones it rolls on. The deposit grows in
              WHOLE-FACE AVALANCHES, as a heap fed slowly does (Makse, Cizeau
              & Stanley 1997; Lemieux & Durian 2000): sand landing on a face
              lodges at up to its angle + 4 deg, the most a face at rest
              holds, building a steeper cap down from the peak (the
              metastable wedge of Koeppe, Enz & Kakalios 1998); once the cap
              reaches the toe the face is full and fails as a whole. It
              settles to one straight slope at its top layer's angle, and all
              that lodged since it last failed runs down and fills it from the
              toe up, finest grains first. So each avalanche lays one layer
              parallel to the face from peak to toe, its coarse grains over
              its fines, and the layers record in turn what the stream
              carried. A grid square the bed covers past its centre is solid.
    carrying  each sand moves with the water by flux-corrected transport
              (Zalesak 1979): sharp curtain edges, no overshoot, and every
              sand conserved to rounding.

  UNITS: SI throughout. Grid squares are dx = W / NX metres.

  CHANGED
    v4.6  randomSands: a new frame's four sands, each a random mineral (density, angle of
          repose) and a grain size from one of four bands, fine to coarse (Joe: "randomize
          the colors and mineral properties of the sand grains"); SANDS stays the default
    v4.5  turning the frame over folds the upper sand's layers into smooth waves and swirls,
          a different amount each picture (v4.4 started with the last deposit's straight
          chevrons; Joe: "too regular"; the time-lapse starts with bent, marbled layers)
    v4.4  the sand over a hole sinks in a zone that widens upward (kinematic model), so its
          layers sag into Us and Vs with their tip at the hole; v4.3 sank a column the hole's
          width as one block, its layers cut by sharp vertical steps (Joe: "my intuition is
          that the depletion should lead to a conic depletion"; the time-lapse agrees)
    v4.3  the panes carry the upper sand's weight, so a lens rises out only through thin cover
          and no longer pulls its neighbours (under 3-6 mm of sand) down with it; the sheet
          unzips once the streams have run down: ridges stand to ~95% of the picture, as in
          the time-lapse (v4.2 ~65%), and a wedge against a wall no longer stalls a picture
    v4.2  physics review: real underwater angles (31-35 deg, trap <= 3) and a face fails only
          when full (v4.1: 64 avalanches a second, 0.8 mm2 each); the holes drain at the Darcy
          rate of the grains over them (v4.1 drained 6x faster than the real frame's 78 min);
          sinking speeds by Ferguson & Church; sand crowded past 0.3 on the bed jams into it
========================================================================== */
(function factory(root) {
'use strict';

const TAB = 2048;
// The normal distribution's quantiles at (i + 0.5) / QN: the lanes the room under the
// upper sand climbs along (kinVoid). From its density, summed on a fine grid over +-6.
const QN = 4096, QUANT = (() => {
  const n = 24001, x0 = -6, h = 12 / (n - 1), cdf = new Float64Array(n), pdf = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  for (let i = 1; i < n; i++) { const a = x0 + (i - 1) * h; cdf[i] = cdf[i - 1] + 0.5 * h * (pdf(a) + pdf(a + h)); }
  const q = new Float64Array(QN);
  for (let i = 0, j = 0; i < QN; i++) {
    const u = (i + 0.5) / QN; while (cdf[j + 1] < u) j++;
    q[i] = x0 + (j + (u - cdf[j]) / (cdf[j + 1] - cdf[j])) * h;
  }
  return q;
})();
// What moves a grain. Colours are the page's business; the order is shared.
// repose: the angle (degrees, under water) a pile of that sand alone stands at. Angular,
// crushed grains interlock and stand steeper than round ones, but natural sands under water
// all lie at 30-35 deg (Makse et al. 1997 chose glass beads at 26 and rough alumina at 39 as
// extremes; at those, a coarse grain found no room on a fine face and every face failed
// 5 mm at a time)
const SANDS = [
  { name: 'black', rho: 3000, d: 0.25e-3, repose: 35 },   // crushed basalt: coarse, dense, angular
  { name: 'rust',  rho: 2650, d: 0.20e-3, repose: 34 },   // crushed: angular
  { name: 'white', rho: 2650, d: 0.15e-3, repose: 32 },   // rounded
  { name: 'pale',  rho: 2650, d: 0.10e-3, repose: 31 },   // fine and round: the last to land, the haze
];
// Minerals a new frame's sands can be (randomSands): density, kg/m^3, and the angle of
// repose under water of its grains alone, degrees. Crushed grains interlock and stand
// steeper than rounded river grains; all stay inside the 30-35 deg natural sands lie at.
const MINERALS = [
  { name: 'river quartz',   rho: 2650, repose: 31 },   // rounded by the river
  { name: 'crushed quartz', rho: 2650, repose: 34 },
  { name: 'crushed glass',  rho: 2500, repose: 34 },
  { name: 'feldspar',       rho: 2560, repose: 33 },
  { name: 'marble',         rho: 2710, repose: 34 },   // crushed calcite
  { name: 'basalt',         rho: 3000, repose: 35 },   // crushed
];
// Grain sizes, m: each frame takes one sand from each band, fine to coarse, so every frame
// has a fine sand that hangs as a haze and a coarse one that falls first. Water seeps into
// a mix as the square of its grain size averaged as 1/d (Kozeny-Carman), and the bands
// hold that average to 0.136-0.177 mm (SANDS: 0.156), so a frame drains at 0.75-1.3x the
// default's pace instead of anything from a fifth to double.
const SIZE_BANDS = [[0.09e-3, 0.12e-3], [0.13e-3, 0.17e-3], [0.17e-3, 0.21e-3], [0.21e-3, 0.27e-3]];
const DEF = {
  W: 0.40,              // frame width inside the border, m
  NX: 336, NY: 192,     // grid; both must halve cleanly for the multigrid
  gap: 1.2e-3,          // distance between the panes, m
  nu: 1.5e-6,           // the liquid's kinematic viscosity, m^2/s
  rhoF: 1000,
  C1: 18, C2: 1.0,      // a lone grain sinks at R g d^2 / (C1 nu + sqrt(0.75 C2 R g d^3)), R = (rho - rhoF)
                        // / rhoF (Ferguson & Church 2004, natural sand), slowed by the two panes (Faxen):
                        // black 23, rust 15, white 9.5, pale 4.9 mm/s, a 4.7x spread (Stokes' d^2 gave 7.6x)
  sands: SANDS,
  phiM: 0.60,           // packing at which sand stops moving through water
  nRZ: 2.5,             // crowding exponent of the sinking flux: (1 - phi/phiM)^2.5 is Richardson & Zaki's
                        // (1 - phi)^4.5 (grain Reynolds numbers 0.3-4) to 2% up to phi 0.2, and stops at packing
  fill: 0.36,           // the sand, as a deposit, fills this share of the frame's height (the time-lapse's
                        // frame: ~40%, its sheet ~40% down)
  pours: [40, 70],      // the first picture's past: this many pours, each mostly one sand,
  streams: [3, 6],      // ... from this many places across the frame
  phiBed: 0.60,         // packing of the deposit
  // THE AIR AND THE SHEET (v4.0): the upper sand rests on a row of sand-coated bubbles under it,
  // and drains like an hourglass through the gaps between them
  airFrac: 0.014,       // the frame's air, as a share of its area, at the bottom at the flip: a little
                        // more than one row of lenses needs, so the row fills and squeezes (sellers:
                        // more air, a slower trickle and taller peaks; less, dunes)
  rBub: [1.4e-3, 3e-3], // m: it rises as small bubbles of these radii, let go over 2 s
  uRise: 0.07,          // m/s, a bubble rising through still water
  bubbleDrive: 0.05,    // how hard a rising bubble stirs the water (1 = its full buoyancy)
  sheetQ: 0.5,          // the sheet forms this far up the underside's heights (0 lowest, 1 highest): at 0.5
                        // 7-10% falls at the flip (0.75: 18-29%, a thick flat layer of cloud on the floor)
  foldAmp: 30e-3,       // m: how far, on average, the turn-over drags the upper sand's layers along
                        // (foldUpper; each picture draws 0.5-1.5x this: 15 mm bends them, 45 mm marbles them)
  foldModes: 5,         // ... in this many random rolls
  tFlat: 3e-3,          // m: a raft bubble wider than this flattens into a lens this thick
  fullAt: 0.95,         // the raft is full (packed edge to edge) once its lenses span this share of the width
  gHole: 2e-3,          // m: a hole between lenses of a full raft (a thin stream's width)
  sOpen: 0.8,           // a joint opens where the packing there (xi) is weaker than this ...
  dHole: 15e-3,         // m: ... and no other hole is this close
  gJam: 0.8e-3,         // m: an opening narrower than this jams (grains arch across it)
  arch: 2,              // the arch of grains over an opening, as a radius, in half-widths of the opening
                        // (Beverloo's free-fall arch stands about as high as the opening is wide). At 1,
                        // pictures took ~2x the real frame's 78 min; this order-one number is the one
                        // the real frame's time sets
  bKin: 0.35e-3,        // m: the sand over a hole sinks in a bell sqrt(2 bKin z) wide at height z above it:
                        // the kinematic model's diffusion length, about two grain diameters (measured in
                        // thin silos, it grows with height: Choi, Kudrolli & Bazant 2005). v4.3 sank only
                        // the sand right over the hole, a column the hole's width, as one block
  kinDt: 0.25,          // s: the room the holes leave climbs in a batch this often (the page re-sends the
                        // rows that moved)
  creepFloor: 20,       // degrees: faces of the upper sand steeper than this shed grains ...
  creepV: 0.0013e-3,    // m/s: ... at this rate: the water that replaces the drained sand seeps out
                        // through the faces, so creep goes with the drainage (v4.1's 0.008 mm/s went with
                        // holes draining 6x faster; then the ridges stood ~45% of the picture, in the
                        // time-lapse ~40%)
  coverMin: 1.5e-3,     // m: a raft lens with less sand than this over it rises out: its buoyancy (~its
                        // thickness of water) beats the cover's weight and the panes' friction on it
                        // (passive Janssen over a ~2.7 mm friction length: ~2 mm). With more cover it stays,
                        // however tall the ridge over it (v4.2 also failed whole stretches under 4 mm on
                        // average and pulled down the neighbours of any lens that rose, under 3-6 mm of
                        // sand: the sheet unzipped at ~65% of the picture, in the time-lapse at ~95%)
  unzipFrac: 0.1,       // the sheet unzips once the sand drained in the last minute falls below this
                        // share of the most drained in any minute (OBSERVED, not derived: the real sheet
                        // held while the streams ran and unzipped as they dwindled) ...
  tCascade: 2.5,        // s: ... one lens about every this, out from the most thinly covered (the
                        // time-lapse's sheet, ~70 lenses, unzipped in ~3 min)
  tJoin: 0.5,           // s: a bubble that meets air drains into it over about this long
  // PACKING, a Gaussian random field of log strength with the variogram
  // gamma(h) = nugget + (sill - nugget) (1 - exp(-h^2 / range^2)): where the sheet's holes open
  packSill: 0.12,       // variance of log strength between squares far apart
  packNugget: 0.01,     // ... of which this much varies square to square
  packRange: 4e-3,      // m: how far the variation stays alike
  aSeal: 2e-3,          // m: air thicker than this keeps water off the sand above it; a
                        // thinner film is broken (beads up) and water reaches the grains
                        // through it (at 0.5 mm, films 1-2 mm thick sealed 60% of the
                        // underside for good and the picture stalled)
  maxClimb: 4,          // squares a body of air may shift at once to reach the top of its dome;
                        // farther, it stays and leaks bubbles that travel there (air seen to move)
  phiDense: [0.35, 0.5], // loose sand crowded past 0.5 is a wall to air (and to bubbles), like packing,
                        // until it thins below 0.35 (hysteresis: walls at one threshold flickered as
                        // sand drifted, opening and closing lips every step)
  tSpill: 3,            // squares' width of rising bubbles that air leaving under a lip forms: it leaves
                        // at uRise x that width (all at once, a passing opening sent whole pockets back
                        // and forth)
  phiDrop: 0.45,        // sand set down in water (fallen through air) fills squares only this far: at
                        // 0.58 it piled up past phiDense, became a wall inside pockets and rested on
                        // the air below it, in layers
  tStill: 0.15,         // s: a bubble held this still under sand is at a dome's top and drains there
  repose: 33,           // angle of repose under water of the sands mixed, degrees (where the ground stops
                        // falling, for rolling grains: see rollFlat); each sand has its own (SANDS)
  reposeMax: 37,        // ... and a face at rest stands up to the difference (4 deg) steeper than its own
                        // top layer's angle: sand lodges on the deposit up to it, and past it the upper
                        // sand's faces slide; both come to rest at that angle
  trap: 7,              // degrees: a grain rolling over coarser grains drops into the gaps between them
                        // and stops on a steeper face, by trap x (d_under - d) / (d_under + d), at most
                        // 3 deg here; over finer ones it rolls on (Makse, Cizeau & Stanley 1997: this,
                        // with the coarse grains the steeper, is what makes the stripes)
  capTol: 2,            // degrees: a face is FULL, and fails, once it stands on average within this of
                        // the angle its top layer lodges at (its cap of lodged sand has reached the toe)
  surfDepth: 0.6e-3,    // m: the top layer of the deposit whose grains a rolling grain meets
  rollMax: 100,         // sub-columns (60 mm) a slide on the upper sand can run down a face
  rollFlat: 0.3,        // ... while the ground falls at least this share of the repose slope (~11 deg)
  phiJam: 0.30,         // above this, sand resting on the bed jams into it: in a 1.2 mm gap, sand this
                        // crowded is held by its contacts and the panes' friction, a granular mass that
                        // stops on the pile, not a thick liquid that flows down it (at 0.45, plumes of it
                        // slid along the faces)
  tJam: 0.3,            // s, how fast it does
  viscCap: 200,         // the thickening of the water is capped here
  BSUB: 2, ZSUB: 4,     // the deposit's sub-columns and rows per grid square
  cfl: 0.4, dtMax: 0.02,
  seed: 1,
  vcycles: 1,           // multigrid cycles per step, warm-started from the last
};

// A new frame's four sands, from its own seed: the options to pass to create. Each sand is
// a random mineral with its angle jittered by up to 0.5 deg, and a size from its own band in
// a shuffled order (the sands' order is the page's colours). The mix's angle of repose, which
// the rolling rules use, is the four sands' mean, as DEF's 33 is SANDS' mean.
function randomSands(seed) {
  const rnd = mulberry(seed * 31 + 17), d = SIZE_BANDS.map(([a, b]) => a + (b - a) * rnd());
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  const sands = d.map(dq => {
    const m = MINERALS[Math.floor(rnd() * MINERALS.length)];
    return { name: m.name, rho: m.rho, d: dq, repose: m.repose + (rnd() - 0.5) };
  });
  const repose = sands.reduce((a, q) => a + q.repose, 0) / sands.length;
  return { sands, repose, reposeMax: repose + DEF.reposeMax - DEF.repose };
}
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function level(nx, ny, h) {
  const N = (nx + 1) * (ny + 1);
  return { nx, ny, h, psi: new Float64Array(N), rhs: new Float64Array(N), res: new Float64Array(N),
    aE: new Float64Array(nx * (ny + 1)), aN: new Float64Array((nx + 1) * ny), fix: new Uint8Array(N) };
}

function create(opts) {
  const P = Object.assign({}, DEF, opts || {});
  const NX = P.NX, NY = P.NY, dx = P.W / NX, K = P.sands.length, N = NX * NY;
  const levels = [level(NX, NY, dx)];
  for (;;) {
    const L = levels[levels.length - 1];
    if (L.nx % 2 || L.ny % 2 || L.nx < 16 || L.ny < 8) break;
    levels.push(level(L.nx / 2, L.ny / 2, L.h * 2));
  }
  const BX = NX * P.BSUB, NZ = NY * P.ZSUB, F = n => new Float64Array(n);
  const S = { P, NX, NY, dx, K, BX, NZ, dz: dx / P.ZSUB, t: 0, steps: 0, levels,
    w0: P.sands.map(s => { const R = (s.rho - P.rhoF) / P.rhoF, x = s.d / P.gap;    // x: radius over distance to a pane
      return R * 9.81 * s.d * s.d / (P.C1 * P.nu + Math.sqrt(0.75 * P.C2 * R * 9.81 * s.d ** 3))
        * (1 - 1.004 * x + 0.418 * x ** 3 + 0.21 * x ** 4 - 0.169 * x ** 5); }),
    dr: P.sands.map(s => (s.rho - P.rhoF) / P.rhoF),
    k0: 12 * P.nu / (P.gap * P.gap),
    ph: P.sands.map(() => F(N)), phi: F(N), ex: F(N),
    solid: new Uint8Array(N), rigid: new Uint8Array(N), blk: new Uint8Array(N), air: new Uint8Array(N),
    af: F(N), afOld: F(N), dense: new Uint8Array(N), mark3: new Int32Array(N), cn: F(3), spill: new Map(), afAdd: new Map(), bodies: [], comp: new Int32Array(N), mark: new Int32Array(N), mark2: new Int32Array(N),
    bodyApex: new Int32Array(N).fill(-1), stackI: new Int32Array(N), thick: F(NX), stampN: 0, isl: new Int32Array(N), islStamp: 0,
    buckets: Array.from({ length: NY }, () => []),
    xi: new Float32Array(N), zAir: new Float64Array(N),
    bub: [], pend: [],
    hbs: F(BX), bedC: new Float32Array(BX * NZ * 4), dirty: [NZ, -1],
    up: new Uint8Array(N), raft: [], joint: [], raftFull: false, holes: [], wts: F(BX), drop: F(NX * K), zs: 0, js: 0,
    FS: F(TAB + 2), TH: F(TAB + 2),
    u: F((NX + 1) * NY), v: F(NX * (NY + 1)), us: F((NX + 1) * NY), vs: F(NX * (NY + 1)),
    FLx: F((NX + 1) * NY), FLy: F(NX * (NY + 1)), Ax: F((NX + 1) * NY), Ay: F(NX * (NY + 1)),
    td: F(N), Rp: F(N), Rm: F(N), Gf: F(NY + 1), Fq: F(NY + 1), amt: F(4), tmp: F(4), rollAmt: F(4),
    mass0: null, lastDt: 0, umax: 0, prof: F(6) };
  S.wMax = Math.max(...S.w0);
  S.bed = { h: S.hbs, base: null, C: S.bedC, NZ, ring: false, dirty: S.dirty, cd: null };
  S.ub = { h: F(BX), base: F(BX), C: new Float32Array(BX * NZ * 4), NZ, ring: true, dirty: null, cd: new Uint8Array(NX), rd: new Uint8Array(NZ) };
  // what each material did, for diagnosing the picture (sand amounts in m^2 per unit gap, by sand)
  const Z = () => new Array(K).fill(0);
  S.stats = { drain: Z(), under: Z(), wall: Z(), scour: Z(), toAir: Z(), lump: Z(), brk: Z(), sbDrop: Z(), airDrop: Z(), landed: Z(),
    fall: Z(), fallW: Z(), adv: Z(), aval: [0, 0, 0],   // avalanches: how many, sand they moved (m^2), faces' length (m)
    air: { drained: 0, drainT: 0, drainN: 0, overlap: 0, domes: 0, leaked: 0, merged: 0, spilled: 0, spillBubbles: 0,
           emitted: 0, seeped: 0, onPacked: 0, trapped: 0, moved: 0, backs: 0, selfMoves: 0, fixups: 0, nudges: 0, keptBeyond: 0, netFix: 0, netFixA: 0, islands: 0, escaped: 0, rafted: 0 } };
  // tan of the angle at which sand q stops on a surface of sand p (see trap)
  S.tanQP = new Float64Array(K * K);
  for (let q = 0; q < K; q++) for (let p = 0; p < K; p++) {
    const a = P.sands[q], b = P.sands[p];
    S.tanQP[q * K + p] = Math.tan((0.5 * (a.repose + b.repose) + P.trap * (b.d - a.d) / (b.d + a.d)) * Math.PI / 180);
  }
  // ... and the most it lodges at on a face at rest (an avalanche's start)
  S.tanQPm = S.tanQP.map(t => Math.tan(Math.atan(t) + (P.reposeMax - P.repose) * Math.PI / 180));
  S.tanMax = Math.max(...S.tanQPm);
  S.fine = Int32Array.from(P.sands.map((s, q) => q).sort((a, b) => P.sands[a].d - P.sands[b].d));
  S.surf = F(K); S.order = new Int32Array(K); S.tOn = F(K); S.landH = F(K); S.landA = F(K); S.pool = F(K);
  S.bed.avq = []; S.bed.mob = F(BX);
  S.avSeen = new Uint8Array(2 * BX); S.avE = F(BX + 1);
  S.dWin = []; S.dSec = 0; S.dStep = 0; S.dNext = 1; S.dMax = 0; S.unzipT = 0;   // the streams' sand, per second, for the unzip
  // the room the holes leave, per sub-column, waiting to climb (kinVoid), and how many rows
  // of it each has sent up (its place in the lanes' order)
  S.kAcc = F(BX); S.kNext = 0; S.kRow = F(4); S.kN = new Uint32Array(BX);

  // The hanging sand: the last picture's deposit, turned over. Anything of it
  // still hanging or in the water settles straight down onto that deposit
  // first. With no last picture, make one from a history of pours.
  const rnd = mulberry(P.seed), H = NY * dx;
  const Q = P.prev && P.prev.NX === NX && P.prev.NY === NY && P.prev.BX === BX ? P.prev : null;
  if (Q) {
    S.hbs.set(Q.hbs); S.bedC.set(Q.bedC);
    for (let k = 0; k < N; k++) {
      if (Q.phi[k] <= 0 || (Q.up && Q.up[k])) continue;
      for (let q = 0; q < K; q++) S.amt[q] = Q.ph[q][k] * dx / P.phiBed;
      for (let s = 0; s < P.BSUB; s++) bedAdd(S, S.bed, (k % NX) * P.BSUB + s, S.amt);
    }
    if (Q.ub) for (let b = 0; b < BX; b++) {               // upper sand still on the sheet
      const t = depth(Q.ub, b); if (t <= 0) continue;
      bedDrain(Q, Q.ub, b, t, S.amt); bedAdd(S, S.bed, b, S.amt);
    }
    S.bandOrder = ['the last picture'];
  } else pourHistory(S, rnd);
  S.rnd = mulberry(P.seed * 7 + 3);     // the bubbles' wobble, so a seed replays exactly
  flipToUpper(S);
  // Packing: log strength as a Gaussian random field with a Gaussian variogram.
  { const g = F(N), t = F(N), sg = P.packRange / (2 * dx), R = Math.ceil(3 * sg), w = [];
    for (let d = -R; d <= R; d++) w.push(Math.exp(-d * d / (2 * sg * sg)));
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    for (let k = 0; k < N; k++) g[k] = gauss();
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { let s = 0;
      for (let d = -R; d <= R; d++) { const ii = Math.min(NX - 1, Math.max(0, i + d)); s += w[d + R] * g[ii + j * NX]; } t[i + j * NX] = s; }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { let s = 0;
      for (let d = -R; d <= R; d++) { const jj = Math.min(NY - 1, Math.max(0, j + d)); s += w[d + R] * t[i + jj * NX]; } g[i + j * NX] = s; }
    let v = 0; for (let k = 0; k < N; k++) v += g[k] * g[k]; v = Math.sqrt(v / N) || 1;
    const a = Math.sqrt(Math.max(0, P.packSill - P.packNugget)), b = Math.sqrt(P.packNugget);
    for (let k = 0; k < N; k++) S.xi[k] = Math.exp(a * g[k] / v + b * gauss());
  }
  // The air, at the bottom at the flip: small bubbles across the width, let go within 2 s.
  { const Aair = P.airFrac * P.W * H; let A = 0;
    while (A < Aair) {
      let r = P.rBub[0] + (P.rBub[1] - P.rBub[0]) * rnd();
      if (A + Math.PI * r * r > Aair) r = Math.sqrt((Aair - A) / Math.PI);
      const x = r + (P.W - 2 * r) * rnd();
      S.pend.push({ t: 2 * rnd(), x, y: r + 1e-3, r }); A += Math.PI * r * r;
    } }
  S.air.fill(0);
  S.air0 = airTotal(S);
  // tables of the unit sinking flux phi (1 - phi/phiM)^n and of the thickening
  for (let t = 0; t <= TAB + 1; t++) {
    const p = Math.min(1, t / TAB) * P.phiM, q = 1 - p / P.phiM;
    S.FS[t] = q <= 0 ? 0 : p * Math.pow(q, P.nRZ);
    S.TH[t] = Math.min(P.viscCap, Math.pow(Math.max(q, 0.001), -1.5));
  }
  sumPhi(S);
  S.mass0 = masses(S);
  return S;
}

function sumPhi(S) {
  const phi = S.phi, ph = S.ph, ex = S.ex, dr = S.dr; phi.fill(0); ex.fill(0);
  for (let q = 0; q < S.K; q++) { const a = ph[q], d = dr[q]; for (let k = 0; k < phi.length; k++) { phi[k] += a[k]; ex[k] += d * a[k]; } }
}

// Sand per unit gap (m^2), for each sand: in the water plus in the bed.
function masses(S) {
  const out = [], a = S.dx * S.dx, wb = S.dx / S.P.BSUB, dz = S.dz, C = S.bedC, BX = S.BX;
  for (let q = 0; q < S.K; q++) { let m = 0; const p = S.ph[q]; for (let k = 0; k < p.length; k++) if (!S.up[k]) m += p[k] * a;
    out.push(m); }
  for (let b = 0; b < BX; b++) {
    const h = S.hbs[b]; let r = 0;
    for (; (r + 1) * dz <= h; r++) for (let q = 0; q < S.K; q++) out[q] += C[(b + r * BX) * 4 + q] * dz * wb * S.P.phiBed;
    const f = h - r * dz; if (f > 0) for (let q = 0; q < S.K; q++) out[q] += C[(b + r * BX) * 4 + q] * f * wb * S.P.phiBed;
  }
  const U = S.ub;
  for (let b = 0; b < BX; b++) {
    const lo = U.base[b], hi = U.h[b];
    for (let r = Math.floor(lo / dz); r * dz < hi; r++) {
      const ov = Math.min(hi, (r + 1) * dz) - Math.max(lo, r * dz); if (ov <= 0) continue;
      const o = (b + rowOf(U, r) * BX) * 4; for (let q = 0; q < S.K; q++) out[q] += U.C[o + q] * ov * wb * S.P.phiBed;
    }
  }
  return out;
}
function mass(S) { return masses(S).reduce((a, b) => a + b, 0); }

// ---- the air ---------------------------------------------------------------
// All of it, per unit gap (m^2): bubbles, pockets and air not yet let go.
function airTotal(S) {
  let A = 0; for (let k = 0; k < S.af.length; k++) A += S.af[k];
  A *= S.dx * S.dx;
  for (const b of S.bub) A += Math.PI * b.r * b.r;
  for (const b of S.pend) A += Math.PI * b.r * b.r;
  for (const e of S.spill.values()) A += e.a;
  for (const b of S.raft) A += b.A;
  return A;
}
// Put sand amounts (fractions of one square) into column i from square j
// downward, filling each to just under packing.
function dropSand(S, i, j, amt) {
  const NX = S.NX, cap = S.P.phiDrop;
  for (; j >= 0; j--) {
    const k = i + j * NX; if (S.solid[k] || S.rigid[k] || S.air[k]) continue;
    let tot = 0; for (let q = 0; q < S.K; q++) tot += amt[q];
    if (tot <= 0) return;
    const room = Math.max(0, cap - S.phi[k]), f = Math.min(1, room / tot);
    for (let q = 0; q < S.K; q++) { const m = amt[q] * f; S.ph[q][k] += m; amt[q] -= m; S.phi[k] += m; }
  }
  // nowhere left below: leave it where it was asked to go
  const k = i + Math.max(0, j) * NX; for (let q = 0; q < S.K; q++) { S.ph[q][k] += amt[q]; S.phi[k] += amt[q]; amt[q] = 0; }
}
// ---- THE AIR ---------------------------------------------------------------
// Air takes two forms. BODIES: air resting against the hanging sand or the
// frame's top, held as af[k], the share of square k that is air. A body is a
// connected set of OPEN squares (not packed sand, deposit, a bubble in the
// sand, or sand crowded past phiOpen - broken or cut-off packing, which air
// cannot enter either; a square already holding air stays open, so a body's
// walls do not flicker as loose sand drifts), filled from its highest point down to ONE
// level water surface z, so it takes the true shape of the space it is in:
// sloping sides along a lobe, overhangs, the top air wrapping round the
// hanging blocks, and it never takes packed sand. (v2.5 held one stretch of
// air per column under that column's ceiling; a hole inside the sand became
// the ceiling and the air emptied the packed sand below it: vertical-walled
// boxes and falling slabs, 6% of the hanging sand in the first 5 s.)
// BUBBLES: round and Lagrangian, rising through the water and sliding along
// any sand they meet, on every side.
function openSq(S, k) {
  return !S.solid[k] && !S.rigid[k] && (!S.dense[k] || S.af[k] > 0 || S.afOld[k] > 0);
}
// How closed the sand is at a point, 0..1, bilinear over square centres (the
// frame's walls, top and bottom are closed): a bubble meets a slope, not stairs.
function closedAt(S, x, y) {
  const NX = S.NX, NY = S.NY, dx = S.dx;
  const fx = x / dx - 0.5, fy = y / dx - 0.5, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const c = (ii, jj) => (ii < 0 || jj < 0 || ii >= NX || jj >= NY) ? 1
    : (S.rigid[ii + jj * NX] || S.solid[ii + jj * NX] || S.dense[ii + jj * NX]) ? 1 : 0;
  return (1 - u) * (1 - v) * c(i, j) + u * (1 - v) * c(i + 1, j) + (1 - u) * v * c(i, j + 1) + u * v * c(i + 1, j + 1);
}
// The sand a bubble touches: the direction into it (unit, or null), sensed
// just outside the rim, and whether any of it is above the bubble (a roof).
function contact(S, b, out) {
  let nx = 0, ny = 0, roof = false;
  const R = b.r + 0.3 * S.dx;
  for (let s = 0; s < 16; s++) {
    const a = s * Math.PI / 8, cx = Math.cos(a), cy = Math.sin(a), c = closedAt(S, b.x + R * cx, b.y + R * cy);
    if (c > 0.5) { nx += cx * (c - 0.5); ny += cy * (c - 0.5); if (cy > 0.3) roof = true; }
  }
  const m = Math.hypot(nx, ny); if (m < 1e-9) return false;
  out[0] = nx / m; out[1] = ny / m; out[2] = roof ? 1 : 0; return true;
}
// Move a bubble by (mx, my), sliding along the sand it touches (the part of
// the move into the sand is dropped), then ease it out of any overlap.
// Returns 1 if it rests against a roof.
function slideBubble(S, b, mx, my) {
  const n = S.cn; let roof = 0;
  if (contact(S, b, n)) { const vn = mx * n[0] + my * n[1]; if (vn > 0) { mx -= vn * n[0]; my -= vn * n[1]; } roof = n[2]; }
  b.x += mx; b.y += my;
  for (let it = 0; it < 24; it++) {
    let px = 0, py = 0, hit = 0;
    for (let s = 0; s < 16; s++) {
      const a = s * Math.PI / 8, cx = Math.cos(a), cy = Math.sin(a), c = closedAt(S, b.x + b.r * cx, b.y + b.r * cy);
      if (c > 0.5) { px -= cx * (c - 0.5); py -= cy * (c - 0.5); hit++; }
    }
    if (!hit) break;
    const m = Math.hypot(px, py); if (m < 1e-9) break;
    b.x += 0.06 * S.dx * px / m; b.y += 0.06 * S.dx * py / m;
  }
  return roof;
}
// Put sand amounts (fractions of one square) where air has taken their square
// or pushed them out: into column i from row j down, below any air.
// Where air at square k ends up: up through open squares and along roofs to
// the top of its dome (or the frame's top).
function climbTo(S, k) {
  const NX = S.NX, NY = S.NY;
  for (let g = 0; g < 4 * (NX + NY); g++) {
    if (((k / NX) | 0) === NY - 1) return k;
    if (openSq(S, k + NX)) { k += NX; continue; }
    const n = roofStep(S, k); if (n < 0) return k; k = n;
  }
  return k;
}
// The nearest square along k's row, under the roof all the way, with open
// water above it (-1 if none: k is at the top of its dome).
function roofStep(S, k) {
  const NX = S.NX, NY = S.NY, j = (k / NX) | 0, i0 = k % NX;
  let best = -1, bd = 1e9;
  for (const sg of [-1, 1]) for (let d = 1; d < bd; d++) {
    const i = i0 + sg * d; if (i < 0 || i >= NX) break;
    const q = k + sg * d; if (!openSq(S, q)) break;
    if (j < NY - 1 && openSq(S, q + NX)) { best = q; bd = d; break; }
  }
  return best;
}
// Does a bubble of radius r fit with its centre at (x, y)?
function fits(S, x, y, r) {
  if (closedAt(S, x, y) > 0.5) return false;
  for (let s = 0; s < 16; s++) if (closedAt(S, x + r * Math.cos(s * Math.PI / 8), y + r * Math.sin(s * Math.PI / 8)) > 0.5) return false;
  return true;
}
// Air set free at square k: it rises from there as bubbles where a bubble
// fits; up a narrower passage (a slot between lobes) it goes straight to the
// top of the dome the passage leads to (bubbles that could not fit were
// pushed back, stuck, and drained into the body they left, round and round).
function release(S, k, A, src) {
  const dx = S.dx, x = (k % S.NX + 0.5) * dx, y = ((k / S.NX) | 0) * dx;
  if (fits(S, x, y + 1.5e-3, 1.5e-3)) { spillAdd(S, k, A, src); return; }
  if (A <= Math.PI * 0.9e-3 * 0.9e-3 && fits(S, x, y + 0.6e-3, 0.6e-3)) { spillAdd(S, k, A, src); return; }
  const t = climbTo(S, k); S.stats.air.moved += A; S.dbgEv && S.dbgEv('move', k, t, A, src);
  if (src >= 0 && S.bodyApex[t] === src) S.stats.air.selfMoves++;
  S.afAdd.set(t, (S.afAdd.get(t) || 0) + A);         // added once every body has settled
}
// Loose sand in air falls through it: into the water under the body's level z.
function dropThroughAir(S, i, z, amt) { dropSand(S, i, Math.floor(z / S.dx - 0.5), amt); }
function spillAdd(S, k, A, src) {
  const e = S.spill.get(k); if (e) { e.a += A; if (src >= 0) e.src = src; } else S.spill.set(k, { a: A, src });
}
function airStep(S, dt) {
  const P = S.P, NX = S.NX, NY = S.NY, N = NX * NY, dx = S.dx, dx2 = dx * dx, u = S.u, v = S.v, W = NX + 1, af = S.af;
  const ST = S.stats.air, amt = S.tmp, BKprev = k => S.bodyApex[k];
  { const D = S.dense, lo = P.phiDense[0], hi = P.phiDense[1], phi = S.phi;
    for (let k = 0; k < N; k++) { if (phi[k] >= hi) D[k] = 1; else if (phi[k] < lo) D[k] = 0; } }
  // 1. BUBBLES IN WATER: let go, carried by the water, rising, sliding along
  // sand; one that meets a body of air drains into it over about tJoin (its
  // top held where it touched); one held still under sand (a dome's top)
  // drains into a new body there.
  for (let n = S.pend.length - 1; n >= 0; n--) if (S.pend[n].t <= S.t) {
    const b = S.pend.splice(n, 1)[0]; b.ph = 6.28 * S.rnd(); b.src = -1; b.age = 0; b.still = 0; S.bub.push(b); }
  const keep = [];
  for (const b of S.bub) {
    b.age += dt;
    if (b.m) {
      const A = Math.PI * b.r * b.r, give = A * Math.min(1, dt / P.tJoin);
      if (A - give < Math.PI * 0.4e-3 * 0.4e-3) { af[b.m.k] += A / dx2; ST.drained += A; ST.drainT += b.age; ST.drainN++; continue; }
      af[b.m.k] += give / dx2; ST.drained += give;
      b.r = Math.sqrt((A - give) / Math.PI); b.y = b.m.top - b.r; keep.push(b); continue;
    }
    const i = Math.min(NX - 1, Math.max(0, Math.floor(b.x / dx))), j = Math.min(NY - 1, Math.max(0, Math.floor(b.y / dx)));
    const uc = 0.5 * (u[i + j * W] + u[i + 1 + j * W]), vc = 0.5 * (v[i + j * NX] + v[i + (j + 1) * NX]);
    const rise = P.uRise * Math.min(1.3, Math.max(0.5, Math.sqrt(b.r / 2e-3)));
    const x0 = b.x, y0 = b.y;
    b.ph += dt * 4;
    const roof = slideBubble(S, b, (uc + 0.004 * Math.sin(b.ph)) * dt, (vc + rise) * dt);
    b.x = Math.min(P.W - b.r, Math.max(b.r, b.x)); b.y = Math.min(NY * dx - b.r, Math.max(b.r, b.y));
    { let n = 0; for (let s2 = 0; s2 < 16; s2++) if (closedAt(S, b.x + b.r * Math.cos(s2 * Math.PI / 8), b.y + b.r * Math.sin(s2 * Math.PI / 8)) > 0.5) n++;
      ST.overlap = Math.max(ST.overlap, n / 16); }
    // reaching the air sheet under the upper sand: it joins the raft there
    if (b.y < S.zs && b.y + b.r >= S.zs - 0.3 * dx) {
      const bs = Math.min(S.BX - 1, Math.floor(b.x / (dx / P.BSUB)));
      if (depth(S.ub, bs) > 0) { raftAdd(S, b.x, b.r); ST.rafted++; continue; }
    }
    // touching a body of air (not the one it spilled from): drain into it
    let tgt = -1;
    const i0 = Math.max(0, Math.floor((b.x - b.r) / dx) - 1), i1 = Math.min(NX - 1, Math.floor((b.x + b.r) / dx) + 1);
    const j0 = Math.max(0, Math.floor((b.y - b.r) / dx) - 1), j1 = Math.min(NY - 1, Math.floor((b.y + b.r) / dx) + 1);
    for (let jj = j1; jj >= j0 && tgt < 0; jj--) for (let ii = i0; ii <= i1; ii++) {
      const k = ii + jj * NX; if (af[k] < 0.5 || (b.src >= 0 && S.bodyApex[k] === b.src)) continue;
      if (Math.hypot((ii + 0.5) * dx - b.x, (jj + 0.5) * dx - b.y) <= b.r + 0.75 * dx) { tgt = k; break; }
    }
    if (tgt >= 0) { b.m = { k: tgt, top: b.y + b.r }; keep.push(b); continue; }
    // held still under sand: the top of a dome
    if (b.wx === undefined) { b.wx = b.x; b.wy = b.y; b.wt = 0; }
    b.wt += dt;
    if (b.wt >= P.tStill) {                            // over the last tStill: did it get anywhere?
      const moved = Math.hypot(b.x - b.wx, b.y - b.wy);
      b.still = roof > 0 && moved < 0.25 * rise * b.wt ? b.still + b.wt : 0;
      b.wx = b.x; b.wy = b.y; b.wt = 0;
    }
    if (b.still >= P.tStill) {
      let k = Math.min(NX - 1, Math.floor(b.x / dx)) + Math.min(NY - 1, Math.floor((b.y + b.r - 0.5 * dx) / dx)) * NX;
      if (!openSq(S, k)) k = Math.min(NX - 1, Math.floor(b.x / dx)) + Math.min(NY - 1, Math.floor(b.y / dx)) * NX;
      const t = climbTo(S, k), far = Math.abs(t % NX - k % NX) + Math.abs(((t / NX) | 0) - ((k / NX) | 0));
      b.nudge = (b.nudge || 0) + 1; b.still = 0;
      if (far > P.maxClimb && b.nudge <= 3) {          // caught on a step of a long roof: on up it goes
        const sx = Math.sign(t % NX - k % NX); b.x += sx * 0.5 * dx; b.y += 0.3 * dx; b.still = 0; ST.nudges++;
      } else { b.m = { k: far > P.maxClimb ? k : t, top: b.y + b.r }; ST.domes++; }   // (too big for the way on: it stays)
    }
    keep.push(b);
  }
  // touching free bubbles merge (a draining one does not take more in: what
  // it drains goes to one body, and a bubble spilled from that body must not
  // ride back into it)
  for (let m = 0; m < keep.length; m++) for (let n = m + 1; n < keep.length; n++) {
    const A = keep[m], B = keep[n]; if (!A || !B || A.m || B.m) continue;
    if (Math.hypot(A.x - B.x, A.y - B.y) < 0.9 * (A.r + B.r)) {
      const a1 = A.r * A.r, a2 = B.r * B.r;
      A.x = (A.x * a1 + B.x * a2) / (a1 + a2); A.y = (A.y * a1 + B.y * a2) / (a1 + a2); A.r = Math.sqrt(a1 + a2);
      if (a2 > a1) A.src = B.src; A.age = Math.min(A.age, B.age); keep[n] = null;
    }
  }
  S.bub = keep.filter(b => b);
  S.dbgAir && S.dbgAir('bubbles');

  // 2. BODIES SETTLE: hydrostatics, exactly, every step (air moves faster than
  // anything else here). Each body climbs along its roof to the highest place
  // it can reach (a few squares at most: farther than maxClimb, or up 3 free
  // squares, and it stays and LEAKS bubbles from that exit instead, at the
  // rate a bubble's width of air rises, so air is seen to travel), then fills
  // down from there with one level surface, in order of height, like an
  // upside-down lake. Reaching a LIP (open water beyond, higher than the
  // surface, reached only by going below it) it holds at the lip, and the
  // rest spills there as bubbles that rise into the next dome - unless that
  // dome is already full of air down to the lip: then the two are one body.
  const comp = S.comp, mark = S.mark, BK = S.bodyApex, BQ = S.buckets, st = S.stackI;
  comp.fill(-1); BK.fill(-1); S.afOld.fill(0);
  const airIn = (() => { let a = 0; for (let k = 0; k < N; k++) a += af[k]; a *= dx2; for (const e of S.spill.values()) a += e.a; return a; })();
  const comps = [];
  for (let k0 = 0; k0 < N; k0++) {
    if (af[k0] <= 0 || comp[k0] >= 0) continue;
    const id = comps.length, sq = []; let V = 0, top = k0, sp = 0;
    st[sp++] = k0; comp[k0] = id;
    while (sp) {
      const k = st[--sp], i = k % NX; sq.push(k); V += af[k];
      if (((k / NX) | 0) > ((top / NX) | 0)) top = k;
      if (i > 0 && af[k - 1] > 0 && comp[k - 1] < 0) { comp[k - 1] = id; st[sp++] = k - 1; }
      if (i < NX - 1 && af[k + 1] > 0 && comp[k + 1] < 0) { comp[k + 1] = id; st[sp++] = k + 1; }
      if (k >= NX && af[k - NX] > 0 && comp[k - NX] < 0) { comp[k - NX] = id; st[sp++] = k - NX; }
      if (k + NX < N && af[k + NX] > 0 && comp[k + NX] < 0) { comp[k + NX] = id; st[sp++] = k + NX; }
    }
    comps.push({ id, sq, V: V * dx2, top, done: false });
  }
  const byId = comps.slice();
  comps.sort((p, q) => q.top - p.top);
  const bodies = S.bodies = [];
  const alongRoof = k => roofStep(S, k);
  // a body touching another becomes part of it
  const absorb = q => {
    let V = 0;
    const id = comp[q]; if (id >= 0 && !byId[id].done) { const cc = byId[id]; cc.done = true; V += cc.V; for (const s of cc.sq) af[s] = 0; }
    if (BK[q] >= 0) for (const bd of bodies) if (bd.apex === BK[q] && !bd.dead) {
      bd.dead = true; V += bd.V; for (const s of bd.sq) { af[s] = 0; BK[s] = -1; } }
    if (V > 0) ST.merged++;
    return V;
  };
  let stamp = ++S.stampN;
  for (const c of comps) {
    if (c.done) continue;
    c.done = true;
    let V = c.V; for (const k of c.sq) { S.afOld[k] = af[k]; af[k] = 0; }
    let top0 = -1; for (const q of c.sq) if (openSq(S, q) && (top0 < 0 || ((q / NX) | 0) > ((top0 / NX) | 0))) top0 = q;
    if (top0 < 0) { spillAdd(S, c.top, V, -1); ST.trapped += V; continue; }
    c.top = top0;
    // climb
    let k = c.top, ups = 0, path = 0, exit = -1, cap = NY - 1;
    for (let g = 0; g < 4 * (NX + NY); g++) {
      const j = (k / NX) | 0; if (j === NY - 1) break;
      if (openSq(S, k + NX)) {
        if (exit < 0) exit = k;
        ups++; path++; if (ups >= 3 || path > P.maxClimb) break;
        k += NX; continue;
      }
      ups = 0;
      const n = alongRoof(k); if (n < 0) break;
      if (exit < 0) exit = n;
      path += Math.abs(n - k); if (path > P.maxClimb) break;
      k = n;
    }
    let apex = k, leaked = false;
    if (ups >= 3 || path > P.maxClimb) {           // it stays, and leaks from its exit
      apex = c.top; cap = (c.top / NX) | 0;
      let w = 0; for (const q of c.sq) if (((q / NX) | 0) === cap && q + NX < N && openSq(S, q + NX)) w++;
      const leak = Math.min(V, P.uRise * dx * Math.max(1, w) * dt);
      if (leak > 0 && exit >= 0 && exit + NX < N) { S.dbgEv && S.dbgEv('leak', c.top, exit + NX, leak, k); V -= leak; release(S, exit + NX, leak, c.top); ST.leaked += leak; leaked = true; }
    }
    // fill from the apex, highest squares first
    stamp = ++S.stampN;
    let maxR = -1;
    const push = q => { mark[q] = stamp; const r = (q / NX) | 0; BQ[r].push(q); if (r > maxR) maxR = r; };
    const pop = () => { while (maxR >= 0 && !BQ[maxR].length) maxR--; return maxR < 0 ? -1 : BQ[maxR].pop(); };
    const full = [], rowL = []; let cur = (apex / NX) | 0, z = 0, frac = 0, vent = false, excess = 0, lipQ = -1, lipRoom = 0, lipSeen = -1;
    push(apex);
    for (;;) {
      const q = pop();
      if (q < 0) {                                  // the space has run out
        if (V <= (full.length + rowL.length) * dx2) break;   // the level is in the last row
        for (const s of rowL) full.push(s); rowL.length = 0;  // a closed cavity, smaller than its air
        z = cur * dx; frac = 0; excess = V - full.length * dx2; ST.trapped += excess;
        break;
      }
      const r = (q / NX) | 0;
      if (r <= cur) V += absorb(q);
      if (r > cur) {                                // beyond a lip
        if (S.mark3[q] === stamp) continue;         // that dome has been looked at already
        // the dome beyond it: open squares above this level reached from q
        const reg = []; let sp = 0, big = false, other = 0;
        lipSeen = ++S.stampN; S.mark2[q] = lipSeen; st[sp++] = q;
        S.mark3[q] = stamp;
        while (sp) {
          const p = st[--sp]; reg.push(p);
          if (comp[p] !== c.id) other += af[p] * dx2;
          if (reg.length > 6000) { big = true; break; }
          const i = p % NX, pr = (p / NX) | 0;
          for (const n of [i > 0 ? p - 1 : -1, i < NX - 1 ? p + 1 : -1, pr - 1 > cur ? p - NX : -1, pr < NY - 1 ? p + NX : -1])
            if (n >= 0 && S.mark2[n] !== lipSeen && mark[n] !== stamp && openSq(S, n)) { S.mark2[n] = lipSeen; S.mark3[n] = stamp; st[sp++] = n; }
        }
        // enough air, with what is there already, to fill both domes down to the lip: one body
        if (!big && V + other >= (full.length + reg.length) * dx2) {
          for (const p of reg) V += absorb(p);
          for (const p of reg) { af[p] = 0; mark[p] = stamp; full.push(p); }
          for (const p of reg) { const i = p % NX;
            for (const n of [i > 0 ? p - 1 : -1, i < NX - 1 ? p + 1 : -1, p >= NX ? p - NX : -1])
              if (n >= 0 && mark[n] !== stamp && ((n / NX) | 0) <= cur && openSq(S, n)) push(n); }
          ST.merged++;
          continue;
        }
        // no: what air is already up there stays there (lifting it back into this body every
        // step and spilling a step's worth over again kept a notch from ever filling); this
        // body holds at the lip and the rest goes over it, as bubbles, at the rate they rise
        let kept = 0; for (const p of reg) if (comp[p] === c.id && S.afOld[p] > 0) kept += S.afOld[p] * dx2;
        if (kept > 0 && !big) {                     // it settles there now, from that dome's top down,
          V -= kept;                                // with any other air already in that dome
          for (const p of reg) kept += absorb(p);
          const byRow = reg.slice().sort((p1, p2) => p2 - p1);   // higher rows first (index order)
          const kb = { apex: byRow[0], z: 0, V: kept, sq: [], top: false, vent: false, dead: false };
          for (const p of reg) af[p] = 0;
          let left = kept / dx2, n0 = 0;
          while (n0 < byRow.length && left > 1e-12) {
            const r0 = (byRow[n0] / NX) | 0; let n1 = n0; while (n1 < byRow.length && ((byRow[n1] / NX) | 0) === r0) n1++;
            const f = Math.min(1, left / (n1 - n0));
            for (let m = n0; m < n1; m++) { af[byRow[m]] = f; kb.sq.push(byRow[m]); }
            left -= f * (n1 - n0); kb.z = (r0 + 1 - f) * dx; n0 = n1;
          }
          if (left > 1e-12) { V += left * dx2; kb.V -= left * dx2; }   // (more than that dome holds: back here)
          for (const p of kb.sq) { BK[p] = kb.apex; S.zAir[p] = kb.z; if (p >= N - NX) kb.top = true; }
          bodies.push(kb); ST.keptBeyond += kb.V;
        }
        if (lipQ < 0) { lipQ = q; lipRoom = full.length * dx2; }
        continue;
      }
      if (r < cur) {
        if (V <= (full.length + rowL.length) * dx2) break;
        for (const s of rowL) full.push(s); rowL.length = 0; cur = r;
      }
      rowL.push(q);
      const i = q % NX;
      if (i > 0 && mark[q - 1] !== stamp && openSq(S, q - 1)) push(q - 1);
      if (i < NX - 1 && mark[q + 1] !== stamp && openSq(S, q + 1)) push(q + 1);
      if (r > 0 && mark[q - NX] !== stamp && openSq(S, q - NX)) push(q - NX);
      if (r < cap && mark[q + NX] !== stamp && openSq(S, q + NX)) push(q + NX);
    }
    for (let r = 0; r < NY; r++) BQ[r].length = 0;
    if (rowL.length) {                              // the level falls inside this row
      frac = Math.max(0, Math.min(1, (V - full.length * dx2) / (rowL.length * dx2)));
      z = (cur + 1 - frac) * dx;
    }
    const body = { apex, z, V: 0, sq: [], top: false, vent: vent || leaked, dead: false };
    for (const s of full) { af[s] = 1; body.sq.push(s); }
    if (frac > 0) for (const s of rowL) { af[s] = frac; body.sq.push(s); }
    if (excess > 0) { if (body.sq.length) af[body.sq[0]] += excess / dx2; else spillAdd(S, apex, excess, -1); }
    for (const s of body.sq) { BK[s] = apex; S.zAir[s] = z; body.V += af[s] * dx2; if (s >= N - NX) body.top = true; }
    if (Math.abs(body.V - V) > 1e-6 * dx2 && body.V > 0) {   // never more (or less) air than it had
      const f = V / body.V; for (const s of body.sq) af[s] *= f; body.V = V; ST.fixups++; }
    if (lipQ >= 0 && V > lipRoom && body.V > 0) {           // what is past the lip leaves under it
      const out = Math.min(V - lipRoom, P.uRise * dx * P.tSpill * dt), f = (body.V - out) / body.V;
      for (const s of body.sq) af[s] *= f; body.V -= out; body.vent = true;
      S.dbgEv && S.dbgEv('spill', apex, lipQ, out, c.top); release(S, lipQ, out, apex); ST.spilled += out;
    }
    if (body.sq.length) bodies.push(body);
    S.dbgComp && S.dbgComp(c, apex, V, body, lipQ, excess);
  }
  S.bodies = bodies.filter(b => !b.dead);
  for (const [t, A] of S.afAdd) { af[t] += A / dx2; if (BK[t] < 0) S.zAir[t] = ((t / NX | 0) + 1) * dx - Math.min(1, af[t]) * dx; }
  S.afAdd.clear();
  for (const bd of S.bodies) { bd.V = 0; for (const q of bd.sq) bd.V += af[q] * dx2; }   // (what was moved in)
  { // the air's total must not change in settling: a safety net, counted (ST.netFix) so it is seen
    let a = 0; for (let k = 0; k < N; k++) a += af[k]; a *= dx2; for (const e of S.spill.values()) a += e.a;
    const d = airIn - a;
    if (Math.abs(d) > 1e-9 * Math.max(airIn, 1e-12) + 1e-15) {
      let big = null; for (const bd of S.bodies) if (!big || bd.V > big.V) big = bd;
      if (big && big.V + d > 0) { const f = (big.V + d) / big.V; for (const q of big.sq) af[q] *= f; big.V += d; }
      ST.netFix++; ST.netFixA += Math.abs(d);
    } }
  S.dbgAir && S.dbgAir('settle');
  // spilled and leaked air becomes bubbles where it was left
  for (const [k, e] of S.spill) {
    const x = (k % NX + 0.5) * dx, y0 = (k / NX | 0) * dx;
    let rf = 3e-3; while (rf > 0.6e-3 && !fits(S, x, y0 + rf, rf)) rf *= 0.8;   // as big as fits there
    const rmin = Math.min(1.5e-3, rf);
    while (e.a >= Math.PI * rmin * rmin) {
      const r = Math.min(rf, Math.sqrt(e.a / Math.PI));
      S.bub.push({ x: Math.min(P.W - r, Math.max(r, x)), y: Math.min(NY * dx - r, y0 + r), r, ph: 6.28 * S.rnd(), src: e.src, age: 0, still: 0 });
      e.a -= Math.PI * r * r; ST.spillBubbles++;
    }
    if (e.a <= 1e-15) S.spill.delete(k);
  }

  S.dbgAir && S.dbgAir('spillbubbles');
  // 3. which squares are air for the water and the sand: the raft, and bodies
  // thicker than aSeal in their column (a thinner film is broken, beads up, and
  // lets water reach the grains). Loose sand caught in air drops to the water
  // below it.
  const air = S.air, zA = S.zAir, thick = S.thick; air.fill(0);
  { const D = []; for (const b of S.raft) raftDiscs(S, b, D);     // the sheet, hanging under the upper sand
    for (const b of D)
      for (let jj = Math.max(0, Math.floor((b.y - b.r) / dx)); jj < S.js; jj++)
        for (let ii = Math.max(0, Math.floor((b.x - b.r) / dx)); ii <= Math.min(NX - 1, Math.floor((b.x + b.r) / dx)); ii++) {
          const ex = (ii + 0.5) * dx - b.x, ey = (jj + 0.5) * dx - b.y;
          if (ex * ex + ey * ey <= b.r * b.r) { air[ii + jj * NX] = 1; zA[ii + jj * NX] = b.y - b.r; }
        } }
  for (const bd of S.bodies) {
    for (const s of bd.sq) thick[s % NX] = 0;
    for (const s of bd.sq) thick[s % NX] += af[s] * dx;
    for (const s of bd.sq) {
      if (af[s] < 0.5 || thick[s % NX] < P.aSeal) continue;
      air[s] = 1; zA[s] = bd.z;
      if (S.rigid[s]) ST.onPacked++;
      if (S.phi[s] > 0) { for (let q = 0; q < S.K; q++) { amt[q] = S.ph[q][s]; S.stats.airDrop[q] += amt[q] * dx2; S.ph[q][s] = 0; }
        S.phi[s] = 0; dropThroughAir(S, s % NX, bd.z, amt); }
      // thin loose sand resting on the air falls through it (crowded sand - broken or cut-off
      // packing - stays, held at the air's surface like packing: letting it fall emptied a
      // broken seam row by row and the air rose into a vertical slot)
      const u = s + NX;
      if (u < N && !S.rigid[u] && !S.solid[u] && !S.dense[u] && !(af[u] >= 0.5) && S.phi[u] > 0) {
        for (let q = 0; q < S.K; q++) { amt[q] = S.ph[q][u]; S.stats.airDrop[q] += amt[q] * dx2; S.ph[q][u] = 0; }
        S.phi[u] = 0; dropThroughAir(S, s % NX, bd.z, amt); }
    }
  }
  dropIslands(S);
}
// Crowded loose sand cut off INSIDE the air falls through it. A group of dense squares that are
// not packed (broken or cut-off packing) and touch air, but no water and nothing packed, has
// nothing holding it: it falls into the water below the air. (Held at the air's surface like
// packing, such groups hung in the pockets as islands of up to 16 squares for over 70 s. A group
// touching packed sand - a broken seam between lobes - stays: letting that fall emptied seams
// row by row into slots.)
function dropIslands(S) {
  const NX = S.NX, NY = S.NY, N = NX * NY, air = S.air, D = S.dense, R = S.rigid, sol = S.solid, phi = S.phi;
  const mk = S.isl, st = S.stackI, amt = S.tmp, dx2 = S.dx * S.dx, grp = S.islGrp || (S.islGrp = []);
  const stamp = ++S.islStamp;
  const member = k => D[k] && !R[k] && !sol[k] && !air[k] && phi[k] > 0;
  for (let k0 = 0; k0 < N; k0++) {
    if (!air[k0]) continue;                                 // start from the air's edges
    const i0 = k0 % NX, j0 = (k0 / NX) | 0;
    for (let s0 = 0; s0 < 4; s0++) {
      const c = s0 === 0 ? (i0 > 0 ? k0 - 1 : -1) : s0 === 1 ? (i0 < NX - 1 ? k0 + 1 : -1) : s0 === 2 ? (j0 > 0 ? k0 - NX : -1) : (j0 < NY - 1 ? k0 + NX : -1);
      if (c < 0 || mk[c] === stamp || !member(c)) continue;
      let top = 0, held = false, wet = false; grp.length = 0; mk[c] = stamp; st[top++] = c;
      while (top) {
        const k = st[--top], i = k % NX, j = (k / NX) | 0; grp.push(k);
        for (let s = 0; s < 4; s++) {
          const n = s === 0 ? (i > 0 ? k - 1 : -1) : s === 1 ? (i < NX - 1 ? k + 1 : -1) : s === 2 ? (j > 0 ? k - NX : -1) : (j < NY - 1 ? k + NX : -1);
          if (n < 0) continue;                                // the frame's sides and top hold nothing
          if (R[n] || sol[n]) { held = true; continue; }
          if (air[n]) continue;
          if (member(n)) { if (mk[n] !== stamp) { mk[n] = stamp; st[top++] = n; } continue; }
          wet = true;
        }
      }
      if (held || wet) continue;
      for (const k of grp) {                                  // into the water under the air below it
        const i = k % NX; let b = k - NX; while (b >= 0 && !air[b]) b -= NX;
        if (b < 0) continue;
        for (let q = 0; q < S.K; q++) { amt[q] = S.ph[q][k]; S.stats.airDrop[q] += amt[q] * dx2; S.ph[q][k] = 0; }
        phi[k] = 0; D[k] = 0; dropThroughAir(S, i, S.zAir[b], amt);
        S.stats.air.islands++;
      }
    }
  }
}
// The air for the page, at twice the grid's resolution, two bytes a texel:
// R = air (255 = all air), G = 255 where the square is packed sand (hanging,
// deposit or a jam), so the page can soften the air's outline without pulling
// it back from the sand it touches. Bodies fill each of their squares above
// their level surface z; bubbles are discs.
function airTexture(S) {
  const NX = S.NX, NY = S.NY, dx = S.dx, AX = NX * 2, AY = NY * 2, h = dx / 2, out = new Uint8Array(AX * AY * 2), af = S.af;
  for (let r = 0; r < AY; r++) for (let c = 0; c < AX; c++) {
    const k = (c >> 1) + (r >> 1) * NX;
    if (S.rigid[k] || S.solid[k] || S.phi[k] > 0.45) out[(c + r * AX) * 2 + 1] = 255;
  }
  for (let k = 0; k < NX * NY; k++) {
    if (af[k] <= 0) continue;
    const i = k % NX, j = (k / NX) | 0, z = S.zAir[k], y1 = (j + 1) * dx;
    for (let s = 0; s < 2; s++) {
      const ya = j * dx + s * h, cov = Math.max(0, Math.min(1, (Math.min(ya + h, y1) - Math.max(ya, z)) / h));
      if (cov <= 0) continue;
      const v = Math.round(255 * cov), o = (2 * i + (2 * j + s) * AX) * 2;
      if (v > out[o]) out[o] = v; if (v > out[o + 2]) out[o + 2] = v;
    }
  }
  const D = []; for (const b of S.raft) raftDiscs(S, b, D);
  for (const b of S.bub.concat(D)) {
    const c0 = Math.max(0, Math.floor((b.x - b.r) / h) - 1), c1 = Math.min(AX - 1, Math.floor((b.x + b.r) / h) + 1);
    const r0 = Math.max(0, Math.floor((b.y - b.r) / h) - 1), r1 = Math.min(AY - 1, Math.floor((b.y + b.r) / h) + 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const d = Math.hypot((c + 0.5) * h - b.x, (r + 0.5) * h - b.y), cov = Math.min(1, Math.max(0, 0.5 + (b.r - d) / h));
      const o = (c + r * AX) * 2, val = Math.round(255 * cov); if (val > out[o]) out[o] = val;
    }
  }
  return { AX, AY, data: out };
}

// ---- stacks of sand: the deposit and the upper sand -------------------------
// A BED is a height per sub-column and a stack of rows (dz each) holding the
// share of each sand: the layers. Two beds: the deposit on the frame's floor
// (S.bed), and the UPPER SAND resting on the air sheet (S.ub). The upper sand
// drains from its BOTTOM, so its columns run from base[b] to h[b] (row
// coordinates, m, from 0 at the flip) and row r is kept at r mod NZ: its layers
// move down exactly as it drains, never smeared (rows move between columns
// whole: kinVoid).
function rowOf(B, r) { return B.ring ? r % B.NZ : r; }
function markBed(S, B, b, r) {
  if (B.dirty) { if (r < B.dirty[0]) B.dirty[0] = r; if (r > B.dirty[1]) B.dirty[1] = r; }
  if (B.rd && r >= 0) B.rd[rowOf(B, r)] = 1;               // the page re-sends rows whose shares changed
  if (B.cd) B.cd[(b / S.P.BSUB) | 0] = 1;
}
function depth(B, b) { return B.base ? B.h[b] - B.base[b] : B.h[b]; }
// Add heights amt[q] (m, at bed packing) to the top of sub-column b.
function bedAdd(S, B, b, amt) {
  let tot = 0; for (let q = 0; q < S.K; q++) tot += amt[q];
  if (tot <= 0) return;
  const dz = S.dz, C = B.C, BX = S.BX; let h = B.h[b], left = tot;
  while (left > 1e-15) {
    let r = Math.floor(h / dz), f = h / dz - r;
    if (f > 1 - 1e-9) { r++; f = 0; h = r * dz; }
    if (!B.ring && r >= B.NZ) { h += left; break; }
    const put = Math.min(left, (1 - f) * dz), wN = put / dz, ws = f + wN, o = (b + rowOf(B, r) * BX) * 4;
    for (let q = 0; q < S.K; q++) C[o + q] = (C[o + q] * f + (amt[q] / tot) * wN) / ws;
    markBed(S, B, b, r);
    h += put; left -= put;
  }
  B.h[b] = h;
}
// Take height m off the top; out[q] gets the heights of each sand removed.
function bedTake(S, B, b, m, out) {
  const dz = S.dz, C = B.C, BX = S.BX, lo = B.base ? B.base[b] : 0; let h = B.h[b], left = Math.min(m, h - lo);
  for (let q = 0; q < S.K; q++) out[q] = 0;
  while (left > 1e-15) {
    let r = Math.floor(h / dz), f = h / dz - r;
    if (f < 1e-9) { r--; f = 1; }
    if (r < 0) break;
    const take = Math.min(left, f * dz), o = (b + rowOf(B, r) * BX) * 4;
    for (let q = 0; q < S.K; q++) out[q] += C[o + q] * take;
    markBed(S, B, b, r);
    h -= take; left -= take;
  }
  B.h[b] = Math.max(lo, h);
}
// Take height m off the BOTTOM of an upper-sand column (it drains through a
// hole in the air sheet); out[q] gets the heights of each sand removed.
function bedDrain(S, B, b, m, out) {
  const dz = S.dz, C = B.C, BX = S.BX; let lo = B.base[b], left = Math.min(m, B.h[b] - lo);
  for (let q = 0; q < S.K; q++) out[q] = 0;
  while (left > 1e-15) {
    let r = Math.floor(lo / dz), top = (r + 1) * dz;
    if (top - lo < 1e-12) { r++; top += dz; }
    const take = Math.min(left, top - lo), o = (b + rowOf(B, r) * BX) * 4;
    for (let q = 0; q < S.K; q++) out[q] += C[o + q] * take;
    lo += take; left -= take;
  }
  B.base[b] = Math.min(lo, B.h[b]); markBed(S, B, b, -1);
}

// ---- sorting: an avalanche runs down the face and stops along it
// The grains of the top layer (surfDepth) at sub-column b, as shares in out.
function surfMix(S, B, b, out) {
  const K = S.K, dz = S.dz, C = B.C, BX = S.BX, h = B.h[b], lo = Math.max(B.base ? B.base[b] : 0, h - S.P.surfDepth);
  out.fill(0);
  if (h - lo <= 1e-9) { out.fill(1 / K); return; }         // the frame's floor, or the air sheet
  let tot = 0;
  for (let r = Math.floor(h / dz - 1e-9); r >= 0 && (r + 1) * dz > lo; r--) {
    if (!B.ring && r >= B.NZ) continue;
    const ov = Math.min(h, (r + 1) * dz) - Math.max(lo, r * dz); if (ov <= 0) continue;
    const o = (b + rowOf(B, r) * BX) * 4; for (let q = 0; q < K; q++) out[q] += C[o + q] * ov; tot += ov;
  }
  if (tot > 0) for (let q = 0; q < K; q++) out[q] /= tot; else out.fill(1 / K);
}
// tan of the angle sand q stops at on a surface of mix c, and a mix's own (its grains on itself)
function tanOn(S, q, c, T) { const K = S.K; T = T || S.tanQP; let t = 0; for (let p = 0; p < K; p++) t += c[p] * T[q * K + p]; return t; }
function tanSelf(S, c, T) { let t = 0; for (let q = 0; q < S.K; q++) t += c[q] * tanOn(S, q, c, T); return t; }
// amt[q] are heights of each sand set moving at sub-column b, going dir (+1
// right). The grains run down toward the TOE (where the ground stops falling by
// more than rollFlat of the rest slope), and each stops at the first place the
// face below it is no steeper than its angle on the grains it meets there (tanQP:
// steep for angular grains, steeper still for fine grains on coarse ones, which
// drop into the gaps; shallow for coarse grains on fine ones, which roll on).
// Whatever reaches the toe stays there. Grains LODGING on a deposit at rest
// (lodge) hold on up to that angle + (reposeMax - repose), the most a face at rest
// stands (tanQPm), so they build a steeper cap down from the peak (the face's loose
// LOAD, B.mob, until it next fails); when some run all the way to the toe they stay
// there, and the face is checked: if its cap has reached the toe it fails as a whole
// (avalanche).
function slide(S, B, b, dir, amt, lodge) {
  const P = S.P, BX = S.BX, K = S.K, put = S.rollAmt, c = S.surf, tq = S.tOn, ord = S.order, w = S.dx / P.BSUB;
  const stop = P.rollFlat * w * Math.tan(P.repose * Math.PI / 180), T = lodge ? S.tanQPm : S.tanQP, hops = lodge ? BX : P.rollMax;
  for (let hop = 0; ; hop++) {
    const nb = b + dir, toe = hop >= hops || nb < 0 || nb >= BX || depth(B, b) - depth(B, nb) < stop;
    if (toe) { if (lodge && hop > 0) B.avq.push(b, dir); bedAdd(S, B, b, amt); return; }
    surfMix(S, B, b, c);
    for (let q = 0; q < K; q++) { tq[q] = tanOn(S, q, c, T); ord[q] = q; }
    for (let x = 1; x < K; x++) { const q = ord[x]; let y = x; while (y > 0 && tq[ord[y - 1]] < tq[q]) { ord[y] = ord[y - 1]; y--; } ord[y] = q; }
    let placed = 0, left = 0, tr = 0;
    // (lodging on a crest, it must keep to its angle on both sides)
    const pb = b - dir, under = lodge && pb >= 0 && pb < BX ? Math.min(depth(B, nb), depth(B, pb)) : depth(B, nb);
    for (let x = 0; x < K; x++) {                     // the steepest-standing first; each only to its own angle
      const q = ord[x], room = under + w * tq[q] - depth(B, b) - placed;
      put[q] = Math.min(amt[q], Math.max(0, room)); placed += put[q];
      if (lodge) tr += put[q] * tanOn(S, q, c);
    }
    for (let q = 0; q < K; q++) { amt[q] -= put[q]; left += amt[q]; }
    // what lodged past the face's resting angle is its loose load; below that it is bed
    if (lodge && placed > 0) B.mob[b] += Math.max(0, placed - Math.max(0, under + w * tr / placed - depth(B, b)));
    bedAdd(S, B, b, put);
    if (left <= 1e-15) return;
    b = nb;
  }
}
// Sand landing on the deposit at sub-column b stays where it hits, unless that
// would make it steeper than it can lodge at toward the drop at the edge of the
// flat top it hit (a grid square's two sub-columns get the same sand, so a top is
// often two wide); the rest runs down from that edge (both ways, half each, on a
// crest) and lodges as slide() says. So a cone's peak rounds up until it is as
// steep as it can stand, and the next avalanche takes that load down the face.
// (v4.0 sent all sand landing on a flat top to its edges, or each peak grew
// straight up in whatever its stream carried; with sand lodging steeper, that
// built rims and flat ground grew needles. Judged by the next sub-column only,
// sand on a two-wide top stayed put: pillars.)
function land(S, B, b, amt) {
  const BX = S.BX, K = S.K, d = depth(B, b), w = S.dx / S.P.BSUB, flat = 0.1 * w * Math.tan(S.P.repose * Math.PI / 180);
  let l = b, r = b;                                       // the flat top it landed on (a few sub-columns at most)
  while (l > 0 && b - l < 6 && Math.abs(depth(B, l - 1) - d) <= flat) l--;
  while (r < BX - 1 && r - b < 6 && Math.abs(depth(B, r + 1) - d) <= flat) r++;
  const L = l > 0 && depth(B, l - 1) < d - flat, R = r < BX - 1 && depth(B, r + 1) < d - flat;
  if (!L && !R) { bedAdd(S, B, b, amt); return; }        // in a hollow or on flat ground it is bed at once
  // as high as it can lodge here (hm), and stand at rest (hs), for the drops at the top's edges
  const c = S.surf; surfMix(S, B, b, c);
  let tot = 0, tm = 0, tr = 0;
  for (let q = 0; q < K; q++) { tot += amt[q]; tm += amt[q] * tanOn(S, q, c, S.tanQPm); tr += amt[q] * tanOn(S, q, c); }
  if (tot <= 0) return;
  tm *= w / tot; tr *= w / tot;
  let hm = Infinity, hs = Infinity;
  if (L) { const k = b - l + 1, e = depth(B, l - 1); hm = Math.min(hm, e + k * tm); hs = Math.min(hs, e + k * tr); }
  if (R) { const k = r + 1 - b, e = depth(B, r + 1); hm = Math.min(hm, e + k * tm); hs = Math.min(hs, e + k * tr); }
  const stay = Math.min(1, Math.max(0, hm - d) / tot), h = S.landH;
  if (stay > 0) {
    for (let q = 0; q < K; q++) { h[q] = amt[q] * stay; amt[q] -= h[q]; }
    B.mob[b] += Math.max(0, d + tot * stay - Math.max(hs, d));
    bedAdd(S, B, b, h);
  }
  if (stay >= 1) return;
  if (L && R) {
    for (let q = 0; q < K; q++) { h[q] = 0.5 * amt[q]; amt[q] -= h[q]; }
    slide(S, B, l, -1, h, true); slide(S, B, r, 1, amt, true); return;
  }
  if (L) slide(S, B, l, -1, amt, true); else slide(S, B, r, 1, amt, true);
}
// Local slides (the upper sand's top, and the first picture's made-up past):
// wherever a face is steeper than its own top layer's angle (its grains on
// themselves) by more than reposeMax - repose, it slides: half the excess over
// that angle runs down (and sorts), at most the top layer.
// Up to `sweeps` passes, alternating direction from `parity`; returns how many slid.
function relax(S, B, sweeps, parity) {
  const P = S.P, BX = S.BX, tmp = S.tmp, w = S.dx / P.BSUB, c = S.surf, ex = (P.reposeMax - P.repose) * Math.PI / 180;
  let lo = Infinity; for (const q of P.sands) lo = Math.min(lo, q.repose);
  const dmin = w * Math.tan(lo * Math.PI / 180);         // no face gentler than this can slide
  let total = 0;
  for (let sw = 0; sw < sweeps; sw++) {
    let moved = 0; const fwd = ((parity + sw) & 1) === 0;
    for (let n = 0; n < BX - 1; n++) {
      const b = fwd ? n : BX - 2 - n, d = depth(B, b) - depth(B, b + 1), ad = Math.abs(d);
      if (ad <= dmin) continue;
      const u = d > 0 ? b : b + 1, l = d > 0 ? b + 1 : b;
      surfMix(S, B, u, c);
      const ts = tanSelf(S, c);
      if (ad <= w * Math.tan(Math.atan(ts) + ex)) continue;
      bedTake(S, B, u, Math.min(0.5 * (ad - w * ts), P.surfDepth), tmp); slide(S, B, l, d > 0 ? 1 : -1, tmp); moved++;
    }
    total += moved; if (!moved) break;
  }
  return total;
}
// The face sub-column t is on, going dir (down it): its peak (returned) and its toe (S.toe).
// The walks step over bumps that lodged sand leaves (up: dips shallower than a bed row,
// for up to 3 sub-columns; down: a sub-column that does not fall, if the ground 2-3 on falls
// as a face does), or one bump cut the face in two and a 5 mm piece failed alone.
function faceOf(S, B, t, dir) {
  const BX = S.BX, w = S.dx / S.P.BSUB, stop = S.P.rollFlat * w * Math.tan(S.P.repose * Math.PI / 180);
  let a = t;
  for (let b = t - dir, since = 0; b >= 0 && b < BX && depth(B, b) > depth(B, a) - S.dz && since <= 3; b -= dir) {
    if (depth(B, b) > depth(B, a)) { a = b; since = 0; } else since++;
  }
  t = a;
  for (;;) {
    let m = 1;
    for (; m <= 3; m++) { const nb = t + m * dir; if (nb < 0 || nb >= BX) { m = 4; break; } if (depth(B, t) - depth(B, nb) >= m * stop) break; }
    if (m > 3) break;
    t += dir;
  }
  S.toe = t;
  return a;
}
// A face of the deposit that can hold no more fails AS A WHOLE (low, steady
// pouring: Makse, Cizeau & Stanley 1997; Lemieux & Durian 2000). t is a sub-column
// on it and dir the way down. It is FULL when it stands, on average from peak to
// toe, within capTol of the angle its top layer lodges at: the cap of lodged sand
// has reached the toe. Everything that lodged on it since it last failed (its load), and
// anything steeper than its top layer's angle, runs: what stays is the ground
// under the load, cut back from the toe up to that angle (E). The running sand
// fills from the toe up (the kink) to one straight slope at that angle, placed so
// no sand is made or lost, and runs on past the toe until that slope meets the
// ground. It lays FINEST GRAINS FIRST, as they sift to the bottom of the flowing
// layer. So each load becomes one layer parallel to the face, peak to toe, its
// coarse grains over its fines. (v4.1 failed a face whenever a grain ran to its
// toe: coarse grains found no room on fine-topped faces at the old angles, so
// faces failed 64 times a second, 0.8 mm2 at a time, and the layers were the
// streams' colour sequence, not the avalanches'.)
function avalanche(S, B, t, dir) {
  const BX = S.BX, K = S.K, w = S.dx / S.P.BSUB, c = S.surf, out = S.tmp, pool = S.pool, put = S.rollAmt, E = S.avE;
  const a = faceOf(S, B, t, dir); t = S.toe;
  const n = Math.abs(t - a); if (n < 1) return false;
  let ts = 0, tm = 0; for (let b = a; b !== t + dir; b += dir) { surfMix(S, B, b, c); ts += tanSelf(S, c); tm += tanSelf(S, c, S.tanQPm); }
  ts *= w / (n + 1);                                      // the settled slope's drop per sub-column
  tm /= n + 1;
  if (depth(B, a) - depth(B, t) < n * w * Math.tan(Math.atan(tm) - S.P.capTol * Math.PI / 180)) return false;
  // what stays, and what runs
  let tot = 0;
  for (let x = n, b = t; x >= 0; x--, b -= dir) {
    E[x] = Math.min(depth(B, b) - B.mob[b], x < n ? E[x + 1] + ts : Infinity);
    tot += depth(B, b) - E[x];
  }
  if (tot <= 1e-12) return false;
  // the room under the slope from height H at the peak: over the face, and on past the toe
  // while the slope is above the ground
  const G = H => { let g = 0;
    for (let x = 0, b = a; b >= 0 && b < BX; x++, b += dir) {
      const L = H - ts * x, e = x <= n ? E[x] : depth(B, b);
      if (x > n && L <= e) break;
      if (L > e) g += L - e;
    }
    return g; };
  let lo = E[0], hi = lo + w; for (let x = 1; x <= n; x++) lo = Math.min(lo, E[x] + ts * x);
  while (G(hi) < tot) hi += hi - lo;
  for (let it = 0; it < 60; it++) { const m = 0.5 * (lo + hi); if (G(m) < tot) lo = m; else hi = m; }
  const H = hi, room = G(H);
  pool.fill(0);
  for (let x = 0, b = a; x <= n; x++, b += dir) {
    if (depth(B, b) > E[x]) { bedTake(S, B, b, depth(B, b) - E[x], out); for (let q = 0; q < K; q++) pool[q] += out[q]; }
    B.mob[b] = 0;
  }
  tot = 0; for (let q = 0; q < K; q++) tot += pool[q];
  if (tot <= 0 || room <= 0) return false;
  const f = tot / room, st = S.stats.aval; st[0]++; st[1] += tot * w; st[2] += n * w;
  if (S.avLog) S.avLog.push(S.t, n * w, tot * w, 0);
  for (let x = 0, b = a; b >= 0 && b < BX; x++, b += dir) {
    const dh = H - ts * x - depth(B, b);
    if (x > n && dh <= 0) break;
    if (dh <= 0) continue;
    for (const q of S.fine) { put.fill(0); put[q] = dh * f * pool[q] / tot; bedAdd(S, B, b, put); }
  }
  return true;
}
// A step steeper than any sand lodges at (a big landing, a square of loose sand the bed
// covered) sheds its excess, which rolls down and lodges like landing sand; then the faces
// that sand ran to the toe of this step fail if they are full, each once. (v4.1 failed the
// whole face at any such step: half the sand that avalanches moved went in these, 0.7 mm2
// at a time.)
function bedPass(S) {
  const B = S.bed, Q = B.avq, seen = S.avSeen, BX = S.BX, lim = S.tanMax * S.dx / S.P.BSUB, tmp = S.tmp; let n = 0;
  for (let sw = 0, moved = 1; sw < 4 && moved; sw++) {
    moved = 0;
    for (let b = 0; b + 1 < BX; b++) {
      const g = depth(B, b) - depth(B, b + 1); if (Math.abs(g) <= lim) continue;
      const u = g > 0 ? b : b + 1, m = 0.5 * (Math.abs(g) - lim) + 1e-9;
      bedTake(S, B, u, m, tmp); B.mob[u] = Math.max(0, B.mob[u] - m);
      slide(S, B, g > 0 ? b + 1 : b, g > 0 ? 1 : -1, tmp, true); moved++;
    }
  }
  for (let k = 0; k < Q.length; k += 2) { const key = 2 * Q[k] + (Q[k + 1] > 0 ? 1 : 0); if (seen[key]) continue; seen[key] = 1; if (avalanche(S, B, Q[k], Q[k + 1])) n++; }
  for (let k = 0; k < Q.length; k += 2) seen[2 * Q[k] + (Q[k + 1] > 0 ? 1 : 0)] = 0;
  Q.length = 0;
  return n;
}
// The first picture's past, made the way the model's own deposit forms: a
// series of pours from a few streams spread across the frame, each mostly one
// sand with some of another, landing with a spread-out footprint (as a stream
// fans out) and settling by the same sorted avalanches. (Perfect cones laid
// down directly gave layers as straight as a ruler: "odd chevron patterns".)
function pourHistory(S, rnd) {
  const P = S.P, K = S.K, BX = S.BX, wb = S.dx / P.BSUB, amt = S.amt;
  const n = P.pours[0] + Math.floor(rnd() * (P.pours[1] - P.pours[0] + 1));
  const ns = P.streams[0] + Math.floor(rnd() * (P.streams[1] - P.streams[0] + 1));
  const at = []; for (let k = 0; k < ns; k++) at.push(P.W * (k + 0.15 + 0.7 * rnd()) / ns);   // spread across the frame
  const where = [], last = at.map(() => -1);
  let seq;                                // no sand twice running from one place, every sand used
  for (let tries = 0; tries < 200; tries++) {
    seq = []; where.length = 0; last.fill(-1);
    for (let p = 0; p < n; p++) {
      const w = Math.floor(rnd() * ns); let q = Math.floor(rnd() * K);
      if (q === last[w]) q = (q + 1 + Math.floor(rnd() * (K - 1))) % K;
      seq.push(q); where.push(w); last[w] = q;
    }
    if (new Set(seq).size === K) break;
  }
  S.bandOrder = seq.map(q => P.sands[q].name);
  const wts = seq.map(() => 0.3 + rnd()), ws = wts.reduce((x, y) => x + y, 0);
  const total = P.fill * S.NY * S.dx * P.W;              // m^2 of deposit, all pours
  const INC = 4, foot = new Float64Array(BX);
  seq.forEach((q, p) => {
    const c = at[where[p]] + (rnd() - 0.5) * 0.02, sg = (3 + 9 * rnd()) * 1e-3, A = total * wts[p] / ws / INC;
    const q2 = (q + 1 + Math.floor(rnd() * (K - 1))) % K, mix = 0.25 * rnd();
    let fs = 0; for (let b = 0; b < BX; b++) { const x = (b + 0.5) * wb - c; foot[b] = Math.exp(-0.5 * x * x / (sg * sg)); fs += foot[b] * wb; }
    for (let inc = 0; inc < INC; inc++) {
      for (let b = 0; b < BX; b++) {
        const h = A * foot[b] / fs; if (h < 1e-9) continue;
        for (let r = 0; r < K; r++) amt[r] = 0;
        amt[q] = h * (1 - mix); amt[q2] += h * mix;
        bedAdd(S, S.bed, b, amt);
      }
      relax(S, S.bed, 20, inc);
    }
  });
}
// ---- THE UPPER SAND AND THE AIR SHEET ----------------------------------------
// Turn the frame over: the deposit becomes the upper sand, rotated 180 degrees
// (right for left, top for bottom), packed as it lay. Its air rises at once to
// the sand's underside and spreads under it as one LEVEL sheet: in a real frame
// (sand_tests, the 25x time-lapse) the sheet is there within seconds of the flip
// and whatever hung below it falls at once, in clouds. The sheet's level: up
// the underside's heights by sheetQ (the air gathers first in its highest
// parts, the old valleys, and spreads from them). Sand below it falls as
// clouds (loose, into the water where it was); a column whose underside was
// higher settles down onto the sheet, and water fills in above it. (At the
// underside's mean, half the columns settled and the top began as a mountain
// range; in the time-lapse it starts flush with the frame's top.)
function flipToUpper(S) {
  const P = S.P, NX = S.NX, NY = S.NY, dx = S.dx, K = S.K, BS = P.BSUB, BX = S.BX, dz = S.dz, H = NY * dx;
  const U = S.ub, C = S.bedC, wb = dx / BS, amt = S.amt, sq = S.tmp;
  const hs = Array.from(S.hbs).sort((a, b) => a - b), hq = hs[Math.floor((1 - P.sheetQ) * (BX - 1))];
  S.js = Math.max(2, Math.min(NY - 2, Math.round((H - hq) / dx))); S.zs = S.js * dx;
  for (let b = 0; b < BX; b++) {
    const src = BX - 1 - b, hd = S.hbs[src];
    U.base[b] = U.h[b] = 0;
    for (let r = Math.ceil(hd / dz) - 1; r >= 0; r--) {           // the old top first: it is now the underside
      const ov = Math.min(hd, (r + 1) * dz) - r * dz; if (ov <= 0) continue;
      for (let q = 0; q < K; q++) amt[q] = C[(src + r * BX) * 4 + q] * ov;
      bedAdd(S, U, b, amt);
    }
    const under = H - hd - S.zs;                                    // < 0: it hangs below the sheet
    if (under < 0) {
      bedDrain(S, U, b, -under, amt);
      const i = (b / BS) | 0;
      for (let q = 0; q < K; q++) sq[q] = amt[q] * wb * P.phiBed / (dx * dx);
      dropSand(S, i, S.js - 1, sq);
    }
  }
  S.hbs.fill(0); C.fill(0); S.bed.mob.fill(0); S.dirty[0] = 0; S.dirty[1] = S.NZ - 1;
  foldUpper(S); U.cd.fill(1); rasterUpper(S);
}
// The turn itself folds the layers: while the frame is on its side the packed sand
// slumps along the glass, so the old mountains come out bent into smooth waves and
// arches, not straight chevrons (the time-lapse just after the flip). Made as a few
// random rolls of a flow that neither squeezes the sand nor crosses the sheet, the
// top or the sides (streamfunction sum a sin(m pi x / W) sin(n pi z / T)), run until
// it has moved sand up to 0.5-1.5 foldAmp: each row takes the shares of the row the
// flow brought there, so no sand is made or lost and the layers stay sharp. (Joe,
// 2026-10-28: the start was "too regular", straight chevrons.)
function foldUpper(S) {
  const P = S.P, U = S.ub, BX = S.BX, dz = S.dz, wb = S.dx / P.BSUB, W = P.W, T = S.NY * S.dx - S.zs;
  if (!(P.foldAmp > 0) || T <= 0) return;
  const rnd = mulberry(P.seed * 13 + 5), amp = P.foldAmp * (0.5 + rnd()), md = [];
  for (let j = 0; j < P.foldModes; j++) {
    const m = 2 + Math.floor(rnd() * 12), n = rnd() < 0.7 ? 1 : 2;
    md.push([m * Math.PI / W, n * Math.PI / T, (2 * rnd() - 1) / m]);
  }
  // the flow on a 1 mm lattice, scaled so the fastest sand moves at 1
  const g = 1e-3, GX = Math.ceil(W / g) + 1, GZ = Math.ceil(T / g) + 1, vu = new Float64Array(GX * GZ), vw = new Float64Array(GX * GZ);
  let vmax = 0;
  for (let jz = 0; jz < GZ; jz++) for (let ix = 0; ix < GX; ix++) {
    const x = Math.min(W, ix * g), z = Math.min(T, jz * g); let u = 0, w = 0;
    for (const [kx, kz, a] of md) { u += a * kz * Math.sin(kx * x) * Math.cos(kz * z); w -= a * kx * Math.cos(kx * x) * Math.sin(kz * z); }
    vu[ix + jz * GX] = u; vw[ix + jz * GX] = w; vmax = Math.max(vmax, Math.hypot(u, w));
  }
  if (!(vmax > 0)) return;
  const at = (x, z, out) => {
    const fx = Math.min(GX - 1.001, Math.max(0, x / g)), fz = Math.min(GZ - 1.001, Math.max(0, z / g)), i = fx | 0, j = fz | 0, a = fx - i, c = fz - j, k = i + j * GX;
    out[0] = ((vu[k] * (1 - a) + vu[k + 1] * a) * (1 - c) + (vu[k + GX] * (1 - a) + vu[k + GX + 1] * a) * c) / vmax;
    out[1] = ((vw[k] * (1 - a) + vw[k + 1] * a) * (1 - c) + (vw[k + GX] * (1 - a) + vw[k + GX + 1] * a) * c) / vmax;
  };
  // trace each row back along the flow (midpoint steps) to where its sand came from
  const C0 = U.C.slice(), C = U.C, NS = 16, ds = amp / NS, v = [0, 0];
  for (let b = 0; b < BX; b++) {
    const lo = Math.floor(U.base[b] / dz), hi = Math.ceil(U.h[b] / dz);
    for (let r = lo; r < hi; r++) {
      let x = (b + 0.5) * wb, z = Math.min(T, Math.max(0, (r + 0.5) * dz - U.base[b]));
      for (let s = 0; s < NS; s++) { at(x, z, v); const xm = x - 0.5 * ds * v[0], zm = z - 0.5 * ds * v[1]; at(xm, zm, v); x -= ds * v[0]; z -= ds * v[1]; }
      const b0 = Math.min(BX - 1, Math.max(0, Math.floor(x / wb)));
      if (depth(U, b0) <= 0) continue;
      const r0 = Math.min(Math.ceil(U.h[b0] / dz) - 1, Math.max(Math.floor(U.base[b0] / dz), Math.floor((U.base[b0] + z) / dz)));
      const o = (b + rowOf(U, r) * BX) * 4, o0 = (b0 + rowOf(U, r0) * BX) * 4;
      for (let q = 0; q < 4; q++) C[o + q] = C0[o0 + q];
    }
  }
  U.rd.fill(1);
}
// The upper sand, drawn into the grid: a square it covers is packed sand (rigid,
// a wall to the water) holding what the rows there hold. These squares (S.up)
// are a VIEW of the upper sand: nothing else moves their sand.
function rasterUpper(S) {
  const NX = S.NX, NY = S.NY, dx = S.dx, BS = S.P.BSUB, BX = S.BX, wb = dx / BS, U = S.ub, dz = S.dz, K = S.K;
  const acc = S.tmp, ph = S.ph, f = wb * S.P.phiBed / (dx * dx), amt = S.amt;
  for (let i = 0; i < NX; i++) {
    if (!U.cd[i]) continue;
    U.cd[i] = 0;
    for (let j = S.js; j < NY; j++) {
      const k = i + j * NX, y0 = (j - S.js) * dx, y1 = y0 + dx;    // above the sheet
      let cov = 0; acc.fill(0);
      for (let s = 0; s < BS; s++) {
        const b = i * BS + s, th = U.h[b] - U.base[b]; if (th <= y0) continue;
        const a0 = U.base[b] + y0, a1 = U.base[b] + Math.min(y1, th);
        for (let r = Math.floor(a0 / dz); r * dz < a1; r++) {
          const ov = Math.min(a1, (r + 1) * dz) - Math.max(a0, r * dz); if (ov <= 0) continue;
          const o = (b + rowOf(U, r) * BX) * 4; for (let q = 0; q < K; q++) acc[q] += U.C[o + q] * ov; cov += ov;
        }
      }
      if (cov <= 0) {
        if (!S.up[k]) break;                                      // above the top: the rest is water
        S.up[k] = 0; S.rigid[k] = 0; for (let q = 0; q < K; q++) ph[q][k] = 0; S.phi[k] = 0; continue;
      }
      if (!S.up[k] && S.phi[k] > 0) {                             // loose sand the upper sand now covers joins it
        for (let q = 0; q < K; q++) amt[q] = ph[q][k] / f / BS;
        for (let s = 0; s < BS; s++) bedAdd(S, U, i * BS + s, amt);
      }
      S.up[k] = 1; S.rigid[k] = 1;
      let p = 0; for (let q = 0; q < K; q++) { ph[q][k] = acc[q] * f; p += ph[q][k]; } S.phi[k] = p;
    }
  }
}
// A bubble that reaches the sheet joins its RAFT: one row of bubbles under the
// sand (in the time-lapse, a row of beads). Pressed up against the sand, a
// bubble bigger than tFlat across flattens into a lens tFlat thick (buoyancy
// against surface tension: about two capillary lengths), so it covers more of
// the underside than its round width; squeezed by its neighbours, it can stand
// thicker. Coated with sand grains, they do not merge. While the raft forms, a
// bubble arriving pushes its neighbours aside and the wet underside between them
// gives way; once they cover the width (fullAt), the raft is packed edge to edge.
// Lens b at thickness t (round if it is smaller than that).
function raftShape(b, t) {
  const r = Math.sqrt(b.A / Math.PI);
  if (2 * r <= t) { b.hw = r; b.t = 2 * r; } else { b.t = t; b.hw = 0.5 * (t + (b.A - Math.PI * t * t / 4) / t); }
}
// J[n] is the joint left of lens n (J[R.length]: at the right wall): whether it
// is a hole (open), how strong the sand over it is (s: the packing field there),
// and any extra width (w0: lenses that rose out of it).
function newJoint(S, x) {
  const i = Math.min(S.NX - 1, Math.max(0, Math.floor(x / S.dx)));
  return { open: false, s: S.xi[i + S.js * S.NX], w0: 0, x0: x, x1: x };
}
function raftAdd(S, x, r) {
  const R = S.raft, J = S.joint, nb = { x, A: Math.PI * r * r };
  raftShape(nb, S.P.tFlat);
  if (!J.length) J.push(newJoint(S, 0));
  let n = 0; while (n < R.length && R[n].x < x) n++;
  R.splice(n, 0, nb); J.splice(n + 1, 0, newJoint(S, x));
  if (!S.raftFull) raftSettle(S);
}
// While the raft forms: no two bubbles overlap, nor leave the frame (push apart, half each).
function raftSettle(S) {
  const R = S.raft, W = S.P.W;
  for (let it = 0; it < 400; it++) {
    let moved = false;
    for (let m = 0; m < R.length; m++) {
      const b = R[m];
      if (b.x - b.hw < 0) { b.x = b.hw; moved = true; }
      if (b.x + b.hw > W) { b.x = W - b.hw; moved = true; }
      if (m + 1 < R.length) {
        const c = R[m + 1], o = (b.x + b.hw) - (c.x - c.hw);
        if (o > 1e-9) { b.x -= 0.5 * o; c.x += 0.5 * o; moved = true; }
      }
    }
    if (!moved) break;
  }
}
// Once full: lenses edge to edge across the width, holes (open joints) gHole wide.
// Too many lenses: they stand thicker (one thickness for all, by bisection) until
// they fit; room to spare (lenses have risen out): it goes to the holes they left.
function raftPack(S) {
  const R = S.raft, J = S.joint, P = S.P, W = P.W, n = R.length;
  let openW = 0, w0s = 0, nOpen = 0;
  for (const j of J) if (j.open) { openW += P.gHole + j.w0; w0s += j.w0; nOpen++; }
  const sumW = t => { let s = 0; for (const b of R) { raftShape(b, t); s += 2 * b.hw; } return s; };
  if (sumW(P.tFlat) + openW > W) {
    let lo = P.tFlat, hi = P.tFlat; for (const b of R) hi = Math.max(hi, 2 * Math.sqrt(b.A / Math.PI));
    if (sumW(hi) + openW <= W) {
      for (let it = 0; it < 40; it++) { const m = 0.5 * (lo + hi); if (sumW(m) + openW > W) lo = m; else hi = m; }
      sumW(hi);
    }
  }
  let used = openW; for (const b of R) used += 2 * b.hw;
  const spare = Math.max(0, W - used);
  let x = 0;
  for (let m = 0; m <= n; m++) {
    const j = J[m]; j.x0 = x;
    if (j.open) x += P.gHole + j.w0 + (w0s > 0 ? spare * j.w0 / w0s : spare / nOpen);
    else if (m === n && nOpen === 0) x += spare;
    j.x1 = x;
    if (m < n) { R[m].x = x + R[m].hw; x += 2 * R[m].hw; }
  }
}
// The squares of a raft lens (centre x, half-width hw, thickness t, hanging from
// the sheet at zs), as discs of radius t/2 along it, for drawing and as air.
function raftDiscs(S, b, out) {
  const rr = 0.5 * b.t, y = S.zs - rr, L = b.hw - rr, n = Math.max(1, Math.ceil(2 * L / (0.5 * rr)));
  for (let m = 0; m <= n; m++) out.push({ x: b.x - L + 2 * L * m / n, y, r: rr });
  return out;
}
// Grains creep off the faces of the upper sand: every sub-column on a face
// steeper than creepFloor loses creepV a second from its top, and those grains
// roll to the foot of the face, into the hole there (the streaks seen trickling
// down the ridges in the time-lapse). A face so worn keeps its angle and backs
// away from its hole, so in time it bares the lens at its foot and the ridge
// above drops. (Worn in proportion to its steepness, a ridge only flattened
// toward creepFloor ever more slowly, kept its lenses covered, and stood until
// the picture ended; set down where the face had room, the grains only moved
// one sub-column.)
function creepUpper(S, B, dt) {
  const P = S.P, BX = S.BX, w = S.dx / P.BSUB, tf = w * Math.tan(P.creepFloor * Math.PI / 180), tmp = S.tmp, m = P.creepV * dt;
  for (let n = 0; n < BX; n++) {
    const b = (S.steps & 1) ? n : BX - 1 - n, d = depth(B, b);
    if (d <= 0) continue;
    const dl = b > 0 ? d - depth(B, b - 1) : 0, dr = b < BX - 1 ? d - depth(B, b + 1) : 0;
    if (Math.max(dl, dr) <= tf) continue;
    bedTake(S, B, b, Math.min(m, d), tmp); toFoot(S, B, b, dl >= dr ? -1 : 1, tmp);
  }
}
// Heights amt[q] set rolling at sub-column b, going dir: they run down the face to
// where the ground stops falling (rollFlat) and settle there.
function toFoot(S, B, b, dir, amt) {
  const P = S.P, BX = S.BX, stop = P.rollFlat * (S.dx / P.BSUB) * Math.tan(P.repose * Math.PI / 180);
  for (let hop = 0; hop < P.rollMax; hop++) { const nb = b + dir; if (nb < 0 || nb >= BX || depth(B, b) - depth(B, nb) < stop) break; b = nb; }
  bedAdd(S, B, b, amt);
}
// The grains in the bottom th of upper-sand column b, as shares in out.
function baseMix(S, U, b, th, out) {
  const K = S.K, dz = S.dz, lo = U.base[b], hi = Math.min(U.h[b], lo + th); let tot = 0;
  out.fill(0);
  for (let r = Math.floor(lo / dz); r * dz < hi; r++) {
    const ov = Math.min(hi, (r + 1) * dz) - Math.max(lo, r * dz); if (ov <= 0) continue;
    const o = (b + rowOf(U, r) * S.BX) * 4; for (let q = 0; q < K; q++) out[q] += U.C[o + q] * ov; tot += ov;
  }
  if (tot > 0) for (let q = 0; q < K; q++) out[q] /= tot; else out.fill(1 / K);
}
// The speed (m/s) at which packed sand of mix c sinks as a porous plug: its weight in
// the water balanced by the drag of the water that must flow up through it to take its
// place, v_D = k phi (rho_s - rho_f) g / mu, with Kozeny-Carman's k = d^2 (1 - phi)^3 /
// (180 phi^2) for the mix's Sauter mean d: 0.19 mm/s for d 0.17 mm in this liquid.
function darcy(S, c) {
  const P = S.P, phi = P.phiBed; let a = 0, dr = 0, n = 0;
  for (let q = 0; q < S.K; q++) { a += c[q] / P.sands[q].d; dr += c[q] * (P.sands[q].rho - P.rhoF); n += c[q]; }
  if (n <= 0 || a <= 0) return 0;
  const d = n / a, k = d * d * (1 - phi) ** 3 / (180 * phi * phi);
  return k * phi * (dr / n) * 9.81 / (P.nu * P.rhoF);
}
// The sand over a hole does not sink as one block the hole's width: the grains
// beside the falling ones step into the room they leave, so the sand that moves
// widens upward and its layers sag into Us and Vs whose tip is the hole (the
// kinematic model, Nedderman & Tuzun 1979: the sinking speed spreads upward like
// heat, a bell sqrt(2 bKin z) wide at height z). Each row's worth of room a hole
// drains from sub-column b climbs along a LANE, x = x_b + a sqrt(2 bKin z), its
// a a quantile of the normal distribution taken in a stratified order (vdc), so
// the room from each hole fills the bell evenly and the lanes cross a sideways
// flow of exactly the kinematic model's (x / 2z per unit height). The drain has
// already lowered all of b; where the lane crosses into the next sub-column at row
// k, that sub-column's row k moves into the one the room is in (whose sand above
// k goes back up a row) and its sand above k drops a row. The room ends at the top
// of a column, which drops a row. Sand only moves IN toward the hole, so the layers
// bend without mixing (random steps, the void model, tried first, scattered them
// into speckle: real grains wander far less than it predicts, Choi, Kudrolli &
// Bazant 2005), and whole rows move, so they never smear.
function kinVoid(S, b) {
  const U = S.ub, BX = S.BX, dz = S.dz, wb = S.dx / S.P.BSUB, row = S.kRow;
  const a = QUANT[(vdc(S.kN[b]++) * QN) | 0], x0 = (b + 0.5) * wb, s = a * Math.sqrt(2 * S.P.bKin * dz);
  for (let k = 1, c = b; (k + 2) * dz <= depth(U, c); k++) {
    const want = Math.min(BX - 1, Math.max(0, Math.floor((x0 + s * Math.sqrt(k + 0.5)) / wb)));
    while (c !== want) {
      const n = c < want ? c + 1 : c - 1;
      if ((rowAt(S, U, n, k) + 1) * dz > U.h[n]) break;          // no full row there: it waits a row
      rowPull(S, U, n, k, row); rowPush(S, U, c, k, row); c = n;
    }
  }
}
// n's place in a stratified sequence on (0, 1) (van der Corput, base 2)
function vdc(n) { let v = 0, f = 0.5; for (n++; n > 0; n >>>= 1, f /= 2) if (n & 1) v += f; return v; }
// The ring row of sub-column b at k rows above the sheet (unwrapped)
function rowAt(S, U, b, k) { return Math.floor(U.base[b] / S.dz + k + 0.5); }
function copyRow(S, U, b, from, to) {
  const C = U.C, BX = S.BX, a = (b + rowOf(U, from) * BX) * 4, c = (b + rowOf(U, to) * BX) * 4;
  for (let q = 0; q < S.K; q++) C[c + q] = C[a + q];
  markBed(S, U, b, to);
}
// Take the row k rows up out of sub-column b into out: the sand above it drops a
// row. In the ring, whichever side has fewer rows is copied: the rows above down a
// slot, or the rows below up a slot with the base (which leaves them where they were)
function rowPull(S, U, b, k, out) {
  const C = U.C, dz = S.dz, r = rowAt(S, U, b, k), lo = Math.floor(U.base[b] / dz), hi = Math.ceil(U.h[b] / dz) - 1;
  const o = (b + rowOf(U, r) * S.BX) * 4; for (let q = 0; q < S.K; q++) out[q] = C[o + q];
  if (hi - r <= r - lo) { for (let s = r; s < hi; s++) copyRow(S, U, b, s + 1, s); U.h[b] -= dz; }
  else { for (let s = r; s > lo; s--) copyRow(S, U, b, s - 1, s); U.base[b] += dz; }
  markBed(S, U, b, -1);
}
// Put a row of shares src into sub-column b, k rows up: the sand from there up
// rises a row. In the ring, the fewer side is copied, as in rowPull (below: only
// if the base has a row of room under it, as it has once it has drained a row)
function rowPush(S, U, b, k, src) {
  const C = U.C, dz = S.dz, r = rowAt(S, U, b, k), lo = Math.floor(U.base[b] / dz), hi = Math.ceil(U.h[b] / dz) - 1;
  let at = r;
  if (r - lo < hi - r + 1 && U.base[b] >= dz) { for (let s = lo; s < r; s++) copyRow(S, U, b, s, s - 1); U.base[b] -= dz; at = r - 1; }
  else { for (let s = hi; s >= r; s--) copyRow(S, U, b, s, s + 1); U.h[b] += dz; }
  const o = (b + rowOf(U, at) * S.BX) * 4; for (let q = 0; q < S.K; q++) C[o + q] = src[q];
  markBed(S, U, b, at);
}
// Each step: the HOLES in the sheet (gaps between lenses wider than gJam, where
// the wet sand meets the water) drain the sand above them from its bottom, like
// an hourglass, as fast as water can get in to replace it: pi r v_D over the arch of
// grains spanning it (radius r = arch g/2; darcy), drawn
// from the bottom of the sand right over the hole; the room it leaves climbs and
// spreads sideways (kinVoid), so the sand that sinks widens upward and beside the
// hole, at the sheet, the sand stays put (drawing on it there thinned the cover of
// the lenses beside every hole until they rose out, and the raft unzipped within a
// minute). The drained sand enters the water under the hole as a stream. Once
// the raft is full, holes open at its weakest joints (the packing field's weakest
// sand there, below sOpen), no two within dHole. The top surface slides at each
// sand's own angle, so a funnel opens over every hole and the sand between holes
// stands as sharp ridges, which creep wears down. A lens with less than coverMin
// of sand over it rises out (its buoyancy beats the cover's weight and the panes'
// friction on it): the sand still on it falls past it and its place is a wide hole.
// When the streams have run down, the whole sheet unzips, lens after lens, and the
// ridges drop whole, in clouds, as in the time-lapse.
function upperStep(S, dt) {
  const P = S.P, U = S.ub, BX = S.BX, BS = P.BSUB, dx = S.dx, wb = dx / BS, K = S.K, R = S.raft, J = S.joint, NX = S.NX;
  const holes = S.holes, wts = S.wts, out = S.tmp, sq = S.amt, f = wb * P.phiBed / (dx * dx), drop = S.drop, mix = S.pool;
  const jx = m => m < R.length ? R[m].x - R[m].hw : P.W;
  if (!S.raftFull && R.length) { let w = 0; for (const b of R) w += 2 * b.hw; if (w >= P.fullAt * P.W) S.raftFull = true; }
  holes.length = 0;
  if (S.raftFull) {
    const cand = []; for (let m = 0; m < J.length; m++) if (!J[m].open && J[m].s < P.sOpen) cand.push(m);
    cand.sort((a, b) => J[a].s - J[b].s);
    for (const m of cand) {
      let ok = true; const x = jx(m);
      for (let o = 0; o < J.length && ok; o++) if (J[o].open && Math.abs(jx(o) - x) < P.dHole) ok = false;
      if (ok) J[m].open = true;
    }
    raftPack(S);
    for (const j of J) { const a = Math.max(0, j.x0), c = Math.min(P.W, j.x1); if (c - a > P.gJam) holes.push(a, c); }
  } else {
    let x0 = 0;
    for (let m = 0; m <= R.length; m++) {
      const x1 = jx(m); if (x1 - x0 > P.gJam) holes.push(x0, x1);
      if (m < R.length) x0 = Math.max(x0, R[m].x + R[m].hw);
    }
  }
  drop.fill(0);
  for (let h = 0; h < holes.length; h += 2) {
    // the sand over an opening g falls as fast as water gets in to take its place, up
    // through the opening and the grains: the arch over it (radius arch g/2) sinks at the
    // Darcy speed of the grains there
    const a = holes[h], c = holes[h + 1], g = c - a;
    const b0 = Math.max(0, Math.floor(a / wb)), b1 = Math.min(BX - 1, Math.floor((c - 1e-12) / wb));
    let ws = 0; mix.fill(0);
    for (let b = b0; b <= b1; b++) {
      const ov = Math.min(c, (b + 1) * wb) - Math.max(a, b * wb);
      wts[b] = depth(U, b) > 1e-9 ? ov / wb : 0; ws += wts[b] * wb;
      if (wts[b] > 0) { baseMix(S, U, b, 0.5 * g, out); for (let q = 0; q < K; q++) mix[q] += wts[b] * out[q]; }
    }
    if (ws <= 0) continue;
    const Q = 0.5 * Math.PI * P.arch * g * darcy(S, mix) * dt;
    sq.fill(0);
    for (let b = b0; b <= b1; b++) {
      if (wts[b] <= 0) continue;
      bedDrain(S, U, b, Q * wts[b] / ws, out);
      for (let q = 0; q < K; q++) { sq[q] += out[q] * f; S.kAcc[b] += out[q]; }   // as shares of a grid square
    }
    // into the water under the hole, spread over the grid columns it spans
    const i0 = Math.floor(a / dx), i1 = Math.min(NX - 1, Math.floor((c - 1e-12) / dx));
    for (let i = i0; i <= i1; i++) {
      const sh = (Math.min(c, (i + 1) * dx) - Math.max(a, i * dx)) / (c - a);
      for (let q = 0; q < K; q++) drop[i * K + q] += sq[q] * sh;
    }
  }
  S.dStep = 0;
  for (let i = 0; i < NX; i++) {
    let any = 0; for (let q = 0; q < K; q++) { sq[q] = drop[i * K + q]; any += sq[q]; S.stats.drain[q] += sq[q] * dx * dx; S.dStep += sq[q]; }
    if (any > 0) dropSand(S, i, S.js - 1, sq);
  }
  if (S.t >= S.kNext) {                       // the room the holes left climbs, a row at a time
    S.kNext = S.t + P.kinDt;
    for (let b = 0; b < BX; b++) while (S.kAcc[b] >= S.dz) { S.kAcc[b] -= S.dz; kinVoid(S, b); }
  }
  relax(S, U, 2, S.steps);
  creepUpper(S, U, dt);
  // the streams' sand over the last minute, against the most in any minute: once it has run
  // down, the sheet unzips from its most thinly covered lens outward, one lens every tCascade
  // (the panes hold the ridges up until their lenses go)
  if (S.raftFull) {
    S.dSec += S.dStep;
    if (S.t >= S.dNext) {
      S.dWin.push(S.dSec); S.dSec = 0; S.dNext = Math.floor(S.t) + 1;
      if (S.dWin.length > 60) S.dWin.shift();
      const m = S.dWin.reduce((a, b) => a + b, 0); if (S.dWin.length === 60 && m > S.dMax) S.dMax = m;
      if (!S.unzipT && S.dWin.length === 60 && m < P.unzipFrac * S.dMax && R.length) {
        S.unzipT = S.t;
        let m0 = 0, lo = Infinity;
        for (let n = 0; n < R.length; n++) {
          const c0 = Math.max(0, Math.floor((R[n].x - R[n].hw) / wb)), c1 = Math.min(BX - 1, Math.floor((R[n].x + R[n].hw) / wb));
          let c = 0; for (let b = c0; b <= c1; b++) c += depth(U, b); c /= (c1 - c0 + 1);
          if (c < lo) { lo = c; m0 = n; }
        }
        for (let n = 0; n < R.length; n++) { R[n].doom = S.t + P.tCascade * (Math.abs(n - m0) + S.rnd()); R[n].why = 'unzip'; }
      }
    }
  }
  for (let n = R.length - 1; n >= 0; n--) {
    const bb = R[n], c0 = Math.max(0, Math.floor((bb.x - 0.5 * bb.hw) / wb)), c1 = Math.min(BX - 1, Math.floor((bb.x + 0.5 * bb.hw) / wb));
    let cover = 0; for (let b = c0; b <= c1; b++) cover += depth(U, b); cover /= (c1 - c0 + 1);
    if (cover >= P.coverMin && !(bb.doom <= S.t)) continue;   // (a lens rising unzips nothing by itself)
    R.splice(n, 1); S.stats.air.escaped++;
    if (S.escLog) S.escLog.push([S.t, bb.x, cover, cover < P.coverMin ? 'thin cover' : bb.why, J[n].open || J[n + 1].open ? 1 : 0]);   // (tests)
    if (S.raftFull) {                          // its two joints become one hole, as wide as it was
      const a = J[n], b = J[n + 1];
      a.w0 += b.w0 + 2 * bb.hw + (a.open ? P.gHole : 0) + (b.open ? P.gHole : 0) - P.gHole;
      a.open = true; a.s = Math.min(a.s, b.s); J.splice(n + 1, 1);
    } else J.splice(n + 1, 1);
    const e0 = Math.max(0, Math.floor((bb.x - bb.hw) / wb)), e1 = Math.min(BX - 1, Math.floor((bb.x + bb.hw) / wb));
    for (let b = e0; b <= e1; b++) {
      bedDrain(S, U, b, depth(U, b), out);
      for (let q = 0; q < K; q++) sq[q] = out[q] * f;
      dropSand(S, (b / BS) | 0, S.js - 1, sq);
    }
    const r = Math.sqrt(bb.A / Math.PI);
    S.bub.push({ x: bb.x, y: S.zs + r + 0.3 * dx, r, ph: 6.28 * S.rnd(), src: -1, age: 0, still: 0 });
  }
  rasterUpper(S);
}
function look(T, S, p) {
  if (p <= 0) return T[0];
  let x = p / S.P.phiM * TAB; if (x >= TAB) return T[TAB];
  const i = x | 0; x -= i; return T[i] + (T[i + 1] - T[i]) * x;
}
function g1(S, p) { return look(S.FS, S, p); }
function godunov(S, up, dn) {         // unit downward flux from square `up` into `dn`
  if (up <= dn) return Math.min(g1(S, up), g1(S, dn));
  const ps = S.P.phiM / (S.P.nRZ + 1);
  return (dn <= ps && ps <= up) ? g1(S, ps) : Math.max(g1(S, up), g1(S, dn));
}
function thick(S, p) { return look(S.TH, S, p); }   // how much crowded sand thickens the water

// ---- multigrid for  sum_k a_k (psi - psi_k) / h^2 = rhs  on corners -------
function smooth(L, iters) {
  const nx = L.nx, ny = L.ny, W = nx + 1, h2 = L.h * L.h, psi = L.psi, rhs = L.rhs, aE = L.aE, aN = L.aN, fix = L.fix;
  for (let it = 0; it < iters; it++) for (let c = 0; c < 2; c++)
    for (let j = 1; j < ny; j++) {
      for (let i = (((1 + j) & 1) === c) ? 1 : 2; i < nx; i += 2) {
        const n = i + j * W; if (fix[n]) continue;
        const e = aE[i + j * nx], w = aE[i - 1 + j * nx], no = aN[n], so = aN[n - W];
        psi[n] = (h2 * rhs[n] + e * psi[n + 1] + w * psi[n - 1] + no * psi[n + W] + so * psi[n - W]) / (e + w + no + so);
      }
    }
}
function residual(L) {
  const nx = L.nx, ny = L.ny, W = nx + 1, ih2 = 1 / (L.h * L.h), psi = L.psi, aE = L.aE, aN = L.aN, fix = L.fix, r = L.res;
  r.fill(0);
  for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
    const n = i + j * W; if (fix[n]) continue;
    const p = psi[n];
    r[n] = L.rhs[n] - ih2 * (aE[i + j * nx] * (p - psi[n + 1]) + aE[i - 1 + j * nx] * (p - psi[n - 1])
                           + aN[n] * (p - psi[n + W]) + aN[n - W] * (p - psi[n - W]));
  }
}
function restrict(F, C) {               // full weighting of F.res into C.rhs
  const Wf = F.nx + 1, Wc = C.nx + 1, r = F.res;
  C.rhs.fill(0);
  for (let J = 1; J < C.ny; J++) for (let I = 1; I < C.nx; I++) {
    const nc = I + J * Wc; if (C.fix[nc]) continue;
    const n = 2 * I + 2 * J * Wf;
    C.rhs[nc] = (4 * r[n] + 2 * (r[n - 1] + r[n + 1] + r[n - Wf] + r[n + Wf])
               + r[n - 1 - Wf] + r[n + 1 - Wf] + r[n - 1 + Wf] + r[n + 1 + Wf]) / 16;
  }
}
function prolongAdd(C, F) {
  const Wf = F.nx + 1, Wc = C.nx + 1, e = C.psi, psi = F.psi, fix = F.fix;
  for (let j = 1; j < F.ny; j++) {
    const J = j >> 1, oj = j & 1;
    for (let i = 1; i < F.nx; i++) {
      const n = i + j * Wf; if (fix[n]) continue;
      const I = i >> 1, oi = i & 1, b = I + J * Wc;
      let d;
      if (!oi && !oj) d = e[b];
      else if (oi && !oj) d = 0.5 * (e[b] + e[b + 1]);
      else if (!oi && oj) d = 0.5 * (e[b] + e[b + Wc]);
      else d = 0.25 * (e[b] + e[b + 1] + e[b + Wc] + e[b + Wc + 1]);
      psi[n] += d;
    }
  }
}
function hm(a, b) { return 2 * a * b / (a + b); }
function coarsen(F, C) {                 // coefficients and fixed corners
  const nxF = F.nx, WF = nxF + 1, WC = C.nx + 1;
  for (let J = 0; J <= C.ny; J++) for (let I = 0; I < C.nx; I++) {
    let s = 0, w = 0;
    for (let d = -1; d <= 1; d++) {
      const jf = 2 * J + d; if (jf < 0 || jf > F.ny) continue;
      const wt = d ? 1 : 2; s += wt * hm(F.aE[2 * I + jf * nxF], F.aE[2 * I + 1 + jf * nxF]); w += wt;
    }
    C.aE[I + J * C.nx] = s / w;
  }
  for (let J = 0; J < C.ny; J++) for (let I = 0; I <= C.nx; I++) {
    let s = 0, w = 0;
    for (let d = -1; d <= 1; d++) {
      const iF = 2 * I + d; if (iF < 0 || iF > nxF) continue;
      const wt = d ? 1 : 2; s += wt * hm(F.aN[iF + 2 * J * WF], F.aN[iF + (2 * J + 1) * WF]); w += wt;
    }
    C.aN[I + J * WC] = s / w;
  }
  for (let J = 0; J <= C.ny; J++) for (let I = 0; I <= C.nx; I++)
    C.fix[I + J * WC] = (I === 0 || J === 0 || I === C.nx || J === C.ny) ? 1 : F.fix[2 * I + 2 * J * WF];
}
function vcycle(Ls, l) {
  const L = Ls[l];
  if (l === Ls.length - 1) { smooth(L, 40); return; }
  smooth(L, 2); residual(L);
  const C = Ls[l + 1]; restrict(L, C); C.psi.fill(0);
  vcycle(Ls, l + 1); prolongAdd(C, L); smooth(L, 2);
}

// ---- carrying one sand with the water: flux-corrected transport -----------
function carry(S, phi, c) {
  const NX = S.NX, NY = S.NY, W = NX + 1, u = S.u, v = S.v, blk = S.blk;
  const FLx = S.FLx, FLy = S.FLy, Ax = S.Ax, Ay = S.Ay, td = S.td, Rp = S.Rp, Rm = S.Rm;
  FLx.fill(0); FLy.fill(0); Ax.fill(0); Ay.fill(0);
  for (let j = 0; j < NY; j++) for (let i = 1; i < NX; i++) {
    const k = i + j * W, cu = u[k] * c; if (cu === 0) continue;
    const pL = phi[i - 1 + j * NX], pR = phi[i + j * NX];
    const lo = cu > 0 ? cu * pL : cu * pR, hi = 0.5 * cu * (pL + pR) - 0.5 * cu * cu * (pR - pL);
    FLx[k] = lo; Ax[k] = hi - lo;
  }
  for (let j = 1; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = i + j * NX, cv = v[k] * c; if (cv === 0) continue;
    const pB = phi[k - NX], pT = phi[k];
    const lo = cv > 0 ? cv * pB : cv * pT, hi = 0.5 * cv * (pB + pT) - 0.5 * cv * cv * (pT - pB);
    FLy[k] = lo; Ay[k] = hi - lo;
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = i + j * NX;
    td[k] = phi[k] - (FLx[i + 1 + j * W] - FLx[i + j * W] + FLy[k + NX] - FLy[k]);
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = i + j * NX; if (blk[k]) { Rp[k] = Rm[k] = 0; continue; }
    let mx = Math.max(phi[k], td[k]), mn = Math.min(phi[k], td[k]);
    if (i > 0 && !blk[k - 1]) { mx = Math.max(mx, phi[k - 1], td[k - 1]); mn = Math.min(mn, phi[k - 1], td[k - 1]); }
    if (i < NX - 1 && !blk[k + 1]) { mx = Math.max(mx, phi[k + 1], td[k + 1]); mn = Math.min(mn, phi[k + 1], td[k + 1]); }
    if (j > 0 && !blk[k - NX]) { mx = Math.max(mx, phi[k - NX], td[k - NX]); mn = Math.min(mn, phi[k - NX], td[k - NX]); }
    if (j < NY - 1 && !blk[k + NX]) { mx = Math.max(mx, phi[k + NX], td[k + NX]); mn = Math.min(mn, phi[k + NX], td[k + NX]); }
    const aL = Ax[i + j * W], aR = Ax[i + 1 + j * W], aB = Ay[k], aT = Ay[k + NX];
    const pin = Math.max(0, aL) + Math.max(0, -aR) + Math.max(0, aB) + Math.max(0, -aT);
    const pout = Math.max(0, -aL) + Math.max(0, aR) + Math.max(0, -aB) + Math.max(0, aT);
    Rp[k] = pin > 0 ? Math.min(1, (mx - td[k]) / pin) : 0;
    Rm[k] = pout > 0 ? Math.min(1, (td[k] - mn) / pout) : 0;
  }
  for (let j = 0; j < NY; j++) for (let i = 1; i < NX; i++) {
    const k = i + j * W, a = Ax[k]; if (a === 0) continue;
    const L = i - 1 + j * NX, R = i + j * NX;
    Ax[k] = a * (a >= 0 ? Math.min(Rp[R], Rm[L]) : Math.min(Rp[L], Rm[R]));
  }
  for (let j = 1; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = i + j * NX, a = Ay[k]; if (a === 0) continue;
    Ay[k] = a * (a >= 0 ? Math.min(Rp[k], Rm[k - NX]) : Math.min(Rp[k - NX], Rm[k]));
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const k = i + j * NX; if (blk[k]) continue;
    const p = td[k] - (Ax[i + 1 + j * W] - Ax[i + j * W] + Ay[k + NX] - Ay[k]);
    phi[k] = p > 0 ? p : 0;
  }
}

// ---- one step ---------------------------------------------------------------
const now = typeof performance !== 'undefined' ? () => performance.now()
  : typeof preciseTime === 'function' ? () => preciseTime() * 1000 : () => Date.now();

function step(S, dtWanted) {
  const T0 = now(), pr = S.prof;
  const P = S.P, NX = S.NX, NY = S.NY, dx = S.dx, W = NX + 1, K = S.K, ph = S.ph, w0 = S.w0;
  const phi = S.phi, solid = S.solid, rigid = S.rigid, blk = S.blk, air = S.air;
  const u = S.u, v = S.v, us = S.us, vs = S.vs;
  const dbg = S.dbg;
  airStep(S, S.lastDt || P.dtMax * 0.25);
  dbg && dbg('air');
  upperStep(S, S.lastDt || P.dtMax * 0.25);    // the upper sand drains through the sheet's holes
  dbg && dbg('upper');
  for (let k = 0; k < blk.length; k++) blk[k] = solid[k] | rigid[k] | air[k];
  // time step from the fastest face and the fastest sand
  let um = S.wMax;
  for (let k = 0; k < u.length; k++) { const a = Math.abs(u[k]); if (a > um) um = a; }
  for (let k = 0; k < v.length; k++) { const a = Math.abs(v[k]) + S.wMax; if (a > um) um = a; }
  S.umax = um;
  const dt = Math.min(dtWanted || P.dtMax, P.dtMax, P.cfl * dx / um);

  // 1. the last step's velocity is the start of this one (inertia, no self-advection)
  us.set(u); vs.set(v);
  const T1 = now(); pr[0] += T1 - T0;

  // 2. drag coefficients on the faces, fixed corners, right-hand side
  const L0 = S.levels[0], k0dt = S.k0 * dt;
  for (let j = 0; j <= NY; j++) for (let i = 0; i < NX; i++) {      // aE = v-faces
    const a = j > 0 ? phi[i + (j - 1) * NX] : -1, b = j < NY ? phi[i + j * NX] : -1;
    const p = a < 0 ? b : b < 0 ? a : 0.5 * (a + b);
    L0.aE[i + j * NX] = 1 + k0dt * thick(S, p);
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i <= NX; i++) {      // aN = u-faces
    const a = i > 0 ? phi[i - 1 + j * NX] : -1, b = i < NX ? phi[i + j * NX] : -1;
    const p = a < 0 ? b : b < 0 ? a : 0.5 * (a + b);
    L0.aN[i + j * W] = 1 + k0dt * thick(S, p);
  }
  const fix = L0.fix; fix.fill(0);
  for (let i = 0; i <= NX; i++) { fix[i] = 1; fix[i + NY * W] = 1; }
  for (let j = 0; j <= NY; j++) { fix[j * W] = 1; fix[NX + j * W] = 1; }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) if (blk[i + j * NX]) {
    const n = i + j * W; fix[n] = fix[n + 1] = fix[n + W] = fix[n + W + 1] = 1;
  }
  const g = 9.81, ex = S.ex, rhs = L0.rhs, psi = L0.psi;
  sumPhi(S);                               // squares the air moved sand out of
  for (const b of S.bub) {                 // a rising bubble is light: it stirs the water
    const i0 = Math.max(0, Math.floor((b.x - b.r) / dx)), i1 = Math.min(NX - 1, Math.floor((b.x + b.r) / dx));
    const j0 = Math.max(0, Math.floor((b.y - b.r) / dx)), j1 = Math.min(NY - 1, Math.floor((b.y + b.r) / dx));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot((i + 0.5) * dx - b.x, (j + 0.5) * dx - b.y);
      ex[i + j * NX] -= P.bubbleDrive * Math.min(1, Math.max(0, 0.5 + (b.r - d) / dx));
    }
  }
  rhs.fill(0);
  for (let j = 1; j < NY; j++) for (let i = 1; i < NX; i++) {
    const n = i + j * W; if (fix[n]) { psi[n] = 0; continue; }
    const curl = (vs[i + j * NX] - vs[i - 1 + j * NX]) / dx - (us[i + j * W] - us[i + (j - 1) * W]) / dx;
    const bR = -g * 0.5 * (ex[i + (j - 1) * NX] + ex[i + j * NX]);
    const bL = -g * 0.5 * (ex[i - 1 + (j - 1) * NX] + ex[i - 1 + j * NX]);
    rhs[n] = curl + dt * (bR - bL) / dx;
  }
  for (let l = 1; l < S.levels.length; l++) coarsen(S.levels[l - 1], S.levels[l]);
  const T2 = now(); pr[1] += T2 - T1;
  for (let c = 0; c < P.vcycles; c++) vcycle(S.levels, 0);
  const T3 = now(); pr[2] += T3 - T2;

  // 3. face velocities from psi: divergence-free by construction
  for (let j = 0; j < NY; j++) for (let i = 0; i <= NX; i++) {
    const n = i + j * W; u[n] = (psi[n + W] - psi[n]) / dx;
  }
  for (let j = 0; j <= NY; j++) for (let i = 0; i < NX; i++) {
    const n = i + j * W; v[i + j * NX] = -(psi[n + 1] - psi[n]) / dx;
  }

  // 4. carry each sand with the water
  const c = dt / dx;
  // (the step was sized from the last step's speeds; when the flow has sped up
  // since - a lump dropping, a bubble's plume - carry in shorter pieces, or the
  // transport overshoots and clipping the overshoot creates sand)
  let um2 = 0;
  for (let k = 0; k < u.length; k++) { const x = Math.abs(u[k]); if (x > um2) um2 = x; }
  for (let k = 0; k < v.length; k++) { const x = Math.abs(v[k]); if (x > um2) um2 = x; }
  const nsub = Math.max(1, Math.ceil(um2 * c / 0.45));
  for (let q = 0; q < K; q++) for (let n = 0; n < nsub; n++) carry(S, ph[q], c / nsub);
  sumPhi(S);
  dbg && dbg('carry');
  const T4 = now(); pr[3] += T4 - T3;

  // 5. THE SINKING. (The upper sand leaves only through the sheet's holes:
  // upperStep. Its squares are walls here.)
  const ST = S.stats;
  // Then each column: the total sets how crowded every face is (Godunov), and
  // the sands share that flux by w0_k ph_k. The lowest water square drains
  // into the bed.
  const Gf = S.Gf, Fq = S.Fq, amt = S.amt, BS = P.BSUB;
  for (let i = 0; i < NX; i++) {
    let j0 = 0; while (j0 < NY && solid[i + j0 * NX]) j0++;
    if (j0 >= NY) continue;
    Gf[NY] = 0;
    for (let j = j0 + 1; j < NY; j++) {
      const k = i + j * NX;
      // no sand passes into or out of air or the upper sand
      const sealed = air[k] || air[k - NX] || rigid[k] || rigid[k - NX];
      Gf[j] = (phi[k] <= 0 || sealed) ? 0 : godunov(S, phi[k], phi[k - NX]) / phi[k];
    }
    const c0 = i + j0 * NX, pb = phi[c0];
    const sink = pb > 0 ? godunov(S, pb, 0) / pb : 0, jam = pb > P.phiJam ? (pb - P.phiJam) * dx / P.tJam / pb : 0;
    for (let q = 0; q < K; q++) {
      const a = ph[q], wq = w0[q];
      Fq[NY] = 0;
      for (let j = j0 + 1; j < NY; j++) Fq[j] = Gf[j] * wq * a[i + j * NX];
      Fq[j0] = Math.min((sink * wq + jam) * a[c0], (a[c0] + c * Fq[j0 + 1]) / c);
      { let fl = 0, un = 0, m = 0;
        for (let j = j0 + 1; j < NY; j++) { const k = i + j * NX; if (!rigid[k]) { fl += Fq[j]; m += a[k]; } else un += Fq[j]; }
        ST.fall[q] += fl * dt; ST.fallW[q] += m * dt; ST.under[q] += un * dt * dx; ST.landed[q] += Fq[j0] * dt * dx; }
      for (let j = j0; j < NY; j++) { const k = i + j * NX; a[k] += c * (Fq[j + 1] - Fq[j]); if (a[k] < 0) a[k] = 0; }
      amt[q] = Fq[j0] * dt / P.phiBed;
    }
    if (S.onLand) S.onLand(i, amt);       // (tests: where sand reaches the deposit)
    for (let s = 0; s < BS; s++) { S.landA.set(amt); land(S, S.bed, i * BS + s, S.landA); }
  }
  sumPhi(S);

  dbg && dbg('sinking');
  // 6. the deposit's faces that filled this step fail, each laying one layer
  const hbs = S.hbs;
  bedPass(S);
  // 7. which grid squares are solid: the bed's mean height over the square.
  // Sand left in a square the bed has covered lands on it; a square the bed
  // has left becomes water again.
  for (let i = 0; i < NX; i++) {
    let hc = 0; for (let s = 0; s < BS; s++) hc += hbs[i * BS + s]; hc /= BS;
    for (let j = 0; j < NY; j++) {
      const k = i + j * NX, under = (j + 0.5) * dx <= hc;
      if (under && !solid[k]) {
        solid[k] = 1;
        if (phi[k] > 0) {
          for (let q = 0; q < K; q++) { amt[q] = ph[q][k] * dx / P.phiBed; ph[q][k] = 0; }
          phi[k] = 0; for (let s = 0; s < BS; s++) { S.landA.set(amt); land(S, S.bed, i * BS + s, S.landA); }
        }
      } else if (!under && solid[k]) solid[k] = 0;
      if (!under && (j - 1.5) * dx > hc) break;
    }
  }
  dbg && dbg('solid');
  S.t += dt; S.steps++; S.lastDt = dt; pr[4] += now() - T4; pr[5]++;
  return dt;
}

// Advance by `secs` of picture time in steps no longer than the CFL allows.
function advance(S, secs, maxSteps) {
  let left = secs, n = 0;
  while (left > 1e-9 && n < (maxSteps || 1e9)) { left -= step(S, left); n++; }
  return n;
}

// The bed rows touched since the last call, as bytes (4 per sub-column per row,
// a sand's share x 255), for the page to update just that slice of its texture.
function takeDirtyBed(S) {
  const r0 = S.dirty[0], r1 = S.dirty[1];
  S.dirty[0] = S.NZ; S.dirty[1] = -1;
  if (r1 < r0) return null;
  const C = S.bedC, n = (r1 - r0 + 1) * S.BX * 4, out = new Uint8Array(n), o = r0 * S.BX * 4;
  for (let k = 0; k < n; k++) out[k] = Math.round(C[o + k] * 255);
  return { r0, r1, data: out };
}

// The share of all the sand still on the sheet: a picture is not over while much is.
function upperLeft(S) {
  let a = 0; for (let b = 0; b < S.BX; b++) a += depth(S.ub, b);
  return a * (S.dx / S.P.BSUB) * S.P.phiBed / S.mass0.reduce((x, y) => x + y, 0);
}
// The upper sand for the page: the rows whose shares changed since the last call
// (ring rows, 4 bytes per sub-column, a sand's share x 255) and, per sub-column,
// its thickness in grid squares and its base in rows, so the page can draw its
// layers as finely as the deposit's (the grid's view of it is 4x coarser).
function takeUpper(S) {
  const U = S.ub, BX = S.BX, NZ = U.NZ, rows = [];
  for (let r = 0; r < NZ; r++) if (U.rd[r]) { rows.push(r); U.rd[r] = 0; }
  const data = new Uint8Array(rows.length * BX * 4);
  rows.forEach((r, n) => { const o = r * BX * 4, d = n * BX * 4; for (let k = 0; k < BX * 4; k++) data[d + k] = Math.round(U.C[o + k] * 255); });
  const hb = new Float32Array(BX * 2);
  for (let b = 0; b < BX; b++) { hb[2 * b] = (U.h[b] - U.base[b]) / S.dx; hb[2 * b + 1] = U.base[b] / S.dz; }
  return { rows: Int32Array.from(rows), data, hb, js: S.js, NZ };
}

// The engine's own source, so a page opened from file:// can start it in a
// worker from a Blob (Chromium blocks file:// worker scripts).
const SandEngine = { DEF, SANDS, MINERALS, randomSands, create, step, advance, mass, masses, takeDirtyBed, takeUpper, upperLeft, airTexture, airTotal,
  _bed: { bedAdd: (S, b, a) => bedAdd(S, S.bed, b, a), land: (S, b, a) => land(S, S.bed, b, a), relax: (S, n, p) => relax(S, S.bed, n, p), pass: S => bedPass(S) },   // tests of the deposit's own rules
  source: '(' + factory.toString() + ')(self);\n' };
if (typeof module !== 'undefined' && module.exports) module.exports = SandEngine;
root.SandEngine = SandEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);

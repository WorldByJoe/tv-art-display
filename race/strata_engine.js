/* ---------------------------------------------------------------------------
   strata_engine.js - a sedimentary landscape that folds and then erodes.
   Joe, 2026-09-04: "create a sedimentary landscape, induce geologic folding,
   and then erosion ... like Utah, different hardnesses of sedimentary layers,
   different colors, rain-based erosion. The observer would watch the
   landscape erode away, and different features emerge and morph."

   THE MODEL, in order:
   1. STRATA. 12-16 beds stacked from a basement at 0 m: sandstone, limestone,
      siltstone, mudstone, shale, each with a thickness, a colour drawn from
      that rock's Utah palette, and an ERODIBILITY (shale 1.4 .. sandstone 0.3)
      - hard beds hold up cliffs and benches, soft beds strip away into slopes.
   2. FOLDING. One fold field F(x,y) - two or three sinusoidal fold trains of
      random wavelength and trend, a dome or basin, and a regional tilt -
      added to every bed boundary (parallel folding; the beds stay conformable).
      About half of all worlds also get a TIGHT fold train (Joe, 2026-09-07:
      "increase the maximum fold angle ... vertically tilted beds ... erode into
      interesting spines"): a short-wavelength train with flattened crests and
      steep limbs, tanh-shaped, raised so its troughs sit at the regional level
      and its crests stand up to a kilometre or more above it. Beds are
      surfaces of a single-valued field, so they cannot overturn, but the limbs
      dip 65-80 degrees; the plane cut across a crest exposes every bed as a
      narrow stripe, and the hard stripes erode into fins.
   3. THE STARTING SURFACE is the folded top bed cut off by a planation level,
      so the anticline crests are already truncated and show older beds in plan
      view before a drop of rain has fallen (the San Rafael Swell look).
   4. EROSION, every step. Every bed also has a CRITICAL SLOPE (sandstone
      ~50 deg, shale ~17 deg): a cell standing steeper than its bed allows
      slumps down to that angle. This is what makes a hard cap a cliff and a
      soft bed a slope beneath it - the cliff-and-bench profile of the plateau. Rain = a base rate, more on high ground (orographic),
      plus drifting WET BELTS - patches of heavier rain a kilometre or two
      across that cross the map over ~100 steps, i.e. ~50,000 years: not
      storms but where the rain falls over a span of climate (Joe, 2026-09-07,
      did not know what "storms" meant at this pace; the display now says
      "wet belts"); discharge accumulates down the flow tree. Flow
      routing is Barnes' priority flood from the open front edge, which also
      yields the base-upward processing order; incision is the stream-power
      law dz/dt = -K sqrt(Q) S solved implicitly (Braun & Willett 2013), with
      K taken from the bed exposed at the surface; a little hillslope creep
      (linear diffusion) rounds the divides; slow uplift keeps the rivers
      cutting. The front edge is fixed base level: canyons open toward it.

   Pure and seeded: same seed, same landscape. No DOM. Units: cells of dx m,
   elevations in m, one step = dt years (display only).

   Written as a named FACTORY, not a bare IIFE, so the page can run it inside
   a Web Worker: Chromium will not load a worker script from file://, but it
   will run one built from a Blob of StrataFactory.toString(). The wall page
   does exactly that, so erosion runs on a second core while the first draws.
--------------------------------------------------------------------------- */
function StrataFactory(global) {
'use strict';

function rng32(seed){ let a=seed>>>0; return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

/* rock types: erodibility k (relative), thickness range (m), Utah palette */
const ROCK={   /* k erodibility, sc critical slope (rise/run), t thickness m, Utah palette
                  (muted 2026-09-07 at Joe's ask: the purples and greens were not the desert's) */
  sandstone:{k:0.30, sc:1.20, t:[50,170], colors:[[172,84,58],[190,112,76],[204,156,112],[222,210,186],[206,178,134],[184,96,64]]},
  limestone:{k:0.26, sc:1.00, t:[25,80],  colors:[[186,180,164],[168,164,148],[200,192,170]]},
  siltstone:{k:0.65, sc:0.55, t:[30,110], colors:[[176,124,94],[154,106,82],[192,142,104]]},
  mudstone: {k:1.00, sc:0.40, t:[40,140], colors:[[146,86,72],[132,100,92],[126,92,98],[156,98,78]]},
  shale:    {k:1.40, sc:0.30, t:[60,200], colors:[[128,126,118],[116,118,110],[138,132,116],[122,124,112]]},
};
const PICK=[['sandstone',.30],['shale',.25],['mudstone',.20],['siltstone',.15],['limestone',.10]];

function makeWorld(seed, opts){
  opts=opts||{};
  const nx=opts.nx||320, ny=opts.ny||200, dx=opts.dx||50, N=nx*ny;
  const R=rng32(seed);
  const r=(a,b)=>a+(b-a)*R();
  /* ---- 1. strata ---- */
  const L=12+Math.floor(R()*5), layers=[]; let base=0, prev=null;
  for(let k=0;k<L;k++){
    let u=R(), type=PICK[PICK.length-1][0], acc=0;
    for(const [t,p] of PICK){ acc+=p; if(u<acc){ type=t; break; } }
    if(type===prev && R()<0.6) type= type==='shale'?'sandstone':'shale';   // beds alternate more than chance
    const rock=ROCK[type], th=r(rock.t[0],rock.t[1]);
    const col=rock.colors[Math.floor(R()*rock.colors.length)].map(c=>Math.max(0,Math.min(255,Math.round(c*r(0.92,1.08)))));
    layers.push({type, base, top:base+th, thick:th, k:rock.k*r(0.85,1.15), sc:rock.sc*r(0.9,1.1), color:col});
    base+=th; prev=type;
  }
  const top=base;
  /* ---- 2. folding ---- */
  const F=new Float32Array(N);
  const trains=[]; const nt=2+(R()<0.5?1:0);
  for(let i=0;i<nt;i++) trains.push({A:r(70,230), lam:r(0.35,1.2)*nx, th:r(0,Math.PI), ph:r(0,2*Math.PI)});
  /* the tight train: F = A (1 + tanh(3 sin)) / 2, in [0, A]; limb dip = atan(3 pi A / lam) */
  const tight=(opts.tight!==undefined?opts.tight:R()<0.5) ? {A:r(700,1500), lam:r(45,90), th:r(0,Math.PI), ph:r(0,2*Math.PI)} : null;
  if(tight) tight.dipDeg=Math.atan(3*Math.PI*tight.A/(tight.lam*dx))*180/Math.PI;
  const dome={A:r(-220,220), cx:r(0.2,0.8)*nx, cy:r(0.2,0.8)*ny, s:r(0.12,0.28)*nx};
  const tilt={gx:r(-0.012,0.012), gy:r(-0.016,0.006)};                       // m per cell
  for(let y=0;y<ny;y++) for(let x=0;x<nx;x++){
    let f=tilt.gx*(x-nx/2)+tilt.gy*(y-ny/2);
    for(const t of trains) f+=t.A*Math.sin(2*Math.PI*(x*Math.cos(t.th)+y*Math.sin(t.th))/t.lam+t.ph);
    if(tight) f+=tight.A*(1+Math.tanh(3*Math.sin(2*Math.PI*(x*Math.cos(tight.th)+y*Math.sin(tight.th))/tight.lam+tight.ph)))/2;
    const ddx=x-dome.cx, ddy=y-dome.cy; f+=dome.A*Math.exp(-(ddx*ddx+ddy*ddy)/(2*dome.s*dome.s));
    F[y*nx+x]=f;
  }
  /* ---- 3. the starting surface: folded top, planed off ---- */
  const z=new Float64Array(N), z0=new Float64Array(N);
  const tops=Array.from(F,f=>top+f).sort((a,b)=>a-b);
  const plane=tops[Math.floor(N*(opts.planeQ||0.70))];
  let zmin=1e9;
  for(let i=0;i<N;i++){ z[i]=Math.min(top+F[i],plane)+r(-3,3); }
  /* the open front edge (y = ny-1, nearest the viewer) is base level */
  for(let x=0;x<nx;x++) zmin=Math.min(zmin,z[(ny-1)*nx+x]);
  const zb=zmin-(opts.drop||550);           // a deep base level: canyons can reach the old beds
  for(let x=0;x<nx;x++) z[(ny-1)*nx+x]=zb;
  z0.set(z);
  let rockTotal=0; for(let i=0;i<N;i++) rockTotal+=Math.max(0,z0[i]-zb);
  const w={seed,nx,ny,dx,N,L,layers,top,F,z,z0,zb,plane,trains,tight,dome,tilt,
    P:{dt:opts.dt||500, kScale:opts.kScale||0.008, m:0.5, uplift:opts.uplift||0.15, diff:opts.diff||0.015,
       rainBase:1, oro:0.6, stormRate:opts.stormRate||0.02, maxSteps:opts.maxSteps||3000},
    step:0, rockTotal, removed:0, storms:[], rain:new Float32Array(N), Q:new Float32Array(N),
    order:new Int32Array(N), rcv:new Int32Array(N), zf:new Float64Array(N), shade:new Float32Array(N),
    R};
  return w;
}

/* which bed is at elevation e in cell i (-1 = basement, L-1 = the top bed) */
function layerAt(w,i,e){
  const f=w.F[i], ls=w.layers;
  for(let k=ls.length-1;k>=0;k--) if(e>=ls[k].base+f) return k;
  return -1;
}

/* ---- a binary heap of (key, index) for the priority flood ---- */
function Heap(n){ this.k=new Float64Array(n+1); this.v=new Int32Array(n+1); this.n=0; }
Heap.prototype.push=function(key,val){ let i=++this.n; const k=this.k,v=this.v; while(i>1){ const p=i>>1; if(k[p]<=key) break; k[i]=k[p]; v[i]=v[p]; i=p; } k[i]=key; v[i]=val; };
Heap.prototype.pop=function(){ const k=this.k,v=this.v, topv=v[1]; const lk=k[this.n], lv=v[this.n]; this.n--; let i=1; for(;;){ let c=i*2; if(c>this.n) break; if(c<this.n && k[c+1]<k[c]) c++; if(lk<=k[c]) break; k[i]=k[c]; v[i]=v[c]; i=c; } if(this.n>0){ k[i]=lk; v[i]=lv; } return topv; };

const NB=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

function step(w){
  const {nx,ny,N,dx,z,F,P,layers}=w; const R=w.R;
  /* ---- rain: base + orographic + storms ---- */
  let zlo=1e9,zhi=-1e9; for(let i=0;i<N;i++){ if(z[i]<zlo) zlo=z[i]; if(z[i]>zhi) zhi=z[i]; }
  const relief=Math.max(1,zhi-zlo);
  if(R()<P.stormRate && w.storms.length<3){
    const side=R();                                  // storms drift with a prevailing wind, roughly west to east
    w.storms.push({x:-20, y:R()*ny, vx:1.2+R()*1.6, vy:(R()-0.5)*0.8, s:8+R()*14, I:2.5+R()*4, life:0});
  }
  const rain=w.rain;
  for(let i=0;i<N;i++) rain[i]=P.rainBase+P.oro*(z[i]-zlo)/relief;
  for(const s of w.storms){
    const x0=Math.max(0,Math.floor(s.x-3*s.s)), x1=Math.min(nx-1,Math.ceil(s.x+3*s.s));
    const y0=Math.max(0,Math.floor(s.y-3*s.s)), y1=Math.min(ny-1,Math.ceil(s.y+3*s.s));
    const inv=1/(2*s.s*s.s);
    for(let y=y0;y<=y1;y++){ const ddy=y-s.y; for(let x=x0;x<=x1;x++){ const ddx=x-s.x; rain[y*nx+x]+=s.I*Math.exp(-(ddx*ddx+ddy*ddy)*inv); } }
    s.x+=s.vx; s.y+=s.vy; s.life++;
  }
  w.storms=w.storms.filter(s=>s.x<nx+3*s.s && s.y>-3*s.s && s.y<ny+3*s.s);
  /* ---- routing: priority flood from the open front edge ---- */
  const zf=w.zf, rcv=w.rcv, order=w.order, heap=w.heap||(w.heap=new Heap(N));
  const seen=w.seen||(w.seen=new Uint8Array(N)); seen.fill(0); heap.n=0;
  for(let x=0;x<nx;x++){ const i=(ny-1)*nx+x; zf[i]=z[i]; rcv[i]=-1; seen[i]=1; heap.push(z[i],i); }
  let n=0;
  while(heap.n>0){
    const i=heap.pop(); order[n++]=i;
    const x=i%nx, y=(i-x)/nx;
    for(let d=0;d<8;d++){
      const xx=x+NB[d][0], yy=y+NB[d][1];
      if(xx<0||xx>=nx||yy<0||yy>=ny) continue;
      const j=yy*nx+xx; if(seen[j]) continue;
      seen[j]=1; zf[j]=Math.max(z[j],zf[i]+1e-4); rcv[j]=i; heap.push(zf[j],j);
    }
  }
  /* ---- discharge: accumulate rain down the tree (top-down = reverse order) ---- */
  const Q=w.Q; for(let i=0;i<N;i++) Q[i]=rain[i];
  for(let q=N-1;q>=0;q--){ const i=order[q], j=rcv[i]; if(j>=0) Q[j]+=Q[i]; }
  /* ---- stream power, implicit, base upward ---- */
  const kdt=P.kScale, U=P.uplift;
  for(let q=0;q<N;q++){
    const i=order[q], j=rcv[i]; if(j<0) continue;                // the front edge is fixed
    const k=layerAt(w,i,z[i]); const kr=k<0?0.22:layers[k].k;
    const xi=i%nx, xj=j%nx, dist=(xi!==xj && ((i-xi)!==(j-xj)))?1.41421356:1;
    const f=kdt*kr*Math.sqrt(Q[i])/dist;
    const zi=z[i]+U;
    let zn=(zi+f*z[j])/(1+f);
    if(zn<z[j]) zn=z[j];
    z[i]=zn;
  }
  /* ---- slumping: no cell may stand steeper than its bed allows ---- */
  for(let q=0;q<N;q++){
    const i=order[q], j=rcv[i]; if(j<0) continue;
    const k=layerAt(w,i,z[i]); const sc=k<0?1.3:layers[k].sc;
    const xi=i%nx, xj=j%nx, dist=(xi!==xj && ((i-xi)!==(j-xj)))?1.41421356:1;
    const maxdrop=sc*dist*dx;
    if(z[i]-z[j]>maxdrop) z[i]=z[j]+maxdrop;
  }
  /* ---- hillslope creep ---- */
  const D=P.diff, tmp=w.tmp||(w.tmp=new Float64Array(N));
  for(let y=0;y<ny-1;y++) for(let x=0;x<nx;x++){
    const i=y*nx+x, l=x>0?z[i-1]:z[i], rr=x<nx-1?z[i+1]:z[i], u=y>0?z[i-nx]:z[i], dn=z[i+nx];
    tmp[i]=z[i]+D*(l+rr+u+dn-4*z[i]);
  }
  for(let i=0;i<(ny-1)*nx;i++) z[i]=tmp[i];
  /* ---- bookkeeping ---- */
  let rem=0; for(let i=0;i<N;i++) rem+=Math.max(0,w.z0[i]-z[i]);
  w.removed=rem/w.rockTotal; w.step++;
  return w;
}

/* hillshade per cell, for the renderer: sun from the front-left, low */
function shadeAll(w, lx,ly,lz){
  const {nx,ny,z,dx,shade}=w;
  for(let y=0;y<ny;y++) for(let x=0;x<nx;x++){
    const i=y*nx+x;
    const gx=((x<nx-1?z[i+1]:z[i])-(x>0?z[i-1]:z[i]))/(2*dx), gy=((y<ny-1?z[i+nx]:z[i])-(y>0?z[i-nx]:z[i]))/(2*dx);
    const inv=1/Math.sqrt(gx*gx+gy*gy+1);
    const nxv=-gx*inv, nyv=-gy*inv, nzv=inv;
    shade[i]=Math.max(0,nxv*lx+nyv*ly+nzv*lz);
  }
}

function stats(w){
  /* which beds are exposed somewhere, and how much of the map each covers */
  const cover=new Float32Array(w.L+1);
  for(let i=0;i<w.N;i++) cover[layerAt(w,i,w.z[i])+1]++;
  for(let k=0;k<=w.L;k++) cover[k]/=w.N;
  return {step:w.step, years:w.step*w.P.dt, removed:w.removed, storms:w.storms.length, cover};
}

global.Strata={makeWorld, step, layerAt, shadeAll, stats, ROCK};
}
StrataFactory(typeof window!=='undefined'?window:globalThis);

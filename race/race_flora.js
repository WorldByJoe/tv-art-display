/* ---------------------------------------------------------------------------
   race_flora.js · v1.0 · 2026-10-14
   the plants of a frozen Strata world, placed by ecology.
   Joe, 2026-10-14: "add trees and shrubs to the scenes ... an ecological
   approach for a Utah ecosystem (eg Canyonlands) and put the right types of
   plants in the right types of soils & topography."

   THE HABITAT of every spot, read off the land the erosion model left:
     slope        rise over run; past 0.95 it is cliff, and cliffs are bare
     bed          the rock at the surface: sandstone and limestone weather to
                  thin sand over slickrock, siltstone to loam, mudstone and
                  shale to clay - the shale saline
     soil depth   an index from the landform: gentle and hollow (concave)
                  ground collects soil, steep and convex ground sheds it; soft
                  beds make deeper soil than hard ones; wash floors are alluvium
     aspect       north-facing slopes are shadier and moister than south-facing
                  ones, so they carry more plants and the trees that need water
     height       where the spot sits in the world's relief: pinyon climbs to the
                  mesa tops, blackbrush keeps to the lower benches
     drainage     flow accumulation (D8, cells draining through each cell): the
                  largest washes carry water near the surface
   THE PLANTS (Canyonlands vegetation, Colorado Plateau):
     pinyon pine       Pinus edulis: rocky, shallow soils over sandstone and
                       limestone, upper benches and mesa tops, more on north slopes
     Utah juniper      Juniperus osteosperma: the hardiest tree: shallow rocky
                       ground at every height, ledges and talus, south slopes too
     blackbrush        Coleogyne ramosissima: dense dark shrubland on thin sand
                       over slickrock benches, lower and middle heights
     big sagebrush     Artemisia tridentata: deep, well-drained soils - hollows,
                       valley floors, alluvial flats
     shadscale         Atriplex confertifolia: saline clay of the shale and
                       mudstone flats, sparse; the steep shale stays bare badland
     Mormon tea        Ephedra: rocky and sandy slopes and talus, scattered
     Fremont cottonwood, coyote willow: the floors of the largest washes
   Densities are each plant's real stand density scaled down together, so the
   proportions hold and the Pi's GPU keeps up: shrubs are drawn at about a
   sixth of their numbers within 50 m of the trail and fewer further out; trees
   at about a third, out to 700 m.

   Pure and seeded; place() returns a list of instances for the renderer.
---------------------------------------------------------------------------

   CHANGED
     v1.0  new: habitat from slope, bed, soil depth, aspect, height and drainage;
           seven Canyonlands plants placed by it
*/
function RaceFloraFactory(global){
'use strict';
/* size ranges (m) and colours (linear 0-1) for the renderer */
const SPECIES={
  pinyon:     {tree:true,  h:[3.0,7.0],  r:[1.3,2.6], crown:[0.19,0.29,0.16], trunk:[0.33,0.27,0.21], cap:1800},
  juniper:    {tree:true,  h:[2.0,4.5],  r:[1.0,2.2], crown:[0.35,0.42,0.30], trunk:[0.42,0.35,0.28], cap:2600},
  cottonwood: {tree:true,  h:[9.0,16.0], r:[3.5,6.5], crown:[0.42,0.55,0.24], trunk:[0.46,0.41,0.35], cap:250},
  willow:     {tree:false, h:[2.0,3.5],  r:[0.8,1.5], crown:[0.40,0.50,0.30], cap:700},
  sage:       {tree:false, h:[0.6,1.4],  r:[0.4,0.9], crown:[0.60,0.63,0.54], cap:5000},
  blackbrush: {tree:false, h:[0.5,1.0],  r:[0.4,0.8], crown:[0.33,0.31,0.27], cap:5000},
  shadscale:  {tree:false, h:[0.3,0.6],  r:[0.3,0.6], crown:[0.64,0.62,0.55], cap:2500},
  ephedra:    {tree:false, h:[0.5,1.0],  r:[0.3,0.6], crown:[0.55,0.60,0.33], cap:1500},
};
const ORDER=Object.keys(SPECIES);
const HARD={sandstone:1, limestone:1}, CLAY={mudstone:1, shale:1};

function rng32(seed){ let a=seed>>>0; return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };

/* D8 flow accumulation on the erosion grid: cells draining through each cell */
function flowAccumulation(z,nx,ny){
  const N=nx*ny, order=new Int32Array(N), acc=new Float32Array(N).fill(1);
  for(let i=0;i<N;i++) order[i]=i;
  order.sort((a,b)=>z[b]-z[a]);
  for(let k=0;k<N;k++){ const c=order[k], x=c%nx, y=(c-x)/nx; let best=-1, bd=0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const xx=x+dx, yy=y+dy; if(xx<0||yy<0||xx>=nx||yy>=ny) continue;
      const cc=yy*nx+xx, drop=(z[c]-z[cc])/((dx&&dy)?1.414:1); if(drop>bd){ bd=drop; best=cc; } }
    if(best>=0) acc[best]+=acc[c]; }
  return acc;
}

/* THE PLANTS' DENSITIES at one spot, per 100 m2 at full (real) density. h is the
   habitat; the numbers are stand densities of the order the plant ecology of the
   Colorado Plateau reports (pinyon-juniper woodland 50-400 trees/ha, blackbrush
   and sagebrush stands a shrub every few m2, shadscale far sparser). */
function densities(h){
  const d={}; for(const k of ORDER) d[k]=0;
  if(h.s>0.95) return d;                                            // cliff
  const aspect=1+0.45*h.north;                                       // north-facing: shadier, moister
  if(h.rip){ d.cottonwood=0.6*h.rip; d.willow=5*h.rip; }             // the wash floor
  const shallow=1-h.soil, deep=h.soil;
  const rocky=HARD[h.bed]?1:h.bed==='siltstone'?0.5:0;
  /* pinyon: rocky shallow ground, upper benches and mesas, wants the moister aspect */
  d.pinyon=1.6*rocky*smooth(0.2,0.55,shallow)*smooth(0.35,0.7,h.rel)*(1-smooth(0.6,0.9,h.s))*(1+0.8*h.north);
  /* juniper: shallow rocky ground everywhere, ledges and talus, tolerates the sun */
  d.juniper=2.2*(0.35+0.65*rocky)*smooth(0.15,0.5,shallow)*(1-smooth(0.7,0.95,h.s))*(CLAY[h.bed]?0.25:1)*aspect;
  /* blackbrush: thin sand over slickrock, gentle benches, lower and middle heights */
  d.blackbrush=40*rocky*smooth(0.3,0.6,shallow)*(1-smooth(0.15,0.35,h.s))*(1-smooth(0.55,0.85,h.rel));
  /* big sagebrush: deep soils of hollows and valley floors, not saline clay */
  d.sage=45*smooth(0.5,0.8,deep)*(1-smooth(0.15,0.3,h.s))*(h.bed==='shale'?0.04:h.bed==='mudstone'?0.4:1)*(h.rip?0.3:1);
  /* shadscale: the saline clay flats of shale and mudstone; steep shale is badland */
  d.shadscale=14*(CLAY[h.bed]?1:0)*(1-smooth(0.2,0.45,h.s));
  /* Mormon tea: rocky and sandy slopes and talus */
  d.ephedra=6*(HARD[h.bed]||h.bed==='siltstone'?1:0.2)*smooth(0.15,0.35,h.s)*(1-smooth(0.7,0.9,h.s));
  for(const k of ['blackbrush','sage','shadscale','ephedra']) d[k]*=aspect;   // the trees carry their own aspect terms
  return d;
}

/* place(o): o = {nx, ny, zE (erosion-grid z, erosion m), U, nxf, nyf, zr (fine z,
   erosion m), Fr (fine fold field), nrm (fine normals, 3 per cell, race frame),
   layers, scale (race m per erosion m), cell (race m per erosion cell),
   trail: [[x,z],...] race m, bbox {x0,z0,x1,z1} race m, seed}
   Returns {list:[{sp, x, z, h, r, rot, tint}], counts, habitat(x,z)}. */
function place(o){
  const {nx,ny,zE,U,nxf,nyf,zr,Fr,nrm,layers,scale,cell}=o, cf=cell/U, R=rng32(o.seed||1);
  const acc=flowAccumulation(zE,nx,ny);
  const sorted=Array.from(acc).sort((a,b)=>a-b), accRip=sorted[Math.floor(sorted.length*0.985)];   // the largest 1.5% of drainage
  let zmin=1e9, zmax=-1e9; for(let i=0;i<zr.length;i++){ if(zr[i]<zmin) zmin=zr[i]; if(zr[i]>zmax) zmax=zr[i]; }
  /* distance to the trail, race m, on the erosion grid (chamfer from the trail cells) */
  const dist=new Float32Array(nx*ny).fill(1e9), q=[];
  for(const [x,z] of o.trail){ const c=Math.min(ny-1,Math.max(0,Math.round(z/cell)))*nx+Math.min(nx-1,Math.max(0,Math.round(x/cell))); if(dist[c]>0){ dist[c]=0; q.push(c); } }
  for(let h=0;h<q.length;h++){ const c=q[h], x=c%nx, y=(c-x)/nx; if(dist[c]>800) continue;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const xx=x+dx, yy=y+dy; if(xx<0||yy<0||xx>=nx||yy>=ny) continue;
      const cc=yy*nx+xx, nd=dist[c]+cell*((dx&&dy)?1.414:1); if(nd<dist[cc]){ dist[cc]=nd; q.push(cc); } } }
  const fAt=(arr,X,Z)=>{ const xf=clamp(X/cf,0,nxf-1.001), yf=clamp(Z/cf,0,nyf-1.001), xi=xf|0, yi=yf|0, fx=xf-xi, fy=yf-yi, c=yi*nxf+xi;
    return (arr[c]*(1-fx)+arr[c+1]*fx)*(1-fy)+(arr[c+nxf]*(1-fx)+arr[c+nxf+1]*fx)*fy; };
  const gAt=(arr,X,Z)=>{ const x=clamp(X/cell,0,nx-1.001), y=clamp(Z/cell,0,ny-1.001), xi=x|0, yi=y|0, fx=x-xi, fy=y-yi, c=yi*nx+xi;
    return (arr[c]*(1-fx)+arr[c+1]*fx)*(1-fy)+(arr[c+nx]*(1-fx)+arr[c+nx+1]*fx)*fy; };
  /* THE HABITAT at a point */
  function habitat(X,Z){
    const xf=clamp(Math.round(X/cf),1,nxf-2), yf=clamp(Math.round(Z/cf),1,nyf-2), i=yf*nxf+xf;
    const ny_=nrm[3*i+1], s=Math.sqrt(Math.max(0,1-ny_*ny_))/Math.max(0.05,ny_);
    const hl=Math.hypot(nrm[3*i],nrm[3*i+2])||1, north=-nrm[3*i+2]/hl*Math.min(1,s/0.1);   // downhill toward -Z (the map's top) is north-facing
    const e=fAt(zr,X,Z), f=fAt(Fr,X,Z); let bed='basement'; for(let k=layers.length-1;k>=0;k--) if(e>=layers[k].base+f){ bed=layers[k].type; break; }
    /* curvature at landform scale (6 fine cells, 20 m): hollows positive */
    const k6=6, a=clamp(xf-k6,0,nxf-1), b=clamp(xf+k6,0,nxf-1), c2=clamp(yf-k6,0,nyf-1), d2=clamp(yf+k6,0,nyf-1);
    const lap=((zr[yf*nxf+a]+zr[yf*nxf+b]+zr[c2*nxf+xf]+zr[d2*nxf+xf])/4-zr[i])*scale;   // race m: how far the spot sits below its surroundings
    const ac=gAt(acc,X,Z), rip=ac>accRip && s<0.15 ? smooth(accRip,accRip*4,ac) : 0;
    const soft=CLAY[bed]?1:bed==='siltstone'?0.6:0;
    const soil=clamp(0.45-1.4*s+0.5*lap+0.3*soft+(ac>accRip*0.3?0.25:0),0,1);
    return {s,north,bed,rel:(e-zmin)/(zmax-zmin),soil,rip,lap,acc:ac};
  }
  /* sample the region: each sample stands for `area` m2; a plant appears with
     probability (density per 100 m2 x area/100 x thinning) */
  const {x0,z0,x1,z1}=o.bbox, A=(x1-x0)*(z1-z0), NS=Math.min(220000,Math.max(40000,A/18)), area=A/NS;
  const list=[], counts={}; for(const k of ORDER) counts[k]=0;
  for(let n=0;n<NS;n++){
    const X=x0+R()*(x1-x0), Z=z0+R()*(z1-z0), dT=gAt(dist,X,Z);
    if(dT<3.5) continue;                                            // never on the tread or its banks
    const thinShrub=dT<50?0.16:dT<200?0.05:0, thinTree=dT<700?0.33:0.08;
    if(!thinShrub && thinTree<0.1 && R()>0.25) continue;
    const h=habitat(X,Z), d=densities(h);
    let u=R(), pick=null;
    for(const k of ORDER){ const sp=SPECIES[k], lam=d[k]/100*area*(sp.tree?thinTree:thinShrub); if(lam<=0) continue; if(u<lam){ pick=k; break; } u-=lam; }
    if(!pick || counts[pick]>=SPECIES[pick].cap) continue;
    const sp=SPECIES[pick]; counts[pick]++;
    list.push({sp:pick, x:X, z:Z, h:sp.h[0]+R()*(sp.h[1]-sp.h[0]), r:sp.r[0]+R()*(sp.r[1]-sp.r[0]), rot:R()*6.283, tint:0.85+0.3*R()});
  }
  return {list,counts,habitat,accRip};
}
global.RaceFlora={SPECIES, ORDER, place, densities, flowAccumulation};
}
RaceFloraFactory(typeof window!=='undefined'?window:globalThis);

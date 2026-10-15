/* ---------------------------------------------------------------------------
   race_planner.js · v2.1 · 2026-10-14
   cuts a mountain-bike course into a frozen Strata world.
   Joe, 2026-09-07: the race is a loop; the start is a wide two-track so the
   field spreads out; the route takes switchbacks on the steep parts and
   avoids the cliffs.
   Joe, 2026-10-13: "the code picks a typically flat route" - one longer lap;
   not afraid of steep terrain, with switchbacks and singletrack benched into
   the hillside; out and back legs never side by side, the loop round and
   spread over the map; a mix of singletrack and two-track for passing.

   HOW A TRAIL IS FOUND. A* over the erosion grid where every state is a cell
   AND a heading (one of sixteen), so turning has a price. Rules, all physical:
     - grade cap: no step may climb or drop more than the cap (12-32% by the
       day's difficulty). The sixteen headings are the eight neighbours plus
       the eight knight's moves: with only eight, the gentlest climbing step
       across a hillside ran 45 degrees off the contour, so on any slope over
       about 0.3 every step but a level one broke the cap and the router could
       not climb there at all - which is why the old courses kept to the flat.
     - cut and fill: the tread is benched into the hillside, so it may sit up
       to `cutFill` (0.6 m) above or below the ground at each step; the grade
       is checked on what is left after that
     - no penalty for sidehill: a benched tread is level across, whatever the
       hillside does. Hillsides are where a course designer WANTS the trail
       (flow, views), so they are cheaper per metre than flat ground, and so is
       ground beside a cliff (a rim, or the floor under a wall). Past 0.75 the
       bench gets heavy to build and the price rises again; past `slopeMax`
       (0.95, 43 degrees) it is a cliff and off limits.
     - turns: a little for 22 degrees, a hairpin (157) a lot, a reversal
       forbidden - so the switchbacks are found, not drawn
   THE LOOP is laid around the map, not out and back. The ground a trail can
   reach from the start is flooded first; its centre and spread give an
   ellipse, and the loop visits waypoints spaced evenly round that ellipse,
   alternately HIGH and LOW within each waypoint's own patch of ground, so the
   course keeps climbing and dropping. Each leg is pushed away from every
   earlier leg (hard within two cells, priced out to 180 m), so two legs never
   run side by side; a leg leaves its waypoint in the heading it arrived on,
   so it cannot turn straight back. The ellipse is scaled until the lap lands
   in the asked length.
   TWO-TRACK. After the loop is found, the stretches on gentle ground (side
   slope under 0.15, the trail fairly straight, at least 120 m long) are
   two-track - a jeep road is only ever built where the ground allows one -
   and the rest is singletrack. Passing happens on the two-track.

   Pure and seeded; a named FACTORY so a page can run it in a worker.
   Units: grid cells with `cell` metres each; z in metres AT THE RACE SCALE
   (the caller rescales the world: all lengths shrink together, so slopes,
   and therefore every rule above, are unchanged).
---------------------------------------------------------------------------

   CHANGED
     v2.1  the shape of a race: the first and last legs are roads (a start that
           sorts the field, a run-in where it can still change) and passing places
           break any singletrack over 2 km; a budget in search steps, not ms
     v2.0  sixteen headings, cut and fill, no sidehill penalty (hillsides and
           rims are preferred); the loop is laid round an ellipse through
           alternating high and low waypoints, legs repel each other; one
           longer lap; two-track found along the loop
     v1.0  versioning starts here; this file predates the scheme
*/
function RacePlannerFactory(global){
'use strict';
let lastDiag=null;                     // why the last loop() failed or how it went
/* sixteen headings: the eight neighbours and the eight knight's moves, in order of angle */
const DIR=[[1,0],[2,1],[1,1],[1,2],[0,1],[-1,2],[-1,1],[-2,1],[-1,0],[-2,-1],[-1,-1],[-1,-2],[0,-1],[1,-2],[1,-1],[2,-1]];
const NH=16;
const DLEN=DIR.map(d=>Math.hypot(d[0],d[1]));
/* the two cells a knight's move passes over; they must be rideable too */
const MIDS=DIR.map(([dx,dy])=>Math.abs(dx)+Math.abs(dy)<3?[]:(Math.abs(dx)===2?[[Math.sign(dx),0],[Math.sign(dx),dy]]:[[0,Math.sign(dy)],[dx,Math.sign(dy)]]));
/* cost factor by heading change, in sixteenths of a turn (x step length) */
const TURN=[0,0.12,0.35,0.9,1.5,2.4,4.0,6.0,Infinity,6.0,4.0,2.4,1.5,0.9,0.35,0.12];

/* HOW HARD A COURSE IS (Joe, 2026-09-10). `cap` is the steepest step the router
   will take; `turn` prices every change of heading; `gPen` prices grade against
   the cap, so it decides how much of the allowance the trail actually spends. A
   low cap with cheap turns means the trail CANNOT go straight up and can afford
   to zigzag; a high cap with dear turns takes the pitch head on. The caps come
   from Joe's trail data: hard trails average 10-12% and reach about 35%. */
const GRADES={
  easy:   {cap:0.12, turn:0.60, gPen:2.2},
  medium: {cap:0.18, turn:1.00, gPen:1.5},
  hard:   {cap:0.32, turn:1.70, gPen:1.0}   /* 0.5 sent 7% of the course above the beds' drive limit and the winner walked 720 m */
};

function rng32(seed){ let a=seed>>>0; return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const smooth=(a,b,x)=>{ const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };

/* steepness (rise/run magnitude) of every cell */
function slopes(z,nx,ny,cell){
  const s=new Float32Array(nx*ny), M=3;                    // the outermost M cells are off limits: the block's
  for(let y=0;y<ny;y++) for(let x=0;x<nx;x++){            // edge rows are flat and cheap, and a trail along
    const i=y*nx+x;                                        // the rim of the world is not a trail
    if(x<M||y<M||x>=nx-M||y>=ny-M){ s[i]=9; continue; }
    const gx=((x<nx-1?z[i+1]:z[i])-(x>0?z[i-1]:z[i]))/(2*cell), gy=((y<ny-1?z[i+nx]:z[i])-(y>0?z[i-nx]:z[i]))/(2*cell);
    s[i]=Math.sqrt(gx*gx+gy*gy);
  }
  return s;
}

/* WHERE A DESIGNER WANTS A TRAIL: the price of a metre of trail on each cell,
   relative to open flat ground at 1. Hillsides 0.65 (a benched singletrack
   across a slope is the best riding there is); within three cells of a cliff
   another 0.2 off (a rim, or the floor under a wall); over 0.75 the bench gets
   heavy to cut and the price climbs back to 1.15 at slopeMax. */
function terrainCost(slope,nx,ny,P){
  const N=nx*ny, t=new Float32Array(N), cliff=new Uint8Array(N);
  for(let i=0;i<N;i++) if(slope[i]>P.slopeMax && slope[i]<9) cliff[i]=1;
  const near=new Uint8Array(N);
  for(let y=0;y<ny;y++) for(let x=0;x<nx;x++){ if(!cliff[y*nx+x]) continue;
    for(let dy=-3;dy<=3;dy++) for(let dx=-3;dx<=3;dx++){ const xx=x+dx, yy=y+dy; if(xx>=0&&yy>=0&&xx<nx&&yy<ny) near[yy*nx+xx]=1; } }
  for(let i=0;i<N;i++){ const s=slope[i];
    t[i]=1-0.35*smooth(0.12,0.45,s)+0.5*smooth(0.75,P.slopeMax,s)-(near[i]?0.2:0); }
  return {t,near,min:0.45};
}

/* where a ROAD can go: open flat ground at 1, side slopes over 0.1 dearer and
   dearer (a road cut into a hillside is a big cut), no bonus for cliffs */
function roadCost(slope,nx,ny,P){
  const N=nx*ny, t=new Float32Array(N);
  for(let i=0;i<N;i++){ const s=slope[i]; t[i]=1+3*smooth(0.10,0.35,s)+1.5*smooth(0.5,P.slopeMax,s); }
  return {t,min:1};
}
/* the finished loop, measured: does it cross itself (two legs on one cell away
   from a junction), how much of it runs within 70 m of a part of itself at
   least 300 m away along the trail (the out-and-back Joe does not want), how
   round it is (4 pi area / length^2), and how much of it is on a hillside */
function quality(L,slope,nx,cell,legOf){
  const P=L.path, n=P.length, xy=P.map(c=>[c%nx,(c-c%nx)/nx]);
  const owner=new Map(); let cross=0;
  for(let i=0;i<n;i++){ const c=P[i]; const o=owner.get(c); if(o!==undefined && o.leg!==legOf[i] && Math.abs(o.i-i)>6 && i<n-6) cross++; else owner.set(c,{leg:legOf[i],i}); }
  const cum=[0]; for(let i=1;i<n;i++) cum.push(cum[i-1]+Math.hypot(xy[i][0]-xy[i-1][0],xy[i][1]-xy[i-1][1])*cell);
  const Lt=cum[n-1]||1, st=Math.max(1,Math.floor(n/500)); let beside=0, m=0;
  for(let i=0;i<n;i+=st){ m++; for(let j=0;j<n;j+=st){ let al=Math.abs(cum[i]-cum[j]); al=Math.min(al,Lt-al); if(al<300) continue; if(Math.hypot(xy[i][0]-xy[j][0],xy[i][1]-xy[j][1])*cell<70){ beside++; break; } } }
  beside/=Math.max(1,m);
  let A=0; for(let i=0;i<n;i++){ const a=xy[i], b=xy[(i+1)%n]; A+=a[0]*b[1]-b[0]*a[1]; } const iq=4*Math.PI*Math.abs(A)/2*cell*cell/(Lt*Lt);
  let hill=0; for(let i=1;i<n;i++) if(slope[P[i]]>0.25) hill+=cum[i]-cum[i-1]; hill/=Lt;
  return {cross,beside,iq,hill,score:hill+0.8*iq-6*beside};
}

/* a binary heap of (key, value) that grows */
function Heap(n){ this.k=new Float64Array(n+1); this.v=new Int32Array(n+1); this.n=0; }
Heap.prototype.push=function(key,val){ if(this.n+1>=this.k.length){ const k=new Float64Array(this.k.length*2), v=new Int32Array(this.v.length*2); k.set(this.k); v.set(this.v); this.k=k; this.v=v; }
  let i=++this.n; const k=this.k,v=this.v; while(i>1){ const p=i>>1; if(k[p]<=key) break; k[i]=k[p]; v[i]=v[p]; i=p; } k[i]=key; v[i]=val; };
Heap.prototype.pop=function(){ const k=this.k,v=this.v, topv=v[1]; const lk=k[this.n], lv=v[this.n]; this.n--; let i=1; for(;;){ let c=i*2; if(c>this.n) break; if(c<this.n && k[c+1]<k[c]) c++; if(lk<=k[c]) break; k[i]=k[c]; v[i]=v[c]; i=c; } if(this.n>0){ k[i]=lk; v[i]=lv; } return topv; };

/* may a trail step from cell c in direction d? (the cell exists, it and any cell
   the move passes over are below slopeMax and not blocked, and the grade after
   cut and fill is within the cap). Returns the step's grade or -1. */
function stepOK(z,nx,ny,cell,slope,P,blocked,c,d,to){
  const x=c%nx, y=(c-x)/nx, xx=x+DIR[d][0], yy=y+DIR[d][1];
  if(xx<0||xx>=nx||yy<0||yy>=ny) return -1;
  const cc=yy*nx+xx; if(slope[cc]>P.slopeMax) return -1;
  if(blocked && blocked[cc] && cc!==to) return -1;
  for(const m of MIDS[d]){ const mc=(y+m[1])*nx+(x+m[0]); if(slope[mc]>P.slopeMax || (blocked && blocked[mc] && mc!==to)) return -1; }
  const len=DLEN[d]*cell, grade=Math.max(0,Math.abs(z[cc]-z[c])-P.cutFill)/len;
  return grade>P.gradeCap?-1:grade;
}

/* which cells a legal trail can reach from `from`: a plain flood with the same
   step rules, heading ignored. Cheap, and it keeps the planner from ever asking
   A* for a route that does not exist - a failed A* visits every reachable state
   before giving up. */
function reachable(z,nx,ny,cell,slope,from,P,blocked){
  const N=nx*ny, seen=new Uint8Array(N), stack=[from]; seen[from]=1; let n=0;
  while(stack.length){
    const c=stack.pop(); n++; const x=c%nx, y=(c-x)/nx;
    for(let d=0;d<NH;d++){
      if(stepOK(z,nx,ny,cell,slope,P,blocked,c,d,-1)<0) continue;
      const cc=(y+DIR[d][1])*nx+(x+DIR[d][0]); if(seen[cc]) continue;
      seen[cc]=1; stack.push(cc);
    }
  }
  return {seen,count:n};
}

/* A* from cell `from` (leaving in heading hd0, or any heading if hd0 < 0) to
   cell `to` (any heading). Per metre: the terrain's price, the turn, the grade
   against the cap, and `rep` (the push away from earlier legs).
   Returns {path:[cell...], length (m), explored:[cell...], endHeading} or null.
   maxPops bounds the work on a bad day (the Pi has a show to run). */
function route(z,nx,ny,cell,slope,from,to,P,terr,rep,blocked,hd0,ws){
  const N=nx*ny, maxPops=P.maxPops||2500000;
  const g=ws.g, parent=ws.parent, closed=ws.closed; g.fill(Infinity); parent.fill(-1); closed.fill(0);
  const heap=ws.heap; heap.n=0; const explored=[]; const tx=to%nx, ty=(to-tx)/nx, hw=terr.min*cell;
  const h=(c)=>{ const x=c%nx, y=(c-x)/nx; return Math.hypot(x-tx,y-ty)*hw; };
  for(let d=0;d<NH;d++){ if(hd0>=0 && d!==hd0) continue; g[from*NH+d]=0; heap.push(h(from),from*NH+d); }
  let pops=0, found=-1;
  while(heap.n>0 && pops<maxPops){
    const s=heap.pop(); if(closed[s]) continue; closed[s]=1;
    const c=(s/NH)|0, hd=s%NH; pops++;
    if(pops%16===0) explored.push(c);
    if(c===to){ found=s; break; }
    const x=c%nx, y=(c-x)/nx;
    for(let d=0;d<NH;d++){
      const turn=TURN[(d-hd+NH)%NH]*P.turnMul; if(!isFinite(turn)) continue;
      const grade=stepOK(z,nx,ny,cell,slope,P,blocked,c,d,to); if(grade<0) continue;
      const cc=(y+DIR[d][1])*nx+(x+DIR[d][0]);
      const cost=DLEN[d]*cell*(terr.t[cc]+turn+P.gPen*(grade/P.gradeCap)+(rep?rep[cc]:0));
      const ns=cc*NH+d, ng=g[s]+cost;
      if(ng<g[ns]){ g[ns]=ng; parent[ns]=s; heap.push(ng+h(cc),ns); }
    }
  }
  if(found<0) return null;
  const path=[]; let s=found; while(s>=0){ path.push((s/NH)|0); s=parent[s]; } path.reverse();
  let length=0; for(let i=1;i<path.length;i++){ const a=path[i-1], b=path[i]; const ax=a%nx, bx=b%nx; length+=Math.hypot(bx-ax,((b-bx)-(a-ax))/nx)*cell; }
  /* the act-2 picture of the search: at most 1,200 cells a leg, so a long search
     does not keep the viewer waiting */
  const ex=explored.length>1200?explored.filter((_,i)=>i%Math.ceil(explored.length/1200)===0):explored;
  return {path,length,explored:ex,endHeading:found%NH,pops};
}

/* every cell a path passes over, knight's moves filled in */
function raster(path,nx){
  const out=[];
  for(let i=0;i<path.length;i++){ const c=path[i]; out.push(c); if(i+1<path.length){ const a=c, b=path[i+1], ax=a%nx, ay=(a-ax)/nx, bx=b%nx, by=(b-bx)/nx, dx=bx-ax, dy=by-ay;
      if(Math.abs(dx)+Math.abs(dy)===3){ const m=Math.abs(dx)===2?[Math.sign(dx),0]:[0,Math.sign(dy)]; out.push((ay+m[1])*nx+(ax+m[0])); } } }
  return out;
}

/* the two-track start candidates: every straight, gentle run of >= 20 cells
   (side slope under 0.12) along a row or a column - after a few hundred thousand
   years of erosion a dead-flat 200 m does not exist, but a gentle straight does */
function startRuns(nx,ny,slope,region){
  const runs=[]; const LEN=20, MAXS=0.12;
  const ok=(i)=>slope[i]<MAXS && (!region||region[i]);
  for(let y=3;y<ny-3;y++){ let x0=-1;
    for(let x=0;x<=nx;x++){ const g=x<nx && ok(y*nx+x);
      if(g && x0<0) x0=x; if(!g && x0>=0){ for(let a=x0;a+LEN-1<x;a+=6) runs.push({along:'x',y,x0:a,x1:a+LEN-1}); x0=-1; } } }
  for(let x=3;x<nx-3;x++){ let y0=-1;
    for(let y=0;y<=ny;y++){ const g=y<ny && ok(y*nx+x);
      if(g && y0<0) y0=y; if(!g && y0>=0){ for(let a=y0;a+LEN-1<y;a+=6) runs.push({along:'y',x,y0:a,y1:a+LEN-1}); y0=-1; } } }
  return runs;
}
function stripOf(r,nx){ const s=[]; if(r.along==='x'){ for(let x=r.x0;x<=r.x1;x++) s.push(r.y*nx+x); } else { for(let y=r.y0;y<=r.y1;y++) s.push(y*nx+r.x); } return s; }

/* how far every cell is from the trail laid so far, in cells (8-neighbour
   chamfer, out to D): the push between legs is read off it */
function addDistance(dist,cells,nx,ny,D){
  const q=[]; for(const c of cells){ if(dist[c]>0){ dist[c]=0; } q.push(c); }
  for(let h=0;h<q.length;h++){ const c=q[h], x=c%nx, y=(c-x)/nx, dc=dist[c]; if(dc>=D) continue;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy) continue; const xx=x+dx, yy=y+dy; if(xx<0||yy<0||xx>=nx||yy>=ny) continue;
      const cc=yy*nx+xx, nd=dc+((dx&&dy)?1.414:1); if(nd<dist[cc]){ dist[cc]=nd; q.push(cc); } } }
}

/* THE DAY'S COURSE. The model chooses the difficulty when the caller does not
   (a third each, so the wall shows all three kinds over a run of races). When
   no loop of the asked length fits the land at that difficulty - an easy course
   needs gentle ground, and some worlds are all cliff and steep slope - the
   designer settles for the next harder one rather than a scrap of a course. */
function loop(z,nx,ny,cell,opts){
  const R=rng32(opts.seed||1);
  let tier = opts.difficulty || (R()<0.34?'easy':(R()<0.5?'hard':'medium'));
  const ladder=['easy','medium','hard'];
  for(;;){
    const L=loopTier(z,nx,ny,cell,opts,tier,R);
    const inBand=L && L.length>=(opts.minLen||6000) && L.length<=(opts.maxLen||11000);
    if(inBand || opts.difficulty || tier==='hard') return L;
    tier=ladder[ladder.indexOf(tier)+1];
  }
}
function loopTier(z,nx,ny,cell,opts,tier,R){
  const G0 = GRADES[tier] || GRADES.medium;
  const P={gradeCap:opts.gradeCap||G0.cap, slopeMax:opts.slopeMax||0.95, cutFill:opts.cutFill!=null?opts.cutFill:0.6,
           turnMul:opts.turnMul||G0.turn, gPen:(opts.gPen!=null?opts.gPen:G0.gPen), tier, maxPops:opts.maxPops};
  const N=nx*ny, slope=slopes(z,nx,ny,cell), terr=terrainCost(slope,nx,ny,P), terrRoad=roadCost(slope,nx,ny,P);
  const PR=Object.assign({},P,{turnMul:P.turnMul*1.8});     // a road bends less
  const ws={g:new Float32Array(N*NH), parent:new Int32Array(N*NH), closed:new Uint8Array(N*NH), heap:new Heap(1<<18)};
  const diag=lastDiag={regions:0,attempts:0,legs:0,legFail:0,noCand:0,rev:0,noFinish:0,lens:[],pops:0};
  const target=opts.targetLen||8000, minLen=opts.minLen||6000, maxLen=opts.maxLen||11000;

  /* THE GROUND A COURSE CAN USE: the largest piece of the map a trail can get
     around, flooded with the step rules. */
  const comp=new Int32Array(N).fill(-1); let bestC=-1, bestN=0, nc=0;
  for(let i=0;i<N;i++){ if(comp[i]>=0 || slope[i]>0.6) continue;
    const r=reachable(z,nx,ny,cell,slope,i,P); let n=0; for(let c=0;c<N;c++) if(r.seen[c] && comp[c]<0){ comp[c]=nc; n++; }
    if(n>bestN){ bestN=n; bestC=nc; } nc++; if(bestN>N*0.5) break; }
  diag.regions=nc; diag.region=bestN;
  if(bestC<0) return null;
  const region=new Uint8Array(N); for(let i=0;i<N;i++) region[i]=comp[i]===bestC?1:0;
  /* its centre and spread: the loop is laid round an ellipse on the principal axes */
  let mx=0,my=0; for(let i=0;i<N;i++) if(region[i]){ mx+=i%nx; my+=(i-i%nx)/nx; } mx/=bestN; my/=bestN;
  let sxx=0,syy=0,sxy=0; for(let i=0;i<N;i++) if(region[i]){ const dx=i%nx-mx, dy=(i-i%nx)/nx-my; sxx+=dx*dx; syy+=dy*dy; sxy+=dx*dy; } sxx/=bestN; syy/=bestN; sxy/=bestN;
  const tr=(sxx+syy)/2, det=Math.sqrt(Math.max(0,((sxx-syy)/2)**2+sxy*sxy)), l1=tr+det, l2=Math.max(1,tr-det);
  const ang=0.5*Math.atan2(2*sxy,sxx-syy), e1=[Math.cos(ang),Math.sin(ang)], e2=[-Math.sin(ang),Math.cos(ang)];
  const A1=Math.sqrt(3*l1), A2=Math.sqrt(3*l2);                    // half-widths of a uniform patch with that spread
  const ringAt=(th,k)=>[mx+k*(A1*Math.cos(th)*e1[0]+A2*Math.sin(th)*e2[0]), my+k*(A1*Math.cos(th)*e1[1]+A2*Math.sin(th)*e2[1])];
  const ringParam=(x,y)=>{ const dx=x-mx, dy=y-my, u=(dx*e1[0]+dy*e1[1])/A1, v=(dx*e2[0]+dy*e2[1])/A2; return {th:Math.atan2(v,u), r:Math.hypot(u,v)}; };

  const runs=startRuns(nx,ny,slope,region);
  if(!runs.length){ diag.noStart=true; return null; }
  let k=opts.ringK||0.62, best=null;
  const tries=opts.tries||8;
  for(let attempt=0;attempt<tries;attempt++){
    diag.attempts++;
    /* the start: a gentle straight lying on the ring, run along it */
    const scored=runs.map(r=>{ const s=stripOf(r,nx), a=s[0], b=s[s.length-1];
      const pa=ringParam(a%nx,(a-a%nx)/nx), pb=ringParam(b%nx,(b-b%nx)/nx), off=Math.abs((pa.r+pb.r)/2-k);
      return {r,s,off,score:off+0.25*R()}; }).sort((u,v)=>u.score-v.score);
    const pick=scored[Math.floor(R()*Math.min(4,scored.length))];
    let strip=pick.s; if(R()<0.5) strip=strip.slice().reverse();   // either way round the ring
    const c0=strip[0], c1=strip[strip.length-1];
    const p0=ringParam(c0%nx,(c0-c0%nx)/nx), p1=ringParam(c1%nx,(c1-c1%nx)/nx);
    let dirT=p1.th-p0.th; while(dirT>Math.PI) dirT-=2*Math.PI; while(dirT<-Math.PI) dirT+=2*Math.PI;
    const dir=dirT>=0?1:-1;
    /* how many waypoints: one per ~1.1 km of ring */
    const perim=2*Math.PI*k*Math.sqrt((A1*A1+A2*A2)/2)*cell, K=Math.max(4,Math.min(8,Math.round(perim/1100)));
    /* the ground laid so far: hard-blocked cells, and the distance field that prices the push */
    const blocked=new Uint8Array(N), dist=new Float32Array(N).fill(1e9), rep=new Float32Array(N), D=18, RP=4;
    /* block 0: priced only; 1: the cells themselves impassable; 2: everything
       within two cells (legs at least 30 m apart; the push reaches 180 m) */
    const lay=(cells,block)=>{ addDistance(dist,cells,nx,ny,D); if(!block) return; for(const c of cells){ blocked[c]=1; if(block>1){ const x=c%nx, y=(c-x)/nx; for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){ const xx=x+dx, yy=y+dy; if(xx>=0&&yy>=0&&xx<nx&&yy<ny) blocked[yy*nx+xx]=1; } } } };
    const refreshRep=()=>{ for(let i=0;i<N;i++){ const d=dist[i]; rep[i]=d<D?RP*(1-d/D)*(1-d/D):0; } };
    lay(strip.slice(1,-1),1); refreshRep();
    const legs=[]; let cur=c1, hd=strip.length>1?headingOf(strip[strip.length-2],c1,nx):-1, pending=null, ok=true, roads=0;
    const wps=[];
    /* can a trail still get home from `from`? (to a free cell beside the start of the strip) */
    const canGoHome=(from)=>{ const r=reachable(z,nx,ny,cell,slope,from,P,blocked), cx0=c0%nx, cy0=(c0-cx0)/nx;
      for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){ const xx=cx0+dx, yy=cy0+dy; if(xx<0||yy<0||xx>=nx||yy>=ny) continue; const cc=yy*nx+xx; if(!blocked[cc]&&r.seen[cc]) return true; }
      return false; };
    for(let w=1;w<=K+1 && ok;w++){
      const last=w===K+1;
      /* this leg's goal: the next waypoint, or home */
      let cands;
      if(last){ cands=[c0]; }
      else {
        const th=p1.th+dir*2*Math.PI*w/(K+1), pc=ringAt(th,k), rw=Math.max(8,0.45*perim/cell/(K+1));
        const reach=reachable(z,nx,ny,cell,slope,cur,P,blocked);
        let pool=[]; const x0=Math.max(3,Math.floor(pc[0]-rw)), x1=Math.min(nx-4,Math.ceil(pc[0]+rw)), y0=Math.max(3,Math.floor(pc[1]-rw)), y1=Math.min(ny-4,Math.ceil(pc[1]+rw));
        for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){ const c=y*nx+x; if(!reach.seen[c]||slope[c]>0.6||dist[c]<5) continue; if(Math.hypot(x-pc[0],y-pc[1])>rw) continue; pool.push(c); }
        if(pool.length<6){ diag.noCand++; continue; }               // nothing here: on to the next waypoint
        /* alternately the high and the low ground of the patch, near a cliff if it can be */
        pool.sort((a,b)=>z[a]-z[b]); const hi=(w%2===1)===(z[c1]<z[pool[pool.length>>1]]);
        const q=Math.max(3,Math.floor(pool.length*0.3)), side=hi?pool.slice(pool.length-q):pool.slice(0,q);
        side.sort((a,b)=>(terr.near[b]-terr.near[a])||(R()-0.5));
        cands=side.slice(0,Math.min(6,side.length)).sort(()=>R()-0.5).slice(0,3);
      }
      let leg=null;
      for(const goal of cands){
        if(last && !canGoHome(cur)){ diag.noFinish++; break; }
        /* UP THE TWO-TRACK, DOWN THE SINGLETRACK: a climbing leg is a road more
           often than not (and at least one is), the classic cross-country
           pattern - and the climbs are where the speeds differ most, so that is
           where passing is wanted. A road keeps to gentle side slopes and bends
           less; a singletrack seeks the hillside. */
        /* THE SHAPE OF A RACE (Joe, 2026-10-14: is the two-track where an
           interesting race wants it?). Measured on 16 courses it was not: the
           start two-track was usually 200-300 m, so the order out of the start
           sprint froze on the first singletrack; the longest stretch with no
           chance to pass was 1.8-7.3 km; and on 9 of 16 the last chance to pass
           came 1.3-7.3 km before the line. So the FIRST leg is a road (a start
           long enough to sort the field), the LAST leg is a road (a run-in where
           a race can still change), climbs are roads more often than not, and
           twoTrack() adds passing places so no singletrack runs on for more than
           2 km where the ground allows a wider spot. */
        const climbs=z[goal]>z[cur]+8, road=(w===1) || last || (climbs && R()<0.6);
        const r=route(z,nx,ny,cell,slope,cur,goal,road?PR:P,road?terrRoad:terr,rep,blocked,hd,ws); diag.legs++;
        if(!r){ diag.legFail++; continue; } diag.pops+=r.pops;
        if(revisits(r.path,nx)){ diag.rev++; continue; }
        /* lay it - the leg before this one in full now, this one with its last
           three cells left open so the next can leave - and never accept a leg
           that cuts the course off from home */
        const save={b:blocked.slice(), d:dist.slice()};
        if(pending) lay(pending,2);
        const rc=raster(r.path,nx), nb=Math.max(0,rc.length-8);
        lay(rc.slice(0,nb),2); lay(rc.slice(nb,Math.max(nb,rc.length-3)),1); lay(rc.slice(Math.max(nb,rc.length-3)),0);
        if(!last && !canGoHome(r.path[r.path.length-1])){ blocked.set(save.b); dist.set(save.d); diag.cutOff=(diag.cutOff||0)+1; continue; }
        pending=rc.slice(nb); leg=r; leg.road=road; if(road) roads++; break;
      }
      if(!leg){ if(last) ok=false; continue; }
      legs.push(leg); if(!last) wps.push(leg.path[leg.path.length-1]);
      refreshRep(); cur=leg.path[leg.path.length-1]; hd=leg.endHeading;
    }
    if(!ok || !legs.length){ diag.lens.push(0); continue; }
    const s0={path:strip.slice(),length:(strip.length-1)*cell,explored:[],road:true};
    const segs=[s0].concat(legs.map(l=>({path:l.path,length:l.length,explored:l.explored,road:l.road})));
    const length=segs.reduce((a,s)=>a+s.length,0); diag.lens.push(Math.round(length));
    const path=[], roadMask=[], legOf=[];
    segs.forEach((sg,i)=>{ const from=i?1:0; for(let j=from;j<sg.path.length;j++){ path.push(sg.path[j]); roadMask.push(sg.road?1:0); legOf.push(i); } });
    const cand={start:{cells:[c0,c1],cell:c1}, waypoints:wps, segs, length, path, roadMask, legOf, ringK:k};
    /* how good is it: in the asked length, never crossing itself, never running
       beside itself, round, and on the hillsides */
    cand.q=quality(cand,slope,nx,cell,legOf);
    const inBand=length>=minLen && length<=maxLen;
    const score=(inBand?10:0)-Math.abs(length-target)/1000*(inBand?0:1)+(cand.q.cross?-20:0)+cand.q.score;
    if(!best||score>best.score){ best=cand; best.score=score; }
    if(inBand && !cand.q.cross && cand.q.beside<0.04) break;
    /* a work budget, counted in search steps rather than milliseconds so the Pi
       and the Mac plan the same course from the same seed (a clock budget made the
       slower Pi give up sooner and pick differently): the Pi has a show to run, and
       a good-enough loop beats a perfect one */
    const budget=opts.budgetPops||4e6;
    if(best.score>=10 && diag.pops>budget) break;
    if(diag.pops>2*budget) break;                                      // and never more than twice that
    if(attempt>=2 && best.length<0.5*minLen) break;                   // this difficulty does not fit this land
    if(inBand){ continue; }
    k*=Math.max(0.7,Math.min(1.35,Math.pow(target/length,0.9)));     // too short: a wider ring; too long: a tighter one
    k=Math.max(0.3,Math.min(0.95,k));
  }
  if(best){ best.slope=slope; best.P=P; best.tier=tier; best.switchbacks=countHairpins(best.path,nx);
    let lo=Infinity, hi=-Infinity, climb=0; for(let i=0;i<best.path.length;i++){ const e=z[best.path[i]]; if(e<lo) lo=e; if(e>hi) hi=e; if(i&&e>z[best.path[i-1]]) climb+=e-z[best.path[i-1]]; }
    best.courseRelief=hi-lo; best.climb=climb;
    /* THE GRADES ACTUALLY CUT, not the ones allowed, measured off the path */
    const gr=[]; for(let i=1;i<best.path.length;i++){
      const a=best.path[i-1], b=best.path[i], ax=a%nx, bx=b%nx;
      const d=Math.hypot(bx-ax,((b-bx)-(a-ax))/nx)*cell;
      if(d>0) gr.push(Math.max(0,Math.abs(z[b]-z[a])-P.cutFill)/d); }
    gr.sort((u,v)=>u-v);
    const at=q=>gr.length?gr[Math.min(gr.length-1,Math.floor(q*gr.length))]:0;
    best.grade={ mean:gr.length?gr.reduce((u,v)=>u+v,0)/gr.length:0, p50:at(0.5), p90:at(0.9),
                 max:gr.length?gr[gr.length-1]:0, pctOver15:gr.length?gr.filter(g=>g>0.15).length/gr.length:0 };
    best.twoTrack=twoTrack(best,slope,nx,cell); }
  return best;
}
function headingOf(a,b,nx){ const ax=a%nx, ay=(a-ax)/nx, bx=b%nx, by=(b-bx)/nx, dx=bx-ax, dy=by-ay;
  for(let d=0;d<NH;d++) if(DIR[d][0]===dx&&DIR[d][1]===dy) return d; return -1; }

/* TWO-TRACK where the ground allows a road. On a road leg, wherever the side
   slope is under 0.3 and the line is not a hairpin; on a singletrack leg, only
   where it crosses flat open ground (under 0.1) in a straight line. Either way
   a stretch must be at least 120 m long to count (short gaps are closed first),
   and the start strip is always two-track; then passing places (below). Returned
   per path point (mask), plus the share of the length. */
function twoTrack(L,slope,nx,cell){
  const P=L.path, n=P.length, xy=P.map(c=>[c%nx,(c-c%nx)/nx]), road=L.roadMask||[];
  const seg=(i)=>i>0?Math.hypot(xy[i][0]-xy[i-1][0],xy[i][1]-xy[i-1][1])*cell:0;
  const stripN=L.segs[0].path.length, legOf=L.legOf||[], lastLeg=legOf.length?legOf[n-1]:-1;
  const bendAt=new Float32Array(n);
  for(let i=0;i<n;i++){ const a=xy[Math.max(0,i-3)], b=xy[i], c=xy[Math.min(n-1,i+3)];
    const h1=Math.atan2(b[1]-a[1],b[0]-a[0]), h2=Math.atan2(c[1]-b[1],c[0]-b[0]); let d=Math.abs(h2-h1); if(d>Math.PI) d=2*Math.PI-d; bendAt[i]=d; }
  /* a road between the first and last legs keeps to side slopes under `inner`;
     0.3 at first, 0.15 when that leaves more than half the lap two-track (a lap
     that is mostly road is not a mountain-bike race) */
  const build=(inner)=>{ const m=new Uint8Array(n);
    for(let i=0;i<n;i++){ const s=slope[P[i]], d=bendAt[i], end=legOf[i]===1||legOf[i]===lastLeg;
      m[i]=(i<stripN)||(road[i]?(s<(end?0.3:inner)&&d<2.2):(s<0.1&&d<0.6))?1:0; }
    for(let i=1;i<n;i++) if(!m[i]){ let j=i; while(j<n&&!m[j]) j++; if(j<n && j-i<=3 && m[i-1]) for(let t=i;t<j;t++) m[t]=1; i=j; }   // close short gaps
    for(let i=0;i<n;){ if(!m[i]){ i++; continue; } let j=i, len=0; while(j<n&&m[j]){ len+=seg(j); j++; } if(i>=stripN && len<120) for(let t=i;t<j;t++) m[t]=0; i=j; }
    return m; };
  const share=(m)=>{ let tl=0, all=0; for(let i=1;i<n;i++){ const d=seg(i); all+=d; if(m[i]&&m[i-1]) tl+=d; } return all?tl/all:0; };
  let m=build(0.3); if(share(m)>0.5) m=build(0.15);
  /* PASSING PLACES: wherever singletrack runs on for more than 2 km, the gentlest
     straight 90 m near the middle of it is widened to two-track (side slope under
     0.3, no hairpin) - what a trail builder does - until no such stretch is left
     or the ground offers no place. */
  const cum=[0]; for(let i=1;i<n;i++) cum.push(cum[i-1]+seg(i));
  const GAP=2000, WIN=90, tried=new Set();
  for(let guard=0;guard<30;guard++){
    let best=null;
    for(let i=0;i<n;){ if(m[i]){ i++; continue; } let j=i; while(j<n&&!m[j]) j++; const len=cum[Math.min(j,n-1)]-cum[i]; if(!tried.has(i) && len>GAP && (!best||len>best.len)) best={i0:i,i1:Math.min(j,n-1),len}; i=j; }
    if(!best) break;
    const centre=(cum[best.i0]+cum[best.i1])/2; let pick=null;
    for(let a=best.i0+3;a<best.i1-3;a++){ let b=a; while(b<best.i1-3 && cum[b]-cum[a]<WIN) b++; if(cum[b]-cum[a]<WIN) break;
      let ms=0, bend=0; for(let t=a;t<=b;t++){ ms=Math.max(ms,slope[P[t]]); }
      { const h1=Math.atan2(xy[Math.min(n-1,a+3)][1]-xy[a][1],xy[Math.min(n-1,a+3)][0]-xy[a][0]), h2=Math.atan2(xy[b][1]-xy[Math.max(0,b-3)][1],xy[b][0]-xy[Math.max(0,b-3)][0]); bend=Math.abs(h2-h1); if(bend>Math.PI) bend=2*Math.PI-bend; }
      if(ms>=0.3 || bend>1.2) continue;
      const sc=ms+0.0002*Math.abs((cum[a]+cum[b])/2-centre);
      if(!pick||sc<pick.sc) pick={a,b,sc}; }
    if(!pick){ tried.add(best.i0); continue; }
    for(let t=pick.a;t<=pick.b;t++) m[t]=1;
  }
  let tl=0, all=0; for(let i=1;i<n;i++){ const d=seg(i); all+=d; if(m[i]&&m[i-1]) tl+=d; }
  return {mask:m,frac:all?tl/all:0};
}
/* does a path run back along its own cells? On a 10 m grid a switchback's two
   limbs are adjacent cells too, so adjacency alone is not the test - LENGTH is:
   a hairpin's limbs touch for a handful of cells, an out-and-back shares a
   corridor for tens. Reject when the longest run of consecutive points that
   each have an earlier neighbour (index gap >= 6, same or adjacent cell) is
   at least `minRun` cells. */
function revisits(path,nx,minRun){
  minRun=minRun||10;
  const seen=new Map(); let run=0, longest=0;
  for(let i=0;i<path.length;i++){ const c=path[i]; let hit=false;
    for(let dy=-1;dy<=1&&!hit;dy++) for(let dx=-1;dx<=1;dx++){ const j=seen.get(c+dy*nx+dx); if(j!==undefined && i-j>=6){ hit=true; break; } }
    run=hit?run+1:0; if(run>longest) longest=run;
    seen.set(c,i); }
  return longest>=minRun;
}
/* hairpins: heading changes of 135 deg or more within a few cells */
function countHairpins(path,nx){
  let n=0, last=null;
  for(let i=2;i<path.length;i++){
    const a=path[i-2], b=path[i-1], c=path[i];
    const ax=a%nx, bx=b%nx, cx=c%nx, ay=(a-ax)/nx, by=(b-bx)/nx, cy=(c-cx)/nx;
    const h1=Math.atan2(by-ay,bx-ax), h2=Math.atan2(cy-by,cx-bx); let d=Math.abs(h2-h1); if(d>Math.PI) d=2*Math.PI-d;
    if(d>2.3 && (last===null||i-last>3)){ n++; last=i; }
  }
  return n;
}
global.RacePlanner={loop, route, slopes, reachable, countHairpins, revisits, twoTrack, GRADES, get lastDiag(){ return lastDiag; }};
}
RacePlannerFactory(typeof window!=='undefined'?window:globalThis);

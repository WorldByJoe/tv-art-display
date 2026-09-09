/* ---------------------------------------------------------------------------
   race_planner.js - cuts a mountain-bike course into a frozen Strata world.
   Joe, 2026-09-07: the race is a loop of 2-5 miles; the start is a wide
   two-track so the field spreads out; the route takes switchbacks on the steep
   parts and avoids the cliffs.

   HOW A TRAIL IS FOUND. A* over the erosion grid where every state is a cell
   AND a heading (one of eight), so turning has a price and the search can
   prefer to run across a slope. Rules, all physical:
     - grade cap: no step may climb or drop more than gradeCap (12%) of its
       length - so on a steep hillside the only legal steps run obliquely,
       and gaining height means zigzagging: the switchbacks are not drawn,
       they fall out of the cap
     - cliffs: a cell whose ground is steeper than slopeMax (rise/run 0.7,
       ~35 deg) is impassable; steepness below that costs extra (sidehill)
     - turns: 45 deg costs a little, 90 more, 135 (a hairpin) a lot, a
       reversal is forbidden - so the line is smooth where it can be
   The loop is two-track -> A -> B -> two-track through two waypoints picked
   at random across the block, re-picked until the loop's length lands in the
   asked band. LOOP ONLY (Joe, 2026-09-08: "you'd never have racers going in
   opposite directions on the same singletrack"): the trail leaves the
   two-track at one end and returns to the other; a later leg may not enter
   ground within two cells of an earlier leg (impassable, not merely dear);
   and a candidate whose path revisits its own cells - which an out-and-back
   must do, while a switchback's limbs run a cell or two apart - is thrown
   away. The two-track itself is the loop's only shared stretch, ridden the
   same way every lap.

   Pure and seeded; a named FACTORY so a page can run it in a worker.
   Units: grid cells with `cell` metres each; z in metres AT THE RACE SCALE
   (the caller rescales the world: all lengths shrink together, so slopes,
   and therefore every rule above, are unchanged).
--------------------------------------------------------------------------- */
function RacePlannerFactory(global){
'use strict';
let lastDiag=null;                     // why the last loop() failed or how it went
const DIR=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];          // 8 headings, 45 deg apart
const DLEN=[1,Math.SQRT2,1,Math.SQRT2,1,Math.SQRT2,1,Math.SQRT2];
const TURN=[0,0.35,1.5,4.0,Infinity,4.0,1.5,0.35];                         // cost factor by heading change (x d)

function rng32(seed){ let a=seed>>>0; return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

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

/* binary heap of (key, value) */
function Heap(n){ this.k=new Float64Array(n+1); this.v=new Int32Array(n+1); this.n=0; }
Heap.prototype.push=function(key,val){ let i=++this.n; const k=this.k,v=this.v; while(i>1){ const p=i>>1; if(k[p]<=key) break; k[i]=k[p]; v[i]=v[p]; i=p; } k[i]=key; v[i]=val; };
Heap.prototype.pop=function(){ const k=this.k,v=this.v, topv=v[1]; const lk=k[this.n], lv=v[this.n]; this.n--; let i=1; for(;;){ let c=i*2; if(c>this.n) break; if(c<this.n && k[c+1]<k[c]) c++; if(lk<=k[c]) break; k[i]=k[c]; v[i]=v[c]; i=c; } if(this.n>0){ k[i]=lk; v[i]=lv; } return topv; };

/* which cells a legal trail can reach from `from`: a plain flood over cells
   with the same slope and grade rules, heading ignored. Cheap, and it keeps
   the planner from ever asking A* for a route that does not exist - a
   failed A* visits every reachable state before giving up. */
function reachable(z,nx,ny,cell,slope,from,P,blocked){
  const N=nx*ny, seen=new Uint8Array(N), stack=[from]; seen[from]=1; let n=0;
  while(stack.length){
    const c=stack.pop(); n++; const x=c%nx, y=(c-x)/nx, zc=z[c];
    for(let d=0;d<8;d++){
      const xx=x+DIR[d][0], yy=y+DIR[d][1]; if(xx<0||xx>=nx||yy<0||yy>=ny) continue;
      const cc=yy*nx+xx; if(seen[cc]||slope[cc]>P.slopeMax||(blocked&&blocked[cc])) continue;
      if(Math.abs(z[cc]-zc)/(DLEN[d]*cell)>P.gradeCap) continue;
      seen[cc]=1; stack.push(cc);
    }
  }
  return {seen,count:n};
}

/* A* from cell `from` (any heading) to cell `to` (any heading).
   Returns {path:[cell...], length (m), explored:[cell...]} or null.
   maxPops bounds the work on a bad day (the Pi has a show to run). */
function route(z,nx,ny,cell,slope,from,to,P,used){
  const N=nx*ny, NS=N*8, maxPops=P.maxPops||1500000;
  const g=new Float32Array(NS).fill(Infinity), parent=new Int32Array(NS).fill(-1), closed=new Uint8Array(NS);
  const heap=new Heap(1<<22); const explored=[]; const tx=to%nx, ty=(to-tx)/nx;
  const h=(c)=>{ const x=c%nx, y=(c-x)/nx; return Math.hypot(x-tx,y-ty)*cell; };
  for(let d=0;d<8;d++){ g[from*8+d]=0; heap.push(h(from),from*8+d); }
  let pops=0, found=-1;
  while(heap.n>0 && pops<maxPops){
    const s=heap.pop(); if(closed[s]) continue; closed[s]=1;
    const c=(s/8)|0, hd=s&7; pops++;
    if(pops%16===0) explored.push(c);
    if(c===to){ found=s; break; }
    const x=c%nx, y=(c-x)/nx, zc=z[c];
    for(let d=0;d<8;d++){
      const turn=TURN[(d-hd+8)&7]; if(turn===Infinity) continue;
      const xx=x+DIR[d][0], yy=y+DIR[d][1]; if(xx<0||xx>=nx||yy<0||yy>=ny) continue;
      const cc=yy*nx+xx; if(slope[cc]>P.slopeMax) continue;
      const len=DLEN[d]*cell, grade=Math.abs(z[cc]-zc)/len; if(grade>P.gradeCap) continue;
      const side=slope[cc]/P.slopeMax;
      if(used && used[cc] && cc!==to) continue;                                          // an earlier leg's ground: impassable
      const cost=len*(1+turn+2.5*side*side+1.5*(grade/P.gradeCap));
      const ns=cc*8+d, ng=g[s]+cost;
      if(ng<g[ns]){ g[ns]=ng; parent[ns]=s; heap.push(ng+h(cc),ns); }
    }
  }
  if(found<0) return null;
  const path=[]; let s=found; while(s>=0){ path.push((s/8)|0); s=parent[s]; } path.reverse();
  let length=0; for(let i=1;i<path.length;i++){ const a=path[i-1], b=path[i]; const ax=a%nx, bx=b%nx; length+=Math.hypot(bx-ax,((b-bx)-(a-ax))/nx)*cell; }
  return {path,length,explored};
}

/* the two-track: a straight, gentle run of >= 20 cells (grade under 12%) along
   a row or a column - after a few hundred thousand years of erosion a dead-flat
   250 m does not exist, but a gentle straight does */
function findStart(z,nx,ny,slope,R){
  const runs=[]; const LEN=20, MAXS=0.12;
  for(let y=Math.floor(ny*0.1);y<ny*0.9;y++){ let x0=-1;
    for(let x=0;x<=nx;x++){ const ok=x<nx && slope[y*nx+x]<MAXS;
      if(ok && x0<0) x0=x; if(!ok && x0>=0){ if(x-x0>=LEN) runs.push({along:'x',y,x0,x1:x-1}); x0=-1; } } }
  for(let x=Math.floor(nx*0.1);x<nx*0.9;x++){ let y0=-1;
    for(let y=0;y<=ny;y++){ const ok=y<ny && slope[y*nx+x]<MAXS;
      if(ok && y0<0) y0=y; if(!ok && y0>=0){ if(y-y0>=LEN) runs.push({along:'y',x,y0,y1:y-1}); y0=-1; } } }
  if(!runs.length) return null;
  const r=runs[Math.floor(R()*runs.length)];
  if(r.along==='x'){ const x0=r.x0+Math.floor(R()*Math.max(1,(r.x1-r.x0-LEN+1))), x1=x0+LEN-1; return {along:'x',y:r.y,x0,x1,cells:[r.y*nx+x0,r.y*nx+x1],cell:r.y*nx+x1}; }
  const y0=r.y0+Math.floor(R()*Math.max(1,(r.y1-r.y0-LEN+1))), y1=y0+LEN-1; return {along:'y',x:r.x,y0,y1,cells:[y0*nx+r.x,y1*nx+r.x],cell:y1*nx+r.x};
}

/* the loop: two-track -> A (low) -> B (high) -> two-track. Each stage floods
   reachability afresh with the ground already used BLOCKED, and picks the
   next waypoint only from what that flood reaches - so a leg is never asked
   to leave a canyon by the corridor it came in through. Waypoints are
   re-picked until the loop's length lands in the asked band. */
function loop(z,nx,ny,cell,opts){
  const P={gradeCap:opts.gradeCap||0.12, slopeMax:opts.slopeMax||0.7};
  const R=rng32(opts.seed||1), slope=slopes(z,nx,ny,cell), N=nx*ny;
  /* candidate start lines, best first by reachable AREA TIMES RELIEF - a start
     on the plateau top can reach a lot of flat, a start on a bench can reach the
     canyon floor and the climb out. A start on a one-corridor bench cannot host
     a loop at all (the way out is the only way back), so when every attempt
     from a start fails, the next start is tried. */
  const starts=[]; const seenStarts=new Set();
  for(let k=0;k<16;k++){
    const st=findStart(z,nx,ny,slope,R); if(!st) break; if(seenStarts.has(st.cell)) continue; seenStarts.add(st.cell);
    const rc=reachable(z,nx,ny,cell,slope,st.cell,P);
    let lo=Infinity, hi=-Infinity; for(let c=0;c<N;c++) if(rc.seen[c]){ if(z[c]<lo) lo=z[c]; if(z[c]>hi) hi=z[c]; }
    rc.relief=hi-lo; starts.push({st,rc,score:rc.count*(20+rc.relief)});
  }
  if(!starts.length) return null;
  starts.sort((a,b)=>b.score-a.score);
  const diag=lastDiag={starts:0,attempts:0,noA:0,s1:0,noB:0,s2:0,noC:0,s3:0,rev:0};
  const dist=(a,b)=>{ const ax=a%nx, bx=b%nx; return Math.hypot(ax-bx,((a-ax)-(b-bx))/nx); };
  let best=null;
  for(const cand0 of starts.slice(0,8)){
  const start=cand0.st, reach=cand0.rc; diag.starts++;
  const strip=[]; if(start.along==='x'){ for(let x=start.x0;x<=start.x1;x++) strip.push(start.y*nx+x); } else { for(let y=start.y0;y<=start.y1;y++) strip.push(y*nx+start.x); }
  const c0=strip[0], c1=strip[strip.length-1], span=Math.sqrt(reach.count);
  /* candidates from a flood: not steep, at least `minD` cells from `from`, in the
     asked elevation quartile ('low' or 'high') */
  const pickFrom=(seen,from,minD,which)=>{ const c=[]; for(let i=0;i<N;i++){ if(!seen[i]||slope[i]>0.35) continue; if(dist(i,from)<minD) continue; c.push(i); }
    if(c.length<8) return null; c.sort((a,b)=>z[a]-z[b]); const q=Math.max(4,Math.floor(c.length*0.25));
    return which==='low'?c.slice(0,q):c.slice(c.length-q); };
  for(let attempt=0;attempt<(opts.tries||6);attempt++){
    diag.attempts++;
    const used=new Uint8Array(N);
    /* used ground: the cells themselves plus one cell either side (30 m of
       separation at 10 m cells), except at a leg's ends so the next leg can leave */
    const mark=(path,keepEnds)=>{ for(let i=0;i<path.length;i++){ const c=path[i], x=c%nx, y=(c-x)/nx; used[c]=1;
      if(keepEnds && (i<3||i>path.length-4)) continue;
      for(let dy=-1;dy<=1;dy++) for(let dxx=-1;dxx<=1;dxx++){ const xx=x+dxx, yy=y+dy; if(xx>=0&&xx<nx&&yy>=0&&yy<ny) used[yy*nx+xx]=1; } } };
    mark(strip,true);
    const r1=reachable(z,nx,ny,cell,slope,c1,P,used); const lows=pickFrom(r1.seen,c1,0.35*span,'low'); if(!lows){ diag.noA++; continue; }
    const A=lows[Math.floor(R()*lows.length)];
    const s1=route(z,nx,ny,cell,slope,c1,A,P,used); if(!s1){ diag.s1++; continue; } if(revisits(s1.path,nx)){ diag.rev++; continue; } mark(s1.path,true);
    const r2=reachable(z,nx,ny,cell,slope,A,P,used); const highs=pickFrom(r2.seen,A,0.2*span,'high'); if(!highs){ diag.noB++; continue; }
    const B=highs[Math.floor(R()*highs.length)];
    const s2=route(z,nx,ny,cell,slope,A,B,P,used); if(!s2){ diag.s2++; continue; } if(revisits(s2.path,nx)){ diag.rev++; continue; } mark(s2.path,true);
    /* the finish cell is itself marked used (it is on the two-track), so ask
       whether the flood reaches any free cell beside it */
    const r3=reachable(z,nx,ny,cell,slope,B,P,used); const cx0=c0%nx, cy0=(c0-cx0)/nx; let canFinish=false;
    for(let d=0;d<8&&!canFinish;d++){ const xx=cx0+DIR[d][0], yy=cy0+DIR[d][1]; if(xx<0||xx>=nx||yy<0||yy>=ny) continue; const cc=yy*nx+xx; if(!used[cc]&&r3.seen[cc]) canFinish=true; }
    if(!canFinish){ diag.noC++; continue; }
    const s3=route(z,nx,ny,cell,slope,B,c0,P,used); if(!s3){ diag.s3++; continue; } if(revisits(s3.path,nx)){ diag.rev++; continue; }
    /* the loop as ridden: the two-track c0 -> c1, then the three legs back to c0 */
    const s0={path:strip.slice(),length:(strip.length-1)*cell,explored:[]};
    const segs=[s0,s1,s2,s3];
    const length=segs.reduce((a,s)=>a+s.length,0);
    const cand={start,waypoints:[A,B],segs,length,path:segs[0].path.concat(segs[1].path.slice(1),segs[2].path.slice(1),segs[3].path.slice(1))};
    const target=opts.targetLen||5000, miss=Math.abs(length-target);
    if(!best||miss<best.miss){ best=cand; best.miss=miss; best.reachable=reach.count; best.relief=reach.relief; }
    if(length>=opts.minLen&&length<=opts.maxLen) break;
  }
  if(best && best.length>=opts.minLen && best.length<=opts.maxLen) break;   // a loop in the band from this start: done
  }
  if(best){ best.slope=slope; best.P=P; best.switchbacks=countHairpins(best.path,nx);
    let lo=Infinity, hi=-Infinity, climb=0; for(let i=0;i<best.path.length;i++){ const e=z[best.path[i]]; if(e<lo) lo=e; if(e>hi) hi=e; if(i&&e>z[best.path[i-1]]) climb+=e-z[best.path[i-1]]; }
    best.courseRelief=hi-lo; best.climb=climb; }
  return best;
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
global.RacePlanner={loop, route, slopes, findStart, reachable, countHairpins, revisits, get lastDiag(){ return lastDiag; }};
}
RacePlannerFactory(typeof window!=='undefined'?window:globalThis);

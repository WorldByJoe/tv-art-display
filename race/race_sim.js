/* ---------------------------------------------------------------------------
   race_sim.js - the riders and the race, on a course cut by race_planner.js
   into a frozen Strata world. Joe, 2026-09-07:
     "n riders ... randomly drawn skill and strength for hill climbing ... a
      wide 2-track so the riders get spaced out by sprinting ... a loop of
      2-5 miles ... 2 laps ... faster riders pass slower riders ... speed is
      determined by physics and by watts for climbing and by skill at finding
      the best line ... riders can crash if they try something physics doesn't
      allow ... skill: perceiving the landscape and executing moves ... energy
      levels deplete and tired riders make more mistakes ... mild crashes can
      be recovered from, severe (over a cliff) drop a rider."

   THE TRAIL. The planner's path, smoothed, sampled every 2 m: elevation,
   grade, curvature, the BED underfoot (grip and roughness by rock type -
   sandstone is slickrock, shale is loose), EXPOSURE (a cliff drops away
   within two cells) and WIDTH (the two-track, and gentle straight slickrock,
   where passing is possible).

   A RIDER each tick (dt 0.1 s):
     power      sustainable W/kg x mass, scaled by energy left; the sprint
                watts for the first 25 s; a dig above sustainable drains the
                store, easy riding refills it slowly
     forces     gravity on the grade, rolling drag by bed, air drag; traction
                caps drive on the climbs
     the limit  the true cornering/technical speed limit over the next 12 m
                (grip, curvature, roughness); the rider PERCEIVES it with an
                error that shrinks with perception and grows with fatigue,
                then rides at a fraction of what they perceive set by
                execution and nerve
     crashes    entering a stretch faster than its true limit is a slide:
                over an edge with a big overshoot the rider is OUT; otherwise
                down for a few seconds and riding again. Rough ground also
                throws tired, clumsy riders on its own.
     traffic    behind a slower rider on narrow trail you wait; passing needs
                width
   RACE DAY AND THE BODY (Joe, 2026-09-08: "add insolation, humidity and
   temperature ... heat tolerance as a rider trait ... principles of human
   physiology"). Each rider is a two-node heat balance every tick:
     heat in    metabolic heat at 22% gross efficiency (3.5 W of heat per W
                at the pedals) plus 80 W basal, plus the sun on 0.25 m2 of
                rider at 0.7 absorptance
     heat out   convection from 1.8 m2 of skin at 34 C, the coefficient rising
                with air speed (a rider's own speed plus a light wind), and
                turning into a GAIN once the air is hotter than skin;
                evaporation of sweat, where the sweat rate rises with core
                temperature above 37 C (up to a maximum that acclimatised,
                heat-tolerant riders push higher) and evaporation is capped by
                how much vapour the air will take: hot AND humid is the killer
     core       stores the difference at 3.49 kJ per kg per degree
     effects    above a threshold of 38.3 C, raised by up to 0.9 C by heat
                tolerance, sustainable power falls 22% per degree and errors
                rise; at 40 C the rider stops to cool for half a minute;
                water lost beyond 2% of body weight costs 3% of power per
                further percent. Riders drink 0.4 L/h from the bottle.
   Tallied for the cards: work at the pedals -> kilocalories at 22%, litres
   sweated, vertical metres climbed, peak core temperature.
   Pure and seeded. Distances in metres along the loop, speeds m/s.
--------------------------------------------------------------------------- */
function RaceSimFactory(global){
'use strict';
function rng32(seed){ let a=seed>>>0; return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const G=9.81, RHO=1.1, CDA=0.42;
const BED={ sandstone:{mu:0.90,crr:0.008,rough:0.15}, limestone:{mu:0.85,crr:0.010,rough:0.25}, siltstone:{mu:0.70,crr:0.018,rough:0.45},
            mudstone:{mu:0.60,crr:0.024,rough:0.60}, shale:{mu:0.55,crr:0.030,rough:0.75}, basement:{mu:0.80,crr:0.012,rough:0.35} };
const NAMES=['Ruiz','Okafor','Lindqvist','Tanaka','Moreau','Adeyemi','Novak','Castellano','Byrne','Haddad','Kowalski','Ferreira','Iversen','Mbeki','Salazar','Petrova'];
const INKS=['#e34948','#2a78d6','#f2d43d','#ffffff','#eb6834','#33c2c2','#a463f2','#5ad45a'];

/* ---- the trail ---------------------------------------------------------- */
function buildTrail(plan, w, cell, ds){
  ds=ds||2;
  const nx=w.nx, scale=cell/w.dx;
  let pts=plan.path.map(c=>{ const x=c%nx; return [x+0.5,(c-x)/nx+0.5]; });
  for(let k=0;k<2;k++){ const q=[pts[0]]; for(let i=0;i<pts.length-1;i++){ const a=pts[i], b=pts[i+1]; q.push([0.75*a[0]+0.25*b[0],0.75*a[1]+0.25*b[1]]); q.push([0.25*a[0]+0.75*b[0],0.25*a[1]+0.75*b[1]]); } q.push(pts[pts.length-1]); pts=q; }
  const zAt=(x,y)=>{ const xi=Math.max(0,Math.min(nx-2,x|0)), yi=Math.max(0,Math.min(w.ny-2,y|0)), fx=x-xi, fy=y-yi, c=yi*nx+xi;
    return ((w.z[c]*(1-fx)+w.z[c+1]*fx)*(1-fy)+(w.z[c+nx]*(1-fx)+w.z[c+nx+1]*fx)*fy); };
  /* cumulative length in race metres, then resample every ds */
  const cum=[0]; for(let i=1;i<pts.length;i++) cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1])*cell);
  const L=cum[cum.length-1], n=Math.floor(L/ds), S=[]; let j=0;
  for(let i=0;i<n;i++){ const d=i*ds; while(j<cum.length-2 && cum[j+1]<d) j++; const f=(d-cum[j])/Math.max(1e-6,cum[j+1]-cum[j]);
    const x=pts[j][0]+(pts[j+1][0]-pts[j][0])*f, y=pts[j][1]+(pts[j+1][1]-pts[j][1])*f; S.push({x,y,zE:zAt(x,y)}); }
  const slope=plan.slope;
  for(let i=0;i<n;i++){
    const s=S[i], p=S[(i-3+n)%n], q=S[(i+3)%n];
    s.z=s.zE*scale;
    s.grade=((q.zE-p.zE)*scale)/(6*ds);
    const h1=Math.atan2(s.y-p.y,s.x-p.x), h2=Math.atan2(q.y-s.y,q.x-s.x); let dh=h2-h1; while(dh>Math.PI) dh-=2*Math.PI; while(dh<-Math.PI) dh+=2*Math.PI;
    s.curv=Math.abs(dh)/(6*ds); s.heading=h2;
    const cx=s.x|0, cy=s.y|0, c=cy*nx+cx, k=Strata.layerAt(w,c,s.zE);
    s.bed=k<0?'basement':w.layers[k].type; const b=BED[s.bed]; s.mu=b.mu; s.crr=b.crr; s.rough=b.rough; s.color=k<0?[92,86,88]:w.layers[k].color;
    let exposed=false; for(let dy=-3;dy<=3&&!exposed;dy++) for(let dx=-3;dx<=3;dx++){ const xx=cx+dx, yy=cy+dy; if(xx<0||yy<0||xx>=nx||yy>=w.ny) continue; const cc=yy*nx+xx; if(slope[cc]>0.7 && slope[cc]<5 && w.z[cc]<s.zE-10){ exposed=true; break; } }
    s.exposed=exposed;
    s.wide=(i*ds<220) || (Math.abs(s.grade)<0.05 && s.curv<0.02 && s.rough<0.3);
  }
  /* the true speed limit of each stretch: cornering on the grip, less on rough ground */
  for(let i=0;i<n;i++){ const s=S[i]; const vc=Math.sqrt(s.mu*G/Math.max(s.curv,0.004)); s.vlim=Math.min(21,vc*(1-0.45*s.rough)*(s.grade<-0.08?0.85:1)); }
  return {S,n,ds,L,cell};
}

/* ---- the riders ---------------------------------------------------------- */
function makeRiders(seed,count){
  const R=rng32(seed), r=(a,b)=>a+(b-a)*R(); const used=new Set(), riders=[];
  for(let i=0;i<count;i++){
    let name; do{ name=NAMES[Math.floor(R()*NAMES.length)]; }while(used.has(name)); used.add(name);
    const kg=r(56,92), bike=12, mass=kg+bike, wkg=r(2.8,4.8), sprint=r(650,1250), perception=r(0.25,1), execution=r(0.25,1), nerve=r(0.3,1), stamina=r(45,110), heat=r(0.2,1);
    riders.push({i,num:i+1,name,color:INKS[i%INKS.length],kg,bike,mass,wkg,sprint,perception,execution,nerve,stamina,heat,
      s:0,v:0,lap:0,E:stamina*1000,E0:stamina*1000,status:'ready',down:0,crashes:0,finish:null,gapAhead:0,pos:i+1,lastSeg:-1,note:'',
      core:37.0,peakCore:37.0,sweat:0,water:0,drank:0,work:0,climbed:0,heatStops:0});
  }
  return riders;
}
/* a plain-words rating so a viewer knows who to root for */
function favourite(riders){ return riders.slice().sort((a,b)=>(b.wkg*0.5+b.execution*1.2+b.perception*0.8+b.nerve*0.4+b.stamina/100)-(a.wkg*0.5+a.execution*1.2+a.perception*0.8+a.nerve*0.4+a.stamina/100))[0]; }

/* ---- the race ------------------------------------------------------------ */
/* the day: air temperature C, relative humidity 0..1, sun W/m2, a light wind m/s */
function makeDay(seed){
  const R=rng32(seed^0x27d4eb2f), r=(a,b)=>a+(b-a)*R();
  const tempC=r(12,37), rh=r(0.08,0.7), sun=r(250,1000), wind=r(0.5,4);
  return {tempC,rh,sun,wind,label:Math.round(tempC)+' °C · '+Math.round(rh*100)+' % humidity · sun '+Math.round(sun)+' W/m²'};
}
const psat=(T)=>0.6108*Math.exp(17.27*T/(T+237.3));        // kPa, over water
function physiology(rd,P,dt,day){
  const M=P/0.22+80, heatIn=M-P;                                 // metabolic heat, W
  const solar=day.sun*0.7*0.25;                                  // W on the rider
  const vair=Math.max(0.5,rd.v+day.wind), h=8.3*Math.pow(vair,0.6), A=1.8, Tsk=34;
  const conv=h*A*(Tsk-day.tempC);                                // W lost (negative: gained)
  const Pa=day.rh*psat(day.tempC), Emax=Math.max(0,16.5*h*A*(5.3-Pa));   // W the air will evaporate
  const srMax=1.2+0.8*rd.heat;                                   // L/h, higher with tolerance
  const sr=Math.min(srMax,0.25+0.9*Math.max(0,rd.core-37.0));    // L/h sweated
  const evap=Math.min(sr*675,Emax);                              // W removed by evaporation
  const store=heatIn+solar-conv-evap;                            // W into the core
  rd.core+=store*dt/(rd.kg*3490); rd.sweat=sr; rd.water+=sr*dt/3600; rd.drank+=0.4*dt/3600;
  if(rd.core>rd.peakCore) rd.peakCore=rd.core;
  /* the price of heat and thirst */
  const thr=38.3+0.9*rd.heat, over=Math.max(0,rd.core-thr);
  const dehyd=Math.max(0,(rd.water-rd.drank)/rd.kg-0.02);
  rd.powerMul=Math.max(0.3,(1-0.22*over)*(1-3*dehyd));
  rd.errMul=1+0.6*over+10*dehyd;
}
function makeRace(trail,riders,laps,seed,day){
  const R=rng32(seed^0x9e3779b9); day=day||makeDay(seed);
  /* the two-track start: staggered on the line, sprint clocks armed */
  riders.forEach((rd,i)=>{ rd.s=-(i*2.2); rd.v=0; rd.lap=0; rd.status='riding'; rd.sprintLeft=25; rd.powerMul=1; rd.errMul=1; rd.core=37; rd.peakCore=37; rd.water=0; rd.drank=0; rd.work=0; rd.climbed=0; rd.heatStops=0; });
  return {trail,riders,laps,t:0,R,day,events:[],finished:0,out:0,done:false};
}
function hash01(a,b){ let h=(a*374761393+b*668265263)|0; h=(h^(h>>>13))*1274126177|0; return ((h^(h>>>16))>>>0)/4294967296; }
function step(race,dt){
  const {trail,riders}=race, S=trail.S, n=trail.n, L=trail.L;
  race.t+=dt;
  /* order by distance so traffic can be resolved front to back */
  const order=riders.filter(r=>r.status==='riding'||r.status==='down').sort((a,b)=>(b.lap*L+b.s)-(a.lap*L+a.s));
  for(let k=0;k<order.length;k++){
    const rd=order[k]; if(rd.status!=='riding'){ if(rd.status==='down'){ rd.down-=dt; rd.mode=rd.cooling?'cooling off':'down'; rd.P=0; physiology(rd,0,dt,race.day); if(rd.down<=0){ rd.status='riding'; rd.v=1; rd.cooling=false; } } continue; }
    const idx=((Math.floor(rd.s/trail.ds)%n)+n)%n, seg=S[idx];
    const fat=1-rd.E/rd.E0;                                              // 0 fresh .. 1 empty
    /* the limit over the next 12 m, as the rider perceives it */
    let vlim=Infinity; for(let j=0;j<6;j++) vlim=Math.min(vlim,S[(idx+j)%n].vlim);
    const err=(hash01(idx>>2,rd.i)-0.5)*2*(1-rd.perception)*(0.25+0.6*fat)*(rd.errMul||1);
    const perceived=vlim*(1+0.4*err);
    const vt=perceived*(0.55+0.35*rd.execution)*(0.85+0.25*rd.nerve);
    /* power */
    const Psus=rd.wkg*rd.kg*(0.72+0.28*(rd.E/rd.E0))*(rd.powerMul||1);
    let P=Psus; if(rd.sprintLeft>0){ P=rd.sprint; rd.sprintLeft-=dt; } else if(seg.grade>0.03 && rd.v<vt) P=Psus*1.25;
    const th=Math.atan(seg.grade), cosT=Math.cos(th), sinT=Math.sin(th), m=rd.mass;
    const Fres=m*G*sinT+seg.crr*m*G*cosT+0.5*RHO*CDA*rd.v*rd.v;
    let a, mode;
    if(rd.v>vt){ a=-Math.min(seg.mu*G*0.75,(rd.v-vt)/dt)-Fres/m; P=0; mode='braking'; }
    else { const Fdrive=Math.min(P/Math.max(rd.v,1.5), seg.mu*m*G*cosT*0.8); a=(Fdrive-Fres)/m;
      mode=rd.sprintLeft>0?'sprinting':seg.grade>0.03?'climbing':seg.grade<-0.03?'descending':'pedalling'; }
    /* traffic: on narrow trail you sit behind the rider ahead */
    if(k>0){ const ah=order[k-1]; const gap=(ah.lap*L+ah.s)-(rd.lap*L+rd.s); rd.gapAhead=gap;
      if(ah.status==='riding' && gap<4 && gap>=0 && !seg.wide && rd.v>ah.v){ a=Math.min(a,(ah.v-rd.v)/dt); rd.note='held up'; mode='held up'; } else if(ah.status==='down' && gap<3 && gap>=0 && !seg.wide){ a=Math.min(a,(0.8-rd.v)/dt); mode='held up'; } else rd.note=''; }
    /* what the board and the physics strip show */
    rd.mode=mode; rd.P=P; rd.vlim=vlim; rd.perceived=perceived; rd.vt=vt; rd.seg=seg; rd.fat=fat;
    rd.v=Math.max(0.4,rd.v+a*dt); rd.s+=rd.v*dt;
    rd.work+=P*dt; if(seg.grade>0) rd.climbed+=seg.grade*rd.v*dt;
    physiology(rd,P,dt,race.day);
    if(rd.core>40){ rd.status='down'; rd.cooling=true; rd.down=30; rd.v=0; rd.core-=0.5; rd.heatStops++; race.events.push({t:race.t,kind:'heat',rider:rd,seg}); continue; }
    /* energy: digging above sustainable drains the store; easy riding refills */
    if(P>Psus) rd.E=Math.max(0,rd.E-(P-Psus)*dt); else rd.E=Math.min(rd.E0,rd.E+(Psus-P)*0.25*dt);
    /* entering a new stretch: the physics check */
    const idx2=((Math.floor(rd.s/trail.ds)%n)+n)%n;
    if(idx2!==rd.lastSeg && rd.s>=0){
      rd.lastSeg=idx2; const sg=S[idx2];
      const over=rd.v/sg.vlim-1;
      if(over>0.03){
        const p=Math.min(1,over*2.5)*(1-0.55*rd.execution)*Math.min(2,rd.errMul||1);
        if(race.R()<p){ crash(race,rd,sg,over>0.22&&sg.exposed?'severe':'mild',over); continue; }
      }
      const pm=0.0025*sg.rough*(1-rd.execution)*(0.3+fat)*Math.min(2,rd.errMul||1);   // rough ground throws the tired, the clumsy and the overheated
      if(race.R()<pm) { crash(race,rd,sg,'mild',0); continue; }
    }
    /* laps */
    if(rd.s>=L){ rd.s-=L; rd.lap++; race.events.push({t:race.t,kind:'lap',rider:rd,lap:rd.lap});
      if(rd.lap>=race.laps){ rd.status='finished'; rd.finish=race.t; race.finished++; race.events.push({t:race.t,kind:'finish',rider:rd,place:race.finished}); } }
  }
  /* positions */
  const ranked=riders.filter(r=>r.status!=='out').sort((a,b)=>{ if(a.finish&&b.finish) return a.finish-b.finish; if(a.finish) return -1; if(b.finish) return 1; return (b.lap*L+b.s)-(a.lap*L+a.s); });
  ranked.forEach((r,i)=>r.pos=i+1);
  if(riders.every(r=>r.status==='finished'||r.status==='out')) race.done=true;
  return race;
}
function crash(race,rd,seg,kind,over){
  rd.crashes++;
  if(kind==='severe'){ rd.status='out'; rd.v=0; race.out++; race.events.push({t:race.t,kind:'out',rider:rd,seg,over}); }
  else { rd.status='down'; rd.down=3+race.R()*6; rd.v=0; rd.E=Math.max(0,rd.E-4000); race.events.push({t:race.t,kind:'crash',rider:rd,seg,over}); }
}
/* where a rider is, in erosion-grid cells, for drawing */
function place(trail,rd){ const n=trail.n; const f=rd.s/trail.ds, i=((Math.floor(f)%n)+n)%n, j=(i+1)%n, t=f-Math.floor(f); const a=trail.S[i], b=trail.S[j];
  return {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, zE:a.zE+(b.zE-a.zE)*t, heading:a.heading, seg:a}; }

/* the tallies for the cards */
function tally(rd){ return {kcal:rd.work/0.22/4184, litres:rd.water, climbedFt:rd.climbed*3.281, peakCore:rd.peakCore}; }
global.RaceSim={buildTrail, makeRiders, favourite, makeRace, makeDay, step, place, tally, BED, INKS};
}
RaceSimFactory(typeof window!=='undefined'?window:globalThis);

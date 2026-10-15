/* ---------------------------------------------------------------------------
   race_sim.js · v3.1 · 2026-10-14
   the riders and the race, on a course cut by race_planner.js
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
   sandstone is slickrock, shale is loose), EXPOSURE (a cliff at least 5 m
   high drops away within two cells) and WIDTH: the planner marks which
   stretches are two-track, and only there can one rider pass another
   (Joe, 2026-10-13). The tread's elevation is the ground's averaged over
   20 m, because a benched trail is cut and filled: it rides smoother than
   the hillside it is cut into.

   THE ENGINE (Joe, 2026-10-14: "aerobic & anaerobic capacity, and recovery
   from anaerobic activity ... tradeoffs where those are reasonably based in
   biology"). The critical-power model of exercise physiology:
     aerobic power  CP, what the rider can hold for about an hour (W/kg)
     reserve        W', a fixed store of work above CP (10-30 kJ); spent on
                    surges, it refills only below CP, faster the further below
                    (Skiba's fit: time constant 546 e^(-0.01 (CP-P)) + 316 s,
                    times the rider's own recovery factor)
     sprint         peak power for a few seconds; what is available above CP
                    shrinks as the reserve empties (sqrt of the share left)
     oxygen uptake  the aerobic supply follows demand with a lag of 20-40 s; a
                    quarter of the gap at every surge is drawn from the reserve
     efficiency     19.5-23.5% of the metabolic energy reaches the pedals; the
                    rest is heat, which the body model must shed
   FIBRE TYPE ties these together, as muscle biopsies say it does: the share of
   fast-twitch muscle (25-75%) raises the reserve and the sprint and slows
   recovery, the oxygen response and efficiency; slow-twitch muscle gives
   aerobic power relative to the rider's ceiling. Training sets the level of
   aerobic power independently. Each trait is nudged by fibre type plus its own
   scatter, so the types are tendencies, not rules.
   RACE CRAFT is the judgement of when to spend the reserve (pace()): everyone
   goes for the hole shot; a crafty rider climbs at a pace the reserve can last,
   keeps some for a pass on the two-track or a bridge before the singletrack,
   and times the run-in so the reserve runs out at the line; an artless one
   rides every climb hard, blows up, and misjudges the finish.
   A RIDER each tick (dt 0.1 s):
     power      what pace() asks for, capped by what the engine can give
     forces     gravity on the grade, rolling drag by bed, air drag; traction
                caps drive on the climbs
     the limit  the true cornering/technical speed limit over the next 50 m,
                each corner discounted by the braking distance to it
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
     heat in    metabolic heat at the rider's gross efficiency (3.3-4.1 W of heat
                per W at the pedals) plus 80 W basal, plus the sun on 0.25 m2 of
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
   Tallied for the cards: work at the pedals -> kilocalories at the rider's own efficiency, litres
   sweated, vertical metres climbed, peak core temperature.
   Pure and seeded. Distances in metres along the loop, speeds m/s.
---------------------------------------------------------------------------

   CHANGED
     v3.1  singletrack passing: a rider stuck behind weighs the risk (passRisk: the
           hillside, plant cover, grip, loose rock, grade, bend, cliff, speed, and
           their own skill and state) and goes round if it is within their nerve
     v3.0  the engine: critical power, an anaerobic reserve with recovery, peak
           power, oxygen-uptake lag and efficiency, tied by fibre type; race craft
           paces the reserve (Joe, 2026-10-14). 'Lasts' and the fixed sprint go
     v2.1  descending skill and heat made to matter (Joe, 2026-10-14): a technical
           limit on every descent set by skill (walk it if it cannot be ridden),
           crashes past it; acclimatised riders sweat sooner, hold power to a
           higher core, and do not pay the hot-day cardiovascular strain; a bad
           crash's lasting cost now actually lasts; climbing power drawn from
           one category's spread, 3.4-4.4 W/kg (was 2.8-4.8)
     v2.0  two-track from the planner is the only place to pass; tread
           smoothed over 20 m (cut and fill); exposure means a real cliff
           (5 m at race scale, not 2); riders carry a random three-digit
           plate number; four names added to the pool (Joe, 2026-10-13);
           riders look 50 m ahead and brake for what they see; a climb the
           legs cannot ride at balance speed is walked
*/
function RaceSimFactory(global){
'use strict';
function rng32(seed){ let a=seed>>>0; return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const G=9.81, RHO=1.1, CDA=0.42;
/* GRADE INTERACTS WITH ROCK TYPE (Joe, 2026-09-10). `mu` is what the bed gives
   a tyre that is braking or cornering - the whole contact patch working against
   a surface that is not moving. Climbing asks something different: the rear
   tyre has to shear the surface itself, and loose material gives way under
   torque long before it gives way under a skid. So a bed needs its own DRIVE
   limit, `walk` - the steepest grade it can be ridden up before the fastest way
   forward is on foot, pushing.

   Slickrock is famous for going up absurdly steep because there is nothing on
   it to shear; shale is a staircase of loose plates and spits the wheel out on
   ground a rider could walk without using their hands. The ceiling on all of
   them is the bike, not the bed: past about a third, the front wheel comes up
   whatever the tyre is doing. */
const BED={ sandstone:{mu:0.90,crr:0.008,rough:0.15,walk:0.38}, limestone:{mu:0.85,crr:0.010,rough:0.25,walk:0.33},
            siltstone:{mu:0.70,crr:0.018,rough:0.45,walk:0.28}, mudstone:{mu:0.60,crr:0.024,rough:0.60,walk:0.24},
            shale:{mu:0.55,crr:0.030,rough:0.75,walk:0.20},     basement:{mu:0.80,crr:0.012,rough:0.35,walk:0.30} };
/* The first pass put shale's limit at 14%, and measured that against a hard
   course it sent 6.3% of the trail off the bike and cost the winner eight
   minutes of walking. 14% is 8 degrees: nobody gets off for that, loose or not.
   Hike-a-bike on loose rock really begins around a fifth, so every limit moved
   up by about six points and the ORDER - which is the part that matters - is
   unchanged. */
const NAMES=['Ruiz','Okafor','Lindqvist','Tanaka','Moreau','Adeyemi','Novak','Castellano','Byrne','Haddad','Kowalski','Ferreira','Iversen','Mbeki','Salazar','Petrova',
             'Cooley','von Fischer','Domanski','Farley'];      // the last four at Joe's ask, 2026-10-13
const INKS=['#e34948','#2a78d6','#f2d43d','#ffffff','#eb6834','#33c2c2','#a463f2','#5ad45a'];

/* ---- the trail ---------------------------------------------------------- */
function buildTrail(plan, w, cell, ds){
  ds=ds||2;
  const nx=w.nx, scale=cell/w.dx;
  /* each point carries whether it is two-track ([2]) through the smoothing */
  const tt=plan.twoTrack?plan.twoTrack.mask:null;
  let pts=plan.path.map((c,i)=>{ const x=c%nx; return [x+0.5,(c-x)/nx+0.5,tt?tt[i]:(i<20?1:0)]; });
  for(let k=0;k<2;k++){ const q=[pts[0]]; for(let i=0;i<pts.length-1;i++){ const a=pts[i], b=pts[i+1]; q.push([0.75*a[0]+0.25*b[0],0.75*a[1]+0.25*b[1],a[2]]); q.push([0.25*a[0]+0.75*b[0],0.25*a[1]+0.75*b[1],b[2]&&a[2]]); } q.push(pts[pts.length-1]); pts=q; }
  const zAt=(x,y)=>{ const xi=Math.max(0,Math.min(nx-2,x|0)), yi=Math.max(0,Math.min(w.ny-2,y|0)), fx=x-xi, fy=y-yi, c=yi*nx+xi;
    return ((w.z[c]*(1-fx)+w.z[c+1]*fx)*(1-fy)+(w.z[c+nx]*(1-fx)+w.z[c+nx+1]*fx)*fy); };
  /* cumulative length in race metres, then resample every ds */
  const cum=[0]; for(let i=1;i<pts.length;i++) cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1])*cell);
  const L=cum[cum.length-1], n=Math.floor(L/ds), S=[]; let j=0;
  for(let i=0;i<n;i++){ const d=i*ds; while(j<cum.length-2 && cum[j+1]<d) j++; const f=(d-cum[j])/Math.max(1e-6,cum[j+1]-cum[j]);
    const x=pts[j][0]+(pts[j+1][0]-pts[j][0])*f, y=pts[j][1]+(pts[j+1][1]-pts[j][1])*f; S.push({x,y,zE:zAt(x,y),two:!!(f<0.5?pts[j][2]:pts[j+1][2])}); }
  /* the tread: the ground averaged over 20 m (benched, cut and filled) */
  for(let i=0;i<n;i++){ let a=0; for(let k=-5;k<=5;k++) a+=S[(i+k+n)%n].zE; S[i].zT=a/11; }
  const slope=plan.slope;
  for(let i=0;i<n;i++){
    const s=S[i], p=S[(i-3+n)%n], q=S[(i+3)%n];
    s.z=s.zT*scale;
    s.grade=((q.zT-p.zT)*scale)/(6*ds);
    const h1=Math.atan2(s.y-p.y,s.x-p.x), h2=Math.atan2(q.y-s.y,q.x-s.x); let dh=h2-h1; while(dh>Math.PI) dh-=2*Math.PI; while(dh<-Math.PI) dh+=2*Math.PI;
    s.curv=Math.abs(dh)/(6*ds); s.heading=h2;
    const cx=s.x|0, cy=s.y|0, c=cy*nx+cx, k=Strata.layerAt(w,c,s.zE);
    s.bed=k<0?'basement':w.layers[k].type; const b=BED[s.bed]; s.mu=b.mu; s.crr=b.crr; s.rough=b.rough; s.walk=b.walk; s.color=k<0?[92,86,88]:w.layers[k].color;
    /* exposed: a cliff (steeper than any trail may cut) within two cells, and
       at least 5 m lower than the tread - a fall worth the name */
    let exposed=false; for(let dy=-2;dy<=2&&!exposed;dy++) for(let dx=-2;dx<=2;dx++){ const xx=cx+dx, yy=cy+dy; if(xx<0||yy<0||xx>=nx||yy>=w.ny) continue; const cc=yy*nx+xx; if(slope[cc]>0.95 && slope[cc]<5 && (s.zE-w.z[cc])*scale>5){ exposed=true; break; } }
    s.exposed=exposed;
    s.wide=s.two;                                        // side by side on the two-track; on singletrack a pass is a risk (passRisk)
    s.side=slope[c]>5?0.3:slope[c];                      // the hillside the tread is benched into: where a passer must ride
  }
  /* how far each sample is from the top of the climb it is on, and from the end
     of the two-track it is on (for pace(): a climb plan, a bridge before the
     singletrack); two passes round the loop so the wrap is right */
  for(let pass=0;pass<2;pass++) for(let i=n-1;i>=0;i--){ const s=S[i], nx2=S[(i+1)%n];
    s.toTop=s.grade>0.02?ds+(nx2.toTop||0):0; s.wideLeft=s.two?ds+(nx2.wideLeft||0):0; }
  /* the plant cover beside the trail (race_flora.js), where a passer leaves the tread */
  const cov=(global.RaceFlora&&RaceFlora.coverAlong)?RaceFlora.coverAlong(w,slope,S,cell):null;
  for(let i=0;i<n;i++) S[i].cover=cov?cov[i]:0.3;
  /* the true speed limit of each stretch: cornering on the grip, less on rough ground */
  for(let i=0;i<n;i++){ const s=S[i]; const vc=Math.sqrt(s.mu*G/Math.max(s.curv,0.004)); s.vlim=Math.min(21,vc*(1-0.45*s.rough)*(s.grade<-0.08?0.85:1)); }
  return {S,n,ds,L,cell};
}

/* ---- the riders ---------------------------------------------------------- */
function makeRiders(seed,count){
  const R=rng32(seed), r=(a,b)=>a+(b-a)*R(); const used=new Set(), riders=[];
  for(let i=0;i<count;i++){
    let name; do{ name=NAMES[Math.floor(R()*NAMES.length)]; }while(used.has(name)); used.add(name);
    const kg=r(56,92), bike=12, mass=kg+bike, perception=r(0.25,1), execution=r(0.25,1), nerve=r(0.3,1), heat=r(0.2,1);
    /* the engine (see the header). fn: 0 = 25% fast-twitch, 1 = 75%. Aerobic power
       stays near one category's spread (about 3.2-4.6 W/kg): a wider spread decides
       races on its own (2.8-4.8 explained 63% of finishing times), a narrower one
       (3.3-4.5 with the first engine) let it fall behind the reserve and descending. */
    const fast=r(0.25,0.75), fn=(fast-0.25)/0.5, train=R(), sc=(w)=>1+w*(2*R()-1);
    /* critical power, W/kg (about 3.1-4.8). x (kg/72)^-0.25: aerobic power grows with
       body mass to about the three-quarter power (allometry of VO2max), so a big
       rider has more watts but fewer per kilogram - more for the flats, the sprint
       and the two-track, less for the climbs; and less skin per kg to shed heat */
    const wkg=(3.3+1.1*train-0.3*(fn-0.5)+0.06*(2*R()-1))*Math.pow(kg/72,-0.25);
    const Wp=kg*(170+190*fn)*sc(0.12);                           // the reserve W', J (12-25 kJ at 70 kg)
    const pmax=kg*(11+8*fn)*sc(0.08);                            // peak power, W (770-1330 W at 70 kg)
    const recMul=(0.75+0.7*fn)*sc(0.15);                         // x Skiba's recovery time constant
    const tauVO2=(20+20*fn)*sc(0.12);                            // oxygen-uptake lag, s
    const eff=0.235-0.035*fn+0.004*(2*R()-1);                    // gross efficiency
    const craft=R();                                             // judgement of when to spend the reserve
    const misjudge=2*R()-1;                                      // which way an artless rider misreads the run-in
    let num; do{ num=100+Math.floor(R()*900); }while(riders.some(o=>o.num===num));   // a random three-digit plate
    riders.push({i,num,name,color:INKS[i%INKS.length],kg,bike,mass,wkg,fast,fn,train,Wp,pmax,sprint:pmax,recMul,tauVO2,eff,craft,misjudge,perception,execution,nerve,heat,
      s:0,v:0,lap:0,E:Wp,E0:Wp,Pa:0,intent:'',status:'ready',down:0,crashes:0,finish:null,gapAhead:0,pos:i+1,lastSeg:-1,note:'',
      core:37.0,peakCore:37.0,sweat:0,water:0,drank:0,work:0,climbed:0,heatStops:0});
  }
  return riders;
}
/* a plain-words rating so a viewer knows who to root for */
function favourite(riders){ const sc=r=>r.wkg*1.6+r.E0/20000+r.execution*0.5+r.craft*0.3; return riders.slice().sort((a,b)=>sc(b)-sc(a))[0]; }

/* ---- the race ------------------------------------------------------------ */
/* the day: air temperature C, relative humidity 0..1, sun W/m2, a light wind m/s */
function makeDay(seed){
  const R=rng32(seed^0x27d4eb2f), r=(a,b)=>a+(b-a)*R();
  const tempC=r(12,37), rh=r(0.08,0.7), sun=r(250,1000), wind=r(0.5,4);
  return {tempC,rh,sun,wind,label:Math.round(tempC)+' °C · '+Math.round(rh*100)+' % humidity · sun '+Math.round(sun)+' W/m²'};
}
const psat=(T)=>0.6108*Math.exp(17.27*T/(T+237.3));        // kPa, over water
function physiology(rd,P,dt,day){
  const M=P/(rd.eff||0.22)+80, heatIn=M-P;                       // metabolic heat, W
  const solar=day.sun*0.7*0.25;                                  // W on the rider
  const vair=Math.max(0.5,rd.v+day.wind), h=8.3*Math.pow(vair,0.6), A=1.8, Tsk=34;
  const conv=h*A*(Tsk-day.tempC);                                // W lost (negative: gained)
  const Pa=day.rh*psat(day.tempC), Emax=Math.max(0,16.5*h*A*(5.3-Pa));   // W the air will evaporate
  /* HEAT TOLERANCE (made to matter, Joe 2026-10-14). Acclimatised riders start
     sweating sooner and sweat more for each degree of core (gain 0.5-1.3 L/h per
     degree C, up to 1.2-2.0 L/h), so their cores sit lower on the same day. */
  const srMax=1.2+0.8*rd.heat;                                   // L/h, higher with tolerance
  const sr=Math.min(srMax,0.25+(0.5+0.8*rd.heat)*Math.max(0,rd.core-37.0));   // L/h sweated
  const evap=Math.min(sr*675,Emax);                              // W removed by evaporation
  const store=heatIn+solar-conv-evap;                            // W into the core
  rd.core+=store*dt/(rd.kg*3490); rd.sweat=sr; rd.water+=sr*dt/3600; rd.drank+=0.4*dt/3600;
  if(rd.core>rd.peakCore) rd.peakCore=rd.core;
  /* the price of heat and thirst. Power falls 22% per degree of core above a
     threshold that tolerance raises from 38.0 to 39.2 C; and on a hot day the
     skin's share of the heart's output is taken from the legs - cardiovascular
     strain, 1.2% of power per degree of air above 20 C for the least tolerant,
     nothing for the fully acclimatised (time trials in 35-40 C run 10-20% slower
     for unacclimatised riders, and acclimatisation wins most of that back).
     A bad crash's lasting cost (hurtP, hurtE) rides on top: it used to be
     written into powerMul and errMul and wiped out by the next tick of this. */
  const thr=38.0+1.2*rd.heat, over=Math.max(0,rd.core-thr);
  const dehyd=Math.max(0,(rd.water-rd.drank)/rd.kg-0.02);
  const strain=1-0.012*(1-rd.heat)*Math.max(0,day.tempC-20);
  rd.powerMul=Math.max(0.3,(1-0.22*over)*(1-3*dehyd)*strain*(rd.hurtP||1));
  rd.errMul=(1+0.6*over+10*dehyd)*(rd.hurtE||1);
}
function makeRace(trail,riders,laps,seed,day){
  const R=rng32(seed^0x9e3779b9); day=day||makeDay(seed);
  /* the two-track start: staggered on the line, sprint clocks armed */
  riders.forEach((rd,i)=>{ rd.s=-(i*2.2); rd.v=0; rd.lap=0; rd.status='riding'; rd.E=rd.E0; rd.Pa=0.5*rd.wkg*rd.kg; rd.intent=''; rd.powerMul=1; rd.errMul=1; rd.core=37; rd.peakCore=37; rd.water=0; rd.drank=0; rd.work=0; rd.climbed=0; rd.heatStops=0; });
  return {trail,riders,laps,t:0,R,day,events:[],finished:0,out:0,done:false};
}
/* THE RISK OF A SINGLETRACK PASS: the chance of a fall over the whole pass, for
   this rider, here, at speed v. Off the tread, over the next 16 m:
     the hillside   x1 on the flat, up to x7 where the side slope reaches 0.7 - the
                    passer is on the cut bank or the fill edge
     plants         x1 bare, x4 through closed cover (race_flora.js)
     grip           (0.9/mu)^2: x1 on slickrock, x2.7 on shale
     loose rock     x1 to x3 by roughness
     a descent      +8 per unit of grade past 3%; a climb (slow) down to x0.7
     a bend         x(1 + 30 rad/m of curvature)
     a cliff        x3 within reach of the lip
     speed          (v / 8 m/s)^2, floor 0.15
   and the rider: skill x(0.4 expert .. 1.3 novice), reading the ground x(0.8 .. 1.2),
   heat, thirst and injury (errMul), and a drained reserve x(1 .. 2.5).
   0.4% for a skilled, fresh rider on open, gentle slickrock; 5% or so for an
   average rider on a shale hillside in light scrub; past 30% on a steep, loose,
   descending bench, which only the reckless try. */
function passRisk(rd,trail,idx,v,fat){
  const S=trail.S, n=trail.n; let side=0, cover=0, mu=1, rough=0, down=0, curv=0, exposed=0, g=0;
  for(let j=0;j<8;j++){ const s=S[(idx+j)%n]; side=Math.max(side,s.side||0); cover=Math.max(cover,s.cover||0); mu=Math.min(mu,s.mu); rough=Math.max(rough,s.rough); down=Math.max(down,-s.grade); curv=Math.max(curv,s.curv); if(s.exposed) exposed=1; g+=s.grade/8; }
  const sm=(a,b,x)=>{ const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
  const ground=(1+6*sm(0.15,0.7,side))*(1+3*cover)*Math.pow(0.9/mu,2)*(1+2*rough)*(1+8*Math.max(0,down-0.03))*(1-0.3*sm(0.03,0.15,g))*(1+30*curv)*(exposed?3:1)*Math.max(0.15,(v/8)*(v/8));
  const rider=(1.6-1.2*rd.execution)*(1.3-0.5*rd.perception)*(rd.errMul||1)*(1+1.5*(fat||0));
  return Math.min(0.9,0.004*ground*rider);
}
/* ---- the engine ------------------------------------------------------------ */
/* critical power now (heat and injury take their share), W */
function cpW(rd){ return rd.wkg*rd.kg*(rd.powerMul||1); }
/* the most the rider can put out this instant: the aerobic supply already
   running, plus a share of the way to peak power that shrinks as the reserve
   empties - an empty rider can only ride at what their lungs deliver */
function pCap(rd){ const base=Math.max(0.5*cpW(rd),rd.Pa); return base+Math.max(0,rd.pmax*(rd.powerMul||1)-base)*Math.sqrt(Math.max(0,rd.E)/rd.E0); }
/* one tick of the engine at power P. The aerobic supply follows demand (up to CP)
   with the rider's oxygen-uptake lag. Work above CP comes out of the reserve (as in
   Skiba's W'bal); of the lag's shortfall below CP, a quarter is charged to it too -
   the rest is met by the muscle's phosphocreatine and stored oxygen, which refill
   in seconds. (Charging the whole lag cost ~5 kJ at every step from a descent onto
   the flat, and measured, it left most of the field on an empty reserve by
   10 minutes.) Below CP, with no shortfall, the reserve refills on Skiba's time
   constant times the rider's own recovery factor. */
function engine(rd,P,dt){
  const cp=cpW(rd);
  rd.Pa+=(Math.min(P,cp)-rd.Pa)*Math.min(1,dt/rd.tauVO2);
  const draw=Math.max(0,P-cp)+0.25*Math.max(0,Math.min(P,cp)-rd.Pa);
  if(draw>0) rd.E=Math.max(0,rd.E-draw*dt);
  else { const tau=(546*Math.exp(-0.01*Math.max(0,cp-P))+316)*rd.recMul; rd.E=Math.min(rd.E0,rd.E+(rd.E0-rd.E)*dt/tau); }
}
/* RACE CRAFT: what the rider asks for this tick, in watts. Sets rd.intent
   ('sprinting', 'attacking', 'bridging', 'defending' when spending the reserve on
   purpose; '' otherwise). c = craft, 0 artless .. 1 crafty. */
function pace(race,rd,k,order,seg,idx,cp,cap){
  const L=race.trail.L, c=rd.craft, D=rd.lap*L+rd.s, left=L*race.laps-D, frac=rd.E/rd.E0;
  rd.intent='';
  /* the hole shot: everyone goes hard for the first singletrack; the crafty ease
     off after about 8 s, the artless hold it for 20 */
  if(race.t<8+12*(1-c)){ rd.intent='sprinting'; return cp+0.6*Math.max(0,cap-cp); }
  /* the run-in: spend the reserve so it runs out at the line. The go point is the
     distance the reserve lasts at the finishing effort; an artless rider misreads
     it by up to 70% either way */
  const pFin=cp+0.6*Math.max(0,cap-cp), vEst=Math.max(4,rd.v), go=(rd.E/Math.max(40,pFin-cp))*vEst*(1+0.7*(1-c)*rd.misjudge);
  if(left<Math.max(150,go) && frac>0.02){ rd.intent='sprinting'; return pFin; }
  /* on the two-track, the chances to change places */
  const ah=k>0?order[k-1]:null, bh=k<order.length-1?order[k+1]:null, gapA=ah?(ah.lap*L+ah.s)-D:1e9, gapB=bh?D-(bh.lap*L+bh.s):1e9;
  if(seg.two){
    /* attack the rider just ahead while both are on the two-track (a crafty
       rider only with the reserve to finish the move) */
    if(ah && ah.status==='riding' && gapA>0 && gapA<14 && seg.wideLeft>40 && frac>0.15+0.25*c){ rd.intent='attacking'; return cp+0.5*Math.max(0,cap-cp); }
    /* bridge before the singletrack: the last 150 m of two-track with a rider
       within 30 m ahead - the place to get by, or wait behind them for a long time */
    if(c>0.45 && ah && ah.status==='riding' && gapA>0 && gapA<30 && seg.wideLeft<150 && frac>0.25){ rd.intent='bridging'; return cp+0.6*Math.max(0,cap-cp); }
    /* answer an attack from just behind: the artless always, the crafty only with
       the reserve to spare */
    if(bh && bh.status==='riding' && gapB>0 && gapB<4 && (bh.intent==='attacking'||bh.intent==='bridging') && frac>(c<0.4?0.08:0.4)){ rd.intent='defending'; return cp+0.5*Math.max(0,cap-cp); }
  }
  /* climbing: a crafty rider spends down to a reserve kept for tactics, spread over
     the rest of the climb; an artless one rides it 30% hard until empty */
  if(seg.grade>0.03){
    const keep=rd.E0*(0.15+0.35*c), tLeft=Math.max(20,(seg.toTop||0)/Math.max(2,rd.v));
    const smart=cp*0.97+Math.max(0,rd.E-keep)/tLeft, artless=frac>0.08?cp*1.3:cp*0.97;
    return smart*c+artless*(1-c);
  }
  if(seg.grade<-0.03) return 0.3*cp;                               // coasting, a few turns of the pedals
  return 0.85*cp;                                                  // the flats, at a sustainable pace
}
/* THE TECHNICAL LIMIT of a descending stretch for one rider: the speed they can
   still stop from within the trail they can see (12 m on singletrack, 30 m on
   two-track; 15 m on singletrack). Braking has the bed's grip less the pull of
   the slope; a skilled rider uses 90% of the grip, a novice 55%, and on rough
   ground the novice loses up to a further quarter (the wheel skips, the line
   wanders); fatigue costs up to a fifth. 0 = cannot be ridden by this rider:
   walk it. (At 45% and 12 m, measured over 128 races, descending skill outweighed
   aerobic power as a predictor of the result, which cross-country racing does not
   bear out.) */
function techLimit(rd,s,fat){
  const th=Math.atan(-s.grade), c=Math.cos(th), sn=Math.sin(th);
  const use=(0.55+0.35*rd.execution)*(1-0.25*s.rough*(1-rd.execution))*(1-0.2*(fat||0))/Math.sqrt(rd.errMul||1);
  const a=G*(s.mu*c*use-sn), d=s.wide?30:15;
  return a<=0.35?0:Math.sqrt(2*a*d);
}
function segAt(trail,rd){ return trail.S[((Math.floor(rd.s/trail.ds)%trail.n)+trail.n)%trail.n]; }
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
    /* ...and far enough ahead to stop for it: a corner 40 m away limits the speed
       now to what can still be braked off before it (v^2 = vl^2 + 2 b d, the
       brakes worth 60% of the grip, less on a descent). Looking only 12 m ahead,
       a rider at 20 m/s met every hairpin too fast to stop for, and on the
       steeper 2026-10-13 courses that was nine crashes in ten. */
    let vlim=Infinity; for(let j=0;j<25;j++){ const sj=S[(idx+j)%n], b=Math.max(1.5,sj.mu*G*0.6+G*sj.grade), vj=Math.sqrt(sj.vlim*sj.vlim+2*b*j*trail.ds); if(vj<vlim) vlim=vj; }
    const err=(hash01(idx>>2,rd.i)-0.5)*2*(1-rd.perception)*(0.25+0.6*fat)*(rd.errMul||1);
    const perceived=vlim*(1+0.4*err);
    let vt=perceived*(0.55+0.35*rd.execution)*(0.85+0.25*rd.nerve);
    /* ON A DESCENT, SKILL SETS THE SPEED (Joe, 2026-10-14). The technical limit
       over the next 10 m (techLimit): what the rider can still stop from, which
       on steep loose rock is little; nerve decides how near it they ride (88-112%).
       Where even a crawl cannot be held, they walk the bike down. */
    let vtech=Infinity; for(let j=0;j<5;j++){ const sj=S[(idx+j)%n]; if(sj.grade<-0.03) vtech=Math.min(vtech,techLimit(rd,sj,fat)); }
    if(vtech<Infinity) vt=Math.min(vt,vtech*(0.88+0.24*rd.nerve));
    /* power: what pace() asks for, capped by what the engine can give now */
    const cp=cpW(rd), cap=pCap(rd);
    let P=Math.min(cap,pace(race,rd,k,order,seg,idx,cp,cap));
    const th=Math.atan(seg.grade), cosT=Math.cos(th), sinT=Math.sin(th), m=rd.mass;
    const Fres=m*G*sinT+seg.crr*m*G*cosT+0.5*RHO*CDA*rd.v*rd.v;
    let a, mode;
    /* HIKE-A-BIKE. Past the bed's drive limit the rear wheel cannot hold, and
       every rider in the field gets off and pushes - there is no skill in it,
       only fitness, so the spread here is small and the strong gain a little.
       Pushing a bike up a pitch is roughly as costly as carrying yourself up it
       and then some: the useful work is the same mgh, done a good deal more
       awkwardly, so it is charged at a 15% premium and the awkwardness is why
       nobody chooses it. No crash test while walking - a rider on foot with a
       bike beside them is the one place on the course that is safe. */
    /* ...and past what the LEGS can ride. Below about 1.1 m/s a bike will not
       stay upright on a climb, so a rider whose climbing watts cannot hold that
       speed against gravity and rolling gets off and walks too, at walking pace
       - which up a 20% pitch is faster than the 1.4 km/h floor the sim used to
       let them crawl at (measured on the 2026-10-13 hard courses). */
    const walkDown = vtech===0;
    /* a pitch the legs cannot hold 1.5 m/s up on aerobic power alone is ridden on
       the reserve if there is enough of it to reach the top; a crafty rider
       judges that before starting and walks if not, an artless one rides until
       the reserve is gone */
    const VBAL=1.1;                                                    // m/s: slower than this a climbing bike falls over
    const Pneed=m*G*(sinT+seg.crr*cosT)*VBAL;
    let legsOut=false;
    if(seg.grade>0.08 && rd.intent!=='start' && Pneed>cp){
      if(cap<Pneed) legsOut=true;
      else { let steep=0; for(let j=0;j<120;j++){ const sj=S[(idx+j)%n]; if(m*G*(Math.sin(Math.atan(sj.grade))+sj.crr)*VBAL<=cp) break; steep+=trail.ds; }
        legsOut = rd.craft>0.5 ? rd.E-0.1*rd.E0<(Pneed-cp)*(steep/VBAL) : rd.E<0.05*rd.E0;
        if(!legsOut) P=Math.max(P,Math.min(cap,Pneed*1.05)); } }
    if((seg.walk != null && seg.grade > seg.walk) || legsOut || walkDown){
      /* walking pace is set by the legs too: pushing a bike up a pitch costs the lift
         and 15% more, and a rider walks at what 90% of their aerobic power will lift
         (a flat 0.95-1.45 m/s by W/kg made a third of a hard race power-blind:
         measured 2026-10-14, 22% less power cost an intolerant field 2% of its time) */
      let vw=Math.max(0.45, Math.min(1.65, 0.9*cp/(m*G*(Math.max(0.02,sinT)+0.04)*1.15)));
      /* single file on foot too: nobody shoulders past on a singletrack pitch */
      if(k>0){ const ah=order[k-1], gap=(ah.lap*L+ah.s)-(rd.lap*L+rd.s); if(gap>=0 && gap<3 && !(seg.wide && segAt(trail,ah).wide)) vw=Math.min(vw,Math.max(0.3,ah.v)); }
      if(walkDown) vw=Math.min(vw,1.1);
      a=(vw-rd.v)/Math.max(dt,1e-3);
      P=walkDown?0:m*G*sinT*vw*1.15;
      mode=walkDown?'walking down':'pushing'; rd.pushed=(rd.pushed||0)+vw*dt;
      rd.mode=mode; rd.P=P; rd.vlim=vlim; rd.perceived=perceived; rd.vt=vt; rd.seg=seg; rd.fat=fat;
      rd.v=Math.max(0.3,rd.v+a*dt); rd.s+=rd.v*dt;
      rd.work+=P*dt; if(seg.grade>0) rd.climbed+=seg.grade*rd.v*dt;
      physiology(rd,P,dt,race.day); engine(rd,P,dt);
      rd.lastSeg=((Math.floor(rd.s/trail.ds)%n)+n)%n;
      if(rd.s>=L){ rd.s-=L; rd.lap++; race.events.push({t:race.t,kind:'lap',rider:rd,lap:rd.lap});
        if(rd.lap>=race.laps){ rd.status='finished'; rd.finish=race.t; race.finished++; race.events.push({t:race.t,kind:'finish',rider:rd,place:race.finished}); } }
      continue;
    }
    /* SINGLETRACK PASSING (Joe, 2026-10-14: "let singletrack passing happen when
       someone's stuck behind, but the risk of crashing during the pass should be
       elevated based on the surface conditions ... and the rider skill and
       physiological state"). A rider held up behind a slower one grows impatient -
       after 5 s if daring, 25 s if not - and then weighs the risk of going round
       right here (passRisk): if it is no more than they will accept (2-12% by nerve,
       less for a crafty rider, who waits for a better spot) they leave the tread
       and surge past. The fall can come at any metre of the pass; a pass that has
       not got by in 12 s is given up. */
    const ahP=k>0?order[k-1]:null;
    if(rd.passing && (!ahP || rd.passing.who!==ahP || ahP.status!=='riding' || race.t-rd.passing.t0>12)){
      /* the pass is over: if the rider is now ahead of the one they went for (the
         order re-sorts as soon as they draw level), it worked */
      const who=rd.passing.who, D=rd.lap*L+rd.s, Dw=who.lap*L+who.s;
      if(D>Dw && who.status==='riding'){ rd.stpassAt=race.t; race.events.push({t:race.t,kind:'stpass',rider:rd,passed:who,risk:rd.passing.risk,seg}); }
      rd.passing=null; }
    if(ahP && !rd.passing){
      const gapP=(ahP.lap*L+ahP.s)-(rd.lap*L+rd.s), narrow=!(seg.wide && segAt(trail,ahP).wide);
      if(narrow && ahP.status==='riding' && gapP>=0 && gapP<5 && vt>ahP.v+0.6) rd.stuck=(rd.stuck||0)+dt; else rd.stuck=Math.max(0,(rd.stuck||0)-2*dt);
      if(narrow && rd.stuck>5+20*(1-rd.nerve) && rd.E>0.1*rd.E0 && gapP>=0 && gapP<5){
        const risk=passRisk(rd,trail,idx,Math.min(vt,ahP.v+1.5),fat);
        rd.passRiskNow=risk;
        if(risk<=(0.02+0.10*rd.nerve)*(1-0.4*rd.craft)){ rd.passing={who:ahP,t0:race.t,risk,need:gapP+3}; rd.stuck=0; } }
    }
    const pass=rd.passing;
    if(pass){ vt=Math.min(vt,pass.who.v+1.5); if(rd.v<vt) P=Math.max(P,Math.min(cap,cp+0.6*Math.max(0,cap-cp))); rd.intent='passing'; }
    if(rd.v>vt){ a=-Math.min(seg.mu*G*0.75,(rd.v-vt)/dt)-Fres/m; P=0; mode='braking'; }
    else { const Fdrive=Math.min(P/Math.max(rd.v,VBAL), seg.mu*m*G*cosT*0.8); a=(Fdrive-Fres)/m;
      mode=rd.intent?rd.intent:seg.grade>0.03?'climbing':seg.grade<-0.03?'descending':'pedalling'; }
    /* traffic: on narrow trail you sit behind the rider ahead */
    /* a pass needs BOTH riders on the two-track: the one behind cannot come
       past while the one ahead is already into the singletrack */
    if(k>0){ const ah=order[k-1]; const gap=(ah.lap*L+ah.s)-(rd.lap*L+rd.s); rd.gapAhead=gap; const wide=seg.wide && segAt(trail,ah).wide;
      if(ah.status==='riding' && gap<4 && gap>=0 && !wide && rd.v>ah.v && !(pass && pass.who===ah)){ a=Math.min(a,(ah.v-rd.v)/dt); rd.note='held up'; mode='held up'; P=Math.min(P,Math.max(0,Fres*rd.v)); } else if(ah.status==='down' && gap<3 && gap>=0 && !wide){ a=Math.min(a,(0.8-rd.v)/dt); mode='held up'; } else rd.note=''; }
    /* what the board and the physics strip show */
    rd.mode=mode; rd.P=P; rd.vlim=vlim; rd.perceived=perceived; rd.vt=vt; rd.seg=seg; rd.fat=fat;
    rd.v=Math.max(0.4,rd.v+a*dt); rd.s+=rd.v*dt;
    /* and never through the rider ahead on singletrack, whatever the step did */
    if(k>0){ const ah=order[k-1]; if(ah.status!=='down' && !(seg.wide && segAt(trail,ah).wide) && !(pass && pass.who===ah)){ const lim=(ah.lap*L+ah.s)-1.5-rd.lap*L; if(rd.s>lim && (ah.lap*L+ah.s)>=(rd.lap*L+rd.s-rd.v*dt)){ rd.s=Math.max(lim,rd.s-rd.v*dt); rd.v=Math.min(rd.v,Math.max(0.4,ah.v)); mode='held up'; rd.mode=mode; } } }
    /* the pass itself: the risk is spent metre by metre of ground gained on the
       rider being passed, on the ground actually under the wheels; a fall on a steep
       hillside rolls on down it; a clumsy rider alongside can be taken down too */
    if(pass){ const who=pass.who, g=(who.lap*L+who.s)-(rd.lap*L+rd.s), prog=Math.max(0,(pass.lastGap!=null?pass.lastGap:pass.need-1.5)-g); pass.lastGap=g;
      const riskNow=passRisk(rd,trail,idx,rd.v,fat), frac=prog/pass.need;
      if(frac>0 && race.R()<1-Math.pow(1-riskNow,frac)){
        rd.passing=null; const sgp=S[idx], fall=sgp.side>0.3?Math.min(6,5*(sgp.side-0.2)):0;
        crash(race,rd,sgp,0.1,rd.v,fall); const ev=race.events[race.events.length-1]; ev.passing=who; ev.risk=pass.risk;
        if(who.status==='riding' && race.R()<0.05+0.2*(1-who.execution)){ crash(race,who,segAt(trail,who),0.1,who.v,0); race.events[race.events.length-1].tangled=rd; }
        continue; }
      if(g<-1.5){ rd.passing=null; rd.stpassAt=race.t; who.v*=0.92; race.events.push({t:race.t,kind:'stpass',rider:rd,passed:who,risk:pass.risk,seg:S[idx]}); } }
    rd.work+=P*dt; if(seg.grade>0) rd.climbed+=seg.grade*rd.v*dt;
    physiology(rd,P,dt,race.day); engine(rd,P,dt);
    if(rd.core>40){ rd.status='down'; rd.cooling=true; rd.down=30; rd.v=0; rd.core-=0.5; rd.heatStops++; race.events.push({t:race.t,kind:'heat',rider:rd,seg}); continue; }
    /* entering a new stretch: the physics check */
    const idx2=((Math.floor(rd.s/trail.ds)%n)+n)%n;
    if(idx2!==rd.lastSeg && rd.s>=0){
      rd.lastSeg=idx2; const sg=S[idx2];
      const over=rd.v/sg.vlim-1;
      if(over>0.03){
        const p=Math.min(1,over*2.5)*(1-0.55*rd.execution)*Math.min(2,rd.errMul||1);
        if(race.R()<p){ crash(race,rd,sg,over,rd.v); continue; }
      }
      /* Rough ground throws the tired, the clumsy and the overheated. MEASURED
         AND RETUNED 2026-09-10: at 0.0025 this fired on a per-2-metre-segment
         basis about 5,000 times a race per rider and produced 16-20 crashes in
         a field of eight - two apiece, which is not a bike race, it is a
         pile-up. With severity now costing up to two minutes and a lasting
         injury, that had to come down; 0.0005 lands at roughly one crash per
         three riders on easy ground and rather more on hard. */
      const pm=0.0005*sg.rough*(1-rd.execution)*(0.3+fat)*Math.min(2,rd.errMul||1);
      if(race.R()<pm) { crash(race,rd,sg,0,rd.v); continue; }
      /* past the technical limit on a descent - the daring and the clumsy - is
         a fall waiting to happen */
      if(sg.grade<-0.03){ const vtl=techLimit(rd,sg,fat), ot=vtl>0?rd.v/vtl-1.06:0;
        if(ot>0 && race.R()<Math.min(1,ot*0.08)*(1-0.55*rd.execution)*Math.min(2,rd.errMul||1)) { crash(race,rd,sg,ot,rd.v); continue; } }   /* 12% over: about one fall per 700 m of such ground (at 1.2 it was every 30 m: 31 crashes a race) */
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
/* HOW BAD A CRASH IS, FROM ITS ENERGY (Joe, 2026-09-10: "crash severity should
   be related to kinetic energy of the crash ... a threshold where a rider would
   be too injured to ride, or it would take a while to recover").

   The rider has half v-squared per kilogram to get rid of, and what decides the
   injury is not how much but how FAST it leaves. A slide across slickrock sheds
   it over twenty metres and costs skin; the same speed into blocky ground stops
   the rider in a metre. Roughness is already the measure of that, so the share
   delivered abruptly is taken straight from it. Where the trail runs on a lip
   the fall adds gh, and a lip in this world is at least ten metres, which on
   its own is worth an impact at fourteen metres a second - so going over the
   edge ends a race almost every time, as it should.

   The bands are specific energy in joules per kilogram:
      under 10   a slide. Up in a couple of seconds, skin and pride.
      10 to 40   off the bike properly. Ten seconds to find it and remount.
      40 to 110  a hard hit. Half a minute to two, and the rider is not the
                 same afterwards: they ride shy - more mistakes, less power -
                 for the rest of the race.
      over 110   too injured to continue.
   A crash also always scrubs the speed it happened at; nobody carries pace
   through one. */
function crash(race,rd,seg,over,vAt,fall){
  rd.crashes++;
  const v=Math.max(0,vAt||rd.v||0);
  const absorb=0.30+0.55*(seg.rough||0.4);              // the share that arrives at once
  /* `exposed` only means a lip WITHIN THIRTY METRES, and most crashes beside a
     cliff are crashes beside a cliff - the rider slides, swears, and gets up.
     Measured: treating every one of them as a fall over the edge put 16% of
     the field out of a hard race, which is several times what really happens.
     About a third go over, and those are the ones that end a race. */
  const drop=(seg.exposed && race.R()<0.35) ? 10+20*race.R() : 0;   // the lip, in metres
  const e=0.5*v*v*absorb + G*(drop+(fall||0));          // joules per kilogram (fall: a tumble down the hillside off a pass)
  rd.v=0; rd.lastCrashE=e;
  if(e>110){ rd.status='out'; race.out++;
    race.events.push({t:race.t,kind:'out',rider:rd,seg,over,e,v}); return; }
  rd.status='down';
  if(e<10){ rd.down=1.5+race.R()*2.5; rd.E=Math.max(0,rd.E-0.04*rd.E0); }
  else if(e<40){ rd.down=6+race.R()*9; rd.E=Math.max(0,rd.E-0.15*rd.E0); }
  else {
    rd.down=28+race.R()*80; rd.E=Math.max(0,rd.E-0.4*rd.E0);
    rd.hurtE=Math.min(2.2,(rd.hurtE||1)*1.35);          // rides shy from here on
    rd.hurtP=(rd.hurtP||1)*0.90;
    rd.hurt=(rd.hurt||0)+1;
  }
  race.events.push({t:race.t,kind:'crash',rider:rd,seg,over,e,down:rd.down,v});
}
/* where a rider is, in erosion-grid cells, for drawing */
function place(trail,rd){ const n=trail.n; const f=rd.s/trail.ds, i=((Math.floor(f)%n)+n)%n, j=(i+1)%n, t=f-Math.floor(f); const a=trail.S[i], b=trail.S[j];
  return {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, zE:a.zE+(b.zE-a.zE)*t, heading:a.heading, seg:a}; }

/* the tallies for the cards */
function tally(rd){ return {kcal:rd.work/(rd.eff||0.22)/4184, litres:rd.water, climbedFt:rd.climbed*3.281, peakCore:rd.peakCore}; }
global.RaceSim={buildTrail, makeRiders, favourite, makeRace, makeDay, step, place, tally, cpW, pCap, passRisk, BED, INKS};
}
RaceSimFactory(typeof window!=='undefined'?window:globalThis);

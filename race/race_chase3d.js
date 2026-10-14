/* ---------------------------------------------------------------------------
   race_chase3d.js · v1.1 · 2026-10-14
   the chase window of race.html, in WebGL (three.js r128).
   Joe, 2026-10-13: "The quality of the landscape rendering is really poor in
   the upper right rider focus graph." The old window was the strata ray-
   marcher run on the CPU at 960 x 540 with the camera 45 m behind the rider:
   a smooth 10 m surface magnified until it was a grey blur, a trail drawn as a
   floating line, and the riders as numbered dots.

   WHAT IS DRAWN, all at race scale (metres; the erosion world shrunk by the
   race cell, so slopes are the world's own):
     THE GROUND    the display copy of the frozen surface (StrataView's fine
                   grid, a third of a cell) as a lit mesh in chunks, each chunk
                   at full, half, quarter or eighth detail by its distance from
                   the camera, with skirts so the seams never open. Coloured
                   per pixel by the BED at that elevation (the same lookup as
                   the map), with wavy bed contacts, laminations and desert
                   varnish on steep faces, soil and scattered stones on gentle
                   ground, and a fine bump by the bed's roughness (shale is
                   rubble, sandstone slickrock). Sunlit by the day's sun - its
                   height from the race day's insolation - with terrain shadows
                   cast once per race on the CPU, and distance haze.
     THE TRAIL     a corridor mesh along the course: the tread itself, LEVEL
                   ACROSS and smoothed along (benched: cut into the hillside on
                   the uphill side, filled on the downhill side, with the cut
                   bank and the fill slope drawn), singletrack 0.9 m wide, two-
                   track 3.2 m with two wheel ruts and a crown between. The
                   ground mesh is cut away under it, so the bench is real
                   geometry and not a line painted on the hill.
     SCRUB         juniper and sagebrush as instanced shapes, on gentle ground
                   near the course and never on the tread - they give the eye
                   a scale it did not have.
     THE RIDERS    a rider on a bike in their colour, pedalling at their own
                   cadence, pitched with the grade, lying on their side when
                   down; a plate-number tag over each.
   The camera rides behind the followed rider ALONG THE TRAIL (so it follows a
   switchback round instead of cutting through the hill), as far back as it takes
   to be 10 m from them in a straight line, 3.6 m up,
   never below the ground, looking just ahead of the rider.

   One call per frame: render(subject, race, alpha) - alpha interpolates rider
   positions between simulation ticks, so the picture moves smoothly at the
   display's rate while the race steps ten times a second.
---------------------------------------------------------------------------

   CHANGED
     v1.1  a cut, not a glide, when the followed rider changes (the camera eased
           back through the new rider); the camera keeps 10 m from the rider in a
           straight line round switchbacks; a tag within 6 m of the lens is hidden
     v1.0  new: replaces the CPU ray-marcher in the chase window
*/
function RaceChase3DFactory(global){
'use strict';
const THREE=global.THREE;
const CH=64;                                   // fine cells per terrain chunk side
const LODS=[1,2,4,8];
const BACK=10, UP=3.6, AHEAD=10;                // the chase camera, metres

/* ---- the shared shader for ground and trail ------------------------------- */
const VS=`
attribute float aF; attribute float aSh;
#ifdef TERRAIN
attribute float aTd;
varying float vTd;
#endif
#ifdef CORRIDOR
attribute float aLat; attribute float aHalf;
varying float vLat; varying float vHalf;
#endif
varying vec3 vPos; varying vec3 vN; varying float vF; varying float vSh;
void main(){
  vPos=position; vN=normal; vF=aF; vSh=aSh;
#ifdef TERRAIN
  vTd=aTd;
#endif
#ifdef CORRIDOR
  vLat=aLat; vHalf=aHalf;
#endif
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;
const FS=`
uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 skyCol; uniform vec3 bounceCol; uniform vec3 fogCol; uniform vec3 camPos;
uniform float fogD; uniform float scale; uniform sampler2D nt;
uniform float bBase[16]; uniform vec3 bCol[16]; uniform float bRough[16]; uniform int nb;
varying vec3 vPos; varying vec3 vN; varying float vF; varying float vSh;
#ifdef TERRAIN
varying float vTd;
#endif
#ifdef CORRIDOR
varying float vLat; varying float vHalf;
#endif
/* every bit of texture comes from one tiling noise texture (r: fbm height,
   g b: its slope, a: an independent fbm) sampled at a few scales - the Pi's GPU
   could not afford the same noise computed per pixel (7 frames a second) */
void main(){
#ifdef TERRAIN
  if(vTd<0.0) discard;                                   // under the trail corridor
#endif
  vec3 N=normalize(vN);
  float dist=length(vPos-camPos);
  vec2 p=vPos.xz;
  vec4 nL=texture2D(nt,p*0.0045);                        // ~30 m: bed contacts, soil mottling
  vec4 nM=texture2D(nt,p*0.031+vec2(0.37,0.11));         // ~4 m
  vec4 nS=texture2D(nt,p*0.13+vec2(0.71,0.53));          // ~1 m: small stones
  vec4 nF=texture2D(nt,p*0.55+vec2(0.19,0.83));          // ~25 cm: grit, resolved only up close
  /* the bed: elevation in world metres, with wavy contacts */
  float e=vPos.y/scale+(nL.r-0.5)*6.0;
  vec3 col=vec3(0.36,0.34,0.35); float rough=0.4;
  for(int i=15;i>=0;i--){ if(i<nb && e>=bBase[i]+vF){ col=bCol[i]; rough=bRough[i];
      if(i>0){ float t=smoothstep(0.0,3.0,e-(bBase[i]+vF)); col=mix(bCol[i-1],col,0.5+0.5*t); }
      break; } }
  float steep=1.0-smoothstep(0.80,0.95,N.y);           // 0 gentle ground .. 1 a face
  /* fine relief by the bed's roughness, fading with distance (the mipmaps fade it too) */
  float near=1.0-smoothstep(40.0,260.0,dist);
  float amp=(0.15+0.6*rough)*near;
  vec2 gr=(nF.gb-0.5)*0.9+(nS.gb-0.5)*0.7+(nM.gb-0.5)*0.45;
  vec3 Nd=normalize(N+amp*vec3(-gr.x,0.0,-gr.y));
  float lam=sin(e*2.3+3.0*nM.a);                         // laminations on the faces
  Nd=normalize(Nd+steep*0.18*lam*vec3(0.0,1.0,0.0));
  /* what the ground is made of */
  float grit=(0.92+0.16*nF.a)*(0.94+0.12*nS.a);
  vec3 rock=col*(0.90+0.18*nM.r)*(1.0+0.06*steep*lam)*grit;
  float varnish=steep*smoothstep(0.55,0.85,texture2D(nt,vec2((p.x+p.y)*0.012,vPos.y*0.002)).a);
  rock*=1.0-0.38*varnish;                                   // dark streaks down the walls
  vec3 soil=mix(col,vec3(0.60,0.52,0.42),0.52)*(0.78+0.30*nL.a)*grit;
  float peb=smoothstep(0.66,0.72,nF.r)*(0.2+rough)*near;   // scattered stones, darker than the soil
  soil=mix(soil,col*0.78,min(1.0,peb*0.6));
  vec3 alb=mix(soil,rock,steep);
#ifdef CORRIDOR
  /* the tread, the ruts and the crown */
  float a=abs(vLat), h=vHalf;
  vec3 tread=mix(vec3(0.72,0.64,0.54),col,0.30)*(0.93+0.12*nS.a);
  if(a<h){
    if(h>1.0){
      float rut=smoothstep(0.30,0.50,a)*(1.0-smoothstep(1.00,1.25,a));
      vec3 crown=mix(soil,vec3(0.47,0.49,0.37),0.45*smoothstep(0.35,0.75,nM.a));
      alb=mix(crown,tread*0.90,rut);
      if(a>1.25) alb=mix(tread,soil,0.45);
    } else alb=tread;
    Nd=normalize(mix(Nd,N,0.75));
  }
#endif
  /* light: the sun (with the terrain's shadow), the sky, a little bounce */
  float diff=max(dot(Nd,sunDir),0.0)*vSh;
  vec3 light=sunCol*diff+skyCol*(0.55+0.45*Nd.y)+bounceCol*(0.5-0.5*Nd.y);
  vec3 c=alb*light;
  float f=1.0-exp(-dist*fogD);
  c=mix(c,fogCol,f);
  gl_FragColor=vec4(c,1.0);
}`;

/* the tiling noise texture: 256 x 256, r = fbm, g/b = its gradient, a = a second fbm */
let NOISE=null;
function noiseTexture(){
  if(NOISE) return NOISE;
  const N=256, H=new Float32Array(N*N), A=new Float32Array(N*N); let seed=0x9e3779b9>>>0;
  const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
  const fbm=(out)=>{ out.fill(0); let amp=0.5;
    for(const per of [4,8,16,32,64]){ const g=new Float32Array(per*per); for(let i=0;i<g.length;i++) g[i]=rnd();
      for(let y=0;y<N;y++) for(let x=0;x<N;x++){ const X=x*per/N, Y=y*per/N, xi=Math.floor(X), yi=Math.floor(Y), fx=X-xi, fy=Y-yi, u=fx*fx*(3-2*fx), v=fy*fy*(3-2*fy);
        const a=g[(yi%per)*per+xi%per], b=g[(yi%per)*per+(xi+1)%per], c=g[((yi+1)%per)*per+xi%per], d=g[((yi+1)%per)*per+(xi+1)%per];
        out[y*N+x]+=amp*(a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v); }
      amp*=0.5; }
    let lo=1e9, hi=-1e9; for(const v of out){ lo=Math.min(lo,v); hi=Math.max(hi,v); } for(let i=0;i<out.length;i++) out[i]=(out[i]-lo)/(hi-lo); };
  fbm(H); fbm(A);
  const data=new Uint8Array(N*N*4);
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){ const i=y*N+x;
    const gx=(H[y*N+(x+1)%N]-H[y*N+(x+N-1)%N])*N/16, gy=(H[((y+1)%N)*N+x]-H[((y+N-1)%N)*N+x])*N/16;
    data[4*i]=H[i]*255; data[4*i+1]=Math.max(0,Math.min(255,(0.5+gx)*255)); data[4*i+2]=Math.max(0,Math.min(255,(0.5+gy)*255)); data[4*i+3]=A[i]*255; }
  NOISE=new THREE.DataTexture(data,N,N,THREE.RGBAFormat);
  NOISE.wrapS=NOISE.wrapT=THREE.RepeatWrapping; NOISE.magFilter=THREE.LinearFilter; NOISE.minFilter=THREE.LinearMipmapLinearFilter;
  NOISE.generateMipmaps=true; NOISE.needsUpdate=true;
  return NOISE;
}

const SKY_VS=`varying vec3 vDir; void main(){ vDir=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }`;
const SKY_FS=`uniform vec3 sunDir; uniform vec3 hor; uniform vec3 zen; varying vec3 vDir;
void main(){ vec3 d=normalize(vDir); float t=clamp(d.y,0.0,1.0);
  vec3 c=mix(hor,zen,pow(t,0.55));
  float s=max(dot(d,sunDir),0.0); c+=vec3(1.0,0.92,0.78)*(pow(s,600.0)*1.5+pow(s,12.0)*0.12);
  if(d.y<0.0) c=hor*0.97;
  gl_FragColor=vec4(c,1.0); }`;

function create(canvas){
  if(!THREE) return null;
  let renderer;
  try{ renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'}); }
  catch(e){ return null; }
  renderer.setPixelRatio(1);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(52,canvas.width/canvas.height,0.3,5000);
  let world=null, chunks=[], corridor=null, riders=[], sky=null, mats=null, tread=null, cam=null, scrub=[];
  let trailRef=null, nS=0, ds=2, cell=10, scale=0.2, groundAt=null, lastSubject=null;

  function setSize(w,h){ renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }

  /* ---- everything for one race ------------------------------------------- */
  function setRace(w, fine, trail, riderList, day, raceCell){
    clear();
    world=w; trailRef=trail; nS=trail.n; ds=trail.ds; cell=raceCell; scale=raceCell/w.dx;
    const U=fine.U, nxf=fine.nxf, nyf=fine.nyf, zr=fine.zr, Fr=fine.Fr, cf=cell/U;   // cf: metres per fine cell
    const Y=(i)=>zr[i]*scale;
    /* the sun: its height from the day's insolation on the rider (a clear sky
       puts about 1,050 W/m2 on a surface square to the sun), from the
       south-west */
    const elev=Math.asin(Math.max(0.28,Math.min(0.96,day.sun/1050))), az=-2.3;
    const sun=new THREE.Vector3(Math.cos(elev)*Math.cos(az),Math.sin(elev),Math.cos(elev)*Math.sin(az)).normalize();
    /* ground height anywhere (race metres), bilinear on the fine grid */
    const gAt=(X,Z)=>{ const xf=Math.max(0,Math.min(nxf-1.001,X/cf)), yf=Math.max(0,Math.min(nyf-1.001,Z/cf)), xi=xf|0, yi=yf|0, fx=xf-xi, fy=yf-yi, c=yi*nxf+xi;
      return ((zr[c]*(1-fx)+zr[c+1]*fx)*(1-fy)+(zr[c+nxf]*(1-fx)+zr[c+nxf+1]*fx)*fy)*scale; };
    const fAt=(X,Z,arr)=>{ const xf=Math.max(0,Math.min(nxf-1.001,X/cf)), yf=Math.max(0,Math.min(nyf-1.001,Z/cf)), xi=xf|0, yi=yf|0, fx=xf-xi, fy=yf-yi, c=yi*nxf+xi;
      return (arr[c]*(1-fx)+arr[c+1]*fx)*(1-fy)+(arr[c+nxf]*(1-fx)+arr[c+nxf+1]*fx)*fy; };
    groundAt=gAt;

    /* TERRAIN SHADOWS, once: march from every fine vertex toward the sun; the
       steepest rise of the ground above that ray decides lit, penumbra or shade */
    const shadow=new Float32Array(nxf*nyf); {
      let zmax=-1e9; for(let i=0;i<zr.length;i++) if(zr[i]>zmax) zmax=zr[i]; zmax*=scale;
      const tanE=Math.tan(elev), sx=sun.x, sz=sun.z, hl=Math.hypot(sx,sz), ux=sx/hl, uz=sz/hl, stepM=cf*1.5;
      for(let j=0;j<nyf;j++) for(let i=0;i<nxf;i++){
        const X0=i*cf, Z0=j*cf, y0=Y(j*nxf+i)+0.3; let occ=-1;
        for(let k=1;k<200;k++){ const d=k*stepM, X=X0+ux*d, Z=Z0+uz*d; if(X<0||Z<0||X>=(nxf-1)*cf||Z>=(nyf-1)*cf) break;
          const ry=y0+d*tanE; if(ry>zmax) break;
          const xi=(X/cf)|0, yi=(Z/cf)|0, g=zr[yi*nxf+xi]*scale, o=(g-ry)/d; if(o>occ) occ=o; if(occ>0.05) break; }
        shadow[j*nxf+i]=1-Math.max(0,Math.min(1,(occ+0.035)/0.07));
      }
    }
    /* THE TRAIL, in race metres: centre, tangent, tread height (the ground
       under the line averaged over 20 m: benched, cut and filled), half-width */
    const Sx=new Float32Array(nS), Sz=new Float32Array(nS), Ty=new Float32Array(nS), Hw=new Float32Array(nS);
    for(let i=0;i<nS;i++){ const s=trail.S[i]; Sx[i]=s.x*cell; Sz[i]=s.y*cell; Hw[i]=s.two?1.6:0.45; }
    const Gc=new Float32Array(nS); for(let i=0;i<nS;i++) Gc[i]=gAt(Sx[i],Sz[i]);
    for(let i=0;i<nS;i++){ let a=0; for(let k=-5;k<=5;k++) a+=Gc[(i+k+nS)%nS]; Ty[i]=a/11; }
    tread={Sx,Sz,Ty,Hw};
    /* how wide the corridor may be at each sample: never into the next limb of
       a switchback (half the gap to the nearest part of the trail that is more
       than 40 m away along it), at most 8 m */
    const Wc=new Float32Array(nS).fill(8); {
      const G=20, grid=new Map(), key=(x,z)=>((x/G)|0)+','+((z/G)|0);
      for(let i=0;i<nS;i++){ const k=key(Sx[i],Sz[i]); if(!grid.has(k)) grid.set(k,[]); grid.get(k).push(i); }
      for(let i=0;i<nS;i++){ const gx=(Sx[i]/G)|0, gz=(Sz[i]/G)|0; let best=1e9;
        for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++){ const L=grid.get((gx+a)+','+(gz+b)); if(!L) continue;
          for(const j of L){ let al=Math.abs(i-j); al=Math.min(al,nS-al)*ds; if(al<40) continue; const d=Math.hypot(Sx[i]-Sx[j],Sz[i]-Sz[j]); if(d<best) best=d; } }
        Wc[i]=Math.max(Hw[i]+1.8,Math.min(8,0.5*best-0.3)); }
      /* and on the inside of a tight bend, 80% of its radius, so the sections do not fold */
      for(let i=0;i<nS;i++){ const p=(i-3+nS)%nS, q=(i+3)%nS; const h1=Math.atan2(Sz[i]-Sz[p],Sx[i]-Sx[p]), h2=Math.atan2(Sz[q]-Sz[i],Sx[q]-Sx[i]); let dh=Math.abs(h2-h1); if(dh>Math.PI) dh=2*Math.PI-dh;
        const Rc=dh>1e-3?(6*ds)/dh:1e9; Wc[i]=Math.max(Hw[i]+3.0,Math.min(Wc[i],0.8*Rc)); }
    }
    /* per fine vertex: how far inside the corridor's cover it lies (negative =
       the corridor draws here, so the ground is cut away) */
    const tdist=new Float32Array(nxf*nyf).fill(99); {
      const R=Math.ceil(10/cf);
      for(let i=0;i<nS;i++){ const ci=Math.round(Sx[i]/cf), cj=Math.round(Sz[i]/cf), cover=Wc[i]-1.6;
        for(let b=-R;b<=R;b++) for(let a=-R;a<=R;a++){ const x=ci+a, y=cj+b; if(x<0||y<0||x>=nxf||y>=nyf) continue;
          const d=Math.hypot(x*cf-Sx[i],y*cf-Sz[i])-cover, k=y*nxf+x; if(d<tdist[k]) tdist[k]=d; } }
    }

    /* ---- materials ---- */
    const L=w.layers, nb=Math.min(16,L.length), base=new Array(16).fill(1e9), cols=[], rough=new Array(16).fill(0.4);
    for(let k=0;k<16;k++){ if(k<nb){ base[k]=L[k].base; const c=L[k].color; cols.push(new THREE.Vector3(c[0]/255,c[1]/255,c[2]/255)); rough[k]=(global.RaceSim&&RaceSim.BED[L[k].type])?RaceSim.BED[L[k].type].rough:0.4; } else cols.push(new THREE.Vector3()); }
    const hor=new THREE.Color(0.80,0.79,0.76), zen=new THREE.Color(0.36,0.52,0.78);
    const uni=()=>({sunDir:{value:sun}, sunCol:{value:new THREE.Vector3(0.86,0.80,0.71)}, skyCol:{value:new THREE.Vector3(0.27,0.31,0.39)},
      bounceCol:{value:new THREE.Vector3(0.16,0.12,0.09)}, fogCol:{value:new THREE.Vector3(hor.r,hor.g,hor.b)}, camPos:{value:new THREE.Vector3()},
      fogD:{value:0.00075}, scale:{value:scale}, bBase:{value:base}, bCol:{value:cols}, bRough:{value:rough}, nb:{value:nb}, nt:{value:noiseTexture()}});
    const terrMat=new THREE.ShaderMaterial({vertexShader:VS, fragmentShader:FS, uniforms:uni(), defines:{TERRAIN:1}});
    const corrMat=new THREE.ShaderMaterial({vertexShader:VS, fragmentShader:FS, uniforms:uni(), defines:{CORRIDOR:1}, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-4});
    mats={terrMat,corrMat,sun};
    scene.fog=new THREE.FogExp2(hor.getHex(),0.00075);
    scene.add(new THREE.HemisphereLight(0x8fa6c4,0x5a4a3a,0.55));
    const dl=new THREE.DirectionalLight(0xfff0dc,0.85); dl.position.copy(sun); scene.add(dl);

    /* ---- the ground, in chunks with four levels of detail ---- */
    const nrm=new Float32Array(nxf*nyf*3);
    for(let j=0;j<nyf;j++) for(let i=0;i<nxf;i++){ const k=j*nxf+i;
      const gx=(Y(j*nxf+Math.min(nxf-1,i+1))-Y(j*nxf+Math.max(0,i-1)))/(2*cf), gz=(Y(Math.min(nyf-1,j+1)*nxf+i)-Y(Math.max(0,j-1)*nxf+i))/(2*cf);
      const inv=1/Math.sqrt(gx*gx+gz*gz+1); nrm[3*k]=-gx*inv; nrm[3*k+1]=inv; nrm[3*k+2]=-gz*inv; }
    for(let j0=0;j0<nyf-1;j0+=CH) for(let i0=0;i0<nxf-1;i0+=CH){
      const i1=Math.min(i0+CH,nxf-1), j1=Math.min(j0+CH,nyf-1), vw=i1-i0+1, vh=j1-j0+1, nv=vw*vh+2*vw+2*vh;
      const pos=new Float32Array(nv*3), nor=new Float32Array(nv*3), aF=new Float32Array(nv), aSh=new Float32Array(nv), aTd=new Float32Array(nv);
      const put=(v,k,dy)=>{ pos[3*v]=(k%nxf)*cf; pos[3*v+1]=Y(k)+dy; pos[3*v+2]=((k/nxf)|0)*cf; nor[3*v]=nrm[3*k]; nor[3*v+1]=nrm[3*k+1]; nor[3*v+2]=nrm[3*k+2]; aF[v]=Fr[k]; aSh[v]=shadow[k]; aTd[v]=tdist[k]; };
      const g=(i,j)=>(j-j0)*vw+(i-i0);
      for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++) put(g(i,j),j*nxf+i,0);
      const sb=vw*vh, sT=(i)=>sb+(i-i0), sB=(i)=>sb+vw+(i-i0), sL=(j)=>sb+2*vw+(j-j0), sR=(j)=>sb+2*vw+vh+(j-j0);
      for(let i=i0;i<=i1;i++){ put(sT(i),j0*nxf+i,-4); put(sB(i),j1*nxf+i,-4); }
      for(let j=j0;j<=j1;j++){ put(sL(j),j*nxf+i0,-4); put(sR(j),j*nxf+i1,-4); }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); geo.setAttribute('normal',new THREE.BufferAttribute(nor,3));
      geo.setAttribute('aF',new THREE.BufferAttribute(aF,1)); geo.setAttribute('aSh',new THREE.BufferAttribute(aSh,1)); geo.setAttribute('aTd',new THREE.BufferAttribute(aTd,1));
      const idx=LODS.map(s=>{ const xs=[], ys=[]; for(let i=i0;i<i1;i+=s) xs.push(i); xs.push(i1); for(let j=j0;j<j1;j+=s) ys.push(j); ys.push(j1);
        const t=[];
        for(let b=0;b<ys.length-1;b++) for(let a=0;a<xs.length-1;a++){ const A=g(xs[a],ys[b]), B=g(xs[a+1],ys[b]), C=g(xs[a],ys[b+1]), D=g(xs[a+1],ys[b+1]); t.push(A,C,B, B,C,D); }
        const skirt=(p,q,pp,qq)=>{ t.push(p,q,pp, q,qq,pp, p,pp,q, q,pp,qq); };   // both windings: a skirt is seen from either side
        for(let a=0;a<xs.length-1;a++){ skirt(g(xs[a],j0),g(xs[a+1],j0),sT(xs[a]),sT(xs[a+1])); skirt(g(xs[a],j1),g(xs[a+1],j1),sB(xs[a]),sB(xs[a+1])); }
        for(let b=0;b<ys.length-1;b++){ skirt(g(i0,ys[b]),g(i0,ys[b+1]),sL(ys[b]),sL(ys[b+1])); skirt(g(i1,ys[b]),g(i1,ys[b+1]),sR(ys[b]),sR(ys[b+1])); }
        return new THREE.BufferAttribute(new Uint16Array(t),1); });
      geo.setIndex(idx[0]); geo.computeBoundingSphere();
      const m=new THREE.Mesh(geo,terrMat); m.matrixAutoUpdate=false;
      m.userData={idx,lod:0,cx:(i0+i1)/2*cf,cz:(j0+j1)/2*cf};
      scene.add(m); chunks.push(m);
    }

    /* ---- the trail corridor: tread level across, cut bank, fill, then ground ----
       Each cross-section has its own normals: the tread's (level across, tilted
       only by the grade), the bank's (the cut or fill face itself) and the
       ground's (the terrain's own) - with the points at the bank's edges doubled
       so the crease stays a crease. Averaged normals once lit the flat ground
       beside the trail like a cliff face. Narrower on the inside of a tight bend
       (80% of its radius) so the sections do not fold over each other. */
    { const B=2.6, nl=15, nv=nS*nl, pos=new Float32Array(nv*3), nor=new Float32Array(nv*3), aF=new Float32Array(nv), aSh=new Float32Array(nv), aLat=new Float32Array(nv), aHalf=new Float32Array(nv);
      const nAt=(X,Z)=>{ const xf=Math.max(0,Math.min(nxf-1.001,X/cf)), yf=Math.max(0,Math.min(nyf-1.001,Z/cf)), xi=xf|0, yi=yf|0, fx=xf-xi, fy=yf-yi, c=yi*nxf+xi, o=[0,0,0];
        for(let k=0;k<3;k++) o[k]=(nrm[3*c+k]*(1-fx)+nrm[3*c+3+k]*fx)*(1-fy)+(nrm[3*(c+nxf)+k]*(1-fx)+nrm[3*(c+nxf)+3+k]*fx)*fy;
        const l=Math.hypot(o[0],o[1],o[2])||1; return [o[0]/l,o[1]/l,o[2]/l]; };
      for(let i=0;i<nS;i++){
        const p=(i-1+nS)%nS, q=(i+1)%nS; let tx=Sx[q]-Sx[p], tz=Sz[q]-Sz[p]; const tl=Math.hypot(tx,tz)||1; tx/=tl; tz/=tl;
        const g=(Ty[q]-Ty[p])/(2*ds), lx=-tz, lz=tx, h=Hw[i], W=Wc[i];
        const tn=(()=>{ const v=[-tx*g,1,-tz*g], l=Math.hypot(v[0],v[1],v[2]); return [v[0]/l,v[1]/l,v[2]/l]; })();
        const edge=(sg)=>{ const X=Sx[i]+lx*sg*(h+B), Z=Sz[i]+lz*sg*(h+B); return gAt(X,Z); };
        /* the bank face on each side: across from the tread edge (Ty) to the bank top */
        const bank=(sg)=>{ const dy=edge(sg)-Ty[i], L=[lx*sg*B,dy,lz*sg*B], T=[tx,g,tz];
          let n=[L[1]*T[2]-L[2]*T[1], L[2]*T[0]-L[0]*T[2], L[0]*T[1]-L[1]*T[0]]; if(n[1]<0) n=n.map(v=>-v); const l=Math.hypot(n[0],n[1],n[2])||1; return n.map(v=>v/l); };
        const bl=bank(-1), br=bank(1);
        const pts=[[-W,'g'],[-(h+B+0.6),'g'],[-(h+B),'g'],[-(h+B),'bl'],[-h,'bl'],[-h,'t'],[-0.55*h,'t'],[0,'t'],[0.55*h,'t'],[h,'t'],[h,'br'],[h+B,'br'],[h+B,'g'],[h+B+0.6,'g'],[W,'g']];
        for(let k=0;k<nl;k++){ const u=pts[k][0], kind=pts[k][1], X=Sx[i]+lx*u, Z=Sz[i]+lz*u, a=Math.abs(u); let y;
          if(a<=h+1e-6) y=Ty[i]-(h<1?0.05*(1-a/h):0)+0.02;              // a worn singletrack is a little dished
          else if(a<=h+B+1e-6) y=Ty[i]+(edge(Math.sign(u))-Ty[i])*(a-h)/B;
          else y=gAt(X,Z)+0.03;
          const n=kind==='g'?nAt(X,Z):kind==='t'?tn:kind==='bl'?bl:br;
          const v=i*nl+k; pos[3*v]=X; pos[3*v+1]=y; pos[3*v+2]=Z; nor[3*v]=n[0]; nor[3*v+1]=n[1]; nor[3*v+2]=n[2];
          aF[v]=fAt(X,Z,Fr); aSh[v]=fAt(X,Z,shadow); aLat[v]=u; aHalf[v]=h; } }
      const t=[]; for(let i=0;i<nS;i++){ const j=(i+1)%nS; for(let k=0;k<nl-1;k++){ const A=i*nl+k, Bv=i*nl+k+1, C=j*nl+k, D=j*nl+k+1; t.push(A,Bv,C, Bv,D,C); } }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); geo.setAttribute('normal',new THREE.BufferAttribute(nor,3)); geo.setAttribute('aF',new THREE.BufferAttribute(aF,1)); geo.setAttribute('aSh',new THREE.BufferAttribute(aSh,1));
      geo.setAttribute('aLat',new THREE.BufferAttribute(aLat,1)); geo.setAttribute('aHalf',new THREE.BufferAttribute(aHalf,1));
      geo.setIndex(new THREE.BufferAttribute(nv>65535?new Uint32Array(t):new Uint16Array(t),1));
      /* the corridor's triangles may wind either way round a bend; draw both sides */
      corrMat.side=THREE.DoubleSide;
      corridor=new THREE.Mesh(geo,corrMat); corridor.matrixAutoUpdate=false; corridor.frustumCulled=false; scene.add(corridor); }

    /* ---- scrub: juniper and sage on gentle ground near the course ---- */
    { let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9; for(let i=0;i<nS;i++){ x0=Math.min(x0,Sx[i]); x1=Math.max(x1,Sx[i]); z0=Math.min(z0,Sz[i]); z1=Math.max(z1,Sz[i]); }
      const M=350; x0=Math.max(0,x0-M); z0=Math.max(0,z0-M); x1=Math.min((nxf-1)*cf,x1+M); z1=Math.min((nyf-1)*cf,z1+M);
      let seed=(w.seed*2654435761)>>>0; const rnd=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
      const kinds=[{n:0,max:3000,geo:new THREE.IcosahedronGeometry(1,0),col:[0.30,0.38,0.24],h:[1.4,3.6],r:[0.9,1.9]},     // juniper
                   {n:0,max:5000,geo:new THREE.IcosahedronGeometry(1,0),col:[0.58,0.60,0.48],h:[0.45,0.9],r:[0.4,0.8]}];   // sagebrush
      for(const K of kinds){ K.mesh=new THREE.InstancedMesh(K.geo,new THREE.MeshLambertMaterial({color:0xffffff}),K.max); K.mesh.frustumCulled=false; }
      const mtx=new THREE.Matrix4(), q=new THREE.Quaternion(), sc=new THREE.Vector3(), ps=new THREE.Vector3(), cc=new THREE.Color();
      const area=(x1-x0)*(z1-z0), tries=Math.min(60000,area/40);
      for(let t=0;t<tries;t++){
        const X=x0+rnd()*(x1-x0), Z=z0+rnd()*(z1-z0), xf=X/cf, zf=Z/cf, k=(zf|0)*nxf+(xf|0);
        if(tdist[k]<2.5) continue;                                         // never on the tread
        const ny=nrm[3*k+1]; if(ny<0.86) continue;                         // nothing grows on a face
        const patch=0.5+0.5*Math.sin(X*0.021+Math.sin(Z*0.017)*2.0)*Math.sin(Z*0.019+1.3);   // scrub grows in patches
        const K=rnd()<0.4?kinds[0]:kinds[1]; if(rnd()>0.15+patch*(K===kinds[0]?0.6:0.85)) continue; if(K.n>=K.max) continue;
        const hh=K.h[0]+rnd()*(K.h[1]-K.h[0]), rr=K.r[0]+rnd()*(K.r[1]-K.r[0]);
        ps.set(X,gAt(X,Z)+hh*0.42,Z); q.setFromAxisAngle(new THREE.Vector3(0,1,0),rnd()*6.28); sc.set(rr,hh*0.5,rr*(0.85+0.3*rnd()));
        mtx.compose(ps,q,sc); K.mesh.setMatrixAt(K.n,mtx);
        const sh=0.55+0.45*shadow[k], v=0.85+0.3*rnd(); cc.setRGB(K.col[0]*v*sh,K.col[1]*v*sh,K.col[2]*v*sh); K.mesh.setColorAt(K.n,cc); K.n++; }
      for(const K of kinds){ K.mesh.count=K.n; K.mesh.instanceMatrix.needsUpdate=true; if(K.mesh.instanceColor) K.mesh.instanceColor.needsUpdate=true; scene.add(K.mesh); scrub.push(K.mesh); } }

    /* ---- the sky ---- */
    sky=new THREE.Mesh(new THREE.SphereGeometry(4000,32,16),new THREE.ShaderMaterial({vertexShader:SKY_VS,fragmentShader:SKY_FS,side:THREE.BackSide,depthWrite:false,
      uniforms:{sunDir:{value:sun},hor:{value:new THREE.Vector3(hor.r,hor.g,hor.b)},zen:{value:new THREE.Vector3(zen.r,zen.g,zen.b)}}}));
    sky.renderOrder=1000; scene.add(sky);         // LAST: depth 1, so it shades only the pixels nothing else covered

    /* ---- the riders ---- */
    riders=riderList.map(r=>makeRider(r));
    for(const R of riders) scene.add(R.root);
    cam=null;
  }

  /* ---- a rider on a bike: forward +x, up +y, the bike's left +z ---- */
  const GEO={}; function geo(name,mk){ return GEO[name]||(GEO[name]=mk()); }
  function makeRider(r){
    const root=new THREE.Group(), body=new THREE.Group(); root.add(body);
    const jersey=new THREE.MeshLambertMaterial({color:r.color}), dark=new THREE.MeshLambertMaterial({color:0x1d1d22}), skin=new THREE.MeshLambertMaterial({color:0xc89a7a}), shorts=new THREE.MeshLambertMaterial({color:0x22242a});
    const wheelG=geo('wheel',()=>new THREE.TorusGeometry(0.34,0.035,6,18));
    for(const x of [-0.54,0.54]){ const wh=new THREE.Mesh(wheelG,dark); wh.position.set(x,0.36,0); body.add(wh); }
    const bar=(len,th,mat)=>{ const g=new THREE.BoxGeometry(len,th,th); g.translate(len/2,0,0); return new THREE.Mesh(g,mat); };
    const seg=(m,a,b)=>{ m.position.set(a[0],a[1],a[2]||0); m.rotation.z=Math.atan2(b[1]-a[1],b[0]-a[0]); m.scale.x=Math.hypot(b[0]-a[0],b[1]-a[1])/0.5; return m; };
    const frameMat=new THREE.MeshLambertMaterial({color:new THREE.Color(r.color).multiplyScalar(0.6)});
    const tube=()=>bar(0.5,0.045,frameMat);
    body.add(seg(tube(),[-0.54,0.36],[0.02,0.40])); body.add(seg(tube(),[0.02,0.40],[-0.06,0.86])); body.add(seg(tube(),[0.02,0.40],[0.48,0.84]));
    body.add(seg(tube(),[-0.06,0.86],[0.48,0.84])); body.add(seg(tube(),[0.54,0.36],[0.48,0.98])); body.add(seg(tube(),[-0.54,0.36],[-0.06,0.86]));
    const hb=new THREE.Mesh(geo('hbar',()=>new THREE.BoxGeometry(0.05,0.05,0.72)),dark); hb.position.set(0.48,0.98,0); body.add(hb);
    /* the rider: hips over the saddle, torso leaning to the bars */
    const hip=[-0.06,0.98], sh=[0.30,1.40];
    const torso=new THREE.Mesh(geo('torso',()=>{ const g=new THREE.BoxGeometry(0.5,0.22,0.34); g.translate(0.25,0,0); return g; }),jersey);
    seg(torso,hip,sh); torso.scale.x=Math.hypot(sh[0]-hip[0],sh[1]-hip[1])/0.5; body.add(torso);
    const head=new THREE.Mesh(geo('head',()=>new THREE.SphereGeometry(0.11,10,8)),skin); head.position.set(0.42,1.52,0); body.add(head);
    const helmet=new THREE.Mesh(geo('helmet',()=>new THREE.SphereGeometry(0.135,10,6,0,Math.PI*2,0,Math.PI*0.55)),jersey); helmet.position.set(0.41,1.55,0); helmet.rotation.z=-0.5; body.add(helmet);
    for(const z of [-0.17,0.17]){ const arm=seg(bar(0.5,0.075,skin),[sh[0],sh[1],z],[0.46,1.0]); arm.position.z=z; body.add(arm); }
    const legs=[];
    for(const z of [-0.11,0.11]){ const th=bar(0.5,0.12,shorts), sn=bar(0.5,0.09,skin); th.position.z=z; sn.position.z=z; body.add(th); body.add(sn); legs.push({th,sn}); }
    /* the plate tag: a disc in the rider's ink with the number */
    const cv=document.createElement('canvas'); cv.width=cv.height=128; const c=cv.getContext('2d');
    c.beginPath(); c.arc(64,64,58,0,2*Math.PI); c.fillStyle=r.color; c.fill(); c.lineWidth=6; c.strokeStyle='rgba(0,0,0,.85)'; c.stroke();
    c.fillStyle='#000'; c.font='700 50px ui-sans-serif, system-ui, sans-serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(String(r.num),64,67);
    const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv),depthTest:false,fog:false,transparent:true}));
    tag.renderOrder=10; root.add(tag);
    /* a soft shadow on the ground */
    const blob=new THREE.Mesh(geo('blob',()=>new THREE.PlaneGeometry(1.9,0.8)),blobMat()); blob.rotation.x=-Math.PI/2; root.add(blob);
    return {r,root,body,legs,tag,blob,hip,crank:Math.random()*6.28};
  }
  let BLOB=null; function blobMat(){ if(BLOB) return BLOB;
    const cv=document.createElement('canvas'); cv.width=cv.height=64; const c=cv.getContext('2d'), gr=c.createRadialGradient(32,32,2,32,32,31);
    gr.addColorStop(0,'rgba(0,0,0,.55)'); gr.addColorStop(1,'rgba(0,0,0,0)'); c.fillStyle=gr; c.fillRect(0,0,64,64);
    BLOB=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-8}); return BLOB; }
  function setLegs(R,ang){
    const L1=0.46, L2=0.47, c=[0.02,0.40];
    R.legs.forEach((lg,k)=>{ const a=ang+k*Math.PI, P=[c[0]+0.17*Math.cos(a),c[1]+0.17*Math.sin(a)], H=R.hip;
      const dx=P[0]-H[0], dy=P[1]-H[1], d=Math.min(L1+L2-1e-3,Math.hypot(dx,dy)), th=Math.atan2(dy,dx), cosA=(L1*L1+d*d-L2*L2)/(2*L1*d), A=Math.acos(Math.max(-1,Math.min(1,cosA)));
      const K=[H[0]+L1*Math.cos(th+A),H[1]+L1*Math.sin(th+A)];
      lg.th.position.set(H[0],H[1],lg.th.position.z); lg.th.rotation.z=Math.atan2(K[1]-H[1],K[0]-H[0]); lg.th.scale.x=L1/0.5;
      lg.sn.position.set(K[0],K[1],lg.sn.position.z); lg.sn.rotation.z=Math.atan2(P[1]-K[1],P[0]-K[0]); lg.sn.scale.x=L2/0.5; });
  }

  /* where a distance along the course is, in race metres, with its heading */
  function at(d){
    const f=d/ds, i=((Math.floor(f)%nS)+nS)%nS, j=(i+1)%nS, t=f-Math.floor(f), T=tread;
    const x=T.Sx[i]+(T.Sx[j]-T.Sx[i])*t, z=T.Sz[i]+(T.Sz[j]-T.Sz[i])*t, y=T.Ty[i]+(T.Ty[j]-T.Ty[i])*t;
    const p=(i-2+nS)%nS, q=(i+3)%nS; const hx=T.Sx[q]-T.Sx[p], hz=T.Sz[q]-T.Sz[p], grade=(T.Ty[q]-T.Ty[p])/(5*ds);
    return {x,y,z,hx,hz,grade}; }

  /* ---- one frame ---- */
  function render(subject, race, alpha, dtReal){
    if(!world||!subject) return;
    const Ltot=trailRef.L, D=r=>{ const now=r.lap*Ltot+r.s, was=(r._prevD!=null?r._prevD:now); return was+(now-was)*alpha; };
    /* riders */
    for(const R of riders){ const r=R.r; if(r.status==='out'){ R.root.visible=false; continue; } R.root.visible=true;
      const d=Math.max(-20,D(r)), p=at(d);
      R.root.position.set(p.x,p.y,p.z); R.root.rotation.set(0,Math.atan2(-p.hz,p.hx),0);
      const down=r.status==='down';
      R.body.rotation.set(down?1.35:0,0,down?0:Math.atan(p.grade)*0.9); R.body.position.y=down?0.12:0;
      if(!down){ R.crank+=(r.v||0)*(dtReal||0.03)/2.1*2*Math.PI*0.9; setLegs(R,R.crank); }
      R.tag.position.set(0,down?1.3:2.35,0);
      R.blob.position.set(0.05,0.04,0); }
    /* the camera: back along the trail until it is BACK metres from the rider IN
       A STRAIGHT LINE, 3.6 m up, looking just ahead. Measured on the TV
       (2026-10-14): 10 m back along the trail round a switchback is 2-4 m from
       the rider across the hairpin, and for the second it took to round the turn
       the camera sat on top of them and their number tag filled the window. */
    const ds0=D(subject), me=at(ds0), ah=at(ds0+AHEAD);
    let back=BACK, bk=at(ds0-back);
    for(let k=0;k<30 && Math.hypot(bk.x-me.x,bk.z-me.z)<BACK*0.92;k++){ back+=2; bk=at(ds0-back); }
    const want={x:bk.x,y:Math.max(bk.y+UP,groundAt(bk.x,bk.z)+3,me.y+3),z:bk.z, lx:(me.x*0.55+ah.x*0.45), ly:me.y+1.0, lz:(me.z*0.55+ah.z*0.45)};
    /* a new rider to follow is a CUT, as a television director would make it. Measured
       on the TV (2026-10-14): every frame that came within a few metres of the rider
       was in the first 0.3 s after a switch - the new rider is usually the one just
       behind, standing where the camera already was, and the camera eased back
       through them. */
    if(!cam || subject!==lastSubject || Math.hypot(want.x-cam.x,want.z-cam.z)>60) cam=Object.assign({},want);
    else { const k=1-Math.exp(-(dtReal||0.033)*3.2); for(const key in want) cam[key]+=(want[key]-cam[key])*k; }
    lastSubject=subject;
    const gUnder=groundAt(cam.x,cam.z); if(cam.y<gUnder+2) cam.y=gUnder+2;
    camera.position.set(cam.x,cam.y,cam.z); camera.lookAt(cam.lx,cam.ly,cam.lz);
    sky.position.copy(camera.position);
    /* the tags, sized from where the camera now is: one size on screen near or far
       (about a tenth of the window's height for the followed rider), and hidden
       when the TAG itself is within 6 m of the lens - a rider bunched just behind
       the followed one carries theirs at camera height, and it filled the window */
    const tp=new THREE.Vector3();
    for(const R of riders){ if(!R.root.visible) continue; R.root.updateMatrixWorld(true); R.tag.getWorldPosition(tp);
      const dTag=tp.distanceTo(camera.position), sz=Math.max(3,dTag)*(R.r===subject?0.085:0.07);
      R.tag.scale.set(sz,sz,1); R.tag.visible=dTag>6; R.body.visible=camera.position.distanceTo(R.root.position)>1.5; }
    mats.terrMat.uniforms.camPos.value.copy(camera.position); mats.corrMat.uniforms.camPos.value.copy(camera.position);
    /* detail by distance */
    for(const m of chunks){ const u=m.userData, d=Math.hypot(u.cx-cam.x,u.cz-cam.z), lod=api.forceLod!=null?api.forceLod:d<420?0:d<900?1:d<1600?2:3;   // full detail well out: a coarse chunk sits a little off the exact trail strip, and the bed colours follow height
      if(lod!==u.lod){ u.lod=lod; m.geometry.setIndex(u.idx[lod]); } }
    renderer.render(scene,camera);
  }
  function clear(){
    for(const m of chunks){ m.geometry.dispose(); scene.remove(m); } chunks=[];
    if(corridor){ corridor.geometry.dispose(); scene.remove(corridor); corridor=null; }
    for(const s of scrub){ s.geometry.dispose(); scene.remove(s); } scrub=[];
    for(const R of riders) scene.remove(R.root); riders=[];
    while(scene.children.length) scene.remove(scene.children[0]);
    if(mats){ mats.terrMat.dispose(); mats.corrMat.dispose(); } mats=null; world=null;
  }
  const api={setRace, render, setSize, forceLod:null, get renderer(){ return renderer; }, get camera(){ return camera; }, get scene(){ return scene; }};
  return api;
}
global.RaceChase3D={create};
}
RaceChase3DFactory(typeof window!=='undefined'?window:globalThis);

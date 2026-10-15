/* ---------------------------------------------------------------------------
   strata_view.js · v1.1 · 2026-10-14
   the shared PICTURE of a Strata world, used by strata.html
   (the eroding landscape) and race.html (the course cut into a frozen one).

   Two views of one world:
     create(canvas)   the oblique "voxel-space" ray-marcher. For every screen
                      column a ray walks out across the map; each ground sample
                      projects to a screen row, the rows between the previous
                      top and the new one are the terrain in between, and every
                      one of those rows is coloured by the BED at that elevation
                      in that cell - so a cliff shows its stratigraphy.
     drawMap(...)     the top-down geologic map with hillshade: the same bed
                      colours seen from above, no occlusion, so a course line
                      and rider positions can be drawn on it exactly.

   Both draw from a DISPLAY COPY of the surface at U times the erosion grid,
   resampled with a cubic B-spline after a cell-wide Gaussian, with lighting
   computed on that fine grid (the erosion grid itself is never touched). The
   history of why - facets, sawtooth, spikes - is in strata.html's header and
   the memory; the short version is: smooth the display copy, step the ray so
   each sample moves about two screen rows, and never interpolate a bed edge
   across most of a cell.
   Written as a named FACTORY so a page can also run it inside a worker.
---------------------------------------------------------------------------

   CHANGED
     v1.1  natural colours for the race (Joe, 2026-10-14): naturalColors(),
           naturalPainter() (relief shading, rock and soil, washes, scrub, tree
           crowns) and a `natural` option for the ray-marcher; Strata unchanged
     v1.0  versioning starts here; this file predates the scheme
*/
function StrataViewFactory(global){
'use strict';
const U=3;
const FOV=62*Math.PI/180;
const SKY_TOP=[124,156,200], SKY_HOR=[214,216,214], HAZE=[220,206,184], PLAIN=[192,164,124];
const BASEMENT=[92,86,88];
/* NATURAL COLOURS (Joe, 2026-10-14: in the race, "a more conventional overhead view
   that shows the terrain shadowing, vegetation, and more natural rock coloration").
   Strata keeps each bed's own colour - the beds and their hardness are the point
   there. For racing, a bed takes the colour of its ROCK TYPE as the Colorado Plateau
   shows it from the air (buff-orange sandstone, grey-tan limestone, red-brown
   siltstone, muted mauve-brown mudstone, grey shale), with only a quarter of its
   own colour left in, so the stripes of the strata fade to the variation of a real
   landscape; gentle ground takes a soil tone over its rock. */
const NATURAL={sandstone:[196,146,100], limestone:[178,171,157], siltstone:[172,130,100], mudstone:[152,114,100], shale:[142,138,126]};
const SOIL=[198,174,140], SAND=[216,198,164], SCRUB=[104,108,82], NAT_BASE=[120,110,104];
function naturalColors(layers){
  return layers.map(l=>{ const t=NATURAL[l.type]||[170,150,130], c=l.color; return [0,1,2].map(i=>Math.round(0.74*t[i]+0.26*c[i])); }); }
const mixc=(a,b,t)=>[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];

function wts(t){ const t2=t*t, t3=t2*t; return [(1-3*t+3*t2-t3)/6,(4-6*t2+3*t3)/6,(1+3*t+3*t2-3*t3)/6,t3/6]; }
/* separable cubic B-spline resample of an nx x ny field onto nxf x nyf (= U times) */
function upsample(src,nx,ny,dst,tmp,nxf,nyf){
  for(let xf=0;xf<nxf;xf++){
    const u=xf/U, i=Math.floor(u), [w0,w1,w2,w3]=wts(u-i);
    const i0=Math.max(0,i-1), i1=Math.min(nx-1,i), i2=Math.min(nx-1,i+1), i3=Math.min(nx-1,i+2);
    for(let y=0;y<ny;y++){ const r=y*nx; tmp[y*nxf+xf]=w0*src[r+i0]+w1*src[r+i1]+w2*src[r+i2]+w3*src[r+i3]; }
  }
  for(let yf=0;yf<nyf;yf++){
    const v=yf/U, j=Math.floor(v), [w0,w1,w2,w3]=wts(v-j);
    const j0=Math.max(0,j-1)*nxf, j1=Math.min(ny-1,j)*nxf, j2=Math.min(ny-1,j+1)*nxf, j3=Math.min(ny-1,j+2)*nxf, o=yf*nxf;
    for(let xf=0;xf<nxf;xf++) dst[o+xf]=w0*tmp[j0+xf]+w1*tmp[j1+xf]+w2*tmp[j2+xf]+w3*tmp[j3+xf];
  }
}
/* separable 5-tap Gaussian (1 4 6 4 1)/16, edges clamped - takes out the one-cell
   washboard the slump rule leaves on soft slopes */
function gauss(src,nx,ny,dst,tmp){
  for(let y=0;y<ny;y++){ const r=y*nx;
    for(let x=0;x<nx;x++){ const a=r+Math.max(0,x-2), b=r+Math.max(0,x-1), c=r+x, d=r+Math.min(nx-1,x+1), e=r+Math.min(nx-1,x+2);
      tmp[c]=(src[a]+4*src[b]+6*src[c]+4*src[d]+src[e])/16; } }
  for(let y=0;y<ny;y++){ const a=Math.max(0,y-2)*nx, b=Math.max(0,y-1)*nx, c=y*nx, d=Math.min(ny-1,y+1)*nx, e=Math.min(ny-1,y+2)*nx;
    for(let x=0;x<nx;x++) dst[c+x]=(tmp[a+x]+4*tmp[b+x]+6*tmp[c+x]+4*tmp[d+x]+tmp[e+x])/16; }
}

/* the display copy of a world: fine z, fine fold field, fine shade */
function makeFine(w){
  const nxf=w.nx*U, nyf=w.ny*U;
  const fine={nxf,nyf,U, zr:new Float32Array(nxf*nyf), Fr:new Float32Array(nxf*nyf), shade:new Float32Array(nxf*nyf),
    tmpU:new Float32Array(nxf*w.ny), zg:new Float32Array(w.nx*w.ny), tmpG:new Float32Array(w.nx*w.ny), step:-1, w};
  upsample(w.F,w.nx,w.ny,fine.Fr,fine.tmpU,nxf,nyf);
  return fine;
}
function refreshFine(fine){
  const w=fine.w, {nx,ny,dx}=w, {nxf,nyf,zr,shade}=fine;
  gauss(w.z,nx,ny,fine.zg,fine.tmpG); upsample(fine.zg,nx,ny,zr,fine.tmpU,nxf,nyf);
  const lx=-0.55, ly=0.45, lz=0.70, dxf=dx/U;
  for(let y=0;y<nyf;y++) for(let x=0;x<nxf;x++){
    const i=y*nxf+x;
    const gx=((x<nxf-1?zr[i+1]:zr[i])-(x>0?zr[i-1]:zr[i]))/(2*dxf), gy=((y<nyf-1?zr[i+nxf]:zr[i])-(y>0?zr[i-nxf]:zr[i]))/(2*dxf);
    const inv=1/Math.sqrt(gx*gx+gy*gy+1);
    shade[i]=Math.max(0,(-gx*inv)*lx+(-gy*inv)*ly+inv*lz);
  }
  fine.step=w.step;
}

/* the oblique view */
function create(canvas){
  const RW=canvas.width, RH=canvas.height, ctx=canvas.getContext('2d');
  const img=ctx.createImageData(RW,RH), px=new Uint32Array(img.data.buffer), skyRow=new Uint32Array(RH);
  let w=null, fine=null;
  function setWorld(world){ if(world===w) return; w=world; fine=makeFine(w); }
  function render(cam,opts){
    opts=opts||{}; if(!w) return;
    if(fine.step!==w.step) refreshFine(fine);
    const {nx,ny,dx,layers,rain,zb}=w, {nxf,zr:z,Fr:F,shade}=fine;
    /* the focal length from the LARGER side: a portrait canvas (the helicopter
       over a tall course) then gets the 62 degrees vertically, not a fisheye */
    const f=(Math.max(RW,RH)/2)/Math.tan(FOV/2), horizon=RH*0.5-f*Math.tan(cam.pitch);
    const VE=opts.vexag||1.8, FOG=1.9*nx, showRain=opts.rain!==false;
    /* ground detail (the chase window): a speckle per fine cell, stronger on
       rough rock - opts.tex[k] is the roughness of bed k, 0..1 */
    const tex=opts.tex||null;
    /* natural colours: the rock type's colour by elevation (cliffs still show their
       bands, subdued), and gentle ground blended toward soil */
    const nat=opts.natural?(w.__nat||(w.__nat=naturalColors(layers))):null;
    for(let r=0;r<RH;r++){ const u=Math.max(0,Math.min(1,r/Math.max(1,horizon))), v=u*u;
      const cr=SKY_TOP[0]+(SKY_HOR[0]-SKY_TOP[0])*v, cg=SKY_TOP[1]+(SKY_HOR[1]-SKY_TOP[1])*v, cb=SKY_TOP[2]+(SKY_HOR[2]-SKY_TOP[2])*v;
      skyRow[r]=0xff000000|(cb<<16)|(cg<<8)|cr; }
    const fr=SKY_HOR[0]*0.6+HAZE[0]*0.4, fg=SKY_HOR[1]*0.6+HAZE[1]*0.4, fb=SKY_HOR[2]*0.6+HAZE[2]*0.4;
    const nb=layers.length;
    for(let i=0;i<RW;i++){
      const a=cam.yaw+Math.atan((i-RW/2)/f), dirx=Math.cos(a), diry=Math.sin(a), cosr=Math.cos(a-cam.yaw);
      let ybuf=RH, zprev=null, tprev=1.0, t=1.0, prevDrawn=false, yPrevS=null;
      while(t<2.2*nx){
        const X=cam.x+dirx*t, Y=cam.y+diry*t;
        let zs, fs=0, ss=0.8, st=0, inside=false, spk=0;
        if(X>=0&&X<nx-1&&Y>=0&&Y<ny-1){
          inside=true;
          const Xf=X*U, Yf=Y*U, xi=Xf|0, yi=Yf|0, fx=Xf-xi, fy=Yf-yi, c=yi*nxf+xi;
          const w00=(1-fx)*(1-fy), w10=fx*(1-fy), w01=(1-fx)*fy, w11=fx*fy;
          zs=z[c]*w00+z[c+1]*w10+z[c+nxf]*w01+z[c+nxf+1]*w11;
          fs=F[c]*w00+F[c+1]*w10+F[c+nxf]*w01+F[c+nxf+1]*w11;
          ss=shade[c]*w00+shade[c+1]*w10+shade[c+nxf]*w01+shade[c+nxf+1]*w11;
          st=showRain?Math.max(0,Math.min(1,(rain[(Y|0)*nx+(X|0)]-1.7)/4)):0;
          if(tex){ /* mottle at 2.5x the fine grid, bilinear between its corners so it reads as ground, not tiles */
            const Xm=Xf*2.5, Ym=Yf*2.5, mx=Xm|0, my=Ym|0, gx=Xm-mx, gy=Ym-my;
            const hh=(a,b)=>{ let h=(a*374761393+b*668265263)|0; h=(h^(h>>>13))*1274126177|0; return ((h^(h>>>16))>>>0)/4294967296-0.5; };
            spk=(hh(mx,my)*(1-gx)+hh(mx+1,my)*gx)*(1-gy)+(hh(mx,my+1)*(1-gx)+hh(mx+1,my+1)*gx)*gy; }
        } else zs=zb-20;
        const dp=t*dx*cosr, y=horizon-f*((zs-cam.z)*VE)/dp;
        if(y<ybuf){
          const ytop=Math.max(0,Math.ceil(y)); if(zprev===null) zprev=zs;
          const fog=1-Math.exp(-t/FOG);
          const steep=inside?Math.min(1,Math.max(0,((zs-zprev)/(Math.max(1e-6,t-tprev)*dx)-0.5)/1.5)):0;
          const sh=inside?(0.22+0.86*ss)*(1-steep)+(0.36+0.44*ss)*steep:0.80;
          /* each row's elevation: interpolated between the two samples when the
             previous one was drawn, by inverse projection at this sample's
             distance when it was hidden (a far slope emerging above a ridge) */
          const ePerRow=dp/(f*VE), span=ybuf-y, interp=prevDrawn && span>0;
          for(let r=ytop;r<ybuf;r++){
            const e=interp ? zs-((r-y)/span)*(zs-zprev) : cam.z+(horizon-r)*ePerRow;
            let cr,cg,cb;
            if(!inside){ cr=PLAIN[0]; cg=PLAIN[1]; cb=PLAIN[2]; }
            else { let k=nb-1; while(k>=0 && e<layers[k].base+fs) k--;
                   if(k<0){ const b0=nat?NAT_BASE:BASEMENT; cr=b0[0]; cg=b0[1]; cb=b0[2]; }
                   else { const col=nat?nat[k]:layers[k].color; cr=col[0]; cg=col[1]; cb=col[2];
                          const d1=e-(layers[k].base+fs);
                          if(d1<1.5 && k>0){ const m=0.5*(1-d1/1.5), c2=nat?nat[k-1]:layers[k-1].color; cr+=(c2[0]-cr)*m; cg+=(c2[1]-cg)*m; cb+=(c2[2]-cb)*m; } }
                   if(nat){ const sf=0.55*(1-steep); cr+=(SOIL[0]-cr)*sf; cg+=(SOIL[1]-cg)*sf; cb+=(SOIL[2]-cb)*sf; } }
            let shx=sh;
            if(tex && inside){ let k2=nb-1; while(k2>=0 && e<layers[k2].base+fs) k2--; const tx=k2<0?0.4:tex[k2]; shx=sh*(1+spk*(0.18+0.55*tx)*Math.max(0.15,1-t/(0.3*nx))); }
            cr*=shx; cg*=shx; cb*=shx;
            if(st>0){ const d=1-0.30*st; cr*=d; cg*=d; cb=cb*d+22*st; }
            cr+=(fr-cr)*fog; cg+=(fg-cg)*fog; cb+=(fb-cb)*fog;
            px[r*RW+i]=0xff000000|((Math.min(255,cb)|0)<<16)|((Math.min(255,cg)|0)<<8)|(Math.min(255,cr)|0);
          }
          ybuf=ytop; prevDrawn=true;
        } else prevDrawn=false;
        /* adaptive step: about two screen rows per sample, capped by distance, floored */
        const rowsPerCell=yPrevS===null?0:Math.abs(y-yPrevS)/Math.max(1e-6,t-tprev);
        let dt=0.35+t*0.007; if(rowsPerCell>0) dt=Math.min(dt,2.0/rowsPerCell); if(dt<0.05) dt=0.05;
        zprev=zs; tprev=t; yPrevS=y;
        if(ybuf<=0) break;
        t+=dt;
      }
      for(let r=0;r<ybuf;r++) px[r*RW+i]=skyRow[r];
    }
    ctx.putImageData(img,0,0);
  }
  return {setWorld, render, get fine(){ return fine; }, get world(){ return w; }, RW, RH};
}

/* a slow orbit just outside the map, high enough to look into the canyons,
   pitched so the horizon sits near the top of the frame */
function orbitCamera(w, sec, orbitSec){
  const a=sec/orbitSec*2*Math.PI+Math.PI/2;
  const cx=w.nx/2, cy=w.ny*0.5, rad=0.56*w.nx;
  const x=cx+rad*Math.cos(a), y=cy+rad*Math.sin(a);
  return {x,y,z:w.plane+750,yaw:Math.atan2(cy-y,cx-x),pitch:16*Math.PI/180};
}

/* THE MAP: bed colour at the surface with hillshade, seen from above. Draws
   into `ctx` inside box {x,y,W,H}, preserving aspect; returns the placement
   {x0,y0,s,box} so callers can put a fine cell (xf,yf) at (x0+xf*s, y0+yf*s).
   `src` = {x0,y0,w,h} in fine cells zooms to that part of the block. */
const mapCache={fine:null,step:-1,cv:null};
function drawMap(ctx, view, box, src){
  const fine=view.fine, w=view.world; if(!fine||!w) return null;
  if(fine.step!==w.step) refreshFine(fine);
  const {nxf,nyf,zr,Fr,shade}=fine, layers=w.layers, nb=layers.length;
  if(mapCache.fine!==fine || mapCache.step!==fine.step){
    if(!mapCache.cv || mapCache.cv.width!==nxf){ mapCache.cv=document.createElement('canvas'); mapCache.cv.width=nxf; mapCache.cv.height=nyf; }
    const mctx=mapCache.cv.getContext('2d'), mimg=mctx.createImageData(nxf,nyf), mpx=new Uint32Array(mimg.data.buffer);
    for(let i=0;i<nxf*nyf;i++){
      const e=zr[i], fs=Fr[i]; let k=nb-1; while(k>=0 && e<layers[k].base+fs) k--;
      const col=k<0?BASEMENT:layers[k].color, sh=Math.min(1,0.30+0.80*shade[i]);   // never above 1: a channel past 255 spills into the next (cyan cliffs)
      mpx[i]=0xff000000|(((col[2]*sh)|0)<<16)|(((col[1]*sh)|0)<<8)|((col[0]*sh)|0);
    }
    mctx.putImageData(mimg,0,0); mapCache.fine=fine; mapCache.step=fine.step;
  }
  const r=src?{x0:Math.max(0,src.x0),y0:Math.max(0,src.y0),w:Math.min(nxf-Math.max(0,src.x0),src.w),h:Math.min(nyf-Math.max(0,src.y0),src.h)}:{x0:0,y0:0,w:nxf,h:nyf};
  const s=Math.min(box.W/r.w, box.H/r.h), px=box.x+(box.W-r.w*s)/2, py=box.y+(box.H-r.h*s)/2;
  ctx.imageSmoothingEnabled=true; ctx.drawImage(mapCache.cv,r.x0,r.y0,r.w,r.h,px,py,r.w*s,r.h*s);
  return {x0:px-r.x0*s, y0:py-r.y0*s, s, frame:{x:px,y:py,W:r.w*s,H:r.h*s}};
}

/* A HIGH-RESOLUTION MAP of one region: every OUTPUT pixel samples the fine
   grid bilinearly (surface, fold field, lighting) and looks its bed up, the
   way the ray-marcher does - so a zoomed map is crisp at screen resolution
   instead of a magnified 3x grid. Painted in ROW CHUNKS across frames (a
   frozen world does not change, and the Pi has a show to draw), so the
   caller asks paintRows(n) until done. src is {x0,y0,w,h} in fine cells. */
function mapPainter(view, src, outW, outH){
  const fine=view.fine, w=view.world; if(fine.step!==w.step) refreshFine(fine);
  const cv=document.createElement('canvas'); cv.width=outW; cv.height=outH;
  const ctx=cv.getContext('2d'), img=ctx.createImageData(outW,outH), px=new Uint32Array(img.data.buffer);
  const {nxf,nyf,zr,Fr,shade}=fine, layers=w.layers, nb=layers.length;
  let row=0;
  function paintRows(n){
    const end=Math.min(outH,row+n);
    for(;row<end;row++){
      const yf=Math.min(nyf-1.001,Math.max(0,src.y0+(row+0.5)/outH*src.h)), yi=yf|0, fy=yf-yi;
      for(let x=0;x<outW;x++){
        const xf=Math.min(nxf-1.001,Math.max(0,src.x0+(x+0.5)/outW*src.w)), xi=xf|0, fx=xf-xi, c=yi*nxf+xi;
        const w00=(1-fx)*(1-fy), w10=fx*(1-fy), w01=(1-fx)*fy, w11=fx*fy;
        const e=zr[c]*w00+zr[c+1]*w10+zr[c+nxf]*w01+zr[c+nxf+1]*w11;
        const fs=Fr[c]*w00+Fr[c+1]*w10+Fr[c+nxf]*w01+Fr[c+nxf+1]*w11;
        const sh=Math.min(1,0.30+0.80*(shade[c]*w00+shade[c+1]*w10+shade[c+nxf]*w01+shade[c+nxf+1]*w11));
        let k=nb-1; while(k>=0 && e<layers[k].base+fs) k--;
        const col=k<0?BASEMENT:layers[k].color;
        px[row*outW+x]=0xff000000|(((col[2]*sh)|0)<<16)|(((col[1]*sh)|0)<<8)|((col[0]*sh)|0);
      }
    }
    if(row>=outH){ ctx.putImageData(img,0,0); return true; }
    return false;
  }
  return {canvas:cv, paintRows, get done(){ return row>=outH; }, src, outW, outH};
}
/* THE NATURAL MAP: a conventional overhead view of a region - relief shading lit from
   the north-west, rock in its natural colour where the ground is steep, soil where
   it is gentle, pale sand on the wash floors, scrub as a grey-green tint by its
   cover, and pinyon, juniper and cottonwood as individual crowns with their shadows
   (veg from race_flora.js vegetationGrid: the same plants as the 3D view, unthinned).
   Painted in row chunks like mapPainter, then the trees in batches. */
function natFields(fine){
  if(fine.nat && fine.nat.step===fine.step) return fine.nat;
  const {nxf,nyf,zr}=fine, dxf=fine.w.dx/fine.U, N=nxf*nyf, shade=new Float32Array(N), slope=new Float32Array(N);
  const lx=-0.5, ly=-0.5, lz=0.7071, VE=1.6;                     // light from the north-west (the map's top left), relief exaggerated for shading
  for(let y=0;y<nyf;y++) for(let x=0;x<nxf;x++){ const i=y*nxf+x;
    const gx=((x<nxf-1?zr[i+1]:zr[i])-(x>0?zr[i-1]:zr[i]))/(2*dxf), gy=((y<nyf-1?zr[i+nxf]:zr[i])-(y>0?zr[i-nxf]:zr[i]))/(2*dxf);
    slope[i]=Math.hypot(gx,gy); const ex=gx*VE, ey=gy*VE, inv=1/Math.sqrt(ex*ex+ey*ey+1);
    shade[i]=Math.max(0,(-ex*lx-ey*ly+lz)*inv); }
  fine.nat={step:fine.step,shade,slope}; return fine.nat;
}
function naturalPainter(view, src, outW, outH, veg, opts){
  opts=opts||{};
  const fine=view.fine, w=view.world; if(fine.step!==w.step) refreshFine(fine);
  const nf=natFields(fine), cols=naturalColors(w.layers);
  const cv=document.createElement('canvas'); cv.width=outW; cv.height=outH;
  const ctx=cv.getContext('2d'), img=ctx.createImageData(outW,outH), px=new Uint32Array(img.data.buffer);
  const {nxf,nyf,zr,Fr}=fine, layers=w.layers, nb=layers.length;
  const vAt=(arr,xf,yf)=>{ if(!veg) return 0; const st=veg.step, X=Math.min(veg.gw-1.001,Math.max(0,xf/st-0.5)), Y=Math.min(veg.gh-1.001,Math.max(0,yf/st-0.5)), xi=X|0, yi=Y|0, fx=X-xi, fy=Y-yi, c=yi*veg.gw+xi;
    return (arr[c]*(1-fx)+arr[c+1]*fx)*(1-fy)+(arr[c+veg.gw]*(1-fx)+arr[c+veg.gw+1]*fx)*fy; };
  let row=0, trees=null, ti=0, done=false;
  function paintRows(n){
    if(done) return true;
    if(row<outH){
      const end=Math.min(outH,row+n);
      for(;row<end;row++){
        const yf=Math.min(nyf-1.001,Math.max(0,src.y0+(row+0.5)/outH*src.h)), yi=yf|0, fy=yf-yi;
        for(let x=0;x<outW;x++){
          const xf=Math.min(nxf-1.001,Math.max(0,src.x0+(x+0.5)/outW*src.w)), xi=xf|0, fx=xf-xi, c=yi*nxf+xi;
          const w00=(1-fx)*(1-fy), w10=fx*(1-fy), w01=(1-fx)*fy, w11=fx*fy;
          const e=zr[c]*w00+zr[c+1]*w10+zr[c+nxf]*w01+zr[c+nxf+1]*w11;
          const fs=Fr[c]*w00+Fr[c+1]*w10+Fr[c+nxf]*w01+Fr[c+nxf+1]*w11;
          const sh=nf.shade[c]*w00+nf.shade[c+1]*w10+nf.shade[c+nxf]*w01+nf.shade[c+nxf+1]*w11;
          const sl=nf.slope[c]*w00+nf.slope[c+1]*w10+nf.slope[c+nxf]*w01+nf.slope[c+nxf+1]*w11;
          let k=nb-1; while(k>=0 && e<layers[k].base+fs) k--;
          const rock=k<0?NAT_BASE:cols[k], t=Math.max(0,Math.min(1,(sl-0.22)/0.4));
          let col=mixc(mixc(rock,SOIL,0.6),[rock[0]*0.92,rock[1]*0.92,rock[2]*0.92],t*t*(3-2*t));
          const wa=vAt(veg&&veg.wash,xf,yf), sc=vAt(veg&&veg.shrub,xf,yf);
          if(wa>0) col=mixc(col,SAND,0.6*Math.min(1,wa));
          if(sc>0) col=mixc(col,SCRUB,0.55*sc);
          /* a little grain so flat ground is not flat colour */
          let hsh=(xi*374761393+yi*668265263)|0; hsh=(hsh^(hsh>>>13))*1274126177|0; const grain=1+0.05*(((hsh^(hsh>>>16))>>>0)/4294967296-0.5);
          const L=Math.min(1.15,0.40+0.80*sh)*grain;
          px[row*outW+x]=0xff000000|((Math.min(255,col[2]*L)|0)<<16)|((Math.min(255,col[1]*L)|0)<<8)|(Math.min(255,col[0]*L)|0);
        }
      }
      if(row>=outH){ ctx.putImageData(img,0,0); trees=veg?treeList():[]; ti=0; }
      return false;
    }
    /* the trees, in batches */
    if(!veg||!trees.length){ done=true; return true; }
    const pxPerFine=outW/src.w, pxPerM=pxPerFine/veg.cf;
    const end=Math.min(trees.length,ti+n*60);
    for(;ti<end;ti++){ const t=trees[ti], r=Math.max(0.7,t.r*pxPerM);
      ctx.fillStyle='rgba(30,22,14,0.32)'; ctx.beginPath(); ctx.arc(t.x+0.7*r,t.y+0.7*r,r*1.05,0,6.283); ctx.fill();          // its shadow, down-sun (south-east)
      ctx.fillStyle=t.col; ctx.beginPath(); ctx.arc(t.x,t.y,r,0,6.283); ctx.fill();
      if(r>1.6){ ctx.fillStyle='rgba(255,255,230,0.10)'; ctx.beginPath(); ctx.arc(t.x-0.3*r,t.y-0.3*r,0.55*r,0,6.283); ctx.fill(); } }
    if(ti>=trees.length) done=true;
    return done;
  }
  /* pinyon-juniper and cottonwood crowns at the vegetation field's density */
  function treeList(){
    const out=[], st=veg.step, cellM2=(st*veg.cf)*(st*veg.cf); let seed=(w.seed*2654435761)>>>0;
    const R=()=>{ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; };
    const gx0=Math.max(0,Math.floor(src.x0/st)), gx1=Math.min(veg.gw-1,Math.ceil((src.x0+src.w)/st)), gy0=Math.max(0,Math.floor(src.y0/st)), gy1=Math.min(veg.gh-1,Math.ceil((src.y0+src.h)/st));
    for(let gy=gy0;gy<=gy1;gy++) for(let gx=gx0;gx<=gx1;gx++){ const k=gy*veg.gw+gx;
      for(const [lam,kind] of [[veg.tree[k]*cellM2,'pj'],[veg.cw[k]*cellM2,'cw']]){ let n=Math.floor(lam); if(R()<lam-n) n++;
        for(let q=0;q<n;q++){ const xf=(gx+R())*st, yf=(gy+R())*st;
          const x=(xf-src.x0)/src.w*outW, y=(yf-src.y0)/src.h*outH; if(x<-4||y<-4||x>outW+4||y>outH+4) continue;
          const v=0.85+0.3*R(), c=kind==='cw'?[78,104,48]:R()<0.45?[46,62,40]:[62,74,52];
          out.push({x,y,r:kind==='cw'?3.5+2.5*R():1.1+1.4*R(),col:'rgb('+(c[0]*v|0)+','+(c[1]*v|0)+','+(c[2]*v|0)+')'}); } } }
    return out;
  }
  return {canvas:cv, paintRows, get done(){ return done; }, src, outW, outH};
}
global.StrataView={create, orbitCamera, drawMap, mapPainter, naturalPainter, naturalColors, makeFine, refreshFine, U, FOV};
}
StrataViewFactory(typeof window!=='undefined'?window:globalThis);

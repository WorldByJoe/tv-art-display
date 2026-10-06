/* ---------------------------------------------------------------------------
   studio_rec.js · v0.2 · 2026-10-06
   The recorder inside the Murmuration studio. render.html?rec&studio loads it
   in place of its own animation loop; the studio page (index.html) holds it
   in an iframe and talks to it by postMessage.

   1. Says 'ready'; waits for 'start' from the studio, which carries the
      output folder the user picked (Chrome/Edge) or none (other browsers:
      the video is built in memory and handed back as a download).
   2. Runs the warm-up in quarter-second slices, reporting progress: the
      flock forms before the clip starts, as it does on the wall.
   3. For every frame: steps the flock exactly 1/fps, sets the evening's
      light, eases the camera, draws, and hands the canvas to the browser's
      H.264 encoder (WebCodecs); mp4-muxer assembles the file. In a folder
      the MP4 is streamed to disk as it fills, so a 1 GB file never sits in
      memory; beside it go a settings file (.json) and, if asked, stills.
   It reads the page's own state by name (flock, renderer, scene, camera,
   eve, setLight, placeBirds, panCamera, MURM, START_T, DT).

   CHANGED
     v0.2  yields by MessageChannel, not setTimeout, so a hidden tab keeps rendering
     v0.1  first build, from murmuration_rec.js v1.1
--------------------------------------------------------------------------- */
(async function () {
  'use strict';
  const P = new URLSearchParams(location.search);
  const SEC = +(P.get('sec') || 60), FPS = +(P.get('fps') || 30);
  const BITRATE = +(P.get('mbps') || 40) * 1e6, STILLS = +(P.get('stills') || 0);
  const NAME = P.get('out') || 'murmuration.mp4', STEM = NAME.replace(/\.mp4$/, '');
  const SELFTEST = P.has('selftest');                 // testing only: stream to the local rec_server instead of a folder
  const post = (m) => parent.postMessage(m, location.origin);
  /* A yield that hidden tabs do not throttle: browsers stretch setTimeout to
     1 s (later 1 min) in a background tab, which stalled a render to a crawl;
     a MessageChannel message is delivered at full speed. */
  const chan = new MessageChannel(); let wake = null;
  chan.port1.onmessage = () => { const w = wake; wake = null; if (w) w(); };
  const tick = () => new Promise((r) => { wake = r; chan.port2.postMessage(0); });

  const go = await new Promise((res) => {
    addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.type === 'start') res(e.data); });
    post({ type: 'ready' });
  });

  let sink = null;
  try {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.js';
      s.onload = res; s.onerror = () => rej(new Error('could not load mp4-muxer (needs an internet connection)'));
      document.head.appendChild(s);
    });

    /* warm-up */
    const W0 = window.WARM_STEPS || 0, tw = performance.now();
    for (let k = 0; k < W0;) {
      const s0 = performance.now();
      while (k < W0 && performance.now() - s0 < 250) { flock.update(DT); k++; }
      post({ type: 'warm', done: k, total: W0, el: (performance.now() - tw) / 1000 });
      await tick();
    }

    /* where the file goes */
    const W = canvas.width, H = canvas.height;
    let target, mem = null, written = 0, writes = Promise.resolve();
    const onData = (write) => (data, position) => { const c = data.slice(); written += c.byteLength; writes = writes.then(() => write(c, position)); };
    if (go.dir) {
      const fh = await go.dir.getFileHandle(NAME, { create: true });
      sink = await fh.createWritable();
      target = new Mp4Muxer.StreamTarget({ chunked: true, chunkSize: 16 * 1024 * 1024, onData: onData((c, p) => sink.write({ type: 'write', position: p, data: c })) });
    } else if (SELFTEST) {
      await fetch('/save?name=' + encodeURIComponent(NAME), { method: 'POST', body: new Uint8Array(0) });
      target = new Mp4Muxer.StreamTarget({ chunked: true, chunkSize: 16 * 1024 * 1024,
        onData: onData((c, p) => fetch('/save?name=' + encodeURIComponent(NAME) + '&pos=' + p, { method: 'POST', body: c })) });
    } else { mem = new Mp4Muxer.ArrayBufferTarget(); target = mem; }

    /* the best H.264 profile this browser will encode at this size */
    let codec = null;
    for (const c of ['avc1.640033', 'avc1.4d0033', 'avc1.42e033']) {
      try { const r = await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate: BITRATE, framerate: FPS }); if (r.supported) { codec = c; break; } } catch (e) { /* next */ }
    }
    if (!codec) throw new Error('this browser cannot encode H.264 video at ' + W + ' x ' + H);
    const muxer = new Mp4Muxer.Muxer({ target, video: { codec: 'avc', width: W, height: H, frameRate: FPS }, fastStart: mem ? 'in-memory' : false });
    let encErr = null;
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encErr = e; } });
    enc.configure({ codec, width: W, height: H, bitrate: BITRATE, framerate: FPS, hardwareAcceleration: 'prefer-hardware', avc: { format: 'avc' } });

    /* the frames */
    const total = Math.round(SEC * FPS), began = performance.now();
    let acc = 0, simMs = 0;
    for (let i = 0; i < total; i++) {
      if (encErr) throw encErr;
      const a0 = performance.now();
      if (i > 0) { acc += 1 / FPS; while (acc >= DT - 1e-9) { flock.update(DT); acc -= DT; } }
      simMs += performance.now() - a0;
      const runT = START_T + i / FPS;
      setLight(1 - (1 - eve.fadeTo) * Math.min(1, runT / CONFIG.runSec));
      if (typeof panCamera === 'function') panCamera(1 / FPS);
      sky.position.copy(camera.position);
      placeBirds(acc / DT);
      renderer.render(scene, camera);
      const vf = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame: i % (2 * FPS) === 0 });
      vf.close();
      if (go.dir && STILLS > 0 && i % Math.round(STILLS * FPS) === 0) {
        const b = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
        const sh = await go.dir.getFileHandle(STEM + '_' + String(Math.round(i / FPS)).padStart(3, '0') + 's.jpg', { create: true });
        const sw = await sh.createWritable(); await sw.write(b); await sw.close();
      }
      if (i % FPS === 0) {
        let perched = 0; for (let k = 0; k < flock.N; k += 50) perched += flock.landed[k];
        post({ type: 'progress', i, total, el: (performance.now() - began) / 1000, simMs: simMs / (i + 1), perched: perched / Math.ceil(flock.N / 50), phase: flock.phase, bytes: written });
      }
      while (enc.encodeQueueSize > 4) await tick();
      await tick();
    }
    await enc.flush();
    muxer.finalize();
    await writes;
    if (sink) { await sink.close(); sink = null; }

    /* the settings file: everything needed to make this video again */
    const P0 = {}; for (const k in flock.P) { const v = flock.P[k]; if (typeof v === 'number') P0[k] = +v.toPrecision(6); else if (v && typeof v === 'object') P0[k] = v; }
    const meta = {
      app: 'Murmuration studio v0.1', made: new Date().toISOString(), file: NAME,
      settings: go.settings || null, url: location.search,
      flock: { birds: flock.N, seed: MURM.seed, drawnParameters: P0 },
      video: { width: W, height: H, fps: FPS, seconds: SEC, codec, bitrateMbps: BITRATE / 1e6, bytes: written || (mem && mem.buffer.byteLength) },
      renderMinutes: +((performance.now() - began) / 60000).toFixed(1), browser: navigator.userAgent,
    };
    const json = JSON.stringify(meta, null, 2);
    if (go.dir) { const jh = await go.dir.getFileHandle(STEM + '.json', { create: true }); const jw = await jh.createWritable(); await jw.write(json); await jw.close(); }
    post({ type: 'done', meta, mp4: mem ? new Blob([mem.buffer], { type: 'video/mp4' }) : null, json: go.dir ? null : json });
  } catch (e) {
    try { if (sink) await sink.abort(); } catch (e2) { /* nothing more to do */ }
    post({ type: 'fail', msg: String((e && e.message) || e) });
  }
})();

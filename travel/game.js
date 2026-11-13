// ============================================================
// FORM IRI-T4 — VISITOR JOURNEY SIMULATION
// travel/game.js
//
// Choose a traveller and a country of departure; the traveller
// receives their national provisions, walks (and rows) across a
// pixel world map to Portugal, and Portugal explodes. The
// assessment is then issued. Sound is synthesized with WebAudio.
// ============================================================

(function () {
  'use strict';

  const MAP = window.IRI_MAP;
  const SPR = window.IRI_SPRITES;
  const VW = 320, VH = 180;
  const LISBON = { lon: -9.14, lat: 38.72 };

  const COUNTRIES = [
    { id: 'us', name: 'United States',  lon: -98,   lat: 39,   items: [['burger', 'Cheeseburger'], ['hotdog', 'Hot dog']] },
    { id: 'ca', name: 'Canada',         lon: -101,  lat: 54,   items: [['syrup', 'Maple syrup'], ['hockey', 'Hockey stick']] },
    { id: 'mx', name: 'Mexico',         lon: -102,  lat: 23.5, items: [['taco', 'Taco'], ['maracas', 'Maracas']] },
    { id: 'br', name: 'Brazil',         lon: -50,   lat: -11,  items: [['football', 'Football'], ['coconut', 'Coconut']] },
    { id: 'gb', name: 'United Kingdom', lon: -1.6,  lat: 52.6, items: [['teacup', 'Cup of tea'], ['bowler', 'Bowler hat']] },
    { id: 'fr', name: 'France',         lon: 2.3,   lat: 46.8, items: [['baguette', 'Baguette'], ['beret', 'Beret']] },
    { id: 'es', name: 'Spain',          lon: -3.7,  lat: 40.4, items: [['churro', 'Churros'], ['fan', 'Abanico']] },
    { id: 'de', name: 'Germany',        lon: 10.4,  lat: 51,   items: [['pretzel', 'Pretzel'], ['stein', 'Beer stein']] },
    { id: 'it', name: 'Italy',          lon: 12.6,  lat: 42.8, items: [['pizza', 'Pizza'], ['gelato', 'Gelato']] },
    { id: 'nl', name: 'Netherlands',    lon: 5.4,   lat: 52.2, items: [['clogs', 'Clogs'], ['tulip', 'Tulip']] },
    { id: 'jp', name: 'Japan',          lon: 138.6, lat: 36.3, items: [['sushi', 'Sushi'], ['onigiri', 'Onigiri']] },
    { id: 'au', name: 'Australia',      lon: 134,   lat: -25,  items: [['surfboard', 'Surfboard'], ['pie', 'Meat pie']] },
  ];
  const HATS = { beret: true, bowler: true };

  // ------------------------------------------------------------
  // ASSETS
  // ------------------------------------------------------------
  const mapImg = new Image();
  mapImg.src = 'worldmap.webp';
  const sheet = new Image();
  sheet.src = 'sprites.png';

  const land = new Uint8Array(MAP.W * MAP.H);
  for (const [y, x0, x1] of MAP.land) for (let x = x0; x <= x1; x++) land[y * MAP.W + x] = 1;
  const ptCells = [];
  for (const [y, x0, x1] of MAP.portugal) for (let x = x0; x <= x1; x++) ptCells.push([x, y]);

  const toPx = (lon, lat) => [(lon - MAP.lon0) * MAP.ppd, (MAP.lat0 - lat) * MAP.ppd];
  const isLand = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= MAP.W || y >= MAP.H) return false;
    return land[y * MAP.W + x] === 1;
  };
  function km(a, b) {
    const R = 6371, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function drawFrame(ctx, name, x, y, opts) {
    const f = SPR.frames[name];
    if (!f) return;
    const [sx, sy, w, h] = f;
    const hh = opts && opts.clip ? opts.clip : h;
    ctx.save();
    if (opts && opts.flip) {
      ctx.translate(Math.round(x) + w, Math.round(y));
      ctx.scale(-1, 1);
      ctx.drawImage(sheet, sx, sy, w, hh, 0, 0, w, hh);
    } else {
      ctx.drawImage(sheet, sx, sy, w, hh, Math.round(x), Math.round(y), w, hh);
    }
    ctx.restore();
  }
  function drawItem(ctx, name, x, y) {
    const f = SPR.items[name];
    if (!f) return;
    ctx.drawImage(sheet, f[0], f[1], f[2], f[3], Math.round(x), Math.round(y), f[2], f[3]);
  }

  // ------------------------------------------------------------
  // SOUND
  // ------------------------------------------------------------
  const Sound = (function () {
    let ac = null, master = null, noise = null, crackle = null, roar = null;
    let muted = false;
    try { muted = localStorage.getItem('iri-t4-muted') === '1'; } catch (e) {}
    function init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
      noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    function tone(type, f0, f1, dur, gain, delay) {
      if (!ac) return;
      const t = ac.currentTime + (delay || 0);
      const o = ac.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
    }
    function burst(dur, type, freq, gain, sweep, delay) {
      if (!ac) return;
      const t = ac.currentTime + (delay || 0);
      const s = ac.createBufferSource(); s.buffer = noise;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t);
      if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
      const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    }
    return {
      init,
      step() { burst(0.05, 'bandpass', 900 + Math.random() * 300, 0.12); },
      paddle() { burst(0.22, 'lowpass', 1400, 0.16, 300); },
      get() { [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.16, 0.06, i * 0.09)); },
      chime() { tone('sine', 880, 880, 0.6, 0.15); tone('sine', 660, 660, 0.9, 0.15, 0.35); },
      boom() {
        burst(2.4, 'lowpass', 900, 0.9, 60);
        tone('sine', 120, 28, 1.8, 0.7);
        tone('square', 70, 30, 0.6, 0.12, 0.05);
      },
      fire(on) {
        if (!ac) return;
        if (on && !crackle) {
          crackle = setInterval(() => burst(0.03 + Math.random() * 0.05, 'highpass', 2000 + Math.random() * 3000, 0.08 + Math.random() * 0.1), 70);
          const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
          const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
          const g = ac.createGain(); g.gain.value = 0.12;
          s.connect(f); f.connect(g); g.connect(master); s.start();
          roar = { s, g };
        } else if (!on && crackle) {
          clearInterval(crackle);
          try { roar.g.gain.setTargetAtTime(0, ac.currentTime, 0.4); roar.s.stop(ac.currentTime + 2); } catch (e) {}
          roar = null;
          crackle = null;
        }
      },
      toggle() {
        muted = !muted;
        try { localStorage.setItem('iri-t4-muted', muted ? '1' : '0'); } catch (e) {}
        if (master) master.gain.setTargetAtTime(muted ? 0 : 0.5, ac.currentTime, 0.05);
        return muted;
      },
      muted() { return muted; },
    };
  })();

  // ------------------------------------------------------------
  // FORM
  // ------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  let kind = null, country = null;

  function previewAvatars(t) {
    document.querySelectorAll('.avatar-card').forEach((card) => {
      const c = card.querySelector('canvas').getContext('2d');
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, 16, 24);
      const k = card.dataset.kind;
      const walking = card.classList.contains('selected');
      const name = walking ? k + '_side' + [1, 0, 2, 0][Math.floor(t / 160) % 4] : k + '_front';
      drawFrame(c, name, 0, 0);
    });
  }

  document.querySelectorAll('.avatar-card').forEach((card) => {
    card.addEventListener('click', () => {
      Sound.init();
      kind = card.dataset.kind;
      document.querySelectorAll('.avatar-card').forEach((c) => c.classList.toggle('selected', c === card));
      $('sec-b').classList.remove('locked');
      updateStart();
    });
  });

  const cBox = $('countries');
  COUNTRIES.forEach((co) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'country';
    b.innerHTML = '<canvas width="20" height="10"></canvas><span class="nm"></span>';
    b.querySelector('.nm').textContent = co.name;
    b.addEventListener('click', () => {
      Sound.init();
      country = co;
      cBox.querySelectorAll('.country').forEach((x) => x.classList.toggle('selected', x === b));
      $('provisions').innerHTML = 'Provisions issued: ' + co.items.map((i) => '<b>1 × ' + i[1] + '</b>').join(', ') + '.';
      $('sec-c').classList.remove('locked');
      updateStart();
    });
    co.btn = b;
    cBox.appendChild(b);
  });
  function drawCountryIcons() {
    COUNTRIES.forEach((co) => {
      const c = co.btn.querySelector('canvas').getContext('2d');
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, 20, 10);
      drawItem(c, co.items[0][0], 0, 0);
      drawItem(c, co.items[1][0], 10, 0);
    });
  }
  function updateStart() {
    $('start-btn').disabled = !(kind && country) || sim.running;
  }

  // ------------------------------------------------------------
  // SIMULATION
  // ------------------------------------------------------------
  const canvas = $('sim');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const sim = { running: false };

  function startSim() {
    Sound.init();
    const [sx, sy] = toPx(country.lon, country.lat);
    const [ex, ey] = toPx(LISBON.lon, LISBON.lat);
    Object.assign(sim, {
      running: true, phase: 'receive', boomT: 0, fly: null, t0: performance.now(), phaseT: performance.now(),
      x: sx, y: sy, sx, sy, ex, ey, dir: ex >= sx ? 1 : -1,
      camX: sx - VW / 2, camY: sy - VH / 2,
      totalKm: Math.round(km(country, LISBON)),
      particles: [], smoke: [], stepFrame: 0, lastStep: 0, shake: 0, flash: 0, speed: 1,
      gotIdx: 0, lastPaddle: 0,
    });
    $('skip-btn').textContent = 'EXPEDITE';
    $('start-row').hidden = true;
    $('viewport').hidden = false;
    $('verdict').hidden = true;
    $('viewport').scrollIntoView({ behavior: 'smooth', block: 'center' });
    Sound.get();
    updateStart();
  }

  function setPhase(p) { sim.phase = p; sim.phaseT = performance.now(); }

  function update(now, dt) {
    const el = now - sim.phaseT;
    if (sim.phase === 'receive') {
      if (el > 1300 && sim.gotIdx === 0) { sim.gotIdx = 1; Sound.get(); }
      if (el > 2600) setPhase('route');
    } else if (sim.phase === 'route') {
      if (el > 900) setPhase('walk');
    } else if (sim.phase === 'walk') {
      const dx = sim.ex - sim.x, dy = sim.ey - sim.y;
      const d = Math.hypot(dx, dy);
      const v = 90 * sim.speed * dt;
      if (d <= v) {
        sim.x = sim.ex; sim.y = sim.ey;
        setPhase('arrive');
      } else {
        sim.x += dx / d * v; sim.y += dy / d * v;
        sim.dir = dx >= 0 ? 1 : -1;
        if (now - sim.lastStep > 150 / sim.speed) {
          sim.lastStep = now;
          sim.stepFrame = (sim.stepFrame + 1) % 4;
          if (isLand(sim.x, sim.y)) Sound.step();
          else if (now - sim.lastPaddle > 600) { sim.lastPaddle = now; Sound.paddle(); }
        }
      }
    } else if (sim.phase === 'arrive') {
      if (el > 1500) { setPhase('boom'); explode(); }
    } else if (sim.phase === 'boom') {
      if (el > 4200) { setPhase('done'); finish(); }
    }

    if (sim.fly && !sim.fly.landed) {
      const f = sim.fly;
      f.vy += f.g * dt; sim.x += f.vx * dt; sim.y += f.vy * dt; f.spin += dt * 14;
      if (f.vy > 0 && sim.y >= f.y0) {
        sim.y = f.y0; f.landed = true; f.landT = now;
        Sound.paddle(); Sound.paddle();
        for (let i = 0; i < 24; i++) sim.particles.push({ x: sim.x, y: sim.y - 2, vx: (Math.random() - 0.5) * 50, vy: -30 - Math.random() * 50, g: 160, life: 0.6, max: 0.6, splash: true });
      }
    }

    // camera follows the traveller
    let tx = sim.x - VW / 2, ty = sim.y - VH / 2 - 10;
    if (sim.phase === 'boom' || sim.phase === 'done') { tx = (sim.x + sim.ex) / 2 - VW / 2; ty = sim.ey - VH / 2 - 14; }
    const k = sim.phase === 'walk' ? 0.12 : 0.08;
    sim.camX += (tx - sim.camX) * k;
    sim.camY += (ty - sim.camY) * k;
    sim.camX = Math.max(0, Math.min(MAP.W - VW, sim.camX));
    sim.camY = Math.max(0, Math.min(MAP.H - VH, sim.camY));

    // particles
    for (let i = sim.particles.length - 1; i >= 0; i--) {
      const p = sim.particles[i];
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.life <= 0) sim.particles.splice(i, 1);
    }
    if (sim.phase === 'boom' || sim.phase === 'done') {
      for (let n = 0; n < 12; n++) {
        const [cx, cy] = ptCells[Math.floor(Math.random() * ptCells.length)];
        sim.particles.push({ x: cx + Math.random() * 2 - 1, y: cy, vx: (Math.random() - 0.5) * 14, vy: -30 - Math.random() * 70, g: -20, life: 0.5 + Math.random() * 0.9, max: 1.4, size: 2 + (Math.random() < 0.4 ? 1 : 0) });
      }
      if (now - sim.boomT > 600 && Math.random() < 0.22) {
        const [px0, py0] = toPx(-8.1, 39.6);
        sim.smoke.push({ x: px0 + Math.random() * 10 - 5, y: py0 - 10, life: 3, r: 2, big: true });
      }
      if (Math.random() < 0.15) sim.smoke.push({ x: sim.x + (Math.random() * 6 - 3), y: sim.y - (sim.fly && sim.fly.landed ? 14 : 24), life: 1.6, r: 1 });
    }
    for (let i = sim.smoke.length - 1; i >= 0; i--) {
      const s = sim.smoke[i];
      s.y -= (s.big ? 26 : 12) * dt; s.x += (Math.sin(now / 300 + i) * 4 + (s.big ? 6 : 0)) * dt; s.r += (s.big ? 3.5 : 2) * dt; s.life -= dt;
      if (s.life <= 0) sim.smoke.splice(i, 1);
    }
    sim.shake = Math.max(0, sim.shake - dt * 1.4);
    sim.flash = Math.max(0, sim.flash - dt * 3);
  }

  function explode() {
    sim.boomT = performance.now();
    Sound.boom();
    Sound.fire(true);
    sim.shake = 1.6;
    sim.flash = 1;
    sim.fly = { vx: -46, vy: -150, g: 230, spin: 0, landed: false, y0: sim.y + 6 };
    const [cx, cy] = toPx(-8.2, 39.6);
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 120;
      sim.particles.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, g: 90, life: 0.6 + Math.random() * 1.4, max: 2, fire: true });
    }
  }

  function finish() {
    sim.running = false;
    Sound.chime();
    const items = country.items.map((i) => '1 × ' + i[1] + ' (carbonised)').join(', ');
    $('v-ref').textContent = 'IRI-T4-' + country.id.toUpperCase() + '-' + String(Math.floor(Math.random() * 900000) + 100000);
    $('v-trav').textContent = kind === 'm' ? 'Traveller, Type M (REP-0451-M)' : 'Traveller, Type F (REP-0451-F)';
    $('v-dep').textContent = country.name;
    $('v-dist').textContent = sim.totalKm.toLocaleString() + ' km, of which 0 km were survivable';
    $('v-prov').textContent = items;
    $('verdict').hidden = false;
    updateStart();
  }

  const FIRE = ['#fff3b0', '#ffd23f', '#ff9f1c', '#f25c19', '#c8211b', '#7a1010'];

  function render(now) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2f64a0';
    ctx.fillRect(0, 0, VW, VH);
    if (!sim.phase) return;
    const shx = sim.shake ? Math.round((Math.random() - 0.5) * 8 * sim.shake) : 0;
    const shy = sim.shake ? Math.round((Math.random() - 0.5) * 8 * sim.shake) : 0;
    const cx = Math.round(sim.camX) - shx, cy = Math.round(sim.camY) - shy;
    if (mapImg.complete) ctx.drawImage(mapImg, -cx, -cy);

    // water sparkles
    for (let i = 0; i < 26; i++) {
      const wx = ((i * 97 + Math.floor(now / 900) * 31) % VW), wy = ((i * 53 + Math.floor(now / 900) * 17) % VH);
      if (!isLand(wx + cx, wy + cy) && Math.floor(now / 300 + i) % 3 === 0) {
        ctx.fillStyle = 'rgba(220,240,255,0.7)';
        ctx.fillRect(wx, wy, 2, 1);
      }
    }

    // route
    if (sim.phase !== 'receive') {
      const total = Math.hypot(sim.ex - sim.sx, sim.ey - sim.sy) || 1;
      const shown = sim.phase === 'route' ? Math.min(1, (now - sim.phaseT) / 800) : 1;
      ctx.fillStyle = '#ffe680';
      for (let s = 0; s < total * shown; s += 6) {
        const px = sim.sx + (sim.ex - sim.sx) * s / total, py = sim.sy + (sim.ey - sim.sy) * s / total;
        const walked = Math.hypot(px - sim.sx, py - sim.sy) < Math.hypot(sim.x - sim.sx, sim.y - sim.sy);
        if (walked) continue;
        ctx.fillRect(Math.round(px - cx), Math.round(py - cy), 2, 2);
      }
      // destination flag
      const fx = Math.round(sim.ex - cx), fy = Math.round(sim.ey - cy);
      if (sim.phase !== 'boom' && sim.phase !== 'done') {
        ctx.fillStyle = '#5a3a22'; ctx.fillRect(fx + 6, fy - 16, 1, 16);
        ctx.fillStyle = '#c8211b'; ctx.fillRect(fx + 7, fy - 16, 6, 4);
        ctx.fillStyle = '#1d7a3a'; ctx.fillRect(fx + 7, fy - 16, 2, 4);
      }
    }

    // Portugal burns
    if (sim.phase === 'boom' || sim.phase === 'done') {
      for (const [x, y] of ptCells) {
        if (Math.random() < 0.85) {
          ctx.fillStyle = FIRE[Math.floor(Math.random() * 4)];
          ctx.fillRect(x - cx, y - cy, 1, 1);
        }
      }
    }

    // traveller
    const ax = Math.round(sim.x - cx), ay = Math.round(sim.y - cy);
    const onWater = !isLand(sim.x, sim.y) && sim.phase === 'walk';
    const charred = sim.phase === 'boom' || sim.phase === 'done';
    if (charred) ctx.filter = 'brightness(0.25) saturate(0)';
    if (sim.phase === 'walk') {
      const fr = [1, 0, 2, 0][sim.stepFrame];
      if (onWater) {
        const bob = Math.floor(now / 250) % 2;
        drawFrame(ctx, kind + '_side0', ax - 8, ay - 23 + bob, { flip: sim.dir < 0, clip: 17 });
        // rowboat
        ctx.fillStyle = '#6b4226'; ctx.fillRect(ax - 11, ay - 6 + bob, 22, 4);
        ctx.fillStyle = '#8a5a34'; ctx.fillRect(ax - 9, ay - 2 + bob, 18, 2);
        ctx.fillStyle = '#3d2614'; ctx.fillRect(ax - 11, ay - 6 + bob, 22, 1);
        const oar = Math.floor(now / 200) % 2;
        ctx.fillStyle = '#c9a26b'; ctx.fillRect(ax - sim.dir * 2, ay - 9 + bob, 1, 7); ctx.fillRect(ax - sim.dir * (4 + oar * 3), ay - 2 + bob, 3, 2);
      } else {
        drawFrame(ctx, kind + '_side' + fr, ax - 8, ay - 23, { flip: sim.dir < 0 });
      }
    } else if (sim.fly && !sim.fly.landed) {
      ctx.save();
      ctx.translate(ax, ay - 12);
      ctx.rotate(sim.fly.spin);
      drawFrame(ctx, kind + '_front', -8, -12);
      ctx.restore();
    } else if (sim.fly && sim.fly.landed) {
      const bob = Math.floor(now / 400) % 2;
      drawFrame(ctx, kind + '_front', ax - 8, ay - 16 + bob, { clip: 13 });
      ctx.filter = 'none';
      ctx.fillStyle = 'rgba(220,240,255,0.85)';
      ctx.fillRect(ax - 9, ay - 3 + bob, 18, 1);
      if (charred) ctx.filter = 'brightness(0.25) saturate(0)';
    } else {
      drawFrame(ctx, kind + '_front', ax - 8, ay - 23);
    }
    // hats are worn; in the receive phase the newest item is held aloft
    const hat = country.items.find((i) => HATS[i[0]]);
    if (hat && !sim.fly) {
      const hx = ax - 5 + (sim.phase === 'walk' ? sim.dir : 0);
      const hy = ay - 28 + (sim.phase === 'walk' && onWater ? Math.floor(now / 250) % 2 : 0);
      drawItem(ctx, hat[0], hx, hy);
    } else if (hat && sim.fly && sim.fly.landed) {
      drawItem(ctx, hat[0], ax - 4, ay - 21 + (Math.floor(now / 400) % 2));
    }
    ctx.filter = 'none';
    if (sim.phase === 'receive') {
      const it = country.items[sim.gotIdx];
      const lift = Math.min(1, (now - sim.phaseT - sim.gotIdx * 1300) / 250);
      drawItem(ctx, it[0], ax - 5, ay - 38 - Math.round(lift * 3));
      const txt = 'Received: ' + it[1] + '!';
      drawLabel(txt, ax, ay - 50);
    }
    if (sim.phase === 'arrive') drawLabel('Arrived: Portugal.', ax, ay - 34);

    if (sim.boomT && (sim.phase === 'boom' || sim.phase === 'done')) {
      const [bx0, by0] = toPx(-8.1, 39.6);
      const bx = bx0 - cx, by = by0 - cy;
      const bt = now - sim.boomT;
      const pulse = 0.75 + 0.25 * Math.sin(now / 90) * Math.sin(now / 37);
      const glow = ctx.createRadialGradient(bx, by, 2, bx, by, 90);
      glow.addColorStop(0, 'rgba(255,170,60,' + (0.55 * pulse) + ')');
      glow.addColorStop(0.5, 'rgba(255,90,20,' + (0.22 * pulse) + ')');
      glow.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, VW, VH);
      // shockwave
      const st = bt / 900;
      if (st < 1) {
        ctx.strokeStyle = 'rgba(255,244,214,' + (1 - st) + ')';
        ctx.lineWidth = Math.max(1, 5 * (1 - st));
        ctx.beginPath(); ctx.arc(bx, by, 8 + 150 * st, 0, Math.PI * 2); ctx.stroke();
      }
      // fireball
      const ft = bt / 1600;
      if (ft < 1) {
        const r = 6 + 30 * Math.sin(Math.PI * Math.min(1, ft * 1.4));
        for (let n = 0; n < r * r * 1.6; n++) {
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
          const k = d / r;
          ctx.fillStyle = FIRE[Math.min(5, Math.floor(k * 4 + Math.random() * 2))];
          ctx.fillRect(Math.round(bx + Math.cos(a) * d), Math.round(by + Math.sin(a) * d * 0.85), 2, 2);
        }
      }
    }

    // particles and smoke
    for (const p of sim.particles) {
      const k = Math.max(0, Math.min(1, p.life / p.max));
      ctx.fillStyle = p.splash ? 'rgba(220,240,255,0.9)' : FIRE[Math.min(5, Math.floor((1 - k) * 6))];
      const sz = p.size ? (k > 0.5 ? p.size : p.size - 1) : (p.life > 0.8 ? 2 : 1);
      ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy), sz, sz);
    }
    for (const s of sim.smoke) {
      ctx.fillStyle = s.big ? 'rgba(46,42,40,' + Math.min(0.32, s.life / 6) + ')' : 'rgba(70,70,70,' + Math.min(0.6, s.life / 2) + ')';
      const r = Math.round(s.r);
      ctx.fillRect(Math.round(s.x - cx) - r, Math.round(s.y - cy) - r, r * 2 + 1, r * 2 + 1);
    }
    if (sim.flash > 0) {
      ctx.fillStyle = 'rgba(255,240,200,' + sim.flash + ')';
      ctx.fillRect(0, 0, VW, VH);
    }

    drawHud(now);
  }

  function drawLabel(text, x, y) {
    ctx.font = '8px monospace';
    const w = Math.ceil(ctx.measureText(text).width) + 8;
    const lx = Math.max(2, Math.min(VW - w - 2, Math.round(x - w / 2))), ly = Math.max(2, Math.round(y));
    ctx.fillStyle = '#f7e9c4'; ctx.fillRect(lx, ly, w, 12);
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(lx, ly, w, 1); ctx.fillRect(lx, ly + 11, w, 1); ctx.fillRect(lx, ly, 1, 12); ctx.fillRect(lx + w - 1, ly, 1, 12);
    ctx.fillStyle = '#3d2614'; ctx.fillText(text, lx + 4, ly + 9);
  }

  function drawHud(now) {
    // Stardew-style panel, top-left
    const total = Math.hypot(sim.ex - sim.sx, sim.ey - sim.sy) || 1;
    const left = Math.hypot(sim.ex - sim.x, sim.ey - sim.y) / total;
    const remain = Math.round(sim.totalKm * left);
    const lines = [
      'DEPARTED: ' + country.name.toUpperCase(),
      sim.phase === 'boom' || sim.phase === 'done' ? 'DESTINATION: UNAVAILABLE' : 'TO LISBON: ' + remain.toLocaleString() + ' KM',
    ];
    ctx.font = '8px monospace';
    const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + 10;
    ctx.fillStyle = '#f7e9c4'; ctx.fillRect(4, 4, w, 26);
    ctx.fillStyle = '#7a4a24'; ctx.fillRect(4, 4, w, 2); ctx.fillRect(4, 28, w, 2); ctx.fillRect(4, 4, 2, 26); ctx.fillRect(4 + w - 2, 4, 2, 26);
    ctx.fillStyle = '#3d2614';
    lines.forEach((l, i) => ctx.fillText(l, 9, 15 + i * 10));

    // toolbar of provisions, bottom centre
    const slots = country.items.length, sw = 14;
    const bx = Math.round(VW / 2 - (slots * sw + 4) / 2), by = VH - 20;
    ctx.fillStyle = '#7a4a24'; ctx.fillRect(bx, by, slots * sw + 4, sw + 4);
    for (let i = 0; i < slots; i++) {
      ctx.fillStyle = '#f7e9c4'; ctx.fillRect(bx + 2 + i * sw, by + 2, sw - 1, sw);
      const it = country.items[i];
      const have = it && (sim.phase !== 'receive' || i < sim.gotIdx || (i === sim.gotIdx && now - sim.phaseT > i * 1300 + 400));
      if (have) {
        if (sim.phase === 'boom' || sim.phase === 'done') ctx.filter = 'brightness(0.2) saturate(0)';
        drawItem(ctx, it[0], bx + 4 + i * sw, by + 4);
        ctx.filter = 'none';
      }
    }
  }

  // ------------------------------------------------------------
  // LOOP
  // ------------------------------------------------------------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    previewAvatars(now);
    if (sim.phase) {
      if (sim.running || sim.phase === 'done') update(now, dt);
      render(now);
      const st = { receive: 'ISSUING PROVISIONS', route: 'PLOTTING ROUTE', walk: 'JOURNEY IN PROGRESS', arrive: 'ARRIVED. ASSESSING.', boom: 'ASSESSMENT IN PROGRESS', done: 'ASSESSMENT COMPLETE' }[sim.phase];
      $('sim-status').textContent = 'SIMULATION: ' + st;
    }
    requestAnimationFrame(loop);
  }

  // ------------------------------------------------------------
  // BUTTONS
  // ------------------------------------------------------------
  $('start-btn').addEventListener('click', startSim);
  $('rerun-btn').addEventListener('click', () => { Sound.fire(false); startSim(); });
  $('change-btn').addEventListener('click', () => {
    Sound.fire(false);
    sim.phase = null; sim.running = false;
    $('viewport').hidden = true; $('verdict').hidden = true; $('start-row').hidden = false;
    updateStart();
    $('sec-b').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('skip-btn').addEventListener('click', () => { if (sim.running) sim.speed = sim.speed === 1 ? 4 : 1; $('skip-btn').textContent = sim.speed === 1 ? 'EXPEDITE' : 'NORMAL PACE'; });
  $('sound-btn').addEventListener('click', () => { Sound.init(); const m = Sound.toggle(); $('sound-btn').textContent = 'SOUND: ' + (m ? 'OFF' : 'ON'); });
  $('sound-btn').textContent = 'SOUND: ' + (Sound.muted() ? 'OFF' : 'ON');

  sheet.onload = drawCountryIcons;
  if (sheet.complete) drawCountryIcons();
  updateStart();
  requestAnimationFrame(loop);
})();

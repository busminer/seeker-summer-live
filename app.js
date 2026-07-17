(() => {
  'use strict';

  const canvas = document.getElementById('worldCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = id => document.getElementById(id);
  const ui = {
    live: $('livePill'), claimed: $('claimedValue'), count: $('claimCountValue'),
    remaining: $('remainingValue'), percent: $('percentValue'), bar: $('progressBar'),
    feed: $('claimFeed'), arrival: $('arrivalCard'), arrivalName: $('arrivalName'),
    arrivalAmount: $('arrivalAmount'), error: $('errorToast'), motion: $('motionButton')
  };

  const state = {
    width: 0, height: 0, dpr: 1, running: true, connected: false,
    agents: [], particles: [], seen: new Set(), queue: [], initialized: false,
    lastSpawn: 0, wave: 0, birds: [], pointer: { x: -1, y: -1 }
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) state.running = false;

  const tier = amount => amount >= 10000 ? 'SUN LEGEND' : amount >= 3000 ? 'LEVEL 3' : amount >= 2000 ? 'LEVEL 2' : 'LEVEL 1';
  const shortWallet = wallet => wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : 'unknown';
  const displayName = claim => claim.domain || shortWallet(claim.claimer);
  const fmt = new Intl.NumberFormat('en-US');
  const compact = value => value >= 1e6 ? `${(value / 1e6).toFixed(value % 1e6 ? 2 : 0)}M` : fmt.format(value);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const hash = text => [...(text || '')].reduce((n, c) => ((n << 5) - n + c.charCodeAt(0)) | 0, 17);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(devicePixelRatio || 1, 1.6);
    state.width = rect.width;
    state.height = rect.height;
    canvas.width = Math.round(rect.width * state.dpr);
    canvas.height = Math.round(rect.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  class Runner {
    constructor(claim, delay = 0) {
      this.claim = claim;
      this.seed = Math.abs(hash(claim.signature));
      this.amount = claim.amount;
      this.scale = this.amount >= 10000 ? 1.4 : this.amount >= 3000 ? 1.1 : this.amount >= 2000 ? .96 : .82;
      this.hue = [168, 198, 330, 42][this.seed % 4];
      this.x = -80 - delay;
      this.yOff = (this.seed % 3 - 1) * 12;
      this.speed = (1.55 + (this.seed % 7) * .09) * (reducedMotion ? 0 : 1);
      this.phase = 'run';
      this.age = 0;
      this.bounds = null;
    }
    update(dt) {
      this.age += dt;
      const destination = state.width * .82;
      if (this.phase === 'run') {
        this.x += this.speed * dt * .065;
        if (this.x > destination) { this.phase = 'celebrate'; this.age = 0; burst(this.x, groundY(), this.hue, this.amount >= 10000 ? 34 : 18); announce(this.claim); }
      } else if (this.phase === 'celebrate' && this.age > 1450) {
        this.phase = 'exit';
      } else if (this.phase === 'exit') {
        this.x += this.speed * dt * .12;
      }
    }
    draw(time) {
      const g = groundY() + this.yOff;
      const walk = this.phase === 'run' || this.phase === 'exit';
      const step = walk ? Math.sin(time * .012 + this.seed) : 0;
      const bounce = walk ? Math.abs(Math.sin(time * .012 + this.seed)) * 5 : Math.sin(time * .008) * 2;
      const s = this.scale;
      ctx.save();
      ctx.translate(this.x, g - bounce);
      ctx.scale(s, s);
      if (this.phase === 'celebrate') ctx.rotate(Math.sin(time * .02) * .045);

      // shadow
      ctx.fillStyle = 'rgba(2,20,28,.22)';
      ctx.beginPath(); ctx.ellipse(0, 33 + bounce, 24, 6, 0, 0, Math.PI * 2); ctx.fill();

      // limbs
      ctx.strokeStyle = '#081b23'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-10, 25); ctx.lineTo(-13 + step * 8, 40); ctx.lineTo(-20 + step * 11, 46); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, 25); ctx.lineTo(13 - step * 8, 40); ctx.lineTo(20 - step * 11, 46); ctx.stroke();
      const armLift = this.phase === 'celebrate' ? -25 : step * 8;
      ctx.beginPath(); ctx.moveTo(-21, -2); ctx.lineTo(-31, 9 + armLift); ctx.lineTo(-38, 2 + armLift); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(21, -2); ctx.lineTo(31, 8 - armLift); ctx.lineTo(37, 2 - armLift); ctx.stroke();

      // phone body
      const grad = ctx.createLinearGradient(-20, -30, 20, 31);
      grad.addColorStop(0, `hsl(${this.hue} 82% 67%)`); grad.addColorStop(1, `hsl(${(this.hue + 32) % 360} 78% 46%)`);
      ctx.fillStyle = '#071923'; roundRect(ctx, -23, -34, 46, 65, 10); ctx.fill();
      ctx.fillStyle = grad; roundRect(ctx, -19, -30, 38, 56, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.22)'; roundRect(ctx, -15, -26, 30, 10, 4); ctx.fill();
      // cameras
      ctx.fillStyle = '#071923'; ctx.beginPath(); ctx.arc(-12, -23, 4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(-4, -23, 3, 0, 7); ctx.fill();
      // face
      ctx.strokeStyle = '#071923'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(-7, 1, 1.5, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(7, 1, 1.5, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 7, 7, .15, Math.PI - .15); ctx.stroke();
      // summer accessory
      drawAccessory(this.seed, this.hue);

      // amount flag
      ctx.fillStyle = '#fff5cf'; ctx.strokeStyle = '#071923'; ctx.lineWidth = 2;
      roundRect(ctx, -31, -58, 62, 19, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#071923'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 10px Space Grotesk, sans-serif';
      ctx.fillText(`+${fmt.format(this.amount)} SKR`, 0, -48);
      ctx.restore();

      const name = displayName(this.claim);
      ctx.save(); ctx.font = '700 11px Space Grotesk, sans-serif';
      const tw = Math.min(ctx.measureText(name).width + 16, 150);
      const nx = clamp(this.x - tw / 2, 5, state.width - tw - 5), ny = g + 55 * s;
      ctx.fillStyle = 'rgba(4,24,32,.88)'; roundRect(ctx, nx, ny, tw, 22, 4); ctx.fill();
      ctx.fillStyle = '#f8f4e8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const clipped = name.length > 19 ? `${name.slice(0, 17)}…` : name;
      ctx.fillText(clipped, nx + tw / 2, ny + 11);
      ctx.restore();
      this.bounds = { x: this.x - 40 * s, y: g - 65 * s, w: 80 * s, h: 150 * s };
    }
    get dead() { return this.phase === 'exit' && this.x > state.width + 110; }
  }

  function drawAccessory(seed, hue) {
    if (seed % 3 === 0) {
      ctx.fillStyle = '#fff4d2'; ctx.beginPath(); ctx.ellipse(0, -34, 29, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `hsl(${hue} 85% 54%)`; ctx.fillRect(-18, -40, 36, 7);
    } else if (seed % 3 === 1) {
      ctx.fillStyle = '#071923'; roundRect(ctx, -17, -7, 14, 9, 3); ctx.fill(); roundRect(ctx, 3, -7, 14, 9, 3); ctx.fill(); ctx.fillRect(-3, -4, 6, 2);
      ctx.fillStyle = '#ff8b65'; ctx.fillRect(-14, -5, 8, 3); ctx.fillRect(6, -5, 8, 3);
    } else {
      ctx.fillStyle = '#ffca63'; ctx.beginPath(); ctx.moveTo(-22, -28); ctx.lineTo(-13, -43); ctx.lineTo(-5, -30); ctx.lineTo(4, -45); ctx.lineTo(12, -29); ctx.lineTo(22, -42); ctx.lineTo(18, -26); ctx.closePath(); ctx.fill();
    }
  }

  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); c.beginPath(); c.roundRect(x, y, w, h, r);
  }

  function groundY() { return state.height * (state.width < 700 ? .68 : .73); }

  function burst(x, y, hue, count) {
    for (let i = 0; i < count; i++) state.particles.push({
      x, y: y - 25, vx: (Math.random() - .5) * 7, vy: -2 - Math.random() * 6,
      life: 900 + Math.random() * 600, age: 0, hue: i % 3 ? hue : 45, size: 3 + Math.random() * 5
    });
  }

  function updateParticles(dt) {
    for (const p of state.particles) { p.age += dt; p.x += p.vx * dt * .06; p.y += p.vy * dt * .06; p.vy += .012 * dt; }
    state.particles = state.particles.filter(p => p.age < p.life);
  }

  function drawParticles() {
    for (const p of state.particles) {
      ctx.globalAlpha = 1 - p.age / p.life; ctx.fillStyle = `hsl(${p.hue} 90% 62%)`;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.age * .01); ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawWorld(time) {
    const w = state.width, h = state.height;
    const horizon = h * .45;
    let sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#082739'); sky.addColorStop(.52, '#0e6371'); sky.addColorStop(1, '#f27571');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon + 3);
    // sun
    const sx = w * .82, sy = h * .29, sr = Math.min(w, h) * .085;
    const glow = ctx.createRadialGradient(sx, sy, 5, sx, sy, sr * 2.3);
    glow.addColorStop(0, 'rgba(255,236,157,.95)'); glow.addColorStop(.35, 'rgba(255,174,96,.4)'); glow.addColorStop(1, 'rgba(255,120,110,0)');
    ctx.fillStyle = glow; ctx.fillRect(sx - sr * 2.4, sy - sr * 2.4, sr * 4.8, sr * 4.8);
    ctx.fillStyle = '#ffd884'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 7); ctx.fill();
    // clouds
    drawCloud(w * .13, h * .22, 1); drawCloud(w * .58, h * .16, .65);
    // distant islands
    ctx.fillStyle = '#0a3844'; ctx.beginPath(); ctx.moveTo(0, horizon); ctx.quadraticCurveTo(w * .12, horizon - 70, w * .27, horizon); ctx.lineTo(0, horizon); ctx.fill();
    ctx.beginPath(); ctx.moveTo(w * .56, horizon); ctx.quadraticCurveTo(w * .68, horizon - 45, w * .78, horizon); ctx.fill();
    // sea
    const sea = ctx.createLinearGradient(0, horizon, 0, h * .73); sea.addColorStop(0, '#124f61'); sea.addColorStop(1, '#082e3c');
    ctx.fillStyle = sea; ctx.fillRect(0, horizon, w, h * .31);
    for (let row = 0; row < 12; row++) {
      const y = horizon + row * (h * .023);
      ctx.strokeStyle = `rgba(${row % 2 ? '105,220,216' : '255,185,137'},${.10 + row * .008})`;
      ctx.lineWidth = 1 + row * .08; ctx.beginPath();
      for (let x = -20; x < w + 20; x += 18) {
        const yy = y + Math.sin(x * .027 + time * .0008 + row) * (2 + row * .25);
        x === -20 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      } ctx.stroke();
    }
    // beach and boardwalk
    const beachY = h * .68;
    const sand = ctx.createLinearGradient(0, beachY, 0, h); sand.addColorStop(0, '#eab866'); sand.addColorStop(1, '#d17962');
    ctx.fillStyle = sand; ctx.beginPath(); ctx.moveTo(0, beachY); for (let x = 0; x <= w; x += 28) ctx.lineTo(x, beachY + Math.sin(x * .03 + time * .001) * 5); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
    const gy = groundY(); ctx.fillStyle = '#e8c48e'; ctx.fillRect(0, gy + 31, w, h - gy);
    ctx.strokeStyle = 'rgba(80,46,35,.22)'; ctx.lineWidth = 2;
    for (let x = -30; x < w + 40; x += 48) { ctx.beginPath(); ctx.moveTo(x, gy + 31); ctx.lineTo(x + 22, h); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(0, gy + 32); ctx.lineTo(w, gy + 32); ctx.stroke();
    drawPalm(w * .08, beachY + 30, .85); drawPalm(w * .68, beachY + 25, .68);
    drawHub(w * (w < 700 ? .76 : .86), gy + 28, time);
    drawBirds(time);
  }

  function drawCloud(x, y, s) {
    ctx.fillStyle = 'rgba(240,240,218,.16)'; ctx.beginPath(); ctx.ellipse(x, y, 55 * s, 13 * s, 0, 0, 7); ctx.ellipse(x - 30 * s, y + 5 * s, 35 * s, 9 * s, 0, 0, 7); ctx.ellipse(x + 37 * s, y + 4 * s, 30 * s, 8 * s, 0, 0, 7); ctx.fill();
  }

  function drawPalm(x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.strokeStyle = '#102b2e'; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(0, 60); ctx.quadraticCurveTo(8, 5, -3, -58); ctx.stroke();
    ctx.strokeStyle = '#154a43'; ctx.lineWidth = 10;
    for (let i = 0; i < 7; i++) { const a = -2.9 + i * .52; ctx.beginPath(); ctx.moveTo(-3, -57); ctx.quadraticCurveTo(Math.cos(a) * 45, -75 + Math.sin(a) * 20, Math.cos(a) * 70, -56 + Math.sin(a) * 45); ctx.stroke(); }
    ctx.restore();
  }

  function drawHub(x, y, time) {
    const glow = .65 + Math.sin(time * .004) * .15;
    ctx.save(); ctx.translate(x, y);
    ctx.shadowColor = `rgba(102,255,209,${glow})`; ctx.shadowBlur = 24;
    ctx.strokeStyle = '#66ffd1'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(0, 0, 54, Math.PI, 0); ctx.lineTo(54, 5); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#071923'; roundRect(ctx, -72, -92, 144, 28, 3); ctx.fill();
    ctx.fillStyle = '#fff2ca'; ctx.textAlign = 'center'; ctx.font = '700 12px Archivo Black, sans-serif'; ctx.fillText('SUMMER HUB', 0, -74);
    ctx.fillStyle = 'rgba(102,255,209,.25)'; ctx.beginPath(); ctx.ellipse(0, 5, 48, 11, 0, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawBirds(time) {
    ctx.strokeStyle = 'rgba(240,242,221,.6)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const x = (time * .018 + i * 183) % (state.width + 80) - 40, y = 90 + (i % 3) * 25;
      ctx.beginPath(); ctx.arc(x - 5, y, 6, Math.PI * 1.1, Math.PI * 1.9); ctx.arc(x + 5, y, 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
  }

  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(40, now - lastFrame); lastFrame = now;
    if (state.running) {
      state.wave += dt;
      if (state.queue.length && now - state.lastSpawn > 760) spawn(state.queue.shift(), now);
      for (const agent of state.agents) agent.update(dt);
      state.agents = state.agents.filter(a => !a.dead);
      updateParticles(dt);
    }
    drawWorld(state.wave);
    drawParticles();
    [...state.agents].sort((a, b) => a.yOff - b.yOff).forEach(a => a.draw(state.wave));
    requestAnimationFrame(frame);
  }

  function spawn(claim, now = performance.now()) {
    state.lastSpawn = now;
    if (state.agents.length > 12) state.agents.shift();
    state.agents.push(new Runner(claim));
  }

  function announce(claim) {
    ui.arrivalName.textContent = displayName(claim);
    ui.arrivalAmount.textContent = `${fmt.format(claim.amount)} SKR claimed · ${tier(claim.amount)}`;
    ui.arrival.classList.remove('pop'); void ui.arrival.offsetWidth; ui.arrival.classList.add('pop');
    setTimeout(() => ui.arrival.classList.remove('pop'), 500);
  }

  function renderFeed(claims) {
    const list = claims.slice(0, 12);
    ui.feed.innerHTML = list.map(c => {
      const date = new Date(c.blockTime * 1000);
      const time = Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'just now';
      return `<a class="claim-card" href="${escapeAttr(c.solscan)}" target="_blank" rel="noopener">
        <span class="claim-tier">${tier(c.amount)} · ${time}</span><i class="mini-phone" aria-hidden="true"></i>
        <strong>${escapeHtml(displayName(c))}</strong><b>+${fmt.format(c.amount)} SKR</b><small>${escapeHtml(shortWallet(c.claimer))} ↗</small>
      </a>`;
    }).join('') || '<div class="feed-empty">No confirmed claims yet.</div>';
  }

  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function escapeAttr(s) { return String(s || '').replace(/["<>]/g, ''); }

  function applyData(data) {
    ui.claimed.textContent = compact(data.claimed);
    ui.count.textContent = fmt.format(data.claimCount);
    ui.remaining.textContent = compact(data.remaining);
    ui.percent.textContent = `${Number(data.percent).toFixed(1)}%`;
    ui.bar.style.width = `${clamp(data.percent, 0, 100)}%`;
    renderFeed(data.claims || []);

    const claims = data.claims || [];
    if (!state.initialized) {
      claims.forEach(c => state.seen.add(c.signature));
      state.queue.push(...claims.slice(0, 6).reverse());
      if (claims[0]) announce(claims[0]);
      state.initialized = true;
    } else {
      const fresh = claims.filter(c => !state.seen.has(c.signature)).reverse();
      fresh.forEach(c => { state.seen.add(c.signature); state.queue.push(c); });
    }
    setConnected(true);
  }

  function setConnected(ok) {
    state.connected = ok; ui.live.classList.toggle('is-live', ok);
    ui.live.querySelector('span').textContent = ok ? 'LIVE' : 'RECONNECTING';
    ui.error.classList.toggle('show', !ok);
  }

  async function poll() {
    try {
      const response = await fetch('/api/state', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      applyData(await response.json());
    } catch (error) {
      console.warn('Live feed unavailable:', error.message); setConnected(false);
    } finally { setTimeout(poll, state.connected ? 3200 : 6000); }
  }

  ui.motion.addEventListener('click', () => {
    state.running = !state.running; ui.motion.textContent = state.running ? 'Ⅱ' : '▶';
    ui.motion.setAttribute('aria-pressed', String(!state.running));
    ui.motion.setAttribute('aria-label', state.running ? 'Pause animation' : 'Play animation');
  });
  canvas.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect(); state.pointer.x = e.clientX - r.left; state.pointer.y = e.clientY - r.top;
    canvas.style.cursor = state.agents.some(a => a.bounds && state.pointer.x >= a.bounds.x && state.pointer.x <= a.bounds.x + a.bounds.w && state.pointer.y >= a.bounds.y && state.pointer.y <= a.bounds.y + a.bounds.h) ? 'pointer' : 'default';
  });
  canvas.addEventListener('click', () => {
    const hit = [...state.agents].reverse().find(a => a.bounds && state.pointer.x >= a.bounds.x && state.pointer.x <= a.bounds.x + a.bounds.w && state.pointer.y >= a.bounds.y && state.pointer.y <= a.bounds.y + a.bounds.h);
    if (hit) window.open(hit.claim.solscan, '_blank', 'noopener');
  });
  addEventListener('resize', resize, { passive: true });
  resize(); requestAnimationFrame(frame); poll();
})();

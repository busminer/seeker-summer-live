(() => {
  'use strict';
  const canvas = document.getElementById('worldCanvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  const $ = id => document.getElementById(id);
  const ui = {
    live: $('livePill'), claimed: $('claimedValue'), count: $('claimCountValue'),
    remaining: $('remainingValue'), percent: $('percentValue'), bar: $('progressBar'),
    feed: $('claimFeed'), arrival: $('arrivalCard'), arrivalName: $('arrivalName'),
    arrivalAmount: $('arrivalAmount'), arrivalRoute: $('arrivalRoute'), error: $('errorToast'),
    motion: $('motionButton'), summerResidents: $('summerResidents'), stakingResidents: $('stakingResidents')
  };
  const state = {
    width: 0, height: 0, dpr: 1, running: true, connected: false,
    agents: [], particles: [], seen: new Set(), queue: [], initialized: false,
    lastSpawn: 0, latest: null, labelRects: []
  };
  const runnerSheet = new Image();
  runnerSheet.src = '/assets/runner-sheet-v2.png';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) state.running = false;

  const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  const compact = value => value >= 1e6 ? `${(value / 1e6).toFixed(value % 1e6 ? 2 : 0)}M` : fmt.format(value);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const shortWallet = wallet => wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : 'unknown';
  const displayName = claim => claim.domain || shortWallet(claim.claimer);
  const hash = text => [...(text || '')].reduce((n, char) => ((n << 5) - n + char.charCodeAt(0)) | 0, 17);
  const routeName = claim => claim.staked === true ? 'STAKING CITY' : claim.staked === false ? 'SUMMER CITY' : 'VERIFYING ROUTE';

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(devicePixelRatio || 1, 1.6);
    state.width = rect.width;
    state.height = rect.height;
    canvas.width = Math.round(rect.width * state.dpr);
    canvas.height = Math.round(rect.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  }

  function cityZone(staked) {
    const w = state.width, h = state.height;
    return staked
      ? { x1: w * .66, x2: w * .94, y1: h * .48, y2: h * .69 }
      : { x1: w * .07, x2: w * .36, y1: h * .53, y2: h * .72 };
  }

  function destination(staked, seed) {
    const zone = cityZone(staked);
    const rx = ((seed * 16807) % 997) / 997;
    const ry = ((seed * 48271) % 991) / 991;
    return { x: lerp(zone.x1, zone.x2, rx), y: lerp(zone.y1, zone.y2, ry) };
  }

  class Runner {
    constructor(claim, resident = false) {
      this.claim = claim;
      this.seed = Math.abs(hash(claim.signature));
      this.amount = Number(claim.amount || 0);
      this.staked = claim.staked === true;
      this.start = { x: state.width * .5, y: state.height * .78 };
      this.dest = destination(this.staked, this.seed);
      this.x = resident ? this.dest.x : this.start.x;
      this.y = resident ? this.dest.y : this.start.y;
      this.phase = resident ? 'resident' : 'arriving';
      this.age = resident ? this.seed % 3000 : 0;
      this.duration = 1500 + this.seed % 950;
      this.opacity = 1;
      this.bounds = null;
    }

    reroute(staked) {
      if (this.staked === staked) return;
      this.staked = staked;
      this.start = { x: this.x, y: this.y };
      this.dest = destination(staked, this.seed);
      this.phase = 'arriving';
      this.age = 0;
      this.duration = 1250;
    }

    update(dt) {
      this.age += dt;
      if (this.phase === 'arriving') {
        const raw = clamp(this.age / this.duration, 0, 1);
        const t = ease(raw);
        const control = {
          x: lerp(this.start.x, this.dest.x, .44),
          y: Math.min(this.start.y, this.dest.y) - state.height * (.09 + (this.seed % 5) * .008)
        };
        const inv = 1 - t;
        this.x = inv * inv * this.start.x + 2 * inv * t * control.x + t * t * this.dest.x;
        this.y = inv * inv * this.start.y + 2 * inv * t * control.y + t * t * this.dest.y;
        if (raw >= 1) {
          this.phase = 'resident';
          this.age = this.seed % 2500;
          burst(this.x, this.y - 30, this.staked ? 166 : 330, this.staked ? 18 : 10);
        }
      } else {
        const zone = cityZone(this.staked);
        const stride = 16 + this.seed % 18;
        this.x = clamp(this.dest.x + Math.sin(this.age * .00055 + this.seed) * stride, zone.x1, zone.x2);
        this.y = clamp(this.dest.y + Math.sin(this.age * .0009 + this.seed * .7) * 7, zone.y1, zone.y2);
      }
    }

    draw(time) {
      const residentScale = this.phase === 'resident' ? .78 : 1;
      const amountScale = this.amount >= 10000 ? 1.13 : this.amount >= 3000 ? 1 : .9;
      const base = clamp(state.width * .072, 82, 138);
      const dh = base * residentScale * amountScale;
      const sw = runnerSheet.naturalWidth / 6;
      const sh = runnerSheet.naturalHeight;
      const dw = dh * (sw / sh);
      const frame = Math.floor((time * .009 + this.seed) % 6);
      const bob = Math.sin(time * .018 + this.seed) * 2.4;
      const dx = this.x - dw / 2;
      const dy = this.y - dh * .78 + bob;

      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = 'rgba(3, 14, 25, .3)';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + 3, dw * .24, dh * .035, 0, 0, Math.PI * 2);
      ctx.fill();
      if (runnerSheet.complete && runnerSheet.naturalWidth) {
        ctx.drawImage(runnerSheet, frame * sw, 0, sw, sh, dx, dy, dw, dh);
      }
      drawRunnerLabel(this, dy - 6);
      ctx.restore();
      this.bounds = { x: dx - 10, y: dy - 48, w: dw + 20, h: dh + 54 };
    }
  }

  function drawRunnerLabel(runner, y) {
    const name = displayName(runner.claim);
    const amount = `+${fmt.format(runner.amount)} SKR`;
    const accent = runner.claim.staked === true ? '#76ffd8' : runner.claim.staked === false ? '#ffbd69' : '#d9e0e2';
    ctx.textAlign = 'center';
    ctx.font = '800 11px Space Grotesk, sans-serif';
    const nameWidth = Math.min(154, ctx.measureText(name).width + 24);
    ctx.font = '800 10px Space Grotesk, sans-serif';
    const amountWidth = ctx.measureText(amount).width + 24;
    const width = Math.max(86, nameWidth, amountWidth);
    const labelX = clamp(runner.x, width / 2 + 8, state.width - width / 2 - 8);
    let labelY = Math.max(82, y - 37);
    const left = labelX - width / 2;
    for (let attempt = 0; attempt < 5; attempt++) {
      const overlaps = state.labelRects.some(rect => left < rect.x + rect.w + 5 && left + width + 5 > rect.x && labelY < rect.y + rect.h + 4 && labelY + 38 > rect.y);
      if (!overlaps) break;
      labelY -= 41;
    }
    state.labelRects.push({ x: left, y: labelY, w: width, h: 38 });

    ctx.shadowColor = 'rgba(0,0,0,.4)';
    ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(4, 18, 28, .88)';
    roundRect(labelX - width / 2, labelY, width, 38, 10);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f9f3df';
    ctx.font = '800 11px Space Grotesk, sans-serif';
    ctx.fillText(name, labelX, labelY + 15, width - 12);
    ctx.fillStyle = accent;
    ctx.font = '800 10px Space Grotesk, sans-serif';
    ctx.fillText(amount, labelX, labelY + 30, width - 12);
    ctx.fillStyle = accent;
    ctx.fillRect(labelX - width / 2, labelY + 36, width, 2);
  }

  function roundRect(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  }

  function burst(x, y, hue, count) {
    for (let i = 0; i < count; i++) {
      state.particles.push({
        x, y, vx: (Math.random() - .5) * 4, vy: -Math.random() * 4 - 1,
        life: 600 + Math.random() * 650, hue, size: 2 + Math.random() * 3
      });
    }
  }

  function announce(claim) {
    state.latest = claim;
    ui.arrivalName.textContent = displayName(claim);
    ui.arrivalAmount.textContent = `+${fmt.format(Number(claim.amount || 0))} SKR`;
    ui.arrivalRoute.textContent = routeName(claim);
    ui.arrival.dataset.route = claim.staked === true ? 'staked' : 'claimed';
    ui.arrival.disabled = false;
    ui.arrival.classList.remove('pop');
    void ui.arrival.offsetWidth;
    ui.arrival.classList.add('pop');
  }

  function drawWorld(time, dt) {
    const glow = ctx.createRadialGradient(state.width * .5, state.height * .78, 4, state.width * .5, state.height * .78, state.width * .15);
    glow.addColorStop(0, `rgba(255,220,134,${.18 + Math.sin(time * .002) * .04})`);
    glow.addColorStop(1, 'rgba(255,102,157,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, state.width, state.height);

    state.labelRects.length = 0;
    [...state.agents].sort((a, b) => a.y - b.y).forEach(agent => {
      agent.update(dt);
      agent.draw(time);
    });
    state.particles.forEach(particle => {
      particle.life -= dt;
      particle.x += particle.vx * dt * .05;
      particle.y += particle.vy * dt * .05;
      particle.vy += dt * .001;
      ctx.fillStyle = `hsla(${particle.hue} 95% 72% / ${clamp(particle.life / 500, 0, 1)})`;
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    });
    state.particles = state.particles.filter(p => p.life > 0);
    updateResidentCounts();
  }

  function updateResidentCounts() {
    const residents = state.agents.filter(agent => agent.phase === 'resident');
    ui.summerResidents.textContent = `${residents.filter(agent => !agent.staked).length} LIVE SEEKERS`;
    ui.stakingResidents.textContent = `${residents.filter(agent => agent.staked).length} LIVE STAKERS`;
  }

  function updateStats(data) {
    ui.claimed.textContent = compact(data.claimed);
    ui.remaining.textContent = compact(data.remaining);
    ui.count.textContent = fmt.format(data.claimCount);
    ui.percent.textContent = `${Number(data.percent).toFixed(2)}%`;
    ui.bar.style.width = `${clamp(data.percent, 0, 100)}%`;
  }

  function renderFeed(claims) {
    ui.feed.innerHTML = claims.slice(0, 12).map(claim => {
      const route = claim.staked === true ? 'CLAIMED + STAKED' : claim.staked === false ? 'CLAIMED' : 'VERIFYING ON-CHAIN';
      const routeClass = claim.staked === true ? 'is-staked' : 'is-claimed';
      return `<a class="claim-card ${routeClass}" href="${escapeAttr(claim.solscan)}" target="_blank" rel="noopener">
        <span class="claim-tier">${route}</span><i class="mini-phone" aria-hidden="true"></i>
        <strong>${escapeHtml(displayName(claim))}</strong><b>+${fmt.format(Number(claim.amount || 0))} SKR</b>
        <small>${formatTime(claim.blockTime)} · SOLSCAN ↗</small></a>`;
    }).join('');
  }

  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const escapeAttr = value => /^https:\/\/solscan\.io\/tx\//.test(value || '') ? escapeHtml(value) : '#';
  const formatTime = time => time ? new Date(time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'JUST NOW';

  function reconcileRoutes(claims) {
    claims.forEach(claim => {
      if (typeof claim.staked !== 'boolean') return;
      const agent = state.agents.find(item => item.claim.signature === claim.signature);
      if (agent) {
        agent.claim = claim;
        agent.reroute(claim.staked);
      }
    });
  }

  async function poll() {
    try {
      const response = await fetch('/api/state', { cache: 'no-store' });
      if (!response.ok) throw new Error(`feed ${response.status}`);
      const data = await response.json();
      const claims = data.claims || [];
      updateStats(data);
      renderFeed(claims);
      reconcileRoutes(claims);
      const fresh = claims.filter(claim => claim.signature && !state.seen.has(claim.signature));
      if (!state.initialized) {
        claims.forEach(claim => state.seen.add(claim.signature));
        claims.slice(0, 28).reverse().forEach(claim => state.agents.push(new Runner(claim, true)));
        if (claims[0]) announce(claims[0]);
        state.initialized = true;
      } else {
        fresh.reverse().forEach(claim => {
          state.seen.add(claim.signature);
          state.queue.push(claim);
        });
      }
      state.connected = true;
      ui.live.classList.add('is-live');
      ui.live.querySelector('span').textContent = 'LIVE ON SOLANA';
      ui.error.classList.remove('show');
    } catch (error) {
      state.connected = false;
      ui.live.classList.remove('is-live');
      ui.live.querySelector('span').textContent = 'RECONNECTING';
      ui.error.classList.add('show');
      console.warn(error);
    }
  }

  function loop(time) {
    const dt = Math.min(32, time - (loop.last || time));
    loop.last = time;
    if (state.running) {
      ctx.clearRect(0, 0, state.width, state.height);
      drawWorld(time, dt);
      if (state.queue.length && time - state.lastSpawn > 720) {
        const claim = state.queue.shift();
        const runner = new Runner(claim);
        state.agents.push(runner);
        announce(claim);
        burst(state.width * .5, state.height * .76, claim.staked ? 166 : 330, 24);
        state.lastSpawn = time;
        while (state.agents.length > 34) state.agents.shift();
      }
    }
    requestAnimationFrame(loop);
  }

  ui.motion.addEventListener('click', () => {
    state.running = !state.running;
    ui.motion.textContent = state.running ? 'Ⅱ' : '▶';
    ui.motion.setAttribute('aria-pressed', String(!state.running));
    ui.motion.setAttribute('aria-label', state.running ? 'Pause animation' : 'Resume animation');
  });
  ui.arrival.addEventListener('click', () => {
    if (state.latest?.solscan && /^https:\/\/solscan\.io\/tx\//.test(state.latest.solscan)) {
      window.open(state.latest.solscan, '_blank', 'noopener');
    }
  });
  canvas.addEventListener('click', event => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    const hit = [...state.agents].reverse().find(agent => agent.bounds && x >= agent.bounds.x && x <= agent.bounds.x + agent.bounds.w && y >= agent.bounds.y && y <= agent.bounds.y + agent.bounds.h);
    if (hit?.claim?.solscan) window.open(hit.claim.solscan, '_blank', 'noopener');
  });
  canvas.addEventListener('mousemove', event => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    canvas.style.cursor = state.agents.some(agent => agent.bounds && x >= agent.bounds.x && x <= agent.bounds.x + agent.bounds.w && y >= agent.bounds.y && y <= agent.bounds.y + agent.bounds.h) ? 'pointer' : 'default';
  });
  addEventListener('resize', resize, { passive: true });
  resize();
  poll();
  setInterval(poll, 3000);
  requestAnimationFrame(loop);
})();

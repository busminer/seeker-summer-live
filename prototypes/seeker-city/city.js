(() => {
  'use strict';

  const canvas = document.querySelector('#city');
  const ctx = canvas.getContext('2d', { alpha: false });
  const ui = {
    claimed: document.querySelector('#claimed'), claims: document.querySelector('#claims'),
    summerCount: document.querySelector('#summerCount'), stakingCount: document.querySelector('#stakingCount'), pendingCount: document.querySelector('#pendingCount'),
    arrival: document.querySelector('#arrival'), arrivalName: document.querySelector('#arrivalName'), arrivalMeta: document.querySelector('#arrivalMeta'), status: document.querySelector('#status')
  };
  const TAU = Math.PI * 2, fmt = new Intl.NumberFormat('en-US'), reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = { summer: '#58f3e4', staking: '#ffd166', pending: '#c54dff', pink: '#ff3f91', road: '#160d24' };
  const S = { w: 0, h: 0, dpr: 1, mouseX: 0, mouseY: 0, targetX: 0, targetY: 0, stars: [], buildings: [], palms: [], signals: [], queue: [], seen: new Set(), first: true, lastSpawn: 0, lastFetch: 0, labelBoxes: [], hitTargets: [] };
  const billboard = new Image(); billboard.src = '/public/assets/official-seeker-detail.webp';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const compactView = () => S.w < 700 || S.h < 520;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);
  const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rngFor = seed => { let n = hash(seed) || 1; return () => ((n = Math.imul(n ^ n >>> 15, 1 | n)) ^ n + Math.imul(n ^ n >>> 7, 61 | n), ((n ^ n >>> 14) >>> 0) / 4294967296); };
  const formatAmount = n => n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : fmt.format(Math.round(n || 0));
  const idOf = c => c.signature || c.sig || `${c.claimer || c.owner}-${c.amount}-${c.blockTime || c.timestamp}`;
  const nameOf = c => c.domain || c.name || c.skrDomain || `${String(c.claimer || c.owner || 'seeker').slice(0, 5)}…${String(c.claimer || c.owner || '').slice(-3)}`;
  const routeOf = c => c.route === 'staking' || c.staked === true ? 'staking' : c.route === 'summer' || c.staked === false ? 'summer' : 'pending';
  const point = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  const cubic = (a, b, c, d, t) => { const q = 1 - t; return { x: q*q*q*a.x + 3*q*q*t*b.x + 3*q*t*t*c.x + t*t*t*d.x, y: q*q*q*a.y + 3*q*q*t*b.y + 3*q*t*t*c.y + t*t*t*d.y }; };

  function resize() {
    S.dpr = Math.min(devicePixelRatio || 1, 1.6); S.w = innerWidth; S.h = innerHeight;
    canvas.width = Math.round(S.w * S.dpr); canvas.height = Math.round(S.h * S.dpr); canvas.style.width = `${S.w}px`; canvas.style.height = `${S.h}px`; ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    seedWorld();
  }
  function seedWorld() {
    const r = rngFor(`city-${S.w}-${S.h}`);
    S.stars = Array.from({ length: Math.min(155, Math.floor(S.w * S.h / 6500)) }, () => ({ x: r() * S.w, y: r() * S.h * .42, s: .35 + r() * 1.2, p: r() * TAU }));
    S.buildings = [];
    for (const side of ['summer', 'staking']) {
      const start = side === 'summer' ? 0 : .62, end = side === 'summer' ? .38 : 1;
      let x = start * S.w;
      while (x < end * S.w) { const w = 22 + r() * 48, h = S.h * (.07 + r() * .16); S.buildings.push({ side, x, w, h, rows: 3 + (r() * 5 | 0), cols: 2 + (r() * 4 | 0), seed: r() * 99 }); x += w * (.72 + r() * .4); }
    }
    const palmSlots = compactView() ? [.03,.20,.80,.96] : [.025,.15,.27,.37,.63,.73,.85,.975];
    S.palms = palmSlots.map(x => ({ x: x * S.w, s: .62 + r() * .62, lean: (r() - .5) * .35 }));
  }

  class RoadPhone {
    constructor(claim) {
      this.claim = claim; this.route = routeOf(claim); this.seed = hash(idOf(claim)); this.r = rngFor(this.seed);
      this.born = performance.now(); this.duration = reduced ? 1 : 17000 + this.r() * 5500; this.lane = (this.seed % 3 - 1) * .018; this.done = false; this.chosen = false;
    }
    state(now) {
      const p = clamp((now - this.born) / this.duration, 0, 1), forkP = .57;
      const start = { x: S.w * (.5 + this.lane), y: S.h * .94 }, fork = { x: S.w * (.5 + this.lane * .35), y: S.h * .575 };
      let pos, angle = 0;
      if (p <= forkP) {
        const q = ease(p / forkP); pos = point(start, fork, q); angle = (this.lane * 5) + Math.sin(q * Math.PI) * .015;
      } else {
        const q = ease((p - forkP) / (1 - forkP)), left = this.route === 'summer';
        const end = { x: S.w * (left ? .22 : .78), y: S.h * .405 }, c1 = { x: S.w * (left ? .43 : .57), y: S.h * .52 }, c2 = { x: S.w * (left ? .31 : .69), y: S.h * .445 };
        pos = cubic(fork, c1, c2, end, q); const ahead = cubic(fork, c1, c2, end, Math.min(1, q + .015)); angle = Math.atan2(ahead.y - pos.y, ahead.x - pos.x) + Math.PI / 2;
      }
      return { p, x: pos.x, y: pos.y, angle };
    }
    draw(now) {
      const q = this.state(now), horizon = S.h * .39, depth = clamp((q.y - horizon) / (S.h - horizon), 0, 1), compact = compactView(), wideBoost = compact ? 1 : clamp(S.w / 1440, 1, 1.25), scale = (compact ? (S.h < 520 ? .82 : .9) : 1.05 * wideBoost) * (.52 + depth * .78);
      drawRoadPhone(q.x, q.y, scale, q.angle, this.route, this.seed, now * .001); drawPhoneLabel(q.x, q.y - 42 * scale, this.claim, this.route, scale); S.hitTargets.push({x:q.x,y:q.y,r:Math.max(34,42*scale),claim:this.claim});
      if (q.p >= .57 && !this.chosen) { this.chosen = true; announce(this.claim, this.route); }
      if (q.p >= 1 && !this.done) this.done = true;
      return q.p < 1;
    }
  }

  function drawSky(t) {
    const h = S.h, w = S.w, horizon = h * .42;
    const g = ctx.createLinearGradient(0, 0, 0, horizon); g.addColorStop(0, '#17052e'); g.addColorStop(.37, '#5b125f'); g.addColorStop(.68, '#d13278'); g.addColorStop(1, '#ff8d64'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const sx = w * .51 + S.mouseX * 9, sy = h * .29 + S.mouseY * 4, sr = Math.min(w, h) * .072;
    const halo = ctx.createRadialGradient(sx, sy, 3, sx, sy, sr * 3.4); halo.addColorStop(0, 'rgba(255,250,201,.95)'); halo.addColorStop(.22, 'rgba(255,209,102,.6)'); halo.addColorStop(.62, 'rgba(255,63,145,.16)'); halo.addColorStop(1, 'rgba(255,63,145,0)'); ctx.fillStyle = halo; ctx.fillRect(sx - sr*3.5, sy - sr*3.5, sr*7, sr*7);
    ctx.fillStyle = '#ffd778'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(91,18,95,.42)'; for (let i = -3; i < 4; i++) { const yy = sy + i * sr * .23; ctx.fillRect(sx - sr, yy, sr * 2, Math.max(2, sr * .055)); }
    for (const s of S.stars) { ctx.globalAlpha = .2 + .45 * (.5 + .5 * Math.sin(t * .7 + s.p)); ctx.fillStyle = s.p > Math.PI ? '#ffd166' : '#ffd5ee'; ctx.beginPath(); ctx.arc(s.x + S.mouseX * s.s * 2, s.y, s.s, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,190,155,.13)'; ctx.lineWidth = 1; for (let i = 0; i < 4; i++) { const y = h * (.16 + i * .055); ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(w*.28,y+18*Math.sin(t*.08+i),w*.68,y-12,w,y+5); ctx.stroke(); }
  }

  function drawSkyline(t) {
    const horizon = S.h * .42;
    for (const b of S.buildings) {
      const accent = b.side === 'summer' ? COLORS.summer : COLORS.staking;
      ctx.fillStyle = b.side === 'summer' ? '#19102e' : '#210d2b'; ctx.fillRect(b.x, horizon - b.h, b.w + 1, b.h + 4);
      ctx.fillStyle = accent; const ww = Math.max(2, b.w / (b.cols * 2.4)), wh = 2;
      for (let row = 0; row < b.rows; row++) for (let col = 0; col < b.cols; col++) if ((row * 5 + col + (b.seed | 0)) % 4) { ctx.globalAlpha = .2 + .38 * (.5 + .5 * Math.sin(t * .35 + b.seed + row)); ctx.fillRect(b.x + 5 + col * (b.w - 8) / b.cols, horizon - b.h + 8 + row * (b.h - 13) / b.rows, ww, wh); }
      ctx.globalAlpha = 1;
    }
    if (billboard.complete && billboard.naturalWidth && S.w > 760) drawBillboard(S.w * .065, horizon - S.h * .155, S.w * .105, S.h * .105);
  }
  function drawBillboard(x, y, w, h) {
    ctx.save(); ctx.fillStyle = '#12051f'; ctx.fillRect(x - 4, y - 4, w + 8, h + 8); ctx.strokeStyle = COLORS.pink; ctx.lineWidth = 2; ctx.strokeRect(x - 4, y - 4, w + 8, h + 8); ctx.drawImage(billboard, x, y, w, h); ctx.globalAlpha = .22; ctx.fillStyle = COLORS.pink; for (let sy = y; sy < y + h; sy += 4) ctx.fillRect(x, sy, w, 1); ctx.restore();
  }
  function drawNeonGate(x, y, text, color) {
    const mobile = compactView(), wide = mobile ? 78 : clamp(S.w*.103,148,220), high = mobile ? 25 : clamp(S.w*.025,36,50), gateFont = mobile ? 8 : clamp(S.w/103,14,19); ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 17; ctx.strokeStyle = color; ctx.lineWidth = mobile ? 2 : 3; ctx.beginPath(); ctx.moveTo(x - wide/2, y + 9); ctx.lineTo(x - wide/2, y - high); ctx.lineTo(x + wide/2, y - high); ctx.lineTo(x + wide/2, y + 9); ctx.stroke(); ctx.shadowBlur = 0;
    const panel = ctx.createLinearGradient(x-wide/2,y,x+wide/2,y); panel.addColorStop(0,'rgba(18,4,31,.98)'); panel.addColorStop(.5,'rgba(58,13,69,.96)'); panel.addColorStop(1,'rgba(18,4,31,.98)'); ctx.fillStyle = panel; ctx.fillRect(x - wide/2 + 4, y - high + 3, wide - 8, high - 7);
    ctx.fillStyle = COLORS.pink; ctx.fillRect(x-wide/2+6,y-high+5,wide*.22,mobile?2:3); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `italic 900 ${gateFont}px Archivo Black`; ctx.fillText(text, x, y - high*.43); ctx.restore();
  }

  function drawCityGates(){const y=S.h*.423;drawNeonGate(S.w*.22,y,'SUMMER CITY',COLORS.summer);drawNeonGate(S.w*.78,y,'STAKING CITY',COLORS.staking);}

  function drawRoads(t) {
    const w = S.w, h = S.h, fy = h * .575, hy = h * .42, cx = w * .5, left = w * .22, right = w * .78;
    const ground = ctx.createLinearGradient(0, hy, 0, h); ground.addColorStop(0, '#ff8966'); ground.addColorStop(.58, '#d85a68'); ground.addColorStop(1, '#6f294e'); ctx.fillStyle = ground; ctx.fillRect(0, hy, w, h - hy);
    ctx.save(); ctx.strokeStyle = 'rgba(92,13,91,.18)'; ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) { const q = i / 8, y = hy + (h - hy) * q * q; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    for (let i = -9; i <= 9; i++) { ctx.beginPath(); ctx.moveTo(cx, hy); ctx.lineTo(cx + i * w * .105, h); ctx.stroke(); } ctx.restore();
    const asphalt = ctx.createLinearGradient(0, hy, 0, h); asphalt.addColorStop(0, '#23122f'); asphalt.addColorStop(1, '#0d0a17');
    ctx.fillStyle = asphalt;
    polygon([[cx-w*.055,fy],[cx+w*.055,fy],[cx+w*.255,h],[cx-w*.255,h]]);
    polygon([[cx-w*.055,fy],[cx+w*.012,fy],[left+w*.035,hy],[left-w*.035,hy]]);
    polygon([[cx-w*.012,fy],[cx+w*.055,fy],[right+w*.035,hy],[right-w*.035,hy]]);
    drawRoadEdge([{x:cx-w*.255,y:h},{x:cx-w*.055,y:fy},{x:left-w*.035,y:hy}], COLORS.summer, t, 0);
    drawRoadEdge([{x:cx+w*.255,y:h},{x:cx+w*.055,y:fy},{x:right+w*.035,y:hy}], COLORS.staking, t, 1.2);
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, h); ctx.lineTo(cx, fy); ctx.stroke();
    const commonA={x:cx,y:h},commonB={x:cx,y:fy}; for(let i=0;i<9;i++){const q=(i/9+t*.055)%1, p=point(commonA,commonB,1-q), size=lerp(9,2,1-q); ctx.fillStyle='rgba(255,209,102,.62)';ctx.fillRect(p.x-size*.08,p.y-size*1.4,size*.16,size*2.8);}
    drawBranchDashes({x:cx,y:fy},{x:left,y:hy},t,COLORS.summer); drawBranchDashes({x:cx,y:fy},{x:right,y:hy},t+.33,COLORS.staking);
    ctx.fillStyle = 'rgba(255,63,145,.12)'; for(let i=0;i<5;i++){const y=h*(.64+i*.085);ctx.fillRect(0,y,w,1);}
  }
  function polygon(points){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();}
  function drawRoadEdge(points,color,t,phase){ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=.7;ctx.shadowColor=color;ctx.shadowBlur=8;ctx.lineWidth=2;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.shadowBlur=0;for(let i=0;i<14;i++){const q=(i/14+t*.09+phase)%1;const a=q<.5?points[0]:points[1],b=q<.5?points[1]:points[2],p=point(a,b,(q% .5)*2);ctx.globalAlpha=.35+.55*Math.sin((q+t)*TAU)**2;ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,1.5+q*1.5,0,TAU);ctx.fill();}ctx.restore();}
  function drawBranchDashes(a,b,t,color){for(let i=0;i<6;i++){const q=(i/6+t*.04)%1,p=point(a,b,1-q);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(b.y-a.y,b.x-a.x)+Math.PI/2);ctx.fillStyle=color;ctx.globalAlpha=.5;ctx.fillRect(-1,-5,2,10);ctx.restore();}}

  function drawPalms(t){const base=S.h*.91;for(const p of S.palms){ctx.save();ctx.translate(p.x,base);ctx.scale(p.s,p.s);ctx.strokeStyle='#120819';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(0,30);ctx.quadraticCurveTo(10+p.lean*20,-5,4+p.lean*35,-76);ctx.stroke();ctx.translate(4+p.lean*35,-76);ctx.rotate(Math.sin(t*.2+p.x)*.025);ctx.lineWidth=5;for(let i=0;i<7;i++){const a=-2.85+i*.52;ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(Math.cos(a)*28,-8+Math.sin(a)*12,Math.cos(a)*49,Math.sin(a)*32);ctx.stroke();}ctx.restore();}}

  function drawRoadPhone(x,y,scale,angle,route,seed,t){
    const color=COLORS[route],w=29*scale,h=57*scale,bob=Math.sin(t*3+seed)*1.4*scale;ctx.save();ctx.translate(x,y+bob);ctx.rotate(angle*.48+Math.sin(t*1.4+seed)*.015);
    ctx.globalCompositeOperation='screen';const halo=ctx.createRadialGradient(0,5*scale,1,0,5*scale,32*scale);halo.addColorStop(0,route==='staking'?'rgba(255,209,102,.32)':'rgba(88,243,228,.28)');halo.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,4*scale,32*scale,0,TAU);ctx.fill();ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='rgba(0,0,0,.34)';ctx.beginPath();ctx.ellipse(0,h*.48,w*.62,4*scale,0,0,TAU);ctx.fill();
    const body=ctx.createLinearGradient(-w/2,-h/2,w/2,h/2);body.addColorStop(0,'#33414a');body.addColorStop(.5,'#11191f');body.addColorStop(1,'#05080b');ctx.fillStyle=body;roundRect(-w/2,-h/2,w,h,5*scale);ctx.fill();ctx.strokeStyle='rgba(194,216,219,.42)';ctx.lineWidth=.8;roundRect(-w/2,-h/2,w,h,5*scale);ctx.stroke();
    ctx.fillStyle='#05080a';roundRect(-w*.37,-h*.36,w*.31,h*.25,3*scale);ctx.fill();
    for(const [dx,dy,rr] of [[-.28,-.29,2.8],[-.13,-.29,2.4],[-.28,-.16,2.2]]){ctx.fillStyle='#101b21';ctx.beginPath();ctx.arc(w*dx,h*dy,rr*scale,0,TAU);ctx.fill();ctx.strokeStyle='rgba(120,154,160,.68)';ctx.lineWidth=.6;ctx.stroke();ctx.fillStyle='rgba(170,227,234,.36)';ctx.beginPath();ctx.arc(w*dx-.5*scale,h*dy-.5*scale,.7*scale,0,TAU);ctx.fill();}
    ctx.save();ctx.translate(0,h*.08);ctx.fillStyle=color;ctx.globalAlpha=.92;for(let i=0;i<3;i++){ctx.save();ctx.translate(0,(i-1)*4*scale);ctx.transform(1,0,-.32,1,0,0);ctx.fillRect(-5*scale,-1.15*scale,10*scale,2.3*scale);ctx.restore();}ctx.restore();ctx.restore();
  }
  function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  function drawPhoneLabel(x,y,claim,route,scale){
    const mobile=compactView(),short=S.h<520,width=mobile?118:clamp(S.w*.107,154,210),height=mobile?32:clamp(S.w*.027,39,51),domainFont=mobile?9:clamp(S.w/120,12,16),amountFont=mobile?8:clamp(S.w/144,10,13),minY=short?128:(mobile?204:168),maxY=S.h-(short?32:58);let cy=clamp(y-height*.15,minY,maxY),cx=clamp(x,width/2+8,S.w-width/2-8),box;
    const offsets=[0,-height-7,-2*(height+7),height+7,-3*(height+7),2*(height+7)];for(const off of offsets){const ty=clamp(cy+off,minY,maxY),candidate={l:cx-width/2,r:cx+width/2,t:ty-height,b:ty};if(!S.labelBoxes.some(b=>candidate.l<b.r+4&&candidate.r>b.l-4&&candidate.t<b.b+4&&candidate.b>b.t-4)){cy=ty;box=candidate;break;}}
    if(!box)return;S.labelBoxes.push(box);const color=COLORS[route];ctx.save();ctx.translate(cx,cy);const bg=ctx.createLinearGradient(-width/2,0,width/2,0);if(route==='summer'){bg.addColorStop(0,'rgba(6,35,54,.96)');bg.addColorStop(.48,'rgba(36,10,59,.97)');bg.addColorStop(1,'rgba(87,20,93,.95)');}else{bg.addColorStop(0,'rgba(53,13,64,.96)');bg.addColorStop(.55,'rgba(29,7,48,.98)');bg.addColorStop(1,'rgba(105,26,70,.95)');}ctx.fillStyle=bg;roundRect(-width/2,-height,width,height,mobile?5:7);ctx.fill();ctx.shadowColor=color;ctx.shadowBlur=8;ctx.strokeStyle=color;ctx.globalAlpha=.78;ctx.lineWidth=mobile?1:1.3;roundRect(-width/2,-height,width,height,mobile?5:7);ctx.stroke();ctx.shadowBlur=0;ctx.globalAlpha=1;ctx.fillStyle=COLORS.pink;ctx.fillRect(-width/2+7,-height+5,width*.22,mobile?2:3);ctx.fillStyle=color;ctx.fillRect(-width/2+5,-height+5,mobile?2:3,height-10);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff8e9';ctx.font=`italic 900 ${domainFont}px Archivo Black`;ctx.fillText(nameOf(claim),3,-height*.62,width-20);ctx.fillStyle=color;ctx.font=`700 ${amountFont}px Space Grotesk`;ctx.fillText(`${fmt.format(Number(claim.amount)||0)} SKR`,3,-height*.25,width-20);ctx.restore();
  }

  function announce(claim,route){ui.arrival.dataset.route=route;ui.arrivalName.textContent=nameOf(claim);ui.arrivalMeta.textContent=`${fmt.format(Number(claim.amount)||0)} SKR · ${route==='staking'?'STAKING CITY':'SUMMER CITY'}`;ui.arrival.classList.add('active');ui.arrival.classList.remove('flash');void ui.arrival.offsetWidth;ui.arrival.classList.add('flash');}
  function spawn(now){const compact=compactView(),cap=S.h<520?4:(compact?5:7),interval=compact?3100:2700;if(!S.queue.length||S.signals.length>=cap||now-S.lastSpawn<interval)return;const claim=S.queue.shift();if(routeOf(claim)==='pending')return;S.signals.push(new RoadPhone(claim));S.lastSpawn=now;}
  function enqueueInitial(claims){const explicit=claims.filter(c=>routeOf(c)!=='pending').slice(0,16);S.queue.push(...explicit);}
  function enqueueFresh(claims){for(const c of claims.slice().reverse()){const id=idOf(c);if(!S.seen.has(id)&&routeOf(c)!=='pending')S.queue.unshift(c);}for(const c of claims)S.seen.add(idOf(c));}

  async function fetchState(){
    try{const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw Error(`HTTP ${r.status}`);const data=await r.json(),claims=Array.isArray(data.claims)?data.claims:[],counts={summer:0,staking:0,pending:0};for(const c of claims)counts[routeOf(c)]++;
      ui.claimed.textContent=formatAmount(Number(data.claimed)||0);ui.claims.textContent=fmt.format(Number(data.claimCount)||0);ui.summerCount.textContent=counts.summer;ui.stakingCount.textContent=counts.staking;ui.pendingCount.textContent=counts.pending;ui.status.textContent='SOLANA TRAFFIC FLOWING';
      if(S.first){enqueueInitial(claims);for(const c of claims)S.seen.add(idOf(c));S.first=false;}else enqueueFresh(claims);
    }catch(e){console.error(e);ui.status.textContent='RECONNECTING TO SOLANA';}
  }

  function drawVignette(){const g=ctx.createRadialGradient(S.w*.5,S.h*.48,Math.min(S.w,S.h)*.2,S.w*.5,S.h*.52,Math.max(S.w,S.h)*.72);g.addColorStop(.45,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(12,2,24,.64)');ctx.fillStyle=g;ctx.fillRect(0,0,S.w,S.h);ctx.fillStyle='rgba(255,255,255,.018)';for(let y=0;y<S.h;y+=4)ctx.fillRect(0,y,S.w,.45);}
  function frame(now){const t=now*.001;S.mouseX=lerp(S.mouseX,S.targetX,.035);S.mouseY=lerp(S.mouseY,S.targetY,.035);ctx.setTransform(S.dpr,0,0,S.dpr,0,0);ctx.clearRect(0,0,S.w,S.h);drawSky(t);drawSkyline(t);drawRoads(t);drawCityGates();drawPalms(t);spawn(now);S.labelBoxes.length=0;S.hitTargets.length=0;S.signals=S.signals.filter(s=>s.draw(now));drawVignette();requestAnimationFrame(frame);}

  function hitAt(x,y){return S.hitTargets.findLast?.(h=>Math.hypot(x-h.x,y-h.y)<=h.r)||[...S.hitTargets].reverse().find(h=>Math.hypot(x-h.x,y-h.y)<=h.r);}
  addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);addEventListener('orientationchange',()=>setTimeout(resize,120));addEventListener('pointermove',e=>{S.targetX=(e.clientX/S.w-.5)*2;S.targetY=(e.clientY/S.h-.5)*2;canvas.style.cursor=hitAt(e.clientX,e.clientY)?'pointer':'default';});addEventListener('pointerleave',()=>{S.targetX=0;S.targetY=0;canvas.style.cursor='default';});canvas.addEventListener('pointerup',e=>{const hit=hitAt(e.clientX,e.clientY),url=hit?.claim?.solscan;if(typeof url==='string'&&url.startsWith('https://solscan.io/tx/'))window.open(url,'_blank','noopener,noreferrer');});
  resize();fetchState();setInterval(fetchState,20000);requestAnimationFrame(frame);
})();

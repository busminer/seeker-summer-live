(() => {
  'use strict';
  const canvas = document.getElementById('worldCanvas');
  const ctx = canvas.getContext('2d', { alpha:false });
  const crowdCanvas = document.createElement('canvas');
  const crowd = crowdCanvas.getContext('2d');
  const officialSeeker = new Image();
  officialSeeker.src = '/assets/official-seeker-detail.webp';
  const $ = id => document.getElementById(id);
  const ui={live:$('livePill'),claimed:$('claimedValue'),count:$('claimCountValue'),remaining:$('remainingValue'),percent:$('percentValue'),bar:$('progressBar'),population:$('populationLabel'),feed:$('claimFeed'),arrival:$('arrivalCard'),arrivalName:$('arrivalName'),arrivalAmount:$('arrivalAmount'),error:$('errorToast'),motion:$('motionButton')};
  const S={w:0,h:0,dpr:1,time:0,running:true,connected:false,initialized:false,population:0,stakingRatio:.6,seen:new Set(),queue:[],runners:[],residents:[],particles:[],lastSpawn:0,pointer:{x:-1,y:-1}};
  const fmt=new Intl.NumberFormat('en-US');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const hash=s=>[...(s||'')].reduce((n,c)=>((n<<5)-n+c.charCodeAt(0))|0,17);
  const rng=n=>{const x=Math.sin(n*999.91)*43758.5453;return x-Math.floor(x)};
  const shortWallet=w=>w?`${w.slice(0,4)}…${w.slice(-4)}`:'unknown';
  const displayName=c=>c.domain||shortWallet(c.claimer);
  const routeOf=c=>c.route==='staking'?'staking':'summer';
  const tier=a=>a>=10000?'SUN LEGEND':a>=3000?'LEVEL 3':a>=2000?'LEVEL 2':'LEVEL 1';
  const compact=v=>v>=1e6?`${(v/1e6).toFixed(v%1e6?2:0)}M`:fmt.format(v);
  const routeTitle=r=>r==='staking'?'STAKING CITY':'SUMMER CITY';

  function rr(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,Math.min(r,w/2,h/2));}
  function line(c,x1,y1,x2,y2){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}
  function resize(){const r=canvas.getBoundingClientRect();S.dpr=Math.min(devicePixelRatio||1,1.35);S.w=r.width;S.h=r.height;canvas.width=Math.round(S.w*S.dpr);canvas.height=Math.round(S.h*S.dpr);ctx.setTransform(S.dpr,0,0,S.dpr,0,0);crowdCanvas.width=Math.round(S.w*S.dpr);crowdCanvas.height=Math.round(S.h*S.dpr);crowd.setTransform(S.dpr,0,0,S.dpr,0,0);buildCrowd();}

  function buildCrowd(){
    crowd.clearRect(0,0,S.w,S.h);if(!S.population)return;
    const total=Math.min(S.population,6500),stake=Math.round(total*S.stakingRatio);
    for(let i=0;i<total;i++){
      const isStake=i<stake,center=S.w*(isStake?.74:.26),spread=S.w*(isStake?.19:.17);
      const x=center+(rng(i*11)-.5)*spread*2,y=S.h*(.37+rng(i*17)*.19);
      const palette=isStake?['#67ffd5','#ffd66d','#ec65ff','#8bdfff']:['#7fe4dc','#ffc48d','#ff8291'];
      crowd.globalAlpha=.08+rng(i*23)*.25;crowd.fillStyle=palette[i%palette.length];crowd.beginPath();crowd.arc(x,y,.4+rng(i)*.75,0,7);crowd.fill();
    }
    crowd.globalAlpha=1;
  }

  function drawSeekerPhone(c,x,y,s,seed,route='summer',front=false){
    c.save();c.translate(x,y);c.scale(s,s);c.rotate(Math.sin(S.time*.0018+seed)*.024);
    c.shadowColor='rgba(0,0,0,.35)';c.shadowBlur=12;c.shadowOffsetY=7;
    const metal=c.createLinearGradient(-24,-45,24,45);metal.addColorStop(0,'#738790');metal.addColorStop(.16,'#28383f');metal.addColorStop(.52,'#152329');metal.addColorStop(.83,'#40535b');metal.addColorStop(1,'#9baab0');
    c.fillStyle=metal;rr(c,-25,-49,50,98,10);c.fill();c.shadowBlur=0;
    c.strokeStyle=route==='staking'?'rgba(255,215,105,.9)':'rgba(110,255,220,.55)';c.lineWidth=1.4;rr(c,-23.5,-47.5,47,95,8.5);c.stroke();
    if(front){
      const screen=c.createLinearGradient(-18,-38,20,39);screen.addColorStop(0,'#073e52');screen.addColorStop(.5,'#553b9a');screen.addColorStop(1,'#ff9e63');c.fillStyle=screen;rr(c,-20,-42,40,83,7);c.fill();c.fillStyle='rgba(255,255,255,.17)';rr(c,-15,-35,30,11,4);c.fill();c.fillStyle='#67ffd5';c.font='700 7px Space Grotesk';c.textAlign='center';c.fillText('SEEKER',0,30);
    }else{
      // Official Seeker rear layout: dual-camera pill, separate large lens, adjacent flash.
      c.fillStyle='#10191e';rr(c,-20,-35,17,31,7);c.fill();c.strokeStyle='rgba(180,205,215,.38)';c.lineWidth=1;rr(c,-19,-34,15,29,6);c.stroke();
      const lens=(lx,ly,r,shine)=>{c.fillStyle='#020608';c.beginPath();c.arc(lx,ly,r,0,7);c.fill();c.strokeStyle='#65777e';c.lineWidth=1.4;c.stroke();c.fillStyle=shine;c.globalAlpha=.65;c.beginPath();c.arc(lx-1.5,ly-1.5,Math.max(1.5,r*.3),0,7);c.fill();c.globalAlpha=1;};
      lens(-11.5,-26,5.4,'#87e7ff');lens(-11.5,-13,5.4,'#65ffd3');lens(8,-32,7.3,'#b6c4d4');
      c.fillStyle='#e8d8a0';c.beginPath();c.arc(8,-14,2.7,0,7);c.fill();
      // Seed Vault panel / emblem from official rear render.
      const vault=c.createLinearGradient(-10,4,11,35);vault.addColorStop(0,'#111a20');vault.addColorStop(1,'#05090c');c.fillStyle=vault;rr(c,-12,5,24,31,5);c.fill();c.strokeStyle='rgba(167,196,205,.25)';rr(c,-11,6,22,29,4);c.stroke();
      c.strokeStyle=route==='staking'?'#ffd56c':'#6dffdc';c.lineWidth=1.5;c.beginPath();c.arc(0,16,5,0,7);c.stroke();c.beginPath();c.arc(-2,16,2,0,7);c.stroke();
      c.fillStyle='rgba(255,255,255,.28)';c.font='700 5px Space Grotesk';c.textAlign='center';c.fillText('SEED VAULT',0,29);
    }
    c.restore();
  }

  function drawTag(x,y,claim,mode='runner'){
    const title=displayName(claim),amount=`${fmt.format(Number(claim.amount)||0)} SKR`,route=routeOf(claim),mobile=S.w<700,resident=mode==='resident';
    const titleSize=resident?(mobile?6.5:8.5):(mobile?9:11),amountSize=mobile?10:12,combined=`${title} · ${amount}`;
    ctx.save();ctx.font=`700 ${titleSize}px Space Grotesk`;
    const maxW=resident?(mobile?126:176):(mobile?154:220),width=clamp((resident?ctx.measureText(combined).width:Math.max(ctx.measureText(title).width,ctx.measureText(amount).width))+(resident?12:24),resident?76:94,maxW);
    const h=resident?(mobile?15:18):(mobile?34:39),px=clamp(x-width/2,5,S.w-width-5),py=clamp(y-h,5,S.h-h-5);
    ctx.fillStyle=route==='staking'?'rgba(24,18,38,.92)':'rgba(3,27,35,.9)';rr(ctx,px,py,width,h,resident?3:5);ctx.fill();ctx.strokeStyle=route==='staking'?'rgba(255,213,105,.9)':'rgba(102,255,209,.65)';ctx.lineWidth=1;rr(ctx,px,py,width,h,resident?3:5);ctx.stroke();
    ctx.textAlign='center';ctx.textBaseline='middle';
    if(resident){let fs=titleSize;ctx.font=`700 ${fs}px Space Grotesk`;while(fs>5&&ctx.measureText(combined).width>width-8){fs-=.5;ctx.font=`700 ${fs}px Space Grotesk`;}ctx.fillStyle='#fff8df';ctx.fillText(combined,px+width/2,py+h/2+.5);}
    else{let fs=titleSize;ctx.font=`700 ${fs}px Space Grotesk`;while(fs>6.5&&ctx.measureText(title).width>width-10){fs-=.5;ctx.font=`700 ${fs}px Space Grotesk`;}ctx.fillStyle='#fff8df';ctx.fillText(title,px+width/2,py+(mobile?10:12));ctx.fillStyle=route==='staking'?'#ffd56c':'#67ffd5';ctx.font=`800 ${amountSize}px Space Grotesk`;ctx.fillText(amount,px+width/2,py+(mobile?24:28));}
    ctx.restore();return {x:px,y:py,w:width,h};
  }

  class Runner{
    constructor(claim){this.claim=claim;this.route=routeOf(claim);this.seed=Math.abs(hash(claim.signature));this.t=0;this.duration=6000+(this.seed%1700);this.bounds=null;}
    update(dt){this.t+=dt/this.duration;if(this.t>=1){this.t=1;arrive(this);return true;}return false;}
    draw(){
      const q=ease(this.t),startX=S.w*.5,startY=S.h*.965,forkY=S.h*.74,targetX=S.w*(this.route==='staking'?.73:.27),targetY=S.h*.555;
      const x=this.t<.38?lerp(startX,S.w*.5,ease(this.t/.38)):lerp(S.w*.5,targetX,ease((this.t-.38)/.62));
      const y=lerp(startY,targetY,q),scale=lerp(S.w<700?1.12:1.72,.17,q),step=Math.sin(S.time*.017+this.seed)*(1-q);
      ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.strokeStyle='#07151a';ctx.lineWidth=4;ctx.lineCap='round';line(ctx,-10,37,-15+step*9,57);line(ctx,10,37,15-step*9,57);line(ctx,-23,-4,-34,10+step*8);line(ctx,23,-4,34,10-step*8);ctx.restore();
      drawSeekerPhone(ctx,x,y,scale,this.seed,this.route,false);
      const tag=drawTag(x,y-58*scale-8,this.claim,'runner');this.bounds={x:Math.min(tag.x,x-28*scale),y:tag.y,w:Math.max(tag.w,56*scale),h:y+55*scale-tag.y};
    }
  }

  class Resident{
    constructor(claim,index){this.claim=claim;this.route=routeOf(claim);this.seed=Math.abs(hash(claim.signature));this.phase=rng(this.seed)*Math.PI*2;this.index=index;}
    draw(slot,total){
      const stake=this.route==='staking',mobile=S.w<700,centerX=S.w*(stake?.74:.26),baseY=S.h*(stake?.515:.535),rx=S.w*(stake?.145:.125),t=S.time*.00023*(stake?1.25:1)+(this.phase),lane=slot-(total-1)/2;
      // One label lane per visible citizen keeps every full domain + SKR amount readable.
      const x=centerX+Math.cos(t+this.index*.37)*rx*(mobile?.72:.9),y=baseY+lane*(mobile?19:20)+Math.sin(t*1.2+this.index*.41)*1.5;
      const front=(this.index+Math.floor(S.time/1600))%5===0,scale=(mobile?.078:.082)+slot*.004;
      // Running citizens remain visible inside their correct city.
      ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.strokeStyle='#07151a';ctx.lineWidth=4;const step=Math.sin(S.time*.018+this.seed)*8;line(ctx,-10,37,-14+step,55);line(ctx,10,37,14-step,55);ctx.restore();
      drawSeekerPhone(ctx,x,y,scale,this.seed,this.route,front);drawTag(x,y-11,this.claim,'resident');
    }
  }

  function arrive(r){announce(r.claim);burst(S.w*(r.route==='staking'?.73:.27),S.h*.555,r.route==='staking'?45:170,26);S.residents.push(new Resident(r.claim,S.residents.length));if(S.residents.length>32)S.residents.shift();}
  function burst(x,y,hue,n){for(let i=0;i<n;i++)S.particles.push({x,y,vx:(rng(i+S.time)-.5)*6,vy:-2-rng(i*3+S.time)*5,life:900+rng(i*4)*800,age:0,hue:i%3?hue:45,size:2+rng(i)*4});}
  function updateParticles(dt){for(const p of S.particles){p.age+=dt;p.x+=p.vx*dt*.06;p.y+=p.vy*dt*.06;p.vy+=dt*.012;}S.particles=S.particles.filter(p=>p.age<p.life);}
  function drawParticles(){for(const p of S.particles){ctx.globalAlpha=1-p.age/p.life;ctx.fillStyle=`hsl(${p.hue} 90% 64%)`;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.age*.01);ctx.fillRect(-p.size,-p.size/2,p.size*2,p.size);ctx.restore();}ctx.globalAlpha=1;}

  function drawSky(){
    const w=S.w,h=S.h,t=S.time;let g=ctx.createLinearGradient(0,0,0,h*.57);g.addColorStop(0,'#031520');g.addColorStop(.4,'#075466');g.addColorStop(.72,'#e75f79');g.addColorStop(1,'#ffc56f');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    const sx=w*.5,sy=h*.19,sr=Math.min(w,h)*.075;let glow=ctx.createRadialGradient(sx,sy,3,sx,sy,sr*2.8);glow.addColorStop(0,'#fff8ce');glow.addColorStop(.3,'rgba(255,214,117,.75)');glow.addColorStop(1,'rgba(255,100,90,0)');ctx.fillStyle=glow;ctx.fillRect(sx-sr*3,sy-sr*3,sr*6,sr*6);ctx.fillStyle='#ffe19a';ctx.beginPath();ctx.arc(sx,sy,sr,0,7);ctx.fill();
    for(let i=0;i<7;i++){const x=(t*.014+i*191)%(w+80)-40,y=h*(.1+(i%4)*.034);ctx.strokeStyle='rgba(251,243,211,.6)';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(x-4,y,5,Math.PI*1.08,Math.PI*1.92);ctx.arc(x+4,y,5,Math.PI*1.08,Math.PI*1.92);ctx.stroke();}
  }

  function drawCityBase(centerX,width,base,premium){
    ctx.fillStyle=premium?'rgba(25,32,58,.88)':'rgba(20,58,62,.9)';ctx.beginPath();ctx.moveTo(centerX-width*.55,base);ctx.quadraticCurveTo(centerX,base-S.h*(premium?.14:.09),centerX+width*.55,base);ctx.closePath();ctx.fill();
    const count=premium?11:7;for(let i=0;i<count;i++){const bw=width*(premium?.065:.085),gap=width/count,x=centerX-width*.46+i*gap,bh=S.h*((premium?.07:.045)+rng(i+(premium?70:20))*(premium?.15:.08));const bg=ctx.createLinearGradient(x,base-bh,x,base);bg.addColorStop(0,premium?(i%2?'#6b3c8c':'#245e77'):'#35636a');bg.addColorStop(1,'#102b35');ctx.fillStyle=bg;rr(ctx,x,base-bh,bw,bh,3);ctx.fill();ctx.fillStyle=premium?(i%2?'#ffd56c':'#68ffd9'):'#9be7d3';for(let yy=base-bh+8;yy<base-6;yy+=9)for(let xx=x+6;xx<x+bw-4;xx+=9){ctx.globalAlpha=.22+.3*Math.sin(S.time*.002+i+xx);ctx.fillRect(xx,yy,2.5,3.5);}ctx.globalAlpha=1;}
  }
  function citySign(x,y,text,premium){ctx.save();ctx.shadowColor=premium?'#dd64ff':'#67ffd5';ctx.shadowBlur=premium?18:8;ctx.fillStyle=premium?'rgba(27,15,47,.92)':'rgba(4,30,35,.9)';const w=clamp(ctx.measureText(text).width+30,145,270);rr(ctx,x-w/2,y,w,25,4);ctx.fill();ctx.strokeStyle=premium?'#ffd56c':'#67ffd5';ctx.lineWidth=1.5;rr(ctx,x-w/2,y,w,25,4);ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#fff7db';ctx.font=`700 ${S.w<700?7:10}px Archivo Black`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,y+12.5);ctx.restore();}
  function drawSummerCity(){
    const x=S.w*.26,w=S.w*.38,base=S.h*.515;drawCityBase(x,w,base,false);
    // Modest beach city: small wheel, huts, pool, umbrellas.
    drawFerris(x-w*.36,base-S.h*.045,Math.min(S.w,S.h)*.055,false);
    ctx.fillStyle='#65dfce';rr(ctx,x-w*.15,base-S.h*.03,w*.28,S.h*.022,8);ctx.fill();
    for(let i=0;i<4;i++){ctx.fillStyle=i%2?'#ff7e8f':'#ffd174';ctx.beginPath();ctx.arc(x-w*.25+i*w*.15,base+7,10,Math.PI,0);ctx.fill();}
    citySign(x,base-S.h*.145,'SEEKER SUMMER CITY',false);
  }
  function drawStakingCity(){
    const x=S.w*.74,w=S.w*.42,base=S.h*.505;drawCityBase(x,w,base,true);
    // Official Seeker product landmark from solanamobile.com.
    if(officialSeeker.complete&&officialSeeker.naturalWidth){ctx.save();ctx.globalAlpha=.28;ctx.beginPath();ctx.roundRect(x-w*.15,base-S.h*.23,w*.3,S.h*.18,8);ctx.clip();ctx.drawImage(officialSeeker,x-w*.15,base-S.h*.23,w*.3,S.h*.18);ctx.restore();}
    drawFerris(x-w*.39,base-S.h*.07,Math.min(S.w,S.h)*.078,true);drawSlides(x+w*.22,base-S.h*.105,Math.min(S.w,S.h)*.083);drawCoaster(x+w*.02,base-S.h*.01,w*.38,S.h*.07);drawTower(x+w*.43,base,S.h*.18);
    // Golden skybridge and premium crown.
    ctx.strokeStyle='#ffd56c';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,base-S.h*.12,w*.15,Math.PI,0);ctx.stroke();ctx.fillStyle='#ffd56c';ctx.beginPath();ctx.moveTo(x-17,base-S.h*.2);ctx.lineTo(x,base-S.h*.24);ctx.lineTo(x+17,base-S.h*.2);ctx.closePath();ctx.fill();
    citySign(x,base-S.h*.185,'SEEKER SUMMER STAKING CITY',true);
  }
  function drawFerris(x,y,r,premium){ctx.save();ctx.translate(x,y);ctx.strokeStyle=premium?'#ffd56c':'#67e5d1';ctx.lineWidth=premium?3:2;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.stroke();for(let i=0;i<10;i++){const a=S.time*.00013+i*Math.PI/5;line(ctx,0,0,Math.cos(a)*r,Math.sin(a)*r);ctx.fillStyle=i%2?'#ff6484':premium?'#e86cff':'#ffd16c';ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*r,premium?5:4,0,7);ctx.fill();}ctx.strokeStyle='#15333b';ctx.lineWidth=6;line(ctx,-r*.48,r*1.2,0,0);line(ctx,r*.48,r*1.2,0,0);ctx.restore();}
  function drawSlides(x,y,r){ctx.save();ctx.translate(x,y);ctx.strokeStyle='#ff6688';ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(0,-r);ctx.bezierCurveTo(-r*1.2,-r*.15,r*.8,r*.25,-r*.5,r*1.1);ctx.stroke();ctx.strokeStyle='#68ffd9';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(r*.35,-r*.9);ctx.bezierCurveTo(r*1.1,-r*.1,-r*.4,r*.4,r*.25,r*1.1);ctx.stroke();ctx.fillStyle='#ffd56c';rr(ctx,-r*.4,-r*1.2,r*.95,r*.25,4);ctx.fill();ctx.restore();}
  function drawCoaster(x,y,w,h){ctx.save();ctx.translate(x,y);ctx.strokeStyle='#ffd56c';ctx.lineWidth=3;ctx.beginPath();for(let i=0;i<=24;i++){const px=-w/2+i*w/24,py=Math.sin(i*.65)*h*.35-Math.cos(i*.22)*h*.35;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();const carX=(S.time*.02%w)-w/2,carY=Math.sin(((carX+w/2)/w*24)*.65)*h*.35-Math.cos(((carX+w/2)/w*24)*.22)*h*.35;ctx.fillStyle='#ec557a';rr(ctx,carX-10,carY-5,20,9,3);ctx.fill();ctx.restore();}
  function drawTower(x,y,h){ctx.fillStyle='#182f3d';ctx.fillRect(x-4,y-h,8,h);ctx.fillStyle='#68ffd9';ctx.beginPath();ctx.arc(x,y-h,9,0,7);ctx.fill();const py=y-h*.5+Math.sin(S.time*.002)*h*.28;ctx.fillStyle='#ffd56c';rr(ctx,x-21,py,42,7,3);ctx.fill();}

  function drawWaterSand(){
    const w=S.w,h=S.h,top=h*.51,shore=h*.68;let sea=ctx.createLinearGradient(0,top,0,shore);sea.addColorStop(0,'rgba(14,74,91,.9)');sea.addColorStop(1,'#08798b');ctx.fillStyle=sea;ctx.fillRect(0,top,w,shore-top+8);
    for(let row=0;row<11;row++){const y=top+row*(shore-top)/10;ctx.strokeStyle=`rgba(125,255,223,${.06+row*.01})`;ctx.lineWidth=1;ctx.beginPath();for(let x=-20;x<w+20;x+=16){const yy=y+Math.sin(x*.025+S.time*.001+row)*2.5;x===-20?ctx.moveTo(x,yy):ctx.lineTo(x,yy);}ctx.stroke();}
    let sand=ctx.createLinearGradient(0,shore,0,h);sand.addColorStop(0,'#ffd47c');sand.addColorStop(.5,'#d99761');sand.addColorStop(1,'#9b5e58');ctx.fillStyle=sand;ctx.beginPath();ctx.moveTo(0,shore);for(let x=0;x<=w;x+=24)ctx.lineTo(x,shore+Math.sin(x*.03+S.time*.001)*3);ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.fill();
  }
  function drawForkRoad(){
    const w=S.w,h=S.h,startX=w*.5,bottom=h,forkY=h*.75,leftX=w*.27,rightX=w*.73,targetY=h*.555;
    ctx.fillStyle='rgba(28,48,52,.94)';ctx.beginPath();ctx.moveTo(w*.38,bottom);ctx.lineTo(w*.62,bottom);ctx.lineTo(w*.54,forkY);ctx.lineTo(w*.5,forkY-h*.015);ctx.lineTo(w*.46,forkY);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(w*.46,forkY);ctx.lineTo(w*.5,forkY-h*.015);ctx.lineTo(leftX+w*.028,targetY);ctx.lineTo(leftX-w*.028,targetY);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(w*.5,forkY-h*.015);ctx.lineTo(w*.54,forkY);ctx.lineTo(rightX+w*.028,targetY);ctx.lineTo(rightX-w*.028,targetY);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(255,224,144,.58)';ctx.lineWidth=2;line(ctx,w*.38,bottom,w*.46,forkY);line(ctx,w*.62,bottom,w*.54,forkY);line(ctx,w*.46,forkY,leftX-w*.028,targetY);line(ctx,w*.5,forkY-h*.015,leftX+w*.028,targetY);line(ctx,w*.5,forkY-h*.015,rightX-w*.028,targetY);line(ctx,w*.54,forkY,rightX+w*.028,targetY);
    for(let i=0;i<10;i++){const p=(i/10+S.time*.00009)%1,q=p*p,y=lerp(bottom,forkY,q),half=lerp(w*.05,w*.012,q);ctx.strokeStyle=`rgba(255,219,129,${.15+q*.5})`;ctx.lineWidth=1+q*3;line(ctx,startX-half,y,startX+half,y);}
    ctx.fillStyle='rgba(4,25,31,.84)';rr(ctx,w*.5-77,forkY+12,154,24,4);ctx.fill();ctx.fillStyle='#fff5d8';ctx.font='700 8px Space Grotesk';ctx.textAlign='center';ctx.fillText('CLAIM  ←     ROUTE     →  STAKE',w*.5,forkY+27);
  }
  function drawForeground(){drawPalm(S.w*.04,S.h*.88,1.2);drawPalm(S.w*.96,S.h*.9,-1.3);let v=ctx.createRadialGradient(S.w*.5,S.h*.48,Math.min(S.w,S.h)*.2,S.w*.5,S.h*.5,Math.max(S.w,S.h)*.72);v.addColorStop(.56,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,8,14,.58)');ctx.fillStyle=v;ctx.fillRect(0,0,S.w,S.h);}
  function drawPalm(x,y,s){ctx.save();ctx.translate(x,y);ctx.scale(s,Math.abs(s));ctx.strokeStyle='#102b2d';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(0,80);ctx.quadraticCurveTo(10,5,-4,-82);ctx.stroke();ctx.strokeStyle='#144c42';ctx.lineWidth=9;for(let i=0;i<8;i++){const a=-2.9+i*.43;ctx.beginPath();ctx.moveTo(-4,-80);ctx.quadraticCurveTo(Math.cos(a)*50,-100+Math.sin(a)*25,Math.cos(a)*82,-72+Math.sin(a)*55);ctx.stroke();}ctx.restore();}

  let last=performance.now();
  function frame(now){const dt=Math.min(40,now-last);last=now;if(S.running){S.time+=dt;const mobile=S.w<700,spawnGap=mobile?1800:1650,runnerCap=3;if(S.queue.length&&S.runners.length<runnerCap&&now-S.lastSpawn>spawnGap){S.lastSpawn=now;S.runners.push(new Runner(S.queue.shift()));}S.runners=S.runners.filter(r=>!r.update(dt));updateParticles(dt);}drawSky();drawSummerCity();drawStakingCity();drawWaterSand();ctx.drawImage(crowdCanvas,0,0,S.w*S.dpr,S.h*S.dpr,0,0,S.w,S.h);const cityCap=S.w<700?3:5;['summer','staking'].forEach(route=>{const citizens=S.residents.filter(r=>r.route===route).slice(-cityCap);citizens.forEach((r,i)=>r.draw(i,citizens.length));});drawForkRoad();drawParticles();S.runners.forEach(r=>r.draw());drawForeground();requestAnimationFrame(frame);}

  function announce(c){ui.arrivalName.textContent=displayName(c);ui.arrivalAmount.textContent=`${fmt.format(Number(c.amount)||0)} SKR · ${routeTitle(routeOf(c))}`;ui.arrival.classList.remove('pop');void ui.arrival.offsetWidth;ui.arrival.classList.add('pop');setTimeout(()=>ui.arrival.classList.remove('pop'),500);}
  function escapeHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
  function escapeAttr(s){return String(s||'').replace(/["<>]/g,'');}
  function renderFeed(claims){ui.feed.innerHTML=claims.slice(0,12).map(c=>{const d=new Date(c.blockTime*1000),time=Number.isFinite(d.getTime())?d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'just now',route=routeOf(c);return `<a class="claim-card ${route==='staking'?'is-staked':''}" href="${escapeAttr(c.solscan)}" target="_blank" rel="noopener"><span class="claim-tier">${route==='staking'?'STAKED':'CLAIMED'} · ${time}</span><i class="mini-phone" aria-hidden="true"></i><strong>${escapeHtml(displayName(c))}</strong><b>+${fmt.format(Number(c.amount)||0)} SKR</b><small>${routeTitle(route)} ↗</small></a>`;}).join('')||'<div class="feed-empty">No confirmed claims yet.</div>';}
  function applyData(data){
    ui.claimed.textContent=compact(data.claimed);ui.count.textContent=fmt.format(data.claimCount);ui.remaining.textContent=compact(data.remaining);ui.percent.textContent=`${Number(data.percent).toFixed(1)}%`;ui.bar.style.width=`${clamp(data.percent,0,100)}%`;ui.population.textContent=`${fmt.format(data.claimCount)} CLAIMERS · TWO ON-CHAIN CITIES`;renderFeed(data.claims||[]);
    const routed=(data.claims||[]).filter(c=>c.route==='staking'||c.route==='summer'),stake=routed.filter(c=>c.route==='staking').length;const nextRatio=routed.length?stake/routed.length:S.stakingRatio;
    if(S.population!==data.claimCount||Math.abs(nextRatio-S.stakingRatio)>.04){S.population=data.claimCount;S.stakingRatio=nextRatio;buildCrowd();}
    const claims=(data.claims||[]).filter(c=>c.route!=='unknown');
    if(!S.initialized){(data.claims||[]).forEach(c=>S.seen.add(c.signature));S.queue.push(...claims.slice(0,7).reverse());S.residents=claims.slice(7,32).map((c,i)=>new Resident(c,i));if(claims[0])announce(claims[0]);S.initialized=true;}
    else claims.filter(c=>!S.seen.has(c.signature)).reverse().forEach(c=>{S.seen.add(c.signature);S.queue.push(c);});
    setConnected(true);
  }
  function setConnected(ok){S.connected=ok;ui.live.classList.toggle('is-live',ok);ui.live.querySelector('span').textContent=ok?'LIVE':'RECONNECTING';ui.error.classList.toggle('show',!ok);}
  async function poll(){try{const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw Error(`HTTP ${r.status}`);applyData(await r.json());}catch(e){console.warn('Live feed:',e.message);setConnected(false);}finally{setTimeout(poll,S.connected?4200:7000);}}
  ui.motion.addEventListener('click',()=>{S.running=!S.running;ui.motion.textContent=S.running?'Ⅱ':'▶';ui.motion.setAttribute('aria-pressed',String(!S.running));});
  canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();S.pointer={x:e.clientX-r.left,y:e.clientY-r.top};const hit=S.runners.some(a=>a.bounds&&S.pointer.x>=a.bounds.x&&S.pointer.x<=a.bounds.x+a.bounds.w&&S.pointer.y>=a.bounds.y&&S.pointer.y<=a.bounds.y+a.bounds.h);canvas.style.cursor=hit?'pointer':'default';});
  canvas.addEventListener('click',()=>{const hit=[...S.runners].reverse().find(a=>a.bounds&&S.pointer.x>=a.bounds.x&&S.pointer.x<=a.bounds.x+a.bounds.w&&S.pointer.y>=a.bounds.y&&S.pointer.y<=a.bounds.y+a.bounds.h);if(hit)window.open(hit.claim.solscan,'_blank','noopener');});
  addEventListener('resize',resize,{passive:true});resize();requestAnimationFrame(frame);poll();
})();

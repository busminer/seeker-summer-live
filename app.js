(() => {
  'use strict';
  const canvas = document.getElementById('worldCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const populationCanvas = document.createElement('canvas');
  const pctx = populationCanvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const ui = { live:$('livePill'),claimed:$('claimedValue'),count:$('claimCountValue'),remaining:$('remainingValue'),percent:$('percentValue'),bar:$('progressBar'),population:$('populationLabel'),feed:$('claimFeed'),arrival:$('arrivalCard'),arrivalName:$('arrivalName'),arrivalAmount:$('arrivalAmount'),error:$('errorToast'),motion:$('motionButton') };
  const S = { w:0,h:0,dpr:1,time:0,running:true,connected:false,initialized:false,population:0,seen:new Set(),queue:[],runners:[],residents:[],particles:[],lastSpawn:0,pointer:{x:-1,y:-1},latest:null };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = new Intl.NumberFormat('en-US');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
  const hash=s=>[...(s||'')].reduce((n,c)=>((n<<5)-n+c.charCodeAt(0))|0,17);
  const tier=a=>a>=10000?'SUN LEGEND':a>=3000?'LEVEL 3':a>=2000?'LEVEL 2':'LEVEL 1';
  const compact=v=>v>=1e6?`${(v/1e6).toFixed(v%1e6?2:0)}M`:fmt.format(v);
  const shortWallet=w=>w?`${w.slice(0,4)}…${w.slice(-4)}`:'unknown';
  const displayName=c=>c.domain||shortWallet(c.claimer);
  const rng=n=>{let x=Math.sin(n*999.91)*43758.5453;return x-Math.floor(x)};

  function resize(){
    const r=canvas.getBoundingClientRect(); S.dpr=Math.min(devicePixelRatio||1,1.5);S.w=r.width;S.h=r.height;
    canvas.width=Math.round(S.w*S.dpr);canvas.height=Math.round(S.h*S.dpr);ctx.setTransform(S.dpr,0,0,S.dpr,0,0);
    populationCanvas.width=Math.round(S.w*S.dpr);populationCanvas.height=Math.round(S.h*S.dpr);pctx.setTransform(S.dpr,0,0,S.dpr,0,0);
    buildPopulation();
  }
  function rr(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,Math.min(r,w/2,h/2));}
  function line(c,x1,y1,x2,y2){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}
  function bezierPoint(a,b,c,d,t){const u=1-t;return u*u*u*a+3*u*u*t*b+3*u*t*t*c+t*t*t*d;}

  function buildPopulation(){
    pctx.clearRect(0,0,S.w,S.h);if(!S.population)return;
    const count=Math.min(S.population,7000), cityTop=S.h*.31, cityBottom=S.h*.535;
    for(let i=0;i<count;i++){
      const zone=rng(i*7+2),x=zone<.58?S.w*(.22+rng(i*11)*.56):S.w*(.08+rng(i*13)*.84);
      const y=zone<.58?cityTop+rng(i*17)*(cityBottom-cityTop):S.h*(.56+rng(i*19)*.1);
      const size=zone<.58?.38+rng(i)*.62:.48+rng(i)*.72;
      const colors=['#66ffd1','#ffcf67','#ff6684','#84d9ff','#e753db'];
      pctx.globalAlpha=.09+rng(i*23)*.28;pctx.fillStyle=colors[i%colors.length];pctx.beginPath();pctx.arc(x,y,size,0,7);pctx.fill();
    }
    pctx.globalAlpha=1;
  }

  function drawPhone(c,x,y,s,seed,front=false,alpha=1){
    c.save();c.globalAlpha=alpha;c.translate(x,y);c.scale(s,s);c.rotate(Math.sin(S.time*.0015+seed)*.025);
    c.shadowColor='rgba(0,0,0,.28)';c.shadowBlur=12;c.shadowOffsetY=7;
    const body=c.createLinearGradient(-24,-45,24,45);body.addColorStop(0,'#242c31');body.addColorStop(.48,'#11191e');body.addColorStop(1,'#303a3e');
    c.fillStyle=body;rr(c,-25,-48,50,96,11);c.fill();c.shadowBlur=0;
    c.strokeStyle='rgba(180,255,237,.28)';c.lineWidth=1.3;rr(c,-23,-46,46,92,9);c.stroke();
    if(front){
      const screen=c.createLinearGradient(-18,-37,18,36);screen.addColorStop(0,'#0d5c68');screen.addColorStop(.5,'#9a3fd0');screen.addColorStop(1,'#ff9d62');
      c.fillStyle=screen;rr(c,-20,-40,40,79,7);c.fill();c.fillStyle='rgba(255,255,255,.16)';rr(c,-15,-34,30,12,4);c.fill();
    }else{
      c.fillStyle='#070d10';rr(c,-19,-41,24,31,8);c.fill();
      c.fillStyle='#233139';c.beginPath();c.arc(-12,-33,6.7,0,7);c.fill();c.beginPath();c.arc(-1,-22,6.7,0,7);c.fill();
      c.fillStyle='#76ffdc';c.beginPath();c.arc(-12,-33,3.2,0,7);c.fill();c.fillStyle='#adccff';c.beginPath();c.arc(-1,-22,3.2,0,7);c.fill();
      c.fillStyle='#ffd268';c.beginPath();c.arc(-2,-34,2.2,0,7);c.fill();
      // Solana-style three-bar mark
      const g=c.createLinearGradient(-8,6,10,20);g.addColorStop(0,'#68ffd4');g.addColorStop(1,'#b84feb');c.fillStyle=g;
      for(let i=0;i<3;i++){c.save();c.translate(0,5+i*7);if(i===1)c.scale(-1,1);c.beginPath();c.moveTo(-9,0);c.lineTo(8,0);c.lineTo(4,4);c.lineTo(-13,4);c.closePath();c.fill();c.restore();}
      c.fillStyle='rgba(255,255,255,.13)';c.font='700 5px Space Grotesk';c.textAlign='center';c.fillText('SEEKER',0,35);
    }
    c.restore();
  }

  class Runner{
    constructor(claim){this.claim=claim;this.seed=Math.abs(hash(claim.signature));this.t=0;this.duration=5600+(this.seed%1900);this.bounds=null;this.lane=(this.seed%3-1)*.17;}
    update(dt){this.t+=dt/this.duration;if(this.t>=1){this.t=1;arrive(this);return true;}return false;}
    draw(){
      const q=ease(this.t),vx=S.w*.5,vy=S.h*.545;
      const sx=S.w*(.5+this.lane),sy=S.h*.96;
      const curve=Math.sin(q*Math.PI)*this.lane*S.w*.4;
      const x=lerp(sx,vx,q)+curve,y=lerp(sy,vy,q),scale=lerp(S.w<700?1.18:1.8,.16,q);
      const run=Math.sin(S.time*.015+this.seed)*(1-q);
      // legs / arms, visible while large
      if(scale>.35){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.strokeStyle='#08171c';ctx.lineWidth=4;ctx.lineCap='round';line(ctx,-10,35,-15+run*9,55);line(ctx,10,35,15-run*9,55);line(ctx,-23,-4,-34,10+run*8);line(ctx,23,-4,34,10-run*8);ctx.restore();}
      drawPhone(ctx,x,y,scale,this.seed,false);
      if(this.t<.72){
        const label=displayName(this.claim);ctx.save();ctx.font='700 11px Space Grotesk';const tw=Math.min(160,ctx.measureText(label).width+22);ctx.fillStyle='rgba(4,21,28,.9)';rr(ctx,clamp(x-tw/2,6,S.w-tw-6),y-70*scale-28,tw,24,4);ctx.fill();ctx.fillStyle='#fff6db';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label.length>20?label.slice(0,18)+'…':label,clamp(x,S.w<tw/2?tw/2:S.w-tw/2),y-70*scale-16);ctx.restore();
      }
      if(this.t<.15){ctx.save();ctx.fillStyle='#fff5ca';ctx.strokeStyle='#061820';ctx.lineWidth=2;rr(ctx,x-40,y-118*scale,80,22,4);ctx.fill();ctx.stroke();ctx.fillStyle='#071923';ctx.font='700 10px Space Grotesk';ctx.textAlign='center';ctx.fillText(`+${fmt.format(this.claim.amount)} SKR`,x,y-103*scale);ctx.restore();}
      this.bounds={x:x-35*scale,y:y-55*scale,w:70*scale,h:120*scale};
    }
  }

  class Resident{
    constructor(claim,index){this.claim=claim;this.seed=Math.abs(hash(claim.signature));this.activity=['swim','ferris','slide','surf','volley','boat','dance'][this.seed%7];this.phase=rng(this.seed)*10;this.index=index;}
    draw(){const t=S.time*.001+this.phase;switch(this.activity){
      case'swim':return drawSwimmer(this,t);case'ferris':return drawFerrisRider(this,t);case'slide':return drawSlider(this,t);case'surf':return drawSurfer(this,t);case'volley':return drawVolley(this,t);case'boat':return drawBoatRider(this,t);default:return drawDancer(this,t);
    }}
  }

  function arrive(r){
    announce(r.claim);burst(S.w*.5,S.h*.545,r.claim.amount>=3000?330:170,24);S.residents.push(new Resident(r.claim,S.residents.length));if(S.residents.length>42)S.residents.shift();
  }
  function burst(x,y,hue,n){for(let i=0;i<n;i++)S.particles.push({x,y,vx:(rng(i+S.time)-.5)*6,vy:-2-rng(i*3+S.time)*5,life:900+rng(i*4)*800,age:0,hue:i%3?hue:45,size:2+rng(i)*4});}
  function updateParticles(dt){for(const p of S.particles){p.age+=dt;p.x+=p.vx*dt*.06;p.y+=p.vy*dt*.06;p.vy+=dt*.012;}S.particles=S.particles.filter(p=>p.age<p.life);}
  function drawParticles(){for(const p of S.particles){ctx.globalAlpha=1-p.age/p.life;ctx.fillStyle=`hsl(${p.hue} 90% 64%)`;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.age*.01);ctx.fillRect(-p.size,-p.size/2,p.size*2,p.size);ctx.restore();}ctx.globalAlpha=1;}

  function drawSky(){
    const w=S.w,h=S.h,t=S.time;
    let g=ctx.createLinearGradient(0,0,0,h*.52);g.addColorStop(0,'#041725');g.addColorStop(.46,'#096071');g.addColorStop(.77,'#f05f73');g.addColorStop(1,'#ffc46b');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    const sx=w*.78,sy=h*.2,sr=Math.min(w,h)*.095;let glow=ctx.createRadialGradient(sx,sy,2,sx,sy,sr*2.5);glow.addColorStop(0,'#fff7c9');glow.addColorStop(.3,'rgba(255,213,121,.75)');glow.addColorStop(1,'rgba(255,96,106,0)');ctx.fillStyle=glow;ctx.fillRect(sx-sr*2.7,sy-sr*2.7,sr*5.4,sr*5.4);ctx.fillStyle='#ffe39a';ctx.beginPath();ctx.arc(sx,sy,sr,0,7);ctx.fill();
    // drifting clouds
    for(let i=0;i<5;i++){const x=((i*287+t*.006*(i%2?1:-1))%(w+240))-120,y=h*(.12+i%3*.075),s=.55+(i%3)*.22;ctx.fillStyle='rgba(234,249,235,.10)';ctx.beginPath();ctx.ellipse(x,y,90*s,16*s,0,0,7);ctx.ellipse(x-45*s,y+7*s,50*s,11*s,0,0,7);ctx.fill();}
    // birds
    ctx.strokeStyle='rgba(251,243,211,.62)';ctx.lineWidth=1.4;for(let i=0;i<8;i++){const x=(t*.014+i*173)%(w+80)-40,y=h*(.11+(i%4)*.035);ctx.beginPath();ctx.arc(x-4,y,5,Math.PI*1.08,Math.PI*1.92);ctx.arc(x+4,y,5,Math.PI*1.08,Math.PI*1.92);ctx.stroke();}
  }

  function drawCity(){
    const w=S.w,h=S.h,t=S.time,base=h*.515;
    // atmospheric island
    ctx.fillStyle='#123d48';ctx.beginPath();ctx.moveTo(w*.06,base);ctx.quadraticCurveTo(w*.28,h*.43,w*.43,base);ctx.quadraticCurveTo(w*.7,h*.42,w*.95,base);ctx.closePath();ctx.fill();
    // skyline blocks
    const buildings=[[.19,.105,.055],[.245,.15,.045],[.295,.09,.058],[.355,.18,.04],[.405,.12,.05],[.56,.13,.05],[.615,.19,.042],[.665,.11,.06],[.725,.16,.047],[.78,.09,.055]];
    buildings.forEach((b,i)=>{const x=w*b[0],bh=h*b[1],bw=w*b[2];let bg=ctx.createLinearGradient(x,base-bh,x,base);bg.addColorStop(0,i%2?'#195e68':'#3b5262');bg.addColorStop(1,'#102d38');ctx.fillStyle=bg;rr(ctx,x,base-bh,bw,bh,4);ctx.fill();ctx.fillStyle=i%3?'#ffd168':'#67f5d0';for(let yy=base-bh+10;yy<base-8;yy+=10)for(let xx=x+7;xx<x+bw-5;xx+=11){ctx.globalAlpha=.25+.25*Math.sin(i+xx+yy+t*.001);ctx.fillRect(xx,yy,3,4);}ctx.globalAlpha=1;});
    drawGiantSeeker(w*.49,h*.335,Math.min(w,h)*.0017);
    drawFerris(w*.145,h*.445,Math.min(w,h)*.095,t);
    drawSlides(w*.805,h*.43,Math.min(w,h)*.085,t);
    drawCoaster(w*.66,h*.485,w*.19,h*.07,t);
    drawTower(w*.89,h*.44,h*.13,t);
  }

  function drawGiantSeeker(x,y,s){
    ctx.save();ctx.translate(x,y);ctx.rotate(-.08);ctx.globalAlpha=.9;drawPhone(ctx,0,0,s,77,false);ctx.globalAlpha=1;
    ctx.fillStyle='rgba(5,21,29,.82)';rr(ctx,-70,52*s,140,22,3);ctx.fill();ctx.fillStyle='#fff2c9';ctx.textAlign='center';ctx.font='700 10px Archivo Black';ctx.fillText('SEEKER CITY',0,67*s);ctx.restore();
  }
  function drawFerris(x,y,r,t){ctx.save();ctx.translate(x,y);ctx.strokeStyle='rgba(102,255,209,.78)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.stroke();for(let i=0;i<10;i++){const a=t*.00012+i*Math.PI/5;line(ctx,0,0,Math.cos(a)*r,Math.sin(a)*r);ctx.fillStyle=i%2?'#ff6484':'#ffd16c';ctx.beginPath();ctx.arc(Math.cos(a)*r,Math.sin(a)*r,5,0,7);ctx.fill();}ctx.strokeStyle='#15333b';ctx.lineWidth=7;line(ctx,-r*.5,r*1.25,0,0);line(ctx,r*.5,r*1.25,0,0);ctx.restore();}
  function drawSlides(x,y,r,t){ctx.save();ctx.translate(x,y);ctx.strokeStyle='#ff6583';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(0,-r*.9);ctx.bezierCurveTo(-r*1.2,-r*.1,r*.8,r*.25,-r*.45,r*1.15);ctx.stroke();ctx.strokeStyle='#66ffd1';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(r*.32,-r*.82);ctx.bezierCurveTo(r*1.1,-r*.1,-r*.4,r*.35,r*.25,r*1.1);ctx.stroke();ctx.fillStyle='#ffcf68';rr(ctx,-r*.35,-r*1.15,r*.85,r*.22,4);ctx.fill();ctx.restore();}
  function drawCoaster(x,y,w,h,t){ctx.save();ctx.translate(x,y);ctx.strokeStyle='#f5c45f';ctx.lineWidth=3;ctx.beginPath();for(let i=0;i<=24;i++){const px=-w/2+i*w/24,py=Math.sin(i*.65)*h*.35-Math.cos(i*.22)*h*.35;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();const carX=((t*.02)%(w))-w/2,carY=Math.sin(((carX+w/2)/w*24)*.65)*h*.35-Math.cos(((carX+w/2)/w*24)*.22)*h*.35;ctx.fillStyle='#ec557a';rr(ctx,carX-10,carY-5,20,9,3);ctx.fill();ctx.restore();}
  function drawTower(x,y,h,t){ctx.save();ctx.translate(x,y);ctx.fillStyle='#152e38';ctx.fillRect(-4,-h,8,h);ctx.fillStyle='#66ffd1';ctx.beginPath();ctx.arc(0,-h,10,0,7);ctx.fill();const py=-h*.5+Math.sin(t*.002)*h*.28;ctx.fillStyle='#ffcf68';rr(ctx,-22,py,44,7,3);ctx.fill();ctx.restore();}

  function drawSeaBeach(){
    const w=S.w,h=S.h,t=S.time,seaTop=h*.515,shore=h*.675;
    let sea=ctx.createLinearGradient(0,seaTop,0,shore);sea.addColorStop(0,'rgba(17,83,95,.88)');sea.addColorStop(1,'#08758a');ctx.fillStyle=sea;ctx.fillRect(0,seaTop,w,shore-seaTop+10);
    for(let row=0;row<14;row++){const y=seaTop+row*(shore-seaTop)/13;ctx.strokeStyle=`rgba(${row%2?'107,255,219':'255,214,139'},${.07+row*.008})`;ctx.lineWidth=1+row*.05;ctx.beginPath();for(let x=-20;x<w+20;x+=16){const yy=y+Math.sin(x*.025+t*.001+row)*2.5;x===-20?ctx.moveTo(x,yy):ctx.lineTo(x,yy);}ctx.stroke();}
    // boats
    const bx=(t*.018)%(w+160)-80,by=seaTop+h*.07;ctx.fillStyle='#fff0cd';ctx.beginPath();ctx.moveTo(bx-28,by);ctx.lineTo(bx+30,by);ctx.lineTo(bx+19,by+10);ctx.lineTo(bx-18,by+10);ctx.closePath();ctx.fill();ctx.strokeStyle='#122d36';ctx.lineWidth=2;line(ctx,bx,by,bx,by-28);ctx.fillStyle='#ff6684';ctx.beginPath();ctx.moveTo(bx,by-27);ctx.lineTo(bx+22,by-7);ctx.lineTo(bx,by-7);ctx.fill();
    let sand=ctx.createLinearGradient(0,shore,0,h);sand.addColorStop(0,'#ffd27a');sand.addColorStop(.45,'#e6a95f');sand.addColorStop(1,'#bc6e5c');ctx.fillStyle=sand;ctx.beginPath();ctx.moveTo(0,shore);for(let x=0;x<=w;x+=25)ctx.lineTo(x,shore+Math.sin(x*.028+t*.001)*4);ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.fill();
    // umbrellas and beach micro-life
    for(let i=0;i<11;i++){const x=w*(.06+i*.087),y=shore+h*(.02+(i%3)*.018),s=.5+(i%3)*.12;ctx.fillStyle=i%2?'#ff5d81':'#66e9cf';ctx.beginPath();ctx.arc(x,y,16*s,Math.PI,0);ctx.fill();ctx.strokeStyle='#183039';ctx.lineWidth=2;line(ctx,x,y,x,y+20*s);}
  }

  function drawRoad(){
    const w=S.w,h=S.h,vx=w*.5,vy=h*.535;
    const road=ctx.createLinearGradient(0,vy,0,h);road.addColorStop(0,'rgba(20,48,56,.55)');road.addColorStop(1,'#263d42');ctx.fillStyle=road;ctx.beginPath();ctx.moveTo(vx-w*.035,vy);ctx.lineTo(vx+w*.035,vy);ctx.lineTo(w*.76,h);ctx.lineTo(w*.24,h);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(255,228,161,.6)';ctx.lineWidth=2;line(ctx,vx-w*.035,vy,w*.24,h);line(ctx,vx+w*.035,vy,w*.76,h);
    // moving perspective lane dashes
    for(let i=0;i<13;i++){const p=((i/13+S.time*.00008)%1),q=p*p,y=lerp(vy,h,q),half=lerp(2,w*.022,q);ctx.strokeStyle=`rgba(255,226,145,${.15+q*.55})`;ctx.lineWidth=1+q*5;line(ctx,vx-half,y,vx+half,y);}
    // gateway
    const pulse=.7+Math.sin(S.time*.005)*.15;ctx.save();ctx.shadowColor=`rgba(102,255,209,${pulse})`;ctx.shadowBlur=24;ctx.strokeStyle='#66ffd1';ctx.lineWidth=5;ctx.beginPath();ctx.arc(vx,vy+5,w*.035,Math.PI,0);ctx.stroke();ctx.restore();
  }

  function drawForeground(){
    drawPalm(S.w*.045,S.h*.84,1.2);drawPalm(S.w*.955,S.h*.9,-1.35);
    // vignette + cinematic light sweep
    let v=ctx.createRadialGradient(S.w*.5,S.h*.48,Math.min(S.w,S.h)*.2,S.w*.5,S.h*.5,Math.max(S.w,S.h)*.72);v.addColorStop(.55,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,9,15,.58)');ctx.fillStyle=v;ctx.fillRect(0,0,S.w,S.h);
    const flare=ctx.createLinearGradient(0,0,S.w,S.h);flare.addColorStop(.2,'rgba(255,255,255,0)');flare.addColorStop(.47,'rgba(255,212,151,.035)');flare.addColorStop(.54,'rgba(255,255,255,0)');ctx.fillStyle=flare;ctx.fillRect(0,0,S.w,S.h);
  }
  function drawPalm(x,y,s){ctx.save();ctx.translate(x,y);ctx.scale(s,Math.abs(s));ctx.strokeStyle='#102b2d';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(0,80);ctx.quadraticCurveTo(10,5,-4,-82);ctx.stroke();ctx.strokeStyle='#144c42';ctx.lineWidth=9;for(let i=0;i<8;i++){const a=-2.9+i*.43;ctx.beginPath();ctx.moveTo(-4,-80);ctx.quadraticCurveTo(Math.cos(a)*50,-100+Math.sin(a)*25,Math.cos(a)*82,-72+Math.sin(a)*55);ctx.stroke();}ctx.restore();}

  function drawSwimmer(r,t){const x=S.w*(.2+(r.seed%29)/140),y=S.h*(.57+(r.seed%5)*.012)+Math.sin(t*2)*3;drawPhone(ctx,x,y,.13,r.seed,true);ctx.strokeStyle='rgba(221,255,245,.7)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y+7,13,0,Math.PI);ctx.stroke();}
  function drawFerrisRider(r,t){const cx=S.w*.145,cy=S.h*.445,rad=Math.min(S.w,S.h)*.095,a=t*.12+(r.seed%10)*Math.PI/5;drawPhone(ctx,cx+Math.cos(a)*rad,cy+Math.sin(a)*rad,.08,r.seed,true);}
  function drawSlider(r,t){const q=(t*.13+r.phase)%1,x0=S.w*.805,y0=S.h*.35,x=bezierPoint(x0,x0-S.w*.08,x0+S.w*.05,x0-S.w*.035,q),y=bezierPoint(y0,S.h*.42,S.h*.48,S.h*.525,q);drawPhone(ctx,x,y,.1,r.seed,true);}
  function drawSurfer(r,t){const x=S.w*(.33+(r.seed%23)/100)+Math.sin(t*.5)*18,y=S.h*.625+Math.sin(t*2)*3;ctx.strokeStyle='#fff0bd';ctx.lineWidth=4;line(ctx,x-14,y+8,x+15,y+8);drawPhone(ctx,x,y,.12,r.seed,true);}
  function drawVolley(r,t){const x=S.w*(.56+(r.seed%7)*.03),y=S.h*(.69+(r.seed%2)*.025);drawPhone(ctx,x,y,.13,r.seed,true);const bx=S.w*.66+Math.sin(t*1.5)*S.w*.055,by=S.h*.66-Math.abs(Math.cos(t*1.5))*45;ctx.fillStyle='#fff0c7';ctx.beginPath();ctx.arc(bx,by,4,0,7);ctx.fill();}
  function drawBoatRider(r,t){const x=(t*12+r.seed)%(S.w+100)-50,y=S.h*.585;drawPhone(ctx,x,y,.09,r.seed,true);}
  function drawDancer(r,t){const x=S.w*(.72+(r.seed%9)*.017),y=S.h*.69+Math.sin(t*3)*3;ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(t*3)*.15);drawPhone(ctx,0,0,.13,r.seed,true);ctx.restore();}

  let last=performance.now();
  function frame(now){
    const dt=Math.min(40,now-last);last=now;if(S.running){S.time+=dt;if(S.queue.length&&now-S.lastSpawn>950){S.lastSpawn=now;S.runners.push(new Runner(S.queue.shift()));}S.runners=S.runners.filter(r=>!r.update(dt));updateParticles(dt);}
    drawSky();drawCity();drawSeaBeach();ctx.drawImage(populationCanvas,0,0,S.w*S.dpr,S.h*S.dpr,0,0,S.w,S.h);S.residents.forEach(r=>r.draw());drawRoad();drawParticles();S.runners.forEach(r=>r.draw());drawForeground();requestAnimationFrame(frame);
  }

  function announce(c){ui.arrivalName.textContent=displayName(c);ui.arrivalAmount.textContent=`${fmt.format(c.amount)} SKR claimed · ${tier(c.amount)}`;ui.arrival.classList.remove('pop');void ui.arrival.offsetWidth;ui.arrival.classList.add('pop');setTimeout(()=>ui.arrival.classList.remove('pop'),500);}
  function escapeHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
  function escapeAttr(s){return String(s||'').replace(/["<>]/g,'');}
  function renderFeed(claims){ui.feed.innerHTML=claims.slice(0,12).map(c=>{const d=new Date(c.blockTime*1000),time=Number.isFinite(d.getTime())?d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'just now';return `<a class="claim-card" href="${escapeAttr(c.solscan)}" target="_blank" rel="noopener"><span class="claim-tier">${tier(c.amount)} · ${time}</span><i class="mini-phone" aria-hidden="true"></i><strong>${escapeHtml(displayName(c))}</strong><b>+${fmt.format(c.amount)} SKR</b><small>${escapeHtml(shortWallet(c.claimer))} ↗</small></a>`;}).join('')||'<div class="feed-empty">No confirmed claims yet.</div>';}
  function applyData(data){
    ui.claimed.textContent=compact(data.claimed);ui.count.textContent=fmt.format(data.claimCount);ui.remaining.textContent=compact(data.remaining);ui.percent.textContent=`${Number(data.percent).toFixed(1)}%`;ui.bar.style.width=`${clamp(data.percent,0,100)}%`;ui.population.textContent=`ALL ${fmt.format(data.claimCount)} CLAIMERS LIVE HERE`;renderFeed(data.claims||[]);
    if(S.population!==data.claimCount){S.population=data.claimCount;buildPopulation();}
    const claims=data.claims||[];
    if(!S.initialized){claims.forEach(c=>S.seen.add(c.signature));S.queue.push(...claims.slice(0,7).reverse());S.residents=claims.slice(7,42).map((c,i)=>new Resident(c,i));if(claims[0])announce(claims[0]);S.initialized=true;}
    else claims.filter(c=>!S.seen.has(c.signature)).reverse().forEach(c=>{S.seen.add(c.signature);S.queue.push(c);});
    setConnected(true);
  }
  function setConnected(ok){S.connected=ok;ui.live.classList.toggle('is-live',ok);ui.live.querySelector('span').textContent=ok?'LIVE':'RECONNECTING';ui.error.classList.toggle('show',!ok);}
  async function poll(){try{const r=await fetch('/api/state',{cache:'no-store'});if(!r.ok)throw Error(`HTTP ${r.status}`);applyData(await r.json());}catch(e){console.warn('Live feed:',e.message);setConnected(false);}finally{setTimeout(poll,S.connected?3200:6000);}}
  ui.motion.addEventListener('click',()=>{S.running=!S.running;ui.motion.textContent=S.running?'Ⅱ':'▶';ui.motion.setAttribute('aria-pressed',String(!S.running));});
  canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();S.pointer={x:e.clientX-r.left,y:e.clientY-r.top};const hit=S.runners.some(a=>a.bounds&&S.pointer.x>=a.bounds.x&&S.pointer.x<=a.bounds.x+a.bounds.w&&S.pointer.y>=a.bounds.y&&S.pointer.y<=a.bounds.y+a.bounds.h);canvas.style.cursor=hit?'pointer':'default';});
  canvas.addEventListener('click',()=>{const hit=[...S.runners].reverse().find(a=>a.bounds&&S.pointer.x>=a.bounds.x&&S.pointer.x<=a.bounds.x+a.bounds.w&&S.pointer.y>=a.bounds.y&&S.pointer.y<=a.bounds.y+a.bounds.h);if(hit)window.open(hit.claim.solscan,'_blank','noopener');});
  addEventListener('resize',resize,{passive:true});resize();if(reduced)S.running=true;requestAnimationFrame(frame);poll();
})();

import { reportEvent } from '../progress.js?v=7';

const STEP = 1 / 60;
const PAPER = '#080808';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

export function mountSoft(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const modeState = {};
  const pointer = { x: .5, y: .5, seen: false, id: null };
  const values = {};
  const num = key => Number(values[key]);
  const on = key => Boolean(values[key]);
  let W = 1, H = 1, S = 1, ox = 0, oy = 0, dpr = 1;
  let frameId = 0, last = performance.now(), debt = 0, paused = false;
  let strokes = 0, sent = false;
function fur3Rotate(p, inverse = false) {
  const s = modeState, a = s.yaw, b = s.pitch;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  if (inverse) {
    const y = p[1]*cb+p[2]*sb, z = -p[1]*sb+p[2]*cb;
    return [p[0]*ca-z*sa,y,p[0]*sa+z*ca];
  }
  const x = p[0]*ca+p[2]*sa, z = -p[0]*sa+p[2]*ca;
  return [x,p[1]*cb-z*sb,p[1]*sb+z*cb];
}

function fur3Project(p) {
  const q = fur3Rotate(fur3Deform(p)), k = 1.65/(1.65-q[2]);
  return [.5+q[0]*k,.455+q[1]*k,q[2],k];
}

function fur3Deform(p) {
  const s=modeState, w=Math.exp(-p.reduce((d,x,k)=>d+(x-s.pressRoot[k])**2,0)/.022);
  return p.map((x,k)=>x+s.pressOffset[k]*w);
}

function fur3Normal(p,n) {
  const s=modeState,w=Math.exp(-p.reduce((d,x,k)=>d+(x-s.pressRoot[k])**2,0)/.022);
  const g=p.map((x,k)=>-2*(x-s.pressRoot[k])*w/.022);
  const vn=s.pressOffset.reduce((d,x,k)=>d+x*n[k],0),vg=s.pressOffset.reduce((d,x,k)=>d+x*g[k],0);
  const result=n.map((x,k)=>x-g[k]*vn/(1+vg)),length=Math.hypot(...result)||1;
  return fur3Rotate(result.map(x=>x/length));
}

function fur3Down() {
  const s=modeState;s.brush={x:pointer.x,y:pointer.y};s.pressActive=false;
  s.rotating=false;
  let nearest=null,distance=.025;
  for(const h of s.hairs)if(h.visible){const d=Math.hypot(h.screen[0]-pointer.x,h.screen[1]-pointer.y);if(d<distance){nearest=h;distance=d;}}
  if(!nearest){s.rotating=true;return;}
  s.pressRoot=nearest.root.slice();s.pressStart={x:pointer.x,y:pointer.y};s.pressActive=true;
  s.pressTarget=fur3Rotate([0,0,-.045],true);
}

function fur3Setup() {

  const s = modeState;
  Object.assign(s,{hairs:[],patches:[],brush:null,time:0,yaw:-.38,pitch:-.12,depthBuffer:new Float32Array(192*192)});
  Object.assign(s,{pressRoot:[0,0,0],pressOffset:[0,0,0],pressVelocity:[0,0,0],pressTarget:[0,0,0],pressActive:false});
  let seed = 721;
  const random = () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  function surface(part,u,v) {
    const a = v*Math.PI*2;
    if (part === 0) {
      const y = -.29+u*.56;
      const cap = Math.min(1,Math.sqrt(Math.max(0,1-((Math.max(0,Math.abs(y+.01)-.21))/.07)**2)));
      return [-.16+Math.cos(a)*.082*cap,y,Math.sin(a)*.088*cap];
    }
    const t=u*Math.PI*2;
    return [.015+Math.cos(t)*(.18+Math.cos(a)*.078),.155+Math.sin(t)*(.145+Math.cos(a)*.078),Math.sin(a)*.09];
  }
  const normalize = v => {const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
  for(let part=0;part<2;part++) {
    const rows=part===0?56:90, cols=36;
    for(let i=0;i<rows;i++)for(let j=0;j<cols;j++) {
      const corners=[surface(part,i/rows,j/cols),surface(part,(i+1)/rows,j/cols),surface(part,(i+1)/rows,(j+1)/cols),surface(part,i/rows,(j+1)/cols)];
      const p=surface(part,(i+.5)/rows,(j+.5)/cols);
      const tangent=normalize(surface(part,(i+.501)/rows,(j+.5)/cols).map((x,k)=>x-p[k]));
      const around=normalize(surface(part,(i+.5)/rows,(j+.501)/cols).map((x,k)=>x-p[k]));
      let n=normalize([tangent[1]*around[2]-tangent[2]*around[1],tangent[2]*around[0]-tangent[0]*around[2],tangent[0]*around[1]-tangent[1]*around[0]]);
      const patch={corners,p,n,hairs:[]};s.patches.push(patch);
      for(let h=0;h<8;h++) {
        const root=surface(part,(i+random())/rows,(j+random())/cols);
        const angle=(random()-.5)*.8+Math.sin(i*.12)*.6;
        const dir=tangent.map((x,k)=>x*Math.cos(angle)+around[k]*Math.sin(angle));
        const hair={root,n,dir:dir.slice(),target:dir.slice(),length:.023+random()**2*.036,lift:.35+random()*.35,targetLift:.5,tone:random(),phase:random()*6.28};
        hair.velocity=[0,0,0];hair.liftVelocity=0;
        hair.density=(h+.5)/8;patch.hairs.push(hair);s.hairs.push(hair);
      }
    }
  }

}

function fur3Stroke() {
  const s=modeState;if(!s.brush)return;
  const dx=pointer.x-s.brush.x,dy=pointer.y-s.brush.y,len=Math.hypot(dx,dy);
  if(s.pressActive&&!s.rotating) {
    const x=pointer.x-s.pressStart.x,y=pointer.y-s.pressStart.y,scale=Math.min(1,.075/(Math.hypot(x,y)||1));
    s.pressTarget=fur3Rotate([x*scale,y*scale,-.052],true);
  }
  if(s.rotating){s.yaw+=dx*4;s.pitch=clamp(s.pitch-dy*3,-1.2,1.2);}
  else if(len>.0002) {
    const direction=fur3Rotate([dx/len,dy/len,0],true),radius=num('brush3')/100;
    for(const h of s.hairs) {
      if(!h.visible)continue;
      const p=h.screen,t=clamp(((p[0]-s.brush.x)*dx+(p[1]-s.brush.y)*dy)/(len*len),0,1);
      const d=Math.hypot(p[0]-s.brush.x-dx*t,p[1]-s.brush.y-dy*t);
      if(d>radius)continue;
      const w=(1-d/radius)**2*Math.min(1,len*100)*lerp(.2,1,num('softHair3')/10);
      const v=num('groom3')===0?direction:[Math.sin(h.phase+s.time*3),Math.cos(h.phase*3),Math.sin(h.phase*2)];
      const dot=v.reduce((sum,x,k)=>sum+x*h.n[k],0);
      const tangent=v.map((x,k)=>x-dot*h.n[k]),norm=Math.hypot(...tangent)||1;
      h.target=h.target.map((x,k)=>lerp(x,tangent[k]/norm,w));
      h.targetLift=lerp(h.targetLift,num('groom3')===0?.12:1,w);
    }
  }
  s.brush={x:pointer.x,y:pointer.y};
}

function fur3Draw() {
  const s=modeState;
  ctx.save();ctx.fillStyle='#080808';ctx.fillRect(0,0,S,S);
  const hairScale=num('length3')/5,fluff=num('fluff3')/5,density=num('density3')/10;
  const gloss=num('gloss3')/10,rimEnabled=on('rim3');
  ctx.scale(S,S);ctx.lineCap='round';
  s.depthBuffer.fill(-10);
  for(const patch of s.patches) {patch.depth=fur3Rotate(fur3Deform(patch.p))[2];}
  s.patches.sort((a,b)=>a.depth-b.depth);
  for(const patch of s.patches) {
    const normal=fur3Normal(patch.p,patch.n);
    const light=clamp(.25+Math.max(0,-normal[0]*.45-normal[1]*.55+normal[2]*.65)*.65,0,1);
    const points=patch.corners.map(fur3Project);
    const shade=Math.round(45+light*145);ctx.fillStyle=`rgb(${shade},${shade},${shade})`;
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();
    for(const indices of [[0,1,2],[0,2,3]]) {
      const [a,b,c]=indices.map(i=>points[i]);
      const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
      if(Math.abs(den)<1e-10)continue;
      const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0])*192)),x1=Math.min(191,Math.ceil(Math.max(a[0],b[0],c[0])*192));
      const y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1])*192)),y1=Math.min(191,Math.ceil(Math.max(a[1],b[1],c[1])*192));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
        const px=(x+.5)/192,py=(y+.5)/192;
        const u=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den;
        const v=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den;
        if(u>=0&&v>=0&&u+v<=1){const z=u*a[2]+v*b[2]+(1-u-v)*c[2],index=y*192+x;s.depthBuffer[index]=Math.max(s.depthBuffer[index],z);}
      }
    }
  }
  for(const patch of s.patches) {
    const normal=fur3Normal(patch.p,patch.n),front=normal[2]>-.12;
    const light=clamp(.25+Math.max(0,-normal[0]*.45-normal[1]*.55+normal[2]*.65)*.65,0,1);
    for(const h of patch.hairs) {
      if(h.density>density){h.visible=false;continue;}
      const root=fur3Project(h.root);h.screen=root;
      const index=clamp(Math.floor(root[1]*192),0,191)*192+clamp(Math.floor(root[0]*192),0,191);
      h.visible=front&&root[2]>=s.depthBuffer[index]-.008;
      if(!h.visible)continue;
      const norm=Math.hypot(...h.dir)||1,dir=h.dir.map(x=>x/norm);
      const lift=Math.min(1.5,h.lift*fluff),length=h.length*hairScale;
      const tip=h.root.map((x,k)=>x+length*(dir[k]*(1-lift*.45)+h.n[k]*(.2+lift*.85)));
      const control=h.root.map((x,k)=>x+length*(dir[k]*.2+h.n[k]*(.3+lift*.55)));
      const a=fur3Project(control),b=fur3Project(tip);
      const l=clamp(light*.85+h.tone*.18,0,1);
      const tangent=fur3Rotate(dir);
      const alignment=tangent[0]*-.3+tangent[1]*-.4+tangent[2]*.866;
      const sheen=Math.pow(Math.max(0,1-alignment*alignment),12)*Math.max(0,normal[2])*(.5+h.tone*.5);
      const rim=rimEnabled?Math.pow(1-Math.max(0,normal[2]),3)*Math.max(0,-normal[0]*.65-normal[1]*.35+.35):0;
      const base=95+160*l;
      const shade=Math.round(Math.min(255,base+(255-base)*(sheen*gloss*.85+rim*.9)));ctx.strokeStyle=`rgb(${shade},${shade},${shade})`;
      ctx.lineWidth=Math.max(.00055,.48/S)*root[3];ctx.beginPath();ctx.moveTo(root[0],root[1]);ctx.quadraticCurveTo(a[0],a[1],b[0],b[1]);ctx.stroke();
    }
  }
  if(pointer.seen&&!(s.brush&&s.rotating)){ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=1/S;ctx.beginPath();ctx.arc(pointer.x,pointer.y,num('brush3')/100,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
}

const sketch={
  label:'шёрстка · 3D',cursor:'grab',
  note:'Ведите по букве: расчёска укладывает шерсть и одновременно проминает мягкое тело. После отпускания тело расправляется, а причёска остаётся. Для поворота начните движение в пустом пространстве вокруг буквы или в её просвете. Длина, густота и пушистость меняются без сброса причёски.',
  tools:[
    {type:'pick',key:'groom3',label:'рука',options:['причёсывать','лохматить'],value:0},
    {type:'range',key:'brush3',label:'расчёска',min:3,max:15,step:1,value:15},
    {type:'range',key:'length3',label:'длина',min:2,max:10,step:1,value:8},
    {type:'range',key:'density3',label:'густота',min:2,max:10,step:1,value:10},
    {type:'range',key:'fluff3',label:'пушистость',min:1,max:10,step:1,value:5},
    {type:'range',key:'softHair3',label:'мягкость волос',min:0,max:10,step:1,value:10},
    {type:'range',key:'press3',label:'сминание',min:0,max:10,step:1,value:3},
    {type:'range',key:'gloss3',label:'блеск',min:0,max:10,step:1,value:3},
    {type:'toggle',key:'rim3',label:'контровой свет',value:true},
    {type:'button',label:'анфас',action(){modeState.yaw=0;modeState.pitch=0;}},
    {type:'button',label:'взъерошить всё',action(){for(const h of modeState.hairs){h.targetLift=1;h.target=h.target.map((v,k)=>v+Math.sin(h.phase*(k+1)));}}},
    {type:'button',label:'сначала',action(){reset();}}
  ],setup:fur3Setup,
  onDown:fur3Down,onMove:fur3Stroke,onUp(){modeState.brush=null;},
  step(){const s=modeState;s.time+=STEP;
    for(let k=0;k<3;k++){const target=s.brush&&s.pressActive&&!s.rotating?s.pressTarget[k]*num('press3')/10:0;s.pressVelocity[k]+=((target-s.pressOffset[k])*95-s.pressVelocity[k]*11)*STEP;s.pressOffset[k]+=s.pressVelocity[k]*STEP;}
    const softness=num('softHair3')/10,stiffness=lerp(240,65,softness),damping=lerp(28,10,softness);
    for(const h of s.hairs){
      for(let k=0;k<3;k++){h.velocity[k]+=((h.target[k]-h.dir[k])*stiffness-h.velocity[k]*damping)*STEP;h.dir[k]+=h.velocity[k]*STEP;}
      h.liftVelocity+=((h.targetLift-h.lift)*stiffness-h.liftVelocity*damping)*STEP;h.lift+=h.liftVelocity*STEP;
    }},
  draw:fur3Draw
};


  for (const tool of sketch.tools) if (tool.key) values[tool.key] = tool.value;
  const panel = document.createElement('div');
  panel.className = 'sketch-panel';
  panel.dataset.letterLayer = '';
  panel.hidden = true;
  panel.style.maxHeight = 'calc(100% - 70px)';
  panel.style.overflowY = 'auto';
  panel.style.overscrollBehavior = 'contain';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'sketch-toggle';
  toggle.dataset.letterLayer = '';
  toggle.textContent = 'параметры (tab)';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  });
  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'по букве — гладить · вокруг — крутить';
  for (const tool of sketch.tools) {
    if (tool.type === 'range') {
      const label = document.createElement('label'), caption = document.createElement('span'), input = document.createElement('input');
      input.type = 'range'; input.min = tool.min; input.max = tool.max; input.step = tool.step; input.value = values[tool.key];
      const paint = () => { caption.textContent = tool.label + ' · ' + values[tool.key]; };
      input.addEventListener('input', () => { values[tool.key] = Number(input.value); paint(); });
      paint(); label.append(caption, input); panel.append(label);
    } else {
      const button = document.createElement('button');
      button.type = 'button'; button.className = tool.type === 'toggle' ? 'sketch-switch' : 'sketch-action';
      const paint = () => {
        button.textContent = tool.label + (tool.type === 'pick' ? ' · ' + tool.options[values[tool.key]] : '');
        if (tool.type === 'toggle') button.setAttribute('aria-pressed', String(values[tool.key]));
      };
      button.addEventListener('click', () => {
        if (tool.type === 'pick') values[tool.key] = (values[tool.key] + 1) % tool.options.length;
        else if (tool.type === 'toggle') values[tool.key] = !values[tool.key];
        else tool.action();
        paint();
      });
      paint(); panel.append(button);
    }
  }
  const pause = document.createElement('button');
  pause.type = 'button'; pause.className = 'sketch-action'; pause.textContent = 'пауза';
  pause.addEventListener('click', () => { paused = !paused; debt = 0; release(); pause.textContent = paused ? 'продолжить' : 'пауза'; });
  panel.append(pause);
  function reset() { release(); sketch.setup(); }
  function track(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) * W / rect.width - ox) / S;
    pointer.y = ((event.clientY - rect.top) * H / rect.height - oy) / S;
    pointer.seen = true;
  }
  function down(event) {
    if (pointer.id !== null || paused || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); track(event); pointer.id = event.pointerId;
    canvas.setPointerCapture(event.pointerId); sketch.onDown();
  }
  function move(event) {
    if (pointer.id !== null && pointer.id !== event.pointerId) return;
    const x = pointer.x, y = pointer.y; track(event);
    if (pointer.id === null || paused) return;
    sketch.onMove();
    if (modeState.pressActive && !modeState.rotating) {
      strokes += Math.hypot(pointer.x - x, pointer.y - y);
      if (!sent && strokes > .8) { sent = true; reportEvent('Ь'); }
    }
  }
  function release(event) {
    if (event && event.pointerId !== pointer.id) return;
    const id = pointer.id; pointer.id = null; modeState.brush = null;
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }
  function leave() { if (pointer.id === null) pointer.seen = false; }
  function key(event) {
    if (event.target.closest('input, textarea, select')) return;
    if (event.key === 'Tab') { event.preventDefault(); toggle.click(); }
    if (event.code === 'Space' && !event.target.closest('button')) { event.preventDefault(); pause.click(); }
  }
  function blur() { release(); pointer.seen = false; }
  function resize() {
    W = workspace.clientWidth; H = workspace.clientHeight; S = Math.min(W, H);
    ox = (W - S) / 2; oy = (H - S) / 2; dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  function frame(now) {
    debt = paused || document.hidden ? 0 : Math.min(.1, debt + (now - last) / 1000); last = now;
    while (debt >= STEP) { sketch.step(); debt -= STEP; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H); ctx.translate(ox, oy);
    sketch.draw(); frameId = requestAnimationFrame(frame);
  }
  delete workspace.dataset.ground;
  canvas.style.cursor = 'grab'; canvas.style.touchAction = 'none';
  workspace.append(hint, panel, toggle);
  const observer = new ResizeObserver(resize); observer.observe(workspace);
  resize(); sketch.setup();
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release); canvas.addEventListener('pointerleave', leave);
  document.addEventListener('keydown', key); window.addEventListener('blur', blur);
  frameId = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(frameId); observer.disconnect(); release();
    canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', release); canvas.removeEventListener('pointercancel', release);
    canvas.removeEventListener('lostpointercapture', release); canvas.removeEventListener('pointerleave', leave);
    document.removeEventListener('keydown', key); window.removeEventListener('blur', blur);
    hint.remove(); panel.remove(); toggle.remove(); canvas.style.cursor = ''; canvas.style.touchAction = '';
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}

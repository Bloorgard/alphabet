import { reportEvent } from '../progress.js?v=5';

const INK = '#f1ede5';
const PAPER = '#161616';
const RED = '#e0210f';
const MUTED = 'rgba(241,237,229,.45)';
const STEP = 1 / 60;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const lerp = (a,b,t) => a+(b-a)*t;
const TS_STROKE_DEFAULT = {
  nodes: [
    {"p":[-0.04080222673328843,0.43526148756203803,0.0032859328889860697],"incoming":[0,0,0],"outgoing":[-0.08350945044832939,-0.12227242248009641,0.19341685099873135]},
    {"p":[-0.27360454670779444,0.0126974860008248,0.010453226322583815],"incoming":[0.05887873832173509,0.14570603432253554,0.16180878882002073],"outgoing":[-0.01360004748626854,-0.0336557650911967,-0.03737524400782762]},
    {"p":[-0.2901613374284877,-0.18764406931497252,-0.1558592965062146],"incoming":[-0.0644226731816615,0.037620555395894116,0.007204096857009064],"outgoing":[0.14589229158714012,-0.0851959219700667,-0.016314476679988945]},
    {"p":[0.2561694510844095,0.3214445273199424,-0.1306995419089663],"incoming":[0.11782521215717823,-0.07591804258241824,0.10035124575821155],"outgoing":[-0.0354966859863446,0.022871496421760198,-0.0302323806068421]},
    {"p":[-0.10410913242244255,-0.15740427359734502,0.17129259601559793],"incoming":[-0.060380046981422894,0.10846833895346117,-0.01637688042310099],"outgoing":[0.052091607194443716,-0.09357876298996422,0.014128806861197447]},
    {"p":[0.34579094836788005,-0.2982521397949939,-0.15675030601822096],"incoming":[0.07821380383094315,0.16689014177948208,-0.009897108012591978],"outgoing":[-0.05485572638528902,-0.11704941462309347,0.0069413968193886575]},
    {"p":[0.08246956875316065,-0.41939774794964296,0.09026792895314402],"incoming":[0.08034827426452423,-0.012799243879966584,-0.06913163133639963],"outgoing":[-0.07004570088039457,0.011158074227702501,0.06026730025365571]},
    {"p":[0.05992059863195422,-0.2943369498843785,0.1272411291548819],"incoming":[-0.11667672032206625,-0.0226020960192512,0.07751029562146042],"outgoing":[0,0,0]}
  ],
  angle: 0.13636251753759865, tilt: 0.11896029733920792,
  view: {"segment":0,"profile":0,"width":0.036,"spacing":0.012,"twist":0,"depth":0.16,"linked":true}
};
const tsStrokeAdd = (a,b) => a.map((v,i)=>v+b[i]);
const tsStrokeSub = (a,b) => a.map((v,i)=>v-b[i]);
const tsStrokeMul = (a,k) => a.map(v=>v*k);
const tsStrokeMix = (a,b,t) => a.map((v,i)=>lerp(v,b[i],t));
const tsStrokeUnit = a => tsStrokeMul(a,1/(Math.hypot(...a)||1));
const tsStrokeCross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];


export function mountTs(workspace) {
  const canvas=workspace.querySelector('#letter-canvas'),ctx=canvas.getContext('2d');
  const values={...TS_STROKE_DEFAULT.view},modeState={};
  const num=key=>Number(values[key]),on=key=>Boolean(values[key]);
  const ink=alpha=>`rgba(241,237,229,${alpha})`,ground='ink';
  const pointer={x:.5,y:.5,down:false,id:null};
  let W=600,H=600,S=600,ox=0,oy=0,dpr=1,frameId=0,last=performance.now(),debt=0,sent=false;
  function dot(x,y,color,radius){ctx.beginPath();ctx.arc(x*S,y*S,radius*S,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
  function line(x,y,u,v,color,width){ctx.beginPath();ctx.moveTo(x*S,y*S);ctx.lineTo(u*S,v*S);ctx.strokeStyle=color;ctx.lineWidth=width*S;ctx.stroke();}
  function tsHandle(x,y,active){ctx.beginPath();ctx.arc(x*S,y*S,.013*S,0,Math.PI*2);ctx.strokeStyle=active?INK:MUTED;ctx.lineWidth=1;ctx.stroke();}
function tsStrokeSample() {
  const doc=TS_STROKE_DEFAULT;
  modeState.nodes=structuredClone(doc.nodes);
  modeState.angle=doc.angle;modeState.tilt=doc.tilt;modeState.selected=0;modeState.dirty=true;
}

function tsStrokeDocument() {
  const m=modeState;
  return {nodes:structuredClone(m.nodes),angle:m.angle,tilt:m.tilt};
}

function tsStrokeCheckpoint() { modeState.before=tsStrokeDocument(); }

function tsStrokeCommit() {
  const m=modeState;
  if(m.before && JSON.stringify(m.before)!==JSON.stringify(tsStrokeDocument())) {
    if(!sent&&JSON.stringify(m.before.nodes)!==JSON.stringify(m.nodes)){sent=true;reportEvent('Ц');}
    m.undo.push(m.before);if(m.undo.length>60)m.undo.shift();m.redo=[];
  }
  m.before=null;m.dirty=true;tsStrokeUI();
}

function tsStrokeUndo(redo=false) {
  const m=modeState,from=redo?m.redo:m.undo,to=redo?m.undo:m.redo;
  if(!from.length)return;
  to.push(tsStrokeDocument());Object.assign(m,from.pop());m.selected=Math.min(m.selected,m.nodes.length-1);m.dirty=true;
  tsStrokeUI();
}

function tsStrokeProject(p) {
  const m=modeState,co=Math.cos(m.angle),si=Math.sin(m.angle),ct=Math.cos(m.tilt),st=Math.sin(m.tilt);
  const x=p[0]*co+p[2]*si,z=-p[0]*si+p[2]*co;
  return {x:.5+x*.95,y:.5-(p[1]*ct-z*st)*.95,z:z*ct+p[1]*st};
}

function tsStrokeUnproject(x,y,z) {
  const m=modeState,co=Math.cos(m.angle),si=Math.sin(m.angle),ct=Math.cos(m.tilt),st=Math.sin(m.tilt);
  const xx=(x-.5)/.95,yy=(.5-y)/.95,zz=z*ct-yy*st;
  return [xx*co-zz*si,yy*ct+z*st,xx*si+zz*co];
}

function tsStrokeBezier(a,b,t) {
  const c=tsStrokeAdd(a.p,a.outgoing),d=tsStrokeAdd(b.p,b.incoming),u=1-t;
  return a.p.map((v,i)=>u*u*u*v+3*u*u*t*c[i]+3*u*t*t*d[i]+t*t*t*b.p[i]);
}

function tsStrokePath() {
  const m=modeState;if(m.raw)return m.raw;
  const path=[];
  for(let i=1;i<m.nodes.length;i++) {
    const a=m.nodes[i-1],b=m.nodes[i];
    const count=Math.max(8,Math.min(80,Math.ceil((Math.hypot(...a.outgoing)+Math.hypot(...b.incoming)+Math.hypot(...tsStrokeSub(b.p,a.p)))/.008)));
    for(let j=0;j<count;j++)path.push(tsStrokeBezier(a,b,j/count));
  }
  if(m.nodes.length)path.push(m.nodes.at(-1).p);
  return path;
}

function tsStrokeResample(path) {
  if(path.length<2)return path;
  const lengths=[0];
  for(let i=1;i<path.length;i++)lengths.push(lengths.at(-1)+Math.hypot(...tsStrokeSub(path[i],path[i-1])));
  const total=lengths.at(-1),count=Math.max(2,Math.min(1800,Math.ceil(total/num('spacing'))));
  const out=[];let j=1;
  for(let i=0;i<=count;i++) {
    const d=total*i/count;while(j<path.length-1&&lengths[j]<d)j++;
    out.push(tsStrokeMix(path[j-1],path[j],(d-lengths[j-1])/(lengths[j]-lengths[j-1]||1)));
  }
  return out;
}

function tsStrokeDraw() {
  const m=modeState;
  if(S<1)return;
  if(m.size!==S||m.ground!==ground)m.dirty=true;
  if(m.dirty) {
    ctx.fillStyle=PAPER;ctx.fillRect(0,0,S,S);
    const path=tsStrokeResample(tsStrokePath()),rings=[],faces=[];
    const profile=num('profile'),shape=profile===0?[[-1,-.45],[-.82,-.64],[.82,-.64],[1,-.45],[1,.45],[.82,.64],[-.82,.64],[-1,.45]]
      :profile===1?Array.from({length:12},(_,i)=>[Math.cos(i*Math.PI/6),Math.sin(i*Math.PI/6)]) :[[-1,0],[0,-1],[1,0],[0,1]];
    let normal=null,distance=0;
    for(let i=0;i<path.length;i++) {
      if(i)distance+=Math.hypot(...tsStrokeSub(path[i],path[i-1]));
      const t=tsStrokeUnit(tsStrokeSub(path[Math.min(i+1,path.length-1)],path[Math.max(0,i-1)]));
      if(normal)normal=tsStrokeSub(normal,tsStrokeMul(t,normal.reduce((v,x,j)=>v+x*t[j],0)));
      if(!normal||Math.hypot(...normal)<.001)normal=tsStrokeCross(t,Math.abs(t[2])<.9?[0,0,1]:[0,1,0]);
      normal=tsStrokeUnit(normal);
      const bin=tsStrokeCross(t,normal),angle=distance*num('twist')*5,width=num('width');
      const n=tsStrokeAdd(tsStrokeMul(normal,Math.cos(angle)),tsStrokeMul(bin,Math.sin(angle)));
      const b=tsStrokeAdd(tsStrokeMul(normal,-Math.sin(angle)),tsStrokeMul(bin,Math.cos(angle)));
      rings.push(shape.map(([u,v])=>tsStrokeProject(tsStrokeAdd(path[i],tsStrokeAdd(tsStrokeMul(n,u*width),tsStrokeMul(b,v*width))))));
    }
    const add=(v,shade,wire=false)=>faces.push({v,z:v.reduce((s,p)=>s+p.z,0)/v.length,shade,wire});
    if(num('segment')===0) {
      for(let i=1;i<rings.length;i++)for(let j=0;j<shape.length;j++)add([rings[i-1][j],rings[i-1][(j+1)%shape.length],rings[i][(j+1)%shape.length],rings[i][j]],.64+.28*Math.sin(j*1.9)**2);
      if(rings.length){add(rings[0],.94);add(rings.at(-1),.94);}
    } else for(const ring of rings)add(ring,.86,num('segment')===2);
    faces.sort((a,b)=>a.z-b.z);
    for(const face of faces) {
      ctx.beginPath();face.v.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x*S,p.y*S));ctx.closePath();
      if(!face.wire){ctx.fillStyle=PAPER;ctx.fill();ctx.fillStyle=ink(face.shade);ctx.fill();}
      ctx.strokeStyle=ink(.9);ctx.lineWidth=Math.max(.65,S*.001);ctx.stroke();
      if(!face.wire&&num('segment')===0){ctx.beginPath();ctx.moveTo(face.v[0].x*S,face.v[0].y*S);ctx.lineTo(face.v[1].x*S,face.v[1].y*S);ctx.strokeStyle=PAPER;ctx.lineWidth=.65;ctx.stroke();}
    }
    m.cache.width=m.cache.height=Math.round(S*dpr);m.cache.getContext('2d').drawImage(canvas,ox*dpr,oy*dpr,S*dpr,S*dpr,0,0,m.cache.width,m.cache.height);
    m.size=S;m.ground=ground;m.dirty=false;
  }else ctx.drawImage(m.cache,0,0,S,S);
  if(m.action==='edit') {
    m.nodes.forEach((node,i)=>{const p=tsStrokeProject(node.p);tsHandle(p.x,p.y,i===m.selected);});
    const node=m.nodes[m.selected];
    if(node)for(const key of ['incoming','outgoing']){
      const p=tsStrokeProject(node.p),q=tsStrokeProject(tsStrokeAdd(node.p,node[key]));
      line(p.x,p.y,q.x,q.y,RED,.001);dot(q.x,q.y,RED,.006);
    }
  }
}

function tsStrokeFit(points,tolerance=.012) {
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),segments=[];
  const fit=(first,last,left,right) => {
    const p=points[first],q=points[last],lengths=[0];
    for(let i=first+1;i<=last;i++)lengths.push(lengths.at(-1)+Math.hypot(...tsStrokeSub(points[i],points[i-1])));
    const total=lengths.at(-1)||1,parameters=lengths.map(v=>v/total);
    let result;
    for(let iteration=0;iteration<5;iteration++) {
    let c00=0,c01=0,c11=0,x0=0,x1=0;
    parameters.forEach((t,i)=>{
      const u=1-t,b0=u*u*u,b1=3*u*u*t,b2=3*u*t*t,b3=t*t*t;
      const a=tsStrokeMul(left,b1),b=tsStrokeMul(right,b2);
      const residual=tsStrokeSub(points[first+i],tsStrokeAdd(tsStrokeMul(p,b0+b1),tsStrokeMul(q,b2+b3)));
      c00+=dot(a,a);c01+=dot(a,b);c11+=dot(b,b);x0+=dot(a,residual);x1+=dot(b,residual);
    });
    const determinant=c00*c11-c01*c01,chord=Math.hypot(...tsStrokeSub(q,p));
    let alpha=determinant>1e-12?(x0*c11-x1*c01)/determinant:chord/3;
    let beta=determinant>1e-12?(x1*c00-x0*c01)/determinant:chord/3;
    if(alpha<chord*1e-4||beta<chord*1e-4||alpha>total*2||beta>total*2)alpha=beta=chord/3;
    const a={p,outgoing:tsStrokeMul(left,alpha)},b={p:q,incoming:tsStrokeMul(right,beta)};
    let error=0,split=Math.floor((first+last)/2);
    parameters.forEach((t,i)=>{if(i===0||i===parameters.length-1)return;const d=Math.hypot(...tsStrokeSub(tsStrokeBezier(a,b,t),points[first+i]));if(d>error){error=d;split=first+i;}});
    result={a,b,error,split};
    if(error<=tolerance)break;
    const c=tsStrokeAdd(p,a.outgoing),d=tsStrokeAdd(q,b.incoming);
    const next=parameters.map((t,i)=>{
      if(i===0||i===parameters.length-1)return t;
      const u=1-t,residual=tsStrokeSub(tsStrokeBezier(a,b,t),points[first+i]);
      const firstDerivative=p.map((v,j)=>3*u*u*(c[j]-v)+6*u*t*(d[j]-c[j])+3*t*t*(q[j]-d[j]));
      const secondDerivative=p.map((v,j)=>6*u*(d[j]-2*c[j]+v)+6*t*(q[j]-2*d[j]+c[j]));
      const denominator=dot(firstDerivative,firstDerivative)+dot(residual,secondDerivative);
      const candidate=Math.abs(denominator)>1e-12?t-dot(residual,firstDerivative)/denominator:t;
      return clamp(candidate,parameters[i-1]+1e-8,parameters[i+1]-1e-8);
    });
    if(next.some((v,i)=>i&&v<=next[i-1]))break;
    parameters.splice(0,parameters.length,...next);
    }
    return result;
  };
  const tasks=[{first:0,last:points.length-1,left:tsStrokeUnit(tsStrokeSub(points[1],points[0])),right:tsStrokeUnit(tsStrokeSub(points.at(-2),points.at(-1)))}];
  while(tasks.length) {
    const task=tasks.pop(),{first,last,left,right}=task,result=fit(first,last,left,right);
    if(result.error<=tolerance||last-first<=1){segments.push(result);continue;}
    const split=result.split,tangent=tsStrokeUnit(tsStrokeSub(points[split+1],points[split-1]));
    tasks.push({first:split,last,left:tangent,right},{first,last:split,left,right:tsStrokeMul(tangent,-1)});
  }
  const nodes=segments.map(({a},i)=>({p:[...a.p],incoming:i?segments[i-1].b.incoming:[0,0,0],outgoing:a.outgoing}));
  const end=segments.at(-1).b;nodes.push({p:[...end.p],incoming:end.incoming,outgoing:[0,0,0]});
  return nodes;
}

function tsStrokeSimplify() {
  const m=modeState,path=tsStrokePath(),before=m.nodes.length;
  if(path.length<2)return;
  let nodes,tolerance=.008;
  do {nodes=tsStrokeFit(path,tolerance);tolerance*=1.4;} while(nodes.length>Math.max(2,Math.floor(before*.75))&&tolerance<=.032);
  if(nodes.length>=before){tsStrokeStatus('Узлов уже немного — дальнейшее упрощение заметно изменит рисунок.');return;}
  tsStrokeCheckpoint();m.nodes=nodes;m.selected=0;tsStrokeCommit();
  tsStrokeStatus('Упрощено: '+before+' → '+nodes.length+' · отмена вернёт прежнюю кривую');
}

function tsStrokeRecord() {
  const m=modeState,p=tsStrokeUnproject(pointer.x,pointer.y,0),prev=m.raw.at(-1);
  const d=prev?Math.hypot(p[0]-prev[0],p[1]-prev[1]):0;
  if(prev&&d<.003)return;
  m.distance+=d;p[2]=num('depth')*Math.sin(m.distance*7);m.raw.push(p);m.dirty=true;
}

function tsStrokeDown() {
  const m=modeState;
  if(m.action==='draw') {tsStrokeCheckpoint();m.angle=0;m.tilt=0;m.raw=[];m.distance=0;m.grab={kind:'draw'};tsStrokeRecord();return;}
  if(m.action==='orbit'){tsStrokeCheckpoint();m.grab={kind:'orbit',x:pointer.x,y:pointer.y,angle:m.angle,tilt:m.tilt};return;}
  const hits=[];
  m.nodes.forEach((n,i)=>hits.push({index:i,key:'p',point:n.p}));
  const node=m.nodes[m.selected];
  if(node)for(const key of ['incoming','outgoing'])hits.push({index:m.selected,key,point:tsStrokeAdd(node.p,node[key])});
  let hit=null,best=Math.max(.018,12/S);
  for(const h of hits){const p=tsStrokeProject(h.point),d=Math.hypot(pointer.x-p.x,pointer.y-p.y);if(d<best){best=d;hit={...h,z:p.z};}}
  if(!hit)return;
  tsStrokeCheckpoint();m.selected=hit.index;
  m.grab={kind:'edit',...hit,from:structuredClone(m.nodes[hit.index]),x:pointer.x,y:pointer.y};tsStrokeUI();
}

function tsStrokeMove() {
  const m=modeState,g=m.grab;if(!pointer.down||!g)return;
  if(g.kind==='draw'){tsStrokeRecord();return;}
  if(g.kind==='orbit'){m.angle=g.angle+(pointer.x-g.x)*4;m.tilt=clamp(g.tilt+(pointer.y-g.y)*3,-1.35,1.35);}
  if(g.kind==='edit'){
    const shift=tsStrokeSub(tsStrokeUnproject(pointer.x,pointer.y,g.z),tsStrokeUnproject(g.x,g.y,g.z)),node=m.nodes[g.index];
    if(g.key==='p')node.p=tsStrokeAdd(g.from.p,shift);
    else {node[g.key]=tsStrokeAdd(g.from[g.key],shift);if(on('linked')){const opposite=g.key==='incoming'?'outgoing':'incoming';node[opposite]=tsStrokeMul(tsStrokeUnit(node[g.key]),-Math.hypot(...g.from[opposite]));}}
  }
  m.dirty=true;
}

function tsStrokeUp() {
  const m=modeState;if(!m.grab)return;
  if(m.grab.kind==='draw'){
    tsStrokeRecord();
    if(m.raw.length>1){m.nodes=tsStrokeFit(m.raw);m.selected=0;m.action='edit';}
    else Object.assign(m,m.before);
    m.raw=null;
  }
  m.grab=null;tsStrokeCommit();
}

function tsStrokeInsert() {
  const m=modeState,i=Math.min(m.selected,m.nodes.length-2);if(i<0)return;
  tsStrokeCheckpoint();const a=m.nodes[i],b=m.nodes[i+1],q=tsStrokeAdd(a.p,a.outgoing),r=tsStrokeAdd(b.p,b.incoming);
  const ab=tsStrokeMix(a.p,q,.5),bc=tsStrokeMix(q,r,.5),cd=tsStrokeMix(r,b.p,.5),abc=tsStrokeMix(ab,bc,.5),bcd=tsStrokeMix(bc,cd,.5),p=tsStrokeMix(abc,bcd,.5);
  a.outgoing=tsStrokeSub(ab,a.p);b.incoming=tsStrokeSub(cd,b.p);
  m.nodes.splice(i+1,0,{p,incoming:tsStrokeSub(abc,p),outgoing:tsStrokeSub(bcd,p)});m.selected=i+1;tsStrokeCommit();
}

  const hint=document.createElement('div');hint.className='workspace-hint';hint.dataset.letterLayer='';
  const panel=document.createElement('div');panel.className='sketch-panel ts-panel';panel.dataset.letterLayer='';panel.hidden=true;
  const toggle=document.createElement('button');toggle.type='button';toggle.className='sketch-toggle';toggle.dataset.letterLayer='';toggle.textContent='параметры (tab)';toggle.setAttribute('aria-expanded','false');
  toggle.onclick=()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));};
  const style=document.createElement('style');style.dataset.letterLayer='';
  style.textContent='.ts-panel{max-height:calc(100% - 80px);overflow-y:auto}.ts-panel .ts-row{display:flex;flex-wrap:wrap;gap:6px}.ts-panel .ts-row button{flex:1;min-height:36px}.ts-panel select{font:inherit;color:inherit;background:var(--bg,#161616);border:1px solid currentColor;padding:5px;max-width:100%}.ts-panel .ts-status{font-size:11px;line-height:1.5}.ts-panel label{min-width:0}.ts-panel input{max-width:100%}';
  workspace.append(hint,panel,toggle,style);
  function tsStrokeStatus(text){const el=panel.querySelector('.ts-status');if(el)el.textContent=text;}
  function tsStrokeUI() {
    const focus=panel.contains(document.activeElement)?document.activeElement.dataset.control:null;
    panel.replaceChildren();
    const row=()=>{const el=document.createElement('div');el.className='ts-row';panel.append(el);return el;};
    const button=(parent,label,action,active)=>{
      const b=document.createElement('button');b.type='button';b.className=active===undefined?'sketch-action':'sketch-switch';b.textContent=label;b.dataset.control=label;
      if(active!==undefined)b.setAttribute('aria-pressed',String(active));b.onclick=action;parent.append(b);return b;
    };
    const actions=row();
    for(const [key,label]of [['draw','рисовать'],['edit','узлы'],['orbit','вращать']])button(actions,label,()=>{modeState.action=key;canvas.style.cursor=key==='orbit'?'grab':'crosshair';tsStrokeUI();},modeState.action===key);
    hint.textContent={draw:'один росчерк · после отпускания — правка узлов',edit:'тяни узлы и ручки · глубина — в параметрах',orbit:'веди, чтобы повернуть · параметры — рисовать и менять форму'}[modeState.action];
    const history=row();button(history,'↶ отмена',()=>tsStrokeUndo()).disabled=!modeState.undo.length;button(history,'↷ повтор',()=>tsStrokeUndo(true)).disabled=!modeState.redo.length;
    const range=(label,value,min,max,step,change,commit)=>{
      const el=document.createElement('label'),caption=document.createElement('span'),input=document.createElement('input');
      input.type='range';input.min=min;input.max=max;input.step=step;input.value=value;input.setAttribute('aria-label',label);input.dataset.control=label;
      const update=()=>{caption.textContent=label+' · '+Number(input.value).toFixed(step<.01?3:step<1?2:0);};update();
      input.oninput=()=>{change(+input.value);update();modeState.dirty=true;};if(commit)input.onchange=commit;
      el.append(caption,input);panel.append(el);
    };
    if(modeState.action==='edit'){
      const nodes=row();button(nodes,'упростить',tsStrokeSimplify).disabled=modeState.nodes.length<3;
      button(nodes,'+ узел',tsStrokeInsert).disabled=modeState.nodes.length<2;
      button(nodes,'− узел',()=>{tsStrokeCheckpoint();modeState.nodes.splice(modeState.selected,1);modeState.selected=Math.min(modeState.selected,modeState.nodes.length-1);tsStrokeCommit();}).disabled=modeState.nodes.length<=2;
      const node=modeState.nodes[modeState.selected];
      if(node)range('глубина узла',node.p[2],-.6,.6,.005,v=>{if(!modeState.before)tsStrokeCheckpoint();node.p[2]=v;},tsStrokeCommit);
      button(panel,'связанные ручки',()=>{values.linked=!values.linked;tsStrokeUI();},values.linked);
    }
    for(const [key,title,options]of [['segment','сегмент',['лента','пластины','рамки']],['profile','сечение',['плоское','круг','ромб']]]){
      const label=document.createElement('label'),caption=document.createElement('span'),select=document.createElement('select');caption.textContent=title;select.setAttribute('aria-label',title);
      options.forEach((text,i)=>select.append(new Option(text,i)));select.value=values[key];select.onchange=()=>{values[key]=+select.value;modeState.dirty=true;};label.append(caption,select);panel.append(label);
    }
    for(const [key,title,min,max,step]of [['width','толщина',.008,.09,.002],['spacing','шаг',.004,.06,.002],['twist','скрутка',0,3,.1]])range(title,values[key],min,max,step,v=>values[key]=v);
    if(modeState.action==='draw')range('глубина нового жеста',values.depth,0,.25,.01,v=>values.depth=v);
    const files=row();button(files,'исходная Ц',()=>{tsStrokeCheckpoint();tsStrokeSample();tsStrokeCommit();});
    button(files,'вид спереди',()=>{tsStrokeCheckpoint();modeState.angle=modeState.tilt=0;tsStrokeCommit();});
    button(panel,'файл кривой ↓',()=>{
      const doc={format:'alphabet-ts-stroke',version:1,...tsStrokeDocument(),ground,view:{...values}};
      const url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='ц-росчерк.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    const status=document.createElement('span');status.className='ts-status';status.setAttribute('role','status');status.textContent='Новый жест заменит кривую. Отмена вернёт предыдущую.';panel.append(status);
    if(focus)[...panel.querySelectorAll('[data-control]')].find(el=>el.dataset.control===focus)?.focus({preventScroll:true});
  }
  function track(event){const r=canvas.getBoundingClientRect();pointer.x=(event.clientX-r.left-ox)/S;pointer.y=(event.clientY-r.top-oy)/S;}
  function down(event){
    if(pointer.down||(event.pointerType==='mouse'&&event.button!==0))return;
    track(event);if(pointer.x<0||pointer.x>1||pointer.y<0||pointer.y>1)return;
    pointer.down=true;pointer.id=event.pointerId;canvas.setPointerCapture(event.pointerId);tsStrokeDown();
  }
  function move(event){if(event.pointerId!==pointer.id)return;track(event);tsStrokeMove();}
  function up(event){
    if(event.pointerId!==pointer.id)return;
    if(event.type==='pointercancel'||event.type==='lostpointercapture'){
      if(modeState.before)Object.assign(modeState,modeState.before);modeState.before=null;modeState.grab=null;modeState.raw=null;modeState.dirty=true;tsStrokeUI();
    }else{track(event);tsStrokeUp();}
    pointer.down=false;pointer.id=null;
  }
  function key(event){
    if(event.target.closest('input,textarea,select')||event.target.isContentEditable)return;
    if(event.key==='Tab'){event.preventDefault();toggle.click();}
    if((event.metaKey||event.ctrlKey)&&event.code==='KeyZ'){event.preventDefault();tsStrokeUndo(event.shiftKey);}
  }
  function resize(){W=workspace.clientWidth;H=workspace.clientHeight;S=Math.min(W,H);ox=(W-S)/2;oy=(H-S)/2;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);modeState.dirty=true;}
  function frame(now){
    debt=Math.min(.1,debt+(now-last)/1000);last=now;while(debt>=STEP)debt-=STEP;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=PAPER;ctx.fillRect(0,0,W,H);ctx.translate(ox,oy);tsStrokeDraw();frameId=requestAnimationFrame(frame);
  }
  Object.assign(modeState,{nodes:[],undo:[],redo:[],selected:0,action:'orbit',grab:null,dirty:true,cache:document.createElement('canvas')});tsStrokeSample();tsStrokeUI();
  delete workspace.dataset.ground;canvas.style.cursor='grab';
  const observer=new ResizeObserver(resize);observer.observe(workspace);resize();
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('lostpointercapture',up);document.addEventListener('keydown',key);frameId=requestAnimationFrame(frame);
  return ()=>{
    cancelAnimationFrame(frameId);observer.disconnect();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('lostpointercapture',up);document.removeEventListener('keydown',key);
    hint.remove();panel.remove();toggle.remove();style.remove();delete workspace.dataset.ground;canvas.style.cursor='';ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
  };
}

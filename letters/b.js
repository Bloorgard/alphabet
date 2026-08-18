const CONTROLS = [
  { key: 'rate', label: 'темп', min: 60, max: 900, step: 10 },
  { key: 'bigScale', label: 'крупные формы', min: 0.7, max: 1.6, step: 0.02, refill: true },
  { key: 'crumbScale', label: 'калибр мелочи', min: 0.5, max: 2, step: 0.02, refill: true },
  { key: 'crumbs', label: 'сколько мелочи', min: 8, max: 70, step: 1, refill: true },
  { key: 'contrast', label: 'контраст масс', min: 0, max: 1, step: 0.02 },
];

const PARAMS = {
  rate: 220,        // пауза между падениями, мс
  bigScale: 1.15,   // калибр крупных форм
  crumbScale: 1,    // калибр мелочи
  crumbs: 34,       // сколько мелких фигур
  contrast: 0.45,   // насколько мелочь бледнее буквы
};

const RED = [224, 33, 15];
const PAPER = [241, 237, 229];
const MATERIAL = { restitution: 0.06, friction: 0.45, frictionAir: 0.012 };

let matterLoading = null;

// matter.js лежит рядом и грузится только когда букву открыли.
function loadMatter() {
  if (window.Matter) return Promise.resolve(window.Matter);
  if (!matterLoading) {
    matterLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('../vendor/matter.min.js', import.meta.url).href;
      script.onload = () => resolve(window.Matter);
      script.onerror = () => reject(new Error('matter.js не загрузился'));
      document.head.append(script);
    });
  }
  return matterLoading;
}

export function mountB(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  workspace.dataset.ground = 'paper';
  // Своя копия: покрутил ползунки, закрыл букву — при следующем открытии всё заново.
  const params = { ...PARAMS };

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'тяни фигуры · 2× клик — насыпать заново';
  workspace.append(hint);

  let stopped = false;
  let scene = null;

  loadMatter().then((Matter) => {
    if (stopped) return;
    scene = start(Matter);
  });

  function start(Matter) {
    const { Engine, Composite, Bodies, Body, Mouse, MouseConstraint } = Matter;

    const engine = Engine.create();
    engine.positionIterations = 8;
    const world = engine.world;
    world.gravity.y = 1;

    let S = 0;
    let bodies = [];
    let queue = [];
    let timer = 0;
    let frameId = 0;

    function resize() {
      const bounds = workspace.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const next = Math.max(1, bounds.width);
      const changed = Math.abs(next - S) > 1;
      S = next;
      canvas.width = Math.round(S * dpr);
      canvas.height = Math.round(bounds.height * dpr);
      canvas.style.width = `${S}px`;
      canvas.style.height = `${bounds.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mouse.pixelRatio = dpr;
      if (changed) fill();
    }

    function buildWalls() {
      const t = S * 0.5;
      const opts = { isStatic: true, restitution: 0.05, friction: 0.5 };
      // Крышки нет: тела влетают сверху.
      return [
        Bodies.rectangle(S / 2, S + t / 2, S * 3, t, opts),
        Bodies.rectangle(-t / 2, S / 2, t, S * 3, opts),
        Bodies.rectangle(S + t / 2, S / 2, t, S * 3, opts),
      ];
    }

    function makeCrumbs(count) {
      const list = [];
      let prev = null;
      for (let i = 0; i < count; i += 1) {
        // Нечётная фигура повторяет предыдущую — близнец для другой стороны.
        const sample = i % 2 === 1 && prev
          ? prev
          : { size: S * (0.024 + Math.random() * 0.036) * params.crumbScale, kind: Math.random() };
        prev = sample;
        const { size, kind } = sample;
        const body = kind < 0.45
          ? Bodies.circle(0, 0, size, { ...MATERIAL, label: 'crumb' })
          : kind < 0.8
            ? Bodies.rectangle(0, 0, size * 1.8, size * 1.8, { ...MATERIAL, label: 'crumb' })
            : Bodies.polygon(0, 0, 5, size * 1.1, { ...MATERIAL, label: 'crumb' });
        list.push(body);
      }
      return list;
    }

    function fill() {
      Composite.clear(world, false);
      Composite.add(world, [...buildWalls(), mouseConstraint]);
      bodies = [];

      const g = params.bigScale;
      const bar = Bodies.rectangle(S * 0.5, S * 0.29, S * 0.58 * g, S * 0.17 * g, { ...MATERIAL, label: 'bar' });
      const belly = Bodies.circle(S * 0.5, S * 0.66, S * 0.27 * g, { ...MATERIAL, label: 'belly' }, 40);

      const crumbs = makeCrumbs(params.crumbs);
      const bed = Math.round(params.crumbs * 0.3);
      // Мелочь падает зеркальными парами: кучки растут одной высоты,
      // а лунка между ними ловит живот ровно по центру.
      const spread = (list, near, far) => {
        const out = [];
        for (let i = 0; i < list.length; i += 2) {
          const off = near + Math.random() * (far - near);
          const angle = Math.random() * Math.PI;
          out.push({ body: list[i], x: S * (0.5 - off), angle });
          if (list[i + 1]) out.push({ body: list[i + 1], x: S * (0.5 + off), angle: -angle });
        }
        return out;
      };

      queue = [
        ...spread(crumbs.slice(0, bed), 0.18, 0.34),
        { body: belly, x: S * 0.5, angle: 0 },
        ...spread(crumbs.slice(bed), 0.3, 0.46),
        { body: bar, x: S * 0.5, angle: -0.045 },
      ];
      timer = 0;
    }

    function spawn() {
      const next = queue.shift();
      Body.setPosition(next.body, { x: next.x, y: -S * 0.15 });
      Body.setAngle(next.body, next.angle);
      Body.setVelocity(next.body, { x: 0, y: 0 });
      bodies.push(next.body);
      Composite.add(world, next.body);
    }

    // Мелочь тем бледнее, чем мельче; обе формы буквы всегда в полную силу.
    function tone(t) {
      const mix = (1 - t) * params.contrast * 0.8;
      const channel = (i) => Math.round(RED[i] + (PAPER[i] - RED[i]) * mix);
      return `rgb(${channel(0)},${channel(1)},${channel(2)})`;
    }

    function draw() {
      ctx.fillStyle = `rgb(${PAPER.join(',')})`;
      ctx.fillRect(0, 0, S, canvas.height);

      let min = Infinity;
      let max = 0;
      for (const body of bodies) {
        if (body.label !== 'crumb') continue;
        const size = Math.sqrt(body.area);
        if (size < min) min = size;
        if (size > max) max = size;
      }
      const span = Math.max(1e-6, max - min);

      for (const body of bodies) {
        const t = body.label === 'crumb' ? 0.08 + 0.42 * ((Math.sqrt(body.area) - min) / span) : 1;
        ctx.fillStyle = tone(t);
        if (body.circleRadius) {
          ctx.beginPath();
          ctx.arc(body.position.x, body.position.y, body.circleRadius, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        const [first, ...rest] = body.vertices;
        ctx.beginPath();
        ctx.moveTo(first.x, first.y);
        for (const v of rest) ctx.lineTo(v.x, v.y);
        ctx.closePath();
        ctx.fill();
      }
    }

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(48, now - last);
      last = now;
      if (queue.length) {
        timer -= dt;
        if (timer <= 0) {
          spawn();
          timer = params.rate;
        }
      }
      Engine.update(engine, dt);
      draw();
      frameId = requestAnimationFrame(frame);
    }

    const mouse = Mouse.create(canvas);
    const mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: 0.18, render: { visible: false } },
    });

    const onDoubleClick = () => fill();
    canvas.addEventListener('dblclick', onDoubleClick);

    const panel = document.createElement('div');
    panel.className = 'sketch-panel';
    panel.dataset.letterLayer = '';
    panel.hidden = true;
    for (const control of CONTROLS) {
      const label = document.createElement('label');
      label.textContent = control.label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = control.min;
      input.max = control.max;
      input.step = control.step;
      input.value = params[control.key];
      input.addEventListener('input', () => { params[control.key] = Number(input.value); });
      // Калибр и количество меняют состав сцены, поэтому насыпаем заново.
      if (control.refill) input.addEventListener('change', () => fill());
      label.append(input);
      panel.append(label);
    }
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'sketch-action';
    again.textContent = 'насыпать заново';
    again.addEventListener('click', () => fill());
    panel.append(again);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sketch-toggle';
    toggle.dataset.letterLayer = '';
    toggle.textContent = 'параметры';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
    });
    workspace.append(panel, toggle);

    const onKeyDown = (event) => {
      if (event.key !== 'p' && event.key !== 'з') return;
      if (event.target.closest('input, textarea')) return;
      toggle.click();
    };
    document.addEventListener('keydown', onKeyDown);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(workspace);
    resize();
    frameId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      canvas.removeEventListener('dblclick', onDoubleClick);
      document.removeEventListener('keydown', onKeyDown);
      panel.remove();
      toggle.remove();
      Composite.clear(world, false);
      Engine.clear(engine);
    };
  }

  return () => {
    stopped = true;
    if (scene) scene();
    hint.remove();
    delete workspace.dataset.ground;
  };
}

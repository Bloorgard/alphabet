// Сцена, собранная на полигоне: окружности и форма нитки вокруг них.
// Контур сохранён вместе с кругами не для красоты — он несёт топологию,
// то есть ответ на вопрос, что осталось внутри петли, а что снаружи.
// По одним координатам окружностей это не восстановить.
const SCENE = {
  pegs: [
    [0.176, 0.16, 0.016], [0.688, 0.704, 0.16], [0.64, 0.384, 0.02],
    [0.176, 0.848, 0.016], [0.72, 0.192, 0.048], [0.416, 0.848, 0.016],
    [0.48, 0.24, 0.02], [0.288, 0.848, 0.016], [0.464, 0.512, 0.016],
  ],
  ring: [
    [0.7422, 0.5257], [0.7647, 0.5504], [0.7867, 0.5745], [0.8087, 0.5987], [0.8275, 0.6253],
    [0.8406, 0.6552], [0.8473, 0.6871], [0.8474, 0.7197], [0.841, 0.7516], [0.8282, 0.7815],
    [0.8097, 0.8081], [0.7863, 0.8305], [0.7588, 0.8477], [0.7285, 0.859], [0.6966, 0.8639],
    [0.6642, 0.8642], [0.6318, 0.8643], [0.5994, 0.8645], [0.5669, 0.8646], [0.5345, 0.8648],
    [0.502, 0.865], [0.4695, 0.8652], [0.4369, 0.8654], [0.4054, 0.8618], [0.4035, 0.8323],
    [0.4115, 0.7995], [0.4196, 0.7667], [0.4277, 0.7338], [0.4358, 0.7009], [0.4439, 0.6679],
    [0.4521, 0.635], [0.4602, 0.6021], [0.4682, 0.5692], [0.4763, 0.5363], [0.4794, 0.5039],
    [0.4529, 0.499], [0.4389, 0.5288], [0.4263, 0.5588], [0.4137, 0.5889], [0.4011, 0.6189],
    [0.3885, 0.6488], [0.3759, 0.6788], [0.3634, 0.7088], [0.351, 0.7388], [0.3386, 0.769],
    [0.3262, 0.7992], [0.3137, 0.8295], [0.3004, 0.8595], [0.2747, 0.8591], [0.2777, 0.831],
    [0.289, 0.8014], [0.3002, 0.7717], [0.3115, 0.742], [0.3228, 0.7124], [0.334, 0.6827],
    [0.3453, 0.653], [0.3566, 0.6232], [0.368, 0.5934], [0.3794, 0.5636], [0.3907, 0.5337],
    [0.4021, 0.5038], [0.4136, 0.4739], [0.425, 0.4439], [0.4364, 0.4139], [0.4479, 0.3839],
    [0.4593, 0.3539], [0.4708, 0.3238], [0.4823, 0.2937], [0.4937, 0.2637], [0.5001, 0.2334],
    [0.4761, 0.2192], [0.4576, 0.2411], [0.4453, 0.2696], [0.4329, 0.2981], [0.4206, 0.3265],
    [0.4083, 0.355], [0.3959, 0.3834], [0.3836, 0.4119], [0.3713, 0.4403], [0.359, 0.4688],
    [0.3466, 0.4973], [0.3343, 0.5257], [0.322, 0.5542], [0.3096, 0.5827], [0.2973, 0.6112],
    [0.285, 0.6397], [0.2727, 0.6682], [0.2604, 0.6967], [0.248, 0.7252], [0.2357, 0.7538],
    [0.2234, 0.7823], [0.211, 0.8109], [0.1987, 0.8394], [0.1824, 0.864], [0.16, 0.8527],
    [0.16, 0.8213], [0.1599, 0.7902], [0.1598, 0.759], [0.1597, 0.7278], [0.1597, 0.6967],
    [0.1596, 0.6655], [0.1595, 0.6343], [0.1594, 0.603], [0.1594, 0.5718], [0.1593, 0.5406],
    [0.1593, 0.5093], [0.1592, 0.478], [0.1591, 0.4467], [0.1591, 0.4154], [0.159, 0.384],
    [0.1589, 0.3525], [0.1588, 0.321], [0.1587, 0.2894], [0.1586, 0.2576], [0.1586, 0.2257],
    [0.1585, 0.1937], [0.1585, 0.1615], [0.1782, 0.1426], [0.2098, 0.1431], [0.2414, 0.1432],
    [0.2732, 0.1434], [0.3051, 0.1435], [0.3371, 0.1436], [0.3692, 0.1437], [0.4015, 0.1438],
    [0.4338, 0.1439], [0.4662, 0.1439], [0.4986, 0.1439], [0.5311, 0.1439], [0.5636, 0.1439],
    [0.5962, 0.1439], [0.6287, 0.1438], [0.6613, 0.1438], [0.6939, 0.1437], [0.7265, 0.144],
    [0.7545, 0.1579], [0.7682, 0.1859], [0.7621, 0.216], [0.7418, 0.2399], [0.7207, 0.2632],
    [0.6997, 0.2864], [0.6786, 0.3097], [0.6575, 0.333], [0.6363, 0.3564], [0.6189, 0.3816],
    [0.6341, 0.4073], [0.6557, 0.4309], [0.6774, 0.4547], [0.6992, 0.4785], [0.721, 0.5024],
  ],
};

const NODES = 300;   // плотность нитки
const GRID = 0.016;  // шаг невидимой сетки, доля кадра
const BLUE = '#0d47d9';
const WHITE = '#ffffff';

const CONTROLS = [
  { key: 'tension', label: 'натяжение', min: 0.05, max: 1.5, step: 0.05 },
  { key: 'weight', label: 'тяжесть', min: 0, max: 2, step: 0.05 },
  { key: 'radius', label: 'радиус', min: 0.016, max: 0.3, step: 0.008, live: true },
];

const SWITCHES = [
  { key: 'fill', label: 'заливка' },
  { key: 'stroke', label: 'контур' },
  { key: 'frame', label: 'каркас' },
];

const PARAMS = { tension: 1.5, weight: 0, radius: 0.016, fill: true, stroke: false, frame: true };

export function mountV(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const params = { ...PARAMS };

  let S = 0;
  let ring = [];
  let pegs = [];
  let selected = null;
  let dragPeg = null;
  let dragNode = null;
  let frameId = 0;
  let radiusInput = null;
  let removeButton = null;

  function build(fresh) {
    const source = fresh ? null : SCENE;
    pegs = (source ? source.pegs : SCENE.pegs).map(([x, y, r]) => ({
      x: x * S, y: y * S, tx: x * S, ty: y * S, r: r * S, target: r * S,
    }));

    ring = [];
    if (source) {
      // Нитка восстанавливается по сохранённому контуру и лишь дотягивается.
      for (let i = 0; i < NODES; i += 1) {
        const t = (i / NODES) * source.ring.length;
        const a = source.ring[Math.floor(t) % source.ring.length];
        const b = source.ring[(Math.floor(t) + 1) % source.ring.length];
        const k = t - Math.floor(t);
        const x = (a[0] + (b[0] - a[0]) * k) * S;
        const y = (a[1] + (b[1] - a[1]) * k) * S;
        ring.push({ x, y, px: x, py: y });
      }
      return;
    }

    // Перезапуск: петля начинается кругом, охватывающим все окружности.
    let reach = S * 0.36;
    for (const peg of pegs) reach = Math.max(reach, Math.hypot(peg.x - S / 2, peg.y - S / 2) + peg.r);
    for (let i = 0; i < NODES; i += 1) {
      const a = (i / NODES) * Math.PI * 2;
      const x = S / 2 + Math.cos(a) * reach * 1.15;
      const y = S / 2 + Math.sin(a) * reach * 1.15;
      ring.push({ x, y, px: x, py: y });
    }
  }

  function snap(value) {
    const step = S * GRID;
    return Math.round(value / step) * step;
  }

  function snapRadius(value) {
    const step = S * GRID;
    return Math.max(step, Math.round(value / step) * step);
  }

  function step() {
    for (const peg of pegs) {
      peg.r += (peg.target - peg.r) * 0.12;
      // За кадр окружность проходит не больше половины радиуса, иначе она
      // перескакивает нитку целиком и столкновению нечего ловить.
      const dx = peg.tx - peg.x;
      const dy = peg.ty - peg.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.01) { peg.x = peg.tx; peg.y = peg.ty; continue; }
      const move = Math.min(dist, Math.max(1.5, peg.r * 0.5));
      peg.x += (dx / dist) * move;
      peg.y += (dy / dist) * move;
    }

    const gravity = params.weight * 0.04;
    for (const p of ring) {
      if (p === dragNode) { p.px = p.x; p.py = p.y; continue; }
      const vx = (p.x - p.px) * 0.94;
      const vy = (p.y - p.py) * 0.94;
      p.px = p.x;
      p.py = p.y;
      p.x += vx;
      p.y += vy + gravity;
    }

    // Сокращение нормировано по плотности узлов: иначе при частых узлах звено
    // короткое, и в пикселях натяжение слабеет обратно пропорционально.
    const pull = params.tension * 0.06 * (ring.length / 260);
    for (let iter = 0; iter < 14; iter += 1) {
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1e-6;
        const diff = ((dist - dist * (1 - pull)) / dist) * 0.5;
        const aFree = a === dragNode ? 0 : 1;
        const bFree = b === dragNode ? 0 : 1;
        const total = aFree + bFree || 1;
        a.x += dx * diff * (2 * aFree) / total;
        a.y += dy * diff * (2 * aFree) / total;
        b.x -= dx * diff * (2 * bFree) / total;
        b.y -= dy * diff * (2 * bFree) / total;
      }

      // Столкновение считается по отрезку, а не по узлу: мелкая окружность
      // пролезала в промежуток между соседними точками.
      for (const peg of pegs) {
        for (let i = 0; i < ring.length; i += 1) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          const ex = b.x - a.x;
          const ey = b.y - a.y;
          const lenSq = ex * ex + ey * ey || 1e-6;
          let t = ((peg.x - a.x) * ex + (peg.y - a.y) * ey) / lenSq;
          t = Math.max(0, Math.min(1, t));
          let dx = a.x + ex * t - peg.x;
          let dy = a.y + ey * t - peg.y;
          let dist = Math.hypot(dx, dy);
          if (dist >= peg.r) continue;
          if (dist < 1e-6) { dx = 0; dy = -1; dist = 1e-6; }
          const push = peg.r - dist;
          a.x += (dx / dist) * push * (1 - t);
          a.y += (dy / dist) * push * (1 - t);
          b.x += (dx / dist) * push * t;
          b.y += (dy / dist) * push * t;
        }
      }
    }
  }

  function insideLoop(x, y) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = ring[i];
      const b = ring[j];
      if ((a.y > y) === (b.y > y)) continue;
      if (x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function loopPath() {
    const n = ring.length;
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    ctx.beginPath();
    const start = mid(ring[n - 1], ring[0]);
    ctx.moveTo(start.x, start.y);
    // Кривые через середины звеньев: по ломаной видны грани на поворотах.
    for (let i = 0; i < n; i += 1) {
      const p = ring[i];
      const m = mid(p, ring[(i + 1) % n]);
      ctx.quadraticCurveTo(p.x, p.y, m.x, m.y);
    }
    ctx.closePath();
  }

  function draw() {
    ctx.fillStyle = BLUE;
    ctx.fillRect(0, 0, S, S);

    if (params.fill) {
      loopPath();
      ctx.fillStyle = WHITE;
      ctx.fill();
    }

    // Окружность внутри формы принимает её цвет, снаружи — цвет холста.
    for (const peg of pegs) {
      ctx.fillStyle = params.fill && insideLoop(peg.x, peg.y) ? WHITE : BLUE;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (params.stroke) {
      loopPath();
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = S * 0.014;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // Каркас рисуется разностью — он виден и на синем, и на белом.
    if (params.frame) {
      const grid = S * GRID;
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      if (grid >= 4) {
        for (let x = grid; x < S; x += grid) {
          for (let y = grid; y < S; y += grid) ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 1;
      for (const peg of pegs) {
        ctx.beginPath();
        ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (selected) {
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(selected.x, selected.y, selected.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Без выделенной окружности радиус и удаление ни к чему не относятся.
  function selectPeg(peg) {
    selected = peg;
    if (peg && radiusInput) radiusInput.value = Number((peg.target / S).toFixed(4));
    if (radiusInput) radiusInput.disabled = !peg;
    if (removeButton) removeButton.disabled = !peg;
  }

  function pegAt(x, y) {
    for (let i = pegs.length - 1; i >= 0; i -= 1) {
      if (Math.hypot(x - pegs[i].x, y - pegs[i].y) <= pegs[i].r) return pegs[i];
    }
    return null;
  }

  function scenePoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  function onPointerDown(event) {
    const p = scenePoint(event);
    const peg = pegAt(p.x, p.y);
    if (peg) {
      dragPeg = peg;
      selectPeg(peg);
      try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* synthetic events */ }
      return;
    }
    let best = null;
    let bestDist = S * 0.05;
    for (const node of ring) {
      const d = Math.hypot(p.x - node.x, p.y - node.y);
      if (d < bestDist) { bestDist = d; best = node; }
    }
    dragNode = best;
    if (!best) selectPeg(null);
    if (best) {
      try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* synthetic events */ }
    }
  }

  function onPointerMove(event) {
    const p = scenePoint(event);
    canvas.style.cursor = pegAt(p.x, p.y) ? 'grab' : 'default';
    if (dragPeg) {
      dragPeg.tx = p.x;
      dragPeg.ty = p.y;
      return;
    }
    if (dragNode) {
      dragNode.x = p.x;
      dragNode.y = p.y;
    }
  }

  function endDrag() {
    // На сетку окружность встаёт только когда её отпустили: привязка на лету
    // дёргает её рывками, а рывок протаскивает круг сквозь нитку.
    if (dragPeg) {
      dragPeg.tx = snap(dragPeg.tx);
      dragPeg.ty = snap(dragPeg.ty);
    }
    dragPeg = null;
    dragNode = null;
  }

  function onDoubleClick(event) {
    const p = scenePoint(event);
    const peg = pegAt(p.x, p.y);
    if (peg) {
      pegs.splice(pegs.indexOf(peg), 1);
      if (selected === peg) selectPeg(null);
      return;
    }
    const size = snapRadius(S * params.radius);
    const fresh = { x: snap(p.x), y: snap(p.y), tx: snap(p.x), ty: snap(p.y), r: size * 0.2, target: size };
    pegs.push(fresh);
    selectPeg(fresh);
  }

  function buildPanel() {
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
      input.addEventListener('input', () => {
        params[control.key] = Number(input.value);
        // Радиус ложится на сетку сразу, а окружность подтягивается к нему плавно.
        if (control.key === 'radius' && selected) selected.target = snapRadius(S * params.radius);
      });
      input.addEventListener('change', () => {
        if (control.key === 'radius' && selected) input.value = Number((selected.target / S).toFixed(4));
      });
      if (control.key === 'radius') {
        radiusInput = input;
        input.disabled = true;
      }
      label.append(input);
      panel.append(label);
    }

    for (const item of SWITCHES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sketch-switch';
      button.textContent = item.label;
      button.setAttribute('aria-pressed', String(params[item.key]));
      button.addEventListener('click', () => {
        params[item.key] = !params[item.key];
        button.setAttribute('aria-pressed', String(params[item.key]));
      });
      panel.append(button);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'sketch-action';
    remove.textContent = 'удалить окружность';
    remove.disabled = true;
    removeButton = remove;
    remove.addEventListener('click', () => {
      if (!selected) return;
      pegs.splice(pegs.indexOf(selected), 1);
      selectPeg(null);
    });

    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'sketch-action';
    again.textContent = 'заново';
    again.addEventListener('click', () => {
      build(true);
      selectPeg(null);
    });

    panel.append(remove, again);
    return panel;
  }

  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'тяни окружности · 2× клик — поставить или убрать';
  workspace.append(hint);

  const panel = buildPanel();
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

  function onKeyDown(event) {
    if (event.target.closest('input, textarea')) return;
    if (event.key === 'Tab') {
      event.preventDefault();
      toggle.click();
      return;
    }
    if (!selected) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      pegs.splice(pegs.indexOf(selected), 1);
      selectPeg(null);
      return;
    }
    const grid = S * GRID;
    if (event.key === '[' || event.key === 'х') selected.target = snapRadius(Math.max(grid, selected.target - grid));
    if (event.key === ']' || event.key === 'ъ') selected.target = snapRadius(Math.min(S * 0.3, selected.target + grid));
  }

  function resize() {
    const bounds = workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const next = Math.max(1, bounds.width);
    const changed = Math.abs(next - S) > 1;
    S = next;
    canvas.width = Math.round(S * dpr);
    canvas.height = Math.round(S * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (changed) {
      build(false);
      selectPeg(null);
    }
  }

  function frame() {
    step();
    draw();
    frameId = requestAnimationFrame(frame);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(workspace);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', onDoubleClick);
  document.addEventListener('keydown', onKeyDown);

  resize();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', endDrag);
    canvas.removeEventListener('pointercancel', endDrag);
    canvas.removeEventListener('dblclick', onDoubleClick);
    document.removeEventListener('keydown', onKeyDown);
    panel.remove();
    toggle.remove();
    hint.remove();
  };
}

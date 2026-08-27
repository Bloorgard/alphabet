/* Я — последняя буква челленджа и единственная, которая сама себя называет.
   Поэтому её рисует не автор, а участники: каждый ставит клетку, заработанную
   в игровых буквах, и к 18 сентября большая Я собирается из чужих «я».

   Полигон отвечает на три вопроса, которые словами не решаются:

     холст   с какого числа отметок Я читается, а где холст ещё пуст
     рост    как выглядит удвоение сетки: старое крупнеет, бледнеет и уходит
             в подложку, по которой рисуют новые
     касса   почём клетка, сколько их в день и не жадно ли это

   Сетка — только степени двойки: при любом другом множителе старые клетки
   попадают на дробные границы и накопленная картинка едет. */

const GRIDS = [16, 32, 64, 128];
let yaLevel = 1;

/* Шрифт главной, а не системный: контур холста должен совпасть с тем, что
   потом встанет на сайте. Пока не приехал — маска строится системным. */
if (!document.querySelector('link[data-ya-font]')) {
  const yaFont = document.createElement('link');
  yaFont.rel = 'stylesheet';
  yaFont.dataset.yaFont = '';
  yaFont.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@700&display=swap';
  document.head.append(yaFont);
  document.fonts?.ready.then(() => yaMasks.clear());
}

/* ---------- маска буквы ---------- */

/* Клетки, попавшие внутрь контура Я. Растеризуем саму букву, а не рисуем
   контур руками: на 16×16 и на 128×128 это должна быть одна и та же Я. */
const yaMasks = new Map();

function mask(grid) {
  const hit = yaMasks.get(grid);
  if (hit) return hit;

  const off = document.createElement('canvas');
  off.width = grid;
  off.height = grid;
  const c = off.getContext('2d', { willReadFrequently: true });
  const face = (size) => {
    c.font = `700 ${size}px Manrope, ui-sans-serif, system-ui, sans-serif`;
    return c.measureText('Я');
  };

  let box = face(grid);
  const width = box.actualBoundingBoxLeft + box.actualBoundingBoxRight;
  const height = box.actualBoundingBoxAscent + box.actualBoundingBoxDescent;
  box = face((grid * grid * 0.84) / Math.max(width, height));
  c.fillStyle = '#000';
  c.fillText(
    'Я',
    grid / 2 - (box.actualBoundingBoxRight - box.actualBoundingBoxLeft) / 2,
    grid / 2 + (box.actualBoundingBoxAscent - box.actualBoundingBoxDescent) / 2,
  );

  const pixels = c.getImageData(0, 0, grid, grid).data;
  const cells = new Uint8Array(grid * grid);
  const list = [];
  for (let i = 0; i < cells.length; i += 1) {
    if (pixels[i * 4 + 3] > 110) {
      cells[i] = 1;
      list.push(i);
    }
  }

  const built = { grid, cells, list };
  yaMasks.set(grid, built);
  return built;
}

/* ---------- мелочи ---------- */

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* Порядок занятия клеток. Детерминированный: ползунок «отметок» должен
   доливать холст, а не пересыпать его заново на каждом делении. */
function shuffled(list, seed) {
  const out = list.slice();
  const rand = rng(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

function cell(index, grid, alpha, span = 1) {
  const step = S / grid;
  const gap = Math.max(0.5, step * 0.08);
  ctx.fillStyle = ink(alpha);
  ctx.fillRect((index % grid) * step, Math.floor(index / grid) * step, step * span - gap, step * span - gap);
}

function guide(m) {
  for (const index of m.list) cell(index, m.grid, 0.1);
}

function percent(part, whole) {
  return whole ? Math.round((part / whole) * 100) : 0;
}

function plural(n, forms) {
  const ten = n % 10;
  const hundred = n % 100;
  if (ten === 1 && hundred !== 11) return forms[0];
  if (ten >= 2 && ten <= 4 && (hundred < 10 || hundred >= 20)) return forms[1];
  return forms[2];
}

const LEVEL_TOOLS = [
  { type: 'button', label: 'сетка ×2', action() { yaLevel = Math.min(yaLevel + 1, GRIDS.length - 1); } },
  { type: 'button', label: 'сетка ÷2', action() { yaLevel = Math.max(yaLevel - 1, 0); } },
];

/* ---------- механики ---------- */

const MODES = {};

/* Сколько людей нужно, чтобы буква проступила. Разреженная Я — не сломанный
   холст, а начатый: вопрос в том, с какого места это перестаёт быть правдой. */
MODES.fill = {
  label: 'холст',
  note: 'сколько отметок нужно, чтобы Я читалась',
  tools: [
    { type: 'range', key: 'marks', label: 'отметок', min: 0, max: 1400, step: 5, value: 120 },
    { type: 'range', key: 'stray', label: 'мимо контура, %', min: 0, max: 40, step: 1, value: 0 },
    { type: 'toggle', key: 'guide', label: 'канва', value: true },
    { type: 'button', label: 'пересыпать', action() { modeState.seed = (Math.random() * 1e9) | 0; } },
  ],
  setup() {
    modeState.seed = 7;
  },
  draw() {
    const grid = GRIDS[yaLevel];
    const m = mask(grid);
    const seed = modeState.seed;
    const key = `${grid}:${seed}`;
    if (modeState.key !== key) {
      modeState.key = key;
      modeState.order = shuffled(m.list, seed);
      modeState.outside = shuffled(
        Array.from({ length: grid * grid }, (unused, i) => i).filter((i) => !m.cells[i]),
        seed + 1,
      );
    }

    if (on('guide')) guide(m);

    const total = Math.round(num('marks'));
    const stray = Math.round((total * num('stray')) / 100);
    const inside = Math.min(total - stray, modeState.order.length);
    for (let i = 0; i < inside; i += 1) cell(modeState.order[i], grid, 1);
    for (let i = 0; i < Math.min(stray, modeState.outside.length); i += 1) cell(modeState.outside[i], grid, 1);

    const done = percent(inside, m.list.length);
    drawStatus(`${grid}×${grid} · ${inside} из ${m.list.length} · буква на ${done}%`, done >= 85);
  },
};

/* Твоя механика масштабирования вживую: клетка растёт вдвое и теряет половину
   плотности. История не стирается — она становится подложкой. */
MODES.growth = {
  label: 'рост',
  note: 'холст переполнился — сетка удвоилась, прежнее побледнело',
  tools: [
    { type: 'range', key: 'people', label: 'отметок всего', min: 0, max: 6000, step: 25, value: 600 },
    { type: 'range', key: 'edge', label: 'порог удвоения, %', min: 50, max: 95, step: 5, value: 85 },
    { type: 'toggle', key: 'floor', label: 'пол ¼', value: true },
    { type: 'toggle', key: 'guide', label: 'канва', value: true },
  ],
  draw() {
    const total = Math.round(num('people'));
    const edge = num('edge') / 100;
    const key = `${total}:${edge}`;
    if (modeState.key !== key) {
      modeState.key = key;
      let level = 1;
      let order = shuffled(mask(GRIDS[level]).list, 11);
      let used = 0;
      const marks = [];
      for (let n = 0; n < total; n += 1) {
        if (used >= order.length * edge && level < GRIDS.length - 1) {
          level += 1;
          order = shuffled(mask(GRIDS[level]).list, 11 + level);
          used = 0;
        }
        if (used >= order.length) break;
        marks.push({ index: order[used], level });
        used += 1;
      }
      modeState.marks = marks;
      modeState.level = level;
    }

    const top = modeState.level;
    const grid = GRIDS[top];
    if (on('guide')) guide(mask(grid));

    for (const item of modeState.marks) {
      const span = 1 << (top - item.level);
      const from = GRIDS[item.level];
      const x = (item.index % from) * span;
      const y = Math.floor(item.index / from) * span;
      const faded = 1 / span;
      cell(y * grid + x, grid, on('floor') ? Math.max(0.25, faded) : faded, span);
    }

    const steps = top - 1;
    drawStatus(
      `${grid}×${grid} · ${modeState.marks.length} ${plural(modeState.marks.length, ['отметка', 'отметки', 'отметок'])}`
      + (steps > 0 ? ` · ${steps} ${plural(steps, ['удвоение', 'удвоения', 'удвоений'])}` : ''),
      steps > 0,
    );
  },
};

/* Цена клетки, потолок кошелька и суточный лимит — три цифры, взятые на глаз.
   Здесь их крутят руками и смотрят, жадно вышло или даром. */
MODES.spend = {
  label: 'касса',
  note: 'клик — поставить клетку · цена растёт с заполнением',
  cursor: 'crosshair',
  tools: [
    { type: 'range', key: 'already', label: 'уже стоит', min: 0, max: 900, step: 10, value: 220 },
    { type: 'range', key: 'wallet', label: 'кошелёк', min: 1, max: 30, step: 1, value: 10 },
    { type: 'range', key: 'daily', label: 'в сутки', min: 1, max: 20, step: 1, value: 5 },
    { type: 'button', label: 'новый день', action() { modeState.today = 0; modeState.balance = Math.round(num('wallet')); } },
    { type: 'button', label: 'сброс', action() { modeState.mine = new Set(); modeState.today = 0; modeState.balance = Math.round(num('wallet')); } },
  ],
  setup() {
    modeState.mine = new Set();
    modeState.today = 0;
    modeState.balance = 10;
    modeState.refused = 0;
  },
  onTool(key) {
    if (key === 'wallet') modeState.balance = Math.round(num('wallet'));
  },
  onDown() {
    const grid = GRIDS[yaLevel];
    const m = mask(grid);
    const x = Math.floor(clamp(pointer.x, 0, 0.999) * grid);
    const y = Math.floor(clamp(pointer.y, 0, 0.999) * grid);
    const index = y * grid + x;
    const taken = modeState.mine.has(index) || (modeState.others || new Set()).has(index);
    const price = MODES.spend.price(m);
    if (taken || modeState.today >= num('daily') || modeState.balance < price) {
      modeState.refused = 1;
      return;
    }
    modeState.mine.add(index);
    modeState.today += 1;
    modeState.balance -= price;
    modeState.refused = 0;
  },
  /* Тормоз: чем плотнее буква, тем дороже следующая клетка. */
  price(m) {
    const filled = ((modeState.others?.size || 0) + (modeState.mine?.size || 0)) / m.list.length;
    return filled < 0.25 ? 1 : filled < 0.5 ? 2 : filled < 0.75 ? 3 : 4;
  },
  draw() {
    const grid = GRIDS[yaLevel];
    const m = mask(grid);
    const already = Math.round(num('already'));
    const key = `${grid}:${already}`;
    if (modeState.key !== key) {
      modeState.key = key;
      modeState.others = new Set(shuffled(m.list, 3).slice(0, Math.min(already, m.list.length)));
    }

    guide(m);
    for (const index of modeState.others) cell(index, grid, 0.55);
    for (const index of modeState.mine) cell(index, grid, 1);

    if (pointer.seen) {
      const x = Math.floor(clamp(pointer.x, 0, 0.999) * grid);
      const y = Math.floor(clamp(pointer.y, 0, 0.999) * grid);
      const step = S / grid;
      ctx.strokeStyle = modeState.refused ? RED : INK;
      ctx.lineWidth = Math.max(1, step * 0.12);
      ctx.strokeRect(x * step, y * step, step, step);
    }

    const price = MODES.spend.price(m);
    const left = Math.round(num('daily')) - modeState.today;
    drawStatus(
      `кошелёк ${modeState.balance} · клетка ${price} · сегодня осталось ${left}`,
      modeState.balance < price || left <= 0,
    );
  },
};

startLab({
  title: 'Я · холст из чужих я',
  modes: MODES,
  start: 'fill',
  globalTools: LEVEL_TOOLS,
});

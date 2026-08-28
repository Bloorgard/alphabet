/* Я — тридцать третья буква и единственная, которая сама себя называет.
   Поэтому её рисует не автор, а участники: клетка достаётся за игру в других
   буквах и ставится сюда. К 18 сентября большая Я собирается из чужих «я».

   Сцена показывает холст целиком и всё, что вокруг него: лидеров игровых
   букв, свой запас клеток, имя и правила. Канва — контур в одну клетку:
   подсказывает форму, но не запирает в ней, ставить можно и мимо. */

import { YA_AREA, YA_MASK, maskCells } from '../ya-mask.js?v=1';
import { DEMO, joinPlayer, loadState, putMark } from '../wall.js?v=2';

const BOX = { x: 0.06, y: 0.14, size: 0.56 };
/* На телефоне сцена — тот же квадрат, но панель уезжает под холст, поэтому
   холст поднимается и ужимается. Порог тот же, что у стилей. */
const NARROW = { x: 0.2, y: 0.1, size: 0.6 };
const GRID = YA_MASK.length;

/* Клетки контура: те, у кого хотя бы один сосед снаружи буквы. */
function outline() {
  const inside = new Set(maskCells());
  const edge = [];
  for (const index of inside) {
    const x = index % GRID;
    const y = Math.floor(index / GRID);
    const empty = (dx, dy) => {
      const nx = x + dx;
      const ny = y + dy;
      return nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || !inside.has(ny * GRID + nx);
    };
    if (empty(-1, 0) || empty(1, 0) || empty(0, -1) || empty(0, 1)) edge.push(index);
  }
  return edge;
}

const EDGE = outline();

function when(stamp) {
  return new Date(stamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function mountYa(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  workspace.dataset.ground = 'paper';

  const panel = document.createElement('div');
  panel.className = 'ya-panel';
  panel.dataset.letterLayer = '';
  panel.innerHTML = `
    <p class="ya-title">Лидеры</p>
    <ul class="ya-leaders" id="ya-leaders"></ul>
    <p class="ya-title">У тебя</p>
    <p class="ya-wallet" id="ya-wallet">—</p>
    <div class="ya-place" id="ya-place" hidden>
      <p id="ya-place-note"></p>
      <button type="button" id="ya-place-do">поставить клетку</button>
    </div>
    <form class="ya-name" id="ya-name">
      <input id="ya-name-input" maxlength="5" placeholder="имя" aria-label="Твоё имя">
      <button type="submit">вписать</button>
    </form>
    <p class="ya-me" id="ya-me" hidden></p>
  `;

  const count = document.createElement('p');
  count.className = 'ya-count';
  count.dataset.letterLayer = '';

  const rules = document.createElement('details');
  rules.className = 'ya-rules';
  rules.dataset.letterLayer = '';
  rules.innerHTML = `
    <summary>правила</summary>
    <p>Клетка достаётся за игру: за личный рекорд в букве и за подъём
    в десятке. В день ставится не больше пяти. Ставить можно куда угодно —
    контур только подсказывает. 18 сентября Я выйдет такой, какой вы её
    нарисуете.</p>
  `;

  workspace.append(panel, count, rules);

  const leaders = panel.querySelector('#ya-leaders');
  const wallet = panel.querySelector('#ya-wallet');
  const place = panel.querySelector('#ya-place');
  const placeNote = panel.querySelector('#ya-place-note');
  const placeDo = panel.querySelector('#ya-place-do');
  const nameForm = panel.querySelector('#ya-name');
  const nameInput = panel.querySelector('#ya-name-input');
  const me = panel.querySelector('#ya-me');

  let state = null;
  let size = 0;
  let box = BOX;
  let hover = null;
  let chosen = null;

  function grid() {
    return GRID * (2 ** (state?.level || 0));
  }

  function cellAt(event) {
    const bounds = canvas.getBoundingClientRect();
    const step = (box.size * size) / grid();
    const x = Math.floor((event.clientX - bounds.left - box.x * size) / step);
    const y = Math.floor((event.clientY - bounds.top - box.y * size) / step);
    if (x < 0 || y < 0 || x >= grid() || y >= grid()) return null;
    return { x, y };
  }

  function markAt(cell) {
    return state?.marks.find((mark) => mark.x === cell.x && mark.y === cell.y && mark.level === state.level);
  }

  function draw() {
    const bounds = canvas.getBoundingClientRect();
    size = bounds.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(bounds.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, bounds.height);
    box = size < 520 ? NARROW : BOX;
    if (!state) return;

    const cells = grid();
    const step = (box.size * size) / cells;
    const gap = Math.max(0.5, step * 0.1);
    const left = box.x * size;
    const top = box.y * size;
    const styles = getComputedStyle(document.documentElement);
    const ink = styles.getPropertyValue('--ink').trim();
    const red = styles.getPropertyValue('--red').trim();
    const side = box.size * size;

    ctx.strokeStyle = 'rgba(22, 22, 22, .14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left - 8.5, top - 8.5, side + 17, side + 17);

    /* Канва — только на нулевом уровне: дальше буква уже набрана людьми. */
    if (!state.level) {
      ctx.fillStyle = 'rgba(22, 22, 22, .16)';
      for (const index of EDGE) {
        ctx.fillRect(left + (index % GRID) * step, top + Math.floor(index / GRID) * step, step - gap, step - gap);
      }
    }

    let mine = 0;
    for (const mark of state.marks) {
      const own = state.me && mark.owner === state.me;
      if (own) mine += 1;
      const span = 2 ** (state.level - mark.level);
      ctx.globalAlpha = own ? 1 : Math.max(0.25, 0.72 / span);
      ctx.fillStyle = own ? red : ink;
      ctx.fillRect(left + mark.x * span * step, top + mark.y * span * step, step * span - gap, step * span - gap);
    }
    ctx.globalAlpha = 1;

    for (const cell of [hover, chosen]) {
      if (!cell) continue;
      ctx.strokeStyle = cell === chosen ? red : ink;
      ctx.lineWidth = Math.max(1, step * 0.14);
      ctx.strokeRect(left + cell.x * step, top + cell.y * step, step, step);
    }

    count.textContent = mine
      ? `${state.marks.length}/${YA_AREA} · твоих ${mine}`
      : `${state.marks.length}/${YA_AREA}`;
  }

  function render() {
    if (!state) return;
    leaders.innerHTML = state.leaders.length
      ? state.leaders.map(([letter, name, value]) => `<li><b>${letter}</b><span>${name}</span><i>${value}</i></li>`).join('')
      : '<li class="ya-empty">пока никто не играл</li>';

    wallet.textContent = state.name
      ? `${state.wallet} ${plural(state.wallet, ['клетка', 'клетки', 'клеток'])}`
      : 'сначала имя';

    nameForm.hidden = Boolean(state.name);
    me.hidden = !state.name;
    me.textContent = state.name ? `ты — ${state.name}` : '';

    /* Постановка в два шага: клетка выбирается, потом подтверждается.
       На телефоне навести нечем, а промахнуться легко. */
    if (chosen) {
      const mark = markAt(chosen);
      const owner = mark && state.names[mark.owner];
      place.hidden = false;
      placeNote.textContent = mark
        ? `занято${owner ? `: ${owner}` : ''}${mark.createdAt ? `, ${when(mark.createdAt)}` : ''}`
        : `клетка ${chosen.x}, ${chosen.y} свободна`;
      placeDo.hidden = Boolean(mark) || !state.name || !state.wallet;
    } else {
      place.hidden = true;
    }
    draw();
  }

  function plural(n, forms) {
    const ten = n % 10;
    const hundred = n % 100;
    if (ten === 1 && hundred !== 11) return forms[0];
    if (ten >= 2 && ten <= 4 && (hundred < 10 || hundred >= 20)) return forms[1];
    return forms[2];
  }

  async function refresh() {
    state = await loadState();
    render();
    document.dispatchEvent(new CustomEvent('wall-changed'));
  }

  const onMove = (event) => {
    const cell = cellAt(event);
    const same = hover && cell && hover.x === cell.x && hover.y === cell.y;
    if (same) return;
    hover = cell;
    canvas.style.cursor = cell ? 'pointer' : 'default';
    draw();
  };

  const onDown = (event) => {
    const cell = cellAt(event);
    if (!cell) return;
    chosen = cell;
    render();
  };

  const onPlace = async () => {
    if (!chosen) return;
    const result = await putMark(chosen.x, chosen.y);
    if (!result.ok) return;
    chosen = null;
    await refresh();
  };

  const onName = async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim().toUpperCase();
    if (!/^[A-ZА-ЯЁ]{1,5}$/.test(name)) {
      nameInput.setAttribute('aria-invalid', 'true');
      return;
    }
    await joinPlayer(name);
    await refresh();
  };

  /* Enter в поле имени: неявная отправка формы срабатывает не везде,
     а это единственное место, где человека просят что-то ввести. */
  const onKey = (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    nameForm.requestSubmit();
  };

  const onResize = () => draw();

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  placeDo.addEventListener('click', onPlace);
  nameForm.addEventListener('submit', onName);
  nameInput.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  refresh().catch(() => {
    wallet.textContent = 'холст недоступен';
  });

  return () => {
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown);
    placeDo.removeEventListener('click', onPlace);
    nameForm.removeEventListener('submit', onName);
    nameInput.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    panel.remove();
    count.remove();
    rules.remove();
    delete workspace.dataset.ground;
  };
}

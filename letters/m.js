import { reportScore } from '../progress.js?v=3';

const STEP = 1 / 60;
const PAPER = '#f1ede5';
const INK = '#161616';
const RED = '#e0210f';
const ROPE_N = 18;
const ROPE_W = 0.014;
const ROPE_R = ROPE_W / 2;
const TARGET_R = 0.035;
const TARGETS = 5;
const DANGER_Y = 0.52;
const FLOOR_Y = 0.94;
const LETTER_HEIGHT = 0.8;
const LETTER_RAISE = 15 / 720;
const LETTER_CENTER_X = 370 / 718;
const MAX_DRAW = 0.22;
const ONBOARDING = 'alphabet:m-onboarding';
const PILE = [
  [369.5, 426.5, 26.5], [226.5, 688.5, 26.5], [32.5, 653.5, 26.5], [133.5, 659.5, 26.5],
  [85.5, 688.5, 26.5], [297.5, 679.5, 26.5], [329.5, 463.5, 26.5], [541.5, 659.5, 26.5],
  [591.5, 691.5, 26.5], [488.5, 688.5, 26.5], [396.5, 463.5, 17.5], [641.5, 700.5, 17.5],
  [585.5, 642.5, 17.5], [635.5, 670.5, 17.5], [465.5, 650.5, 17.5], [257.5, 653.5, 17.5],
  [187.5, 653.5, 17.5], [700.5, 700.5, 17.5], [37.5, 700.5, 17.5], [500.5, 642.5, 17.5],
  [663.5, 638.5, 17.5], [366.5, 486.5, 14.5], [337.5, 703.5, 14.5], [265.5, 703.5, 14.5],
  [184.5, 705.5, 14.5], [91.5, 645.5, 14.5], [442.5, 674.5, 14.5], [427.5, 703.5, 14.5],
  [667.5, 682.5, 14.5], [696.5, 664.5, 14.5], [130.5, 703.5, 14.5], [535.5, 703.5, 14.5],
  [167.5, 679.5, 14.5],
].map(([x, y, r]) => ({ x: x / 718, y: y / 718, r: r / 718 }));

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const point = (x, y) => ({ x, y });

function circleHitsSegment(circle, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? clamp(((circle.x - a.x) * dx + (circle.y - a.y) * dy) / length, 0, 1) : 0;
  return Math.hypot(circle.x - (a.x + dx * t), circle.y - (a.y + dy * t));
}

function separate(balls, passes = 6) {
  for (let pass = 0; pass < passes; pass += 1) {
    for (let i = 0; i < balls.length; i += 1) {
      for (let j = i + 1; j < balls.length; j += 1) {
        const a = balls[i];
        const b = balls[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.0001;
        const overlap = a.r + b.r - distance;
        if (overlap <= 0) continue;
        const share = overlap / distance / 2;
        a.x -= dx * share;
        a.y -= dy * share;
        b.x += dx * share;
        b.y += dy * share;
      }
    }
  }
}

export function mountM(workspace) {
  const canvas = workspace.querySelector('#letter-canvas');
  const ctx = canvas.getContext('2d');
  const gameParams = { slack: 1.1, power: 12 };
  const params = { ...gameParams };
  const state = { props: [], pile: [], targets: [], score: 0, ring: 0, over: false, play: true };
  const pointer = { x: 0.5, y: 0.5, px: 0.5, py: 0.5 };
  const letterY = (y) => (426 / 718) + ((y / 718) - (426 / 718)) * LETTER_HEIGHT - LETTER_RAISE;
  const leftLeg = [[143.971, 426], [240, 426], [179.029, 595], [83, 595]]
    .map(([x, y]) => point(0.5 + ((x / 718) - LETTER_CENTER_X) * 0.95, letterY(y)));
  const rightLeg = [[596.029, 426], [500, 426], [560.971, 595], [657, 595]]
    .map(([x, y]) => point(0.5 + ((x / 718) - LETTER_CENTER_X) * 0.95, letterY(y)));
  const anchorT = ROPE_R / (leftLeg[2].y - leftLeg[1].y);
  const leftAnchor = point(lerp(leftLeg[1].x, leftLeg[2].x, anchorT), lerp(leftLeg[1].y, leftLeg[2].y, anchorT));
  const rightAnchor = point(lerp(rightLeg[1].x, rightLeg[2].x, anchorT), lerp(rightLeg[1].y, rightLeg[2].y, anchorT));
  let W = 1;
  let H = 1;
  let S = 1;
  let ox = 0;
  let oy = 0;
  let last = performance.now();
  let debt = 0;
  let frameId = 0;
  let sent = false;

  function resize() {
    const bounds = workspace.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, bounds.width);
    H = Math.max(1, bounds.height);
    S = Math.min(W, H);
    ox = (W - S) / 2;
    oy = (H - S) / 2;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function at(item) {
    return { x: ox + item.x * S, y: oy + item.y * S };
  }

  function initRope() {
    state.rope = Array.from({ length: ROPE_N }, (_, index) => {
      const t = index / (ROPE_N - 1);
      const x = lerp(leftAnchor.x, rightAnchor.x, t);
      const y = lerp(leftAnchor.y, rightAnchor.y, t);
      return { x, y, px: x, py: y, pinned: index === 0 || index === ROPE_N - 1 };
    });
    state.ropeLength = Math.hypot(rightAnchor.x - leftAnchor.x, rightAnchor.y - leftAnchor.y);
  }

  function ropeY(x) {
    for (let i = 0; i < state.rope.length - 1; i += 1) {
      const a = state.rope[i];
      const b = state.rope[i + 1];
      if ((x >= a.x && x <= b.x) || (x <= a.x && x >= b.x)) return lerp(a.y, b.y, (x - a.x) / (b.x - a.x || 0.0001));
    }
    return x < state.rope[0].x ? state.rope[0].y : state.rope.at(-1).y;
  }

  function ropeNode(x) {
    let best = 1;
    let distance = Infinity;
    state.rope.forEach((node, index) => {
      if (node.pinned || Math.abs(node.x - x) >= distance) return;
      best = index;
      distance = Math.abs(node.x - x);
    });
    return best;
  }

  function stepRope() {
    for (const node of state.rope) {
      if (node.pinned) continue;
      const vx = (node.x - node.px) * 0.995;
      const vy = (node.y - node.py) * 0.995;
      node.px = node.x;
      node.py = node.y;
      node.x += vx;
      node.y += vy + 2.2 * STEP * STEP;
    }
    for (let pass = 0; pass < 10; pass += 1) {
      for (let index = 0; index < ROPE_N - 1; index += 1) {
        const a = state.rope[index];
        const b = state.rope[index + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 0.0001;
        const rest = ropeSegmentLength(index);
        const share = (distance - rest) / distance / 2;
        if (!a.pinned) { a.x += dx * share; a.y += dy * share; }
        if (!b.pinned) { b.x -= dx * share; b.y -= dy * share; }
      }
    }
  }

  function ropeSegmentLength(index) {
    const rest = state.ropeLength * params.slack / (ROPE_N - 1);
    if (state.held === null || !state.dragProp) return rest;
    const held = state.rope[state.held];
    if (index < state.held) {
      const stretch = Math.hypot(held.x - leftAnchor.x, held.y - leftAnchor.y) / state.held;
      return Math.max(rest, stretch * 1.01);
    }
    const rightCount = ROPE_N - 1 - state.held;
    const stretch = Math.hypot(rightAnchor.x - held.x, rightAnchor.y - held.y) / rightCount;
    return Math.max(rest, stretch * 1.01);
  }

  function restoreRope() {
    initRope();
    for (let i = 0; i < 240; i += 1) stepRope();
  }

  function newTarget(others, r = TARGET_R) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const target = { x: 0.1 + Math.random() * 0.8, y: -r - Math.random() * 0.2, r };
      if (others.every((item) => Math.hypot(item.x - target.x, item.y - target.y) > item.r + r + 0.02)) return target;
    }
    return { x: 0.5, y: -r, r };
  }

  function newSandboxTarget(others, r = TARGET_R) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const target = { x: 0.1 + Math.random() * 0.8, y: 0.1 + Math.random() * 0.28, r };
      if (others.every((item) => Math.hypot(item.x - target.x, item.y - target.y) > item.r + r + 0.02)) return target;
    }
    return { x: 0.5, y: 0.22, r };
  }

  function stepPile() {
    for (const ball of state.pile) {
      const vx = (ball.x - ball.px) * 0.9;
      const vy = (ball.y - ball.py) * 0.9;
      ball.px = ball.x;
      ball.py = ball.y;
      ball.x += vx;
      ball.y += vy + 1.4 * STEP * STEP;
    }
    separate(state.pile);
    for (const ball of state.pile) {
      if (ball.y + ball.r > FLOOR_Y) { ball.y = FLOOR_Y - ball.r; ball.py = ball.y; }
      if (ball.x - ball.r < 0.02) { ball.x = 0.02 + ball.r; ball.px = ball.x; }
      if (ball.x + ball.r > 0.98) { ball.x = 0.98 - ball.r; ball.px = ball.x; }
    }
  }

  function reset() {
    initRope();
    for (let i = 0; i < 500; i += 1) stepRope();
    state.props = [];
    state.pile = PILE.map((ball) => ({ ...ball, px: ball.x, py: ball.y }));
    for (let i = 0; i < 200; i += 1) stepPile();
    state.targets = [];
    const spawn = state.play ? newTarget : newSandboxTarget;
    for (let i = 0; i < TARGETS; i += 1) state.targets.push(spawn(state.targets));
    state.score = 0;
    state.ring = 0;
    state.over = false;
    state.dragProp = null;
    state.held = null;
    state.fromPile = false;
    state.dragMoved = false;
    state.onboarding = !localStorage.getItem(ONBOARDING);
    state.onboardingTime = 0;
    sent = false;
  }

  function finishOnboarding() {
    if (!state.onboarding) return;
    state.onboarding = false;
    localStorage.setItem(ONBOARDING, '1');
  }

  function catchPoint(from, to, radius) {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 0.008));
    const minX = state.rope[0].x;
    const maxX = state.rope.at(-1).x;
    for (let index = 1; index <= steps; index += 1) {
      const t = index / steps;
      const hit = point(lerp(from.x, to.x, t), lerp(from.y, to.y, t));
      const contact = ropeY(hit.x) - radius - ROPE_R;
      if (hit.x >= minX && hit.x <= maxX && hit.y - contact <= 0.2) return point(hit.x, contact);
    }
    return null;
  }

  function limitDraw(prop) {
    if (state.held === null) return;
    const dx = prop.x - prop.restX;
    const dy = prop.y - prop.restY;
    const distance = Math.hypot(dx, dy);
    if (distance <= MAX_DRAW) return;
    prop.x = prop.restX + (dx / distance) * MAX_DRAW;
    prop.y = prop.restY + (dy / distance) * MAX_DRAW;
  }

  function step() {
    if (state.onboarding && (state.onboardingTime += STEP) > 4.2) finishOnboarding();
    if (state.held !== null && state.dragProp) {
      const node = state.rope[state.held];
      node.pinned = true;
      node.x = state.dragProp.x;
      node.y = state.dragProp.y + state.dragProp.r + ROPE_R;
    }
    stepRope();
    stepPile();
    if (state.play && !state.over) {
      for (const target of state.targets) {
        target.y += 0.012 * (1 + state.score * 0.08) * STEP;
        if (target.y > DANGER_Y) state.over = true;
      }
      if (state.over && !sent) { sent = true; reportScore('М', state.score); }
    }
    const minX = state.rope[0].x;
    const maxX = state.rope.at(-1).x;
    for (const prop of state.props) {
      if (prop.state === 'dragging') continue;
      const before = point(prop.x, prop.y);
      if (prop.state === 'resting') {
        const slope = (ropeY(prop.x + 0.02) - ropeY(prop.x - 0.02)) / 0.04;
        const vx = (prop.x - prop.px) * 0.7;
        prop.px = prop.x;
        prop.x = clamp(prop.x + vx + slope * 6 * STEP * STEP, minX, maxX);
        continue;
      }
      prop.vy += 1.4 * STEP;
      prop.x += prop.vx * STEP;
      prop.y += prop.vy * STEP;
      if (prop.state === 'flying' && !state.over) {
        for (const target of state.targets) {
          if (circleHitsSegment(target, before, prop) >= target.r + prop.r) continue;
          state.score += 1;
          state.hitAt = point(target.x, target.y);
          state.ring = 1;
          const spawn = state.play ? newTarget : newSandboxTarget;
          const fresh = spawn(state.targets.filter((item) => item !== target), target.r);
          target.x = fresh.x;
          target.y = fresh.y;
        }
      }
      const contact = ropeY(prop.x) - prop.r - ROPE_R;
      if (prop.state === 'free' && prop.y >= contact && prop.x >= minX && prop.x <= maxX) {
        prop.y = contact;
        prop.px = prop.x;
        prop.state = 'resting';
      } else if (prop.y + prop.r > FLOOR_Y) {
        const x = clamp(prop.x, 0.02 + prop.r, 0.98 - prop.r);
        state.pile.push({ x, y: FLOOR_Y - prop.r, px: x, py: FLOOR_Y - prop.r, r: prop.r });
        prop.dead = true;
      } else if (prop.x - prop.r < 0) {
        prop.x = prop.r;
        prop.vx = Math.abs(prop.vx);
      } else if (prop.x + prop.r > 1) {
        prop.x = 1 - prop.r;
        prop.vx = -Math.abs(prop.vx);
      }
    }
    separate(state.props.filter((prop) => prop.state === 'resting'));
    for (const prop of state.props) {
      if (prop.state !== 'resting') continue;
      const contact = ropeY(prop.x) - prop.r - ROPE_R;
      prop.y += (contact - prop.y) * 0.35;
      if (prop.y > contact) prop.y = contact;
      prop.restX = prop.x;
      prop.restY = prop.y;
    }
    state.props = state.props.filter((prop) => !prop.dead);
    state.ring = Math.max(0, state.ring - STEP * 1.5);
  }

  function drawLeg(leg) {
    ctx.beginPath();
    const first = at(leg[0]);
    ctx.moveTo(first.x, first.y);
    for (let index = 1; index < leg.length; index += 1) {
      const next = at(leg[index]);
      ctx.lineTo(next.x, next.y);
    }
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.fill();
  }

  function ball(item) {
    const centre = at(item);
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, item.r * S, 0, Math.PI * 2);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.0025 * S;
    ctx.stroke();
  }

  function drawOnboarding() {
    if (!state.onboarding) return;
    const move = clamp((state.onboardingTime - 0.8) / 1.2, 0, 1);
    const pull = clamp((state.onboardingTime - 2.4) / 1.2, 0, 1);
    const loaded = point(0.5, ropeY(0.5) - 0.035);
    const moving = state.onboardingTime < 2
      ? point(lerp(0.16, loaded.x, move), lerp(0.9, loaded.y, move))
      : point(lerp(loaded.x, 0.5, pull), lerp(loaded.y, 0.82, pull));
    ctx.fillStyle = 'rgba(22,22,22,.62)';
    ctx.font = `${Math.round(S * 0.019)}px 'DM Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('возьми шар · положи на жгут · тяни вниз', ox + S * 0.5, oy + S * 0.18);
    ctx.textAlign = 'left';
    ball({ ...moving, r: 0.022 });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = PAPER;
    ctx.fillRect(ox, oy, S, S);
    ctx.beginPath();
    if (state.held !== null && state.dragProp) {
      const anchor = at(leftAnchor);
      const held = at(state.rope[state.held]);
      const end = at(rightAnchor);
      ctx.moveTo(anchor.x, anchor.y);
      ctx.lineTo(held.x, held.y);
      ctx.lineTo(end.x, end.y);
    } else {
      const first = at(state.rope[0]);
      ctx.moveTo(first.x, first.y);
      for (let index = 1; index < state.rope.length; index += 1) {
        const node = at(state.rope[index]);
        ctx.lineTo(node.x, node.y);
      }
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = ROPE_W * S;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    drawLeg(leftLeg);
    drawLeg(rightLeg);
    for (const item of state.pile) ball(item);
    if (state.play) {
      const nearest = Math.max(...state.targets.map((target) => target.y));
      const danger = clamp((nearest - (DANGER_Y - 0.18)) / 0.18, 0, 1);
      ctx.setLineDash([0.006 * S, 0.006 * S]);
      ctx.strokeStyle = `rgba(224,33,15,${state.over ? 1 : 0.06 + danger * 0.74})`;
      ctx.lineWidth = 0.0015 * S;
      ctx.beginPath();
      ctx.moveTo(ox, oy + DANGER_Y * S);
      ctx.lineTo(ox + S, oy + DANGER_Y * S);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const target of state.targets) {
      const centre = at(target);
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, target.r * S, 0, Math.PI * 2);
      ctx.fillStyle = RED;
      ctx.fill();
    }
    for (const prop of state.props) ball(prop);
    drawOnboarding();
    if (state.ring > 0) {
      const centre = at(state.hitAt);
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, (0.03 + (1 - state.ring) * 0.12) * S, 0, Math.PI * 2);
      ctx.strokeStyle = RED;
      ctx.lineWidth = 0.002 * S;
      ctx.globalAlpha = state.ring;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = state.ring > 0.5 ? RED : INK;
    ctx.font = `${Math.round(S * 0.022)}px 'DM Mono', monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(state.play ? String(state.score) : `песочница · ${state.score}`, ox + S * 0.5, oy + S * 0.06);
    ctx.textAlign = 'left';
    if (state.over) {
      ctx.fillStyle = RED;
      ctx.font = `${Math.round(S * 0.026)}px 'DM Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('мишень дошла до черты — клик — заново', ox + S * 0.5, oy + (DANGER_Y - 0.02) * S);
      ctx.textAlign = 'left';
    }
  }

  function track(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.x = clamp((event.clientX - bounds.left - ox) / S, 0, 1);
    pointer.y = clamp((event.clientY - bounds.top - oy) / S, 0, 1);
  }

  function clearDrag() {
    state.dragProp = null;
    state.held = null;
    state.fromPile = false;
    state.dragMoved = false;
    state.dragStart = null;
  }

  function onDown(event) {
    track(event);
    canvas.setPointerCapture?.(event.pointerId);
    if (state.over) { reset(); return; }
    finishOnboarding();
    for (const prop of state.props) {
      if (prop.state === 'flying' || Math.hypot(pointer.x - prop.x, pointer.y - prop.y) >= 0.045) continue;
      state.dragProp = prop;
      state.held = prop.state === 'resting' ? ropeNode(prop.x) : null;
      state.fromPile = false;
      state.dragMoved = false;
      state.dragStart = point(pointer.x, pointer.y);
      prop.state = 'dragging';
      return;
    }
    let chosen = -1;
    let distance = Infinity;
    state.pile.forEach((item, index) => {
      const candidate = Math.hypot(pointer.x - item.x, pointer.y - item.y);
      if (candidate < item.r + 0.012 && candidate < distance) { chosen = index; distance = candidate; }
    });
    if (chosen < 0) return;
    const prop = { ...state.pile.splice(chosen, 1)[0], vx: 0, vy: 0, state: 'dragging' };
    state.props.push(prop);
    state.dragProp = prop;
    state.held = null;
    state.fromPile = true;
    state.dragMoved = false;
    state.dragStart = point(pointer.x, pointer.y);
  }

  function onMove(event) {
    track(event);
    const prop = state.dragProp;
    if (!prop) return;
    if (!state.dragMoved) state.dragMoved = Math.hypot(pointer.x - state.dragStart.x, pointer.y - state.dragStart.y) > 0.012;
    prop.x = pointer.x;
    prop.y = pointer.y;
    if (state.fromPile && state.held === null) {
      const caught = catchPoint(point(pointer.px, pointer.py), point(pointer.x, pointer.y), prop.r);
      if (caught) {
        state.held = ropeNode(caught.x);
        prop.restX = caught.x;
        prop.restY = caught.y;
      }
    }
    limitDraw(prop);
  }

  function onUp() {
    const prop = state.dragProp;
    if (!prop) return;
    if (state.fromPile && !state.dragMoved) {
      prop.x = 0.5;
      prop.y = ropeY(0.5) - prop.r - ROPE_R;
      prop.px = prop.x;
      prop.restX = prop.x;
      prop.restY = prop.y;
      prop.state = 'resting';
      clearDrag();
      return;
    }
    if (state.held === null) {
      prop.vx = 0;
      prop.vy = 0;
      prop.state = 'free';
      clearDrag();
      return;
    }
    const node = state.rope[state.held];
    node.pinned = false;
    node.px = node.x;
    node.py = node.y;
    const dx = prop.restX - prop.x;
    const dy = prop.restY - prop.y;
    const pull = Math.hypot(dx, dy);
    if (pull > 0.06 && dy < 0) {
      const force = Math.min(MAX_DRAW, pull) * params.power / pull;
      for (const other of state.props) {
        if (other.state !== 'resting') continue;
        other.vx = dx * force;
        other.vy = dy * force;
        other.state = 'flying';
      }
      prop.vx = dx * force;
      prop.vy = dy * force;
      prop.state = 'flying';
    } else {
      prop.x = prop.restX;
      prop.y = prop.restY;
      prop.px = prop.x;
      prop.state = 'resting';
    }
    state.held = null;
    restoreRope();
    clearDrag();
  }

  function frame(now) {
    debt = Math.min(0.1, debt + (now - last) / 1000);
    last = now;
    while (debt >= STEP) { step(); debt -= STEP; }
    draw();
    frameId = requestAnimationFrame(frame);
  }

  function buildControls() {
    const panel = document.createElement('div');
    panel.className = 'sketch-panel';
    panel.dataset.letterLayer = '';
    panel.hidden = true;
    const modes = document.createElement('div');
    modes.className = 'sketch-modes';
    const note = document.createElement('p');
    panel.append(modes, note);
    const knobs = [];

    function modeButton(label, play) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sketch-mode';
      button.textContent = label;
      button.addEventListener('click', () => {
        if (state.play === play) return;
        state.play = play;
        if (play) Object.assign(params, gameParams);
        reset();
        sync();
      });
      modes.append(button);
      return button;
    }

    const playButton = modeButton('на рекорд', true);
    const sandboxButton = modeButton('песочница', false);
    for (const [key, label, min, max, step] of [['slack', 'провис', 0.5, 2, 0.05], ['power', 'упругость', 4, 12, 0.5]]) {
      const field = document.createElement('label');
      field.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = min;
      input.max = max;
      input.step = step;
      input.value = params[key];
      input.addEventListener('input', () => { params[key] = Number(input.value); });
      field.append(input);
      panel.append(field);
      knobs.push({ key, input });
    }
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'sketch-action';
    again.textContent = 'заново';
    again.addEventListener('click', reset);
    panel.append(again);
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
    workspace.append(panel, toggle);
    function sync() {
      playButton.setAttribute('aria-pressed', String(state.play));
      sandboxButton.setAttribute('aria-pressed', String(!state.play));
      note.textContent = state.play
        ? 'результат идёт в общий счёт'
        : 'ручки открыты, результат не в зачёт';
      hint.textContent = state.play
        ? 'кликни по шару или тяни его к жгуту · игра на рекорд'
        : 'кликни по шару или тяни его к жгуту · песочница';
      for (const knob of knobs) {
        knob.input.disabled = state.play;
        knob.input.value = params[knob.key];
      }
    }
    return { panel, toggle, sync };
  }

  function onKey(event) {
    if (event.key !== 'Tab' || (event.target instanceof Element && event.target.closest('input, textarea, select'))) return;
    event.preventDefault();
    controls.toggle.click();
  }

  workspace.dataset.ground = 'paper';
  const hint = document.createElement('div');
  hint.className = 'workspace-hint';
  hint.dataset.letterLayer = '';
  hint.textContent = 'кликни по шару или тяни его к жгуту';
  workspace.append(hint);
  const controls = buildControls();
  const observer = new ResizeObserver(resize);
  observer.observe(workspace);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  document.addEventListener('keydown', onKey);
  resize();
  reset();
  controls.sync();
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    observer.disconnect();
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.removeEventListener('keydown', onKey);
    controls.panel.remove();
    controls.toggle.remove();
    hint.remove();
    delete workspace.dataset.ground;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
}

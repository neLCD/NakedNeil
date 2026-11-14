// A small single-series line chart (SVG) with a crosshair + tooltip on hover/touch.
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...kids);
  return el;
};

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

/**
 * points: [{ x: timestamp, y: number, label: string }] sorted by x.
 * fmtDate(ts) and fmtValue(point) produce the tooltip text.
 */
export function lineChart({ points, unit, fmtDate, fmtValue, ariaLabel }) {
  const W = 340, H = 190, m = { l: 36, r: 46, t: 12, b: 24 };
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const px = (x) => (x1 === x0 ? (m.l + W - m.r) / 2 : m.l + ((x - x0) / (x1 - x0)) * (W - m.l - m.r));
  const py = (y) => H - m.b - ((y - y0) / (y1 - y0)) * (H - m.t - m.b);

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': ariaLabel });
  for (const t of ticks) {
    root.append(svg('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: py(t), y2: py(t) }));
    const label = svg('text', { class: 'axis', x: m.l - 6, y: py(t) + 3.5, 'text-anchor': 'end' });
    label.textContent = String(t);
    root.append(label);
  }
  const unitLabel = svg('text', { class: 'axis', x: m.l - 6, y: H - 6, 'text-anchor': 'end' });
  unitLabel.textContent = unit;
  root.append(unitLabel);
  const first = svg('text', { class: 'axis', x: px(x0), y: H - 6, 'text-anchor': x1 === x0 ? 'middle' : 'start' });
  first.textContent = fmtDate(x0);
  root.append(first);
  if (x1 !== x0) {
    const lastX = svg('text', { class: 'axis', x: px(x1), y: H - 6, 'text-anchor': 'end' });
    lastX.textContent = fmtDate(x1);
    root.append(lastX);
  }

  const cross = svg('line', { class: 'cross', y1: m.t, y2: H - m.b, visibility: 'hidden' });
  root.append(cross);
  if (points.length > 1) {
    root.append(svg('path', { class: 'line', d: points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join('') }));
  }
  const dots = points.map((p) => svg('circle', { class: 'dot', cx: px(p.x), cy: py(p.y), r: 4 }));
  root.append(...dots);
  // direct label on the latest value only
  const last = points[points.length - 1];
  const endLabel = svg('text', { class: 'endlabel', x: px(last.x) + 8, y: py(last.y) + 4 });
  endLabel.textContent = last.label;
  if (points.length > 1) root.append(endLabel);

  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  wrap.append(root, tip);

  function show(clientX) {
    const r = root.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(px(p.x) - sx) < Math.abs(px(points[best].x) - sx)) best = i; });
    const p = points[best], cx = px(p.x);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    dots.forEach((d, i) => d.setAttribute('r', i === best ? 6 : 4));
    tip.hidden = false;
    tip.replaceChildren(Object.assign(document.createElement('b'), { textContent: fmtValue(p) }), document.createElement('br'), fmtDate(p.x, true));
    const left = (cx / W) * r.width;
    tip.style.left = `${Math.max(48, Math.min(r.width - 48, left))}px`;
    tip.style.top = `${(py(p.y) / H) * r.height - 8}px`;
  }
  function hide() {
    cross.setAttribute('visibility', 'hidden');
    dots.forEach((d) => d.setAttribute('r', 4));
    tip.hidden = true;
  }
  root.addEventListener('pointermove', (e) => show(e.clientX));
  root.addEventListener('pointerdown', (e) => show(e.clientX));
  root.addEventListener('pointerleave', hide);
  return wrap;
}

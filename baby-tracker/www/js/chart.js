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

/**
 * Daily bar chart, one measure, optionally stacked into 2 series.
 * days: [{ label, title, values: [n, ...], partial }]  (oldest first)
 * series: [{ name, cls }]   cls picks the fill colour via CSS (.s1, .s2)
 */
export function barChart({ days, series, unit, fmtValue, ariaLabel, band }) {
  const W = 340, H = 180, m = { l: 30, r: 6, t: 10, b: 24 };
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const totals = days.map((d) => d.values.reduce((a, b) => a + b, 0));
  const ticks = niceTicks(0, Math.max(1, band ? band[1] : 0, ...totals), 3).filter((t) => t >= 0);
  const top = ticks[ticks.length - 1];
  const slot = (W - m.l - m.r) / days.length, bw = Math.min(26, slot * 0.62);
  const py = (v) => H - m.b - (v / top) * (H - m.t - m.b);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': ariaLabel });
  for (const t of ticks) {
    root.append(svg('line', { class: 'grid', x1: m.l, x2: W - m.r, y1: py(t), y2: py(t) }));
    const label = svg('text', { class: 'axis', x: m.l - 6, y: py(t) + 3.5, 'text-anchor': 'end' });
    label.textContent = t === 0 ? unit : String(t);
    root.append(label);
  }
  if (band) { // typical range for this age, drawn behind the bars
    root.append(svg('rect', { class: 'band', x: m.l, width: W - m.l - m.r, y: py(band[1]), height: py(band[0]) - py(band[1]) }));
    const bl = svg('text', { class: 'axis', x: W - m.r - 4, y: py(band[1]) - 4, 'text-anchor': 'end' });
    bl.textContent = 'typical range';
    root.append(bl);
  }
  const every = days.length > 20 ? 5 : days.length > 10 ? 2 : 1;
  const cols = days.map((d, i) => {
    const cx = m.l + slot * (i + 0.5), g = svg('g', { class: 'col' + (d.partial ? ' partial' : '') });
    let base = 0;
    const last = d.values.reduce((acc, v, j) => (v > 0 ? j : acc), -1);
    d.values.forEach((v, j) => {
      if (v <= 0) return;
      const y1 = py(base + v), y0 = py(base) - (base > 0 ? 2 : 0); // 2px surface gap between stacked segments
      const hgt = Math.max(1, y0 - y1), r = j === last ? Math.min(4, hgt, bw / 2) : 0, x = cx - bw / 2;
      g.append(svg('path', { class: `bar ${series[j].cls}`, d: `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + bw - r}Q${x + bw},${y1} ${x + bw},${y1 + r}V${y0}Z` }));
      base += v;
    });
    if ((days.length - 1 - i) % every === 0) {
      const label = svg('text', { class: 'axis', x: cx, y: H - 7, 'text-anchor': 'middle' });
      label.textContent = d.label;
      g.append(label);
    }
    root.append(g);
    return g;
  });
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  wrap.append(root, tip);
  function show(clientX) {
    const r = root.getBoundingClientRect();
    const i = Math.max(0, Math.min(days.length - 1, Math.floor((((clientX - r.left) / r.width) * W - m.l) / slot)));
    cols.forEach((c, j) => c.classList.toggle('dim', j !== i));
    tip.hidden = false;
    tip.replaceChildren(Object.assign(document.createElement('b'), { textContent: fmtValue(days[i]) }), document.createElement('br'), days[i].title);
    tip.style.left = `${Math.max(60, Math.min(r.width - 60, ((m.l + slot * (i + 0.5)) / W) * r.width))}px`;
    tip.style.top = `${(py(totals[i]) / H) * r.height - 8}px`;
  }
  function hide() { cols.forEach((c) => c.classList.remove('dim')); tip.hidden = true; }
  root.addEventListener('pointermove', (e) => show(e.clientX));
  root.addEventListener('pointerdown', (e) => show(e.clientX));
  root.addEventListener('pointerleave', hide);
  return wrap;
}

/**
 * Day-pattern strip: one 24-hour row per day, sleep as blocks and feeds as dots.
 * rows: [{ label, title, sleeps: [[startFrac, endFrac]], feeds: [frac], summary }]
 */
export function patternChart({ rows, ariaLabel }) {
  const W = 340, rowH = 22, m = { l: 40, r: 8, t: 4, b: 20 }, H = m.t + rows.length * rowH + m.b;
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const pw = W - m.l - m.r, px = (f) => m.l + f * pw;
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': ariaLabel });
  [[0, '12am'], [0.25, '6am'], [0.5, '12pm'], [0.75, '6pm'], [1, '12am']].forEach(([f, text], i) => {
    root.append(svg('line', { class: 'grid', x1: px(f), x2: px(f), y1: m.t, y2: H - m.b + 3 }));
    const label = svg('text', { class: 'axis', x: px(f), y: H - 5, 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle' });
    label.textContent = text;
    root.append(label);
  });
  const groups = rows.map((r, i) => {
    const y = m.t + i * rowH, g = svg('g', { class: 'col' });
    const label = svg('text', { class: 'axis', x: m.l - 6, y: y + rowH / 2 + 3.5, 'text-anchor': 'end' });
    label.textContent = r.label;
    g.append(label, svg('rect', { class: 'track', x: m.l, y: y + 4, width: pw, height: rowH - 8, rx: 4 }));
    for (const [a, b] of r.sleeps) g.append(svg('rect', { class: 'bar s1', x: px(a), y: y + 4, width: Math.max(1.5, (b - a) * pw), height: rowH - 8, rx: 3 }));
    for (const f of r.feeds) g.append(svg('circle', { class: 'feedmark', cx: px(f), cy: y + rowH / 2, r: 3 }));
    root.append(g);
    return g;
  });
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  wrap.append(root, tip);
  function show(clientY) {
    const r = root.getBoundingClientRect();
    const i = Math.max(0, Math.min(rows.length - 1, Math.floor((((clientY - r.top) / r.height) * H - m.t) / rowH)));
    groups.forEach((g, j) => g.classList.toggle('dim', j !== i));
    tip.hidden = false;
    tip.replaceChildren(Object.assign(document.createElement('b'), { textContent: rows[i].summary }), document.createElement('br'), rows[i].title);
    tip.style.left = '50%';
    tip.style.top = `${((m.t + i * rowH) / H) * r.height - 4}px`;
  }
  function hide() { groups.forEach((g) => g.classList.remove('dim')); tip.hidden = true; }
  root.addEventListener('pointermove', (e) => show(e.clientY));
  root.addEventListener('pointerdown', (e) => show(e.clientY));
  root.addEventListener('pointerleave', hide);
  return wrap;
}

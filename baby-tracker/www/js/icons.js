// Small line-icon set (24px grid, stroke follows the text colour).
const NS = 'http://www.w3.org/2000/svg';
const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
  trends: 'M5 20v-7M12 20V5M19 20V10M3 20h18',
  sound: 'M4 10v4h3l5 4V6l-5 4zM15.500 9.500a3.500 3.500 0 0 1 0 5M18 7a7 7 0 0 1 0 10',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  ideas: 'M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9zM19 15v5M16.5 17.5h5',
  settings: 'M4 7h9M19 7h1M4 17h1M11 17h9M16 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  bottle: 'M11 3h2v3h-2zM10 6h4v3h-4zM8 12a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3zM8 14h3',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  diaper: 'M4 7h16v3a8 8 0 0 1-16 0zM4 10c3 0 5 2 5 5M20 10c-3 0-5 2-5 5',
  spit: 'M12 3s3.5 4 3.5 6.5a3.5 3.5 0 0 1-7 0C8.500 7 12 3 12 3zM4 19c2-2 4-2 6 0s4 2 6 0 3-1.500 4-1',
  bowl: 'M3 11h18a9 9 0 0 1-18 0zM8 21h8M16 3l-3 8',
  heart: 'M12 20s-7.500-4.600-7.500-10A4.200 4.200 0 0 1 12 7.500 4.200 4.200 0 0 1 19.500 10c0 5.400-7.500 10-7.500 10z',
  ruler: 'M4 15L15 4l5 5L9 20zM8 11l2 2M11 8l2 2M14 5l2 2',
  bubble: 'M4 5h16v11H9l-5 4z',
};
export function icon(name, size = 24) {
  const el = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) el.setAttribute(k, v);
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', PATHS[name] || PATHS.star);
  el.append(path);
  return el;
}

// Minimal inline-SVG charts. Colours come from CSS variables so they follow the theme.

import { esc, money, num, MON } from './util.js';

const compact = v => (v >= 1000 ? `${num(v / 1000, v >= 10000 ? 0 : 1)}k` : num(v, 0));

// 12 monthly columns.
export function monthBars(values, { color = 'var(--accent)', label = 'CAD' } = {}) {
  const max = Math.max(...values, 1);
  const W = 360, H = 150, pad = 18, bw = (W - 8) / 12;
  const bars = values.map((v, i) => {
    const h = Math.round((v / max) * (H - pad - 22));
    const x = 4 + i * bw;
    return `<g>
      <title>${MON[i]}: ${money(v)}</title>
      <rect x="${x + 4}" y="${H - pad - h}" width="${bw - 8}" height="${Math.max(h, v > 0 ? 2 : 0)}" fill="${color}"></rect>
      ${v > 0 ? `<text x="${x + bw / 2}" y="${H - pad - h - 4}" class="c-val">${compact(v)}</text>` : ''}
      <text x="${x + bw / 2}" y="${H - 4}" class="c-lab">${MON[i][0]}</text>
    </g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly ${esc(label)}">
    <line x1="0" x2="${W}" y1="${H - pad}" y2="${H - pad}" class="c-axis"></line>${bars}</svg>`;
}

// Ranked horizontal bars: [{ label, value }]
export function rankBars(items, { limit = 7, color = 'var(--accent)' } = {}) {
  const rows = items.filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  if (!rows.length) return '<p class="muted">Nothing recorded yet.</p>';
  const top = rows.slice(0, limit);
  const rest = rows.slice(limit).reduce((t, r) => t + r.value, 0);
  if (rest > 0) top.push({ label: 'All others', value: rest });
  const max = Math.max(...top.map(r => r.value));
  return `<div class="rank">${top.map(r => `
    <div class="rank-row">
      <span class="rank-label">${esc(r.label)}</span>
      <span class="rank-val">${money(r.value, 'CAD', 0)}</span>
      <span class="rank-track"><span style="width:${Math.max(1, (r.value / max) * 100)}%;background:${color}"></span></span>
    </div>`).join('')}</div>`;
}

// Two-part proportion bar.
export function splitBar(a, b, fmt = v => num(v)) {
  const total = a.value + b.value;
  if (!(total > 0)) return '<p class="muted">Nothing recorded yet.</p>';
  const pa = (a.value / total) * 100;
  return `<div class="split">
    <div class="split-track"><span style="width:${pa}%"></span></div>
    <div class="split-legend">
      <span><i class="dot a"></i>${esc(a.label)} <strong>${fmt(a.value)}</strong> (${num(pa, 0)}%)</span>
      <span><i class="dot b"></i>${esc(b.label)} <strong>${fmt(b.value)}</strong> (${num(100 - pa, 0)}%)</span>
    </div>
  </div>`;
}

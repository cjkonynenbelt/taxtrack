// Small shared helpers. No app state in here.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uid(prefix) {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(4)), b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${Date.now().toString(36)}-${rand}`.toUpperCase();
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function num(n, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return Number(n).toLocaleString('en-CA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// money(1234.5) -> "$1,234.50"; money(500, 'USD') -> "US$500.00"
export function money(n, cur = 'CAD', digits = 2) {
  if (n == null || Number.isNaN(n)) return '—';
  const neg = n < 0 ? '-' : '';
  return `${neg}${cur === 'USD' ? 'US$' : '$'}${num(Math.abs(n), digits)}`;
}

export const pct = (f, digits = 1) => (f == null ? '—' : `${num(f * 100, digits)}%`);

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON = MONTHS.map(m => m.slice(0, 3));

export const yearOf = date => Number(String(date || '').slice(0, 4));
export const monthOf = date => Number(String(date || '').slice(5, 7)); // 1-12
export const monthKey = date => String(date || '').slice(0, 7);
export function monthLabel(key) {
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}
export function fmtDate(date) {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return `${MON[Number(m) - 1]} ${Number(d)}, ${y}`;
}

export function download(filename, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function sum(list, fn) {
  let t = 0;
  for (const x of list) t += Number(fn(x)) || 0;
  return t;
}

export function groupBy(list, fn) {
  const out = new Map();
  for (const x of list) {
    const k = fn(x);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(x);
  }
  return out;
}

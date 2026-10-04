// Entry point: loads data, handles routing, theme, year selector and the app lock.

import { state, load, onChange, saveSettings, all } from './store.js';
import * as v1 from './views.js';
import * as v2 from './views2.js';
import * as v3 from './assets.js';
import * as m from './mileage.js';
import * as q from './equipment.js';
import * as c from './cra.js';
import * as sc from './scan.js';
import * as dash from './dashboard.js';
import * as d from './deduct.js';
import * as g from './gst.js';
import * as hm from './home.js';
import * as rm from './reminders.js';
import * as ln from './learn.js';
import * as cv from './ccaview.js';
import { requireUnlock } from './lock.js';
import { $, $$, yearOf } from './util.js';

const routes = {
  home: dash.home, income: v1.income, trips: m.mileage, expenses: v1.expenses,
  customers: v1.customers, customer: v1.customer, installations: v1.installations,
  recurring: v1.recurring, months: v1.months, month: v1.month, more: v1.more,
  assets: v3.assets, asset: v3.asset,
  equipment: q.equipment, equip: q.equipItem, techreport: q.techReport, cra: c.cra, 'needs-review': sc.needsReview,
  tax: v2.tax, review: v2.review, reference: d.deduct, deduct: d.deduct, export: v2.exportView, settings: v2.settings,
  gst: g.gst, homeoffice: hm.homeOffice, phone: hm.phone, reminders: rm.remindersView,
  learn: ln.learn, updates: ln.updatesView, sources: ln.sources, cca: cv.ccaView,
};
// Which bottom-nav tab is highlighted for each route.
const TAB = { home: 'home', trips: 'trips', expenses: 'expenses' };
// Detail screens highlight their parent section in the sidebar.
const PARENT = { customer: 'customers', month: 'months', asset: 'cca', assets: 'cca', equipment: 'cca', equip: 'cca', techreport: 'cca', 'needs-review': 'expenses', reference: 'deduct', sources: 'learn' };

function paintNav() {
  $('.side').innerHTML = `<a href="#/home" data-tab="home">Dashboard</a>${v1.SECTIONS.map(([title, items]) => `${title ? `<h3>${title}</h3>` : '<hr>'}${items.map(([r, t]) => `<a href="#/${r}" data-tab="${r}">${t}</a>`).join('')}`).join('')}`;
}

const root = $('#view');

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function paintYears() {
  const sel = $('#year');
  const now = new Date().getFullYear();
  const recorded = ['income', 'expense', 'trip', 'installation'].flatMap(k => all(k).map(r => yearOf(r.date))).filter(Boolean);
  const from = Math.min(now, state.settings.year, ...recorded);
  const to = Math.max(now + 2, state.settings.year, ...recorded);
  sel.innerHTML = '';
  for (let y = from; y <= to; y++) sel.add(new Option(`Tax year ${y}`, y, false, y === state.settings.year));
}

function render() {
  const [name = 'home', param] = location.hash.replace(/^#\/?/, '').split('/');
  const view = routes[name] || routes.home;
  root.onclick = null;
  view(root, param ? decodeURIComponent(param) : undefined);
  const tab = TAB[name] || (routes[name] ? 'more' : 'home');
  const section = PARENT[name] || name;
  $$('[data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === (a.closest('.bottom') ? tab : section)));
  const n = rm.counts().issues;
  const badge = $('[data-count]');
  badge.hidden = !n;
  badge.textContent = n;
  applyTheme();
  paintYears();
}

async function start() {
  await load();
  applyTheme();
  await requireUnlock();
  paintNav();
  $('#app').hidden = false;
  $('[data-add]').addEventListener('click', dash.quickAdd);

  $('#year').addEventListener('change', async e => { state.settings.year = Number(e.target.value); await saveSettings(); });
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  onChange(() => {
    // Keep the scroll position when data changes under the current screen.
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  });
  render();
  m.resumeTrip();

  // Re-lock after the app has been in the background for a while.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (state.settings.lock.enabled && hiddenAt && Date.now() - hiddenAt > 60000) {
      $('#app').hidden = true;
      await requireUnlock();
      $('#app').hidden = false;
    }
  });

  // Offline support. Skipped on localhost so development always sees fresh files.
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && (!local || location.search.includes('sw'))) navigator.serviceWorker.register('sw.js').catch(() => {});
}

start().catch(err => {
  document.body.innerHTML = `<p style="padding:24px;font-family:sans-serif">TaxTrack could not start: ${String(err && err.message || err)}<br><br>This app needs a browser with local storage (IndexedDB) enabled. Private/incognito windows may block it.</p>`;
});

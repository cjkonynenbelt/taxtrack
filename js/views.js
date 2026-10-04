// Screens: dashboard and the record lists. Each view renders into `root`.

import { state, all, byId, customerName, expectedPayments, isDue, skipExpected } from './store.js';
import { summary, inYear, cadOf, expenseParts, kmSummary, monthSummary, customerTotals, normVehicle } from './calc.js';
import { tripForm, startTripForm, stopTripForm, activeTrip } from './mileage.js';
import { equipForm } from './equipment.js';
import { scanReceipt, reviewQueue } from './scan.js';
import { incomeForm, expenseForm, customerForm, installationForm, recurringForm, confirmExpected } from './forms.js';
import { confirmDialog, viewReceipt } from './ui.js';
import { monthBars, rankBars, splitBar } from './charts.js';
import { INCOME_TYPES, VEHICLE_CATEGORIES, OTHER_CATEGORIES, VEHICLE_INFO } from './reference.js';
import { $, $$, esc, money, num, pct, MONTHS, monthKey, monthLabel, fmtDate, sum, groupBy } from './util.js';

const Y = () => state.settings.year;

// ---- shared pieces ---------------------------------------------------------

export const head = (title, actions = '', sub = '') => `
  <div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="actions">${actions}</div></div>`;

export const stat = (label, value, sub = '', cls = '') => `
  <div class="stat ${cls}"><span class="stat-label">${esc(label)}</span><span class="stat-value">${value}</span>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</div>`;

const tag = (text, cls = '') => `<span class="tag ${cls}">${esc(text)}</span>`;
const empty = text => `<p class="empty">${esc(text)}</p>`;

const row = ({ id, act = 'edit', title, sub = '', right = '', rightSub = '' }) => `
  <button class="row" data-act="${act}" data-id="${esc(id)}">
    <span class="row-main"><span class="row-title">${title}</span><span class="row-sub">${sub}</span></span>
    <span class="row-amt"><strong>${right}</strong><small>${rightSub}</small></span>
  </button>`;

const amountOf = r => money(r.amount, r.currency);
const cadNote = r => (r.currency !== 'USD' ? '' : r.cadAmount != null ? `${money(r.cadAmount)} CAD @ ${num(r.fxRate, 4)}` : '<span class="warn-text">no rate recorded</span>');

// Filter bar. `st` is kept per view so filters survive re-renders.
const filters = { income: {}, expenses: { group: '' } };

export function filterBar(st, selects) {
  const months = MONTHS.map((m, i) => ({ value: String(i + 1).padStart(2, '0'), label: m }));
  const sel = (name, label, opts) => `<select data-flt="${name}" aria-label="${esc(label)}"><option value="">${esc(label)}</option>${opts.map(o => {
    const v = typeof o === 'string' ? { value: o, label: o } : o;
    return `<option value="${esc(v.value)}"${st[name] === v.value ? ' selected' : ''}>${esc(v.label)}</option>`;
  }).join('')}</select>`;
  const active = Object.entries(st).some(([k, v]) => v && k !== 'group');
  return `<div class="filters">
    <input type="search" data-flt="q" placeholder="Search" value="${esc(st.q || '')}" aria-label="Search">
    <details${active && Object.keys(st).some(k => k !== 'q' && k !== 'group' && st[k]) ? ' open' : ''}><summary>Filters</summary>
      <div class="filter-grid">
        ${sel('month', 'All months', months)}
        ${selects.map(s => sel(s.name, s.label, s.options)).join('')}
        <label>From <input type="date" data-flt="from" value="${esc(st.from || '')}"></label>
        <label>To <input type="date" data-flt="to" value="${esc(st.to || '')}"></label>
        <button class="btn small" data-act="clear-filters">Clear filters</button>
      </div>
    </details>
  </div>`;
}

export function wireFilters(root, st, paint) {
  $$('[data-flt]', root).forEach(el => {
    const on = () => { st[el.dataset.flt] = el.value; paint(); };
    el.addEventListener('input', on);
    el.addEventListener('change', on);
  });
}

export function passes(r, st, text) {
  if (st.q && !text.toLowerCase().includes(st.q.toLowerCase())) return false;
  if (st.month && r.date.slice(5, 7) !== st.month) return false;
  if (st.from && r.date < st.from) return false;
  if (st.to && r.date > st.to) return false;
  if (st.customer && r.customerId !== st.customer) return false;
  if (st.currency && r.currency !== st.currency) return false;
  return true;
}

export const customerOptions = () => [...all('customer')].sort((a, b) => a.name.localeCompare(b.name)).map(c => ({ value: c.id, label: c.name }));
const newestFirst = list => [...list].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));

// Renders records grouped under month headings with a subtotal.
function monthGroups(list, rowFn, totalFn) {
  if (!list.length) return empty('No records match.');
  const groups = groupBy(newestFirst(list), r => monthKey(r.date));
  return [...groups.entries()].map(([k, rows]) => `
    <section class="group">
      <h3><a href="#/month/${k}">${monthLabel(k)}</a><span>${totalFn(rows)}</span></h3>
      ${rows.map(rowFn).join('')}
    </section>`).join('');
}

function expectedBlock(year, { limit = 6 } = {}) {
  const due = expectedPayments(year).filter(x => isDue(x.period));
  if (!due.length) return '';
  return `<section class="panel notice">
    <h2>Expected payments to confirm</h2>
    <p class="muted">From your recurring income. These are not counted as income until you confirm you received them.</p>
    ${due.slice(0, limit).map(x => `
      <div class="row static">
        <span class="row-main"><span class="row-title">${esc(customerName(x.customerId) || x.payer || 'Recurring')}</span>
          <span class="row-sub">${monthLabel(x.period)} &middot; ${esc(x.type)}</span></span>
        <span class="row-amt"><strong>${money(x.amount, x.currency)}</strong>
          <span class="row-btns"><button class="btn small primary" data-act="confirm-exp" data-id="${x.recurringId}|${x.period}">Confirm received</button>
          <button class="btn small" data-act="skip-exp" data-id="${x.recurringId}|${x.period}">Not paid</button></span></span>
      </div>`).join('')}
    ${due.length > limit ? `<p class="muted"><a href="#/recurring">${due.length - limit} more</a></p>` : ''}
  </section>`;
}

async function expectedAction(act, id) {
  const [rid, period] = id.split('|');
  const x = expectedPayments(Number(period.slice(0, 4))).find(e => e.recurringId === rid && e.period === period);
  if (!x) return;
  if (act === 'confirm-exp') confirmExpected(x);
  else if (await confirmDialog(`Mark ${monthLabel(period)} as not paid?`, { ok: 'Mark not paid', detail: 'It will be removed from the expected list for that month.' })) await skipExpected(rid, period);
}

// Click delegation helper: actions = { name: (id, el) => ... }
function wire(root, actions) {
  root.onclick = e => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el.dataset.id, el); }
  };
}
const expActions = { 'confirm-exp': id => expectedAction('confirm-exp', id), 'skip-exp': id => expectedAction('skip-exp', id) };

// ---- dashboard -------------------------------------------------------------

export function home(root) {
  const s = summary(Y());
  const t = s.tax;
  const hasData = s.income.count || s.exp.items.length || s.km.loggedBiz;

  // Everything below is counted from the records for the selected tax year.
  const exps = inYear('expense', Y());
  const biz = exps.filter(e => e.use !== 'personal');
  const queue = reviewQueue().filter(x => x.e.date.slice(0, 4) === String(Y()));
  const queued = new Set(queue.map(x => x.e.id));
  const deductions = s.exp.est + s.cca.counted + s.equip.counted;
  const equipBought = s.equip.rows.filter(r => r.purchased);
  const receipts = exps.filter(e => e.receiptId).length + equipBought.filter(r => r.e.receiptId).length;
  const categorized = exps.filter(e => e.group === 'vehicle' || e.category !== 'Other').length;
  const missing = biz.filter(e => !e.receiptId).length;
  const counts = {};
  for (const e of exps) { const k = e.category === 'Meals & entertainment' ? 'Meals' : e.category; counts[k] = (counts[k] || 0) + 1; }
  const cats = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const chip = (n, label) => `<span class="chip"><strong>${n}</strong>${esc(label)}</span>`;
  const reviewAmount = sum(queue, x => cadOf(x.e) || 0);
  const capitalAmount = sum(equipBought.filter(r => r.t.kind === 'capital'), r => r.t.cost || 0)
    + sum(biz.filter(e => e.category === 'Computer/equipment'), e => cadOf(e) || 0)
    + sum(all('asset').filter(a => a.status !== 'potential' && String(a.purchaseDate || '').slice(0, 4) === String(Y())), a => (Number(a.price) || 0) + (Number(a.salesTax) || 0));
  const recent = newestFirst(exps).slice(0, 5);
  const veh = [...s.km.vehicles].sort((a, b) => b.business - a.business || b.total - a.total)[0];
  const vehItems = s.exp.items.filter(x => x.e.group === 'vehicle' && x.e.use !== 'personal' && normVehicle(x.e.vehicle) === (veh && veh.name));
  const reviewPct = exps.length ? (exps.length - queue.length) / exps.length : null;
  const dupes = queue.filter(x => x.reasons.includes('Possible duplicate')).length;
  const capitals = queue.filter(x => x.reasons.some(r => r.startsWith('Possible capital asset'))).length;
  const dueIncome = s.expected.filter(x => isDue(x.period)).length;
  const alerts = [
    [queue.length, `${queue.length} expense${queue.length === 1 ? ' needs' : 's need'} review`, '#/needs-review'],
    [s.exp.vehicleTotal > 0 && s.km.totalIsWeak, 'Vehicle expenses rely on logged trips only - enter the year\'s odometer readings', '#/trips'],
    [missing, `${missing} business expense${missing === 1 ? ' is' : 's are'} missing a receipt`, '#/expenses'],
    [dupes, `${dupes} possible duplicate receipt${dupes === 1 ? '' : 's'}`, '#/needs-review'],
    [capitals, `${capitals} purchase${capitals === 1 ? '' : 's'} may be a capital asset`, '#/needs-review'],
    [s.income.unconverted, `${s.income.unconverted} USD payment${s.income.unconverted === 1 ? '' : 's'} missing an exchange rate`, '#/income'],
    [dueIncome, `${dueIncome} expected payment${dueIncome === 1 ? '' : 's'} to confirm`, '#/recurring'],
  ].filter(a => a[0]);
  const linkRow = (label, value, act) => `<button class="row" data-act="${act}"><span class="row-main"><span class="row-title">${label}</span></span><span class="row-amt"><strong>${value} &rsaquo;</strong></span></button>`;
  const line = (l, v) => `<div class="line"><span>${l}</span><span>${v}</span></div>`;

  root.innerHTML = `
    <div class="page-head"><div><h1>Tax year ${Y()}</h1><p class="muted">Estimates only &mdash; not a tax filing.</p></div></div>
    <section class="panel dash-hero">
      <span class="stat-label">Total potential deductions</span>
      <span class="hero-value">${money(deductions)}</span>
      <div class="chips">
        ${chip(exps.length, 'Expenses')}${chip(receipts, 'Receipts')}${chip(categorized, 'Categorized')}${cats[0] ? chip(cats[0][1], cats[0][0]) : ''}
        ${cats.length > 1 ? `<details class="chip-more"><summary>+ ${cats.length - 1} more</summary><div class="chips">${cats.slice(1).map(([k, n]) => chip(n, k)).join('')}</div></details>` : ''}
      </div>
    </section>
    <div class="dash-actions">
      <button class="quick-btn" data-act="scan">&#128247; Scan Receipt</button>
      <button class="quick-btn alt" data-act="add-expense">+ Add Expense</button>
    </div>
    <div class="dash-more">
      <button class="btn small" data-act="${activeTrip() ? 'stop-trip' : 'start-trip'}">${activeTrip() ? 'Stop trip' : '&#128663; Start trip'}</button>
      <button class="btn small" data-act="add-trip">+ Mileage</button>
      <button class="btn small" data-act="add-income">+ Income</button>
      <button class="btn small" data-act="add-equip">+ Asset</button>
      <button class="btn small" data-act="add-install">+ Installation</button>
    </div>
    ${queue.length ? `<a class="review-row" href="#/needs-review"><strong>${queue.length} expense${queue.length === 1 ? '' : 's'} need${queue.length === 1 ? 's' : ''} review</strong><span>&rarr;</span></a>` : ''}
    ${expectedBlock(Y(), { limit: 3 })}
    <div class="dash-grid">
      <section class="panel">
        <h2>Tax overview</h2>
        ${linkRow('Potential deductions', money(deductions), 'go-deductions')}
        ${linkRow('Needs review', money(reviewAmount), 'go-review')}
        ${linkRow('Likely personal', money(s.exp.personalTotal), 'go-personal')}
        ${linkRow('Potential capital assets', money(capitalAmount), 'go-capital')}
      </section>
      <section class="panel${alerts.length ? ' notice' : ''}">
        <h2>${alerts.length ? 'Needs attention' : 'Everything looks good'}</h2>
        ${alerts.length ? alerts.map(([, text, href]) => `<a class="row" href="${href}"><span class="row-main"><span class="row-title alert">${esc(text)}</span></span><span class="row-amt">&rsaquo;</span></a>`).join('') : '<p class="muted">&#10003; Your current records are organized.</p>'}
      </section>
      <section class="panel">
        <h2>Recent expenses <a class="link" href="#/expenses">View all &rarr;</a></h2>
        ${recent.length ? recent.map(e => `<button class="row" data-act="edit-expense" data-id="${e.id}">
          <span class="datebox">${fmtDate(e.date).split(',')[0].toUpperCase()}</span>
          <span class="row-main"><span class="row-title">${esc(e.vendor || e.category)}${queued.has(e.id) ? ' <span class="tag warn">Review</span>' : e.use === 'personal' ? ' <span class="tag">Personal</span>' : ''}</span><span class="row-sub">${e.group === 'vehicle' ? 'Vehicle / ' : ''}${esc(e.category)}</span></span>
          <span class="row-amt"><strong>${money(e.amount, e.currency)}</strong></span></button>`).join('') : `<p class="empty">No expenses in ${Y()} yet.</p>`}
      </section>
      <section class="panel">
        <h2>Receipt status</h2>
        ${line('Receipts stored', receipts)}
        ${line('Need review', queue.length)}
        ${line('Business expenses missing a receipt', missing)}
        ${line('Categorized', exps.length ? pct(categorized / exps.length, 0) : '—')}
      </section>
      ${veh ? `<section class="panel">
        <h2>Vehicle <a class="link" href="#/trips">View vehicle &rarr;</a></h2>
        <p><strong>${esc(veh.name)}</strong></p>
        ${line('Business km', `${num(veh.business)} km`)}
        ${line('Total km', `${num(veh.total)} km${veh.totalIsWeak && veh.total ? ' <small class="warn-text">logged trips only</small>' : ''}`)}
        ${line('Business use', pct(veh.pct))}
        ${line('Vehicle expenses', money(sum(vehItems, x => x.cad || 0)))}
        ${line('Potential business portion', money(sum(vehItems, x => x.est)))}
        ${s.km.vehicles.length > 1 ? `<p class="muted">All vehicles: ${num(s.km.business)} business km of ${num(s.km.total)} km (${pct(s.km.pct)}).</p>` : ''}
      </section>` : ''}
      <section class="panel">
        <h2>${Y()} tax year</h2>
        ${line('Income tracked', money(s.income.cad))}
        ${line('Business expenses recorded', money(s.exp.businessTotal))}
        ${line('Est. deductible vehicle expenses', money(s.exp.vehicleEst))}
        ${line('Est. other deductible expenses', money(s.exp.otherEst))}
        ${s.equip.rows.length || s.cca.rows.length ? line('Equipment &amp; vehicle CCA in the estimate', money(s.equip.counted + s.cca.counted)) : ''}
        ${line('Potential deductions', money(deductions))}
        ${line('Receipts', receipts)}
        ${line('Review status', reviewPct == null ? '—' : `${pct(reviewPct, 0)} complete`)}
        ${reviewPct == null ? '' : `<div class="progress"><span style="width:${Math.round(reviewPct * 100)}%"></span></div>`}
      </section>
    </div>
    <section class="panel">
      <h2>Income</h2>
      <div class="stats">
        ${stat('Total income received', money(s.income.cad), 'CAD', 'big')}
        ${stat('Total USD income', money(s.income.usd, 'USD'))}
        ${stat('CAD-converted USD income', money(s.income.usdConverted), s.income.unconverted ? `<span class="warn-text">${s.income.unconverted} payment(s) missing a rate</span>` : 'at the rates you recorded')}
      </div>
    </section>
    <section class="panel">
      <h2>Bottom line <a class="link" href="#/tax">Tax estimate</a></h2>
      <div class="stats">
        ${stat('Estimated net business income', money(s.net), '', 'big')}
        ${stat('Estimated income tax', money(t.incomeTax), `federal + ${esc(t.provinceName)}`)}
        ${stat('Estimated amount to save for taxes', money(t.setAside), `income tax + CPP${t.taxPaid ? ' less tax paid' : ''}`, 'big accent')}
      </div>
    </section>
    ${hasData ? `
    <div class="chart-grid">
      <section class="panel"><h2>Income by month</h2>${monthBars(s.income.byMonth, { label: 'income' })}</section>
      <section class="panel"><h2>Estimated deductible expenses by month</h2>${monthBars(s.exp.byMonth, { color: 'var(--accent-2)', label: 'expenses' })}</section>
      <section class="panel"><h2>Income by customer</h2>${rankBars(Object.entries(s.income.byCustomer).map(([label, value]) => ({ label, value })))}</section>
      <section class="panel"><h2>Expenses by category</h2>${rankBars([
        ...Object.entries(s.exp.byCategory).map(([label, v]) => ({ label, value: v.total })),
        ...Object.entries(s.exp.vehicleByCategory).map(([label, value]) => ({ label: `Vehicle: ${label}`, value })),
      ], { color: 'var(--accent-2)' })}</section>
      <section class="panel"><h2>Business vs personal kilometres</h2>${splitBar({ label: 'Business', value: s.km.business }, { label: 'Personal', value: s.km.personal }, v => `${num(v)} km`)}</section>
      <section class="panel"><h2>USD vs CAD income <small>(CAD value)</small></h2>${splitBar({ label: 'Paid in USD', value: s.income.usdConverted }, { label: 'Paid in CAD', value: s.income.cadNative }, v => money(v, 'CAD', 0))}</section>
    </div>` : `<section class="panel"><p class="muted">No records for ${Y()} yet. Use the buttons above to add your first income, trip or expense. Charts appear here once you have data.</p></section>`}
    <p class="where muted">Your records are stored only in this browser on this device. <a href="#/export">Back up regularly</a>.</p>`;
  wire(root, { 'start-trip': startTripForm, 'stop-trip': stopTripForm, 'add-income': () => incomeForm(), 'add-trip': () => tripForm(), 'add-expense': () => expenseForm(), 'add-install': () => installationForm(), 'add-equip': () => equipForm(), scan: scanReceipt, ...expActions,
    'edit-expense': id => expenseForm(byId('expense', id)),
    'go-deductions': () => { filters.expenses = { group: '' }; location.hash = '#/expenses'; },
    'go-personal': () => { filters.expenses = { group: '', use: 'personal' }; location.hash = '#/expenses'; },
    'go-review': () => { location.hash = '#/needs-review'; },
    'go-capital': () => { location.hash = '#/equipment'; },
  });
}

// ---- income ----------------------------------------------------------------

export function income(root) {
  const st = filters.income;
  const s = summary(Y());
  root.innerHTML = `
    ${head('Income', '<button class="btn primary" data-act="add">+ Add income</button>')}
    <div class="stats strip">
      ${stat('Received', money(s.income.cad), 'CAD')}
      ${stat('USD received', money(s.income.usd, 'USD'))}
      ${stat('Pending', String(s.income.pending.length), 'not counted')}
    </div>
    ${expectedBlock(Y())}
    ${filterBar(st, [
      { name: 'type', label: 'All payment types', options: INCOME_TYPES },
      { name: 'customer', label: 'All customers', options: customerOptions() },
      { name: 'currency', label: 'Any currency', options: ['CAD', 'USD'] },
      { name: 'status', label: 'Any status', options: [{ value: 'received', label: 'Received' }, { value: 'pending', label: 'Pending' }] },
    ])}
    <div data-list></div>`;
  const paint = () => {
    const list = inYear('income', Y()).filter(i => passes(i, st, `${i.payer} ${i.description} ${i.notes} ${i.type} ${customerName(i.customerId)} ${i.amount} ${i.id}`)
      && (!st.type || i.type === st.type) && (!st.status || i.status === st.status));
    $('[data-list]', root).innerHTML = all('income').length === 0 ? empty('No income recorded yet.') : monthGroups(list, i => row({
      id: i.id,
      title: `${esc(customerName(i.customerId) || i.payer || i.type)} ${i.status !== 'received' ? tag('Pending', 'warn') : ''}${i.sourceType === 'installation' ? tag('Installation') : ''}${i.sourceType === 'recurring' ? tag('Recurring') : ''}`,
      sub: `${fmtDate(i.date)} &middot; ${esc(i.type)}${i.payer && customerName(i.customerId) && i.payer !== customerName(i.customerId) ? ` &middot; from ${esc(i.payer)}` : ''}`,
      right: amountOf(i), rightSub: cadNote(i),
    }), rows => money(sum(rows.filter(i => i.status === 'received'), i => cadOf(i) || 0)) + ' CAD received');
  };
  paint();
  wireFilters(root, st, paint);
  wire(root, { add: () => incomeForm(), edit: id => incomeForm(byId('income', id)), 'clear-filters': () => { filters.income = {}; income(root); }, ...expActions });
}

// ---- expenses --------------------------------------------------------------

export function expenses(root) {
  const st = filters.expenses;
  const s = summary(Y());
  const tabs = [['', 'All'], ['vehicle', 'Vehicle'], ['other', 'Other business']];
  root.innerHTML = `
    ${head('Expenses', '<button class="btn" data-act="scan">Scan receipt</button> <button class="btn primary" data-act="add">+ Add expense</button>')}
    ${reviewQueue().length ? `<p class="callout"><a href="#/needs-review">${reviewQueue().length} expense(s) need review</a></p>` : ''}
    <div class="tabs">${tabs.map(([v, l]) => `<button data-act="tab" data-id="${v}" class="${(st.group || '') === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${st.group === 'vehicle' ? `
      <div class="stats strip">
        ${stat('Vehicle expenses', money(s.exp.vehicleTotal))}
        ${stat('Business use', pct(s.km.pct), `${num(s.km.business)} of ${num(s.km.total)} km`)}
        ${stat('Est. business portion', money(s.exp.vehicleEst), 'estimate')}
      </div>
      <p class="callout">This is an estimate. ${esc(VEHICLE_INFO.warn)} CRA rules determine what is actually deductible. <a href="${VEHICLE_INFO.link}" target="_blank" rel="noopener">Verify current CRA rules</a></p>` : `
      <div class="stats strip">
        ${stat('Business expenses', money(s.exp.businessTotal), 'recorded')}
        ${stat('Est. deductible', money(s.exp.est), 'after limits')}
        ${stat('Personal', money(s.exp.personalTotal), 'not counted')}
      </div>`}
    ${filterBar(st, [
      { name: 'category', label: 'All categories', options: st.group === 'vehicle' ? VEHICLE_CATEGORIES : st.group === 'other' ? OTHER_CATEGORIES : [...VEHICLE_CATEGORIES, ...OTHER_CATEGORIES] },
      { name: 'use', label: 'Business, mixed & personal', options: [{ value: 'business', label: 'Business' }, { value: 'mixed', label: 'Mixed / business-use %' }, { value: 'personal', label: 'Personal' }] },
      { name: 'currency', label: 'Any currency', options: ['CAD', 'USD'] },
      { name: 'customer', label: 'All customers', options: customerOptions() },
    ])}
    <div data-list></div>`;
  const paint = () => {
    const useOf = e => (e.use === 'shared' ? 'mixed' : e.use);
    const list = inYear('expense', Y()).filter(e => passes(e, st, `${e.vendor} ${e.category} ${e.purpose} ${e.notes} ${e.amount} ${e.id}`)
      && (!st.group || e.group === st.group) && (!st.category || e.category === st.category) && (!st.use || useOf(e) === st.use));
    $('[data-list]', root).innerHTML = all('expense').length === 0 ? empty('No expenses recorded yet.') : monthGroups(list, e => {
      const p = expenseParts(e, s.km.pct);
      return row({
        id: e.id,
        title: `${esc(e.vendor || e.category)} ${e.use === 'personal' ? tag('Personal') : ''}${e.use === 'mixed' ? tag(`${e.businessPct}% business`) : ''}${e.receiptId ? `<span class="tag link-tag" data-act="receipt" data-id="${e.receiptId}">Receipt</span>` : ''}`,
        sub: `${fmtDate(e.date)} &middot; ${e.group === 'vehicle' ? 'Vehicle: ' : ''}${esc(e.category)}`,
        right: amountOf(e),
        rightSub: p.cad == null ? '<span class="warn-text">no rate recorded</span>' : e.use === 'personal' ? '' : `est. ${money(p.est)}`,
      });
    }, rows => `${money(sum(rows, e => expenseParts(e, s.km.pct).est))} est. deductible`);
  };
  paint();
  wireFilters(root, st, paint);
  wire(root, {
    add: () => expenseForm(st.group ? { group: st.group } : {}),
    edit: id => expenseForm(byId('expense', id)),
    receipt: id => viewReceipt(id),
    scan: scanReceipt,
    tab: id => { filters.expenses = { ...st, group: id, category: '' }; expenses(root); },
    'clear-filters': () => { filters.expenses = { group: st.group }; expenses(root); },
  });
}

// ---- customers -------------------------------------------------------------

export function customers(root) {
  const list = [...all('customer')].sort((a, b) => a.name.localeCompare(b.name));
  root.innerHTML = `
    ${head('Customers', '<button class="btn primary" data-act="add">+ Add customer</button>', `Income shown is received in ${Y()}.`)}
    <input type="search" class="search" placeholder="Search customers" aria-label="Search customers">
    <div data-list></div>`;
  const paint = q => {
    const rows = list.filter(c => !q || `${c.name} ${c.contact} ${c.address} ${c.phone} ${c.email}`.toLowerCase().includes(q.toLowerCase()));
    $('[data-list]', root).innerHTML = !list.length ? empty('No customers yet. They are also created automatically when you type a new name on an income, trip or installation.') : rows.map(c => {
      const t = customerTotals(c.id, Y());
      return row({
        id: c.id, act: 'open', title: esc(c.name),
        sub: [c.contact, c.monthlyCommission ? `${money(c.monthlyCommission, c.monthlyCurrency, 0)}/month` : '', c.address].filter(Boolean).map(esc).join(' &middot; '),
        right: money(t.cad), rightSub: t.usd ? money(t.usd, 'USD') : '',
      });
    }).join('') || empty('No customers match.');
  };
  paint('');
  $('.search', root).addEventListener('input', e => paint(e.target.value));
  wire(root, { add: () => customerForm({}, c => { location.hash = `#/customer/${c.id}`; }), open: id => { location.hash = `#/customer/${id}`; } });
}

export function customer(root, id) {
  const c = byId('customer', id);
  if (!c) { root.innerHTML = `${head('Customer not found')}<p><a href="#/customers">Back to customers</a></p>`; return; }
  const t = customerTotals(id, Y());
  const installs = all('installation').filter(i => i.customerId === id);
  const recur = all('recurring').filter(r => r.customerId === id);
  const info = [['Contact', c.contact], ['Phone', c.phone && `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>`], ['Email', c.email && `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`], ['Address', c.address],
    ['Date signed', fmtDate(c.dateSigned)], ['Installation date', fmtDate(c.installDate)], ['Notes', c.notes]].filter(([, v]) => v);
  root.innerHTML = `
    <p><a href="#/customers">&larr; Customers</a></p>
    ${head(c.name, '<button class="btn" data-act="edit-c">Edit</button>')}
    <div class="stats strip">
      ${stat('Installation', c.installPayment ? money(c.installPayment, c.installCurrency, 0) : '—')}
      ${stat('Monthly commission', c.monthlyCommission ? `${money(c.monthlyCommission, c.monthlyCurrency, 0)}/mo` : '—')}
      ${stat(`Total received ${Y()}`, money(t.cad), `CAD${t.usd ? ` &middot; ${money(t.usd, 'USD')}` : ''}`, 'accent')}
    </div>
    ${info.length ? `<section class="panel"><dl class="dl">${info.map(([k, v]) => `<dt>${k}</dt><dd>${k === 'Notes' || k === 'Contact' || k === 'Address' ? esc(v) : v}</dd>`).join('')}</dl></section>` : ''}
    <section class="panel"><h2>Income ${Y()} <button class="btn small" data-act="add-income">+ Add</button></h2>
      ${t.income.length ? newestFirst(t.income).map(i => row({ id: i.id, act: 'edit-income', title: `${esc(i.type)} ${i.status !== 'received' ? tag('Pending', 'warn') : ''}`, sub: fmtDate(i.date), right: amountOf(i), rightSub: cadNote(i) })).join('') : empty('No income from this customer this year.')}
    </section>
    <section class="panel"><h2>Installations <button class="btn small" data-act="add-install">+ Add</button></h2>
      ${installs.length ? newestFirst(installs).map(i => row({ id: i.id, act: 'edit-install', title: fmtDate(i.date), sub: `${i.km ? `${num(i.km)} km travel` : 'No travel recorded'}`, right: i.amount ? amountOf(i) : '—', rightSub: i.paid ? 'Received' : 'Not received' })).join('') : empty('None recorded.')}
    </section>
    <section class="panel"><h2>Recurring income <button class="btn small" data-act="add-recur">+ Add</button></h2>
      ${recur.length ? recur.map(r => row({ id: r.id, act: 'edit-recur', title: esc(r.type), sub: `From ${monthLabel(r.startMonth)}${r.endMonth ? ` to ${monthLabel(r.endMonth)}` : ''}`, right: `${money(r.amount, r.currency)}/mo` })).join('') : empty('None set up.')}
    </section>
    <p class="muted">Business kilometres for this customer: <strong>${num(t.km)} km</strong> in ${Y()} &middot; ${num(sum(all('trip').filter(x => x.customerId === id && x.type !== 'personal'), x => x.km))} km all years. <a href="#/trips">Mileage</a></p>`;
  wire(root, {
    'edit-c': () => customerForm(c),
    'add-income': () => incomeForm({ customerId: id }), 'edit-income': x => incomeForm(byId('income', x)),
    'add-install': () => installationForm({ customerId: id, address: c.address, amount: c.installPayment, currency: c.installCurrency || 'USD' }), 'edit-install': x => installationForm(byId('installation', x)),
    'add-recur': () => recurringForm({ customerId: id, amount: c.monthlyCommission, currency: c.monthlyCurrency || 'USD' }), 'edit-recur': x => recurringForm(byId('recurring', x)),
  });
}

// ---- installations ---------------------------------------------------------

export function installations(root) {
  const list = newestFirst(inYear('installation', Y()));
  root.innerHTML = `
    ${head('Installations', '<button class="btn primary" data-act="add">+ Add installation</button>', 'Each installation creates its own linked income record and trip. Edit them here to avoid duplicates.')}
    <div class="stats strip">
      ${stat('Installations', String(list.length))}
      ${stat('Received', money(sum(list.filter(i => i.paid), i => cadOf(i) || 0)), 'CAD')}
      ${stat('Travel', `${num(sum(list, i => i.km))} km`)}
    </div>
    ${list.length ? list.map(i => row({
      id: i.id,
      title: `${esc(customerName(i.customerId))} ${i.amount ? (i.paid ? tag('Received', 'ok') : tag('Not received', 'warn')) : ''}`,
      sub: `${fmtDate(i.date)}${i.km ? ` &middot; ${num(i.km)} km` : ''}${i.address ? ` &middot; ${esc(i.address)}` : ''}`,
      right: i.amount ? amountOf(i) : '—', rightSub: i.paid ? cadNote(i) : '',
    })).join('') : empty(`No installations in ${Y()}.`)}`;
  wire(root, { add: () => installationForm(), edit: id => installationForm(byId('installation', id)) });
}

// ---- recurring -------------------------------------------------------------

export function recurring(root) {
  const defs = all('recurring');
  const exp = expectedPayments(Y());
  const later = exp.filter(x => !isDue(x.period));
  root.innerHTML = `
    ${head('Recurring income', '<button class="btn primary" data-act="add">+ Add recurring</button>', 'Expected monthly payments. Nothing here counts as income until you confirm it was received.')}
    ${expectedBlock(Y(), { limit: 100 })}
    <section class="panel"><h2>Schedules</h2>
      ${defs.length ? defs.map(r => row({ id: r.id, title: esc(customerName(r.customerId) || r.payer || 'Recurring'), sub: `${esc(r.type)} &middot; from ${monthLabel(r.startMonth)}${r.endMonth ? ` to ${monthLabel(r.endMonth)}` : ''}`, right: `${money(r.amount, r.currency)}/mo` })).join('') : empty('No recurring income set up.')}
    </section>
    ${later.length ? `<section class="panel"><h2>Expected later in ${Y()}</h2>
      ${[...groupBy(later, x => x.period).entries()].map(([p, xs]) => `<div class="row static"><span class="row-main"><span class="row-title">${monthLabel(p)}</span><span class="row-sub">${xs.length} payment${xs.length === 1 ? '' : 's'} expected</span></span>
        <span class="row-amt"><strong>${['USD', 'CAD'].map(cur => { const v = sum(xs.filter(x => x.currency === cur), x => x.amount); return v ? money(v, cur) : ''; }).filter(Boolean).join(' + ')}</strong></span></div>`).join('')}
    </section>` : ''}`;
  wire(root, { add: () => recurringForm(), edit: id => recurringForm(byId('recurring', id)), ...expActions });
}

// ---- monthly payouts -------------------------------------------------------

export function months(root) {
  const k = kmSummary(Y());
  const rows = MONTHS.map((name, i) => ({ name, i, m: monthSummary(Y(), i + 1, k.pct) }));
  root.innerHTML = `
    ${head('Monthly payouts', '', `Tap a month to see every income and expense in it. Tax year ${Y()}.`)}
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Month</th><th>USD</th><th>Income (CAD)</th><th>Est. expenses</th><th>Est. net</th></tr></thead>
      <tbody>${rows.map(({ name, i, m }) => `<tr data-act="open" data-id="${Y()}-${String(i + 1).padStart(2, '0')}" class="${m.income.length || m.expenses.length ? '' : 'dim'}">
        <td><a href="#/month/${Y()}-${String(i + 1).padStart(2, '0')}">${name}</a></td><td>${m.totalUsd ? money(m.totalUsd, 'USD', 0) : '—'}</td><td>${money(m.totalCad)}</td><td>${money(m.expEst)}</td><td><strong>${money(m.net)}</strong></td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td>${money(sum(rows, r => r.m.totalUsd), 'USD', 0)}</td><td>${money(sum(rows, r => r.m.totalCad))}</td><td>${money(sum(rows, r => r.m.expEst))}</td><td><strong>${money(sum(rows, r => r.m.net))}</strong></td></tr></tfoot>
    </table></div>`;
  wire(root, { open: id => { location.hash = `#/month/${id}`; } });
}

export function month(root, key) {
  const [y, mm] = key.split('-').map(Number);
  const k = kmSummary(y);
  const m = monthSummary(y, mm, k.pct);
  const line = (label, usd, cad) => `<tr><td>${label}</td><td>${money(usd, 'USD')}</td><td>${money(cad)}</td></tr>`;
  const expected = expectedPayments(y).filter(x => x.period === key);
  root.innerHTML = `
    <p><a href="#/months">&larr; Monthly payouts</a></p>
    ${head(monthLabel(key))}
    <div class="table-wrap"><table class="table">
      <thead><tr><th></th><th>USD</th><th>CAD equivalent</th></tr></thead>
      <tbody>
        ${line('Residual commissions', m.residualUsd, m.residualCad)}
        ${line('Installation payments', m.installUsd, m.installCad)}
        ${line('Other', m.otherUsd, m.otherCad)}
      </tbody>
      <tfoot>
        <tr><td>Total income</td><td>${money(m.totalUsd, 'USD')}</td><td>${money(m.totalCad)}</td></tr>
        <tr><td>Estimated deductible expenses</td><td></td><td>${money(m.expEst)}</td></tr>
        <tr><td><strong>Estimated net business income</strong></td><td></td><td><strong>${money(m.net)}</strong></td></tr>
      </tfoot>
    </table></div>
    <p class="muted">CAD column includes income paid in CAD. Business km this month: ${num(sum(m.trips.filter(t => t.type !== 'personal'), t => t.km))} km.</p>
    ${expected.length ? `<p class="callout">${expected.length} expected recurring payment(s) for this month not yet confirmed. <a href="#/recurring">Review</a></p>` : ''}
    <section class="panel"><h2>Income <button class="btn small" data-act="add-income">+ Add</button></h2>
      ${m.income.length ? newestFirst(m.income).map(i => row({ id: i.id, act: 'edit-income', title: `${esc(customerName(i.customerId) || i.payer || i.type)} ${i.status !== 'received' ? tag('Pending', 'warn') : ''}`, sub: `${fmtDate(i.date)} &middot; ${esc(i.type)}`, right: amountOf(i), rightSub: cadNote(i) })).join('') : empty('No income this month.')}
    </section>
    <section class="panel"><h2>Expenses <button class="btn small" data-act="add-expense">+ Add</button></h2>
      ${m.expenses.length ? newestFirst(m.expenses).map(e => { const p = expenseParts(e, k.pct); return row({ id: e.id, act: 'edit-expense', title: esc(e.vendor || e.category), sub: `${fmtDate(e.date)} &middot; ${esc(e.category)}`, right: amountOf(e), rightSub: e.use === 'personal' ? 'personal' : `est. ${money(p.est)}` }); }).join('') : empty('No expenses this month.')}
    </section>`;
  const firstDay = `${key}-01`;
  wire(root, {
    'add-income': () => incomeForm({ date: firstDay }), 'edit-income': id => incomeForm(byId('income', id)),
    'add-expense': () => expenseForm({ date: firstDay }), 'edit-expense': id => expenseForm(byId('expense', id)),
  });
}

// ---- "More" menu (phone) ---------------------------------------------------

export function more(root) {
  const items = [
    ['customers', 'Customers', 'Businesses you work with and what each has paid'],
    ['installations', 'Installations', 'Installs with linked payment and travel'],
    ['recurring', 'Recurring income', 'Expected monthly commissions to confirm'],
    ['months', 'Monthly payouts', 'Month-by-month income and expenses'],
    ['assets', 'Vehicle assets & CCA', 'Vehicle purchases, CCA, cost forecast and "Can I deduct this?"'],
    ['equipment', 'Equipment & technology', 'Computers, electronics, software, subscriptions and their tax treatment'],
    ['tax', 'Tax estimate', 'Estimated amount to set aside'],
    ['review', 'Year-end review', 'Summary and expenses to discuss with your accountant'],
    ['cra', 'CRA / Tax filing', 'Prepare the tax package for certified software or your accountant'],
    ['reference', 'Could I write this off?', 'Potential business expenses and what to keep'],
    ['export', 'Export & backup', 'CSV and PDF for your accountant, backup and restore'],
    ['settings', 'Settings', 'Tax year, province, vehicle, app lock, theme'],
  ];
  root.innerHTML = `${head('More')}<div class="menu">${items.map(([r, t, d]) => `<a class="row" href="#/${r}"><span class="row-main"><span class="row-title">${t}</span><span class="row-sub">${d}</span></span><span class="row-amt">&rsaquo;</span></a>`).join('')}</div>`;
}

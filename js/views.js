// Screens: dashboard and the record lists. Each view renders into `root`.

import { state, all, byId, customerName, expectedPayments, isDue, skipExpected } from './store.js';
import { summary, inYear, cadOf, expenseParts, kmSummary, monthSummary, customerTotals } from './calc.js';
import { scanReceipt, reviewQueue } from './scan.js';
import { incomeForm, expenseForm, customerForm, installationForm, recurringForm, confirmExpected } from './forms.js';
import { confirmDialog, viewReceipt } from './ui.js';
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
      { name: 'receipt', label: 'With or without receipt', options: [{ value: 'missing', label: 'Receipt missing' }, { value: 'has', label: 'Receipt attached' }] },
    ])}
    <div data-list></div>`;
  const paint = () => {
    const useOf = e => (e.use === 'shared' ? 'mixed' : e.use);
    const list = inYear('expense', Y()).filter(e => passes(e, st, `${e.vendor} ${e.category} ${e.purpose} ${e.notes} ${e.amount} ${e.id}`)
      && (!st.group || e.group === st.group) && (!st.category || e.category === st.category) && (!st.use || useOf(e) === st.use)
      && (!st.receipt || (st.receipt === 'has') === !!e.receiptId));
    $('[data-list]', root).innerHTML = all('expense').length === 0 ? empty('No expenses recorded yet.') : monthGroups(list, e => {
      const p = expenseParts(e, s.km.pct);
      return row({
        id: e.id,
        title: `${esc(e.vendor || e.category)} ${e.use === 'personal' ? tag('Personal') : ''}${e.use === 'mixed' ? tag(`${e.businessPct}% business`) : ''}${e.receiptId ? `<span class="tag link-tag" data-act="receipt" data-id="${e.receiptId}">Receipt</span>` : ''}`,
        sub: `${fmtDate(e.date)} &middot; ${e.group === 'vehicle' ? 'Vehicle: ' : ''}${esc(e.category)}`,
        right: amountOf(e),
        rightSub: p.cad == null ? '<span class="warn-text">no rate recorded</span>' : e.use === 'personal' ? '' : `${p.portion !== p.cad ? `business ${money(p.portion)} &middot; ` : ''}deductible est. ${money(p.est)}`,
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

// Every section of the app, grouped. Used by the phone "More" screen and the desktop sidebar.
export const SECTIONS = [
  ['Records', [
    ['income', 'Income', 'Commissions and payments received'],
    ['expenses', 'Expenses', 'Every expense, with receipts'],
    ['trips', 'Mileage', 'Trips, odometers and business-use %'],
    ['cca', 'Assets & CCA', 'Equipment, vehicles and the CCA schedule'],
    ['homeoffice', 'Home office', 'Business-use-of-home calculator'],
    ['phone', 'Phone & internet', 'Business share of monthly services'],
    ['gst', 'GST/HST', 'Registration, collected, input tax credits'],
  ]],
  ['Sales', [
    ['customers', 'Customers', 'Businesses you work with and what each has paid'],
    ['installations', 'Installations', 'Installs with linked payment and travel'],
    ['recurring', 'Recurring income', 'Expected monthly commissions to confirm'],
    ['months', 'Monthly payouts', 'Month-by-month income and expenses'],
  ]],
  ['Tax', [
    ['deduct', 'Can I deduct this?', 'Guided check with sources'],
    ['reminders', 'Reminders', 'Missing records and upcoming dates'],
    ['tax', 'Tax estimate', 'Estimated tax, marginal and average rates'],
    ['review', 'Year-end', 'Checklist and items to discuss'],
    ['cra', 'Tax filing package', 'Organised figures for software or an accountant'],
    ['export', 'Export & backup', 'CSV, Excel, PDF, backup and restore'],
  ]],
  ['Learn', [
    ['learn', 'Knowledge centre', 'Canadian tax concepts in plain language'],
    ['updates', 'Tax rule updates', 'New, changed, proposed and expired rules'],
  ]],
  ['', [['settings', 'Settings', 'Profile, province, vehicles, app lock, theme']]],
];

export function more(root) {
  root.innerHTML = `${head('More')}${SECTIONS.map(([title, items]) => `${title ? `<h2 class="section-title">${title}</h2>` : ''}<div class="menu">${items.map(([r, t, d]) => `<a class="row" href="#/${r}"><span class="row-main"><span class="row-title">${t}</span><span class="row-sub">${d}</span></span><span class="row-amt">&rsaquo;</span></a>`).join('')}</div>`).join('')}`;
}

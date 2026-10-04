// Dashboard: where the year stands and what needs attention. It reports; it
// does not nudge toward spending or "optimising". Also the quick-add sheet and
// the business profile form.

import { state, all, byId, saveSettings, saveQuiet, isDue } from './store.js';
import { summary, inYear, cadOf, expenseParts } from './calc.js';
import { counts } from './reminders.js';
import { reviewQueue, scanReceipt } from './scan.js';
import { tripForm, startTripForm, stopTripForm, activeTrip } from './mileage.js';
import { equipForm } from './equipment.js';
import { incomeForm, expenseForm, installationForm } from './forms.js';
import { modal, openForm, toast } from './ui.js';
import { monthBars, rankBars, splitBar } from './charts.js';
import { $, esc, money, num, pct, fmtDate, sum } from './util.js';

const icon = d => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICONS = {
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  camera: icon('<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  car: icon('<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>'),
  income: icon('<path d="M12 3v18"/><path d="M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 3 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.300-4.5-3"/>'),
  help: icon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.500a2.500 2.500 0 1 1 3.500 2.300c-.700.300-1 .900-1 1.700"/><path d="M12 17h.01"/>'),
  box: icon('<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>'),
};

// The business profile. One profile today; records are not tagged per business
// yet, so a second business would need its own copy of the app's data.
export function profileForm() {
  const b = state.settings.business;
  openForm({
    title: 'Business profile',
    intro: 'Used on exports and to describe the business these records belong to. Record only what this business actually earns and spends.',
    values: { ...b, name: b.name || 'ActivityPay sales', activity: b.activity || 'Commission-based sales and installation of payment systems', province: state.settings.province },
    fields: [
      { name: 'name', label: 'Business / trade name', type: 'text', required: true },
      { name: 'owner', label: 'Your name', type: 'text' },
      { name: 'structure', label: 'Structure', type: 'select', options: ['Sole proprietor', 'Partnership', 'Corporation'], hint: 'The estimates in this app are built for a sole proprietor.' },
      { name: 'activity', label: 'What the business does', type: 'text' },
      { name: 'number', label: 'Business number (optional)', type: 'text' },
      { name: 'address', label: 'Address', type: 'text' },
    ],
    async onSave(v) {
      const { province, ...rest } = v;
      state.settings.business = { ...b, ...rest };
      await saveSettings();
      toast('Profile saved.');
    },
  });
}

// Everything that can be added, in one sheet. Opened by the + in the bottom bar.
export function quickAdd() {
  const items = [
    ['expense', ICONS.plus, 'Expense', 'Enter an amount, vendor and category', () => expenseForm()],
    ['scan', ICONS.camera, 'Scan a receipt', 'Photo or file; you review what it read', scanReceipt],
    ['trip', ICONS.car, 'Business trip', 'Date, destination, purpose, kilometres', () => tripForm()],
    [activeTrip() ? 'stop' : 'start', ICONS.car, activeTrip() ? 'Stop the trip in progress' : 'Start a trip now', activeTrip() ? 'Finish and save the distance' : 'Time it as you drive', activeTrip() ? stopTripForm : startTripForm],
    ['income', ICONS.income, 'Income', 'A commission or payment received', () => incomeForm()],
    ['asset', ICONS.box, 'Equipment or asset', 'Computer, tools, furniture', () => equipForm()],
    ['install', ICONS.plus, 'Installation', 'Creates its payment and trip', () => installationForm()],
    ['deduct', ICONS.help, 'Can I deduct this?', 'Check before you record it', () => { location.hash = '#/deduct'; }],
  ];
  const m = modal(`<div class="sheet-head"><h2>Add</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body"><div class="add-list">${items.map(([k, ic, t, d]) => `<button class="add-item" data-do="${k}">${ic}<span><strong>${t}</strong><small>${d}</small></span></button>`).join('')}</div></div>`);
  m.el.classList.add('small');
  m.el.addEventListener('click', e => { const b = e.target.closest('[data-do]'); if (!b) return; m.close(); items.find(i => i[0] === b.dataset.do)[4](); });
}

export function home(root) {
  const Y = state.settings.year;
  const s = summary(Y);
  const t = s.tax;
  const b = state.settings.business;
  const exps = inYear('expense', Y);
  const biz = exps.filter(e => e.use !== 'personal');
  const missing = biz.filter(e => !e.receiptId).length;
  const uncategorized = biz.filter(e => e.group !== 'vehicle' && e.category === 'Other').length;
  const queue = reviewQueue().filter(x => x.e.date.slice(0, 4) === String(Y));
  const queued = new Set(queue.map(x => x.e.id));
  const rem = counts(Y);
  const recent = [...exps].sort((a, c) => c.date.localeCompare(a.date) || (c.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5);
  const hasData = s.income.count || exps.length || s.km.loggedBiz;
  const kpi = (label, value, sub, href) => `<a class="kpi" href="${href}"><span class="kpi-label">${label}</span><span class="kpi-value">${value}</span><span class="kpi-sub">${sub}</span></a>`;
  const attn = (n, label, href, tone = '') => `<a class="attn ${n ? tone : 'zero'}" href="${href}"><span class="attn-n">${n}</span><span class="attn-label">${label}</span><span class="chev">&rsaquo;</span></a>`;
  const line = (l, v) => `<div class="line"><span>${l}</span><span>${v}</span></div>`;
  const dueIncome = s.expected.filter(x => isDue(x.period)).length;

  root.innerHTML = `
    <header class="dash-head">
      <div><p class="eyebrow">Tax year ${Y}</p><h1>${esc(b.name || 'Your business')}</h1></div>
      ${b.name ? '' : '<button class="btn small" data-act="profile">Set up business profile</button>'}
    </header>

    <div class="kpis">
      ${kpi('Business income', money(s.income.cad), `${s.income.count} payment${s.income.count === 1 ? '' : 's'} received`, '#/income')}
      ${kpi('Business expenses', money(s.totals.business), 'business portion recorded', '#/expenses')}
      ${kpi('Potentially deductible', money(s.totals.deductible), 'after limits, incl. CCA', '#/review')}
      ${kpi('Estimated net business income', money(s.net), 'estimate, not a tax return', '#/tax')}
    </div>

    <div class="quick-row">
      <button class="qa primary" data-act="add-expense">${ICONS.plus}<span>Expense</span></button>
      <button class="qa" data-act="scan">${ICONS.camera}<span>Receipt</span></button>
      <button class="qa" data-act="add-trip">${ICONS.car}<span>Trip</span></button>
      <button class="qa" data-act="add-income">${ICONS.income}<span>Income</span></button>
    </div>
    <a class="ask" href="#/deduct">${ICONS.help}<span><strong>Can I deduct this?</strong><small>Check an expense before you record it</small></span><span class="chev">&rsaquo;</span></a>

    <section class="block">
      <h2>Records</h2>
      <div class="attn-list">
        ${attn(missing, 'Receipts missing', '#/expenses', 'warn')}
        ${attn(uncategorized, 'Uncategorized expenses', '#/expenses', 'warn')}
        ${attn(rem.tasks, 'Upcoming tax tasks', '#/reminders')}
        ${attn(rem.issues, 'Potential issues', '#/reminders', 'warn')}
        ${queue.length ? attn(queue.length, 'Expenses to review', '#/needs-review', 'warn') : ''}
        ${dueIncome ? attn(dueIncome, 'Expected payments to confirm', '#/recurring', 'warn') : ''}
        <a class="attn" href="#/trips"><span class="attn-n">${s.km.total > 0 ? pct(s.km.pct, 0) : '—'}</span><span class="attn-label">Vehicle business use${s.km.total > 0 ? ` <small>${num(s.km.business)} of ${num(s.km.total)} km${s.km.totalIsWeak ? ', logged trips only' : ''}</small>` : ' <small>no kilometres logged</small>'}</span><span class="chev">&rsaquo;</span></a>
      </div>
    </section>

    <section class="block">
      <div class="block-head"><h2>Recent expenses</h2>${recent.length ? '<a href="#/expenses">View all</a>' : ''}</div>
      ${recent.length ? `<div class="list">${recent.map(e => {
        const p = expenseParts(e, s.km.pct);
        return `<button class="row" data-act="edit-expense" data-id="${e.id}">
          <span class="row-main"><span class="row-title">${esc(e.vendor || e.category)}</span><span class="row-sub">${fmtDate(e.date)} &middot; ${esc(e.category)}${queued.has(e.id) ? ' &middot; <em class="warn-text">review</em>' : ''}${e.receiptId ? '' : e.use === 'personal' ? '' : ' &middot; no receipt'}</span></span>
          <span class="row-amt"><strong>${money(e.amount, e.currency)}</strong><small>${e.use === 'personal' ? 'personal' : p.cad == null ? 'no rate' : `${money(p.est)} deductible est.`}</small></span></button>`;
      }).join('')}</div>` : `<p class="empty">No expenses in ${Y} yet. Add one, or scan a receipt.</p>`}
    </section>

    <details class="d-details"${state.settings.dashDetails ? ' open' : ''}>
      <summary>Breakdown and charts</summary>
      <div class="dash-grid">
        <section class="panel"><h2>${Y} at a glance</h2>
          ${line('Total paid (all recorded expenses)', money(s.totals.paid))}
          ${line('Business portion', money(s.totals.business))}
          ${line('Vehicle expenses, business share', money(s.exp.vehicleEst))}
          ${line('Other expenses, after limits', money(s.exp.otherEst))}
          ${line('CCA and equipment', money(s.cca.counted + s.equip.counted))}
          ${s.home.counted ? line('Business-use-of-home', money(s.home.counted)) : ''}
          ${line('Potentially deductible', money(s.totals.deductible))}
          ${line('Personal (never counted)', money(s.exp.personalTotal))}
        </section>
        <section class="panel"><h2>Income and tax estimate <a class="link" href="#/tax">Details</a></h2>
          ${line('Income received (CAD)', money(s.income.cad))}
          ${s.income.usd ? line('Of which paid in USD', money(s.income.usd, 'USD')) : ''}
          ${line('Estimated net business income', money(s.net))}
          ${line('Estimated income tax', money(t.incomeTax))}
          ${line('Estimated CPP (both halves)', money(t.cpp))}
          ${line('Estimated amount to set aside', money(t.setAside))}
          ${line('Marginal / average rate', `${pct(t.marginal)} / ${pct(t.average)}`)}
        </section>
      </div>
      ${hasData ? `<div class="chart-grid">
        <section class="panel"><h2>Income by month</h2>${monthBars(s.income.byMonth, { label: 'income' })}</section>
        <section class="panel"><h2>Deductible expenses by month (est.)</h2>${monthBars(s.exp.byMonth, { color: 'var(--accent-2)', label: 'expenses' })}</section>
        <section class="panel"><h2>Income by customer</h2>${rankBars(Object.entries(s.income.byCustomer).map(([label, value]) => ({ label, value })))}</section>
        <section class="panel"><h2>Expenses by category</h2>${rankBars([...Object.entries(s.exp.byCategory).map(([label, v]) => ({ label, value: v.total })), ...Object.entries(s.exp.vehicleByCategory).map(([label, value]) => ({ label: `Vehicle: ${label}`, value }))], { color: 'var(--accent-2)' })}</section>
        <section class="panel"><h2>Business vs personal kilometres</h2>${splitBar({ label: 'Business', value: s.km.business }, { label: 'Personal', value: s.km.personal }, v => `${num(v)} km`)}</section>
        <section class="panel"><h2>USD vs CAD income <small>(CAD value)</small></h2>${splitBar({ label: 'Paid in USD', value: s.income.usdConverted }, { label: 'Paid in CAD', value: s.income.cadNative }, v => money(v, 'CAD', 0))}</section>
      </div>` : ''}
    </details>

    <p class="foot muted">A deductible expense lowers taxable income; it is not money back. Figures are estimates from your records, not CRA calculations. Records are stored only on this device &middot; <a href="#/export">back up</a>.</p>`;

  const details = $('.d-details', root);
  details.addEventListener('toggle', () => { state.settings.dashDetails = details.open; saveQuiet(); });
  root.onclick = e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'add-expense') expenseForm();
    if (act === 'scan') scanReceipt();
    if (act === 'add-trip') tripForm();
    if (act === 'add-income') incomeForm();
    if (act === 'profile') profileForm();
    if (act === 'edit-expense') expenseForm(byId('expense', el.dataset.id));
  };
}

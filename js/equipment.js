// Equipment & Technology screens: inventory, add/edit, item page with the
// write-off and purchase assessments, subscriptions, and the year-end report.

import { state, all, byId, save, remove, fxFields } from './store.js';
import { summary, taxEstimate, inYear, cadOf, expenseParts } from './calc.js';
import { EQUIP_RULES, EQUIP_CATEGORIES, CUSTOM, CLASS_UNSURE, NOT_FREE, EARNS, USES, SUB_CATEGORIES, usePct, earnsList, equipCost, treat, equipSchedule, equipFlags, equipSummary, expectedSubs, writeOff, goodPurchase } from './equip.js';
import { expenseForm, fxDefs, requireFx } from './forms.js';
import { openForm, confirmDialog, toast, modal, finalizeReceipt, viewReceipt } from './ui.js';
import { exportCsv } from './export.js';
import { head, stat } from './views.js';
import { esc, money, num, fmtDate, today, yearOf, monthLabel, sum } from './util.js';

const Y = () => state.settings.year;
const LEVEL_CLASS = { 'Clearly documented rule': 'ok', 'Likely treatment': '', 'Potentially deductible': '', 'Requires verification': 'warn' };
const sources = () => Object.entries(EQUIP_RULES.sources).map(([l, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(l)}</a>`).join(' &middot; ');
const checked = () => `<p class="muted">Rules checked: ${fmtDate(EQUIP_RULES.checked)}. Official sources: ${sources()}</p>`;
const line = (l, v, cls = '') => `<div class="line ${cls}"><span>${l}</span><span>${v}</span></div>`;
const isDue = period => period <= today().slice(0, 7);
const cur = e => (e.currency === 'USD' ? 'USD' : 'CAD');
const list = items => `<ul class="plain">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;

// ---- add / edit equipment --------------------------------------------------

export function equipForm(rec = {}) {
  const usd = v => v.currency === 'USD';
  const known = !rec.category || EQUIP_CATEGORIES.includes(rec.category);
  const partial = v => v.use === 'mostly' || v.use === 'mixed';
  openForm({
    title: rec.id ? 'Edit equipment' : 'Add equipment',
    intro: 'Equipment is recorded here once, with its own ID and receipt. Do not also enter it under Expenses.',
    values: {
      date: today(), currency: 'CAD', fxMethod: 'rate', condition: 'new', use: '100', treatment: 'auto', clsOverride: 'auto', firstYearRule: 'half',
      ...rec, category: known ? rec.category || EQUIP_CATEGORIES[0] : CUSTOM, customCategory: known ? '' : rec.category,
    },
    openAdvanced: !!rec.id,
    fields: [
      { name: 'name', label: 'Item name', type: 'text', required: true, focus: true, placeholder: 'e.g. MacBook Pro' },
      { name: 'category', label: 'Category', type: 'select', options: [...EQUIP_CATEGORIES, CUSTOM] },
      { name: 'customCategory', label: 'Your category', type: 'text', showIf: v => v.category === CUSTOM },
      { name: 'price', label: 'Purchase price (before tax)', type: 'number', required: true, half: true },
      { name: 'salesTax', label: 'Sales tax paid', type: 'number', half: true },
      { name: 'currency', label: 'Currency', type: 'seg', options: [{ value: 'CAD', label: 'CAD' }, { value: 'USD', label: 'USD' }] },
      ...fxDefs(usd),
      { name: 'date', label: 'Purchase date', type: 'date', required: true, half: true },
      { name: 'condition', label: 'New or used', type: 'seg', half: true, options: [{ value: 'new', label: 'New' }, { value: 'used', label: 'Used' }] },
      { name: 'vendor', label: 'Vendor', type: 'text', half: true },
      { name: 'brand', label: 'Brand / model', type: 'text', half: true },
      { name: 'use', label: 'How is this item used?', type: 'seg', options: USES, hint: 'Buying it through the business does not make it 100% business. Be honest about personal use.' },
      { name: 'businessPct', label: 'Business-use %', type: 'number', placeholder: 'e.g. 80', showIf: partial },
      {
        name: 'portion', type: 'info', render: v => {
          const total = (v.price || 0) + (v.salesTax || 0);
          if (!total) return '';
          const p = v.use === '100' ? 100 : v.use === 'personal' ? 0 : Math.min(100, Math.max(0, v.businessPct || 0));
          const c = v.currency;
          if (v.use === 'personal') return `Purchase: <strong>${money(total, c)}</strong>. Personal items are kept for your records only and never counted as business expenses.`;
          return `Purchase: <strong>${money(total, c)}</strong> &middot; business use ${p}% &middot; potential business-use amount <strong>${money(total * p / 100, c)}</strong>${p < 100 ? ` &middot; personal portion ${money(total * (100 - p) / 100, c)} (never a business expense)` : ''}`;
        },
      },
      { name: 'earnsHead', type: 'info', showIf: v => v.use !== 'personal', render: () => '<strong>How does this equipment help you earn business income?</strong>' },
      ...EARNS.map(([name, label]) => ({ name, type: 'check', label, checkLabel: label, half: true, showIf: v => v.use !== 'personal' })),
      { name: 'earnsText', label: 'In your own words', type: 'text', showIf: v => v.use !== 'personal', placeholder: 'e.g. Runs the CRM and commission reports' },
      { name: 'receipt', label: 'Receipt', type: 'receipt' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
      { name: 'advHead', type: 'info', advanced: true, render: () => '<strong>Purchase assessment</strong> - optional, used by "Is this a good business purchase?"' },
      { name: 'usefulLife', label: 'Years you expect to use it', type: 'number', advanced: true, half: true },
      { name: 'cheaper', label: 'Could a cheaper option do the job?', type: 'select', advanced: true, half: true, options: [{ value: '', label: 'Not answered' }, { value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }, { value: 'unsure', label: 'Not sure' }] },
      { name: 'benefit', label: 'Expected benefit to the business', type: 'text', advanced: true, placeholder: 'e.g. Demo the system on site; faster quotes' },
      { name: 'taxHead', type: 'info', advanced: true, render: () => '<strong>Tax treatment</strong> - leave on Automatic unless your accountant tells you otherwise.' },
      { name: 'treatment', label: 'Treat as', type: 'select', advanced: true, half: true, options: [{ value: 'auto', label: 'Automatic (likely treatment)' }, { value: 'current', label: 'Current expense' }, { value: 'capital', label: 'Capital asset (CCA)' }] },
      { name: 'clsOverride', label: 'CCA class', type: 'select', advanced: true, half: true, options: [{ value: 'auto', label: 'Automatic' }, ...Object.entries(EQUIP_RULES.classes).map(([k, c]) => ({ value: k, label: c.label.split(' - ')[0] }))] },
      { name: 'firstYearRule', label: 'First-year CCA rule', type: 'seg', advanced: true, options: [{ value: 'half', label: 'Half-year rule' }, { value: 'full', label: 'Full first year' }] },
      { name: 'availableDate', label: 'Available-for-use date (if later than purchase)', type: 'date', advanced: true, hint: 'CCA starts when the item is delivered and able to be used.' },
      { name: 'disposedYear', label: 'Year sold or scrapped (if any)', type: 'number', advanced: true, half: true },
      { name: 'salePrice', label: 'Sale price (0 if scrapped)', type: 'number', advanced: true, half: true },
    ],
    onChange(v) { v.amount = (v.price || 0) + (v.salesTax || 0); }, // the exchange-rate line converts price + tax
    async onSave(v, orig) {
      if (!(v.price > 0)) throw new Error('Enter the purchase price.');
      if (v.category === CUSTOM && !v.customCategory) throw new Error('Enter your category name.');
      if (partial(v) && !(v.businessPct > 0 && v.businessPct < 100)) throw new Error('Enter the business-use % (between 1 and 99), or choose 100% business.');
      const amount = v.price + (v.salesTax || 0);
      if (v.use !== 'personal') requireFx({ ...v, amount }, 'you paid, including tax');
      await finalizeReceipt(v, orig.receiptId);
      const { customCategory, portion, earnsHead, advHead, taxHead, fxLine, receipt, ...clean } = v;
      const saved = await save('equip', {
        ...clean, ...fxFields({ ...v, amount }), amount,
        category: v.category === CUSTOM ? v.customCategory : v.category,
        businessPct: partial(v) ? v.businessPct : null,
      });
      toast(yearOf(v.date) !== Y() ? `Saved under tax year ${yearOf(v.date)} (you are viewing ${Y()}).` : 'Saved.');
      location.hash = `#/equip/${saved.id}`;
    },
    onDelete: rec.id ? async () => {
      if (!(await confirmDialog('Delete this equipment record?', { detail: 'Its receipt and CCA schedule are deleted too. This cannot be undone.' }))) return false;
      await remove('equip', rec.id);
      toast('Deleted.');
      location.hash = '#/equipment';
      return true;
    } : null,
  });
}

function yearForm(e, row) {
  openForm({
    title: `${row.year} - ${e.name}`,
    intro: `Maximum CCA for ${row.year} is ${money(row.max)}. CCA is optional: claim any amount up to the maximum. Update the business-use % if how you use the item changed that year.`,
    values: { claim: row.custom ? row.cca : null, pct: e.pctByYear && e.pctByYear[row.year] != null ? e.pctByYear[row.year] : null },
    fields: [
      { name: 'claim', label: 'CCA to claim this year', type: 'number', hint: 'Leave blank to use the maximum.' },
      { name: 'pct', label: `Business-use % in ${row.year}`, type: 'number', hint: `Leave blank to use ${usePct(e)}%.` },
    ],
    async onSave(v) {
      if (v.claim != null && (v.claim < 0 || v.claim > row.max)) throw new Error(`Enter an amount between 0 and ${money(row.max)}.`);
      if (v.pct != null && (v.pct < 0 || v.pct > 100)) throw new Error('Business-use % must be between 0 and 100.');
      const claims = { ...(e.claims || {}) }, pctByYear = { ...(e.pctByYear || {}) };
      if (v.claim == null) delete claims[row.year]; else claims[row.year] = v.claim;
      if (v.pct == null) delete pctByYear[row.year]; else pctByYear[row.year] = v.pct;
      await save('equip', { ...e, claims, pctByYear });
      toast('Saved.');
    },
  });
}

// ---- subscriptions ---------------------------------------------------------

export function subForm(rec = {}) {
  openForm({
    title: rec.id ? 'Edit subscription' : 'Add software / subscription',
    intro: 'Creates expected payments. Nothing is counted as an expense until you confirm the payment actually happened.',
    values: { category: SUB_CATEGORIES[0], currency: 'CAD', frequency: 'monthly', startMonth: today().slice(0, 7), use: 'business', ...rec },
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, focus: true, placeholder: 'e.g. HubSpot' },
      { name: 'category', label: 'Type', type: 'select', options: SUB_CATEGORIES },
      { name: 'amount', label: 'Amount per payment', type: 'number', required: true, half: true },
      { name: 'currency', label: 'Currency', type: 'seg', half: true, options: [{ value: 'CAD', label: 'CAD' }, { value: 'USD', label: 'USD' }] },
      { name: 'frequency', label: 'Billing', type: 'seg', options: [{ value: 'monthly', label: 'Monthly' }, { value: 'annual', label: 'Annual' }, { value: 'once', label: 'One-time' }] },
      { name: 'startMonth', label: 'First payment month', type: 'month', required: true, half: true },
      { name: 'endMonth', label: 'Last month (optional)', type: 'month', half: true, showIf: v => v.frequency !== 'once' },
      { name: 'use', label: 'Business or personal?', type: 'seg', options: [{ value: 'business', label: 'Business' }, { value: 'mixed', label: 'Mixed' }, { value: 'personal', label: 'Personal' }] },
      { name: 'businessPct', label: 'Business-use %', type: 'number', showIf: v => v.use === 'mixed' },
      { name: 'purpose', label: 'What it is used for', type: 'text' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    async onSave(v) {
      if (!(v.amount > 0)) throw new Error('Enter the amount.');
      if (!/^\d{4}-\d{2}$/.test(v.startMonth || '')) throw new Error('First payment month must look like 2026-10.');
      if (v.endMonth && v.endMonth < v.startMonth) throw new Error('Last month is before the first month.');
      if (v.use === 'mixed' && !(v.businessPct > 0 && v.businessPct <= 100)) throw new Error('Enter a business-use % between 1 and 100.');
      await save('sub', v);
      toast('Saved.');
    },
    onDelete: rec.id ? async () => {
      if (!(await confirmDialog('Delete this subscription?', { detail: 'Payments you already confirmed stay in Expenses.' }))) return false;
      await remove('sub', rec.id);
      toast('Deleted.');
      return true;
    } : null,
  });
}

// Opens the normal expense form pre-filled; saving it is the confirmation.
function confirmSub(x) {
  const s = x.sub;
  expenseForm({
    group: 'other', category: 'Software & subscriptions', vendor: s.name, amount: s.amount, currency: s.currency,
    use: s.use, businessPct: s.use === 'mixed' ? s.businessPct : null, purpose: s.purpose || `${s.category} - ${monthLabel(x.period)}`,
    sourceType: 'subscription', sourceId: s.id, period: x.period,
  });
}

// ---- assessments -----------------------------------------------------------

function writeOffModal(e) {
  const r = writeOff(e, Y());
  const a = r.amounts;
  const s = summary(Y());
  // Tax effect of this year's deduction for the item, on the current-year estimate.
  const thisYear = equipSchedule(e, Y()).rows.find(x => x.year === Y());
  const ded = thisYear ? thisYear.deductible : 0;
  const reduction = ded > 0 ? Math.max(0, taxEstimate(Y(), s.net + ded).total - s.tax.total) : 0;
  const c = 'CAD';
  modal(`
    <div class="sheet-head"><h2>Can I write this off? ${esc(e.name)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body">
      <div class="answer ${r.outcome}"><span class="stat-label">Preliminary answer</span><strong class="answer-title">${r.answer}</strong><span class="muted">${esc(r.t.label)}</span></div>
      <h3>Why?</h3><p>${esc(r.why)}</p>
      <h3>Potential tax treatment</h3>
      <ul class="plain">${r.treatment.map(t => `<li><span class="tag ${LEVEL_CLASS[t.level] || ''}">${esc(t.level)}</span> ${esc(t.text)}</li>`).join('')}</ul>
      <h3>Estimated amount</h3>
      ${line('Purchase price (incl. sales tax)', a.cost == null ? 'no exchange rate' : money(a.cost, c))}
      ${line('&times; business-use percentage', `${a.pct}%`)}
      ${line('Business-use cost', a.bizCost == null ? '—' : money(a.bizCost, c), 'total')}
      ${a.personal ? line('Personal portion (not a business expense)', money(a.personal, c)) : ''}
      ${line(`Potential deduction in ${a.firstYearNo || 'year one'}`, a.firstYear == null ? 'not determined' : money(a.firstYear, c))}
      ${line('Remaining amount for later years', a.remaining == null ? 'not determined' : money(a.remaining * a.pct / 100, c))}
      ${ded > 0 ? line(`Estimated tax reduction in ${Y()} (estimate)`, reduction > 0 ? money(reduction, c) : 'none at current income') : ''}
      <p class="muted">${esc(r.explain)} ${NOT_FREE}</p>
      <h3>Documentation</h3>${list(r.keep)}
      ${checked()}
      <p class="disclaimer">A preliminary assessment from the information you entered, not tax advice or a CRA ruling.</p>
    </div>
    <div class="sheet-foot"><span class="grow"></span><button class="btn primary" data-close>Done</button></div>`, { wide: true });
}

function goodPurchaseModal(e) {
  const g = goodPurchase(e);
  modal(`
    <div class="sheet-head"><h2>Is this a good business purchase?</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body">
      <p class="muted">This looks at whether the purchase makes sense for your work. It is separate from the tax question.</p>
      <div class="answer"><span class="stat-label">${esc(e.name)} &middot; ${g.cost == null ? 'cost not converted' : money(g.cost)}</span><strong>${esc(g.verdict)}</strong></div>
      ${list(g.points)}
      <p><strong>${NOT_FREE}</strong> A deduction returns only a fraction of the cost, so it should never be the reason to buy.</p>
    </div>
    <div class="sheet-foot"><button class="btn" data-edit>Add details</button><span class="grow"></span><button class="btn primary" data-close>Done</button></div>`, { wide: true })
    .el.querySelector('[data-edit]').addEventListener('click', ev => { ev.target.closest('.modal').remove(); document.body.classList.remove('has-modal'); equipForm(e); });
}

// ---- inventory -------------------------------------------------------------

const treatTag = t => `<span class="tag ${t.kind === 'personal' ? '' : t.level === 'Requires verification' ? 'warn' : ''}">${t.kind === 'current' ? 'Current expense' : t.kind === 'personal' ? 'Personal' : t.cls ? `CCA Class ${t.cls}` : 'Class to verify'}</span>`;

export function equipment(root) {
  const s = equipSummary(Y());
  const items = [...s.rows].sort((a, b) => (b.e.date || '').localeCompare(a.e.date || ''));
  const due = expectedSubs(Y()).filter(x => isDue(x.period));
  const subs = all('sub');
  const subSpend = sum(inYear('expense', Y()).filter(x => x.category === 'Software & subscriptions' && x.use !== 'personal'), x => expenseParts(x, 0).portion);
  root.innerHTML = `
    ${head('Equipment & technology', '', 'Computers, electronics, software and other equipment, with their likely tax treatment. Each item is recorded once here, not under Expenses.')}
    <button class="quick-btn wide" data-act="add">+ ADD EQUIPMENT</button>
    <div class="stats strip">
      ${stat(`Purchased ${Y()}`, money(s.purchasedTotal, 'CAD', 0))}
      ${stat(`Est. deduction ${Y()}`, money(s.current + s.cca), 'current + CCA')}
      ${stat('To review', String(s.rows.filter(r => r.flags.length).length), '<a href="#/techreport">report</a>')}
    </div>
    ${due.length ? `<section class="panel notice"><h2>Subscription payments to confirm</h2>
      <p class="muted">Expected from your subscriptions. Not counted as expenses until you confirm the payment happened.</p>
      ${due.slice(0, 8).map(x => `<div class="row static"><span class="row-main"><span class="row-title">${esc(x.sub.name)}</span><span class="row-sub">${monthLabel(x.period)} &middot; ${esc(x.sub.category)}</span></span>
        <span class="row-amt"><strong>${money(x.sub.amount, x.sub.currency)}</strong><span class="row-btns"><button class="btn small primary" data-act="sub-confirm" data-id="${x.sub.id}|${x.period}">Confirm paid</button><button class="btn small" data-act="sub-skip" data-id="${x.sub.id}|${x.period}">Not paid</button></span></span></div>`).join('')}
      ${due.length > 8 ? `<p class="muted">${due.length - 8} more.</p>` : ''}</section>` : ''}
    <section class="panel"><h2>My equipment</h2>
      ${items.length ? items.map(({ e, t, row }) => {
        const all = equipSchedule(e, Y()).rows; const last = all[all.length - 1];
        return `<button class="row" data-act="open" data-id="${e.id}">
          <span class="row-main"><span class="row-title">${esc(e.name)} ${treatTag(t)}</span>
            <span class="row-sub">${fmtDate(e.date)} &middot; ${esc(e.category)} &middot; ${t.pct}% business &middot; ${e.receiptId ? 'receipt attached' : '<span class="warn-text">no receipt</span>'}</span></span>
          <span class="row-amt"><strong>${t.cost == null ? money(e.amount, 'USD') : money(t.cost)}</strong><small>${t.kind === 'capital' && t.cls ? `UCC ${money(last ? last.close : t.cost)}` : row ? `est. ${money(row.deductible)}` : ''}</small></span>
        </button>`;
      }).join('') : '<p class="empty">No equipment recorded yet.</p>'}
    </section>
    <section class="panel"><h2>Software &amp; subscriptions <button class="btn small" data-act="sub-add">+ Add</button></h2>
      <p class="muted">Recurring technology costs such as CRM, AI tools, cloud storage, hosting and email. Confirmed payments in ${Y()}: ${money(subSpend)} (business share), listed under <a href="#/expenses">Expenses</a>.</p>
      ${subs.length ? subs.map(x => `<button class="row" data-act="sub-edit" data-id="${x.id}"><span class="row-main"><span class="row-title">${esc(x.name)}${x.use === 'mixed' ? ` <span class="tag">${x.businessPct}% business</span>` : x.use === 'personal' ? ' <span class="tag">Personal</span>' : ''}</span><span class="row-sub">${esc(x.category)} &middot; from ${monthLabel(x.startMonth)}${x.endMonth ? ` to ${monthLabel(x.endMonth)}` : ''}</span></span>
        <span class="row-amt"><strong>${money(x.amount, x.currency)}</strong><small>${{ monthly: 'per month', annual: 'per year', once: 'one-time' }[x.frequency]}</small></span></button>`).join('') : '<p class="empty">None set up.</p>'}
    </section>
    <div class="btn-list"><a class="btn" href="#/techreport">Equipment &amp; Technology Tax Report</a><button class="btn" data-act="csv">Equipment CSV</button></div>
    ${checked()}`;
  root.onclick = async ev => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === 'add') equipForm();
    if (act === 'open') location.hash = `#/equip/${id}`;
    if (act === 'sub-add') subForm();
    if (act === 'sub-edit') subForm(byId('sub', id));
    if (act === 'csv') exportCsv('equipment', Y());
    if (act === 'sub-confirm' || act === 'sub-skip') {
      const [sid, period] = id.split('|');
      const x = expectedSubs(Number(period.slice(0, 4))).find(z => z.sub.id === sid && z.period === period);
      if (!x) return;
      if (act === 'sub-confirm') confirmSub(x);
      else if (await confirmDialog(`Mark ${x.sub.name} for ${monthLabel(period)} as not paid?`, { ok: 'Mark not paid' })) await save('sub', { ...x.sub, skipped: [...(x.sub.skipped || []), period] });
    }
  };
}

// ---- item page -------------------------------------------------------------

export function equipItem(root, id) {
  const e = byId('equip', id);
  if (!e) { root.innerHTML = `${head('Item not found')}<p><a href="#/equipment">Back to equipment</a></p>`; return; }
  const through = Math.max(Y(), yearOf(e.date) || Y());
  const { t, rows } = equipSchedule(e, through);
  const cost = t.cost;
  const now = rows.find(r => r.year === Y());
  const cumulative = rows.filter(r => r.year <= Y() && !r.current).reduce((n, r) => n + r.cca, 0);
  const flags = equipFlags(e);
  const earns = earnsList(e);
  const capital = t.kind === 'capital' && t.cls;
  root.innerHTML = `
    <p><a href="#/equipment">&larr; Equipment</a></p>
    ${head(e.name, '<button class="btn" data-act="edit">Edit</button>', `${esc(e.category)}${e.brand ? ` &middot; ${esc(e.brand)}` : ''} &middot; bought ${fmtDate(e.date)}${e.vendor ? ` from ${esc(e.vendor)}` : ''} &middot; ${e.condition === 'used' ? 'used' : 'new'}`)}
    <div class="quick">
      <button class="quick-btn" data-act="writeoff">CAN I WRITE THIS OFF?</button>
      <button class="quick-btn alt" data-act="good">IS THIS A GOOD BUSINESS PURCHASE?</button>
    </div>
    <section class="panel">
      <h2>Deductibility summary</h2>
      ${line('Purchase', `${money(e.amount, cur(e))}${cur(e) === 'USD' ? (cost == null ? ' <span class="warn-text">no rate recorded</span>' : ` = ${money(cost)} CAD`) : ' CAD'}`)}
      ${line('Business use', `${t.pct}%`)}
      ${line('Business-use cost', cost == null ? '—' : money(cost * t.pct / 100), 'total')}
      ${t.pct > 0 && t.pct < 100 && cost != null ? line('Personal portion (not a business expense)', money(cost * (100 - t.pct) / 100)) : ''}
      ${line('Preliminary tax treatment', `${esc(t.label)} <span class="tag ${LEVEL_CLASS[t.level] || ''}">${esc(t.level)}</span>`)}
      ${capital ? line('Likely CCA class', esc(EQUIP_RULES.classes[t.cls].label)) : ''}
      ${line(`Estimated ${Y()} deduction`, now ? money(now.deductible) : t.kind === 'capital' && !t.cls ? 'not estimated' : money(0))}
      ${capital ? line(`Remaining UCC end of ${Y()}`, money(now ? now.close : cost - cumulative)) : ''}
      <ul class="plain reasons">${t.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      <p class="muted">The estimated deduction is not necessarily the same as the purchase price.</p>
      ${e.receiptId ? '<p><button class="btn small" data-act="receipt">View receipt</button></p>' : '<p class="warn-text">No receipt attached. <button class="btn small" data-act="edit">Attach one</button></p>'}
    </section>
    ${capital && rows.length ? `<section class="panel">
      <h2>CCA tracker</h2>
      ${line('Original cost', money(cost))}${line('Opening UCC ' + Y(), now ? money(now.open) : '—')}${line('Cumulative CCA to ' + Y(), money(cumulative))}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Year</th><th>Opening UCC</th><th>CCA</th><th>Business %</th><th>Deductible</th><th>Closing UCC</th></tr></thead>
        <tbody>${rows.map(r => `<tr data-act="year" data-id="${r.year}"><td>${r.year}${r.first ? ' <small>first year</small>' : ''}${r.custom ? ' <small>your amount</small>' : ''}${r.disposed ? ' <small>disposed</small>' : ''}</td><td>${money(r.open)}</td><td>${money(r.cca)}</td><td>${num(r.pct)}%</td><td><strong>${money(r.deductible)}</strong></td><td>${money(r.close)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="muted">Tap a year to change the amount claimed or that year's business-use %. Estimates only.</p>
    </section>` : ''}
    ${t.kind === 'capital' && !t.cls ? `<p class="callout">${CLASS_UNSURE} Once your accountant confirms the class, choose it under Edit &gt; More details and the CCA tracker will appear.</p>` : ''}
    <section class="panel">
      <h2>Business purpose</h2>
      ${earns.length || e.earnsText ? `${earns.length ? list(earns) : ''}${e.earnsText ? `<p>${esc(e.earnsText)}</p>` : ''}` : '<p class="warn-text">Not recorded. <button class="btn small" data-act="edit">Add how it helps you earn income</button></p>'}
      ${e.notes ? `<p class="muted">${esc(e.notes)}</p>` : ''}
    </section>
    ${flags.length ? `<section class="panel notice"><h2>Items to discuss with accountant</h2>${list(flags)}</section>` : ''}
    <p class="muted">Record ID ${e.id}</p>
    ${checked()}`;
  root.onclick = ev => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'edit') equipForm(e);
    if (act === 'writeoff') writeOffModal(e);
    if (act === 'good') goodPurchaseModal(e);
    if (act === 'receipt') viewReceipt(e.receiptId);
    if (act === 'year') yearForm(e, rows.find(r => r.year === Number(b.dataset.id)));
  };
}

// ---- year-end report -------------------------------------------------------

export function techReport(root) {
  const s = equipSummary(Y());
  const bought = s.rows.filter(r => r.purchased);
  const currents = s.rows.filter(r => r.row && r.row.current);
  const capitals = s.rows.filter(r => r.t.kind === 'capital' && yearOf(r.e.date) <= Y());
  const subsPaid = inYear('expense', Y()).filter(x => x.category === 'Software & subscriptions' && x.use !== 'personal');
  const subTotal = sum(subsPaid, x => expenseParts(x, 0).portion);
  const unconfirmed = expectedSubs(Y()).filter(x => isDue(x.period));
  const missing = s.rows.filter(r => r.t.kind !== 'personal' && !r.e.receiptId && yearOf(r.e.date) <= Y());
  const flagged = s.rows.filter(r => r.flags.length && yearOf(r.e.date) <= Y());
  const table = (headers, rows) => (rows.length ? `<div class="table-wrap"><table class="table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="empty">None.</p>');
  root.innerHTML = `
    <p><a href="#/equipment">&larr; Equipment</a></p>
    ${head(`${Y()} Equipment & Technology Tax Report`, '<button class="btn" data-act="csv">CSV</button>', 'Estimates to review with your accountant, not a tax filing.')}
    <section class="panel">
      <h2>Totals</h2>
      ${line(`Equipment purchased in ${Y()}`, money(s.purchasedTotal))}
      ${line('Current expenses (business share)', money(s.current))}
      ${line('Potential CCA (business share)', money(s.cca))}
      ${line('Software / subscriptions paid (business share)', money(subTotal))}
      ${line(`Total technology deductions estimated for ${Y()}`, money(s.current + s.cca + subTotal), 'total')}
      <p class="muted">${state.settings.includeCca === false ? 'CCA is not counted in your net income estimate (Settings).' : 'Current expenses and CCA are counted in your net income estimate.'} Subscriptions are counted through Expenses.</p>
    </section>
    <section class="panel"><h2>Equipment purchased during ${Y()}</h2>
      ${table(['Item', 'Date', 'Cost', 'Business %', 'Treatment'], bought.map(r => [esc(r.e.name), r.e.date, r.t.cost == null ? 'no rate' : money(r.t.cost), `${r.t.pct}%`, esc(r.t.label)]))}</section>
    <section class="panel"><h2>Current expenses</h2>
      ${table(['Item', 'Cost', 'Business %', 'Deductible'], currents.map(r => [esc(r.e.name), money(r.t.cost), `${r.t.pct}%`, money(r.row.deductible)]))}</section>
    <section class="panel"><h2>Capital assets and potential CCA</h2>
      ${table(['Item', 'Class', 'Opening UCC', 'CCA', 'Business %', 'Deductible', 'Closing UCC'], capitals.map(r => (r.row ? [esc(r.e.name), r.t.cls, money(r.row.open), money(r.row.cca), `${num(r.row.pct)}%`, money(r.row.deductible), money(r.row.close)] : [esc(r.e.name), r.t.cls || 'to verify', '', 'not estimated', `${r.t.pct}%`, '', ''])))}</section>
    <section class="panel"><h2>Software and subscriptions</h2>
      ${table(['Date', 'Vendor', 'Paid (CAD)', 'Business share'], subsPaid.map(x => [x.date, esc(x.vendor || ''), cadOf(x) == null ? 'no rate' : money(cadOf(x)), money(expenseParts(x, 0).portion)]))}
      ${unconfirmed.length ? `<p class="callout">${unconfirmed.length} expected subscription payment(s) not yet confirmed. <a href="#/equipment">Review</a></p>` : ''}</section>
    <section class="panel"><h2>Receipts missing</h2>${missing.length ? list(missing.map(r => `${r.e.name} (${r.e.date})`)) : '<p class="empty">None.</p>'}</section>
    <section class="panel notice"><h2>Items to discuss with accountant</h2>
      ${flagged.length ? flagged.map(r => `<p><a href="#/equip/${r.e.id}"><strong>${esc(r.e.name)}</strong></a></p>${list(r.flags)}`).join('') : '<p class="empty">Nothing flagged.</p>'}</section>
    ${checked()}`;
  root.onclick = ev => { if (ev.target.closest('[data-act=csv]')) exportCsv('equipment', Y()); };
}

// Screens: tax estimate, year-end review, expense reference, export, settings.

import { state, all, yearSettings, saveSettings, importAll, resetAll, defaultSettings } from './store.js';
import { summary, reviewReasons, inYear, mileageWarnings } from './calc.js';
import { head, stat } from './views.js';
import { expenseForm } from './forms.js';
import { openForm, confirmDialog, toast, modal } from './ui.js';
import { CATALOG, CATEGORIES, LINKS, VERIFY, lookup, LARGE_PURCHASE, OUTCOMES, CHECKED } from './reference.js';
import { assetName } from './cca.js';
import { PROVINCES, RATES, RATE_SOURCES, ratesFor } from './tax-rates.js';
import { CSV, exportCsv, exportAllCsv, exportPdf, exportMileagePdf, exportBackup } from './export.js';
import { setPin, clearPin } from './lock.js';
import { byId, isDue } from './store.js';
import { $, $$, esc, money, num, pct, fmtDate } from './util.js';

const Y = () => state.settings.year;

export const DISCLAIMER = 'This tool provides estimates and record-keeping assistance only. It is not tax, legal, or accounting advice. Actual tax treatment depends on your circumstances and applicable CRA rules. Consult a qualified Canadian tax professional for filing advice.';

const line = (label, value, cls = '') => `<div class="line ${cls}"><span>${label}</span><span>${value}</span></div>`;
const numInput = (name, label, value, hint = '') => `<label class="f"><span>${esc(label)}</span><input type="text" inputmode="decimal" data-set="${name}" value="${value ?? ''}">${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
const parse = v => { const t = String(v).replace(/[,\s$%]/g, ''); return t === '' ? null : Number.isFinite(Number(t)) ? Number(t) : null; };

// ---- tax estimate ----------------------------------------------------------

export function tax(root) {
  const s = summary(Y());
  const t = s.tax;
  const a = t.assumptions;
  root.innerHTML = `
    ${head('Tax estimate', '', `Tax year ${Y()} &middot; ${esc(t.provinceName)}`)}
    <section class="panel hero">
      <span class="stat-label">Estimated amount to set aside</span>
      <span class="hero-value">${money(t.setAside)}</span>
      <span class="muted">${s.income.cad > 0 ? `About ${pct(t.setAside / s.income.cad, 0)} of the business income you have received so far.` : 'Add income to see an estimate.'} Not an official CRA calculation.</span>
    </section>
    ${t.usedYear !== t.year ? `<p class="callout">No ${t.year} rate table is loaded yet, so this uses ${t.usedYear} rates. Update the table in Settings when ${t.year} rates are published.</p>` : ''}
    ${t.provinceMissing ? `<p class="callout">Provincial tax for ${esc(t.provinceName)} is not modelled (Quebec has its own tax system and QPP). Only federal tax is shown - the real amount will be higher.</p>` : ''}
    ${t.provinceNote ? `<p class="callout">${esc(t.provinceNote)}</p>` : ''}
    <section class="panel">
      <h2>How this estimate is built</h2>
      ${line('Gross business income (received, CAD)', money(s.income.cad))}
      ${line('Estimated deductible vehicle expenses', `&minus; ${money(s.exp.vehicleEst)}`)}
      ${line('Estimated other deductible expenses', `&minus; ${money(s.exp.otherEst)}`)}
      ${s.cca.rows.length ? line(`Estimated vehicle CCA, business share${state.settings.includeCca === false ? ' (not counted - Settings)' : ''}`, `&minus; ${money(s.cca.counted)}`) : ''}
      ${s.equip.rows.length ? line(`Estimated equipment &amp; technology (current expenses + CCA${state.settings.includeCca === false ? ' not counted' : ''})`, `&minus; ${money(s.equip.counted)}`) : ''}
      ${line('Estimated net business income', money(s.net), 'total')}
      ${line('Other employment + other taxable income', `+ ${money((a.otherEmployment || 0) + (a.otherIncome || 0))}`)}
      ${line('Other deductions you entered', `&minus; ${money(a.extraDeductions || 0)}`)}
      ${line('Deductible part of CPP contributions', `&minus; ${money(t.cppDeduction)}`)}
      ${line('Estimated taxable income', money(t.taxable), 'total')}
      ${line('Estimated federal income tax', money(t.federal))}
      ${line(`Estimated provincial income tax (${esc(t.province)})`, t.provinceMissing ? 'not modelled' : money(t.provincial))}
      ${line('Estimated CPP on self-employment (both halves)', money(t.cpp))}
      ${line('Estimated income tax + CPP', money(t.total), 'total')}
      ${line('Tax already paid', `&minus; ${money(t.taxPaid)}`)}
      ${line('Estimated amount to set aside', money(t.setAside), 'total strong')}
    </section>
    <section class="panel">
      <h2>Your assumptions</h2>
      <p class="muted">Change any of these - the estimate updates when you leave the field.</p>
      <div class="fields">
        <label class="f half"><span>Province / territory</span><select data-set="province">${Object.entries(PROVINCES).map(([k, v]) => `<option value="${k}"${k === state.settings.province ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f half"><span>Tax year</span><input type="text" value="${Y()}" disabled><small>Change with the year selector at the top.</small></label>
        ${numInput('otherEmployment', 'Other employment income', a.otherEmployment)}
        ${numInput('otherIncome', 'Other taxable income', a.otherIncome, 'Interest, rental, EI, etc.')}
        ${numInput('extraDeductions', 'Other estimated deductions', a.extraDeductions, 'e.g. RRSP contributions')}
        ${numInput('taxPaid', 'Tax already paid', a.taxPaid, 'Instalments, or tax withheld from employment pay')}
        ${numInput('cppEmploymentEarnings', 'Employment earnings that already had CPP deducted', a.cppEmploymentEarnings, 'Reduces the CPP estimated on your business income')}
        <label class="check f"><input type="checkbox" data-set="includeCpp"${a.includeCpp ? ' checked' : ''}><span>Include CPP contributions on self-employment income</span></label>
      </div>
    </section>
    <section class="panel">
      <h2>What this estimate leaves out</h2>
      <ul class="plain">
        <li>Most personal credits and deductions (only the basic personal amount and CPP are applied).</li>
        <li>Capital cost allowance on equipment, and on any vehicle not recorded under <a href="#/assets">Vehicle assets &amp; CCA</a>.</li>
        <li>GST/HST. If your revenue passes $30,000 over four consecutive quarters you may need to register - ask your accountant how this applies to services billed to a U.S. company.</li>
        <li>Provincial surtaxes, health premiums, and EI.</li>
        <li>Instalment requirements. CRA may ask for quarterly instalments (March 15, June 15, September 15, December 15).</li>
      </ul>
      <p class="muted">Rate table: ${t.usedYear}${t.custom ? ' (your custom values)' : ' (built in)'}. <a href="${RATE_SOURCES.brackets}" target="_blank" rel="noopener">Verify current CRA rates</a> &middot; <a href="#/settings">Edit rate table</a></p>
    </section>
    <p class="disclaimer">${DISCLAIMER}</p>`;
  $$('[data-set]', root).forEach(el => el.addEventListener('change', async () => {
    const k = el.dataset.set;
    if (k === 'province') state.settings.province = el.value;
    else if (k === 'includeCpp') yearSettings(Y()).tax.includeCpp = el.checked;
    else yearSettings(Y()).tax[k] = parse(el.value) || 0;
    await saveSettings();
  }));
}

// ---- year-end review -------------------------------------------------------

export function review(root) {
  const s = summary(Y());
  const t = s.tax;
  const st = state.settings;
  const flagged = s.exp.items.map(x => ({ ...x, reasons: reviewReasons(x.e) })).filter(x => x.reasons.length);
  const due = s.expected.filter(x => isDue(x.period));
  const noReceipt = s.exp.items.filter(x => x.e.use !== 'personal' && !x.e.receiptId).length;
  const groups = [
    ['Mixed-use expenses', x => x.e.use === 'mixed', 'Be ready to show how you arrived at each business-use percentage.'],
    ['Meals & entertainment', x => (CATEGORIES[x.e.category] || {}).meals, `Generally limited to 50%. Estimate uses ${st.mealsPct}%. Each needs who you met and why.`],
    ['Equipment / possible capital items', x => (CATEGORIES[x.e.category] || {}).capital || ((x.cad || 0) >= LARGE_PURCHASE && x.e.group === 'other' && !(CATEGORIES[x.e.category] || {}).home), `Equipment and single purchases of ${money(LARGE_PURCHASE, 'CAD', 0)} or more may need to be claimed over several years (CCA).`],
    ['Home office', x => (CATEGORIES[x.e.category] || {}).home, st.homeOffice.qualifies ? 'You indicated you meet the conditions. The claim cannot create or increase a business loss.' : 'Not counted in the estimate - you have not confirmed you qualify (Settings).'],
    ['Travel', x => x.e.category === 'Travel', 'Keep destination, dates and the business reason for each trip.'],
    ['Training, clothing, interest & uncategorised', x => ['Training/education', 'Clothing/uniforms', 'Interest on business borrowing', 'Other'].includes(x.e.category), 'These often do not qualify, or only partly. Discuss each one.'],
    ['Missing exchange rate', x => x.cad == null, 'USD expenses with no rate are not counted at all.'],
  ];
  const checks = [
    [s.km.totalIsWeak, `Total kilometres for ${Y()} not entered - business-use % is based on logged trips only and is probably overstated.`, '#/trips'],
    ...mileageWarnings(Y()).map(w => [true, w, '#/trips']),
    [s.exp.vehicleTotal > 0 && s.km.business === 0, 'You have vehicle expenses but no business trips logged. CRA expects a mileage log.', '#/trips'],
    [s.income.unconverted > 0, `${s.income.unconverted} USD payment(s) have no exchange rate and are missing from CAD totals.`, '#/income'],
    [s.income.pending.length > 0, `${s.income.pending.length} payment(s) still marked pending.`, '#/income'],
    [due.length > 0, `${due.length} expected recurring payment(s) due so far in ${Y()} are not confirmed as received.`, '#/recurring'],
    [noReceipt > 0, `${noReceipt} business expense(s) have no receipt attached.`, '#/expenses'],
    [s.income.cad > 30000, 'Income is over $30,000 - ask your accountant whether you must register for GST/HST.', LINKS.guide],
  ].filter(c => c[0]);

  root.innerHTML = `
    ${head(`${Y()} year-end review`, '<a class="btn primary" href="#/export">Export for accountant</a>', 'Go through this before you export. The aim is to discuss these items with your accountant, not to claim everything automatically.')}
    <section class="panel">
      <h2>${Y()} summary</h2>
      ${line('Income', money(s.income.cad))}
      ${line('Expenses (business, recorded)', money(s.exp.businessTotal))}
      ${line('Vehicle expenses (total recorded)', money(s.exp.vehicleTotal))}
      ${line('Business kilometres', `${num(s.km.business)} km`)}
      ${line('Estimated net business income', money(s.net), 'total')}
      ${line('Estimated tax set-aside', money(t.setAside), 'total strong')}
    </section>
    ${checks.length ? `<section class="panel notice"><h2>Fix or confirm before exporting</h2><ul class="plain">${checks.map(([, msg, href]) => `<li>${esc(msg)} <a href="${href}"${href.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>Open</a></li>`).join('')}</ul></section>` : ''}
    <section class="panel">
      <h2>Vehicle</h2>
      ${line('Total vehicle expenses', money(s.exp.vehicleTotal))}
      ${line('Total kilometres', `${num(s.km.total)} km <small>(${esc(s.km.totalSource)})</small>`)}
      ${line('Business kilometres', `${num(s.km.business)} km <small>(${esc(s.km.businessSource)})</small>`)}
      ${line('Business-use percentage', pct(s.km.pct))}
      ${line('Estimated business portion', money(s.exp.vehicleEst), 'total')}
    </section>
    <section class="panel">
      <h2>Other expenses by category</h2>
      ${Object.keys(s.exp.byCategory).length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Category</th><th>Paid</th><th>Business portion</th><th>In estimate</th></tr></thead>
        <tbody>${Object.entries(s.exp.byCategory).sort((a, b) => b[1].total - a[1].total).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${money(v.total)}</td><td>${money(v.portion)}</td><td>${money(v.est)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td>${money(s.exp.otherTotal)}</td><td>${money(s.exp.otherPortion)}</td><td>${money(s.exp.otherEst)}</td></tr></tfoot>
      </table></div>` : '<p class="empty">No other expenses recorded.</p>'}
    </section>
    <section class="panel">
      <h2>Expenses to review</h2>
      <p class="muted">${flagged.length} of ${s.exp.items.filter(x => x.e.use !== 'personal').length} business expenses may need extra documentation or special tax treatment.</p>
      ${groups.map(([title, test, note]) => {
        const items = s.exp.items.filter(x => x.e.use !== 'personal' && test(x));
        if (!items.length) return '';
        return `<details class="review-group"><summary>${esc(title)} <span>${items.length} &middot; ${money(items.reduce((n, x) => n + (x.cad || 0), 0))}</span></summary>
          <p class="muted">${esc(note)}</p>
          ${items.map(x => `<button class="row" data-act="edit" data-id="${x.e.id}"><span class="row-main"><span class="row-title">${esc(x.e.vendor || x.e.category)}</span><span class="row-sub">${fmtDate(x.e.date)} &middot; ${esc(x.e.category)} &middot; ${esc(x.note)}${x.e.receiptId ? '' : ' &middot; no receipt'}</span></span><span class="row-amt"><strong>${x.cad == null ? 'no rate' : money(x.cad)}</strong><small>est. ${money(x.est)}</small></span></button>`).join('')}
        </details>`;
      }).join('') || '<p class="empty">Nothing flagged.</p>'}
      ${s.exp.vehicleTotal > 0 ? `<p class="muted">Vehicle: all ${money(s.exp.vehicleTotal)} of vehicle expenses depend on your mileage log and business-use percentage.</p>` : ''}
    </section>
    <section class="panel">
      <h2>Vehicle assets &amp; CCA <a class="link" href="#/assets">Open</a></h2>
      ${s.cca.rows.length ? s.cca.rows.map(r => line(`${esc(assetName(r.a))} &middot; ${r.c.cls ? `likely Class ${r.c.cls}` : 'class not determined'}`, r.undetermined ? 'not estimated' : `${money(r.deductible)} <small>of ${money(r.cca)} CCA at ${num(r.pct)}%</small>`)).join('') + line(`Estimated deductible CCA ${Y()}`, money(s.cca.deductible), 'total') : '<p class="empty">No vehicle assets recorded. A vehicle bought for the business is claimed through CCA, not as an expense.</p>'}
      ${s.cca.rows.length ? `<p class="muted">CCA class, first-year rule and business-use share are estimates to confirm with your accountant. ${st.includeCca === false ? 'Not included in the net income estimate (Settings).' : 'Included in the net income estimate.'}</p>` : ''}
    </section>
    <section class="panel">
      <h2>Equipment &amp; technology <a class="link" href="#/techreport">Report</a></h2>
      ${s.equip.rows.length ? line(`Purchased in ${Y()}`, money(s.equip.purchasedTotal)) + line('Current expenses (business share)', money(s.equip.current)) + line('Potential CCA (business share)', money(s.equip.cca)) + line('Items to discuss', String(s.equip.rows.filter(r => r.flags.length).length)) : '<p class="empty">No equipment recorded.</p>'}
    </section>
    <section class="panel">
      <h2>Notes for your accountant</h2>
      <textarea rows="4" data-notes placeholder="Anything your accountant should know about ${Y()}">${esc(yearSettings(Y()).notes || '')}</textarea>
      <p class="muted">Included in the PDF summary.</p>
    </section>
    <p class="disclaimer">${DISCLAIMER}</p>`;
  $('[data-notes]', root).addEventListener('change', async e => { yearSettings(Y()).notes = e.target.value; await saveSettings(); });
  root.onclick = e => { const b = e.target.closest('[data-act="edit"]'); if (b) expenseForm(byId('expense', b.dataset.id)); };
}

// ---- potential business expenses / "Could I write this off?" ----------------

const itemCard = (item, group) => `
  <div class="ref-card">
    <h3>${esc(item.name)}</h3>
    <div class="answer ${item.outcome}"><span class="stat-label">Preliminary answer</span><strong class="answer-title">${OUTCOMES[item.outcome]}</strong></div>
    <dl class="dl">
      <dt>Why</dt><dd>${esc(item.status)} ${esc(item.special)}</dd>
      <dt>How it may be treated</dt><dd>${esc(item.treat)}</dd>
      <dt>Expense category</dt><dd>${esc(item.category ? `${item.group === 'vehicle' ? 'Vehicle: ' : ''}${item.category}` : group)} &middot; possible business-use: ${esc(item.pct)}</dd>
      <dt>What I need to keep</dt><dd>${item.docs.map(esc).join(' &middot; ')}</dd>
      <dt>What could change the answer?</dt><dd>${item.changes.map(esc).join(' &middot; ')}</dd>
      <dt>Practical assessment</dt><dd>${esc(item.practical)}</dd>
    </dl>
    <p class="muted">Preliminary and general - it does not know your full situation. Tax treatment last checked ${fmtDate(CHECKED)}.</p>
    <p class="ref-actions"><a class="btn small" href="${item.link}" target="_blank" rel="noopener">Verify current CRA rules</a>
    ${item.asset ? '<a class="btn small" href="#/assets">Open Vehicle assets &amp; CCA</a>' : ''}
    ${item.category ? `<button class="btn small" data-act="record" data-group="${item.group === 'vehicle' ? 'vehicle' : 'other'}" data-cat="${esc(item.category)}">Record this expense</button>` : ''}</p>
  </div>`;

let lastQuery = '';

export function reference(root) {
  root.innerHTML = `
    ${head('Could I write this off?', '', 'A reference to help you spot potential business expenses and keep the right paperwork. It never decides deductibility for you.')}
    <input type="search" class="search big" placeholder="Type an expense, e.g. new laptop, gas, lunch with customer" value="${esc(lastQuery)}" aria-label="Expense to look up">
    <div data-results></div>
    <h2 class="section-title">Potential business expenses</h2>
    <p class="muted">Expenses that MAY be deductible for a self-employed salesperson, depending on your circumstances and current CRA rules.</p>
    ${CATALOG.map(g => `<details class="review-group"><summary>${esc(g.title)} <span>${g.items.length}</span></summary>
      <p class="muted">${esc(g.base.special)}</p>
      ${g.items.map(i => itemCard(i, g.title)).join('')}</details>`).join('')}
    <p class="muted">Sources: CRA guide T4002 and the CRA business expenses pages. <a href="${LINKS.guide}" target="_blank" rel="noopener">T4002 guide</a> &middot; <a href="${LINKS.expenses}" target="_blank" rel="noopener">CRA business expenses</a></p>
    <p class="disclaimer">${DISCLAIMER}</p>`;
  const paint = q => {
    lastQuery = q;
    const box = $('[data-results]', root);
    if (!q.trim()) { box.innerHTML = ''; return; }
    const hits = lookup(q);
    box.innerHTML = hits.length ? hits.map(h => itemCard(h.item, h.group)).join('')
      : `<div class="ref-card"><h3>No match for "${esc(q)}"</h3><p>That does not mean it cannot be a business expense. The general test is whether the cost was incurred to earn business income and is reasonable. Record it under <strong>Other</strong> with a clear business purpose and a receipt, and it will be flagged for your accountant to review.</p><p class="muted">${esc(VERIFY)}</p><p><a class="btn small" href="${LINKS.expenses}" target="_blank" rel="noopener">Verify current CRA rules</a></p></div>`;
  };
  $('.search', root).addEventListener('input', e => paint(e.target.value));
  paint(lastQuery);
  root.onclick = e => { const b = e.target.closest('[data-act="record"]'); if (b) expenseForm({ group: b.dataset.group, category: b.dataset.cat }); };
}

// ---- export & backup -------------------------------------------------------

function restoreFlow() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (backup.app !== 'taxtrack') throw new Error('This file is not a TaxTrack backup.');
      const count = Object.values(backup.data || {}).reduce((n, l) => n + l.length, 0);
      const ok = await confirmDialog(`Restore ${count} records from the backup made ${fmtDate((backup.exportedAt || '').slice(0, 10))}?`, { ok: 'Replace my data', detail: 'Everything currently in the app on this device will be replaced by the backup.' });
      if (!ok) return;
      await importAll(backup);
      toast(`Restored ${count} records.`);
    } catch (ex) { toast(ex.message || 'Could not read that file.'); }
  };
  input.click();
}

const storageNote = `<strong>Where your data is stored:</strong> only in this web browser on this device (its built-in IndexedDB storage). Nothing is uploaded to GitHub or any server, and nobody else can see it. That also means it does not sync between your phone and computer, and clearing this browser's site data or deleting the app from your home screen erases it. A backup file is the only copy outside this device.`;

export function exportView(root) {
  const counts = { income: inYear('income', Y()).length, expenses: inYear('expense', Y()).filter(e => e.group === 'other').length, vehicle: inYear('expense', Y()).filter(e => e.group === 'vehicle').length, mileage: inYear('trip', Y()).length, customers: all('customer').length, installations: inYear('installation', Y()).length, assets: all('asset').length, equipment: all('equip').length };
  const last = state.settings.lastBackup;
  root.innerHTML = `
    ${head('Export & backup', '', `Tax year ${Y()}`)}
    <section class="panel">
      <h2>Export for accountant</h2>
      <p class="muted">Review the <a href="#/review">year-end review</a> first. Every row carries its record ID so figures can be traced back.</p>
      <div class="btn-list">
        <a class="btn primary" href="#/cra">Prepare my taxes (full package)</a>
        <button class="btn" data-act="pdf">PDF year-end summary</button>
        <button class="btn" data-act="mileage-pdf">Mileage log PDF</button>
        <button class="btn" data-act="csv-all">All CSV files</button>
        ${Object.entries(CSV).map(([k, v]) => `<button class="btn" data-act="csv" data-id="${k}">${esc(v.label)} CSV <small>${counts[k]}</small></button>`).join('')}
      </div>
    </section>
    <section class="panel">
      <h2>Backup &amp; restore</h2>
      <p class="callout">${storageNote}</p>
      <p class="muted">Last backup: ${last ? fmtDate(last.slice(0, 10)) : 'never'}. The backup file contains all years, all settings and all receipt photos. Keep it somewhere private (for example your Files app or a private cloud drive) - it is not encrypted.</p>
      <div class="btn-list">
        <button class="btn primary" data-act="backup">Download full backup</button>
        <button class="btn" data-act="restore">Restore from backup file</button>
      </div>
    </section>`;
  root.onclick = async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'pdf') exportPdf(Y());
    if (act === 'csv-all') exportAllCsv(Y());
    if (act === 'mileage-pdf') exportMileagePdf(Y());
    if (act === 'csv') exportCsv(b.dataset.id, Y());
    if (act === 'backup') { await exportBackup(); await saveSettings(); toast('Backup downloaded.'); }
    if (act === 'restore') restoreFlow();
  };
}

// ---- settings --------------------------------------------------------------

function pinForm() {
  openForm({
    title: 'Set a 4-digit PIN',
    intro: 'The PIN is asked each time the app opens. It deters casual access; it does not encrypt your data. If you forget it, the only way back in is to erase the app data and restore a backup.',
    values: {},
    saveLabel: 'Turn on app lock',
    fields: [
      { name: 'pin', label: 'New PIN', type: 'text', inputType: 'password', required: true, focus: true },
      { name: 'pin2', label: 'Repeat PIN', type: 'text', inputType: 'password', required: true },
    ],
    async onSave(v) {
      if (!/^\d{4}$/.test(v.pin)) throw new Error('The PIN must be exactly 4 digits.');
      if (v.pin !== v.pin2) throw new Error('The two PINs do not match.');
      await setPin(v.pin);
      toast('App lock is on.');
    },
  });
}

function rateEditor() {
  const { table, usedYear, custom } = ratesFor(Y(), state.settings.rateOverrides);
  const m = modal(`
    <div class="sheet-head"><h2>Tax rate table for ${Y()}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body">
      <p class="muted">${custom ? 'Showing your custom table.' : `Showing the built-in ${usedYear} table.`} Edit the numbers when CRA publishes new rates. Brackets are [upper limit, rate]; null means no upper limit. <a href="${RATE_SOURCES.brackets}" target="_blank" rel="noopener">CRA brackets</a> &middot; <a href="${RATE_SOURCES.cpp}" target="_blank" rel="noopener">CRA CPP rates</a></p>
      <textarea class="code" rows="16" spellcheck="false">${esc(JSON.stringify(table, null, 1))}</textarea>
      <p class="form-error" hidden></p>
    </div>
    <div class="sheet-foot">
      ${state.settings.rateOverrides[Y()] ? '<button class="btn danger-text" data-reset>Use built-in table</button>' : ''}
      <span class="grow"></span><button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save for ${Y()}</button>
    </div>`, { wide: true });
  const err = $('.form-error', m.el);
  $('[data-save]', m.el).onclick = async () => {
    try {
      const t = JSON.parse($('textarea', m.el).value);
      if (!t.federal || !Array.isArray(t.federal.brackets) || !t.federal.bpa || !t.cpp || !t.provinces) throw new Error('The table must contain federal.brackets, federal.bpa, cpp and provinces.');
      state.settings.rateOverrides[Y()] = t;
      await saveSettings();
      m.close();
      toast(`Custom ${Y()} rates saved.`);
    } catch (ex) { err.textContent = `Could not save: ${ex.message}`; err.hidden = false; }
  };
  const reset = $('[data-reset]', m.el);
  if (reset) reset.onclick = async () => { delete state.settings.rateOverrides[Y()]; await saveSettings(); m.close(); toast('Using the built-in table.'); };
}

export function settings(root) {
  const s = state.settings;
  const ys = yearSettings(Y());
  const text = (key, label, value, hint = '') => `<label class="f"><span>${esc(label)}</span><input type="text" data-s="${key}" value="${esc(value ?? '')}">${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
  const number = (key, label, value, hint = '') => `<label class="f half"><span>${esc(label)}</span><input type="text" inputmode="decimal" data-s="${key}" value="${value ?? ''}">${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
  const select = (key, label, opts, value) => `<label class="f half"><span>${esc(label)}</span><select data-s="${key}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const years = Array.from({ length: 8 }, (_, i) => Math.min(2026, new Date().getFullYear()) - 1 + i);
  root.innerHTML = `
    ${head('Settings')}
    <section class="panel"><h2>General</h2><div class="fields">
      ${select('year', 'Tax year', years.map(y => [y, y]), s.year)}
      ${select('province', 'Province / territory', Object.entries(PROVINCES), s.province)}
      ${select('defaultIncomeCurrency', 'Default income currency', [['USD', 'USD'], ['CAD', 'CAD']], s.defaultIncomeCurrency)}
      ${select('theme', 'Appearance', [['auto', 'Match device'], ['light', 'Light'], ['dark', 'Dark']], s.theme)}
    </div></section>

    <section class="panel"><h2>Business information</h2><p class="muted">Shown on the PDF summary.</p><div class="fields">
      ${text('business.name', 'Business / trade name', s.business.name)}
      ${text('business.owner', 'Your name', s.business.owner)}
      ${text('business.number', 'Business number (optional)', s.business.number)}
      ${text('business.address', 'Address', s.business.address)}
    </div></section>

    <section class="panel"><h2>Vehicle &amp; mileage</h2><div class="fields">
      ${text('vehicles', 'Vehicles', s.vehicles.join(', '), 'Separate more than one with commas.')}
      ${select('defaultVehicle', 'Default vehicle', s.vehicles.map(v => [v, v]), s.defaultVehicle)}
      <label class="f half"><span>Usual starting location</span><input type="text" data-s="homeBase" value="${esc(s.homeBase)}"></label>
      <label class="f half"><span>Office / second starting location</span><input type="text" data-s="officeBase" value="${esc(s.officeBase || '')}"></label>
      <label class="check f"><input type="checkbox" data-s="gpsEnabled"${s.gpsEnabled ? ' checked' : ''}><span>Offer GPS distance when I start a trip</span></label>
      <small class="f">Off by default. Location is read only while a trip is running and the app is open on screen, only to add up distance. No coordinates or routes are saved, and nothing leaves this device. You can still untick GPS on any trip.</small>
    </div>
    <div class="btn-list"><a class="btn" href="#/trips">Vehicle odometers &amp; year totals</a></div>
    <p class="muted">Each vehicle keeps its own odometer and business-use % on the Mileage page. Renaming a vehicle here moves its trips and expenses to your default vehicle, so add new vehicles rather than renaming.</p>
    </section>

    <section class="panel"><h2>Estimate assumptions</h2><div class="fields">
      ${number('mealsPct', 'Meals & entertainment counted at (%)', s.mealsPct, 'CRA generally limits meals to 50%.')}
      <label class="check f"><input type="checkbox" data-s="includeEquipment"${s.includeEquipment ? ' checked' : ''}><span>Count equipment purchases as current-year expenses in the estimate</span></label>
      <small class="f">Off by default: equipment is usually claimed gradually (CCA), which your accountant calculates.</small>
      <label class="check f"><input type="checkbox" data-s="includeCca"${s.includeCca === false ? '' : ' checked'}><span>Count estimated CCA (business share) in the estimate</span></label>
      <small class="f">Applies to vehicles under Vehicle assets &amp; CCA and to capital items under Equipment &amp; technology. Turn off for a more cautious set-aside.</small>
      <label class="check f"><input type="checkbox" data-s="homeOffice.qualifies"${s.homeOffice.qualifies ? ' checked' : ''}><span>I qualify to claim home-office expenses</span></label>
      <small class="f">Tick only if your home work space is your principal place of business, or is used only to earn business income and regularly to meet clients. If unsure, leave it off and ask your accountant. <a href="${LINKS.home}" target="_blank" rel="noopener">Verify current CRA rules</a></small>
      ${number('homeOffice.pct', 'Work space as % of home', s.homeOffice.pct, 'Pre-fills the business-use % on home-office expenses.')}
    </div>
    <div class="btn-list"><a class="btn" href="#/tax">Tax estimate assumptions</a><button class="btn" data-act="rates">Edit ${Y()} tax rate table</button></div>
    <p class="muted">Built-in rate tables: ${Object.keys(RATES).join(', ')}. Custom tables: ${Object.keys(s.rateOverrides).join(', ') || 'none'}.</p>
    </section>

    <section class="panel"><h2>App lock</h2>
      <p class="muted">Optional 4-digit PIN when the app opens. Currently <strong>${s.lock.enabled ? 'ON' : 'OFF'}</strong>.</p>
      <div class="btn-list">${s.lock.enabled ? '<button class="btn" data-act="pin">Change PIN</button><button class="btn" data-act="pin-off">Turn off app lock</button>' : '<button class="btn" data-act="pin">Turn on app lock</button>'}</div>
    </section>

    <section class="panel"><h2>Data</h2>
      <p class="callout">${storageNote}</p>
      <div class="btn-list">
        <a class="btn" href="#/export">Export, backup &amp; import</a>
        <button class="btn danger-text" data-act="reset">Erase all data</button>
      </div>
    </section>
    <p class="disclaimer">${DISCLAIMER}</p>`;

  $$('[data-s]', root).forEach(el => el.addEventListener('change', async () => {
    const key = el.dataset.s;
    const val = el.type === 'checkbox' ? el.checked : el.value.trim();
    if (key === 'year') s.year = Number(val);
    else if (key === 'vehicles') {
      s.vehicles = val.split(',').map(v => v.trim()).filter(Boolean);
      if (!s.vehicles.length) s.vehicles = defaultSettings().vehicles;
      if (!s.vehicles.includes(s.defaultVehicle)) s.defaultVehicle = s.vehicles[0];
    }
    else if (key === 'mealsPct') s.mealsPct = Math.min(100, Math.max(0, parse(val) ?? 50));
    else if (key.startsWith('y.')) ys[key.slice(2)] = parse(val);
    else if (key.startsWith('business.')) s.business[key.slice(9)] = val;
    else if (key === 'homeOffice.qualifies') s.homeOffice.qualifies = val;
    else if (key === 'homeOffice.pct') s.homeOffice.pct = Math.min(100, Math.max(0, parse(val) || 0));
    else s[key] = val;
    await saveSettings();
    toast('Saved.');
  }));
  root.onclick = async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'rates') rateEditor();
    if (act === 'pin') pinForm();
    if (act === 'pin-off' && await confirmDialog('Turn off the app lock?', { ok: 'Turn off', danger: false })) { await clearPin(); toast('App lock is off.'); }
    if (act === 'reset') {
      if (!(await confirmDialog('Erase ALL data in this app?', { ok: 'Continue', detail: 'Every year, every record, every receipt and all settings on this device will be deleted. Download a backup first if you might need them.' }))) return;
      if (!(await confirmDialog('This cannot be undone. Erase everything now?', { ok: 'Erase everything' }))) return;
      await resetAll();
      toast('All data erased.');
    }
  };
}

// Vehicle Assets & CCA: purchase records, potential purchases, CCA schedule,
// cost forecast and the "Can I deduct this?" assessment.

import { state, all, byId, save, remove, saveSettings } from './store.js';
import { taxEstimate, summary } from './calc.js';
import { CCA_RULES, VEHICLE_TYPES, PURPOSES, UNSURE, assetName, classify, schedule, forecast, assess, purchaseYear } from './cca.js';
import { openForm, confirmDialog, toast, modal, finalizeReceipt, viewReceipt } from './ui.js';
import { head, stat } from './views.js';
import { $, esc, money, num, fmtDate, today } from './util.js';

const Y = () => state.settings.year;
const LEVEL_CLASS = { 'Confirmed tax rule': 'ok', 'Likely treatment': '', 'Needs professional verification': 'warn' };
const sourceLinks = () => Object.entries(CCA_RULES.sources).map(([l, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(l)}</a>`).join(' &middot; ');
const checked = () => `<p class="muted">Tax treatment last checked: ${fmtDate(CCA_RULES.checked)}. Review the official source: ${sourceLinks()}</p>`;

// ---- form ------------------------------------------------------------------

export function assetForm(rec = {}) {
  const truckish = v => v.vehicleType && v.vehicleType !== 'Car / sedan / wagon';
  const owned = v => v.status !== 'potential';
  openForm({
    title: rec.id ? 'Edit vehicle' : rec.status === 'potential' ? 'Potential vehicle purchase' : 'Add vehicle purchase',
    intro: 'A vehicle is recorded as a capital asset, not an expense. Keep entering fuel, insurance, repairs, registration and loan interest as normal vehicle expenses - figures typed here are for the forecast only and are never added to your expenses.',
    values: { status: 'owned', purchaseDate: today(), vehicleType: VEHICLE_TYPES[0], condition: 'used', payment: 'cash', businessPct: 100, firstYearRule: 'half', keepYears: 5, ...rec },
    openAdvanced: !!rec.id,
    fields: [
      { name: 'status', label: 'Record type', type: 'seg', options: [{ value: 'owned', label: 'I bought it' }, { value: 'potential', label: 'Considering it' }] },
      { name: 'price', label: 'Purchase price (before tax)', type: 'number', required: true, focus: true, half: true },
      { name: 'salesTax', label: 'Sales tax paid', type: 'number', half: true },
      { name: 'purchaseDate', label: 'Purchase date', type: 'date', showIf: owned },
      { name: 'year', label: 'Vehicle year', type: 'number', half: true },
      { name: 'make', label: 'Make', type: 'text', half: true },
      { name: 'model', label: 'Model', type: 'text', half: true },
      { name: 'condition', label: 'New or used', type: 'seg', half: true, options: [{ value: 'new', label: 'New' }, { value: 'used', label: 'Used' }] },
      { name: 'vehicleType', label: 'Vehicle type', type: 'select', options: VEHICLE_TYPES },
      { name: 'seating', label: 'Seats, including the driver', type: 'seg', showIf: truckish, options: [{ value: '1-3', label: '1 to 3' }, { value: '4-9', label: '4 to 9' }, { value: 'unsure', label: 'Not sure' }], hint: 'A regular-cab pickup seats 1-3; extended and crew cabs seat 4 or more.' },
      { name: 'hauling', label: 'Used mainly to carry goods, equipment or tools for the business?', type: 'seg', showIf: truckish, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'unsure', label: 'Not sure' }] },
      { name: 'zev', type: 'check', label: 'Zero-emission', checkLabel: 'Fully electric, hydrogen or plug-in hybrid', showIf: v => v.condition === 'new' },
      { name: 'businessPct', label: 'Business-use %', type: 'number', required: true, hint: 'Your honest expected share of driving that is for business.' },
      { name: 'purposeHead', type: 'info', render: () => '<strong>What will you use this vehicle for?</strong>' },
      ...PURPOSES.map(([name, label]) => ({ name, type: 'check', label, checkLabel: label, half: true })),
      { name: 'businessPurpose', label: 'Business purpose (in your words)', type: 'text' },
      { name: 'payment', label: 'How is it paid for?', type: 'seg', options: [{ value: 'cash', label: 'Cash' }, { value: 'financed', label: 'Financed' }] },
      { name: 'downPayment', label: 'Down payment', type: 'number', half: true, showIf: v => v.payment === 'financed' },
      { name: 'loanAmount', label: 'Loan amount', type: 'number', half: true, showIf: v => v.payment === 'financed' },
      { name: 'interestYear', label: 'Interest paid per year (estimate)', type: 'number', showIf: v => v.payment === 'financed' },
      { name: 'receipt', label: 'Purchase agreement / receipt', type: 'receipt' },
      { name: 'forecastHead', type: 'info', advanced: true, render: () => '<strong>Cost forecast</strong> - your best estimates. Used for the yearly cost and cost per kilometre.' },
      { name: 'bizKm', label: 'Business km per year', type: 'number', advanced: true, half: true },
      { name: 'personalKm', label: 'Personal km per year', type: 'number', advanced: true, half: true },
      { name: 'fuelEconomy', label: 'Fuel use (L/100 km)', type: 'number', advanced: true, half: true },
      { name: 'fuelPrice', label: 'Fuel price ($/L)', type: 'number', advanced: true, half: true },
      { name: 'insurance', label: 'Insurance per year', type: 'number', advanced: true, half: true },
      { name: 'registration', label: 'Registration per year', type: 'number', advanced: true, half: true },
      { name: 'maintenance', label: 'Maintenance per year', type: 'number', advanced: true, half: true },
      { name: 'repairs', label: 'Repairs per year', type: 'number', advanced: true, half: true },
      { name: 'resale', label: 'Expected resale value', type: 'number', advanced: true, half: true },
      { name: 'keepYears', label: 'Years you expect to keep it', type: 'number', advanced: true, half: true },
      { name: 'revenue', label: 'Yearly revenue this vehicle supports (optional)', type: 'number', advanced: true },
      { name: 'altCost', label: 'Yearly cost of your alternative (optional)', type: 'number', advanced: true, hint: 'For example keeping your current vehicle, or a cheaper one.' },
      { name: 'recordHead', type: 'info', advanced: true, render: () => '<strong>Record details</strong>' },
      { name: 'vin', label: 'VIN (optional)', type: 'text', advanced: true },
      { name: 'odoPurchase', label: 'Odometer at purchase', type: 'number', advanced: true, half: true },
      { name: 'odoCurrent', label: 'Current odometer', type: 'number', advanced: true, half: true },
      { name: 'firstYearRule', label: 'First-year CCA rule', type: 'seg', advanced: true, options: [{ value: 'half', label: 'Half-year rule' }, { value: 'full', label: 'Full first year' }], hint: 'Half-year rule is the standard, cautious default. Choose "Full first year" only if your accountant confirms a first-year incentive applies.' },
      { name: 'disposedYear', label: 'Year sold or traded (if any)', type: 'number', advanced: true },
      { name: 'notes', label: 'Notes', type: 'textarea', advanced: true },
    ],
    async onSave(v, orig) {
      if (!(v.price > 0)) throw new Error('Enter the purchase price.');
      if (!(v.businessPct >= 0 && v.businessPct <= 100)) throw new Error('Business-use % must be between 0 and 100.');
      if (v.status !== 'potential' && !v.purchaseDate) throw new Error('Enter the purchase date.');
      await finalizeReceipt(v, orig.receiptId);
      const { purposeHead, forecastHead, recordHead, receipt, ...clean } = v;
      const saved = await save('asset', clean);
      // Make the vehicle selectable on vehicle expenses.
      const name = assetName(saved);
      if (saved.status !== 'potential' && !state.settings.vehicles.includes(name)) { state.settings.vehicles.push(name); await saveSettings(); }
      toast('Saved.');
      location.hash = `#/asset/${saved.id}`;
    },
    onDelete: rec.id ? async () => {
      if (!(await confirmDialog('Delete this vehicle record?', { detail: 'Its CCA schedule and attached document will be deleted. Vehicle expenses you recorded are not affected.' }))) return false;
      await remove('asset', rec.id);
      toast('Deleted.');
      location.hash = '#/assets';
      return true;
    } : null,
  });
}

// Per-year override: CCA is optional and business use can differ each year.
function yearForm(a, row) {
  openForm({
    title: `${row.year} CCA - ${assetName(a)}`,
    intro: `Maximum CCA for ${row.year} is ${money(row.max)}. CCA is optional: you can claim any amount up to the maximum, and whatever you do not claim stays in the balance for later years.`,
    values: { claim: row.custom ? row.cca : null, pct: a.pctByYear && a.pctByYear[row.year] != null ? a.pctByYear[row.year] : null },
    fields: [
      { name: 'claim', label: 'CCA to claim this year', type: 'number', hint: 'Leave blank to use the maximum.' },
      { name: 'pct', label: `Business-use % in ${row.year}`, type: 'number', hint: `Leave blank to use ${a.businessPct}%. Ideally your business km ÷ total km for the year.` },
    ],
    async onSave(v) {
      if (v.claim != null && (v.claim < 0 || v.claim > row.max)) throw new Error(`Enter an amount between 0 and ${money(row.max)}.`);
      if (v.pct != null && (v.pct < 0 || v.pct > 100)) throw new Error('Business-use % must be between 0 and 100.');
      const claims = { ...(a.claims || {}) }, pctByYear = { ...(a.pctByYear || {}) };
      if (v.claim == null) delete claims[row.year]; else claims[row.year] = v.claim;
      if (v.pct == null) delete pctByYear[row.year]; else pctByYear[row.year] = v.pct;
      await save('asset', { ...a, claims, pctByYear });
      toast('Saved.');
    },
  });
}

// ---- "Can I deduct this?" --------------------------------------------------

function answerHtml(a) {
  const r = assess(a, Y());
  const s = summary(Y());
  const ded = r.cash.firstYearDeduction;
  const saved = ded ? Math.max(0, s.tax.total - taxEstimate(Y(), s.net - ded).total) : 0;
  const list = items => `<ul class="plain">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
  return `
    <div class="answer ${r.outcome}">
      <span class="stat-label">Preliminary answer</span>
      <strong class="answer-title">${r.answer}</strong>
      <span class="muted">Business-use case: <strong>${r.rating}</strong></span>
    </div>
    <h3>Why</h3><p>${esc(r.why)}</p>
    <h3>How it may be treated</h3>
    <ul class="plain">${r.treatment.map(t => `<li><span class="tag ${LEVEL_CLASS[t.level]}">${t.level}</span> ${esc(t.text)}</li>`).join('')}</ul>
    <h3>Cash paid vs. tax deduction</h3>
    <div class="line"><span>Cash cost of the vehicle</span><span>${money(r.cash.paid)}</span></div>
    <div class="line"><span>Potential first-year deduction (CCA &times; ${a.businessPct}% business use)</span><span>${ded == null ? 'not determined' : money(ded)}</span></div>
    <div class="line"><span>Remaining capital balance (UCC) after year one</span><span>${r.cash.remaining == null ? 'not determined' : money(r.cash.remaining)}</span></div>
    ${ded ? `<div class="line"><span>Rough tax reduction from that deduction, on your ${Y()} figures</span><span>${saved > 0 ? money(saved) : 'none at current income'}</span></div>` : ''}
    <p class="muted">Spending ${money(r.cash.paid)} does not save ${money(r.cash.paid)} in tax. Only the yearly CCA is deducted from income, and a deduction lowers tax by a fraction of its amount. The rest of the cost stays in the balance and is claimed over later years.${r.cash.fullRule && a.firstYearRule !== 'full' ? ` If a first-year incentive applies, the first-year deduction could be up to ${money(r.cash.fullRule)} - needs verification.` : ''}</p>
    <h3>What I need to keep</h3>${list(r.keep)}
    <h3>What could change the answer?</h3>${list(r.change)}
    <h3>Practical assessment</h3>${list(r.practical)}
    ${checked()}
    <p class="disclaimer">This is a preliminary assessment from the information you entered, not tax advice or a CRA ruling. The filing decision is yours and your tax professional's.</p>`;
}

function answerModal(a) {
  modal(`
    <div class="sheet-head"><h2>Can I deduct this? ${esc(assetName(a))}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body">${answerHtml(a)}</div>
    <div class="sheet-foot"><span class="grow"></span><button class="btn primary" data-close>Done</button></div>`, { wide: true });
}

// ---- views -----------------------------------------------------------------

const classLabel = c => (c.cls ? `Class ${c.cls}` : 'Class not determined');

export function assets(root) {
  const list = all('asset');
  const owned = list.filter(a => a.status !== 'potential');
  const potential = list.filter(a => a.status === 'potential');
  const s = summary(Y());
  const rowHtml = a => {
    const sch = schedule(a, Y());
    const r = sch.rows.find(x => x.year === Y());
    return `<button class="row" data-act="open" data-id="${a.id}">
      <span class="row-main"><span class="row-title">${esc(assetName(a))} <span class="tag">${classLabel(sch.c)}</span></span>
        <span class="row-sub">${a.status === 'potential' ? 'Considering' : `Bought ${fmtDate(a.purchaseDate)}`} &middot; ${esc(a.vehicleType)} &middot; ${a.businessPct}% business</span></span>
      <span class="row-amt"><strong>${money(Number(a.price) + (Number(a.salesTax) || 0))}</strong><small>${a.status === 'potential' ? 'not purchased' : r ? `${Y()} CCA est. ${money(r.deductible)}` : `no CCA in ${Y()}`}</small></span>
    </button>`;
  };
  root.innerHTML = `
    ${head('Vehicle assets & CCA', '<button class="btn primary" data-act="add">+ Add vehicle</button>', 'Vehicles you buy for the business are capital assets. Their cost is claimed gradually as capital cost allowance (CCA), separately from fuel and other running costs.')}
    <div class="stats strip">
      ${stat('Vehicles owned', String(owned.length))}
      ${stat(`Est. CCA ${Y()}`, money(s.cca.deductible), 'business share')}
      ${stat('In estimate', state.settings.includeCca === false ? 'No' : 'Yes', '<a href="#/settings">change</a>')}
    </div>
    <section class="panel"><h2>Owned</h2>${owned.length ? owned.map(rowHtml).join('') : '<p class="empty">No vehicle purchases recorded.</p>'}</section>
    <section class="panel"><h2>Potential purchases <button class="btn small" data-act="add-potential">+ Potential purchase</button></h2>
      <p class="muted">Test a vehicle before you buy it: yearly cost, cost per kilometre and likely tax treatment.</p>
      ${potential.length ? potential.map(rowHtml).join('') : '<p class="empty">None.</p>'}</section>
    ${checked()}`;
  root.onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'add') assetForm();
    if (b.dataset.act === 'add-potential') assetForm({ status: 'potential' });
    if (b.dataset.act === 'open') location.hash = `#/asset/${b.dataset.id}`;
  };
}

export function asset(root, id) {
  const a = byId('asset', id);
  if (!a) { root.innerHTML = `${head('Vehicle not found')}<p><a href="#/assets">Back to vehicle assets</a></p>`; return; }
  const potential = a.status === 'potential';
  const through = Math.max(Y(), (purchaseYear(a) || Y()));
  const sch = potential ? schedule({ ...a, purchaseDate: `${Y()}-01-01` }, Y() + 4) : schedule(a, through);
  const c = sch.c;
  const f = forecast(a);
  const cumulative = sch.rows.filter(r => r.year <= Y()).reduce((t, r) => t + r.cca, 0);
  const current = sch.rows.find(r => r.year === Y());
  const line = (l, v) => `<div class="line"><span>${l}</span><span>${v}</span></div>`;
  root.innerHTML = `
    <p><a href="#/assets">&larr; Vehicle assets</a></p>
    ${head(assetName(a), '<button class="btn" data-act="edit">Edit</button>', `${potential ? 'Potential purchase' : `Bought ${fmtDate(a.purchaseDate)}`} &middot; ${esc(a.vehicleType)} &middot; ${a.condition === 'new' ? 'new' : 'used'}`)}
    <button class="quick-btn wide" data-act="deduct">Can I deduct this?</button>
    <section class="panel">
      <h2>Capital asset record</h2>
      ${line('Original cost (price + sales tax)', money(c.fullCost))}
      ${c.capped ? line('Capital cost for CCA (limited)', money(c.capitalCost)) : ''}
      ${line('Likely CCA class', c.cls ? esc(CCA_RULES.classes[c.cls].label) : 'Not determined')}
      ${line('Business-use percentage', `${a.businessPct}%`)}
      ${potential ? '' : line('Year purchased', purchaseYear(a))}
      ${potential ? '' : line(`Opening UCC ${Y()}`, current ? money(current.open) : '—')}
      ${potential ? '' : line(`Estimated CCA ${Y()}`, current ? money(current.cca) : '—')}
      ${potential ? '' : line(`Estimated deductible CCA ${Y()} (business share)`, current ? money(current.deductible) : '—')}
      ${potential ? '' : line(`Cumulative CCA to ${Y()}`, money(cumulative))}
      ${potential ? '' : line(`Remaining UCC end of ${Y()}`, current ? money(current.close) : money(c.capitalCost - cumulative))}
      ${c.cls ? `<p class="muted"><span class="tag">Likely treatment</span> ${esc(c.reasons.join(' '))}</p>` : `<p class="callout">${UNSURE} Edit the vehicle and answer the seating and goods/equipment questions to get a likely class.</p>`}
      ${c.verify.filter(v => v !== UNSURE).map(v => `<p class="muted"><span class="tag warn">Needs professional verification</span> ${esc(v)}</p>`).join('')}
      ${a.receiptId ? '<p><button class="btn small" data-act="receipt">View purchase document</button></p>' : ''}
    </section>
    ${sch.rows.length ? `<section class="panel">
      <h2>${potential ? 'Projected CCA if purchased this year' : 'CCA schedule'}</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Year</th><th>Opening UCC</th><th>CCA</th><th>Business %</th><th>Deductible</th><th>Closing UCC</th></tr></thead>
        <tbody>${sch.rows.map(r => `<tr${potential ? '' : ` data-act="year" data-id="${r.year}"`}><td>${r.year}${r.first ? ' <small>first year</small>' : ''}${r.custom ? ' <small>your amount</small>' : ''}${r.disposed ? ' <small>sold</small>' : ''}</td><td>${money(r.open)}</td><td>${money(r.cca)}</td><td>${num(r.pct)}%</td><td><strong>${money(r.deductible)}</strong></td><td>${money(r.close)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="muted">${potential ? '' : 'Tap a year to change the amount claimed or that year\'s business-use %. '}First year uses the ${a.firstYearRule === 'full' ? 'full-year rate (you chose this - verify it applies)' : 'half-year rule'}. Estimates only; your accountant determines the actual claim.${a.disposedYear ? ' Sale or trade-in: recapture or a terminal loss may apply and is not calculated here.' : ''}</p>
    </section>` : ''}
    <section class="panel">
      <h2>Cost forecast</h2>
      ${f.parts.map(p => line(esc(p.label), money(p.value))).join('')}
      <div class="line total"><span>Estimated annual vehicle cost</span><span>${money(f.annual)}</span></div>
      ${line('Annual operating cost (excluding depreciation)', money(f.operating))}
      ${line('Cost per kilometre', f.perKm == null ? '—' : money(f.perKm))}
      ${line(`Estimated business-use cost (${num(f.share * 100)}%)`, money(f.businessCost))}
      ${line('Cost per business kilometre', f.perBizKm == null ? '—' : money(f.perBizKm))}
      ${f.revenuePct == null ? '' : line('Business cost as share of revenue supported', `${num(f.revenuePct * 100)}%`)}
      ${f.altAnnual ? line('Your alternative, per year', money(f.altAnnual)) : ''}
      ${f.missing.length ? `<p class="callout">Missing for a full forecast: ${esc(f.missing.join(', '))}. <button class="btn small" data-act="edit">Add estimates</button></p>` : ''}
    </section>
    ${a.businessPurpose || a.notes || a.vin ? `<section class="panel"><h2>Details</h2>${a.businessPurpose ? line('Business purpose', esc(a.businessPurpose)) : ''}${a.vin ? line('VIN', esc(a.vin)) : ''}${a.odoPurchase != null ? line('Odometer at purchase', num(a.odoPurchase)) : ''}${a.odoCurrent != null ? line('Current odometer', num(a.odoCurrent)) : ''}${a.payment === 'financed' ? line('Loan amount', money(a.loanAmount)) + line('Down payment', money(a.downPayment)) : ''}${a.notes ? `<p>${esc(a.notes)}</p>` : ''}</section>` : ''}
    ${potential ? '<p><button class="btn" data-act="bought">I bought this vehicle</button></p>' : ''}
    ${checked()}`;
  root.onclick = async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'edit') assetForm(a);
    if (act === 'deduct') answerModal(a);
    if (act === 'receipt') viewReceipt(a.receiptId);
    if (act === 'year') yearForm(a, sch.rows.find(r => r.year === Number(b.dataset.id)));
    if (act === 'bought') assetForm({ ...a, status: 'owned', purchaseDate: today() });
  };
}

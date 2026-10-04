// CRA / Tax Filing: the year-end "tax package" and the screen that prepares it.
//
// What this is NOT: it does not file a return, talk to CRA, or ask for any CRA
// sign-in details. CRA accepts electronically filed personal returns only from
// NETFILE-certified software, so this app prepares organised figures to type
// into certified software or hand to an accountant.
//
// buildPackage(year) returns one plain data object. Every export (screen, PDF,
// Excel) is produced from it, so a future officially supported integration
// would only need to consume that same object.

import { state, all, customerName, yearSettings, saveSettings } from './store.js';
import { summary, inYear, cadOf, expenseParts, reviewReasons, customerTotals, mileageWarnings, normVehicle } from './calc.js';
import { CATEGORIES } from './reference.js';
import { PROVINCES } from './tax-rates.js';
import { assetName } from './cca.js';
import { expectedSubs } from './equip.js';
import { CSV, exportAllCsv, exportMileagePdf, exportBackup } from './export.js';
import { Pdf } from './pdf.js';
import { buildXlsx } from './xlsx.js';
import { head } from './views.js';
import { DISCLAIMER } from './views2.js';
import { $$, esc, money, num, pct, fmtDate, today, download, MONTHS, round2, sum } from './util.js';

const Y = () => state.settings.year;
const CRA = 'https://www.canada.ca/en';
export const CRA_LINKS = {
  'NETFILE overview': `${CRA}/revenue-agency/services/e-services/digital-services-individuals/netfile-overview.html`,
  'CRA-certified tax software list': `${CRA}/services/taxes/income-tax/personal-income-tax/how-file/tax-software/find-software.html`,
  'Form T2125, Statement of Business or Professional Activities': `${CRA}/revenue-agency/services/forms-publications/forms/t2125.html`,
  'Guide T4002 (self-employed income)': `${CRA}/revenue-agency/services/forms-publications/publications/t4002.html`,
  'Business expenses': `${CRA}/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses.html`,
  'Tax rates and brackets': `${CRA}/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html`,
};
export const CRA_CHECKED = '2026-10-01';

// Where each expense category is normally reported on form T2125. Line numbers
// are for orientation only - check them against the current year's form.
export const T2125 = {
  'Advertising & marketing': ['8521', 'Advertising'],
  'Meals & entertainment': ['8523', 'Meals and entertainment (allowable part only)'],
  'Business insurance': ['8690', 'Insurance'],
  'Banking/payment fees': ['8710', 'Interest and bank charges'],
  'Interest on business borrowing': ['8710', 'Interest and bank charges'],
  'Licences, dues & memberships': ['8760', 'Business taxes, licences and memberships'],
  'Software & subscriptions': ['8810', 'Office expenses'],
  'Office supplies': ['8811', 'Office stationery and supplies'],
  'Accounting & professional fees': ['8860', 'Professional fees'],
  'Travel': ['9200', 'Travel expenses'],
  'Phone': ['9220', 'Utilities (telephone)'],
  'Internet': ['9220', 'Utilities (internet)'],
  'Training/education': ['9270', 'Other expenses - training'],
  'Clothing/uniforms': ['9270', 'Other expenses - clothing (review)'],
  'Rent': ['8910', 'Rent'],
  'Repairs & maintenance': ['8960', 'Repairs and maintenance'],
  'Delivery & freight': ['9275', 'Delivery, freight and express'],
  'Contractors & wages': ['9060', 'Salaries, wages and benefits / subcontracts'],
  'Inventory / cost of goods': ['8320', 'Purchases during the year (cost of goods sold)'],
  'Other': ['9270', 'Other expenses'],
  'Computer/equipment': ['9936', 'Capital cost allowance (not a current expense)'],
  'Home office': ['9945', 'Business-use-of-home expenses'],
};
export const FILING_STATUSES = ['Not started', 'Keeping records', 'Package prepared', 'Sent to accountant', 'Filed'];

export function buildPackage(year = Y()) {
  const s = summary(year);
  const st = state.settings;
  const ys = yearSettings(year);
  const income = inYear('income', year);
  const received = income.filter(i => i.status === 'received').sort((a, b) => a.date.localeCompare(b.date));
  const typeTotal = fn => round2(sum(received.filter(fn), i => cadOf(i) || 0));
  const usd = received.filter(i => i.currency === 'USD');
  const rates = usd.filter(i => i.fxRate).map(i => i.fxRate);

  // Expenses grouped by T2125 line.
  const lines = {};
  for (const x of s.exp.items) {
    if (x.e.group !== 'other' || x.e.use === 'personal') continue;
    const [no, label] = T2125[x.e.category] || T2125.Other;
    const key = `${no}|${label}`;
    const row = lines[key] || (lines[key] = { line: no, label, paid: 0, business: 0, estimate: 0, count: 0 });
    row.paid += x.cad || 0; row.business += x.portion; row.estimate += x.est; row.count++;
  }
  const expenseLines = Object.values(lines).sort((a, b) => a.line.localeCompare(b.line) || a.label.localeCompare(b.label));

  const noReceipt = s.exp.items.filter(x => x.e.use !== 'personal' && !x.e.receiptId);
  const equipNoReceipt = s.equip.rows.filter(r => r.t.kind !== 'personal' && !r.e.receiptId && String(r.e.date).slice(0, 4) <= String(year));
  const review = [
    ...s.exp.items.map(x => ({ what: `${x.e.date} ${x.e.vendor || x.e.category} (${x.e.category})`, amount: x.cad, why: reviewReasons(x.e) })).filter(r => r.why.length),
    ...s.equip.rows.filter(r => r.flags.length && String(r.e.date).slice(0, 4) <= String(year)).map(r => ({ what: `Equipment: ${r.e.name}`, amount: r.t.cost, why: r.flags })),
    ...s.cca.rows.filter(r => r.undetermined).map(r => ({ what: `Vehicle: ${assetName(r.a)}`, amount: null, why: ['CCA class not determined'] })),
    ...mileageWarnings(year).map(w => ({ what: 'Mileage log', amount: null, why: [w] })),
  ];
  const dueSubs = expectedSubs(year).filter(x => x.period <= today().slice(0, 7)).length;
  const dueIncome = s.expected.filter(x => x.period <= today().slice(0, 7)).length;
  const checklist = [
    ['Every payment received is recorded', s.income.pending.length === 0 && dueIncome === 0, `${s.income.pending.length} pending, ${dueIncome} expected recurring payment(s) not confirmed`],
    ['Every USD payment has an exchange rate or CAD amount', s.income.unconverted === 0, `${s.income.unconverted} missing`],
    ['Receipts attached to business expenses', noReceipt.length === 0, `${noReceipt.length} expense(s) without a receipt`],
    ['Receipts attached to equipment', equipNoReceipt.length === 0, `${equipNoReceipt.length} item(s) without a receipt`],
    ['Mileage log kept, with odometer at start and end of year', !s.km.totalIsWeak && (s.km.bizTrips > 0 || s.exp.vehicleTotal === 0), s.km.totalIsWeak ? 'year odometer readings not entered' : 'no business trips logged'],
    ['Mileage records are consistent', mileageWarnings(year).length === 0, `${mileageWarnings(year).length} warning(s)`],
    ['Subscription payments confirmed', dueSubs === 0, `${dueSubs} expected payment(s) not confirmed`],
    ['Home-office eligibility decided', s.exp.homeTotal === 0 || st.homeOffice.qualifies, 'home-office expenses recorded but eligibility not confirmed in Settings'],
    ['CCA classes determined', s.cca.undetermined + s.equip.undetermined === 0, `${s.cca.undetermined + s.equip.undetermined} asset(s) need a class`],
    ['Full backup downloaded', !!st.lastBackup, 'no backup yet'],
  ].map(([label, ok, problem]) => ({ label, ok, problem: ok ? '' : problem }));

  return {
    year, prepared: today(), province: PROVINCES[st.province], business: st.business,
    filing: ys.filing || { status: 'Not started' },
    income: {
      total: round2(s.income.cad), byMonth: s.income.byMonth.map(round2), byType: s.income.byType, byCustomer: s.income.byCustomer,
      commission: typeTotal(i => i.type === 'Monthly residual/commission' || i.type === 'Sales commission'),
      installation: typeTotal(i => i.type === 'Installation payment'),
      other: typeTotal(i => !['Monthly residual/commission', 'Sales commission', 'Installation payment'].includes(i.type)),
      usd: round2(s.income.usd), usdConverted: round2(s.income.usdConverted), cadNative: round2(s.income.cadNative), unconverted: s.income.unconverted,
      rateLow: rates.length ? Math.min(...rates) : null, rateHigh: rates.length ? Math.max(...rates) : null,
      rateAverage: s.income.usd > 0 && s.income.unconverted === 0 ? s.income.usdConverted / s.income.usd : null,
      payments: received, payers: [...new Set(usd.map(i => i.payer).filter(Boolean))],
    },
    expenseLines,
    expenses: { business: round2(s.exp.businessTotal), otherEstimate: round2(s.exp.otherEst), items: s.exp.items },
    vehicle: { km: s.km, total: round2(s.exp.vehicleTotal), estimate: round2(s.exp.vehicleEst), byCategory: s.exp.vehicleByCategory },
    cca: { vehicles: s.cca.rows, equipment: s.equip.rows.filter(r => r.t.kind === 'capital' && String(r.e.date).slice(0, 4) <= String(year)), vehicleTotal: s.cca.deductible, equipmentTotal: s.equip.cca, counted: st.includeCca !== false },
    equipment: { purchased: s.equip.rows.filter(r => r.purchased), purchasedTotal: s.equip.purchasedTotal, current: s.equip.current, currentItems: s.equip.rows.filter(r => r.row && r.row.current) },
    homeOffice: { recorded: round2(s.exp.homeTotal), qualifies: st.homeOffice.qualifies, pct: st.homeOffice.pct, calc: s.home },
    meals: lines['8523|Meals and entertainment (allowable part only)'] || null,
    travel: lines['9200|Travel expenses'] || null,
    gst: { registered: !!(st.gst && st.gst.registered), number: (st.gst && st.gst.number) || '', revenue: round2(s.income.cad), overThreshold: s.income.cad > 30000, paidOnExpenses: round2(sum(s.exp.items.filter(x => x.e.use !== 'personal'), x => Number(x.e.tax) || 0)) },
    net: round2(s.net), tax: s.tax,
    documentation: { noReceipt, equipNoReceipt, review, checklist, ready: checklist.filter(c => c.ok).length },
    customers: all('customer').map(c => ({ c, t: customerTotals(c.id, year) })).sort((a, b) => b.t.cad - a.t.cad),
    notes: ys.notes || '',
  };
}

// ---- PDF -------------------------------------------------------------------

export function buildPackagePdf(year = Y()) {
  const p = buildPackage(year);
  const m = v => money(v);
  const b = p.business;
  const doc = new Pdf({ footer: `${b.name || b.owner || 'Business'} - ${year} tax package - prepared from the owner's records, not a tax return` });
  doc.title(`${year} Tax Year Package`, [b.name, b.owner, b.number && `BN ${b.number}`, p.province, `Prepared ${fmtDate(p.prepared)}`].filter(Boolean).join('  |  '));
  doc.para('Prepared for entry into CRA-certified tax software or for an accountant. This is not a tax return and has not been filed with or reviewed by the CRA. Amounts marked "estimate" follow the owner\'s settings and are to be confirmed. T2125 line numbers are for orientation; check them against the current form.');

  doc.h2('1. Business income (T2125 Part 3)');
  doc.kv('Total business income received (CAD) - gross sales, commissions or fees', m(p.income.total), { bold: true });
  doc.kv('Commission income', m(p.income.commission));
  doc.kv('Installation income', m(p.income.installation));
  doc.kv('Other business income', m(p.income.other));
  doc.gap(4);
  doc.table([{ label: 'Month', width: 0.5 }, { label: 'Income (CAD)', width: 0.5, align: 'right' }], MONTHS.map((n, i) => [n, m(p.income.byMonth[i])]));
  doc.table([{ label: 'Income by customer', width: 0.7 }, { label: 'CAD', width: 0.3, align: 'right' }], Object.entries(p.income.byCustomer).sort((a, c) => c[1] - a[1]).map(([k, v]) => [k, m(v)]));

  doc.h2('2. Foreign (U.S. dollar) income');
  doc.kv('USD received', money(p.income.usd, 'USD'));
  doc.kv('CAD equivalent reported', m(p.income.usdConverted));
  doc.kv('Income received in CAD', m(p.income.cadNative));
  if (p.income.rateLow != null) doc.kv('Exchange rates used (lowest / highest / effective average)', `${num(p.income.rateLow, 4)} / ${num(p.income.rateHigh, 4)} / ${p.income.rateAverage ? num(p.income.rateAverage, 4) : 'n/a'}`);
  if (p.income.payers.length) doc.para(`USD payers: ${p.income.payers.join(', ')}.`);
  doc.para('Each payment was converted at the rate, or the CAD amount actually received, recorded by the owner for that payment. No rate was assumed.' + (p.income.unconverted ? ` ${p.income.unconverted} USD payment(s) have no rate and are NOT in the totals.` : ''));
  const usdPay = p.income.payments.filter(i => i.currency === 'USD');
  if (usdPay.length) doc.table([{ label: 'Date', width: 0.14 }, { label: 'Payer / customer', width: 0.34 }, { label: 'USD', width: 0.16, align: 'right' }, { label: 'Rate', width: 0.12, align: 'right' }, { label: 'Basis', width: 0.1 }, { label: 'CAD', width: 0.14, align: 'right' }],
    usdPay.map(i => [i.date, customerName(i.customerId) || i.payer || '', money(i.amount, 'USD'), i.fxRate ? num(i.fxRate, 4) : 'none', i.fxMethod === 'cad' ? 'CAD rec\'d' : 'rate', i.cadAmount == null ? 'not converted' : m(i.cadAmount)]));

  doc.h2('3. Business expenses by T2125 line (other than vehicle and CCA)');
  doc.table([{ label: 'Line', width: 0.09 }, { label: 'Description', width: 0.43 }, { label: 'Paid', width: 0.16, align: 'right' }, { label: 'Business part', width: 0.16, align: 'right' }, { label: 'Estimate', width: 0.16, align: 'right' }],
    p.expenseLines.map(l => [l.line, l.label, m(l.paid), m(l.business), m(l.estimate)]));
  doc.para(`"Estimate" applies: meals at ${state.settings.mealsPct}%; home office ${p.homeOffice.qualifies ? 'included' : 'excluded (eligibility not confirmed)'}; equipment entered as an expense ${state.settings.includeEquipment ? 'included' : 'excluded (capital)'}.`);
  if (p.equipment.currentItems.length) doc.table([{ label: 'Low-cost equipment treated as current expense (likely 8810/8811)', width: 0.7 }, { label: 'Business share', width: 0.3, align: 'right' }], p.equipment.currentItems.map(r => [r.e.name, m(r.row.deductible)]));

  doc.h2('4. Motor vehicle expenses (line 9281) and mileage');
  for (const v of p.vehicle.km.vehicles) {
    if (!v.total && !v.business) continue;
    doc.kv(`${v.name}: total km (${v.totalSource})`, `${num(v.total)} km`);
    doc.kv(`${v.name}: business km / personal km`, `${num(v.business)} / ${num(v.personal)} km`);
    doc.kv(`${v.name}: business-use percentage`, pct(v.pct));
  }
  doc.kv('Total vehicle expenses recorded', m(p.vehicle.total));
  doc.kv('Estimated business portion', m(p.vehicle.estimate), { bold: true });
  doc.table([{ label: 'Vehicle expense category', width: 0.7 }, { label: 'Total (CAD)', width: 0.3, align: 'right' }], Object.entries(p.vehicle.byCategory).sort((a, c) => c[1] - a[1]).map(([k, v]) => [k, m(v)]));
  doc.para('The full mileage log is exported separately (PDF and CSV).');

  doc.h2('5. Capital assets and CCA (T2125 Area A, line 9936) - estimates');
  const ccaRows = [
    ...p.cca.vehicles.map(r => (r.undetermined ? [`Vehicle: ${assetName(r.a)}`, 'to verify', '', '', '', '', ''] : [`Vehicle: ${assetName(r.a)}`, r.c.cls, m(r.open), m(r.cca), `${num(r.pct)}%`, m(r.deductible), m(r.close)])),
    ...p.cca.equipment.map(r => (r.row ? [r.e.name, r.t.cls, m(r.row.open), m(r.row.cca), `${num(r.row.pct)}%`, m(r.row.deductible), m(r.row.close)] : [r.e.name, r.t.cls || 'to verify', '', '', '', '', ''])),
  ];
  doc.table([{ label: 'Asset', width: 0.28 }, { label: 'Class', width: 0.1 }, { label: 'Opening UCC', width: 0.15, align: 'right' }, { label: 'CCA', width: 0.13, align: 'right' }, { label: 'Bus. %', width: 0.08, align: 'right' }, { label: 'Deductible', width: 0.13, align: 'right' }, { label: 'Closing UCC', width: 0.13, align: 'right' }], ccaRows);
  doc.kv('Estimated deductible CCA - vehicles', m(p.cca.vehicleTotal));
  doc.kv('Estimated deductible CCA - equipment', m(p.cca.equipmentTotal));
  doc.para(`Classes are likely treatments; first-year amounts use the rule selected by the owner. CCA is ${p.cca.counted ? 'included' : 'not included'} in the net income estimate below.`);
  if (p.equipment.purchased.length) doc.table([{ label: `Equipment purchased in ${year}`, width: 0.4 }, { label: 'Date', width: 0.15 }, { label: 'Cost', width: 0.15, align: 'right' }, { label: 'Bus. %', width: 0.1, align: 'right' }, { label: 'Treatment', width: 0.2 }], p.equipment.purchased.map(r => [r.e.name, r.e.date, r.t.cost == null ? 'no rate' : m(r.t.cost), `${r.t.pct}%`, r.t.kind === 'capital' ? 'Capital / CCA' : r.t.kind === 'current' ? 'Current expense' : 'Personal']));

  doc.h2('6. Business-use-of-home (T2125 Part 7, line 9945)');
  doc.kv('Home-office expenses recorded (business part)', m(p.homeOffice.recorded));
  doc.kv('Owner indicates the conditions are met', p.homeOffice.qualifies ? 'Yes' : 'Not confirmed');
  doc.kv('Work space as % of home', p.homeOffice.pct ? `${p.homeOffice.pct}%` : 'not entered');
  if (p.homeOffice.calc.set) {
    const c = p.homeOffice.calc;
    doc.kv('Home office calculator: meets a CRA condition (as answered)', c.eligible ? 'Yes' : 'No');
    doc.kv('Home office calculator: total home costs', m(c.costs));
    doc.kv('Home office calculator: share of home', `${round2(c.share * 100)}%`);
    doc.kv('Home office calculator: potentially claimable', m(c.claim));
    doc.kv('Home office calculator: included in the estimate', c.counted > 0 ? m(c.counted) : 'No');
    if (c.carryForward > 0) doc.kv('Home office calculator: carried forward', m(c.carryForward));
  }

  doc.h2('7. GST/HST');
  doc.kv('Registered for GST/HST', p.gst.registered ? `Yes${p.gst.number ? ` - ${p.gst.number}` : ''}` : 'No');
  doc.kv('Revenue for the year (small-supplier threshold is $30,000)', m(p.gst.revenue));
  doc.kv('GST/HST recorded on expenses', m(p.gst.paidOnExpenses));
  doc.para('GST/HST returns are not prepared by this app. Whether services billed to a U.S. company are zero-rated, and whether registration is required, should be confirmed with an accountant.');

  doc.h2('8. Net income and tax estimate (planning only)');
  doc.kv('Gross business income', m(p.income.total));
  doc.kv('Estimated deductible expenses, vehicle, equipment and CCA', m(p.income.total - p.net));
  doc.kv('Estimated net business income', m(p.net), { bold: true });
  doc.kv('Estimated federal + provincial income tax', m(p.tax.incomeTax));
  doc.kv('Estimated CPP on self-employment', m(p.tax.cpp));
  doc.kv('Tax already paid (owner\'s entry)', m(p.tax.taxPaid));
  doc.kv('Estimated amount to set aside', m(p.tax.setAside), { bold: true });

  doc.h2('9. Documentation checklist');
  doc.table([{ label: 'Item', width: 0.55 }, { label: 'Status', width: 0.45 }], p.documentation.checklist.map(c => [c.label, c.ok ? 'OK' : `To do: ${c.problem}`]));
  if (p.documentation.review.length) {
    doc.h2('10. Items requiring review');
    doc.table([{ label: 'Item', width: 0.4 }, { label: 'CAD', width: 0.13, align: 'right' }, { label: 'Why', width: 0.47 }], p.documentation.review.map(r => [r.what, r.amount == null ? '' : m(r.amount), r.why.join('; ')]));
  }
  doc.h2('Notes');
  doc.para(p.notes || 'No notes entered.');
  doc.para(DISCLAIMER);
  return doc.build();
}

// ---- Excel -----------------------------------------------------------------

const csvRows = text => { // parse our own CSV back into rows for the workbook
  const rows = []; let row = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  row.push(cell); rows.push(row);
  return rows.map(r => r.map(v => (v !== '' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v)));
};

export function buildPackageXlsx(year = Y()) {
  const p = buildPackage(year);
  const summaryRows = [
    [`${year} Tax Year Package`], ['Prepared from the owner\'s records. Not a tax return; not filed with the CRA.'], [],
    ['Business', p.business.name || ''], ['Owner', p.business.owner || ''], ['Province', p.province], ['Prepared', p.prepared], ['Filing status', p.filing.status], [],
    ['INCOME'], ['Total business income (CAD)', p.income.total], ['Commission income', p.income.commission], ['Installation income', p.income.installation], ['Other income', p.income.other],
    ['USD received', p.income.usd], ['CAD equivalent of USD income', p.income.usdConverted], ['Income received in CAD', p.income.cadNative], [],
    ['EXPENSES (estimates)'], ['Business expenses recorded', p.expenses.business], ['Other deductible expenses (estimate)', p.expenses.otherEstimate],
    ['Vehicle expenses recorded', p.vehicle.total], ['Vehicle expenses, business portion (estimate)', p.vehicle.estimate],
    ['Equipment treated as current expense', p.equipment.current], ['CCA - vehicles (estimate)', p.cca.vehicleTotal], ['CCA - equipment (estimate)', p.cca.equipmentTotal],
    ['Home-office expenses recorded', p.homeOffice.recorded], ['Business-use-of-home, calculator (estimate)', p.homeOffice.calc.claim], ['Business-use-of-home counted in the estimate', p.homeOffice.calc.counted], [],
    ['MILEAGE'], ['Total kilometres', round2(p.vehicle.km.total)], ['Business kilometres', round2(p.vehicle.km.business)], ['Personal kilometres', round2(p.vehicle.km.personal)], ['Business-use %', round2(p.vehicle.km.pct * 100)], [],
    ['ESTIMATE'], ['Estimated net business income', p.net], ['Estimated income tax', p.tax.incomeTax], ['Estimated CPP', p.tax.cpp], ['Estimated amount to set aside', p.tax.setAside],
  ];
  const sheets = [
    { name: 'Summary', rows: summaryRows },
    { name: 'Income by month', rows: [['Month', 'Income (CAD)'], ...MONTHS.map((n, i) => [n, p.income.byMonth[i]]), [], ['Customer', 'Income (CAD)'], ...Object.entries(p.income.byCustomer).map(([k, v]) => [k, round2(v)])] },
    { name: 'T2125 expense lines', rows: [['T2125 line (verify)', 'Description', 'Paid (CAD)', 'Business part', 'Estimate', 'Records'], ...p.expenseLines.map(l => [l.line, l.label, round2(l.paid), round2(l.business), round2(l.estimate), l.count])] },
    { name: 'Review', rows: [['Checklist item', 'Status'], ...p.documentation.checklist.map(c => [c.label, c.ok ? 'OK' : `To do: ${c.problem}`]), [], ['Item requiring review', 'CAD', 'Why'], ...p.documentation.review.map(r => [r.what, r.amount, r.why.join('; ')])] },
    ...Object.entries(CSV).map(([, v]) => ({ name: v.label, rows: csvRows(v.build(year)) })),
  ];
  return buildXlsx(sheets);
}

// ---- screen ----------------------------------------------------------------

export function cra(root) {
  const p = buildPackage(Y());
  const st = state.settings;
  const line = (l, v, cls = '') => `<div class="line ${cls}"><span>${l}</span><span>${v}</span></div>`;
  const done = p.documentation.checklist.filter(c => c.ok).length;
  root.innerHTML = `
    ${head('CRA / Tax filing', '', `Tax year ${Y()} &middot; ${esc(p.province)}`)}
    <section class="panel notice">
      <h2>How filing works</h2>
      <p>This app <strong>cannot file your return and never connects to the CRA</strong>. The CRA accepts electronically filed personal returns only from <strong>NETFILE-certified tax software</strong> (or from an accountant using EFILE). It prepares your records so you can enter them into certified software or give them to your accountant.</p>
      <p class="muted">It will never ask for your CRA user ID or password, and nothing here signs in to or reads the CRA website. If the CRA offers an official way for apps like this to send data in future, it could be added to this section.</p>
    </section>
    <button class="quick-btn wide start" data-act="prepare">Prepare My ${Y()} Taxes</button>
    <p class="muted">Downloads the ${Y()} tax package: a PDF organised by T2125 section, an Excel workbook with every record, the mileage log PDF, and the CSV files.</p>
    <div class="btn-list">
      <button class="btn" data-act="pdf">Package PDF only</button>
      <button class="btn" data-act="xlsx">Excel workbook only</button>
      <button class="btn" data-act="mileage">Mileage log PDF</button>
      <button class="btn" data-act="csv">CSV files</button>
      <a class="btn" href="#/review">Year-end review</a>
    </div>
    <section class="panel">
      <h2>Filing status</h2>
      <div class="fields">
        <label class="f half"><span>Status for ${Y()}</span><select data-f="status">${FILING_STATUSES.map(x => `<option${x === p.filing.status ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
        <label class="f half"><span>Date filed (if filed)</span><input type="date" data-f="date" value="${esc(p.filing.date || '')}"></label>
        <label class="f"><span>Filed with / notes</span><input type="text" data-f="notes" value="${esc(p.filing.notes || '')}" placeholder="e.g. Accountant name, or which certified software"></label>
      </div>
      <p class="muted">For your own tracking only. The usual deadlines for self-employed individuals are June 15 to file and April 30 to pay any balance - confirm the dates for ${Y() + 1} with the CRA.</p>
    </section>
    <section class="panel">
      <h2>Business income</h2>
      ${line('Total business income (CAD)', money(p.income.total), 'total')}
      ${line('Commission income', money(p.income.commission))}
      ${line('Installation income', money(p.income.installation))}
      ${line('Other income', money(p.income.other))}
      <p class="muted">Reported on form T2125 as gross sales, commissions or fees.</p>
    </section>
    <section class="panel">
      <h2>Foreign / U.S. income</h2>
      ${line('USD received', money(p.income.usd, 'USD'))}
      ${line('CAD equivalent reported', money(p.income.usdConverted))}
      ${line('Exchange rates used', p.income.rateLow == null ? '—' : `${num(p.income.rateLow, 4)} to ${num(p.income.rateHigh, 4)}`)}
      ${p.income.unconverted ? `<p class="callout">${p.income.unconverted} USD payment(s) have no exchange rate and are not in the totals. <a href="#/income">Fix</a></p>` : ''}
      <p class="muted">Income is reported in Canadian dollars. Each payment uses the rate or CAD amount you recorded; the package lists every one. Keep any tax forms your U.S. payer sends you, and ask your accountant whether anything else applies to income from a U.S. company.</p>
    </section>
    <section class="panel">
      <h2>Business expenses by T2125 line</h2>
      ${p.expenseLines.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Line</th><th>Paid</th><th>Business part</th><th>Estimate</th></tr></thead>
        <tbody>${p.expenseLines.map(l => `<tr><td>${l.line} ${esc(l.label)}</td><td>${money(l.paid)}</td><td>${money(l.business)}</td><td>${money(l.estimate)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">No expenses recorded.</p>'}
      <p class="muted">Line numbers are for orientation - check them against the current T2125. Meals show the allowable part in the Estimate column.</p>
    </section>
    <section class="panel">
      <h2>Vehicle &amp; mileage</h2>
      ${line('Business / personal / total km', `${num(p.vehicle.km.business)} / ${num(p.vehicle.km.personal)} / ${num(p.vehicle.km.total)}`)}
      ${line('Business-use percentage', pct(p.vehicle.km.pct))}
      ${line('Vehicle expenses recorded', money(p.vehicle.total))}
      ${line('Estimated business portion (line 9281)', money(p.vehicle.estimate), 'total')}
    </section>
    <section class="panel">
      <h2>CCA and equipment</h2>
      ${line('Estimated CCA - vehicles', money(p.cca.vehicleTotal))}
      ${line('Estimated CCA - equipment', money(p.cca.equipmentTotal))}
      ${line(`Equipment purchased in ${Y()}`, money(p.equipment.purchasedTotal))}
      ${line('Low-cost equipment as current expense', money(p.equipment.current))}
      ${line('Home-office expenses recorded', `${money(p.homeOffice.recorded)} <small>${p.homeOffice.qualifies ? 'eligibility confirmed' : 'eligibility not confirmed'}</small>`)}
      ${p.homeOffice.calc.set ? line('Business-use-of-home (calculator)', `${p.homeOffice.calc.eligible ? money(p.homeOffice.calc.claim) : 'not eligible'} <small>${p.homeOffice.calc.counted > 0 ? 'included in the estimate' : 'not included'}</small>`) : ''}
      <p class="muted"><a href="#/assets">Vehicle assets</a> &middot; <a href="#/techreport">Equipment report</a></p>
    </section>
    <section class="panel">
      <h2>GST/HST</h2>
      <div class="fields">
        <label class="check f"><input type="checkbox" data-g="registered"${p.gst.registered ? ' checked' : ''}><span>I am registered for GST/HST</span></label>
        <label class="f"><span>GST/HST number (optional)</span><input type="text" data-g="number" value="${esc(p.gst.number)}"></label>
      </div>
      ${line(`Revenue ${Y()}`, money(p.gst.revenue))}
      ${line('GST/HST recorded on expenses', money(p.gst.paidOnExpenses))}
      ${p.gst.overThreshold && !p.gst.registered ? '<p class="callout">Your revenue is over $30,000. You generally must register once taxable revenue passes $30,000 in a calendar quarter or over four consecutive quarters. Ask your accountant how this applies to services billed to a U.S. company.</p>' : ''}
      <p class="muted">This app does not prepare GST/HST returns. To track the tax you pay, fill in "GST/HST included" on each expense.</p>
    </section>
    <section class="panel">
      <h2>Tax estimate</h2>
      ${line('Estimated net business income', money(p.net))}
      ${line('Estimated income tax + CPP', money(p.tax.total))}
      ${line('Estimated amount to set aside', money(p.tax.setAside), 'total strong')}
      <p class="muted"><a href="#/tax">Tax estimate and assumptions</a></p>
    </section>
    <section class="panel">
      <h2>Documentation checklist <span class="muted">${done} of ${p.documentation.checklist.length} ready</span></h2>
      <ul class="plain checklist">${p.documentation.checklist.map(c => `<li class="${c.ok ? 'ok' : 'todo'}"><strong>${c.ok ? 'OK' : 'To do'}</strong> ${esc(c.label)}${c.ok ? '' : ` &mdash; ${esc(c.problem)}`}</li>`).join('')}</ul>
      <p class="muted">${p.documentation.review.length} item(s) need review before filing. They are listed in the package. CRA generally expects records to be kept for six years.</p>
    </section>
    <section class="panel">
      <h2>Official resources</h2>
      <ul class="plain">${Object.entries(CRA_LINKS).map(([l, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${esc(l)}</a></li>`).join('')}</ul>
      <p class="muted">Checked ${fmtDate(CRA_CHECKED)}.</p>
    </section>
    <p class="disclaimer">${DISCLAIMER}</p>`;

  $$('[data-f]', root).forEach(el => el.addEventListener('change', async () => {
    const ys = yearSettings(Y());
    ys.filing = { ...(ys.filing || { status: 'Not started' }), [el.dataset.f]: el.value };
    await saveSettings();
  }));
  $$('[data-g]', root).forEach(el => el.addEventListener('change', async () => {
    st.gst = { ...(st.gst || {}), [el.dataset.g]: el.type === 'checkbox' ? el.checked : el.value.trim() };
    await saveSettings();
  }));
  root.onclick = async e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const pdf = () => download(`taxtrack-${Y()}-tax-package.pdf`, buildPackagePdf(Y()));
    const xlsx = () => download(`taxtrack-${Y()}-tax-package.xlsx`, buildPackageXlsx(Y()));
    if (act === 'pdf') pdf();
    if (act === 'xlsx') xlsx();
    if (act === 'mileage') exportMileagePdf(Y());
    if (act === 'csv') exportAllCsv(Y());
    if (act === 'prepare') {
      pdf();
      setTimeout(xlsx, 500);
      setTimeout(() => exportMileagePdf(Y()), 1000);
      setTimeout(() => exportAllCsv(Y()), 1500);
      const ys = yearSettings(Y());
      if (!ys.filing || ['Not started', 'Keeping records'].includes(ys.filing.status)) { ys.filing = { ...(ys.filing || {}), status: 'Package prepared' }; setTimeout(saveSettings, 6000); }
    }
  };
}

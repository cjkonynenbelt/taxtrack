// "Export for accountant": CSV files, the year-end PDF summary, and full backups.

import { state, all, customerName, exportAll, yearSettings } from './store.js';
import { summary, inYear, cadOf, expenseParts, reviewReasons, customerTotals, kmSummary, normVehicle, mileageWarnings } from './calc.js';
import { Pdf } from './pdf.js';
import { schedule, assetName } from './cca.js';
import { equipSchedule, equipFlags, earnsList } from './equip.js';
import { download, money, num, pct, MONTHS, today, fmtDate, round2 } from './util.js';

const cell = v => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (head, rows) => '﻿' + [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n');
const byDate = list => [...list].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
const yn = v => (v ? 'Yes' : 'No');

function expenseRows(year, group) {
  const km = summary(year).km;
  return byDate(inYear('expense', year).filter(e => e.group === group)).map(e => ({ e, p: expenseParts(e, km.pct) }));
}

export const CSV = {
  income: {
    label: 'Income',
    build(year) {
      return toCsv(
        ['Record ID', 'Date received', 'Status', 'Payer', 'Payment type', 'Customer', 'Amount', 'Currency', 'Exchange rate', 'Rate basis', 'CAD amount', 'Description', 'Notes', 'Has document', 'Source', 'Source record ID', 'Period'],
        byDate(inYear('income', year)).map(i => [i.id, i.date, i.status, i.payer, i.type, customerName(i.customerId), i.amount, i.currency,
          i.fxRate, i.currency === 'USD' ? (i.fxMethod === 'cad' ? 'Implied from CAD received' : 'Entered rate') : '', cadOf(i), i.description, i.notes, yn(i.receiptId), i.sourceType || 'manual', i.sourceId, i.period]));
    },
  },
  expenses: {
    label: 'Other business expenses',
    build(year) {
      return toCsv(
        ['Record ID', 'Date', 'Vendor', 'Category', 'Amount', 'Currency', 'Exchange rate', 'CAD amount', 'Classification', 'Business-use %', 'Business portion (CAD)', 'Counted in estimate (CAD)', 'Estimate note', 'GST/HST included', 'Business purpose', 'Customer', 'Has receipt', 'Review flags', 'Notes', 'Project', 'Receipt number', 'Scanned receipt'],
        expenseRows(year, 'other').map(({ e, p }) => [e.id, e.date, e.vendor, e.category, e.amount, e.currency, e.fxRate, p.cad, e.use,
          e.use === 'mixed' ? e.businessPct : e.use === 'business' ? 100 : 0, p.portion, p.est, p.note, e.tax, e.purpose, customerName(e.customerId), yn(e.receiptId), reviewReasons(e).join('; '), e.notes, e.project, e.scan ? e.scan.receiptNo : '', yn(e.scan)]));
    },
  },
  vehicle: {
    label: 'Vehicle expenses',
    build(year) {
      return toCsv(
        ['Record ID', 'Date', 'Vendor', 'Category', 'Vehicle', 'Amount', 'Currency', 'Exchange rate', 'CAD amount', 'Treatment', 'Estimated business portion (CAD)', 'Estimate note', 'GST/HST included', 'Purpose', 'Has receipt', 'Notes', 'Project', 'Receipt number', 'Scanned receipt'],
        expenseRows(year, 'vehicle').map(({ e, p }) => [e.id, e.date, e.vendor, e.category, e.vehicle, e.amount, e.currency, e.fxRate, p.cad,
          e.use === 'shared' ? 'Business-use % of km' : e.use === 'business' ? '100% business' : 'Personal', p.est, p.note, e.tax, e.purpose, yn(e.receiptId), e.notes, e.project, e.scan ? e.scan.receiptNo : '', yn(e.scan)]));
    },
  },
  mileage: {
    label: 'Mileage log',
    build(year) {
      const k = kmSummary(year);
      const blank = n => Array(n).fill('');
      return toCsv(
        ['Tax year', 'Vehicle', 'Date', 'Start time', 'End time', 'Minutes', 'Start location', 'Destination', 'Purpose', 'Business purpose', 'Customer', 'Starting odometer', 'Ending odometer', 'Kilometres', 'Business/personal', 'Distance from', 'Notes', 'Record ID', 'Source', 'Source record ID'],
        [
          ...byDate(inYear('trip', year)).map(t => [year, normVehicle(t.vehicle), t.date, t.startTime, t.endTime, t.durationMin, t.from, t.to, t.purpose, t.detail, customerName(t.customerId), t.odoStart, t.odoEnd, t.km, t.type === 'personal' ? 'Personal' : 'Business', t.distanceSource || 'manual', t.notes, t.id, t.sourceType || 'manual', t.sourceId]),
          [],
          ...k.vehicles.flatMap(v => [
            [year, v.name, ...blank(5), 'TOTAL KILOMETRES', v.totalSource, ...blank(4), round2(v.total)],
            [year, v.name, ...blank(5), 'TOTAL BUSINESS KILOMETRES', v.businessSource, ...blank(4), round2(v.business)],
            [year, v.name, ...blank(5), 'TOTAL PERSONAL KILOMETRES', '', ...blank(4), round2(v.personal)],
            [year, v.name, ...blank(5), 'BUSINESS-USE PERCENTAGE', '', ...blank(4), `${num(v.pct * 100, 1)}%`],
          ]),
          ...(k.vehicles.length > 1 ? [[year, 'ALL VEHICLES', ...blank(5), 'TOTAL / BUSINESS / PERSONAL KM', '', ...blank(4), `${round2(k.total)} / ${round2(k.business)} / ${round2(k.personal)}`], [year, 'ALL VEHICLES', ...blank(5), 'BUSINESS-USE PERCENTAGE', '', ...blank(4), `${num(k.pct * 100, 1)}%`]] : []),
        ]);
    },
  },
  customers: {
    label: 'Customers',
    build(year) {
      return toCsv(
        ['Record ID', 'Business name', 'Contact', 'Phone', 'Email', 'Address', 'Date signed', 'Installation date', 'Monthly commission', 'Commission currency', 'Installation payment', 'Installation currency', `Income received ${year} (CAD)`, `USD received ${year}`, 'Notes'],
        [...all('customer')].sort((a, b) => a.name.localeCompare(b.name)).map(c => {
          const t = customerTotals(c.id, year);
          return [c.id, c.name, c.contact, c.phone, c.email, c.address, c.dateSigned, c.installDate, c.monthlyCommission, c.monthlyCurrency, c.installPayment, c.installCurrency, t.cad.toFixed(2), t.usd.toFixed(2), c.notes];
        }));
    },
  },
  installations: {
    label: 'Installations',
    build(year) {
      return toCsv(
        ['Record ID', 'Date', 'Customer', 'Address', 'Payment amount', 'Currency', 'Payment received', 'Date received', 'CAD amount', 'Travel km', 'Linked income ID', 'Linked trip ID', 'Notes'],
        byDate(inYear('installation', year)).map(i => [i.id, i.date, customerName(i.customerId), i.address, i.amount, i.currency, yn(i.paid), i.paidDate, i.cadAmount, i.km, i.incomeId, i.tripId, i.notes]));
    },
  },
  equipment: {
    label: 'Equipment & technology',
    build(year) {
      const rows = [];
      for (const e of all('equip')) {
        const s = equipSchedule(e, Math.max(year, Number(String(e.date).slice(0, 4))));
        const t = s.t;
        const r = s.rows.find(x => x.year === year);
        rows.push([e.id, e.name, e.category, e.brand, e.vendor, e.date, e.condition, e.price, e.salesTax, e.currency, e.fxRate, t.cost, t.pct, t.cost == null ? '' : round2(t.cost * t.pct / 100),
          t.label, t.level, t.cls ? `Class ${t.cls}` : '', year, r ? r.open : '', r ? r.cca : '', r ? r.pct : '', r ? r.deductible : '', r ? r.close : '',
          [...earnsList(e), e.earnsText].filter(Boolean).join('; '), yn(e.receiptId), equipFlags(e).join('; '), e.notes]);
      }
      return toCsv(['Record ID', 'Item', 'Category', 'Brand/model', 'Vendor', 'Purchase date', 'New/used', 'Price', 'Sales tax', 'Currency', 'Exchange rate', 'Cost (CAD)', 'Business-use %', 'Business-use cost (CAD)',
        'Preliminary tax treatment', 'Confidence', 'CCA class (likely)', 'Tax year', 'Opening UCC', 'CCA / expense (estimate)', 'Business-use % that year', 'Deductible (estimate)', 'Closing UCC',
        'Business purpose', 'Has receipt', 'Items to discuss', 'Notes'], rows);
    },
  },
  assets: {
    label: 'Vehicle assets & CCA',
    build(year) {
      const rows = [];
      for (const a of all('asset')) {
        const s = schedule(a, year);
        const base = [a.id, a.status === 'potential' ? 'Potential (not purchased)' : 'Owned', assetName(a), a.vehicleType, a.condition, a.vin, a.purchaseDate, a.price, a.salesTax, s.c.capitalCost, s.c.cls ? `Class ${s.c.cls} (likely - verify)` : 'Not determined', a.businessPct, a.payment, a.loanAmount, a.businessPurpose];
        if (a.status === 'potential' || !s.rows.length) rows.push([...base, '', '', '', '', '', '', yn(a.receiptId), a.notes]);
        for (const r of s.rows) rows.push([...base, r.year, r.open, r.cca, r.pct, r.deductible, r.close, yn(a.receiptId), a.notes]);
      }
      return toCsv(['Record ID', 'Status', 'Vehicle', 'Type', 'New/used', 'VIN', 'Purchase date', 'Price', 'Sales tax', 'Capital cost for CCA', 'CCA class', 'Business-use % (default)', 'Payment', 'Loan amount', 'Business purpose', 'Tax year', 'Opening UCC', 'CCA (estimate)', 'Business-use % that year', 'Deductible CCA (estimate)', 'Closing UCC', 'Has purchase document', 'Notes'], rows);
    },
  },
};

export function exportCsv(key, year = state.settings.year) {
  download(`taxtrack-${year}-${key}.csv`, CSV[key].build(year), 'text/csv;charset=utf-8');
}

export function exportAllCsv(year = state.settings.year) {
  Object.keys(CSV).forEach((k, i) => setTimeout(() => exportCsv(k, year), i * 400));
}

export async function exportBackup() {
  const data = await exportAll();
  download(`taxtrack-backup-${today()}.json`, JSON.stringify(data), 'application/json');
  state.settings.lastBackup = new Date().toISOString();
  return data;
}

// ---- year-end PDF ----------------------------------------------------------

export function buildPdf(year = state.settings.year) {
  const s = summary(year);
  const b = state.settings.business;
  const t = s.tax;
  const $ = v => money(v);
  const doc = new Pdf({ footer: `${b.name || b.owner || 'Business'} - ${year} summary - estimates only, not a tax filing` });

  doc.title(`${year} Year-End Business Summary`, [b.name, b.owner, b.number && `BN ${b.number}`, `Prepared ${fmtDate(today())}`].filter(Boolean).join('  |  '));
  doc.para('Record-keeping summary prepared from the owner\'s own entries. All tax figures are estimates for planning only and are not a CRA calculation. Deductibility of each item is to be determined by a qualified tax professional under current CRA rules.');

  doc.h2('Overview');
  doc.kv('Total income received (CAD)', $(s.income.cad), { bold: true });
  doc.kv('Recorded business expenses (before limits)', $(s.exp.businessTotal));
  doc.kv('Estimated deductible vehicle expenses', $(s.exp.vehicleEst));
  doc.kv('Estimated other deductible expenses', $(s.exp.otherEst));
  doc.kv('Estimated net business income', $(s.net), { bold: true });
  doc.kv('Estimated amount to set aside (income tax + CPP, less tax paid)', $(t.setAside), { bold: true });

  doc.h2('Income');
  doc.kv('USD income received', money(s.income.usd, 'USD'));
  doc.kv('  CAD equivalent of USD income (rates as recorded per payment)', $(s.income.usdConverted));
  doc.kv('Income received in CAD', $(s.income.cadNative));
  if (s.income.unconverted) doc.para(`Note: ${s.income.unconverted} USD payment(s) have no exchange rate recorded and are NOT included in CAD totals.`);
  if (s.income.pending.length) doc.para(`Note: ${s.income.pending.length} payment(s) are recorded as pending and are not included in income.`);
  doc.gap(4);
  doc.table([{ label: 'Income by category', width: 0.7 }, { label: 'CAD', width: 0.3, align: 'right' }],
    Object.entries(s.income.byType).sort((a, c) => c[1] - a[1]).map(([k, v]) => [k, $(v)]));
  doc.table([{ label: 'Month', width: 0.4 }, { label: 'Income (CAD)', width: 0.3, align: 'right' }, { label: 'Est. deductible expenses', width: 0.3, align: 'right' }],
    MONTHS.map((m, i) => [m, $(s.income.byMonth[i]), $(s.exp.byMonth[i])]));

  doc.h2('Vehicle');
  doc.kv(`Total kilometres (${s.km.totalSource})`, `${num(s.km.total)} km`);
  doc.kv(`Business kilometres (${s.km.businessSource})`, `${num(s.km.business)} km`);
  doc.kv('Business-use percentage', pct(s.km.pct));
  const ys = yearSettings(year);
  if (ys.odoStart != null || ys.odoEnd != null) doc.kv('Odometer at start / end of year', `${num(ys.odoStart)} / ${num(ys.odoEnd)}`);
  doc.kv('Total vehicle expenses recorded', $(s.exp.vehicleTotal));
  doc.kv('Estimated business-use portion', $(s.exp.vehicleEst), { bold: true });
  if (s.km.totalIsWeak) doc.para('Note: total kilometres for the year were not entered, so the business-use percentage is based on logged trips only and is likely overstated.');
  doc.gap(4);
  doc.table([{ label: 'Vehicle expense category', width: 0.7 }, { label: 'Total (CAD)', width: 0.3, align: 'right' }],
    Object.entries(s.exp.vehicleByCategory).sort((a, c) => c[1] - a[1]).map(([k, v]) => [k, $(v)]));

  if (s.cca.rows.length) {
    doc.h2('Vehicle capital assets and CCA (estimates)');
    doc.table([{ label: 'Vehicle', width: 0.28 }, { label: 'Class (likely)', width: 0.14 }, { label: 'Opening UCC', width: 0.15, align: 'right' }, { label: 'CCA', width: 0.13, align: 'right' }, { label: 'Bus. %', width: 0.08, align: 'right' }, { label: 'Deductible', width: 0.11, align: 'right' }, { label: 'Closing UCC', width: 0.11, align: 'right' }],
      s.cca.rows.map(r => r.undetermined
        ? [assetName(r.a), 'Not determined', '', '', '', '', '']
        : [assetName(r.a), `Class ${r.c.cls}`, $(r.open), $(r.cca), `${num(r.pct)}%`, $(r.deductible), $(r.close)]));
    doc.para(`Estimated deductible CCA ${year}: ${$(s.cca.deductible)} (${state.settings.includeCca === false ? 'not included' : 'included'} in estimated net business income). CCA class is a likely treatment from CRA's vehicle definitions chart and the first-year rule is the owner's selection; both to be confirmed.`);
  }

  if (s.equip.rows.length) {
    doc.h2('Equipment and technology (estimates)');
    doc.table([{ label: 'Item', width: 0.24 }, { label: 'Bought', width: 0.11 }, { label: 'Cost', width: 0.12, align: 'right' }, { label: 'Bus. %', width: 0.07, align: 'right' }, { label: 'Treatment (likely)', width: 0.24 }, { label: `Deductible ${year}`, width: 0.11, align: 'right' }, { label: 'Closing UCC', width: 0.11, align: 'right' }],
      s.equip.rows.filter(r => String(r.e.date).slice(0, 4) <= String(year)).map(r => [r.e.name, r.e.date, r.t.cost == null ? 'no rate' : $(r.t.cost), `%`, r.t.kind === 'capital' ? (r.t.cls ? `CCA Class ${r.t.cls}` : 'CCA - class to verify') : r.t.kind === 'current' ? 'Current expense' : 'Personal', r.row ? $(r.row.deductible) : '', r.row && !r.row.current ? $(r.row.close) : '']));
    doc.para(`Current expenses (business share): ${$(s.equip.current)}. Potential CCA (business share): ${$(s.equip.cca)}. Treatments and classes are likely treatments to be confirmed; low-cost items are treated as current expenses using the owner's working threshold, not a CRA rule.`);
    const disc = s.equip.rows.filter(r => r.flags.length && String(r.e.date).slice(0, 4) <= String(year));
    if (disc.length) doc.table([{ label: 'Equipment items to discuss', width: 0.3 }, { label: 'Why', width: 0.7 }], disc.map(r => [r.e.name, r.flags.join('; ')]));
  }

  doc.h2('Other business expenses by category');
  doc.table([{ label: 'Category', width: 0.4 }, { label: 'Total paid', width: 0.2, align: 'right' }, { label: 'Business portion', width: 0.2, align: 'right' }, { label: 'In estimate', width: 0.2, align: 'right' }],
    Object.entries(s.exp.byCategory).sort((a, c) => c[1].total - a[1].total).map(([k, v]) => [k, $(v.total), $(v.portion), $(v.est)]));
  doc.para(`Estimate treatment: meals & entertainment counted at ${state.settings.mealsPct}%; equipment ${state.settings.includeEquipment ? 'included as an expense' : 'excluded (capital - CCA to be determined)'}; home office ${state.settings.homeOffice.qualifies ? 'included (owner indicates conditions are met)' : 'excluded (eligibility not confirmed)'}.`);

  doc.h2('Tax estimate (not an official calculation)');
  doc.kv('Gross business income', $(s.income.cad));
  doc.kv('Estimated deductible business expenses', $(s.exp.est));
  if (s.cca.rows.length) doc.kv('Estimated vehicle CCA counted (business share)', $(s.cca.counted));
  if (s.equip.rows.length) doc.kv('Estimated equipment and technology counted', $(s.equip.counted));
  doc.kv('Estimated net business income', $(s.net), { bold: true });
  doc.kv('Other employment income (assumption)', $(t.assumptions.otherEmployment || 0));
  doc.kv('Other taxable income (assumption)', $(t.assumptions.otherIncome || 0));
  doc.kv('Other deductions (assumption)', $(t.assumptions.extraDeductions || 0));
  doc.kv('Estimated federal income tax', $(t.federal));
  doc.kv(`Estimated provincial income tax (${t.provinceName})`, t.provinceMissing ? 'not modelled' : $(t.provincial));
  doc.kv('Estimated CPP contributions (self-employed)', $(t.cpp));
  doc.kv('Tax already paid (assumption)', $(t.taxPaid));
  doc.kv('Estimated amount to set aside', $(t.setAside), { bold: true });
  doc.para(`Rate table used: ${t.usedYear}${t.custom ? ' (custom values entered by owner)' : ''}. This tool provides estimates and record-keeping assistance only. It is not tax, legal, or accounting advice. Actual tax treatment depends on your circumstances and applicable CRA rules. Consult a qualified Canadian tax professional for filing advice.`);

  const flagged = s.exp.items.map(x => ({ ...x, reasons: reviewReasons(x.e) })).filter(x => x.reasons.length);
  if (flagged.length) {
    doc.h2('Expenses to review with accountant');
    doc.table([{ label: 'Date', width: 0.12 }, { label: 'Vendor / category', width: 0.3 }, { label: 'CAD', width: 0.13, align: 'right' }, { label: 'Why', width: 0.45 }],
      flagged.sort((a, c) => a.e.date.localeCompare(c.e.date)).map(x => [x.e.date, `${x.e.vendor || '-'} (${x.e.category})`, x.cad == null ? 'no rate' : $(x.cad), x.reasons.join('; ')]));
  }

  doc.h2('Customers / businesses');
  doc.table([{ label: 'Business', width: 0.34 }, { label: 'Signed', width: 0.14 }, { label: 'Installed', width: 0.14 }, { label: 'Monthly', width: 0.13, align: 'right' }, { label: `${year} income (CAD)`, width: 0.25, align: 'right' }],
    [...all('customer')].sort((a, c) => a.name.localeCompare(c.name)).map(c => [c.name, c.dateSigned || '', c.installDate || '', c.monthlyCommission ? money(c.monthlyCommission, c.monthlyCurrency, 0) : '', $(customerTotals(c.id, year).cad)]));

  doc.h2('Notes');
  doc.para(ys.notes || 'No notes entered for this year.');
  doc.para('Supporting detail (every income, expense, mileage and customer record with its unique record ID) is provided in the accompanying CSV files. Receipts are stored with the owner.');
  return doc.build();
}

// ---- mileage log PDF -------------------------------------------------------

export function buildMileagePdf(year = state.settings.year) {
  const k = kmSummary(year);
  const b = state.settings.business;
  const doc = new Pdf({ footer: `${b.name || b.owner || 'Business'} - ${year} mileage log` });
  doc.title(`${year} Mileage Log`, [b.name, b.owner, `Prepared ${fmtDate(today())}`].filter(Boolean).join('  |  '));
  doc.para('Vehicle log kept by the owner. Distances are from odometer readings where shown; otherwise as entered by the owner or measured by GPS (see the CSV export for the source of each distance).');
  for (const v of k.vehicles) {
    if (!v.trips.length && !v.total) continue;
    doc.h2(`${v.name}${v.role ? ` - ${v.role}` : ''}`);
    doc.table(
      [{ label: 'Date', width: 0.1 }, { label: 'Route', width: 0.24 }, { label: 'Purpose / notes', width: 0.27 }, { label: 'Customer', width: 0.14 }, { label: 'Odometer', width: 0.11 }, { label: 'KM', width: 0.07, align: 'right' }, { label: 'Type', width: 0.07 }],
      byDate(v.trips).map(t => [t.date, `${t.from || '?'} -> ${t.to}`, [t.purpose, t.detail, t.notes].filter(Boolean).join('. '), customerName(t.customerId), t.odoStart != null && t.odoEnd != null ? `${t.odoStart} - ${t.odoEnd}` : '', num(t.km, t.km % 1 ? 1 : 0), t.type === 'personal' ? 'Personal' : 'Business']));
    if (v.odoStart != null || v.odoEnd != null) doc.kv('Odometer at start of year / latest', `${num(v.odoStart)} / ${num(v.odoEnd)}`);
    doc.kv(`Total kilometres (${v.totalSource})`, `${num(v.total)} km`, { bold: true });
    doc.kv(`Total business kilometres (${v.businessSource})`, `${num(v.business)} km`, { bold: true });
    doc.kv('Total personal kilometres', `${num(v.personal)} km`);
    doc.kv('Business-use percentage', pct(v.pct), { bold: true });
    if (v.totalIsWeak) doc.para('Total kilometres were not taken from odometer readings for this vehicle; the total reflects logged trips only.');
  }
  if (k.vehicles.length > 1) {
    doc.h2('All vehicles');
    doc.kv('Total kilometres', `${num(k.total)} km`);
    doc.kv('Total business kilometres', `${num(k.business)} km`);
    doc.kv('Total personal kilometres', `${num(k.personal)} km`);
    doc.kv('Business-use percentage', pct(k.pct));
  }
  const w = mileageWarnings(year);
  if (w.length) { doc.h2('Record checks'); for (const x of w) doc.para(`- ${x}`); }
  return doc.build();
}

export function exportMileagePdf(year = state.settings.year) {
  download(`taxtrack-${year}-mileage-log.pdf`, buildMileagePdf(year));
}

export function exportPdf(year = state.settings.year) {
  download(`taxtrack-${year}-year-end-summary.pdf`, buildPdf(year));
}

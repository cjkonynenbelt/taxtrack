// All totals and estimates. Pure functions over the store - nothing is saved here.

import { state, all, yearSettings, customerName, expectedPayments } from './store.js';
import { CATEGORIES, LARGE_PURCHASE } from './reference.js';
import { ratesFor, PROVINCES } from './tax-rates.js';
import { schedule, purchaseYear } from './cca.js';
import { yearOf, monthOf, round2, sum } from './util.js';

export const inYear = (kind, year) => all(kind).filter(r => yearOf(r.date) === year);

// CAD value of a record, or null when it is USD with no rate/CAD amount recorded.
export function cadOf(r) {
  if (r.currency !== 'USD') return Number(r.amount) || 0;
  return r.cadAmount != null ? Number(r.cadAmount) : null;
}

// ---- kilometres ------------------------------------------------------------

export function kmSummary(year) {
  const ys = yearSettings(year);
  const trips = inYear('trip', year);
  const loggedBiz = sum(trips.filter(t => t.type !== 'personal'), t => t.km);
  const loggedPersonal = sum(trips.filter(t => t.type === 'personal'), t => t.km);
  const business = ys.bizKmOverride != null ? ys.bizKmOverride : loggedBiz;
  let total, totalSource;
  if (ys.totalKm != null) { total = ys.totalKm; totalSource = 'entered in Settings'; }
  else if (ys.odoStart != null && ys.odoEnd != null && ys.odoEnd > ys.odoStart) { total = ys.odoEnd - ys.odoStart; totalSource = 'year-start/end odometer'; }
  else { total = loggedBiz + loggedPersonal; totalSource = 'logged trips only'; }
  const pct = total > 0 ? Math.min(1, business / total) : 0;
  return {
    loggedBiz, loggedPersonal, business, total, totalSource, pct,
    personal: Math.max(0, total - business),
    businessSource: ys.bizKmOverride != null ? 'entered in Settings' : 'trip log',
    totalIsWeak: ys.totalKm == null && !(ys.odoStart != null && ys.odoEnd != null),
  };
}

// ---- expenses --------------------------------------------------------------

// For one expense: CAD amount, business portion, and the amount counted in the estimate.
export function expenseParts(e, kmPct) {
  const s = state.settings;
  const cad = cadOf(e);
  const base = cad || 0;
  let portion, est, note = '';
  if (e.group === 'vehicle') {
    if (e.use === 'personal') { portion = 0; note = 'Personal'; }
    else if (e.use === 'business') { portion = base; note = '100% business'; }
    else { portion = base * kmPct; note = `Business-use ${Math.round(kmPct * 1000) / 10}%`; }
    est = portion;
  } else {
    const p = e.use === 'personal' ? 0 : e.use === 'mixed' ? Math.min(100, Math.max(0, Number(e.businessPct) || 0)) : 100;
    portion = base * p / 100;
    est = portion;
    note = e.use === 'personal' ? 'Personal' : `${p}% business`;
    const info = CATEGORIES[e.category] || {};
    if (info.meals) { est = portion * (s.mealsPct / 100); note += `, ${s.mealsPct}% meals limit`; }
    if (info.capital && !s.includeEquipment) { est = 0; note += ', capital item - not in estimate'; }
    if (info.home && !s.homeOffice.qualifies) { est = 0; note += ', home office not confirmed - not in estimate'; }
  }
  return { cad, portion: round2(portion), est: round2(est), note };
}

// Reasons an expense should be discussed with an accountant.
export function reviewReasons(e) {
  const out = [];
  const info = CATEGORIES[e.category] || {};
  if (e.use === 'personal') return out;
  if (e.currency === 'USD' && e.cadAmount == null) out.push('USD amount with no exchange rate or CAD amount recorded');
  if (e.use === 'mixed') out.push(`Mixed use - ${e.businessPct || 0}% business claimed`);
  if (e.group === 'other' && info.review) out.push(info.review);
  if ((cadOf(e) || 0) >= LARGE_PURCHASE && !info.capital) out.push(`Large purchase (${LARGE_PURCHASE}+) - may be a capital item`);
  if (!e.receiptId) out.push('No receipt attached');
  return out;
}

// ---- vehicle capital cost allowance ----------------------------------------

// Estimated CCA for owned vehicle assets in a year. `counted` is what goes
// into the net-income estimate (zero when switched off in Settings).
export function ccaSummary(year) {
  const rows = [];
  for (const a of all('asset')) {
    if (a.status === 'potential') continue;
    const s = schedule(a, year);
    const r = s.rows.find(x => x.year === year);
    if (r) rows.push({ a, c: s.c, ...r });
    else if (!s.c.cls && purchaseYear(a) && purchaseYear(a) <= year) rows.push({ a, c: s.c, undetermined: true, deductible: 0, cca: 0 });
  }
  const deductible = round2(sum(rows, r => r.deductible));
  return { rows, deductible, counted: state.settings.includeCca === false ? 0 : deductible, undetermined: rows.filter(r => r.undetermined).length };
}

// ---- year summary ----------------------------------------------------------

export function summary(year = state.settings.year) {
  const km = kmSummary(year);
  const incomeAll = inYear('income', year);
  const received = incomeAll.filter(i => i.status === 'received');
  const inc = {
    cad: 0, usd: 0, usdConverted: 0, cadNative: 0, unconverted: 0,
    byType: {}, byMonth: Array(12).fill(0), byCustomer: {},
    pending: incomeAll.filter(i => i.status !== 'received'),
    count: received.length,
  };
  for (const i of received) {
    const cad = cadOf(i);
    if (i.currency === 'USD') { inc.usd += Number(i.amount) || 0; if (cad == null) inc.unconverted++; else inc.usdConverted += cad; }
    else inc.cadNative += cad;
    const c = cad || 0;
    inc.cad += c;
    inc.byType[i.type] = (inc.byType[i.type] || 0) + c;
    inc.byMonth[monthOf(i.date) - 1] += c;
    const who = customerName(i.customerId) || i.payer || 'Unassigned';
    inc.byCustomer[who] = (inc.byCustomer[who] || 0) + c;
  }

  const exp = {
    vehicleTotal: 0, vehicleEst: 0, otherTotal: 0, otherPortion: 0, otherEst: 0,
    capitalTotal: 0, homeTotal: 0, personalTotal: 0,
    byCategory: {}, vehicleByCategory: {}, byMonth: Array(12).fill(0), items: [],
  };
  for (const e of inYear('expense', year)) {
    const p = expenseParts(e, km.pct);
    exp.items.push({ e, ...p });
    if (e.use === 'personal') { exp.personalTotal += p.cad || 0; continue; }
    const info = CATEGORIES[e.category] || {};
    if (e.group === 'vehicle') {
      exp.vehicleTotal += p.cad || 0;
      exp.vehicleEst += p.est;
      exp.vehicleByCategory[e.category] = (exp.vehicleByCategory[e.category] || 0) + (p.cad || 0);
    } else {
      exp.otherTotal += p.cad || 0;
      exp.otherPortion += p.portion;
      exp.otherEst += p.est;
      if (info.capital) exp.capitalTotal += p.portion;
      if (info.home) exp.homeTotal += p.portion;
      const row = exp.byCategory[e.category] || (exp.byCategory[e.category] = { total: 0, portion: 0, est: 0 });
      row.total += p.cad || 0; row.portion += p.portion; row.est += p.est;
    }
    exp.byMonth[monthOf(e.date) - 1] += p.est;
  }
  exp.businessTotal = exp.vehicleTotal + exp.otherPortion; // recorded business expenses before limits
  exp.est = exp.vehicleEst + exp.otherEst;

  const cca = ccaSummary(year);
  const net = inc.cad - exp.est - cca.counted;
  return { year, km, income: inc, exp, cca, net, tax: taxEstimate(year, net), expected: expectedPayments(year) };
}

// ---- month view ------------------------------------------------------------

export function monthSummary(year, m /* 1-12 */, kmPct) {
  const income = inYear('income', year).filter(i => monthOf(i.date) === m);
  const received = income.filter(i => i.status === 'received');
  const isResidual = i => i.type === 'Monthly residual/commission';
  const isInstall = i => i.type === 'Installation payment';
  const usd = fn => sum(received.filter(i => i.currency === 'USD' && fn(i)), i => i.amount);
  const cad = fn => sum(received.filter(fn), i => cadOf(i) || 0);
  const expenses = inYear('expense', year).filter(e => monthOf(e.date) === m);
  const expEst = sum(expenses, e => expenseParts(e, kmPct).est);
  const totalCad = cad(() => true);
  return {
    income, expenses,
    trips: inYear('trip', year).filter(t => monthOf(t.date) === m),
    residualUsd: usd(isResidual), installUsd: usd(isInstall), otherUsd: usd(i => !isResidual(i) && !isInstall(i)),
    residualCad: cad(isResidual), installCad: cad(isInstall), otherCad: cad(i => !isResidual(i) && !isInstall(i)),
    totalUsd: usd(() => true), totalCad, expEst, net: totalCad - expEst,
  };
}

// ---- tax estimate ----------------------------------------------------------

function bracketTax(income, brackets) {
  let tax = 0, lower = 0;
  for (const [upper, rate] of brackets) {
    const top = upper == null ? Infinity : upper;
    if (income > lower) tax += (Math.min(income, top) - lower) * rate;
    lower = top;
  }
  return tax;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// An ESTIMATE of income tax + CPP on self-employment income. Simplified on
// purpose: it ignores most credits, provincial surtaxes/premiums and anything
// else specific to the person. Never present the output as a CRA calculation.
export function taxEstimate(year, netBusiness) {
  const s = state.settings;
  const a = yearSettings(year).tax;
  const { table, usedYear, custom } = ratesFor(year, s.rateOverrides);
  const net = Math.max(0, netBusiness);
  const n = v => Number(v) || 0;

  // CPP on self-employed earnings (both halves), after any employment earnings already covered.
  const c = table.cpp;
  const E = n(a.cppEmploymentEarnings);
  let cpp1 = 0, cpp2 = 0;
  if (a.includeCpp && s.province !== 'QC') {
    const baseSelf = Math.max(0, Math.min(c.ympe, E + net) - Math.max(Math.min(c.ympe, E), c.exemption));
    cpp1 = baseSelf * c.rate * 2;
    cpp2 = Math.max(0, clamp(E + net, c.ympe, c.yampe) - clamp(E, c.ympe, c.yampe)) * c.cpp2Rate * 2;
  }
  // Deduction: the "employer" half, the enhanced part of the "employee" half, and all of CPP2's employee half.
  const half1 = cpp1 / 2;
  const cppDeduction = half1 + half1 * ((c.rate - c.baseRate) / c.rate) + cpp2;
  const cppCreditBase = half1 * (c.baseRate / c.rate);

  const totalIncome = net + n(a.otherEmployment) + n(a.otherIncome);
  const taxable = Math.max(0, totalIncome - n(a.extraDeductions) - cppDeduction);

  const f = table.federal;
  let bpa = f.bpa.max;
  if (taxable > f.bpa.start) bpa = f.bpa.max - (f.bpa.max - f.bpa.min) * Math.min(1, (taxable - f.bpa.start) / (f.bpa.end - f.bpa.start));
  const federal = Math.max(0, bracketTax(taxable, f.brackets) - f.brackets[0][1] * (bpa + cppCreditBase));

  const p = table.provinces[s.province];
  const provincial = p ? Math.max(0, bracketTax(taxable, p.brackets) - p.brackets[0][1] * (p.bpa + cppCreditBase)) : 0;

  const incomeTax = federal + provincial;
  const cpp = cpp1 + cpp2;
  const total = incomeTax + cpp;
  const setAside = Math.max(0, total - n(a.taxPaid));
  return {
    year, usedYear, custom, province: s.province, provinceName: PROVINCES[s.province],
    provinceMissing: !p, provinceNote: p && p.note,
    net, totalIncome, taxable, cppDeduction: round2(cppDeduction),
    federal: round2(federal), provincial: round2(provincial), incomeTax: round2(incomeTax),
    cpp1: round2(cpp1), cpp2: round2(cpp2), cpp: round2(cpp), total: round2(total),
    taxPaid: n(a.taxPaid), setAside: round2(setAside),
    assumptions: a,
  };
}

// ---- per-customer totals ---------------------------------------------------

export function customerTotals(id, year) {
  const income = inYear('income', year).filter(i => i.customerId === id);
  const received = income.filter(i => i.status === 'received');
  return {
    income,
    cad: sum(received, i => cadOf(i) || 0),
    usd: sum(received.filter(i => i.currency === 'USD'), i => i.amount),
    km: sum(inYear('trip', year).filter(t => t.customerId === id && t.type !== 'personal'), t => t.km),
  };
}

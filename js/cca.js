// Vehicle capital assets: likely CCA class, CCA schedule, cost forecast and the
// "Can I deduct this?" assessment. Pure functions - nothing is saved here.
//
// RULES ARE DATA. When CRA changes a rate or limit, edit CCA_RULES below and
// update `checked`. Nothing here is a ruling: classification is a "likely
// treatment" derived from CRA's published vehicle definitions chart.
//
// Sources (Government of Canada), checked 2026-10-01:
//  - Vehicle definitions chart: .../business-expenses/motor-vehicle-expenses/type-vehicle.html (modified 2026-08-31)
//  - CCA classes, limits, personal use: guide T4002 chapter 4 (Rev. 25)

import { round2 } from './util.js';

const CRA = 'https://www.canada.ca/en/revenue-agency/services';
export const CCA_RULES = {
  checked: '2026-10-01',
  sources: {
    'CRA: Type of vehicle (definitions chart)': `${CRA}/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses/motor-vehicle-expenses/type-vehicle.html`,
    'CRA: Claiming capital cost allowance': `${CRA}/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/claiming-capital-cost-allowance.html`,
    'CRA: Motor vehicle expenses': `${CRA}/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses/motor-vehicle-expenses.html`,
    'CRA guide T4002': `${CRA}/forms-publications/publications/t4002.html`,
  },
  classes: {
    '10': { rate: 0.30, label: 'Class 10 (30%)' },
    '10.1': { rate: 0.30, label: 'Class 10.1 (30%) - passenger vehicle over the cost limit' },
    '54': { rate: 0.30, label: 'Class 54 (30%) - zero-emission vehicle' },
  },
  // Passenger-vehicle capital cost limit before sales tax, by year acquired.
  // Add each new year when Finance/CRA announce it.
  passengerLimit: { 2024: 37000, 2025: 38000 },
  zevLimit: 61000,
  // Share of a full year's CCA allowed in the year of purchase.
  //   half - the standard half-year rule (confirmed, and the cautious default)
  //   full - half-year rule suspended under the accelerated investment incentive (verify it applies)
  firstYear: { half: 0.5, full: 1 },
};

export const VEHICLE_TYPES = ['Car / sedan / wagon', 'Pickup truck', 'SUV', 'Van / minivan'];
export const PURPOSES = [
  ['p_sales', 'Sales calls'], ['p_install', 'Customer installations'], ['p_prospect', 'Prospecting'],
  ['p_deliver', 'Delivering equipment'], ['p_travel', 'Business travel'], ['p_personal', 'Personal use'],
];
export const UNSURE = 'This vehicle may qualify for a different CCA treatment depending on its classification and use. Verify the classification with CRA or your accountant.';

const n = v => Number(v) || 0;
export const assetName = a => [a.year, a.make, a.model].filter(Boolean).join(' ') || a.vehicleType || 'Vehicle';
export const purchaseYear = a => Number(String(a.purchaseDate || '').slice(0, 4)) || null;
export const businessPurposes = a => PURPOSES.filter(([k]) => k !== 'p_personal' && a[k]).map(([, l]) => l);

export function passengerLimit(year) {
  const known = Object.keys(CCA_RULES.passengerLimit).map(Number).sort((x, y) => x - y);
  if (CCA_RULES.passengerLimit[year]) return { limit: CCA_RULES.passengerLimit[year], year, assumed: false };
  const used = known.filter(y => y <= year).pop() || known[0];
  return { limit: CCA_RULES.passengerLimit[used], year: used, assumed: true };
}

// Likely CCA class from CRA's vehicle definitions chart. Returns cls = null
// (never a guess) when the answers needed by the chart are missing.
export function classify(a) {
  const pct = n(a.businessPct);
  const type = a.vehicleType;
  const reasons = [];
  const verify = [];
  let kind = null;

  if (type === 'Car / sedan / wagon') {
    kind = 'passenger';
    reasons.push('Cars, sedans, wagons and sports cars are passenger vehicles on CRA\'s chart at any business-use percentage.');
  } else if (type && a.seating && a.seating !== 'unsure' && a.hauling && a.hauling !== 'unsure') {
    const small = a.seating === '1-3';
    const need = small ? 'more than 50%' : '90% or more';
    const meets = small ? pct > 50 : pct >= 90;
    if (a.hauling === 'yes' && meets && type !== 'SUV' || a.hauling === 'yes' && meets && type === 'SUV' && !small) {
      kind = 'motor';
      reasons.push(`${type} seating ${a.seating}, used ${need} of the time in the year bought to transport goods or equipment${small ? '' : ' (or passengers)'} for business: a "motor vehicle" on CRA's chart, not a passenger vehicle.`);
    } else {
      kind = 'passenger';
      reasons.push(a.hauling !== 'yes'
        ? `${type} not used mainly to transport goods or equipment: a passenger vehicle on CRA's chart.`
        : `${type} seating ${a.seating} needs business use of ${need} transporting goods or equipment to be a "motor vehicle"; at ${pct}% it is a passenger vehicle.`);
    }
    verify.push('The chart test is based on actual use in the year the vehicle is bought - keep a mileage log that shows it.');
  }

  const price = n(a.price);
  const tax = n(a.salesTax);
  const taxRate = price > 0 ? tax / price : 0;
  const fullCost = price + tax;
  const out = { kind, cls: null, rate: null, reasons, verify, fullCost, capitalCost: fullCost, capped: false, limit: null };
  if (!kind) { verify.push(UNSURE); return out; }

  if (a.zev && a.condition === 'new') {
    out.cls = '54';
    const cap = CCA_RULES.zevLimit * (1 + taxRate);
    if (fullCost > cap) { out.capitalCost = cap; out.capped = true; out.limit = CCA_RULES.zevLimit; }
    reasons.push('New zero-emission vehicle: may be included in Class 54, which has its own cost limit and first-year rules.');
    verify.push('Zero-emission vehicle eligibility and the enhanced first-year allowance have detailed conditions and proposed changes - confirm with your accountant.');
  } else if (kind === 'motor') {
    out.cls = '10';
    reasons.push('Motor vehicles that are not passenger vehicles go in Class 10 with no cost limit.');
  } else {
    const yr = purchaseYear(a) || new Date().getFullYear();
    const lim = passengerLimit(yr);
    out.limit = lim.limit;
    if (price > lim.limit) {
      out.cls = '10.1';
      out.capitalCost = lim.limit * (1 + taxRate);
      out.capped = true;
      reasons.push(`Passenger vehicle costing more than the ${lim.limit.toLocaleString('en-CA')} limit (before sales tax): Class 10.1, and CCA is calculated on the limit, not the price paid.`);
    } else {
      out.cls = '10';
      reasons.push(`Passenger vehicle costing no more than the ${lim.limit.toLocaleString('en-CA')} limit (before sales tax): Class 10.`);
    }
    if (lim.assumed) verify.push(`The ${yr} passenger-vehicle cost limit is not loaded; the ${lim.year} limit was used. Check the current limit.`);
  }
  out.rate = CCA_RULES.classes[out.cls].rate;
  out.capitalCost = round2(out.capitalCost);
  return out;
}

// Year-by-year CCA. The class balance (UCC) drops by the full CCA; only the
// business-use share is deductible (CRA's method for property with personal use).
// CCA is optional, so a year's claim can be overridden in a.claims[year].
export function schedule(a, toYear) {
  const c = classify(a);
  const start = purchaseYear(a);
  if (!c.cls || !start) return { c, rows: [] };
  const rows = [];
  let ucc = c.capitalCost;
  const end = a.disposedYear ? Math.min(toYear, a.disposedYear) : toYear;
  for (let y = start; y <= end; y++) {
    const first = y === start;
    const factor = first ? CCA_RULES.firstYear[a.firstYearRule === 'full' ? 'full' : 'half'] : 1;
    const disposed = a.disposedYear === y;
    const max = disposed ? 0 : round2(ucc * c.rate * factor);
    const claim = a.claims && a.claims[y] != null ? Math.min(max, Math.max(0, n(a.claims[y]))) : max;
    const pct = Math.min(100, Math.max(0, a.pctByYear && a.pctByYear[y] != null ? n(a.pctByYear[y]) : n(a.businessPct)));
    rows.push({ year: y, first, disposed, open: round2(ucc), max, cca: claim, pct, deductible: round2(claim * pct / 100), close: round2(ucc - claim), custom: !!(a.claims && a.claims[y] != null) });
    ucc -= claim;
  }
  return { c, rows };
}

// Estimated yearly running cost from the forecast inputs.
export function forecast(a) {
  const biz = n(a.bizKm), personal = n(a.personalKm), km = biz + personal;
  const years = n(a.keepYears) || 5;
  const cost = n(a.price) + n(a.salesTax);
  const parts = [
    ['Depreciation (cost less resale, spread over ' + years + ' years)', (cost - n(a.resale)) / years],
    ['Fuel', km * n(a.fuelEconomy) / 100 * n(a.fuelPrice)],
    ['Insurance', n(a.insurance)],
    ['Maintenance', n(a.maintenance)],
    ['Repairs', n(a.repairs)],
    ['Registration', n(a.registration)],
    ['Financing interest', a.payment === 'financed' ? n(a.interestYear) : 0],
  ].map(([label, value]) => ({ label, value: round2(Math.max(0, value)) }));
  const annual = round2(parts.reduce((t, p) => t + p.value, 0));
  const operating = round2(annual - parts[0].value);
  const share = km > 0 ? biz / km : n(a.businessPct) / 100;
  const missing = [];
  if (!km) missing.push('expected annual kilometres');
  if (!n(a.fuelEconomy) || !n(a.fuelPrice)) missing.push('fuel economy and fuel price');
  if (!n(a.insurance)) missing.push('insurance');
  if (!n(a.maintenance) && !n(a.repairs)) missing.push('maintenance and repairs');
  return {
    parts, annual, operating, km, biz, share, missing,
    perKm: km > 0 ? annual / km : null,
    businessCost: round2(annual * share),
    perBizKm: biz > 0 ? (annual * share) / biz : null,
    revenuePct: n(a.revenue) > 0 ? (annual * share) / n(a.revenue) : null,
    altAnnual: n(a.altCost) || null,
  };
}

// "Can I deduct this?" for a vehicle - reasoning, not a score.
// outcome: 'likely' | 'review' | 'not'
export function assess(a, year) {
  const money = v => `$${Math.round(v).toLocaleString('en-CA')}`;
  const pct = n(a.businessPct);
  const purposes = businessPurposes(a);
  const { c, rows } = schedule({ ...a, purchaseDate: a.purchaseDate || `${year}-01-01` }, (purchaseYear(a) || year) + 1);
  const f = forecast(a);
  const first = rows[0];

  // Business-use case
  let rating = 'Limited';
  const why = [];
  if (purposes.length && pct >= 90) rating = 'Strong';
  else if (purposes.length && pct >= 50) rating = 'Moderate';
  if (purposes.length) why.push(`you expect to use it for ${purposes.join(', ').toLowerCase()}`);
  else why.push('no business purpose has been selected');
  why.push(`business use is entered as ${pct}%`);
  if (f.biz) {
    why.push(`about ${f.biz.toLocaleString('en-CA')} business km a year are expected`);
    if (f.biz < 3000 && rating !== 'Limited') { rating = rating === 'Strong' ? 'Moderate' : 'Limited'; why.push('that is a low distance for a vehicle bought mainly for business'); }
  }
  if (a.p_personal && pct >= 100) why.push('you ticked personal use but entered 100% business - one of these needs correcting');

  // Outcome
  let outcome = 'review';
  if (!purposes.length || pct < 10) outcome = 'not';
  else if (pct >= 90 && !a.p_personal && c.cls === '10') outcome = 'likely';

  const answer = { likely: 'LIKELY ELIGIBLE', review: 'POTENTIALLY ELIGIBLE — REVIEW', not: 'LIKELY PERSONAL / NOT ELIGIBLE' }[outcome];
  const whyText = outcome === 'not'
    ? `Based on what you entered, the vehicle looks mainly personal: ${why.join('; ')}. Costs of a personal vehicle are not business deductions, although business trips made in it can still be logged and a share of running costs considered.`
    : `Based on what you entered, the vehicle appears to have a ${rating.toLowerCase()} business-use purpose because ${why.join('; ')}.${outcome === 'review' ? ' It needs review because ' + [pct < 90 || a.p_personal ? 'personal use limits the deductible share' : '', !c.cls ? 'the CCA class cannot be determined yet' : '', c.cls === '10.1' ? 'the passenger-vehicle cost limit applies' : '', c.cls === '54' ? 'zero-emission vehicle rules apply' : ''].filter(Boolean).join(', ') + '.' : ''}`;

  const treatment = [
    { level: 'Confirmed tax rule', text: 'A vehicle is a capital asset. Its purchase price is not a current-year expense; it is claimed gradually as capital cost allowance (CCA).' },
    c.cls
      ? { level: 'Likely treatment', text: `${CCA_RULES.classes[c.cls].label}. ${c.reasons.join(' ')}` }
      : { level: 'Needs professional verification', text: UNSURE },
    { level: 'Confirmed tax rule', text: 'Only the business-use share of CCA is deductible when a vehicle is also used personally. Claiming CCA is optional in any year.' },
    { level: 'Confirmed tax rule', text: 'Running costs (fuel, insurance, repairs, maintenance, registration, loan interest within limits) are separate from CCA and claimable in proportion to business kilometres.' },
    { level: 'Needs professional verification', text: `First-year CCA: this app uses the standard half-year rule unless you choose otherwise. Temporary first-year incentives may allow more${c.verify.length ? '. ' + c.verify.join(' ') : '.'}` },
  ];
  if (a.payment === 'financed') treatment.push({ level: 'Confirmed tax rule', text: 'Loan principal payments are not deductible. Interest on a passenger-vehicle loan is deductible only up to a prescribed daily limit, then by business use.' });

  const keep = ['Purchase agreement / bill of sale', 'Proof of payment', a.payment === 'financed' ? 'Loan agreement and yearly interest statements' : '', 'Mileage log (date, destination, purpose, km for every business trip)', 'Odometer reading at purchase and at each year-end', 'Registration and insurance documents', 'Receipts for all running costs'].filter(Boolean);

  const change = [
    'Personal use: any personal driving reduces the deductible share, and can change the vehicle\'s classification.',
    `Business-use percentage: CRA's chart uses ${a.seating === '4-9' ? '90% or more' : 'more than 50%'} goods/equipment use in the year of purchase for trucks, vans and SUVs.`,
    'Vehicle classification: passenger vehicles over the cost limit go in Class 10.1 with CCA capped at the limit.',
    'Tax year: cost limits and first-year rules change from year to year.',
    a.payment === 'financed' ? 'Financing: the interest limit can cap what is deductible.' : 'Financing: borrowing to buy adds interest, which has its own limit.',
    'Selling or trading the vehicle later can create recapture (income) or a terminal loss - not calculated here.',
  ];

  // Practical / financial view - never "buy it for the write-off".
  const practical = [];
  if (f.missing.length) practical.push(`Add ${f.missing.join(', ')} under the cost forecast for a fuller picture.`);
  if (f.annual > 0) {
    practical.push(`Estimated cost to own and run it: about ${money(f.annual)} a year${f.perKm ? ` ($${f.perKm.toFixed(2)} per km)` : ''}, of which about ${money(f.businessCost)} relates to business driving${f.perBizKm ? ` ($${f.perBizKm.toFixed(2)} per business km)` : ''}.`);
    if (f.revenuePct != null) practical.push(`That business cost is about ${Math.round(f.revenuePct * 100)}% of the ${money(n(a.revenue))} of yearly revenue you expect it to support${f.revenuePct > 0.25 ? ' - a large share, so check whether a cheaper vehicle would do the same job' : ''}.`);
    if (f.altAnnual) practical.push(f.altAnnual < f.annual ? `Your alternative costs about ${money(f.altAnnual)} a year, roughly ${money(f.annual - f.altAnnual)} less than this vehicle.` : `Your alternative costs about ${money(f.altAnnual)} a year, so this vehicle is roughly ${money(f.altAnnual - f.annual)} cheaper to run.`);
    const interest = f.parts[6].value;
    if (interest > 0 && interest / f.annual > 0.15) practical.push(`Financing interest is about ${Math.round(interest / f.annual * 100)}% of the yearly cost.`);
  }
  if (c.capped) practical.push(`The price is above the ${money(c.limit)} cost limit, so the amount over the limit never becomes a deduction.`);
  if (a.condition === 'used') practical.push('For a used vehicle, budget realistically for repairs and check reliability and remaining useful life - those drive the real cost more than the tax treatment.');
  practical.push(rating === 'Strong'
    ? 'A vehicle looks reasonably necessary for the work you described. Whether this particular one is sensible depends on the running costs above and whether a cheaper vehicle could do the same job.'
    : rating === 'Moderate'
      ? 'The business need is real but shared with personal use, so only part of every cost is a business cost.'
      : 'On these inputs the business need is weak; the purchase should be judged mainly as a personal one.');
  practical.push('A deduction only reduces the tax on money you have already spent. It is never by itself a reason to buy.');

  return {
    outcome, answer, rating, why: whyText, treatment, keep, change, practical, c, f,
    cash: {
      paid: n(a.price) + n(a.salesTax),
      firstYearCca: first ? first.max : null,
      firstYearDeduction: first ? round2(first.max * pct / 100) : null,
      remaining: first ? first.close : null,
      fullRule: first ? round2(c.capitalCost * c.rate * CCA_RULES.firstYear.full * pct / 100) : null,
    },
  };
}

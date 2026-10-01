// Equipment & technology: likely tax treatment, CCA schedule, write-off and
// purchase assessments, subscriptions. Pure functions - nothing is saved here.
//
// RULES ARE DATA. Edit EQUIP_RULES when CRA changes a class or rate and update
// `checked`. Class wording is from CRA's "CCA classes" page (modified
// 2026-08-31) and guide T4002 chapter 4, checked 2026-10-01:
//   Class 50 (55%) general-purpose electronic data-processing equipment and
//                  systems software, including ancillary data-processing equipment
//   Class 8  (20%) property used in the business that is not in another class
//   Class 12 (100%) tools costing less than $500; application software
//   Class 46 (30%) data network infrastructure equipment
// Anything this file cannot place with reasonable confidence gets cls: null and
// the app says the class needs verification instead of guessing.

import { state, all } from './store.js';
import { round2, yearOf } from './util.js';

const CRA = 'https://www.canada.ca/en/revenue-agency/services';
export const EQUIP_RULES = {
  checked: '2026-10-01',
  sources: {
    'CRA: CCA classes': `${CRA}/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/claiming-capital-cost-allowance/classes.html`,
    'CRA: Claiming capital cost allowance': `${CRA}/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/claiming-capital-cost-allowance.html`,
    'CRA: Business expenses': `${CRA}/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses.html`,
    'CRA guide T4002': `${CRA}/forms-publications/publications/t4002.html`,
  },
  // Working thresholds used by this app. They are NOT CRA rules - CRA has no
  // general dollar cut-off between supplies and capital equipment.
  smallCost: 200,     // below this, accessories and similar are treated as likely current expenses
  expensive: 2500,    // at or above this, a purchase is flagged for discussion
  firstYear: { half: 0.5, full: 1 },
  classes: {
    '50': { rate: 0.55, label: 'Class 50 (55%) - computer hardware and systems software' },
    '8': { rate: 0.20, label: 'Class 8 (20%) - equipment not in another class' },
    '12': { rate: 1.00, label: 'Class 12 (100%) - application software / small tools' },
    '46': { rate: 0.30, label: 'Class 46 (30%) - data network infrastructure equipment' },
  },
  // cls: likely class when treated as a capital asset (null = needs verification)
  // level: how firm that is.  small: low-cost rule can apply.  note: extra explanation.
  categories: {
    'Computer/laptop': { cls: '50', level: 'Clearly documented rule', note: 'A computer is general-purpose electronic data-processing equipment, which CRA lists in Class 50.' },
    'Desktop computer': { cls: '50', level: 'Clearly documented rule', note: 'A computer is general-purpose electronic data-processing equipment, which CRA lists in Class 50.' },
    'Monitor': { cls: '50', level: 'Likely treatment', note: 'A monitor is normally ancillary data-processing equipment, which Class 50 includes.' },
    'Tablet': { cls: '50', level: 'Likely treatment', note: 'A tablet is generally treated like a computer (Class 50).' },
    'Phone': { cls: '8', level: 'Requires verification', note: 'A phone is not clearly listed in a specific class. It is often placed in Class 8 (equipment not in another class), but some treat a smartphone as computer equipment. Confirm the class. The monthly plan is a separate current expense.' },
    'Keyboard': { cls: '50', level: 'Likely treatment', small: true, note: 'Ancillary computer equipment. Inexpensive ones are commonly treated as supplies.' },
    'Mouse': { cls: '50', level: 'Likely treatment', small: true, note: 'Ancillary computer equipment. Inexpensive ones are commonly treated as supplies.' },
    'Headset': { cls: '8', level: 'Likely treatment', small: true, note: 'Not data-processing equipment, so Class 8 if it is a capital item. Inexpensive ones are commonly treated as supplies.' },
    'Webcam': { cls: '8', level: 'Requires verification', small: true, note: 'Could be Class 8, or Class 50 as ancillary computer equipment. Inexpensive ones are commonly treated as supplies.' },
    'Microphone': { cls: '8', level: 'Likely treatment', small: true, note: 'Not data-processing equipment, so Class 8 if it is a capital item.' },
    'Printer': { cls: '50', level: 'Likely treatment', note: 'A printer connected to a computer is normally ancillary data-processing equipment (Class 50). Ink and paper are office supplies.' },
    'Scanner': { cls: '50', level: 'Likely treatment', note: 'Normally ancillary data-processing equipment (Class 50).' },
    'External hard drive': { cls: '50', level: 'Likely treatment', small: true, note: 'Storage for a computer is ancillary data-processing equipment (Class 50) when it is a capital item.' },
    'SSD': { cls: '50', level: 'Likely treatment', small: true, note: 'Storage for a computer is ancillary data-processing equipment (Class 50) when it is a capital item.' },
    'USB hub': { cls: null, small: true, note: 'A minor accessory. Usually a low-cost supply rather than a capital asset.' },
    'Docking station': { cls: '50', level: 'Likely treatment', small: true, note: 'Ancillary computer equipment (Class 50) when it is a capital item.' },
    'Cables/adapters': { cls: null, small: true, note: 'Minor accessories with a short life. Usually low-cost supplies rather than capital assets.' },
    'Computer accessories': { cls: null, small: true, note: 'Depends on the item. Low-cost accessories are usually supplies; lasting equipment is a capital asset.' },
    'Networking equipment': { cls: null, small: true, note: 'A router or switch could fall in Class 46, Class 50 or Class 8 depending on what it is.' },
    'Camera': { cls: '8', level: 'Likely treatment', note: 'Equipment not in another class (Class 8).' },
    'Business equipment': { cls: '8', level: 'Likely treatment', note: 'Equipment not in another class goes in Class 8. A tool costing under $500 may instead qualify for Class 12 (100%).' },
    'Office equipment': { cls: '8', level: 'Likely treatment', note: 'Furniture and office equipment are capital items in Class 8, even when inexpensive.' },
    'Software': { cls: '12', level: 'Likely treatment', small: true, note: 'Purchased application software is generally Class 12 (100%, with the half-year rule). Systems software belongs with the computer (Class 50).' },
    'SaaS subscription': { saas: true, note: 'A subscription paid for ongoing use is an operating cost, not an asset.' },
    'Other technology': { cls: null, note: 'The class depends on what the item is.' },
  },
};
export const EQUIP_CATEGORIES = Object.keys(EQUIP_RULES.categories);
export const CUSTOM = 'Custom category…';
export const CLASS_UNSURE = 'CCA classification requires verification based on the specific asset and applicable CRA rules.';
export const NOT_FREE = 'A tax deduction reduces taxable income; it does not make the purchase free.';

export const EARNS = [
  ['e_prospect', 'Prospecting for customers'], ['e_customers', 'Managing customers'], ['e_sales', 'Processing sales'],
  ['e_commissions', 'Managing commissions'], ['e_install', 'Installing payment systems'], ['e_comms', 'Communicating with customers'],
  ['e_software', 'Running business software'], ['e_present', 'Creating sales presentations'], ['e_records', 'Managing business records'],
  ['e_accounting', 'Accounting/bookkeeping'], ['e_marketing', 'Marketing'],
];
export const USES = [{ value: '100', label: '100% business' }, { value: 'mostly', label: 'Mostly business' }, { value: 'mixed', label: 'Mixed' }, { value: 'personal', label: 'Personal' }];

export const SUB_CATEGORIES = ['CRM', 'AI software', 'Accounting software', 'Cloud storage', 'Website hosting', 'Domain', 'Email', 'Sales tools', 'Lead-generation software', 'Microsoft 365', 'Google Workspace', 'Other SaaS'];

const n = v => Number(v) || 0;
export const usePct = e => (e.use === '100' ? 100 : e.use === 'personal' ? 0 : Math.min(100, Math.max(0, n(e.businessPct))));
export const earnsList = e => EARNS.filter(([k]) => e[k]).map(([, l]) => l);
export const equipCategory = e => e.category || 'Other technology';

// Cost in CAD (price + sales tax), or null for a USD purchase with no rate recorded.
export const equipCost = e => (e.currency === 'USD' ? (e.cadAmount != null ? n(e.cadAmount) : null) : n(e.price) + n(e.salesTax));

// Likely tax treatment for one item.
export function treat(e) {
  const R = EQUIP_RULES;
  const rule = R.categories[equipCategory(e)] || { cls: null, small: true, note: 'Custom category: the class depends on what the item is.' };
  const cost = equipCost(e);
  const pct = usePct(e);
  const reasons = [];
  let kind, level = rule.level || 'Requires verification';

  if (pct <= 0) {
    return { kind: 'personal', label: 'Likely personal / not deductible', level: 'Clearly documented rule', cls: null, rate: null, cost, pct, rule, reasons: ['Personal-use items are not business expenses.'] };
  }
  if (e.treatment === 'current') { kind = 'current'; level = 'Requires verification'; reasons.push('You chose to treat this as a current expense.'); }
  else if (e.treatment === 'capital') { kind = 'capital'; reasons.push('You chose to treat this as a capital asset.'); }
  else if (rule.saas) { kind = 'current'; level = 'Likely treatment'; }
  else if (rule.small && cost != null && cost < R.smallCost) {
    kind = 'current'; level = 'Likely treatment';
    reasons.push(`At under $${R.smallCost} this is a low-cost item that is commonly deducted as a supply in the year bought. That cut-off is this app's working threshold, not a CRA rule, so a larger or longer-lasting item may still be capital.`);
  } else kind = 'capital';
  if (rule.note) reasons.push(rule.note);

  let cls = null;
  if (kind === 'capital') {
    cls = e.clsOverride && e.clsOverride !== 'auto' ? e.clsOverride : rule.cls;
    if (e.clsOverride && e.clsOverride !== 'auto') { level = 'Requires verification'; reasons.push(`You selected Class ${cls}.`); }
    if (!cls) { level = 'Requires verification'; reasons.push(CLASS_UNSURE); }
  }
  const label = kind === 'current' ? 'Current business expense'
    : cls ? 'Capital asset / CCA' : 'Potentially deductible — special rules may apply';
  return { kind, label, level, cls, rate: cls ? R.classes[cls].rate : null, cost, pct, rule, reasons };
}

// Year-by-year deduction estimate. Capital: UCC falls by the full CCA and only
// the business share is deductible. Current: business share in the year bought.
export function equipSchedule(e, toYear) {
  const t = treat(e);
  const start = yearOf(e.date);
  const rows = [];
  if (!start || t.cost == null || t.kind === 'personal') return { t, rows };
  if (t.kind === 'current') {
    if (start <= toYear) rows.push({ year: start, first: true, current: true, open: t.cost, max: t.cost, cca: t.cost, pct: t.pct, deductible: round2(t.cost * t.pct / 100), close: 0 });
    return { t, rows };
  }
  if (!t.cls) return { t, rows };
  let ucc = t.cost;
  const end = e.disposedYear ? Math.min(toYear, e.disposedYear) : toYear;
  for (let y = start; y <= end; y++) {
    const first = y === start;
    const factor = first ? EQUIP_RULES.firstYear[e.firstYearRule === 'full' ? 'full' : 'half'] : 1;
    const disposed = e.disposedYear === y;
    const max = disposed ? 0 : round2(Math.min(ucc, ucc * t.rate * factor));
    const claim = e.claims && e.claims[y] != null ? Math.min(max, Math.max(0, n(e.claims[y]))) : max;
    const pct = Math.min(100, Math.max(0, e.pctByYear && e.pctByYear[y] != null ? n(e.pctByYear[y]) : t.pct));
    rows.push({ year: y, first, disposed, open: round2(ucc), max, cca: claim, pct, deductible: round2(claim * pct / 100), close: round2(ucc - claim), custom: !!(e.claims && e.claims[y] != null) });
    ucc -= claim;
  }
  return { t, rows };
}

// Things to raise with the accountant about one item.
export function equipFlags(e) {
  const t = treat(e);
  const out = [];
  if (t.kind === 'personal') return out;
  if (t.cost == null) out.push('USD purchase with no exchange rate recorded');
  if (e.use === 'mostly' || e.use === 'mixed') out.push(`Personal use exists - ${t.pct}% business use is your estimate`);
  if (t.kind === 'capital' && !t.cls) out.push('CCA classification is uncertain');
  else if (t.level === 'Requires verification') out.push('Tax treatment requires verification');
  if (t.kind === 'current' && t.rule.small) out.push('Treated as a low-cost current expense - confirm it is not a capital item');
  if ((t.cost || 0) >= EQUIP_RULES.expensive) out.push(`Unusually expensive purchase ($${EQUIP_RULES.expensive}+)`);
  if (!e.receiptId) out.push('Receipt missing');
  if (!earnsList(e).length && !e.earnsText) out.push('No business-purpose explanation recorded');
  return out;
}

// Totals for a tax year.
export function equipSummary(year) {
  const rows = [];
  for (const e of all('equip')) {
    const s = equipSchedule(e, year);
    const r = s.rows.find(x => x.year === year);
    rows.push({ e, t: s.t, row: r || null, purchased: yearOf(e.date) === year, flags: equipFlags(e) });
  }
  const sumOf = fn => round2(rows.reduce((t, r) => t + (fn(r) || 0), 0));
  const current = sumOf(r => (r.row && r.row.current ? r.row.deductible : 0));
  const cca = sumOf(r => (r.row && !r.row.current ? r.row.deductible : 0));
  return {
    rows, current, cca,
    counted: round2(current + (state.settings.includeCca === false ? 0 : cca)),
    purchasedTotal: sumOf(r => (r.purchased ? r.t.cost : 0)),
    undetermined: rows.filter(r => r.t.kind === 'capital' && !r.t.cls && yearOf(r.e.date) <= year).length,
  };
}

// ---- subscriptions ---------------------------------------------------------

// Expected (unconfirmed) subscription payments for a year. Never counted as
// expenses until the user confirms the payment actually happened.
export function expectedSubs(year) {
  const out = [];
  const paid = new Set(all('expense').filter(x => x.sourceType === 'subscription').map(x => `${x.sourceId}|${x.period}`));
  for (const s of all('sub')) {
    if (!s.startMonth) continue;
    const startMonth = Number(s.startMonth.slice(5, 7));
    for (let m = 1; m <= 12; m++) {
      const period = `${year}-${String(m).padStart(2, '0')}`;
      if (period < s.startMonth) continue;
      if (s.endMonth && period > s.endMonth) continue;
      if (s.frequency === 'annual' && m !== startMonth) continue;
      if (s.frequency === 'once' && period !== s.startMonth) continue;
      if (paid.has(`${s.id}|${period}`) || (s.skipped || []).includes(period)) continue;
      out.push({ sub: s, period });
    }
  }
  return out.sort((a, b) => a.period.localeCompare(b.period));
}

// ---- assessments -----------------------------------------------------------

const money = v => `$${(Math.round(v * 100) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// "Can I write this off?"   outcome: likely | review | not
export function writeOff(e, year) {
  const { t, rows } = equipSchedule(e, Math.max(year, yearOf(e.date) || year));
  const earns = earnsList(e);
  const purpose = earns.length || e.earnsText;
  const first = rows[0] || null;
  const name = e.name || equipCategory(e);
  let outcome = 'review';
  if (t.kind === 'personal') outcome = 'not';
  else if (t.pct === 100 && purpose && (t.kind === 'current' || t.cls) && t.level !== 'Requires verification') outcome = 'likely';

  let why;
  if (outcome === 'not') why = `You marked this ${name} as personal use. Personal purchases are not business expenses, even when bought through the business.`;
  else {
    why = purpose
      ? `"${name}" appears to have a ${t.pct === 100 ? 'clear' : 'partial'} business purpose based on the information provided: ${[...earns.map(x => x.toLowerCase()), e.earnsText].filter(Boolean).join('; ')}.`
      : `No explanation of how "${name}" helps earn business income has been recorded yet, so the business connection is not established.`;
    if (t.pct < 100) why += ` Business use is entered as ${t.pct}%, so only that share can be considered.`;
    if (t.kind === 'capital') why += ' Because computers and other equipment can be treated as capital assets for Canadian tax purposes, the purchase may need to be handled through capital cost allowance (CCA) rather than deducted entirely in the year of purchase.' + (t.cls ? ' The applicable class and current-year deduction should be verified using current CRA rules.' : '');
  }

  const treatment = [];
  if (t.kind === 'current') treatment.push({ level: t.level, text: 'Current expense: the business share may be deductible in the year of purchase.' });
  if (t.kind === 'capital') treatment.push({ level: 'Clearly documented rule', text: 'Equipment with a lasting benefit is a capital asset. Its cost is claimed over time as CCA, not as a single expense.' });
  if (t.kind === 'capital') treatment.push(t.cls ? { level: t.level, text: `${EQUIP_RULES.classes[t.cls].label}.` } : { level: 'Requires verification', text: CLASS_UNSURE });
  for (const r of t.reasons) if (r !== CLASS_UNSURE) treatment.push({ level: t.kind === 'personal' ? 'Clearly documented rule' : 'Likely treatment', text: r });
  if (t.pct > 0 && t.pct < 100) treatment.push({ level: 'Clearly documented rule', text: 'Partially business deductible: only the business-use share counts. The personal share is never a business expense.' });
  if (t.kind === 'capital') treatment.push({ level: 'Requires verification', text: 'First-year CCA here uses the standard half-year rule. Temporary first-year incentives may allow more, and CCA is optional in any year.' });

  const cost = t.cost;
  const bizCost = cost == null ? null : round2(cost * t.pct / 100);
  const explain = t.kind === 'personal' ? 'Nothing is deductible for a personal item.'
    : cost == null ? 'Enter the exchange rate or CAD amount to see an estimate.'
      : t.kind === 'current' ? `As a current expense, the business-use cost of ${money(bizCost)} may be deductible in ${first ? first.year : 'the year of purchase'}.`
        : !t.cls ? `No current-year estimate is shown because the class is not determined. ${CLASS_UNSURE}`
          : `As a ${EQUIP_RULES.classes[t.cls].label.split(' - ')[0]} asset, the estimated first-year CCA is ${money(first.cca)} (${Math.round(t.rate * 100)}% rate${e.firstYearRule === 'full' ? '' : ', half-year rule'}), of which ${money(first.deductible)} is the business share. The remaining ${money(first.close)} stays in the class balance and is claimed in later years. The estimated deduction is not the same as the purchase price.`;

  const keep = ['Receipt or invoice', 'Proof of payment', 'Note of the business purpose', t.pct < 100 && t.pct > 0 ? 'How you worked out the business-use percentage' : 'Business-use percentage (and any change over time)', t.kind === 'capital' ? 'Purchase date and description (model / serial number)' : '', e.currency === 'USD' ? 'Exchange rate used' : ''].filter(Boolean);

  return {
    outcome, answer: { likely: 'LIKELY ELIGIBLE', review: 'POTENTIALLY ELIGIBLE — REVIEW', not: 'LIKELY PERSONAL / NOT ELIGIBLE' }[outcome],
    why, treatment, t, keep, explain,
    amounts: { cost, pct: t.pct, bizCost, personal: cost == null ? null : round2(cost - bizCost), firstYear: first ? first.deductible : null, firstYearNo: first ? first.year : null, remaining: first && !first.current ? first.close : first ? 0 : null },
  };
}

// "Is this a good business purchase?" - separate from the tax question.
export function goodPurchase(e) {
  const t = treat(e);
  const earns = earnsList(e);
  const cost = t.cost;
  const life = n(e.usefulLife);
  const points = [];
  points.push(earns.length || e.earnsText
    ? `Business purpose: you use it for ${[...earns.map(x => x.toLowerCase()), e.earnsText].filter(Boolean).join('; ')}.`
    : 'Business purpose: none recorded. If you cannot say how it helps you earn income, it is hard to call it a business purchase.');
  points.push(t.pct >= 90 ? `Expected business use: ${t.pct}%, so nearly all of the cost is a business cost.`
    : t.pct > 0 ? `Expected business use: ${t.pct}%. About ${cost == null ? 'part' : money(cost * (100 - t.pct) / 100)} of the cost is a personal purchase and should be judged as one.`
      : 'Expected business use: none. This is a personal purchase.');
  if (cost != null && life > 0) points.push(`Cost over its life: about ${money(cost / life)} a year over ${life} year${life === 1 ? '' : 's'}${t.pct > 0 && t.pct < 100 ? ` (${money(cost * t.pct / 100 / life)} a year for the business share)` : ''}.`);
  else points.push('Expected useful life: not entered. Add it to see the cost per year, which is the fairer way to judge a larger purchase.');
  if (e.benefit) points.push(`Expected benefit you noted: ${e.benefit}`);
  else points.push('Expected benefit: not entered. Ask what this lets you do that you cannot do now, such as more customers handled, time saved, or fewer problems on installs.');
  if (e.cheaper === 'yes') points.push('You indicated a less expensive option could do the same job. The extra cost is then a preference rather than a business need.');
  else if (e.cheaper === 'no') points.push('You indicated a less expensive option would not do the job, which supports the cost.');
  else points.push('Whether a less expensive option could do the same job has not been answered. It is the most useful question to settle before buying.');
  if (cost != null && cost >= EQUIP_RULES.expensive) points.push(`At ${money(cost)} this is a large purchase for a one-person sales business. Make sure the work actually needs this level of equipment.`);
  let verdict;
  if (t.pct <= 0) verdict = 'On these inputs this is a personal purchase, not a business one.';
  else if (!(earns.length || e.earnsText)) verdict = 'The business case is not established yet. Record how it helps you earn income before treating it as a business purchase.';
  else if (e.cheaper === 'yes') verdict = 'It looks useful for your work, but by your own answer it costs more than the job requires.';
  else if (t.pct >= 90) verdict = 'It appears reasonably useful for the work you described. Whether the price is sensible depends on how long it lasts and whether a cheaper option would do.';
  else verdict = 'It appears partly useful for your work. Judge the personal share as a personal purchase.';
  return { verdict, points, cost, pct: t.pct };
}

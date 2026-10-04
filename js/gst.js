// GST/HST: registration status, tax collected, potential input tax credits and
// a remittance estimate. The app never assumes you are registered - it asks.
// Rates, the small-supplier threshold and the ITC rules come from rules.js.

import { state, saveSettings } from './store.js';
import { summary, inYear, cadOf } from './calc.js';
import { CATEGORIES } from './reference.js';
import { VALUES, cite, rule } from './rules.js';
import { PROVINCES } from './tax-rates.js';
import { head } from './views.js';
import { $$, esc, money, round2, sum, yearOf, monthOf } from './util.js';

const PERIODS = { annual: 'Annual', quarterly: 'Quarterly', monthly: 'Monthly' };
const quarterOf = date => `${yearOf(date)}-Q${Math.ceil(monthOf(date) / 3)}`;
const periodOf = (date, period) => (period === 'monthly' ? date.slice(0, 7) : period === 'quarterly' ? quarterOf(date) : String(yearOf(date)));

// Revenue by calendar quarter across all years, for the small-supplier test.
export function smallSupplier() {
  const limit = VALUES.gstThreshold.value;
  const byQ = {};
  for (const i of state.data.income) {
    if (i.status !== 'received' || !i.date) continue;
    byQ[quarterOf(i.date)] = (byQ[quarterOf(i.date)] || 0) + (cadOf(i) || 0);
  }
  const now = new Date();
  const quarters = [];
  for (let n = 3; n >= 0; n--) {
    const d = new Date(now.getFullYear(), now.getMonth() - n * 3, 1);
    quarters.push(`${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`);
  }
  const last4 = round2(sum(quarters, q => byQ[q] || 0));
  const biggest = Math.max(0, ...quarters.map(q => byQ[q] || 0));
  return { limit, quarters, byQ, last4, overFour: last4 > limit, overOne: biggest > limit, near: last4 > limit * 0.8 && last4 <= limit };
}

// Tax collected, potential ITCs and the difference for a tax year.
export function gstSummary(year) {
  const g = state.settings.gst;
  const s = summary(year);
  const collected = [];
  for (const i of inYear('income', year)) if (i.status === 'received' && Number(i.gst) > 0) collected.push({ rec: i, period: periodOf(i.date, g.period), amount: Number(i.gst) });
  const itc = [], capital = [], noTax = [];
  for (const x of s.exp.items) {
    const e = x.e;
    if (e.use === 'personal' || e.currency === 'USD') continue;
    const tax = Number(e.tax) || 0;
    const info = CATEGORIES[e.category] || {};
    if (!tax) { if ((x.cad || 0) >= 30) noTax.push(e); continue; }
    if (info.capital) { capital.push({ rec: e, amount: tax }); continue; }
    if (info.home && !s.home.eligible && !state.settings.homeOffice.qualifies) continue;
    const share = x.cad > 0 ? x.portion / x.cad : 0;
    const limit = info.meals ? VALUES.mealsPct.value / 100 : 1;
    itc.push({ rec: e, period: periodOf(e.date, g.period), paid: tax, amount: round2(tax * share * limit), note: `${Math.round(share * 100)}% business${info.meals ? ', 50% meals limit' : ''}` });
  }
  for (const r of s.equip.rows) if (r.purchased && Number(r.e.salesTax) > 0 && r.e.currency !== 'USD') capital.push({ rec: r.e, amount: Number(r.e.salesTax) });
  const periods = {};
  const add = (p, k, v) => { (periods[p] || (periods[p] = { collected: 0, itc: 0 }))[k] += v; };
  collected.forEach(c => add(c.period, 'collected', c.amount));
  itc.forEach(c => add(c.period, 'itc', c.amount));
  const tc = round2(sum(collected, c => c.amount)), ti = round2(sum(itc, c => c.amount));
  return { g, collected, itc, capital, noTax, periods, totalCollected: tc, totalItc: ti, net: round2(tc - ti), paidAll: round2(sum(itc, c => c.paid)), capitalTax: round2(sum(capital, c => c.amount)) };
}

// When the return for the selected year is due, by filing period.
export function gstDue(year) {
  const g = state.settings.gst;
  if (!g.registered) return [];
  if (g.period === 'annual') return [{ label: `${year} annual return`, date: `${year + 1}-06-15`, note: 'Sole proprietors with a December 31 year-end: return due June 15, payment due April 30.' }];
  const n = g.period === 'quarterly' ? 4 : 12, len = 12 / n;
  return Array.from({ length: n }, (_, i) => {
    const end = new Date(year, (i + 1) * len + 1, 0); // last day of the month after the period ends
    return { label: g.period === 'quarterly' ? `Q${i + 1} ${year}` : `${year}-${String(i + 1).padStart(2, '0')}`, date: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`, note: 'One month after the period ends.' };
  });
}

export function gst(root) {
  const y = state.settings.year;
  const g = state.settings.gst;
  const ss = smallSupplier();
  const rate = VALUES.gstRate.value[state.settings.province];
  const line = (l, v, cls = '') => `<div class="line ${cls}"><span>${l}</span><span>${v}</span></div>`;
  const threshold = `<section class="panel${ss.overFour || ss.overOne ? ' notice' : ''}"><h2>Small-supplier check</h2>
      ${line(`Business income received, last four calendar quarters (${ss.quarters[0]} to ${ss.quarters[3]})`, money(ss.last4))}
      ${line('Registration threshold', money(ss.limit))}
      <p class="muted">${ss.overFour || ss.overOne ? `<strong class="warn-text">Your recorded income is over ${money(ss.limit, 'CAD', 0)}.</strong> If those sales are taxable supplies (including zero-rated ones) you may be required to register.` : ss.near ? `You are within 20% of the threshold. Keep an eye on it.` : 'Below the threshold on the income recorded in this app.'} The test counts worldwide taxable supplies, including zero-rated ones. Whether commissions paid by a U.S. company are taxable, zero-rated or outside the tax depends on the facts, so confirm with a tax professional before deciding.</p>
      ${cite('gst-small-supplier')}</section>`;

  if (!g.asked) {
    root.innerHTML = `${head('GST/HST', '', 'The app does not assume you are registered.')}
      <section class="panel"><h2>Are you registered for GST/HST?</h2>
        <p>If you are registered you charge GST/HST on taxable sales, can claim back the GST/HST on business purchases, and file returns. If you are not, none of that applies and the GST you pay is simply part of your expenses.</p>
        <div class="btn-list"><button class="btn primary" data-reg="yes">Yes, I am registered</button><button class="btn" data-reg="no">No, I am not registered</button></div>
      </section>${threshold}`;
  } else if (!g.registered) {
    const s = gstSummary(y);
    root.innerHTML = `${head('GST/HST', '<button class="btn small" data-reg="yes">I have registered</button>', 'Not registered')}
      <section class="panel"><h2>What this means</h2>
        <p>You do not charge GST/HST and cannot claim input tax credits. The GST/HST you pay stays in your expense amounts, which is how the rest of the app already treats it.</p>
        ${line(`GST/HST recorded on ${y} business expenses`, money(s.paidAll + s.capitalTax))}
        <p class="muted">Shown for information. It would only be recoverable if you were registered when you paid it.</p>
      </section>${threshold}`;
  } else {
    const s = gstSummary(y);
    const due = gstDue(y);
    const keys = Object.keys(s.periods).sort();
    root.innerHTML = `${head('GST/HST', '', `Registered &middot; ${PERIODS[g.period].toLowerCase()} filing &middot; ${esc(PROVINCES[state.settings.province])} ${rate}%`)}
      <section class="panel"><h2>${y} estimate</h2>
        ${line('GST/HST collected on sales', money(s.totalCollected))}
        ${line('Potential input tax credits (ITCs)', `&minus; ${money(s.totalItc)}`)}
        ${line(s.net >= 0 ? 'Estimated net tax to remit' : 'Estimated refund', money(Math.abs(s.net)), 'total strong')}
        <p class="muted">An estimate from the GST/HST amounts you typed on income and expense records. It is not a GST/HST return. ${s.capitalTax ? `${money(s.capitalTax)} of GST/HST on equipment is left out because capital purchases follow a primary-use rule, not the business-use percentage.` : ''}</p>
      </section>
      ${keys.length > 1 || g.period !== 'annual' ? `<section class="panel"><h2>By filing period</h2><div class="table-wrap"><table class="table"><thead><tr><th>Period</th><th>Collected</th><th>ITCs</th><th>Net</th></tr></thead><tbody>${keys.map(k => `<tr><td>${k}</td><td>${money(s.periods[k].collected)}</td><td>${money(s.periods[k].itc)}</td><td><strong>${money(s.periods[k].collected - s.periods[k].itc)}</strong></td></tr>`).join('') || '<tr><td colspan="4">Nothing recorded yet.</td></tr>'}</tbody></table></div></section>` : ''}
      <section class="panel"><h2>Filing dates</h2>${due.map(d => line(`${esc(d.label)} <small>${esc(d.note)}</small>`, d.date)).join('')}
        <p class="muted">Standard due dates; confirm yours in CRA My Business Account. The app does not file or pay.</p></section>
      ${s.itc.length ? `<details class="review-group"><summary>Purchases with a potential ITC <span>${s.itc.length} &middot; ${money(s.totalItc)}</span></summary>${s.itc.map(c => `<div class="row static"><span class="row-main"><span class="row-title">${esc(c.rec.vendor || c.rec.category)}</span><span class="row-sub">${c.rec.date} &middot; ${esc(c.note)} &middot; ${money(c.paid)} tax paid</span></span><span class="row-amt"><strong>${money(c.amount)}</strong></span></div>`).join('')}</details>` : ''}
      ${s.noTax.length ? `<p class="callout">${s.noTax.length} business expense(s) of $30 or more have no GST/HST amount entered, so no credit is estimated for them. Open each expense and add the tax shown on the receipt.</p>` : ''}
      <section class="panel"><h2>Registration</h2><div class="fields">
        <label class="f"><span>GST/HST number</span><input type="text" data-g="number" value="${esc(g.number)}" placeholder="123456789 RT0001" autocomplete="off"></label>
        <label class="f half"><span>Filing period</span><select data-g="period">${Object.entries(PERIODS).map(([k, v]) => `<option value="${k}"${g.period === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f half"><span>Registered since</span><input type="date" data-g="since" value="${esc(g.since)}"></label>
      </div>
      <p class="muted">${esc(rule('gst-itc').summary)}</p>${cite('gst-itc')}
      <div class="btn-list"><button class="btn danger-text" data-reg="no">I am not registered</button></div></section>
      ${threshold}`;
  }
  root.onclick = async e => {
    const b = e.target.closest('[data-reg]');
    if (!b) return;
    g.asked = true; g.registered = b.dataset.reg === 'yes';
    await saveSettings();
  };
  $$('[data-g]', root).forEach(el => el.addEventListener('change', async () => { g[el.dataset.g] = el.value.trim(); await saveSettings(); }));
}

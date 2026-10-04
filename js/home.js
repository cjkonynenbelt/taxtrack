// Two calculators: business-use-of-home, and phone & internet.
// The maths is in calc.js (homeCalc); the rules and sources are in rules.js.

import { state, yearSettings, saveSettings } from './store.js';
import { summary, HOME_COSTS } from './calc.js';
import { cite, rule } from './rules.js';
import { head } from './views.js';
import { expenseForm } from './forms.js';
import { toast } from './ui.js';
import { $$, esc, money, num, pct } from './util.js';

const parse = v => { const t = String(v).replace(/[,\s$%]/g, ''); return t === '' || !Number.isFinite(Number(t)) ? null : Number(t); };
const line = (l, v, cls = '') => `<div class="line ${cls}"><span>${l}</span><span>${v}</span></div>`;
const numIn = (key, label, value, hint = '', half = true) => `<label class="f${half ? ' half' : ''}"><span>${esc(label)}</span><input type="text" inputmode="decimal" data-h="${key}" value="${value ?? ''}">${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
const yesNo = (key, label, value, hint = '') => `<div class="f"><span>${esc(label)}</span><div class="seg">${[['yes', 'Yes'], ['no', 'No']].map(([v, l]) => `<label><input type="radio" name="h-${key}" data-h="${key}" value="${v}"${(value === true && v === 'yes') || (value === false && v === 'no') ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;

// ---- business-use-of-home --------------------------------------------------

export function homeOffice(root) {
  const y = state.settings.year;
  const ys = yearSettings(y);
  const h = ys.home || (ys.home = { costs: {} });
  h.costs = h.costs || {};
  const s = summary(y);
  const c = s.home;
  const answered = h.principal != null && (h.principal || (h.exclusive != null && h.meetsClients != null));
  root.innerHTML = `
    ${head('Home office', '', `Business-use-of-home &middot; tax year ${y}`)}
    <section class="panel"><h2>1. Do you qualify?</h2>
      <p class="muted">${esc(rule('home-conditions').summary)}</p>
      <div class="fields">
        ${yesNo('principal', 'Is this work space your principal place of business?', h.principal, 'Where you mainly do the work of the business, such as calls, admin and planning, even if you also visit customers.')}
        ${yesNo('exclusive', 'Is the space used ONLY for business?', h.exclusive, 'No personal or family use at all. A kitchen table or a shared room is not exclusive.')}
        ${yesNo('meetsClients', 'Do you regularly meet clients or customers there?', h.meetsClients)}
        ${yesNo('regular', 'Do you work there on a regular, continuing basis?', h.regular)}
        ${numIn('people', 'People who use the space', h.people, 'Including you.')}
      </div>
      ${answered ? `<p class="verdict ${c.eligible ? 'green' : 'red'}"><span class="verdict-label">${c.eligible ? 'One of the CRA conditions appears to be met' : 'Conditions not met on these answers'}</span>${esc(c.why)}${c.eligible && h.regular === false ? ' You said you do not use it regularly; a space used only now and then is hard to support.' : ''}</p>` : '<p class="muted">Answer the questions to see whether a claim is possible.</p>'}
      ${cite('home-conditions')}
    </section>
    <section class="panel"><h2>2. How big is the work space?</h2>
      <div class="fields">
        ${numIn('workArea', 'Work space area (sq ft)', h.workArea)}
        ${numIn('totalArea', 'Total finished area of home (sq ft)', h.totalArea)}
        ${h.exclusive === false ? numIn('hoursPerDay', 'Hours a day used for business', h.hoursPerDay, 'Out of 24.') + numIn('daysPerWeek', 'Days a week', h.daysPerWeek, 'Out of 7.') : ''}
      </div>
      ${line('Area share', pct(c.areaPct))}
      ${h.exclusive === false ? line('Reduced for personal use of the space', `&times; ${pct(c.timeFactor)}`) : ''}
      ${line('Share of home costs', pct(c.share, 2), 'total')}
      <p class="muted">This is the actual area, not a percentage that feels safe. There is no "20 to 25% is fine" rule.</p>
    </section>
    <section class="panel"><h2>3. Home costs for ${y}</h2>
      <p class="muted">Whole-home amounts for the year (or for the months you used the space). Enter rent OR mortgage interest and property tax, not both. Never include mortgage principal.</p>
      <div class="fields">${HOME_COSTS.map(([k, l]) => numIn(`cost.${k}`, l, h.costs[k])).join('')}
        ${numIn('carryIn', 'Unused amount carried forward from last year', h.carryIn, 'From last year\'s T2125 Part 7, if any.', false)}</div>
    </section>
    <section class="panel"><h2>4. Result</h2>
      ${line('Total home costs', money(c.costs))}
      ${line(`Work-space share (${pct(c.share, 2)})`, money(c.costs * c.share))}
      ${c.carryIn ? line('Carried forward from last year', money(c.carryIn)) : ''}
      ${line('Allowable before the income limit', money(c.allowable))}
      ${line('Net business income before this claim', money(s.net + c.counted))}
      ${line(`Potentially claimable for ${y}`, c.eligible ? money(c.claim) : 'Not eligible', 'total strong')}
      ${c.eligible && c.carryForward > 0 ? line('Carried forward to next year', money(c.carryForward)) : ''}
      <p class="muted">The claim cannot be more than net business income before it, so it can never create or increase a loss. ${c.eligible && c.claim < c.allowable ? 'Your income so far limits the claim; the rest carries forward.' : ''}</p>
      ${cite('home-limit')}
      <label class="check f"><input type="checkbox" data-h="include"${h.include ? ' checked' : ''}${c.eligible ? '' : ' disabled'}><span>Include this amount in my estimates</span></label>
      ${s.exp.homeTotal > 0 ? `<p class="callout">You also have ${money(s.exp.homeTotal)} recorded as "Home office" expenses in the expense list. Use one or the other so nothing is counted twice: either this calculator, or those expense records.</p>` : ''}
    </section>
    <section class="note"><p>${esc(rule('home-cca').summary)}</p>${cite('home-cca')}</section>`;
  $$('[data-h]', root).forEach(el => el.addEventListener('change', async () => {
    const k = el.dataset.h;
    if (el.type === 'radio') h[k] = el.value === 'yes';
    else if (el.type === 'checkbox') h[k] = el.checked;
    else if (k.startsWith('cost.')) h.costs[k.slice(5)] = parse(el.value);
    else h[k] = parse(el.value);
    if (h.totalArea && h.workArea > h.totalArea) toast('The work space is larger than the whole home. Check the areas.');
    await saveSettings();
  }));
}

// ---- phone & internet ------------------------------------------------------

const KINDS = { phone: ['Cell phone plan', 'Phone'], internet: ['Internet', 'Internet'], line2: ['Second line (business only)', 'Phone'], data: ['Data plan / hotspot', 'Phone'] };

export function phone(root) {
  const lines = state.settings.phoneLines;
  const annual = lines.reduce((t, l) => t + (Number(l.monthly) || 0) * (Number(l.pct) || 0) / 100 * 12, 0);
  root.innerHTML = `
    ${head('Phone & internet', '<button class="btn primary" data-add>+ Add service</button>', 'Work out the business share of monthly service costs.')}
    ${lines.length ? lines.map((l, i) => {
      const biz = (Number(l.monthly) || 0) * (Number(l.pct) || 0) / 100;
      return `<section class="panel"><div class="fields">
        <label class="f half"><span>Service</span><select data-p="${i}.kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${l.kind === k ? ' selected' : ''}>${v[0]}</option>`).join('')}</select></label>
        <label class="f half"><span>Provider (optional)</span><input type="text" data-p="${i}.label" value="${esc(l.label || '')}"></label>
        <label class="f half"><span>Monthly cost</span><input type="text" inputmode="decimal" data-p="${i}.monthly" value="${l.monthly ?? ''}"></label>
        <label class="f half"><span>Business use %</span><input type="text" inputmode="decimal" data-p="${i}.pct" value="${l.pct ?? ''}"></label>
      </div>
      ${line('Potential business portion', `${money(biz)} / month`)}
      ${line('Over 12 months', money(biz * 12), 'total')}
      <div class="btn-list"><button class="btn small" data-rec="${i}">Record this month's bill</button><button class="btn small danger-text" data-del="${i}">Remove</button></div></section>`;
    }).join('') : '<p class="empty">No services added. Add your cell plan or internet to see the business share.</p>'}
    ${lines.length ? `<section class="panel">${line('All services, potential business portion per year', money(annual), 'total strong')}
      <p class="muted">An estimate only. This calculator does not add anything to your records: use "Record this month's bill" so each payment exists as an expense with its receipt.</p></section>` : ''}
    <section class="note"><p>${esc(rule('phone-utilities').summary)}</p>
      <p>Buying the phone, a modem or a router is equipment, not a service cost. Record those under Assets &amp; equipment.</p>${cite('phone-utilities')}</section>`;
  root.onclick = async e => {
    if (e.target.closest('[data-add]')) { lines.push({ kind: 'phone', label: '', monthly: null, pct: null }); await saveSettings(); return; }
    const del = e.target.closest('[data-del]');
    if (del) { lines.splice(Number(del.dataset.del), 1); await saveSettings(); return; }
    const rec = e.target.closest('[data-rec]');
    if (rec) {
      const l = lines[Number(rec.dataset.rec)];
      const full = Number(l.pct) >= 100;
      expenseForm({ group: 'other', category: KINDS[l.kind][1], amount: l.monthly || undefined, vendor: l.label || '', use: full ? 'business' : 'mixed', businessPct: full ? null : l.pct });
    }
  };
  $$('[data-p]', root).forEach(el => el.addEventListener('change', async () => {
    const [i, k] = el.dataset.p.split('.');
    lines[i][k] = k === 'monthly' ? parse(el.value) : k === 'pct' ? Math.min(100, Math.max(0, parse(el.value) || 0)) : el.value.trim();
    await saveSettings();
  }));
}

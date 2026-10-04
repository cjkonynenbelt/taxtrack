// Assets & CCA: one schedule for the tax year across vehicles and equipment,
// grouped by CCA class - opening UCC, additions, dispositions, CCA, closing UCC.
// Classes are suggestions the user can override on each asset.
//
// Simplification to know about: the app tracks each asset's balance on its own.
// CRA pools all property of a class together, so recapture and terminal loss
// depend on the whole class. Dispositions are therefore shown as "possible".

import { state, all } from './store.js';
import { schedule, assetName, CCA_RULES } from './cca.js';
import { equipSchedule, EQUIP_RULES } from './equip.js';
import { cite, rule, statusBadge } from './rules.js';
import { head } from './views.js';
import { esc, money, num, round2, sum, yearOf } from './util.js';

const MEGA_FROM = '2026-09-15';
const rateOf = cls => (CCA_RULES.classes[cls] || EQUIP_RULES.classes[cls] || {}).rate;

// One line per depreciable asset that exists in `year`.
export function ccaRows(year) {
  const rows = [];
  const push = (kind, rec, name, cls, cost, date, sch, href) => {
    const start = yearOf(date);
    if (!start || start > year) return;
    const r = sch.find(x => x.year === year);
    if (!r && cls) return;
    const disposed = rec.disposedYear === year;
    const proceeds = disposed ? Math.min(Number(rec.salePrice) || 0, cost) : 0;
    const open = start === year ? 0 : r ? r.open : 0;
    const addition = start === year ? cost : 0;
    const after = round2((r ? r.open : 0) - proceeds);
    rows.push({
      kind, rec, name, cls, cost, date, href, first: start === year, disposed, proceeds,
      open, addition, cca: r ? r.cca : 0, pct: r ? r.pct : 0, deductible: r ? r.deductible : 0,
      close: disposed ? 0 : r ? r.close : 0,
      recapture: disposed && after < 0 ? -after : 0,
      terminal: disposed && after > 0 && cls !== '10.1' ? after : 0,
      rule: rec.firstYearRule === 'full' ? 'full' : 'half',
      mega: (rec.condition || 'new') !== 'used' && date >= MEGA_FROM ? (kind === 'vehicle' ? 'maybe' : 'yes') : null,
    });
  };
  for (const a of all('asset')) {
    if (a.status === 'potential') continue;
    const s = schedule(a, year);
    push('vehicle', a, assetName(a), s.c.cls, s.c.capitalCost, a.purchaseDate, s.rows, `#/asset/${a.id}`);
  }
  for (const e of all('equip')) {
    const s = equipSchedule(e, year);
    if (s.t.kind !== 'capital' || s.t.cost == null) continue;
    push('equipment', e, e.name || e.category, s.t.cls, s.t.cost, e.date, s.rows, `#/equip/${e.id}`);
  }
  return rows;
}

export function ccaView(root) {
  const y = state.settings.year;
  const rows = ccaRows(y);
  const classes = [...new Set(rows.map(r => r.cls || '?'))].sort((a, b) => Number(a) - Number(b));
  const tot = fn => money(sum(rows, fn));
  const mega = rows.filter(r => r.mega && r.first);
  root.innerHTML = `
    ${head('Assets & CCA', '<a class="btn" href="#/equipment">Equipment</a> <a class="btn" href="#/assets">Vehicles</a>', `Capital cost allowance schedule &middot; tax year ${y}`)}
    ${rows.length ? `<section class="panel"><h2>${y} summary</h2>
      <div class="line"><span>Opening UCC</span><span>${tot(r => r.open)}</span></div>
      <div class="line"><span>Additions in ${y}</span><span>${tot(r => r.addition)}</span></div>
      <div class="line"><span>Dispositions (proceeds, up to cost)</span><span>${tot(r => r.proceeds)}</span></div>
      <div class="line"><span>CCA available (estimate)</span><span>${tot(r => r.cca)}</span></div>
      <div class="line total strong"><span>Business share of CCA</span><span>${tot(r => r.deductible)}</span></div>
      <div class="line"><span>Closing UCC</span><span>${tot(r => r.close)}</span></div>
      <p class="muted">Opening UCC + additions &minus; dispositions &minus; CCA = closing UCC, which is next year's opening balance. CCA is optional: claim less in a year and more stays for later. ${state.settings.includeCca === false ? 'CCA is currently left out of your estimates (Settings).' : ''}</p></section>` : ''}
    ${classes.map(cls => {
      const list = rows.filter(r => (r.cls || '?') === cls);
      const rate = rateOf(cls);
      return `<section class="panel"><h2>${cls === '?' ? 'Class not determined' : `Suggested Class ${cls} <small>${rate ? `${Math.round(rate * 100)}% declining balance` : ''}</small>`}</h2>
        <div class="table-wrap"><table class="table"><thead><tr><th>Asset</th><th>Opening UCC</th><th>Additions</th><th>Disposed</th><th>CCA</th><th>Business %</th><th>Deductible</th><th>Closing UCC</th></tr></thead>
        <tbody>${list.map(r => `<tr data-href="${r.href}"><td><a href="${r.href}">${esc(r.name)}</a><br><small>${r.first ? `acquired ${r.date} &middot; ${r.rule === 'full' ? 'full first-year rate' : 'half-year rule'}` : `acquired ${yearOf(r.date)}`}${r.disposed ? ' &middot; disposed' : ''}</small></td>
          <td>${money(r.open)}</td><td>${r.addition ? money(r.addition) : '—'}</td><td>${r.disposed ? money(r.proceeds) : '—'}</td><td>${money(r.cca)}</td><td>${num(r.pct)}%</td><td><strong>${money(r.deductible)}</strong></td><td>${money(r.close)}</td></tr>`).join('')}</tbody></table></div>
        ${cls === '?' ? '<p class="callout">No CCA is estimated until a class is chosen. Open the asset and pick the class after reviewing it, or ask a tax professional.</p>' : ''}
        ${list.filter(r => r.recapture || r.terminal).map(r => `<p class="callout">${esc(r.name)}: possible ${r.recapture ? `recapture of ${money(r.recapture)} (added to income)` : `terminal loss of ${money(r.terminal)} (deductible)`}. This depends on the whole class balance, which the app does not pool. Confirm with a tax professional.</p>`).join('')}
        ${list.some(r => r.disposed && cls === '10.1') ? '<p class="muted">Class 10.1 vehicles have no recapture or terminal loss; half the normal CCA may be claimable in the year of sale.</p>' : ''}</section>`;
    }).join('') || '<p class="empty">No capital assets recorded. Add computers, tools and furniture under Equipment, and vehicles under Vehicles. A purchase that lasts beyond the year is claimed here over time, not as an expense.</p>'}
    ${mega.length ? `<section class="panel update"><p class="update-top">${statusBadge('proposed')}</p><h3>${esc(rule('mega-deduction').title)}: what it could mean for these purchases</h3>
      ${mega.map(r => `<div class="line"><span>${esc(r.name)} <small>${r.mega === 'maybe' ? 'vehicles in Classes 10 and 10.1 may be excluded' : `acquired ${r.date}`}</small></span><span>${r.mega === 'maybe' ? 'uncertain' : `up to ${money(round2(r.cost * r.pct / 100))}`}</span></div>`).join('')}
      <p class="muted">Shown for information only and not included in any total. Under the proposal the first-year claim could be up to 100% of cost instead of the amount above, limited for individuals to business income (it cannot create a loss). The total deducted over the life of the asset is the same; only the timing changes. Do not rely on it until it is enacted.</p>${cite('mega-deduction')}</section>` : ''}
    <section class="note"><p>${esc(rule('cca-half-year').summary)}</p>${cite('cca-half-year')}<p>${esc(rule('cca-disposal').summary)}</p>${cite('cca-disposal')}</section>`;
  root.onclick = e => { const tr = e.target.closest('tr[data-href]'); if (tr && !e.target.closest('a')) location.hash = tr.dataset.href; };
}

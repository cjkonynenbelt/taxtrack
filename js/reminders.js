// Reminder centre: looks at the records and says what is missing, what is due
// and what looks inconsistent. Nothing here changes a record.
//
// Reminders appear inside the app only. A web app on GitHub Pages cannot send
// push notifications without a server, so deadlines can instead be exported to
// your phone's calendar (.ics), which does notify you.

import { state, all, saveSettings } from './store.js';
import { summary, inYear, cadOf, vehicleYear, mileageWarnings } from './calc.js';
import { CATEGORIES, LARGE_PURCHASE } from './reference.js';
import { deadlines, VALUES, cite } from './rules.js';
import { smallSupplier, gstDue } from './gst.js';
import { head } from './views.js';
import { tripForm } from './mileage.js';
import { scanReceipt } from './scan.js';
import { esc, money, num, today, fmtDate, download, sum, monthOf, yearOf } from './util.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const daysUntil = iso => Math.round((new Date(`${iso}T12:00:00`) - new Date(`${today()}T12:00:00`)) / 86400000);

// kind: 'issue' (something looks wrong or incomplete), 'task' (a date is coming), 'habit' (routine record-keeping)
export function reminders(year = state.settings.year) {
  const out = [];
  const add = (kind, key, title, detail, href, extra = {}) => out.push({ kind, key, title, detail, href, ...extra });
  const s = summary(year);
  const now = today();
  const thisYear = yearOf(now) === year;
  const month = monthOf(now);
  const exps = inYear('expense', year);
  const biz = exps.filter(e => e.use !== 'personal');
  const inMonth = list => list.filter(r => thisYear && monthOf(r.date) === month);

  // -- missing or inconsistent records --------------------------------------
  const fuelMonth = inMonth(exps).filter(e => e.group === 'vehicle' && e.category === 'Fuel').length;
  const tripsMonth = inMonth(inYear('trip', year)).filter(t => t.type !== 'personal').length;
  if (fuelMonth >= 3 && tripsMonth < fuelMonth) add('issue', `fuel-${now.slice(0, 7)}`, `${plural(fuelMonth, 'fuel purchase')} this month but only ${plural(tripsMonth, 'business trip')} logged`, 'Would you like to update your mileage log? Fuel is only deductible for the business share of driving, and that share comes from the log.', '#/trips');

  const noReceipt = biz.filter(e => !e.receiptId);
  if (noReceipt.length) add('issue', 'receipts', `${plural(noReceipt.length, 'business expense')} without a receipt`, `${money(sum(noReceipt, e => cadOf(e) || 0))} in total. Attach the receipt or invoice while you can still find it.`, '#/expenses');

  const meals = biz.filter(e => (CATEGORIES[e.category] || {}).meals);
  const mealsNoPurpose = meals.filter(e => !e.purpose || !e.attendees);
  if (mealsNoPurpose.length) add('issue', 'meals', `${money(sum(meals, e => cadOf(e) || 0))} of meals, ${mealsNoPurpose.length} without who attended and why`, 'Meals need the names of the people and the business reason. Add what actually happened; leave it as personal if there was no business reason.', '#/expenses');

  const bigOnes = biz.filter(e => e.group !== 'vehicle' && !(CATEGORIES[e.category] || {}).capital && !(CATEGORIES[e.category] || {}).home && (cadOf(e) || 0) >= LARGE_PURCHASE && !['Travel', 'Business insurance', 'Accounting & professional fees', 'Advertising & marketing', 'Contractors & wages', 'Rent'].includes(e.category) && !e.reviewed);
  for (const e of bigOnes.slice(0, 3)) add('issue', `capital-${e.id}`, `${money(cadOf(e))} at ${e.vendor || e.category} may be a capital asset`, 'A purchase that lasts beyond the year is usually claimed through CCA rather than as a normal expense. Review the classification.', '#/needs-review');

  const uncategorized = biz.filter(e => e.group !== 'vehicle' && e.category === 'Other');
  if (uncategorized.length) add('issue', 'uncat', `${plural(uncategorized.length, 'uncategorized expense')}`, 'Pick the category that fits so it lands on the right line.', '#/expenses');

  const noPurpose = biz.filter(e => e.group !== 'vehicle' && !e.purpose && (cadOf(e) || 0) >= 50);
  if (noPurpose.length) add('issue', 'purpose', `${plural(noPurpose.length, 'expense')} with no business purpose noted`, 'A short note of what each was for is the easiest record to lose and the hardest to rebuild later.', '#/expenses');

  for (const v of s.km.vehicles) {
    const src = vehicleYear(v.name, year);
    const active = v.bizTrips > 0 || s.exp.items.some(x => x.e.group === 'vehicle');
    if (!active) continue;
    if (src.odoStart == null) add('issue', `odo-start-${v.name}`, `${v.name}: beginning-of-year odometer not recorded`, `CRA expects the reading at the start and end of ${year}.`, '#/trips');
    if (src.odoEnd == null && (!thisYear || month === 12)) add('issue', `odo-end-${v.name}`, `${v.name}: end-of-year odometer not recorded`, 'Take the reading on December 31, or as close to it as you can.', '#/trips');
    if (v.total > 0 && !v.totalIsWeak && v.business / v.total < 0.3 && v.business > 0) add('issue', `odo-low-${v.name}`, `${v.name}: ${num(v.total)} total km but only ${num(v.business)} business km`, 'If business trips are missing from the log, add the ones you can support. If that is right, the business share of vehicle costs is small.', '#/trips');
  }
  for (const w of mileageWarnings(year).slice(0, 3)) add('issue', `km-${w.slice(0, 40)}`, 'Mileage log needs attention', w, '#/trips');

  if (s.income.unconverted) add('issue', 'fx', `${plural(s.income.unconverted, 'USD payment')} with no exchange rate`, 'They are left out of CAD totals until you add the rate or the CAD amount received.', '#/income');
  const due = s.expected.filter(x => x.period <= now.slice(0, 7)).length;
  if (due) add('issue', 'expected', `${plural(due, 'expected payment')} not confirmed`, 'Confirm what you actually received so income is complete.', '#/recurring');
  const classless = s.cca.undetermined + s.equip.undetermined;
  if (classless) add('issue', 'cca', `${plural(classless, 'asset')} without a CCA class`, 'Review the suggested classification before year-end.', '#/cca');
  if (s.exp.homeTotal > 0 && !s.home.set) add('issue', 'home', 'Home expenses recorded but the home office calculator is not done', 'Whether any of it is claimable depends on the CRA conditions.', '#/homeoffice');

  // -- GST/HST ---------------------------------------------------------------
  const g = state.settings.gst;
  const ss = smallSupplier();
  if (!g.asked) add('issue', 'gst-ask', 'GST/HST status not set', 'Tell the app whether you are registered so it knows how to treat the GST you pay and collect.', '#/gst');
  else if (!g.registered && (ss.overFour || ss.overOne)) add('issue', 'gst-over', `Income over ${money(VALUES.gstThreshold.value, 'CAD', 0)} in the last four quarters`, 'You may be required to register for GST/HST. Confirm with a tax professional how it applies to your income.', '#/gst', { rule: 'gst-small-supplier' });
  else if (!g.registered && ss.near) add('issue', 'gst-near', 'Approaching the GST/HST registration threshold', `${money(ss.last4)} of ${money(ss.limit, 'CAD', 0)} over the last four quarters.`, '#/gst', { rule: 'gst-small-supplier' });

  // -- dated tasks -----------------------------------------------------------
  const dated = [...deadlines(year - 1), ...deadlines(year), ...gstDue(year - 1).map((d, i) => ({ key: `gst-${year - 1}-${i}`, date: d.date, title: `GST/HST return: ${d.label}`, detail: d.note, rule: 'gst-itc' })), ...gstDue(year).map((d, i) => ({ key: `gst-${year}-${i}`, date: d.date, title: `GST/HST return: ${d.label}`, detail: d.note, rule: 'gst-itc' }))];
  for (const d of dated) {
    const n = daysUntil(d.date);
    if (n < -30 || n > 120) continue;
    if (d.key === 'odo-end' && n > 31) continue;
    add('task', `${d.key}-${d.date}`, d.title, d.detail, null, { date: d.date, days: n, rule: d.rule, conditional: d.conditional });
  }
  if (thisYear && month >= 11) add('task', `yearend-${year}`, 'Year-end bookkeeping', 'Work through the year-end checklist while the year is still fresh.', '#/review', { date: `${year}-12-31`, days: daysUntil(`${year}-12-31`) });

  // -- habits ----------------------------------------------------------------
  const last = list => list.map(r => r.date).sort().pop();
  const lastTrip = last(all('trip')), lastExp = last(all('expense'));
  const stale = (iso, n) => !iso || daysUntil(iso) < -n;
  if (stale(lastTrip, 3)) add('habit', `trip-${now}`, 'Log today\'s business mileage', lastTrip ? `Last trip logged ${fmtDate(lastTrip)}.` : 'No trips logged yet.', null, { act: 'trip' });
  if (stale(lastExp, 7)) add('habit', `exp-${now.slice(0, 7)}`, 'Upload recent receipts', lastExp ? `Last expense recorded ${fmtDate(lastExp)}.` : 'No expenses recorded yet.', null, { act: 'scan' });
  const day = Number(now.slice(8, 10));
  if (day >= 25 || day <= 5) add('habit', `month-${now.slice(0, 7)}`, 'Monthly review', 'Check this month\'s income and expenses against your bank and card statements.', '#/months');
  const backup = state.settings.lastBackup;
  if (all('expense').length + all('income').length > 0 && stale(backup && backup.slice(0, 10), 30)) add('habit', `backup-${now.slice(0, 7)}`, 'Download a backup', backup ? `Last backup ${fmtDate(backup.slice(0, 10))}. Your records exist only on this device.` : 'You have never downloaded a backup. Your records exist only on this device.', '#/export');
  const oldest = Math.min(...['income', 'expense', 'trip'].flatMap(k => all(k).map(r => yearOf(r.date))).filter(Boolean), year);
  if (oldest <= year - VALUES.retentionYears.value) add('habit', 'retention', 'Record retention', `Records from ${oldest} may be past the six-year period. Do not delete anything without checking the rule; long-term asset records are kept longer.`, '#/learn/records', { rule: 'records-retention' });

  const dismissed = state.settings.dismissed || {};
  return out.filter(r => !dismissed[r.key]);
}

export const counts = (year = state.settings.year) => {
  const list = reminders(year);
  return { issues: list.filter(r => r.kind === 'issue').length, tasks: list.filter(r => r.kind === 'task').length, habits: list.filter(r => r.kind === 'habit').length, list };
};

// Deadlines as a calendar file, so the phone's own calendar can send the alerts.
export function exportCalendar(year = state.settings.year) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const events = [...deadlines(year), ...gstDue(year).map((d, i) => ({ key: `gst-${i}`, date: d.date, title: `GST/HST return: ${d.label}`, detail: d.note }))];
  const text = v => String(v).replace(/([,;\\])/g, '\\$1');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TaxTrack//EN',
    ...events.flatMap(d => ['BEGIN:VEVENT', `UID:taxtrack-${year}-${d.key}@taxtrack`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d.date.replace(/-/g, '')}`, `SUMMARY:${text(d.title)}`, `DESCRIPTION:${text(`${d.detail} Confirm the date with CRA.`)}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Tax date', 'TRIGGER:-P7D', 'END:VALARM', 'END:VEVENT']),
    'END:VCALENDAR'].join('\r\n');
  download(`taxtrack-${year}-tax-dates.ics`, ics, 'text/calendar');
}

export function remindersView(root) {
  const year = state.settings.year;
  const { list } = counts(year);
  const hidden = Object.keys(state.settings.dismissed || {}).length;
  const item = r => `<div class="rem">
      <div class="rem-main">${r.date ? `<span class="rem-date${r.days < 0 ? ' late' : r.days <= 14 ? ' soon' : ''}">${fmtDate(r.date)} &middot; ${r.days < 0 ? `${-r.days} days ago` : r.days === 0 ? 'today' : `in ${r.days} days`}</span>` : ''}
        <strong>${esc(r.title)}</strong><span class="muted">${esc(r.detail)}</span>${r.rule ? cite(r.rule) : ''}</div>
      <div class="rem-acts">${r.href ? `<a class="btn small" href="${r.href}">Open</a>` : ''}${r.act ? `<button class="btn small primary" data-act="${r.act}">${r.act === 'trip' ? '+ Business trip' : 'Scan receipt'}</button>` : ''}<button class="btn small" data-dismiss="${esc(r.key)}" aria-label="Dismiss">Dismiss</button></div>
    </div>`;
  const group = (kind, title, emptyText) => { const rows = list.filter(r => r.kind === kind); return `<section class="panel"><h2>${title} <small>${rows.length || ''}</small></h2>${rows.length ? rows.sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(item).join('') : `<p class="empty">${emptyText}</p>`}</section>`; };
  root.innerHTML = `
    ${head('Reminders', '<button class="btn" data-ics>Add dates to calendar</button>', `Tax year ${year}`)}
    ${group('issue', 'Records to fix or confirm', 'Nothing missing in your records right now.')}
    ${group('task', 'Upcoming tax dates', 'No dates in the next four months.')}
    ${group('habit', 'Routine', 'You are up to date.')}
    <p class="muted">Reminders are worked out from your records each time you open this page; they show inside the app only. "Add dates to calendar" downloads a calendar file so your phone can alert you a week before each date. Dates are standard ones and move to the next business day on weekends; confirm them with CRA.${hidden ? ` <button class="link-back" data-restore>Show ${hidden} dismissed</button>` : ''}</p>`;
  root.onclick = async e => {
    const d = e.target.closest('[data-dismiss]');
    if (d) { state.settings.dismissed = { ...(state.settings.dismissed || {}), [d.dataset.dismiss]: today() }; await saveSettings(); return; }
    if (e.target.closest('[data-restore]')) { state.settings.dismissed = {}; await saveSettings(); return; }
    if (e.target.closest('[data-ics]')) { exportCalendar(year); return; }
    const a = e.target.closest('[data-act]');
    if (a) (a.dataset.act === 'trip' ? tripForm() : scanReceipt());
  };
}

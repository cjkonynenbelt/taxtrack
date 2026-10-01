// Mileage tracker: Start/Stop trips (optional GPS), trip form with odometer
// mode, the Mileage page (dashboard, history, monthly, vehicles) and vehicle
// odometer records.
//
// GPS notes (kept honest on purpose):
//  - Off by default. Location is requested only when the user ticks "Use GPS".
//  - A web app can only read location while it is open on screen. If the phone
//    locks or another app is opened, tracking pauses and the distance is short.
//    The trip is then flagged so the user checks the figure or uses the odometer.
//  - Only the running distance is kept. No coordinates or routes are stored.
//  - Automatic trip detection is not possible from a web app, so it is not offered.

import { state, all, byId, save, remove, resolveCustomer, customerName, saveSettings, saveQuiet } from './store.js';
import { kmSummary, mileageByMonth, mileageWarnings, inYear, normVehicle } from './calc.js';
import { installationForm } from './forms.js';
import { openForm, confirmDialog, toast } from './ui.js';
import { TRIP_PURPOSES, PERSONAL } from './reference.js';
import { exportCsv, exportMileagePdf } from './export.js';
import { head, stat, filterBar, wireFilters, passes, customerOptions } from './views.js';
import { $, esc, num, pct, today, fmtDate, yearOf, round2, MONTHS, sum } from './util.js';

const Y = () => state.settings.year;
export const GPS_UNAVAILABLE = 'GPS unavailable — please enter your kilometres manually.';
const uniq = list => [...new Set(list.filter(Boolean))];
const hhmm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const km1 = v => num(v, v % 1 ? 1 : 0);

const lastTrip = () => [...all('trip')].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || null;

// Highest odometer reading on record for a vehicle (from trips and year totals).
function lastOdometer(vehicle) {
  const readings = all('trip').filter(t => normVehicle(t.vehicle) === vehicle && t.odoEnd != null).map(t => t.odoEnd);
  const info = (state.settings.vehicleInfo[vehicle] || {}).years || {};
  for (const y of Object.values(info)) { if (y.odoEnd != null) readings.push(y.odoEnd); if (y.odoStart != null) readings.push(y.odoStart); }
  return readings.length ? Math.max(...readings) : null;
}

function startPlaces() {
  const s = state.settings;
  const last = lastTrip();
  return uniq([s.homeBase, s.officeBase, last && last.to, ...all('customer').map(c => c.name)]);
}

// ---- trip form (manual / after the fact) ------------------------------------

export function tripForm(rec = {}) {
  if (rec.sourceType === 'installation' && byId('installation', rec.sourceId)) return installationForm(byId('installation', rec.sourceId));
  const s = state.settings;
  const values = {
    date: today(), from: s.homeBase || 'Home', purpose: TRIP_PURPOSES[0], vehicle: s.defaultVehicle,
    mode: rec.odoStart != null && rec.odoEnd != null ? 'odo' : rec.id || rec.km ? 'km' : s.tripMode || 'km',
    ...rec, customerName: customerName(rec.customerId),
  };
  if (rec.type === 'personal') values.purpose = PERSONAL;
  values.vehicle = normVehicle(values.vehicle);
  const business = v => v.purpose !== PERSONAL;
  const odo = v => v.mode === 'odo';
  const lastOdo = lastOdometer(values.vehicle);
  openForm({
    title: rec.id ? 'Edit trip' : rec._repeat ? 'Repeat trip' : 'Add trip',
    intro: rec._repeat ? 'Filled in from your last trip. Confirm the distance or odometer, then save.' : '',
    values,
    openAdvanced: !!rec.id,
    fields: [
      { name: 'to', label: 'Destination', type: 'text', required: true, focus: !rec._repeat, list: uniq([...all('trip').map(t => t.to), ...all('customer').map(c => c.name)]) },
      { name: 'purpose', label: 'What was this trip for?', type: 'select', options: uniq([...TRIP_PURPOSES, rec.purpose, PERSONAL]) },
      { name: 'customerName', label: 'Customer / business', type: 'text', list: all('customer').map(c => c.name).sort(), showIf: business },
      { name: 'detail', label: 'Business purpose', type: 'text', placeholder: 'e.g. Installation for ABC Adventures', showIf: business, hint: 'Required for business trips. Filled in from the customer if you leave it blank.' },
      { name: 'mode', label: 'Distance from', type: 'seg', options: [{ value: 'km', label: 'Kilometres' }, { value: 'odo', label: 'Odometer (most reliable)' }] },
      { name: 'km', label: 'Kilometres', type: 'number', showIf: v => !odo(v) },
      { name: 'odoStart', label: 'Starting odometer', type: 'number', half: true, showIf: odo },
      { name: 'odoEnd', label: 'Ending odometer', type: 'number', half: true, showIf: odo },
      { name: 'odoLine', type: 'info', showIf: odo, render: v => (v.odoStart != null && v.odoEnd != null && v.odoEnd >= v.odoStart ? `Distance: <strong>${km1(round2(v.odoEnd - v.odoStart))} km</strong>` : lastOdo != null ? `Last odometer on record for ${esc(values.vehicle)}: ${num(lastOdo)} km` : '') },
      { name: 'date', label: 'Date', type: 'date', required: true, advanced: true, half: true },
      { name: 'vehicle', label: 'Vehicle', type: 'select', options: () => s.vehicles, advanced: true, half: true },
      { name: 'from', label: 'Starting location', type: 'text', advanced: true, list: startPlaces(), hint: 'Home, office, your previous destination, a customer, or type any place.' },
      { name: 'startTime', label: 'Start time', type: 'text', inputType: 'time', advanced: true, half: true },
      { name: 'endTime', label: 'End time', type: 'text', inputType: 'time', advanced: true, half: true },
      { name: 'notes', label: 'Notes', type: 'textarea', advanced: true, placeholder: 'e.g. Installed terminal and trained staff.' },
    ],
    async onSave(v) {
      const isBiz = business(v);
      let km = v.km;
      if (odo(v)) {
        if (v.odoStart == null || v.odoEnd == null) throw new Error('Enter both the starting and ending odometer.');
        if (v.odoEnd < v.odoStart) throw new Error('Ending odometer is lower than the starting odometer.');
        km = round2(v.odoEnd - v.odoStart);
      }
      if (!(km > 0)) throw new Error('Enter the kilometres driven.');
      let detail = v.detail;
      if (isBiz && !detail) {
        if (!v.customerName) throw new Error('Add a short business purpose, e.g. "Sales meeting with ABC Adventures".');
        detail = `${v.purpose} for ${v.customerName}`;
      }
      if (v.startTime && v.endTime && v.endTime < v.startTime) throw new Error('End time is before start time.');
      const { customerName: cn, odoLine, mode, _repeat, ...clean } = v;
      await save('trip', {
        ...clean, km, detail: isBiz ? detail : null,
        type: isBiz ? 'business' : 'personal',
        odoStart: odo(v) ? v.odoStart : null, odoEnd: odo(v) ? v.odoEnd : null,
        distanceSource: odo(v) ? 'odometer' : rec.distanceSource === 'gps' && km === rec.km ? 'gps' : 'manual',
        durationMin: v.startTime && v.endTime ? minutesBetween(v.startTime, v.endTime) : null,
        customerId: isBiz ? await resolveCustomer(cn) : null,
      });
      if (s.tripMode !== mode) { s.tripMode = mode; await saveQuiet(); }
      toast(yearOf(v.date) !== s.year ? `Saved under tax year ${yearOf(v.date)} (you are viewing ${s.year}).` : 'Trip saved.');
    },
    onDelete: rec.id ? async () => {
      if (!(await confirmDialog('Delete this trip?', { detail: 'This cannot be undone.' }))) return false;
      await remove('trip', rec.id);
      toast('Deleted.');
      return true;
    } : null,
  });
}

const minutesBetween = (a, b) => { const [h1, m1] = a.split(':').map(Number), [h2, m2] = b.split(':').map(Number); return h2 * 60 + m2 - (h1 * 60 + m1); };

export function repeatLastTrip() {
  const t = lastTrip();
  if (!t) return toast('No previous trip to repeat yet.');
  // Same route details; the distance is shown for confirmation and odometer readings are never copied.
  tripForm({ _repeat: true, to: t.to, from: t.from, purpose: t.type === 'personal' ? PERSONAL : t.purpose, type: t.type, detail: t.detail, customerId: t.customerId, vehicle: t.vehicle, km: t.km });
}

// ---- live trip (Start / Stop) ----------------------------------------------

let watchId = null, lastFix = null, wakeLock = null, lastSave = 0;
export const activeTrip = () => state.settings.activeTrip;

function metres(a, b) {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function onFix(pos) {
  const a = activeTrip();
  if (!a) return;
  const c = pos.coords;
  if (c.accuracy > 60) return; // too imprecise to count
  const p = { lat: c.latitude, lon: c.longitude, t: pos.timestamp };
  if (!lastFix) { lastFix = p; a.fixes = (a.fixes || 0) + 1; return; }
  const d = metres(lastFix, p), dt = (p.t - lastFix.t) / 1000;
  if (d < Math.max(20, c.accuracy)) return;  // standing still / GPS jitter
  if (dt > 0 && d / dt > 70) return;         // impossible jump
  if (dt > 120) a.interrupted = true;        // tracking paused; only the straight line is counted
  a.km = (a.km || 0) + d / 1000;
  a.fixes = (a.fixes || 0) + 1;
  lastFix = p;
  if (Date.now() - lastSave > 20000) { lastSave = Date.now(); saveQuiet(); }
}

function onGpsError(err) {
  const a = activeTrip();
  if (!a) return;
  if (err && err.code === 1) { a.gps = false; a.gpsError = true; stopWatch(); saveQuiet(); paintBanner(); }
}

async function keepAwake() {
  try { if ('wakeLock' in navigator && !document.hidden) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* not supported or refused */ }
}

function startWatch() {
  const a = activeTrip();
  if (!a || !a.gps || !navigator.geolocation || watchId != null) return;
  watchId = navigator.geolocation.watchPosition(onFix, onGpsError, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  keepAwake();
}

function stopWatch() {
  if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
  watchId = null; lastFix = null;
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

const askLocation = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) return reject(new Error('no geolocation'));
  navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 });
});

export function startTripForm() {
  const s = state.settings;
  if (activeTrip()) return stopTripForm();
  const vehicle = s.defaultVehicle;
  const lastOdo = lastOdometer(vehicle);
  openForm({
    title: 'Start trip',
    saveLabel: 'Start trip',
    values: { vehicle, from: s.homeBase || 'Home', gps: !!s.gpsEnabled },
    fields: [
      { name: 'from', label: 'Starting from', type: 'text', list: startPlaces(), hint: 'Home, office, your previous destination, a customer, or type any place.' },
      { name: 'vehicle', label: 'Vehicle', type: 'select', options: () => s.vehicles },
      { name: 'odoStart', label: 'Starting odometer (recommended)', type: 'number', hint: lastOdo != null ? `Last on record for ${vehicle}: ${num(lastOdo)} km. Odometer readings give the most reliable record.` : 'Odometer readings give the most reliable record.' },
      { name: 'gps', type: 'check', label: 'GPS', checkLabel: 'Use GPS to measure this trip' },
      { name: 'gpsInfo', type: 'info', render: v => (v.gps
        ? 'Your browser will ask for location permission. Location is used only on this phone to add up distance while this app is open on screen. No route or coordinates are saved or sent anywhere. If the phone locks or you switch apps, GPS pauses and the distance will read short, so check it when you stop.'
        : 'GPS is off. When you stop the trip you will enter the kilometres or the ending odometer.') },
    ],
    async onSave(v) {
      if (v.gps) {
        try { await askLocation(); }
        catch (e) { throw new Error(`${GPS_UNAVAILABLE} Untick GPS to start the trip without it.`); }
      }
      s.gpsEnabled = !!v.gps;
      s.activeTrip = { startedAt: new Date().toISOString(), from: v.from || '', vehicle: v.vehicle, odoStart: v.odoStart, gps: !!v.gps, km: 0, fixes: 0, interrupted: false };
      await saveSettings();
      startWatch();
      paintBanner();
      toast('Trip started.');
    },
  });
}

export function stopTripForm() {
  const s = state.settings;
  const a = activeTrip();
  if (!a) return;
  const started = new Date(a.startedAt);
  const ended = new Date();
  const mins = Math.max(0, Math.round((ended - started) / 60000));
  const gpsKm = a.gps && a.km > 0 ? Math.round(a.km * 10) / 10 : null;
  const hasOdo = a.odoStart != null;
  const business = v => v.purpose !== PERSONAL;
  openForm({
    title: 'Stop trip',
    saveLabel: 'Save trip',
    values: { purpose: TRIP_PURPOSES[0], km: gpsKm, odoStart: a.odoStart },
    fields: [
      { name: 'summary', type: 'info', render: () => `Started ${hhmm(started)} from ${esc(a.from || 'not set')} &middot; ${mins} min &middot; ${esc(a.vehicle)}<br>${
        gpsKm != null ? `GPS measured <strong>${km1(gpsKm)} km</strong>.${a.interrupted ? ' <span class="warn-text">GPS was interrupted during this trip, so this is likely short. Check it against your odometer.</span>' : ' Check it looks right before saving.'}`
          : a.gps || a.gpsError ? `<span class="warn-text">${GPS_UNAVAILABLE}</span>` : 'GPS was off. Enter the kilometres or the ending odometer.'}` },
      { name: 'to', label: 'Destination', type: 'text', required: true, focus: true, list: uniq([...all('trip').map(t => t.to), ...all('customer').map(c => c.name)]) },
      { name: 'purpose', label: 'What was this trip for?', type: 'select', options: [...TRIP_PURPOSES, PERSONAL] },
      { name: 'customerName', label: 'Customer / business', type: 'text', list: all('customer').map(c => c.name).sort(), showIf: business },
      { name: 'detail', label: 'Business purpose', type: 'text', placeholder: 'e.g. Installation for ABC Adventures', showIf: business },
      { name: 'odoEnd', label: 'Ending odometer', type: 'number', showIf: () => hasOdo, hint: hasOdo ? `Started at ${num(a.odoStart)} km.` : '' },
      { name: 'km', label: 'Kilometres', type: 'number', required: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    onChange(v, set, name) {
      if (name === 'odoEnd' && v.odoEnd != null && v.odoEnd >= a.odoStart) set('km', round2(v.odoEnd - a.odoStart));
    },
    async onSave(v) {
      if (!(v.km > 0)) throw new Error('Enter the kilometres driven.');
      if (hasOdo && v.odoEnd != null && v.odoEnd < a.odoStart) throw new Error('Ending odometer is lower than the starting odometer.');
      const isBiz = business(v);
      let detail = v.detail;
      if (isBiz && !detail) {
        if (!v.customerName) throw new Error('Add a short business purpose, e.g. "Sales meeting with ABC Adventures".');
        detail = `${v.purpose} for ${v.customerName}`;
      }
      const useOdo = hasOdo && v.odoEnd != null;
      await save('trip', {
        date: `${started.getFullYear()}-${String(started.getMonth() + 1).padStart(2, '0')}-${String(started.getDate()).padStart(2, '0')}`,
        startTime: hhmm(started), endTime: hhmm(ended), durationMin: mins,
        from: a.from, to: v.to, purpose: v.purpose, detail: isBiz ? detail : null,
        type: isBiz ? 'business' : 'personal', vehicle: a.vehicle,
        odoStart: useOdo ? a.odoStart : null, odoEnd: useOdo ? v.odoEnd : null,
        km: useOdo ? round2(v.odoEnd - a.odoStart) : v.km,
        distanceSource: useOdo ? 'odometer' : gpsKm != null && v.km === gpsKm ? (a.interrupted ? 'gps (interrupted)' : 'gps') : 'manual',
        customerId: isBiz ? await resolveCustomer(v.customerName) : null,
        notes: v.notes,
      });
      stopWatch();
      s.activeTrip = null;
      await saveSettings();
      paintBanner();
      toast('Trip saved.');
    },
    async onDelete() {
      if (!(await confirmDialog('Discard this trip without saving?', { ok: 'Discard trip' }))) return false;
      stopWatch();
      s.activeTrip = null;
      await saveSettings();
      paintBanner();
      return true;
    },
  });
}

// Banner shown on every screen while a trip is running.
let bannerTimer = null;
export function paintBanner() {
  const el = $('#live');
  if (!el) return;
  const a = activeTrip();
  clearInterval(bannerTimer);
  if (!a) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div class="live"><span data-live></span><button class="btn" data-stop>STOP TRIP</button></div>`;
  const tick = () => {
    const secs = Math.max(0, Math.floor((Date.now() - new Date(a.startedAt)) / 1000));
    const t = `${Math.floor(secs / 3600)}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    const span = $('[data-live]', el);
    if (span) span.innerHTML = `<strong>Trip in progress</strong> ${t}${a.gps ? ` &middot; GPS ${km1(Math.round((a.km || 0) * 10) / 10)} km${a.interrupted ? ' (interrupted)' : ''}` : a.gpsError ? ' &middot; GPS unavailable' : ''}`;
  };
  tick();
  bannerTimer = setInterval(tick, 1000);
  $('[data-stop]', el).onclick = stopTripForm;
}

// Called once at startup: carry on a trip that was running when the app closed.
export function resumeTrip() {
  const a = activeTrip();
  if (a && a.gps) { a.interrupted = true; startWatch(); } // distance while closed was not measured
  paintBanner();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && activeTrip() && activeTrip().gps) keepAwake(); });
}

// ---- vehicle odometer record ------------------------------------------------

const ROLES = ['', 'Primary business vehicle', 'Business and personal', 'Personal'];

export function vehicleForm(name) {
  const s = state.settings;
  const info = s.vehicleInfo[name] || {};
  const v0 = kmSummary(Y()).vehicles.find(v => v.name === name) || {};
  const cur = (info.years || {})[Y()] || (name === s.defaultVehicle ? s.years[Y()] || {} : {});
  openForm({
    title: `${name} - ${Y()}`,
    intro: 'Business-use % = business km ÷ total km. Total km needs the whole year of driving, including personal. The most reliable source is the odometer on January 1 and December 31.',
    values: { role: info.role || '', odoStart: cur.odoStart ?? null, odoEnd: cur.odoEnd ?? null, totalKm: cur.totalKm ?? null, bizKmOverride: cur.bizKmOverride ?? null },
    fields: [
      { name: 'role', label: 'How this vehicle is used', type: 'select', options: ROLES.map(r => ({ value: r, label: r || 'Not set' })) },
      { name: 'odoStart', label: `Odometer at start of ${Y()}`, type: 'number', half: true },
      { name: 'odoEnd', label: 'Odometer now / at year end', type: 'number', half: true },
      { name: 'totalKm', label: `Total km driven in ${Y()} (overrides odometer)`, type: 'number', hint: 'Leave blank to use the odometer readings.' },
      { name: 'bizKmOverride', label: `Business km in ${Y()} (overrides trip log)`, type: 'number', hint: `Leave blank to use your logged business trips (${num(v0.loggedBiz || 0)} km) - recommended.` },
    ],
    async onSave(v) {
      if (v.odoStart != null && v.odoEnd != null && v.odoEnd < v.odoStart) throw new Error('The later odometer reading is lower than the start-of-year reading.');
      s.vehicleInfo[name] = { ...info, role: v.role, years: { ...(info.years || {}), [Y()]: { odoStart: v.odoStart, odoEnd: v.odoEnd, totalKm: v.totalKm, bizKmOverride: v.bizKmOverride } } };
      await saveSettings();
      toast('Saved.');
    },
  });
}

// ---- Mileage page ----------------------------------------------------------

let flt = { sort: 'date-desc' };
const SORTS = {
  'date-desc': (a, b) => b.date.localeCompare(a.date) || (b.startTime || '').localeCompare(a.startTime || '') || (b.createdAt || '').localeCompare(a.createdAt || ''),
  'date-asc': (a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''),
  'km-desc': (a, b) => b.km - a.km,
  'km-asc': (a, b) => a.km - b.km,
  'customer-asc': (a, b) => customerName(a.customerId).localeCompare(customerName(b.customerId)) || b.date.localeCompare(a.date),
  'purpose-asc': (a, b) => (a.purpose || '').localeCompare(b.purpose || '') || b.date.localeCompare(a.date),
};

export function mileage(root) {
  const s = state.settings;
  const k = kmSummary(Y());
  const months = mileageByMonth(Y());
  const warnings = mileageWarnings(Y());
  const a = activeTrip();
  const line = (l, v) => `<div class="line"><span>${l}</span><span>${v}</span></div>`;
  const th = (key, label, cls = '') => `<th class="${cls}"><button class="th-sort" data-act="sort" data-id="${key}">${label}${flt.sort.startsWith(key) ? (flt.sort.endsWith('asc') ? ' ▲' : ' ▼') : ''}</button></th>`;
  root.innerHTML = `
    ${head('Mileage', '', `Tax year ${Y()}`)}
    <div class="quick three">
      <button class="quick-btn start" data-act="${a ? 'stop' : 'start'}">${a ? 'STOP TRIP' : '🚗 START TRIP'}</button>
      <button class="quick-btn alt" data-act="add">+ Add trip</button>
      <button class="quick-btn alt" data-act="repeat">Repeat last trip</button>
    </div>
    <section class="panel">
      <h2>${Y()} mileage</h2>
      <div class="stats">
        ${stat('Total kilometres', `${num(k.total)} km`, esc(k.totalSource))}
        ${stat('Business kilometres', `${num(k.business)} km`, esc(k.businessSource))}
        ${stat('Personal kilometres', `${num(k.personal)} km`)}
        ${stat('Business-use percentage', pct(k.pct), '', 'accent')}
        ${stat('Business trips', String(k.bizTrips))}
        ${stat('Average business trip', k.bizTrips ? `${num(k.loggedBiz / k.bizTrips, 1)} km` : '—')}
      </div>
      ${k.totalIsWeak ? `<p class="callout">Total kilometres for ${Y()} are based on logged trips only, so the business-use % is only right if every personal trip is logged too. Enter each vehicle's odometer at the start of the year and now under Vehicles below.</p>` : ''}
    </section>
    ${warnings.length ? `<section class="panel notice"><h2>Check these records</h2><ul class="plain">${warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></section>` : ''}
    <h2 class="section-title">Mileage history</h2>
    ${filterBar(flt, [
      { name: 'type', label: 'Business & personal', options: [{ value: 'business', label: 'Business' }, { value: 'personal', label: 'Personal' }] },
      { name: 'purpose', label: 'All purposes', options: [...TRIP_PURPOSES, PERSONAL] },
      { name: 'customer', label: 'All customers', options: customerOptions() },
      { name: 'vehicle', label: 'All vehicles', options: s.vehicles },
    ])}
    <div class="table-wrap"><table class="table history">
      <thead><tr>${th('date', 'Date')}<th>Route</th>${th('purpose', 'Purpose')}${th('customer', 'Customer')}${th('km', 'KM')}<th>Type</th></tr></thead>
      <tbody data-list></tbody>
    </table></div>
    <p class="muted" data-count></p>
    <section class="panel">
      <h2>Mileage by month</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Month</th><th>Business</th><th>Personal</th><th>Total</th><th>Business use</th></tr></thead>
        <tbody>${months.map((m, i) => `<tr class="${m.total ? '' : 'dim'}"><td>${MONTHS[i]}</td><td>${num(m.business)} km</td><td>${num(m.personal)} km</td><td>${num(m.total)} km</td><td>${m.pct == null ? '—' : pct(m.pct)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="muted">Monthly figures come from logged trips only.</p>
    </section>
    <section class="panel">
      <h2>Vehicles <a class="link" href="#/settings">Add or rename</a></h2>
      ${k.vehicles.map(v => {
        const current = Math.max(v.odoEnd ?? -1, ...v.trips.filter(t => t.odoEnd != null).map(t => t.odoEnd));
        return `<div class="vehicle">
          <h3>${esc(v.name)} ${v.role ? `<span class="tag">${esc(v.role)}</span>` : ''}${v.name === s.defaultVehicle ? '<span class="tag">Default</span>' : ''}</h3>
          ${line('Starting odometer', v.odoStart == null ? 'not entered' : `${num(v.odoStart)} km`)}
          ${line('Current odometer', current < 0 ? 'not entered' : `${num(current)} km`)}
          ${line('Total kilometres', `${num(v.total)} km <small>(${esc(v.totalSource)})</small>`)}
          ${line('Business kilometres', `${num(v.business)} km`)}
          ${line('Personal kilometres', `${num(v.personal)} km`)}
          ${line('Business use', pct(v.pct))}
          <p><button class="btn small" data-act="vehicle" data-id="${esc(v.name)}">Edit odometer / year totals</button></p>
        </div>`;
      }).join('')}
      <p class="muted">Vehicle expenses for each vehicle use that vehicle's own business-use %.</p>
    </section>
    <section class="panel">
      <h2>Export mileage log</h2>
      <div class="btn-list"><button class="btn primary" data-act="pdf">Mileage log PDF</button><button class="btn" data-act="csv">Mileage log CSV</button></div>
    </section>
    <section class="panel">
      <h2>Location &amp; privacy</h2>
      <p class="muted">GPS is ${s.gpsEnabled ? '<strong>on</strong> for new trips' : '<strong>off</strong>'}. You choose it each time you start a trip, and can change the default in <a href="#/settings">Settings</a>. Location is read only while a trip is running and this app is open on screen, and only to add up distance. No coordinates or routes are saved. Mileage records are stored only in this browser on this device, like the rest of your data, and nothing is sent to GitHub or any server.</p>
      <p class="muted">Automatic trip detection is not available. A web app cannot read location in the background or while the phone is locked, so it could not detect drives reliably. Use Start/Stop, or add the trip afterwards from your odometer.</p>
    </section>`;

  const paint = () => {
    const list = inYear('trip', Y()).filter(t => passes(t, flt, `${t.from} ${t.to} ${t.purpose} ${t.detail} ${t.notes} ${customerName(t.customerId)} ${t.vehicle} ${t.id}`)
      && (!flt.type || t.type === flt.type) && (!flt.purpose || t.purpose === flt.purpose) && (!flt.vehicle || normVehicle(t.vehicle) === flt.vehicle))
      .sort(SORTS[flt.sort] || SORTS['date-desc']);
    $('[data-list]', root).innerHTML = list.map(t => `<tr data-act="edit" data-id="${t.id}">
      <td>${fmtDate(t.date).replace(/, \d{4}$/, '')}</td>
      <td>${esc(t.from || '?')} &rarr; ${esc(t.to)}${t.sourceType === 'installation' ? ' <span class="tag">Installation</span>' : ''}</td>
      <td>${esc(t.purpose || '')}</td>
      <td>${esc(customerName(t.customerId) || '—')}</td>
      <td>${km1(t.km)}</td>
      <td>${t.type === 'personal' ? 'Personal' : 'Business'}</td></tr>`).join('') || `<tr><td colspan="6" class="muted">${all('trip').length ? 'No trips match.' : 'No trips logged yet.'}</td></tr>`;
    $('[data-count]', root).textContent = list.length ? `${list.length} trip${list.length === 1 ? '' : 's'} · ${km1(round2(sum(list.filter(t => t.type !== 'personal'), t => t.km)))} business km · ${km1(round2(sum(list.filter(t => t.type === 'personal'), t => t.km)))} personal km. Tap a trip to edit or delete it.` : '';
  };
  paint();
  wireFilters(root, flt, paint);
  root.onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === 'start') startTripForm();
    if (act === 'stop') stopTripForm();
    if (act === 'add') tripForm();
    if (act === 'repeat') repeatLastTrip();
    if (act === 'edit') tripForm(byId('trip', id));
    if (act === 'vehicle') vehicleForm(id);
    if (act === 'csv') exportCsv('mileage', Y());
    if (act === 'pdf') exportMileagePdf(Y());
    if (act === 'clear-filters') { flt = { sort: flt.sort }; mileage(root); }
    if (act === 'sort') {
      const desc = `${id}-desc`, asc = `${id}-asc`;
      flt.sort = flt.sort === desc && SORTS[asc] ? asc : flt.sort === asc && SORTS[desc] ? desc : SORTS[desc] ? desc : asc;
      mileage(root);
    }
  };
}

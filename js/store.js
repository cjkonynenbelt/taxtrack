// App state + all writes. Every record has a unique id and a `kind`.
// Linked records carry `sourceType` + `sourceId` pointing at the record that
// created them, so every dollar and kilometre traces back to one original entry:
//
//   installation --> income (sourceType 'installation')
//                --> trip   (sourceType 'installation')
//   recurring    --> income (sourceType 'recurring', one per `period` YYYY-MM)
//
// Linked income/trips are edited through their source record, never duplicated.

import * as db from './db.js';
import { uid, today, round2 } from './util.js';

export const KINDS = ['income', 'expense', 'trip', 'customer', 'installation', 'recurring', 'asset'];
const PREFIX = { income: 'INC', expense: 'EXP', trip: 'TRP', customer: 'CUS', installation: 'INS', recurring: 'REC', asset: 'AST', receipt: 'RCT' };

export const state = {
  settings: null,
  data: { income: [], expense: [], trip: [], customer: [], installation: [], recurring: [], asset: [] },
};

const listeners = new Set();
export const onChange = fn => listeners.add(fn);
const emit = () => listeners.forEach(fn => fn());

export function defaultSettings() {
  return {
    year: new Date().getFullYear(),
    province: 'AB',
    defaultIncomeCurrency: 'USD',
    vehicles: ['My vehicle'],
    defaultVehicle: 'My vehicle',
    homeBase: 'Home',
    theme: 'auto',
    mealsPct: 50,                 // estimated allowable share of meals & entertainment
    includeEquipment: false,      // count equipment purchases as current-year expenses in the estimate
    includeCca: true,             // count estimated vehicle CCA (business share) in the estimate
    homeOffice: { qualifies: false, pct: 0 },
    business: { name: '', owner: '', number: '', address: '' },
    lock: { enabled: false, salt: '', hash: '' },
    years: {},                    // per-year vehicle totals + tax assumptions
    rateOverrides: {},            // per-year replacement tax tables
  };
}

export function yearSettings(year = state.settings.year) {
  const ys = state.settings.years;
  if (!ys[year]) {
    ys[year] = {
      totalKm: null, odoStart: null, odoEnd: null, bizKmOverride: null,
      tax: { otherEmployment: 0, otherIncome: 0, extraDeductions: 0, taxPaid: 0, cppEmploymentEarnings: 0, includeCpp: true },
      notes: '',
    };
  }
  return ys[year];
}

export async function load() {
  const saved = await db.get('kv', 'settings');
  const def = defaultSettings();
  state.settings = saved ? { ...def, ...saved, homeOffice: { ...def.homeOffice, ...saved.homeOffice }, business: { ...def.business, ...saved.business }, lock: { ...def.lock, ...saved.lock } } : def;
  for (const k of KINDS) state.data[k] = [];
  for (const r of await db.getAll('records')) if (state.data[r.kind]) state.data[r.kind].push(r);
  db.requestPersistence();
}

export async function saveSettings() {
  await db.put('kv', JSON.parse(JSON.stringify(state.settings)), 'settings');
  emit();
}

export const all = kind => state.data[kind];
export const byId = (kind, id) => state.data[kind].find(r => r.id === id) || null;

async function write(kind, rec) {
  const now = new Date().toISOString();
  if (!rec.id) { rec.id = uid(PREFIX[kind]); rec.createdAt = now; }
  rec.kind = kind;
  rec.updatedAt = now;
  const list = state.data[kind];
  const i = list.findIndex(r => r.id === rec.id);
  if (i >= 0) list[i] = rec; else list.push(rec);
  await db.put('records', rec);
  return rec;
}

async function erase(kind, id) {
  const rec = byId(kind, id);
  if (!rec) return;
  state.data[kind] = state.data[kind].filter(r => r.id !== id);
  await db.del('records', id);
  if (rec.receiptId) await db.del('receipts', rec.receiptId);
}

export async function save(kind, rec) {
  const out = await write(kind, rec);
  emit();
  return out;
}

// ---- customers -------------------------------------------------------------

export const customerName = id => (byId('customer', id) || {}).name || '';

// Accepts a typed name: returns the matching customer's id, creating the customer if new.
export async function resolveCustomer(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const found = state.data.customer.find(c => c.name.toLowerCase() === n.toLowerCase());
  if (found) return found.id;
  return (await write('customer', { name: n })).id;
}

export function customerRefs(id) {
  return ['income', 'expense', 'trip', 'installation', 'recurring'].reduce((n, k) => n + state.data[k].filter(r => r.customerId === id).length, 0);
}

// ---- installations (single source of truth for their income + trip) --------

export async function saveInstallation(inst) {
  inst = await write('installation', inst);
  const name = customerName(inst.customerId);

  let income = inst.incomeId ? byId('income', inst.incomeId) : null;
  if (Number(inst.amount) > 0) {
    income = await write('income', {
      ...(income || {}),
      date: inst.paid ? (inst.paidDate || inst.date) : inst.date,
      payer: inst.payer || name,
      type: 'Installation payment',
      amount: Number(inst.amount),
      currency: inst.currency,
      fxMethod: inst.fxMethod || null,
      fxRate: inst.paid ? inst.fxRate ?? null : null,
      cadAmount: inst.paid ? inst.cadAmount ?? null : null,
      status: inst.paid ? 'received' : 'pending',
      customerId: inst.customerId,
      description: `Installation - ${name}`,
      sourceType: 'installation',
      sourceId: inst.id,
    });
    inst.incomeId = income.id;
  } else if (income) {
    await erase('income', income.id);
    inst.incomeId = null;
  }

  let trip = inst.tripId ? byId('trip', inst.tripId) : null;
  if (Number(inst.km) > 0) {
    trip = await write('trip', {
      ...(trip || {}),
      date: inst.date,
      from: state.settings.homeBase || 'Home',
      to: inst.address || name,
      purpose: 'Payment-system installation',
      customerId: inst.customerId,
      km: Number(inst.km),
      type: 'business',
      sourceType: 'installation',
      sourceId: inst.id,
    });
    inst.tripId = trip.id;
  } else if (trip) {
    await erase('trip', trip.id);
    inst.tripId = null;
  }

  await write('installation', inst);
  emit();
  return inst;
}

export async function remove(kind, id) {
  const rec = byId(kind, id);
  if (!rec) return;
  if (kind === 'installation') {
    if (rec.incomeId) await erase('income', rec.incomeId);
    if (rec.tripId) await erase('trip', rec.tripId);
  }
  await erase(kind, id);
  emit();
}

// ---- recurring income ------------------------------------------------------

// Expected (not yet confirmed) payments for a year. These are computed, never
// stored, and never counted as income until the user confirms receipt.
export function expectedPayments(year) {
  const out = [];
  const received = new Set(state.data.income.filter(i => i.sourceType === 'recurring').map(i => `${i.sourceId}|${i.period}`));
  for (const r of state.data.recurring) {
    if (!r.startMonth) continue;
    for (let m = 1; m <= 12; m++) {
      const period = `${year}-${String(m).padStart(2, '0')}`;
      if (period < r.startMonth) continue;
      if (r.endMonth && period > r.endMonth) continue;
      if (received.has(`${r.id}|${period}`)) continue;
      if ((r.skipped || []).includes(period)) continue;
      out.push({ recurringId: r.id, period, amount: r.amount, currency: r.currency, customerId: r.customerId, payer: r.payer, type: r.type });
    }
  }
  return out.sort((a, b) => a.period.localeCompare(b.period));
}

export const isDue = period => period <= today().slice(0, 7);

export async function skipExpected(recurringId, period) {
  const r = byId('recurring', recurringId);
  if (!r) return;
  r.skipped = [...(r.skipped || []), period];
  await save('recurring', r);
}

// ---- receipts --------------------------------------------------------------

export async function saveReceipt(file) {
  const rec = { id: uid(PREFIX.receipt), name: file.name, type: file.type, dataUrl: file.dataUrl, createdAt: new Date().toISOString() };
  await db.put('receipts', rec);
  return rec.id;
}
export const getReceipt = id => db.get('receipts', id);
export const deleteReceipt = id => db.del('receipts', id);

// ---- backup / restore / reset ----------------------------------------------

export async function exportAll() {
  const { lock, ...settings } = state.settings; // never export the app-lock hash
  return {
    app: 'taxtrack', version: 1, exportedAt: new Date().toISOString(),
    settings, data: state.data, receipts: await db.getAll('receipts'),
  };
}

export async function importAll(backup) {
  if (!backup || backup.app !== 'taxtrack' || !backup.data) throw new Error('This file is not a TaxTrack backup.');
  const lock = state.settings.lock;
  await db.clear('records');
  await db.clear('receipts');
  const records = [];
  for (const k of KINDS) for (const r of backup.data[k] || []) records.push({ ...r, kind: k });
  await db.putMany('records', records);
  await db.putMany('receipts', backup.receipts || []);
  await db.put('kv', { ...defaultSettings(), ...backup.settings, lock }, 'settings');
  await load();
  emit();
  return records.length;
}

export async function resetAll() {
  await db.clearAll();
  await load();
  emit();
}

// Stores both figures for a foreign-currency amount. `method` records which one
// the user actually typed, so nothing is ever converted with an assumed rate.
export function fxFields(v) {
  if (v.currency !== 'USD') return { fxMethod: null, fxRate: null, cadAmount: null };
  if (v.fxMethod === 'cad' && v.cadAmount > 0) return { fxMethod: 'cad', cadAmount: round2(v.cadAmount), fxRate: Math.round((v.cadAmount / v.amount) * 1e6) / 1e6 };
  if (v.fxMethod !== 'cad' && v.fxRate > 0) return { fxMethod: 'rate', fxRate: Number(v.fxRate), cadAmount: round2(v.amount * v.fxRate) };
  return { fxMethod: v.fxMethod || 'rate', fxRate: null, cadAmount: null };
}

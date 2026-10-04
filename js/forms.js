// Add/edit forms for every record type.

import { state, all, byId, save, remove, resolveCustomer, customerName, customerRefs, saveInstallation, fxFields } from './store.js';
import { openForm, confirmDialog, toast, finalizeReceipt } from './ui.js';
import { INCOME_TYPES, VEHICLE_CATEGORIES, OTHER_CATEGORIES, CATEGORIES, VEHICLE_INFO, VERIFY, PAY_METHODS, VERIFY_STATUS } from './reference.js';
import { kmSummary } from './calc.js';
import { assetName } from './cca.js';
import { today, money, num, esc, yearOf, round2, monthLabel } from './util.js';

const CUR = [{ value: 'CAD', label: 'CAD' }, { value: 'USD', label: 'USD' }];
const customerNames = () => all('customer').map(c => c.name).sort();
const uniq = list => [...new Set(list.filter(Boolean))];

function savedNote(date) {
  const y = yearOf(date);
  toast(y !== state.settings.year ? `Saved under tax year ${y} (you are viewing ${state.settings.year}).` : 'Saved.');
}

// Exchange-rate fields shared by income, expenses and installations.
// Nothing is converted unless the user types a rate or the CAD amount.
export function fxDefs(cond) {
  return [
    { name: 'fxMethod', label: 'Record the CAD value by', type: 'seg', showIf: cond, options: [{ value: 'rate', label: 'Exchange rate' }, { value: 'cad', label: 'CAD amount received' }] },
    { name: 'fxRate', label: 'Exchange rate (1 USD = ? CAD)', type: 'number', placeholder: 'e.g. 1.3725', showIf: v => cond(v) && v.fxMethod !== 'cad' },
    { name: 'cadAmount', label: 'CAD amount actually received / paid', type: 'number', showIf: v => cond(v) && v.fxMethod === 'cad' },
    {
      name: 'fxLine', type: 'info', showIf: cond, render: v => {
        const fx = fxFields({ ...v, amount: v.amount || 0 });
        if (!v.amount) return '';
        if (fx.cadAmount == null) return `<span class="warn-text">No exchange rate entered. ${money(v.amount, 'USD')} will not be counted in CAD totals until you add one.</span>`;
        return `<strong>${money(v.amount, 'USD')}</strong> &rarr; rate ${num(fx.fxRate, 4)}${fx.fxMethod === 'cad' ? ' (implied)' : ''} &rarr; <strong>${money(fx.cadAmount)} CAD</strong> reported`;
      },
    },
  ];
}

export function requireFx(v, what) {
  if (v.currency === 'USD' && fxFields(v).cadAmount == null) throw new Error(`Enter the exchange rate or the CAD amount ${what}. The app never assumes a rate.`);
}

async function askDelete(kind, rec, label, detail) {
  if (!(await confirmDialog(`Delete this ${label}?`, { detail: detail || 'This cannot be undone.' }))) return false;
  await remove(kind, rec.id);
  toast('Deleted.');
  return true;
}

// ---- income ----------------------------------------------------------------

export function incomeForm(rec = {}) {
  if (rec.sourceType === 'installation' && byId('installation', rec.sourceId)) return installationForm(byId('installation', rec.sourceId));
  const last = [...all('income')].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
  const values = {
    date: today(), type: INCOME_TYPES[0], currency: state.settings.defaultIncomeCurrency, status: 'received', fxMethod: 'rate',
    payer: last ? last.payer : '',
    ...rec, customerName: customerName(rec.customerId),
  };
  const usd = v => v.currency === 'USD';
  openForm({
    title: rec.id ? 'Edit income' : rec.sourceType === 'recurring' ? `Confirm payment - ${monthLabel(rec.period)}` : 'Add income',
    intro: rec.sourceType === 'recurring' && !rec.id ? 'Confirm the amount you actually received. Nothing is counted until you save.' : '',
    values,
    fields: [
      { name: 'amount', label: 'Amount', type: 'number', required: true, focus: true, half: true },
      { name: 'currency', label: 'Currency', type: 'seg', options: CUR, half: true },
      ...fxDefs(usd),
      { name: 'date', label: 'Date received', type: 'date', required: true, half: true },
      { name: 'status', label: 'Payment status', type: 'seg', half: true, options: [{ value: 'received', label: 'Received' }, { value: 'pending', label: 'Pending' }] },
      { name: 'type', label: 'Payment type', type: 'select', options: INCOME_TYPES },
      { name: 'payer', label: 'Payer / company', type: 'text', list: uniq(all('income').map(i => i.payer)) },
      { name: 'customerName', label: 'Business / customer this is for', type: 'text', list: customerNames(), hint: 'Type a new name to add it to Customers.' },
      { name: 'description', label: 'Description', type: 'text' },
      { name: 'gst', label: 'GST/HST collected (included in the amount)', type: 'number', showIf: () => state.settings.gst.registered, hint: 'Only if you charged GST/HST on this payment.' },
      { name: 'payMethod', label: 'How you were paid', type: 'select', options: ['', ...PAY_METHODS.filter(m => !m.includes('credit card'))], advanced: true },
      { name: 'invoiceNo', label: 'Invoice / statement number', type: 'text', advanced: true },
      { name: 'receipt', label: 'Invoice, statement or document (optional)', type: 'receipt' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    async onSave(v, orig) {
      if (!(v.amount > 0)) throw new Error('Enter an amount greater than zero.');
      if (v.status === 'received') requireFx(v, 'you received');
      await finalizeReceipt(v, orig.receiptId);
      const { customerName: cn, fxLine, receipt, ...clean } = v;
      await save('income', { ...clean, ...fxFields(v), customerId: await resolveCustomer(cn) });
      savedNote(v.date);
    },
    onDelete: rec.id ? () => askDelete('income', rec, 'income record', rec.sourceType === 'recurring' ? 'The expected payment for that month will show as unconfirmed again.' : '') : null,
  });
}

// ---- expenses --------------------------------------------------------------

const VEHICLE_USE = [{ value: 'shared', label: 'Business-use %' }, { value: 'business', label: '100% business' }, { value: 'personal', label: 'Personal' }];
const OTHER_USE = [{ value: 'business', label: 'Business' }, { value: 'mixed', label: 'Mixed' }, { value: 'personal', label: 'Personal' }];

// `extra` is used by the receipt scanner: { title, saveLabel, fields (shown above the receipt), openAdvanced }
export function expenseForm(rec = {}, extra = {}) {
  const s = state.settings;
  const values = {
    date: today(), group: 'other', currency: 'CAD', fxMethod: 'rate', vehicle: s.defaultVehicle,
    ...rec,
    useVehicle: rec.group === 'vehicle' ? rec.use || 'shared' : 'shared',
    useOther: rec.group !== 'vehicle' ? rec.use || 'business' : 'business',
    customerName: customerName(rec.customerId),
  };
  if (!values.category) values.category = values.group === 'vehicle' ? VEHICLE_CATEGORIES[0] : OTHER_CATEGORIES[0];
  if (!rec.id && !rec.use) {
    // Same starting points the form applies when the category is changed.
    if (['Parking', 'Tolls'].includes(values.category)) values.useVehicle = 'business';
    const info = CATEGORIES[values.category];
    if (values.group !== 'vehicle' && info && info.pctHint) {
      values.useOther = 'mixed';
      if (info.home && s.homeOffice.pct) values.businessPct = s.homeOffice.pct;
    }
  }
  const isVeh = v => v.group === 'vehicle';
  const usd = v => v.currency === 'USD';
  openForm({
    title: extra.title || (rec.id ? 'Edit expense' : 'Add expense'),
    saveLabel: extra.saveLabel || 'Save',
    values,
    openAdvanced: !!rec.id || !!extra.openAdvanced,
    fields: [
      { name: 'group', label: 'Expense type', type: 'seg', options: [{ value: 'vehicle', label: 'Vehicle' }, { value: 'other', label: 'Other business' }] },
      { name: 'category', label: 'Category', type: 'select', options: v => (isVeh(v) ? VEHICLE_CATEGORIES : OTHER_CATEGORIES) },
      { name: 'amount', label: 'Total paid (incl. tax)', type: 'number', required: true, focus: true, half: true },
      { name: 'currency', label: 'Currency', type: 'seg', options: CUR, half: true },
      ...fxDefs(usd),
      { name: 'vendor', label: 'Vendor', type: 'text', list: uniq(all('expense').map(e => e.vendor)) },
      { name: 'useVehicle', label: 'How should this be counted?', type: 'seg', options: VEHICLE_USE, showIf: isVeh, hint: 'Business-use % applies your business km ÷ total km for the year.' },
      { name: 'useOther', label: 'Was this to earn business income?', type: 'seg', options: OTHER_USE, showIf: v => !isVeh(v) },
      { name: 'businessPct', label: 'Business-use %', type: 'number', placeholder: 'e.g. 60', showIf: v => !isVeh(v) && v.useOther === 'mixed' },
      {
        name: 'portion', type: 'info', render: v => {
          if (!v.amount) return '';
          const cur = v.currency;
          if (isVeh(v)) {
            if (v.useVehicle !== 'shared') return '';
            const k = kmSummary(yearOf(v.date) || s.year);
            return `Estimated business portion at ${num(k.pct * 100, 1)}% business use: <strong>${money(v.amount * k.pct, cur)}</strong> of ${money(v.amount, cur)}. Changes as you log kilometres.`;
          }
          if (v.useOther === 'personal') return '';
          const p = v.useOther === 'mixed' ? Math.min(100, Math.max(0, v.businessPct || 0)) : 100;
          const info = CATEGORIES[v.category] || {};
          const limit = info.meals ? s.mealsPct : 100;
          if (p === 100 && limit === 100) return '';
          return `Total expense <strong>${money(v.amount, cur)}</strong> &middot; business portion (${p}%) <strong>${money(v.amount * p / 100, cur)}</strong> &middot; potentially deductible${limit < 100 ? ` (${limit}% limit)` : ''} <strong>${money(v.amount * p / 100 * limit / 100, cur)}</strong>`;
        },
      },
      ...(extra.fields || []),
      { name: 'receipt', label: 'Receipt', type: 'receipt' },
      {
        name: 'guide', type: 'info', render: v => {
          const info = isVeh(v) ? VEHICLE_INFO : CATEGORIES[v.category] || {};
          const personal = (isVeh(v) ? v.useVehicle : v.useOther) === 'personal';
          if (personal) return 'Personal expenses are kept for your records only and never counted as business expenses.';
          return `${info.warn ? `<p class="warn-text">${esc(info.warn)}</p>` : ''}
            <p><strong>Keep:</strong> ${(info.docs || []).map(esc).join(' &middot; ')}</p>
            <p>${esc(VERIFY)} ${info.link ? `<a href="${info.link}" target="_blank" rel="noopener">Verify current CRA rules</a>` : ''}</p>`;
        },
      },
      { name: 'date', label: 'Date', type: 'date', required: true, half: true },
      { name: 'vehicle', label: 'Vehicle', type: 'select', options: () => s.vehicles, showIf: isVeh, half: true },
      { name: 'purpose', label: 'Business purpose', type: 'text', placeholder: 'What was this for?' },
      { name: 'attendees', label: 'Who attended (names and their business)', type: 'text', showIf: v => !isVeh(v) && !!(CATEGORIES[v.category] || {}).meals, hint: 'Record who was there and the business reason. A meal with no business reason is personal.' },
      { name: 'destination', label: 'Destination', type: 'text', showIf: v => !isVeh(v) && v.category === 'Travel', half: true },
      { name: 'tripDates', label: 'Trip dates', type: 'text', placeholder: 'e.g. Oct 5 to 7', showIf: v => !isVeh(v) && v.category === 'Travel', half: true },
      { name: 'personalDays', label: 'Personal days on the trip', type: 'number', showIf: v => !isVeh(v) && v.category === 'Travel', hint: 'Costs of personal days are not business travel. Use Mixed and a business-use % if the trip was not all business.' },
      { name: 'subtotal', label: 'Amount before tax', type: 'number', advanced: true, half: true },
      { name: 'tax', label: 'GST/HST', type: 'number', advanced: true, half: true },
      { name: 'otherTax', label: 'Other tax (PST, levies)', type: 'number', advanced: true, half: true },
      { name: 'payMethod', label: 'Payment method', type: 'select', options: ['', ...PAY_METHODS], advanced: true, half: true },
      { name: 'assetId', label: 'Related asset (optional)', type: 'select', advanced: true, options: () => [{ value: '', label: 'None' }, ...all('equip').map(q => ({ value: q.id, label: q.name || q.category })), ...all('asset').map(a => ({ value: a.id, label: assetName(a) }))] },
      { name: 'reference', label: 'Reference (invoice or confirmation number)', type: 'text', advanced: true },
      { name: 'verification', label: 'Verification status', type: 'select', options: VERIFY_STATUS, advanced: true },
      { name: 'customerName', label: 'Customer / business (optional)', type: 'text', list: customerNames(), advanced: true },
      { name: 'project', label: 'Project (optional)', type: 'text', list: uniq(all('expense').map(e => e.project)), advanced: true, hint: 'Pick an existing project or type a new name.' },
      { name: 'needsReview', type: 'check', label: 'Needs review', checkLabel: 'Not sure about this one - keep it in Expenses Needing Review', advanced: true },
      { name: 'notes', label: 'Notes', type: 'textarea', advanced: true },
    ],
    onChange(v, set, name) {
      // Before-tax + taxes fill in the total; the total stays editable.
      if (['subtotal', 'tax', 'otherTax'].includes(name) && v.subtotal != null) set('amount', round2((v.subtotal || 0) + (v.tax || 0) + (v.otherTax || 0)));
      if (name !== 'category' && name !== 'group') return;
      // Sensible starting points only - always editable.
      if (isVeh(v)) set('useVehicle', ['Parking', 'Tolls'].includes(v.category) ? 'business' : 'shared');
      else if (CATEGORIES[v.category] && CATEGORIES[v.category].pctHint) {
        set('useOther', 'mixed');
        if (CATEGORIES[v.category].home && s.homeOffice.pct && v.businessPct == null) set('businessPct', s.homeOffice.pct);
      } else set('useOther', 'business');
    },
    async onSave(v, orig) {
      if (!(v.amount > 0)) throw new Error('Enter an amount greater than zero.');
      const use = isVeh(v) ? v.useVehicle : v.useOther;
      if (use === 'mixed' && !(v.businessPct > 0 && v.businessPct <= 100)) throw new Error('Enter a business-use % between 1 and 100.');
      if (use !== 'personal') requireFx(v, 'you paid');
      if ((v.tax || 0) + (v.otherTax || 0) > v.amount) throw new Error('The taxes are more than the total paid. Check the amounts.');
      if (v.subtotal == null && (v.tax || v.otherTax)) v.subtotal = round2(v.amount - (v.tax || 0) - (v.otherTax || 0));
      await finalizeReceipt(v, orig.receiptId);
      const { customerName: cn, useVehicle, useOther, fxLine, portion, guide, receipt, treatmentInfo, scanInfo, ...clean } = v;
      if (v.scan) {
        // Keep a note of what the user changed from the scanned values; saving counts as reviewing it.
        const sc = v.scan, fix = { ...(v.corrections || {}) };
        const diff = (key, scanned, saved) => { if (scanned != null && String(scanned) !== String(saved ?? '')) fix[key] = { scanned, saved }; };
        diff('merchant', sc.merchant, v.vendor); diff('date', sc.date, v.date); diff('total', sc.total, v.amount); diff('tax', sc.tax, v.tax); diff('currency', sc.currency, v.currency);
        clean.corrections = fix;
        clean.reviewed = !v.needsReview;
      }
      if (extra.review) clean.reviewed = !v.needsReview; // saved from the review queue
      await save('expense', {
        ...clean, ...fxFields(v), use,
        businessPct: use === 'mixed' ? v.businessPct : null,
        vehicle: isVeh(v) ? v.vehicle : null,
        customerId: await resolveCustomer(cn),
      });
      if (!rec.id && yearOf(v.date) === state.settings.year) toast(`✓ Expense added\n${money(v.amount, v.currency)} from ${v.vendor || v.category}\nAdded to ${monthLabel(v.date.slice(0, 7))}`);
      else savedNote(v.date);
    },
    onDelete: rec.id ? () => askDelete('expense', rec, 'expense', 'Its receipt will be deleted too.') : null,
  });
}

// ---- customers -------------------------------------------------------------

export function customerForm(rec = {}, after) {
  openForm({
    title: rec.id ? 'Edit customer' : 'Add customer',
    values: { monthlyCurrency: 'USD', installCurrency: 'USD', ...rec },
    fields: [
      { name: 'name', label: 'Business name', type: 'text', required: true, focus: true },
      { name: 'contact', label: 'Contact name', type: 'text' },
      { name: 'phone', label: 'Phone', type: 'text', inputType: 'tel', half: true },
      { name: 'email', label: 'Email', type: 'text', inputType: 'email', half: true },
      { name: 'address', label: 'Address', type: 'text' },
      { name: 'dateSigned', label: 'Date signed', type: 'date', half: true },
      { name: 'installDate', label: 'Installation date', type: 'date', half: true },
      { name: 'monthlyCommission', label: 'Monthly commission', type: 'number', half: true },
      { name: 'monthlyCurrency', label: 'Currency', type: 'seg', options: CUR, half: true },
      { name: 'installPayment', label: 'Installation payment', type: 'number', half: true },
      { name: 'installCurrency', label: 'Currency', type: 'seg', options: CUR, half: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    async onSave(v) {
      const dup = all('customer').find(c => c.id !== v.id && c.name.toLowerCase() === v.name.toLowerCase());
      if (dup) throw new Error('A customer with that name already exists.');
      const saved = await save('customer', v);
      toast('Saved.');
      if (after) after(saved);
    },
    onDelete: rec.id ? async () => {
      const refs = customerRefs(rec.id);
      if (refs) { toast(`This customer has ${refs} linked record${refs === 1 ? '' : 's'}. Delete or reassign those first.`); return false; }
      const ok = await askDelete('customer', rec, 'customer');
      if (ok) location.hash = '#/customers';
      return ok;
    } : null,
  });
}

// ---- installations ---------------------------------------------------------

export function installationForm(rec = {}) {
  const values = { date: today(), currency: 'USD', fxMethod: 'rate', paid: false, ...rec, customerName: customerName(rec.customerId) };
  const needFx = v => v.paid && v.currency === 'USD';
  openForm({
    title: rec.id ? 'Edit installation' : 'Add installation',
    intro: 'The payment is added to Income and the travel to Trips automatically, linked to this installation - do not enter them again.',
    values,
    fields: [
      { name: 'customerName', label: 'Customer', type: 'text', required: true, focus: true, list: customerNames() },
      { name: 'address', label: 'Address', type: 'text' },
      { name: 'date', label: 'Installation date', type: 'date', required: true },
      { name: 'amount', label: 'Payment amount', type: 'number', half: true },
      { name: 'currency', label: 'Currency', type: 'seg', options: CUR, half: true },
      { name: 'paid', type: 'check', label: 'Payment received', checkLabel: 'Payment received' },
      { name: 'paidDate', label: 'Date payment received', type: 'date', showIf: v => v.paid },
      ...fxDefs(needFx),
      { name: 'km', label: 'Travel kilometres (round trip)', type: 'number' },
      { name: 'notes', label: 'Installation notes', type: 'textarea' },
    ],
    onChange(v, set, name) {
      if (name === 'customerName' && !v.address) {
        const c = all('customer').find(x => x.name.toLowerCase() === String(v.customerName || '').toLowerCase());
        if (c && c.address) set('address', c.address);
        if (c && c.installPayment && !v.amount) { set('amount', c.installPayment); set('currency', c.installCurrency || 'USD'); }
      }
      if (name === 'paid' && v.paid && !v.paidDate) set('paidDate', today());
    },
    async onSave(v) {
      if (v.paid && !(v.amount > 0)) throw new Error('Enter the payment amount, or untick "Payment received".');
      if (v.paid) requireFx(v, 'you received');
      const { customerName: cn, fxLine, ...clean } = v;
      const customerId = await resolveCustomer(cn);
      await saveInstallation({ ...clean, ...(v.paid ? fxFields(v) : { fxRate: null, cadAmount: null }), customerId });
      const c = byId('customer', customerId);
      if (c && !c.installDate) await save('customer', { ...c, installDate: v.date });
      savedNote(v.date);
    },
    onDelete: rec.id ? () => askDelete('installation', rec, 'installation', 'Its linked income record and trip will be deleted too.') : null,
  });
}

// ---- recurring income ------------------------------------------------------

export function recurringForm(rec = {}) {
  const values = { currency: 'USD', type: INCOME_TYPES[0], startMonth: today().slice(0, 7), ...rec, customerName: customerName(rec.customerId) };
  openForm({
    title: rec.id ? 'Edit recurring income' : 'Add recurring income',
    intro: 'Creates an expected payment each month. Expected payments are never counted as income until you confirm you received them.',
    values,
    fields: [
      { name: 'customerName', label: 'Customer', type: 'text', required: true, focus: true, list: customerNames() },
      { name: 'amount', label: 'Expected amount', type: 'number', required: true, half: true },
      { name: 'currency', label: 'Currency', type: 'seg', options: CUR, half: true },
      { name: 'type', label: 'Payment type', type: 'select', options: INCOME_TYPES },
      { name: 'payer', label: 'Payer / company', type: 'text', list: uniq(all('income').map(i => i.payer)) },
      { name: 'startMonth', label: 'First month', type: 'month', required: true, half: true },
      { name: 'endMonth', label: 'Last month (optional)', type: 'month', half: true },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    onChange(v, set, name) {
      if (name !== 'customerName' || v.amount) return;
      const c = all('customer').find(x => x.name.toLowerCase() === String(v.customerName || '').toLowerCase());
      if (c && c.monthlyCommission) { set('amount', c.monthlyCommission); set('currency', c.monthlyCurrency || 'USD'); }
    },
    async onSave(v) {
      if (!(v.amount > 0)) throw new Error('Enter the expected amount.');
      if (!/^\d{4}-\d{2}$/.test(v.startMonth || '')) throw new Error('First month must look like 2026-10.');
      if (v.endMonth && v.endMonth < v.startMonth) throw new Error('Last month is before the first month.');
      const { customerName: cn, ...clean } = v;
      await save('recurring', { ...clean, customerId: await resolveCustomer(cn) });
      toast('Saved.');
    },
    onDelete: rec.id ? () => askDelete('recurring', rec, 'recurring income', 'Payments you already confirmed stay in Income.') : null,
  });
}

// Opens the income form pre-filled from an expected payment.
export function confirmExpected(x) {
  incomeForm({
    amount: x.amount, currency: x.currency, type: x.type, payer: x.payer || '', customerId: x.customerId,
    description: `${x.type} - ${monthLabel(x.period)}`,
    sourceType: 'recurring', sourceId: x.recurringId, period: x.period, status: 'received',
  });
}

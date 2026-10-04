// Smart receipt scanner. Additive: scanned receipts become ordinary expense
// records (same database, categories, vehicles, customers, receipts store) with
// a `scan` field holding what was read.
//
// Reading the text (OCR) uses the open-source Tesseract.js library, loaded on
// first use from a public CDN. The photo is processed in this browser on this
// device - it is not uploaded anywhere. It needs an internet connection the
// first time; when it is unavailable the receipt is still attached and the
// details are typed in by hand.
//
// Nothing here invents values: anything the reader could not find, or found
// only by a fallback guess, is listed in `low` and shown as "check this".

import { state, all, byId, save, customerName } from './store.js';
import { CATEGORIES, VEHICLE_CATEGORIES, VERIFY } from './reference.js';
import { EQUIP_RULES } from './equip.js';
import { normVehicle, inYear } from './calc.js';
import { expenseForm } from './forms.js';
import { equipForm } from './equipment.js';
import { modal, toast, prepareFile, viewReceipt, confirmDialog } from './ui.js';
import { head } from './views.js';
import { $, esc, money, fmtDate, today } from './util.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
export const SCAN_DISCLAIMER = 'An organising and estimating aid, not professional tax advice. Nothing here is guaranteed to be deductible.';

// ---- category suggestions ---------------------------------------------------
// [pattern in merchant/receipt text, group, category, capital hint]

const MERCHANTS = [
  [/\b(petro[- ]?canada|shell|esso|husky|co-?op gas|chevron|mobil|ultramar|fas gas|7-eleven fuel|circle k|costco gas|domo)\b/i, 'vehicle', 'Fuel'],
  [/\b(fuel|gasoline|unleaded|diesel|litres?|l @|pump ?#?\d)\b/i, 'vehicle', 'Fuel'],
  [/\b(jiffy lube|mr\.? lube|oil change|great canadian oil)\b/i, 'vehicle', 'Oil changes'],
  [/\b(kal tire|fountain tire|ok tire|tire ?craft|tires?)\b/i, 'vehicle', 'Tires'],
  [/\b(midas|napa|parts ?source|auto ?parts|mechanic|brake|alignment|automotive)\b/i, 'vehicle', 'Repairs'],
  [/\b(car ?wash|auto spa)\b/i, 'vehicle', 'Car washes'],
  [/\b(impark|indigo park|calgary parking|parkplus|parking|parkade)\b/i, 'vehicle', 'Parking'],
  [/\b(registry|registries|vehicle registration)\b/i, 'vehicle', 'Registration'],
  [/\b(canadian tire)\b/i, 'vehicle', 'Maintenance'],
  [/\b(staples|grand ?& ?toy|office depot)\b/i, 'other', 'Office supplies'],
  [/\b(best buy|memory express|apple store|apple\.com|the source|canada computers)\b/i, 'other', 'Computer/equipment', true],
  [/\b(home depot|rona|lowe'?s|home hardware|princess auto)\b/i, 'other', 'Office supplies'],
  [/\b(telus|rogers|bell mobility|fido|koodo|freedom mobile|virgin plus|public mobile)\b/i, 'other', 'Phone'],
  [/\b(shaw|internet service|high[- ]speed internet)\b/i, 'other', 'Internet'],
  [/\b(hotel|inn|suites|marriott|hilton|best western|airbnb|motel|air canada|westjet|flair|uber|lyft|taxi|enterprise rent|hertz|avis)\b/i, 'other', 'Travel'],
  [/\b(restaurant|grill|pizza|cafe|coffee|starbucks|tim hortons|mcdonald'?s|subway|a&w|earls|cactus club|boston pizza|bar & grill|pub|bistro|kitchen|diner|sushi|server:|table ?#?\d|gratuity|tip)\b/i, 'other', 'Meals & entertainment'],
  [/\b(facebook ads|meta ads|google ads|vistaprint|printing|signs?|flyers?|business cards)\b/i, 'other', 'Advertising & marketing'],
  [/\b(microsoft|adobe|google workspace|dropbox|hubspot|zoom|openai|anthropic|canva|subscription|godaddy|squarespace|software)\b/i, 'other', 'Software & subscriptions'],
  [/\b(canada post|purolator|ups store|fedex)\b/i, 'other', 'Office supplies'],
  [/\b(insurance)\b/i, 'other', 'Business insurance'],
];
const CAPITAL_WORDS = /\b(laptop|macbook|notebook pc|desktop|imac|monitor|ipad|tablet|iphone|smartphone|printer|scanner|camera|docking station)\b/i;

export function suggestCategory(text) {
  for (const [re, group, category, capital] of MERCHANTS) if (re.test(text)) return { group, category, capital: !!capital, matched: (text.match(re) || [''])[0] };
  return { group: 'other', category: 'Other', capital: false, matched: '' };
}

// ---- reading the receipt text -----------------------------------------------

const MONEY = /(-?\$?\s?\d{1,3}(?:[,\s]\d{3})*[.,]\d{2}|-?\$?\s?\d+[.,]\d{2})(?!\d)/g;
const toNum = s => Number(String(s).replace(/[$\s]/g, '').replace(/,(\d{2})$/, '.$1').replace(/,/g, ''));
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const iso = (y, m, d) => { y = y < 100 ? 2000 + y : y; const ok = m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= new Date().getFullYear() + 1; return ok ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null; };

function findDate(text) {
  let m = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return { date: iso(+m[1], +m[2], +m[3]), sure: true };
  m = text.match(/\b(\d{1,2})[\s-]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?[\s-]?(\d{4}|\d{2})\b/i);
  if (m) return { date: iso(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1]), sure: true };
  m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s?(\d{1,2}),?\s?(\d{4}|\d{2})\b/i);
  if (m) return { date: iso(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]), sure: true };
  m = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a > 12) return { date: iso(+m[3], b, a), sure: true };      // day first
    if (b > 12) return { date: iso(+m[3], a, b), sure: true };      // month first
    return { date: iso(+m[3], a, b), sure: false };                 // could be either order
  }
  return { date: null, sure: false };
}

const lastAmount = line => { const m = line.match(MONEY); return m ? toNum(m[m.length - 1]) : null; };

// Turns OCR text into fields. `low` lists fields that are missing or uncertain.
export function parseReceipt(text, confidence = null) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const low = [];
  const out = { text, confidence, merchant: null, date: null, total: null, subtotal: null, gst: null, pst: null, hst: null, tax: null, receiptNo: null, currency: null, location: null, items: [], low };

  // Merchant: a known name anywhere, otherwise the first line that looks like a name.
  const cat = suggestCategory(text);
  const nameLine = lines.find(l => /[A-Za-z]{3,}/.test(l) && !/^(receipt|invoice|welcome|thank|date|tel|phone|gst|hst|www\.)/i.test(l) && !/^\d/.test(l));
  if (nameLine) out.merchant = nameLine.replace(/\s{2,}.*$/, '').slice(0, 40);
  else low.push('merchant');

  const d = findDate(text);
  out.date = d.date;
  if (!d.date || !d.sure) low.push('date');

  for (const l of lines) {
    const amt = lastAmount(l);
    if (amt == null) continue;
    if (/sub\s?-?total/i.test(l)) out.subtotal = amt;
    else if (/\b(g\.?s\.?t|tps)\b/i.test(l) && !/#|reg|no\.?\s*\d{5}/i.test(l)) out.gst = amt;
    else if (/\b(p\.?s\.?t|tvq|q\.?s\.?t)\b/i.test(l)) out.pst = amt;
    else if (/\bh\.?s\.?t\b/i.test(l) && !/#|reg/i.test(l)) out.hst = amt;
    else if (/\btax(es)?\b/i.test(l) && !/total/i.test(l)) out.tax = amt;
  }
  const parts = [out.gst, out.pst, out.hst].filter(v => v != null);
  if (parts.length) out.tax = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100;

  // Total: prefer an explicit total / amount due line; never the subtotal.
  const totalLines = lines.filter(l => /\b(grand total|total due|amount due|balance due|total)\b/i.test(l) && !/sub\s?-?total|total (items|savings|tax)/i.test(l) && lastAmount(l) != null);
  if (totalLines.length) out.total = Math.max(...totalLines.map(lastAmount));
  else {
    const allAmounts = lines.map(lastAmount).filter(v => v != null && v > 0);
    if (allAmounts.length) { out.total = Math.max(...allAmounts); low.push('total'); } // largest figure, unconfirmed
    else low.push('total');
  }

  const no = text.match(/\b(?:receipt|invoice|trans(?:action)?|order|ref(?:erence)?|chk|check)\s*(?:no\.?|number|#|num)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,})\b/i);
  if (no && /\d/.test(no[1])) out.receiptNo = no[1];

  if (/\bUSD\b|US\$/i.test(text)) out.currency = 'USD';
  else if (/\bCAD\b|\b(GST|HST|PST)\b|\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b|\b(AB|BC|SK|MB|ON|QC|NB|NS|PE|NL|YT|NT|NU)\b/.test(text)) out.currency = 'CAD';
  else low.push('currency');

  const loc = lines.find(l => /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/.test(l) || /,\s?(AB|BC|SK|MB|ON|QC|NB|NS|PE|NL|YT|NT|NU)\b/.test(l));
  if (loc) out.location = loc.slice(0, 60);

  // Items: "description ... price" lines that are not totals, taxes or payments.
  for (const l of lines) {
    const amt = lastAmount(l);
    if (amt == null || amt <= 0) continue;
    if (/total|tax|gst|hst|pst|change|cash|visa|master|debit|credit|amex|interac|balance|tender|approved|auth|card/i.test(l)) continue;
    const name = l.replace(MONEY, '').replace(/[\s.$]+$/, '').trim();
    if (/[A-Za-z]{3,}/.test(name)) out.items.push({ name: name.slice(0, 50), price: amt });
  }
  if (confidence != null && confidence < 60) low.push('overall');
  out.suggested = cat;
  return out;
}

// ---- OCR ---------------------------------------------------------------------

let tesseractLoading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractLoading) {
    tesseractLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESSERACT_URL;
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => { tesseractLoading = null; reject(new Error('Could not load the text reader.')); };
      document.head.appendChild(s);
    });
  }
  return tesseractLoading;
}

async function readText(dataUrl, onProgress) {
  const T = await loadTesseract();
  const res = await T.recognize(dataUrl, 'eng', { logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); } });
  return { text: res.data.text || '', confidence: res.data.confidence };
}

// ---- tax treatment -----------------------------------------------------------
// use: vehicle -> shared | business | personal;  other -> business | mixed | personal

export function treatment({ group, category, use, needsReview, capital }) {
  const info = group === 'vehicle' ? {} : CATEGORIES[category] || {};
  if (use === 'personal') return { icon: '🔴', label: 'Likely personal', why: 'You marked this as a personal purchase. Personal expenses are kept for your records but are not business expenses.' };
  if (needsReview) return { icon: '⚪', label: 'Needs more information', why: 'You were not sure how this was used. It stays in Expenses Needing Review until you confirm the business use.' };
  if (capital || info.capital) return { icon: '🔵', label: 'Possible capital asset', why: 'Computers, electronics and other lasting equipment are usually claimed over several years as capital cost allowance rather than as an expense in the year bought. Recording it under Equipment gives it the right treatment.' };
  if (group !== 'vehicle' && category === 'Other') return { icon: '⚪', label: 'Needs more information', why: 'The category could not be worked out from the receipt. Choose a category so the likely treatment can be shown.' };
  if (group === 'vehicle') {
    return use === 'business'
      ? { icon: '🟢', label: 'Likely deductible', why: 'A vehicle cost for a business stop, such as parking at a customer, can generally be claimed in full. Keep the receipt and note the trip.' }
      : { icon: '🟡', label: 'Potentially deductible — review required', why: 'This appears to be a vehicle running cost. The business portion may be deductible, in proportion to your business kilometres, so it depends on your mileage log.' };
  }
  if (use === 'mixed') return { icon: '🟡', label: 'Potentially deductible — review required', why: 'This expense appears to be related to earning business income, but only the business portion may be deductible. Be ready to explain the percentage.' };
  if (info.meals || info.home || info.review || info.pctHint) return { icon: '🟡', label: 'Potentially deductible — review required', why: info.warn || 'Special rules or a business-use share may apply to this category.' };
  return { icon: '🟢', label: 'Likely deductible', why: 'This appears to be an ordinary cost of earning your business income. Keep the receipt and note the business purpose.' };
}

const treatmentHtml = t => `<p><strong>Tax treatment: ${t.icon} ${esc(t.label)}</strong></p><p>${esc(t.why)}</p><p class="muted">${esc(SCAN_DISCLAIMER)} ${esc(VERIFY)}</p>`;

// ---- duplicates and suggestions ----------------------------------------------

const firstWord = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean)[0] || '';

export function findDuplicate(p, ignoreId) {
  if (p.total == null) return null;
  return all('expense').find(e => e.id !== ignoreId && Math.abs(Number(e.amount) - p.total) < 0.005 && (!p.date || e.date === p.date)
    && (!p.merchant || !e.vendor || firstWord(e.vendor) === firstWord(p.merchant) || (p.receiptNo && e.scan && e.scan.receiptNo === p.receiptNo))) || null;
}

// What earlier expenses from the same merchant were connected to. Only a suggestion.
export function suggestLink(merchant) {
  const w = firstWord(merchant);
  if (!w) return null;
  const prev = [...all('expense')].reverse().find(e => firstWord(e.vendor) === w && (e.project || e.customerId));
  if (!prev) return null;
  return prev.project ? { kind: 'project', value: prev.project, label: prev.project } : { kind: 'customer', value: prev.customerId, label: customerName(prev.customerId) };
}

// ---- review queue --------------------------------------------------------------

export function queueReasons(e) {
  const out = [];
  if (e.needsReview) out.push('Unknown business use - you marked it "not sure"');
  if (e.scan && !e.reviewed) {
    const low = (e.scan.low || []).filter(f => !(e.corrections || {})[f] && f !== 'overall');
    if ((e.scan.low || []).includes('overall')) out.push('Low-confidence scan - check every figure against the receipt');
    else if (low.length) out.push(`Scan was unsure of: ${low.join(', ')}`);
    if (e.group !== 'vehicle' && e.category === 'Other') out.push('Uncategorized receipt');
    if (e.dupOf && byId('expense', e.dupOf)) out.push('Possible duplicate');
    if (e.group !== 'vehicle' && (CATEGORIES[e.category] || {}).capital) out.push('Possible capital asset - consider recording it under Equipment');
    if (e.currency === 'USD' && e.cadAmount == null) out.push('No exchange rate');
  }
  return out;
}
export const reviewQueue = () => all('expense').map(e => ({ e, reasons: queueReasons(e) })).filter(x => x.reasons.length).sort((a, b) => b.e.date.localeCompare(a.e.date));

// Extra fields the expense form shows for scanned receipts and queue items.
function scanFields(p) {
  return [
    { name: 'treatmentInfo', type: 'info', render: v => treatmentHtml(treatment({ group: v.group, category: v.category, use: v.group === 'vehicle' ? v.useVehicle : v.useOther, needsReview: v.needsReview, capital: false })) },
    ...(p ? [{
      name: 'scanInfo', type: 'info', render: () => `<strong>Read from the receipt</strong>${p.low.length ? ` - <span class="warn-text">check: ${esc(p.low.join(', '))}</span>` : ''}<br>
        ${[['Merchant', p.merchant], ['Date', p.date], ['Total', p.total != null ? money(p.total, p.currency || 'CAD') : null], ['Subtotal', p.subtotal != null ? money(p.subtotal) : null], ['GST', p.gst != null ? money(p.gst) : null], ['PST', p.pst != null ? money(p.pst) : null], ['HST', p.hst != null ? money(p.hst) : null], ['Tax', p.tax != null ? money(p.tax) : null], ['Receipt no.', p.receiptNo], ['Location', p.location]]
          .filter(([, val]) => val != null).map(([k, val]) => `${k}: ${esc(val)}`).join(' &middot; ') || 'Nothing could be read automatically.'}
        ${p.items.length ? `<br>Items: ${p.items.slice(0, 12).map(i => `${esc(i.name)} ${money(i.price)}`).join('; ')}` : ''}`,
    }] : []),
  ];
}

function openScannedExpense(p, file, choice) {
  const cat = p.suggested;
  const useMap = cat.group === 'vehicle' ? { business: 'business', personal: 'personal', both: 'shared', unsure: 'shared' } : { business: 'business', personal: 'personal', both: 'mixed', unsure: 'business' };
  expenseForm({
    group: cat.group, category: cat.category, vendor: p.merchant || '', amount: p.total, currency: p.currency || 'CAD',
    date: p.date || today(), tax: p.tax, use: useMap[choice.use],
    needsReview: choice.use === 'unsure',
    project: choice.link && choice.link.kind === 'project' ? choice.link.value : '',
    customerId: choice.link && choice.link.kind === 'customer' ? choice.link.value : null,
    dupOf: choice.dupOf || null,
    scan: { merchant: p.merchant, date: p.date, total: p.total, subtotal: p.subtotal, gst: p.gst, pst: p.pst, hst: p.hst, tax: p.tax, receiptNo: p.receiptNo, currency: p.currency, location: p.location, items: p.items, low: p.low, confidence: p.confidence, scannedAt: new Date().toISOString() },
    _receiptFile: file,
  }, { title: 'Review scanned receipt', saveLabel: 'Confirm and save', fields: scanFields(p), openAdvanced: true });
}

// ---- scan flow ------------------------------------------------------------------

export function scanReceipt() {
  const m = modal(`
    <div class="sheet-head"><h2>Scan receipt</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body" data-body>
      <p class="muted">Take a photo of the receipt, or choose a photo or PDF you already have. The picture stays on this device.</p>
      <div class="quick">
        <button class="quick-btn" data-pick="camera">Take photo</button>
        <button class="quick-btn alt" data-pick="file">Choose photo or PDF</button>
      </div>
      <input type="file" accept="image/*" capture="environment" data-in="camera" hidden>
      <input type="file" accept="image/*,application/pdf" data-in="file" hidden>
    </div>`, { wide: true });
  const body = $('[data-body]', m.el);
  const pick = which => $(`[data-in="${which}"]`, m.el).click();
  m.el.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) pick(b.dataset.pick); });

  const handle = async input => {
    const f = input.files[0];
    input.value = '';
    if (!f) return;
    let file;
    try { file = await prepareFile(f); } catch (ex) { toast(ex.message); return; }
    const isImg = (file.type || '').startsWith('image/');
    body.innerHTML = `
      ${isImg ? `<img class="scan-preview" src="${file.dataUrl}" alt="Receipt photo">` : `<p><strong>${esc(file.name || 'PDF receipt')}</strong></p>`}
      <p data-status class="muted">${isImg ? 'Reading the receipt… 0%' : 'PDF receipts are attached but cannot be read automatically. Enter the details on the next screen.'}</p>
      <div data-result></div>
      <div class="btn-list"><button class="btn" data-pick="camera">Retake photo</button><button class="btn" data-pick="file">Choose a different file</button></div>
      <input type="file" accept="image/*" capture="environment" data-in="camera" hidden>
      <input type="file" accept="image/*,application/pdf" data-in="file" hidden>`;
    wireInputs();
    let p;
    if (isImg) {
      try {
        const status = $('[data-status]', body);
        const r = await readText(file.dataUrl, v => { if (status.isConnected) status.textContent = `Reading the receipt… ${Math.round(v * 100)}%`; });
        if (!body.contains(status)) return; // retaken meanwhile
        p = parseReceipt(r.text, r.confidence);
        status.textContent = r.text.trim() ? `Receipt read${r.confidence != null ? ` (${Math.round(r.confidence)}% confidence)` : ''}. Check the details below.` : 'No text could be read. If the photo is blurry, retake it; otherwise enter the details by hand.';
      } catch (ex) {
        p = parseReceipt('', null);
        const status = $('[data-status]', body);
        if (status) status.innerHTML = '<span class="warn-text">Automatic reading is unavailable right now (it needs an internet connection the first time). The receipt will be attached and you can enter the details by hand.</span>';
      }
    } else p = parseReceipt('', null);
    showResult(p, file);
  };

  const showResult = (p, file) => {
    const cat = p.suggested;
    const capital = (cat.capital || CAPITAL_WORDS.test(p.text)) && (p.total == null || p.total >= EQUIP_RULES.smallCost);
    const dup = findDuplicate(p);
    const link = suggestLink(p.merchant);
    // Starting answer only - mirrors the expense form's own defaults (vehicle running costs follow business km).
    const runningCost = cat.group === 'vehicle' && !['Parking', 'Tolls'].includes(cat.category);
    const choice = { use: cat.category === 'Other' && !capital ? 'unsure' : runningCost ? 'both' : 'business', link: null, dupOf: null };
    const question = cat.group === 'vehicle' ? `What was this ${cat.category === 'Fuel' ? 'fuel' : 'vehicle expense'} used for?` : capital ? 'How is this item used?' : 'What was this purchase for?';
    const row = (k, v, f) => `<div class="line"><span>${k}${p.low.includes(f) ? ' <span class="tag warn">check</span>' : ''}</span><span>${v == null ? '<span class="muted">not found</span>' : esc(v)}</span></div>`;
    const paint = () => {
      const use = cat.group === 'vehicle' ? { business: 'business', personal: 'personal', both: 'shared', unsure: 'shared' }[choice.use] : { business: 'business', personal: 'personal', both: 'mixed', unsure: 'business' }[choice.use];
      $('[data-result]', body).innerHTML = `
        ${dup && !choice.dupOf ? `<div class="callout" data-dup><strong>Possible duplicate</strong><br>${esc(dup.vendor || dup.category)} &middot; ${fmtDate(dup.date)} &middot; ${money(dup.amount, dup.currency)}<br>You already have a similar receipt.
          <div class="btn-list"><button class="btn small" data-do="dup-keep">Keep both</button><button class="btn small" data-do="dup-use">Use existing</button><button class="btn small" data-do="dup-review">Review</button></div></div>` : ''}
        ${row('Merchant', p.merchant, 'merchant')}${row('Date', p.date && fmtDate(p.date), 'date')}${row('Total', p.total != null ? money(p.total, p.currency || 'CAD') : null, 'total')}
        ${p.subtotal != null ? row('Subtotal', money(p.subtotal)) : ''}${p.gst != null ? row('GST', money(p.gst)) : ''}${p.pst != null ? row('PST', money(p.pst)) : ''}${p.hst != null ? row('HST', money(p.hst)) : ''}${p.tax != null ? row('Tax amount', money(p.tax)) : ''}
        ${p.receiptNo ? row('Receipt number', p.receiptNo) : ''}${row('Currency', p.currency, 'currency')}${p.location ? row('Location', p.location) : ''}
        ${p.items.length ? `<details class="more"><summary>${p.items.length} item${p.items.length === 1 ? '' : 's'} read</summary>${p.items.map(i => `<div class="line"><span>${esc(i.name)}</span><span>${money(i.price)}</span></div>`).join('')}</details>` : ''}
        ${row('Suggested category', `${cat.group === 'vehicle' ? 'Vehicle: ' : ''}${cat.category}`)}
        <p class="muted">You can correct anything on the next screen.</p>
        <div class="f"><span>${esc(question)}</span><div class="seg">${[['business', capital ? '100% business' : 'Business'], ['both', capital ? 'Mixed' : 'Both'], ['personal', 'Personal'], ['unsure', 'Not sure']].map(([v, l]) => `<label><input type="radio" name="scanuse" value="${v}"${choice.use === v ? ' checked' : ''}><span>${l}</span></label>`).join('')}</div>
          ${choice.use === 'both' ? `<small>${cat.group === 'vehicle' ? 'The business share will follow your business kilometres for that vehicle.' : 'You will enter the business-use % on the next screen.'}</small>` : ''}</div>
        <div class="info">${treatmentHtml(treatment({ group: cat.group, category: cat.category, use, needsReview: choice.use === 'unsure', capital }))}</div>
        ${link && choice.link !== false ? `<div class="info" data-link>This may be related to: <strong>${esc(link.label)}</strong>. ${choice.link ? 'Connected.' : 'Connect this expense?'}
          ${choice.link ? '' : '<div class="btn-list"><button class="btn small primary" data-do="link-yes">Connect</button><button class="btn small" data-do="link-other">Choose different</button><button class="btn small" data-do="link-no">Not related</button></div>'}</div>` : ''}
        <div class="btn-list">
          <button class="btn primary" data-do="continue">Review and save</button>
          ${capital ? '<button class="btn" data-do="equip">Record as equipment instead</button>' : ''}
        </div>`;
    };
    paint();
    const result = $('[data-result]', body);
    result.onchange = e => { if (e.target.name === 'scanuse') { choice.use = e.target.value; paint(); } };
    result.onclick = e => {
      const b = e.target.closest('[data-do]');
      if (!b) return;
      const act = b.dataset.do;
      if (act === 'dup-keep') { choice.dupOf = dup.id; paint(); }
      if (act === 'dup-use') { m.close(); toast('Kept the existing receipt. Nothing new was saved.'); }
      if (act === 'dup-review') { m.close(); expenseForm(dup); }
      if (act === 'link-yes') { choice.link = link; paint(); }
      if (act === 'link-no') { choice.link = false; paint(); }
      if (act === 'link-other') { choice.link = false; paint(); toast('Choose the project, customer or vehicle on the next screen.'); }
      if (act === 'continue') { m.close(); openScannedExpense(p, file, { ...choice, link: choice.link || null }); }
      if (act === 'equip') {
        m.close();
        const price = p.subtotal != null ? p.subtotal : p.total != null && p.tax != null ? Math.round((p.total - p.tax) * 100) / 100 : p.total;
        equipForm({ name: (p.items[0] && p.items[0].name) || '', vendor: p.merchant || '', price, salesTax: p.tax, date: p.date || today(), currency: p.currency || 'CAD', use: { business: '100', both: 'mixed', personal: 'personal', unsure: 'mixed' }[choice.use], notes: p.receiptNo ? `Receipt ${p.receiptNo}` : null, _receiptFile: file });
      }
    };
  };

  const wireInputs = () => m.el.querySelectorAll('[data-in]').forEach(i => { i.onchange = () => handle(i); });
  wireInputs();
  // On a phone, go straight to the system chooser (Take Photo / Photo Library / Files).
  if (window.matchMedia('(pointer: coarse)').matches) pick('file');
}

// ---- Expenses Needing Review screen -----------------------------------------------

export function needsReview(root) {
  const q = reviewQueue();
  const open = e => expenseForm(e, { title: 'Review expense', fields: scanFields(null), openAdvanced: true });
  root.innerHTML = `
    <p><a href="#/expenses">&larr; Expenses</a></p>
    ${head('Expenses needing review', q.length ? '<button class="btn primary" data-act="next">Review next</button>' : '', 'Scanned receipts that still need a decision. Saving an expense here, or marking it reviewed, takes it off the list.')}
    ${q.length ? q.map(({ e, reasons }) => `<div class="group">
        <div class="row static"><span class="row-main"><span class="row-title">${esc(e.vendor || e.category)}</span><span class="row-sub">${fmtDate(e.date)} &middot; ${e.group === 'vehicle' ? 'Vehicle: ' : ''}${esc(e.category)}${e.project ? ` &middot; ${esc(e.project)}` : ''}</span></span><span class="row-amt"><strong>${money(e.amount, e.currency)}</strong></span></div>
        <ul class="plain">${reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        <div class="btn-list"><button class="btn small primary" data-act="edit" data-id="${e.id}">Review</button>${e.receiptId ? `<button class="btn small" data-act="receipt" data-id="${e.receiptId}">View receipt</button>` : ''}<button class="btn small" data-act="done" data-id="${e.id}">Mark reviewed</button></div>
      </div>`).join('') : '<p class="empty">Nothing needs review.</p>'}
    <p class="disclaimer">${esc(SCAN_DISCLAIMER)}</p>`;
  root.onclick = async ev => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    if (act === 'next') open(q[0].e);
    if (act === 'edit') open(byId('expense', id));
    if (act === 'receipt') viewReceipt(id);
    if (act === 'done') {
      const e = byId('expense', id);
      if (e.needsReview && !(await confirmDialog('Mark this as reviewed?', { ok: 'Mark reviewed', danger: false, detail: 'It was marked "not sure". Marking it reviewed means you are happy with how it is recorded.' }))) return;
      await save('expense', { ...e, needsReview: false, reviewed: true });
    }
  };
}

// Generic UI pieces: modal sheets, the form builder, confirm dialog, toast, receipts.

import { $, $$, esc } from './util.js';
import { saveReceipt, getReceipt, deleteReceipt } from './store.js';

// ---- modal -----------------------------------------------------------------

export function modal(html, { wide = false } = {}) {
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `<div class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { el.remove(); if (!$('.modal')) document.body.classList.remove('has-modal'); };
  el.addEventListener('mousedown', e => { if (e.target === el) close(); });
  el.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  document.body.appendChild(el);
  document.body.classList.add('has-modal');
  return { el, close };
}

export function toast(msg) {
  $$('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

export function confirmDialog(message, { ok = 'Delete', danger = true, detail = '' } = {}) {
  return new Promise(resolve => {
    const m = modal(`
      <div class="sheet-body">
        <p class="confirm-msg">${esc(message)}</p>
        ${detail ? `<p class="muted">${esc(detail)}</p>` : ''}
      </div>
      <div class="sheet-foot">
        <span class="grow"></span>
        <button class="btn" data-no>Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(ok)}</button>
      </div>`);
    m.el.classList.add('small');
    $('[data-no]', m.el).onclick = () => { m.close(); resolve(false); };
    $('[data-yes]', m.el).onclick = () => { m.close(); resolve(true); };
  });
}

// ---- receipts --------------------------------------------------------------

const MAX_DIM = 1600;

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// Photos are downscaled to keep the local database (and backups) small.
async function prepareFile(file) {
  if (file.type.startsWith('image/')) {
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      return { name: file.name, type: 'image/jpeg', dataUrl: canvas.toDataURL('image/jpeg', 0.8) };
    } catch (e) { /* fall through and store the original */ }
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('That file is larger than 8 MB. Please attach a smaller file.');
  return { name: file.name, type: file.type, dataUrl: await readDataUrl(file) };
}

export async function viewReceipt(idOrFile) {
  const r = typeof idOrFile === 'string' ? await getReceipt(idOrFile) : idOrFile;
  if (!r) return toast('Receipt not found on this device.');
  const isImg = (r.type || '').startsWith('image/');
  modal(`
    <div class="sheet-head"><h2>Receipt</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="sheet-body receipt-view">
      ${isImg ? `<img src="${r.dataUrl}" alt="Receipt">` : `<p>${esc(r.name || 'Document')}</p>`}
      <p><a class="btn" href="${r.dataUrl}" download="${esc(r.name || 'receipt')}">Download file</a></p>
    </div>`, { wide: true });
}

// Call after a form save: stores a newly attached file, removes a replaced/removed one.
export async function finalizeReceipt(vals, originalId) {
  let id = vals.receiptId || null;
  if (vals._receiptFile) id = await saveReceipt(vals._receiptFile);
  if (originalId && originalId !== id) await deleteReceipt(originalId);
  delete vals._receiptFile;
  vals.receiptId = id;
}

// ---- form builder ----------------------------------------------------------
// fields: [{ name, label, type, options, required, showIf, advanced, hint, placeholder, list, render, half }]
// types:  text | number | date | month | select | textarea | check | seg | receipt | info

const parseNum = s => {
  const t = String(s ?? '').replace(/[,\s$]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const optList = (f, vals) => (typeof f.options === 'function' ? f.options(vals) : f.options || []).map(o => (typeof o === 'string' ? { value: o, label: o } : o));

function control(f, vals) {
  const v = vals[f.name];
  const id = `f-${f.name}`;
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
  switch (f.type) {
    case 'number':
      return `<input id="${id}" name="${f.name}" type="text" inputmode="decimal" autocomplete="off" value="${v ?? ''}"${ph}>`;
    case 'date': case 'month':
      return `<input id="${id}" name="${f.name}" type="${f.type}" value="${esc(v ?? '')}">`;
    case 'textarea':
      return `<textarea id="${id}" name="${f.name}" rows="2"${ph}>${esc(v ?? '')}</textarea>`;
    case 'select':
      return `<select id="${id}" name="${f.name}"></select>`;
    case 'seg':
      return `<div class="seg" role="radiogroup">${optList(f, vals).map(o => `<label><input type="radio" name="${f.name}" value="${esc(o.value)}"${String(v) === String(o.value) ? ' checked' : ''}><span>${esc(o.label)}</span></label>`).join('')}</div>`;
    case 'check':
      return `<label class="check"><input type="checkbox" name="${f.name}"${v ? ' checked' : ''}><span>${esc(f.checkLabel || f.label)}</span></label>`;
    case 'receipt':
      return `<div class="receipt-field" data-receipt></div><input type="file" accept="image/*,application/pdf" hidden>`;
    case 'info':
      return `<div class="info" data-info="${f.name}"></div>`;
    default: {
      const list = f.list ? ` list="${id}-list"` : '';
      const dl = f.list ? `<datalist id="${id}-list">${f.list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : '';
      return `<input id="${id}" name="${f.name}" type="${f.inputType || 'text'}" autocomplete="off" value="${esc(v ?? '')}"${ph}${list}>${dl}`;
    }
  }
}

function fieldHtml(f, vals) {
  const noLabel = f.type === 'check' || f.type === 'info';
  return `<div class="f${f.half ? ' half' : ''}" data-f="${f.name}">
    ${noLabel ? '' : `<label for="f-${f.name}">${esc(f.label)}${f.required ? ' <i>*</i>' : ''}</label>`}
    ${control(f, vals)}
    ${f.hint ? `<small>${esc(f.hint)}</small>` : ''}
  </div>`;
}

export function openForm({ title, fields, values = {}, onSave, onDelete, onChange, saveLabel = 'Save', openAdvanced = false, intro = '' }) {
  const vals = { ...values };
  const original = { receiptId: values.receiptId || null };
  const basic = fields.filter(f => !f.advanced);
  const adv = fields.filter(f => f.advanced);
  const m = modal(`
    <form novalidate>
      <div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="sheet-body">
        ${intro ? `<p class="muted form-intro">${intro}</p>` : ''}
        <div class="fields">${basic.map(f => fieldHtml(f, vals)).join('')}</div>
        ${adv.length ? `<details class="more"${openAdvanced ? ' open' : ''}><summary>More details</summary><div class="fields">${adv.map(f => fieldHtml(f, vals)).join('')}</div></details>` : ''}
        <p class="form-error" hidden></p>
      </div>
      <div class="sheet-foot">
        ${onDelete ? '<button type="button" class="btn danger-text" data-delete>Delete</button>' : ''}
        <span class="grow"></span>
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn primary">${esc(saveLabel)}</button>
      </div>
    </form>`);
  const form = $('form', m.el);
  const err = $('.form-error', form);
  const byName = Object.fromEntries(fields.map(f => [f.name, f]));

  const read = () => {
    for (const f of fields) {
      if (f.type === 'receipt' || f.type === 'info') continue;
      if (f.type === 'seg') { const c = $(`input[name="${f.name}"]:checked`, form); vals[f.name] = c ? c.value : vals[f.name]; continue; }
      const el = form.elements[f.name];
      if (!el) continue;
      if (f.type === 'check') vals[f.name] = el.checked;
      else if (f.type === 'number') vals[f.name] = parseNum(el.value);
      else vals[f.name] = el.value.trim() === '' ? (f.type === 'select' ? '' : null) : el.value.trim();
    }
  };

  // Programmatic update of another field (e.g. distance from odometer readings).
  const set = (name, value) => {
    vals[name] = value;
    const f = byName[name];
    if (!f) return;
    if (f.type === 'seg') { const r = $(`input[name="${name}"][value="${value}"]`, form); if (r) r.checked = true; }
    else if (f.type === 'check') form.elements[name].checked = !!value;
    else if (form.elements[name]) form.elements[name].value = value ?? '';
  };

  const paintReceipt = () => {
    const box = $('[data-receipt]', form);
    if (!box) return;
    const has = vals._receiptFile || vals.receiptId;
    box.innerHTML = has
      ? `<span class="tag">Receipt attached${vals._receiptFile ? ` - ${esc(vals._receiptFile.name || 'photo')}` : ''}</span>
         <button type="button" class="btn small" data-rv>View</button>
         <button type="button" class="btn small" data-rr>Remove</button>`
      : `<button type="button" class="btn" data-ra>Attach receipt (photo or file)</button>`;
  };

  const refresh = () => {
    for (const f of fields) {
      const wrap = $(`[data-f="${f.name}"]`, form);
      if (f.showIf) wrap.hidden = !f.showIf(vals);
      if (f.type === 'select') {
        const el = form.elements[f.name];
        const opts = optList(f, vals);
        const sig = opts.map(o => o.value).join('|');
        if (el.dataset.sig !== sig) {
          el.dataset.sig = sig;
          el.innerHTML = opts.map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
          if (!opts.some(o => String(o.value) === String(vals[f.name]))) vals[f.name] = opts.length ? opts[0].value : '';
          el.value = vals[f.name];
        }
      }
      if (f.type === 'info') { const html = f.render(vals); $(`[data-info="${f.name}"]`, form).innerHTML = html; wrap.hidden = !html || (f.showIf && !f.showIf(vals)); }
    }
  };

  const changed = e => {
    read();
    refresh(); // dependent select options first, so onChange sees current values
    if (onChange) onChange(vals, set, e && e.target && e.target.name);
    refresh();
  };
  form.addEventListener('input', changed);
  form.addEventListener('change', changed);

  form.addEventListener('click', async e => {
    if (e.target.closest('[data-ra]')) $('input[type=file]', form).click();
    if (e.target.closest('[data-rr]')) { vals._receiptFile = null; vals.receiptId = null; paintReceipt(); }
    if (e.target.closest('[data-rv]')) viewReceipt(vals._receiptFile || vals.receiptId);
    if (e.target.closest('[data-delete]')) { if (await onDelete()) m.close(); }
  });
  const fileInput = $('input[type=file]', form);
  if (fileInput) fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try { vals._receiptFile = await prepareFile(file); paintReceipt(); }
    catch (ex) { err.textContent = ex.message; err.hidden = false; }
    fileInput.value = '';
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    read();
    err.hidden = true;
    const missing = fields.find(f => f.required && (!f.showIf || f.showIf(vals)) && (vals[f.name] == null || vals[f.name] === ''));
    try {
      if (missing) throw new Error(`${missing.label} is required.`);
      const btn = $('button[type=submit]', form);
      btn.disabled = true;
      try { await onSave(vals, original); } finally { btn.disabled = false; }
      m.close();
    } catch (ex) {
      err.textContent = ex.message || String(ex);
      err.hidden = false;
      err.scrollIntoView({ block: 'nearest' });
    }
  });

  refresh();
  paintReceipt();
  // Fields marked `focus` get the keyboard straight away on new records (fast entry on a phone).
  const first = fields.find(f => f.focus);
  if (first && !values.id) form.elements[first.name].focus();
  return m;
}

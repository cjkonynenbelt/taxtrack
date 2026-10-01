// Optional 4-digit app lock. This keeps casual eyes out of the app on a shared
// or borrowed phone. It is NOT encryption: the data in the browser's storage is
// not scrambled, so the device's own passcode remains the real protection.

import { state, saveSettings, resetAll } from './store.js';
import { confirmDialog } from './ui.js';
import { $ } from './util.js';

async function hash(pin, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

export async function setPin(pin) {
  const salt = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
  state.settings.lock = { enabled: true, salt, hash: await hash(pin, salt) };
  await saveSettings();
}

export async function clearPin() {
  state.settings.lock = { enabled: false, salt: '', hash: '' };
  await saveSettings();
}

export const checkPin = async pin => (await hash(pin, state.settings.lock.salt)) === state.settings.lock.hash;

let showing = false;

// Resolves once the correct PIN is entered (immediately if the lock is off).
export function requireUnlock() {
  if (!state.settings.lock.enabled || showing) return Promise.resolve();
  showing = true;
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'lock';
    el.innerHTML = `
      <div class="lock-box">
        <h1>TaxTrack</h1>
        <p>Enter your 4-digit PIN</p>
        <div class="pin-dots"><i></i><i></i><i></i><i></i></div>
        <p class="lock-err" aria-live="polite"></p>
        <div class="keypad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
          <span></span><button data-k="0">0</button><button data-k="del" aria-label="Delete">&#9003;</button>
        </div>
        <button class="link-btn" data-forgot>Forgot PIN?</button>
      </div>`;
    document.body.appendChild(el);
    $('[data-forgot]', el).onclick = async () => {
      const ok = await confirmDialog('Erase all data on this device to remove the PIN?', {
        ok: 'Erase everything',
        detail: 'A forgotten PIN cannot be recovered. Erasing removes every record and receipt stored in this browser. You can then restore from a backup file.',
      });
      if (!ok) return;
      await resetAll();
      el.remove(); showing = false; resolve();
    };
    let pin = '';
    const paint = () => el.querySelectorAll('.pin-dots i').forEach((d, i) => d.classList.toggle('on', i < pin.length));
    const press = async k => {
      if (k === 'del') pin = pin.slice(0, -1);
      else if (pin.length < 4) pin += k;
      paint();
      if (pin.length === 4) {
        if (await checkPin(pin)) { el.remove(); showing = false; resolve(); }
        else { pin = ''; paint(); $('.lock-err', el).textContent = 'Incorrect PIN'; }
      }
    };
    el.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
    el.tabIndex = -1;
    el.focus();
    el.addEventListener('keydown', e => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); });
  });
}

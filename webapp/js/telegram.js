// LizardTrail — общие хелперы Telegram Web App.
window.LT = (function () {
  const tg = window.Telegram && window.Telegram.WebApp;

  function init() {
    if (tg) {
      tg.ready();
      tg.expand();
    }
    return tg;
  }

  function isInTelegram() { return !!tg; }
  function initData() { return tg ? (tg.initData || '') : ''; }

  function haptic(type) {
    if (tg && tg.HapticFeedback && tg.HapticFeedback[type]) {
      try { tg.HapticFeedback[type]('light'); } catch (e) {}
    }
  }

  // Универсальный запрос к нашему API с initData в заголовке.
  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const id = initData();
    if (id) headers['X-Telegram-Init-Data'] = id;

    const base = (window.API_BASE || '');
    const resp = await fetch(base + path, Object.assign({}, opts, { headers }));
    const text = await resp.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = text; }

    if (!resp.ok) {
      const msg = (body && (body.detail || body.message)) || ('Ошибка ' + resp.status);
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    return body;
  }

  async function checkRole() {
    if (!initData()) return { no_tg: true, is_manager: false };
    try { return await api('/api/me'); }
    catch (e) { return { error: e.message, is_manager: false }; }
  }

  function close() { if (tg && tg.close) tg.close(); }

  // Маска телефона: +375 + 9 цифр (формат +375 XX XXX XX XX).
  function formatPhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('375')) d = d.slice(3);
    d = d.slice(0, 9);
    let out = '+375';
    if (d.length > 0) out += ' ' + d.slice(0, 2);
    if (d.length > 2) out += ' ' + d.slice(2, 5);
    if (d.length > 5) out += ' ' + d.slice(5, 7);
    if (d.length > 7) out += ' ' + d.slice(7, 9);
    return out;
  }

  function attachPhoneMask(input) {
    if (!input) return;
    const apply = () => { input.value = formatPhone(input.value); };
    input.addEventListener('input', apply);
    input.addEventListener('focus', () => { if (!input.value) input.value = '+375 '; });
    input.addEventListener('blur', () => { if (input.value.trim() === '+375') input.value = ''; });
    if (!input.value) input.value = '+375 ';
  }

  function phoneValid(input) {
    return (input.value || '').replace(/\D/g, '').length === 12; // +375 + 9 цифр
  }

  function openExternal(url) {
    try {
      if (tg && tg.openLink) tg.openLink(url);
      else window.open(url, '_blank');
    } catch (e) {
      try { window.open(url, '_blank'); } catch (e2) {}
    }
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  return { tg, init, isInTelegram, initData, haptic, api, checkRole, close, attachPhoneMask, phoneValid, formatPhone, openExternal, copyToClipboard };
})();

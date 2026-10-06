// LizardTrail — Админ-панель (Календарь + Сервис-канбан + Настройки).
(function () {
  LT.init();

  const HOURS = Array.from({ length: 24 }, (_, i) => i); // 00:00 .. 23:00
  const PX_PER_HOUR = 56;
  const GRID_HEIGHT = HOURS.length * PX_PER_HOUR; // 24 часа
  const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const WD = ['ВС','ПН','ВТ','СР','ЧТ','ПТ','СБ'];
  const PALETTE = [
    { bg: '#d81324', fg: '#ffffff' },
    { bg: '#111827', fg: '#ffffff' },
    { bg: '#005989', fg: '#ffffff' },
    { bg: '#575e70', fg: '#ffffff' },
    { bg: '#cce5ff', fg: '#001d31' },
    { bg: '#ffdad6', fg: '#410003' },
  ];
  const SVC_STATUSES = ['Новые', 'Ждет запчасти', 'В работе', 'Готов к выдаче', 'Завершено'];
  const STATUS_COLORS = { 'Новые': '#d81324', 'Ждет запчасти': '#575e70', 'В работе': '#005989', 'Готов к выдаче': '#0d9488', 'Завершено': '#6b7280' };

  let viewMode = 7;
  let anchor = startOfToday();
  let entries = [];
  let services = [];
  let serviceRequests = [];
  let managers = [];
  let clients = [];
  let notificationRecipients = [];
  let me = null;

  let currentId = null;            // запись клиента
  let entryColor = '#D81324';      // цвет для «Другое» (по умолчанию красный)
  let participantsItems = [];
  let participantsMeta = { count: 1, level: '', rent_bike: false };
  let selectedClientIds = new Set(); // выбранные клиенты в записи
  let pickerSelected = new Set();   // временный выбор в попапе

  let currentServiceId = null;     // сервисная заявка
  let currentServiceItemId = null; // услуга
  let currentClientId = null;      // клиент (книга клиентов)
  let serviceBusy = false;         // защита от двойного нажатия (услуги)

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function toISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromISO(s) { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function getDays() { return Array.from({ length: viewMode }, (_, i) => addDays(anchor, i)); }
  function timeToMin(t) {
    if (!t) return null;
    const m = String(t).match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }
  function minToTime(m) {
    if (m == null || isNaN(m)) return '';
    return pad(Math.floor(m / 60) % 24) + ':' + pad(m % 60);
  }
  function calcEnd(startTime, durationMin) {
    const s = timeToMin(startTime);
    if (s == null || !durationMin) return '';
    return minToTime(s + parseInt(durationMin, 10));
  }
  function populateServiceSelect() {
    const sel = document.getElementById('f-service');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = ['<option value="">— Выберите услугу —</option>']
      .concat(services.map((s) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`))
      .concat(['<option value="__other__">Другое</option>'])
      .join('');
    sel.value = current || '';
  }
  function currentCount() {
    return parseInt(document.getElementById('f-count').textContent, 10) || 1;
  }

  function recomputeEnd() {
    const sel = document.getElementById('f-service');
    if (sel.value === '__other__' || !sel.value) return;
    const s = services.find((x) => x.name === sel.value);
    const dur = s ? parseInt(s.duration, 10) : 0;
    if (dur > 0) {
      document.getElementById('f-end').value = calcEnd(document.getElementById('f-start').value, dur);
    }
  }

  function recalcCost() {
    const sel = document.getElementById('f-service');
    if (sel.value === '__other__' || !sel.value) return;
    const s = services.find((x) => x.name === sel.value);
    const price = s ? parseFloat(s.price) : NaN;
    if (!isNaN(price) && price > 0) {
      document.getElementById('f-cost').value = price * currentCount();
    }
  }

  function applyServiceSelection() {
    const sel = document.getElementById('f-service');
    const isOther = sel.value === '__other__';
    const customWrap = document.getElementById('f-service-custom-wrap');
    const colorWrap = document.getElementById('f-color-wrap');
    const endInput = document.getElementById('f-end');
    const endHint = document.getElementById('f-end-hint');

    customWrap.style.display = isOther ? '' : 'none';
    colorWrap.style.display = isOther ? '' : 'none';

    if (isOther) {
      endInput.disabled = false;
      endHint.style.display = 'none';
      return;
    }
    const s = services.find((x) => x.name === sel.value);
    if (s) {
      recalcCost();
      const dur = parseInt(s.duration, 10);
      if (dur > 0) {
        endInput.value = calcEnd(document.getElementById('f-start').value, dur);
        endInput.disabled = true;
        endHint.style.display = '';
      } else {
        endInput.disabled = false;
        endHint.style.display = 'none';
      }
    } else {
      endInput.disabled = false;
      endHint.style.display = 'none';
    }
  }
  function colorFor(service) {
    const s = services.find((x) => x.name === service && x.color);
    if (s && s.color) return { bg: s.color, fg: '#ffffff' };
    let h = 0;
    for (const c of String(service || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }
  function colorWithFg(hex) {
    const c = String(hex || '').replace('#', '');
    if (c.length !== 6) return { bg: hex, fg: '#ffffff' };
    const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return { bg: '#' + c, fg: lum > 160 ? '#191c1e' : '#ffffff' };
  }
  function statusColor(s) { return STATUS_COLORS[s] || '#d81324'; }
  function initials(name) {
    return String(name || '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }
  function confirmDialog(msg) {
    return new Promise((resolve) => {
      if (LT.tg && LT.tg.showConfirm) LT.tg.showConfirm(msg, (ok) => resolve(ok));
      else resolve(window.confirm(msg));
    });
  }

  // ---------- boot ----------
  async function boot() {
    me = await LT.checkRole();
    if (!me || !me.is_manager) { location.replace('index.html'); return; }
    if (!me.is_owner) {
      // скрываем под-вкладку «Сотрудники» для не-Owner
      const staffTab = document.querySelector('.settings__tab[data-subtab="staff"]');
      if (staffTab) staffTab.style.display = 'none';
    }
    await loadData();
    render();
    renderBoard();
    renderClients();
    renderServices();
    if (me.is_owner) renderStaff();
    setTimeout(scrollToFirstEvent, 60); // фокус на первой записи при входе
  }

  async function loadData() {
    try {
      const d = await LT.api('/api/admin/data');
      entries = d.entries || [];
      services = d.services || [];
      serviceRequests = d.serviceRequests || [];
      clients = d.clients || [];
      managers = d.managers || [];
      notificationRecipients = d.notifications || [];
    } catch (e) {
      entries = []; services = []; serviceRequests = []; clients = []; managers = []; notificationRecipients = [];
    }
    populateServiceSelect();
  }

  // ---------- календарь ----------
  function render() {
    const days = getDays();
    document.getElementById('range').textContent = rangeLabel(days);
    document.getElementById('stats').textContent = entries.length + ' записей';

    document.getElementById('cal-head').innerHTML =
      '<div class="cal__time-spacer"></div>' + days.map(dayHead).join('');

    let times = '';
    HOURS.forEach((h, i) => { times += `<span style="top:${i * PX_PER_HOUR}px">${pad(h)}:00</span>`; });
    const cols = days.map((d) => {
      const evs = layoutDayEvents(entriesForDay(d)).map(eventHtml).join('');
      return `<div class="cal__col" style="height:${GRID_HEIGHT}px">${evs}</div>`;
    }).join('');
    document.getElementById('cal-body').innerHTML =
      `<div class="cal__times" style="height:${GRID_HEIGHT}px">${times}</div>` + cols;
  }

  function rangeLabel(days) {
    const f = days[0], l = days[days.length - 1];
    if (days.length === 1) return `${f.getDate()} ${MONTHS[f.getMonth()]}`;
    if (f.getMonth() === l.getMonth()) return `${f.getDate()}–${l.getDate()} ${MONTHS[l.getMonth()]}`;
    return `${f.getDate()} ${MONTHS[f.getMonth()]} – ${l.getDate()} ${MONTHS[l.getMonth()]}`;
  }

  function dayHead(d) {
    const isToday = toISO(d) === toISO(new Date());
    const cnt = entries.filter((e) => e.date === toISO(d) && e.time_start).length;
    return `<div class="cal__day-head ${isToday ? 'is-today' : ''}">
      <div class="num">${d.getDate()}</div>
      <div class="wd">${WD[d.getDay()]}</div>
      <div class="cnt">${cnt ? cnt + ' записи' : '—'}</div>
    </div>`;
  }

  function entriesForDay(d) {
    const iso = toISO(d);
    return entries.filter((e) => e.date === iso && e.time_start && e.time_end);
  }

  // Раскладывает события дня по «дорожкам», чтобы пересекающиеся по времени
  // события стояли рядом, а не накладывались друг на друга.
  function layoutDayEvents(dayEvents) {
    const valid = dayEvents
      .map((e) => ({ e, start: timeToMin(e.time_start), end: timeToMin(e.time_end) }))
      .filter((x) => x.start != null && x.end != null && x.end > x.start)
      .sort((a, b) => a.start - b.start || a.end - b.end);

    const layouts = [];
    let cluster = [];
    let clusterEnd = -1;

    const flush = () => {
      const laneEnds = [];
      for (const item of cluster) {
        let lane = -1;
        for (let i = 0; i < laneEnds.length; i++) {
          if (laneEnds[i] <= item.start) { lane = i; break; }
        }
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(item.end); }
        else laneEnds[lane] = item.end;
        item.lane = lane;
      }
      const lanes = laneEnds.length;
      for (const item of cluster) {
        layouts.push({
          e: item.e,
          lane: item.lane,
          lanes,
          top: (item.start / 60) * PX_PER_HOUR,
          height: ((item.end - item.start) / 60) * PX_PER_HOUR,
        });
      }
      cluster = [];
      clusterEnd = -1;
    };

    for (const item of valid) {
      if (cluster.length && item.start >= clusterEnd) flush();
      cluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.end);
    }
    if (cluster.length) flush();
    return layouts;
  }

  function eventHtml(layout) {
    const e = layout.e;
    const color = e.color ? colorWithFg(e.color) : colorFor(e.service);
    const cancelled = e.status === 'Отменена';
    const done = e.status === 'Завершено';
    const total = (e.participants && e.participants.count) || 1;
    const left = `calc(${(layout.lane * 100 / layout.lanes).toFixed(3)}% + 2px)`;
    const width = `calc(${(100 / layout.lanes).toFixed(3)}% - 4px)`;
    const style = `top:${layout.top}px;height:${Math.max(layout.height, 26)}px;background:${color.bg};color:${color.fg};left:${left};width:${width};right:auto`;
    return `<div class="event ${cancelled ? 'is-cancelled' : ''} ${done ? 'is-done' : ''}" style="${style}" data-id="${esc(e.id)}">
      <span class="event__time">${esc(e.time_start)}–${esc(e.time_end)}</span>
      <span class="event__name">${esc(e.name || 'Без имени')} • ${total} чел</span>
      <span class="event__service">${esc(e.service)}</span>
    </div>`;
  }

  // Скроллим календарь так, чтобы первая по времени запись была видна
  // с одним пустым часовым рядом над ней.
  function scrollToFirstEvent() {
    const calBody = document.getElementById('cal-body');
    if (!calBody) return;
    const dayIso = getDays().map(toISO);
    const evs = entries
      .filter((e) => dayIso.includes(e.date) && e.time_start)
      .sort((a, b) => (a.date + a.time_start).localeCompare(b.date + b.time_start));
    if (!evs.length) return;
    const startMin = timeToMin(evs[0].time_start);
    if (startMin == null) return;

    const gridTop = calBody.getBoundingClientRect().top + window.scrollY;
    const eventTop = (startMin / 60) * PX_PER_HOUR;
    const toolbar = document.querySelector('.toolbar');
    const head = document.getElementById('cal-head');
    const stickyH = (toolbar ? toolbar.offsetHeight : 0) + (head ? head.offsetHeight : 0);
    const target = gridTop + eventTop - PX_PER_HOUR - stickyH;
    window.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }

  // ---------- запись клиента (sheet 1) ----------
  function openSheet(entry, prefill) {
    prefill = prefill || {};
    currentId = entry ? entry.id : null;
    participantsItems = entry && entry.participants ? (entry.participants.items || []).map((p) => ({ ...p })) : [];
    participantsMeta = entry && entry.participants
      ? { count: entry.participants.count || 1, level: entry.participants.level || '', rent_bike: !!entry.participants.rent_bike }
      : { count: 1, level: '', rent_bike: false };

    document.getElementById('sheet-id').textContent = entry ? '#' + entry.id : 'Новая запись';
    document.getElementById('sheet-delete').style.display = entry ? '' : 'none';
    // Отмена/завершение — только при редактировании существующей записи
    document.getElementById('f-status-wrap').style.display = entry ? '' : 'none';
    const st = entry && entry.status ? entry.status : 'Активна';
    document.getElementById('f-cancelled').checked = st === 'Отменена';

    document.getElementById('f-date').value = entry && entry.date ? entry.date : (prefill.date || toISO(new Date()));
    document.getElementById('f-start').value = entry && entry.time_start ? entry.time_start : (prefill.time_start || '10:00');
    document.getElementById('f-end').value = entry && entry.time_end ? entry.time_end : (prefill.time_end || '12:00');
    document.getElementById('f-name').value = entry ? entry.name : '';
    document.getElementById('f-phone').value = entry && entry.phone ? LT.formatPhone(entry.phone) : '+375 ';
    document.getElementById('f-count').textContent = participantsMeta.count || 1;

    const svcName = entry ? (entry.service || '') : '';
    const sel = document.getElementById('f-service');
    if (svcName && services.some((x) => x.name === svcName)) {
      sel.value = svcName;
      document.getElementById('f-service-custom').value = '';
    } else if (svcName) {
      sel.value = '__other__';
      document.getElementById('f-service-custom').value = svcName;
    } else {
      sel.value = '';
      document.getElementById('f-service-custom').value = '';
    }

    // цвет события (для «Другое»)
    entryColor = entry && entry.color ? entry.color : '#D81324';
    document.querySelectorAll('.swatch').forEach((sw) => {
      sw.classList.toggle('is-active', sw.dataset.color === entryColor);
    });
    const activeSwatch = document.querySelector('.swatch.is-active');
    document.getElementById('f-color-label').textContent = activeSwatch ? activeSwatch.dataset.label : 'Внимание (корп)';

    document.getElementById('f-cost').value = entry ? entry.cost : '';
    document.getElementById('f-comment').value = entry ? entry.comment : '';
    document.getElementById('f-prepaid').checked = entry ? !!entry.prepaid : false;
    document.getElementById('sheet-error').classList.remove('is-visible');

    // выбранные клиенты
    selectedClientIds = new Set(
      (entry && entry.participants && entry.participants.clients ? entry.participants.clients : [])
        .map((c) => c.id).filter(Boolean)
    );

    applyServiceSelection();
    applyPrepaidHint();
    renderParticipants();
    document.getElementById('sheet').classList.add('is-visible');
  }

  function applyPrepaidHint() {
    const on = document.getElementById('f-prepaid').checked;
    document.getElementById('f-comment-req').style.display = on ? '' : 'none';
  }

  function closeSheet() { document.getElementById('sheet').classList.remove('is-visible'); }

  function renderParticipants() {
    document.getElementById('participants-list').innerHTML = participantsItems.map((p, i) => `
      <div class="participant" data-i="${i}">
        <span class="participant__num">#${i + 1}</span>
        <div class="participant__body">
          <input placeholder="Имя участника" value="${esc(p.name)}" data-f="name" />
          <input placeholder="Телефон" value="${esc(p.phone ? LT.formatPhone(p.phone) : '')}" data-f="phone" />
        </div>
        <button class="participant__remove" type="button">×</button>
      </div>`).join('');
  }

  function collectPayload() {
    const count = currentCount();
    const isOther = document.getElementById('f-service').value === '__other__';
    const service = isOther
      ? document.getElementById('f-service-custom').value.trim()
      : document.getElementById('f-service').value;

    // Для известной услуги с длительностью финиш всегда = старт + длительность.
    // Считаем здесь (на момент сохранения), чтобы не зависеть от состояния UI.
    let time_end = document.getElementById('f-end').value;
    if (!isOther) {
      const s = services.find((x) => x.name === service);
      const dur = s ? parseInt(s.duration, 10) : 0;
      if (dur > 0) time_end = calcEnd(document.getElementById('f-start').value, dur);
    }

    return {
      date: document.getElementById('f-date').value,
      time_start: document.getElementById('f-start').value,
      time_end: time_end,
      name: document.getElementById('f-name').value.trim(),
      phone: document.getElementById('f-phone').value.trim(),
      service: service,
      cost: document.getElementById('f-cost').value.trim(),
      participants: {
        count: count,
        level: participantsMeta.level,
        rent_bike: participantsMeta.rent_bike,
        items: participantsItems,
        clients: clients.filter((c) => selectedClientIds.has(c.id)).map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
      },
      comment: document.getElementById('f-comment').value.trim(),
      status: document.getElementById('f-cancelled').checked ? 'Отменена' : 'Активна',
      color: isOther ? entryColor : '',
      prepaid: document.getElementById('f-prepaid').checked,
    };
  }

  async function save() {
    const payload = collectPayload();
    const isOther = document.getElementById('f-service').value === '__other__';
    if (!payload.date || !payload.time_start) { showSheetError('sheet-error', 'Укажите дату и время начала.'); return; }
    if (isOther && !payload.time_end) { showSheetError('sheet-error', 'Для «Другое» укажите время финиша.'); return; }
    if (isOther && !payload.service) { showSheetError('sheet-error', 'Укажите описание услуги.'); return; }
    if (payload.prepaid && !payload.comment) { showSheetError('sheet-error', 'Включена предоплата — укажите комментарий.'); return; }
    if (!payload.name) { showSheetError('sheet-error', 'Укажите имя клиента.'); return; }
    const phoneInput = document.getElementById('f-phone');
    if (phoneInput.value.trim() && !LT.phoneValid(phoneInput)) { showSheetError('sheet-error', 'Введите номер в формате +375 XX XXX XX XX.'); return; }

    // блокировка забаненного клиента
    const banned = findBannedClient();
    if (banned) { showBannedPopup(banned); return; }

    const btn = document.getElementById('sheet-save');
    btn.disabled = true; btn.textContent = 'Сохранение...';
    try {
      let resp;
      if (currentId) {
        resp = await LT.api('/api/admin/entries/' + currentId, { method: 'PUT', body: JSON.stringify(payload) });
        const idx = entries.findIndex((e) => e.id === currentId);
        const merged = { id: currentId, ...payload, participants: payload.participants };
        if (idx >= 0) entries[idx] = merged;
        else entries.push(merged);
      } else {
        resp = await LT.api('/api/admin/entries', { method: 'POST', body: JSON.stringify(payload) });
        entries.push({ id: resp.id, ...payload, participants: payload.participants });
      }
      LT.haptic('notificationOccurred');
      closeSheet();
      render(); // сразу рисуем (оптимистично)
      // фоново подтягиваем клиентов (могли автоматически создаться новые)
      loadData().then(() => { render(); renderClients(); });

      // уведомление клиента
      if (resp && resp.notify === 'manual') {
        showManualNotifyPopup(resp);
      } else if (resp && resp.notify === 'telegram') {
        showSavedToast();
      }
      // notify === 'none' → ничего не показываем
    } catch (err) {
      showSheetError('sheet-error', err.message || 'Не удалось сохранить.');
    } finally {
      btn.disabled = false; btn.textContent = 'Сохранить запись';
    }
  }

  async function remove() {
    if (!currentId) return;
    if (!(await confirmDialog('Удалить запись #' + currentId + '?'))) return;
    try {
      await LT.api('/api/admin/entries/' + currentId, { method: 'DELETE' });
      closeSheet();
      entries = entries.filter((e) => e.id !== currentId);
      render();
    } catch (err) {
      showSheetError('sheet-error', err.message || 'Не удалось удалить.');
    }
  }

  // ---------- уведомления клиента (Viber/WhatsApp) ----------
  function cleanPhoneDigits(phone) { return String(phone || '').replace(/\D/g, ''); }

  function buildViberLink(phone) { return 'viber://chat?number=%2B' + cleanPhoneDigits(phone); }
  function buildWhatsAppLink(phone) { return 'https://wa.me/' + cleanPhoneDigits(phone); }

  function showManualNotifyPopup(info) {
    const digits = cleanPhoneDigits(info.phone);
    document.getElementById('open-viber').style.display = digits ? '' : 'none';
    document.getElementById('open-whatsapp').style.display = digits ? '' : 'none';
    // сохраняем данные для кнопок
    document.getElementById('manual-notify-popup').dataset.phone = digits;
    document.getElementById('manual-notify-popup').dataset.text = info.message_text || '';
    LT.copyToClipboard(info.message_text || '');
    document.getElementById('manual-notify-popup').classList.add('is-visible');
  }

  function showSavedToast() {
    const el = document.getElementById('saved-toast');
    if (!el) return;
    el.classList.add('is-visible');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('is-visible'), 2000);
  }

  // ---------- канбан ----------
  function renderBoard() {
    document.getElementById('board').innerHTML = SVC_STATUSES.map((status) => {
      const cards = serviceRequests.filter((r) => r.status === status);
      return `<div class="kcol">
        <div class="kcol__head">
          <div class="kcol__title"><span class="kcol__bar" style="background:${statusColor(status)}"></span>${esc(status)}</div>
          <span class="kcol__count" style="background:${statusColor(status)}">${cards.length}</span>
        </div>
        ${cards.length ? cards.map(kcardHtml).join('') : '<div class="kcol__empty">Пусто</div>'}
      </div>`;
    }).join('');
  }

  function kcardHtml(r) {
    return `<div class="kcard" style="border-left-color:${statusColor(r.status)}" data-id="${esc(r.id)}">
      <div class="kcard__meta"><span>${esc(r.created_at ? r.created_at.slice(0, 10) : '')}${r.desired_date ? ' • к ' + esc(r.desired_date) : ''}</span></div>
      <div class="kcard__bike">${esc(r.bike || 'Без мотоцикла')}</div>
      <div class="kcard__problem">${esc(r.problem || '')}</div>
      <div class="kcard__foot"><span>${esc(r.name || '')}</span><span>${esc(r.cost ? r.cost + ' BYN' : '')}</span></div>
    </div>`;
  }

  function openServiceSheet(r) {
    currentServiceId = r ? r.id : null;
    document.getElementById('service-sheet-id').textContent = r ? '#' + r.id : 'Новая заявка';
    document.getElementById('s-bike').value = r ? r.bike : '';
    document.getElementById('s-problem').value = r ? r.problem : '';
    document.getElementById('s-name').value = r ? r.name : '';
    document.getElementById('s-phone').value = r ? r.phone : '';
    document.getElementById('s-desired').value = r ? r.desired_date : '';
    document.getElementById('s-status').value = r ? (r.status || 'Новые') : 'Новые';
    document.getElementById('s-cost').value = r ? r.cost : '';
    document.getElementById('s-mech').value = r ? r.mechanic_comment : '';
    document.getElementById('service-sheet-error').classList.remove('is-visible');
    document.getElementById('service-sheet').classList.add('is-visible');
  }

  async function saveService() {
    const payload = {
      bike: document.getElementById('s-bike').value.trim(),
      problem: document.getElementById('s-problem').value.trim(),
      desired_date: document.getElementById('s-desired').value,
      name: document.getElementById('s-name').value.trim(),
      phone: document.getElementById('s-phone').value.trim(),
      status: document.getElementById('s-status').value,
      cost: document.getElementById('s-cost').value.trim(),
      mechanic_comment: document.getElementById('s-mech').value.trim(),
    };
    const btn = document.getElementById('service-sheet-save');
    btn.disabled = true;
    try {
      if (currentServiceId) {
        await LT.api('/api/admin/service/' + currentServiceId, { method: 'PUT', body: JSON.stringify(payload) });
        const idx = serviceRequests.findIndex((r) => r.id === currentServiceId);
        const merged = Object.assign({}, idx >= 0 ? serviceRequests[idx] : {}, payload);
        if (idx >= 0) serviceRequests[idx] = merged;
        else serviceRequests.push({ id: currentServiceId, ...payload, created_at: '' });
      } else {
        const resp = await LT.api('/api/admin/service', { method: 'POST', body: JSON.stringify(payload) });
        serviceRequests.push({ id: resp.id, ...payload, created_at: '' });
      }
      document.getElementById('service-sheet').classList.remove('is-visible');
      renderBoard();
    } catch (err) {
      showSheetError('service-sheet-error', err.message || 'Не удалось сохранить.');
    } finally { btn.disabled = false; }
  }

  // ---------- настройки: услуги ----------
  function renderServices() {
    const list = document.getElementById('services-list');
    list.innerHTML = services.map((s) => `
      <div class="svc-item" style="border-left-color:${esc(s.color || '#D81324')}">
        <div class="svc-item__body">
          <div class="svc-item__name">${esc(s.name)}</div>
          <div class="svc-item__sub">${esc(s.category || '')}${s.duration ? ' • ' + esc(s.duration) + ' мин' : ''}</div>
        </div>
        <div class="svc-item__price">${esc(s.price ? s.price + ' BYN' : '')}</div>
        <button class="icon-btn-round" data-edit="${esc(s.id)}" type="button">✎</button>
        <button class="icon-btn-round danger" data-del="${esc(s.id)}" type="button">🗑</button>
      </div>`).join('') || '<div class="muted">Нет услуг. Добавьте первую.</div>';
  }

  function openServiceForm(s) {
    currentServiceItemId = s ? s.id : null;
    document.getElementById('service-form-id').textContent = s ? '#' + s.id : 'Новая услуга';
    document.getElementById('c-category').value = s ? s.category : '';
    document.getElementById('c-name').value = s ? s.name : '';
    document.getElementById('c-duration').value = s ? s.duration : '';
    document.getElementById('c-price').value = s ? s.price : '';
    document.getElementById('c-color').value = s && s.color ? s.color : '#D81324';
    document.getElementById('service-form-error').classList.remove('is-visible');
    document.getElementById('service-form-sheet').classList.add('is-visible');
  }

  async function saveServiceForm() {
    if (serviceBusy) return; // защита от двойного нажатия
    const name = document.getElementById('c-name').value.trim();
    if (!name) { showSheetError('service-form-error', 'Укажите название услуги.'); return; }

    serviceBusy = true;
    const btn = document.getElementById('service-form-save');
    btn.disabled = true; btn.textContent = 'Сохранение...';

    const payload = {
      category: document.getElementById('c-category').value.trim(),
      name: name,
      duration: document.getElementById('c-duration').value.trim(),
      price: document.getElementById('c-price').value.trim(),
      color: document.getElementById('c-color').value,
    };
    try {
      if (currentServiceItemId) {
        await LT.api('/api/admin/services/' + currentServiceItemId, { method: 'PUT', body: JSON.stringify(payload) });
        const idx = services.findIndex((s) => s.id === currentServiceItemId);
        const merged = { id: currentServiceItemId, ...payload };
        if (idx >= 0) services[idx] = merged;
        else services.push(merged);
      } else {
        const resp = await LT.api('/api/admin/services', { method: 'POST', body: JSON.stringify(payload) });
        services.push({ id: resp.id, ...payload });
      }
      document.getElementById('service-form-sheet').classList.remove('is-visible');
      populateServiceSelect();
      renderServices();
      render();
    } catch (err) {
      showSheetError('service-form-error', err.message || 'Не удалось сохранить.');
    } finally {
      serviceBusy = false;
      btn.disabled = false; btn.textContent = 'Сохранить услугу';
    }
  }

  async function deleteService(id) {
    if (serviceBusy) return; // защита от двойного нажатия
    serviceBusy = true;
    try {
      if (!(await confirmDialog('Удалить услугу?'))) return;
      await LT.api('/api/admin/services/' + id, { method: 'DELETE' });
      services = services.filter((s) => s.id !== id);
      populateServiceSelect();
      renderServices();
      render();
    } catch (err) {
      alert(err.message || 'Ошибка');
    } finally {
      serviceBusy = false;
    }
  }

  // ---------- настройки: сотрудники ----------
  function renderStaff() {
    const list = document.getElementById('staff-list');
    list.innerHTML = managers.map((m) => `
      <div class="staff-item">
        <div class="staff-item__avatar">${esc(initials(m.name) || '#')}</div>
        <div class="staff-item__body">
          <div class="staff-item__name">${esc(m.name || 'Без имени')}</div>
          <div class="staff-item__sub">ID: ${m.telegram_id} • ${esc(m.role)}</div>
        </div>
        <button class="icon-btn-round danger" data-del-staff="${m.telegram_id}" type="button">🗑</button>
      </div>`).join('') || '<div class="muted">Нет сотрудников.</div>';
  }

  async function addStaff() {
    const btn = document.getElementById('add-staff');
    if (btn.disabled) return; // защита от двойного нажатия
    const telegram_id = parseInt(document.getElementById('staff-id').value.trim(), 10);
    const name = document.getElementById('staff-name').value.trim();
    const role = document.getElementById('staff-role').value;
    if (!telegram_id) { alert('Введите Telegram ID.'); return; }
    btn.disabled = true; btn.textContent = 'Выдача...';
    try {
      await LT.api('/api/admin/managers', { method: 'POST', body: JSON.stringify({ telegram_id, name, role }) });
      document.getElementById('staff-id').value = '';
      document.getElementById('staff-name').value = '';
      managers = managers.filter((m) => m.telegram_id !== telegram_id);
      managers.push({ telegram_id, name, role, added: '' });
      renderStaff();
    } catch (err) {
      alert(err.message || 'Ошибка');
    } finally {
      btn.disabled = false; btn.textContent = 'Выдать доступ';
    }
  }

  async function removeStaff(id) {
    if (!(await confirmDialog('Отозвать доступ у ID ' + id + '?'))) return;
    try {
      await LT.api('/api/admin/managers/' + id, { method: 'DELETE' });
      managers = managers.filter((m) => m.telegram_id !== id);
      renderStaff();
    } catch (err) {
      alert(err.message || 'Ошибка');
    }
  }

  // ---------- настройки: уведомления ----------
  function renderNotifications() {
    const list = document.getElementById('notifications-list');
    list.innerHTML = notificationRecipients.map((r) => `
      <div class="staff-item">
        <div class="staff-item__avatar">${esc(initials(r.name) || '#')}</div>
        <div class="staff-item__body">
          <div class="staff-item__name">${esc(r.name || 'Без имени')}</div>
          <div class="staff-item__sub">Telegram ID: ${r.telegram_id}</div>
        </div>
        <button class="icon-btn-round danger" data-del-notif="${r.telegram_id}" type="button">🗑</button>
      </div>`).join('') || '<div class="muted">Получателей нет — уведомления идут всем менеджерам.</div>';
  }

  async function addNotification() {
    const telegram_id = parseInt(document.getElementById('notif-id').value.trim(), 10);
    const name = document.getElementById('notif-name').value.trim();
    if (!telegram_id) { alert('Введите Telegram ID.'); return; }
    try {
      await LT.api('/api/admin/notifications', { method: 'POST', body: JSON.stringify({ telegram_id, name }) });
      document.getElementById('notif-id').value = '';
      document.getElementById('notif-name').value = '';
      notificationRecipients = notificationRecipients.filter((r) => r.telegram_id !== telegram_id);
      notificationRecipients.push({ telegram_id, name, added: '' });
      renderNotifications();
    } catch (err) {
      alert(err.message || 'Ошибка');
    }
  }

  async function removeNotification(id) {
    if (!(await confirmDialog('Убрать получателя ID ' + id + '?'))) return;
    try {
      await LT.api('/api/admin/notifications/' + id, { method: 'DELETE' });
      notificationRecipients = notificationRecipients.filter((r) => r.telegram_id !== id);
      renderNotifications();
    } catch (err) {
      alert(err.message || 'Ошибка');
    }
  }

  function showSheetError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg; el.classList.add('is-visible');
  }

  // ---------- книга клиентов ----------
  function clientInEntry(clientId, e) {
    const arr = (e.participants && e.participants.clients) || [];
    return arr.some((x) => x.id === clientId);
  }

  function phoneKey(p) { return String(p || '').replace(/\D/g, ''); }

  function findBannedClient() {
    // выбранные через пикер
    for (const c of clients) {
      if (c.blacklisted && selectedClientIds.has(c.id)) return c;
    }
    // основной заказчик по телефону
    const mainKey = phoneKey(document.getElementById('f-phone').value);
    if (mainKey) {
      for (const c of clients) {
        if (c.blacklisted && phoneKey(c.phone) === mainKey) return c;
      }
    }
    // участники группы по телефону
    for (const p of participantsItems) {
      const pk = phoneKey(p.phone);
      if (!pk) continue;
      for (const c of clients) {
        if (c.blacklisted && phoneKey(c.phone) === pk) return c;
      }
    }
    return null;
  }

  function showBannedPopup(client) {
    document.getElementById('banned-info').innerHTML = `
      <div class="banned-row"><span>Имя:</span><strong>${esc(client.name || '—')}</strong></div>
      <div class="banned-row"><span>Телефон:</span><strong>${esc(client.phone || '—')}</strong></div>
      <div class="banned-row"><span>Комментарий:</span><strong>${esc(client.description || '—')}</strong></div>`;
    document.getElementById('banned-popup').classList.add('is-visible');
  }

  function renderClients() {
    const q = (document.getElementById('client-search').value || '').trim().toLowerCase();
    const filtered = clients.filter((c) =>
      !q || (c.name || '').toLowerCase().includes(q) || (c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    );
    document.getElementById('clients-list').innerHTML = filtered.map((c) => {
      const cnt = entries.filter((e) => clientInEntry(c.id, e)).length;
      return `<div class="client-item ${c.blacklisted ? 'is-banned' : ''}" data-id="${esc(c.id)}">
        <div class="client-item__avatar">${esc(initials(c.name) || '#')}</div>
        <div class="client-item__body">
          <div class="client-item__name">${esc(c.name || 'Без имени')}${c.blacklisted ? ' <span class="ban-badge">banned</span>' : ''}</div>
          <div class="client-item__sub">${esc(c.phone || '')}${c.username ? ' • @' + esc(c.username) : ''}</div>
        </div>
        <div class="client-item__count">${cnt ? cnt + ' маршр.' : ''}</div>
      </div>`;
    }).join('') || '<div class="muted">Нет клиентов. Добавьте первого.</div>';
  }

  // ---------- попап выбора клиентов ----------
  function openClientPicker() {
    pickerSelected = new Set(selectedClientIds);
    document.getElementById('picker-search').value = '';
    renderPickerList();
    document.getElementById('client-picker').classList.add('is-visible');
  }

  function closePicker() {
    document.getElementById('client-picker').classList.remove('is-visible');
  }

  function renderPickerList() {
    const q = (document.getElementById('picker-search').value || '').trim().toLowerCase();
    const filtered = clients.filter((c) =>
      !q || (c.name || '').toLowerCase().includes(q) || (c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
    );
    document.getElementById('picker-list').innerHTML = filtered.map((c) => `
      <label class="check-item">
        <input type="checkbox" data-client-id="${esc(c.id)}" ${pickerSelected.has(c.id) ? 'checked' : ''} />
        <span>
          <span class="check-item__name">${esc(c.name || 'Без имени')}</span>
          <span class="check-item__phone">${esc(c.phone || '')}</span>
        </span>
      </label>`).join('') || '<div class="muted">Нет клиентов в базе.</div>';
    updatePickerCount();
  }

  function updatePickerCount() {
    const n = pickerSelected.size;
    document.getElementById('picker-done').textContent = n ? `Готово (${n})` : 'Готово';
  }

  function applyClientSelection() {
    const selected = clients.filter((c) => pickerSelected.has(c.id));
    selectedClientIds = new Set(selected.map((c) => c.id));

    // основной заказчик = первый выбранный
    if (selected.length) {
      document.getElementById('f-name').value = selected[0].name || '';
      document.getElementById('f-phone').value = selected[0].phone ? LT.formatPhone(selected[0].phone) : '+375 ';
    }

    // участники группы = разовые (без client_id) + выбранные со 2-го
    const walkins = participantsItems.filter((p) => !p.client_id);
    const extraClients = selected.slice(1).map((c) => ({ name: c.name || '', phone: c.phone || '', cost: '', client_id: c.id }));
    participantsItems = walkins.concat(extraClients);

    // счётчик = выбранные + разовые
    document.getElementById('f-count').textContent = Math.max(1, selected.length + walkins.length);

    renderParticipants();
    recalcCost();
    closePicker();
  }

  function renderClientHistory(clientId) {
    const routes = entries.filter((e) => clientInEntry(clientId, e));
    routes.sort((a, b) => (b.date + ' ' + b.time_start).localeCompare(a.date + ' ' + a.time_start));
    document.getElementById('cl-history').innerHTML = routes.map((e) => {
      const st = e.status || 'Активна';
      const cls = st === 'Завершено' ? 'done' : st === 'Отменена' ? 'cancelled' : 'active';
      return `<div class="history-item">
        <div class="history-item__main">
          <div class="history-item__date">${esc(e.date)}${e.time_start ? ' • ' + esc(e.time_start) : ''}</div>
          <div class="history-item__service">${esc(e.service || 'Без услуги')}</div>
        </div>
        <span class="status-badge ${cls}">${esc(st)}</span>
      </div>`;
    }).join('') || '<div class="muted">Маршрутов пока нет.</div>';
  }

  function openClientSheet(client) {
    currentClientId = client ? client.id : null;
    document.getElementById('client-sheet-id').textContent = client ? '#' + client.id : 'Новый клиент';
    document.getElementById('client-sheet-delete').style.display = client ? '' : 'none';
    document.getElementById('cl-name').value = client ? client.name : '';
    document.getElementById('cl-phone').value = client && client.phone ? LT.formatPhone(client.phone) : '+375 ';
    document.getElementById('cl-username').value = client && client.username ? client.username.replace(/^@/, '') : '';
    document.getElementById('cl-description').value = client ? (client.description || '') : '';
    document.getElementById('cl-blacklisted').checked = client ? !!client.blacklisted : false;
    document.getElementById('client-sheet-error').classList.remove('is-visible');
    document.getElementById('cl-history-sec').style.display = client ? '' : 'none';
    if (client) renderClientHistory(client.id);
    else document.getElementById('cl-history').innerHTML = '';
    document.getElementById('client-sheet').classList.add('is-visible');
  }

  async function saveClient() {
    const name = document.getElementById('cl-name').value.trim();
    const phoneInput = document.getElementById('cl-phone');
    if (!name) { showSheetError('client-sheet-error', 'Укажите имя.'); return; }
    if (!LT.phoneValid(phoneInput)) { showSheetError('client-sheet-error', 'Введите номер в формате +375 XX XXX XX XX.'); return; }
    const payload = {
      name: name,
      phone: phoneInput.value.trim(),
      username: document.getElementById('cl-username').value.trim().replace(/^@/, ''),
      telegram_id: 0,
      description: document.getElementById('cl-description').value.trim(),
      blacklisted: document.getElementById('cl-blacklisted').checked,
    };
    try {
      if (currentClientId) {
        await LT.api('/api/admin/clients/' + currentClientId, { method: 'PUT', body: JSON.stringify(payload) });
        const idx = clients.findIndex((c) => c.id === currentClientId);
        const merged = Object.assign({}, idx >= 0 ? clients[idx] : {}, payload);
        if (idx >= 0) clients[idx] = merged;
        else clients.push({ id: currentClientId, ...payload, created_at: '' });
      } else {
        const resp = await LT.api('/api/admin/clients', { method: 'POST', body: JSON.stringify(payload) });
        clients.push({ id: resp.id, ...payload, created_at: '', telegram_id: 0 });
      }
      document.getElementById('client-sheet').classList.remove('is-visible');
      renderClients();
    } catch (err) {
      showSheetError('client-sheet-error', err.message || 'Не удалось сохранить.');
    }
  }

  async function deleteClient() {
    if (!currentClientId) return;
    if (!(await confirmDialog('Удалить клиента?'))) return;
    try {
      await LT.api('/api/admin/clients/' + currentClientId, { method: 'DELETE' });
      document.getElementById('client-sheet').classList.remove('is-visible');
      clients = clients.filter((c) => c.id !== currentClientId);
      renderClients();
    } catch (err) {
      showSheetError('client-sheet-error', err.message || 'Не удалось удалить.');
    }
  }

  // ---------- события: календарь ----------
  document.getElementById('prev').addEventListener('click', () => { anchor = addDays(anchor, -viewMode); render(); });
  document.getElementById('next').addEventListener('click', () => { anchor = addDays(anchor, viewMode); render(); });
  document.getElementById('today').addEventListener('click', () => { anchor = startOfToday(); render(); });

  document.getElementById('view-switch').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b) return;
    viewMode = parseInt(b.dataset.mode, 10);
    document.querySelectorAll('#view-switch button').forEach((x) => x.classList.toggle('is-active', x === b));
    render();
  });

  document.getElementById('cal-body').addEventListener('click', (e) => {
    const eventEl = e.target.closest('.event');
    if (eventEl) {
      const entry = entries.find((x) => x.id === eventEl.dataset.id);
      if (entry) openSheet(entry);
      return;
    }
    // тап по пустой сетке → новая запись на этот день/час
    const col = e.target.closest('.cal__col');
    if (!col) return;
    const days = getDays();
    const cols = Array.from(document.querySelectorAll('#cal-body .cal__col'));
    const colIndex = cols.indexOf(col);
    if (colIndex < 0 || colIndex >= days.length) return;
    const rect = col.getBoundingClientRect();
    const hour = Math.max(0, Math.min(23, Math.floor((e.clientY - rect.top) / PX_PER_HOUR)));
    openSheet(null, {
      date: toISO(days[colIndex]),
      time_start: pad(hour) + ':00',
      time_end: pad((hour + 1) % 24) + ':00',
    });
  });

  document.getElementById('fab').addEventListener('click', () => openSheet(null));
  document.getElementById('sheet-close').addEventListener('click', closeSheet);
  document.getElementById('sheet-cancel').addEventListener('click', closeSheet);
  document.getElementById('sheet-save').addEventListener('click', save);
  document.getElementById('sheet-delete').addEventListener('click', remove);
  document.getElementById('add-participant').addEventListener('click', () => {
    participantsItems.push({ name: '', phone: '', cost: '', client_id: '' });
    const el = document.getElementById('f-count');
    let n = parseInt(el.textContent, 10) || 1;
    if (n < 100) { n++; el.textContent = n; }
    renderParticipants();
    recalcCost();
  });

  // маска телефона
  LT.attachPhoneMask(document.getElementById('f-phone'));
  LT.attachPhoneMask(document.getElementById('s-phone'));

  // услуга: «Другое» → описание + цвет; известная → авто-финиш/цена
  document.getElementById('f-service').addEventListener('change', applyServiceSelection);
  document.getElementById('f-start').addEventListener('change', () => {
    if (document.getElementById('f-service').value !== '__other__') recomputeEnd();
  });

  // счётчик человек +/−
  document.getElementById('f-count-inc').addEventListener('click', () => {
    const el = document.getElementById('f-count');
    let n = parseInt(el.textContent, 10) || 1;
    if (n < 100) { n++; el.textContent = n; recalcCost(); }
  });
  document.getElementById('f-count-dec').addEventListener('click', () => {
    const el = document.getElementById('f-count');
    let n = parseInt(el.textContent, 10) || 1;
    if (n > 1) { n--; el.textContent = n; recalcCost(); }
  });

  // цвет «Другое»
  document.querySelectorAll('.swatch').forEach((sw) => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.swatch').forEach((x) => x.classList.remove('is-active'));
      sw.classList.add('is-active');
      entryColor = sw.dataset.color;
      document.getElementById('f-color-label').textContent = sw.dataset.label;
    });
  });

  // предоплата → комментарий обязателен
  document.getElementById('f-prepaid').addEventListener('change', applyPrepaidHint);

  document.getElementById('participants-list').addEventListener('input', (e) => {
    const el = e.target;
    const card = el.closest('.participant');
    if (!card) return;
    const i = parseInt(card.dataset.i, 10);
    if (el.dataset.f === 'phone') {
      const formatted = LT.formatPhone(el.value);
      if (formatted !== el.value) el.value = formatted;
      participantsItems[i].phone = formatted;
    } else {
      participantsItems[i][el.dataset.f] = el.value;
    }
  });
  document.getElementById('participants-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.participant__remove');
    if (!btn) return;
    participantsItems.splice(parseInt(btn.closest('.participant').dataset.i, 10), 1);
    const el = document.getElementById('f-count');
    let n = parseInt(el.textContent, 10) || 1;
    if (n > 1) { n--; el.textContent = n; }
    renderParticipants();
    recalcCost();
  });
  document.getElementById('sheet').addEventListener('click', (e) => { if (e.target === document.getElementById('sheet')) closeSheet(); });

  // ---------- события: канбан ----------
  document.getElementById('board').addEventListener('click', (e) => {
    const card = e.target.closest('.kcard');
    if (!card) return;
    const r = serviceRequests.find((x) => x.id === card.dataset.id);
    if (r) openServiceSheet(r);
  });

  document.getElementById('add-service-request').addEventListener('click', () => openServiceSheet(null));

  // drag-to-scroll мышью (Telegram Desktop / десктоп)
  const boardEl = document.getElementById('board');
  let drag = null;
  boardEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.kcard')) return; // не мешаем клику по карточке
    drag = { x: e.clientX, scrollLeft: boardEl.scrollLeft };
    boardEl.classList.add('is-dragging');
    try { boardEl.setPointerCapture(e.pointerId); } catch (_) {}
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    boardEl.scrollLeft = drag.scrollLeft - (e.clientX - drag.x);
  });
  const endDrag = () => { drag = null; boardEl.classList.remove('is-dragging'); };
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);
  document.getElementById('service-sheet-close').addEventListener('click', () => document.getElementById('service-sheet').classList.remove('is-visible'));
  document.getElementById('service-sheet-cancel').addEventListener('click', () => document.getElementById('service-sheet').classList.remove('is-visible'));
  document.getElementById('service-sheet-save').addEventListener('click', saveService);
  document.getElementById('service-sheet').addEventListener('click', (e) => { if (e.target === document.getElementById('service-sheet')) document.getElementById('service-sheet').classList.remove('is-visible'); });

  // ---------- события: настройки ----------
  document.querySelectorAll('.settings__tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.settings__tab').forEach((x) => x.classList.toggle('is-active', x === t));
      const sub = t.dataset.subtab;
      document.getElementById('view-services').style.display = sub === 'services' ? '' : 'none';
      document.getElementById('view-staff').style.display = sub === 'staff' ? '' : 'none';
      document.getElementById('view-notifications').style.display = sub === 'notifications' ? '' : 'none';
      if (sub === 'notifications') renderNotifications();
    });
  });

  document.getElementById('add-service').addEventListener('click', () => openServiceForm(null));
  document.getElementById('services-list').addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (edit) { const s = services.find((x) => x.id === edit.dataset.edit); if (s) openServiceForm(s); }
    else if (del) deleteService(del.dataset.del);
  });
  document.getElementById('service-form-close').addEventListener('click', () => document.getElementById('service-form-sheet').classList.remove('is-visible'));
  document.getElementById('service-form-cancel').addEventListener('click', () => document.getElementById('service-form-sheet').classList.remove('is-visible'));
  document.getElementById('service-form-save').addEventListener('click', saveServiceForm);
  document.getElementById('service-form-sheet').addEventListener('click', (e) => { if (e.target === document.getElementById('service-form-sheet')) document.getElementById('service-form-sheet').classList.remove('is-visible'); });

  document.getElementById('add-staff').addEventListener('click', addStaff);
  document.getElementById('staff-list').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del-staff]');
    if (del) removeStaff(parseInt(del.dataset.delStaff, 10));
  });

  document.getElementById('add-notif').addEventListener('click', addNotification);
  document.getElementById('notifications-list').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del-notif]');
    if (del) removeNotification(parseInt(del.dataset.delNotif, 10));
  });

  // ---------- tab bar ----------
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      const name = tab.dataset.tab;
      document.getElementById('tab-calendar').style.display = name === 'calendar' ? '' : 'none';
      document.getElementById('tab-clients').style.display = name === 'clients' ? '' : 'none';
      document.getElementById('tab-settings').style.display = name === 'settings' ? '' : 'none';
      document.getElementById('fab').style.display = name === 'calendar' ? '' : 'none';
      if (name === 'clients') { renderClients(); renderBoard(); }
      if (name === 'settings') { renderServices(); if (me && me.is_owner) renderStaff(); }
    });
  });

  // под-вкладки «Клиенты» / «Сервис (ремонт)»
  document.querySelectorAll('.sub-tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.sub-tab').forEach((x) => x.classList.toggle('is-active', x === t));
      const isClients = t.dataset.sub === 'clients';
      document.getElementById('view-clients').style.display = isClients ? '' : 'none';
      document.getElementById('view-service').style.display = isClients ? 'none' : '';
    });
  });

  // книга клиентов
  document.getElementById('client-search').addEventListener('input', renderClients);
  document.getElementById('add-client').addEventListener('click', () => openClientSheet(null));
  document.getElementById('clients-list').addEventListener('click', (e) => {
    const item = e.target.closest('.client-item');
    if (!item) return;
    const c = clients.find((x) => x.id === item.dataset.id);
    if (c) openClientSheet(c);
  });
  document.getElementById('client-sheet-close').addEventListener('click', () => document.getElementById('client-sheet').classList.remove('is-visible'));
  document.getElementById('client-sheet-cancel').addEventListener('click', () => document.getElementById('client-sheet').classList.remove('is-visible'));
  document.getElementById('client-sheet-save').addEventListener('click', saveClient);
  document.getElementById('client-sheet-delete').addEventListener('click', deleteClient);
  document.getElementById('client-sheet').addEventListener('click', (e) => { if (e.target === document.getElementById('client-sheet')) document.getElementById('client-sheet').classList.remove('is-visible'); });
  LT.attachPhoneMask(document.getElementById('cl-phone'));

  // попап «клиент заблокирован»
  document.getElementById('banned-close').addEventListener('click', () => document.getElementById('banned-popup').classList.remove('is-visible'));

  // попап Viber/WhatsApp
  document.getElementById('open-viber').addEventListener('click', () => {
    const p = document.getElementById('manual-notify-popup').dataset;
    LT.copyToClipboard(p.text || '');
    LT.openExternal(buildViberLink(p.phone || ''));
  });
  document.getElementById('open-whatsapp').addEventListener('click', () => {
    const p = document.getElementById('manual-notify-popup').dataset;
    LT.copyToClipboard(p.text || '');
    LT.openExternal(buildWhatsAppLink(p.phone || ''));
  });
  document.getElementById('manual-notify-close').addEventListener('click', () => document.getElementById('manual-notify-popup').classList.remove('is-visible'));

  // попап выбора клиентов
  document.getElementById('pick-clients').addEventListener('click', openClientPicker);
  document.getElementById('picker-close').addEventListener('click', closePicker);
  document.getElementById('picker-done').addEventListener('click', applyClientSelection);
  document.getElementById('picker-search').addEventListener('input', renderPickerList);
  document.getElementById('picker-list').addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-client-id]');
    if (!cb) return;
    if (cb.checked) pickerSelected.add(cb.dataset.clientId);
    else pickerSelected.delete(cb.dataset.clientId);
    updatePickerCount();
  });
  document.getElementById('client-picker').addEventListener('click', (e) => { if (e.target === document.getElementById('client-picker')) closePicker(); });

  boot();
})();

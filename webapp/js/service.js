// LizardTrail — форма «Заявка на сервис» (Экран 1.2).
(function () {
  LT.init();
  LT.attachPhoneMask(document.getElementById('phone'));

  const bikeInput = document.getElementById('bike');
  const problemInput = document.getElementById('problem');
  const dateInput = document.getElementById('desired-date');

  // Имя берём из Telegram-профиля (в форме по дизайну его нет).
  function telegramName() {
    const u = LT.tg && LT.tg.initDataUnsafe && LT.tg.initDataUnsafe.user;
    if (!u) return '';
    return [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
  }

  // Пресет описания заявки
  document.querySelectorAll('[data-issue]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.issue;
      const cur = problemInput.value.trim();
      problemInput.value = cur ? (cur.includes(tag) ? cur : cur + ' • ' + tag) : tag;
      problemInput.focus();
    });
  });

  // Дефолт даты — завтра
  function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  if (!dateInput.value) {
    const d = new Date(); d.setDate(d.getDate() + 1);
    dateInput.value = isoDate(d);
  }

  // --- Submit ---
  const form = document.getElementById('form');
  const submitBtn = document.getElementById('submit');
  const errorBox = document.getElementById('error');
  const overlay = document.getElementById('success-overlay');

  function showError(msg) { errorBox.textContent = msg; errorBox.classList.add('is-visible'); }
  function hideError() { errorBox.classList.remove('is-visible'); }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const bike = bikeInput.value.trim();
    const name = telegramName();
    const phoneInput = document.getElementById('phone');
    const phone = phoneInput.value.trim();

    if (!bike) { showError('Укажите марку и модель мотоцикла.'); return; }
    if (!LT.phoneValid(phoneInput)) { showError('Введите номер в формате +375 XX XXX XX XX.'); return; }

    const payload = {
      bike: bike,
      problem: problemInput.value.trim(),
      desired_date: dateInput.value,
      name: name || 'Клиент',
      phone: phone,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправка...';
    try {
      await LT.api('/api/booking/service', { method: 'POST', body: JSON.stringify(payload) });
      LT.haptic('notificationOccurred');
      overlay.classList.add('is-visible');
    } catch (err) {
      showError(err.message || 'Не удалось отправить заявку. Попробуйте ещё раз.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Отправить заявку';
    }
  });

  document.getElementById('close-overlay').addEventListener('click', () => {
    overlay.classList.remove('is-visible');
    LT.close();
  });

  LT.hideLoader();
})();

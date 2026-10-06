# LizardTrailFrontendBot

Фронтенд (Telegram Mini App) проекта LizardTrail — статика на GitHub Pages.

- Стартовый экран: `webapp/index.html`
- Админ-панель: `webapp/admin.html`
- Форма записи на маршрут: `webapp/booking/training.html`
- Форма сервиса: `webapp/booking/service.html`

## Деплой

Сайт публикуется на GitHub Pages автоматически из ветки `main` (workflow `.github/workflows/pages.yml`, публикует папку `webapp/`).

Итоговый адрес: `https://<user>.github.io/LizardTrailFrontendBot/`

## Бэкенд

API и бот живут в отдельном приватном репозитории `LizardTrailBackendBot`.

Адрес API задаётся в `webapp/js/config.js`:

```js
window.API_BASE = 'https://<ваш-бэкенд-домен>'; // без "/" в конце
```

После смены `API_BASE` — закоммитить, сайт пересоберётся автоматически.

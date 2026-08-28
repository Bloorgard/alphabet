# Backend холста Я

Worker использует стандартный `fetch` API и binding `DB` для Cloudflare D1.
Боевой binding уже описан в `wrangler.toml`.

## Развёртывание

- Worker: `alphabet-wall`.
- D1: `alphabet-wall`.
- Публичный маршрут: `https://alphabet.pustota.link/api/*`.
- Статику по-прежнему отдаёт Radxa: Worker перехватывает только `/api/*`.
- CORS разрешён только для `https://alphabet.pustota.link`.
- `IP_HASH_SALT` задан в Cloudflare как Worker secret и не хранится в репозитории.

## Локальная проверка

```sh
npm test
sqlite3 :memory: '.read schema.sql'
```

Схему применяют к выбранной D1-команде Wrangler, затем Worker запускают из
этой директории. `IP_HASH_SALT` хранится как secret в боевом окружении.

## API

- `GET /api/state`
- `POST /api/join` — `{ "name": "ПЕТЯ" }`
- `POST /api/event` — `{ "letter": "А" }`
- `POST /api/score` — `{ "letter": "З", "value": 12 }`
- `POST /api/name` — `{ "name": "МУХА" }`, смена имени участника
- `POST /api/mark` — `{ "x": 4, "y": 7 }`

Все POST после `/api/join` требуют `Authorization: Bearer <token>`.

# Greenleaf Clean v2

Greenleaf Telegram Mini App with SQLite persistence, Telegram authentication, product management, reviews, orders, owner dashboard, and Telegram order notifications.

## Main features

- Products and reviews stored in SQLite instead of JSON files.
- Telegram Mini App authentication with server-side `initData` validation.
- Admin-only product management and uploads.
- Checkout saves customer phone and delivery details.
- Orders are stored permanently in SQLite.
- Owner dashboard shows orders, filters, search, totals, delivery details, and status workflow.
- New orders are also sent to the owner through the Telegram bot.
- Secrets are supplied through environment variables; no bot token is included in the project.

## Environment

Required:

```text
BOT_TOKEN=your_bot_token
ADMIN_ID=your_numeric_telegram_user_id
```

Recommended persistent paths on Deployka:

```text
SQLITE_PATH=/data/greenleaf.db
UPLOAD_DIR=/data/uploads
```

`PORT` is supplied by the hosting platform.

## Run

```bash
pip install -r requirements.txt
gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 60
```

## Deployka / GitHub

Deployka can deploy this repository from GitHub, detect Python from `requirements.txt`, set ENV values, and provide an HTTPS URL. Keep `BOT_TOKEN` and other secrets out of GitHub.

## Admin

The owner is identified by `ADMIN_ID`. The frontend may show the admin section only to the owner, but every admin API endpoint independently checks validated Telegram `initData` on the server.

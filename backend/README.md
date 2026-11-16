# Fifty30 Backend

Spring Boot app (Maven, Java).

## Requirements

- **Java 25** (JDK 25 or newer). Check with `java -version`.
- No Maven install needed; use the bundled `./mvnw`.

## Environment variables

| Name | Required | Where to set it | Notes |
|------|----------|-----------------|-------|
| `DB_URL` | Required | `backend/.env` locally, Render dashboard in production | JDBC URL of the Supabase session pooler (ends with `?sslmode=require`). |
| `DB_USER` | Required | `backend/.env` locally, Render dashboard in production | The pooler username. |
| `DB_PASSWORD` | Required | `backend/.env` locally, Render dashboard in production | Database password. |
| `JWT_SECRET` | Required | `backend/.env` locally, Render dashboard in production | Random string of at least 32 bytes, different in each environment. |
| `COOKIE_SECURE` | Optional | `backend/.env` locally, Render dashboard in production | Defaults to `true`. Set to `false` only for local development over http. |
| `APP_BASE_URL` | Required in production | `backend/.env` locally, Render dashboard in production | Public address of the frontend, used in reset-password emails. Production: `https://fifty30-finance-tracker.vercel.app`. Defaults to `http://localhost:5173`. |
| `BREVO_API_KEY` | Optional | `backend/.env` locally, Render dashboard in production | Brevo API key for sending email. Without it (or without `MAIL_FROM_ADDRESS`) the app runs but sends no email. |
| `MAIL_FROM_ADDRESS` | Optional | `backend/.env` locally, Render dashboard in production | Sender address. Must be a sender verified in Brevo. |
| `SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE` | Optional | `backend/.env` locally, Render dashboard in production | Overrides the default pool size. |

Set these in `backend/.env` locally (never commit it) and in the Render dashboard in production. Never put real values in the repository.

## Export variables in a macOS terminal (zsh)

Replace the values with your own, in the same terminal window you run the app from:

```sh
export DB_URL='jdbc:postgresql://your-db-host:5432/your-db-name'
export DB_USER='your-db-user'
export DB_PASSWORD='your-db-password'
```

They only last for that terminal session. Use single quotes so special characters in the password are not interpreted.

## Run

```sh
cd backend
./mvnw spring-boot:run
```

## Running the tests

The integration tests run against a real PostgreSQL container via Testcontainers, so Docker must be running.

```sh
cd backend
./mvnw test
```

## Endpoints

- `GET /api/ping` returns `ok` (no database access).
- `GET /api/health` returns JSON with `status`, `db` and `time`. Returns HTTP 503 with `"db": "down"` if the database check fails.
- `GET /api/cycles/current` returns the pay cycle containing today, creating any missing cycles first.
- `PUT /api/cycles/current/salary` changes the salary of the current cycle (later cycles copy it).
- `PUT /api/settings/pay-day` schedules a pay day change. It waits one full cycle: the current and next cycle keep the old pay day.
- `GET /api/cycles/current/report` returns spending against the plan for the current cycle: needs, wants, savings, investments, a per-category breakdown and overspend flags.
- `GET /api/cycles/report?date=YYYY-MM-DD` returns the same report for the cycle containing that date.

## Rate limiting

Login and register are rate limited in memory with Bucket4j (`ratelimit` package). Every attempt counts.

| Limit | Default | Window | Property |
|-------|---------|--------|----------|
| Login per client IP | 20 | 15 minutes | `app.rate-limit.login-per-ip` |
| Login per email | 10 | 15 minutes | `app.rate-limit.login-per-email` |
| Register per client IP | 5 | 1 hour | `app.rate-limit.register-per-ip` |
| Register, whole site | 50 | 1 hour | `app.rate-limit.register-global` |

When a limit is reached the API returns `429 Too Many Requests` with a `Retry-After` header (seconds).

- The client IP is the first `X-Forwarded-For` entry, which Vercel sets. Requests sent straight to the Render URL can fake it, which is why the per-email and site-wide limits exist.
- Counts live in memory: they reset on restart and are only correct with a single backend instance.
- Someone who knows your email can block logins to it for up to 15 minutes. That is the cost of protecting each account against guessing from many IPs.

## Scheduled jobs

- Expired refresh tokens are deleted 5 minutes after start and then every 6 hours, once they have been expired for 7 days. Revoked tokens that have not expired are kept, because presenting one again is how token theft is detected. A fixed time of day is not used because the free Render instance sleeps when idle.
- Idle rate-limit buckets are dropped every 10 minutes.

## Keeping the free instance awake

Render's free instance sleeps after 15 minutes without traffic and takes about 140 seconds to start again.

- A cron-job.org job calls `https://finance-tracker-h0zi.onrender.com/api/health` every 10 minutes from 08:30 to 18:20 IST (cron `*/10 3-12 * * *` in UTC). `/api/health` also queries the database, which keeps the Supabase project from pausing after a week without activity.
- Outside that window the first visitor waits for a cold start; the frontend's waiting screen allows up to 180 seconds.
- Render gives 750 free instance hours per workspace per month, shared by every free service in it. ShelfSpace is in the same workspace with the same window, so the two use about 640 hours a month together. Never keep a free service awake around the clock here: above 750 hours Render suspends every free service until the next month.
- Each morning's first ping times out (cron-job.org waits 30 seconds) but still wakes the instance. cron-job.org disables a job only after more than 25 failures in a row.
- The Render health check stays on `/api/ping`, which does not touch the database.

## Password reset

- `POST /api/auth/forgot-password` `{email}` always answers `202` with no body, whether or not the account exists. If it does, a one-time link (`APP_BASE_URL/reset-password?token=...`) is emailed in the background, so the response time does not reveal registered emails either. Rate limited: 10 per IP and 3 per email per hour.
- `POST /api/auth/reset-password` `{token, password}` sets the new password (same rules as register), uses up the link and logs out every session. Invalid, used, replaced or expired links get `400`.
- Links expire after 30 minutes; asking again cancels older links. Only the SHA-256 hash of a token is stored (`password_reset_tokens`, migration V5).
- Email goes through Brevo's HTTPS API because Render's free plan blocks outbound SMTP ports.

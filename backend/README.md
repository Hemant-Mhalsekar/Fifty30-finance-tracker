# Finance Tracker Backend

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

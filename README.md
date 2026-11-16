# Fifty30

[![CI](https://github.com/Hemant-Mhalsekar/Fifty30-finance-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/Hemant-Mhalsekar/Fifty30-finance-tracker/actions/workflows/ci.yml)

Live: https://fifty30-finance-tracker.vercel.app

A personal finance tracker for salaried users in India, named after the 50/30/20 budgeting rule. You enter your monthly salary and pay day, each pay cycle is split 50/30/20 into needs, wants and savings, and you log expenses against that plan.

Built as a portfolio project with a Java Spring Boot backend, a React (Vite) frontend, and a PostgreSQL database hosted on Supabase.

- Backend: see [backend/README.md](backend/README.md) (setup, environment variables, endpoints).
- Frontend: see [frontend/README.md](frontend/README.md).

## Tests

Every pull request runs all tests in GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)):

- Backend: unit tests and integration tests against a real PostgreSQL 17 database in Docker (Testcontainers).
- Frontend: lint, type check and build, unit tests (Vitest), and browser tests (Playwright) against a mock API.

Deploys (Render for the backend, Vercel for the frontend) happen on every push to `main` and do not run tests, so only merge pull requests with a green check.

# Meezan Fund NAV Calculator

A full-stack web application that **calculates the Net Asset Value (NAV) of Pakistani Islamic mutual funds and ETFs in near real time**, stores a verified NAV every day at market close, and visualises the full history back to **2005**.

It was designed, researched and built end-to-end by me for my CEO, based on what he needed: a trustworthy live view of where a fund's NAV stands *during* the trading day, instead of waiting for the official figure to be published after close.

> **Stack:** React 19 · Vite · Tailwind · Recharts · Supabase (PostgreSQL) · Vercel serverless functions + cron

---

## Why this was built

Fund NAVs in Pakistan are published once a day, after the market closes. During the day there is no easy way to know how a fund is performing. The goal of this project was to answer:

> *"Based on today's live market prices, what is the NAV of this fund right now?"*

There was no ready-made solution, no spec and no data source handed to me. I owned the whole thing: **research → data sourcing → validation → architecture → implementation → deployment.**

## Funds covered

| Fund | Type |
|---|---|
| Al Meezan Mutual Fund | Mutual fund |
| Meezan Islamic Fund | Mutual fund |
| Meezan Energy Fund | Mutual fund |
| KSE Meezan Index Fund | Index fund |
| Meezan Pakistan ETF (MZNPETF) | ETF |

The project started with a **single fund** and was scaled up to **five** as the requirements grew. The data model, cron jobs and charts are all keyed by fund, so adding a fund is configuration rather than a rewrite.

## Impact

The system is in real use: my CEO uses the live and historical NAV views day to day, including as supporting data points for his talks and discussions on fund performance.

---

## What I did

### 1. Research
Nothing here was given to me; I worked out what the problem required:

- Studied how fund NAV is constructed from multiple independent resources and identified the calculation approach that reproduces the officially reported NAV.
- Identified **every input the calculation depends on**. Without any one of these, NAV cannot be calculated correctly:
  - **Portfolio holdings** – which companies the fund owns
  - **Portfolio weights / units held** per holding, and how they change over time
  - **Live and closing prices** of each holding on the Pakistan Stock Exchange (PSX)
  - **The previous day's NAV** (each day's NAV is built on the one before it)
  - **Official published fund prices** to validate my result against
  - **Market calendar** – holidays, weekends and closed-market days, which must not produce a new NAV
  - **Data-gap handling** – fallback logic when a holding has no price for a given day
- Evaluated multiple candidate data providers and APIs for coverage, reliability, update frequency and historical depth, and chose which to use for which job (see *Data sources*).

### 2. Historical backfill (2005 → today)
Because each day's NAV depends on the previous day's NAV, and because the charts needed full history, I couldn't just start calculating from "today". I had to:

- Research and locate sources that go back to **2005**.
- Populate historical prices and NAVs for every fund.
- **Validate** the backfilled data against official published figures and cross-check between sources to catch gaps, bad ticks and mismatches.
- Design the storage so the NAV is **persisted at end of day**, so the next day's calculation and any past-date lookup read a verified value instead of recomputing the past.

### 3. Engineering
- Designed the database schema in Supabase (companies, current prices, daily closes, price history, NAV history, fund metadata).
- Built serverless API endpoints and scheduled jobs on Vercel for intraday price refresh, end-of-day close capture, NAV calculation and company/holding sync.
- Built the React front end: a public dashboard, a per-fund NAV chart with historical ranges, a calculator, stock detail pages, and a password-protected admin panel for managing companies and initialising a fund.
- Protected the scheduled endpoints with a shared-secret bearer token.

---

## How it works

```
 PSX / Sarmaaya APIs ──► Vercel cron jobs ──► Supabase (PostgreSQL)
 Al Meezan fund prices ─►  /api/*  (serverless)        │
                                                       ▼
                                          React + Vite front end
                                   (live NAV, history charts, admin)
```

1. **Sync companies** – pulls each fund's current holdings and weights.
2. **Intraday** – fetches live prices for the holdings and recalculates the NAV through the day.
3. **End of day** – captures the official closing prices, finalises and **stores the day's NAV**, detects market-closed days, and keeps that NAV as the base for the next day.
4. **Front end** – reads from the database and renders live NAV, history and per-stock detail.

> The exact NAV formulas are intentionally not documented here.

## Data sources

| Source | Used for |
|---|---|
| Pakistan Stock Exchange data portal (`dps.psx.com.pk`) | Live intraday prices |
| Sarmaaya API | Fund holdings, stock price history, historical NAV |
| Al Meezan Investments website | Official published fund prices (validation / end-of-day) |

## Project structure

```
api/        Vercel serverless endpoints (initialize, sync-companies,
            auto-calculate, insert-daily-closes, nav-history, stocks/*)
src/
  components/   Calculator, StockDetail, Admin/*, Common/* (charts, grids)
  services/     Supabase client, NAV and PSX service wrappers
  contexts/     Auth context
  utils/        Date and helper utilities
server.js   Small local Express proxy for NAV chart data
```

## Getting started

```bash
npm install
cp .env.example .env     # then fill in your own values
npm run dev
```

Required environment variables (see [.env.example](.env.example)):

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `CRON_SECRET` | Bearer token required by the `/api/*` cron endpoints |

You will need to create the Supabase tables yourself; no credentials or data are included in this repository.

## Deployment

Deployed on Vercel. The `/api` folder runs as serverless functions, and the scheduled jobs call them with `Authorization: Bearer $CRON_SECRET`.

## Author

Built by **Lina Fatima** — [@LinaFatima](https://github.com/LinaFatima)

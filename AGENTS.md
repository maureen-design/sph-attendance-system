# AGENTS.md

This file provides guidance to Qoder (qoder.com) when working with code in this repository.

## Project Overview

SPH Attendance System — a multi-tenant attendance tracking platform for Swahilipot Hub, Mombasa. Monorepo with separate `client/` (Next.js) and `server/` (Express) workspaces, orchestrated via root `npm run` scripts using `concurrently`.

## Commands

| Command              | Description                                               |
| -------------------- | --------------------------------------------------------- |
| `npm run dev`        | Runs client (port 3000) + server (port 4000) concurrently |
| `npm run dev:client` | Client only                                               |
| `npm run dev:server` | Server only                                               |
| `npm run build`      | Build both (client first, then server)                    |
| `npm run lint`       | Lint both (client first, then server)                     |
| `npm run format`     | Prettier format all files                                 |

**Client-specific** (run from `client/`):

- `npm run lint` / `npm run lint:fix` — ESLint with Prettier plugin
- `predev` script auto-clears `node_modules/.cache` before every dev start

**Server-specific** (run from `server/`):

- `npm run lint` / `npm run lint:fix` — ESLint with Prettier plugin
- `npm run prisma:migrate` — Run Prisma migrations
- `npm run prisma:generate` — Regenerate Prisma client
- `npm run prisma:studio` — Open Prisma Studio

## Architecture

### Monorepo Structure

```
sph-attendance-system/
├── client/          → Next.js 14 App Router (TypeScript, Tailwind, shadcn/ui)
├── server/          → Express + Prisma (TypeScript)
├── docker-compose.yml
└── package.json     → Root orchestration scripts
```

### Client (Next.js 14 App Router)

- **Design system**: "Vibrant Minimalist" — dark mode default, Linear/Stripe/Vercel aesthetic
- **Font**: Plus Jakarta Sans (via `next/font/google`, variable `--font-sans`)
- **Color tokens**: `sph-green` (#10B981), `sph-blue` (#2563EB), `sph-red` (#EF4444), `sph-amber` (#F59E0B), `sph-dark` (#0F172A)
- **UI components**: shadcn/ui (style: base-nova) in `@/components/ui/`
- **Toast/notifications**: Uses `sonner` (not `toast` — shadcn renamed it)
- **API client**: `@/lib/api` — typed fetch wrapper with automatic JWT token refresh on 401
- **Auth**: `@/context/AuthContext` — React Context with `login()`, `logout()`, `user`, `isAuthenticated`
- **Route guards**: `@/components/guards/AuthGuard` — checks auth + setup status
- **CSS variables**: Two-tier system — SPH custom vars (`--surface`, `--surface-elevated`, `--text-primary`, etc.) coexist with shadcn vars (`--background`, `--foreground`, `--primary`, etc.) in `@layer base`
- **Tailwind config**: `darkMode: 'class'`, custom animations: `fade-in`, `slide-up`, `pulse-glow`, `gradient-shift`

### Server (Express + Prisma)

- **Entry**: `src/server.ts` → `src/app.ts` (Express app setup with helmet, CORS, 10kb body limit)
- **Database**: PostgreSQL via Prisma ORM, schema at `prisma/schema.prisma`
- **Auth**: JWT with access + refresh tokens, bcrypt password hashing
- **Routes/Controllers**: 1:1 mapping in `src/routes/` and `src/controllers/`
- **Middleware**: `src/middleware/index.ts` — auth guards, role checks
- **Jobs**: `src/jobs/index.ts` — cron tasks (auto close checkouts, absence marking) using `date-fns-tz` for timezone-correct operations
- **Response format**: `{ success: boolean, data?: T, error?: string }` via `src/utils/response.ts`
- **Multi-tenancy**: All data scoped to `organizationId`; org identified by `shortName`

### Key Domain Concepts

- **Organization** → has Departments, Cohorts, Users, Holidays
- **Department** → has shift times (shiftStart/shiftEnd as "HH:MM" strings), optional supervisor
- **Cohort** → time-bounded group (startDate/endDate) with invite links
- **AttendanceLog** → per-user-per-day record with checkIn/checkOut times, status enum (EARLY, ON_TIME, LATE, UNRESOLVED, LEFT_EARLY, etc.)
- **WorkLog** → daily summary/progress/blockers per user
- **Dispute** → user can dispute attendance status, resolved by supervisors/admins
- **InviteLink** → token-based registration with expiry and max uses
- **Roles**: SUPER_ADMIN, DEPARTMENT_SUPERVISOR, STAFF, MEMBER, ATTACHEE

### Setup Flow

First deployment → one-time setup wizard at `/setup` → creates org + super admin + departments. Backend endpoint `GET /setup/status` returns `{ setupRequired: boolean }`.

## Code Style

- **Prettier config** (`.prettierrc`): single quotes, semicolons, trailing commas, 100 char print width
- **TypeScript**: strict mode, no `any` types allowed
- **Formatting**: shadcn/ui generates code with double quotes + no semicolons — always run `lint:fix` after adding new components to reformat to project style
- **Mobile-first**: all layouts designed for 390px minimum width

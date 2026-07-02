# SPH Attendance System — Project Brief v1.1

**Organization:** Swahilipot Hub (SPH)
**Type:** NGO
**Date Started:** June 12, 2026
**Last Updated:** June 17, 2026
**Status:** Foundation Sprint Complete — Auth Sprint Next

---

## 1. The Problem We Are Solving

SPH currently has:

- Multiple separate links for check-in and check-out — fragmented and tiresome for users
- A QR code at the door that links to a Google Form requiring credentials to be typed every single day
- No unified place for supervisors or admins to filter and view attendance across departments
- Supervisors taking photos of early arrivals as proof because the current system has no timestamp credibility
- Poor internal communication — announcements sent via WhatsApp get missed, ignored, or buried
- A separate activity/progress log link (used actively by Tech department) that is disconnected from attendance
- No cohort management for attachees
- No structured absence or excuse management workflow

---

## 2. What We Are Building

A unified, full-stack attendance and people management platform built specifically for SPH but designed to scale to universities and other institutions.

**Philosophy:** Accountability with dignity — not surveillance. The system empowers people to manage themselves rather than policing them. Every feature asks: does this empower the user or just monitor them?

**Design Standard:** Premium SaaS feel — think Linear, Stripe, Vercel. Not corporate HR software, not a school project. Something people actually want to open.

---

## 3. User Types & Roles

| Role                       | Description                                                         |
| -------------------------- | ------------------------------------------------------------------- |
| Attachee                   | Cohort-based, department-assigned, limited to own record + work log |
| Member                     | Long-term participant, not cohort-bound, no work log requirement    |
| Staff                      | Permanent team, department-assigned, no work log requirement        |
| Department Supervisor      | Manages their department's people and data only                     |
| Super Admin / Overall Lead | Full visibility and control across all departments                  |

**Dropped:** Visitor — belongs in a separate reception tool, not the attendance system.

**Role hierarchy:** Super Admin → Department Supervisor → Attachee / Member / Staff
Each level sees downward only, never sideways or upward.

---

## 4. Departments at SPH

| Department       | Default Shift Window | Focus Area                      |
| ---------------- | -------------------- | ------------------------------- |
| Tech             | 08:00 AM — 05:00 PM  | Software, Networks, Hardware    |
| Communication    | 08:30 AM — 05:00 PM  | Social Media, PR, Journalism    |
| Creatives        | 09:00 AM — 05:00 PM  | Art, Design, Music, Theatre     |
| Youth Engagement | 08:30 AM — 04:30 PM  | Community Outreach, Events      |
| Administration   | 08:00 AM — 05:00 PM  | Finance, Operations, Management |

All shift times are configurable by Super Admin. Additional departments can be added during setup.
Each department has its own supervisor. The Overall Lead / Super Admin sees all departments.

---

## 5. Cohort System (Attachees)

Attachees are cohort-based — they join in groups with a defined start and end date.

**Cohort structure:**

- Cohort name (e.g., SPH 002 2026)
- Start date and end date
- Departments involved
- Attachees belong to a cohort and a department
- When a cohort ends, records are archived but never deleted
- Supervisors can filter by cohort
- Reporting is cohort-aware — compare cohort performance over time

**Onboarding via cohort:**

- Admin creates cohort in system
- System generates a unique invite link tied to that cohort
- Admin shares link in the cohort WhatsApp group — one message, one time
- Attachees click link, self-register with: name, email, phone, department, password
- Department is pre-filled or restricted based on which link they used
- Account created, pending email verification
- After verification — active, logged in, in correct cohort and department automatically

**Invite link rules:**

- Expires after cohort start date passes
- Single-use per person — duplicate attempts flagged and logged
- Revocable by admin if shared outside intended group
- Optional restriction: allowlist by email domain or preloaded invite list

**Bulk upload option:**

- Admin can upload CSV of names and emails
- System creates accounts and sends each person a setup link

---

## 6. Onboarding — WhatsApp's Role

WhatsApp is used exactly once per cohort — to share the registration invite link. After that, all communication moves into the platform. WhatsApp is the bridge, not the destination.

---

## 7. Check-In System

**The solution:** Single unified platform — one login, one check-in action.

### Check-In Flow

1. Attachee/staff registers and logs in once on day one
2. Session persists securely on their device
3. When they arrive, they open the app — already logged in
4. They tap Check In and scan the door QR code
5. System confirms: identity from session + location from QR + time from server
6. One tap. Done. No typing.

### QR Code Design

- The door QR is a location anchor, not a form link
- QR codes rotate every 15 minutes — prevents screenshot fraud
- App caches the current valid QR token when it last had internet connection
- At the door with weak signal — cached token is used, check-in queues locally
- Syncs automatically when connection returns
- Sync status indicator: green = synced, amber = pending, red = offline

### Time Status Logic (Per Department, Configurable by Admin)

```
Early:      Before 15 mins ahead of start time
On-Time:    Within the start window
Grace:      Up to 15 minutes after start (still On-Time, no penalty)
Late:       After grace period up to cutoff
Unresolved: After cutoff with no check-in or excuse
```

**Default cutoff times (configurable):**

| User Type      | Default Cutoff |
| -------------- | -------------- |
| Attachee       | 10:00 AM       |
| Member         | 9:30 AM        |
| Staff          | 9:00 AM        |
| Administration | 9:00 AM        |

### Cutoff & Absence Flow

1. Before cutoff — reminder notification sent
2. At cutoff, no check-in, no excuse — status: Unresolved, supervisor notified
3. Grace window (1-2 hours) — person can still submit excuse or absence request
4. After grace window, still nothing — auto-marked Absent — Unexcused
5. Late excuse submitted — Absent — Excuse Pending until supervisor acts
6. Supervisor approves → Excused Absence | Supervisor rejects → Unexcused

---

## 8. Check-Out System — Self-Healing Workflow

### Normal Flow

- Same app, same door QR — system knows it's a check-out because user is already checked in
- Hero component switches to Check Out button automatically after check-in
- Left Early calculated automatically if check-out time is before department end time

### Forgotten Check-Out

1. 30 minutes before shift end — notification: "Don't forget to check out"
2. At shift end, no check-out — record flagged, supervisor notified
3. Next morning, user logs in — prompt appears before today's check-in
4. Time picker bounded — cannot select time after shift end or before check-in time
5. Record updated as "Check-Out — User Reported" — flagged for supervisor awareness
6. If ignored — system auto-closes at shift end time: "Check-Out — Auto Closed"

### Check-Out Status Types

| Status                    | Meaning                                          |
| ------------------------- | ------------------------------------------------ |
| Check-Out — Scanned       | QR scanned at door — most reliable               |
| Check-Out — User Reported | Time submitted next morning — plausible, flagged |
| Check-Out — Auto Closed   | System closed it — actual departure unknown      |

---

## 9. Attendance Statuses

| Status                  | Meaning                                              |
| ----------------------- | ---------------------------------------------------- |
| Early                   | Checked in before the early threshold                |
| On-Time                 | Checked in within the on-time window including grace |
| Late                    | Checked in after grace but before cutoff             |
| Unresolved              | Past cutoff, no check-in, no excuse yet              |
| Absent — Excuse Pending | Excuse submitted, awaiting supervisor decision       |
| Excused Absence         | Approved excuse                                      |
| Absent — Unexcused      | No check-in, no excuse, grace window passed          |
| Left Early              | Checked out before department end time               |
| Disputed                | User has flagged the record for review               |

Status is calculated automatically by the server. Never entered manually.

---

## 10. Database Architecture

**Database:** PostgreSQL
**ORM:** Prisma
**Approach:** Node.js backend sits between client and database. Client never touches database directly.
**Multi-tenancy:** Every query scoped to organizationId from user's token.

### Key Tables

- `organizations` — multi-tenant root, timezone, logo
- `users` — credentials, profile, role, org, dept, cohort
- `departments` — name, supervisor, shift times
- `schedules` — per user-type cutoff times per department
- `cohorts` — name, start/end date, invite links
- `invite_links` — token, expiry, revoke, single-use enforcement
- `refresh_tokens` — session management, device limits
- `attendance_logs` — master attendance table
- `work_logs` — daily activity entries per attachee
- `leaves` — requests, approvals, types
- `announcements` — title, body, target, read receipts
- `announcement_reads` — read receipts + acknowledgements
- `disputes` — user flags, supervisor resolution
- `notifications` — in-app notification store
- `holidays` — org-level public holidays
- `audit_logs` — permanent, read-only record of every action

---

## 11. Security & Access Control

### Two Enforcement Layers

1. Frontend — UI only renders what the role permits
2. Backend — every API request verified before data is returned

### Multi-Tenant Isolation

Every query scoped to organization ID from user's token. Architectural, not optional.

### Audit Trail

- Every data-changing action logged permanently
- Logs: who, what, before/after, when, device/IP
- Read-only — nobody can edit or delete, including Super Admin
- Manual overrides require written reason, notify affected user

### High-Risk Operations

- Manual record override — supervisor/admin only, reason required, user notified
- Account deactivation — super admin only, immediate, logged
- Bulk data export — super admin only, logged
- Cohort closure — super admin only, irreversible, confirmation required

---

## 12. Security & Session Policy

- Session duration: 30 days max on personal devices; 24 hours on shared/public devices
- Idle timeout: auto-lock after 15 minutes inactivity on web
- Remember device: optional, user-controlled
- Concurrent sessions: allowed on up to 2 active devices per user; oldest session revoked when limit exceeded
- Logout controls: user can log out current device or all devices from profile
- Server authority: server time and server session state are the source of truth for all attendance actions

---

## 13. Password Recovery & Account Access

| Situation                     | Path                                                     |
| ----------------------------- | -------------------------------------------------------- |
| Forgot password, has email    | Email reset link (expires 30 minutes, single-use)        |
| Forgot password, no email     | SMS code to phone — Phase 2                              |
| Lost both                     | Supervisor verifies in person → Super Admin manual reset |
| Supervisor resets team member | Not allowed — protects against misuse                    |
| Super Admin resets anyone     | Yes, with mandatory reason and audit log entry           |

---

## 14. Attendance Overrides Policy

- Attendance status is auto-calculated by default — never entered manually
- Manual override allowed only for Department Supervisor or Super Admin
- Override requires: override reason (required text), overridden_by, previous + new value in audit log, automatic user notification
- Override does not delete original event history — it appends correction metadata

---

## 15. Leave / Absence Workflow

**Leave types (Phase 1):** Sick, Emergency, Official Duty, Other

**Submission:** User submits with date(s), reason, optional attachment.

**Approval:** Department Supervisor approves or rejects with decision note recorded.

**Escalation:** If no decision within SLA, request remains pending and escalates to Super Admin view.

**Balances:** Accrual rules deferred — system supports optional balance fields.

---

## 16. Dispute Feature

1. User flags a specific record, adds explanation
2. Status becomes Disputed
3. Supervisor notified and reviews within 48-hour SLA
4. Supervisor resolves with decision and reason
5. User sees outcome — transparent, documented
6. If unresolved after SLA — escalates to Super Admin queue

---

## 17. Work Log (Daily Progress Journal)

**Applies to:** Attachees only — Members and Staff are exempt

### Required Fields

- Date
- Summary of work
- Progress made
- Blockers / challenges
- Optional flag: needs help

### Timing

- Reminder fires 30 minutes before department end time
- Second nudge appears at check-out if not yet submitted
- If ignored — day shows as "Work Log Missing" — visible to supervisor, not punitive

### Supervisor Actions

- Filter logs by date, cohort, person
- Add feedback note per entry

---

## 18. Announcements & Communication

- Posted inside the platform — never WhatsApp
- Tracked: who has seen it and when
- Push notification for urgent announcements
- Pinned until admin unpins
- Categories: Standard (blue), Department-specific (amber), Critical (red)
- Acknowledgement option for critical notices
- "I didn't see it" is now verifiable

---

## 19. Supervisor Dashboard

### Immediate Visibility

- How many people are checked in right now
- How many are late today
- Who hasn't checked in yet (by name)
- Any unresolved or unexcused absences
- Any disputed records pending review

### Filters

- Date Range: Today, This Week, Custom Range
- Department / Team
- Status: Late, On-Time, Absent, Left Early, Unresolved
- Cohort filter
- Employee Name search

### Reporting & Export (Phase 1)

- CSV export scoped to role — supervisors see their dept only, admins see all
- Minimum fields: name, department, cohort, check-in/out times, status, check-out method, override flag

---

## 20. User Personal Dashboard

### Three Questions Answered on Login

1. What is my status today?
2. How am I doing overall?
3. Is there anything I need to act on?

### Sections

- Today's Card: check-in time, status, check-out time
- Portfolio Metrics: punctuality streak, attendance score ring, engagement rate
- History View: calendar month view color-coded + list view

---

## 21. Notifications System

### Three Delivery Layers

1. In-App — always works, no permissions needed
2. Push Notification — if browser permission granted
3. Email — fallback for critical notifications if push missed

### Provider Policy (Phase 1)

- Email: Resend (recommended)
- Push: Web Push via PWA
- SMS: deferred to Phase 2 (Africa's Talking or Twilio)
- Provider failures must trigger retry + fallback + admin alert

---

## 22. Timezone & Clock Policy

- Store all timestamps in UTC
- Display time in organization timezone (default: Africa/Nairobi)
- Attendance status and cutoff logic run on server using org/department timezone rules
- Client/device clock is never trusted for status determination

---

## 23. Reliability, Backup & Incident Policy

- Daily automated DB backups with retention policy
- Point-in-time recovery enabled where supported
- If backend unavailable: client queues offline check-ins locally, sync retries with exponential backoff, user sees pending/synced/error states
- If QR rotation job fails: last valid token grace handling applies for bounded window, incident alert raised to admins
- Observability: structured logs + error tracking + background job monitoring

---

## 24. Privacy & Data Retention

| Period                     | What Happens                                               |
| -------------------------- | ---------------------------------------------------------- |
| During cohort              | Full access, active account                                |
| 0–90 days after cohort end | Account active — can log in, view record, export portfolio |
| 90 days after cohort end   | Account archived — cannot log in, data retained            |
| 1 year after cohort end    | Personal details anonymized, aggregate data retained       |

Super Admin can extend retention or trigger early anonymization.

---

## 25. Design System — "Vibrant Minimalist"

**Reference:** Linear, Stripe, Vercel — premium SaaS, not corporate HR software.

### Color Tokens

| Token     | Value   | Usage                  |
| --------- | ------- | ---------------------- |
| sph-green | #10B981 | Early / On-Time        |
| sph-blue  | #2563EB | Standard alerts / info |
| sph-red   | #EF4444 | Critical alerts        |
| sph-dark  | #0F172A | Dark mode background   |
| sph-light | #F8F9FA | Light mode background  |

### Typography

- Inter, Plus Jakarta Sans, or Geist
- Maximum two fonts, large confident headings, strong hierarchy

### Dark Mode

Non-negotiable. Developers, creatives, varied working hours.

### Dashboard Layout (Post-Login)

- Section A — Greeting: "Habari, [Name]" — Department | Cohort — sync indicator
- Section B — Hero Check-In: dynamic state button
- Section C — Portfolio Metrics: streak, attendance score ring, announcement badge
- Section D — Announcements Feed

---

## 26. Tech Stack

| Layer           | Choice                                             |
| --------------- | -------------------------------------------------- |
| Frontend        | Next.js 14 + Tailwind CSS + TypeScript             |
| Backend         | Node.js + Express + TypeScript                     |
| Database        | PostgreSQL                                         |
| ORM             | Prisma                                             |
| Auth            | JWT + bcrypt (access token 15m, refresh token 30d) |
| Real-time       | Socket.io                                          |
| Background Jobs | Node cron                                          |
| Email           | Resend                                             |
| SMS (Phase 2)   | Africa's Talking or Twilio                         |
| File Export     | CSV (Phase 1), PDF (Phase 2)                       |
| Deployment      | Vercel (frontend) + Railway (backend + DB)         |
| PWA             | Configured in Next.js from day one                 |

---

## 27. Non-Functional Targets (Phase 1 Baseline)

- API p95 latency: < 500ms for core attendance endpoints under normal load
- Offline sync: queued attendance sync within < 60s after reconnect
- Availability: 99.5% monthly for production services
- Critical notification delivery attempt starts within 1 minute of trigger
- Dashboard load: < 2s on average mobile network

---

## 28. Testing Strategy

- **Unit tests:** attendance status engine, cutoff logic, token validation
- **Integration tests:** auth, RBAC, tenant scoping, override flow, leave flow
- **E2E tests:** check-in/out happy path, offline queue sync, supervisor review flows
- **Security tests:** QR replay prevention, cross-tenant access denial, role boundary checks
- **CI gate:** merge blocked if lint / typecheck / tests fail

---

## 29. GitHub Repository

**Account:** maureen-design
**Repo:** sph-attendance-system
**URL:** github.com/maureen-design/sph-attendance-system

### Branch Strategy

```
main      → production only, no direct pushes
develop   → working branch, all features merge here first
feature/* → one branch per feature
fix/*     → one branch per bug fix
```

### Commit Convention

```
feat: add QR rotation logic
fix: correct late status calculation
docs: update project brief
style: adjust dashboard spacing
refactor: extract status calculator
chore: update dependencies
```

---

## 30. Deployment

| Part         | Platform                     |
| ------------ | ---------------------------- |
| Frontend     | Vercel                       |
| Backend + DB | Railway                      |
| Domain       | attendance.swahilipothub.org |

### Environments

- Local → Staging → Production
- CI/CD via GitHub Actions — auto-deploys on merge to main
- Tests must pass before any deployment proceeds

---

## 31. Build Order

### Phase 1 — Core (Building Now)

1. ✅ Project scaffold — Next.js + Tailwind + PostgreSQL + Node backend + PWA config
2. ✅ Full domain schema — 20 models, 7 enums
3. ✅ Foundation sprint — env config, Prisma singleton, middleware, JWT utils, hash utils, response utils
4. 🔄 Authentication — register via invite link, login, refresh token, logout, password recovery
5. Admin setup flow — organization, departments, schedules, cohorts
6. Check-in system — rotating QR, scanning, offline cache + sync, time status calculation
7. Attendance dashboard — personal view, supervisor view, admin view
8. Check-out system — self-healing workflow
9. Announcements — post, target, read receipts, notifications
10. Work logs — daily progress journal, reminders

### Phase 2 — Enhancement (After Core Is Live)

11. Portfolio PDF export
12. Behavioral insights — pattern detection, anomaly alerts
13. Bulk CSV user import
14. Department-specific work log questions
15. SMS fallback notifications
16. Advanced reports and cohort comparisons

---

## 32. What Was Deliberately Dropped or Deferred

| Item                 | Decision | Reason                                 |
| -------------------- | -------- | -------------------------------------- |
| Visitor user type    | Dropped  | Separate reception tool                |
| Mood emoji check-in  | Dropped  | Undermines professional feel           |
| Predictive absence   | Dropped  | Too speculative for v1                 |
| Biometric hardware   | Deferred | Infrastructure dependency              |
| Geofence             | Phase 2  | QR cache solves it cleanly for Phase 1 |
| SMS notifications    | Phase 2  | Email sufficient for Phase 1           |
| PDF portfolio export | Phase 2  | CSV sufficient for Phase 1             |

---

## 33. Design Philosophy

> "The system treats everyone fairly, surfaces meaning from data, and doesn't feel like surveillance."

- Human and considered — not generic, not AI-template feel
- Bold where it counts — premium interactions, unconventional dashboard
- Accountability as a habit, not punishment
- Progressive disclosure — each user only sees their relevant space
- Every feature asks: does this empower the user or just monitor them?
- Cross-device from day one — mobile-first PWA, responsive breakpoints, touch-friendly targets

---

_Planning completed June 12–13, 2026. Foundation Sprint completed June 17, 2026. Auth Sprint next._

> Placeholder. Full brief to be added.

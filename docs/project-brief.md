# SPH Attendance System — Project Brief
**Organization:** Swahilipot Hub (SPH)  
**Type:** NGO  
**Date Started:** June 12, 2026  
**Last Updated:** June 13, 2026  
**Status:** Pre-development — Vision & Planning Complete

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

| Role | Description |
|---|---|
| Attachee | Cohort-based, department-assigned, limited to own record + work log |
| Member | Long-term participant, not cohort-bound, no work log requirement |
| Staff | Permanent team, department-assigned, no work log requirement |
| Department Supervisor | Manages their department's people and data only |
| Super Admin / Overall Lead | Full visibility and control across all departments |

**Dropped:** Visitor — belongs in a separate reception tool, not the attendance system.

**Role hierarchy:** Super Admin → Department Supervisor → Attachee / Member / Staff
Each level sees downward only, never sideways or upward.

---

## 4. Departments at SPH

| Department | Default Shift Window | Focus Area |
|---|---|---|
| Tech | 08:00 AM — 05:00 PM | Software, Networks, Hardware |
| Communication | 08:30 AM — 05:00 PM | Social Media, PR, Journalism |
| Creatives | 09:00 AM — 05:00 PM | Art, Design, Music, Theatre |
| Youth Engagement | 08:30 AM — 04:30 PM | Community Outreach, Events |
| Administration | 08:00 AM — 05:00 PM | Finance, Operations, Management |

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
- Admin shares link in the cohort WhatsApp group (e.g., "SPH 002 2026") — one message, one time
- Attachees click link, self-register with 4 fields — name, email, phone, department, password
- Department is pre-filled or restricted based on which link they used
- Account created, pending email/SMS verification
- After verification — active, logged in, in correct cohort and department automatically
- Supervisor sees department populate as people register

**Department-specific invite links:**
- Super Admin can generate per-department links
- Link pre-fills both cohort AND department
- Prevents wrong-department registration

**Invite link rules:**
- Expires after cohort start date passes
- Single-use per person — duplicate attempts flagged
- Revocable by admin if shared outside intended group

**Bulk upload option:**
- Admin can upload CSV of names and emails
- System creates accounts and sends each person a setup link
- Available as override when self-registration isn't sufficient

---

## 6. Onboarding — WhatsApp's Role

WhatsApp is used exactly once per cohort — to share the registration invite link. After that, all communication moves into the platform. WhatsApp is the bridge, not the destination.

---

## 7. Check-In System

**The solution:** Single unified platform — one login, one check-in action.

### Check-In Flow
1. Attachee/staff registers and logs in once on day one
2. Session persists securely on their device (secure cookies / local tokens)
3. When they arrive, they open the app — already logged in
4. They tap Check In and scan the door QR code
5. System confirms: identity from session + location from QR + time from server
6. One tap. Done. No typing.

### QR Code Design
- The door QR is a location anchor, not a form link
- QR codes rotate every 15 minutes — prevents screenshot fraud
- 15-minute window is short enough to prevent abuse, long enough to handle weak signal
- App caches the current valid QR token when it last had internet connection
- At the door with weak signal — cached token is used, check-in queues locally
- Syncs automatically when connection returns
- Sync status indicator on dashboard: green = synced, amber = pending, red = offline

### Time Status Logic (Per Department, Configurable by Admin)
All thresholds are relative to each department's configured start time:

```
Early:      Before 15 mins ahead of start time
On-Time:    Within the start window
Grace:      Up to 15 minutes after start (still On-Time, no penalty)
Late:       After grace period up to cutoff
Unresolved: After cutoff with no check-in or excuse
```

**Default cutoff times (configurable):**
| User Type | Default Cutoff |
|---|---|
| Attachee | 10:00 AM |
| Member | 9:30 AM (placeholder — SPH to confirm) |
| Staff | 9:00 AM (placeholder — SPH to confirm) |
| Administration | 9:00 AM (placeholder — SPH to confirm) |

### Cutoff & Absence Flow
1. Before cutoff — reminder notification: "Check-in closes at [time]"
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

### Forgotten Check-Out — Self-Healing Workflow
1. **30 minutes before shift end** — notification: "Don't forget to check out before you leave"
2. **At shift end, no check-out** — record flagged "Check-Out Missing", supervisor notified
3. **Next morning, user logs in** — prompt appears before today's check-in:
   - "You didn't check out yesterday. What time did you leave?"
   - Time picker bounded — cannot select time after shift end or before check-in time
   - Record updated as "Check-Out — User Reported" — flagged for supervisor awareness
4. **If user ignores prompt** — system auto-closes at shift end time, status: "Check-Out — Auto Closed"

### Check-Out Status Types
| Status | Meaning |
|---|---|
| Check-Out — Scanned | QR scanned at door — most reliable |
| Check-Out — User Reported | Time submitted next morning — plausible, flagged |
| Check-Out — Auto Closed | System closed it — actual departure unknown |

---

## 9. Attendance Statuses

| Status | Meaning |
|---|---|
| Early | Checked in before the early threshold |
| On-Time | Checked in within the on-time window including grace |
| Late | Checked in after grace but before cutoff |
| Unresolved | Past cutoff, no check-in, no excuse yet |
| Absent — Excuse Pending | Excuse submitted, awaiting supervisor decision |
| Excused Absence | Approved excuse |
| Absent — Unexcused | No check-in, no excuse, grace window passed |
| Left Early | Checked out before department end time |

Status is calculated automatically by the server. Never entered manually.

---

## 10. Database Architecture

**Database:** PostgreSQL
**Approach:** Node.js backend sits between client and database. Client never touches database directly.

### Master Attendance Log Table
```
attendance_logs
├── id
├── user_id              → links to the employee/attachee
├── organization_id      → multi-tenant isolation
├── department_id        → enables department filter
├── check_in_time        → server-side timestamp
├── check_out_time
├── check_out_method     → Scanned, User Reported, Auto Closed
├── status               → auto-calculated
├── method               → QR, Manual, Geofence, Self check-in
├── location_id          → if multiple sites exist
├── overridden_by        → if an admin corrected it
├── override_reason      → required when overriding
├── notes
└── created_at
```

### Other Key Tables
- `users` — credentials, profile, role, organization, primary contact (email), backup contact (phone)
- `organizations` — multi-tenant root
- `cohorts` — name, start date, end date, organization, invite links
- `departments` — name, supervisor, organization, shift start, shift end, cutoff time
- `schedules` — shifts, timetables, grace periods, cutoff times per user type
- `leaves` — requests, approvals, balances, types
- `announcements` — title, body, target, posted by, read receipts
- `work_logs` — daily activity entries per attachee
- `audit_logs` — permanent, read-only record of every action
- `notifications`
- `holidays`

---

## 11. Supervisor Dashboard

### Immediate Visibility (No Digging)
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

### Data Visualizations
| Need | Visual |
|---|---|
| Who needs attention now | Cards / alert list |
| Daily pattern this week | Stacked bar chart by day |
| Trend over month | Line chart |
| Individual performance | Ranked list + heatmap calendar |
| Department comparison (admin only) | Horizontal bar chart |
| Today's overall split | Small donut chart (supporting only) |

### Behavioral Insights (Phase 2)
- Pattern detection — consistently late on specific days
- Trend analysis — attendance drops over time periods
- Anomaly alerts — automatic flags without manual digging

---

## 12. Announcements & Communication

### How It Works
- Posted inside the platform — never WhatsApp
- Tracked: who has seen it and when — supervisor sees "14/20 read"
- Push notification for urgent announcements
- Pinned until admin unpins

### Structure
- Title, body, posted by, posted at
- Target: specific department or all
- Category: Standard (blue), Department-specific (amber), Critical (red)
- Acknowledgement option for critical notices

### Replaces WhatsApp Because:
- "I didn't see it" is now verifiable — system shows who read it and when
- Messages can't be buried under replies
- Permanent, structured, accountable

---

## 13. User Personal Dashboard

### Three Questions Answered on Login
1. What is my status today?
2. How am I doing overall?
3. Is there anything I need to act on?

### Today's Card
- Check-in time and status
- Check-out time if applicable

### Portfolio Metrics (Attachees)
- Punctuality Streak
- Attendance Score (circular SVG progress ring)
- Engagement Rate (announcements read and acknowledged)

### History View
- Calendar: month view, color-coded
- List view: each day, exact times, status, notes
- Filter by month, status, date range

### End-of-Cohort Portfolio Export (Phase 2)
- Clean designed PDF — not a data dump
- Attendance rate, punctuality rate, engagement rate, work log highlights
- Shareable for next opportunity or job application

---

## 14. Dispute Feature

1. User flags a specific record, adds explanation
2. Status becomes Disputed
3. Supervisor notified and reviews
4. Supervisor resolves with decision and reason
5. User sees outcome — transparent, documented

---

## 15. Work Log (Daily Progress Journal)

**Applies to:** Attachees only — Members and Staff are exempt

### What It Captures
- What they worked on
- Challenges faced
- Progress made
- Anything to flag (optional)
- Department-specific questions (Phase 2 — configured by supervisor)

### Timing
- Reminder fires 30 minutes before department end time
- Second nudge appears at check-out if not yet submitted
- If ignored — day shows as "Work Log Missing" — visible to supervisor, not punitive

### Who Sees It
- Attachee: own logs, full timeline in profile
- Department Supervisor: all department logs, filterable, can leave feedback
- Super Admin: cross-department view

---

## 16. Account Registration & Recovery

### Registration Fields
- Full name
- Email address (primary — required)
- Phone number (backup — optional, strongly encouraged)
- Department
- Password + confirm password

### Password Recovery
| Situation | Path |
|---|---|
| Forgot password, has email | Email reset link (expires 30 minutes) |
| Forgot password, no email | SMS code to phone (expires 10 minutes) |
| Lost both | Supervisor verifies in person → Super Admin manual reset |
| Supervisor resets team member | Not allowed — protects against misuse |
| Super Admin resets anyone | Yes, with audit log entry |

---

## 17. Admin Setup Flow (Day Zero)

1. Protected `/setup` route — works once, closes after first super admin created
2. Super Admin creates organization: name, short name, contact email, own credentials
3. Configures departments, assigns supervisors, sets schedules and cutoff times
4. Sets public holidays
5. Uploads organization logo
6. Creates first cohort — name, start/end dates, generates invite links
7. Shares links in WhatsApp groups — onboarding begins

**Setup must be completely non-technical** — forms only, no command line, no config files.
**Multiple Super Admins supported** — one can promote another, no developer needed.

---

## 18. Data Privacy & Retention

| Period | What Happens |
|---|---|
| During cohort | Full access, active account |
| 0-90 days after cohort end | Account active — can log in, view record, export portfolio |
| 90 days after cohort end | Account archived — cannot log in, data retained |
| 1 year after cohort end | Personal details anonymized, aggregate data retained for cohort comparisons |

Super Admin can extend retention or trigger early anonymization.

---

## 19. Security & Access Control

### Two Enforcement Layers
1. Frontend — UI only renders what the role permits (reduces confusion)
2. Backend — every API request verified before data is returned (actual security)

### Multi-Tenant Isolation
Every query scoped to organization ID from user's token. SPH data invisible to all other organizations. Architectural, not optional.

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

## 20. Notifications System

### Three Delivery Layers
1. In-App — always works, no permissions needed
2. Push Notification — if browser permission granted
3. Email — fallback for critical notifications if push missed

### Per Notification Type
| Notification | In-App | Push | Email |
|---|---|---|---|
| Check-in reminder before cutoff | Always | If enabled | If push missed |
| Unresolved status alert | Always | If enabled | Yes |
| Critical announcement | Always | If enabled | Yes |
| Standard announcement | Always | If enabled | No |
| Dispute resolved | Always | If enabled | No |
| Leave approved/rejected | Always | If enabled | No |
| Work log reminder | Always | If enabled | No |

SMS deferred to Phase 2 — email is free and sufficient as fallback.

**First login prompt:** App asks user to enable notifications with clear explanation. Not a forced gate — a well-timed honest ask.

---

## 21. Design System — "Vibrant Minimalist"

**Reference:** Linear, Stripe, Vercel — premium SaaS, not corporate HR software.

### Color Palette
| Token | Value | Usage |
|---|---|---|
| Canvas Light | #F8F9FA | Light mode background |
| Canvas Dark | #0F172A | Dark mode background |
| SPH Green | #10B981 | Early / On-Time |
| SPH Blue | #2563EB | Standard alerts / info |
| SPH Red | #EF4444 | Critical alerts |
| Amber | — | Late / caution |
| Neutral Grey | — | Excused / resolved |

### Typography
- Inter, Plus Jakarta Sans, or Geist
- Maximum two fonts, large confident headings, strong hierarchy

### Dark Mode
Non-negotiable. Developers, creatives, varied working hours.

### Dashboard Layout (Post-Login)
**Section A — Greeting:** "Habari, [Name]" — Department | Cohort — sync indicator
**Section B — Hero Check-In:** Dynamic state button — pulsing when unchecked, green pill when checked in
**Section C — Portfolio Metrics:** Streak, attendance score ring, announcement badge
**Section D — Announcements Feed:** Right on desktop, below on mobile, left border stripe by category

### CSS: Tailwind CSS
```js
colors: {
  'sph-green': '#10B981',
  'sph-blue': '#2563EB',
  'sph-red': '#EF4444',
  'sph-dark': '#0F172A',
  'sph-light': '#F8F9FA',
}
```

---

## 22. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js + Tailwind CSS |
| Backend | Node.js (Express or Fastify) |
| Database | PostgreSQL |
| Auth | JWT + secure sessions |
| Real-time | Socket.io |
| Background Jobs | Node cron |
| Email | Nodemailer |
| SMS (Phase 2) | Africa's Talking or Twilio |
| File Export | PDF/CSV generation library |
| Deployment | Vercel (frontend) + Railway (backend + DB) |
| PWA | Configured in Next.js from day one |

---

## 23. GitHub Repository

**Account:** Maureenmaureen-design
**Repo:** `sph-attendance-system`
**URL:** `github.com/Maureenmaureen-design/sph-attendance-system`

### Structure
```
sph-attendance-system/
├── client/          → Next.js frontend
├── server/          → Node.js backend
├── docs/            → project-brief.md and all documentation
├── .github/         → GitHub Actions CI/CD workflows
├── .gitignore
├── README.md
└── docker-compose.yml
```

### Branch Strategy
```
main        → production only, no direct pushes
develop     → working branch, all features merge here first
feature/*   → one branch per feature
fix/*       → one branch per bug fix
```

### Branch Protection
- main: PR required, one approval minimum, all checks must pass
- develop: PR required, no force pushes

### Commit Convention
```
feat: add QR rotation logic
fix: correct late status calculation
docs: update API documentation
style: adjust dashboard spacing
refactor: extract status calculator
chore: update dependencies
```

---

## 24. Deployment

| Part | Platform | Reason |
|---|---|---|
| Frontend | Vercel | Built for Next.js, global CDN, auto-deploys |
| Backend + DB | Railway | Simple, backend and DB on same platform |
| Domain | Custom — attendance.swahilipothub.org | Official, permanent |

### Environments
- Local → Staging → Production
- CI/CD via GitHub Actions — auto-deploys on merge to main
- Tests must pass before any deployment proceeds

### PWA Behavior
- Add to home screen — works like a native app
- No App Store or Play Store required
- Push notifications on Android (full support), iOS (supported since 2023)
- Offline: cached QR token + queued check-in, syncs on reconnect

---

## 25. Documentation Plan

Documentation is written alongside the build, not before it.

**Technical docs (written as features are completed):**
- System architecture
- Database schema
- API reference
- Environment setup guide
- Deployment guide

**Non-technical docs (written after features are stable):**
- Admin setup guide
- User guide
- Supervisor guide

**Project story docs (written at completion):**
- Problem to solution narrative
- Design decisions and rationale
- Known limitations and future considerations

The project brief (this document) serves as the planning reference during the build.

---

## 26. Build Order

### Phase 1 — Core (Build First)
1. Project setup — Next.js + Tailwind + PostgreSQL + Node backend + PWA config
2. Authentication — register via invite link, login, roles, JWT, persistent sessions, password recovery
3. Admin setup flow — organization, departments, schedules, cohorts
4. Check-in system — rotating QR, scanning, offline cache + sync, time status calculation
5. Attendance dashboard — personal view, supervisor view, admin view
6. Check-out system — self-healing workflow
7. Announcements — post, target, read receipts, notifications
8. Work logs — daily progress journal, 30-min reminder

### Phase 2 — Enhancement (After Core Is Live)
9. Portfolio PDF export
10. Behavioral insights — pattern detection, anomaly alerts
11. Bulk CSV user import
12. Department-specific work log questions
13. SMS fallback notifications
14. Advanced reports and cohort comparisons

---

## 27. What Was Deliberately Dropped or Deferred

| Item | Decision | Reason |
|---|---|---|
| Visitor user type | Dropped | Separate reception tool |
| Mood emoji check-in | Dropped | Undermines professional feel |
| Predictive absence | Dropped | Too speculative for v1 |
| Biometric hardware | Deferred | Infrastructure dependency |
| PIN fallback for offline | Dropped | 15-min QR cache solves it cleanly |
| SMS notifications | Phase 2 | Email sufficient for Phase 1 |

---

## 28. Design Philosophy

> "The system treats everyone fairly, surfaces meaning from data, and doesn't feel like surveillance."

- Human and considered — not generic, not AI-template feel
- Bold where it counts — premium interactions, unconventional dashboard
- Accountability as a habit, not punishment
- Progressive disclosure — each user only sees their relevant space
- Every feature asks: does this empower the user or just monitor them?

---

## 29. System Rating & Assessment

**Rating: 8.5/10**

- Tight problem-solution fit — every feature traces to a real SPH pain point
- Consistent philosophy throughout
- Sound technical decisions
- Innovative portfolio angle
- Properly layered security
- Clear, distinctive design direction
- Not too bulky — appropriately scoped
- Phase 2 features identified and separated cleanly

**Remaining unknowns (SPH to confirm during setup):**
- Exact staff/member cutoff times
- Confirmed department supervisors
- Super Admin identity
- Final department schedule confirmation

---

*Planning discussion completed June 12-13, 2026. Ready to begin Phase 1 build.*

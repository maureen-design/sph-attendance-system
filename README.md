# SPH Attendance System

A unified, full-stack attendance and people management platform built for Swahilipot Hub (SPH), designed to scale to universities and other institutions.

## The Problem It Solves

- Replaces multiple fragmented check-in links with one unified platform
- Eliminates daily credential typing on Google Forms
- Provides server-side timestamped records — no more photo proof of early arrivals
- Replaces WhatsApp announcements with tracked, accountable in-app communication
- Integrates disconnected work logs into a single professional portfolio

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js + TypeScript + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL (Supabase) |
| ORM | Prisma |
| Auth | JWT + bcrypt |
| Real-time | Socket.io |

## Project Structure

```
AATS/
├── client/          → Next.js frontend
├── server/          → Node.js backend
├── docs/            → Project brief and documentation
└── README.md
```

## Getting Started

### Prerequisites
- Node.js v18+
- Git

### Backend Setup
```bash
cd server
npm install
cp .env.example .env
# Fill in your environment variables
npx prisma db push
npm run dev
```

### Frontend Setup
```bash
cd client
npm install
npm run dev
```

## Organization
Built for **Swahilipot Hub (SPH)** — Mombasa, Kenya.

## License
Private — All rights reserved.

# SPH Attendance System

Swahilipot Hub — Attendance & People Management Platform

## Stack

| Layer     | Technology                         |
| --------- | ---------------------------------- |
| Client    | Next.js 14 · TypeScript · Tailwind |
| Server    | Express · TypeScript · Prisma      |
| Database  | PostgreSQL                         |
| Auth      | JWT                                |
| Container | Docker Compose                     |

## Getting Started

```bash
npm install
npm run dev
```

Client runs on `http://localhost:3000`
Server runs on `http://localhost:4000`

## Scripts

| Command              | Description                      |
| -------------------- | -------------------------------- |
| `npm run dev`        | Run client + server concurrently |
| `npm run dev:client` | Run client only                  |
| `npm run dev:server` | Run server only                  |
| `npm run build`      | Build both client and server     |
| `npm run lint`       | Lint both client and server      |
| `npm run format`     | Format all files with Prettier   |

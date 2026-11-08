# NexusHub

NexusHub is a web application built with Next.js and NestJS, backed by
PostgreSQL and Prisma.

## Stack

- Frontend: Next.js, React, shadcn/ui, TanStack Query
- Backend: NestJS, Prisma
- Database: PostgreSQL 16 (Docker Compose)

## Start locally

Start PostgreSQL from the repository root:

```bash
docker compose up -d
```

In a separate terminal, start the API:

```bash
cd backend
pnpm start:dev
```

Then start the frontend:

```bash
cd frontend
pnpm dev
```

The frontend is at http://localhost:3000 and the API at
http://localhost:4000/api. Set up `backend/.env` from
[`backend/.env.example`](./backend/.env.example) if needed.

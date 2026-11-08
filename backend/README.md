# NexusHub Backend

API NestJS with PostgreSQL and Prisma.

## Development

Requirements: Node.js, pnpm, and Docker Compose.

From the repository root, start PostgreSQL:

```bash
docker compose up -d
```

Install dependencies and apply database migrations:

```bash
cd backend
pnpm install
pnpm exec prisma migrate dev
pnpm exec prisma generate
```

The local `backend/.env` should set `DATABASE_URL`, `PORT` (default `4000`),
and `FRONTEND_URL` (default `http://localhost:3000`). The Compose setup
publishes PostgreSQL on ports `5432` and `5433`; use the port available on
your machine in `DATABASE_URL`.

Run the API:

```bash
pnpm run start:dev
```

The health endpoint is `http://localhost:4000/api/health`; Swagger is at
`http://localhost:4000/api/docs`.

## Verification

```bash
pnpm run build
pnpm run test:e2e
```

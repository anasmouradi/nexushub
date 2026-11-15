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

## Dashboard metrics

`GET /api/dashboard` returns project and task KPIs and chart data for the
authenticated user's tenant and visibility:

- Company admins see all company projects and tasks.
- Managers see projects they manage, created, or belong to, and tasks in those
  projects.
- Employees see projects they belong to and only tasks assigned to them.
- `activeProjects` counts projects with `IN_PROGRESS` status.
- `overdueTasks` counts tasks whose due date is before the current time, except
  tasks with `DONE` status.
- `teamProductivity` groups completed tasks from the last 30 days by the team
  assigned to their project, alongside that team's open-task count.
- `monthlyActivity` reports task creation and completion for the current UTC
  month and the preceding five months.
- `employees` is `null` for employees; otherwise it counts active company
  members, managers, and employees (excluding administrators).

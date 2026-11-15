"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  priorityColors,
  priorityLabels,
  taskStatuses,
  taskStatusColors,
  taskStatusLabels,
  type TaskStatus,
} from "@/lib/enums";
import { formatDate } from "@/lib/format";
import { getTasks } from "@/lib/tasks";
import { useUrlSearch } from "@/lib/use-url-search";

function isTaskStatus(value: string): value is TaskStatus {
  return taskStatuses.some((status) => status === value);
}

function displayName(person: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
} | null) {
  if (!person) return "Non assignée";
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email;
}

export default function MyTasksPage() {
  const urlSearch = useUrlSearch();
  const params = new URLSearchParams(urlSearch);
  const queryStatus = params.get("status") ?? "";
  const [statusOverride, setStatusOverride] = useState<
    TaskStatus | "" | null
  >(null);
  const [overdueOverride, setOverdueOverride] = useState<boolean | null>(null);
  const status =
    statusOverride ?? (isTaskStatus(queryStatus) ? queryStatus : "");
  const overdue = overdueOverride ?? params.get("overdue") === "true";
  const [now, setNow] = useState<number>();
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const tasksQuery = useQuery({
    queryKey: ["my-tasks", { status, overdue }],
    queryFn: () =>
      getTasks({
        ...(status && { status }),
        overdue,
      }),
  });
  const tasks = tasksQuery.data ?? [];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Mes tâches</h1>
        <p className="text-sm text-muted-foreground">
          Les tâches qui vous sont assignées, tous projets confondus.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Statut</span>
          <select
            aria-label="Filtrer par statut"
            className="h-9 rounded-lg border border-input bg-background px-2"
            value={status}
            onChange={(event) => {
              const value = event.target.value;
              setStatusOverride(value === "" || isTaskStatus(value) ? value : "");
            }}
          >
            <option value="">Tous les statuts</option>
            {taskStatuses.map((value) => (
              <option key={value} value={value}>
                {taskStatusLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant={overdue ? "default" : "outline"}
          aria-pressed={overdue}
          onClick={() => setOverdueOverride((value) => !(value ?? overdue))}
        >
          En retard uniquement
        </Button>
      </div>

      {tasksQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Chargement des tâches…</p>
      ) : tasksQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {tasksQuery.error.message}
        </p>
      ) : tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucune tâche ne correspond à ces filtres.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tâche</TableHead>
                <TableHead>Projet</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead>Assigné à</TableHead>
                <TableHead>Échéance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => {
                const isOverdue =
                  task.dueDate !== null &&
                  task.status !== "DONE" &&
                  now !== undefined &&
                  new Date(task.dueDate).getTime() < now;
                return (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell>
                      <Link
                        href={`/projects/${task.projectId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {task.project.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={taskStatusColors[task.status]}
                      >
                        {taskStatusLabels[task.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={priorityColors[task.priority]}
                      >
                        {priorityLabels[task.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>{displayName(task.assignee)}</TableCell>
                    <TableCell
                      className={isOverdue ? "font-medium text-destructive" : ""}
                    >
                      {formatDate(task.dueDate)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

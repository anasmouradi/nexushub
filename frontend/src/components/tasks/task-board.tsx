"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Clock3,
  GripVertical,
  Plus,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  priorityColors,
  priorityLabels,
  taskStatuses,
  taskStatusColors,
  taskStatusLabels,
  type TaskStatus,
} from "@/lib/enums";
import { formatDate } from "@/lib/format";
import {
  getProjectTasks,
  moveTask,
  type MoveTaskInput,
  type ProjectTaskMember,
  type Task,
} from "@/lib/tasks";
import { TaskDialog } from "./task-dialog";

function isTaskStatus(value: string): value is TaskStatus {
  return taskStatuses.some((status) => status === value);
}

function displayName(person: {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email;
}

function isOverdue(task: Task, now?: number) {
  return (
    task.dueDate !== null &&
    task.status !== "DONE" &&
    now !== undefined &&
    new Date(task.dueDate).getTime() < now
  );
}

function applyMove(tasks: Task[], move: MoveTaskInput): Task[] {
  const task = tasks.find((item) => item.id === move.id);
  if (!task) return tasks;

  const remaining = tasks.filter((item) => item.id !== move.id);
  const targetColumn = remaining
    .filter((item) => item.status === move.status)
    .sort((left, right) => left.position - right.position);
  let index = targetColumn.length;
  if (move.afterId) {
    const afterIndex = targetColumn.findIndex((item) => item.id === move.afterId);
    if (afterIndex >= 0) index = afterIndex;
  } else if (move.beforeId) {
    const beforeIndex = targetColumn.findIndex(
      (item) => item.id === move.beforeId,
    );
    if (beforeIndex >= 0) index = beforeIndex + 1;
  }

  const before = targetColumn[index - 1];
  const after = targetColumn[index];
  const position =
    before && after
      ? (before.position + after.position) / 2
      : before
        ? before.position + 1000
        : after
          ? after.position - 1000
          : 0;
  const updated = { ...task, status: move.status, position };
  const next = [...remaining];
  const insertionPoint =
    after === undefined
      ? next.length
      : next.findIndex((item) => item.id === after.id);
  next.splice(insertionPoint, 0, updated);
  return next;
}

function SortableTaskCard({
  task,
  canDrag,
  canEdit,
  now,
  onEdit,
}: {
  task: Task;
  canDrag: boolean;
  canEdit: boolean;
  now?: number;
  onEdit: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled: !canDrag });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const overdue = isOverdue(task, now);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`gap-3 py-4 ${isDragging ? "opacity-40" : ""}`}
    >
      <CardHeader className="px-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm leading-5">{task.title}</CardTitle>
          <div className="flex shrink-0 items-center gap-1">
            {canDrag && (
              <Button
                ref={setActivatorNodeRef}
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Déplacer ${task.title}`}
                className="cursor-grab touch-none active:cursor-grabbing"
                {...attributes}
                {...listeners}
              >
                <GripVertical />
              </Button>
            )}
            {canEdit && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={onEdit}
              >
                Modifier
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        {task.description && (
          <p className="line-clamp-3 text-xs text-muted-foreground">
            {task.description}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Badge
            variant="outline"
            className={priorityColors[task.priority]}
          >
            {priorityLabels[task.priority]}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {task.assignee ? (
              <>
                <Avatar className="size-6">
                  <AvatarFallback>
                    {displayName(task.assignee).slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {displayName(task.assignee)}
              </>
            ) : (
              <>
                <UserRound className="size-3.5" />
                Non assignée
              </>
            )}
          </span>
          {task.dueDate && (
            <span
              className={`inline-flex items-center gap-1 ${
                overdue ? "font-medium text-destructive" : ""
              }`}
            >
              <CalendarDays className="size-3.5" />
              {formatDate(task.dueDate)}
            </span>
          )}
        </div>
        {task.estimatedHours !== null && (
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock3 className="size-3.5" />
            {task.estimatedHours} h estimée(s)
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function TaskColumn({
  status,
  tasks,
  canManageProject,
  currentUserId,
  currentUserRole,
  now,
  onEdit,
}: {
  status: TaskStatus;
  tasks: Task[];
  canManageProject: boolean;
  currentUserId: string;
  currentUserRole: string;
  now?: number;
  onEdit: (task: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const sortedTasks = tasks
    .filter((task) => task.status === status)
    .sort((left, right) => left.position - right.position);

  return (
    <section
      ref={setNodeRef}
      aria-label={taskStatusLabels[status]}
      className={`min-h-72 rounded-xl border p-3 ${
        isOver ? "border-primary bg-primary/5" : "bg-muted/20"
      }`}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-medium">{taskStatusLabels[status]}</h3>
        <Badge variant="outline" className={taskStatusColors[status]}>
          {sortedTasks.length}
        </Badge>
      </header>
      <SortableContext
        items={sortedTasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {sortedTasks.map((task) => {
            const canEdit =
              canManageProject ||
              (currentUserRole === "EMPLOYEE" &&
                task.assigneeId === currentUserId);
            return (
              <SortableTaskCard
                key={task.id}
                task={task}
                now={now}
                canDrag={
                  canManageProject ||
                  (currentUserRole === "EMPLOYEE" &&
                    task.assigneeId === currentUserId)
                }
                canEdit={canEdit}
                onEdit={() => onEdit(task)}
              />
            );
          })}
          {sortedTasks.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              Déposez une tâche ici
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

export function TaskBoard({
  projectId,
  members,
  currentUserId,
  currentUserRole,
  canManageProject,
}: {
  projectId: string;
  members: ProjectTaskMember[];
  currentUserId: string;
  currentUserRole: string;
  canManageProject: boolean;
}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task>();
  const [now, setNow] = useState<number>();
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const queryKey = ["project-tasks", projectId];
  const tasksQuery = useQuery({
    queryKey,
    queryFn: () => getProjectTasks(projectId),
  });
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const moveMutation = useMutation({
    mutationFn: moveTask,
    onMutate: async (move) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Task[]>(queryKey);
      if (previous) {
        queryClient.setQueryData(queryKey, applyMove(previous, move));
      }
      return { previous };
    },
    onError: (error, _move, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast.error(error instanceof Error ? error.message : "Déplacement impossible");
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey });
      await queryClient.invalidateQueries({ queryKey: ["my-tasks"] });
    },
  });

  function onDragEnd(event: DragEndEvent) {
    if (!event.over || !tasksQuery.data) return;
    const activeId = String(event.active.id);
    const active = tasksQuery.data.find((task) => task.id === activeId);
    if (!active) return;
    if (
      !canManageProject &&
      !(currentUserRole === "EMPLOYEE" && active.assigneeId === currentUserId)
    ) {
      return;
    }

    const overId = String(event.over.id);
    if (activeId === overId) return;
    const overTask = tasksQuery.data.find((task) => task.id === overId);
    const status = overTask?.status ?? (isTaskStatus(overId) ? overId : null);
    if (!status) return;

    const targetTasks = tasksQuery.data
      .filter((task) => task.status === status && task.id !== activeId)
      .sort((left, right) => left.position - right.position);
    let index = targetTasks.length;
    if (overTask) {
      index = targetTasks.findIndex((task) => task.id === overTask.id);
      if (index < 0) index = targetTasks.length;
      const draggedCenter =
        event.active.rect.current.translated?.top ??
        event.active.rect.current.initial?.top ??
        0;
      const targetCenter = event.over.rect.top + event.over.rect.height / 2;
      if (draggedCenter + (event.active.rect.current.initial?.height ?? 0) / 2 > targetCenter) {
        index += 1;
      }
    }

    const beforeId = targetTasks[index - 1]?.id;
    const afterId = targetTasks[index]?.id;
    moveMutation.mutate({
      id: activeId,
      status,
      ...(beforeId && { beforeId }),
      ...(afterId && { afterId }),
    });
  }

  const tasks = tasksQuery.data ?? [];

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Tableau des tâches</h2>
          <p className="text-sm text-muted-foreground">
            {tasks.length} tâche(s) dans ce projet
          </p>
        </div>
        {canManageProject && (
          <Button
            onClick={() => {
              setSelectedTask(undefined);
              setDialogOpen(true);
            }}
          >
            <Plus />
            Nouvelle tâche
          </Button>
        )}
      </header>

      {tasksQuery.isPending ? (
        <p className="text-sm text-muted-foreground">Chargement des tâches…</p>
      ) : tasksQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {tasksQuery.error.message}
        </p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="grid gap-3 lg:grid-cols-4">
            {taskStatuses.map((status) => (
              <TaskColumn
                key={status}
                status={status}
                tasks={tasks}
                canManageProject={canManageProject}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                now={now}
                onEdit={(task) => {
                  setSelectedTask(task);
                  setDialogOpen(true);
                }}
              />
            ))}
          </div>
        </DndContext>
      )}

      <TaskDialog
        projectId={projectId}
        members={members}
        task={selectedTask}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        canManageProject={canManageProject}
      />
    </section>
  );
}

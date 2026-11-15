"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  priorities,
  priorityLabels,
  taskStatuses,
  taskStatusLabels,
} from "@/lib/enums";
import { dateInputToIso, toDateInputValue } from "@/lib/format";
import {
  createTask,
  deleteTask,
  updateTask,
  type CreateTaskInput,
  type ProjectTaskMember,
  type Task,
  type TaskInput,
} from "@/lib/tasks";

const taskFormSchema = z
  .object({
    title: z.string().trim().min(2, "Le titre doit contenir au moins 2 caractères").max(200),
    description: z.string().max(5000, "5000 caractères maximum"),
    status: z.enum(taskStatuses),
    priority: z.enum(priorities),
    assigneeId: z.string(),
    dueDate: z.string(),
    estimatedHours: z.string(),
    actualHours: z.string(),
  })
  .superRefine((values, context) => {
    for (const field of ["estimatedHours", "actualHours"] as const) {
      const value = values[field];
      if (value && (!Number.isFinite(Number(value)) || Number(value) <= 0)) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "La durée doit être un nombre positif.",
        });
      }
    }
  });

type TaskFormValues = z.infer<typeof taskFormSchema>;

function getDefaults(task?: Task): TaskFormValues {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "TODO",
    priority: task?.priority ?? "MEDIUM",
    assigneeId: task?.assigneeId ?? "",
    dueDate: toDateInputValue(task?.dueDate),
    estimatedHours:
      task?.estimatedHours === null || task?.estimatedHours === undefined
        ? ""
        : String(task.estimatedHours),
    actualHours:
      task?.actualHours === null || task?.actualHours === undefined
        ? ""
        : String(task.actualHours),
  };
}

function personName(person: ProjectTaskMember) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || person.email;
}

export function TaskDialog({
  projectId,
  members,
  task,
  open,
  onOpenChange,
  canManageProject,
}: {
  projectId: string;
  members: ProjectTaskMember[];
  task?: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManageProject: boolean;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: getDefaults(task),
  });

  useEffect(() => {
    if (open) reset(getDefaults(task));
  }, [open, reset, task]);

  const invalidateTaskQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["project-tasks", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["my-tasks"] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: (input: TaskInput) => {
      if (task) return updateTask(task.id, input);
      if (!input.title) throw new Error("Le titre est obligatoire");
      const createInput: CreateTaskInput = { ...input, title: input.title };
      return createTask(projectId, createInput);
    },
    onSuccess: async () => {
      await invalidateTaskQueries();
      onOpenChange(false);
      toast.success(task ? "Tâche modifiée" : "Tâche créée");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!task) throw new Error("Aucune tâche à supprimer");
      return deleteTask(task.id);
    },
    onSuccess: async () => {
      await invalidateTaskQueries();
      onOpenChange(false);
      toast.success("Tâche supprimée");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    },
  });

  function onSubmit(values: TaskFormValues) {
    const input: TaskInput = canManageProject
      ? {
          title: values.title,
          description: values.description.trim() || null,
          status: values.status,
          priority: values.priority,
          assigneeId: values.assigneeId || null,
          dueDate: dateInputToIso(values.dueDate) ?? null,
          estimatedHours: values.estimatedHours
            ? Number(values.estimatedHours)
            : null,
          ...(task && {
            actualHours: values.actualHours
              ? Number(values.actualHours)
              : null,
          }),
        }
      : {
          description: values.description.trim() || null,
          status: values.status,
          actualHours: values.actualHours ? Number(values.actualHours) : null,
        };
    saveMutation.mutate(input);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        onOpenChange(value);
        if (!value) reset(getDefaults(task));
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Modifier la tâche" : "Nouvelle tâche"}</DialogTitle>
          <DialogDescription>
            {task
              ? "Mettez à jour les informations de cette tâche."
              : "Ajoutez une tâche au projet."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {canManageProject && (
            <div className="space-y-2">
              <Label htmlFor="task-title">Titre</Label>
              <Input id="task-title" {...register("title")} />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea id="task-description" rows={4} {...register("description")} />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-status">Statut</Label>
            <select
              id="task-status"
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              {...register("status")}
            >
              {taskStatuses.map((status) => (
                <option key={status} value={status}>
                  {taskStatusLabels[status]}
                </option>
              ))}
            </select>
          </div>
          {canManageProject && (
            <>
              <div className="space-y-2">
                <Label htmlFor="task-priority">Priorité</Label>
                <select
                  id="task-priority"
                  className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                  {...register("priority")}
                >
                  {priorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priorityLabels[priority]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-assignee">Assigné à</Label>
                <select
                  id="task-assignee"
                  className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                  {...register("assigneeId")}
                >
                  <option value="">Non assignée</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {personName(member)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="task-due-date">Échéance</Label>
                  <Input id="task-due-date" type="date" {...register("dueDate")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="task-estimated-hours">Heures estimées</Label>
                  <Input
                    id="task-estimated-hours"
                    type="number"
                    min="0.01"
                    step="0.01"
                    {...register("estimatedHours")}
                  />
                  {errors.estimatedHours && (
                    <p className="text-sm text-destructive">
                      {errors.estimatedHours.message}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
          {task && (
            <div className="space-y-2">
              <Label htmlFor="task-actual-hours">Heures réelles</Label>
              <Input
                id="task-actual-hours"
                type="number"
                min="0.01"
                step="0.01"
                {...register("actualHours")}
              />
              {errors.actualHours && (
                <p className="text-sm text-destructive">
                  {errors.actualHours.message}
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            {task && canManageProject && (
              <Button
                type="button"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                Supprimer
              </Button>
            )}
            <Button
              type="submit"
              disabled={isSubmitting || saveMutation.isPending}
            >
              {saveMutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

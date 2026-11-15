import { api } from "@/lib/api";
import type { Priority, TaskStatus } from "@/lib/enums";
import type { ProjectMember } from "@/lib/projects";
import type { TeamManager } from "@/lib/teams";

export type Task = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  position: number;
  dueDate: string | null;
  estimatedHours: number | string | null;
  actualHours: number | string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assigneeId: string | null;
  assignee: (TeamManager & { role: string }) | null;
  creator: TeamManager;
  project: { id: string; name: string };
};

export type TaskInput = {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  assigneeId?: string | null;
  dueDate?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
};

export type CreateTaskInput = TaskInput & { title: string };

export type TaskFilters = {
  status?: TaskStatus | "";
  overdue?: boolean;
};

export type MoveTaskInput = {
  id: string;
  status: TaskStatus;
  beforeId?: string;
  afterId?: string;
};

export type ProjectTaskMember = ProjectMember["user"];

export function getProjectTasks(projectId: string) {
  return api<Task[]>(`/projects/${projectId}/tasks`);
}

export function getTasks(filters: TaskFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.overdue) params.set("overdue", "true");
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return api<Task[]>(`/tasks${query}`);
}

export function createTask(projectId: string, input: CreateTaskInput) {
  return api<Task>(`/projects/${projectId}/tasks`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTask(id: string, input: TaskInput) {
  return api<Task>(`/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function moveTask(input: MoveTaskInput) {
  const { id, ...body } = input;
  return api<Task>(`/tasks/${id}/move`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteTask(id: string) {
  return api<void>(`/tasks/${id}`, { method: "DELETE" });
}

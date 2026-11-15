export const projectStatuses = [
  "PLANNING",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export function isProjectStatus(value: string): value is ProjectStatus {
  return projectStatuses.some((status) => status === value);
}

export const projectStatusLabels: Record<ProjectStatus, string> = {
  PLANNING: "Planification",
  IN_PROGRESS: "En cours",
  ON_HOLD: "En pause",
  COMPLETED: "Terminé",
  CANCELLED: "Annulé",
};

export const projectStatusColors: Record<ProjectStatus, string> = {
  PLANNING: "border-slate-300 bg-slate-100 text-slate-800",
  IN_PROGRESS: "border-blue-300 bg-blue-100 text-blue-800",
  ON_HOLD: "border-amber-300 bg-amber-100 text-amber-900",
  COMPLETED: "border-emerald-300 bg-emerald-100 text-emerald-800",
  CANCELLED: "border-rose-300 bg-rose-100 text-rose-800",
};

export const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export type Priority = (typeof priorities)[number];

export function isPriority(value: string): value is Priority {
  return priorities.some((priority) => priority === value);
}

export const priorityLabels: Record<Priority, string> = {
  LOW: "Basse",
  MEDIUM: "Normale",
  HIGH: "Haute",
  URGENT: "Urgente",
};

export const priorityColors: Record<Priority, string> = {
  LOW: "border-slate-300 bg-slate-100 text-slate-800",
  MEDIUM: "border-sky-300 bg-sky-100 text-sky-800",
  HIGH: "border-orange-300 bg-orange-100 text-orange-800",
  URGENT: "border-red-300 bg-red-100 text-red-800",
};

export const taskStatuses = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export const taskStatusLabels: Record<TaskStatus, string> = {
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  REVIEW: "En revue",
  DONE: "Terminée",
};

export const taskStatusColors: Record<TaskStatus, string> = {
  TODO: "border-slate-300 bg-slate-100 text-slate-800",
  IN_PROGRESS: "border-blue-300 bg-blue-100 text-blue-800",
  REVIEW: "border-amber-300 bg-amber-100 text-amber-900",
  DONE: "border-emerald-300 bg-emerald-100 text-emerald-800",
};

import { api } from "@/lib/api";
import type { User } from "@/lib/auth";
import type { Priority, ProjectStatus } from "@/lib/enums";
import type { TeamManager } from "@/lib/teams";

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  startDate: string | null;
  dueDate: string | null;
  manager: TeamManager | null;
  team: { id: string; name: string } | null;
  createdBy: Pick<User, "id" | "firstName" | "lastName" | "email">;
  membersCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMember = {
  addedAt: string;
  user: Pick<User, "id" | "firstName" | "lastName" | "email" | "role">;
};

export type ProjectDetail = ProjectSummary & {
  members: ProjectMember[];
};

export type ProjectFilters = {
  page: number;
  limit: number;
  status?: ProjectStatus;
  priority?: Priority;
  search?: string;
};

export type ProjectPage = {
  data: ProjectSummary[];
  page: number;
  limit: number;
  total: number;
};

export type CreateProjectInput = {
  name: string;
  description?: string;
  status?: ProjectStatus;
  priority?: Priority;
  startDate?: string;
  dueDate?: string;
  managerId?: string;
  teamId?: string;
  addTeamMembers?: boolean;
};

export function getProjects(filters: ProjectFilters) {
  const params = new URLSearchParams({
    page: String(filters.page),
    limit: String(filters.limit),
  });
  if (filters.status) params.set("status", filters.status);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  return api<ProjectPage>(`/projects?${params.toString()}`);
}

export function getProject(id: string) {
  return api<ProjectDetail>(`/projects/${id}`);
}

export function createProject(input: CreateProjectInput) {
  return api<ProjectSummary>("/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProject(
  id: string,
  input: Partial<CreateProjectInput>,
) {
  return api<ProjectSummary>(`/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function addProjectMember(projectId: string, userId: string) {
  return api(`/projects/${projectId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export function removeProjectMember(projectId: string, userId: string) {
  return api(`/projects/${projectId}/members/${userId}`, {
    method: "DELETE",
  });
}

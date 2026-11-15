import { api } from "@/lib/api";
import type { User } from "@/lib/auth";

export type TeamManager = Pick<
  User,
  "id" | "firstName" | "lastName" | "email"
>;

export type TeamSummary = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  manager: TeamManager | null;
  membersCount: number;
};

export type TeamMember = {
  joinedAt: string;
  user: Pick<User, "id" | "firstName" | "lastName" | "email" | "role">;
};

export type TeamDetail = Omit<TeamSummary, "membersCount" | "createdAt"> & {
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
};

export type CreateTeamInput = {
  name: string;
  description?: string;
};

export function getTeams() {
  return api<TeamSummary[]>("/teams");
}

export function getTeam(id: string) {
  return api<TeamDetail>(`/teams/${id}`);
}

export function createTeam(input: CreateTeamInput) {
  return api<TeamSummary>("/teams", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function addTeamMember(teamId: string, userId: string) {
  return api(`/teams/${teamId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export function removeTeamMember(teamId: string, userId: string) {
  return api(`/teams/${teamId}/members/${userId}`, { method: "DELETE" });
}

export async function getCompanyUsers() {
  const firstPage = await api<{
    data: User[];
    page: number;
    limit: number;
    total: number;
  }>("/users?page=1&limit=100");

  const pages = await Promise.all(
    Array.from(
      { length: Math.ceil(firstPage.total / firstPage.limit) - 1 },
      (_, index) =>
        api<{ data: User[] }>(
          `/users?page=${index + 2}&limit=${firstPage.limit}`,
        ),
    ),
  );
  return [firstPage.data, ...pages.map((page) => page.data)]
    .flat()
    .filter((user) => user.isActive);
}

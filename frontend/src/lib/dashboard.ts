import { useQuery } from "@tanstack/react-query";
import type { Priority, ProjectStatus, TaskStatus } from "@/lib/enums";
import { api } from "@/lib/api";

export type DashboardData = {
  kpis: {
    totalProjects: number;
    activeProjects: number;
    completedProjects: number;
    employees: number | null;
    totalTasks: number;
    overdueTasks: number;
  };
  projectsByStatus: Array<{ status: ProjectStatus; count: number }>;
  tasksByStatus: Array<{ status: TaskStatus; count: number }>;
  tasksByPriority: Array<{ priority: Priority; count: number }>;
  teamProductivity: Array<{
    teamId: string;
    teamName: string;
    completedLast30Days: number;
    openTasks: number;
  }>;
  monthlyActivity: Array<{
    month: string;
    created: number;
    completed: number;
  }>;
};

async function getDashboard() {
  return api<DashboardData>("/dashboard");
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: getDashboard,
  });
}

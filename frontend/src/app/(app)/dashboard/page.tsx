"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  ListTodo,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useDashboard } from "@/lib/dashboard";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { MonthlyActivityChart } from "@/components/dashboard/monthly-activity-chart";
import { ProjectStatusChart } from "@/components/dashboard/project-status-chart";
import { TasksByPriorityChart } from "@/components/dashboard/tasks-by-priority-chart";
import { TasksByStatusChart } from "@/components/dashboard/tasks-by-status-chart";
import { TeamProductivityChart } from "@/components/dashboard/team-productivity-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const KPI_SKELETONS = Array.from({ length: 6 }, (_, index) => index);
const CHART_SKELETONS = Array.from({ length: 5 }, (_, index) => index);

export default function DashboardPage() {
  const { user } = useAuth();
  const dashboardQuery = useDashboard();
  const dashboard = dashboardQuery.data;
  const canCreateProject =
    user?.role === "COMPANY_ADMIN" || user?.role === "MANAGER";
  const hasData =
    (dashboard?.kpis.totalProjects ?? 0) > 0 ||
    (dashboard?.kpis.totalTasks ?? 0) > 0;

  return (
    <section className="space-y-8">
      <header>
        <p className="text-sm font-medium text-primary">NexusHub</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Tableau de bord
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Un aperçu de l’activité dans votre périmètre.
        </p>
      </header>

      {dashboardQuery.isError ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <p role="alert" className="text-sm text-destructive">
              {dashboardQuery.error.message ||
                "Impossible de charger le tableau de bord."}
            </p>
            <Button
              variant="outline"
              onClick={() => void dashboardQuery.refetch()}
            >
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : dashboardQuery.isPending || !dashboard ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {KPI_SKELETONS.map((item) => (
              <Card key={item}>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CHART_SKELETONS.map((item) => (
              <Card key={item}>
                <CardHeader>
                  <Skeleton className="h-5 w-36" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-56 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            <KpiCard
              label="Projets"
              value={dashboard.kpis.totalProjects}
              icon={BriefcaseBusiness}
              href="/projects"
            />
            <KpiCard
              label="Actifs"
              value={dashboard.kpis.activeProjects}
              icon={Activity}
              href="/projects?status=IN_PROGRESS"
            />
            <KpiCard
              label="Terminés"
              value={dashboard.kpis.completedProjects}
              icon={CheckCircle2}
              href="/projects?status=COMPLETED"
            />
            {dashboard.kpis.employees !== null && (
              <KpiCard
                label="Employés"
                value={dashboard.kpis.employees}
                icon={Users}
              />
            )}
            <KpiCard
              label="Tâches"
              value={dashboard.kpis.totalTasks}
              icon={ListTodo}
              href="/tasks"
            />
            <KpiCard
              label="En retard"
              value={dashboard.kpis.overdueTasks}
              icon={AlertTriangle}
              href="/tasks?overdue=true"
              highlight={dashboard.kpis.overdueTasks > 0}
            />
          </div>

          {!hasData && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="rounded-full bg-primary/10 p-3 text-primary">
                  <BriefcaseBusiness className="size-6" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-semibold">Votre espace est prêt</h2>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Les indicateurs et graphiques apparaîtront dès que votre
                    entreprise aura des projets et des tâches.
                  </p>
                </div>
                {canCreateProject && (
                  <Link
                    href="/projects"
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Créer un projet
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ProjectStatusChart data={dashboard.projectsByStatus} />
            <TasksByStatusChart data={dashboard.tasksByStatus} />
            <TasksByPriorityChart data={dashboard.tasksByPriority} />
            <TeamProductivityChart data={dashboard.teamProductivity} />
            <MonthlyActivityChart data={dashboard.monthlyActivity} />
          </div>
        </>
      )}
    </section>
  );
}

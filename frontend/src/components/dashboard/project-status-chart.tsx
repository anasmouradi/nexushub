"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  projectStatusChartColors,
  projectStatusLabels,
} from "@/lib/enums";
import { useMounted } from "@/lib/use-mounted";
import type { DashboardData } from "@/lib/dashboard";

export function ProjectStatusChart({
  data,
}: {
  data: DashboardData["projectsByStatus"];
}) {
  const mounted = useMounted();
  const chartData = data.map((item) => ({
    name: projectStatusLabels[item.status],
    value: item.count,
    color: projectStatusChartColors[item.status],
  }));
  const hasData = chartData.some((item) => item.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Projets par statut</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {mounted && hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius="58%"
                outerRadius="82%"
                paddingAngle={3}
              >
                {chartData.map((item) => (
                  <Cell key={item.name} fill={item.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {mounted ? "Aucun projet à représenter" : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

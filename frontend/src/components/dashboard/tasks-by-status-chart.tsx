"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { taskStatusLabels } from "@/lib/enums";
import { useMounted } from "@/lib/use-mounted";
import type { DashboardData } from "@/lib/dashboard";

export function TasksByStatusChart({
  data,
}: {
  data: DashboardData["tasksByStatus"];
}) {
  const mounted = useMounted();
  const chartData = data.map((item) => ({
    name: taskStatusLabels[item.status],
    count: item.count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tâches par statut</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tickLine={false} />
              <YAxis allowDecimals={false} tickLine={false} />
              <Tooltip />
              <Bar
                dataKey="count"
                name="Tâches"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

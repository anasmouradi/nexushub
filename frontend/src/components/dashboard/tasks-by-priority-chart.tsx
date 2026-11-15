"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  priorityChartColors,
  priorityLabels,
} from "@/lib/enums";
import { useMounted } from "@/lib/use-mounted";
import type { DashboardData } from "@/lib/dashboard";

export function TasksByPriorityChart({
  data,
}: {
  data: DashboardData["tasksByPriority"];
}) {
  const mounted = useMounted();
  const chartData = data.map((item) => ({
    name: priorityLabels[item.priority],
    priority: item.priority,
    count: item.count,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tâches par priorité</CardTitle>
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
                radius={[4, 4, 0, 0]}
              >
                {chartData.map((item) => (
                  <Cell
                    key={item.priority}
                    fill={priorityChartColors[item.priority]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

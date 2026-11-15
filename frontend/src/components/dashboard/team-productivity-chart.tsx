"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMounted } from "@/lib/use-mounted";
import type { DashboardData } from "@/lib/dashboard";

export function TeamProductivityChart({
  data,
}: {
  data: DashboardData["teamProductivity"];
}) {
  const mounted = useMounted();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Productivité des équipes</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {mounted && data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="teamName"
                width={92}
                tickLine={false}
              />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="completedLast30Days"
                name="Terminées (30 j)"
                fill="#16a34a"
                radius={[0, 4, 4, 0]}
              />
              <Bar
                dataKey="openTasks"
                name="Ouvertes"
                fill="#6366f1"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {mounted ? "Aucune équipe avec des tâches" : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

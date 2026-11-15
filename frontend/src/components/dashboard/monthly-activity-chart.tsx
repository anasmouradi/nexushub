"use client";

import {
  Area,
  AreaChart,
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

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

export function MonthlyActivityChart({
  data,
}: {
  data: DashboardData["monthlyActivity"];
}) {
  const mounted = useMounted();
  const chartData = data.map((item) => ({
    ...item,
    label: monthLabel(item.month),
  }));

  return (
    <Card className="md:col-span-2 xl:col-span-3">
      <CardHeader>
        <CardTitle className="text-base">Activité mensuelle</CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} />
              <YAxis allowDecimals={false} tickLine={false} />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="created"
                name="Créées"
                stroke="#6366f1"
                fill="#6366f1"
                fillOpacity={0.2}
              />
              <Area
                type="monotone"
                dataKey="completed"
                name="Terminées"
                stroke="#16a34a"
                fill="#16a34a"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

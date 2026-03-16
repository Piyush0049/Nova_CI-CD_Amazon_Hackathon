"use client";

import { UsageStats as StatsType } from "@/types";
import { TrendingUp, CheckCircle2, XCircle, Clock, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import { formatTimestamp } from "@/lib/utils";

interface UsageStatsProps {
  stats: StatsType;
}

export default function UsageStats({ stats }: UsageStatsProps) {
  const successRate =
    stats.totalTasks > 0
      ? Math.round((stats.successfulTasks / stats.totalTasks) * 100)
      : 0;

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const statCards = [
    {
      label: "Total Tasks",
      value: stats.totalTasks,
      icon: Activity,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Success Rate",
      value: `${successRate}%`,
      icon: TrendingUp,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      label: "Successful",
      value: stats.successfulTasks,
      icon: CheckCircle2,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      label: "Failed",
      value: stats.failedTasks,
      icon: XCircle,
      color: "text-red-500",
      bgColor: "bg-red-500/10",
    },
    {
      label: "Avg. Time",
      value: formatTime(stats.averageTime),
      icon: Clock,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Usage Statistics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {statCards.map((stat, index) => (
            <div
              key={index}
              className="p-4 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
            >
              <div
                className={`w-10 h-10 rounded-lg ${stat.bgColor} flex items-center justify-center mb-3`}
              >
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-bold mb-1">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
          <p>Last used: {formatTimestamp(stats.lastUsed)}</p>
          {stats.totalTime > 0 && (
            <p className="mt-1">
              Total automation time: {formatTime(stats.totalTime)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

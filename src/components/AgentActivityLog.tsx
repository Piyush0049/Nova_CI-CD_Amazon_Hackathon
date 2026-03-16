"use client";
import {
  Activity,
  MousePointer,
  Navigation,
  Search,
  Database,
  AlertCircle,
  Brain,
  Loader2,
} from "lucide-react";
import { AgentActivity } from "@/types";
import { formatTimestamp, cn } from "@/lib/utils";

interface AgentActivityLogProps {
  activities: AgentActivity[];
}

export default function AgentActivityLog({
  activities,
}: AgentActivityLogProps) {
  const getActivityIcon = (type: AgentActivity["type"]) => {
    const iconClass = "w-4 h-4";

    switch (type) {
      case "planning":
        return <Brain className={iconClass} />;
      case "navigation":
        return <Navigation className={iconClass} />;
      case "search":
        return <Search className={iconClass} />;
      case "click":
        return <MousePointer className={iconClass} />;
      case "type":
        return <Activity className={iconClass} />;
      case "extract":
        return <Database className={iconClass} />;
      case "error":
        return <AlertCircle className={iconClass} />;
      default:
        return <Activity className={iconClass} />;
    }
  };

  if (activities.length === 0) return null;

  return (
    <div className="w-full space-y-2">
      {activities.map((activity) => (
        <div
          key={activity.id}
          className={cn(
            "flex items-start gap-3 p-2.5 rounded-xl border transition-colors",
            activity.status === "error" ? "bg-red-500/5 border-red-500/10" :
              activity.status === "completed" ? "bg-green-500/5 border-green-500/10" :
                "bg-background/50 border-border/50"
          )}
        >
          <div className={cn(
            "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border",
            activity.status === "error" ? "bg-red-500/10 text-red-500 border-red-500/10" :
              activity.status === "completed" ? "bg-green-500/10 text-green-500 border-green-500/10" :
                "bg-muted text-primary border-border"
          )}>
            {getActivityIcon(activity.type)}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium leading-snug">
              {activity.message}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground font-semibold">
                {formatTimestamp(activity.timestamp)}
              </span>
              {activity.status === "in-progress" && (
                <Loader2 className="w-2.5 h-2.5 animate-spin text-primary" />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

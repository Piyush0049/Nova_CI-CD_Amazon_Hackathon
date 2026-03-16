'use client';

import { Card } from "./Card";
import { FaGithub, FaRocket, FaCheckCircle, FaTimesCircle, FaClock } from "react-icons/fa";
import { cn } from "@/lib/utils";

interface Activity {
  id: string;
  type: 'created' | 'deployed' | 'success' | 'failed';
  title: string;
  description: string;
  timestamp: Date;
}

interface ActivityFeedProps {
  activities: Activity[];
  maxItems?: number;
}

export default function ActivityFeed({ activities, maxItems = 5 }: ActivityFeedProps) {
  const displayActivities = activities.slice(0, maxItems);

  const getActivityIcon = (type: Activity['type']) => {
    switch (type) {
      case 'created':
        return <FaGithub className="w-4 h-4 text-cyan-500" />;
      case 'deployed':
        return <FaRocket className="w-4 h-4 text-blue-500" />;
      case 'success':
        return <FaCheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <FaTimesCircle className="w-4 h-4 text-red-500" />;
      default:
        return <FaClock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <Card className="p-6 animate-fade-in-up">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Recent Activity</h3>
        <span className="text-xs text-muted-foreground">
          {activities.length} total
        </span>
      </div>

      <div className="space-y-4">
        {displayActivities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <FaClock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No recent activity</p>
          </div>
        ) : (
          displayActivities.map((activity, index) => (
            <div
              key={activity.id}
              className={cn(
                "flex items-start gap-4 pb-4",
                index !== displayActivities.length - 1 && "border-b border-border/50"
              )}
            >
              <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium mb-0.5">{activity.title}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {activity.description}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {getTimeAgo(activity.timestamp)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {activities.length > maxItems && (
        <button className="w-full mt-4 text-sm text-cyan-500 hover:text-cyan-400 font-medium transition-colors">
          View all activity
        </button>
      )}
    </Card>
  );
}

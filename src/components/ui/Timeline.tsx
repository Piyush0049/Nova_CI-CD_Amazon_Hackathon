'use client';

import { ReactNode } from 'react';
import { Card } from './Card';
import { cn } from '@/lib/utils';

interface TimelineItem {
  id: string;
  title: string;
  description: string;
  timestamp: Date;
  icon: ReactNode;
  status?: 'success' | 'error' | 'pending' | 'info';
}

interface TimelineProps {
  items: TimelineItem[];
  title?: string;
  maxItems?: number;
}

export default function Timeline({ items, title, maxItems = 10 }: TimelineProps) {
  const displayItems = items.slice(0, maxItems);

  const getStatusColor = (status?: TimelineItem['status']) => {
    switch (status) {
      case 'success':
        return 'border-green-500 bg-green-500/10';
      case 'error':
        return 'border-red-500 bg-red-500/10';
      case 'pending':
        return 'border-orange-500 bg-orange-500/10';
      case 'info':
      default:
        return 'border-cyan-500 bg-cyan-500/10';
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
      {title && (
        <h3 className="text-lg font-semibold mb-6">{title}</h3>
      )}

      <div className="relative">
        {/* Timeline Line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />

        <div className="space-y-6">
          {displayItems.map((item, index) => (
            <div key={item.id} className="relative flex items-start gap-4">
              {/* Timeline Icon */}
              <div
                className={cn(
                  'w-12 h-12 rounded-xl border-2 flex items-center justify-center flex-shrink-0 relative z-10 transition-all duration-300',
                  getStatusColor(item.status)
                )}
              >
                {item.icon}
              </div>

              {/* Content */}
              <div className="flex-1 pt-1">
                <div className="flex items-start justify-between gap-4 mb-1">
                  <h4 className="font-semibold text-sm">{item.title}</h4>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {getTimeAgo(item.timestamp)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {items.length > maxItems && (
        <button className="w-full mt-6 text-sm text-cyan-500 hover:text-cyan-400 font-medium transition-colors">
          View all {items.length} events
        </button>
      )}
    </Card>
  );
}

'use client';

import ChartCard from './ui/ChartCard';
import { TrendingUp } from 'lucide-react';

export default function PerformanceChart() {
  // Mock data for visualization
  const deployments = [45, 52, 48, 65, 58, 72, 68];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const maxValue = Math.max(...deployments);

  return (
    <ChartCard
      title="Deployment Activity"
      subtitle="Last 7 days"
      value={deployments[deployments.length - 1]}
      change={{ value: 12.5, isPositive: true }}
      icon={<TrendingUp className="w-5 h-5" />}
    >
      <div className="flex items-end justify-between gap-2 h-40">
        {deployments.map((value, index) => {
          const height = (value / maxValue) * 100;
          return (
            <div key={index} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex items-end justify-center h-32">
                <div
                  className="w-full bg-gradient-to-t from-cyan-500 to-blue-500 rounded-t-lg transition-all duration-500 hover:scale-105 cursor-pointer relative group"
                  style={{ height: `${height}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-t-lg" />
                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-card border border-border px-2 py-1 rounded text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg">
                    {value} deploys
                  </div>
                </div>
              </div>
              <span className="text-xs text-muted-foreground font-medium">{days[index]}</span>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

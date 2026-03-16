import { ReactNode } from 'react';
import { Card } from './Card';
import { cn } from '@/lib/utils';
import ProgressBar from './ProgressBar';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  progress?: {
    value: number;
    max: number;
    label?: string;
  };
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: string;
  className?: string;
}

export default function MetricCard({
  title,
  value,
  subtitle,
  icon,
  progress,
  trend,
  color = 'from-cyan-500 to-blue-500',
  className,
}: MetricCardProps) {
  return (
    <Card className={cn('p-5 hover:scale-[1.02] transition-all duration-300 animate-fade-in-up', className)}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-bold">{value}</h3>
            {trend && (
              <span
                className={cn(
                  'text-xs font-semibold',
                  trend.isPositive ? 'text-green-500' : 'text-red-500'
                )}
              >
                {trend.isPositive ? '+' : ''}
                {trend.value}%
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        <div className={cn('w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-lg', color)}>
          <div className="text-white">{icon}</div>
        </div>
      </div>

      {progress && (
        <ProgressBar
          value={progress.value}
          max={progress.max}
          label={progress.label}
          showPercentage={false}
          variant="gradient"
          size="sm"
        />
      )}
    </Card>
  );
}

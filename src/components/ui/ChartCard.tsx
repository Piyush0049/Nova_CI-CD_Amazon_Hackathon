import { ReactNode } from 'react';
import { Card } from './Card';
import { cn } from '@/lib/utils';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  value?: string | number;
  change?: {
    value: number;
    isPositive: boolean;
  };
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function ChartCard({
  title,
  subtitle,
  value,
  change,
  icon,
  children,
  className,
}: ChartCardProps) {
  return (
    <Card className={cn('p-6 animate-fade-in-up', className)}>
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            {icon && (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white shadow-lg">
                {icon}
              </div>
            )}
            <div>
              <h3 className="text-lg font-semibold">{title}</h3>
              {subtitle && (
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
        {value && (
          <div className="text-right">
            <div className="text-2xl font-bold">{value}</div>
            {change && (
              <div
                className={cn(
                  'text-xs font-semibold',
                  change.isPositive ? 'text-green-500' : 'text-red-500'
                )}
              >
                {change.isPositive ? '↑' : '↓'} {Math.abs(change.value)}%
              </div>
            )}
          </div>
        )}
      </div>
      <div className="w-full">{children}</div>
    </Card>
  );
}

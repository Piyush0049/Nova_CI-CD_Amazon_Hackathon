import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "error" | "warning" | "info" | "cyan" | "purple";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function Badge({
  children,
  variant = "default",
  size = "md",
  className,
}: BadgeProps) {
  const variants = {
    default: "bg-muted text-muted-foreground",
    success: "bg-green-500/10 text-green-500 border border-green-500/20",
    error: "bg-red-500/10 text-red-500 border border-red-500/20",
    warning: "bg-orange-500/10 text-orange-500 border border-orange-500/20",
    info: "bg-blue-500/10 text-blue-500 border border-blue-500/20",
    cyan: "bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-500 border border-cyan-500/20",
    purple: "bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-500 border border-purple-500/20",
  };

  const sizes = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-3 py-1 text-sm",
    lg: "px-4 py-1.5 text-base",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold transition-all duration-300",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}

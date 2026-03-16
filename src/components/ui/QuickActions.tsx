import { Card } from "./Card";
import Button from "./Button";
import { FaPlus, FaGithub, FaRocket, FaCog } from "react-icons/fa";

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "primary" | "secondary";
}

interface QuickActionsProps {
  actions: QuickAction[];
}

export default function QuickActions({ actions }: QuickActionsProps) {
  return (
    <Card className="p-6 animate-fade-in-up">
      <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
      <div className="grid grid-cols-1 gap-3">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={action.onClick}
            className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 hover:bg-cyan-500/10 border border-border/50 hover:border-cyan-500/50 transition-all duration-300 group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white shadow-lg group-hover:shadow-cyan-500/50 transition-all duration-300">
              {action.icon}
            </div>
            <span className="text-sm font-semibold flex-1 text-left">
              {action.label}
            </span>
            <svg
              className="w-4 h-4 text-muted-foreground group-hover:text-cyan-500 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        ))}
      </div>
    </Card>
  );
}

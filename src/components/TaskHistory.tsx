"use client";

import { useState } from "react";
import { TaskHistoryItem } from "@/types";
import {
  History,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";
import Button from "./ui/Button";
import { formatTimestamp, cn } from "@/lib/utils";

interface TaskHistoryProps {
  history: TaskHistoryItem[];
  onReplay: (command: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export default function TaskHistory({
  history,
  onReplay,
  onRemove,
  onClear,
}: TaskHistoryProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const getStatusIcon = (status: TaskHistoryItem["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "Unknown";
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (history.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="w-5 h-5" />
            Task History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <History className="w-12 h-12 mb-2 opacity-20" />
            <p className="text-sm">No tasks yet</p>
            <p className="text-xs mt-1">Your completed tasks will appear here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="w-5 h-5" />
            Task History
            <span className="text-sm font-normal text-muted-foreground">
              ({history.length})
            </span>
          </CardTitle>
          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto space-y-2 pr-2 scrollbar-thin">
          {history.map((task) => (
            <div
              key={task.id}
              className="border rounded-lg p-3 hover:bg-accent/5 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusIcon(task.status)}
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(task.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm font-medium truncate" title={task.command}>
                    {task.command}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>{task.resultsCount} results</span>
                    {task.duration && <span>{formatDuration(task.duration)}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onReplay(task.command)}
                    title="Replay task"
                    className="h-8 w-8"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setExpanded(expanded === task.id ? null : task.id)
                    }
                    title="Show details"
                    className="h-8 w-8"
                  >
                    {expanded === task.id ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(task.id)}
                    title="Remove"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {expanded === task.id && task.results && task.results.length > 0 && (
                <div className="mt-3 pt-3 border-t space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    Results ({task.results.length})
                  </p>
                  {task.results.map((result, idx) => (
                    <div key={result.id} className="text-xs p-2 rounded bg-muted/30">
                      <p className="font-medium">{result.title}</p>
                      {Array.isArray(result.content) && (
                        <p className="text-muted-foreground mt-1">
                          {result.content.length} items
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

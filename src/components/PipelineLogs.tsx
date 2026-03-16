'use client';

import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/Card';

interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
}

interface PipelineLogsProps {
  pipelineId: string;
  jobId?: string;
}

export default function PipelineLogs({ pipelineId, jobId }: PipelineLogsProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Connect to log stream (SSE or WebSocket)
    const eventSource = new EventSource(`/api/pipelines/${pipelineId}/logs`);

    eventSource.onmessage = (event) => {
      const logEntry: LogEntry = JSON.parse(event.data);
      setLogs((prevLogs) => [...prevLogs, logEntry]);
    };

    return () => {
      eventSource.close();
    };
  }, [pipelineId, jobId]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const getLevelColor = (level: string) => {
    const colors = {
      info: 'text-blue-600 dark:text-blue-400',
      warning: 'text-yellow-600 dark:text-yellow-400',
      error: 'text-red-600 dark:text-red-400',
      debug: 'text-gray-600 dark:text-gray-400',
    };
    return colors[level as keyof typeof colors] || colors.info;
  };

  const downloadLogs = () => {
    const content = logs
      .map(log => `[${log.timestamp.toISOString()}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline-${pipelineId}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="flex flex-col h-full" data-testid="pipeline-logs">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Pipeline Logs</h3>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
          <button
            onClick={downloadLogs}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Download Logs
          </button>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm bg-gray-50 dark:bg-gray-900 scrollbar-thin">
        {logs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No logs yet. Waiting for pipeline execution...
          </div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, index) => (
              <div key={index} className="flex gap-2">
                <span className="text-gray-500">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <span className={getLevelColor(log.level)}>
                  [{log.level.toUpperCase()}]
                </span>
                <span className="flex-1">{log.message}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </Card>
  );
}

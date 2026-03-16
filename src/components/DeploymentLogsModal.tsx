'use client';

import { useState, useEffect, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';
import Button from './ui/Button';

interface LogEntry {
  stage: string;
  message: string;
  timestamp: Date;
  level: 'info' | 'success' | 'error' | 'warning';
}

interface DeploymentLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineName: string;
  deploymentId?: string; // MongoDB deployment ID for real-time logs
  instanceId?: string;
  trackingId?: string; // Tracking ID for logs before deployment completes
  publicIp?: string;
  pipelineStages?: string[]; // Not used in UI but kept for backward compatibility
  useRealLogs?: boolean; // Toggle between real and simulated logs
  appPort?: string;
  accessUrl?: string;
}

export default function DeploymentLogsModal({
  isOpen,
  onClose,
  pipelineName,
  deploymentId,
  instanceId,
  trackingId,
  publicIp,
  pipelineStages,
  useRealLogs = false,
  appPort,
  accessUrl,
}: DeploymentLogsModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [deploymentStatus, setDeploymentStatus] = useState<'deploying' | 'success' | 'failed'>('deploying');
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Real-time log streaming via Server-Sent Events
  useEffect(() => {
    if (!isOpen || !useRealLogs) return;
    if (!deploymentId && !instanceId && !trackingId) return; // Need at least one ID

    const logId = deploymentId || trackingId || instanceId;
    const logParam = deploymentId
      ? `deploymentId=${deploymentId}`
      : trackingId
      ? `trackingId=${trackingId}`
      : `instanceId=${instanceId}`;

    console.log('[LOGS-MODAL] Connecting to real-time log stream:', logId);

    // Connect to SSE endpoint
    const eventSource = new EventSource(`/api/deploy/logs?${logParam}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'connected') {
          console.log('[LOGS-MODAL] Connected to log stream');
          setLogs((prev) => [
            ...prev,
            {
              stage: 'setup',
              message: '🔌 Connected to deployment log stream',
              timestamp: new Date(),
              level: 'info',
            },
          ]);
        } else if (data.type === 'log') {
          // Add log entry
          setLogs((prev) => [
            ...prev,
            {
              stage: data.stage,
              message: data.message,
              timestamp: new Date(data.timestamp),
              level: data.level,
            },
          ]);
        } else if (data.type === 'status') {
          console.log('[LOGS-MODAL] Status update:', data.status);
          setDeploymentStatus(data.status);
        } else if (data.type === 'complete') {
          console.log('[LOGS-MODAL] Deployment complete:', data.status);

          setDeploymentStatus(data.status);
          setIsComplete(true);

          // Add completion log
          setLogs((prev) => [
            ...prev,
            {
              stage: 'complete',
              message: data.status === 'success'
                ? `✅ ${data.message}`
                : `❌ ${data.message}`,
              timestamp: new Date(data.timestamp),
              level: data.status === 'success' ? 'success' : 'error',
            },
          ]);

          // Show deployment info
          if (data.publicIp) {
            const deployUrl = data.accessUrl || (data.appPort ? `http://${data.publicIp}:${data.appPort}` : `http://${data.publicIp}`);
            setLogs((prev) => [
              ...prev,
              {
                stage: 'complete',
                message: `🌐 Deployment URL: ${deployUrl}`,
                timestamp: new Date(),
                level: 'success',
              },
            ]);
          }

          // Close connection
          eventSource.close();
        } else if (data.type === 'error') {
          console.error('[LOGS-MODAL] Error:', data.message);
          setDeploymentStatus('failed');
          setLogs((prev) => [
            ...prev,
            {
              stage: 'error',
              message: `❌ ${data.message}`,
              timestamp: new Date(data.timestamp),
              level: 'error',
            },
          ]);
        } else if (data.type === 'timeout') {
          console.log('[LOGS-MODAL] Stream timeout');
          setLogs((prev) => [
            ...prev,
            {
              stage: 'error',
              message: '⏱️ Log stream timed out',
              timestamp: new Date(),
              level: 'warning',
            },
          ]);
          eventSource.close();
        }
      } catch (error) {
        console.error('[LOGS-MODAL] Error parsing log event:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[LOGS-MODAL] SSE error:', error);
      setDeploymentStatus('failed');
      setLogs((prev) => [
        ...prev,
        {
          stage: 'error',
          message: '❌ Lost connection to deployment server',
          timestamp: new Date(),
          level: 'error',
        },
      ]);
      eventSource.close();
    };

    // Cleanup on unmount
    return () => {
      console.log('[LOGS-MODAL] Closing log stream');
      eventSource.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, useRealLogs, deploymentId, instanceId, trackingId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setLogs([]);
      setIsComplete(false);
      setDeploymentStatus('deploying');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b border-border ${isComplete && deploymentStatus === 'success' ? 'bg-green-500/10' : isComplete && deploymentStatus === 'failed' ? 'bg-red-500/10' : 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10'}`}>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              {!isComplete && (
                <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse"></div>
              )}
              <h2 className={`text-2xl font-bold ${isComplete && deploymentStatus === 'success' ? 'text-green-500' : isComplete && deploymentStatus === 'failed' ? 'text-red-500' : 'text-foreground'}`}>
                {isComplete && deploymentStatus === 'success' ? '✓ Deployment Complete!' : isComplete && deploymentStatus === 'failed' ? '✗ Deployment Failed' : 'Deployment Logs'}
              </h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Pipeline: <span className="font-mono text-cyan-500">{pipelineName}</span>
              {!isComplete && logs.length > 0 && (
                <span className="ml-3 text-xs bg-cyan-500/20 text-cyan-500 px-2 py-0.5 rounded-full">
                  {logs.length} log entries
                </span>
              )}
            </p>
            {isComplete && publicIp && deploymentStatus === 'success' && (
              <p className="text-sm font-semibold text-green-500 mt-2">
                🌐 Application deployed at {accessUrl || (appPort ? `http://${publicIp}:${appPort}` : `http://${publicIp}`)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors flex-shrink-0 ml-4"
            title="Close"
          >
            <FaTimes className="w-5 h-5" />
          </button>
        </div>

        {/* Logs - Terminal-style flat list */}
        <div className="flex-1 overflow-y-auto bg-black/90 p-4 font-mono text-sm">
          <div className="space-y-1">
            {logs.length === 0 ? (
              <div className="text-cyan-500 animate-pulse">
                ⚡ Connecting to deployment stream...
              </div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className={`py-1 ${
                    log.level === 'error'
                      ? 'text-red-400'
                      : log.level === 'success'
                      ? 'text-green-400'
                      : log.level === 'warning'
                      ? 'text-yellow-400'
                      : 'text-gray-300'
                  }`}
                >
                  <span className="text-gray-500 text-xs">
                    [{log.timestamp.toLocaleTimeString()}]
                  </span>{' '}
                  {log.message}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-6 bg-muted/10 border-t border-border">
          {isComplete ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                {deploymentStatus === 'success' && publicIp && (
                  <p className="text-sm text-muted-foreground">
                    Access URL: <span className="font-mono text-cyan-500">{accessUrl || (appPort ? `http://${publicIp}:${appPort}` : `http://${publicIp}`)}</span>
                  </p>
                )}
                {deploymentStatus === 'failed' && (
                  <p className="text-sm text-red-400">
                    Deployment failed. Check logs above for details.
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onClose}
                >
                  Close
                </Button>
                {deploymentStatus === 'success' && publicIp && (
                  <a
                    href={accessUrl || (appPort ? `http://${publicIp}:${appPort}` : `http://${publicIp}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      type="button"
                      variant="primary"
                    >
                      Open Application
                    </Button>
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <span>Deployment in progress... logs streaming in real-time</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

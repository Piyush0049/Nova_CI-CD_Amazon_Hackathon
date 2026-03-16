import { useEffect, useRef } from 'react';

interface MonitorOptions {
  instanceId: string;
  deploymentId?: string;
  repoName: string;
  onAutoFixTriggered?: (result: any) => void;
  onError?: (error: string) => void;
}

/**
 * Hook to monitor deployment and trigger auto-fix automatically
 */
export function useDeploymentMonitor(enabled: boolean, options: MonitorOptions) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const attemptCountRef = useRef(0);
  const maxAttempts = 60; // Monitor for 10 minutes (60 * 10 seconds)

  useEffect(() => {
    if (!enabled || !options.instanceId) {
      return;
    }

    console.log('[DEPLOYMENT MONITOR] Starting monitoring for instance:', options.instanceId);

    // Monitor every 10 seconds
    intervalRef.current = setInterval(async () => {
      attemptCountRef.current++;

      if (attemptCountRef.current > maxAttempts) {
        console.log('[DEPLOYMENT MONITOR] Max attempts reached, stopping monitoring');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        return;
      }

      try {
        const response = await fetch('/api/deploy/monitor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instanceId: options.instanceId,
            deploymentId: options.deploymentId,
            repoName: options.repoName,
          }),
        });

        if (!response.ok) {
          console.error('[DEPLOYMENT MONITOR] Monitoring request failed');
          return;
        }

        const result = await response.json();

        if (result.status === 'fixed') {
          console.log('[DEPLOYMENT MONITOR] Auto-fix successful!', result);
          options.onAutoFixTriggered?.(result);

          // Stop monitoring after successful fix
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
        } else if (result.status === 'failed') {
          console.error('[DEPLOYMENT MONITOR] Auto-fix failed:', result);
          options.onError?.(result.message || 'Auto-fix failed');

          // Stop monitoring after failure
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
        } else {
          // Still running, continue monitoring
          console.log('[DEPLOYMENT MONITOR] Deployment running, attempt', attemptCountRef.current);
        }
      } catch (error: any) {
        console.error('[DEPLOYMENT MONITOR] Error during monitoring:', error);
      }
    }, 10000); // Every 10 seconds

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, options.instanceId, options.deploymentId, options.repoName]);

  return {
    isMonitoring: !!intervalRef.current,
    attemptCount: attemptCountRef.current,
  };
}

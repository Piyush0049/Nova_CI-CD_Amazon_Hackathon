'use client';

import { useState } from 'react';
import Button from './ui/Button';
import { FaMagic, FaSpinner } from 'react-icons/fa';

interface AutoFixButtonProps {
  instanceId: string;
  repoName: string;
  deploymentId?: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export default function AutoFixButton({
  instanceId,
  repoName,
  deploymentId,
  onSuccess,
  onError,
}: AutoFixButtonProps) {
  const [isFixing, setIsFixing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    commands?: string[];
  } | null>(null);

  const handleAutoFix = async () => {
    setIsFixing(true);
    setResult(null);

    try {
      console.log('[AUTO-FIX] Triggering auto-fix for instance:', instanceId);

      // First, get the logs to detect the error
      const monitorResponse = await fetch('/api/deploy/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId,
          deploymentId,
          repoName,
        }),
      });

      if (!monitorResponse.ok) {
        throw new Error('Failed to monitor deployment');
      }

      const monitorResult = await monitorResponse.json();

      if (monitorResult.status === 'running') {
        setResult({
          success: false,
          message: 'No errors detected. Deployment is still running.',
        });
        return;
      }

      if (monitorResult.status === 'fixed') {
        setResult({
          success: true,
          message: monitorResult.message || 'Auto-fix completed successfully!',
          commands: monitorResult.fixCommands,
        });
        onSuccess?.();
      } else {
        setResult({
          success: false,
          message: monitorResult.message || 'Auto-fix failed',
        });
        onError?.(monitorResult.message);
      }
    } catch (error: any) {
      console.error('[AUTO-FIX] Error:', error);
      setResult({
        success: false,
        message: error.message || 'Failed to trigger auto-fix',
      });
      onError?.(error.message);
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="primary"
        onClick={handleAutoFix}
        disabled={isFixing}
        className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
      >
        {isFixing ? (
          <>
            <FaSpinner className="w-4 h-4 animate-spin" />
            Running NerveFlow Auto-Fix...
          </>
        ) : (
          <>
            <FaMagic className="w-4 h-4" />
             Auto-Fix with Claude 4.6 Sonnet
          </>
        )}
      </Button>

      {result && (
        <div
          className={`p-4 rounded-lg border ${
            result.success
              ? 'bg-green-500/10 border-green-500/20 text-green-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}
        >
          <p className="font-semibold mb-2">
            {result.success ? '✓ Success!' : '✗ Failed'}
          </p>
          <p className="text-sm">{result.message}</p>
          {result.commands && result.commands.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold mb-1">Commands Executed:</p>
              <div className="bg-black/30 p-2 rounded font-mono text-xs">
                {result.commands.map((cmd, i) => (
                  <div key={i}>{cmd}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

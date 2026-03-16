'use client';

import { useEffect, useState } from 'react';

interface LockStatus {
  locked: boolean;
  repoFullName?: string;
  startedAt?: string;
  duration?: number;
  durationFormatted?: string;
  message?: string;
}

export default function DeploymentLockStatus() {
  const [lockStatus, setLockStatus] = useState<LockStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkLockStatus();
    const interval = setInterval(checkLockStatus, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const checkLockStatus = async () => {
    try {
      const response = await fetch('/api/deploy/lock');
      const data = await response.json();
      setLockStatus(data);
    } catch (error) {
      console.error('Failed to check lock status:', error);
    } finally {
      setLoading(false);
    }
  };

  const forceClearLock = async () => {
    if (!confirm('Are you sure you want to force clear the deployment lock? This should only be done if a deployment has crashed.')) {
      return;
    }

    try {
      const response = await fetch('/api/deploy/lock', { method: 'DELETE' });
      const data = await response.json();

      if (data.success) {
        alert('Lock cleared successfully');
        checkLockStatus();
      } else {
        alert('Failed to clear lock: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Failed to clear lock: ' + error);
    }
  };

  if (loading) {
    return null;
  }

  if (!lockStatus?.locked) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg shadow-lg max-w-md z-50">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-yellow-400 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-yellow-800">
            Deployment in Progress
          </h3>
          <div className="mt-2 text-sm text-yellow-700">
            <p>
              <strong>{lockStatus.repoFullName}</strong> is currently being deployed
            </p>
            <p className="mt-1">
              Duration: <span className="font-mono">{lockStatus.durationFormatted}</span>
            </p>
            <p className="mt-2 text-xs">
              Please wait for the current deployment to complete before starting a new one.
            </p>
          </div>
          <div className="mt-3">
            <button
              onClick={forceClearLock}
              className="text-xs text-yellow-800 underline hover:text-yellow-900"
            >
              Force clear lock (admin only)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

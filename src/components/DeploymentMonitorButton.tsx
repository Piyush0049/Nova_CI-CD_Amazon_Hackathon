'use client';

import { useState } from 'react';
import DeploymentLogViewer from './DeploymentLogViewer';

interface Props {
  instanceId: string;
  deploymentId?: string;
  status: 'deploying' | 'success' | 'failed';
  publicIp?: string;
  onDeleted?: () => void;
}

export default function DeploymentMonitorButton({ instanceId, deploymentId, status, publicIp, onDeleted }: Props) {
  const [showLogs, setShowLogs] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowLogs(true)}
        className={`inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          status === 'deploying'
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            : status === 'success'
            ? 'bg-green-100 text-green-700 hover:bg-green-200'
            : 'bg-red-100 text-red-700 hover:bg-red-200'
        }`}
      >
        {status === 'deploying' && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        View Deployment Details
      </button>

      {showLogs && (
        <DeploymentLogViewer
          instanceId={instanceId}
          deploymentId={deploymentId}
          onClose={() => setShowLogs(false)}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}

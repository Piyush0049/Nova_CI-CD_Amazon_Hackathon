'use client';

import { useEffect, useState } from 'react';
import DeploymentSuggestions from './DeploymentSuggestions';

interface DeploymentLog {
  instanceId: string;
  status: 'deploying' | 'success' | 'failed';
  publicIp?: string;
  repoFullName: string;
  deployedAt: string;
  deploymentId?: string;
  detectedIssues: {
    suggestions: string[];
    warnings: string[];
    errors: string[];
    fixes: Array<{
      title: string;
      description: string;
      code: string;
      file: string;
    }>;
  };
  currentStage: string;
  rawLogs?: string;
  cleanLogs?: string[];
}

interface Props {
  instanceId: string;
  deploymentId?: string;
  onClose?: () => void;
  onDeleted?: () => void;
}

export default function DeploymentLogViewer({ instanceId, deploymentId, onClose, onDeleted }: Props) {
  const [logs, setLogs] = useState<DeploymentLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'logs' | 'suggestions' | 'fixes'>('logs'); // Default to logs tab
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    fetchLogs();

    if (autoRefresh) {
      const interval = setInterval(fetchLogs, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [instanceId, autoRefresh]);

  const fetchLogs = async () => {
    try {
      const response = await fetch(`/api/deploy/logs/${instanceId}`);
      const data = await response.json();

      if (response.ok) {
        setLogs(data);
        setError(null);

        // Stop auto-refresh if deployment is complete
        if (data.status === 'success' || data.status === 'failed') {
          setAutoRefresh(false);
        }
      } else {
        setError(data.error || 'Failed to fetch logs');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const handleDelete = async () => {
    if (!deploymentId && !logs?.deploymentId) {
      alert('Cannot delete: Deployment ID not found');
      return;
    }

    const idToDelete = deploymentId || logs?.deploymentId;

    setDeleting(true);

    try {
      const response = await fetch(`/api/deployments/${idToDelete}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok) {
        alert(`✅ Deployment deleted successfully!\n\nInstance ${data.instanceId} has been terminated.`);
        setShowDeleteConfirm(false);

        // Call onDeleted callback if provided
        if (onDeleted) {
          onDeleted();
        }

        // Close the viewer
        if (onClose) {
          onClose();
        }
      } else {
        alert(`❌ Failed to delete deployment:\n${data.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      alert(`❌ Error deleting deployment:\n${error.message || 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !logs) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          </div>
          <p className="text-center mt-4 text-gray-700">Loading deployment logs...</p>
        </div>
      </div>
    );
  }

  if (error && !logs) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <div className="text-red-500 text-center">
            <svg className="h-12 w-12 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold mb-2">Error Loading Logs</h3>
            <p className="text-sm text-gray-600">{error}</p>
          </div>
          <button
            onClick={onClose}
            className="mt-6 w-full bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!logs) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto scrollbar-thin">
      <div className="bg-white rounded-lg shadow-2xl max-w-6xl w-full my-8">
        {/* Header */}
        <div className="border-b border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Deployment Monitor</h2>
              <p className="text-sm text-gray-600 mt-1">{logs.repoFullName}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Status Badge */}
          <div className="mt-4 flex items-center space-x-4">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                logs.status === 'success'
                  ? 'bg-green-100 text-green-800'
                  : logs.status === 'failed'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {logs.status === 'deploying' && (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {logs.status === 'success' && '✅ '}
              {logs.status === 'failed' && '❌ '}
              {logs.status.toUpperCase()}
            </span>

            {logs.publicIp && (
              <span className="text-sm text-gray-600">
                <strong>Public IP:</strong>{' '}
                <a
                  href={`http://${logs.publicIp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline font-mono"
                >
                  {logs.publicIp}
                </a>
              </span>
            )}

            <span className="text-sm text-gray-600">
              <strong>Instance:</strong> <span className="font-mono">{logs.instanceId}</span>
            </span>
          </div>

          {/* Current Stage */}
          <div className="mt-4 bg-blue-50 border-l-4 border-blue-500 p-4">
            <p className="text-sm text-blue-800">
              <strong>Current Stage:</strong> {logs.currentStage}
            </p>
            {logs.status === 'deploying' && (
              <div className="mt-2 w-full bg-blue-200 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setSelectedTab('logs')}
              className={`px-6 py-3 text-sm font-medium ${
                selectedTab === 'logs'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              📋 Deployment Logs
              {logs.status === 'deploying' && (
                <span className="ml-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full animate-pulse">
                  LIVE
                </span>
              )}
            </button>
            <button
              onClick={() => setSelectedTab('overview')}
              className={`px-6 py-3 text-sm font-medium ${
                selectedTab === 'overview'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setSelectedTab('suggestions')}
              className={`px-6 py-3 text-sm font-medium ${
                selectedTab === 'suggestions'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              Suggestions
              {logs.detectedIssues.suggestions.length > 0 && (
                <span className="ml-2 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                  {logs.detectedIssues.suggestions.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setSelectedTab('fixes')}
              className={`px-6 py-3 text-sm font-medium ${
                selectedTab === 'fixes'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              🔧 How to Fix
              {logs.status === 'failed' && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full animate-pulse">
                  AI
                </span>
              )}
              {logs.detectedIssues.fixes.length > 0 && (
                <span className="ml-2 bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full">
                  {logs.detectedIssues.fixes.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {/* Logs Tab */}
          {selectedTab === 'logs' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-lg p-6 text-white">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center">
                    <span className="mr-2">📋</span>
                    Real-Time Deployment Logs
                  </h3>
                  {logs.status === 'deploying' && (
                    <span className="flex items-center text-sm text-green-400">
                      <span className="animate-pulse mr-2">●</span>
                      Live Updates (refreshes every 5s)
                    </span>
                  )}
                </div>

                {logs.cleanLogs && logs.cleanLogs.length > 0 ? (
                  <div className="bg-black rounded-lg p-4 font-mono text-sm overflow-x-auto max-h-[500px] overflow-y-auto scrollbar-thin">
                    {logs.cleanLogs.map((log, idx) => (
                      <div
                        key={idx}
                        className={`mb-1 ${
                          log.includes('✅') || log.includes('Success')
                            ? 'text-green-400'
                            : log.includes('❌') || log.includes('ERROR') || log.includes('Failed')
                            ? 'text-red-400'
                            : log.includes('⚠️') || log.includes('WARNING')
                            ? 'text-yellow-400'
                            : log.includes('[SMART-DEPLOY]') || log.includes('[PROJECT-DETECTOR]')
                            ? 'text-blue-400'
                            : log.includes('[PRE-FLIGHT]')
                            ? 'text-purple-400'
                            : log.includes('[INSTALL]')
                            ? 'text-cyan-400'
                            : log.includes('[BUILD]')
                            ? 'text-orange-400'
                            : log.includes('[START]')
                            ? 'text-green-300'
                            : log.includes('[STAGE')
                            ? 'text-indigo-400 font-bold'
                            : 'text-gray-300'
                        }`}
                      >
                        {log}
                      </div>
                    ))}
                    {logs.status === 'deploying' && (
                      <div className="text-blue-400 animate-pulse mt-4">
                        ▶ Deployment in progress...
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-black rounded-lg p-8 text-center">
                    {logs.status === 'deploying' ? (
                      <div>
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                        <p className="text-gray-400">Waiting for deployment logs...</p>
                        <p className="text-sm text-gray-500 mt-2">Logs will appear shortly</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-gray-400">No deployment logs available</p>
                        <p className="text-sm text-gray-500 mt-2">
                          {logs.status === 'success'
                            ? 'Deployment completed successfully'
                            : 'Check the Overview tab for details'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Log Controls */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center space-x-4 text-sm">
                    <span className="text-gray-400">
                      Total log entries: {logs.cleanLogs?.length || 0}
                    </span>
                    <span className="text-gray-400">
                      Status: {logs.currentStage}
                    </span>
                  </div>
                  {logs.cleanLogs && logs.cleanLogs.length > 0 && (
                    <button
                      onClick={() => copyToClipboard(logs.cleanLogs!.join('\n'))}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                    >
                      📋 Copy Logs
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Status Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-blue-800 mb-1">Repository</div>
                  <div className="text-xs text-blue-600">{logs.repoFullName}</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="text-sm font-medium text-purple-800 mb-1">Instance</div>
                  <div className="text-xs text-purple-600 font-mono">{logs.instanceId}</div>
                </div>
                <div className={`border rounded-lg p-4 ${
                  logs.status === 'success'
                    ? 'bg-green-50 border-green-200'
                    : logs.status === 'failed'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className={`text-sm font-medium mb-1 ${
                    logs.status === 'success'
                      ? 'text-green-800'
                      : logs.status === 'failed'
                      ? 'text-red-800'
                      : 'text-yellow-800'
                  }`}>Status</div>
                  <div className={`text-xs font-semibold ${
                    logs.status === 'success'
                      ? 'text-green-600'
                      : logs.status === 'failed'
                      ? 'text-red-600'
                      : 'text-yellow-600'
                  }`}>{logs.status.toUpperCase()}</div>
                </div>
              </div>
            </div>
          )}

          {/* Overview Tab */}
          {selectedTab === 'overview' && (
            <div className="space-y-4">
              {/* Errors */}
              {logs.detectedIssues.errors.length > 0 && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                  <div className="flex">
                    <svg className="h-5 w-5 text-red-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">Errors Detected</h3>
                      <ul className="mt-2 text-sm text-red-700 list-disc list-inside space-y-1">
                        {logs.detectedIssues.errors.map((error, idx) => (
                          <li key={idx}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Warnings */}
              {logs.detectedIssues.warnings.length > 0 && (
                <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
                  <div className="flex">
                    <svg className="h-5 w-5 text-yellow-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">Warnings</h3>
                      <ul className="mt-2 text-sm text-yellow-700 list-disc list-inside space-y-1">
                        {logs.detectedIssues.warnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {logs.detectedIssues.suggestions.length > 0 && (
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                  <div className="flex">
                    <svg className="h-5 w-5 text-blue-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">General Information</h3>
                      <ul className="mt-2 text-sm text-blue-700 list-disc list-inside space-y-1">
                        {logs.detectedIssues.suggestions.map((suggestion, idx) => (
                          <li key={idx}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Success Message */}
              {logs.status === 'success' && (
                <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
                  <div className="flex">
                    <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-green-800">Deployment Successful!</h3>
                      <p className="mt-2 text-sm text-green-700">
                        Your application is now live at{' '}
                        <a
                          href={`http://${logs.publicIp}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium underline"
                        >
                          http://{logs.publicIp}
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Suggestions Tab */}
          {selectedTab === 'suggestions' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">💡 AI-Powered Suggestions</h3>

                {logs.detectedIssues.suggestions.length === 0 &&
                 logs.detectedIssues.warnings.length === 0 &&
                 logs.detectedIssues.errors.length === 0 ? (
                  <p className="text-gray-600">No issues detected. Your deployment looks good! ✨</p>
                ) : (
                  <div className="space-y-4">
                    {logs.detectedIssues.errors.map((error, idx) => (
                      <div key={`error-${idx}`} className="bg-white border-l-4 border-red-500 p-4 rounded shadow-sm">
                        <p className="text-sm font-medium text-red-800">🔴 {error}</p>
                      </div>
                    ))}

                    {logs.detectedIssues.warnings.map((warning, idx) => (
                      <div key={`warning-${idx}`} className="bg-white border-l-4 border-yellow-500 p-4 rounded shadow-sm">
                        <p className="text-sm font-medium text-yellow-800">⚠️ {warning}</p>
                      </div>
                    ))}

                    {logs.detectedIssues.suggestions.map((suggestion, idx) => (
                      <div key={`suggestion-${idx}`} className="bg-white border-l-4 border-blue-500 p-4 rounded shadow-sm">
                        <p className="text-sm text-blue-800">ℹ️ {suggestion}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fixes Tab */}
          {selectedTab === 'fixes' && (
            <div className="space-y-6">
              {/* AI-Powered Suggestions for Failed Deployments */}
              {logs.status === 'failed' && (
                <DeploymentSuggestions
                  deploymentId={logs.deploymentId || instanceId}
                  errorMessage={logs.detectedIssues.errors.join('\n') || 'Deployment failed'}
                  deploymentLogs={logs.detectedIssues.suggestions.join('\n') + '\n' + logs.detectedIssues.warnings.join('\n')}
                  repoName={logs.repoFullName}
                  packageJson={undefined}
                />
              )}

              {/* Show legacy fixes if available */}
              {logs.detectedIssues.fixes.length === 0 && logs.status !== 'failed' ? (
                <div className="bg-green-50 p-6 rounded-lg text-center">
                  <svg className="h-16 w-16 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h3 className="text-lg font-semibold text-green-800 mb-2">No Fixes Needed</h3>
                  <p className="text-green-700">Your project configuration looks great! 🎉</p>
                </div>
              ) : logs.detectedIssues.fixes.length > 0 ? (
                <>
                  <div className="bg-gradient-to-r from-yellow-50 to-orange-50 p-6 rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">🔧 How to Fix Your Project</h3>
                    <p className="text-sm text-gray-600">
                      Apply these fixes to your local project before deploying again for a smoother experience.
                    </p>
                  </div>

                  {logs.detectedIssues.fixes.map((fix, idx) => (
                    <div key={idx} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
                        <h4 className="text-md font-semibold text-gray-900">{fix.title}</h4>
                        <p className="text-sm text-gray-600 mt-1">{fix.description}</p>
                        <span className="inline-block mt-2 text-xs font-mono bg-gray-200 text-gray-700 px-2 py-1 rounded">
                          {fix.file}
                        </span>
                      </div>
                      <div className="p-6">
                        <div className="relative">
                          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                            <code>{fix.code}</code>
                          </pre>
                          <button
                            onClick={() => copyToClipboard(fix.code)}
                            className="absolute top-2 right-2 bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                    <p className="text-sm text-blue-800">
                      <strong>💡 Tip:</strong> After applying these fixes locally, commit your changes and redeploy.
                      The deployment system will also attempt to fix these issues automatically.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                <span>Auto-refresh (5s)</span>
              </label>
              {logs.status === 'deploying' && (
                <span className="text-xs text-gray-500">Deployment typically takes 3-5 minutes</span>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={fetchLogs}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm"
              >
                Refresh Now
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={logs.status === 'deploying'}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 text-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
                title={logs.status === 'deploying' ? 'Cannot delete while deploying' : 'Delete deployment and terminate instance'}
              >
                <svg className="w-4 h-4 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
              <button
                onClick={onClose}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <h3 className="text-lg font-bold text-gray-900 text-center mb-2">
                Delete Deployment?
              </h3>
              <p className="text-sm text-gray-600 text-center mb-4">
                This action cannot be undone. This will:
              </p>

              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                <ul className="text-sm text-yellow-800 space-y-2">
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span><strong>Terminate EC2 instance</strong> ({logs.instanceId})</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span><strong>Stop your application</strong> running at {logs.publicIp || 'the public IP'}</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span><strong>Delete deployment record</strong> from database</span>
                  </li>
                </ul>
              </div>

              <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 mb-4">
                <p><strong>Repository:</strong> {logs.repoFullName}</p>
                <p><strong>Deployed:</strong> {new Date(logs.deployedAt).toLocaleString()}</p>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded hover:bg-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
                >
                  {deleting ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline-block" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    'Yes, Delete Deployment'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

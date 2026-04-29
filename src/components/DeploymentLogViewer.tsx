'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import DeploymentSuggestions from './DeploymentSuggestions';
import Button from './ui/Button';
import { FaExternalLinkAlt, FaTimes, FaSync, FaTrash, FaCopy, FaServer, FaGithub, FaCheck, FaExclamationTriangle } from 'react-icons/fa';

interface DeploymentLog {
  instanceId: string;
  status: 'deploying' | 'success' | 'failed';
  publicIp?: string;
  port?: number;
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
  const [selectedTab, setSelectedTab] = useState<'overview' | 'logs' | 'suggestions' | 'fixes'>('logs');
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetchLogs();

    if (autoRefresh) {
      const interval = setInterval(fetchLogs, 5000);
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

        if (onDeleted) {
          onDeleted();
        }

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

  if (!mounted) return null;

  if (loading && !logs) {
    return createPortal(
      <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in">
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-10 max-w-md w-full mx-4 animate-bounce-in">
          <div className="relative w-20 h-20 mb-6 mx-auto">
            <div className="absolute inset-0 border-4 border-cyan-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-cyan-500 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <h3 className="text-xl font-bold text-center mb-2">Loading Details</h3>
          <p className="text-muted-foreground text-center text-sm">
            Connecting to instance and retrieving deployment logs...
          </p>
        </div>
      </div>,
      document.body
    );
  }

  if (error && !logs) {
    return createPortal(
      <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] animate-fade-in">
        <div className="bg-card border border-border rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4">
          <div className="text-red-500 text-center">
            <FaExclamationTriangle className="h-16 w-16 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Error Loading Logs</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="mt-6 w-full"
          >
            Close
          </Button>
        </div>
      </div>,
      document.body
    );
  }

  if (!logs) return null;

  const modalContent = (
    <>
      <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm z-[9998] animate-fade-in" onClick={onClose} />

      <div className="fixed inset-4 md:inset-8 lg:inset-12 z-[9999] flex items-center justify-center animate-fade-in-up">
        <div className="bg-card border border-border rounded-2xl shadow-2xl w-full h-full flex flex-col overflow-hidden">
          {/* Header */}
          <div className="border-b border-border px-6 py-4 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-cyan-500/10">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                  Deployment Monitor
                </h2>
                <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <FaGithub className="text-cyan-500" />
                    <span className="font-mono">{logs.repoFullName}</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-2">
                    <FaServer className="text-blue-500" />
                    <span className="font-mono">{logs.instanceId}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* Status Badge */}
                <span
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border ${
                    logs.status === 'success'
                      ? 'bg-green-500/10 text-green-500 border-green-500/20'
                      : logs.status === 'failed'
                      ? 'bg-red-500/10 text-red-500 border-red-500/20'
                      : 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20'
                  }`}
                >
                  {logs.status === 'deploying' && (
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {logs.status === 'success' && <FaCheck />}
                  {logs.status === 'failed' && <FaExclamationTriangle />}
                  {logs.status.toUpperCase()}
                </span>

                {/* Close Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="rounded-full"
                >
                  <FaTimes className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Current Stage & Public IP */}
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Current Stage:</span>
                <span className="font-mono font-semibold text-cyan-400">{logs.currentStage}</span>
              </div>

              {logs.publicIp && (
                <a
                  href={logs.port && logs.port !== 80 ? `http://${logs.publicIp}:${logs.port}` : `http://${logs.publicIp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  <FaExternalLinkAlt className="w-3 h-3" />
                  <span className="font-mono">{logs.publicIp}{logs.port && logs.port !== 80 ? `:${logs.port}` : ''}</span>
                </a>
              )}
            </div>

            {/* Progress Bar */}
            {logs.status === 'deploying' && (
              <div className="mt-4 w-full bg-cyan-500/20 rounded-full h-2 overflow-hidden">
                <div className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="border-b border-border bg-card/50">
            <div className="flex px-6">
              {[
                { id: 'logs', label: '📋 Logs', badge: logs.status === 'deploying' ? 'LIVE' : null },
                { id: 'overview', label: '📊 Overview', badge: null },
                { id: 'suggestions', label: '💡 Suggestions', badge: logs.detectedIssues.suggestions.length || null },
                { id: 'fixes', label: '🔧 Fixes', badge: logs.detectedIssues.fixes.length || null },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedTab(tab.id as any)}
                  className={`px-6 py-4 text-sm font-semibold relative transition-colors ${
                    selectedTab === tab.id
                      ? 'text-cyan-400'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                  {tab.badge && (
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                      tab.id === 'logs'
                        ? 'bg-cyan-500 text-white animate-pulse'
                        : 'bg-cyan-500/20 text-cyan-400'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                  {selectedTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-500" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
            {/* Logs Tab */}
            {selectedTab === 'logs' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 dark:from-gray-950 dark:to-gray-900 rounded-xl p-6 border border-gray-800">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <span>📋</span>
                      Real-Time Deployment Logs
                    </h3>
                    {logs.status === 'deploying' && (
                      <span className="flex items-center text-sm text-green-400 animate-pulse">
                        <span className="mr-2">●</span>
                        Live Updates (5s refresh)
                      </span>
                    )}
                  </div>

                  {logs.cleanLogs && logs.cleanLogs.length > 0 ? (
                    <div className="bg-black rounded-lg p-4 font-mono text-sm overflow-x-auto max-h-[50vh] overflow-y-auto scrollbar-thin">
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
                    <div className="bg-black rounded-lg p-12 text-center">
                      {logs.status === 'deploying' ? (
                        <div>
                          <div className="animate-spin rounded-full h-12 w-12 border-4 border-cyan-500 border-t-transparent mx-auto mb-4"></div>
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
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4 text-gray-400">
                      <span>Total entries: {logs.cleanLogs?.length || 0}</span>
                      <span>Status: {logs.currentStage}</span>
                    </div>
                    {logs.cleanLogs && logs.cleanLogs.length > 0 && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => copyToClipboard(logs.cleanLogs!.join('\n'))}
                        className="flex items-center gap-2"
                      >
                        {copied ? <FaCheck /> : <FaCopy />}
                        {copied ? 'Copied!' : 'Copy Logs'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Overview Tab */}
            {selectedTab === 'overview' && (
              <div className="space-y-4">
                {logs.detectedIssues.errors.length > 0 && (
                  <div className="bg-red-500/10 border-l-4 border-red-500 p-6 rounded-xl">
                    <div className="flex gap-3">
                      <FaExclamationTriangle className="text-red-500 text-xl mt-1 flex-shrink-0" />
                      <div>
                        <h3 className="text-lg font-semibold text-red-500 mb-3">Errors Detected</h3>
                        <ul className="space-y-2">
                          {logs.detectedIssues.errors.map((error, idx) => (
                            <li key={idx} className="text-sm text-red-400">• {error}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {logs.detectedIssues.warnings.length > 0 && (
                  <div className="bg-yellow-500/10 border-l-4 border-yellow-500 p-6 rounded-xl">
                    <div className="flex gap-3">
                      <FaExclamationTriangle className="text-yellow-500 text-xl mt-1 flex-shrink-0" />
                      <div>
                        <h3 className="text-lg font-semibold text-yellow-500 mb-3">Warnings</h3>
                        <ul className="space-y-2">
                          {logs.detectedIssues.warnings.map((warning, idx) => (
                            <li key={idx} className="text-sm text-yellow-400">• {warning}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {logs.status === 'success' && (
                  <div className="bg-green-500/10 border-l-4 border-green-500 p-6 rounded-xl">
                    <div className="flex gap-3">
                      <FaCheck className="text-green-500 text-xl mt-1 flex-shrink-0" />
                      <div>
                        <h3 className="text-lg font-semibold text-green-500 mb-2">Deployment Successful!</h3>
                        <p className="text-sm text-green-400">
                          Your application is now live at{' '}
                          <a
                            href={logs.port && logs.port !== 80 ? `http://${logs.publicIp}:${logs.port}` : `http://${logs.publicIp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono font-semibold underline hover:text-green-300 transition-colors"
                          >
                            http://{logs.publicIp}{logs.port && logs.port !== 80 ? `:${logs.port}` : ''}
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
                <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 p-6 rounded-xl border border-cyan-500/20">
                  <h3 className="text-xl font-bold mb-4">💡 AI-Powered Suggestions</h3>

                  {logs.detectedIssues.suggestions.length === 0 &&
                   logs.detectedIssues.warnings.length === 0 &&
                   logs.detectedIssues.errors.length === 0 ? (
                    <p className="text-muted-foreground">No issues detected. Your deployment looks good! ✨</p>
                  ) : (
                    <div className="space-y-3">
                      {logs.detectedIssues.errors.map((error, idx) => (
                        <div key={`error-${idx}`} className="bg-card border-l-4 border-red-500 p-4 rounded-lg">
                          <p className="text-sm font-medium text-red-400">🔴 {error}</p>
                        </div>
                      ))}

                      {logs.detectedIssues.warnings.map((warning, idx) => (
                        <div key={`warning-${idx}`} className="bg-card border-l-4 border-yellow-500 p-4 rounded-lg">
                          <p className="text-sm font-medium text-yellow-400">⚠️ {warning}</p>
                        </div>
                      ))}

                      {logs.detectedIssues.suggestions.map((suggestion, idx) => (
                        <div key={`suggestion-${idx}`} className="bg-card border-l-4 border-cyan-500 p-4 rounded-lg">
                          <p className="text-sm text-cyan-400">ℹ️ {suggestion}</p>
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
                {logs.status === 'failed' && (
                  <DeploymentSuggestions
                    deploymentId={logs.deploymentId || instanceId}
                    errorMessage={logs.detectedIssues.errors.join('\n') || 'Deployment failed'}
                    deploymentLogs={logs.detectedIssues.suggestions.join('\n') + '\n' + logs.detectedIssues.warnings.join('\n')}
                    repoName={logs.repoFullName}
                    packageJson={undefined}
                  />
                )}

                {logs.detectedIssues.fixes.length === 0 && logs.status !== 'failed' ? (
                  <div className="bg-green-500/10 p-8 rounded-xl text-center border border-green-500/20">
                    <FaCheck className="h-16 w-16 text-green-500 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-green-500 mb-2">No Fixes Needed</h3>
                    <p className="text-green-400">Your project configuration looks great! 🎉</p>
                  </div>
                ) : logs.detectedIssues.fixes.length > 0 ? (
                  <>
                    <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 p-6 rounded-xl border border-yellow-500/20">
                      <h3 className="text-xl font-bold mb-2">🔧 How to Fix Your Project</h3>
                      <p className="text-sm text-muted-foreground">
                        Apply these fixes to your local project before deploying again.
                      </p>
                    </div>

                    {logs.detectedIssues.fixes.map((fix, idx) => (
                      <div key={idx} className="bg-card border border-border rounded-xl overflow-hidden">
                        <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 px-6 py-4 border-b border-border">
                          <h4 className="text-md font-semibold">{fix.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{fix.description}</p>
                          <span className="inline-block mt-2 text-xs font-mono bg-muted text-muted-foreground px-2 py-1 rounded">
                            {fix.file}
                          </span>
                        </div>
                        <div className="p-6">
                          <div className="relative">
                            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                              <code>{fix.code}</code>
                            </pre>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => copyToClipboard(fix.code)}
                              className="absolute top-2 right-2"
                            >
                              <FaCopy className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                ) : null}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-6 py-4 bg-card/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="rounded border-gray-600 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
                  />
                  <span>Auto-refresh (5s)</span>
                </label>
                {logs.status === 'deploying' && (
                  <span className="text-xs text-muted-foreground">
                    Deployment typically takes 3-5 minutes
                  </span>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={fetchLogs}
                  className="flex items-center gap-2"
                >
                  <FaSync className={loading ? 'animate-spin' : ''} />
                  Refresh
                </Button>

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={logs.status === 'deploying'}
                  className="flex items-center gap-2"
                  title={logs.status === 'deploying' ? 'Cannot delete while deploying' : 'Delete deployment'}
                >
                  <FaTrash className="w-3 h-3" />
                  Delete
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000]" onClick={() => setShowDeleteConfirm(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-[10001] p-4">
            <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full animate-bounce-in">
              <div className="p-6">
                <div className="flex items-center justify-center w-16 h-16 mx-auto bg-red-500/10 rounded-full mb-4">
                  <FaExclamationTriangle className="w-8 h-8 text-red-500" />
                </div>

                <h3 className="text-xl font-bold text-center mb-2">
                  Delete Deployment?
                </h3>
                <p className="text-sm text-muted-foreground text-center mb-4">
                  This action cannot be undone. This will:
                </p>

                <div className="bg-yellow-500/10 border-l-4 border-yellow-500 p-4 mb-4 rounded">
                  <ul className="text-sm space-y-2">
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-500">•</span>
                      <span><strong>Terminate EC2 instance</strong> ({logs.instanceId})</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-500">•</span>
                      <span><strong>Stop your application</strong> at {logs.publicIp || 'the public IP'}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-500">•</span>
                      <span><strong>Delete deployment record</strong> from database</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-muted p-3 rounded text-sm text-muted-foreground mb-4 space-y-1">
                  <p><strong>Repository:</strong> {logs.repoFullName}</p>
                  <p><strong>Deployed:</strong> {new Date(logs.deployedAt).toLocaleString()}</p>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 flex items-center justify-center gap-2"
                  >
                    {deleting ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Deleting...
                      </>
                    ) : (
                      'Yes, Delete'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );

  return createPortal(modalContent, document.body);
}

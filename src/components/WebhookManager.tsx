'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface Webhook {
  id: string;
  repoFullName: string;
  repoUrl: string;
  pipelineId: string;
  events: string[];
  active: boolean;
  branch?: string;
  lastTriggered?: string;
  totalTriggers: number;
  successfulTriggers: number;
  failedTriggers: number;
  createdAt: string;
}

interface Pipeline {
  _id: string;
  name: string;
  repoFullName: string;
  language?: string;
  framework?: string;
}

export default function WebhookManager() {
  const { data: session } = useSession();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [selectedPipeline, setSelectedPipeline] = useState('');
  const [branch, setBranch] = useState('main');
  const [githubToken, setGithubToken] = useState('');
  const [autoSetup, setAutoSetup] = useState(true);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [manualSetupInstructions, setManualSetupInstructions] = useState<string[]>([]);

  // Load webhooks and pipelines
  useEffect(() => {
    loadWebhooks();
    loadPipelines();
  }, []);

  const loadWebhooks = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/webhooks/manage');
      if (response.ok) {
        const data = await response.json();
        setWebhooks(data.webhooks || []);
      }
    } catch (error) {
      console.error('Failed to load webhooks:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPipelines = async () => {
    try {
      const response = await fetch('/api/pipelines');
      if (response.ok) {
        const data = await response.json();
        setPipelines(data.pipelines || []);
      }
    } catch (error) {
      console.error('Failed to load pipelines:', error);
    }
  };

  const handleCreateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsCreating(true);

    try {
      const pipeline = pipelines.find(p => p._id === selectedPipeline);
      if (!pipeline) {
        setError('Please select a pipeline');
        return;
      }

      const response = await fetch('/api/webhooks/manage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repoFullName: pipeline.repoFullName,
          repoUrl: `https://github.com/${pipeline.repoFullName}`,
          pipelineId: pipeline._id,
          branch,
          events: ['push'],
          autoSetup,
          githubToken: githubToken || undefined, // Use entered token or undefined
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(data.message || 'Webhook created successfully!');
        setShowCreateForm(false);
        setSelectedPipeline('');
        setBranch('main');
        setGithubToken(''); // Clear token after successful creation

        // If manual setup is needed, show instructions
        if (data.instructions) {
          setWebhookSecret(data.webhook.secret);
          setManualSetupInstructions(data.instructions.steps);
        }

        loadWebhooks();
      } else {
        setError(data.error || 'Failed to create webhook');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to create webhook');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleWebhook = async (webhookId: string, active: boolean) => {
    try {
      const response = await fetch('/api/webhooks/manage', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookId,
          active: !active,
        }),
      });

      if (response.ok) {
        loadWebhooks();
        setSuccess(`Webhook ${!active ? 'enabled' : 'disabled'} successfully`);
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update webhook');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to update webhook');
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm('Are you sure you want to delete this webhook? You will need to remove it from GitHub manually.')) {
      return;
    }

    try {
      const response = await fetch(`/api/webhooks/manage?webhookId=${webhookId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        loadWebhooks();
        setSuccess('Webhook deleted successfully');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to delete webhook');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to delete webhook');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
        <div className="flex items-start">
          <svg className="h-6 w-6 text-blue-600 dark:text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Continuous Deployment Enabled
            </h3>
            <div className="mt-2 text-sm text-blue-700 dark:text-blue-400">
              <p>Push code → Automatic deployment! Set up webhooks to automatically deploy when you push to GitHub.</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>AI-powered pipeline generation on every push</li>
                <li>Secure HMAC-SHA256 signature verification</li>
                <li>Branch filtering (deploy only specific branches)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
            </div>
            <button onClick={() => setError('')} className="ml-auto">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-800 dark:text-green-300">{success}</p>
            </div>
            <button onClick={() => setSuccess('')} className="ml-auto">
              <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Manual Setup Instructions */}
      {manualSetupInstructions.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
          <h3 className="text-lg font-medium text-yellow-900 dark:text-yellow-300 mb-4">
            Manual GitHub Setup Required
          </h3>
          <div className="space-y-2 text-sm text-yellow-800 dark:text-yellow-400">
            {manualSetupInstructions.map((step, index) => (
              <p key={index}>{step}</p>
            ))}
            {webhookSecret && (
              <div className="mt-4 p-4 bg-yellow-100 dark:bg-yellow-900/40 rounded border border-yellow-300 dark:border-yellow-700">
                <p className="font-semibold mb-2">Your Webhook Secret:</p>
                <code className="block p-2 bg-white dark:bg-gray-800 rounded text-xs break-all">
                  {webhookSecret}
                </code>
              </div>
            )}
          </div>
          <button
            onClick={() => {
              setManualSetupInstructions([]);
              setWebhookSecret('');
            }}
            className="mt-4 text-sm text-yellow-700 dark:text-yellow-400 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create Webhook Button */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Active Webhooks ({webhooks.length})
        </h2>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Webhook
        </button>
      </div>

      {/* Create Webhook Form */}
      {showCreateForm && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Create New Webhook
          </h3>
          <form onSubmit={handleCreateWebhook} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Pipeline
              </label>
              <select
                value={selectedPipeline}
                onChange={(e) => setSelectedPipeline(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              >
                <option value="">Choose a pipeline...</option>
                {pipelines.map((pipeline) => (
                  <option key={pipeline._id} value={pipeline._id}>
                    {pipeline.repoFullName} - {pipeline.framework || pipeline.language || 'Unknown'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Branch to Watch
              </label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                required
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Only pushes to this branch will trigger deployment
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                GitHub Personal Access Token (Optional)
              </label>
              <input
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                ⚠️ <strong>Required for private repositories.</strong> Leave empty for public repos.{' '}
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=NerveFlow%20Deployment"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:text-blue-600 underline"
                >
                  Create token here
                </a>
              </p>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="autoSetup"
                checked={autoSetup}
                onChange={(e) => setAutoSetup(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="autoSetup" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                Automatically configure webhook on GitHub (recommended)
              </label>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isCreating}
                className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </>
                ) : (
                  'Create Webhook'
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Webhooks List */}
      {webhooks.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No webhooks</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Get started by creating your first webhook
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow overflow-hidden sm:rounded-lg border border-gray-200 dark:border-gray-700">
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {webhooks.map((webhook) => (
              <li key={webhook.id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white truncate">
                        {webhook.repoFullName}
                      </h3>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          webhook.active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {webhook.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center text-sm text-gray-500 dark:text-gray-400 flex-wrap gap-4">
                      <span className="flex items-center">
                        <svg className="flex-shrink-0 mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        Branch: <span className="font-medium ml-1">{webhook.branch || 'all'}</span>
                      </span>
                      <span className="flex items-center">
                        <svg className="flex-shrink-0 mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        {webhook.totalTriggers} triggers
                      </span>
                      <span className="flex items-center text-green-600 dark:text-green-400">
                        <svg className="flex-shrink-0 mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {webhook.successfulTriggers} success
                      </span>
                      {webhook.failedTriggers > 0 && (
                        <span className="flex items-center text-red-600 dark:text-red-400">
                          <svg className="flex-shrink-0 mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          {webhook.failedTriggers} failed
                        </span>
                      )}
                    </div>
                    {webhook.lastTriggered && (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Last triggered: {new Date(webhook.lastTriggered).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleToggleWebhook(webhook.id, webhook.active)}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md ${
                        webhook.active
                          ? 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                          : 'text-white bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {webhook.active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleDeleteWebhook(webhook.id)}
                      className="px-3 py-1.5 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Help Section */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
          How It Works
        </h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <li>Create a webhook for your repository</li>
          <li>System automatically configures GitHub webhook (or you can do it manually)</li>
          <li>Push code to your repository</li>
          <li>GitHub sends webhook to your server</li>
          <li>AI analyzes your project with Claude Sonnet 4.6</li>
          <li>Fresh pipeline is generated</li>
          <li>Deployment starts automatically!</li>
        </ol>
      </div>
    </div>
  );
}

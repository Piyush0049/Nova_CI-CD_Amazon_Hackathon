'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { FiGithub, FiDownload, FiPlay, FiZap, FiCheck, FiAlertCircle } from 'react-icons/fi';
import { motion } from 'framer-motion';

export default function YamlGeneratorPage() {
  const { data: session } = useSession();
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});

  const generatePipeline = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      // Parse repository URL
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) {
        throw new Error('Invalid GitHub URL. Please use format: https://github.com/owner/repo');
      }

      const [, owner, repo] = match;
      const repoFullName = `${owner}/${repo.replace('.git', '')}`;

      const response = await fetch('/api/pipelines/generate-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          repoFullName,
          githubToken: session?.accessToken,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate pipeline');
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadYaml = () => {
    if (!result) return;

    const blob = new Blob([result.pipeline.yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '.gitlab-ci.yml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const deployWithPipeline = async () => {
    if (!result) return;

    setDeploying(true);

    try {
      const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!match) return;

      const [, owner, repo] = match;
      const repoFullName = `${owner}/${repo.replace('.git', '')}`;

      const response = await fetch('/api/deploy/yaml-driven', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          repoFullName,
          githubToken: session?.accessToken,
          pipelineName: `${repo.replace('.git', '')}-pipeline`,
          envVars,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Deployment failed');
      }

      const deployResult = await response.json();

      alert(
        `✅ Deployment successful!\n\nAccess your app at: ${deployResult.accessUrl}\n\nInstance ID: ${deployResult.instanceId}`
      );

      // Redirect to deployments page
      window.location.href = '/deployments';
    } catch (err: any) {
      alert(`❌ Deployment failed: ${err.message}`);
    } finally {
      setDeploying(false);
    }
  };

  const addEnvVar = () => {
    const key = prompt('Environment variable name:');
    if (key && key.trim()) {
      const value = prompt(`Value for ${key}:`);
      if (value !== null) {
        setEnvVars({ ...envVars, [key.trim()]: value });
      }
    }
  };

  const removeEnvVar = (key: string) => {
    const newEnvVars = { ...envVars };
    delete newEnvVars[key];
    setEnvVars(newEnvVars);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm font-medium mb-4">
            <FiZap className="animate-pulse" />
            Powered by Amazon Nova AI
          </div>
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            AI Pipeline Generator
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Generate optimized CI/CD pipelines for any repository in seconds. Supports 8+ programming
            languages and frameworks.
          </p>
        </motion.div>

        {/* Input Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-2xl mb-8"
        >
          <label className="block text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">
            GitHub Repository URL
          </label>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <FiGithub className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !loading && repoUrl && generatePipeline()}
                placeholder="https://github.com/user/repository"
                className="w-full pl-12 pr-4 py-4 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 text-lg transition-all"
              />
            </div>
            <button
              onClick={generatePipeline}
              disabled={loading || !repoUrl}
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  Analyzing...
                </div>
              ) : (
                <>Generate Pipeline</>
              )}
            </button>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg flex items-start gap-3"
            >
              <FiAlertCircle className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-red-800 dark:text-red-300">Error</div>
                <div className="text-red-700 dark:text-red-400 text-sm">{error}</div>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Results Section */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {/* Detection Info */}
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-8 text-white mb-6 shadow-2xl">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <FiCheck className="text-green-300" />
                Detected Configuration
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-purple-200 text-sm mb-1">Language</div>
                  <div className="font-bold text-xl">{result.detection.language}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-purple-200 text-sm mb-1">Framework</div>
                  <div className="font-bold text-xl">{result.detection.framework}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-purple-200 text-sm mb-1">Package Manager</div>
                  <div className="font-bold text-xl">
                    {result.detection.packageManager || 'N/A'}
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-purple-200 text-sm mb-1">Build Tool</div>
                  <div className="font-bold text-xl">{result.detection.buildTool || 'N/A'}</div>
                </div>
              </div>

              {/* Features */}
              <div className="mt-4 flex flex-wrap gap-2">
                {result.detection.hasTests && (
                  <span className="px-3 py-1 bg-green-400/20 border border-green-400/30 rounded-full text-sm">
                    ✓ Tests
                  </span>
                )}
                {result.detection.hasLinter && (
                  <span className="px-3 py-1 bg-blue-400/20 border border-blue-400/30 rounded-full text-sm">
                    ✓ Linter
                  </span>
                )}
                <span className="px-3 py-1 bg-purple-400/20 border border-purple-400/30 rounded-full text-sm">
                  {result.detection.detectedFiles.length} Files Analyzed
                </span>
              </div>
            </div>

            {/* Pipeline Stages */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl mb-6">
              <h3 className="text-xl font-bold mb-6">Pipeline Stages</h3>
              <div className="flex items-center gap-4 overflow-x-auto pb-4">
                {result.pipeline.stages.map((stage: string, idx: number) => (
                  <div key={stage} className="flex items-center">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.1 }}
                      className="bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900 px-6 py-4 rounded-xl whitespace-nowrap shadow-md border-2 border-blue-200 dark:border-blue-700"
                    >
                      <div className="text-xs text-blue-600 dark:text-blue-300 font-medium mb-1">
                        Stage {idx + 1}
                      </div>
                      <div className="font-bold text-lg">{stage}</div>
                    </motion.div>
                    {idx < result.pipeline.stages.length - 1 && (
                      <div className="text-3xl text-gray-300 dark:text-gray-600 mx-2">→</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Environment Variables */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl mb-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold">Environment Variables</h3>
                <button
                  onClick={addEnvVar}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                >
                  + Add Variable
                </button>
              </div>

              {Object.keys(envVars).length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <div className="text-4xl mb-2">🔒</div>
                  <p className="font-medium">No environment variables configured</p>
                  <p className="text-sm mt-1">Add variables that your application needs</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(envVars).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-sm">{key}</div>
                        <div className="text-xs text-gray-500 font-mono mt-1">
                          {value.length > 50 ? value.substring(0, 50) + '...' : value}
                        </div>
                      </div>
                      <button
                        onClick={() => removeEnvVar(key)}
                        className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* YAML Content */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold">Generated Pipeline (YAML)</h3>
                <div className="flex gap-2">
                  <button
                    onClick={downloadYaml}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium"
                  >
                    <FiDownload size={18} />
                    Download
                  </button>
                  <button
                    onClick={deployWithPipeline}
                    disabled={deploying}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg hover:from-green-700 hover:to-green-600 disabled:opacity-50 transition-all shadow-lg font-medium"
                  >
                    {deploying ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                        Deploying...
                      </>
                    ) : (
                      <>
                        <FiPlay size={18} />
                        Deploy Now
                      </>
                    )}
                  </button>
                </div>
              </div>
              <pre className="bg-gray-900 text-gray-100 p-6 rounded-xl overflow-auto text-sm leading-relaxed font-mono shadow-inner max-h-96 scrollbar-thin">
                <code>{result.pipeline.yaml}</code>
              </pre>
            </div>
          </motion.div>
        )}

        {/* Features Section (when no results) */}
        {!result && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-16 grid md:grid-cols-3 gap-6"
          >
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
              <div className="text-4xl mb-3">🚀</div>
              <h3 className="font-bold text-lg mb-2">Universal Support</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Supports Node.js, Python, Rust, Go, Java, Ruby, PHP, and Docker projects
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
              <h3 className="font-bold text-lg mb-2">AI-Optimized</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Amazon Nova Pro AI analyzes your code and generates best-practice pipelines
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
              <div className="text-4xl mb-3">⚡</div>
              <h3 className="font-bold text-lg mb-2">Deploy Instantly</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                One-click deployment to AWS EC2 with automatic error fixing
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

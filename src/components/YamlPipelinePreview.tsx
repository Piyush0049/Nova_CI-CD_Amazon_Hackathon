'use client';

import { useState } from 'react';
import { FiX, FiCheck, FiEdit2, FiPlay, FiDownload, FiCopy, FiAlertCircle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

interface PipelinePreviewProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineData: {
    pipeline: {
      yaml: string;
      stages: string[];
      language: string;
      framework: string;
    };
    detection: {
      language: string;
      framework: string;
      packageManager?: string;
      buildTool?: string;
      hasTests: boolean;
      hasLinter: boolean;
      detectedFiles: string[];
    };
  } | null;
  repoInfo: {
    repoUrl: string;
    repoFullName: string;
    name: string;
  };
  githubToken?: string;
  onDeploy?: (result: any) => void;
}

export function YamlPipelinePreview({
  isOpen,
  onClose,
  pipelineData,
  repoInfo,
  githubToken,
  onDeploy,
}: PipelinePreviewProps) {
  const [editMode, setEditMode] = useState(false);
  const [editedYaml, setEditedYaml] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [envVars, setEnvVars] = useState<Record<string, string>>({});
  const [showEnvVars, setShowEnvVars] = useState(false);

  // Initialize edited YAML when data changes
  useState(() => {
    if (pipelineData) {
      setEditedYaml(pipelineData.pipeline.yaml);
    }
  });

  if (!isOpen || !pipelineData) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(pipelineData.pipeline.yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([pipelineData.pipeline.yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '.gitlab-ci.yml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDeploy = async () => {
    setDeploying(true);

    try {
      const response = await fetch('/api/deploy/yaml-driven', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: repoInfo.repoUrl,
          repoFullName: repoInfo.repoFullName,
          githubToken,
          pipelineName: `${repoInfo.name}-pipeline`,
          envVars,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Deployment failed');
      }

      const result = await response.json();

      if (onDeploy) {
        onDeploy(result);
      }

      onClose();
    } catch (error: any) {
      console.error('Deployment error:', error);
      alert(`Deployment failed: ${error.message}`);
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
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-gray-800 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-500 to-blue-500 text-white">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                 AI-Generated Pipeline
              </h2>
              <p className="text-sm text-purple-100 mt-1">{repoInfo.repoFullName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <FiX size={24} />
            </button>
          </div>

          {/* Detection Info */}
          <div className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <FiCheck className="text-green-500" />
              Detected Configuration
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
                <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Language</div>
                <div className="font-bold text-lg">{pipelineData.detection.language}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
                <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Framework</div>
                <div className="font-bold text-lg">{pipelineData.detection.framework}</div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
                <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Package Manager</div>
                <div className="font-bold text-lg">
                  {pipelineData.detection.packageManager || 'N/A'}
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
                <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Build Tool</div>
                <div className="font-bold text-lg">
                  {pipelineData.detection.buildTool || 'N/A'}
                </div>
              </div>
            </div>

            {/* Pipeline Stages */}
            <div className="mt-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2 font-medium">
                Pipeline Stages:
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {pipelineData.pipeline.stages.map((stage, idx) => (
                  <div key={stage} className="flex items-center">
                    <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 whitespace-nowrap">
                      <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                        Stage {idx + 1}
                      </div>
                      <div className="font-bold">{stage}</div>
                    </div>
                    {idx < pipelineData.pipeline.stages.length - 1 && (
                      <div className="text-gray-400 mx-2">→</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Feature Badges */}
            <div className="mt-4 flex flex-wrap gap-2">
              {pipelineData.detection.hasTests && (
                <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
                  ✓ Tests Detected
                </span>
              )}
              {pipelineData.detection.hasLinter && (
                <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-medium">
                  ✓ Linter Detected
                </span>
              )}
              <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs font-medium">
                {pipelineData.detection.detectedFiles.length} Files Analyzed
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
            <button
              onClick={() => setShowEnvVars(false)}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                !showEnvVars
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Pipeline YAML
            </button>
            <button
              onClick={() => setShowEnvVars(true)}
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                showEnvVars
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Environment Variables {Object.keys(envVars).length > 0 && `(${Object.keys(envVars).length})`}
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6 scrollbar-thin">
            {!showEnvVars ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg">Pipeline Configuration</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <FiCopy size={16} />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={handleDownload}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <FiDownload size={16} />
                      Download
                    </button>
                    <button
                      onClick={() => setEditMode(!editMode)}
                      className={`flex items-center gap-2 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                        editMode
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <FiEdit2 size={16} />
                      {editMode ? 'View Mode' : 'Edit Mode'}
                    </button>
                  </div>
                </div>

                {editMode ? (
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                      <FiAlertCircle />
                      Editing YAML directly - ensure valid syntax
                    </div>
                    <textarea
                      value={editedYaml}
                      onChange={(e) => setEditedYaml(e.target.value)}
                      className="w-full h-96 font-mono text-sm p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-purple-500"
                      spellCheck={false}
                    />
                  </div>
                ) : (
                  <pre className="bg-gray-900 text-gray-100 p-6 rounded-lg overflow-auto text-sm leading-relaxed font-mono shadow-inner scrollbar-thin">
                    <code>{pipelineData.pipeline.yaml}</code>
                  </pre>
                )}
              </>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg">Environment Variables</h3>
                  <button
                    onClick={addEnvVar}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                  >
                    + Add Variable
                  </button>
                </div>

                {Object.keys(envVars).length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-4xl mb-2">🔒</div>
                    <p>No environment variables configured</p>
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
                          <div className="font-medium text-sm text-gray-700 dark:text-gray-300">
                            {key}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1">
                            {value.length > 50 ? value.substring(0, 50) + '...' : value}
                          </div>
                        </div>
                        <button
                          onClick={() => removeEnvVar(key)}
                          className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                        >
                          <FiX size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-medium"
            >
              Cancel
            </button>

            <button
              onClick={handleDeploy}
              disabled={deploying}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-lg hover:from-green-700 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg font-medium"
            >
              {deploying ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                  Deploying to AWS EC2...
                </>
              ) : (
                <>
                  <FiPlay size={18} />
                  Deploy with This Pipeline
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

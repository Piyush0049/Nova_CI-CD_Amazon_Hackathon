'use client';

import React, { useState, useEffect } from 'react';
import { FaExclamationTriangle, FaCheckCircle, FaInfoCircle, FaCopy, FaGithub, FaTerminal, FaFileCode } from 'react-icons/fa';

interface DeploymentSuggestion {
  type: 'file_change' | 'dependency' | 'config' | 'code_fix';
  severity: 'critical' | 'recommended' | 'optional';
  title: string;
  description: string;
  file?: string;
  code?: string;
  commitMessage?: string;
  command?: string;
}

interface Props {
  deploymentId: string;
  errorMessage: string;
  deploymentLogs: string;
  repoName: string;
  packageJson?: string;
}

export default function DeploymentSuggestions({
  deploymentId,
  errorMessage,
  deploymentLogs,
  repoName,
  packageJson
}: Props) {
  const [suggestions, setSuggestions] = useState<DeploymentSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchSuggestions();
  }, [deploymentId]);

  const fetchSuggestions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/deployment-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deploymentLogs,
          errorMessage,
          repoName,
          packageJson,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setSuggestions(data.suggestions);
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 border-red-500 text-red-900';
      case 'recommended': return 'bg-yellow-100 border-yellow-500 text-yellow-900';
      case 'optional': return 'bg-blue-100 border-blue-500 text-blue-900';
      default: return 'bg-gray-100 border-gray-500 text-gray-900';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <FaExclamationTriangle className="text-red-600" />;
      case 'recommended': return <FaCheckCircle className="text-yellow-600" />;
      case 'optional': return <FaInfoCircle className="text-blue-600" />;
      default: return <FaInfoCircle className="text-gray-600" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'file_change': return <FaFileCode className="text-purple-600" />;
      case 'dependency': return <FaGithub className="text-green-600" />;
      case 'config': return <FaFileCode className="text-orange-600" />;
      case 'code_fix': return <FaTerminal className="text-indigo-600" />;
      default: return <FaInfoCircle className="text-gray-600" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center space-x-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Analyzing Deployment Failure...</h3>
            <p className="text-sm text-gray-600">Using AI to generate fix suggestions</p>
          </div>
        </div>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
        <div className="flex items-center">
          <FaInfoCircle className="text-yellow-600 mr-3" />
          <p className="text-yellow-800">No specific suggestions available. Check the logs above for details.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">🔧 Deployment Fix Suggestions</h2>
        <p className="text-blue-100">AI-powered suggestions to fix your deployment. Make these changes in your repository:</p>
      </div>

      {/* Suggestions List */}
      {suggestions.map((suggestion, index) => (
        <div
          key={index}
          className={`border-l-4 rounded-lg p-6 ${getSeverityColor(suggestion.severity)} shadow-md hover:shadow-lg transition-shadow`}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="text-2xl">{getSeverityIcon(suggestion.severity)}</div>
              <div className="text-2xl">{getTypeIcon(suggestion.type)}</div>
              <div>
                <h3 className="text-lg font-bold">{suggestion.title}</h3>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-xs font-semibold px-2 py-1 bg-white bg-opacity-50 rounded">
                    {suggestion.severity.toUpperCase()}
                  </span>
                  <span className="text-xs font-semibold px-2 py-1 bg-white bg-opacity-50 rounded">
                    {suggestion.type.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm mb-4 leading-relaxed">{suggestion.description}</p>

          {/* File Path */}
          {suggestion.file && (
            <div className="mb-3">
              <div className="flex items-center space-x-2 text-sm">
                <FaFileCode />
                <span className="font-semibold">File:</span>
                <code className="bg-white bg-opacity-50 px-2 py-1 rounded text-xs font-mono">
                  {suggestion.file}
                </code>
              </div>
            </div>
          )}

          {/* Code Snippet */}
          {suggestion.code && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">Code to add/change:</span>
                <button
                  onClick={() => copyToClipboard(suggestion.code!, index * 2)}
                  className="flex items-center space-x-1 px-3 py-1 bg-white bg-opacity-70 hover:bg-opacity-100 rounded text-xs font-semibold transition-colors"
                >
                  {copiedIndex === index * 2 ? (
                    <>
                      <FaCheckCircle className="text-green-600" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <FaCopy />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-xs font-mono">
                <code>{suggestion.code}</code>
              </pre>
            </div>
          )}

          {/* Command */}
          {suggestion.command && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2 text-sm font-semibold">
                  <FaTerminal />
                  <span>Command to run:</span>
                </div>
                <button
                  onClick={() => copyToClipboard(suggestion.command!, index * 2 + 1)}
                  className="flex items-center space-x-1 px-3 py-1 bg-white bg-opacity-70 hover:bg-opacity-100 rounded text-xs font-semibold transition-colors"
                >
                  {copiedIndex === index * 2 + 1 ? (
                    <>
                      <FaCheckCircle className="text-green-600" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <FaCopy />
                      <span>Copy Command</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="bg-gray-900 text-yellow-400 p-3 rounded-lg overflow-x-auto text-sm font-mono">
                <code>{suggestion.command}</code>
              </pre>
            </div>
          )}

          {/* Commit Message */}
          {suggestion.commitMessage && (
            <div className="bg-white bg-opacity-50 rounded p-3">
              <div className="flex items-center space-x-2 text-sm mb-2">
                <FaGithub />
                <span className="font-semibold">Suggested commit message:</span>
              </div>
              <code className="text-sm font-mono bg-gray-900 text-white px-3 py-2 rounded block">
                git commit -m "{suggestion.commitMessage}"
              </code>
            </div>
          )}
        </div>
      ))}

      {/* Help Footer */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-gray-900 mb-2">📝 How to apply these fixes:</h4>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
          <li>Make the suggested changes in your local repository</li>
          <li>Test the changes locally (npm run build, npm start)</li>
          <li>Commit the changes using the suggested commit messages</li>
          <li>Push to GitHub: <code className="bg-gray-200 px-2 py-1 rounded text-xs">git push origin main</code></li>
          <li>Deploy again - the issues should be resolved!</li>
        </ol>
      </div>
    </div>
  );
}

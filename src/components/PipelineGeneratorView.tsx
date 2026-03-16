'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import PipelineEditor from './PipelineEditor';
import PipelineVisualization from './PipelineVisualization';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  language: string;
  html_url: string;
  default_branch: string;
}

interface PipelineGeneratorViewProps {
  repo: GitHubRepo;
  accessToken: string;
  onBack: () => void;
  onPipelineCreated: (yaml: string) => void;
}

export default function PipelineGeneratorView({
  repo,
  accessToken,
  onBack,
  onPipelineCreated
}: PipelineGeneratorViewProps) {
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatedYaml, setGeneratedYaml] = useState('');
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [error, setError] = useState('');

  const analyzeRepository = async () => {
    try {
      setAnalyzing(true);
      setError('');

      const response = await fetch('/api/github/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          owner: repo.full_name.split('/')[0],
          repo: repo.name,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze repository');
      }

      const data = await response.json();
      setAnalysisResult(data.analysis);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const generatePipeline = async () => {
    try {
      setGenerating(true);
      setError('');

      const response = await fetch('/api/pipelines/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          owner: repo.full_name.split('/')[0],
          repo: repo.name,
          analysis: analysisResult,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate pipeline');
      }

      const data = await response.json();
      setGeneratedYaml(data.yaml);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCreatePipeline = async (yaml: string) => {
    if (!yaml) return;

    try {
      setGenerating(true);
      setError('');

      // Save pipeline to database
      const response = await fetch('/api/pipelines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `${repo.name}-pipeline`,
          repo: repo.name,
          repoFullName: repo.full_name,
          yaml: yaml,
          language: repo.language,
          framework: analysisResult?.framework,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create pipeline');
      }

      const data = await response.json();

      // Call parent callback to refresh and navigate
      onPipelineCreated(data.pipeline.name);
    } catch (err: any) {
      setError(err.message || 'Failed to create pipeline');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="secondary" onClick={onBack} className="mb-4">
            ← Back to Repositories
          </Button>
          <h1 className="text-3xl font-bold">{repo.name}</h1>
          <p className="text-gray-600 dark:text-gray-400">{repo.description}</p>
        </div>
      </div>

      {/* Repository Info */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Repository Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Full Name:</span>
            <p className="font-medium">{repo.full_name}</p>
          </div>
          <div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Language:</span>
            <p className="font-medium">{repo.language || 'Not specified'}</p>
          </div>
          <div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Default Branch:</span>
            <p className="font-medium">{repo.default_branch}</p>
          </div>
          <div>
            <span className="text-sm text-gray-600 dark:text-gray-400">GitHub URL:</span>
            <a href={repo.html_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              View on GitHub
            </a>
          </div>
        </div>
      </Card>

      {/* Analysis Section */}
      {!analysisResult && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Step 1: Analyze Repository</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Nova AI will analyze your repository structure, dependencies, and project type to understand the best CI/CD pipeline configuration.
          </p>
          <Button
            type="button"
            variant="primary"
            onClick={analyzeRepository}
            disabled={analyzing}
          >
            {analyzing ? 'Analyzing Repository...' : 'Analyze with Nova AI'}
          </Button>
        </Card>
      )}

      {/* Analysis Results */}
      {analysisResult && !generatedYaml && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Analysis Complete</h2>
          <div className="space-y-4 mb-4">
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Detected Type:</span>
              <p className="font-medium text-lg">{analysisResult.type}</p>
            </div>
            {analysisResult.framework && (
              <div>
                <span className="text-sm text-gray-600 dark:text-gray-400">Framework:</span>
                <p className="font-medium">{analysisResult.framework}</p>
              </div>
            )}
            <div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Files Detected:</span>
              <p className="text-sm">{analysisResult.files?.length || 0} files analyzed</p>
            </div>
          </div>

          <h3 className="font-semibold mb-2">Step 2: Generate Pipeline</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Based on the analysis, Nova AI will create a customized CI/CD pipeline with stages for build, test, and deployment.
          </p>
          <Button
            type="button"
            variant="primary"
            onClick={generatePipeline}
            disabled={generating}
          >
            {generating ? 'Generating Pipeline...' : 'Generate Pipeline with Nova AI'}
          </Button>
        </Card>
      )}

      {/* Generated Pipeline */}
      {generatedYaml && (
        <div className="space-y-4">
          <Card className="p-6 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h2 className="text-xl font-semibold text-green-800 dark:text-green-200">
                Pipeline Generated Successfully!
              </h2>
            </div>
            <p className="text-green-700 dark:text-green-300">
              Nova AI has created a customized CI/CD pipeline based on your repository. Review and customize it below.
            </p>
          </Card>

          <PipelineVisualization
            yamlContent={generatedYaml}
            pipelineName={`${repo.name}-pipeline`}
          />

          <PipelineEditor
            initialYaml={generatedYaml}
            onSave={handleCreatePipeline}
            isSaving={generating}
          />

          <Card className="p-4 bg-muted/50">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Not satisfied with the generated pipeline?
              </p>
              <Button type="button" variant="secondary" onClick={generatePipeline} disabled={generating}>
                {generating ? 'Regenerating...' : 'Regenerate Pipeline'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <Card className="p-6 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-800 dark:text-red-200 font-semibold">Error: {error}</p>
          </div>
        </Card>
      )}

      {/* Loading States */}
      {(analyzing || generating) && (
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <div>
              <p className="font-semibold">
                {analyzing ? 'Analyzing repository with Nova AI...' : 'Generating pipeline with Nova AI...'}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This may take a few moments
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import AppLayout from '@/components/AppLayout';
import { PipelineVisualizationFlow } from '@/components/PipelineVisualizationFlow';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  FaArrowLeft,
  FaGithub,
  FaRobot,
  FaFolder,
  FaSearch,
  FaBrain,
  FaCog,
  FaSadTear,
  FaQuestionCircle,
  FaCheck
} from 'react-icons/fa';
import * as yaml from 'yaml';

interface PipelineData {
  pipeline: {
    yaml: string;
    stages: any[];
  };
  detection: {
    language: string;
    framework: string;
    packageManager: string;
    buildTool: string;
    hasTests: boolean;
    hasLinter: boolean;
    detectedFiles: string[];
  };
}

// Parse YAML to extract stages with jobs
function parseYAMLStages(yamlContent: string) {
  try {
    console.log('[PARSE-YAML] Parsing YAML content...');
    console.log('[PARSE-YAML] Content type:', typeof yamlContent);
    console.log('[PARSE-YAML] Content length:', yamlContent?.length || 0);

    // Log first 1000 characters for debugging
    console.log('[PARSE-YAML] First 1000 chars:', yamlContent?.substring(0, 1000));

    // Log last 500 characters to see the end structure
    console.log('[PARSE-YAML] Last 500 chars:', yamlContent?.substring(yamlContent.length - 500));

    const parsed = yaml.parse(yamlContent);
    console.log('[PARSE-YAML] Parsed object keys:', Object.keys(parsed || {}));

    const stageNames = parsed.stages || [];
    console.log('[PARSE-YAML] Stage names from YAML:', stageNames);

    const stages: any[] = [];

    // Extract jobs for each stage
    for (const stageName of stageNames) {
      const stageJobs: any[] = [];

      // Find all jobs that belong to this stage
      for (const [key, value] of Object.entries(parsed)) {
        if (key === 'stages' || key === 'variables') continue;

        const jobConfig = value as any;
        if (jobConfig && jobConfig.stage === stageName) {
          // Extract commands from script and ensure they're all strings
          let commands: string[] = [];

          if (Array.isArray(jobConfig.script)) {
            // Ensure each command is a string
            commands = jobConfig.script.map((cmd: any) => {
              if (typeof cmd === 'string') {
                return cmd;
              } else if (typeof cmd === 'object') {
                console.warn('[PARSE-YAML] Found object in script commands:', cmd);
                return JSON.stringify(cmd); // Convert object to string as fallback
              } else {
                return String(cmd);
              }
            });
          } else if (jobConfig.script) {
            commands = [String(jobConfig.script)];
          }

          console.log('[PARSE-YAML] Stage:', stageName, 'Job:', key, 'Commands:', commands.length);

          stageJobs.push({
            name: key,
            commands: commands,
            image: jobConfig.image || undefined,
          });
        }
      }

      stages.push({
        name: String(stageName), // Ensure stage name is a string
        jobs: stageJobs,
      });
    }

    console.log('[PARSE-YAML] ✓ Successfully parsed', stages.length, 'stages');
    console.log('[PARSE-YAML] Stages structure:', JSON.stringify(stages, null, 2));
    return stages;
  } catch (error: any) {
    console.error('[PARSE-YAML] ❌ Failed to parse YAML:', error);
    console.error('[PARSE-YAML] Error message:', error?.message);
    console.error('[PARSE-YAML] Error stack:', error?.stack);
    // Return empty array as fallback
    return [];
  }
}

export default function CreatePipelinePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);

  // Get repo info from URL params
  const repoUrl = searchParams.get('repoUrl');
  const repoFullName = searchParams.get('repoFullName');
  const repoName = searchParams.get('repoName');
  const githubToken = searchParams.get('token') || (session?.githubAccessToken as string);

  useEffect(() => {
    if (!repoUrl || !repoFullName) {
      setError('Missing repository information');
      setLoading(false);
      return;
    }

    generatePipeline();
  }, [repoUrl, repoFullName]);

  const generatePipeline = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('[CREATE-PIPELINE] Generating AI pipeline for:', repoFullName);

      const response = await fetch('/api/pipelines/generate-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          repoFullName,
          githubToken,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate pipeline');
      }

      const data = await response.json();
      console.log('[CREATE-PIPELINE] Pipeline generated successfully');

      // Parse YAML to extract proper stage structure
      const parsedStages = parseYAMLStages(data.pipeline.yaml);

      // Update pipeline data with parsed stages
      const enrichedData = {
        ...data,
        pipeline: {
          ...data.pipeline,
          stages: parsedStages,
        },
      };

      setPipelineData(enrichedData);
    } catch (err: any) {
      console.error('[CREATE-PIPELINE] Error:', err);
      setError(err.message || 'Failed to generate pipeline');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePipeline = async () => {
    if (!pipelineData) return;

    try {
      setIsDeploying(true);

      console.log('[CREATE-PIPELINE] Saving pipeline to MongoDB...');

      // Extract just stage names for MongoDB (which expects string[])
      const stageNames = pipelineData.pipeline.stages.map((stage: any) => stage.name);

      const response = await fetch('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: repoName || repoFullName?.split('/')[1] || 'pipeline',
          repo: repoName || 'Unknown',
          repoFullName: repoFullName,
          repoUrl: repoUrl,
          yaml: pipelineData.pipeline.yaml,
          content: pipelineData.pipeline.yaml,
          stages: stageNames, // Send only stage names as strings
          detection: pipelineData.detection,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save pipeline');
      }

      const result = await response.json();

      console.log('[CREATE-PIPELINE] Pipeline saved successfully:', result);

      toast.success('Pipeline saved successfully!', {
        duration: 3000,
        style: {
          background: 'hsl(var(--card))',
          color: 'hsl(var(--card-foreground))',
          border: '1px solid hsl(var(--border))',
        },
      });

      // Redirect to pipelines page after a short delay
      setTimeout(() => {
        router.push('/pipelines');
      }, 500);
    } catch (err: any) {
      console.error('[CREATE-PIPELINE] Save error:', err);
      toast.error(err.message || 'Failed to save pipeline', {
        duration: 4000,
        style: {
          background: 'hsl(var(--card))',
          color: 'hsl(var(--card-foreground))',
          border: '1px solid hsl(var(--border))',
        },
      });
    } finally {
      setIsDeploying(false);
    }
  };

  if (loading) {
    return (
      <AppLayout pipelineCount={0}>
        <div className="flex items-center justify-center min-h-[80vh]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center"
          >
            <div className="relative mb-6">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-muted border-t-primary mx-auto"></div>
            </div>
            <h3 className="text-xl font-semibold mb-2">Analyzing Repository</h3>
            <p className="text-muted-foreground text-sm">
              Amazon Nova AI is generating your pipeline...
            </p>
          </motion.div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout pipelineCount={0}>
        <div className="max-w-7xl mx-auto w-full p-6">
          <Card className="p-8 text-center">
            <FaSadTear className="text-6xl mb-4 mx-auto text-red-500" />
            <h2 className="text-2xl font-bold mb-2">Failed to Generate Pipeline</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => router.back()}>
              <FaArrowLeft className="mr-2" />
              Go Back
            </Button>
          </Card>
        </div>
      </AppLayout>
    );
  }

  if (!pipelineData) {
    return (
      <AppLayout pipelineCount={0}>
        <div className="max-w-7xl mx-auto w-full p-6">
          <Card className="p-8 text-center">
            <FaQuestionCircle className="text-6xl mb-4 mx-auto text-gray-400" />
            <h2 className="text-2xl font-bold mb-2">No Pipeline Data</h2>
            <p className="text-muted-foreground mb-6">Unable to load pipeline information</p>
            <Button onClick={() => router.back()}>
              <FaArrowLeft className="mr-2" />
              Go Back
            </Button>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout pipelineCount={0}>
      <div className="max-w-7xl mx-auto w-full p-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push('/repositories')}
            className="mb-4"
          >
            <FaArrowLeft className="mr-2" />
            Back to Repositories
          </Button>

          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-lg bg-green-500 flex items-center justify-center text-white">
              <FaCheck className="text-2xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Pipeline Generated Successfully!</h1>
              <p className="text-muted-foreground text-sm">
                Review your AI-generated pipeline for <span className="font-semibold text-foreground">{repoFullName}</span>
              </p>
            </div>
          </div>
        </motion.div>

        {/* Pipeline Visualization */}
        <PipelineVisualizationFlow
          yaml={pipelineData.pipeline.yaml}
          stages={pipelineData.pipeline.stages}
          detection={pipelineData.detection}
          onDeploy={() => {}}
          onEditYaml={() => {}}
          isDeploying={false}
          showActions={false}
        />

        {/* Save Button */}
        <Card className="p-6 mt-6">
          <div className="flex gap-4 justify-center flex-wrap">
            <Button
              variant="primary"
              size="lg"
              onClick={handleSavePipeline}
              disabled={isDeploying}
              className="min-w-[200px]"
            >
              {isDeploying ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <FaCheck className="mr-2" />
                  Save Pipeline
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => router.push('/repositories')}
            >
              <FaArrowLeft className="mr-2" />
              Discard
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-4 text-center">
            After saving, you can deploy this pipeline to AWS EC2 from the Pipelines page
          </p>
        </Card>
      </div>
    </AppLayout>
  );
}

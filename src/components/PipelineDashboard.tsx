'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Pipeline, PipelineStatus } from '@/types/pipeline';
import { FaGithub, FaClock, FaAws, FaProjectDiagram, FaTimes, FaPlus, FaRocket, FaCog, FaTrash, FaDownload, FaEye } from 'react-icons/fa';
import { Activity, GitBranch, TrendingUp, Zap } from 'lucide-react';
import PipelineVisualization from './PipelineVisualization';
import Modal from '@/components/ui/Modal';
import StatsCard from '@/components/ui/StatsCard';
import ActivityFeed from '@/components/ui/ActivityFeed';
import QuickActions from '@/components/ui/QuickActions';
import DeploymentModal from '@/components/DeploymentModal';
import DeploymentLogsModal from '@/components/DeploymentLogsModal';

interface SimplePipeline {
  id: string;
  name: string;
  repo: string;
  repoFullName: string;
  yaml: string;
  createdAt: Date;
}

interface PipelineDashboardProps {
  projectId?: string;
  pipelines?: SimplePipeline[];
}

export default function PipelineDashboard({ projectId, pipelines: propsPipelines = [] }: PipelineDashboardProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [filter, setFilter] = useState<'all' | 'created'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [deployingPipeline, setDeployingPipeline] = useState<string | null>(null);
  const [visualizingPipeline, setVisualizingPipeline] = useState<SimplePipeline | null>(null);
  const [detailsPipeline, setDetailsPipeline] = useState<SimplePipeline | null>(null);
  const [showNewPipelineInfo, setShowNewPipelineInfo] = useState(false);
  const [deploymentResult, setDeploymentResult] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: string;
    publicIp?: string;
    instanceId?: string;
    appPort?: string;
    accessUrl?: string;
  } | null>(null);
  const [activities, setActivities] = useState<Array<{
    id: string;
    type: 'created' | 'deployed' | 'success' | 'failed';
    title: string;
    description: string;
    timestamp: Date;
  }>>([]);
  const [showDeploymentModal, setShowDeploymentModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedPipelineForDeploy, setSelectedPipelineForDeploy] = useState<SimplePipeline | null>(null);
  const [deploymentInfo, setDeploymentInfo] = useState<{
    deploymentId?: string;
    instanceId?: string;
    publicIp?: string;
    stages?: string[];
    trackingId?: string; // For real-time logs before deployment completes
    appPort?: string;
    accessUrl?: string;
  }>({});
  const [pipelineToDelete, setPipelineToDelete] = useState<SimplePipeline | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pipelines, setPipelines] = useState<SimplePipeline[]>(propsPipelines);

  // Update local state when props change
  useEffect(() => {
    setPipelines(propsPipelines);
  }, [propsPipelines]);

  // Generate activities from pipelines
  useEffect(() => {
    const newActivities = pipelines.map(pipeline => ({
      id: pipeline.id,
      type: 'created' as const,
      title: `Pipeline Created`,
      description: `${pipeline.name} for ${pipeline.repo}`,
      timestamp: pipeline.createdAt,
    }));
    setActivities(newActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
  }, [pipelines]);

  // Calculate stats
  const totalPipelines = pipelines.length;
  const recentPipelines = pipelines.filter(p => {
    const dayAgo = new Date();
    dayAgo.setDate(dayAgo.getDate() - 7);
    return new Date(p.createdAt) > dayAgo;
  }).length;

  const filteredPipelines = pipelines.filter(pipeline => {
    const matchesSearch =
      pipeline.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pipeline.repo.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const handleDeployClick = (pipeline: SimplePipeline) => {
    // Check if a deployment is already in progress
    if (deployingPipeline) {
      toast.error('A deployment is already in progress. Please wait for it to complete.', {
        duration: 4000,
        style: {
          background: 'hsl(var(--card))',
          color: 'hsl(var(--card-foreground))',
          border: '1px solid hsl(var(--border))',
        },
      });
      return;
    }

    setSelectedPipelineForDeploy(pipeline);
    setShowDeploymentModal(true);
  };

  const handleDeploy = async (envVars: Record<string, string>) => {
    if (!selectedPipelineForDeploy) return;

    // Prevent multiple deployments
    if (deployingPipeline) {
      toast.error('A deployment is already in progress.', {
        duration: 4000,
        style: {
          background: 'hsl(var(--card))',
          color: 'hsl(var(--card-foreground))',
          border: '1px solid hsl(var(--border))',
        },
      });
      return;
    }

    const pipeline = selectedPipelineForDeploy;

    try {
      // Set deploying state IMMEDIATELY to prevent multiple clicks
      setDeployingPipeline(pipeline.id);

      // Generate tracking ID for real-time logs
      const trackingId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log('[PIPELINE] Generated tracking ID:', trackingId);

      // Set tracking ID immediately for logs modal
      setDeploymentInfo({ trackingId });

      // Save env vars with pipeline for future deployments
      if (Object.keys(envVars).length > 0) {
        try {
          await fetch(`/api/pipelines?id=${pipeline.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ envVars }),
          });
          console.log('[PIPELINE] Environment variables saved');
        } catch (error) {
          console.error('[PIPELINE] Failed to save env vars:', error);
        }
      }

      // Close env modal and open logs modal
      setShowDeploymentModal(false);
      setShowLogsModal(true);

      // Add deployment activity
      setActivities(prev => [{
        id: `deploy-${Date.now()}`,
        type: 'deployed',
        title: 'Deployment Started',
        description: `Deploying ${pipeline.name} to EC2`,
        timestamp: new Date(),
      }, ...prev]);

      // toast.loading(`Deploying ${pipeline.name} to EC2...`, {
      //   id: 'deployment-toast',
      //   duration: Infinity,
      //   style: {
      //     background: 'hsl(var(--card))',
      //     color: 'hsl(var(--card-foreground))',
      //     border: '1px solid hsl(var(--border))',
      //   },
      // });

      const response = await fetch('/api/deploy/smart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pipelineName: pipeline.name,
          envVars: envVars,
          repoUrl: `https://github.com/${pipeline.repoFullName}.git`,
          repoFullName: pipeline.repoFullName,
          githubToken: session?.githubAccessToken || null,
          trackingId, // For real-time log streaming
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Deployment failed');
      }

      const result = await response.json();

      // Update deployment info for logs modal (merge with existing trackingId)
      setDeploymentInfo(prev => ({
        ...prev,
        deploymentId: result.deploymentId,
        instanceId: result.instanceId,
        publicIp: result.publicIp,
        stages: result.stages || [],
        appPort: result.appPort,
        accessUrl: result.accessUrl || result.httpUrl,
      }));

      // Add success activity
      setActivities(prev => [{
        id: `success-${Date.now()}`,
        type: 'success',
        title: 'Deployment Successful',
        description: `${pipeline.name} (${result.projectType || 'Auto-detected'}) deployed to EC2`,
        timestamp: new Date(),
      }, ...prev]);

      toast.success(`Successfully deployed ${pipeline.name} to EC2!`, {
        id: 'deployment-toast',
        duration: 4000,
        style: {
          background: 'hsl(var(--card))',
          color: 'hsl(var(--card-foreground))',
          border: '1px solid hsl(var(--border))',
        },
      });

      // Keep logs modal open to show completion
    } catch (error: any) {
      // Add failure activity
      setActivities(prev => [{
        id: `failed-${Date.now()}`,
        type: 'failed',
        title: 'Deployment Failed',
        description: `Failed to deploy ${pipeline.name}`,
        timestamp: new Date(),
      }, ...prev]);

      toast.error(error.message || 'Deployment failed', {
        id: 'deployment-toast',
        duration: 5000,
        style: {
          background: 'hsl(var(--card))',
          color: 'hsl(var(--card-foreground))',
          border: '1px solid hsl(var(--border))',
        },
      });

      setShowLogsModal(false);
      setDeploymentResult({
        type: 'error',
        message: 'Deployment failed',
        details: error.message,
      });
    } finally {
      setDeployingPipeline(null);
    }
  };

  const handleDeleteClick = (pipeline: SimplePipeline) => {
    setPipelineToDelete(pipeline);
  };

  const handleDeleteConfirm = async () => {
    if (!pipelineToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/pipelines?id=${pipelineToDelete.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete pipeline');
      }

      // Remove from local state
      setPipelines(prev => prev.filter(p => p.id !== pipelineToDelete.id));

      // Add activity
      setActivities(prev => [{
        id: `delete-${Date.now()}`,
        type: 'failed',
        title: 'Pipeline Deleted',
        description: `${pipelineToDelete.name} has been removed`,
        timestamp: new Date(),
      }, ...prev]);

      setPipelineToDelete(null);
    } catch (error: any) {
      setDeploymentResult({
        type: 'error',
        message: 'Failed to delete pipeline',
        details: error.message,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const quickActions = [
    {
      label: 'Create New Pipeline',
      icon: <FaPlus className="w-5 h-5" />,
      onClick: () => router.push('/repositories'),
    },
    {
      label: 'View All Repositories',
      icon: <FaGithub className="w-5 h-5" />,
      onClick: () => router.push('/repositories'),
    },
    {
      label: 'Deployment Settings',
      icon: <FaCog className="w-5 h-5" />,
      onClick: () => router.push('/settings'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Visualization Modal */}
      {visualizingPipeline && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-2xl font-bold">Pipeline Visualization</h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setVisualizingPipeline(null)}
              >
                <FaTimes />
              </Button>
            </div>
            <div className="p-6 overflow-auto max-h-[calc(90vh-80px)] scrollbar-thin">
              <PipelineVisualization
                yamlContent={visualizingPipeline.yaml}
                pipelineName={visualizingPipeline.name}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <Modal
        isOpen={showNewPipelineInfo}
        onClose={() => setShowNewPipelineInfo(false)}
        title="Create New Pipeline"
        type="info"
        size="md"
        actions={
          <Button type="button" variant="primary" onClick={() => setShowNewPipelineInfo(false)}>
            Got it
          </Button>
        }
      >
        <p className="text-gray-700 dark:text-gray-300">
          To create a new pipeline, go to the <strong>Repositories</strong> tab and select a repository.
        </p>
      </Modal>

      <Modal
        isOpen={!!deploymentResult}
        onClose={() => setDeploymentResult(null)}
        title={deploymentResult?.type === 'success' ? 'Deployment Successful' : 'Deployment Failed'}
        type={deploymentResult?.type || 'info'}
        size="md"
        actions={
          <Button type="button" variant="primary" onClick={() => setDeploymentResult(null)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="text-lg font-medium">{deploymentResult?.message}</p>

          {deploymentResult?.publicIp && (
            <div className="p-4 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">INSTANCE ID</p>
                  <p className="font-mono text-sm">{deploymentResult.instanceId}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">PUBLIC IP</p>
                  <p className="font-mono text-sm">{deploymentResult.publicIp}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">ACCESS YOUR APPLICATION</p>
                  <a
                    href={deploymentResult.accessUrl || (deploymentResult.appPort ? `http://${deploymentResult.publicIp}:${deploymentResult.appPort}` : `http://${deploymentResult.publicIp}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-lg font-semibold hover:from-cyan-600 hover:to-blue-600 transition-all shadow-lg hover:shadow-xl"
                  >
                    <FaRocket />
                    Open Deployed Application
                  </a>
                </div>
              </div>
            </div>
          )}

          {deploymentResult?.details && (
            <p className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
              {deploymentResult.details}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={!!detailsPipeline}
        onClose={() => setDetailsPipeline(null)}
        title={`Pipeline: ${detailsPipeline?.name || ''}`}
        type="default"
        size="lg"
        actions={
          <Button type="button" variant="secondary" onClick={() => setDetailsPipeline(null)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">YAML Configuration</h3>
            <pre className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm overflow-x-auto max-h-96 overflow-y-auto scrollbar-thin">
              {detailsPipeline?.yaml}
            </pre>
          </div>
        </div>
      </Modal>

      {/* Deployment Modals */}
      <DeploymentModal
        isOpen={showDeploymentModal}
        onClose={() => {
          setShowDeploymentModal(false);
          setSelectedPipelineForDeploy(null);
        }}
        onDeploy={handleDeploy}
        pipelineName={selectedPipelineForDeploy?.name || ''}
        repoFullName={selectedPipelineForDeploy?.repoFullName || ''}
        githubToken={session?.githubAccessToken || null}
        savedEnvVars={(selectedPipelineForDeploy as any)?.envVars}
        isDeploying={!!deployingPipeline}
        pipelineId={selectedPipelineForDeploy?.id}
      />

      <DeploymentLogsModal
        isOpen={showLogsModal}
        onClose={() => {
          setShowLogsModal(false);
          setSelectedPipelineForDeploy(null);
          setDeploymentInfo({});
        }}
        pipelineName={selectedPipelineForDeploy?.name || ''}
        deploymentId={deploymentInfo.deploymentId}
        instanceId={deploymentInfo.instanceId}
        trackingId={deploymentInfo.trackingId}
        publicIp={deploymentInfo.publicIp}
        pipelineStages={deploymentInfo.stages}
        useRealLogs={true}
        appPort={deploymentInfo.appPort}
        accessUrl={deploymentInfo.accessUrl}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!pipelineToDelete}
        onClose={() => setPipelineToDelete(null)}
        title="Delete Pipeline"
        type="default"
        size="md"
        actions={
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPipelineToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isDeleting ? 'Deleting...' : 'Delete Pipeline'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-foreground">
            Are you sure you want to delete the pipeline <strong>{pipelineToDelete?.name}</strong>?
          </p>
          <p className="text-sm text-muted-foreground">
            This action cannot be undone. The pipeline configuration will be permanently removed.
          </p>
          {pipelineToDelete && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs font-semibold text-muted-foreground mb-1">REPOSITORY</p>
              <p className="text-sm font-mono">{pipelineToDelete.repo}</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            CI/CD Pipelines
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and monitor your deployment pipelines
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={() => router.push('/repositories')}
          className="flex items-center gap-2"
        >
          <FaPlus /> New Pipeline
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard
          title="Total Pipelines"
          value={totalPipelines}
          description="All CI/CD pipelines"
          icon={GitBranch}
          iconColor="from-cyan-500 to-blue-500"
        />
        <StatsCard
          title="This Week"
          value={recentPipelines}
          description="New pipelines created"
          icon={TrendingUp}
          iconColor="from-green-500 to-emerald-500"
          trend={{
            value: 12,
            label: 'vs last week',
            isPositive: true,
          }}
        />
        <StatsCard
          title="Active Deploys"
          value={deployingPipeline ? 1 : 0}
          description="Currently deploying"
          icon={Zap}
          iconColor="from-orange-500 to-red-500"
        />
        <StatsCard
          title="Success Rate"
          value="98%"
          description="Deployment success"
          icon={Activity}
          iconColor="from-purple-500 to-pink-500"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Pipelines */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters */}
          <Card className="p-4">
            <div className="flex gap-4 items-center">
              <input
                type="text"
                placeholder="Search pipelines..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 px-4 py-2 border rounded-lg bg-background focus:ring-2 focus:ring-cyan-500 outline-none transition-all"
                data-testid="search-pipelines"
              />

              <div className="px-4 py-2 border rounded-lg bg-muted text-sm font-semibold">
                {pipelines.length} pipeline{pipelines.length !== 1 ? 's' : ''}
              </div>
            </div>
          </Card>

          {/* Pipeline List */}
          <div className="space-y-4">
            {filteredPipelines.length === 0 ? (
              <Card className="p-8 text-center text-gray-500 dark:text-gray-400 animate-fade-in-up">
                <div className="space-y-3">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center mx-auto">
                    <GitBranch className="w-8 h-8 text-white" />
                  </div>
                  <p className="font-semibold text-lg">No pipelines found</p>
                  <p className="text-sm">Create your first pipeline by going to the Repositories tab and selecting a repository.</p>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => router.push('/repositories')}
                    className="mt-4"
                  >
                    Get Started
                  </Button>
                </div>
              </Card>
            ) : (
              filteredPipelines.map((pipeline) => (
                <Card
                  key={pipeline.id}
                  className="p-6 hover:shadow-xl transition-all duration-300 hover:scale-[1.01] animate-fade-in-up"
                  data-testid={`pipeline-${pipeline.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse shadow-lg shadow-green-500/50" data-testid="status-badge" />
                        <h3 className="text-lg font-semibold" data-testid="pipeline-name">
                          {pipeline.name}
                        </h3>
                        {(() => {
                          const hoursSinceCreation = (Date.now() - new Date(pipeline.createdAt).getTime()) / (1000 * 60 * 60);
                          return hoursSinceCreation < 24 ? (
                            <span className="text-xs font-bold bg-gradient-to-r from-green-500 to-emerald-500 text-white px-2 py-1 rounded-full animate-pulse">
                              NEW
                            </span>
                          ) : null;
                        })()}
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full font-mono">
                          #{pipeline.id.slice(0, 8)}
                        </span>
                      </div>

                      <div className="flex items-center gap-6 text-sm text-muted-foreground">
                        <span className="flex items-center gap-2">
                          <FaGithub className="text-cyan-500" />
                          <span className="font-semibold text-foreground">{pipeline.repoFullName}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <FaClock className="text-blue-500" /> {new Date(pipeline.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setVisualizingPipeline(pipeline)}
                        className="w-9 h-9"
                        title="Visualize Pipeline"
                      >
                        <FaEye className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const blob = new Blob([pipeline.yaml], { type: 'text/yaml' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${pipeline.name}.yml`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                        }}
                        className="w-9 h-9"
                        title="Download YAML"
                      >
                        <FaDownload className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="icon"
                        onClick={() => handleDeployClick(pipeline)}
                        disabled={!!deployingPipeline}
                        className="w-9 h-9"
                        title={deployingPipeline === pipeline.id ? 'Deploying...' : deployingPipeline ? 'Another deployment in progress' : 'Deploy to AWS'}
                      >
                        {deployingPipeline === pipeline.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        ) : (
                          <FaAws className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteClick(pipeline)}
                        className="w-9 h-9 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                        title="Delete Pipeline"
                      >
                        <FaTrash className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Right Column - Activity & Quick Actions */}
        <div className="space-y-6">
          <QuickActions actions={quickActions} />
          <ActivityFeed activities={activities} maxItems={8} />
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { FaServer, FaClock, FaCheck, FaTimes, FaExternalLinkAlt, FaGithub, FaAws } from 'react-icons/fa';
import AppLayout from '@/components/AppLayout';
import Loader from '@/components/Loader';

interface Deployment {
  _id: string;
  pipelineName: string;
  repoFullName: string;
  instanceId: string;
  publicIp: string;
  instanceType: string;
  region: string;
  status: 'deploying' | 'success' | 'failed';
  deployedAt: string;
  errorMessage?: string;
  envVarsCount: number;
  port?: number;
}

export default function DeploymentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed' | 'deploying'>('all');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/');
    }
  }, [status, router]);

  useEffect(() => {
    const loadDeployments = async () => {
      try {
        const response = await fetch('/api/deployments');
        if (response.ok) {
          const data = await response.json();
          setDeployments(data.deployments);
        }
      } catch (error) {
        console.error('Failed to load deployments:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (session) {
      loadDeployments();
    }
  }, [session]);

  if (status === 'loading' || isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader />
        </div>
      </AppLayout>
    );
  }

  const filteredDeployments = deployments.filter(d => filter === 'all' || d.status === filter);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <FaCheck className="text-green-500" />;
      case 'failed':
        return <FaTimes className="text-red-500" />;
      case 'deploying':
        return <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'failed':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'deploying':
        return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              Deployments
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              View and manage all your deployed applications
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={filter === 'all' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              All ({deployments.length})
            </Button>
            <Button
              type="button"
              variant={filter === 'success' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilter('success')}
            >
              Success ({deployments.filter(d => d.status === 'success').length})
            </Button>
            <Button
              type="button"
              variant={filter === 'failed' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setFilter('failed')}
            >
              Failed ({deployments.filter(d => d.status === 'failed').length})
            </Button>
          </div>
        </div>

        {/* Deployments List */}
        <div className="space-y-4">
          {filteredDeployments.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="space-y-4">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center mx-auto">
                  <FaServer className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-xl font-semibold">No deployments found</h3>
                <p className="text-muted-foreground">
                  {filter === 'all'
                    ? 'Deploy a pipeline to see your deployments here.'
                    : `No ${filter} deployments found.`}
                </p>
                {filter === 'all' && (
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => router.push('/pipelines')}
                    className="mt-4"
                  >
                    Go to Pipelines
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            filteredDeployments.map((deployment) => (
              <Card
                key={deployment._id}
                className="p-6 hover:shadow-xl transition-all duration-300 animate-fade-in-up"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-3">
                    {/* Header */}
                    <div className="flex items-center gap-3">
                      {getStatusIcon(deployment.status)}
                      <h3 className="text-lg font-semibold">{deployment.pipelineName}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(deployment.status)}`}>
                        {deployment.status.toUpperCase()}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground mb-1">Repository</p>
                        <div className="flex items-center gap-2">
                          <FaGithub className="text-cyan-500" />
                          <span className="font-mono text-xs">{deployment.repoFullName}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Instance</p>
                        <div className="flex items-center gap-2">
                          <FaAws className="text-orange-500" />
                          <span className="font-mono text-xs">{deployment.instanceId}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Type & Region</p>
                        <span className="font-mono text-xs">{deployment.instanceType} - {deployment.region}</span>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Deployed</p>
                        <div className="flex items-center gap-2">
                          <FaClock className="text-blue-500" />
                          <span className="text-xs">{new Date(deployment.deployedAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Error Message */}
                    {deployment.errorMessage && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-xs text-red-400">
                          <strong>Error:</strong> {deployment.errorMessage}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {deployment.status === 'success' && deployment.publicIp && (
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        const url = deployment.port ? `http://${deployment.publicIp}:${deployment.port}` : `http://${deployment.publicIp}`;
                        window.open(url, '_blank');
                      }}
                      className="flex items-center gap-2"
                    >
                      <FaExternalLinkAlt className="w-3 h-3" />
                      Open App
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}

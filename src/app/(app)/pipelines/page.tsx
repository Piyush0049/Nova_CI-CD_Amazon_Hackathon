'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Loader from '@/components/Loader';
import PipelineDashboard from '@/components/PipelineDashboard';
import PipelineGeneratorView from '@/components/PipelineGeneratorView';
import AppLayout from '@/components/AppLayout';

export default function PipelinesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const repoParam = searchParams.get('repo');
  const [createdPipelines, setCreatedPipelines] = useState<Array<{
    id: string;
    name: string;
    repo: string;
    repoFullName: string;
    yaml: string;
    createdAt: Date;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<{
    name: string;
    full_name: string;
    html_url: string;
    description?: string;
    language?: string;
    default_branch?: string;
  } | null>(null);
  const [accessToken, setAccessToken] = useState('');

  // Check if user logged in with GitHub and automatically connect
  useEffect(() => {
    if (session?.githubAccessToken) {
      setAccessToken(session.githubAccessToken as string);
    }
  }, [session]);

  // Load pipelines from MongoDB
  useEffect(() => {
    const loadPipelines = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/pipelines', {
          cache: 'no-store', // Prevent caching to always get fresh data
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        if (response.ok) {
          const data = await response.json();
          setCreatedPipelines(data.pipelines.map((p: any) => ({
            id: p._id,
            name: p.name,
            repo: p.repo,
            repoFullName: p.repoFullName,
            yaml: p.yaml,
            createdAt: new Date(p.createdAt),
          })));
        }
      } catch (error) {
        console.error('Failed to load pipelines:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (session && !repoParam) {
      // Reload pipelines when viewing the main pipelines page (not in generator view)
      loadPipelines();
    }
  }, [session, repoParam]); // Added repoParam as dependency to reload when returning from generator

  // Handle repo parameter from URL
  useEffect(() => {
    if (repoParam) {
      // Parse repo name to create a minimal repo object
      const repoName = repoParam.split('/').pop() || repoParam;
      setSelectedRepo({
        name: repoName,
        full_name: repoParam,
        html_url: `https://github.com/${repoParam}`,
      });
    } else {
      setSelectedRepo(null);
    }
  }, [repoParam]);

  const handleBackToRepos = () => {
    router.push('/repositories');
  };

  const handlePipelineCreated = async (pipelineName: string) => {
    // Reload pipelines and navigate back to pipeline list
    try {
      const response = await fetch('/api/pipelines');
      if (response.ok) {
        const data = await response.json();
        setCreatedPipelines(data.pipelines.map((p: any) => ({
          id: p._id,
          name: p.name,
          repo: p.repo,
          repoFullName: p.repoFullName,
          yaml: p.yaml,
          createdAt: new Date(p.createdAt),
        })));
      }
    } catch (error) {
      console.error('Failed to reload pipelines:', error);
    }
    router.push('/pipelines');
  };

  if (status === "loading") {
    return <Loader text="Synchronizing Session" />;
  }

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  return (
    <AppLayout pipelineCount={createdPipelines.length}>
      <div className="max-w-7xl mx-auto w-full p-6">
        {isLoading ? (
          <Loader text="Loading Pipelines" />
        ) : selectedRepo ? (
          <PipelineGeneratorView
            repo={selectedRepo}
            accessToken={accessToken}
            onBack={handleBackToRepos}
            onPipelineCreated={handlePipelineCreated}
          />
        ) : (
          <PipelineDashboard pipelines={createdPipelines} />
        )}
      </div>
    </AppLayout>
  );
}

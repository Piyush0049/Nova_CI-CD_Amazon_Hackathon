'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Github } from 'lucide-react';
import { FiZap } from 'react-icons/fi';
import Loader from '@/components/Loader';
import GitHubRepoSelector from '@/components/GitHubRepoSelector';
import AppLayout from '@/components/AppLayout';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  language: string;
  html_url: string;
  updated_at: string;
  private: boolean;
}

export default function RepositoriesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [createdPipelines, setCreatedPipelines] = useState<Array<{
    id: string;
    name: string;
    repo: string;
    repoFullName: string;
    yaml: string;
    createdAt: Date;
  }>>([]);
  const [githubConnected, setGithubConnected] = useState(false);
  const [accessToken, setAccessToken] = useState('');


  // Check if user logged in with GitHub and automatically connect
  useEffect(() => {
    if (session?.githubAccessToken) {
      setAccessToken(session.githubAccessToken as string);
      setGithubConnected(true);
    }
  }, [session]);

  // Load pipelines from MongoDB
  useEffect(() => {
    const loadPipelines = async () => {
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
        console.error('Failed to load pipelines:', error);
      }
    };

    if (session) {
      loadPipelines();
    }
  }, [session]);

  const handleGitHubConnect = () => {
    // In production, this would initiate OAuth flow
    // For demo, we'll simulate the connection
    const demoToken = 'demo_github_token_' + Date.now();
    setAccessToken(demoToken);
    setGithubConnected(true);
  };

  /**
   * Handle repository selection - Navigate to pipeline creation page
   */
  const handleRepoSelect = (repo: GitHubRepo) => {
    // Navigate to dedicated pipeline creation page with repo info
    const params = new URLSearchParams({
      repoUrl: repo.html_url,
      repoFullName: repo.full_name,
      repoName: repo.name,
      token: accessToken,
    });

    router.push(`/pipelines/create?${params.toString()}`);
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
        {!githubConnected ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="max-w-md w-full space-y-6 text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-900 to-gray-700 dark:from-gray-100 dark:to-gray-300 flex items-center justify-center mx-auto shadow-xl">
                <Github className="w-10 h-10 text-white dark:text-gray-900" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-2">Connect GitHub Account</h2>
                <p className="text-muted-foreground">
                  Connect your GitHub account to automatically create AI-powered CI/CD pipelines
                  for your repositories using Claude 4.6 Sonnet
                </p>
              </div>
              <button
                onClick={handleGitHubConnect}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-semibold hover:bg-gray-800 dark:hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl"
              >
                <Github className="w-5 h-5" />
                Connect with GitHub
              </button>
              <p className="text-xs text-muted-foreground">
                We&apos;ll analyze your repositories and generate optimized CI/CD pipelines with AI
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* AI-Powered Banner */}
             
            <GitHubRepoSelector
              onSelectRepo={handleRepoSelect}
              accessToken={accessToken}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}

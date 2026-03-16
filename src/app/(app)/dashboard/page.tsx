'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Loader from '@/components/Loader';
import DashboardOverview from '@/components/DashboardOverview';
import AppLayout from '@/components/AppLayout';

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [createdPipelines, setCreatedPipelines] = useState<Array<{
    id: string;
    name: string;
    repo: string;
    yaml: string;
    createdAt: Date;
  }>>([]);

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
        <DashboardOverview
          pipelineCount={createdPipelines.length}
          onNavigateToRepos={() => router.push('/repositories')}
          onNavigateToPipelines={() => router.push('/pipelines')}
        />
      </div>
    </AppLayout>
  );
}

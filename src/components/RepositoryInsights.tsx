'use client';

import { Card } from './ui/Card';
import MetricCard from './ui/MetricCard';
import { FaGithub, FaCodeBranch, FaCode, FaClock } from 'react-icons/fa';
import { GitCommit, GitPullRequest, Star } from 'lucide-react';

interface RepositoryInsightsProps {
  totalRepos: number;
  activeBranches: number;
  totalCommits: number;
  avgBuildTime: string;
}

export default function RepositoryInsights({
  totalRepos,
  activeBranches,
  totalCommits,
  avgBuildTime,
}: RepositoryInsightsProps) {
  return (
    <div className="space-y-4 animate-fade-in-up">
      <h3 className="text-lg font-semibold mb-4">Repository Insights</h3>

      <div className="grid grid-cols-1 gap-4">
        <MetricCard
          title="Total Repositories"
          value={totalRepos}
          subtitle="Connected to platform"
          icon={<FaGithub className="w-5 h-5" />}
          color="from-gray-700 to-gray-900"
        />

        <MetricCard
          title="Active Branches"
          value={activeBranches}
          subtitle="Across all repositories"
          icon={<GitCommit className="w-5 h-5" />}
          color="from-cyan-500 to-blue-500"
          trend={{ value: 8, isPositive: true }}
        />

        <MetricCard
          title="Total Commits"
          value={totalCommits}
          subtitle="This month"
          icon={<FaCode className="w-5 h-5" />}
          color="from-green-500 to-emerald-500"
          progress={{
            value: 150,
            max: 200,
            label: '150/200 target',
          }}
        />

        <MetricCard
          title="Avg Build Time"
          value={avgBuildTime}
          subtitle="Last 30 deployments"
          icon={<FaClock className="w-5 h-5" />}
          color="from-orange-500 to-red-500"
          trend={{ value: 15, isPositive: false }}
        />
      </div>
    </div>
  );
}

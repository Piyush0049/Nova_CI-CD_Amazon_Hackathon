'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from './ui/Card';
import Button from './ui/Button';
import { FaGithub, FaRocket, FaCode, FaChartLine, FaQuestionCircle } from 'react-icons/fa';
import { GitBranch, Zap, Activity, TrendingUp, Sparkles } from 'lucide-react';
import StatsCard from './ui/StatsCard';
import GettingStartedGuide from './GettingStartedGuide';
import RecentDeployments from './RecentDeployments';
import RepositoryInsights from './RepositoryInsights';
import PerformanceChart from './PerformanceChart';

interface DashboardOverviewProps {
  pipelineCount: number;
  onNavigateToRepos: () => void;
  onNavigateToPipelines: () => void;
}

export default function DashboardOverview({
  pipelineCount,
  onNavigateToRepos,
  onNavigateToPipelines,
}: DashboardOverviewProps) {
  const router = useRouter();
  const [showGuide, setShowGuide] = useState(false);

  return (
    <>
      {showGuide && (
        <GettingStartedGuide
          onClose={() => setShowGuide(false)}
          onNavigateToRepos={onNavigateToRepos}
        />
      )}
      <div className="space-y-8 animate-fade-in-up">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-600 p-8 md:p-12 shadow-2xl">
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center animate-bounce-in">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white mb-1">
                Welcome to Nova CI/CD
              </h1>
              <p className="text-cyan-100 text-lg">
                Automate your deployment pipeline with AI-powered intelligence
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-6">
            <Button
              type="button"
              variant="default"
              onClick={onNavigateToRepos}
              className="bg-white/20 backdrop-blur-sm hover:bg-white/30 border border-white/30 text-white shadow-lg"
            >
              <FaGithub className="mr-2" /> Browse Repositories
            </Button>
            {pipelineCount > 0 && (
              <Button
                type="button"
                variant="default"
                onClick={onNavigateToPipelines}
                className="bg-white/20 backdrop-blur-sm hover:bg-white/30 border border-white/30 text-white shadow-lg"
              >
                <FaRocket className="mr-2" /> View Pipelines ({pipelineCount})
              </Button>
            )}
            <Button
              type="button"
              variant="default"
              onClick={() => setShowGuide(true)}
              className="bg-white/20 backdrop-blur-sm hover:bg-white/30 border border-white/30 text-white shadow-lg"
            >
              <FaQuestionCircle className="mr-2" /> Quick Start Guide
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Active Pipelines"
          value={pipelineCount}
          description="Total pipelines created"
          icon={GitBranch}
          iconColor="from-cyan-500 to-blue-500"
        />
        <StatsCard
          title="Quick Deploy"
          value="<5min"
          description="Average deployment time"
          icon={Zap}
          iconColor="from-orange-500 to-red-500"
        />
        <StatsCard
          title="Success Rate"
          value="99.9%"
          description="Pipeline reliability"
          icon={Activity}
          iconColor="from-green-500 to-emerald-500"
          trend={{
            value: 2.5,
            label: 'vs last month',
            isPositive: true,
          }}
        />
        <StatsCard
          title="AI Powered"
          value="100%"
          description="Smart optimizations"
          icon={TrendingUp}
          iconColor="from-purple-500 to-pink-500"
        />
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="p-6 hover:scale-[1.02] transition-all duration-300 animate-fade-in-up">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center mb-4 shadow-lg">
            <FaGithub className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-semibold mb-2">GitHub Integration</h3>
          <p className="text-muted-foreground text-sm">
            Seamlessly connect your repositories and automatically generate CI/CD pipelines with intelligent analysis.
          </p>
        </Card>

        <Card className="p-6 hover:scale-[1.02] transition-all duration-300 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-4 shadow-lg">
            <FaRocket className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-semibold mb-2">One-Click Deploy</h3>
          <p className="text-muted-foreground text-sm">
            Deploy to AWS EC2 instances with a single click. Fully automated provisioning and configuration.
          </p>
        </Card>

        <Card className="p-6 hover:scale-[1.02] transition-all duration-300 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-4 shadow-lg">
            <FaCode className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Smart Pipeline Builder</h3>
          <p className="text-muted-foreground text-sm">
            AI-powered pipeline generation that understands your project structure and creates optimized workflows.
          </p>
        </Card>

        <Card className="p-6 hover:scale-[1.02] transition-all duration-300 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center mb-4 shadow-lg">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Real-time Monitoring</h3>
          <p className="text-muted-foreground text-sm">
            Track your deployments in real-time with detailed logs and activity feeds for complete visibility.
          </p>
        </Card>

        <Card className="p-6 hover:scale-[1.02] transition-all duration-300 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center mb-4 shadow-lg">
            <FaChartLine className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Analytics & Insights</h3>
          <p className="text-muted-foreground text-sm">
            Gain insights into your deployment patterns, success rates, and performance metrics at a glance.
          </p>
        </Card>

        <Card className="p-6 hover:scale-[1.02] transition-all duration-300 animate-fade-in-up" style={{ animationDelay: '500ms' }}>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center mb-4 shadow-lg">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Nova AI Assistant</h3>
          <p className="text-muted-foreground text-sm">
            Chat with our AI assistant to create custom pipelines, troubleshoot issues, and optimize your workflow.
          </p>
        </Card>
      </div>

      {/* Performance Chart */}
      {pipelineCount > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PerformanceChart />

          {/* Popular Repositories Card */}
          <Card className="p-6 animate-fade-in-up">
            <h3 className="text-lg font-semibold mb-4">Most Active Pipelines</h3>
            <div className="space-y-3">
              {[
                { name: 'web-application', deploys: 124, color: 'from-cyan-500 to-blue-500' },
                { name: 'api-microservice', deploys: 98, color: 'from-green-500 to-emerald-500' },
                { name: 'mobile-frontend', deploys: 87, color: 'from-purple-500 to-pink-500' },
                { name: 'backend-service', deploys: 76, color: 'from-orange-500 to-red-500' },
              ].map((pipeline, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-all duration-300 hover:scale-[1.02] cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${pipeline.color} shadow-lg`} />
                    <span className="font-medium text-sm">{pipeline.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{pipeline.deploys} deployments</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Activity and Insights Section */}
      {pipelineCount > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Deployments Timeline */}
          <div className="lg:col-span-2">
            <RecentDeployments
              deployments={[
                {
                  id: '1',
                  pipelineName: 'web-app-pipeline',
                  repo: 'company/web-app',
                  status: 'success',
                  timestamp: new Date(Date.now() - 10 * 60000),
                },
                {
                  id: '2',
                  pipelineName: 'api-service-pipeline',
                  repo: 'company/api-service',
                  status: 'success',
                  timestamp: new Date(Date.now() - 45 * 60000),
                },
                {
                  id: '3',
                  pipelineName: 'mobile-app-pipeline',
                  repo: 'company/mobile-app',
                  status: 'pending',
                  timestamp: new Date(Date.now() - 5 * 60000),
                },
                {
                  id: '4',
                  pipelineName: 'backend-api-pipeline',
                  repo: 'company/backend-api',
                  status: 'success',
                  timestamp: new Date(Date.now() - 120 * 60000),
                },
              ]}
            />
          </div>

          {/* Repository Insights */}
          <div>
            <RepositoryInsights
              totalRepos={pipelineCount}
              activeBranches={pipelineCount * 3}
              totalCommits={150}
              avgBuildTime="4m 32s"
            />
          </div>
        </div>
      )}

      {/* Quick Stats Bar */}
      {pipelineCount > 0 && (
        <Card className="p-6 bg-gradient-to-br from-cyan-500/5 via-blue-500/5 to-purple-500/5 border border-cyan-500/20">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent mb-1">
                {pipelineCount * 12}
              </div>
              <div className="text-xs text-muted-foreground">Total Deployments</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent mb-1">
                {pipelineCount * 8}
              </div>
              <div className="text-xs text-muted-foreground">Successful Builds</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent mb-1">
                4m 32s
              </div>
              <div className="text-xs text-muted-foreground">Avg Build Time</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent mb-1">
                99.8%
              </div>
              <div className="text-xs text-muted-foreground">Uptime</div>
            </div>
          </div>
        </Card>
      )}

      {/* Getting Started */}
      {pipelineCount === 0 && (
        <Card className="p-8 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-2 border-cyan-500/20 animate-fade-in-up">
          <div className="flex items-start gap-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center flex-shrink-0 animate-pulse-scale">
              <GitBranch className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-bold mb-2">Ready to get started?</h3>
              <p className="text-muted-foreground mb-4">
                Create your first CI/CD pipeline in minutes. Connect your GitHub repository and let our AI do the heavy lifting.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="primary"
                  onClick={onNavigateToRepos}
                  className="flex items-center gap-2"
                >
                  <FaGithub /> Connect GitHub Repository
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
      </div>
    </>
  );
}

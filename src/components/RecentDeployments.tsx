'use client';

import Timeline from './ui/Timeline';
import { FaRocket, FaCheckCircle, FaTimesCircle, FaClock } from 'react-icons/fa';

interface Deployment {
  id: string;
  pipelineName: string;
  repo: string;
  status: 'success' | 'failed' | 'pending';
  timestamp: Date;
}

interface RecentDeploymentsProps {
  deployments: Deployment[];
}

export default function RecentDeployments({ deployments }: RecentDeploymentsProps) {
  const timelineItems = deployments.map(deployment => {
    let icon;
    let status: 'success' | 'error' | 'pending' = 'info';

    switch (deployment.status) {
      case 'success':
        icon = <FaCheckCircle className="w-5 h-5 text-green-500" />;
        status = 'success';
        break;
      case 'failed':
        icon = <FaTimesCircle className="w-5 h-5 text-red-500" />;
        status = 'error';
        break;
      case 'pending':
        icon = <FaClock className="w-5 h-5 text-orange-500 animate-pulse" />;
        status = 'pending';
        break;
      default:
        icon = <FaRocket className="w-5 h-5 text-cyan-500" />;
    }

    return {
      id: deployment.id,
      title: `Deployed ${deployment.pipelineName}`,
      description: `Repository: ${deployment.repo}`,
      timestamp: deployment.timestamp,
      icon,
      status,
    };
  });

  return <Timeline items={timelineItems} title="Recent Deployments" maxItems={8} />;
}

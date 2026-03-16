// Core CI/CD Pipeline Types

export type PipelineStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'skipped';
export type JobStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'skipped';
export type StageStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'skipped';

export interface PipelineVariable {
  key: string;
  value: string;
  protected?: boolean;
  masked?: boolean;
}

export interface PipelineArtifact {
  name: string;
  path: string;
  expire_in?: string;
  when?: 'on_success' | 'on_failure' | 'always';
}

export interface PipelineCache {
  key: string;
  paths: string[];
  policy?: 'pull' | 'push' | 'pull-push';
}

export interface JobScript {
  before_script?: string[];
  script: string[];
  after_script?: string[];
}

export interface Job extends JobScript {
  id: string;
  name: string;
  stage: string;
  image?: string;
  services?: string[];
  variables?: Record<string, string>;
  artifacts?: PipelineArtifact;
  cache?: PipelineCache;
  only?: string[];
  except?: string[];
  when?: 'on_success' | 'on_failure' | 'always' | 'manual';
  allow_failure?: boolean;
  timeout?: string;
  retry?: number | { max: number; when: string[] };
  tags?: string[];
  dependencies?: string[];
  needs?: string[];

  // Runtime fields
  status: JobStatus;
  startedAt?: Date;
  finishedAt?: Date;
  duration?: number;
  logs?: string[];
  exitCode?: number;
  runner?: string;
}

export interface Stage {
  id: string;
  name: string;
  jobs: Job[];
  status: StageStatus;
  startedAt?: Date;
  finishedAt?: Date;
  duration?: number;
}

export interface Pipeline {
  id: string;
  name: string;
  project: string;
  branch: string;
  commit: {
    sha: string;
    message: string;
    author: string;
    timestamp: Date;
  };
  stages: Stage[];
  status: PipelineStatus;
  variables?: PipelineVariable[];
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  duration?: number;
  triggeredBy: 'push' | 'merge_request' | 'schedule' | 'manual' | 'webhook';
  user: string;
}

export interface PipelineConfig {
  image?: string;
  services?: string[];
  variables?: Record<string, string>;
  before_script?: string[];
  after_script?: string[];
  stages: string[];
  cache?: PipelineCache;
  artifacts?: PipelineArtifact;

  // Jobs are defined dynamically
  [key: string]: any;
}

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  language: string;
  framework?: string;
  config: string; // YAML content
  tags: string[];
  popular: boolean;
}

export interface Runner {
  id: string;
  name: string;
  description: string;
  status: 'online' | 'offline' | 'paused';
  ip_address?: string;
  tags: string[];
  concurrent_jobs: number;
  current_jobs: number;
  last_contact?: Date;
  version?: string;
  platform?: string;
  architecture?: string;
}

export interface PipelineLog {
  pipelineId: string;
  jobId: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
}

export interface WebhookEvent {
  id: string;
  type: 'push' | 'pull_request' | 'tag' | 'release';
  repository: string;
  branch: string;
  commit: {
    sha: string;
    message: string;
    author: string;
  };
  timestamp: Date;
  payload: any;
}

export interface PipelineMetrics {
  totalPipelines: number;
  successRate: number;
  averageDuration: number;
  failureRate: number;
  runningPipelines: number;
  queuedPipelines: number;
}

export interface BuildArtifact {
  id: string;
  pipelineId: string;
  jobId: string;
  name: string;
  size: number;
  path: string;
  createdAt: Date;
  expiresAt?: Date;
  downloadUrl?: string;
}

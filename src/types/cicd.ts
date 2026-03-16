// Extended CI/CD Types for Platform Features

export interface Project {
  id: string;
  name: string;
  description: string;
  repository: string;
  defaultBranch: string;
  visibility: 'private' | 'internal' | 'public';
  createdAt: Date;
  updatedAt: Date;
  owner: string;
  ciEnabled: boolean;
  autoDevops: boolean;
}

export interface Environment {
  id: string;
  name: string;
  project: string;
  url?: string;
  status: 'available' | 'stopped' | 'deploying';
  lastDeployment?: {
    id: string;
    createdAt: Date;
    user: string;
  };
}

export interface Deployment {
  id: string;
  environment: string;
  pipelineId: string;
  jobId: string;
  status: 'created' | 'running' | 'success' | 'failed' | 'cancelled';
  deployedAt?: Date;
  user: string;
}

export interface Secret {
  id: string;
  key: string;
  value: string; // encrypted
  scope: 'project' | 'group' | 'instance';
  projectId?: string;
  masked: boolean;
  protected: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineSchedule {
  id: string;
  description: string;
  project: string;
  ref: string;
  cron: string;
  timezone: string;
  active: boolean;
  nextRunAt?: Date;
  lastPipeline?: {
    id: string;
    status: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface TestReport {
  id: string;
  pipelineId: string;
  jobId: string;
  name: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: number;
  suites: TestSuite[];
}

export interface TestSuite {
  name: string;
  tests: TestCase[];
  duration: number;
}

export interface TestCase {
  name: string;
  classname?: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  failure?: {
    message: string;
    type: string;
    stacktrace?: string;
  };
}

export interface CodeQualityReport {
  id: string;
  pipelineId: string;
  jobId: string;
  issues: CodeQualityIssue[];
  summary: {
    blocker: number;
    critical: number;
    major: number;
    minor: number;
    info: number;
  };
}

export interface CodeQualityIssue {
  description: string;
  severity: 'blocker' | 'critical' | 'major' | 'minor' | 'info';
  location: {
    path: string;
    lines: {
      begin: number;
      end?: number;
    };
  };
  check_name: string;
  fingerprint: string;
}

export interface CoverageReport {
  id: string;
  pipelineId: string;
  jobId: string;
  coverage: number;
  files: CoverageFile[];
}

export interface CoverageFile {
  path: string;
  coverage: number;
  lines: {
    total: number;
    covered: number;
  };
  branches?: {
    total: number;
    covered: number;
  };
}

export interface RegistryImage {
  id: string;
  project: string;
  name: string;
  tag: string;
  digest: string;
  size: number;
  createdAt: Date;
  pushedBy: string;
}

export interface PipelineGraph {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}

export interface PipelineNode {
  id: string;
  name: string;
  type: 'job' | 'stage';
  status: string;
}

export interface PipelineEdge {
  from: string;
  to: string;
  type: 'dependency' | 'stage_order';
}

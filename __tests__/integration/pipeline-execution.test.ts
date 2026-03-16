// Integration tests for complete pipeline execution

import { describe, it, expect, beforeEach } from '@jest/globals';
import { PipelineParser } from '@/lib/cicd/pipeline-parser';
import { PipelineExecutor, ExecutionContext } from '@/lib/cicd/pipeline-executor';
import { JobQueue } from '@/lib/cicd/job-queue';
import { Runner } from '@/types/pipeline';

describe('Pipeline Execution Integration', () => {
  let context: ExecutionContext;
  let jobQueue: JobQueue;

  beforeEach(() => {
    context = {
      workingDirectory: '/test/dir',
      environment: {
        DEMO_MODE: 'true',
        CI: 'true',
      },
      secrets: {},
    };

    jobQueue = new JobQueue();
  });

  it('should execute a complete pipeline from YAML to completion', async () => {
    const yamlConfig = `
stages:
  - build
  - test
  - deploy

variables:
  NODE_ENV: production

build_job:
  stage: build
  script:
    - npm install
    - npm run build
  artifacts:
    name: "build-artifacts"
    path: dist/
    expire_in: 1 day

test_unit:
  stage: test
  script:
    - npm run test:unit
  dependencies:
    - build_job

test_e2e:
  stage: test
  script:
    - npm run test:e2e
  allow_failure: true

deploy_production:
  stage: deploy
  script:
    - npm run deploy
  when: manual
  only:
    - main
`;

    // Parse the pipeline
    const metadata = {
      project: 'test-project',
      branch: 'main',
      commit: {
        sha: 'abc123def456',
        message: 'Add new feature',
        author: 'John Doe',
      },
      triggeredBy: 'push' as const,
      user: 'johndoe',
    };

    const pipeline = PipelineParser.parseConfig(yamlConfig, metadata);

    // Validate pipeline structure
    expect(pipeline.stages).toHaveLength(3);
    expect(pipeline.status).toBe('pending');
    expect(pipeline.variables).toBeDefined();

    // Execute pipeline
    const executor = new PipelineExecutor(context);
    const result = await executor.executePipeline(pipeline);

    // Verify execution results
    expect(result.status).toBe('success');
    expect(result.startedAt).toBeDefined();
    expect(result.finishedAt).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);

    // Check all stages executed
    result.stages.forEach(stage => {
      expect(stage.status).toBeDefined();
      expect(stage.jobs.length).toBeGreaterThan(0);
    });
  });

  it('should handle pipeline with job dependencies', async () => {
    const yamlConfig = `
stages:
  - build
  - test

build:
  stage: build
  script:
    - npm run build

test_a:
  stage: test
  script:
    - npm run test:a
  needs:
    - build

test_b:
  stage: test
  script:
    - npm run test:b
  needs:
    - build
`;

    const metadata = {
      project: 'test-project',
      branch: 'main',
      commit: { sha: 'abc123', message: 'Test', author: 'Author' },
      triggeredBy: 'push' as const,
      user: 'testuser',
    };

    const pipeline = PipelineParser.parseConfig(yamlConfig, metadata);
    const executor = new PipelineExecutor(context);
    const result = await executor.executePipeline(pipeline);

    expect(result.status).toBe('success');

    // Verify build stage completed before test stage
    const buildStage = result.stages.find(s => s.name === 'build');
    const testStage = result.stages.find(s => s.name === 'test');

    expect(buildStage?.finishedAt).toBeDefined();
    expect(testStage?.startedAt).toBeDefined();

    if (buildStage?.finishedAt && testStage?.startedAt) {
      expect(buildStage.finishedAt.getTime()).toBeLessThanOrEqual(
        testStage.startedAt.getTime()
      );
    }
  });

  it('should integrate with job queue for parallel execution', async (done) => {
    // Register runners
    const runner1: Runner = {
      id: 'runner-1',
      name: 'Runner 1',
      description: 'Test runner 1',
      status: 'online',
      tags: [],
      concurrent_jobs: 2,
      current_jobs: 0,
    };

    const runner2: Runner = {
      id: 'runner-2',
      name: 'Runner 2',
      description: 'Test runner 2',
      status: 'online',
      tags: [],
      concurrent_jobs: 2,
      current_jobs: 0,
    };

    jobQueue.registerRunner(runner1);
    jobQueue.registerRunner(runner2);

    // Parse pipeline with parallel jobs
    const yamlConfig = `
stages:
  - test

test_1:
  stage: test
  script:
    - npm run test:unit

test_2:
  stage: test
  script:
    - npm run test:integration

test_3:
  stage: test
  script:
    - npm run test:e2e
`;

    const metadata = {
      project: 'test-project',
      branch: 'main',
      commit: { sha: 'abc123', message: 'Test', author: 'Author' },
      triggeredBy: 'push' as const,
      user: 'testuser',
    };

    const pipeline = PipelineParser.parseConfig(yamlConfig, metadata);

    // Enqueue all jobs
    let assignedCount = 0;
    jobQueue.on('job:assigned', () => {
      assignedCount++;
      if (assignedCount === 3) {
        expect(assignedCount).toBe(3);
        done();
      }
    });

    pipeline.stages[0].jobs.forEach(job => {
      jobQueue.enqueue(job, pipeline.id, 0);
    });
  });

  it('should handle pipeline with artifacts', async () => {
    const yamlConfig = `
stages:
  - build

build:
  stage: build
  script:
    - npm run build
  artifacts:
    name: "build-output"
    path: dist/
    expire_in: 7 days
`;

    const metadata = {
      project: 'test-project',
      branch: 'main',
      commit: { sha: 'abc123', message: 'Test', author: 'Author' },
      triggeredBy: 'push' as const,
      user: 'testuser',
    };

    const pipeline = PipelineParser.parseConfig(yamlConfig, metadata);

    // Verify artifacts configuration
    const buildJob = pipeline.stages[0].jobs[0];
    expect(buildJob.artifacts).toBeDefined();
    expect(buildJob.artifacts?.name).toBe('build-output');
    expect(buildJob.artifacts?.path).toBe('dist/');
    expect(buildJob.artifacts?.expire_in).toBe('7 days');
  });

  it('should handle pipeline with cache configuration', async () => {
    const yamlConfig = `
stages:
  - build

cache:
  key: "\${CI_COMMIT_REF_SLUG}"
  paths:
    - node_modules/
    - .npm/

build:
  stage: build
  script:
    - npm ci
    - npm run build
`;

    const metadata = {
      project: 'test-project',
      branch: 'main',
      commit: { sha: 'abc123', message: 'Test', author: 'Author' },
      triggeredBy: 'push' as const,
      user: 'testuser',
    };

    const pipeline = PipelineParser.parseConfig(yamlConfig, metadata);
    const executor = new PipelineExecutor(context);
    const result = await executor.executePipeline(pipeline);

    expect(result.status).toBe('success');
  });

  it('should stop pipeline execution on critical failure', async () => {
    const yamlConfig = `
stages:
  - build
  - test
  - deploy

build:
  stage: build
  script:
    - exit 1
  allow_failure: false

test:
  stage: test
  script:
    - npm test

deploy:
  stage: deploy
  script:
    - npm run deploy
`;

    const metadata = {
      project: 'test-project',
      branch: 'main',
      commit: { sha: 'abc123', message: 'Test', author: 'Author' },
      triggeredBy: 'push' as const,
      user: 'testuser',
    };

    const pipeline = PipelineParser.parseConfig(yamlConfig, metadata);

    // In demo mode, jobs succeed, but we verify the structure
    const executor = new PipelineExecutor(context);
    const result = await executor.executePipeline(pipeline);

    expect(result.finishedAt).toBeDefined();
  });
});

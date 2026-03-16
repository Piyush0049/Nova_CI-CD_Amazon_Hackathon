// Pipeline Executor - Runs pipeline stages and jobs

import { Pipeline, Job, Stage, PipelineStatus, JobStatus } from '@/types/pipeline';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ExecutionContext {
  workingDirectory: string;
  environment: Record<string, string>;
  secrets: Record<string, string>;
}

export interface ExecutionCallback {
  onPipelineStart?: (pipeline: Pipeline) => void;
  onPipelineComplete?: (pipeline: Pipeline) => void;
  onStageStart?: (stage: Stage) => void;
  onStageComplete?: (stage: Stage) => void;
  onJobStart?: (job: Job) => void;
  onJobComplete?: (job: Job) => void;
  onJobLog?: (jobId: string, log: string) => void;
}

export class PipelineExecutor {
  private context: ExecutionContext;
  private callbacks: ExecutionCallback;
  private abortController: AbortController;

  constructor(context: ExecutionContext, callbacks: ExecutionCallback = {}) {
    this.context = context;
    this.callbacks = callbacks;
    this.abortController = new AbortController();
  }

  /**
   * Execute a complete pipeline
   */
  async executePipeline(pipeline: Pipeline): Promise<Pipeline> {
    console.log(`Starting pipeline ${pipeline.id} for ${pipeline.project}`);

    pipeline.status = 'running';
    pipeline.startedAt = new Date();
    this.callbacks.onPipelineStart?.(pipeline);

    try {
      // Execute stages sequentially
      for (const stage of pipeline.stages) {
        if (this.abortController.signal.aborted) {
          pipeline.status = 'cancelled';
          break;
        }

        await this.executeStage(stage);

        // If stage failed and job doesn't allow failure, stop pipeline
        if (stage.status === 'failed') {
          const hasBlockingFailure = stage.jobs.some(
            job => job.status === 'failed' && !job.allow_failure
          );

          if (hasBlockingFailure) {
            pipeline.status = 'failed';
            break;
          }
        }
      }

      // Determine final pipeline status
      if (pipeline.status !== 'cancelled') {
        const hasFailures = pipeline.stages.some(s => s.status === 'failed');
        pipeline.status = hasFailures ? 'failed' : 'success';
      }

    } catch (error) {
      console.error('Pipeline execution error:', error);
      pipeline.status = 'failed';
    } finally {
      pipeline.finishedAt = new Date();
      pipeline.duration = pipeline.finishedAt.getTime() - pipeline.startedAt!.getTime();
      this.callbacks.onPipelineComplete?.(pipeline);
    }

    return pipeline;
  }

  /**
   * Execute a stage (run all jobs in parallel)
   */
  private async executeStage(stage: Stage): Promise<void> {
    console.log(`Starting stage: ${stage.name}`);

    stage.status = 'running';
    stage.startedAt = new Date();
    this.callbacks.onStageStart?.(stage);

    try {
      // Separate jobs by dependencies
      const jobsWithDeps = stage.jobs.filter(j => j.needs && j.needs.length > 0);
      const jobsWithoutDeps = stage.jobs.filter(j => !j.needs || j.needs.length === 0);

      // Execute jobs without dependencies in parallel
      await Promise.all(
        jobsWithoutDeps.map(job => this.executeJob(job))
      );

      // Execute jobs with dependencies (simplified - in production, build dependency graph)
      for (const job of jobsWithDeps) {
        await this.executeJob(job);
      }

      // Determine stage status
      const hasFailures = stage.jobs.some(j => j.status === 'failed' && !j.allow_failure);
      stage.status = hasFailures ? 'failed' : 'success';

    } catch (error) {
      console.error(`Stage ${stage.name} error:`, error);
      stage.status = 'failed';
    } finally {
      stage.finishedAt = new Date();
      stage.duration = stage.finishedAt.getTime() - stage.startedAt!.getTime();
      this.callbacks.onStageComplete?.(stage);
    }
  }

  /**
   * Execute a single job
   */
  async executeJob(job: Job): Promise<void> {
    console.log(`Starting job: ${job.name}`);

    job.status = 'running';
    job.startedAt = new Date();
    job.logs = [];
    this.callbacks.onJobStart?.(job);

    try {
      // Prepare environment
      const env = {
        ...process.env,
        ...this.context.environment,
        ...this.context.secrets,
        ...job.variables,
        CI: 'true',
        CI_JOB_NAME: job.name,
        CI_JOB_STAGE: job.stage,
        CI_COMMIT_SHA: 'demo-sha',
      };

      // Execute before_script
      if (job.before_script) {
        await this.executeScripts(job, job.before_script, env, 'before_script');
      }

      // Execute main script
      await this.executeScripts(job, job.script, env, 'script');

      job.status = 'success';
      job.exitCode = 0;

    } catch (error: any) {
      console.error(`Job ${job.name} failed:`, error);

      job.status = 'failed';
      job.exitCode = error.code || 1;

      const errorMsg = `Job failed: ${error.message}`;
      job.logs?.push(errorMsg);
      this.callbacks.onJobLog?.(job.id, errorMsg);

    } finally {
      // Execute after_script (always runs)
      if (job.after_script) {
        try {
          const env = {
            ...process.env,
            ...this.context.environment,
            ...job.variables,
          };
          await this.executeScripts(job, job.after_script, env, 'after_script');
        } catch (error) {
          console.error('after_script failed:', error);
        }
      }

      job.finishedAt = new Date();
      job.duration = job.finishedAt.getTime() - job.startedAt!.getTime();
      this.callbacks.onJobComplete?.(job);
    }
  }

  /**
   * Execute a list of script commands
   */
  private async executeScripts(
    job: Job,
    scripts: string[],
    env: NodeJS.ProcessEnv,
    phase: string
  ): Promise<void> {
    for (const script of scripts) {
      if (this.abortController.signal.aborted) {
        throw new Error('Job cancelled');
      }

      const logMsg = `$ ${script}`;
      job.logs?.push(logMsg);
      this.callbacks.onJobLog?.(job.id, logMsg);

      try {
        // In demo mode, simulate execution
        if (this.context.environment.DEMO_MODE === 'true') {
          await this.simulateScriptExecution(job, script);
        } else {
          // Real execution
          const { stdout, stderr } = await execAsync(script, {
            cwd: this.context.workingDirectory,
            env,
            signal: this.abortController.signal,
          });

          if (stdout) {
            job.logs?.push(stdout);
            this.callbacks.onJobLog?.(job.id, stdout);
          }

          if (stderr) {
            job.logs?.push(stderr);
            this.callbacks.onJobLog?.(job.id, stderr);
          }
        }
      } catch (error: any) {
        const errorMsg = error.stderr || error.stdout || error.message;
        job.logs?.push(errorMsg);
        this.callbacks.onJobLog?.(job.id, errorMsg);
        throw error;
      }
    }
  }

  /**
   * Simulate script execution for demo mode
   */
  private async simulateScriptExecution(job: Job, script: string): Promise<void> {
    // Simulate execution time
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));

    // Simulate output based on command
    let output = '';

    if (script.includes('npm install') || script.includes('yarn install')) {
      output = 'Installing dependencies...\n✓ Dependencies installed successfully';
    } else if (script.includes('npm test') || script.includes('yarn test')) {
      output = 'Running tests...\n✓ 25 tests passed\n✓ Test suite completed';
    } else if (script.includes('npm run build') || script.includes('yarn build')) {
      output = 'Building project...\n✓ Build completed successfully\n✓ Output: dist/';
    } else if (script.includes('docker build')) {
      output = 'Building Docker image...\n✓ Image built successfully';
    } else if (script.includes('docker push')) {
      output = 'Pushing Docker image...\n✓ Image pushed to registry';
    } else if (script.includes('deploy') || script.includes('kubectl')) {
      output = 'Deploying application...\n✓ Deployment successful';
    } else if (script.includes('lint')) {
      output = 'Running linter...\n✓ No lint errors found';
    } else {
      output = `Executing: ${script}\n✓ Command completed successfully`;
    }

    job.logs?.push(output);
    this.callbacks.onJobLog?.(job.id, output);
  }

  /**
   * Cancel pipeline execution
   */
  cancel(): void {
    this.abortController.abort();
  }

  /**
   * Retry a failed job
   */
  async retryJob(job: Job): Promise<void> {
    console.log(`Retrying job: ${job.name}`);

    // Reset job state
    job.status = 'pending';
    job.startedAt = undefined;
    job.finishedAt = undefined;
    job.duration = undefined;
    job.logs = [];
    job.exitCode = undefined;

    // Execute job again
    await this.executeJob(job);
  }
}

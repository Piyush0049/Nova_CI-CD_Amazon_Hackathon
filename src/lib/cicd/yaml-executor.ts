/**
 * YAML Pipeline Executor
 * Executes CI/CD pipelines based on generated YAML configuration
 */

import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import * as yaml from 'yaml';

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export interface PipelineJob {
  name: string;
  stage: string;
  image?: string;
  script: string[];
  allowFailure?: boolean;
  artifacts?: {
    paths: string[];
    expireIn?: string;
  };
  variables?: Record<string, string>;
}

export interface ParsedPipeline {
  stages: string[];
  variables?: Record<string, string>;
  jobs: PipelineJob[];
}

export interface ExecutionResult {
  success: boolean;
  stage: string;
  jobName: string;
  output: string;
  error?: string;
  duration: number;
}

export interface PipelineExecutionResult {
  success: boolean;
  results: ExecutionResult[];
  totalDuration: number;
  failedStage?: string;
  error?: string;
}

/**
 * Parse YAML pipeline into structured format
 */
export function parsePipeline(yamlContent: string): ParsedPipeline {
  console.log('[YAML-EXECUTOR] Parsing pipeline YAML...');

  try {
    const parsed = yaml.parse(yamlContent);

    if (!parsed.stages || !Array.isArray(parsed.stages)) {
      throw new Error('Pipeline must have a "stages" array');
    }

    const stages: string[] = parsed.stages;
    const variables: Record<string, string> = parsed.variables || {};
    const jobs: PipelineJob[] = [];

    // Extract all jobs (any top-level key that's not stages, variables, etc.)
    const reservedKeys = ['stages', 'variables', 'image', 'before_script', 'after_script', 'cache'];

    Object.keys(parsed).forEach((key) => {
      if (reservedKeys.includes(key)) return;

      const jobConfig = parsed[key];
      if (typeof jobConfig === 'object' && jobConfig.stage) {
        jobs.push({
          name: key,
          stage: jobConfig.stage,
          image: jobConfig.image,
          script: Array.isArray(jobConfig.script) ? jobConfig.script : [jobConfig.script],
          allowFailure: jobConfig.allow_failure || jobConfig.allowFailure || false,
          artifacts: jobConfig.artifacts,
          variables: jobConfig.variables,
        });
      }
    });

    console.log('[YAML-EXECUTOR] ✓ Parsed', jobs.length, 'jobs across', stages.length, 'stages');

    return { stages, variables, jobs };
  } catch (error: any) {
    console.error('[YAML-EXECUTOR] Error parsing YAML:', error);
    throw new Error(`Failed to parse pipeline YAML: ${error.message}`);
  }
}

/**
 * Execute entire pipeline on EC2 instance
 */
export async function executePipeline(
  instanceId: string,
  yamlContent: string,
  envVars: Record<string, string> = {},
  workingDir: string = '/home/ec2-user/app'
): Promise<PipelineExecutionResult> {
  console.log('[YAML-EXECUTOR] Starting pipeline execution on instance:', instanceId);

  const startTime = Date.now();
  const results: ExecutionResult[] = [];

  try {
    // Parse pipeline
    const pipeline = parsePipeline(yamlContent);

    // Merge environment variables
    const allEnvVars = {
      ...pipeline.variables,
      ...envVars,
      CI: 'true',
      CI_PIPELINE: 'true',
    };

    console.log('[YAML-EXECUTOR] Pipeline has', pipeline.stages.length, 'stages');
    console.log('[YAML-EXECUTOR] Environment variables:', Object.keys(allEnvVars).length);

    // Execute stages in order
    for (let stageIndex = 0; stageIndex < pipeline.stages.length; stageIndex++) {
      const stageName = pipeline.stages[stageIndex];
      const stageJobs = pipeline.jobs.filter((job) => job.stage === stageName);

      if (stageJobs.length === 0) {
        console.log(`[YAML-EXECUTOR] Stage "${stageName}" has no jobs, skipping`);
        continue;
      }

      console.log('');
      console.log('='.repeat(70));
      console.log(`[STAGE ${stageIndex + 1}/${pipeline.stages.length}] ${stageName.toUpperCase()}`);
      console.log('='.repeat(70));

      // Execute all jobs in this stage (sequentially for now)
      for (const job of stageJobs) {
        console.log(`[YAML-EXECUTOR] Executing job: ${job.name}`);

        const jobStartTime = Date.now();
        const result = await executeJob(instanceId, job, allEnvVars, workingDir);
        const jobDuration = Date.now() - jobStartTime;

        result.duration = jobDuration;
        results.push(result);

        if (result.success) {
          console.log(`[YAML-EXECUTOR] ✓ Job "${job.name}" completed (${(jobDuration / 1000).toFixed(1)}s)`);
        } else {
          console.error(`[YAML-EXECUTOR] ✗ Job "${job.name}" failed (${(jobDuration / 1000).toFixed(1)}s)`);

          // If job doesn't allow failure, stop pipeline
          if (!job.allowFailure) {
            const totalDuration = Date.now() - startTime;
            return {
              success: false,
              results,
              totalDuration,
              failedStage: stageName,
              error: `Job "${job.name}" in stage "${stageName}" failed: ${result.error}`,
            };
          } else {
            console.log(`[YAML-EXECUTOR] Job "${job.name}" is allowed to fail, continuing...`);
          }
        }
      }

      console.log(`[YAML-EXECUTOR] ✓ Stage "${stageName}" completed`);
    }

    const totalDuration = Date.now() - startTime;
    console.log('');
    console.log('='.repeat(70));
    console.log('[YAML-EXECUTOR] ✓ PIPELINE EXECUTION SUCCESSFUL');
    console.log(`[YAML-EXECUTOR] Total duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log('='.repeat(70));

    return {
      success: true,
      results,
      totalDuration,
    };
  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    console.error('[YAML-EXECUTOR] Pipeline execution error:', error);

    return {
      success: false,
      results,
      totalDuration,
      error: error.message,
    };
  }
}

/**
 * Execute a single job
 */
async function executeJob(
  instanceId: string,
  job: PipelineJob,
  envVars: Record<string, string>,
  workingDir: string
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    // Build command list
    const commands: string[] = [
      `cd ${workingDir}`,
      '',
      '# Export environment variables',
    ];

    // Export environment variables
    Object.entries(envVars).forEach(([key, value]) => {
      // Escape single quotes in value
      const escapedValue = value.replace(/'/g, "'\\''");
      commands.push(`export ${key}='${escapedValue}'`);
    });

    // Export job-specific variables
    if (job.variables) {
      Object.entries(job.variables).forEach(([key, value]) => {
        const escapedValue = value.replace(/'/g, "'\\''");
        commands.push(`export ${key}='${escapedValue}'`);
      });
    }

    commands.push('');
    commands.push(`# Job: ${job.name}`);
    commands.push(`echo "==== Starting job: ${job.name} ===="`);
    commands.push('');

    // Add job scripts
    commands.push(...job.script);

    commands.push('');
    commands.push(`echo "==== Job ${job.name} completed successfully ===="`);

    // Execute via SSM
    const sendCmd = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: `Pipeline Job: ${job.name}`,
        Parameters: {
          commands,
          workingDirectory: [workingDir],
          executionTimeout: ['600'],
        },
      })
    );

    const commandId = sendCmd.Command?.CommandId;
    if (!commandId) {
      throw new Error('Failed to get SSM command ID');
    }

    // Wait for completion
    let attempts = 0;
    const maxAttempts = 180; // 6 minutes

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const result = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        })
      );

      const status = result.Status;

      if (status === 'Success') {
        const output = result.StandardOutputContent || '';
        const duration = Date.now() - startTime;

        return {
          success: true,
          stage: job.stage,
          jobName: job.name,
          output,
          duration,
        };
      } else if (status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
        const output = result.StandardOutputContent || '';
        const errorOutput = result.StandardErrorContent || 'Job failed';
        const duration = Date.now() - startTime;

        return {
          success: false,
          stage: job.stage,
          jobName: job.name,
          output,
          error: errorOutput,
          duration,
        };
      }

      attempts++;
    }

    throw new Error('Job execution timed out');
  } catch (error: any) {
    const duration = Date.now() - startTime;

    return {
      success: false,
      stage: job.stage,
      jobName: job.name,
      output: '',
      error: error.message,
      duration,
    };
  }
}

/**
 * Execute pipeline with AI auto-fix on failures
 */
export async function executePipelineWithAutoFix(
  instanceId: string,
  yamlContent: string,
  envVars: Record<string, string> = {},
  workingDir: string = '/home/ec2-user/app',
  autoFixEnabled: boolean = true
): Promise<PipelineExecutionResult> {
  console.log('[YAML-EXECUTOR] Executing pipeline with auto-fix capability');

  // First attempt
  let result = await executePipeline(instanceId, yamlContent, envVars, workingDir);

  if (!result.success && autoFixEnabled && result.failedStage) {
    console.log('[YAML-EXECUTOR] Pipeline failed, attempting AI auto-fix...');

    // Get the failed job details
    const failedJob = result.results.find((r) => !r.success && r.error);

    if (failedJob) {
      console.log(`[YAML-EXECUTOR] Failed job: ${failedJob.jobName} in stage ${failedJob.stage}`);
      console.log(`[YAML-EXECUTOR] Error: ${failedJob.error?.substring(0, 200)}...`);

      // Import auto-fix (dynamic to avoid circular dependency)
      const { autoFixDeploymentError } = await import('../novaDeploymentFixer');

      const fixResult = await autoFixDeploymentError(
        {
          errorLog: `${failedJob.output}\n\n${failedJob.error}`,
          stage: failedJob.stage,
          command: failedJob.jobName,
          repoName: 'deployment',
          framework: envVars.FRAMEWORK || 'Unknown',
        },
        instanceId,
        false // Don't execute immediately, return commands
      );

      if (fixResult.success && fixResult.fixCommands && fixResult.fixCommands.length > 0) {
        console.log('[YAML-EXECUTOR] AI generated fix commands, applying...');

        // Execute fix commands
        const fixCommands = [
          `cd ${workingDir}`,
          '# AI-Generated Fix Commands',
          ...fixResult.fixCommands,
        ];

        await executeSSMCommand(instanceId, fixCommands, workingDir);

        console.log('[YAML-EXECUTOR] Fix applied, retrying pipeline...');

        // Retry pipeline
        result = await executePipeline(instanceId, yamlContent, envVars, workingDir);

        if (result.success) {
          console.log('[YAML-EXECUTOR] ✓ Pipeline succeeded after auto-fix!');
        } else {
          console.log('[YAML-EXECUTOR] ✗ Pipeline still failed after auto-fix');
        }
      }
    }
  }

  return result;
}

/**
 * Helper: Execute SSM command
 */
async function executeSSMCommand(
  instanceId: string,
  commands: string[],
  workingDir: string
): Promise<{ success: boolean; output: string }> {
  const sendCmd = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands,
        workingDirectory: [workingDir],
        executionTimeout: ['600'],
      },
    })
  );

  const commandId = sendCmd.Command?.CommandId;
  if (!commandId) {
    throw new Error('Failed to get SSM command ID');
  }

  // Wait for completion
  for (let i = 0; i < 180; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const result = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId,
      })
    );

    if (result.Status === 'Success') {
      return {
        success: true,
        output: result.StandardOutputContent || '',
      };
    } else if (result.Status === 'Failed' || result.Status === 'Cancelled') {
      return {
        success: false,
        output: result.StandardErrorContent || 'Command failed',
      };
    }
  }

  throw new Error('Command timed out');
}

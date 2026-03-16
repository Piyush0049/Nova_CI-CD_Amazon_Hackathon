/**
 * Deploy Controller - Orchestrates Vercel-like deployment flow
 * Separates BUILD PIPELINE from RUNTIME SERVER
 */

import { RuntimeConfig, launchRuntime } from './runtime-launcher';

export interface DeploymentConfig {
  instanceId: string;
  framework: string;
  language: string;
  startCommand: string;
  port: number;
  envVars: Record<string, string>;
}

export interface DeploymentStatus {
  phase: 'pipeline' | 'runtime' | 'completed' | 'failed';
  pipelineCompleted: boolean;
  runtimeLaunched: boolean;
  success: boolean;
  logs: string[];
  error?: string;
}

/**
 * Execute complete deployment flow
 * 1. Run build pipeline (completes quickly)
 * 2. Launch runtime server (runs independently)
 */
export async function executeVercelLikeDeployment(
  config: DeploymentConfig,
  pipelineRunner: () => Promise<{ success: boolean; logs: string[]; error?: string }>
): Promise<DeploymentStatus> {
  const status: DeploymentStatus = {
    phase: 'pipeline',
    pipelineCompleted: false,
    runtimeLaunched: false,
    success: false,
    logs: [],
  };

  try {
    // Phase 1: Run build pipeline
    console.log('[DEPLOY-CONTROLLER] Phase 1: Running build pipeline...');
    status.logs.push('[DEPLOY] ═══════════════════════════════════════════');
    status.logs.push('[DEPLOY] Phase 1: Build Pipeline');
    status.logs.push('[DEPLOY] ═══════════════════════════════════════════');

    const pipelineResult = await pipelineRunner();
    status.logs = [...status.logs, ...pipelineResult.logs];

    if (!pipelineResult.success) {
      status.phase = 'failed';
      status.error = pipelineResult.error || 'Pipeline failed';
      return status;
    }

    status.pipelineCompleted = true;
    status.logs.push('[DEPLOY] ✅ Build pipeline completed successfully');
    status.logs.push('');

    // Phase 2: Launch runtime server
    console.log('[DEPLOY-CONTROLLER] Phase 2: Launching runtime server...');
    status.phase = 'runtime';
    status.logs.push('[DEPLOY] ═══════════════════════════════════════════');
    status.logs.push('[DEPLOY] Phase 2: Runtime Server');
    status.logs.push('[DEPLOY] ═══════════════════════════════════════════');

    const runtimeConfig: RuntimeConfig = {
      framework: config.framework,
      language: config.language,
      startCommand: config.startCommand,
      port: config.port,
      envVars: config.envVars,
    };

    const runtimeResult = await launchRuntime(config.instanceId, runtimeConfig);
    status.logs.push(runtimeResult.output);

    if (!runtimeResult.success) {
      status.phase = 'failed';
      status.error = runtimeResult.error || 'Runtime launch failed';
      return status;
    }

    status.runtimeLaunched = true;
    status.phase = 'completed';
    status.success = true;
    status.logs.push('');
    status.logs.push('[DEPLOY] ═══════════════════════════════════════════');
    status.logs.push('[DEPLOY] ✅ Deployment completed successfully!');
    status.logs.push('[DEPLOY] ═══════════════════════════════════════════');
    status.logs.push(`[DEPLOY] Your application is running on port ${config.port}`);
    status.logs.push(`[DEPLOY] Access at: http://your-instance-ip:${config.port}`);

    return status;
  } catch (error: any) {
    console.error('[DEPLOY-CONTROLLER] Deployment error:', error);
    status.phase = 'failed';
    status.error = error.message;
    status.logs.push(`[DEPLOY] ❌ Error: ${error.message}`);
    return status;
  }
}

/**
 * Get deployment progress summary
 */
export function getDeploymentSummary(status: DeploymentStatus): string {
  const lines: string[] = [
    '',
    '═══════════════════════════════════════════════════════════════',
    '                    DEPLOYMENT SUMMARY',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Phase: ${status.phase.toUpperCase()}`,
    `Pipeline: ${status.pipelineCompleted ? '✅ Completed' : '⏳ Pending'}`,
    `Runtime: ${status.runtimeLaunched ? '✅ Launched' : '⏳ Pending'}`,
    `Status: ${status.success ? '✅ SUCCESS' : status.phase === 'failed' ? '❌ FAILED' : '⏳ IN PROGRESS'}`,
    '',
  ];

  if (status.error) {
    lines.push(`Error: ${status.error}`, '');
  }

  lines.push('═══════════════════════════════════════════════════════════════', '');

  return lines.join('\n');
}

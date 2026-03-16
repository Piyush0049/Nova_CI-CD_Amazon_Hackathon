import { SSMClient, GetCommandInvocationCommand, SendCommandCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

interface DeploymentLog {
  content: string;
  timestamp: Date;
}

interface ErrorDetection {
  detected: boolean;
  stage?: string;
  command?: string;
  errorLog?: string;
  errorLine?: string;
}

/**
 * Parse deployment logs to detect errors
 */
export function detectDeploymentError(logs: string): ErrorDetection {
  const lines = logs.split('\n');

  // Look for error patterns
  const errorPatterns = [
    /ERROR: Command failed in job (\w+)/i,
    /ERROR: (.+)/i,
    /npm ERR!/i,
    /error TS\d+:/i,
    /Module not found/i,
    /Cannot find module/i,
    /ENOENT/i,
    /must be installed/i,
    /command not found/i,
  ];

  let currentStage = '';
  let currentCommand = '';
  let errorContext: string[] = [];
  let errorDetected = false;
  let errorLine = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track current stage
    const stageMatch = line.match(/\[STAGE (\d+\/\d+)\] (\w+)\.\.\./);
    if (stageMatch) {
      currentStage = stageMatch[2];
    }

    // Track current job/command
    const jobMatch = line.match(/\[JOB\] Running (\w+)\.\.\./);
    if (jobMatch) {
      currentCommand = jobMatch[1];
    }

    // Check for error patterns
    for (const pattern of errorPatterns) {
      if (pattern.test(line)) {
        errorDetected = true;
        errorLine = line;

        // Collect context around the error (10 lines before and after)
        const startIndex = Math.max(0, i - 10);
        const endIndex = Math.min(lines.length, i + 10);
        errorContext = lines.slice(startIndex, endIndex);
        break;
      }
    }

    if (errorDetected) break;
  }

  if (!errorDetected) {
    return { detected: false };
  }

  return {
    detected: true,
    stage: currentStage || 'unknown',
    command: currentCommand || 'unknown',
    errorLog: errorContext.join('\n'),
    errorLine,
  };
}

/**
 * Get real-time logs from UserData script
 */
export async function getInstanceLogs(instanceId: string): Promise<string> {
  try {
    // Note: This is a simplified version. In production, you'd want to:
    // 1. Use CloudWatch Logs for real-time log streaming
    // 2. Or use SSM to read the log file directly

    const command = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: ['tail -500 /var/log/user-data.log'],
        },
      })
    );

    const commandId = command.Command?.CommandId;
    if (!commandId) return '';

    // Wait for command to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    const result = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId,
      })
    );

    return result.StandardOutputContent || '';
  } catch (error) {
    console.error('Error getting instance logs:', error);
    return '';
  }
}

/**
 * Trigger auto-fix for deployment error
 */
export async function triggerAutoFix(params: {
  instanceId: string;
  errorLog: string;
  stage: string;
  command: string;
  repoName: string;
  deploymentId?: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    console.log('[MONITOR] Triggering auto-fix for deployment error');

    const response = await fetch('/api/deploy/auto-fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Auto-fix request failed');
    }

    const result = await response.json();
    return {
      success: result.success,
      message: result.analysis || 'Auto-fix completed',
    };
  } catch (error: any) {
    console.error('[MONITOR] Error triggering auto-fix:', error);
    return {
      success: false,
      message: error.message || 'Failed to trigger auto-fix',
    };
  }
}

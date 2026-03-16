import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import { autoFixDeploymentError } from '@/lib/novaDeploymentFixer';
import dbConnect from '@/lib/mongodb';
import Deployment from '@/models/Deployment';

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * Monitor deployment and trigger auto-fix if errors detected
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { instanceId, deploymentId, repoName } = await request.json();

    if (!instanceId) {
      return NextResponse.json({ error: 'Instance ID required' }, { status: 400 });
    }

    console.log('[MONITOR] Starting deployment monitoring for instance:', instanceId);

    // Get current logs from instance
    const logs = await getInstanceLogs(instanceId);

    // Check for errors - detects ALL types of errors
    const errorDetected = detectError(logs);

    if (!errorDetected.found) {
      return NextResponse.json({
        status: 'running',
        message: 'No errors detected, deployment continuing',
      });
    }

    console.log('[MONITOR] Error detected:', errorDetected.errorLine);
    console.log('[MONITOR] Triggering Nova AI auto-fix...');

    // Trigger Nova AI auto-fix for ANY error
    const fixResult = await autoFixDeploymentError(
      {
        errorLog: errorDetected.context,
        stage: errorDetected.stage,
        command: errorDetected.command,
        repoName: repoName || 'unknown',
      },
      instanceId
    );

    console.log('[MONITOR] Auto-fix result:', {
      success: fixResult.success,
      commands: fixResult.fixCommands,
    });

    // Update deployment status
    if (deploymentId) {
      await dbConnect();
      await Deployment.findByIdAndUpdate(deploymentId, {
        status: fixResult.success ? 'success' : 'failed',
        errorMessage: fixResult.success
          ? undefined
          : `Auto-fix attempted: ${fixResult.error || 'Unknown error'}`,
      });
    }

    return NextResponse.json({
      status: fixResult.success ? 'fixed' : 'failed',
      message: fixResult.analysis,
      fixCommands: fixResult.fixCommands,
      output: fixResult.executionOutput,
    });
  } catch (error: any) {
    console.error('[MONITOR] Monitoring error:', error);
    return NextResponse.json(
      { error: error.message || 'Monitoring failed' },
      { status: 500 }
    );
  }
}

async function getInstanceLogs(instanceId: string): Promise<string> {
  try {
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
    await new Promise(resolve => setTimeout(resolve, 3000));

    const result = await ssmClient.send(
      new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId,
      })
    );

    return result.StandardOutputContent || '';
  } catch (error) {
    console.error('Error getting logs:', error);
    return '';
  }
}

/**
 * Detect ANY type of error in deployment logs
 * This is comprehensive and catches all possible errors
 */
function detectError(logs: string): {
  found: boolean;
  stage: string;
  command: string;
  context: string;
  errorLine: string;
} {
  const lines = logs.split('\n');

  // Comprehensive error patterns - CATCHES EVERYTHING
  const errorPatterns = [
    // Explicit errors
    /ERROR:/i,
    /Error:/i,
    /ENOENT/i,
    /EACCES/i,
    /EPERM/i,

    // NPM/Yarn errors
    /npm ERR!/i,
    /yarn error/i,

    // Module/dependency errors
    /Cannot find module/i,
    /Module not found/i,
    /could not resolve/i,
    /dependency.*not found/i,
    /package.*not found/i,

    // Build/compile errors
    /build failed/i,
    /compilation failed/i,
    /SyntaxError/i,
    /TypeError/i,
    /ReferenceError/i,

    // Command errors
    /command not found/i,
    /No such file or directory/i,
    /permission denied/i,

    // Process/service errors
    /failed to start/i,
    /exited with code [1-9]/i,
    /killed by signal/i,

    // Network/connection errors
    /ECONNREFUSED/i,
    /ETIMEDOUT/i,
    /network error/i,

    // Port/address errors
    /EADDRINUSE/i,
    /port.*already in use/i,

    // Configuration errors
    /invalid configuration/i,
    /missing required/i,
    /not configured/i,
    /must be installed/i,

    // Git/repo errors
    /fatal:/i,
    /clone failed/i,

    // TypeScript/ESLint/Build tool errors
    /typescript.*not found/i,
    /eslint.*not found/i,
    /tsc.*not found/i,
    /webpack.*error/i,
    /vite.*error/i,

    // Memory/resource errors
    /out of memory/i,
    /ENOMEM/i,

    // Database errors
    /connection.*refused/i,
    /authentication failed/i,

    // General failure indicators
    /failed/i,
    /failure/i,
    /unsuccessful/i,
    /⨯/,  // Next.js error symbol
  ];

  let currentStage = '';
  let currentCommand = '';
  let errorContext: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track stage
    const stageMatch = line.match(/\[STAGE.*?\] (\w+)/i);
    if (stageMatch) currentStage = stageMatch[1];

    // Track job
    const jobMatch = line.match(/\[JOB\] Running (\w+)/i);
    if (jobMatch) currentCommand = jobMatch[1];

    // Check for errors
    for (const pattern of errorPatterns) {
      if (pattern.test(line)) {
        // Collect extensive context for Nova AI analysis (30 lines before, 10 after)
        const start = Math.max(0, i - 30);
        const end = Math.min(lines.length, i + 10);
        errorContext = lines.slice(start, end);

        return {
          found: true,
          stage: currentStage || 'unknown',
          command: currentCommand || 'unknown',
          context: errorContext.join('\n'),
          errorLine: line,
        };
      }
    }
  }

  return {
    found: false,
    stage: '',
    command: '',
    context: '',
    errorLine: '',
  };
}

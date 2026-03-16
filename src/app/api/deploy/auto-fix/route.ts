import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { autoFixDeploymentError } from '@/lib/novaDeploymentFixer';
import dbConnect from '@/lib/mongodb';
import Deployment from '@/models/Deployment';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      instanceId,
      errorLog,
      stage,
      command,
      repoName,
      framework,
      packageJson,
      deploymentId,
    } = body;

    if (!instanceId || !errorLog || !stage || !command) {
      return NextResponse.json(
        { error: 'Missing required fields: instanceId, errorLog, stage, command' },
        { status: 400 }
      );
    }

    console.log('[AUTO-FIX API] Received auto-fix request for instance:', instanceId);
    console.log('[AUTO-FIX API] Stage:', stage);
    console.log('[AUTO-FIX API] Command:', command);

    // Run Nova AI auto-fix
    const result = await autoFixDeploymentError(
      {
        errorLog,
        stage,
        command,
        repoName: repoName || 'unknown',
        framework,
        packageJson,
      },
      instanceId
    );

    console.log('[AUTO-FIX API] Auto-fix result:', {
      success: result.success,
      commandsCount: result.fixCommands.length,
    });

    // Update deployment record if provided
    if (deploymentId) {
      await dbConnect();

      if (result.success) {
        await Deployment.findByIdAndUpdate(deploymentId, {
          status: 'success',
          errorMessage: undefined,
        });
        console.log('[AUTO-FIX API] Updated deployment status to success');
      } else {
        await Deployment.findByIdAndUpdate(deploymentId, {
          status: 'failed',
          errorMessage: `Auto-fix attempted but failed: ${result.error || 'Unknown error'}`,
        });
        console.log('[AUTO-FIX API] Updated deployment status to failed');
      }
    }

    return NextResponse.json({
      success: result.success,
      fixCommands: result.fixCommands,
      analysis: result.analysis,
      executionOutput: result.executionOutput,
      error: result.error,
    });
  } catch (error: any) {
    console.error('[AUTO-FIX API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Auto-fix failed' },
      { status: 500 }
    );
  }
}

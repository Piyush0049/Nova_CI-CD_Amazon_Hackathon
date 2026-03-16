import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/mongodb';
import {
  isDeploymentInProgress,
  forceClearLock,
} from '@/models/DeploymentLock';

/**
 * GET - Check deployment lock status
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const lockStatus = await isDeploymentInProgress();

    if (lockStatus.locked && lockStatus.details) {
      const { repoFullName, startedAt, duration } = lockStatus.details;
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;

      return NextResponse.json({
        locked: true,
        repoFullName,
        startedAt,
        duration,
        durationFormatted: `${minutes}m ${seconds}s`,
        message: `Deployment in progress for "${repoFullName}"`,
      });
    }

    return NextResponse.json({
      locked: false,
      message: 'No deployment in progress',
    });
  } catch (error: any) {
    console.error('[LOCK-API] Error checking lock:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check lock status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Force clear deployment lock (admin function)
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    await dbConnect();

    // Check current lock status before clearing
    const lockStatus = await isDeploymentInProgress();

    await forceClearLock();

    return NextResponse.json({
      success: true,
      message: 'Deployment lock force cleared',
      previousLock: lockStatus.locked
        ? {
            repoFullName: lockStatus.details?.repoFullName,
            duration: lockStatus.details?.duration,
          }
        : null,
    });
  } catch (error: any) {
    console.error('[LOCK-API] Error clearing lock:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clear lock' },
      { status: 500 }
    );
  }
}

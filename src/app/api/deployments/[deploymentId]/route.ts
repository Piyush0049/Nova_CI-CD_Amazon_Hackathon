import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { EC2Client, TerminateInstancesCommand, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import dbConnect from '@/lib/mongodb';
import Deployment from '@/models/Deployment';

const ec2Client = new EC2Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * GET - Fetch single deployment details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { deploymentId: string } }
) {
  try {
    const { deploymentId } = params;

    await dbConnect();

    const deployment = await Deployment.findById(deploymentId);

    if (!deployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(deployment);
  } catch (error: any) {
    console.error('[DEPLOYMENT-API] Error fetching deployment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch deployment' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete deployment and terminate EC2 instance
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { deploymentId: string } }
) {
  try {
    const session = await getServerSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { deploymentId } = params;

    await dbConnect();

    // Find deployment
    const deployment = await Deployment.findById(deploymentId);

    if (!deployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

    // Check ownership
    const userId = session.user?.email || session.user?.id;
    if (deployment.userId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized - You can only delete your own deployments' },
        { status: 403 }
      );
    }

    const instanceId = deployment.instanceId;
    const repoFullName = deployment.repoFullName;

    console.log(`[DELETE-DEPLOYMENT] Terminating instance ${instanceId} for ${repoFullName}`);

    // Step 1: Check if instance exists and get its state
    let instanceState = 'unknown';
    try {
      const describeResult = await ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId],
        })
      );

      const instance = describeResult.Reservations?.[0]?.Instances?.[0];
      instanceState = instance?.State?.Name || 'unknown';

      console.log(`[DELETE-DEPLOYMENT] Instance ${instanceId} current state: ${instanceState}`);
    } catch (describeError: any) {
      if (describeError.name === 'InvalidInstanceID.NotFound') {
        console.log(`[DELETE-DEPLOYMENT] Instance ${instanceId} not found in AWS (may already be terminated)`);
        instanceState = 'not-found';
      } else {
        console.error(`[DELETE-DEPLOYMENT] Error checking instance state:`, describeError.message);
      }
    }

    // Step 2: Terminate instance if it exists and is not already terminated
    if (instanceState !== 'not-found' && instanceState !== 'terminated' && instanceState !== 'terminating') {
      try {
        const terminateResult = await ec2Client.send(
          new TerminateInstancesCommand({
            InstanceIds: [instanceId],
          })
        );

        const currentState = terminateResult.TerminatingInstances?.[0]?.CurrentState?.Name;
        console.log(`[DELETE-DEPLOYMENT] Instance ${instanceId} termination initiated. State: ${currentState}`);
      } catch (terminateError: any) {
        if (terminateError.name === 'InvalidInstanceID.NotFound') {
          console.log(`[DELETE-DEPLOYMENT] Instance ${instanceId} not found during termination (may have been manually deleted)`);
        } else {
          console.error(`[DELETE-DEPLOYMENT] Error terminating instance:`, terminateError.message);
          return NextResponse.json(
            {
              error: 'Failed to terminate EC2 instance',
              details: terminateError.message,
              instanceId,
            },
            { status: 500 }
          );
        }
      }
    } else {
      console.log(`[DELETE-DEPLOYMENT] Skipping termination - instance is ${instanceState}`);
    }

    // Step 3: Delete deployment record from database
    await Deployment.findByIdAndDelete(deploymentId);

    console.log(`[DELETE-DEPLOYMENT] ✅ Deployment ${deploymentId} deleted successfully`);

    return NextResponse.json({
      success: true,
      message: 'Deployment deleted and EC2 instance terminated',
      deploymentId,
      instanceId,
      repoFullName,
      instanceState,
    });
  } catch (error: any) {
    console.error('[DELETE-DEPLOYMENT] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete deployment' },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update deployment (e.g., mark as archived)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { deploymentId: string } }
) {
  try {
    const session = await getServerSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { deploymentId } = params;
    const body = await request.json();

    await dbConnect();

    const deployment = await Deployment.findById(deploymentId);

    if (!deployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

    // Check ownership
    const userId = session.user?.email || session.user?.id;
    if (deployment.userId !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Update allowed fields
    if (body.status) deployment.status = body.status;
    if (body.errorMessage !== undefined) deployment.errorMessage = body.errorMessage;

    await deployment.save();

    return NextResponse.json({
      success: true,
      deployment,
    });
  } catch (error: any) {
    console.error('[DEPLOYMENT-API] Error updating deployment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update deployment' },
      { status: 500 }
    );
  }
}

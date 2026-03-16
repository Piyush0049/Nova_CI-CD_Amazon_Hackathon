import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { EC2Client, RunInstancesCommand, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { SSMClient, SendCommandCommand } from '@aws-sdk/client-ssm';
import dbConnect from '@/lib/mongodb';
import Pipeline from '@/models/Pipeline';

const ec2Client = new EC2Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    const { pipelineName, pipelineId, yaml, instanceId } = await request.json();

    if (!pipelineName || !yaml) {
      return NextResponse.json(
        { error: 'Pipeline name and YAML configuration are required' },
        { status: 400 }
      );
    }

    await dbConnect();

    // If instanceId is provided, deploy to existing instance
    // Otherwise, create a new instance
    let targetInstanceId = instanceId;

    if (!targetInstanceId) {
      // Create new EC2 instance
      const runInstancesCommand = new RunInstancesCommand({
        ImageId: process.env.AWS_AMI_ID || 'ami-0c55b159cbfafe1f0', // Amazon Linux 2 AMI
        InstanceType: 't2.micro',
        MinCount: 1,
        MaxCount: 1,
        KeyName: process.env.AWS_KEY_PAIR_NAME,
        SecurityGroupIds: [process.env.AWS_SECURITY_GROUP_ID || ''],
        TagSpecifications: [
          {
            ResourceType: 'instance',
            Tags: [
              {
                Key: 'Name',
                Value: `pipeline-${pipelineName}`,
              },
              {
                Key: 'Pipeline',
                Value: pipelineName,
              },
            ],
          },
        ],
        UserData: Buffer.from(`#!/bin/bash
          yum update -y
          yum install -y docker git
          systemctl start docker
          systemctl enable docker
          usermod -aG docker ec2-user
        `).toString('base64'),
      });

      const runResponse = await ec2Client.send(runInstancesCommand);
      targetInstanceId = runResponse.Instances?.[0]?.InstanceId;

      if (!targetInstanceId) {
        return NextResponse.json(
          { error: 'Failed to create EC2 instance' },
          { status: 500 }
        );
      }

      // Wait for instance to be running
      await waitForInstanceRunning(targetInstanceId);
    }

    // Deploy pipeline configuration using SSM
    const deployCommand = new SendCommandCommand({
      InstanceIds: [targetInstanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: [
          'mkdir -p /home/ec2-user/pipelines',
          `cat > /home/ec2-user/pipelines/${pipelineName}.yml << 'EOF'
${yaml}
EOF`,
          `echo "Pipeline ${pipelineName} deployed successfully"`,
        ],
      },
    });

    const deployResponse = await ssmClient.send(deployCommand);

    // Save deployment info to database
    if (pipelineId && session) {
      try {
        await Pipeline.findByIdAndUpdate(pipelineId, {
          $push: {
            deployments: {
              instanceId: targetInstanceId,
              commandId: deployResponse.Command?.CommandId || '',
              deployedAt: new Date(),
              status: 'success',
            },
          },
        });
      } catch (dbError) {
        console.error('Failed to update pipeline deployment info:', dbError);
      }
    }

    return NextResponse.json({
      success: true,
      instanceId: targetInstanceId,
      commandId: deployResponse.Command?.CommandId,
      message: `Pipeline deployed to EC2 instance ${targetInstanceId}`,
    });
  } catch (error: any) {
    console.error('EC2 deployment error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to deploy to EC2' },
      { status: 500 }
    );
  }
}

async function waitForInstanceRunning(instanceId: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const describeCommand = new DescribeInstancesCommand({
      InstanceIds: [instanceId],
    });

    const response = await ec2Client.send(describeCommand);
    const state = response.Reservations?.[0]?.Instances?.[0]?.State?.Name;

    if (state === 'running') {
      // Wait additional 30 seconds for SSM agent to be ready
      await new Promise(resolve => setTimeout(resolve, 30000));
      return;
    }

    // Wait 10 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  throw new Error('Instance failed to reach running state');
}

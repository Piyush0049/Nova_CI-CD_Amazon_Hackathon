import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/mongodb';
import Pipeline from '@/models/Pipeline';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    await dbConnect();

    const pipelines = await Pipeline.find({
      userId: session.user.email || session.user.id,
    })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ pipelines });
  } catch (error: any) {
    console.error('Failed to fetch pipelines:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch pipelines' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, repo, repoFullName, repoUrl, yaml, content, stages, detection } = body;

    if (!name || !repo || !repoFullName || !yaml) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Check if pipeline already exists for this repo
    const existingPipeline = await Pipeline.findOne({
      userId: session.user.email || session.user.id,
      repoFullName,
    });

    if (existingPipeline) {
      return NextResponse.json(
        { error: `Pipeline already exists for repository ${repo}. You can only have one pipeline per repository.` },
        { status: 400 }
      );
    }

    const pipeline = await Pipeline.create({
      userId: session.user.email || session.user.id,
      name,
      repo,
      repoFullName,
      repoUrl: repoUrl || '',
      yaml,
      content: content || yaml,
      stages: stages || [],
      language: detection?.language || 'Unknown',
      framework: detection?.framework || 'Unknown',
      port: detection?.port || '3000', // AI-detected port
      startCommand: detection?.startCommand || 'npm start', // AI-detected start command
      status: 'active',
      deployments: [],
    });

    return NextResponse.json({
      success: true,
      pipeline: {
        id: pipeline._id.toString(),
        name: pipeline.name,
        repo: pipeline.repo,
        yaml: pipeline.yaml,
        createdAt: pipeline.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Failed to create pipeline:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create pipeline' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const pipelineId = searchParams.get('id');

    if (!pipelineId) {
      return NextResponse.json(
        { error: 'Pipeline ID is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { envVars } = body;

    await dbConnect();

    // Find and verify ownership before updating
    const pipeline = await Pipeline.findOne({
      _id: pipelineId,
      userId: session.user.email || session.user.id,
    });

    if (!pipeline) {
      return NextResponse.json(
        { error: 'Pipeline not found or unauthorized' },
        { status: 404 }
      );
    }

    // Update environment variables
    if (envVars !== undefined) {
      pipeline.envVars = envVars;
      await pipeline.save();
    }

    return NextResponse.json({
      success: true,
      message: 'Pipeline updated successfully',
      pipeline: {
        id: pipeline._id.toString(),
        envVars: pipeline.envVars,
      },
    });
  } catch (error: any) {
    console.error('Failed to update pipeline:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update pipeline' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const pipelineId = searchParams.get('id');

    if (!pipelineId) {
      return NextResponse.json(
        { error: 'Pipeline ID is required' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Find and verify ownership before deleting
    const pipeline = await Pipeline.findOne({
      _id: pipelineId,
      userId: session.user.email || session.user.id,
    });

    if (!pipeline) {
      return NextResponse.json(
        { error: 'Pipeline not found or unauthorized' },
        { status: 404 }
      );
    }

    await Pipeline.deleteOne({ _id: pipelineId });

    return NextResponse.json({
      success: true,
      message: 'Pipeline deleted successfully',
    });
  } catch (error: any) {
    console.error('Failed to delete pipeline:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete pipeline' },
      { status: 500 }
    );
  }
}

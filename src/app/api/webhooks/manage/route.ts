/**
 * Webhook Management API
 * Create, list, update, delete webhooks for continuous deployment
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import Webhook from '@/models/Webhook';
import Pipeline from '@/models/Pipeline';
import crypto from 'crypto';

/**
 * GET - List all webhooks for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    const webhooks = await Webhook.find({ userId: session.user.email })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      webhooks: webhooks.map(webhook => ({
        id: webhook._id.toString(),
        repoFullName: webhook.repoFullName,
        repoUrl: webhook.repoUrl,
        pipelineId: webhook.pipelineId,
        events: webhook.events,
        active: webhook.active,
        branch: webhook.branch,
        lastTriggered: webhook.lastTriggered,
        totalTriggers: webhook.totalTriggers,
        successfulTriggers: webhook.successfulTriggers,
        failedTriggers: webhook.failedTriggers,
        createdAt: webhook.createdAt,
      })),
    });
  } catch (error: any) {
    console.error('[WEBHOOK-MANAGE] Error listing webhooks:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list webhooks' },
      { status: 500 }
    );
  }
}

/**
 * POST - Create a new webhook
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      repoFullName,
      repoUrl,
      pipelineId,
      branch = 'main',
      events = ['push'],
      envVars = {},
      autoSetup = true,
      githubToken,
    } = body;

    if (!repoFullName || !repoUrl || !pipelineId) {
      return NextResponse.json(
        { error: 'Missing required fields: repoFullName, repoUrl, pipelineId' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Verify pipeline exists and belongs to user
    const pipeline = await Pipeline.findById(pipelineId);
    if (!pipeline) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    if (pipeline.userId !== session.user.email) {
      return NextResponse.json(
        { error: 'Unauthorized: Pipeline does not belong to you' },
        { status: 403 }
      );
    }

    // Check if webhook already exists for this repo
    const existingWebhook = await Webhook.findOne({
      userId: session.user.email,
      repoFullName,
    });

    if (existingWebhook) {
      return NextResponse.json(
        {
          error: 'Webhook already exists for this repository',
          webhookId: existingWebhook._id.toString(),
        },
        { status: 409 }
      );
    }

    // Generate secure webhook secret
    const secret = crypto.randomBytes(32).toString('hex');

    // Create webhook in database
    const webhook = new Webhook({
      userId: session.user.email,
      repoFullName,
      repoUrl,
      pipelineId,
      secret,
      githubToken: githubToken || undefined, // Store GitHub token for private repos
      events,
      branch,
      active: true,
      autoRedeploy: true,
      envVars: envVars || {},
      totalTriggers: 0,
      successfulTriggers: 0,
      failedTriggers: 0,
    });

    await webhook.save();

    console.log('[WEBHOOK-MANAGE] ✅ Webhook created:', webhook._id);

    // Auto-setup GitHub webhook if requested and token provided
    let githubWebhookCreated = false;
    let githubWebhookId = null;

    if (autoSetup && githubToken) {
      try {
        const [owner, repo] = repoFullName.split('/');
        // Use separate webhook URL (can be ngrok while app runs on localhost)
        const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const webhookUrl = `${webhookBaseUrl}/api/webhooks/github`;

        console.log('[WEBHOOK-MANAGE] 🔧 Setting up GitHub webhook...');
        console.log('[WEBHOOK-MANAGE] URL:', webhookUrl);
        console.log('[WEBHOOK-MANAGE] Repository:', repoFullName);

        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/hooks`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: 'web',
              active: true,
              events: events,
              config: {
                url: webhookUrl,
                content_type: 'json',
                secret: secret,
                insecure_ssl: '0',
              },
            }),
          }
        );

        if (response.ok) {
          const githubWebhook = await response.json();
          githubWebhookId = githubWebhook.id;
          githubWebhookCreated = true;
          console.log('[WEBHOOK-MANAGE] ✅ GitHub webhook created:', githubWebhookId);
        } else {
          const errorData = await response.text();
          console.warn('[WEBHOOK-MANAGE] ⚠️  Failed to create GitHub webhook:', response.status, errorData);
        }
      } catch (githubError: any) {
        console.error('[WEBHOOK-MANAGE] Error setting up GitHub webhook:', githubError.message);
      }
    }

    return NextResponse.json({
      success: true,
      webhook: {
        id: webhook._id.toString(),
        repoFullName: webhook.repoFullName,
        repoUrl: webhook.repoUrl,
        pipelineId: webhook.pipelineId,
        events: webhook.events,
        branch: webhook.branch,
        active: webhook.active,
        secret: secret, // Return secret only once during creation
        createdAt: webhook.createdAt,
      },
      github: {
        webhookCreated: githubWebhookCreated,
        webhookId: githubWebhookId,
        webhookUrl: `${process.env.WEBHOOK_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/webhooks/github`,
      },
      message: githubWebhookCreated
        ? '✅ Webhook created and GitHub webhook configured successfully!'
        : '✅ Webhook created! Please manually add webhook to GitHub repository.',
      instructions: !githubWebhookCreated ? {
        steps: [
          `1. Go to https://github.com/${repoFullName}/settings/hooks`,
          '2. Click "Add webhook"',
          `3. Set Payload URL to: ${process.env.WEBHOOK_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/webhooks/github`,
          '4. Set Content type to: application/json',
          `5. Set Secret to: ${secret}`,
          `6. Select events: ${events.join(', ')}`,
          '7. Click "Add webhook"',
        ],
      } : undefined,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[WEBHOOK-MANAGE] Error creating webhook:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create webhook' },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update webhook status or configuration
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { webhookId, active, events, branch } = body;

    if (!webhookId) {
      return NextResponse.json(
        { error: 'Missing webhookId' },
        { status: 400 }
      );
    }

    await dbConnect();

    const webhook = await Webhook.findOne({
      _id: webhookId,
      userId: session.user.email,
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    // Update fields
    if (active !== undefined) webhook.active = active;
    if (events) webhook.events = events;
    if (branch) webhook.branch = branch;

    await webhook.save();

    console.log('[WEBHOOK-MANAGE] ✅ Webhook updated:', webhookId);

    return NextResponse.json({
      success: true,
      webhook: {
        id: webhook._id.toString(),
        active: webhook.active,
        events: webhook.events,
        branch: webhook.branch,
      },
      message: 'Webhook updated successfully',
    });
  } catch (error: any) {
    console.error('[WEBHOOK-MANAGE] Error updating webhook:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update webhook' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete a webhook
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const webhookId = searchParams.get('webhookId');

    if (!webhookId) {
      return NextResponse.json(
        { error: 'Missing webhookId parameter' },
        { status: 400 }
      );
    }

    await dbConnect();

    const webhook = await Webhook.findOneAndDelete({
      _id: webhookId,
      userId: session.user.email,
    });

    if (!webhook) {
      return NextResponse.json(
        { error: 'Webhook not found' },
        { status: 404 }
      );
    }

    console.log('[WEBHOOK-MANAGE] ✅ Webhook deleted:', webhookId);

    return NextResponse.json({
      success: true,
      message: 'Webhook deleted successfully',
      note: 'Please manually remove the webhook from GitHub repository settings if it was created.',
    });
  } catch (error: any) {
    console.error('[WEBHOOK-MANAGE] Error deleting webhook:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete webhook' },
      { status: 500 }
    );
  }
}

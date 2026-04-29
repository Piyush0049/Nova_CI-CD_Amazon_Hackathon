/**
 * GitHub Webhook Handler API Route
 * Handles GitHub push events and triggers continuous deployment
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import dbConnect from '@/lib/mongodb';
import Webhook from '@/models/Webhook';
import Pipeline from '@/models/Pipeline';

/**
 * Verify GitHub webhook signature using HMAC-SHA256
 */
function verifyGitHubSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  } catch {
    return false;
  }
}

/**
 * POST - Handle incoming GitHub webhook
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const signature = request.headers.get('X-Hub-Signature-256') || '';
    const event = request.headers.get('X-GitHub-Event') || '';
    const delivery = request.headers.get('X-GitHub-Delivery') || '';

    console.log('[GITHUB-WEBHOOK] ════════════════════════════════════════════════════════════');
    console.log('[GITHUB-WEBHOOK] 📨 Incoming Webhook');
    console.log('[GITHUB-WEBHOOK] Event:', event);
    console.log('[GITHUB-WEBHOOK] Delivery ID:', delivery);
    console.log('[GITHUB-WEBHOOK] ════════════════════════════════════════════════════════════');

    // Get raw body for signature verification
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody);

    // Only handle push events for continuous deployment
    if (event !== 'push') {
      console.log('[GITHUB-WEBHOOK] ⚠️  Ignoring non-push event:', event);
      return NextResponse.json({
        success: true,
        message: `Webhook received but ignoring ${event} event`,
      });
    }

    const repoFullName = payload.repository?.full_name;
    const branch = payload.ref?.replace('refs/heads/', '');
    const commitSha = payload.head_commit?.id;
    const commitMessage = payload.head_commit?.message;
    const pusherName = payload.pusher?.name;

    if (!repoFullName || !branch) {
      console.error('[GITHUB-WEBHOOK] ❌ Missing repository or branch info');
      return NextResponse.json(
        { error: 'Invalid webhook payload: missing repository or branch' },
        { status: 400 }
      );
    }

    console.log('[GITHUB-WEBHOOK] 📦 Repository:', repoFullName);
    console.log('[GITHUB-WEBHOOK] 🌿 Branch:', branch);
    console.log('[GITHUB-WEBHOOK] 📝 Commit:', commitSha?.substring(0, 7));
    console.log('[GITHUB-WEBHOOK] 👤 Pusher:', pusherName);
    console.log('[GITHUB-WEBHOOK] 💬 Message:', commitMessage?.split('\n')[0]);

    await dbConnect();

    // Find webhook configuration for this repository
    const webhook = await Webhook.findOne({
      repoFullName,
      active: true,
    });

    if (!webhook) {
      console.log('[GITHUB-WEBHOOK] ⚠️  No active webhook found for:', repoFullName);
      return NextResponse.json({
        success: true,
        message: 'Webhook received but no active configuration found',
      });
    }

    console.log('[GITHUB-WEBHOOK] ✅ Found webhook configuration');
    console.log('[GITHUB-WEBHOOK] Webhook ID:', webhook._id);
    console.log('[GITHUB-WEBHOOK] Target branch:', webhook.branch);

    // Verify webhook signature for security
    const isValidSignature = verifyGitHubSignature(rawBody, signature, webhook.secret);
    if (!isValidSignature) {
      console.error('[GITHUB-WEBHOOK] ❌ Invalid webhook signature!');

      // Update failed trigger count
      await Webhook.findByIdAndUpdate(webhook._id, {
        $inc: { failedTriggers: 1 },
        lastTriggered: new Date(),
      });

      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    console.log('[GITHUB-WEBHOOK] ✅ Signature verified');

    // Check if push is to the target branch
    if (webhook.branch && branch !== webhook.branch) {
      console.log('[GITHUB-WEBHOOK] ⏭️  Ignoring push to non-target branch');
      console.log('[GITHUB-WEBHOOK] Target:', webhook.branch, '| Received:', branch);

      return NextResponse.json({
        success: true,
        message: `Ignoring push to ${branch} (watching ${webhook.branch})`,
      });
    }

    // Get pipeline configuration
    const pipeline = await Pipeline.findById(webhook.pipelineId);
    if (!pipeline) {
      console.error('[GITHUB-WEBHOOK] ❌ Pipeline not found:', webhook.pipelineId);

      await Webhook.findByIdAndUpdate(webhook._id, {
        $inc: { failedTriggers: 1 },
        lastTriggered: new Date(),
      });

      return NextResponse.json(
        { error: 'Pipeline configuration not found' },
        { status: 404 }
      );
    }

    console.log('[GITHUB-WEBHOOK] ✅ Found pipeline:', pipeline._id);
    console.log('[GITHUB-WEBHOOK] Pipeline name:', pipeline.name);

    // Trigger deployment via smart deploy API
    console.log('[GITHUB-WEBHOOK] ════════════════════════════════════════════════════════════');
    console.log('[GITHUB-WEBHOOK] 🚀 TRIGGERING CONTINUOUS DEPLOYMENT');
    console.log('[GITHUB-WEBHOOK] ════════════════════════════════════════════════════════════');

    const deploymentResponse = await fetch(
      `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/deploy/smart`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Internal API key to bypass middleware authentication
          'X-Internal-Request': process.env.NEXTAUTH_SECRET || 'internal-webhook-request',
        },
        body: JSON.stringify({
          repoUrl: webhook.repoUrl,
          repoFullName: webhook.repoFullName,
          pipelineId: webhook.pipelineId,
          envVars: webhook.envVars || {},
          githubToken: webhook.githubToken || undefined, // Pass GitHub token if available
          reuseInstance: true, // Request instance reuse
          triggeredBy: 'webhook',
          commit: {
            sha: commitSha,
            message: commitMessage,
            author: pusherName,
          },
        }),
      }
    );

    const deploymentResult = await deploymentResponse.json();

    if (deploymentResponse.ok && deploymentResult.success) {
      console.log('[GITHUB-WEBHOOK] ✅ Deployment triggered successfully!');
      console.log('[GITHUB-WEBHOOK] Instance ID:', deploymentResult.instanceId);
      console.log('[GITHUB-WEBHOOK] Public IP:', deploymentResult.publicIp);

      // Update webhook statistics
      await Webhook.findByIdAndUpdate(webhook._id, {
        $inc: { totalTriggers: 1, successfulTriggers: 1 },
        lastTriggered: new Date(),
      });

      const duration = Date.now() - startTime;
      console.log('[GITHUB-WEBHOOK] ════════════════════════════════════════════════════════════');
      console.log('[GITHUB-WEBHOOK] ✅ WEBHOOK PROCESSED SUCCESSFULLY');
      console.log('[GITHUB-WEBHOOK] Duration:', duration, 'ms');
      console.log('[GITHUB-WEBHOOK] ════════════════════════════════════════════════════════════');

      return NextResponse.json({
        success: true,
        message: '✅ Continuous deployment triggered successfully',
        deployment: {
          instanceId: deploymentResult.instanceId,
          publicIp: deploymentResult.publicIp,
          deploymentId: deploymentResult.deploymentId,
        },
        webhook: {
          id: webhook._id.toString(),
          totalTriggers: webhook.totalTriggers + 1,
        },
        commit: {
          sha: commitSha?.substring(0, 7),
          message: commitMessage?.split('\n')[0],
          author: pusherName,
        },
      });
    } else {
      console.error('[GITHUB-WEBHOOK] ❌ Deployment failed:', deploymentResult.error);

      // Update failed trigger count
      await Webhook.findByIdAndUpdate(webhook._id, {
        $inc: { totalTriggers: 1, failedTriggers: 1 },
        lastTriggered: new Date(),
      });

      return NextResponse.json(
        {
          error: 'Deployment trigger failed',
          details: deploymentResult.error,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[GITHUB-WEBHOOK] ❌ Error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

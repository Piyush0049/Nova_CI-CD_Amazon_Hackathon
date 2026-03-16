// GitHub Webhook Handler API Route

import { NextRequest } from 'next/server';
import { webhookHandler } from '@/lib/cicd/webhook-handler';

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('X-Hub-Signature-256') || '';
    const event = request.headers.get('X-GitHub-Event') || '';
    const payload = await request.json();

    console.log(`Received GitHub webhook: ${event}`);

    // Handle the webhook
    const webhookEvent = await webhookHandler.handleGitHubWebhook(
      payload,
      signature,
      event
    );

    if (!webhookEvent) {
      return new Response(
        JSON.stringify({ error: 'Invalid webhook event' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        event: webhookEvent,
        message: 'Webhook processed successfully',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

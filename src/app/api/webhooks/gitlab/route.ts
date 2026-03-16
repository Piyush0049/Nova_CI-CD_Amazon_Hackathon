// GitLab Webhook Handler API Route

import { NextRequest } from 'next/server';
import { webhookHandler } from '@/lib/cicd/webhook-handler';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('X-Gitlab-Token') || '';
    const payload = await request.json();

    console.log('Received GitLab webhook');

    // Handle the webhook
    const webhookEvent = await webhookHandler.handleGitLabWebhook(payload, token);

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

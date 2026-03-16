// Webhook Integration System

import { WebhookEvent } from '@/types/pipeline';
import { PipelineParser } from './pipeline-parser';
import { nanoid } from 'nanoid';

export interface WebhookConfig {
  id: string;
  url: string;
  secret?: string;
  events: ('push' | 'pull_request' | 'tag' | 'release')[];
  active: boolean;
  projectId: string;
}

export class WebhookHandler {
  private webhooks: Map<string, WebhookConfig> = new Map();

  /**
   * Register a new webhook
   */
  registerWebhook(config: Omit<WebhookConfig, 'id'>): WebhookConfig {
    const webhook: WebhookConfig = {
      id: nanoid(),
      ...config,
    };

    this.webhooks.set(webhook.id, webhook);
    console.log(`Webhook registered for project ${webhook.projectId}`);

    return webhook;
  }

  /**
   * Handle incoming webhook from GitHub
   */
  async handleGitHubWebhook(payload: any, signature: string, event: string): Promise<WebhookEvent | null> {
    console.log(`Received GitHub webhook: ${event}`);

    // Verify signature (in production, verify HMAC)
    // const isValid = this.verifySignature(payload, signature);
    // if (!isValid) return null;

    // Parse event
    const webhookEvent = this.parseGitHubEvent(payload, event);
    if (!webhookEvent) return null;

    // Trigger pipeline
    await this.triggerPipeline(webhookEvent);

    return webhookEvent;
  }

  /**
   * Handle incoming webhook from GitLab
   */
  async handleGitLabWebhook(payload: any, token: string): Promise<WebhookEvent | null> {
    console.log('Received GitLab webhook');

    // Verify token
    // const isValid = this.verifyToken(token);
    // if (!isValid) return null;

    const webhookEvent = this.parseGitLabEvent(payload);
    if (!webhookEvent) return null;

    await this.triggerPipeline(webhookEvent);

    return webhookEvent;
  }

  /**
   * Parse GitHub webhook event
   */
  private parseGitHubEvent(payload: any, event: string): WebhookEvent | null {
    try {
      if (event === 'push') {
        return {
          id: nanoid(),
          type: 'push',
          repository: payload.repository.full_name,
          branch: payload.ref.replace('refs/heads/', ''),
          commit: {
            sha: payload.head_commit.id,
            message: payload.head_commit.message,
            author: payload.head_commit.author.name,
          },
          timestamp: new Date(payload.head_commit.timestamp),
          payload,
        };
      }

      if (event === 'pull_request') {
        return {
          id: nanoid(),
          type: 'pull_request',
          repository: payload.repository.full_name,
          branch: payload.pull_request.head.ref,
          commit: {
            sha: payload.pull_request.head.sha,
            message: payload.pull_request.title,
            author: payload.pull_request.user.login,
          },
          timestamp: new Date(),
          payload,
        };
      }

      if (event === 'create' && payload.ref_type === 'tag') {
        return {
          id: nanoid(),
          type: 'tag',
          repository: payload.repository.full_name,
          branch: payload.ref,
          commit: {
            sha: payload.master_branch,
            message: `Tag ${payload.ref}`,
            author: payload.sender.login,
          },
          timestamp: new Date(),
          payload,
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to parse GitHub webhook:', error);
      return null;
    }
  }

  /**
   * Parse GitLab webhook event
   */
  private parseGitLabEvent(payload: any): WebhookEvent | null {
    try {
      if (payload.object_kind === 'push') {
        return {
          id: nanoid(),
          type: 'push',
          repository: payload.project.path_with_namespace,
          branch: payload.ref.replace('refs/heads/', ''),
          commit: {
            sha: payload.checkout_sha,
            message: payload.commits[0]?.message || 'Push event',
            author: payload.user_name,
          },
          timestamp: new Date(),
          payload,
        };
      }

      if (payload.object_kind === 'merge_request') {
        return {
          id: nanoid(),
          type: 'pull_request',
          repository: payload.project.path_with_namespace,
          branch: payload.object_attributes.source_branch,
          commit: {
            sha: payload.object_attributes.last_commit.id,
            message: payload.object_attributes.title,
            author: payload.user.name,
          },
          timestamp: new Date(),
          payload,
        };
      }

      if (payload.object_kind === 'tag_push') {
        return {
          id: nanoid(),
          type: 'tag',
          repository: payload.project.path_with_namespace,
          branch: payload.ref.replace('refs/tags/', ''),
          commit: {
            sha: payload.checkout_sha,
            message: `Tag ${payload.ref}`,
            author: payload.user_name,
          },
          timestamp: new Date(),
          payload,
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to parse GitLab webhook:', error);
      return null;
    }
  }

  /**
   * Trigger pipeline from webhook event
   */
  private async triggerPipeline(event: WebhookEvent): Promise<void> {
    console.log(`Triggering pipeline for ${event.repository}/${event.branch}`);

    // Load pipeline configuration from repository
    const yamlConfig = await this.loadPipelineConfig(event.repository, event.branch);
    if (!yamlConfig) {
      console.log('No pipeline configuration found');
      return;
    }

    // Parse and create pipeline
    const pipeline = PipelineParser.parseConfig(yamlConfig, {
      project: event.repository,
      branch: event.branch,
      commit: event.commit,
      triggeredBy: 'webhook',
      user: event.commit.author,
    });

    console.log(`Pipeline ${pipeline.id} created from webhook`);

    // Queue pipeline for execution
    // In production, this would queue the pipeline
  }

  /**
   * Load pipeline configuration from repository
   */
  private async loadPipelineConfig(repository: string, branch: string): Promise<string | null> {
    // In production, fetch .gitlab-ci.yml or .github/workflows/*.yml from repository
    console.log(`Loading pipeline config for ${repository}:${branch}`);

    // Return demo config
    return `
stages:
  - build
  - test
  - deploy

build:
  stage: build
  script:
    - npm install
    - npm run build

test:
  stage: test
  script:
    - npm test

deploy:
  stage: deploy
  script:
    - npm run deploy
  only:
    - main
`;
  }

  /**
   * Verify webhook signature (GitHub)
   */
  private verifySignature(payload: string, signature: string, secret: string): boolean {
    // Implement HMAC-SHA256 verification
    // const hmac = crypto.createHmac('sha256', secret);
    // const digest = 'sha256=' + hmac.update(payload).digest('hex');
    // return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
    return true;
  }

  /**
   * Get all webhooks
   */
  getWebhooks(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Get webhooks for a project
   */
  getProjectWebhooks(projectId: string): WebhookConfig[] {
    return Array.from(this.webhooks.values()).filter(
      webhook => webhook.projectId === projectId
    );
  }

  /**
   * Delete webhook
   */
  deleteWebhook(webhookId: string): boolean {
    return this.webhooks.delete(webhookId);
  }

  /**
   * Update webhook
   */
  updateWebhook(webhookId: string, updates: Partial<WebhookConfig>): WebhookConfig | null {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook) return null;

    const updated = { ...webhook, ...updates };
    this.webhooks.set(webhookId, updated);

    return updated;
  }
}

// Global webhook handler instance
export const webhookHandler = new WebhookHandler();

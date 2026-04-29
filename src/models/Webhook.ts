/**
 * Webhook Model
 * Stores webhook configurations for continuous deployment
 */

import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWebhook extends Document {
  userId: string;
  repoFullName: string;
  repoUrl: string;
  pipelineId: string;
  secret: string;
  githubToken?: string; // GitHub Personal Access Token for cloning private repos
  events: string[];
  active: boolean;
  lastTriggered?: Date;
  totalTriggers: number;
  successfulTriggers: number;
  failedTriggers: number;
  branch?: string;
  autoRedeploy: boolean;
  envVars?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookSchema = new Schema<IWebhook>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    repoFullName: {
      type: String,
      required: true,
      index: true,
    },
    repoUrl: {
      type: String,
      required: true,
    },
    pipelineId: {
      type: String,
      required: true,
      ref: 'Pipeline',
    },
    secret: {
      type: String,
      required: true,
    },
    githubToken: {
      type: String,
      required: false, // Optional - only needed for private repos
    },
    events: {
      type: [String],
      default: ['push'],
    },
    active: {
      type: Boolean,
      default: true,
    },
    lastTriggered: {
      type: Date,
    },
    totalTriggers: {
      type: Number,
      default: 0,
    },
    successfulTriggers: {
      type: Number,
      default: 0,
    },
    failedTriggers: {
      type: Number,
      default: 0,
    },
    branch: {
      type: String,
      default: 'main',
    },
    autoRedeploy: {
      type: Boolean,
      default: true,
    },
    envVars: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for faster lookups
WebhookSchema.index({ userId: 1, repoFullName: 1 });
WebhookSchema.index({ repoFullName: 1, active: 1 });

const Webhook: Model<IWebhook> =
  mongoose.models.Webhook || mongoose.model<IWebhook>('Webhook', WebhookSchema);

export default Webhook;

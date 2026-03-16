import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPipeline extends Document {
  userId: string;
  name: string;
  repo: string;
  repoFullName: string;
  repoUrl?: string; // Full GitHub URL
  yaml: string;
  content?: string; // Alias for yaml
  language?: string;
  framework?: string;
  stages?: string[]; // Pipeline stages (install, build, test, etc.)
  port?: string; // AI-detected port (e.g., '3000', '9000', etc.)
  startCommand?: string; // AI-detected start command
  status: 'active' | 'inactive' | 'archived';
  envVars?: Record<string, string>; // Saved environment variables
  deployments: Array<{
    instanceId: string;
    commandId: string;
    deployedAt: Date;
    status: 'success' | 'failed' | 'pending';
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const PipelineSchema = new Schema<IPipeline>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    repo: {
      type: String,
      required: true,
    },
    repoFullName: {
      type: String,
      required: true,
    },
    repoUrl: {
      type: String,
    },
    yaml: {
      type: String,
      required: true,
    },
    content: {
      type: String, // Alias for yaml
    },
    language: {
      type: String,
    },
    framework: {
      type: String,
    },
    stages: {
      type: [String],
      default: [],
    },
    port: {
      type: String,
    },
    startCommand: {
      type: String,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'archived'],
      default: 'active',
    },
    envVars: {
      type: Map,
      of: String,
      default: {},
    },
    deployments: [
      {
        instanceId: String,
        commandId: String,
        deployedAt: Date,
        status: {
          type: String,
          enum: ['success', 'failed', 'pending'],
          default: 'pending',
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
PipelineSchema.index({ userId: 1, createdAt: -1 });
PipelineSchema.index({ userId: 1, status: 1 });

const Pipeline: Model<IPipeline> =
  mongoose.models.Pipeline || mongoose.model<IPipeline>('Pipeline', PipelineSchema);

export default Pipeline;

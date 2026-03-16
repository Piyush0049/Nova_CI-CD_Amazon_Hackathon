import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDeployment extends Document {
  userId: string;
  pipelineId: string;
  pipelineName: string;
  repoFullName: string;
  instanceId: string;
  publicIp: string;
  instanceType: string;
  region: string;
  status: 'deploying' | 'success' | 'failed';
  deployedAt: Date;
  errorMessage?: string;
  envVarsCount: number;
  trackingId?: string; // For real-time log streaming
  // Nginx deployment info
  deploymentType?: 'STATIC' | 'BACKEND';
  framework?: string;
  nginxEnabled?: boolean;
  port?: number;
  logs?: Array<{
    timestamp: Date;
    level: 'info' | 'success' | 'warning' | 'error';
    stage: string;
    message: string;
  }>;
  detectedIssues?: {
    tailwindV4: boolean;
    viteNotFound: boolean;
    jsxExtensionIssue: boolean;
    cssNotImported: boolean;
    portInUse: boolean;
    startupWarning?: string;
  };
  rawLogs?: string;
  createdAt: Date;
  updatedAt: Date;
}

const DeploymentSchema = new Schema<IDeployment>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    pipelineId: {
      type: String,
      required: true,
      index: true,
    },
    pipelineName: {
      type: String,
      required: true,
    },
    repoFullName: {
      type: String,
      required: true,
    },
    instanceId: {
      type: String,
      required: true,
    },
    publicIp: {
      type: String,
      required: false,
      default: '',
    },
    instanceType: {
      type: String,
      default: 't3.small',
    },
    region: {
      type: String,
      default: 'us-east-1',
    },
    status: {
      type: String,
      enum: ['deploying', 'success', 'failed'],
      default: 'deploying',
    },
    deployedAt: {
      type: Date,
      default: Date.now,
    },
    errorMessage: {
      type: String,
    },
    envVarsCount: {
      type: Number,
      default: 0,
    },
    trackingId: {
      type: String,
      index: true, // For fast lookup
    },
    // Nginx deployment info
    deploymentType: {
      type: String,
      enum: ['STATIC', 'BACKEND'],
    },
    framework: {
      type: String,
    },
    nginxEnabled: {
      type: Boolean,
      default: false,
    },
    port: {
      type: Number,
    },
    logs: {
      type: [
        {
          timestamp: Date,
          level: {
            type: String,
            enum: ['info', 'success', 'warning', 'error'],
          },
          stage: String,
          message: String,
        },
      ],
      default: [],
    },
    detectedIssues: {
      type: {
        tailwindV4: { type: Boolean, default: false },
        viteNotFound: { type: Boolean, default: false },
        jsxExtensionIssue: { type: Boolean, default: false },
        cssNotImported: { type: Boolean, default: false },
        portInUse: { type: Boolean, default: false },
        startupWarning: { type: String },
      },
      default: {},
    },
    rawLogs: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
DeploymentSchema.index({ userId: 1, createdAt: -1 });
DeploymentSchema.index({ pipelineId: 1, createdAt: -1 });
DeploymentSchema.index({ status: 1 });

const Deployment: Model<IDeployment> =
  mongoose.models.Deployment || mongoose.model<IDeployment>('Deployment', DeploymentSchema);

export default Deployment;

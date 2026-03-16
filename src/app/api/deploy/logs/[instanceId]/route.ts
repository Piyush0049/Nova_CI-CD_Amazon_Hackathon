import { NextRequest, NextResponse } from 'next/server';
import { SSMClient, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import dbConnect from '@/lib/mongodb';
import Deployment from '@/models/Deployment';

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

interface LogEntry {
  timestamp: string;
  stage: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

/**
 * GET - Fetch deployment logs for a specific instance
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { instanceId: string } }
) {
  try {
    const { instanceId } = params;

    if (!instanceId) {
      return NextResponse.json(
        { error: 'Instance ID is required' },
        { status: 400 }
      );
    }

    await dbConnect();

    // Get deployment record
    const deployment = await Deployment.findOne({ instanceId }).sort({ createdAt: -1 });

    if (!deployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

    // Parse logs and extract structured data
    const logs: LogEntry[] = deployment.logs || [];
    const suggestions: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    // Detect issues and provide suggestions
    const detectedIssues = analyzeDeployment(deployment);

    // Extract clean, relevant logs from rawLogs
    const cleanLogs = extractCleanLogs(deployment.rawLogs || '');

    return NextResponse.json({
      instanceId,
      deploymentId: deployment._id.toString(),
      status: deployment.status,
      publicIp: deployment.publicIp,
      repoFullName: deployment.repoFullName,
      deployedAt: deployment.deployedAt,
      logs,
      rawLogs: deployment.rawLogs || '',
      cleanLogs, // Filtered logs for display
      detectedIssues,
      currentStage: getCurrentStage(deployment.status, cleanLogs),
    });
  } catch (error: any) {
    console.error('[LOGS-API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch logs' },
      { status: 500 }
    );
  }
}

/**
 * Analyze deployment and provide actionable suggestions
 */
function analyzeDeployment(deployment: any) {
  const issues = {
    suggestions: [] as string[],
    warnings: [] as string[],
    errors: [] as string[],
    fixes: [] as { title: string; description: string; code: string; file: string }[],
  };

  if (deployment.status === 'deploying') {
    issues.suggestions.push('Deployment in progress. This typically takes 3-5 minutes.');
    issues.suggestions.push('Pre-flight checks are automatically fixing common issues.');
  }

  if (deployment.errorMessage) {
    const errorMsg = deployment.errorMessage.toLowerCase();

    // Tailwind CSS v4 issue
    if (errorMsg.includes('tailwindcss is not defined') || errorMsg.includes('@tailwindcss/vite')) {
      issues.errors.push('Tailwind CSS v4 native binding error detected');
      issues.fixes.push({
        title: 'Fix Tailwind CSS Configuration',
        description: 'Downgrade from Tailwind v4 to v3 for better compatibility',
        file: 'package.json',
        code: `npm uninstall @tailwindcss/vite @tailwindcss/oxide
npm install -D tailwindcss@^3.4.0 postcss autoprefixer`,
      });
      issues.fixes.push({
        title: 'Update vite.config.js',
        description: 'Remove @tailwindcss/vite plugin',
        file: 'vite.config.js',
        code: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()], // Remove tailwindcss() plugin
  build: {
    outDir: "dist",
  },
});`,
      });
      issues.fixes.push({
        title: 'Create postcss.config.js',
        description: 'Use PostCSS for Tailwind processing',
        file: 'postcss.config.js',
        code: `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,
      });
    }

    // Vite not found
    if (errorMsg.includes('vite: command not found') || errorMsg.includes('cannot find package')) {
      issues.errors.push('Vite is not installed or not accessible');
      issues.fixes.push({
        title: 'Install Vite Dependencies',
        description: 'Ensure Vite is in devDependencies',
        file: 'package.json',
        code: `npm install -D vite @vitejs/plugin-react`,
      });
    }

    // JSX file extension issues
    if (errorMsg.includes('jsx syntax') || errorMsg.includes('unexpected token')) {
      issues.warnings.push('JSX files may have incorrect .js extension');
      issues.fixes.push({
        title: 'Rename JSX Files',
        description: 'Files with JSX should use .jsx extension',
        file: 'src/App.js → src/App.jsx',
        code: `# Rename files
mv src/App.js src/App.jsx
mv src/main.js src/main.jsx

# Update imports in your files
# Change: import App from './App.js'
# To:     import App from './App.jsx'`,
      });
    }

    // CSS not imported
    if (errorMsg.includes('css') && errorMsg.includes('not found')) {
      issues.warnings.push('CSS file may not be imported in entry file');
      issues.fixes.push({
        title: 'Import CSS in Entry File',
        description: 'Add CSS import to main.jsx or index.jsx',
        file: 'src/main.jsx',
        code: `import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Add this line
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(<App />);`,
      });
    }

    // Port in use
    if (errorMsg.includes('port') && errorMsg.includes('in use')) {
      issues.warnings.push('Port 80 is already in use');
      issues.suggestions.push('The deployment system will automatically kill the old process and restart.');
    }
  }

  // General suggestions for successful deployments
  if (deployment.status === 'deploying' || deployment.status === 'success') {
    issues.suggestions.push('Ensure all environment variables are properly set in your .env file');
    issues.suggestions.push('Check that your build command in package.json is correct');
    issues.suggestions.push('Verify that index.html exists in the project root for Vite projects');
  }

  return issues;
}

/**
 * Extract clean, relevant logs for display
 */
function extractCleanLogs(rawLogs: string): string[] {
  if (!rawLogs) return [];

  const lines = rawLogs.split('\n');
  const cleanLines: string[] = [];

  const relevantPrefixes = [
    '[SMART-DEPLOY]',
    '[PROJECT-DETECTOR]',
    '[DETECT]',
    '[PRE-FLIGHT]',
    '[INSTALL]',
    '[BUILD]',
    '[START]',
    '[STAGE',
    '✓',
    '✅',
    '⚠️',
    '❌',
    '🔧',
    '📦',
    '🚀',
    'ERROR:',
    'WARNING:',
    'SUCCESS:',
    'Environment variables',
    'Detected:',
    'Pipeline stages:',
    'Framework:',
  ];

  const skipPatterns = [
    /^npm WARN/,
    /^npm notice/,
    /deprecated/,
    /^added \d+ packages/,
    /^audited \d+ packages/,
    /found 0 vulnerabilities/,
    /^$/,  // Empty lines
    /^(\s+)?at /,  // Stack traces
    /node_modules\//,  // Node modules paths
    /^  [\w-]+@/,  // Package installation details
  ];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty or irrelevant lines
    if (!trimmed || skipPatterns.some(pattern => pattern.test(line))) {
      continue;
    }

    // Include lines with relevant prefixes or important keywords
    if (relevantPrefixes.some(prefix => line.includes(prefix))) {
      cleanLines.push(line);
    } else if (
      /Building|Compiling|Installing|Starting|Running|Deploying|Complete|Failed|Error|Warning/i.test(line)
    ) {
      cleanLines.push(line);
    }
  }

  return cleanLines;
}

/**
 * Get current deployment stage from logs
 */
function getCurrentStage(status: string, cleanLogs: string[]): string {
  if (status === 'success') return 'Deployment complete';
  if (status === 'failed') return 'Deployment failed';

  // Analyze recent logs to determine current stage
  const recentLogs = cleanLogs.slice(-10).join(' ');

  if (recentLogs.includes('[START]') || recentLogs.includes('Starting')) {
    return 'Starting application...';
  }
  if (recentLogs.includes('[BUILD]') || recentLogs.includes('Building')) {
    return 'Building application...';
  }
  if (recentLogs.includes('[INSTALL]') || recentLogs.includes('Installing')) {
    return 'Installing dependencies...';
  }
  if (recentLogs.includes('[PRE-FLIGHT]') || recentLogs.includes('Pre-flight')) {
    return 'Running pre-flight checks...';
  }
  if (recentLogs.includes('Analyzing')) {
    return 'Analyzing repository...';
  }

  return 'Deploying...';
}

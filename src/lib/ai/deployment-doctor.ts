/**
 * Deployment Doctor - AI-powered error detection and auto-fix
 * Shows all fixes applied on the deployment dashboard
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

export interface DeploymentFix {
  type: 'config' | 'dependency' | 'build' | 'runtime' | 'permission';
  severity: 'critical' | 'warning' | 'info';
  issue: string;
  fix: string;
  command?: string;
  applied: boolean;
}

export interface DeploymentDiagnosis {
  projectType: 'frontend' | 'backend' | 'fullstack';
  framework: string;
  entryPoint: string;
  fixes: DeploymentFix[];
  recommendations: string[];
}

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * Diagnose deployment and suggest fixes using Amazon Nova Premier
 */
export async function diagnoseDeployment(
  repoFiles: Record<string, string>,
  errorLogs?: string
): Promise<DeploymentDiagnosis> {
  console.log('[DEPLOYMENT-DOCTOR] 🏥 Diagnosing deployment...');

  try {
    const prompt = buildDiagnosisPrompt(repoFiles, errorLogs);
    const response = await invokeNovaPremier(prompt);
    const diagnosis = parseDiagnosis(response);

    console.log('[DEPLOYMENT-DOCTOR] ✓ Diagnosis complete');
    console.log('[DEPLOYMENT-DOCTOR] Fixes found:', diagnosis.fixes.length);

    return diagnosis;
  } catch (error: any) {
    console.error('[DEPLOYMENT-DOCTOR] Error:', error.message);
    return getFallbackDiagnosis(repoFiles);
  }
}

function buildDiagnosisPrompt(files: Record<string, string>, errorLogs?: string): string {
  let fileContext = '';
  for (const [name, content] of Object.entries(files)) {
    fileContext += `\n### ${name}\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\`\n`;
  }

  let errorContext = '';
  if (errorLogs) {
    errorContext = `\n### ERROR LOGS\n\`\`\`\n${errorLogs.slice(-2000)}\n\`\`\`\n`;
  }

  return `You are an expert DevOps doctor. Analyze this repository and deployment for potential issues.

${fileContext}
${errorContext}

Provide a JSON response with:

{
  "projectType": "frontend|backend|fullstack",
  "framework": "exact framework name",
  "entryPoint": "main entry file (index.js, server.js, main.py, etc)",
  "fixes": [
    {
      "type": "config|dependency|build|runtime|permission",
      "severity": "critical|warning|info",
      "issue": "description of the issue",
      "fix": "description of the fix",
      "command": "exact command to run (if applicable)",
      "applied": false
    }
  ],
  "recommendations": [
    "list of deployment recommendations"
  ]
}

Common issues to check for:
- ES module errors (require() vs import, .js vs .cjs extensions)
- PostCSS/Tailwind config issues with "type": "module"
- Missing dependencies
- Build tool not found (vite, webpack)
- Port binding issues
- Prisma client not generated
- File permissions
- Entry point not found

Return ONLY valid JSON, no markdown formatting.`;
}

async function invokeNovaPremier(prompt: string): Promise<string> {
  console.log('[DEPLOYMENT-DOCTOR] 🚀 Invoking Amazon Nova Premier...');

  const command = new ConverseCommand({
    modelId: 'us.amazon.nova-premier-v1:0',
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 4096,
      temperature: 0.1,
      topP: 0.9,
    },
  });

  const response = await bedrockClient.send(command);
  return response.output?.message?.content?.[0]?.text || '';
}

function parseDiagnosis(response: string): DeploymentDiagnosis {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    return JSON.parse(jsonMatch[0]) as DeploymentDiagnosis;
  } catch (error: any) {
    console.error('[DEPLOYMENT-DOCTOR] Parse error:', error.message);
    throw error;
  }
}

function getFallbackDiagnosis(files: Record<string, string>): DeploymentDiagnosis {
  const fixes: DeploymentFix[] = [];

  // Check for common issues
  if (files.packageJson) {
    const pkg = JSON.parse(files.packageJson);

    // Check for ES module issues
    if (pkg.type === 'module') {
      fixes.push({
        type: 'config',
        severity: 'warning',
        issue: 'Package uses "type": "module" - may have CommonJS compatibility issues',
        fix: 'Rename .js config files to .cjs (postcss.config.js → postcss.config.cjs)',
        applied: false,
      });
    }

    // Check for Prisma
    if (pkg.dependencies?.['@prisma/client']) {
      fixes.push({
        type: 'dependency',
        severity: 'critical',
        issue: 'Prisma detected but client may not be generated',
        fix: 'Run "npx prisma generate" after npm install',
        command: 'npx prisma generate',
        applied: false,
      });
    }
  }

  return {
    projectType: 'unknown' as any,
    framework: 'unknown',
    entryPoint: 'unknown',
    fixes,
    recommendations: [
      'Use forced clean install to avoid npm caching',
      'Ensure environment variables are configured',
      'Check build tool configuration',
    ],
  };
}

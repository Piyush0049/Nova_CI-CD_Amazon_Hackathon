/**
 * Deployment Suggestions API
 * Analyzes deployment errors and suggests exact repository fixes
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export interface DeploymentSuggestion {
  type: 'file_change' | 'dependency' | 'config' | 'code_fix';
  severity: 'critical' | 'recommended' | 'optional';
  title: string;
  description: string;
  file?: string;
  code?: string;
  commitMessage?: string;
  command?: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { deploymentLogs, errorMessage, repoName, packageJson } = await request.json();

    console.log('[SUGGESTIONS] Analyzing deployment failure for:', repoName);

    const suggestions = await analyzeDeploymentAndSuggest(
      deploymentLogs,
      errorMessage,
      repoName,
      packageJson
    );

    console.log('[SUGGESTIONS] Generated', suggestions.length, 'suggestions');

    return NextResponse.json({
      success: true,
      suggestions,
      repoName,
    });
  } catch (error: any) {
    console.error('[SUGGESTIONS] Error:', error.message);
    return NextResponse.json(
      { error: 'Failed to generate suggestions', details: error.message },
      { status: 500 }
    );
  }
}

async function analyzeDeploymentAndSuggest(
  logs: string,
  errorMsg: string,
  repoName: string,
  packageJson?: string
): Promise<DeploymentSuggestion[]> {
  const prompt = `You are a DevOps expert analyzing a failed deployment. Provide SPECIFIC, ACTIONABLE suggestions for fixing the repository.

REPOSITORY: ${repoName}

ERROR MESSAGE:
${errorMsg}

DEPLOYMENT LOGS (last 2000 chars):
${logs.slice(-2000)}

${packageJson ? `PACKAGE.JSON:\n${packageJson}\n` : ''}

Analyze the error and provide EXACT repository fixes in JSON format:

{
  "suggestions": [
    {
      "type": "file_change|dependency|config|code_fix",
      "severity": "critical|recommended|optional",
      "title": "Short title (e.g., 'Fix PostCSS configuration')",
      "description": "Clear explanation of what's wrong and why this fix helps",
      "file": "exact/path/to/file.js (if applicable)",
      "code": "EXACT code to add/change (if applicable)",
      "commitMessage": "Suggested git commit message",
      "command": "Command to run (if applicable)"
    }
  ]
}

REQUIREMENTS:
1. Provide 2-5 specific suggestions
2. Include EXACT file paths and code snippets
3. Prioritize by severity (critical first)
4. Make suggestions copy-pastable
5. Include git commit messages

COMMON ISSUES TO CHECK:
- ES module errors: Rename .js configs to .cjs
- Missing dependencies: Add to package.json
- Build tool issues: Check vite/webpack configs
- Port/environment issues: Add .env file
- Missing files: Create index.html, etc.

Return ONLY valid JSON, no markdown.`;

  try {
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
    const text = response.output?.message?.content?.[0]?.text || '';

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[SUGGESTIONS] No JSON in response, using fallback');
      return getFallbackSuggestions(errorMsg, logs);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.suggestions || [];
  } catch (error: any) {
    console.error('[SUGGESTIONS] AI error:', error.message);
    return getFallbackSuggestions(errorMsg, logs);
  }
}

function getFallbackSuggestions(errorMsg: string, logs: string): DeploymentSuggestion[] {
  const suggestions: DeploymentSuggestion[] = [];

  // Check for common errors
  if (errorMsg.includes('module is not defined') || logs.includes('require is not defined')) {
    suggestions.push({
      type: 'file_change',
      severity: 'critical',
      title: 'Fix ES Module Error',
      description: 'Your package.json uses "type": "module" but config files use CommonJS syntax (require). Rename them to .cjs extension.',
      file: 'postcss.config.js',
      code: `// Rename postcss.config.js to postcss.config.cjs
// Rename tailwind.config.js to tailwind.config.cjs
// Keep the same content, just change the file extension`,
      commitMessage: 'fix: rename config files to .cjs for ES module compatibility',
    });
  }

  if (errorMsg.includes('vite: command not found') || errorMsg.includes('webpack: command not found')) {
    suggestions.push({
      type: 'dependency',
      severity: 'critical',
      title: 'Install Missing Build Tools',
      description: 'Build tools are not installed. Add them to package.json devDependencies.',
      file: 'package.json',
      code: `{
  "devDependencies": {
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0"
  }
}`,
      commitMessage: 'fix: add missing build tools to devDependencies',
      command: 'npm install --save-dev vite @vitejs/plugin-react',
    });
  }

  if (errorMsg.includes('Prisma') || logs.includes('prisma generate')) {
    suggestions.push({
      type: 'config',
      severity: 'recommended',
      title: 'Add Prisma Generate Script',
      description: 'Prisma client needs to be generated after install. Add a postinstall script.',
      file: 'package.json',
      code: `{
  "scripts": {
    "postinstall": "prisma generate"
  }
}`,
      commitMessage: 'fix: add postinstall script for Prisma generation',
    });
  }

  if (errorMsg.includes('EADDRINUSE') || logs.includes('port') && logs.includes('in use')) {
    suggestions.push({
      type: 'code_fix',
      severity: 'recommended',
      title: 'Fix Port Configuration',
      description: 'Ensure your app uses environment variables for port configuration.',
      file: 'index.js or server.js',
      code: `// Use environment variable for port
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(\`Server running on http://\${HOST}:\${PORT}\`);
});`,
      commitMessage: 'fix: use environment variables for port configuration',
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      type: 'config',
      severity: 'optional',
      title: 'Review Deployment Configuration',
      description: 'Check your build scripts and ensure all dependencies are properly installed.',
      file: 'package.json',
      code: `// Ensure these scripts exist:
{
  "scripts": {
    "build": "vite build",  // or "react-scripts build"
    "start": "node index.js"
  }
}`,
      commitMessage: 'fix: update build and start scripts',
    });
  }

  return suggestions;
}

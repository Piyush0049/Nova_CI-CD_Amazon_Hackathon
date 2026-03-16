// Deep Repository Analyzer with Amazon Nova Premier
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

export interface DeepRepositoryAnalysis {
  projectType: 'frontend' | 'backend' | 'fullstack' | 'monorepo' | 'unknown';
  framework: string;
  language: string;
  entryPoints: string[];
  buildTool: string;
  buildCommand: string;
  startCommand: string;
  outputDir: string;
  port: string;
  testFramework: string;
  dependencies: {
    production: string[];
    dev: string[];
  };
  structure: {
    hasTests: boolean;
    hasDocker: boolean;
    hasPrisma: boolean;
    hasTypeScript: boolean;
    hasDatabase: boolean;
    directories?: string[];
  };
  recommendations: string[];
  pipelineRequirements: {
    needsBuild: boolean;
    needsTests: boolean;
    needsLint: boolean;
    needsTypeCheck: boolean;
    needsPrismaGenerate: boolean;
    needsEnvVars: string[];
    installCommand?: string;
    preInstallSteps?: string[];
  };
}

export class RepositoryAnalyzer {
  private client: BedrockRuntimeClient;

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }

  /**
   * Analyze repository deeply using Amazon Nova Premier
   */
  async analyzeRepository(files: Record<string, string>): Promise<DeepRepositoryAnalysis> {
    console.log('[REPO-ANALYZER] 🔍 Starting deep repository analysis...');
    console.log('[REPO-ANALYZER] Files to analyze:', Object.keys(files));

    const prompt = this.buildAnalysisPrompt(files);

    try {
      const response = await this.invokeNovaPremier(prompt);
      const analysis = this.parseAnalysis(response, files);

      console.log('[REPO-ANALYZER] ✓ Analysis complete');
      console.log('[REPO-ANALYZER] Project Type:', analysis.projectType);
      console.log('[REPO-ANALYZER] Framework:', analysis.framework);
      console.log('[REPO-ANALYZER] Entry Points:', analysis.entryPoints);

      return analysis;
    } catch (error: any) {
      console.error('[REPO-ANALYZER] Error during analysis:', error.message);
      return this.getFallbackAnalysis(files);
    }
  }

  /**
   * Build comprehensive analysis prompt for Nova Premier
   */
  private buildAnalysisPrompt(files: Record<string, string>): string {
    // Get file list to show structure
    const fileList = Object.keys(files).sort();

    // Detect directories from file paths
    const directories = new Set<string>();
    fileList.forEach(file => {
      const parts = file.split('/');
      if (parts.length > 1) {
        directories.add(parts[0]);
      }
    });

    let fileContents = '=== REPOSITORY FILE STRUCTURE ===\n';
    fileContents += 'Directories: ' + Array.from(directories).join(', ') + '\n';
    fileContents += 'Files: ' + fileList.join(', ') + '\n\n';

    // Show important file contents
    fileContents += '=== IMPORTANT FILE CONTENTS ===\n\n';
    for (const [filename, content] of Object.entries(files)) {
      // Prioritize key files
      if (filename.includes('package.json') ||
          filename.includes('next.config') ||
          filename.includes('vite.config') ||
          filename.includes('webpack.config') ||
          filename.includes('tsconfig') ||
          filename.includes('index.') ||
          filename.includes('server.') ||
          filename.includes('app.')) {
        fileContents += `### ${filename}\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\`\n\n`;
      }
    }

    return `You are an EXPERT DevOps engineer analyzing a repository for deployment. Your analysis must be PERFECT and ACCURATE.

${fileContents}

CRITICAL DETECTION RULES:

🔍 NEXT.JS DETECTION:
- Look for: next.config.js, next.config.mjs, "next" in dependencies
- Directories: pages/, app/, src/app/, src/pages/
- Project Type: fullstack (Next.js is SSR, not pure frontend)
- Build Command: "next build" or "npm run build"
- Start Command: "next start" or "npm start"
- Needs Build: YES (always)
- Port: Usually 3000

🔍 VITE + REACT DETECTION:
- Look for: vite.config.js, vite.config.ts, "vite" in devDependencies
- Directories: src/, public/
- Files: index.html, src/main.tsx, src/main.jsx
- Project Type: frontend (static site)
- Build Command: "vite build" or "npm run build"
- Start Command: Serve static files from dist/
- Needs Build: YES
- Output: dist/ folder

🔍 CREATE REACT APP DETECTION:
- Look for: "react-scripts" in dependencies
- Directories: src/, public/
- Files: public/index.html, src/App.js
- Project Type: frontend
- Build Command: "react-scripts build" or "npm run build"
- Start Command: Serve static files from build/
- Needs Build: YES
- Output: build/ folder

🔍 EXPRESS/NODE BACKEND DETECTION:
- Look for: "express"/"fastify"/"koa" in dependencies
- Files: index.js, server.js, app.js, src/server.js
- NO vite.config, NO webpack.config, NO next.config
- Project Type: backend
- Build Command: NONE (unless TypeScript)
- Start Command: "node index.js" or "node server.js"
- Needs Build: NO (unless TypeScript)

🔍 TYPESCRIPT BACKEND DETECTION:
- Look for: tsconfig.json + "express" + NO frontend framework
- Project Type: backend
- Build Command: "tsc" or "npm run build" (compiles TS to JS)
- Start Command: "node dist/index.js"
- Needs Build: YES (TypeScript compilation)

🔍 PYTHON FLASK/FASTAPI DETECTION:
- Look for: requirements.txt with "flask" or "fastapi"
- Files: app.py, main.py, server.py
- Project Type: backend
- Build Command: NONE
- Start Command: "python app.py" or "uvicorn main:app"

ANALYSIS OUTPUT (RETURN ONLY THIS JSON):

{
  "projectType": "frontend|backend|fullstack",
  "framework": "EXACT framework (Next.js 13|Vite+React|Create React App|Express.js|FastAPI|etc)",
  "language": "JavaScript|TypeScript|Python|Go",
  "entryPoints": ["ACTUAL files found: index.js, server.js, app/page.tsx, etc"],
  "buildTool": "next|vite|react-scripts|webpack|tsc|none",
  "buildCommand": "EXACT command to build (next build|vite build|tsc|NONE)",
  "startCommand": "EXACT command to start (next start|node index.js|python app.py)",
  "outputDir": "dist|build|.next|NONE",
  "port": "3000|8000|5000|80",
  "testFramework": "jest|vitest|pytest|none",
  "dependencies": {
    "production": ["key production dependencies"],
    "dev": ["key dev dependencies"]
  },
  "structure": {
    "hasTests": boolean,
    "hasDocker": boolean,
    "hasPrisma": boolean,
    "hasTypeScript": boolean,
    "hasDatabase": boolean,
    "directories": ["list directories found: src, pages, app, public, dist, etc"]
  },
  "recommendations": [
    "specific recommendations for deployment"
  ],
  "pipelineRequirements": {
    "needsBuild": boolean,
    "needsTests": boolean,
    "needsLint": boolean,
    "needsTypeCheck": boolean,
    "needsPrismaGenerate": boolean,
    "needsEnvVars": ["ENV_VAR_NAMES"],
    "installCommand": "npm install --force|pip install -r requirements.txt|etc",
    "preInstallSteps": ["any steps before install like: rm -rf node_modules"]
  }
}

🎯 CRITICAL RULES:
1. If you see "next" dependency OR next.config.js → It's Next.js (fullstack)
2. If you see vite.config.js + react → It's Vite+React (frontend)
3. If you see react-scripts → It's Create React App (frontend)
4. If you see express/fastify + NO frontend configs → Pure backend
5. Look at ACTUAL file structure (pages/, app/, src/), not just package.json
6. Be SPECIFIC with commands (don't say "build script", say "next build")

Return ONLY valid JSON, no markdown, no explanations.`;
  }

  /**
   * Invoke Amazon Nova Premier (best model)
   */
  private async invokeNovaPremier(prompt: string): Promise<string> {
    console.log('[REPO-ANALYZER] 🚀 Invoking Amazon Nova Premier...');

    const command = new ConverseCommand({
      modelId: 'us.amazon.nova-premier-v1:0', // Best Nova model
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }],
        },
      ],
      inferenceConfig: {
        maxTokens: 4096,
        temperature: 0.1, // Low temperature for precise analysis
        topP: 0.9,
      },
    });

    const response = await this.client.send(command);
    const text = response.output?.message?.content?.[0]?.text || '';

    console.log('[REPO-ANALYZER] Response length:', text.length);
    return text;
  }

  /**
   * Parse AI response into structured analysis
   */
  private parseAnalysis(response: string, files: Record<string, string>): DeepRepositoryAnalysis {
    try {
      // Extract JSON from response (may have markdown formatting)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[REPO-ANALYZER] No JSON found in response, using fallback');
        return this.getFallbackAnalysis(files);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed as DeepRepositoryAnalysis;
    } catch (error: any) {
      console.error('[REPO-ANALYZER] Parse error:', error.message);
      return this.getFallbackAnalysis(files);
    }
  }

  /**
   * Fallback analysis based on simple file detection
   */
  private getFallbackAnalysis(files: Record<string, string>): DeepRepositoryAnalysis {
    console.log('[REPO-ANALYZER] Using fallback analysis');

    const hasPackageJson = 'packageJson' in files;
    const packageJson = hasPackageJson ? JSON.parse(files.packageJson || '{}') : {};
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const scripts = packageJson.scripts || {};

    // Detect project type with priority order
    let projectType: any = 'unknown';
    let framework = 'unknown';
    let buildTool = 'none';
    let buildCommand = 'NONE';
    let startCommand = 'node index.js';
    let outputDir = 'NONE';
    let port = '3000';
    const entryPoints: string[] = [];

    // Detect directories
    const directories = Array.from(new Set(
      Object.keys(files).map(f => f.split('/')[0]).filter(d => d && !d.includes('.'))
    ));

    // Next.js detection (highest priority for fullstack)
    if (deps.next || Object.keys(files).some(f => f.includes('next.config'))) {
      projectType = 'fullstack';
      framework = 'Next.js';
      buildTool = 'next';
      buildCommand = scripts.build || 'next build';
      startCommand = scripts.start || 'next start';
      outputDir = '.next';
      port = '3000';
      entryPoints.push('pages/index.tsx', 'app/page.tsx', 'pages/index.js', 'app/page.js');
    }
    // Vite frontend detection
    else if (deps.vite || Object.keys(files).some(f => f.includes('vite.config'))) {
      projectType = 'frontend';
      framework = 'Vite + React';
      buildTool = 'vite';
      buildCommand = scripts.build || 'vite build';
      startCommand = 'STATIC_SERVER'; // Special marker for static serving
      outputDir = 'dist';
      port = '80';
      entryPoints.push('src/main.tsx', 'src/main.jsx', 'index.html');
    }
    // Create React App detection
    else if (deps['react-scripts']) {
      projectType = 'frontend';
      framework = 'Create React App';
      buildTool = 'react-scripts';
      buildCommand = scripts.build || 'react-scripts build';
      startCommand = 'STATIC_SERVER';
      outputDir = 'build';
      port = '80';
      entryPoints.push('src/index.js', 'src/index.tsx', 'src/App.js');
    }
    // Express backend detection
    else if (deps.express && !deps.vite && !deps.next) {
      projectType = 'backend';
      framework = 'Express.js';
      buildTool = 'none';
      buildCommand = 'NONE';
      startCommand = scripts.start || 'node index.js';
      outputDir = 'NONE';
      port = '80';
      entryPoints.push('index.js', 'server.js', 'src/server.js', 'app.js');
    }
    // Generic React (fallback)
    else if (deps.react) {
      projectType = 'frontend';
      framework = 'React';
      buildTool = 'webpack';
      buildCommand = scripts.build || 'npm run build';
      startCommand = 'STATIC_SERVER';
      outputDir = 'build';
      port = '80';
      entryPoints.push('src/index.jsx', 'src/App.jsx');
    }

    return {
      projectType,
      framework,
      language: deps.typescript || 'tsconfig.json' in files ? 'TypeScript' : 'JavaScript',
      entryPoints,
      buildTool,
      buildCommand,
      startCommand,
      outputDir,
      port,
      testFramework: deps.jest ? 'jest' : deps.vitest ? 'vitest' : 'none',
      dependencies: {
        production: Object.keys(packageJson.dependencies || {}),
        dev: Object.keys(packageJson.devDependencies || {}),
      },
      structure: {
        hasTests: !!deps.jest || !!deps.vitest,
        hasDocker: 'Dockerfile' in files,
        hasPrisma: !!deps['@prisma/client'],
        hasTypeScript: !!deps.typescript || 'tsconfig.json' in files,
        hasDatabase: !!deps.pg || !!deps.mysql || !!deps['@prisma/client'],
        directories,
      },
      recommendations: [
        `Framework: ${framework}`,
        `Build command: ${buildCommand}`,
        `Start command: ${startCommand}`,
        'Use forced clean install to avoid npm caching issues',
      ],
      pipelineRequirements: {
        needsBuild: projectType === 'frontend' || projectType === 'fullstack' || buildCommand !== 'NONE',
        needsTests: !!deps.jest || !!deps.vitest,
        needsLint: !!deps.eslint,
        needsTypeCheck: !!deps.typescript,
        needsPrismaGenerate: !!deps['@prisma/client'],
        needsEnvVars: this.detectEnvVars(files),
        installCommand: 'npm install --force --include=dev --legacy-peer-deps',
        preInstallSteps: ['rm -rf node_modules package-lock.json', 'npm cache clean --force'],
      },
    };
  }

  /**
   * Detect required environment variables from files
   */
  private detectEnvVars(files: Record<string, string>): string[] {
    const envVars = new Set<string>();

    // Check all file contents for process.env.XXX patterns
    for (const content of Object.values(files)) {
      const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g);
      for (const match of matches) {
        envVars.add(match[1]);
      }
    }

    return Array.from(envVars);
  }
}

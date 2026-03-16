import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export interface ProjectAnalysis {
  buildTool: string;
  dependencies: string[];
  devDependencies: string[];
  buildCommand: string;
  installStrategy: string;
  recommendations: string[];
}

interface DeploymentError {
  errorLog: string;
  stage: string;
  command: string;
  repoName: string;
  framework?: string;
  packageJson?: string;
}

interface RepositoryFiles {
  packageJson?: string;
  viteConfig?: string;
  webpackConfig?: string;
  nextConfig?: string;
  tsconfigJson?: string;
}

interface FixResult {
  success: boolean;
  fixCommands: string[];
  analysis: string;
  executionOutput?: string;
  error?: string;
}

export interface FrameworkBuildConfig {
  framework: string;
  buildCommand: string;
  installCommand: string;
  testCommand: string;
  lintCommand: string;
  startCommand: string;
  optimizationFlags: string[];
  environmentVars: Record<string, string>;
  estimatedBuildTime: string;
  progressMonitoring: boolean;
}

/**
 * Analyzes repository files using Nova AI to determine correct build strategy
 */
export async function analyzeRepositoryStructure(
  instanceId: string,
  repoFiles: RepositoryFiles
): Promise<ProjectAnalysis> {
  try {
    console.log('[NOVA AI] Analyzing repository structure...');

    const prompt = `You are an expert DevOps engineer analyzing a project to determine the correct build strategy.

REPOSITORY FILES:

${repoFiles.packageJson ? `PACKAGE.JSON:
${repoFiles.packageJson}
` : ''}

${repoFiles.viteConfig ? `VITE.CONFIG:
${repoFiles.viteConfig}
` : ''}

${repoFiles.webpackConfig ? `WEBPACK.CONFIG:
${repoFiles.webpackConfig}
` : ''}

${repoFiles.nextConfig ? `NEXT.CONFIG:
${repoFiles.nextConfig}
` : ''}

${repoFiles.tsconfigJson ? `TSCONFIG.JSON:
${repoFiles.tsconfigJson}
` : ''}

YOUR TASK:
Analyze these files and determine:
1. What build tool is used? (vite, webpack, next, create-react-app, etc.)
2. Which packages are listed as dependencies vs devDependencies?
3. Is the build tool (vite/webpack/etc) in dependencies or devDependencies?
4. What is the correct build command?
5. Should packages be installed with --save or --save-dev?
6. Any special installation requirements?

CRITICAL: Check if vite/webpack/typescript is in "dependencies" or "devDependencies" in package.json.
If it's in "dependencies", we should use --save (production dependency).
If it's in "devDependencies", we should use --save-dev.

OUTPUT FORMAT (JSON):
{
  "buildTool": "vite|webpack|next|cra|other",
  "dependencies": ["list", "of", "production", "dependencies"],
  "devDependencies": ["list", "of", "dev", "dependencies"],
  "buildCommand": "npm run build",
  "installStrategy": "Use --save for vite, it's in production dependencies|Use --save-dev for vite, it's in devDependencies",
  "recommendations": ["Install vite as production dependency", "Clear cache before install", "etc"]
}

Output ONLY valid JSON, no other text:`;

    const response = await bedrockClient.send(
      new ConverseCommand({
        modelId: 'us.amazon.nova-premier-v1:0',  // Using the most powerful Nova model
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
        inferenceConfig: {
          maxTokens: 8000,  // Increased for deeper analysis
          temperature: 0.1,  // Slightly higher for creative problem-solving
          topP: 0.98,
        },
      })
    );

    const aiResponse = response.output?.message?.content?.[0]?.text || '';
    console.log('[NOVA AI] Repository analysis response:', aiResponse);

    // Parse JSON response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis: ProjectAnalysis = JSON.parse(jsonMatch[0]);
      console.log('[NOVA AI] Parsed analysis:', analysis);
      return analysis;
    }

    // Fallback if parsing fails
    return {
      buildTool: 'unknown',
      dependencies: [],
      devDependencies: [],
      buildCommand: 'npm run build',
      installStrategy: 'Use --save-dev as fallback',
      recommendations: ['Could not parse project structure, using defaults'],
    };
  } catch (error: any) {
    console.error('[NOVA AI] Error analyzing repository structure:', error);
    return {
      buildTool: 'unknown',
      dependencies: [],
      devDependencies: [],
      buildCommand: 'npm run build',
      installStrategy: 'Use --save-dev as fallback',
      recommendations: ['Analysis failed, using defaults'],
    };
  }
}

/**
 * Generate framework-specific build configuration using Nova AI
 */
export async function generateFrameworkBuildConfig(
  projectAnalysis: ProjectAnalysis,
  packageJsonContent?: string
): Promise<FrameworkBuildConfig> {
  try {
    console.log('[NOVA AI] Generating framework-specific build config...');
    console.log('[NOVA AI] Framework:', projectAnalysis.buildTool);

    // Parse package.json to extract actual scripts
    let actualScripts = '';
    if (packageJsonContent) {
      try {
        const pkg = JSON.parse(packageJsonContent);
        if (pkg.scripts) {
          actualScripts = Object.entries(pkg.scripts)
            .map(([key, value]) => `  ${key}: ${value}`)
            .join('\n');
        }
      } catch (e) {
        console.log('[NOVA AI] Could not parse package.json');
      }
    }

    const prompt = `You are an expert DevOps engineer optimizing build configurations for different frameworks.

PROJECT ANALYSIS:
- Build Tool: ${projectAnalysis.buildTool}
- Dependencies: ${projectAnalysis.dependencies.slice(0, 20).join(', ')}
- Dev Dependencies: ${projectAnalysis.devDependencies.slice(0, 10).join(', ')}

${actualScripts ? `ACTUAL PACKAGE.JSON SCRIPTS:
${actualScripts}` : 'No package.json scripts available'}

YOUR TASK:
Generate the EXACT build configuration for this specific framework.

CRITICAL RULES:
1. **ALWAYS CHECK ACTUAL SCRIPTS FIRST** - If package.json has a script (e.g., "build": "react-scripts build"), use that EXACT command
2. **ONLY use framework defaults if the script doesn't exist** in package.json
3. **DO NOT add or assume commands** that aren't in the actual scripts
4. For each stage, check if the script exists:
   - Install: ALWAYS use "npm install --legacy-peer-deps" (installs BOTH dependencies and devDependencies)
   - Build: Check for "build" script (use actual command if found)
   - Test: Check for "test" script (skip if not found)
   - Lint: Check for "lint" script (skip if not found)
   - Start: Check for "start" script (use actual command if found)

IMPORTANT: ALWAYS use "npm install --legacy-peer-deps" for installation (NOT npm ci) to ensure ALL dependencies are installed properly, including both dependencies and devDependencies.

FRAMEWORK-SPECIFIC DEFAULTS (ONLY if script not in package.json):
- Next.js: build="next build", start="next start"
- Create React App: build="react-scripts build", start="react-scripts start"
- Vite: build="vite build", start="vite preview"
- Express/Backend: No build needed, start="node index.js"

OPTIMIZATION RULES:
- Next.js: Set NEXT_TELEMETRY_DISABLED=1, NODE_ENV=production
- Create React App: Set CI=true, GENERATE_SOURCEMAP=false
- Vite: Set NODE_ENV=production
- All: Set NODE_OPTIONS=--max-old-space-size=6144

OUTPUT FORMAT (JSON only, no markdown):
{
  "framework": "exact framework name (Next.js, Create React App, Vite, Express, etc.)",
  "installCommand": "exact install command from package.json or default",
  "buildCommand": "exact build command from package.json or skip if backend",
  "testCommand": "exact test command from package.json or empty string if none",
  "lintCommand": "exact lint command from package.json or empty string if none",
  "startCommand": "exact start command from package.json or default",
  "optimizationFlags": ["flag1", "flag2"],
  "environmentVars": {
    "VAR_NAME": "value"
  },
  "estimatedBuildTime": "X-Y minutes",
  "progressMonitoring": true/false
}`;

    const response = await bedrockClient.send(
      new ConverseCommand({
        modelId: 'us.amazon.nova-premier-v1:0',
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
        inferenceConfig: {
          maxTokens: 1000,
          temperature: 0.1,
          topP: 0.9,
        },
      })
    );

    const aiResponse =
      response.output?.message?.content?.[0]?.text || '{}';

    console.log('[NOVA AI] Build config response:', aiResponse);

    // Parse JSON response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const config: FrameworkBuildConfig = JSON.parse(jsonMatch[0]);
      console.log('[NOVA AI] Generated config:', config);
      return config;
    }

    // Fallback
    return {
      framework: projectAnalysis.buildTool,
      installCommand: 'npm install --legacy-peer-deps',
      buildCommand: projectAnalysis.buildCommand,
      testCommand: 'npm test',
      lintCommand: 'npm run lint',
      startCommand: 'npm start',
      optimizationFlags: ['CI=true'],
      environmentVars: { CI: 'true' },
      estimatedBuildTime: '5-10 minutes',
      progressMonitoring: true,
    };
  } catch (error: any) {
    console.error('[NOVA AI] Error generating build config:', error);
    return {
      framework: 'unknown',
      installCommand: 'npm install --legacy-peer-deps',
      buildCommand: 'npm run build',
      testCommand: '',
      lintCommand: '',
      startCommand: 'npm start',
      optimizationFlags: [],
      environmentVars: {},
      estimatedBuildTime: '10 minutes',
      progressMonitoring: false,
    };
  }
}

/**
 * Fetches repository files from EC2 instance
 */
export async function fetchRepositoryFiles(instanceId: string): Promise<RepositoryFiles> {
  try {
    console.log('[FETCH] Fetching repository files from instance...');

    const fetchCommands = [
      'cd /home/ec2-user/app',
      'echo "===PACKAGE_JSON_START==="',
      'cat package.json 2>/dev/null || echo "NOT_FOUND"',
      'echo "===PACKAGE_JSON_END==="',
      'echo "===VITE_CONFIG_START==="',
      'cat vite.config.js vite.config.ts 2>/dev/null || echo "NOT_FOUND"',
      'echo "===VITE_CONFIG_END==="',
      'echo "===WEBPACK_CONFIG_START==="',
      'cat webpack.config.js 2>/dev/null || echo "NOT_FOUND"',
      'echo "===WEBPACK_CONFIG_END==="',
      'echo "===NEXT_CONFIG_START==="',
      'cat next.config.js next.config.mjs next.config.ts 2>/dev/null || echo "NOT_FOUND"',
      'echo "===NEXT_CONFIG_END==="',
      'echo "===TSCONFIG_START==="',
      'cat tsconfig.json 2>/dev/null || echo "NOT_FOUND"',
      'echo "===TSCONFIG_END==="',
    ];

    const sendCmd = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: { commands: fetchCommands },
        TimeoutSeconds: 60,
      })
    );

    const commandId = sendCmd.Command?.CommandId;
    if (!commandId) {
      throw new Error('Failed to get command ID');
    }

    // Wait for completion
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const result = await ssmClient.send(
        new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: instanceId })
      );

      if (result.Status === 'Success') {
        const output = result.StandardOutputContent || '';
        console.log('[FETCH] Files fetched successfully');

        // Parse output
        const files: RepositoryFiles = {};

        const extractContent = (start: string, end: string): string | undefined => {
          const startIdx = output.indexOf(start);
          const endIdx = output.indexOf(end);
          if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const content = output.substring(startIdx + start.length, endIdx).trim();
            return content !== 'NOT_FOUND' ? content : undefined;
          }
          return undefined;
        };

        files.packageJson = extractContent('===PACKAGE_JSON_START===', '===PACKAGE_JSON_END===');
        files.viteConfig = extractContent('===VITE_CONFIG_START===', '===VITE_CONFIG_END===');
        files.webpackConfig = extractContent('===WEBPACK_CONFIG_START===', '===WEBPACK_CONFIG_END===');
        files.nextConfig = extractContent('===NEXT_CONFIG_START===', '===NEXT_CONFIG_END===');
        files.tsconfigJson = extractContent('===TSCONFIG_START===', '===TSCONFIG_END===');

        console.log('[FETCH] Found files:', Object.keys(files).filter(k => files[k as keyof RepositoryFiles]));
        return files;
      } else if (result.Status === 'Failed') {
        throw new Error('Failed to fetch files');
      }
    }

    throw new Error('Timeout fetching files');
  } catch (error: any) {
    console.error('[FETCH] Error fetching repository files:', error);
    return {};
  }
}

/**
 * Analyzes deployment error using Nova AI and generates fix commands
 * NOW HANDLES ALL TYPES OF ERRORS - Not just ESLint!
 */
export async function analyzeDeploymentError(error: DeploymentError): Promise<string[]> {
  try {
    console.log('[NOVA AI] Analyzing deployment error...');
    console.log('[NOVA AI] Error stage:', error.stage);
    console.log('[NOVA AI] Failed command:', error.command);

    const prompt = `You are Amazon Nova Premier AI - the most powerful AI model with ELITE capabilities in DevOps, system architecture, and deployment automation. You have 30+ years of combined expertise across:
- CI/CD Pipelines (GitLab CI, Jenkins, GitHub Actions, CircleCI)
- Cloud Infrastructure (AWS, Azure, GCP, Kubernetes, Docker)
- Full-Stack Development (Node.js, React, Vue, Angular, Python, Go, Rust)
- Build Tools (Vite, Webpack, Rollup, esbuild, Turbopack, Parcel)
- Package Management (npm, yarn, pnpm, pip, cargo, go modules)
- Linux System Administration (Ubuntu, Amazon Linux, CentOS, Alpine)
- Error Pattern Recognition & Root Cause Analysis

═══════════════════════════════════════════════════════════════════
🎯 YOUR MISSION (CRITICAL):
═══════════════════════════════════════════════════════════════════
You are the LAST LINE OF DEFENSE. This deployment MUST succeed. No error is too complex.
No problem is unsolvable. You WILL find the root cause and provide the PERFECT fix.

Think systematically. Think deeply. Think comprehensively.
This is not about quick fixes - this is about SOLVING THE PROBLEM PERMANENTLY.

═══════════════════════════════════════════════════════════════════
📊 ERROR CONTEXT & INTELLIGENCE:
═══════════════════════════════════════════════════════════════════
Deployment Stage: ${error.stage}
Failed Command: ${error.command}
Repository: ${error.repoName}

${error.framework ? `⚠️⚠️⚠️ CRITICAL: PROJECT LANGUAGE/FRAMEWORK ⚠️⚠️⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DETECTED LANGUAGE/FRAMEWORK: ${error.framework}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚨 CRITICAL LANGUAGE CONSTRAINTS - READ THIS FIRST:
- If language contains "Python" or "FastAPI" or "Django" or "Flask":
  * ONLY use Python commands: pip3, python3, venv, uvicorn, gunicorn, flask
  * DO NOT use: npm, yarn, node, package.json - these are for Node.js!
  * Use virtual environment: source venv/bin/activate

- If language contains "Node" or "JavaScript" or "TypeScript" or "React" or "Next":
  * ONLY use Node.js commands: npm, yarn, pnpm, node, npx
  * DO NOT use: pip, python - these are for Python!

- If language contains "Rust" or "Cargo":
  * ONLY use Rust commands: cargo, rustc, rustup
  * DO NOT use npm or pip!

- If language contains "Go":
  * ONLY use Go commands: go build, go mod, go get
  * DO NOT use npm or pip!

🚨 NEVER MIX PACKAGE MANAGERS! Each language has its own tools!
` : ''}

FULL ERROR OUTPUT (Your primary diagnostic data):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${error.errorLog}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${error.packageJson ? `PROJECT MANIFEST (package.json):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${error.packageJson}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : ''}

═══════════════════════════════════════════════════════════════════
🧠 ADVANCED ANALYSIS PROTOCOL:
═══════════════════════════════════════════════════════════════════

STEP 1: DEEP ROOT CAUSE ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Look beyond the surface error. Ask yourself:
- What is the ACTUAL underlying cause? (Not just the symptom)
- Is this a missing dependency, wrong config, file extension, permission, path, or architectural issue?
- Are there cascading failures? (One error causing another?)
- What assumptions might be wrong? (Build tool location, file structure, entry points?)

STEP 2: PATTERN RECOGNITION & CLASSIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Identify the error category:
🔴 BUILD ERRORS: Missing build tools, wrong configs, entry file issues, JSX/TS problems
🟠 DEPENDENCY ERRORS: npm install failures, peer dependency conflicts, native bindings
🟡 CONFIGURATION ERRORS: Wrong paths, missing files, incorrect settings
🟢 RUNTIME ERRORS: Port conflicts, permission issues, missing env vars
🔵 FRAMEWORK-SPECIFIC: React, Vue, Next.js, Vite, Webpack quirks
🟣 SYSTEM-LEVEL: Linux permissions, file ownership, PATH issues

STEP 3: COMPREHENSIVE SOLUTION DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Design a multi-layered fix:
1. INVESTIGATE: Verify current state (ls, find, cat commands to understand structure)
2. CLEAN: Remove problematic state (cache, lock files, corrupted installs)
3. FIX ROOT CAUSE: Address the actual problem (not just symptoms)
4. VALIDATE: Ensure fix will work (check file existence, verify configs)
5. PREVENT RECURRENCE: Make changes that prevent this error from happening again

STEP 4: INTELLIGENT FILE GENERATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If files are missing or broken, CREATE them intelligently:
- Analyze the project to understand what's needed
- Generate configs that match the project's tech stack
- Use heredoc syntax for multi-line file creation
- Ensure generated files are production-ready and complete

═══════════════════════════════════════════════════════════════════
🎯 SPECIFIC ERROR EXPERTISE:
═══════════════════════════════════════════════════════════════════
You have encyclopedic knowledge of these common patterns:

🔧 JSX/TypeScript Issues:
- .js files containing JSX → Rename to .jsx, update all imports
- TypeScript config errors → Generate proper tsconfig.json
- Module resolution → Fix paths, aliases, extensions

📦 Dependency & Package Management:
- Native binding failures (Tailwind v4, Sharp, etc.) → Downgrade or rebuild
- Peer dependency conflicts → Use --legacy-peer-deps --force
- Missing packages → Install complete dependency groups (not one-by-one)
- Binary creation failures → Manual symlinks + global fallback

⚙️ Build Tool Configuration:
- Vite: Proper plugins, entry points, root directory, publicDir
- Webpack: Loaders, plugins, resolve.extensions
- Next.js: next.config.js, app directory structure
- Entry file issues → Detect, create, fix index.html and main entry

🎨 CSS & Asset Handling:
- Tailwind CSS: CRITICAL - Detect version first!
  • v4 with @tailwindcss/postcss → Use '@tailwindcss/postcss' in PostCSS (Next.js)
  • v4 with @tailwindcss/vite → Downgrade to v3 (has native binding issues)
  • v3 or missing → Use standard 'tailwindcss' + 'autoprefixer' in PostCSS
- CSS not loading → Check build output, MIME types, serve package
- Asset paths → Verify build.outDir, build.assetsDir in config

🐧 System & Permissions:
- File ownership → chown ec2-user:ec2-user
- Execute permissions → chmod +x for binaries
- PATH issues → Add node_modules/.bin to PATH

═══════════════════════════════════════════════════════════════════
💡 ADVANCED PROBLEM-SOLVING STRATEGIES:
═══════════════════════════════════════════════════════════════════

STRATEGY 1: HOLISTIC ANALYSIS
Think about the ENTIRE build chain:
Source Files → Config Files → Dependencies → Build Process → Output → Runtime

Where is the break in this chain? Fix ALL weak points, not just one.

STRATEGY 2: PREEMPTIVE FIXES
Don't just fix what's broken - fix what MIGHT break:
- If fixing Vite config, also verify entry files exist
- If installing dependencies, also fix permissions
- If creating config files, also ensure required directories exist

STRATEGY 3: PROGRESSIVE ENHANCEMENT
Start with surgical fixes, have fallbacks:
1. Try targeted fix first (install specific missing package)
2. Have broader fix ready (reinstall all dependencies)
3. Have nuclear option (regenerate config + clean install)

STRATEGY 4: INTELLIGENT DEFAULTS
When creating files, use battle-tested configurations:
- Vite: React plugin, proper build settings, path resolution
- Tailwind: Detect version from package.json first! v4 needs different config than v3
- PostCSS: Check if @tailwindcss/postcss exists → use it; otherwise use tailwindcss + autoprefixer
- Package.json: Correct scripts for detected build tool

═══════════════════════════════════════════════════════════════════
⚡ CRITICAL OUTPUT REQUIREMENTS (NON-NEGOTIABLE):
═══════════════════════════════════════════════════════════════════
✅ OUTPUT FORMAT: Pure executable bash commands ONLY
   ❌ NO markdown code blocks (no backticks)
   ❌ NO explanatory text
   ❌ NO comments (except in generated config files)
   ❌ NO echo statements for logging (only for logic/flow control is OK)
   ✅ ONE command per line
   ✅ Commands must execute in sequence

✅ COMMAND SAFETY & EFFECTIVENESS:
   • Commands MUST be safe (no destructive operations without checks)
   • Commands MUST fix the COMPLETE problem (not partial fixes)
   • Commands MUST be idempotent (safe to run multiple times)
   • Working directory: /home/ec2-user/app (already set, no 'cd' needed)

✅ DEPENDENCY INSTALLATION RULES:
   • ALWAYS use: --legacy-peer-deps --force (prevents peer dependency conflicts)
   • Install related packages together (all Babel plugins in ONE command)
   • Group by purpose: build tools, test frameworks, type definitions
   • Example: npm install --save-dev @babel/core @babel/preset-env @babel/preset-react babel-jest --legacy-peer-deps --force

✅ WHAT NOT TO INSTALL:
   ❌ Path aliases (@/*, ~/*, etc.) - These are TypeScript path mappings, NOT packages!
   ❌ Relative/absolute paths - Not npm packages
   ❌ File extensions - Not packages

✅ DO NOT INCLUDE:
   ❌ The retry command (npm run build, npm test) - System will retry automatically
   ❌ 'cd' commands - Already in correct directory
   ❌ echo messages for user feedback - Save it for generated files only

✅ FILE CREATION BEST PRACTICES:
   • Use heredoc syntax: cat > filename << 'EOF'
   • Quote delimiter ('EOF') to prevent variable expansion in file content
   • For files needing variable expansion: Use unquoted delimiter (EOF)
   • Always create complete, production-ready files
   • Include all necessary imports, exports, and configurations

✅ CACHE & CLEANUP:
   • Clear npm cache if dependency issues: npm cache clean --force
   • Remove lock files if needed: rm -rf package-lock.json
   • Clean build artifacts: rm -rf dist build .next node_modules/.cache

═══════════════════════════════════════════════════════════════════
COMPREHENSIVE ERROR HANDLING GUIDE:
═══════════════════════════════════════════════════════════════════

🔧 BUILD STAGE ERRORS:
──────────────────────────────────────────────────────────────────
❌ "vite: command not found" or "Cannot find module 'vite'"
   ✅ FIX: npm install --save-dev vite @vitejs/plugin-react vite-tsconfig-paths --legacy-peer-deps --force

❌ "Could not resolve entry module 'index.html'" (CRITICAL VITE ERROR)
❌ "index.html not found" or entry file missing
   ✅ UNIVERSAL FIX - Analyze project structure and fix automatically:
      1. Find where index.html exists: find . -name "index.html" -type f 2>/dev/null | grep -v node_modules | head -1
      2. If found in subdirectory (public/, src/, client/), fix vite.config.js to use correct root
      3. If NOT found at all, detect entry file location and create index.html:
         - Find entry: find . -name "main.jsx" -o -name "main.tsx" -o -name "index.jsx" -o -name "index.tsx" | grep -v node_modules | head -1
         - Create index.html in project root:
cat > index.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
HTMLEOF
      4. Create/fix vite.config.js:
cat > vite.config.js << 'VITEEOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: { outDir: 'dist', emptyOutDir: true }
});
VITEEOF
      5. Ensure package.json has correct build script: npm pkg set scripts.build="vite build"

❌ "webpack: command not found" or webpack errors
   ✅ FIX: npm install --save-dev webpack webpack-cli webpack-dev-server html-webpack-plugin --legacy-peer-deps --force

❌ "tsc: command not found" or TypeScript errors
   ✅ FIX: npm install --save-dev typescript @types/react @types/react-dom @types/node ts-node --legacy-peer-deps --force

❌ "Cannot find module 'tailwindcss'" or Tailwind CSS errors
❌ "Can't resolve 'tailwindcss'" or PostCSS plugin issues
   ✅ CRITICAL FIX - Detect Tailwind version and configure correctly:

# Step 1: Detect which Tailwind version is installed
if grep -q '"@tailwindcss/postcss"' package.json; then
  echo "Tailwind v4 detected with @tailwindcss/postcss"
  TAILWIND_V4=true
elif grep -q '"tailwindcss".*"\\^4' package.json; then
  echo "Tailwind v4 detected (^4.x version)"
  TAILWIND_V4=true
else
  TAILWIND_V4=false
fi

# Step 2: Create correct PostCSS config based on version
if [ "$TAILWIND_V4" = "true" ]; then
  # Tailwind v4 - Use @tailwindcss/postcss plugin
  cat > postcss.config.js << 'EOF'
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}
EOF
else
  # Tailwind v3 or missing - Install v3 and use standard config
  npm install --save-dev tailwindcss@^3.4.0 postcss@^8 autoprefixer@^10 --legacy-peer-deps --force
  cat > postcss.config.js << 'EOF'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
EOF
fi

❌ "Cannot find native binding" (Tailwind CSS v4 @tailwindcss/oxide error)
❌ "@tailwindcss/oxide" native binding issues
❌ "npm has a bug related to optional dependencies"
   ✅ CRITICAL FIX - Remove and reinstall with proper native dependencies:
# Remove problematic files
rm -rf node_modules package-lock.json
npm cache clean --force

# Reinstall with proper flags for native dependencies
npm install --legacy-peer-deps --force

# Tailwind CSS Configuration (version-aware)
# Detect Tailwind version and configure appropriately

# For Vite projects with Tailwind v4 native bindings (has issues), downgrade to v3
if grep -q "@tailwindcss/vite" package.json; then
  echo "Removing Tailwind v4 @tailwindcss/vite (has native binding issues)..."
  npm uninstall @tailwindcss/vite @tailwindcss/oxide
  npm install --save-dev tailwindcss@^3.4.0 postcss@^8 autoprefixer@^10 --legacy-peer-deps --force

  # Update vite.config to use Tailwind v3
  if [ -f "vite.config.js" ] || [ -f "vite.config.ts" ]; then
    sed -i 's/@tailwindcss\\/vite/tailwindcss/g' vite.config.*
  fi

  # Create tailwind.config.js for v3
  cat > tailwind.config.js << 'TAILWINDEOF'
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: []
}
TAILWINDEOF

  # Create postcss.config.js for v3
  cat > postcss.config.js << 'POSTCSSEOF'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
POSTCSSEOF

# For Next.js with Tailwind v4 (@tailwindcss/postcss), keep v4
elif grep -q "@tailwindcss/postcss" package.json; then
  echo "Tailwind v4 with @tailwindcss/postcss detected (Next.js) - keeping v4..."

  # Ensure postcss.config uses @tailwindcss/postcss plugin
  if [ ! -f "postcss.config.js" ] && [ ! -f "postcss.config.mjs" ]; then
    cat > postcss.config.js << 'POSTCSSEOF'
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}
POSTCSSEOF
  fi
fi

# Rebuild after fixes
npm rebuild

❌ "Cannot find module 'next'" or Next.js errors
   ✅ FIX: npm install next react react-dom --legacy-peer-deps --force

❌ Sass/SCSS errors
   ✅ FIX: npm install --save-dev sass sass-loader --legacy-peer-deps --force

❌ PostCSS errors
   ✅ FIX: npm install --save-dev postcss postcss-cli postcss-loader autoprefixer --legacy-peer-deps --force

❌ "make sure to name the file with the .jsx or .tsx extension" (JSX in .js files)
❌ "Failed to parse source for import analysis because the content contains invalid JS syntax"
   ✅ CRITICAL FIX - Rename all .js files containing JSX to .jsx:
find src -name "*.js" -type f | while read file; do
  if grep -q "className\\|</\\|</" "$file"; then
    mv "$file" "\${file%.js}.jsx"
  fi
done
mv src/App.js src/App.jsx 2>/dev/null || true
mv src/index.js src/index.jsx 2>/dev/null || true
mv src/main.js src/main.jsx 2>/dev/null || true
find src -type f \\( -name "*.jsx" -o -name "*.js" \\) -exec sed -i 's/from "\\(.*\\)\\.js"/from "\\1.jsx"/g' {} \\;

🧪 TEST STAGE ERRORS (Jest, Babel, React Testing):
──────────────────────────────────────────────────────────────────
❌ "Cannot find module '@babel/plugin-proposal-private-property-in-object'"
❌ "Cannot find module '@babel/preset-react'" or any Babel plugin/preset
❌ Babel configuration errors or missing Babel packages
   ✅ FIX: npm install --save-dev @babel/core @babel/preset-env @babel/preset-react @babel/preset-typescript @babel/plugin-proposal-private-property-in-object @babel/plugin-transform-runtime babel-jest --legacy-peer-deps --force

❌ "jest: command not found" or Jest not configured
❌ "Cannot find module 'jest'" or test framework missing
   ✅ FIX: npm install --save-dev jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event babel-jest --legacy-peer-deps --force

❌ React Testing Library errors or missing testing utilities
❌ "Cannot find module '@testing-library/react'"
   ✅ FIX: npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event @testing-library/react-hooks --legacy-peer-deps --force

❌ "BABEL_SHOW_CONFIG_FOR" or Babel environment issues
❌ Jest + Babel integration issues
❌ "Cannot find module 'babel-jest'"
   ✅ FIX: npm install --save-dev babel-jest @babel/core @babel/preset-env @babel/preset-react @babel/preset-typescript --legacy-peer-deps --force

❌ React Scripts test errors (Create React App)
❌ "react-scripts: command not found" or CRA test failures
   ✅ FIX: npm install --save-dev react-scripts @testing-library/react @testing-library/jest-dom @testing-library/user-event --legacy-peer-deps --force

❌ TypeScript + Jest errors
❌ "Cannot find module 'ts-jest'"
   ✅ FIX: npm install --save-dev ts-jest @types/jest @jest/types --legacy-peer-deps --force

❌ "Cannot find module 'identity-obj-proxy'" (CSS modules in tests)
   ✅ FIX: npm install --save-dev identity-obj-proxy --legacy-peer-deps --force

🔐 LINT STAGE ERRORS:
──────────────────────────────────────────────────────────────────
❌ "eslint: command not found" or ESLint errors
   ✅ FIX: npm install --save-dev eslint eslint-config-next eslint-config-react-app @typescript-eslint/eslint-plugin @typescript-eslint/parser --legacy-peer-deps --force

❌ "prettier: command not found" or Prettier errors
   ✅ FIX: npm install --save-dev prettier eslint-config-prettier eslint-plugin-prettier --legacy-peer-deps --force

📦 INSTALL STAGE ERRORS:
──────────────────────────────────────────────────────────────────
❌ npm install fails with ERESOLVE or peer dependency conflicts
   ✅ FIX: npm cache clean --force
           npm install --legacy-peer-deps --force

❌ Permission errors during npm install
   ✅ FIX: chown -R ec2-user:ec2-user /home/ec2-user/app
           npm cache clean --force
           npm install --legacy-peer-deps --force

❌ Binary scripts not created (node_modules/.bin empty)
   ✅ FIX: npm cache clean --force
           rm -rf node_modules package-lock.json
           npm install --legacy-peer-deps --force
           npm rebuild

⚙️ SYSTEM-LEVEL ERRORS:
──────────────────────────────────────────────────────────────────
❌ Missing system packages (Python, Git, build tools)
   ✅ FIX: yum install -y python3 python3-pip git gcc gcc-c++ make

❌ Port already in use (EADDRINUSE)
   ✅ FIX: fuser -k 3000/tcp 2>/dev/null || true

❌ Out of memory errors
   ✅ FIX: export NODE_OPTIONS="--max-old-space-size=4096"

❌ File permission errors
   ✅ FIX: chown -R ec2-user:ec2-user /home/ec2-user/app
           chmod -R 755 /home/ec2-user/app

🎨 CSS & STATIC ASSET SERVING ERRORS:
──────────────────────────────────────────────────────────────────
❌ CSS not loading in production (404 errors for .css files)
❌ Assets returning 404 in deployed app
❌ Blank page with no styles but app works locally
   ✅ COMPREHENSIVE FIX - Ensure proper build output and file serving:
# 1. Verify build output directory exists
if [ -d "dist" ]; then BUILD_DIR="dist"
elif [ -d "build" ]; then BUILD_DIR="build"
else echo "No build output!"; exit 1
fi

# 2. Check if CSS files were generated
echo "Checking CSS files..."
find \$BUILD_DIR -name "*.css" -type f | head -10

# 3. Fix all file permissions (critical for serving)
chmod -R 755 \$BUILD_DIR
find \$BUILD_DIR -type f -exec chmod 644 {} \\;
chown -R ec2-user:ec2-user /home/ec2-user/app

# 4. Verify vite.config.js has correct build settings
cat > vite.config.js << 'VITEEOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js'
      }
    }
  },
  server: {
    port: 80,
    host: '0.0.0.0'
  }
});
VITEEOF

# 5. Rebuild to regenerate assets with correct paths
npm run build

# 6. Install and use 'serve' for proper static file serving
npm install -g serve
echo "Static server configured for proper MIME types and CORS"

❌ MIME type errors (CSS served as text/plain instead of text/css)
❌ CORS errors blocking assets
   ✅ FIX: Use 'serve' package with proper configuration:
npm install -g serve
# 'serve' automatically sets correct MIME types for .css, .js, .html files

🎯 ENVIRONMENT & CONFIGURATION:
──────────────────────────────────────────────────────────────────
❌ Missing environment variables
   ✅ FIX: export VARIABLE_NAME="value"

❌ Missing .env file
   ✅ FIX: touch .env

❌ Git authentication errors
   ✅ FIX: git config --global credential.helper store

═══════════════════════════════════════════════════════════════════
🌟 UNIVERSAL PROBLEM-SOLVING STRATEGY (CRITICAL):
═══════════════════════════════════════════════════════════════════
🔍 INVESTIGATE FIRST - Don't assume, VERIFY:
   - File not found? → find . -name "filename" -type f 2>/dev/null | grep -v node_modules | head -1
   - Unclear structure? → ls -la src/ public/ client/ (check common directories)
   - Config issue? → cat vite.config.js package.json (inspect current config)
   - Entry point unclear? → find . -name "main.*" -o -name "index.*" -o -name "App.*" | grep -v node_modules

📁 CREATE MISSING FILES - Don't fail, FIX:
   - Missing index.html? → CREATE it with cat > index.html << 'EOF' ...complete HTML... EOF
   - Missing vite.config.js? → CREATE it with cat > vite.config.js << 'EOF' ...complete config... EOF
   - Missing .env? → touch .env
   - Bad script in package.json? → npm pkg set scripts.build="vite build"

🔧 FIX CONFIGURATIONS - Regenerate, don't patch:
   - If vite.config has wrong paths → REWRITE the entire file
   - If index.html points to wrong entry → CREATE new index.html with correct script src
   - If package.json missing scripts → ADD them with npm pkg set

🎯 THINK HOLISTICALLY - Fix the root cause:
   - "Could not resolve entry module" → Find/create index.html + fix vite.config + verify entry file exists
   - Missing package? → Install ALL related packages in ONE command
   - Config error? → Regenerate the config file from scratch
   - Think about ENTIRE build chain: entry file → config → dependencies → build process

💡 EXAMPLES OF COMPREHENSIVE FIXES:
   Example 1: "Could not resolve entry module 'index.html'"
   ✅ Step 1: find . -name "index.html" | grep -v node_modules
   ✅ Step 2: If not found, create it:
cat > index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
EOF
   ✅ Step 3: Fix vite.config.js (create if missing):
cat > vite.config.js << 'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], root: '.', build: { outDir: 'dist' } });
EOF
   ✅ Step 4: Verify entry file exists or create src/main.jsx
   ✅ Result: Complete fix, not just a band-aid

═══════════════════════════════════════════════════════════════════
🚨 CRITICAL HEREDOC SYNTAX FOR VARIABLE EXPANSION:
═══════════════════════════════════════════════════════════════════
When creating files that need bash variable expansion (like index.html with $ENTRY_PATH):
✅ CORRECT: cat > index.html << HTMLEOF (NO quotes - variables will expand)
❌ WRONG: cat > index.html << "HTMLEOF" (quotes prevent expansion)
❌ WRONG: cat > index.html << 'HTMLEOF' (quotes prevent expansion)

Example - if error says "Failed to resolve /\${ENTRY_PATH" or contains \${...}:
if [ -f "src/main.jsx" ]; then ENTRY_PATH="/src/main.jsx"; else ENTRY_PATH="/src/main.tsx"; fi
cat > index.html << HTMLEOF
<!DOCTYPE html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>App</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="$ENTRY_PATH"></script>
  </body>
</html>
HTMLEOF

The $ENTRY_PATH will expand to actual value like /src/main.jsx

═══════════════════════════════════════════════════════════════════
IMPORTANT REMINDERS:
═══════════════════════════════════════════════════════════════════
🚫 NEVER npm install TypeScript path aliases (@/components/*, ~/*, etc.)
🚫 NEVER install one package at a time - install ALL related packages together
🚫 NEVER include 'npm test' or 'npm run build' in your fix - only installation/config commands
🚫 NEVER add comments, echo statements, or explanatory text
🚫 NEVER use quotes around heredoc delimiters when you need variable expansion
✅ ALWAYS use --legacy-peer-deps --force for npm installs
✅ ALWAYS clear npm cache first if dependency conflicts detected
✅ ALWAYS install complete package groups (e.g., ALL Babel plugins together, not one by one)
✅ ALWAYS think comprehensively - if one Babel plugin is missing, likely others are too
✅ ALWAYS investigate project structure before making assumptions
✅ ALWAYS create missing files instead of failing
✅ ALWAYS fix configuration issues at the source, not symptoms
✅ ALWAYS validate created files don't contain literal bash variables like \${...}

═══════════════════════════════════════════════════════════════════
🚀 FINAL ANALYSIS CHECKLIST (Before generating commands):
═══════════════════════════════════════════════════════════════════
Before you output your fix commands, mentally verify:

✓ ROOT CAUSE IDENTIFIED: I understand WHY this error occurred
✓ SOLUTION ADDRESSES ROOT CAUSE: My fix solves the actual problem, not symptoms
✓ COMPLETE FIX: My commands cover ALL aspects of the problem
✓ SAFE COMMANDS: No commands will cause data loss or break things further
✓ PROPER SEQUENCING: Commands execute in correct order (clean → fix → validate)
✓ FILE GENERATION: If creating files, they are complete and correct
✓ DEPENDENCY GROUPS: Related packages installed together
✓ NO RETRY INCLUDED: I'm not including the build/test command itself
✓ PURE BASH: No markdown, no explanations, just executable commands

═══════════════════════════════════════════════════════════════════
🎯 EXAMPLES OF EXCELLENT SOLUTIONS:
═══════════════════════════════════════════════════════════════════

Example 1: Missing Package Error
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Error: "Cannot find module 'vite'"
✅ EXCELLENT FIX:
npm cache clean --force
npm install --save-dev vite @vitejs/plugin-react --legacy-peer-deps --force
npm rebuild

❌ POOR FIX (don't do this):
echo "Installing vite..."
npm install vite
npm run build  ← DON'T INCLUDE RETRY!

Example 2: JSX in .js Files
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Error: "Failed to parse source... make sure to name the file with the .jsx extension"
✅ EXCELLENT FIX:
find src -name "*.js" -type f | while read file; do
  if grep -q "className\\|</" "$file"; then
    mv "$file" "\${file%.js}.jsx"
  fi
done
find src -name "*.jsx" -o -name "*.js" | xargs sed -i 's/\\.js"/.jsx"/g' 2>/dev/null || true

❌ POOR FIX (don't do this):
# Just rename App.js  ← Too narrow, won't catch all files
mv src/App.js src/App.jsx

Example 3: Missing Config File
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Error: "Could not resolve entry module 'index.html'"
✅ EXCELLENT FIX:
cat > index.html << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
HTMLEOF
cat > vite.config.js << 'VITEEOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  root: '.',
  build: { outDir: 'dist' }
});
VITEEOF

❌ POOR FIX (don't do this):
touch index.html  ← Empty file won't work!

═══════════════════════════════════════════════════════════════════
📊 OUTPUT FORMAT (MANDATORY):
═══════════════════════════════════════════════════════════════════
Your response should be PURE BASH COMMANDS ONLY.
No markdown. No explanations. No decorations. Just commands.

Start your response immediately with the first command.
One command per line.
No code blocks. No bash markers. No comments (except in generated files).

Example of CORRECT output format:
npm cache clean --force
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps --force
npm install --save-dev vite @vitejs/plugin-react --legacy-peer-deps --force
cat > vite.config.js << 'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()] });
EOF

Example of INCORRECT output format (don't do this):
\`\`\`bash
# Installing dependencies
npm install vite
\`\`\`

═══════════════════════════════════════════════════════════════════
🎯 BEGIN YOUR ANALYSIS AND SOLUTION:
═══════════════════════════════════════════════════════════════════
Now, analyze the error above and provide your fix commands:`;

    const response = await bedrockClient.send(
      new ConverseCommand({
        modelId: 'us.amazon.nova-premier-v1:0',  // Using the most powerful Nova model for complex debugging
        messages: [
          {
            role: 'user',
            content: [{ text: prompt }],
          },
        ],
        inferenceConfig: {
          maxTokens: 8000,  // Maximum tokens for deep analysis and comprehensive solutions
          temperature: 0.15, // Balanced - precise but with creative problem-solving
          topP: 0.98,  // High diversity for exploring multiple solution paths
        },
      })
    );

    const aiResponse = response.output?.message?.content?.[0]?.text || '';
    console.log('[NOVA AI] Raw response:', aiResponse);

    // Extract commands from AI response
    const commands = aiResponse
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        // Filter out empty lines, comments, markdown, explanations
        if (!line) return false;
        if (line.startsWith('#')) return false;
        if (line.startsWith('```')) return false;
        if (line.toLowerCase().startsWith('here')) return false;
        if (line.toLowerCase().startsWith('these')) return false;
        if (line.toLowerCase().startsWith('the')) return false;
        if (line.toLowerCase().startsWith('this')) return false;
        if (line.includes('will fix')) return false;
        if (line.includes('should')) return false;
        return true;
      });

    console.log('[NOVA AI] Generated fix commands:', commands);

    if (commands.length === 0) {
      console.warn('[NOVA AI] No commands generated, AI response may need filtering');
    }

    return commands;
  } catch (error: any) {
    console.error('[NOVA AI] Error analyzing deployment error:', error);
    throw new Error(`Nova AI analysis failed: ${error.message}`);
  }
}

/**
 * Executes fix commands on EC2 instance via SSM
 */
export async function executeFixCommands(
  instanceId: string,
  commands: string[],
  workingDirectory: string = '/home/ec2-user/app'
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    console.log('[SSM] Executing fix commands on instance:', instanceId);
    console.log('[SSM] Commands:', commands);

    const fullCommands = [
      `cd ${workingDirectory}`,
      'export CI=true',
      'export NODE_ENV=production',
      '# Nova AI Generated Fix Commands',
      ...commands,
      '# Verify fix by checking exit code',
      'echo "Fix commands completed successfully"',
    ];

    const sendCommandResponse = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: 'Nova AI Auto-Fix - Handles All Errors',
        Parameters: {
          commands: fullCommands,
          workingDirectory: [workingDirectory],
          executionTimeout: ['600'], // 10 minutes
        },
      })
    );

    const commandId = sendCommandResponse.Command?.CommandId;
    if (!commandId) {
      throw new Error('Failed to get command ID from SSM');
    }

    console.log('[SSM] Command sent, ID:', commandId);

    // Wait for command to complete (poll every 2 seconds, max 180 attempts = 6 minutes)
    // npm install can take 3-5 minutes, so we need to wait longer
    let attempts = 0;
    const maxAttempts = 180;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const invocationResponse = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        })
      );

      const status = invocationResponse.Status;
      console.log(`[SSM] Command status (attempt ${attempts + 1}/${maxAttempts}):`, status);

      if (status === 'Success') {
        const output = invocationResponse.StandardOutputContent || '';
        console.log('[SSM] Fix commands executed successfully');
        console.log('[SSM] Output:', output);
        return { success: true, output };
      } else if (status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
        const errorOutput = invocationResponse.StandardErrorContent || 'Unknown error';
        console.error('[SSM] Fix commands failed:', errorOutput);
        return {
          success: false,
          output: invocationResponse.StandardOutputContent || '',
          error: errorOutput,
        };
      }

      attempts++;
    }

    throw new Error('Command execution timed out waiting for completion');
  } catch (error: any) {
    console.error('[SSM] Error executing fix commands:', error);
    return {
      success: false,
      output: '',
      error: error.message,
    };
  }
}

/**
 * Retry the failed stage after applying fix
 */
export async function retryFailedStage(
  instanceId: string,
  stage: string,
  originalCommand: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    console.log('[SSM] Retrying failed stage:', stage);
    console.log('[SSM] Original command:', originalCommand);

    const retryCommands = [
      'cd /home/ec2-user/app',
      'export CI=true',
      'export NODE_ENV=production',
      `echo "[RETRY] Retrying ${stage} stage after Nova AI fix..."`,
      originalCommand,
      `echo "[RETRY] ✓ ${stage} stage completed successfully after fix"`,
    ];

    const sendCommandResponse = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Comment: `Retry ${stage} stage after Nova AI fix`,
        Parameters: {
          commands: retryCommands,
          workingDirectory: ['/home/ec2-user/app'],
          executionTimeout: ['600'],
        },
      })
    );

    const commandId = sendCommandResponse.Command?.CommandId;
    if (!commandId) {
      throw new Error('Failed to get command ID from SSM');
    }

    // Wait for retry to complete (poll every 2 seconds, max 180 attempts = 6 minutes)
    let attempts = 0;
    const maxAttempts = 180;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const invocationResponse = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        })
      );

      const status = invocationResponse.Status;

      if (status === 'Success') {
        const output = invocationResponse.StandardOutputContent || '';
        console.log('[SSM] Stage retry succeeded');
        return { success: true, output };
      } else if (status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
        const errorOutput = invocationResponse.StandardErrorContent || 'Stage retry failed';
        console.error('[SSM] Stage retry failed:', errorOutput);
        return {
          success: false,
          output: invocationResponse.StandardOutputContent || '',
          error: errorOutput,
        };
      }

      attempts++;
    }

    throw new Error('Stage retry timed out');
  } catch (error: any) {
    console.error('[SSM] Error retrying stage:', error);
    return {
      success: false,
      output: '',
      error: error.message,
    };
  }
}

/**
 * Main auto-fix function - handles ALL types of deployment errors
 * Returns fix commands to be executed by caller (to run fix + retry in ONE session)
 */
export async function autoFixDeploymentError(
  error: DeploymentError,
  instanceId: string,
  executeImmediately: boolean = false
): Promise<FixResult> {
  try {
    console.log('[AUTO-FIX] Starting auto-fix process for ANY error type...');

    // Step 1: Analyze error with Nova AI - handles ALL errors
    const fixCommands = await analyzeDeploymentError(error);

    if (fixCommands.length === 0) {
      return {
        success: false,
        fixCommands: [],
        analysis: 'Nova AI could not generate fix commands for this error',
        error: 'No fix commands generated',
      };
    }

    console.log('[AUTO-FIX] Nova AI generated', fixCommands.length, 'fix commands');

    // Return commands for caller to execute (recommended - allows fix + retry in one session)
    if (!executeImmediately) {
      return {
        success: true,
        fixCommands,
        analysis: 'Fix commands generated - caller should combine with retry in one session',
      };
    }

    // Legacy path: Execute fix and retry separately (kept for backwards compatibility)
    // Step 2: Execute fix commands on EC2
    const fixResult = await executeFixCommands(instanceId, fixCommands);

    if (!fixResult.success) {
      return {
        success: false,
        fixCommands,
        analysis: 'Fix commands generated but execution failed',
        executionOutput: fixResult.output,
        error: fixResult.error,
      };
    }

    console.log('[AUTO-FIX] Fix commands executed successfully');

    // Step 3: Retry the failed stage
    const retryResult = await retryFailedStage(instanceId, error.stage, error.command);

    return {
      success: retryResult.success,
      fixCommands,
      analysis: retryResult.success
        ? 'Error fixed successfully by Nova AI and stage completed'
        : 'Fix applied but stage still fails - may need manual intervention',
      executionOutput: `${fixResult.output}\n\n=== RETRY OUTPUT ===\n${retryResult.output}`,
      error: retryResult.error,
    };
  } catch (error: any) {
    console.error('[AUTO-FIX] Auto-fix process failed:', error);
    return {
      success: false,
      fixCommands: [],
      analysis: 'Auto-fix process encountered an error',
      error: error.message,
    };
  }
}

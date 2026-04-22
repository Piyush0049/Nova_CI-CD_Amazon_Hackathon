/**
 * Enhanced AI-Powered Pipeline Generator
 * Uses Claude Sonnet AI to generate comprehensive YAML pipelines for ANY language/framework
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { ProjectFiles, LanguageDetectionResult } from '../github/multi-language-analyzer';
import * as yaml from 'yaml';

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export interface GeneratedPipeline {
  yamlContent: string;
  parsedPipeline: any;
  stages: string[];
  language: string;
  framework: string;
}

/**
 * Generate comprehensive CI/CD pipeline using Claude Sonnet
 */
export async function generateAIPipeline(
  repoName: string,
  projectFiles: ProjectFiles,
  languageInfo: LanguageDetectionResult
): Promise<GeneratedPipeline> {
  console.log('[AI-PIPELINE] Generating pipeline for:', repoName);
  console.log('[AI-PIPELINE] Language:', languageInfo.primaryLanguage);
  console.log('[AI-PIPELINE] Framework:', languageInfo.framework);

  try {
    const prompt = buildEnhancedPrompt(repoName, projectFiles, languageInfo);
    const yamlContent = await invokeNovaAI(prompt);

    // Parse and validate YAML
    const parsedPipeline = yaml.parse(yamlContent);
    const stages = parsedPipeline.stages || [];

    console.log('[AI-PIPELINE] ✓ Pipeline generated successfully');
    console.log('[AI-PIPELINE] Stages:', stages.join(', '));

    return {
      yamlContent,
      parsedPipeline,
      stages,
      language: languageInfo.primaryLanguage,
      framework: languageInfo.framework || 'Unknown',
    };
  } catch (error: any) {
    console.error('[AI-PIPELINE] Error generating pipeline:', error);
    // Return fallback pipeline
    return getFallbackPipeline(languageInfo);
  }
}

/**
 * Build comprehensive prompt for Claude Sonnet
 */
function buildEnhancedPrompt(
  repoName: string,
  files: ProjectFiles,
  langInfo: LanguageDetectionResult
): string {
  const port = langInfo.port || "3000";
  // Build file context
  let fileContext = `PROJECT: ${repoName}\nPRIMARY LANGUAGE: ${langInfo.primaryLanguage}\nFRAMEWORK: ${langInfo.framework || 'N/A'}\nDETECTED PORT: ${port}\n\n`;

  // Add relevant file contents based on language
  if (files.packageJson) {
    fileContext += `PACKAGE.JSON (CRITICAL):\n${files.packageJson}\n\n`;
  }

  if (files.requirementsTxt) {
    fileContext += `REQUIREMENTS.TXT:\n${files.requirementsTxt}\n\n`;
  }

  if (files.cargoToml) {
    fileContext += `CARGO.TOML:\n${files.cargoToml}\n\n`;
  }

  if (files.goMod) {
    fileContext += `GO.MOD:\n${files.goMod}\n\n`;
  }

  if (files.readme) {
    fileContext += `README (excerpt):\n${files.readme.substring(0, 1000)}\n\n`;
  }

  const prompt = `You are a world-class AWS DevOps Specialist. Generate a PRODUCTION CI/CD pipeline for Amazon EC2 (Standard User: ec2-user) executed via AWS Systems Manager (SSM).

📁 PROJECT CONTEXT:
${fileContext}

🎯 YOUR MISSION:
Generate a valid YAML pipeline. This is NOT GitLab CI. This is NOT GitHub Actions. This YAML will be parsed and executed as individual shell commands on a real EC2 instance.

⚠️ ABSOLUTE SSM EXECUTION RULES (STRICT ADHERENCE REQUIRED):
1. NO YAML BLOCK SCALARS (- |): The executor runs each array item as an individual SSM shell command. NEVER use multi-line | blocks. Write every command as a separate flat string item in the script array.
2. NO DOCKER / NO IMAGES: Remove all 'image:' fields.
3. NO ARTIFACTS / NO CACHE: SSM stages run sequentially in /home/ec2-user/app. Remove all 'artifacts:', 'dependencies:', and 'cache:' blocks.
4. KEEP IT SIMPLE: Only essential stages: install → build → deploy. Skip lint/test unless package.json explicitly has scripts for them.
5. CLEAN LOGS: Use --loglevel=error for npm, --silent for yarn, --reporter=silent for pnpm. Filter out warnings with "| grep -v 'npm WARN' || true"
6. EXPORT HOME: SSM runs in a non-login shell. The 'deploy' stage MUST start with:
   - export HOME=/home/ec2-user
   - export PM2_HOME=/home/ec2-user/.pm2
7. NEVER USE npm ci: npm ci fails when package-lock.json is out of sync. The install stage MUST use:
   - cd /home/ec2-user/app
   - echo "Installing dependencies..."
   - npm install -g serve pm2 --loglevel=error 2>&1 | grep -v "npm WARN" || true
   - npm install --legacy-peer-deps --loglevel=error
   - echo "✅ Dependencies installed"
8. PROCESS MANAGEMENT BY LANGUAGE:
   - Node.js/Python: Use PM2 for process management
     * pm2 delete app 2>/dev/null || true
     * pm2 start "<command>" --name app
     * pm2 save --force
   - Rust/Go (compiled binaries): Use nohup for background execution
     * pkill -f "target/release" || true (or pkill -f "./app")
     * nohup ./target/release/<binary> > /home/ec2-user/app.log 2>&1 &
     * echo "✅ Process started"
9. BIND TO 0.0.0.0: Set HOST=0.0.0.0 or --host 0.0.0.0.
8. STATIC FRONTENDS (React/Vite/Next):
   - BUILD FIRST: The build stage MUST run the actual build command without fallbacks
   - Vite/React/Vue: npm run build (creates dist/ folder)
   - Create React App: npm run build (creates build/ folder)
   - Next.js: npm run build (creates .next/ folder)
   - NEVER use "npm run build || echo 'No build'" - let build failures fail the stage
   - Verify build output exists after build completes
   - Serve using absolute paths:
     * Vite (dist/): pm2 start "serve -s /home/ec2-user/app/dist -l ${port} --no-clipboard" --name app
     * CRA (build/): pm2 start "serve -s /home/ec2-user/app/build -l ${port} --no-clipboard" --name app
     * Next.js: pm2 start "npm start" --name app (Next.js has built-in server)
9. LOCAL BINARIES AND TYPESCRIPT: Always prepend PATH="./node_modules/.bin:$PATH" before running any build command to ensure locally installed binaries like tsc, vite, eslint are found without global install. Also install TypeScript globally in the install stage:
   - npm install -g typescript --no-audit
   - export PATH="./node_modules/.bin:$PATH"
   - npm run build
   - echo "Verifying build output..."
   - ls -la dist/ 2>/dev/null || ls -la build/ 2>/dev/null || echo "Build output directory not found!"
10. CLEAN LOG OUTPUT:
   - Use echo statements at START and END of each major step
   - Format: "Installing dependencies..." → do work → "✅ Dependencies installed"
   - Use --loglevel=error for npm to hide verbose output
   - Use "2>&1 | tail -5" to show only last 5 lines of long outputs
   - Use "| grep -v 'npm WARN' || true" to filter warnings
   - DO NOT use verbose commands like ls -lah, find, du, or pm2 logs
   - Keep each stage output under 10 lines total

🚀 PIPELINE STRUCTURE (MINIMAL - 3 STAGES ONLY):
stages:
  - install
  - build
  - deploy

variables:
  NODE_ENV: production
  PORT: "${port}"

🔥 CRITICAL RULES (MUST FOLLOW):
1. Build verification MUST check BOTH dist/ AND build/ folders
2. Deploy MUST serve whichever folder exists (dist/ OR build/)
3. DO NOT hardcode "build/" only - Vite uses "dist/"!
4. DO NOT use absolute paths like /home/ec2-user/app/build
5. Use relative paths: "serve -s dist" or "serve -s build"

⚡ SPEED REQUIREMENTS:
- Each stage should have 3-5 commands MAX
- Use "2>&1 | tail -10" to show only last 10 lines of output
- NO lint, NO test stages (they slow down deployment)
- Simple echo messages: "✅ Installed", "✅ Built", "✅ Deployed"

🚫 DO NOT ADD THESE (FORBIDDEN):
- DO NOT create postcss.config.js or postcss.config.cjs (unnecessary complexity)
- DO NOT install typescript globally (use local ./node_modules/.bin/tsc)
- DO NOT add extra configuration files
- DO NOT add health checks or curl commands
- DO NOT add extra echo statements beyond the required ones
- COPY THE TEMPLATES EXACTLY - DO NOT MODIFY OR ADD COMMANDS

📝 ULTRA-SIMPLE TEMPLATES (COPY THESE EXACTLY - DO NOT MODIFY):

⚠️ CRITICAL: Build output folder varies by framework:
   - Vite creates dist/
   - Create React App creates build/
   - ALWAYS check for BOTH: dist/ OR build/
   - ALWAYS serve whichever exists: dist/ OR build/

🔴 MANDATORY: Copy these templates WORD-FOR-WORD. DO NOT add extra commands. DO NOT modify. DO NOT add configurations.

INSTALL STAGE (COPY EXACTLY - 6 COMMANDS ONLY):
  script:
    - cd /home/ec2-user/app
    - npm install -g serve pm2 --loglevel=error 2>&1 | tail -1
    - if grep -q '"vite".*"5\.' package.json && grep -q '"@vitejs/plugin-react".*"6\.' package.json; then npm pkg set devDependencies.@vitejs/plugin-react="^5.0.0" && echo "✅ Fixed vite/plugin-react version before install"; fi
    - if grep -q "react-scripts" package.json 2>/dev/null; then npm install --save-dev @babel/plugin-proposal-private-property-in-object --legacy-peer-deps --loglevel=error 2>&1 | tail -1 && echo "✅ Babel plugin installed"; fi
    - npm install --legacy-peer-deps --loglevel=error 2>&1 | tail -1
    - echo "✅ Installed"

⚠️ DO NOT ADD: postcss config, typescript global install, extra echo statements, or ANY other commands!

BUILD STAGE (COPY EXACTLY - 3 COMMANDS ONLY):
  script:
    - cd /home/ec2-user/app
    - (npx vite build || npx react-scripts build || /usr/bin/vite build || npm run build) 2>&1 | tail -20
    - if [ -f "dist/index.html" ] || [ -f "build/index.html" ]; then echo "✅ Built"; else exit 1; fi

⚠️ DO NOT ADD: postcss creation, extra verifications, ls commands, or ANY other commands!

DEPLOY STAGE (COPY EXACTLY - 5 COMMANDS ONLY):
  script:
    - export HOME=/home/ec2-user PM2_HOME=/home/ec2-user/.pm2
    - cd /home/ec2-user/app
    - pm2 delete app 2>/dev/null || true
    - if [ -d "dist" ]; then pm2 start "serve -s dist -l ${port}" --name app; elif [ -d "build" ]; then pm2 start "serve -s build -l ${port}" --name app; else pm2 start "npm start" --name app; fi
    - pm2 save --force && echo "✅ Deployed"

⚠️ DO NOT ADD: health checks, pm2 logs, sleep commands, curl tests, or ANY other commands!

⚠️ WRONG EXAMPLES (DO NOT USE):
❌ if [ -f "build/index.html" ]; then  ← ONLY checks build/, will fail for Vite!
❌ pm2 start "serve -s build"  ← ONLY serves build/, will fail for Vite!
❌ pm2 start "serve -s /home/ec2-user/app/build"  ← Uses absolute path, unnecessary!

✅ CORRECT EXAMPLES (USE THESE):
✅ if [ -f "dist/index.html" ] || [ -f "build/index.html" ]  ← Checks BOTH!
✅ if [ -d "dist" ]; then serve dist; elif [ -d "build" ]; then serve build  ← Serves whichever exists!
✅ serve -s dist  ← Uses relative path, simpler!

🛡️ VERIFICATION (SIMPLE AND CLEAN):
- Static builds: After build, simple check:
  * if [ -d "dist" ] || [ -d "build" ]; then echo "✅ Build complete"; fi
- DO NOT use verbose ls -lah or find commands - keep it simple
- DO NOT use curl health checks - they can fail even when app is working
- DO NOT use || echo to hide build failures - let builds fail properly
- DO NOT use pm2 logs in deploy stage - it's too verbose
- DO NOT use sleep commands longer than 2 seconds - unnecessary delays

🎯 FINAL CHECKLIST - MUST VERIFY BEFORE GENERATING:
- [ ] ONLY 3 stages: install → build → deploy (NO lint, NO test)?
- [ ] Install stage has EXACTLY 6 commands (including Babel plugin check and vite/plugin-react version fix)?
- [ ] Build stage has EXACTLY 3 commands (uses npx vite with fallbacks)?
- [ ] Deploy stage has EXACTLY 5 commands?
- [ ] Build stage checks BOTH dist/ AND build/: if [ -f "dist/index.html" ] || [ -f "build/index.html" ]?
- [ ] Deploy stage serves BOTH dist/ AND build/: if [ -d "dist" ]; then serve dist; elif [ -d "build" ]; then serve build?
- [ ] Using relative paths (dist, build) NOT absolute (/home/ec2-user/app/dist)?
- [ ] Using "2>&1 | tail -20" to limit output?
- [ ] Simple echo: "✅ Installed", "✅ Built", "✅ Deployed"?
- [ ] NO verbose commands (ls, find, pm2 logs)?
- [ ] NO hardcoded "build/" only (must support both dist/ and build/)?
- [ ] NO postcss config creation?
- [ ] NO typescript global install?
- [ ] NO extra configuration files?
- [ ] COPIED TEMPLATES EXACTLY WITHOUT MODIFICATIONS?

🚨 CRITICAL WARNING: If you added ANYTHING beyond the templates above (postcss, typescript, extra commands), DELETE IT NOW!

Provide ONLY raw YAML starting with "stages:". No markdown. No explanations.`;

  return prompt;
}

/**
 * Invoke Claude Sonnet to generate YAML
 */
async function invokeNovaAI(prompt: string): Promise<string> {
  console.log('[AI-PIPELINE] 🚀 Invoking Claude Sonnet (Best Model)...');

  const command = new ConverseCommand({
    modelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0', // Upgraded to Premier - best model
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 12000, // Increased for comprehensive pipelines with deploy stages
      // temperature: 0.05, // Very low temperature for precise, deterministic output
      // topP: 0.9,
    },
  });

  const response = await bedrockClient.send(command);
  const aiResponse = response.output?.message?.content?.[0]?.text || '';

  console.log('[AI-PIPELINE] Response received (length:', aiResponse.length, ')');

  // Clean up the response
  let yamlContent = aiResponse.trim();

  // Remove markdown code blocks if present
  yamlContent = yamlContent.replace(/```yaml\n?/g, '').replace(/```\n?/g, '');

  // Ensure it starts with stages
  if (!yamlContent.startsWith('stages:')) {
    const stagesIndex = yamlContent.indexOf('stages:');
    if (stagesIndex > -1) {
      yamlContent = yamlContent.substring(stagesIndex);
    } else {
      throw new Error('Generated content does not contain valid YAML stages');
    }
  }

  // Validate it's valid YAML
  try {
    yaml.parse(yamlContent);
  } catch (error: any) {
    console.error('[AI-PIPELINE] Invalid YAML generated:', error.message);
    throw new Error(`Invalid YAML: ${error.message}`);
  }

  return yamlContent;
}

/**
 * Get fallback pipeline based on language
 */
function getFallbackPipeline(langInfo: LanguageDetectionResult): GeneratedPipeline {
  console.log('[AI-PIPELINE] Using fallback pipeline for:', langInfo.primaryLanguage);

  let yamlContent = '';

  switch (langInfo.primaryLanguage) {
    case 'JavaScript/TypeScript':
      yamlContent = getNodeJSFallbackPipeline(langInfo);
      break;
    case 'Python':
      yamlContent = getPythonFallbackPipeline(langInfo);
      break;
    case 'Rust':
      yamlContent = getRustFallbackPipeline();
      break;
    case 'Go':
      yamlContent = getGoFallbackPipeline();
      break;
    case 'Java':
      yamlContent = getJavaFallbackPipeline(langInfo);
      break;
    case 'Ruby':
      yamlContent = getRubyFallbackPipeline();
      break;
    case 'PHP':
      yamlContent = getPHPFallbackPipeline();
      break;
    case 'Docker':
      yamlContent = getDockerFallbackPipeline();
      break;
    default:
      yamlContent = getGenericFallbackPipeline();
  }

  const parsedPipeline = yaml.parse(yamlContent);

  return {
    yamlContent,
    parsedPipeline,
    stages: parsedPipeline.stages || [],
    language: langInfo.primaryLanguage,
    framework: langInfo.framework || 'Unknown',
  };
}

// Fallback pipeline templates

function getNodeJSFallbackPipeline(langInfo: LanguageDetectionResult): string {
  const pm = langInfo.packageManager || 'npm';
  const port = langInfo.port || "3000";

  return `stages:
  - install
  - build
  - deploy

variables:
  NODE_ENV: production
  PORT: "${port}"

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - npm install -g serve pm2 --loglevel=error 2>&1 | tail -1
    - if grep -q '"vite".*"5\.' package.json && grep -q '"@vitejs/plugin-react".*"6\.' package.json; then npm pkg set devDependencies.@vitejs/plugin-react="^5.0.0" && echo "✅ Fixed vite/plugin-react version before install"; fi
    - if grep -q "react-scripts" package.json 2>/dev/null; then npm install --save-dev @babel/plugin-proposal-private-property-in-object --legacy-peer-deps --loglevel=error 2>&1 | tail -1 && echo "✅ Babel plugin installed"; fi
    - npm install --legacy-peer-deps --loglevel=error 2>&1 | tail -1
    - echo "✅ Installed"

build_application:
  stage: build
  script:
    - cd /home/ec2-user/app
    - (npx vite build || npx react-scripts build || /usr/bin/vite build || npm run build) 2>&1 | tail -20
    - if [ -f "dist/index.html" ] || [ -f "build/index.html" ]; then echo "✅ Built"; else echo "❌ Build failed" && exit 1; fi

deploy_application:
  stage: deploy
  script:
    - export HOME=/home/ec2-user
    - export PM2_HOME=/home/ec2-user/.pm2
    - cd /home/ec2-user/app
    - pm2 delete app 2>/dev/null || true
    - if [ -d "dist" ]; then pm2 start "serve -s dist -l ${port}" --name app; elif [ -d "build" ]; then pm2 start "serve -s build -l ${port}" --name app; else pm2 start "npm start" --name app; fi
    - pm2 save --force
    - echo "✅ Deployed"`;
}

function getPythonFallbackPipeline(langInfo: LanguageDetectionResult): string {
  const port = langInfo.port || "8000";
  return `stages:
  - install
  - deploy

variables:
  PORT: "${port}"

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - npm install -g pm2 --loglevel=error 2>&1 | tail -1
    - pip install -r requirements.txt -q 2>&1 | tail -2
    - echo "✅ Installed"

deploy_application:
  stage: deploy
  script:
    - export HOME=/home/ec2-user PM2_HOME=/home/ec2-user/.pm2
    - cd /home/ec2-user/app
    - pm2 delete app 2>/dev/null || true
    - pm2 start "uvicorn main:app --host 0.0.0.0 --port ${port}" --name app --interpreter none
    - pm2 save --force
    - echo "✅ Deployed"`;
}

function getRustFallbackPipeline(): string {
  return `stages:
  - install
  - build
  - deploy

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y 2>&1 | tail -2
    - echo "✅ Installed"

build:
  stage: build
  script:
    - export HOME=/home/ec2-user
    - source /home/ec2-user/.cargo/env
    - cargo build --release 2>&1 | tail -10
    - echo "✅ Built"

deploy_application:
  stage: deploy
  script:
    - export HOME=/home/ec2-user
    - source /home/ec2-user/.cargo/env
    - cd /home/ec2-user/app
    - pkill -f "target/release" || true
    - nohup ./target/release/rust_project > app.log 2>&1 &
    - echo "✅ Deployed"`;
}

function getGoFallbackPipeline(): string {
  return `stages:
  - install
  - build
  - deploy

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - npm install -g pm2 --no-audit
    - sudo yum install -y golang

build:
  stage: build
  script:
    - go build -o app .

deploy_application:
  stage: deploy
  script:
    - export HOME=/home/ec2-user
    - export PM2_HOME=/home/ec2-user/.pm2
    - pm2 delete app 2>/dev/null || true
    - pm2 start "./app" --name app
    - pm2 save --force
    - sleep 8
    - curl -sf http://localhost:3000/ && echo "✅ Healthy" || (pm2 logs app --lines 30 --nostream && exit 1)`;
}

function getJavaFallbackPipeline(langInfo: LanguageDetectionResult): string {
  const isMaven = langInfo.buildTool === 'maven';

  return `stages:
  - install
  - build
  - deploy

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - npm install -g pm2 --no-audit
    - sudo yum install -y java-17-amazon-corretto

build_application:
  stage: build
  script:
    - ${isMaven ? 'mvn clean package -DskipTests' : './gradlew build -x test'}

deploy_application:
  stage: deploy
  script:
    - export HOME=/home/ec2-user
    - export PM2_HOME=/home/ec2-user/.pm2
    - pm2 delete app 2>/dev/null || true
    - pm2 start "java -jar ${isMaven ? 'target/*.jar' : 'build/libs/*.jar'}" --name app
    - pm2 save --force
    - sleep 8
    - curl -sf http://localhost:8080/ && echo "✅ Healthy" || (pm2 logs app --lines 30 --nostream && exit 1)`;
}

function getRubyFallbackPipeline(): string {
  return `stages:
  - install
  - deploy

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - npm install -g pm2 --no-audit
    - bundle install

deploy_application:
  stage: deploy
  script:
    - export HOME=/home/ec2-user
    - export PM2_HOME=/home/ec2-user/.pm2
    - pm2 delete app 2>/dev/null || true
    - pm2 start "bundle exec ruby app.rb" --name app
    - pm2 save --force
    - sleep 8
    - curl -sf http://localhost:3000/ && echo "✅ Healthy" || (pm2 logs app --lines 30 --nostream && exit 1)`;
}

function getPHPFallbackPipeline(): string {
  return `stages:
  - install
  - deploy

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - npm install -g pm2 --no-audit
    - composer install --no-dev --optimize-autoloader

deploy_application:
  stage: deploy
  script:
    - export HOME=/home/ec2-user
    - export PM2_HOME=/home/ec2-user/.pm2
    - pm2 delete app 2>/dev/null || true
    - pm2 start "php -S 0.0.0.0:8000" --name app
    - pm2 save --force
    - sleep 8
    - curl -sf http://localhost:8000/ && echo "✅ Healthy" || (pm2 logs app --lines 30 --nostream && exit 1)`;
}

function getDockerFallbackPipeline(): string {
  // Docker is no longer supported for native EC2 execution; redirect to generic
  return getGenericFallbackPipeline();
}

function getGenericFallbackPipeline(): string {
  return `stages:
  - install
  - deploy

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - npm install -g pm2 --no-audit

deploy_application:
  stage: deploy
  script:
    - export HOME=/home/ec2-user
    - export PM2_HOME=/home/ec2-user/.pm2
    - pm2 delete app || true
    - pm2 start "npm start" --name app
    - pm2 save --force`;
}

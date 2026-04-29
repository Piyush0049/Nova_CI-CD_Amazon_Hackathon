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
 * PRIORITY: Always use AI-generated pipeline (retry 3 times before fallback)
 */
export async function generateAIPipeline(
  repoName: string,
  projectFiles: ProjectFiles,
  languageInfo: LanguageDetectionResult
): Promise<GeneratedPipeline> {
  console.log('[AI-PIPELINE] ========================================');
  console.log('[AI-PIPELINE] 🤖 AI-POWERED PIPELINE GENERATION');
  console.log('[AI-PIPELINE] Using: Claude Sonnet 4.6 (Best Model)');
  console.log('[AI-PIPELINE] Repository:', repoName);
  console.log('[AI-PIPELINE] Language:', languageInfo.primaryLanguage);
  console.log('[AI-PIPELINE] Framework:', languageInfo.framework || 'Not detected');
  console.log('[AI-PIPELINE] Build Tool:', languageInfo.buildTool || 'Not detected');
  console.log('[AI-PIPELINE] Package Manager:', languageInfo.packageManager || 'Not detected');
  console.log('[AI-PIPELINE] ========================================');

  // RETRY LOGIC: Try AI generation up to 3 times before falling back to templates
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[AI-PIPELINE] 🔄 Attempt ${attempt}/${MAX_RETRIES}: Invoking Claude Sonnet AI...`);

      const prompt = buildEnhancedPrompt(repoName, projectFiles, languageInfo);
      const yamlContent = await invokeNovaAI(prompt);

      // Parse and validate YAML
      const parsedPipeline = yaml.parse(yamlContent);
      const stages = parsedPipeline.stages || [];

      console.log('[AI-PIPELINE] ========================================');
      console.log('[AI-PIPELINE] ✅ SUCCESS: AI Pipeline Generated!');
      console.log('[AI-PIPELINE] Method: Claude Sonnet 4.6 (AI-Generated)');
      console.log('[AI-PIPELINE] Stages:', stages.join(' → '));
      console.log('[AI-PIPELINE] Quality: 100% Custom-tailored for your project');
      console.log('[AI-PIPELINE] ========================================');

      return {
        yamlContent,
        parsedPipeline,
        stages,
        language: languageInfo.primaryLanguage,
        framework: languageInfo.framework || 'Generic',
      };
    } catch (error: any) {
      lastError = error;
      console.error(`[AI-PIPELINE] ❌ Attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);

      if (attempt < MAX_RETRIES) {
        const waitTime = attempt * 2000; // Exponential backoff: 2s, 4s
        console.log(`[AI-PIPELINE] ⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // Only use fallback if all AI attempts failed
  console.error('[AI-PIPELINE] ========================================');
  console.error('[AI-PIPELINE] ⚠️  WARNING: AI generation failed after', MAX_RETRIES, 'attempts');
  console.error('[AI-PIPELINE] Last error:', lastError?.message);
  console.error('[AI-PIPELINE] Falling back to template-based pipeline');
  console.error('[AI-PIPELINE] ========================================');

  return getFallbackPipeline(languageInfo);
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

🔍 DETECTED INFORMATION:
- Primary Language: ${langInfo.primaryLanguage}
- Framework: ${langInfo.framework || 'Not detected - will use generic approach'}
- Build Tool: ${langInfo.buildTool || 'Not detected - will use npm run build'}
- Package Manager: ${langInfo.packageManager || 'npm'}

🎯 YOUR MISSION:
Generate a valid YAML pipeline. This is NOT GitLab CI. This is NOT GitHub Actions. This YAML will be parsed and executed as individual shell commands on a real EC2 instance.

⚠️ CRITICAL: If framework/build tool is "Not detected", still generate a working pipeline using the generic templates below!

⚠️ SIMPLE RULES (KEEP IT CLEAN AND MINIMAL):
1. NO DOCKER / NO IMAGES: Remove all 'image:' fields.
2. NO ARTIFACTS / NO CACHE: Remove all 'artifacts:', 'dependencies:', and 'cache:' blocks.
3. ONLY 3 STAGES: install → build → deploy. NO lint, NO test.
4. INSTALL ALL DEPENDENCIES: Use "npm install --legacy-peer-deps" which installs BOTH dependencies AND devDependencies
5. NEVER USE NODE_ENV: production in variables! It breaks devDependencies installation!
6. UNIVERSAL BUILD CHECK: Check for dist/ OR build/ (works for ALL frameworks)
7. CLEAN LOGS: Use "2>&1 | tail -20" to limit output. Simple echo messages only.
8. VERIFY BUILD TOOLS: After install, verify that build tools (vite/webpack/etc) are present
9. PROCESS MANAGEMENT: Use nohup for simple background processes
10. KEEP IT SIMPLE: No version checks, no complex conditions, just straightforward commands!

🚀 PIPELINE STRUCTURE (MINIMAL - 3 STAGES ONLY):
stages:
  - install
  - build
  - deploy

variables:
  PORT: "${port}"

🔥 CRITICAL RULES (MUST FOLLOW):
1. DO NOT set NODE_ENV: production in variables (breaks devDependencies install)
2. npm install WITHOUT NODE_ENV will install BOTH dependencies AND devDependencies
3. Build verification MUST check BOTH dist/ AND build/ folders
4. Deploy MUST serve whichever folder exists (dist/ OR build/)
5. DO NOT use absolute paths like /home/ec2-user/app/build
6. Use relative paths: "serve -s dist" or "serve -s build"

⚡ SPEED REQUIREMENTS:
- Each stage should have 4-6 commands MAX
- Use "2>&1 | tail -10" to show only last 10 lines of output
- NO lint, NO test stages (they slow down deployment)
- Simple echo messages: "✅ Installed", "✅ Built", "✅ Deployed"

🚫 DO NOT ADD THESE (FORBIDDEN):
- DO NOT set NODE_ENV=production in variables section!
- DO NOT create postcss.config.js or postcss.config.cjs (unnecessary complexity)
- DO NOT install typescript globally (use local ./node_modules/.bin/tsc)
- DO NOT add extra configuration files
- DO NOT add health checks or curl commands
- COPY THE TEMPLATES EXACTLY - DO NOT MODIFY OR ADD COMMANDS

📝 BULLETPROOF TEMPLATES (COPY THESE EXACTLY):

⚠️ CRITICAL: Build output folder varies by framework:
   - Vite creates dist/
   - Create React App creates build/
   - ALWAYS check for BOTH: dist/ OR build/
   - ALWAYS serve whichever exists: dist/ OR build/

📚 LANGUAGE-SPECIFIC GUIDANCE:

**Node.js / JavaScript / TypeScript:**
- Frameworks: React, Vue, Angular, Next.js, Express, NestJS
- Build outputs: dist/ (Vite, Vue), build/ (CRA), .next/ (Next.js), none (Express)
- Deploy: Use nohup with serve for static builds, or npm start for server apps
- IMPORTANT: npm install WITHOUT NODE_ENV installs ALL dependencies (prod + dev)!

**Python:**
- Frameworks: Django, Flask, FastAPI
- Install: pip install -r requirements.txt (installs ALL dependencies by default)
- No build stage needed
- Deploy: nohup with uvicorn or gunicorn

**Rust:**
- Install: rustup (cargo build will download all dependencies)
- Build: cargo build --release (downloads and installs ALL dependencies from Cargo.toml)
- Deploy: Extract binary name from Cargo.toml, then run with nohup
- CRITICAL: Use dynamic binary name extraction:
  export BINARY_NAME=$(grep "^name" Cargo.toml | head -1 | cut -d'"' -f2 | tr '-' '_')
  nohup ./target/release/$BINARY_NAME > app.log 2>&1 &

**Go:**
- Install: go mod download (downloads ALL dependencies including dev)
- Build: go build -o app (creates ./app binary)
- Deploy: nohup ./app > app.log 2>&1 &

**Java:**
- Install: Maven/Gradle (install ALL dependencies automatically, including test/dev)
- Build: mvn clean package OR ./gradlew build
- Deploy: nohup java -jar target/*.jar > app.log 2>&1 & (Maven) OR build/libs/*.jar (Gradle)

**Ruby:**
- Install: bundle install (installs ALL gems by default, including development group)
- Deploy: nohup bundle exec ruby app.rb

**PHP:**
- Install: composer install (installs ALL dependencies, including dev - NO --no-dev flag!)
- Deploy: nohup php -S 0.0.0.0:8000

🔴 MANDATORY: Copy these templates WORD-FOR-WORD. DO NOT add extra commands. DO NOT modify.

INSTALL STAGE (COPY EXACTLY - 5 COMMANDS):
  script:
    - cd /home/ec2-user/app
    - npm install -g serve
    - npm install --legacy-peer-deps
    - ls node_modules/.bin/ | grep -E "vite|webpack|react-scripts|next" || echo "⚠️  No build tool found"
    - echo "✅ Installed"

⚠️ CRITICAL: NO NODE_ENV=production! It must install devDependencies!
⚠️ Verify build tools are present after install!

BUILD STAGE (COPY EXACTLY - 4 COMMANDS):
  script:
    - cd /home/ec2-user/app
    - export NODE_ENV=production
    - npm run build 2>&1 | tail -20
    - if [ -d "dist" ] || [ -d "build" ]; then echo "✅ Built"; else exit 1; fi

⚠️ Set NODE_ENV=production ONLY in build stage, NOT in variables!
⚠️ UNIVERSAL: Works for Vite (dist/), CRA (build/), and all frameworks!

DEPLOY STAGE (COPY EXACTLY - 5 COMMANDS):
  script:
    - cd /home/ec2-user/app
    - export NODE_ENV=production
    - pkill -f "serve -s" || pkill -f "node.*start" || true
    - nohup sh -c 'if [ -d "dist" ]; then serve -s dist -l ${port}; elif [ -d "build" ]; then serve -s build -l ${port}; else npm start; fi' > app.log 2>&1 &
    - echo "✅ Deployed on port ${port}"

⚠️ DO NOT ADD: health checks, pm2 logs, sleep commands, curl tests, or ANY other commands!

⚠️ WRONG EXAMPLES (DO NOT USE):
❌ variables: NODE_ENV: production  ← Breaks devDependencies install!
❌ npm install --production  ← Skips devDependencies!
❌ if [ -f "build/index.html" ]; then  ← ONLY checks build/, will fail for Vite!

✅ CORRECT EXAMPLES (USE THESE):
✅ variables: PORT: "3000"  ← Good! No NODE_ENV!
✅ npm install --legacy-peer-deps  ← Installs ALL dependencies!
✅ export NODE_ENV=production (in build stage only)  ← Good! Only for build!
✅ if [ -d "dist" ] || [ -d "build" ]  ← Checks BOTH!

🛡️ VERIFICATION (SIMPLE AND CLEAN):
- After install: Verify build tools exist with ls node_modules/.bin/
- After build: Check that dist/ OR build/ folder exists
- DO NOT use verbose ls -lah or find commands - keep it simple
- DO NOT use curl health checks - they can fail even when app is working
- DO NOT use pm2 logs in deploy stage - it's too verbose

🎯 FINAL CHECKLIST - MUST VERIFY BEFORE GENERATING:
- [ ] ONLY 3 stages: install → build → deploy (NO lint, NO test)?
- [ ] NO NODE_ENV in variables section?
- [ ] Install stage has 5 commands (cd, npm install -g, npm install, verify, echo)?
- [ ] Build stage has 4 commands (cd, export NODE_ENV, npm run build, verify)?
- [ ] Deploy stage has 5 commands (cd, export NODE_ENV, pkill, nohup, echo)?
- [ ] Install verifies build tools are present?
- [ ] Build stage checks BOTH dist/ AND build/ folders?
- [ ] Deploy stage serves BOTH dist/ AND build/ (whichever exists)?
- [ ] Using relative paths (dist, build) NOT absolute paths?
- [ ] Simple echo messages: "✅ Installed", "✅ Built", "✅ Deployed"?
- [ ] COPIED TEMPLATES EXACTLY - BULLETPROOF!

🚨 CRITICAL WARNING:
- If you set NODE_ENV=production in variables, DELETE IT NOW!
- It MUST be set ONLY in build and deploy stages, NOT globally!
- npm install MUST run WITHOUT NODE_ENV to get devDependencies!

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
  const port = langInfo.port || "3000";

  return `stages:
  - install
  - build
  - deploy

variables:
  PORT: "${port}"

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - npm install -g serve
    - npm install --legacy-peer-deps
    - ls node_modules/.bin/ | grep -E "vite|webpack|react-scripts|next" || echo "⚠️  No build tool found"
    - echo "✅ Installed"

build_application:
  stage: build
  script:
    - cd /home/ec2-user/app
    - export NODE_ENV=production
    - npm run build 2>&1 | tail -20
    - if [ -d "dist" ] || [ -d "build" ]; then echo "✅ Built"; else exit 1; fi

deploy_application:
  stage: deploy
  script:
    - cd /home/ec2-user/app
    - export NODE_ENV=production
    - pkill -f "serve -s" || pkill -f "node.*start" || true
    - nohup sh -c 'if [ -d "dist" ]; then serve -s dist -l ${port}; elif [ -d "build" ]; then serve -s build -l ${port}; else npm start; fi' > app.log 2>&1 &
    - echo "✅ Deployed on port ${port}"`;
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
    - pip install -r requirements.txt -q 2>&1 | tail -2
    - echo "✅ Installed"

deploy_application:
  stage: deploy
  script:
    - cd /home/ec2-user/app
    - pkill -f "uvicorn" || pkill -f "python.*app" || true
    - nohup uvicorn main:app --host 0.0.0.0 --port ${port} > app.log 2>&1 &
    - echo "✅ Deployed on port ${port}"`;
}

function getRustFallbackPipeline(): string {
  return `stages:
  - install
  - build
  - deploy

variables:
  PORT: "8080"

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y 2>&1 | tail -2
    - echo "✅ Installed"

build:
  stage: build
  script:
    - cd /home/ec2-user/app
    - export HOME=/home/ec2-user
    - source /home/ec2-user/.cargo/env
    - cargo build --release 2>&1 | tail -10
    - echo "✅ Built"

deploy_application:
  stage: deploy
  script:
    - cd /home/ec2-user/app
    - export HOME=/home/ec2-user
    - source /home/ec2-user/.cargo/env
    - export BINARY_NAME=\$(grep "^name" Cargo.toml | head -1 | cut -d'"' -f2 | tr '-' '_')
    - pkill -f "target/release/\$BINARY_NAME" || true
    - nohup ./target/release/\$BINARY_NAME > app.log 2>&1 &
    - echo "✅ Deployed on port \${PORT}"`;
}

function getGoFallbackPipeline(): string {
  return `stages:
  - install
  - build
  - deploy

variables:
  PORT: "3000"

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - sudo yum install -y golang
    - go mod download
    - echo "✅ Installed"

build:
  stage: build
  script:
    - cd /home/ec2-user/app
    - go build -o app .
    - echo "✅ Built"

deploy_application:
  stage: deploy
  script:
    - cd /home/ec2-user/app
    - pkill -f "./app" || true
    - nohup ./app > app.log 2>&1 &
    - echo "✅ Deployed on port \${PORT}"`;
}

function getJavaFallbackPipeline(langInfo: LanguageDetectionResult): string {
  const isMaven = langInfo.buildTool === 'maven';

  return `stages:
  - install
  - build
  - deploy

variables:
  PORT: "8080"

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - sudo yum install -y java-17-amazon-corretto
    - ${isMaven ? 'mvn dependency:resolve' : './gradlew dependencies'}
    - echo "✅ Installed"

build_application:
  stage: build
  script:
    - cd /home/ec2-user/app
    - ${isMaven ? 'mvn clean package -DskipTests' : './gradlew build -x test'}
    - echo "✅ Built"

deploy_application:
  stage: deploy
  script:
    - cd /home/ec2-user/app
    - pkill -f "java -jar" || true
    - nohup java -jar ${isMaven ? 'target/*.jar' : 'build/libs/*.jar'} > app.log 2>&1 &
    - echo "✅ Deployed on port \${PORT}"`;
}

function getRubyFallbackPipeline(): string {
  return `stages:
  - install
  - deploy

variables:
  PORT: "3000"

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - bundle install
    - echo "✅ Installed"

deploy_application:
  stage: deploy
  script:
    - cd /home/ec2-user/app
    - pkill -f "ruby app.rb" || true
    - nohup bundle exec ruby app.rb > app.log 2>&1 &
    - echo "✅ Deployed on port \${PORT}"`;
}

function getPHPFallbackPipeline(): string {
  return `stages:
  - install
  - deploy

variables:
  PORT: "8000"

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - composer install --optimize-autoloader
    - echo "✅ Installed"

deploy_application:
  stage: deploy
  script:
    - cd /home/ec2-user/app
    - pkill -f "php -S" || true
    - nohup php -S 0.0.0.0:8000 > app.log 2>&1 &
    - echo "✅ Deployed on port \${PORT}"`;
}

function getDockerFallbackPipeline(): string {
  // Docker is no longer supported for native EC2 execution; redirect to generic
  return getGenericFallbackPipeline();
}

function getGenericFallbackPipeline(): string {
  return `stages:
  - install
  - deploy

variables:
  PORT: "3000"

install_dependencies:
  stage: install
  script:
    - cd /home/ec2-user/app
    - echo "✅ Installed"

deploy_application:
  stage: deploy
  script:
    - cd /home/ec2-user/app
    - pkill -f "npm start" || true
    - nohup npm start > app.log 2>&1 &
    - echo "✅ Deployed on port \${PORT}"`;
}

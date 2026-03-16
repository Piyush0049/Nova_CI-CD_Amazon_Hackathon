/**
 * Enhanced AI-Powered Pipeline Generator
 * Uses Amazon Nova AI to generate comprehensive YAML pipelines for ANY language/framework
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
 * Generate comprehensive CI/CD pipeline using Nova AI
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
 * Build comprehensive prompt for Nova AI
 */
function buildEnhancedPrompt(
  repoName: string,
  files: ProjectFiles,
  langInfo: LanguageDetectionResult
): string {
  // Build file context
  let fileContext = `PROJECT: ${repoName}\nPRIMARY LANGUAGE: ${langInfo.primaryLanguage}\nFRAMEWORK: ${langInfo.framework || 'N/A'}\n\n`;

  // Add relevant file contents based on language
  if (files.packageJson) {
    fileContext += `PACKAGE.JSON:\n${files.packageJson}\n\n`;
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

  if (files.pomXml) {
    fileContext += `POM.XML:\n${files.pomXml.substring(0, 2000)}\n\n`;
  }

  if (files.buildGradle) {
    fileContext += `BUILD.GRADLE:\n${files.buildGradle}\n\n`;
  }

  if (files.gemfile) {
    fileContext += `GEMFILE:\n${files.gemfile}\n\n`;
  }

  if (files.composerJson) {
    fileContext += `COMPOSER.JSON:\n${files.composerJson}\n\n`;
  }

  if (files.dockerfile) {
    fileContext += `DOCKERFILE:\n${files.dockerfile.substring(0, 1000)}\n\n`;
  }

  if (files.readme) {
    fileContext += `README (excerpt):\n${files.readme.substring(0, 1000)}\n\n`;
  }

  const prompt = `You are THE WORLD'S BEST DevOps engineer and CI/CD expert. Your pipelines NEVER fail.

📁 PROJECT FILES:
${fileContext}

🎯 YOUR MISSION:
Analyze this repository DEEPLY and generate a PERFECT, ERROR-FREE CI/CD pipeline that will work flawlessly on first deployment.

🔍 CRITICAL ANALYSIS STEPS (DO THIS FIRST):

1. **Detect Framework (MOST IMPORTANT)**:
   - NEXT.JS: Look for next.config.js OR "next" in dependencies OR pages/app directories
     → Framework: Next.js
     → Build: "next build" (ALWAYS required)
     → Start: "next start"
     → Type: fullstack

   - VITE + REACT: Look for vite.config.js/ts AND "vite" in devDependencies
     → Framework: Vite + React
     → Build: "vite build" (creates dist/)
     → Start: Serve static files from dist/
     → Type: frontend

   - CREATE REACT APP: Look for "react-scripts" in dependencies
     → Framework: Create React App
     → Build: "react-scripts build" (creates build/)
     → Start: Serve static files from build/
     → Type: frontend

   - EXPRESS BACKEND: Look for "express" in dependencies + NO vite/next/webpack config
     → Framework: Express.js
     → Build: NONE (unless TypeScript)
     → Start: "node index.js" or "node server.js"
     → Type: backend

2. **Detect Entry Points** - Find the ACTUAL main files:
   - Next.js: pages/index.tsx, app/page.tsx
   - Vite: src/main.tsx, index.html
   - Express: index.js, server.js, src/server.js

3. **READ ACTUAL PACKAGE.JSON SCRIPTS (CRITICAL)**:
   ⚠️ USE THESE EXACT SCRIPTS - DO NOT MAKE UP COMMANDS!
   - If "build" script exists in package.json → Use "npm run build"
   - If "test" script exists → Use "npm run test"
   - If "lint" script exists → Use "npm run lint"
   - If script does NOT exist → SKIP that stage entirely

   📦 Check the PACKAGE.JSON section above for actual available scripts!

4. **Detect Build Requirements**:
   - Frontend projects (Vite, CRA, Next.js): ALWAYS need build (if build script exists)
   - Backend projects: Only if TypeScript or build script present
   - NEVER add a build stage if no build script in package.json

5. **Detect Dependencies**:
   - Prisma (@prisma/client)? → Add "npx prisma generate" AFTER npm install
   - TypeScript (tsconfig.json)? → May need "tsc" build
   - Test framework (jest, vitest)? → Add test stage

⚠️ CRITICAL REQUIREMENTS:
1. **Valid YAML syntax** - PERFECT indentation (2 spaces), NO duplicate keys
2. **Smart build detection** - Don't blindly add build stage for backends
3. **Universal compatibility** - Works for frontend AND backend projects
4. **Error handling** - Use --legacy-peer-deps, --force flags for npm
5. **Entry point aware** - Know which file starts the app
6. **Dependency intelligence** - Detect what's actually needed

PIPELINE STRUCTURE:
stages:
  - install      # Install dependencies
  - lint         # Code quality checks (if applicable)
  - test         # Run tests (if applicable)
  - build        # Build/compile the application
  - deploy       # Deployment preparation

LANGUAGE-SPECIFIC GUIDELINES:

**Node.js / JavaScript / TypeScript:**
⚠️ FRAMEWORK DETECTION IS ABSOLUTELY CRITICAL:

🟢 NEXT.JS (Fullstack SSR):
- Detection: next.config.js OR "next" in dependencies OR pages/ or app/ directory exists
- Install: npm install --force --include=dev --legacy-peer-deps
- Build: next build (ALWAYS REQUIRED - creates .next/ folder)
- Start: next start --port 3000
- Type: fullstack
- Example:
  build_application:
    stage: build
    script:
      - npm run build  # Runs "next build"

🟢 VITE + REACT (Frontend SPA):
- Detection: vite.config.js OR vite.config.ts exists + "vite" in devDependencies
- Install: npm install --force --include=dev --legacy-peer-deps
- Build: vite build (REQUIRED - creates dist/ folder)
- Start: Serve static files from dist/ on port 80
- Type: frontend
- Example:
  build_application:
    stage: build
    script:
      - npm run build  # Runs "vite build"

🟢 CREATE REACT APP (Frontend):
- Detection: "react-scripts" in dependencies
- Install: npm install --force --include=dev --legacy-peer-deps
- Build: react-scripts build (creates build/ folder)
- Start: Serve static files from build/ on port 80
- Type: frontend

🟢 EXPRESS BACKEND (Pure Backend):
- Detection: "express"/"fastify"/"koa" in dependencies + NO vite.config + NO next.config + NO webpack.config
- Install: npm install --force --include=dev --legacy-peer-deps
- Build: NONE (skip build stage entirely) unless TypeScript
- Start: node index.js OR node server.js on port 80
- Type: backend
- Example:
  build_application:
    stage: build
    script:
      - echo "No build needed for pure Node.js backend"

🟢 TYPESCRIPT BACKEND:
- Detection: tsconfig.json + "express" + NO frontend tools
- Install: npm install --force --include=dev --legacy-peer-deps
- Build: tsc OR npm run build (compiles TS → JS)
- Start: node dist/index.js
- Type: backend

⚡ SPECIAL CASES:
- Prisma: Add "npx prisma generate" AFTER npm install in install stage
- Monorepo: Check for workspaces in package.json
- Hybrid: Some Next.js apps have API routes (still fullstack)

**Python:**
- Package manager: pip, pipenv, or poetry
- Virtual environment: python -m venv venv && source venv/bin/activate
- Install: pip install -r requirements.txt
- Framework-specific: Django (python manage.py), Flask/FastAPI (python app.py)
- WSGI: Use gunicorn for production

**Rust:**
- Build: cargo build --release
- Test: cargo test
- Run: ./target/release/<binary-name>

**Go:**
- Build: go build -o app
- Test: go test ./...
- Run: ./app

**Java:**
- Maven: mvn clean install, mvn package
- Gradle: gradle build, gradle test
- Run: java -jar target/*.jar

**Ruby:**
- Bundler: bundle install
- Rails: rails server, bundle exec rails db:migrate
- Run: bundle exec ruby app.rb

**PHP:**
- Composer: composer install --no-dev --optimize-autoloader
- Laravel: php artisan migrate, php artisan serve
- Run with: php -S 0.0.0.0:80

**Docker:**
- Build: docker build -t app:latest .
- Run: docker run -d -p 80:PORT app:latest

🎯 UNIVERSAL PIPELINE RULES:
1. NO duplicate job names - each job must be unique
2. Use descriptive job names: install_dependencies, build_application, run_tests, etc.
3. Include 'script:' section for each job with actual commands
4. Add 'image:' if needed (e.g., node:18-alpine, python:3.11-slim)
5. Use 'allow_failure: true' for non-critical jobs (like linting)
6. Include 'artifacts:' for build outputs
7. Set proper 'stage:' for each job
8. Add comments explaining what each stage does

🚀 INTELLIGENCE REQUIREMENTS:
- If it's a FRONTEND → Include build stage with npm run build
- If it's a BACKEND → Skip build stage unless TypeScript
- If has Prisma → Add "npx prisma generate" in install
- If has tests → Add test stage but allow_failure: true
- If has linting → Add lint stage but allow_failure: true

💯 FINAL CHECKLIST BEFORE GENERATING:
✅ Did I READ the actual package.json SCRIPTS section at the top?
✅ Did I ONLY include stages for scripts that ACTUALLY exist in package.json?
✅ Did I identify the EXACT framework (Next.js? Vite? Express? CRA?)?
✅ Did I check for framework config files (next.config.js, vite.config.js)?
✅ Did I check the directory structure (pages/, app/, src/, dist/)?
✅ Did I determine if build is ACTUALLY needed (frontend=yes, pure backend=no)?
✅ Did I include Prisma generate if @prisma/client exists?
✅ Did I use correct install command with --force --include=dev --legacy-peer-deps?
✅ Are all job names unique (install_dependencies, build_application, etc)?
✅ Is the YAML syntax perfect (2-space indentation, no duplicate keys)?
✅ Did I use "npm run <script-name>" for stages that exist in package.json scripts?
✅ Did I SKIP stages (test/lint) if no corresponding script exists in package.json?
✅ Did I consider the start command (next start vs node index.js vs static server)?

OUTPUT:
Provide ONLY the valid YAML pipeline configuration. No explanations, no markdown code blocks, just raw YAML starting with "stages:".
DO NOT add extra formatting or explanations. Just the YAML.

Example structure:
stages:
  - install
  - lint
  - test
  - build

variables:
  NODE_ENV: production

install_dependencies:
  stage: install
  image: node:18-alpine
  script:
    - npm install --legacy-peer-deps
  artifacts:
    paths:
      - node_modules/
    expire_in: 1 hour

lint_code:
  stage: lint
  image: node:18-alpine
  script:
    - npm run lint
  allow_failure: true

test_application:
  stage: test
  image: node:18-alpine
  script:
    - npm run test
  allow_failure: true

build_application:
  stage: build
  image: node:18-alpine
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
      - build/
    expire_in: 30 days

NOW GENERATE THE YAML PIPELINE:`;

  return prompt;
}

/**
 * Invoke Nova AI to generate YAML
 */
async function invokeNovaAI(prompt: string): Promise<string> {
  console.log('[AI-PIPELINE] 🚀 Invoking Amazon Nova Premier (Best Model)...');

  const command = new ConverseCommand({
    modelId: 'us.amazon.nova-premier-v1:0', // Upgraded to Premier - best model
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 8000, // Increased for more comprehensive analysis
      temperature: 0.05, // Very low temperature for precise, deterministic output
      topP: 0.9,
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
  const installCmd = pm === 'npm' ? 'npm install --legacy-peer-deps' :
                     pm === 'yarn' ? 'yarn install' :
                     'pnpm install';

  return `stages:
  - install
${langInfo.hasLinter ? '  - lint\n' : ''}${langInfo.hasTests ? '  - test\n' : ''}  - build

variables:
  NODE_ENV: production
  CI: "true"

install_dependencies:
  stage: install
  script:
    - ${installCmd}
  artifacts:
    paths:
      - node_modules/
    expire_in: 1 hour
${langInfo.hasLinter ? `
lint_code:
  stage: lint
  script:
    - ${pm} run lint
  allow_failure: true
` : ''}${langInfo.hasTests ? `
test_application:
  stage: test
  script:
    - ${pm} run test
  allow_failure: true
` : ''}
build_application:
  stage: build
  script:
    - ${pm} run build
  artifacts:
    paths:
      - dist/
      - build/
      - .next/
    expire_in: 30 days`;
}

function getPythonFallbackPipeline(langInfo: LanguageDetectionResult): string {
  return `stages:
  - install
${langInfo.hasLinter ? '  - lint\n' : ''}${langInfo.hasTests ? '  - test\n' : ''}  - build

variables:
  PYTHONUNBUFFERED: "1"
  PIP_CACHE_DIR: "\${CI_PROJECT_DIR}/.pip"

install_dependencies:
  stage: install
  script:
    - python3 -m venv venv
    - source venv/bin/activate
    - pip install --upgrade pip
    - pip install -r requirements.txt
  artifacts:
    paths:
      - venv/
    expire_in: 1 hour
${langInfo.hasLinter ? `
lint_code:
  stage: lint
  script:
    - source venv/bin/activate
    - pip install flake8
    - flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
  allow_failure: true
` : ''}${langInfo.hasTests ? `
test_application:
  stage: test
  script:
    - source venv/bin/activate
    - pip install pytest
    - pytest tests/
  allow_failure: true
` : ''}
build_application:
  stage: build
  script:
    - source venv/bin/activate
    - echo "Python application ready"
  artifacts:
    paths:
      - venv/
    expire_in: 30 days`;
}

function getRustFallbackPipeline(): string {
  return `stages:
  - build
  - test

build_application:
  stage: build
  script:
    - cargo build --release
  artifacts:
    paths:
      - target/release/
    expire_in: 30 days

test_application:
  stage: test
  script:
    - cargo test
  allow_failure: true`;
}

function getGoFallbackPipeline(): string {
  return `stages:
  - build
  - test

build_application:
  stage: build
  script:
    - go build -o app
  artifacts:
    paths:
      - app
    expire_in: 30 days

test_application:
  stage: test
  script:
    - go test ./...
  allow_failure: true`;
}

function getJavaFallbackPipeline(langInfo: LanguageDetectionResult): string {
  const isMaven = langInfo.buildTool === 'maven';

  return `stages:
  - build
  - test

build_application:
  stage: build
  script:
    - ${isMaven ? 'mvn clean package -DskipTests' : 'gradle build -x test'}
  artifacts:
    paths:
      - ${isMaven ? 'target/*.jar' : 'build/libs/*.jar'}
    expire_in: 30 days

test_application:
  stage: test
  script:
    - ${isMaven ? 'mvn test' : 'gradle test'}
  allow_failure: true`;
}

function getRubyFallbackPipeline(): string {
  return `stages:
  - install
  - test
  - build

install_dependencies:
  stage: install
  script:
    - bundle install
  artifacts:
    paths:
      - vendor/bundle/
    expire_in: 1 hour

test_application:
  stage: test
  script:
    - bundle exec rspec
  allow_failure: true

build_application:
  stage: build
  script:
    - echo "Ruby application ready"`;
}

function getPHPFallbackPipeline(): string {
  return `stages:
  - install
  - test
  - build

install_dependencies:
  stage: install
  script:
    - composer install --no-dev --optimize-autoloader
  artifacts:
    paths:
      - vendor/
    expire_in: 1 hour

test_application:
  stage: test
  script:
    - ./vendor/bin/phpunit
  allow_failure: true

build_application:
  stage: build
  script:
    - echo "PHP application ready"`;
}

function getDockerFallbackPipeline(): string {
  return `stages:
  - build

build_docker_image:
  stage: build
  script:
    - docker build -t app:latest .
  artifacts:
    paths:
      - Dockerfile
    expire_in: 30 days`;
}

function getGenericFallbackPipeline(): string {
  return `stages:
  - build

build_application:
  stage: build
  script:
    - echo "Building application..."
    - echo "Please customize this pipeline for your project"`;
}

// Nova AI Pipeline Generator Service

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

export interface RepositoryContext {
  name: string;
  description: string;
  language: string;
  type: string;
  framework?: string;
  files: string[];
  packageJson?: string;
  readme?: string;
}

export class PipelineGenerator {
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
   * Generate CI/CD pipeline YAML using Nova AI
   */
  async generatePipeline(context: RepositoryContext): Promise<string> {
    console.log('[PIPELINE-GEN] Generating pipeline for:', context.name);
    console.log('[PIPELINE-GEN] Framework:', context.framework);
    console.log('[PIPELINE-GEN] Type:', context.type);

    const prompt = this.buildPrompt(context);

    try {
      console.log('[PIPELINE-GEN] Invoking Nova AI...');
      const response = await this.invokeNova(prompt);
      const yaml = this.extractYAML(response);

      // Validate the YAML doesn't have duplicate keys
      if (this.hasDuplicateKeys(yaml)) {
        console.warn('[PIPELINE-GEN] Generated YAML still has duplicates, using fallback');
        return this.getFallbackPipeline(context);
      }

      console.log('[PIPELINE-GEN] ✓ Pipeline generated successfully');
      return yaml;
    } catch (error: any) {
      console.error('[PIPELINE-GEN] Error generating pipeline:', error.message);
      return this.getFallbackPipeline(context);
    }
  }

  /**
   * Check if YAML has duplicate top-level keys
   */
  private hasDuplicateKeys(yaml: string): boolean {
    const lines = yaml.split('\n');
    const topLevelKeys = new Set<string>();

    for (const line of lines) {
      if (line.search(/\S/) === 0 && line.includes(':')) {
        const key = line.split(':')[0].trim();
        if (topLevelKeys.has(key)) {
          console.log('[PIPELINE-GEN] Found duplicate key:', key);
          return true;
        }
        topLevelKeys.add(key);
      }
    }

    return false;
  }

  /**
   * Build prompt for Nova AI
   */
  private buildPrompt(context: RepositoryContext): string {
    // Extract package.json scripts if available
    let scripts = '';
    let actualScripts: Record<string, string> = {};
    if (context.packageJson) {
      try {
        const pkg = JSON.parse(context.packageJson);
        if (pkg.scripts) {
          actualScripts = pkg.scripts;
          scripts = Object.keys(pkg.scripts).map(key => `  ${key}: ${pkg.scripts[key]}`).join('\n');
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    return `You are a CI/CD expert. Generate a valid GitLab CI/CD pipeline YAML configuration.

PROJECT INFO:
- Name: ${context.name}
- Language: ${context.language}
- Framework: ${context.framework || 'N/A'}

${scripts ? `ACTUAL PACKAGE.JSON SCRIPTS:
${scripts}
` : 'No package.json scripts available'}

CRITICAL INSTRUCTIONS FOR USING ACTUAL SCRIPTS:
1. **ALWAYS check if a script exists in package.json FIRST**
2. **IF script exists, use "npm run <script-name>"** (e.g., if "build" exists, use "npm run build")
3. **IF script does NOT exist, skip that stage** (e.g., no "lint" script = no lint stage)
4. **DO NOT assume or add commands that aren't in package.json**

CRITICAL YAML RULES:
1. NO DUPLICATE KEYS - Each job name must be unique
2. Valid YAML syntax only
3. Use proper indentation (2 spaces)
4. All job names must follow pattern: jobname_action (e.g., install_dependencies, build_app, test_unit)

REQUIRED STRUCTURE (adjust stages based on actual scripts):
stages:
  - install
${actualScripts.lint ? '  - lint\n' : ''}${actualScripts.test ? '  - test\n' : ''}${actualScripts.build ? '  - build\n' : ''}
install_dependencies:
  stage: install
  image: node:18-alpine
  script:
    - npm install --legacy-peer-deps

${actualScripts.lint ? `lint_code:
  stage: lint
  image: node:18-alpine
  script:
    - npm run lint
  allow_failure: true
` : ''}
${actualScripts.test ? `test_unit:
  stage: test
  image: node:18-alpine
  script:
    - npm run test
  allow_failure: true
` : ''}
${actualScripts.build ? `build_app:
  stage: build
  image: node:18-alpine
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
      - build/
      - .next/
    expire_in: 30 days
` : ''}
OUTPUT REQUIREMENTS:
- Output ONLY valid YAML, no explanations
- Start with "stages:"
- NO duplicate job names
- Use job names ending with purpose: install_dependencies, build_app, test_unit, lint_code
- ONLY include stages that have actual scripts in package.json
- Keep it simple and production-ready`;
  }

  /**
   * Invoke Nova AI model using Converse API
   */
  private async invokeNova(prompt: string): Promise<string> {
    const command = new ConverseCommand({
      modelId: 'us.amazon.nova-pro-v1:0', // Changed to Pro for better structured output
      messages: [
        {
          role: 'user',
          content: [
            {
              text: prompt
            }
          ]
        }
      ],
      inferenceConfig: {
        maxTokens: 2500,
        temperature: 0.1, // Lower temperature for deterministic YAML
        topP: 0.9,
      }
    });

    const response = await this.client.send(command);

    // Extract text from Converse API response
    const text = response.output?.message?.content?.[0]?.text || '';
    return text;
  }

  /**
   * Extract and validate YAML from AI response
   */
  private extractYAML(response: string): string {
    console.log('[PIPELINE-GEN] Raw AI response:', response.substring(0, 500));

    // Remove code blocks if present
    let yaml = response.replace(/```yaml\n?/g, '').replace(/```\n?/g, '');

    // Ensure it starts with stages
    if (!yaml.trim().startsWith('stages:')) {
      const stagesIndex = yaml.indexOf('stages:');
      if (stagesIndex > -1) {
        yaml = yaml.substring(stagesIndex);
      }
    }

    // Remove duplicate keys
    yaml = this.removeDuplicateKeys(yaml);

    // Validate YAML structure
    yaml = this.validateAndFixYAML(yaml);

    console.log('[PIPELINE-GEN] Final YAML:', yaml.substring(0, 500));
    return yaml.trim();
  }

  /**
   * Remove duplicate keys from YAML
   */
  private removeDuplicateKeys(yaml: string): string {
    const lines = yaml.split('\n');
    const seenKeys = new Set<string>();
    const result: string[] = [];
    let currentIndent = 0;
    let skipUntilIndent = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const indent = line.search(/\S/);

      // If we're skipping a duplicate section
      if (skipUntilIndent >= 0) {
        if (indent <= skipUntilIndent) {
          skipUntilIndent = -1; // Stop skipping
        } else {
          continue; // Skip this line
        }
      }

      // Check for top-level keys (job names and sections)
      if (indent === 0 && line.includes(':')) {
        const key = line.split(':')[0].trim();

        if (seenKeys.has(key)) {
          console.log(`[PIPELINE-GEN] Removing duplicate key: ${key}`);
          skipUntilIndent = indent;
          continue;
        }

        seenKeys.add(key);
      }

      result.push(line);
    }

    return result.join('\n');
  }

  /**
   * Validate and fix common YAML issues
   */
  private validateAndFixYAML(yaml: string): string {
    // Ensure required sections exist
    if (!yaml.includes('stages:')) {
      yaml = 'stages:\n  - install\n  - build\n\n' + yaml;
    }

    // Fix common indentation issues
    yaml = yaml.replace(/^([a-z_]+):/gm, '$1:'); // Ensure no leading spaces for job names

    return yaml;
  }

  /**
   * Get fallback pipeline based on project type
   */
  private getFallbackPipeline(context: RepositoryContext): string {
    switch (context.type) {
      case 'nodejs':
        return this.getNodeJSPipeline(context);
      case 'python':
        return this.getPythonPipeline(context);
      case 'docker':
        return this.getDockerPipeline(context);
      default:
        return this.getGenericPipeline(context);
    }
  }

  /**
   * Generate Node.js pipeline based on actual package.json
   */
  private getNodeJSPipeline(context: RepositoryContext): string {
    let hasLint = false;
    let hasTest = false;
    let buildCommand = 'npm run build';

    // Parse package.json to get actual scripts
    if (context.packageJson) {
      try {
        const pkg = JSON.parse(context.packageJson);
        hasLint = !!pkg.scripts?.lint;
        hasTest = !!pkg.scripts?.test;
        buildCommand = pkg.scripts?.build ? 'npm run build' : 'echo "No build script found"';
      } catch (e) {
        console.log('[PIPELINE-GEN] Could not parse package.json');
      }
    }

    let pipeline = `stages:
  - install
${hasLint ? '  - lint\n' : ''}${hasTest ? '  - test\n' : ''}  - build

variables:
  NODE_ENV: production

cache:
  key: \${CI_COMMIT_REF_SLUG}
  paths:
    - node_modules/

install_dependencies:
  stage: install
  image: node:18-alpine
  script:
    - npm install --legacy-peer-deps
  artifacts:
    paths:
      - node_modules/
    expire_in: 1 hour

`;

    if (hasLint) {
      pipeline += `lint_code:
  stage: lint
  image: node:18-alpine
  script:
    - npm run lint
  allow_failure: true

`;
    }

    if (hasTest) {
      pipeline += `test_unit:
  stage: test
  image: node:18-alpine
  script:
    - npm run test
  allow_failure: true

`;
    }

    pipeline += `build_app:
  stage: build
  image: node:18-alpine
  script:
    - ${buildCommand}
  artifacts:
    paths:
      - dist/
      - build/
      - .next/
    expire_in: 30 days
`;

    return pipeline;
  }

  /**
   * Generate Python pipeline
   */
  private getPythonPipeline(context: RepositoryContext): string {
    return `stages:
  - setup
  - lint
  - test
  - build
  - deploy

variables:
  PIP_CACHE_DIR: "$CI_PROJECT_DIR/.pip"

cache:
  key: \${CI_COMMIT_REF_SLUG}
  paths:
    - .pip/
    - venv/

setup_environment:
  stage: setup
  image: python:3.11-slim
  script:
    - python -m venv venv
    - source venv/bin/activate
    - pip install --upgrade pip
    - pip install -r requirements.txt
  artifacts:
    paths:
      - venv/
    expire_in: 1 hour

lint_code:
  stage: lint
  image: python:3.11-slim
  script:
    - source venv/bin/activate
    - pip install flake8 pylint
    - flake8 .
    - pylint src/ --exit-zero
  dependencies:
    - setup_environment

test_unit:
  stage: test
  image: python:3.11-slim
  script:
    - source venv/bin/activate
    - pip install pytest pytest-cov
    - pytest tests/ --cov=src --cov-report=term --cov-report=html
  artifacts:
    paths:
      - htmlcov/
    expire_in: 7 days
  dependencies:
    - setup_environment

build_package:
  stage: build
  image: python:3.11-slim
  script:
    - source venv/bin/activate
    - python setup.py sdist bdist_wheel
  artifacts:
    paths:
      - dist/
    expire_in: 30 days
  dependencies:
    - setup_environment

deploy_staging:
  stage: deploy
  image: python:3.11-slim
  script:
    - echo "Deploying to staging..."
    - source venv/bin/activate
    - python deploy.py --env staging
  environment:
    name: staging
  dependencies:
    - build_package
  only:
    - develop

deploy_production:
  stage: deploy
  image: python:3.11-slim
  script:
    - echo "Deploying to production..."
    - source venv/bin/activate
    - python deploy.py --env production
  environment:
    name: production
  dependencies:
    - build_package
  only:
    - main
  when: manual
`;
  }

  /**
   * Generate Docker pipeline
   */
  private getDockerPipeline(context: RepositoryContext): string {
    return `stages:
  - build
  - test
  - push
  - deploy

variables:
  DOCKER_DRIVER: overlay2
  IMAGE_TAG: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHORT_SHA

build_image:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t $IMAGE_TAG .
    - docker save $IMAGE_TAG -o image.tar
  artifacts:
    paths:
      - image.tar
    expire_in: 1 hour

test_image:
  stage: test
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker load -i image.tar
    - docker run --rm $IMAGE_TAG npm test
  dependencies:
    - build_image

push_registry:
  stage: push
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker load -i image.tar
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker push $IMAGE_TAG
  dependencies:
    - build_image
  only:
    - main
    - develop

deploy_production:
  stage: deploy
  image: bitnami/kubectl:latest
  script:
    - kubectl set image deployment/${context.name} app=$IMAGE_TAG
    - kubectl rollout status deployment/${context.name}
  environment:
    name: production
  dependencies:
    - push_registry
  only:
    - main
  when: manual
`;
  }

  /**
   * Generate generic pipeline
   */
  private getGenericPipeline(context: RepositoryContext): string {
    return `stages:
  - build
  - test
  - deploy

build_job:
  stage: build
  script:
    - echo "Building ${context.name}..."
    - echo "Add your build commands here"
  artifacts:
    paths:
      - dist/
    expire_in: 30 days

test_job:
  stage: test
  script:
    - echo "Running tests..."
    - echo "Add your test commands here"

deploy_job:
  stage: deploy
  script:
    - echo "Deploying..."
    - echo "Add your deployment commands here"
  only:
    - main
  when: manual
`;
  }
}

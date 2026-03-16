/**
 * Generate AI Pipeline Preview
 * Analyzes repository and generates YAML pipeline WITHOUT deploying
 * NOW SUPPORTS: Rust, Go, Python, Node.js, Java, Ruby, PHP, .NET, Solana
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchUniversalProjectFilesFromGitHub } from '@/lib/github-universal-fetcher';
import { analyzeUniversalProject } from '@/lib/universal-language-analyzer';
import { generateUniversalPipelineStages } from '@/lib/universal-deployment-executor';
import { generateArtifactPackageCommands, generateArtifactDeployCommands, ArtifactConfig } from '@/lib/artifact-builder';

/**
 * POST /api/pipelines/generate-preview
 * Generate YAML pipeline preview for ANY language repository
 */
export async function POST(request: NextRequest) {
  try {
    const { repoUrl, repoFullName, githubToken } = await request.json();

    if (!repoUrl || !repoFullName) {
      return NextResponse.json(
        { error: 'Repository URL and name are required' },
        { status: 400 }
      );
    }

    console.log('[PIPELINE-PREVIEW] Analyzing repository:', repoFullName);

    // Extract owner and repo
    const [owner, repo] = repoFullName.split('/');

    // Fetch project files (UNIVERSAL - supports all languages)
    console.log('[PIPELINE-PREVIEW] Fetching project files...');
    const projectFiles = await fetchUniversalProjectFilesFromGitHub(owner, repo, githubToken);

    console.log('[ANALYZER] Fetched files:', Object.keys(projectFiles).filter(k =>
      projectFiles[k as keyof typeof projectFiles] && k !== 'detectedLanguages'
    ));

    // Analyze project using Nova AI (UNIVERSAL)
    console.log('[PIPELINE-PREVIEW] Detecting language and framework...');
    const analysis = await analyzeUniversalProject(projectFiles);

    console.log('[PIPELINE-PREVIEW] Language:', analysis.language);
    console.log('[PIPELINE-PREVIEW] Framework:', analysis.framework);

    // Generate pipeline stages (synced with actual deployment)
    const stages = generateUniversalPipelineStages(analysis);

    // Generate YAML pipeline
    console.log('[PIPELINE-PREVIEW] Generating AI pipeline...');
    let yamlContent = '';
    try {
      yamlContent = generateUniversalPipelineYAML(analysis, stages);
      console.log('[PIPELINE-PREVIEW] ✓ YAML generated successfully');
    } catch (yamlError: any) {
      console.error('[PIPELINE-PREVIEW] YAML generation error:', yamlError);
      throw new Error('Failed to generate pipeline YAML: ' + yamlError.message);
    }

    console.log('[PIPELINE-PREVIEW] ✓ Pipeline generated successfully');
    console.log('[PIPELINE-PREVIEW] Stages:', stages.join(', '));
    console.log('[PIPELINE-PREVIEW] YAML length:', yamlContent.length);
    console.log('[PIPELINE-PREVIEW] YAML type:', typeof yamlContent);
    console.log('[PIPELINE-PREVIEW] YAML first 500 chars:', yamlContent.substring(0, 500));
    console.log('[PIPELINE-PREVIEW] Analysis:', {
      language: analysis.language,
      framework: analysis.framework,
      buildTool: analysis.buildTool,
      packageManager: analysis.packageManager,
    });

    // Ensure stages are all strings
    const safeStages = stages.map(s => String(s));
    console.log('[PIPELINE-PREVIEW] Safe stages:', safeStages);

    return NextResponse.json({
      success: true,
      pipeline: {
        yaml: String(yamlContent), // Explicitly convert to string
        stages: safeStages, // Safe string array
        language: String(analysis.language || 'Unknown'),
        framework: String(analysis.framework || 'Unknown'),
      },
      detection: {
        language: String(analysis.language || 'Unknown'),
        framework: String(analysis.framework || 'Unknown'),
        projectType: String(analysis.projectType || 'unknown'),
        packageManager: String(analysis.packageManager || 'unknown'),
        buildTool: String(analysis.buildTool || 'unknown'),
        hasTests: Boolean(analysis.hasTests),
        hasLinter: Boolean(analysis.hasLinter),
        detectedFiles: Array.isArray(projectFiles.detectedLanguages) ? projectFiles.detectedLanguages : [],
        installCommand: String(analysis.installCommand || ''),
        buildCommand: String(analysis.buildCommand || ''),
        testCommand: String(analysis.testCommand || ''),
        startCommand: String(analysis.startCommand || ''),
        port: String(analysis.port || '3000'), // AI-detected port
        isSolanaProject: Boolean(analysis.isSolanaProject),
      },
    });
  } catch (error: any) {
    console.error('[PIPELINE-PREVIEW] Error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate pipeline preview',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}

/**
 * Generate universal pipeline YAML (synced with actual deployment)
 */
function generateUniversalPipelineYAML(analysis: any, stages: string[]): string {
  // Ensure all analysis properties are strings
  const safeAnalysis = {
    language: String(analysis.language || 'Unknown'),
    framework: String(analysis.framework || 'Unknown'),
    buildTool: String(analysis.buildTool || 'unknown'),
    packageManager: String(analysis.packageManager || 'unknown'),
    buildCommand: String(analysis.buildCommand || 'NONE'),
    installCommand: String(analysis.installCommand || 'echo "No install command"'),
    testCommand: String(analysis.testCommand || 'NONE'),
    startCommand: String(analysis.startCommand || 'echo "No start command"'),
    outputDir: String(analysis.outputDir || 'NONE'),
    port: String(analysis.port || '8000'),
    projectType: String(analysis.projectType || 'backend'),
    estimatedBuildTime: String(analysis.estimatedBuildTime || 'Unknown'),
    needsRuntime: Boolean(analysis.needsRuntime),
    runtimeVersion: String(analysis.runtimeVersion || ''),
    hasTests: Boolean(analysis.hasTests),
  };

  // Override port to 80 for backend deployments (standard HTTP port)
  const deploymentPort = safeAnalysis.projectType === 'backend' || safeAnalysis.projectType === 'fullstack' ? '80' : safeAnalysis.port;

  // Update start command to use deployment port instead of detected port
  let finalStartCommand = safeAnalysis.startCommand;
  if (deploymentPort !== safeAnalysis.port && finalStartCommand.includes(`--port ${safeAnalysis.port}`)) {
    finalStartCommand = finalStartCommand.replace(`--port ${safeAnalysis.port}`, `--port ${deploymentPort}`);
  } else if (deploymentPort !== safeAnalysis.port && finalStartCommand.includes(`:${safeAnalysis.port}`)) {
    finalStartCommand = finalStartCommand.replace(`:${safeAnalysis.port}`, `:${deploymentPort}`);
  }

  // Build runtime installation commands (without indentation - will be added during YAML construction)
  const runtimeCommands: string[] = [
    `echo "Installing ${safeAnalysis.language} runtime and dependencies..."`,
  ];

  if (safeAnalysis.needsRuntime) {
    runtimeCommands.push(`echo "Runtime: ${safeAnalysis.runtimeVersion || 'default'}"`);
  } else {
    runtimeCommands.push(`echo "Compiled language - no runtime needed"`);
  }

  // Language-specific runtime installation
  if (safeAnalysis.language === 'Rust') {
    // CRITICAL: Install gcc/build tools FIRST (rustup needs them)
    runtimeCommands.push(`sudo yum install -y gcc gcc-c++ make pkg-config openssl-devel`);
    runtimeCommands.push(`export HOME=/home/ec2-user`);
    runtimeCommands.push(`curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y`);
    // CRITICAL: Use absolute path instead of $HOME (SSM doesn't set $HOME by default)
    runtimeCommands.push(`source /home/ec2-user/.cargo/env`);
  } else if (safeAnalysis.language === 'Go') {
    runtimeCommands.push(`sudo yum install -y golang`);
  } else if (safeAnalysis.language === 'Python') {
    runtimeCommands.push(`sudo yum install -y python3 python3-pip`);
  } else if (safeAnalysis.language === 'Java') {
    runtimeCommands.push(`sudo yum install -y java-17-amazon-corretto-devel maven`);
  }

  // Build artifacts paths
  const artifactPaths: string[] = [];
  if (safeAnalysis.language === 'Node.js/JavaScript/TypeScript') {
    artifactPaths.push('      - node_modules/');
  } else if (safeAnalysis.language === 'Rust') {
    artifactPaths.push('      - target/');
  } else if (safeAnalysis.language === 'Python') {
    artifactPaths.push('      - venv/');
  }

  // Build stage commands (without indentation)
  const buildCommands: string[] = [];
  const isBuildNeeded = safeAnalysis.buildCommand !== 'NONE' &&
                        !safeAnalysis.buildCommand.toLowerCase().startsWith('echo "no');
  if (isBuildNeeded) {
    buildCommands.push('echo "Building project..."');
    buildCommands.push('cd /home/ec2-user/app');

    // Activate virtual environment for Python builds
    if (safeAnalysis.language === 'Python') {
      buildCommands.push('source venv/bin/activate');
    }

    // Source cargo environment for Rust builds
    if (safeAnalysis.language === 'Rust') {
      buildCommands.push('export HOME=/home/ec2-user');
      buildCommands.push('source /home/ec2-user/.cargo/env');
    }

    buildCommands.push(safeAnalysis.buildCommand);
    buildCommands.push(`echo "Build completed - estimated time: ${safeAnalysis.estimatedBuildTime}"`);
  }

  // Test stage commands (without indentation)
  const testCommands: string[] = [];
  const isTestNeeded = safeAnalysis.hasTests &&
                       safeAnalysis.testCommand !== 'NONE' &&
                       !safeAnalysis.testCommand.toLowerCase().startsWith('echo "no');
  if (isTestNeeded) {
    testCommands.push('echo "Running tests..."');
    testCommands.push('cd /home/ec2-user/app');

    // Activate virtual environment for Python tests
    if (safeAnalysis.language === 'Python') {
      testCommands.push('source venv/bin/activate');
    }

    // Source cargo environment for Rust tests
    if (safeAnalysis.language === 'Rust') {
      testCommands.push('export HOME=/home/ec2-user');
      testCommands.push('source /home/ec2-user/.cargo/env');
    }

    testCommands.push(safeAnalysis.testCommand);
  }

  // Start commands
  const startCommands: string[] = [
    `    - echo "Starting application..."`,
    `    - cd /home/ec2-user/app`,
  ];

  if (safeAnalysis.projectType === 'frontend' && finalStartCommand === 'STATIC_SERVER') {
    startCommands.push(`    - echo "Serving static files from ${safeAnalysis.outputDir}/"`);
    startCommands.push(`    - sudo cp -r ${safeAnalysis.outputDir}/* /usr/share/nginx/html/`);
    startCommands.push(`    - sudo systemctl start nginx`);
  } else {
    // Run application in background with nohup to prevent blocking
    startCommands.push(`    - echo "Starting application in background..."`);
    startCommands.push(`    - echo "Port: ${deploymentPort}"`);

    // For Python with virtual environment and port 80, use full venv path with sudo
    let finalCommand = finalStartCommand;
    if (safeAnalysis.language === 'Python' && deploymentPort === '80') {
      startCommands.push(`    - source venv/bin/activate`);
      // Replace uvicorn with full venv path for sudo execution
      if (finalCommand.includes('uvicorn')) {
        finalCommand = finalCommand.replace('uvicorn', 'venv/bin/uvicorn');
      } else if (finalCommand.includes('python3')) {
        finalCommand = finalCommand.replace('python3', 'venv/bin/python3');
      }
      startCommands.push(`    - echo "Command: sudo ${finalCommand}"`);
      startCommands.push(`    - nohup sudo ${finalCommand} > /tmp/app.log 2>&1 &`);
    } else if (safeAnalysis.language === 'Python') {
      startCommands.push(`    - source venv/bin/activate`);
      startCommands.push(`    - echo "Command: ${finalCommand}"`);
      startCommands.push(`    - nohup ${finalCommand} > /tmp/app.log 2>&1 &`);
    } else {
      // Non-Python or port 80 without venv
      const sudoPrefix = deploymentPort === '80' ? 'sudo ' : '';
      startCommands.push(`    - echo "Command: ${sudoPrefix}${finalCommand}"`);
      startCommands.push(`    - nohup ${sudoPrefix}${finalCommand} > /tmp/app.log 2>&1 &`);
    }

    startCommands.push(`    - APP_PID=$!`);
    startCommands.push(`    - echo "Application started with PID: $APP_PID"`);
    startCommands.push(`    - echo "Logs available at: /tmp/app.log"`);
    startCommands.push(`    - sleep 5`);
    startCommands.push(`    - echo "Checking if application is running..."`);
    startCommands.push(`    - if kill -0 $APP_PID 2>/dev/null; then echo "✅ Application is running on port ${deploymentPort}"; else echo "❌ Application failed to start. Check logs at /tmp/app.log"; exit 1; fi`);
    startCommands.push(`    - tail -20 /tmp/app.log`);
  }

  // Build the artifacts section separately
  const artifactsSection = artifactPaths.length > 0
    ? `\n  artifacts:\n    paths:\n${artifactPaths.join('\n')}`
    : '';

  // Build stages section
  const stagesSection = stages.map(s => `  - ${s}`).join('\n');

  // Build install-dependencies commands (without indentation)
  const installDepsCommands: string[] = [
    `echo "Installing project dependencies..."`,
    `cd /home/ec2-user/app`,
  ];

  // Language-specific dependency installation with memory optimizations
  if (safeAnalysis.language === 'Python') {
    // Use virtual environment for Python (memory efficient, isolated)
    installDepsCommands.push(
      `echo "Creating Python virtual environment..."`,
      `python3 -m venv venv`,
      `source venv/bin/activate`,
      `echo "Upgrading pip in virtual environment..."`,
      `pip install --upgrade pip`,
      `echo "Installing dependencies in virtual environment..."`,
      safeAnalysis.installCommand,
      `echo "Virtual environment created at: $(pwd)/venv"`,
    );
  } else if (safeAnalysis.language === 'Node.js/JavaScript/TypeScript') {
    // Use npm ci for faster, memory-efficient installs
    const installCmd = safeAnalysis.installCommand.includes('npm install')
      ? safeAnalysis.installCommand.replace('npm install', 'npm ci --prefer-offline --no-audit')
      : safeAnalysis.installCommand;
    installDepsCommands.push(installCmd);
  } else if (safeAnalysis.language === 'Rust') {
    // Rust cargo handles dependencies efficiently
    installDepsCommands.push(`export HOME=/home/ec2-user`);
    installDepsCommands.push(`source /home/ec2-user/.cargo/env`);
    installDepsCommands.push(safeAnalysis.installCommand);
  } else if (safeAnalysis.language === 'Go') {
    // Go mod download with caching
    installDepsCommands.push(
      `export GOCACHE=/tmp/go-cache`,
      `export GOMODCACHE=/tmp/go-mod-cache`,
      safeAnalysis.installCommand,
    );
  } else {
    // Default: use the AI-generated command as-is
    installDepsCommands.push(safeAnalysis.installCommand);
  }

  // Helper function to format script commands
  const formatScriptCommands = (commands: string[]): string => {
    return commands.map(cmd => `    - ${cmd}`).join('\n');
  };

  // NEW: Package artifact stage - Creates deployment archive
  const artifactConfig: ArtifactConfig = {
    language: safeAnalysis.language,
    framework: safeAnalysis.framework,
    buildOutput: safeAnalysis.outputDir,
    includeNodeModules: safeAnalysis.language.includes('Node'),
    includeVenv: safeAnalysis.language.includes('Python'),
    additionalFiles: [],
  };

  const packageCommands = generateArtifactPackageCommands(artifactConfig);
  const deployCommands = generateArtifactDeployCommands(safeAnalysis.framework);

  // Build complete YAML with proper structure
  const yamlParts: string[] = [
    `# Auto-generated Pipeline for ${safeAnalysis.framework}`,
    `# Language: ${safeAnalysis.language}`,
    `# Build Tool: ${safeAnalysis.buildTool}`,
    ``,
    `stages:`,
    stagesSection,
    ``,
    `install-runtime:`,
    `  stage: install-runtime`,
    `  script:`,
    formatScriptCommands(runtimeCommands),
    ``,
    `install-dependencies:`,
    `  stage: install-dependencies`,
    `  script:`,
    formatScriptCommands(installDepsCommands),
  ];

  // Add artifacts section for install-dependencies if needed
  if (artifactPaths.length > 0) {
    yamlParts.push(`  artifacts:`);
    yamlParts.push(`    paths:`);
    artifactPaths.forEach(path => yamlParts.push(path));
  }

  // Add build stage if needed
  if (isBuildNeeded && buildCommands.length > 0) {
    const buildArtifactPath = safeAnalysis.outputDir !== 'NONE' ? `      - ${safeAnalysis.outputDir}/` : '      - .';
    yamlParts.push(
      ``,
      `build:`,
      `  stage: build`,
      `  script:`,
      formatScriptCommands(buildCommands),
      `  artifacts:`,
      `    paths:`,
      buildArtifactPath,
    );
  }

  // Add test stage if needed
  if (isTestNeeded && testCommands.length > 0) {
    yamlParts.push(
      ``,
      `test:`,
      `  stage: test`,
      `  script:`,
      formatScriptCommands(testCommands),
    );
  }

  // Add package-artifact stage
  yamlParts.push(
    ``,
    `package-artifact:`,
    `  stage: package-artifact`,
    `  script:`,
    formatScriptCommands(packageCommands),
    `  artifacts:`,
    `    paths:`,
    `      - /tmp/build-artifact.tar.gz`,
  );

  // Add deploy-artifact stage
  yamlParts.push(
    ``,
    `deploy-artifact:`,
    `  stage: deploy-artifact`,
    `  script:`,
    formatScriptCommands(deployCommands),
    `  variables:`,
    `    PORT: "${deploymentPort}"`,
    `    HOST: "0.0.0.0"`,
  );

  const yaml = yamlParts.join('\n');

  // Validate the YAML is a string
  if (typeof yaml !== 'string') {
    throw new Error('YAML generation failed: result is not a string');
  }

  // Debug: Log generated YAML for validation
  console.log('[YAML-GENERATOR] ===== GENERATED YAML =====');
  console.log(yaml);
  console.log('[YAML-GENERATOR] ===== END YAML =====');

  return yaml;
}

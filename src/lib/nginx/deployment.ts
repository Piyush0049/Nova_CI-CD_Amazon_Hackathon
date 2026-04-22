/**
 * Universal Nginx Deployment Integration
 * Integrates Nginx setup into the deployment pipeline
 */

import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import {
  detectProjectDeploymentType,
  generateNginxConfig,
  generatePM2Commands,
  ProjectDetectionResult,
} from './config-generator';
import { extractPortFromSource } from '../universal-language-analyzer';

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

interface RepositoryFiles {
  packageJson?: string;
  cargoToml?: string;
  requirementsTxt?: string;
  goMod?: string;
  viteConfig?: string;
  nextConfig?: string;
  webpackConfig?: string;
}

/**
 * Execute SSM command and wait for completion
 */
async function executeSSMCommand(
  instanceId: string,
  commands: string[],
  timeout: number = 300
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    console.log(`[NGINX-DEPLOY] Sending ${commands.length} commands to instance ${instanceId}`);

    const command = new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: {
        commands: commands,
      },
      TimeoutSeconds: timeout,
    });

    const response = await ssmClient.send(command);
    const commandId = response.Command?.CommandId;

    if (!commandId) {
      throw new Error('No command ID received from SSM');
    }

    // Wait for command completion
    let attempts = 0;
    const maxAttempts = Math.ceil(timeout / 5);

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const invocationCommand = new GetCommandInvocationCommand({
        CommandId: commandId,
        InstanceId: instanceId,
      });

      const invocation = await ssmClient.send(invocationCommand);
      const status = invocation.Status;

      if (status === 'Success') {
        console.log('[NGINX-DEPLOY] ✅ Command completed successfully');
        return {
          success: true,
          output: invocation.StandardOutputContent || '',
        };
      }

      if (status === 'Failed' || status === 'Cancelled' || status === 'TimedOut') {
        console.error('[NGINX-DEPLOY] ❌ Command failed:', status);
        return {
          success: false,
          output: invocation.StandardOutputContent || '',
          error: invocation.StandardErrorContent || `Command ${status}`,
        };
      }

      // Still running
      attempts++;
    }

    throw new Error('Command timed out');
  } catch (error: any) {
    console.error('[NGINX-DEPLOY] Error executing SSM command:', error);
    return {
      success: false,
      output: '',
      error: error.message,
    };
  }
}

/**
 * Detect project type by fetching files from EC2 instance
 */
export async function detectProjectTypeFromInstance(
  instanceId: string
): Promise<ProjectDetectionResult> {
  console.log('[NGINX-DEPLOY] Detecting project type...');

  // Fetch relevant files from the instance
  const fetchCommands = [
    'cd /home/ec2-user/app',
    '',
    '# Fetch package.json if exists',
    'if [ -f package.json ]; then',
    '  echo "===PACKAGE_JSON_START==="',
    '  cat package.json',
    '  echo "===PACKAGE_JSON_END==="',
    'fi',
    '',
    '# Fetch Cargo.toml if exists',
    'if [ -f Cargo.toml ]; then',
    '  echo "===CARGO_TOML_START==="',
    '  cat Cargo.toml',
    '  echo "===CARGO_TOML_END==="',
    'fi',
    '',
    '# Fetch requirements.txt if exists',
    'if [ -f requirements.txt ]; then',
    '  echo "===REQUIREMENTS_TXT_START==="',
    '  cat requirements.txt',
    '  echo "===REQUIREMENTS_TXT_END==="',
    'fi',
    '',
    '# Fetch go.mod if exists',
    'if [ -f go.mod ]; then',
    '  echo "===GO_MOD_START==="',
    '  cat go.mod',
    '  echo "===GO_MOD_END==="',
    'fi',
    '',
    '# Check for config files',
    'echo "===CONFIG_FILES_START==="',
    'test -f vite.config.js && echo "HAS_VITE_CONFIG=true"',
    'test -f vite.config.ts && echo "HAS_VITE_CONFIG=true"',
    'test -f next.config.js && echo "HAS_NEXT_CONFIG=true"',
    'test -f next.config.mjs && echo "HAS_NEXT_CONFIG=true"',
    'test -f webpack.config.js && echo "HAS_WEBPACK_CONFIG=true"',
    'echo "===CONFIG_FILES_END==="',
    '',
    '# Fetch entry point files for port detection',
    'echo "===ENTRY_FILES_START==="',
    'for f in index.js server.js app.js index.ts server.ts app.ts src/main.rs src/lib.rs main.go main.py app.py; do',
    '  if [ -f "$f" ]; then',
    '    echo "FILE:$f"',
    '    head -n 200 "$f" | base64',
    '    echo "END_FILE"',
    '  fi',
    'done',
    'echo "===ENTRY_FILES_END==="',
  ];

  const result = await executeSSMCommand(instanceId, fetchCommands, 60);

  if (!result.success) {
    console.error('[NGINX-DEPLOY] Failed to fetch project files');
    throw new Error('Failed to detect project type');
  }

  // Parse the output
  const output = result.output;
  const repoFiles: RepositoryFiles = {};

  // Extract package.json
  const packageJsonMatch = output.match(/===PACKAGE_JSON_START===\n([\s\S]*?)\n===PACKAGE_JSON_END===/);
  if (packageJsonMatch) {
    repoFiles.packageJson = packageJsonMatch[1];
  }

  // Extract Cargo.toml
  const cargoTomlMatch = output.match(/===CARGO_TOML_START===\n([\s\S]*?)\n===CARGO_TOML_END===/);
  if (cargoTomlMatch) {
    repoFiles.cargoToml = cargoTomlMatch[1];
  }

  // Extract requirements.txt
  const requirementsTxtMatch = output.match(/===REQUIREMENTS_TXT_START===\n([\s\S]*?)\n===REQUIREMENTS_TXT_END===/);
  if (requirementsTxtMatch) {
    repoFiles.requirementsTxt = requirementsTxtMatch[1];
  }

  // Extract go.mod
  const goModMatch = output.match(/===GO_MOD_START===\n([\s\S]*?)\n===GO_MOD_END===/);
  if (goModMatch) {
    repoFiles.goMod = goModMatch[1];
  }

  // Check config files
  const hasViteConfig = output.includes('HAS_VITE_CONFIG=true');
  const hasNextConfig = output.includes('HAS_NEXT_CONFIG=true');
  const hasWebpackConfig = output.includes('HAS_WEBPACK_CONFIG=true');

  // Extract entry files and detect port
  let detectedPort: number | undefined;
  const entryFilesMatch = output.match(/===ENTRY_FILES_START===\n([\s\S]*?)\n===ENTRY_FILES_END===/);
  if (entryFilesMatch) {
    const entryFilesContent = entryFilesMatch[1];
    const fileBlocks = entryFilesContent.split('END_FILE');

    for (const block of fileBlocks) {
      const fileMatch = block.match(/FILE:(.*)\n([\s\S]*)/);
      if (fileMatch) {
        const fileName = fileMatch[1].trim();
        const base64Content = fileMatch[2].trim();

        try {
          const content = Buffer.from(base64Content, 'base64').toString('utf-8');
          let language = 'Node.js';
          if (fileName.endsWith('.rs')) language = 'Rust';
          else if (fileName.endsWith('.go')) language = 'Go';
          else if (fileName.endsWith('.py')) language = 'Python';

          const portStr = extractPortFromSource(content, language);
          if (portStr) {
            detectedPort = parseInt(portStr, 10);
            console.log(`[NGINX-DEPLOY] 🔍 Detected port ${detectedPort} from ${fileName}`);
            break; // Found a port, stop searching
          }
        } catch (e) {
          console.error(`[NGINX-DEPLOY] Error decoding file ${fileName}:`, e);
        }
      }
    }
  }

  // Detect project deployment type
  const detection = detectProjectDeploymentType(
    repoFiles.packageJson,
    repoFiles.cargoToml,
    repoFiles.requirementsTxt,
    repoFiles.goMod,
    hasViteConfig,
    hasNextConfig,
    hasWebpackConfig,
    detectedPort
  );

  return detection;
}

/**
 * Setup Nginx on EC2 instance based on project type
 */
export async function setupNginx(
  instanceId: string,
  detection: ProjectDetectionResult
): Promise<{ success: boolean; output: string; error?: string }> {
  console.log('[NGINX-DEPLOY] Setting up Nginx...');
  console.log('[NGINX-DEPLOY] Project type:', detection.type);
  console.log('[NGINX-DEPLOY] Framework:', detection.framework);

  // Generate Nginx configuration
  const nginxConfig = generateNginxConfig(detection);

  console.log('[NGINX-DEPLOY] Generated Nginx config type:', nginxConfig.type);

  // Execute setup commands
  const result = await executeSSMCommand(
    instanceId,
    nginxConfig.setupCommands,
    300 // 5 minutes timeout for Nginx setup
  );

  if (!result.success) {
    console.error('[NGINX-DEPLOY] Nginx setup failed');
    return result;
  }

  // Verify Nginx is actually serving the app
  console.log('[NGINX-DEPLOY] Verifying Nginx is serving the application...');
  const verifyCommands = [
    '# Verify Nginx is running and serving the app',
    'echo "[NGINX-VERIFY] Checking Nginx status..."',
    'sudo systemctl status nginx | head -10',
    '',
    'echo "[NGINX-VERIFY] Checking Nginx config..."',
    'cat /etc/nginx/conf.d/app.conf',
    '',
    'echo "[NGINX-VERIFY] Testing Nginx config syntax..."',
    'sudo nginx -t',
    '',
    'echo "[NGINX-VERIFY] Checking what is listening on port 80..."',
    'sudo netstat -tulpn | grep :80 || sudo ss -tulpn | grep :80',
    '',
    'echo "[NGINX-VERIFY] Testing HTTP request to localhost..."',
    'curl -I http://localhost/ 2>&1 | head -20',
    '',
    'echo "[NGINX-VERIFY] Checking Nginx error logs..."',
    'sudo tail -20 /var/log/nginx/error.log 2>/dev/null || echo "No errors logged"',
    '',
    'echo "[NGINX-VERIFY] Checking Nginx access logs..."',
    'sudo tail -10 /var/log/nginx/access.log 2>/dev/null || echo "No access logged"',
  ];

  const verifyResult = await executeSSMCommand(instanceId, verifyCommands, 60);
  console.log('[NGINX-DEPLOY] Verification output:', verifyResult.output);

  if (!verifyResult.success) {
    console.error('[NGINX-DEPLOY] Nginx verification failed');
  }

  console.log('[NGINX-DEPLOY] ✅ Nginx setup completed');
  return result;
}

/**
 * Start backend application with PM2 (if needed)
 */
export async function startBackendWithPM2(
  instanceId: string,
  detection: ProjectDetectionResult
): Promise<{ success: boolean; output: string; error?: string }> {
  if (detection.type !== 'BACKEND' || !detection.needsPM2) {
    console.log('[NGINX-DEPLOY] Skipping PM2 setup (not a Node.js/Python backend)');
    return { success: true, output: 'PM2 not needed' };
  }

  console.log('[NGINX-DEPLOY] Starting backend with PM2...');

  const pm2Commands = generatePM2Commands(detection);

  if (pm2Commands.length === 0) {
    console.log('[NGINX-DEPLOY] No PM2 commands generated');
    return { success: true, output: 'No PM2 setup needed' };
  }

  const result = await executeSSMCommand(
    instanceId,
    pm2Commands,
    180 // 3 minutes timeout for PM2 startup
  );

  if (!result.success) {
    console.error('[NGINX-DEPLOY] PM2 startup failed');
    return result;
  }

  console.log('[NGINX-DEPLOY] ✅ Backend started with PM2');
  return result;
}

/**
 * Verify build output directory exists
 */
export async function verifyBuildOutput(
  instanceId: string,
  buildOutputDir: string
): Promise<{ success: boolean; output: string; error?: string }> {
  console.log('[NGINX-DEPLOY] Verifying build output at:', buildOutputDir);

  const verifyCommands = [
    `# Verify build output directory`,
    `REAL_DIR="${buildOutputDir}"`,
    `if [ ! -d "$REAL_DIR" ] && [ -d "/home/ec2-user/app/dist" ]; then`,
    `  REAL_DIR="/home/ec2-user/app/dist"`,
    `fi`,
    `if [ -d "$REAL_DIR" ]; then`,
    `  echo "[VERIFY] ✅ Build output directory exists: $REAL_DIR"`,
    `  FILE_COUNT=$(find "$REAL_DIR" -type f | wc -l)`,
    `  echo "[VERIFY] Files in build directory: $FILE_COUNT"`,
    `  ls -lh "$REAL_DIR" | head -20`,
    `else`,
    `  echo "[VERIFY] ❌ Build output directory NOT FOUND: ${buildOutputDir} (also tried dist/)"`,
    `  echo "[VERIFY] Available directories:"`,
    `  ls -la /home/ec2-user/app/`,
    `  exit 1`,
    `fi`,
  ];

  return executeSSMCommand(instanceId, verifyCommands, 30);
}

/**
 * Complete Nginx deployment pipeline
 */
export async function deployWithNginx(
  instanceId: string
): Promise<{ success: boolean; detection: ProjectDetectionResult; logs: string[] }> {
  const logs: string[] = [];

  try {
    logs.push('[NGINX-DEPLOY] Starting universal Nginx deployment...');

    // Step 1: Detect project type
    logs.push('[NGINX-DEPLOY] Step 1: Detecting project type...');
    const detection = await detectProjectTypeFromInstance(instanceId);
    logs.push(`[NGINX-DEPLOY] Detected: ${detection.framework} (${detection.type})`);

    // Step 2: Verify build output (for STATIC projects)
    if (detection.type === 'STATIC') {
      logs.push('[NGINX-DEPLOY] Step 2: Verifying build output...');
      const verifyResult = await verifyBuildOutput(instanceId, detection.buildOutputDir);
      logs.push(verifyResult.output);

      if (!verifyResult.success) {
        logs.push('[NGINX-DEPLOY] ❌ Build output verification failed');
        return { success: false, detection, logs };
      }
    }

    // Step 3: Setup Nginx
    logs.push('[NGINX-DEPLOY] Step 3: Setting up Nginx...');
    const nginxResult = await setupNginx(instanceId, detection);
    logs.push(nginxResult.output);

    if (!nginxResult.success) {
      logs.push('[NGINX-DEPLOY] ❌ Nginx setup failed');
      return { success: false, detection, logs };
    }

    // Step 4: Start backend with PM2 (if needed)
    if (detection.type === 'BACKEND' && detection.needsPM2) {
      logs.push('[NGINX-DEPLOY] Step 4: Starting backend with PM2...');
      const pm2Result = await startBackendWithPM2(instanceId, detection);
      logs.push(pm2Result.output);

      if (!pm2Result.success) {
        logs.push('[NGINX-DEPLOY] ❌ PM2 startup failed');
        return { success: false, detection, logs };
      }
    } else {
      logs.push('[NGINX-DEPLOY] Step 4: Skipped (static project or binary)');
    }

    logs.push('[NGINX-DEPLOY] ✅ Universal Nginx deployment completed successfully!');
    logs.push(`[NGINX-DEPLOY] Your ${detection.framework} app is now accessible via Nginx on port 80`);

    return {
      success: true,
      detection,
      logs,
    };
  } catch (error: any) {
    logs.push(`[NGINX-DEPLOY] ❌ Deployment error: ${error.message}`);
    console.error('[NGINX-DEPLOY] Error:', error);

    return {
      success: false,
      detection: {
        type: 'STATIC',
        framework: 'Unknown',
        buildOutputDir: '/home/ec2-user/app/build',
        port: 3000,
        needsPM2: false,
      },
      logs,
    };
  }
}

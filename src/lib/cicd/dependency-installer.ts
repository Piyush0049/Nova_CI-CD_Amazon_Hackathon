/**
 * Smart Dependency Installer
 * Handles installing missing build tools and dependencies
 */

import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export interface InstallResult {
  success: boolean;
  output: string;
  error?: string;
}

/**
 * Install missing build tool with comprehensive verification
 */
export async function installBuildTool(
  instanceId: string,
  toolName: string,
  workingDir: string = '/home/ec2-user/app'
): Promise<InstallResult> {
  console.log(`[INSTALLER] Installing ${toolName}...`);

  // Determine packages to install based on tool
  const toolPackages: Record<string, string[]> = {
    vite: ['vite', '@vitejs/plugin-react'],
    webpack: ['webpack', 'webpack-cli', 'webpack-dev-server'],
    tsc: ['typescript', '@types/react', '@types/node'],
    next: ['next', 'react', 'react-dom'],
    eslint: ['eslint', 'eslint-config-next'],
    tailwindcss: ['tailwindcss', 'postcss', 'autoprefixer'],
  };

  const packages = toolPackages[toolName] || [toolName];
  const packageList = packages.join(' ');

  console.log(`[INSTALLER] Packages to install: ${packageList}`);

  const commands = [
    `cd ${workingDir}`,
    'export PATH="$PATH:/home/ec2-user/app/node_modules/.bin"',
    '',
    '# Step 1: Clean npm cache',
    'echo "[INSTALLER] Cleaning npm cache..."',
    'npm cache clean --force',
    '',
    '# Step 2: Remove corrupted node_modules/.bin',
    'echo "[INSTALLER] Cleaning node_modules/.bin..."',
    'rm -rf node_modules/.bin',
    '',
    '# Step 3: Install packages',
    `echo "[INSTALLER] Installing ${packageList}..."`,
    `npm install --save-dev ${packageList} --legacy-peer-deps --force`,
    '',
    '# Step 4: Rebuild binaries',
    'echo "[INSTALLER] Rebuilding npm binaries..."',
    'npm rebuild',
    '',
    '# Step 5: Verify installation',
    'echo "[INSTALLER] === VERIFICATION ==="',
    `echo "[INSTALLER] Checking if ${toolName} is installed..."`,
    '',
    '# Check in node_modules',
    `if [ -d "node_modules/${packages[0]}" ]; then`,
    `  echo "[INSTALLER] ✓ ${packages[0]} directory exists"`,
    'else',
    `  echo "[INSTALLER] ✗ ${packages[0]} directory NOT found"`,
    'fi',
    '',
    '# Check binary',
    `if [ -f "node_modules/.bin/${toolName}" ]; then`,
    `  echo "[INSTALLER] ✓ ${toolName} binary exists"`,
    `  ls -la node_modules/.bin/${toolName}`,
    'else',
    `  echo "[INSTALLER] ✗ ${toolName} binary NOT found"`,
    '  echo "[INSTALLER] Creating symlink manually..."',
    `  if [ -f "node_modules/${packages[0]}/bin/${toolName}.js" ]; then`,
    `    ln -sf ../node_modules/${packages[0]}/bin/${toolName}.js node_modules/.bin/${toolName}`,
    `  elif [ -f "node_modules/${packages[0]}/dist/node/cli.js" ]; then`,
    `    ln -sf ../node_modules/${packages[0]}/dist/node/cli.js node_modules/.bin/${toolName}`,
    '  fi',
    'fi',
    '',
    '# Test execution',
    'echo "[INSTALLER] Testing execution..."',
    'export PATH="$PATH:$(pwd)/node_modules/.bin"',
    `which ${toolName} || echo "[INSTALLER] ${toolName} not in PATH"`,
    `node_modules/.bin/${toolName} --version 2>/dev/null && echo "[INSTALLER] ✓ ${toolName} works!" || echo "[INSTALLER] ⚠ ${toolName} version check failed"`,
    '',
    'echo "[INSTALLER] Installation complete"',
  ];

  try {
    const sendCmd = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: { commands },
        TimeoutSeconds: 600,
      })
    );

    const commandId = sendCmd.Command?.CommandId;
    if (!commandId) {
      return { success: false, output: '', error: 'No command ID' };
    }

    // Wait for completion
    for (let i = 0; i < 180; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const result = await ssmClient.send(
        new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: instanceId })
      );

      if (result.Status === 'Success') {
        const output = result.StandardOutputContent || '';
        console.log(`[INSTALLER] ✓ ${toolName} installed successfully`);
        console.log(`[INSTALLER] Output: ${output.substring(0, 500)}`);
        return { success: true, output };
      } else if (result.Status === 'Failed' || result.Status === 'Cancelled') {
        const error = result.StandardErrorContent || 'Installation failed';
        console.error(`[INSTALLER] ✗ ${toolName} installation failed`);
        return { success: false, output: result.StandardOutputContent || '', error };
      }
    }

    return { success: false, output: '', error: 'Timeout' };
  } catch (error: any) {
    console.error(`[INSTALLER] Error: ${error.message}`);
    return { success: false, output: '', error: error.message };
  }
}

/**
 * Run command using npx as fallback
 */
export async function runWithNpx(
  instanceId: string,
  command: string,
  workingDir: string = '/home/ec2-user/app'
): Promise<InstallResult> {
  console.log(`[NPX] Running with npx: ${command}`);

  const commands = [
    `cd ${workingDir}`,
    'export CI=true',
    'export NODE_ENV=production',
    'export PATH="$PATH:/home/ec2-user/app/node_modules/.bin"',
    '',
    `echo "[NPX] Running: npx ${command}"`,
    `npx --yes ${command}`,
  ];

  try {
    const sendCmd = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: { commands },
        TimeoutSeconds: 600,
      })
    );

    const commandId = sendCmd.Command?.CommandId;
    if (!commandId) {
      return { success: false, output: '', error: 'No command ID' };
    }

    // Wait for completion
    for (let i = 0; i < 180; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const result = await ssmClient.send(
        new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: instanceId })
      );

      if (result.Status === 'Success') {
        return { success: true, output: result.StandardOutputContent || '' };
      } else if (result.Status === 'Failed' || result.Status === 'Cancelled') {
        return {
          success: false,
          output: result.StandardOutputContent || '',
          error: result.StandardErrorContent || 'Command failed',
        };
      }
    }

    return { success: false, output: '', error: 'Timeout' };
  } catch (error: any) {
    return { success: false, output: '', error: error.message };
  }
}

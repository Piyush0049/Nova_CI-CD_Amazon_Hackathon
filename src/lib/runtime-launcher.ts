/**
 * Runtime Launcher - Starts application servers with PM2/systemd
 * Runs AFTER pipeline completes - Never blocks the build
 *
 * ARCHITECTURE:
 * - NO reverse proxy (Nginx removed for simplicity and reliability)
 * - Application exposed directly on detected port via EC2 security group
 * - Access: http://PUBLIC_IP:PORT (e.g., http://23.45.67.89:3000)
 *
 * KEY FEATURES:
 * ✅ Dynamic port detection from AI analysis (supports any port: 3000, 9000, 8080, etc.)
 * ✅ Health checks with curl to verify app is actually responding
 * ✅ Binds to 0.0.0.0 to ensure external accessibility
 * ✅ PORT and HOST environment variables set for all languages
 * ✅ Comprehensive logging and error diagnostics
 * ✅ Universal support: Node.js, Python, Rust, Go, Java, Ruby, PHP, .NET, etc.
 */

import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export interface RuntimeConfig {
  framework: string;
  language: string;
  startCommand: string;
  port: number;
  envVars: Record<string, string>;
}

/**
 * Generate PM2 ecosystem config for Node.js applications
 */
function generatePM2Config(config: RuntimeConfig): string {
  // CRITICAL: Remove PORT from envVars if present - we use the AI-detected port from config.port
  const filteredEnvVars = Object.entries(config.envVars)
    .filter(([key]) => key !== 'PORT' && key !== 'port')
    .map(([key, value]) => `      ${key}: "${value.replace(/"/g, '\\"')}"`)
    .join(',\n');

  // For commands like "npm start", we need to use script: 'npm', args: 'start'
  let script = config.startCommand;
  let args = '';

  if (config.startCommand.startsWith('npm ')) {
    script = 'npm';
    args = config.startCommand.replace('npm ', '');
  } else if (config.startCommand.startsWith('yarn ')) {
    script = 'yarn';
    args = config.startCommand.replace('yarn ', '');
  } else if (config.startCommand.startsWith('pnpm ')) {
    script = 'pnpm';
    args = config.startCommand.replace('pnpm ', '');
  }

  const argsLine = args ? `    args: '${args}',` : '';

  // ALWAYS use the AI-detected port from config.port
  const envVarsWithPort = filteredEnvVars
    ? `${filteredEnvVars},\n      PORT: ${config.port},
      HOST: '0.0.0.0'`
    : `PORT: ${config.port},
      HOST: '0.0.0.0'`;

  return `module.exports = {
  apps: [{
    name: 'app',
    script: '${script}',
${argsLine}
    cwd: '/home/ec2-user/runtime',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      ${envVarsWithPort}
    },
    error_file: '/home/ec2-user/logs/error.log',
    out_file: '/home/ec2-user/logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};`;
}

/**
 * Generate systemd service file for Python applications
 */
function generateSystemdService(config: RuntimeConfig): string {
  // CRITICAL: Remove PORT from envVars if present - we use the AI-detected port from config.port
  const envVarsString = Object.entries(config.envVars)
    .filter(([key]) => key !== 'PORT' && key !== 'port')
    .map(([key, value]) => `Environment="${key}=${value.replace(/"/g, '\\"')}"`)
    .join('\n');

  // For Python, we need to use the venv's python/uvicorn
  // Replace command with full venv path and ensure it binds to 0.0.0.0
  let execStart = config.startCommand;

  // If command contains uvicorn, use venv path and add --host 0.0.0.0
  if (execStart.includes('uvicorn')) {
    execStart = execStart.replace('uvicorn', '/home/ec2-user/runtime/venv/bin/uvicorn');
    // Add --host 0.0.0.0 if not already present
    if (!execStart.includes('--host')) {
      execStart = execStart + ' --host 0.0.0.0';
    }
    // Add --port if not already present
    if (!execStart.includes('--port')) {
      execStart = execStart + ` --port ${config.port}`;
    }
  } else if (execStart.includes('python3')) {
    execStart = execStart.replace('python3', '/home/ec2-user/runtime/venv/bin/python3');
  } else if (execStart.includes('python')) {
    execStart = execStart.replace('python', '/home/ec2-user/runtime/venv/bin/python');
  } else {
    // Fallback: prepend with venv activation
    execStart = `/bin/bash -c "source /home/ec2-user/runtime/venv/bin/activate && ${execStart}"`;
  }

  return `[Unit]
Description=Application Server
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/runtime
Environment="PORT=${config.port}"
Environment="HOST=0.0.0.0"
${envVarsString}
ExecStart=${execStart}
Restart=always
RestartSec=10
StandardOutput=append:/home/ec2-user/logs/output.log
StandardError=append:/home/ec2-user/logs/error.log

[Install]
WantedBy=multi-user.target`;
}

/**
 * Generate runtime launcher commands
 * This runs AFTER pipeline completes and starts the server
 */
export function generateRuntimeLaunchCommands(config: RuntimeConfig): string[] {
  const commands: string[] = [
    'echo "════════════════════════════════════════════════════════════"',
    'echo "[RUNTIME] Starting application server..."',
    'echo "════════════════════════════════════════════════════════════"',
    `echo "[RUNTIME] 🎯 Detected Port: ${config.port}"`,
    `echo "[RUNTIME] Framework: ${config.framework}"`,
    `echo "[RUNTIME] Language: ${config.language}"`,
    `echo "[RUNTIME] Start Command: ${config.startCommand}"`,
    'echo "════════════════════════════════════════════════════════════"',
    'cd /home/ec2-user/runtime',
    'mkdir -p /home/ec2-user/logs',
  ];

  // Node.js with PM2
  if (config.language.includes('Node') || config.language.includes('JavaScript') || config.language.includes('TypeScript')) {
    commands.push(
      'echo "[RUNTIME] Verifying runtime directory..."',
      'ls -la /home/ec2-user/runtime/',
      'echo "[RUNTIME] Checking for package.json..."',
      'test -f /home/ec2-user/runtime/package.json && echo "✅ package.json found" || echo "❌ package.json missing!"',
      'echo "[RUNTIME] Checking for node_modules..."',
      'test -d /home/ec2-user/runtime/node_modules && echo "✅ node_modules found" || echo "❌ node_modules missing!"',
      '',
      'echo "[RUNTIME] ⚠️  IMPORTANT: Your app MUST use these environment variables:"',
      `echo "[RUNTIME]   - PORT=${config.port} (from AI detection)"`,
      `echo "[RUNTIME]   - HOST=0.0.0.0 (bind to all interfaces)"`,
      'echo "[RUNTIME]   Example: app.listen(process.env.PORT || 3000, process.env.HOST || \'0.0.0.0\')"',
      '',
      'echo "[RUNTIME] Installing PM2 process manager..."',
      'sudo npm install -g pm2 --silent',
      'pm2 delete all 2>/dev/null || true',
      'echo "[RUNTIME] Creating PM2 configuration..."',
      `cat > ecosystem.config.js << 'PM2EOF'`,
      generatePM2Config(config),
      'PM2EOF',
      'echo "[RUNTIME] PM2 Configuration:"',
      'cat ecosystem.config.js',
      'echo "[RUNTIME] Starting application with PM2..."',
      'pm2 start ecosystem.config.js',
      'pm2 save',
      'pm2 startup systemd -u ec2-user --hp /home/ec2-user 2>/dev/null || true',
      'sleep 3',
      'echo "[RUNTIME] PM2 Status:"',
      'pm2 list',
      'echo "[RUNTIME] Application logs:"',
      'pm2 logs --lines 50 --nostream',
    );
  }
  // Python with systemd
  else if (config.language.includes('Python')) {
    commands.push(
      'echo "[RUNTIME] Creating systemd service..."',
      `sudo tee /etc/systemd/system/app.service > /dev/null << 'SERVICEEOF'`,
      generateSystemdService(config),
      'SERVICEEOF',
      'sudo systemctl daemon-reload',
      'sudo systemctl stop app 2>/dev/null || true',
      'echo "[RUNTIME] Starting application service..."',
      'sudo systemctl start app',
      'sudo systemctl enable app',
      'echo "[RUNTIME] Service status:"',
      'sudo systemctl status app --no-pager -l',
      'echo "[RUNTIME] Recent logs:"',
      'tail -50 /home/ec2-user/logs/output.log 2>/dev/null || echo "No logs yet"',
    );
  }
  // Generic background process for other languages (Rust, Go, Java, Ruby, PHP, etc.)
  else {
    // Build environment variables string
    const envVarsArray = Object.entries(config.envVars)
      .filter(([key]) => key !== 'PORT' && key !== 'port' && key !== 'HOST' && key !== 'host')
      .map(([key, value]) => `${key}="${value.replace(/"/g, '\\"')}"`)
      .join(' ');

    const envPrefix = envVarsArray ? `${envVarsArray} ` : '';

    commands.push(
      'echo "[RUNTIME] ⚠️  IMPORTANT: Setting environment variables for application:"',
      `echo "[RUNTIME]   - PORT=${config.port} (from AI detection)"`,
      `echo "[RUNTIME]   - HOST=0.0.0.0 (bind to all interfaces)"`,
      'echo "[RUNTIME]   Your app MUST respect PORT and HOST environment variables"',
      'echo "[RUNTIME]   Example (Rust): TcpListener::bind(format!(\"{}:{}\", env::var(\"HOST\").unwrap(), env::var(\"PORT\").unwrap()))"',
      'echo "[RUNTIME]   Example (Go): http.ListenAndServe(fmt.Sprintf(\"%s:%s\", os.Getenv(\"HOST\"), os.Getenv(\"PORT\")), handler)"',
      '',
      'echo "[RUNTIME] Starting application in background..."',
      // Export PORT and HOST BEFORE running the start command
      `export PORT=${config.port}`,
      `export HOST=0.0.0.0`,
      `${envPrefix}nohup ${config.startCommand} > /home/ec2-user/logs/output.log 2>&1 &`,
      'APP_PID=$!',
      'echo "[RUNTIME] Application started with PID: $APP_PID"',
      'echo $APP_PID > /home/ec2-user/runtime/app.pid',
      'sleep 5',
      'if kill -0 $APP_PID 2>/dev/null; then',
      '  echo "[RUNTIME] ✅ Application is running"',
      'else',
      '  echo "[RUNTIME] ❌ Application failed to start"',
      '  tail -50 /home/ec2-user/logs/output.log',
      '  exit 1',
      'fi',
    );
  }

  commands.push(
    'echo "════════════════════════════════════════════════════════════"',
    `echo "[RUNTIME] Verifying app is running on port ${config.port}..."`,
    'echo "════════════════════════════════════════════════════════════"',
    'sleep 5',
    `echo "[RUNTIME] 1️⃣ Checking if port ${config.port} is bound..."`,
    `if sudo lsof -i :${config.port} > /dev/null 2>&1; then`,
    `  echo "[RUNTIME] ✅ Port ${config.port} is bound"`,
    `  sudo lsof -i :${config.port}`,
    'else',
    `  echo "[RUNTIME] ❌ Port ${config.port} is NOT bound!"`,
    `  echo "[RUNTIME] Checking all listening ports:"`,
    `  sudo lsof -i -P -n | grep LISTEN`,
    `  echo "[RUNTIME] PM2 logs:"`,
    `  pm2 logs --lines 50 --nostream 2>/dev/null || true`,
    'fi',
    '',
    `echo "[RUNTIME] 2️⃣ Health check: Testing HTTP connection to localhost:${config.port}..."`,
    `HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:${config.port}/ --connect-timeout 5 --max-time 10 2>/dev/null || echo "000")`,
    `if [ "$HTTP_CODE" != "000" ]; then`,
    `  echo "[RUNTIME] ✅ App is responding! HTTP Status: $HTTP_CODE"`,
    `  echo "[RUNTIME] ✅ Server verified running on port ${config.port}"`,
    'else',
    `  echo "[RUNTIME] ❌ App is NOT responding on port ${config.port}!"`,
    `  echo "[RUNTIME] Trying with 127.0.0.1..."`,
    `  curl -v http://127.0.0.1:${config.port}/ --connect-timeout 5 --max-time 10 2>&1 || true`,
    `  echo "[RUNTIME] Recent application logs:"`,
    `  pm2 logs --lines 100 --nostream 2>/dev/null || tail -100 /home/ec2-user/logs/output.log 2>/dev/null || echo "No logs available"`,
    'fi',
  );

  commands.push(
    'echo "════════════════════════════════════════════════════════════"',
    'echo "[RUNTIME] ✅ Runtime launcher completed"',
    'echo "════════════════════════════════════════════════════════════"',
  );

  return commands;
}

/**
 * Launch runtime server - Runs AFTER pipeline completes
 */
export async function launchRuntime(
  instanceId: string,
  config: RuntimeConfig
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    console.log('[RUNTIME-LAUNCHER] Starting application server...');
    console.log('[RUNTIME-LAUNCHER] Framework:', config.framework);
    console.log('[RUNTIME-LAUNCHER] Port:', config.port);

    const commands = generateRuntimeLaunchCommands(config);

    const sendCmd = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: { commands },
        TimeoutSeconds: 300, // 5 minutes - enough for server startup
      })
    );

    const commandId = sendCmd.Command?.CommandId;
    if (!commandId) {
      throw new Error('Failed to get command ID');
    }

    console.log('[RUNTIME-LAUNCHER] Waiting for server to start...');

    // Poll for completion
    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const result = await ssmClient.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: instanceId,
        })
      );

      if (result.Status === 'Success') {
        console.log('[RUNTIME-LAUNCHER] ✅ Server started successfully');
        return {
          success: true,
          output: result.StandardOutputContent || '',
        };
      } else if (result.Status === 'Failed') {
        console.error('[RUNTIME-LAUNCHER] ❌ Server start failed');
        return {
          success: false,
          output: result.StandardOutputContent || '',
          error: result.StandardErrorContent || 'Server start failed',
        };
      }
    }

    throw new Error('Runtime launch timed out');
  } catch (error: any) {
    console.error('[RUNTIME-LAUNCHER] Error:', error);
    return {
      success: false,
      output: '',
      error: error.message,
    };
  }
}

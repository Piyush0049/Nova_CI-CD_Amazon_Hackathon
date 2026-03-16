/**
 * Deployment Diagnostics API
 * Helps debug Nginx and deployment issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

async function executeSSMCommand(instanceId: string, commands: string[]): Promise<string> {
  const command = new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: 'AWS-RunShellScript',
    Parameters: { commands },
    TimeoutSeconds: 60,
  });

  const response = await ssmClient.send(command);
  const commandId = response.Command?.CommandId;

  if (!commandId) {
    throw new Error('No command ID received');
  }

  // Wait for completion
  await new Promise((resolve) => setTimeout(resolve, 5000));

  const invocationCommand = new GetCommandInvocationCommand({
    CommandId: commandId,
    InstanceId: instanceId,
  });

  const invocation = await ssmClient.send(invocationCommand);
  return invocation.StandardOutputContent || '';
}

export async function POST(request: NextRequest) {
  try {
    const { instanceId } = await request.json();

    if (!instanceId) {
      return NextResponse.json({ error: 'instanceId required' }, { status: 400 });
    }

    console.log('[DIAGNOSE] Running diagnostics for instance:', instanceId);

    const diagnosticCommands = [
      '#!/bin/bash',
      'echo "===== DEPLOYMENT DIAGNOSTICS ====="',
      'echo ""',
      '',
      '# 1. Check Nginx status',
      'echo "1️⃣  Nginx Status:"',
      'sudo systemctl status nginx | head -15',
      'echo ""',
      '',
      '# 2. Check what is listening on port 80',
      'echo "2️⃣  Port 80 Status:"',
      'sudo netstat -tulpn | grep :80 || sudo ss -tulpn | grep :80 || echo "Nothing listening on port 80"',
      'echo ""',
      '',
      '# 3. Check Nginx configuration',
      'echo "3️⃣  Nginx Configuration:"',
      'if [ -f /etc/nginx/conf.d/app.conf ]; then',
      '  cat /etc/nginx/conf.d/app.conf',
      'else',
      '  echo "❌ No app.conf found"',
      'fi',
      'echo ""',
      '',
      '# 4. Test Nginx config',
      'echo "4️⃣  Nginx Config Test:"',
      'sudo nginx -t 2>&1',
      'echo ""',
      '',
      '# 5. Check build directory',
      'echo "5️⃣  Build Directory Check:"',
      'cd /home/ec2-user/app',
      'echo "Available directories:"',
      'ls -la',
      'echo ""',
      'if [ -d build ]; then',
      '  echo "build/ contents:"',
      '  ls -lah build/ | head -20',
      'elif [ -d dist ]; then',
      '  echo "dist/ contents:"',
      '  ls -lah dist/ | head -20',
      'elif [ -d .next ]; then',
      '  echo ".next/ contents:"',
      '  ls -lah .next/ | head -20',
      'else',
      '  echo "❌ No build directory found"',
      'fi',
      'echo ""',
      '',
      '# 6. Test HTTP request',
      'echo "6️⃣  HTTP Request Test:"',
      'curl -I http://localhost/ 2>&1 | head -20',
      'echo ""',
      '',
      '# 7. Check Nginx error logs',
      'echo "7️⃣  Nginx Error Logs (last 20 lines):"',
      'sudo tail -20 /var/log/nginx/error.log 2>/dev/null || echo "No error logs"',
      'echo ""',
      '',
      '# 8. Check Nginx access logs',
      'echo "8️⃣  Nginx Access Logs (last 10 lines):"',
      'sudo tail -10 /var/log/nginx/access.log 2>/dev/null || echo "No access logs"',
      'echo ""',
      '',
      '# 9. Check file permissions',
      'echo "9️⃣  File Permissions:"',
      'if [ -f build/index.html ]; then',
      '  ls -l build/index.html',
      '  echo "Can read: $(test -r build/index.html && echo YES || echo NO)"',
      'elif [ -f dist/index.html ]; then',
      '  ls -l dist/index.html',
      '  echo "Can read: $(test -r dist/index.html && echo YES || echo NO)"',
      'fi',
      'echo ""',
      '',
      '# 10. Check SELinux status',
      'echo "🔟 SELinux Status:"',
      'if command -v getenforce &> /dev/null; then',
      '  getenforce',
      'else',
      '  echo "SELinux not installed"',
      'fi',
      'echo ""',
      '',
      'echo "===== END DIAGNOSTICS ====="',
    ];

    const output = await executeSSMCommand(instanceId, diagnosticCommands);

    return NextResponse.json({
      success: true,
      diagnostics: output,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[DIAGNOSE] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Diagnostic failed' },
      { status: 500 }
    );
  }
}

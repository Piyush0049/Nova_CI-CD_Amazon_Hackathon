/**
 * Quick Fix for Broken Nginx Deployments
 * Repairs common Nginx issues automatically
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

async function executeSSMCommand(instanceId: string, commands: string[], timeout: number = 60): Promise<string> {
  const command = new SendCommandCommand({
    InstanceIds: [instanceId],
    DocumentName: 'AWS-RunShellScript',
    Parameters: { commands },
    TimeoutSeconds: timeout,
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

    console.log('[FIX-NGINX] Fixing Nginx for instance:', instanceId);

    const fixCommands = [
      '#!/bin/bash',
      'cd /home/ec2-user/app',
      'echo "===== NGINX QUICK FIX ====="',
      'echo ""',
      '',
      '# 1. Detect build directory',
      'echo "1️⃣  Detecting build directory..."',
      'if [ -d "build" ]; then',
      '  BUILD_DIR="/home/ec2-user/app/build"',
      '  echo "✅ Found: build/"',
      'elif [ -d "dist" ]; then',
      '  BUILD_DIR="/home/ec2-user/app/dist"',
      '  echo "✅ Found: dist/"',
      'elif [ -d ".next" ]; then',
      '  BUILD_DIR="/home/ec2-user/app/.next"',
      '  echo "✅ Found: .next/"',
      'else',
      '  echo "❌ No build directory found"',
      '  exit 1',
      'fi',
      'echo "Build directory: $BUILD_DIR"',
      'echo ""',
      '',
      '# 2. Stop any process on port 80',
      'echo "2️⃣  Stopping conflicting processes on port 80..."',
      'sudo lsof -ti:80 | xargs sudo kill -9 2>/dev/null || true',
      'sleep 2',
      'echo "✅ Port 80 cleared"',
      'echo ""',
      '',
      '# 3. Install Nginx if not present',
      'echo "3️⃣  Ensuring Nginx is installed..."',
      'if ! command -v nginx &> /dev/null; then',
      '  sudo yum install nginx -y',
      '  echo "✅ Nginx installed"',
      'else',
      '  echo "✅ Nginx already installed"',
      'fi',
      'echo ""',
      '',
      '# 4. Create correct Nginx config',
      'echo "4️⃣  Creating Nginx configuration..."',
      'cat > /tmp/app.conf << EOF',
      'server {',
      '    listen 80 default_server;',
      '    listen [::]:80 default_server;',
      '    server_name _;',
      '',
      '    root $BUILD_DIR;',
      '    index index.html;',
      '',
      '    # Security headers',
      '    add_header X-Frame-Options "SAMEORIGIN" always;',
      '    add_header X-Content-Type-Options "nosniff" always;',
      '',
      '    # Gzip compression',
      '    gzip on;',
      '    gzip_types text/plain text/css text/javascript application/javascript application/json;',
      '',
      '    # Cache static assets',
      '    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {',
      '        expires 1y;',
      '        add_header Cache-Control "public, immutable";',
      '    }',
      '',
      '    # No cache for HTML',
      '    location ~* \\.html$ {',
      '        expires -1;',
      '        add_header Cache-Control "no-cache";',
      '    }',
      '',
      '    # SPA fallback',
      '    location / {',
      '        try_files \\$uri \\$uri/ /index.html;',
      '    }',
      '',
      '    location /health {',
      '        return 200 "healthy\\n";',
      '    }',
      '}',
      'EOF',
      '',
      'sudo mv /tmp/app.conf /etc/nginx/conf.d/app.conf',
      'sudo chmod 644 /etc/nginx/conf.d/app.conf',
      'echo "✅ Nginx config created"',
      'echo ""',
      '',
      '# 5. Remove default configs',
      'echo "5️⃣  Removing default configs..."',
      'sudo rm -f /etc/nginx/conf.d/default.conf',
      'sudo rm -f /etc/nginx/sites-enabled/default',
      'sudo rm -f /etc/nginx/nginx.conf.default',
      'echo "✅ Default configs removed"',
      'echo ""',
      '',
      '# 6. Fix permissions',
      'echo "6️⃣  Fixing file permissions..."',
      'sudo chmod -R 755 $BUILD_DIR',
      'sudo chown -R nginx:nginx $BUILD_DIR 2>/dev/null || sudo chown -R ec2-user:ec2-user $BUILD_DIR',
      'echo "✅ Permissions fixed"',
      'echo ""',
      '',
      '# 7. Disable SELinux if present',
      'echo "7️⃣  Configuring SELinux..."',
      'if command -v getenforce &> /dev/null; then',
      '  sudo setenforce 0 2>/dev/null || true',
      '  echo "✅ SELinux set to permissive"',
      'else',
      '  echo "ℹ️  SELinux not present"',
      'fi',
      'echo ""',
      '',
      '# 8. Test Nginx config',
      'echo "8️⃣  Testing Nginx configuration..."',
      'sudo nginx -t',
      'if [ $? -ne 0 ]; then',
      '  echo "❌ Nginx config test failed"',
      '  cat /etc/nginx/conf.d/app.conf',
      '  exit 1',
      'fi',
      'echo "✅ Config is valid"',
      'echo ""',
      '',
      '# 9. Restart Nginx',
      'echo "9️⃣  Restarting Nginx..."',
      'sudo systemctl enable nginx',
      'sudo systemctl restart nginx',
      'sleep 3',
      '',
      'if sudo systemctl is-active --quiet nginx; then',
      '  echo "✅ Nginx is running"',
      'else',
      '  echo "❌ Nginx failed to start"',
      '  sudo systemctl status nginx',
      '  sudo journalctl -u nginx -n 30 --no-pager',
      '  exit 1',
      'fi',
      'echo ""',
      '',
      '# 10. Test HTTP',
      'echo "🔟 Testing HTTP endpoint..."',
      'HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/)',
      'echo "HTTP Status: $HTTP_CODE"',
      '',
      'if [ "$HTTP_CODE" = "200" ]; then',
      '  echo "✅ SUCCESS! Application is now serving on port 80"',
      '  curl -I http://localhost/ 2>&1 | head -10',
      'else',
      '  echo "⚠️  HTTP Status: $HTTP_CODE (expected 200)"',
      '  echo "Response:"',
      '  curl -v http://localhost/ 2>&1 | head -30',
      'fi',
      'echo ""',
      '',
      'echo "===== FIX COMPLETE ====="',
      'echo ""',
      'echo "🎉 Your application should now be accessible!"',
      'echo "📍 Serving from: $BUILD_DIR"',
      'echo "🌐 Try accessing your public IP in the browser"',
    ];

    const output = await executeSSMCommand(instanceId, fixCommands, 120);

    const success = output.includes('SUCCESS! Application is now serving') ||
                    output.includes('HTTP Status: 200');

    return NextResponse.json({
      success,
      output,
      message: success
        ? 'Nginx has been fixed and is now serving your application'
        : 'Fix applied, but manual verification needed',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[FIX-NGINX] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Fix failed' },
      { status: 500 }
    );
  }
}

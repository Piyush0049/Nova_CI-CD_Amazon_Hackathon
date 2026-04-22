/**
 * Universal Nginx Configuration Generator
 * Generates Nginx configs for ANY project type (Static or Backend)
 */

export type ProjectDeploymentType = 'STATIC' | 'BACKEND';

export interface ProjectDetectionResult {
  type: ProjectDeploymentType;
  framework: string;
  buildOutputDir: string;
  port: number;
  startCommand?: string;
  needsPM2: boolean;
}

export interface NginxConfig {
  type: ProjectDeploymentType;
  config: string;
  setupCommands: string[];
}

/**
 * Detect project type and deployment configuration
 */
export function detectProjectDeploymentType(
  packageJson?: string,
  cargoToml?: string,
  requirementsTxt?: string,
  goMod?: string,
  hasViteConfig?: boolean,
  hasNextConfig?: boolean,
  hasWebpackConfig?: boolean,
  customPort?: number
): ProjectDetectionResult {
  let framework = 'Unknown';
  let type: ProjectDeploymentType = 'STATIC';
  let buildOutputDir = '/home/ec2-user/app/build';
  let port = customPort || 3000;
  let startCommand = '';
  let needsPM2 = false;

  // Node.js projects
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // BACKEND projects (need reverse proxy + PM2)
      if (deps['next']) {
        framework = 'Next.js';
        type = 'BACKEND';
        buildOutputDir = '/home/ec2-user/app/.next';
        port = customPort || 3000;
        startCommand = 'npm start';
        needsPM2 = true;
      } else if (deps['express'] || deps['fastify'] || deps['koa'] || deps['@nestjs/core']) {
        framework = deps['express'] ? 'Express' : deps['@nestjs/core'] ? 'NestJS' : 'Node.js Backend';
        type = 'BACKEND';
        buildOutputDir = '/home/ec2-user/app/dist';
        port = customPort || 3000;
        startCommand = pkg.scripts?.start || 'node index.js';
        needsPM2 = true;
      }
      // STATIC projects (serve build output directly)
      else if (deps['react-scripts']) {
        framework = 'Create React App';
        type = 'STATIC';
    // Check for common output dirs, prefer build for CRA, then dist
    buildOutputDir = '/home/ec2-user/app/build'; // Default for CRA
  } else if (deps['vite'] || hasViteConfig) {
    framework = deps['vue'] ? 'Vite + Vue' : 'Vite + React';
    type = 'STATIC';
    buildOutputDir = '/home/ec2-user/app/dist'; // Default for Vite
      } else if (deps['@angular/core']) {
        framework = 'Angular';
        type = 'STATIC';
        buildOutputDir = '/home/ec2-user/app/dist';
      } else if (deps['vue'] && !deps['nuxt']) {
        framework = 'Vue.js';
        type = 'STATIC';
        buildOutputDir = '/home/ec2-user/app/dist';
      } else if (deps['svelte']) {
        framework = 'Svelte';
        type = 'STATIC';
        buildOutputDir = '/home/ec2-user/app/public/build';
      }
    } catch (e) {
      console.error('[NGINX-DETECT] Error parsing package.json:', e);
    }
  }

  // Rust projects
  if (cargoToml) {
    const cargo = cargoToml.toLowerCase();

    // Backend frameworks
    if (cargo.includes('actix-web') || cargo.includes('rocket') || cargo.includes('axum')) {
      framework = cargo.includes('actix-web') ? 'Actix Web' : cargo.includes('rocket') ? 'Rocket' : 'Axum';
      type = 'BACKEND';
      buildOutputDir = '/home/ec2-user/app/target/release';
      port = 8080;
      startCommand = './target/release/app';
      needsPM2 = false; // Rust binaries don't need PM2
    }
    // Frontend WASM frameworks
    else if (cargo.includes('yew') || cargo.includes('leptos')) {
      framework = cargo.includes('yew') ? 'Yew' : 'Leptos';
      type = 'STATIC';
      buildOutputDir = '/home/ec2-user/app/dist';
    }
  }

  // Python projects
  if (requirementsTxt) {
    const reqs = requirementsTxt.toLowerCase();

    if (reqs.includes('flask') || reqs.includes('django') || reqs.includes('fastapi')) {
      framework = reqs.includes('flask') ? 'Flask' : reqs.includes('django') ? 'Django' : 'FastAPI';
      type = 'BACKEND';
      buildOutputDir = '/home/ec2-user/app';
      port = reqs.includes('django') ? 8000 : 5000;
      startCommand = reqs.includes('flask') ? 'python app.py' :
                     reqs.includes('django') ? 'python manage.py runserver 0.0.0.0:8000' :
                     'uvicorn main:app --host 0.0.0.0 --port 8000';
      needsPM2 = true;
    }
  }

  // Go projects
  if (goMod) {
    const mod = goMod.toLowerCase();

    if (mod.includes('gin-gonic') || mod.includes('fiber') || mod.includes('echo')) {
      framework = mod.includes('gin-gonic') ? 'Gin' : mod.includes('fiber') ? 'Fiber' : 'Echo';
      type = 'BACKEND';
      buildOutputDir = '/home/ec2-user/app';
      port = 8080;
      startCommand = './app';
      needsPM2 = false; // Go binaries don't need PM2
    }
  }

  console.log('[NGINX-DETECT] Project detection result:');
  console.log('  - Framework:', framework);
  console.log('  - Type:', type);
  console.log('  - Build Output:', buildOutputDir);
  console.log('  - Port:', port);
  console.log('  - Needs PM2:', needsPM2);

  return {
    type,
    framework,
    buildOutputDir,
    port,
    startCommand,
    needsPM2,
  };
}

/**
 * Generate Nginx configuration for STATIC projects
 */
function generateStaticNginxConfig(buildOutputDir: string): string {
  return `# Auto-generated Nginx config for STATIC project

# HTTP server
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root ${buildOutputDir};
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;

    # Cache static assets (JS, CSS, images) for 1 year
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Don't cache HTML files
    location ~* \\.html$ {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # SPA fallback - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Handle API routes if they exist (forward to backend)
    location /api/ {
        # This will be handled by the app if it's a fullstack framework
        try_files $uri $uri/ /index.html;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }

    # Deny access to hidden files
    location ~ /\\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
`;
}

/**
 * Generate Nginx configuration for BACKEND projects (reverse proxy)
 */
function generateBackendNginxConfig(port: number): string {
  return `# Auto-generated Nginx config for BACKEND project (reverse proxy)
upstream backend_app {
    server 127.0.0.1:${port} fail_timeout=0;
}

# HTTP server
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    # Increase buffer sizes for larger requests
    client_max_body_size 50M;
    client_body_buffer_size 128k;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;

    # Proxy settings
    location / {
        proxy_pass http://backend_app;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # Forward real client IP
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://backend_app/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    # Deny access to hidden files
    location ~ /\\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
`;
}

/**
 * Generate complete Nginx configuration and setup commands
 */
export function generateNginxConfig(detection: ProjectDetectionResult): NginxConfig {
  const nginxConfig = detection.type === 'STATIC'
    ? generateStaticNginxConfig(detection.buildOutputDir)
    : generateBackendNginxConfig(detection.port);

  const setupCommands: string[] = [
    '# Install and configure Nginx',
    'echo "[NGINX] Installing Nginx..."',
    '',
    '# Check if Nginx is already installed',
    'if ! command -v nginx &> /dev/null; then',
    '  echo "[NGINX] Installing Nginx..."',
    '  sudo yum install nginx -y',
    '  echo "[NGINX] ✅ Nginx installed"',
    'else',
    '  echo "[NGINX] ℹ️  Nginx already installed"',
    'fi',
    '',
    '# Stop default nginx if running',
    'sudo systemctl stop nginx 2>/dev/null || true',
    '',
    '# Disable SELinux early to avoid permission issues',
    'if command -v getenforce &> /dev/null; then',
    '  SELINUX_STATUS=$(getenforce)',
    '  if [ "$SELINUX_STATUS" = "Enforcing" ]; then',
    '    echo "[NGINX] ⚠️  SELinux is Enforcing - disabling temporarily"',
    '    sudo setenforce 0 2>/dev/null || true',
    '    echo "[NGINX] ✅ SELinux set to permissive"',
    '  fi',
    'fi',
    '',
    '# ENSURE PROPER OWNERSHIP (Critical for build/access)',
    'echo "[NGINX] Fixing global project ownership..."',
    'sudo chown -R ec2-user:ec2-user /home/ec2-user/app || true',
    '',
    // Verify build output exists BEFORE creating config
    ...(detection.type === 'STATIC' ? [
      `echo "[NGINX] Verifying build output directory..."`,
      `# Try build directory first, then dist as fallback`,
      `BUILD_PATH="${detection.buildOutputDir}"`,
      `if [ ! -d "$BUILD_PATH" ] && [ -d "/home/ec2-user/app/dist" ]; then`,
      `  echo "[NGINX] ℹ️  'build/' not found, but 'dist/' exists. Using 'dist/' instead."`,
      `  BUILD_PATH="/home/ec2-user/app/dist"`,
      `fi`,
      ``,
      `# If still not found, try a last-resort build if package.json exists`,
      `if [ ! -d "$BUILD_PATH" ] && [ -f "/home/ec2-user/app/package.json" ]; then`,
      `  echo "[NGINX] ⚠️  No build output found. Attempting late-stage build..."`,
      `  cd /home/ec2-user/app`,
      `  npm run build || true`,
      `  if [ -d "build" ]; then BUILD_PATH="/home/ec2-user/app/build"; fi`,
      `  if [ -d "dist" ]; then BUILD_PATH="/home/ec2-user/app/dist"; fi`,
      `fi`,
      ``,
      `if [ ! -d "$BUILD_PATH" ]; then`,
      `  echo "[NGINX] ❌ ERROR: Build directory not found (tried build/, dist/)"`,
      `  echo "[NGINX] Available directories in /home/ec2-user/app:"`,
      `  ls -la /home/ec2-user/app/`,
      `  exit 1`,
      `fi`,
      ``,
      `# Update the root path in the config manually if we found a different one`,
      `REAL_BUILD_PATH="$BUILD_PATH"`,
      ``,
      `echo "[NGINX] ✅ Build output verified: $REAL_BUILD_PATH"`,
      `ls -lah $REAL_BUILD_PATH/ | head -20`,
      ``,
    ] : []),
    '# Create nginx config',
    'echo "[NGINX] Creating Nginx configuration..."',
    `cat > /tmp/app.conf << 'NGINX_CONFIG_EOF'`,
    nginxConfig,
    'NGINX_CONFIG_EOF',
    '',
    ...(detection.type === 'STATIC' ? [
      `# Ensure the root path in the config matches the actual build path we found`,
      `sed -i "s|root ${detection.buildOutputDir}|root $REAL_BUILD_PATH|g" /tmp/app.conf`,
      `echo "[NGINX] Updated config root to: $REAL_BUILD_PATH"`,
    ] : []),
    '# Show generated config',
    'echo "[NGINX] Generated configuration:"',
    'cat /tmp/app.conf',
    '',
    '# Move config to nginx directory',
    'sudo mv /tmp/app.conf /etc/nginx/conf.d/app.conf',
    'sudo chmod 644 /etc/nginx/conf.d/app.conf',
    '',
    '# Remove default config if exists',
    'sudo rm -f /etc/nginx/conf.d/default.conf',
    'sudo rm -f /etc/nginx/sites-enabled/default',
    'sudo rm -f /etc/nginx/nginx.conf.default',
    '',
    // Fix permissions on build directory and parent directories
    ...(detection.type === 'STATIC' ? [
      `echo "[NGINX] Fixing permissions for Nginx access..."`,
      ``,
      `# Ensure parent directories have execute permission for Nginx to traverse`,
      `sudo chmod o+x /home/ec2-user`,
      `sudo chmod o+x /home/ec2-user/app`,
      ``,
      `# Set permissions on build directory (keep as ec2-user:ec2-user, make world-readable)`,
      `sudo chmod -R 755 ${detection.buildOutputDir}`,
      `sudo chown -R ec2-user:ec2-user ${detection.buildOutputDir}`,
      ``,
      `# Fix SELinux context if SELinux is installed`,
      `if command -v chcon &> /dev/null; then`,
      `  sudo chcon -R -t httpd_sys_content_t ${detection.buildOutputDir} 2>/dev/null || true`,
      `fi`,
      ``,
      `# Verify permissions were set correctly`,
      `echo "[NGINX] Verifying permissions..."`,
      `ls -la /home/ec2-user | grep "ec2-user"`,
      `ls -la /home/ec2-user/app | tail -5`,
      `ls -la ${detection.buildOutputDir} | head -10`,
      `echo "[NGINX] Checking index.html permissions:"`,
      `ls -l ${detection.buildOutputDir}/index.html`,
      `echo "[NGINX] ✅ Permissions configured"`,
      ``,
    ] : []),
    '# Test nginx config',
    'echo "[NGINX] Testing Nginx configuration..."',
    'sudo nginx -t 2>&1',
    'if [ $? -ne 0 ]; then',
    '  echo "[NGINX] ❌ Nginx config test failed"',
    '  echo "[NGINX] Showing config file:"',
    '  cat /etc/nginx/conf.d/app.conf',
    '  exit 1',
    'fi',
    '',
    '# Ensure firewall allows HTTP',
    'echo "[NGINX] Configuring firewall..."',
    'if command -v firewall-cmd &> /dev/null; then',
    '  echo "[NGINX] Configuring firewalld..."',
    '  sudo firewall-cmd --permanent --add-service=http 2>/dev/null || true',
    '  sudo firewall-cmd --permanent --add-port=3000/tcp 2>/dev/null || true',
    '  sudo firewall-cmd --permanent --add-port=8080/tcp 2>/dev/null || true',
    '  sudo firewall-cmd --permanent --add-port=8000/tcp 2>/dev/null || true',
    '  sudo firewall-cmd --reload 2>/dev/null || true',
    '  echo "[NGINX] ✅ firewalld configured"',
    'elif command -v ufw &> /dev/null; then',
    '  echo "[NGINX] Configuring ufw..."',
    '  sudo ufw allow 80/tcp 2>/dev/null || true',
    '  sudo ufw allow 3000/tcp 2>/dev/null || true',
    '  sudo ufw allow 8080/tcp 2>/dev/null || true',
    '  sudo ufw reload 2>/dev/null || true',
    '  echo "[NGINX] ✅ ufw configured"',
    'fi',
    '',
    '# Stop any process using port 80',
    'echo "[NGINX] Checking if port 80 is in use..."',
    'PORT_80_PID=$(sudo lsof -ti:80 2>/dev/null || true)',
    'if [ -n "$PORT_80_PID" ]; then',
    '  echo "[NGINX] ⚠️  Port 80 is in use by PID: $PORT_80_PID"',
    '  echo "[NGINX] Stopping conflicting process..."',
    '  sudo kill -9 $PORT_80_PID 2>/dev/null || true',
    '  sleep 1',
    'fi',
    '',
    '# Start nginx',
    'echo "[NGINX] Starting Nginx..."',
    'sudo systemctl enable nginx',
    'sudo systemctl restart nginx',
    '',
    '# Wait for nginx to start',
    'sleep 3',
    '',
    '# Check nginx status',
    'if sudo systemctl is-active --quiet nginx; then',
    '  echo "[NGINX] ✅ Nginx is running"',
    '  echo "[NGINX] Project type: ' + detection.type + '"',
    '  echo "[NGINX] Framework: ' + detection.framework + '"',
    detection.type === 'STATIC' && `  echo "[NGINX] Serving from: ${detection.buildOutputDir}"`,
    detection.type === 'BACKEND' && `  echo "[NGINX] Proxying to: http://localhost:${detection.port}"`,
    '  ',
    '  # Test HTTP request',
    '  echo "[NGINX] Testing HTTP request..."',
    '  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/)',
    '  if [ "$HTTP_STATUS" = "200" ]; then',
    '    echo "[NGINX] ✅ HTTP 200 OK - Application is serving correctly"',
    '  else',
    '    echo "[NGINX] ⚠️  HTTP Status: $HTTP_STATUS (expected 200)"',
    '    echo "[NGINX] Showing HTTP headers:"',
    '    curl -I http://localhost/ 2>&1 | head -10',
    '    echo "[NGINX] Checking recent Nginx error logs:"',
    '    sudo tail -10 /var/log/nginx/error.log 2>/dev/null || echo "No error logs"',
    detection.type === 'STATIC' && `    echo "[NGINX] Checking file permissions on index.html:"`,
    detection.type === 'STATIC' && `    ls -l ${detection.buildOutputDir}/index.html`,
    '  fi',
    'else',
    '  echo "[NGINX] ❌ Failed to start Nginx"',
    '  echo "[NGINX] Checking logs..."',
    '  sudo journalctl -u nginx -n 50 --no-pager',
    '  sudo tail -20 /var/log/nginx/error.log 2>/dev/null || true',
    '  exit 1',
    'fi',
  ].filter(Boolean) as string[];

  return {
    type: detection.type,
    config: nginxConfig,
    setupCommands,
  };
}

/**
 * Generate PM2 startup commands for backend projects
 */
export function generatePM2Commands(detection: ProjectDetectionResult): string[] {
  if (!detection.needsPM2 || !detection.startCommand) {
    return [];
  }

  return [
    '',
    '# Install and configure PM2 for process management',
    'echo "[PM2] Installing PM2..."',
    '',
    '# Install PM2 globally if not already installed',
    'if ! command -v pm2 &> /dev/null; then',
    '  npm install -g pm2',
    '  echo "[PM2] ✅ PM2 installed"',
    'else',
    '  echo "[PM2] ℹ️  PM2 already installed"',
    'fi',
    '',
    '# Stop any existing PM2 processes',
    'pm2 delete all 2>/dev/null || true',
    '',
    '# Start the application with PM2',
    'echo "[PM2] Starting application..."',
    'cd /home/ec2-user/app',
    '',
    detection.framework === 'Next.js' ?
      '# Next.js - use npm start (which runs "next start")' :
      detection.framework.includes('Python') ?
        '# Python - start with gunicorn or uvicorn' :
        '# Start Node.js application',
    '',
    `pm2 start "${detection.startCommand}" --name "${detection.framework.toLowerCase().replace(/\\s+/g, '-')}" --time`,
    '',
    '# Save PM2 process list',
    'pm2 save',
    '',
    '# Setup PM2 to start on system boot',
    'sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user',
    '',
    '# Check PM2 status',
    'echo "[PM2] Application status:"',
    'pm2 list',
    'pm2 logs --lines 20 --nostream',
    '',
    '# Verify app is responding',
    `echo "[PM2] Testing application on port ${detection.port}..."`,
    'sleep 5',
    `curl -f http://localhost:${detection.port}/health || curl -f http://localhost:${detection.port}/ || echo "[PM2] ⚠️  App not responding yet (may need time to start)"`,
  ];
}

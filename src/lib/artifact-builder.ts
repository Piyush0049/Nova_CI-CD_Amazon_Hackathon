/**
 * Artifact Builder - Packages build outputs for deployment
 * Similar to Vercel's build artifact system
 */

export interface ArtifactConfig {
  language: string;
  framework: string;
  buildOutput: string;
  includeNodeModules: boolean;
  includeVenv: boolean;
  additionalFiles: string[];
}

export interface BuildArtifact {
  archivePath: string;
  size: number;
  hash: string;
  timestamp: Date;
  framework: string;
}

/**
 * Generate artifact packaging commands based on project type
 */
export function generateArtifactPackageCommands(config: ArtifactConfig): string[] {
  const commands: string[] = [
    'echo "[ARTIFACT] Creating deployment artifact..."',
    'cd /home/ec2-user/app',
  ];

  // Framework-specific artifact packaging (single-line commands for YAML compatibility)
  if (config.framework.includes('Next.js')) {
    commands.push(
      'echo "[ARTIFACT] Packaging Next.js application..."',
      'tar -czf /tmp/build-artifact.tar.gz .next/ public/ package.json package-lock.json next.config.* node_modules/ 2>/dev/null || tar -czf /tmp/build-artifact.tar.gz .next/ public/ package.json',
    );
  } else if (config.framework.includes('Vite') || config.framework.includes('React')) {
    commands.push(
      'echo "[ARTIFACT] Packaging static build..."',
      'tar -czf /tmp/build-artifact.tar.gz dist/ package.json 2>/dev/null || tar -czf /tmp/build-artifact.tar.gz dist/',
    );
  } else if (config.framework.includes('Python') || config.framework.includes('FastAPI')) {
    commands.push(
      'echo "[ARTIFACT] Packaging Python application..."',
      'tar -czf /tmp/build-artifact.tar.gz *.py requirements.txt venv/ 2>/dev/null || tar -czf /tmp/build-artifact.tar.gz *.py requirements.txt',
    );
  } else if (config.framework.includes('Express') || config.framework.includes('Node.js')) {
    commands.push(
      'echo "[ARTIFACT] Packaging Node.js backend..."',
      'echo "[ARTIFACT] Contents to package:"',
      'ls -la',
      'tar -czf /tmp/build-artifact.tar.gz --exclude=.git --exclude=.next --exclude=dist --exclude=build --exclude=.env --exclude=.DS_Store .',
      'echo "[ARTIFACT] Verifying archive contents:"',
      'tar -tzf /tmp/build-artifact.tar.gz | head -20',
    );
  } else {
    commands.push(
      'echo "[ARTIFACT] Packaging application files..."',
      'tar -czf /tmp/build-artifact.tar.gz . --exclude=.git --exclude=node_modules',
    );
  }

  commands.push(
    'ARTIFACT_HASH=$(sha256sum /tmp/build-artifact.tar.gz | cut -d" " -f1)',
    'echo "[ARTIFACT] Hash: $ARTIFACT_HASH"',
    'ARTIFACT_SIZE=$(stat -f%z /tmp/build-artifact.tar.gz 2>/dev/null || stat -c%s /tmp/build-artifact.tar.gz)',
    'echo "[ARTIFACT] Size: ${ARTIFACT_SIZE} bytes ($((ARTIFACT_SIZE / 1024 / 1024))MB)"',
    'echo "[ARTIFACT] ✅ Artifact created successfully"',
  );

  return commands;
}

/**
 * Generate artifact deployment commands
 */
export function generateArtifactDeployCommands(framework: string): string[] {
  const commands: string[] = [
    'echo "[DEPLOY] Deploying artifact to runtime..."',
    'cd /home/ec2-user',
    'mkdir -p /home/ec2-user/runtime',
    'cd /home/ec2-user/runtime',
    'echo "[DEPLOY] Extracting artifact..."',
    'tar -xzf /tmp/build-artifact.tar.gz',
    'chown -R ec2-user:ec2-user /home/ec2-user/runtime',
    'echo "[DEPLOY] ✅ Artifact deployed successfully"',
  ];

  return commands;
}

/**
 * Check if cached artifact can be reused
 */
export function generateCacheCheckCommands(): string[] {
  return [
    'echo "[CACHE] Checking for cached artifacts..."',
    'if [ -f "package.json" ]; then',
    '  DEP_HASH=$(sha256sum package.json | cut -d" " -f1)',
    'elif [ -f "requirements.txt" ]; then',
    '  DEP_HASH=$(sha256sum requirements.txt | cut -d" " -f1)',
    'elif [ -f "Cargo.toml" ]; then',
    '  DEP_HASH=$(sha256sum Cargo.toml | cut -d" " -f1)',
    'else',
    '  DEP_HASH="no-deps"',
    'fi',
    'echo "[CACHE] Dependency hash: $DEP_HASH"',
    'CACHE_DIR="/home/ec2-user/.build-cache/$DEP_HASH"',
    'if [ -d "$CACHE_DIR" ]; then',
    '  echo "[CACHE] ✅ Cache hit! Restoring from cache..."',
    '  cp -r "$CACHE_DIR"/* . 2>/dev/null || true',
    '  echo "[CACHE] Cache restored successfully"',
    'else',
    '  echo "[CACHE] ⚠️ Cache miss - will build from scratch"',
    'fi',
  ];
}

/**
 * Save build to cache
 */
export function generateCacheSaveCommands(): string[] {
  return [
    'echo "[CACHE] Saving build to cache..."',
    'mkdir -p "$CACHE_DIR"',
    'if [ -d "node_modules" ]; then',
    '  echo "[CACHE] Caching node_modules..."',
    '  cp -r node_modules "$CACHE_DIR/"',
    'fi',
    'if [ -d "venv" ]; then',
    '  echo "[CACHE] Caching Python venv..."',
    '  cp -r venv "$CACHE_DIR/"',
    'fi',
    'echo "[CACHE] ✅ Build cached successfully"',
  ];
}

/**
 * Auto-detect project type and generate appropriate pipeline
 */

export interface ProjectType {
  framework: string;
  language: string;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'maven' | 'gradle';
  buildCommand: string;
  testCommand?: string;
  lintCommand?: string;
  startCommand: string;
  outputDir: string;
}

export interface GeneratedPipeline {
  stages: string[];
  jobs: {
    name: string;
    stage: string;
    script: string[];
  }[];
}

/**
 * Enhanced project type detection with file structure analysis
 */
export function detectProjectTypeEnhanced(
  packageJson: any,
  structure: {
    hasNextConfig: boolean;
    hasViteConfig: boolean;
    hasWebpackConfig: boolean;
    hasPagesDir: boolean;
    hasAppDir: boolean;
    hasSrcDir: boolean;
    hasIndexJs: boolean;
    hasServerJs: boolean;
  }
): ProjectType {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  const scripts = packageJson.scripts || {};

  console.log('[DETECT] Dependencies:', Object.keys(deps).slice(0, 10).join(', '));
  console.log('[DETECT] Scripts:', Object.keys(scripts).join(', '));

  // PRIORITY 1: Next.js (most specific detection)
  if (deps.next || structure.hasNextConfig || structure.hasPagesDir || structure.hasAppDir) {
    console.log('[DETECT] ✓ Next.js detected');
    return {
      framework: 'Next.js',
      language: deps.typescript || 'TypeScript',
      packageManager: packageJson.packageManager?.includes('yarn')
        ? 'yarn'
        : packageJson.packageManager?.includes('pnpm')
        ? 'pnpm'
        : 'npm',
      buildCommand: scripts.build || 'npm run build',
      testCommand: scripts.test ? 'npm run test' : undefined,
      lintCommand: scripts.lint ? 'npm run lint' : undefined,
      startCommand: scripts.start || 'npm start',
      outputDir: '.next',
    };
  }

  // PRIORITY 2: Vite + React (frontend)
  if (deps.vite || structure.hasViteConfig) {
    console.log('[DETECT] ✓ Vite detected');
    return {
      framework: 'Vite + React',
      language: deps.typescript ? 'TypeScript' : 'JavaScript',
      packageManager: 'npm',
      buildCommand: scripts.build || 'npm run build',
      testCommand: scripts.test ? 'npm run test' : undefined,
      lintCommand: scripts.lint ? 'npm run lint' : undefined,
      startCommand: 'STATIC_SERVER', // Special marker
      outputDir: 'dist',
    };
  }

  // PRIORITY 3: Create React App
  if (deps['react-scripts']) {
    console.log('[DETECT] ✓ Create React App detected');
    return {
      framework: 'Create React App',
      language: deps.typescript ? 'TypeScript' : 'JavaScript',
      packageManager: 'npm',
      buildCommand: scripts.build || 'npm run build',
      testCommand: scripts.test ? 'npm run test -- --passWithNoTests' : undefined,
      lintCommand: undefined,
      startCommand: 'STATIC_SERVER',
      outputDir: 'build',
    };
  }

  // PRIORITY 4: Generic React with Webpack
  if (deps.react && (structure.hasWebpackConfig || !deps.express)) {
    console.log('[DETECT] ✓ React (Webpack) detected');
    return {
      framework: 'React',
      language: deps.typescript ? 'TypeScript' : 'JavaScript',
      packageManager: 'npm',
      buildCommand: scripts.build || 'npm run build',
      testCommand: scripts.test ? 'npm run test' : undefined,
      lintCommand: scripts.lint ? 'npm run lint' : undefined,
      startCommand: 'STATIC_SERVER',
      outputDir: 'build',
    };
  }

  // PRIORITY 5: Vue.js
  if (deps.vue) {
    console.log('[DETECT] ✓ Vue.js detected');
    return {
      framework: 'Vue.js',
      language: deps.typescript ? 'TypeScript' : 'JavaScript',
      packageManager: 'npm',
      buildCommand: scripts.build || 'npm run build',
      testCommand: scripts.test ? 'npm run test' : undefined,
      lintCommand: scripts.lint ? 'npm run lint' : undefined,
      startCommand: 'STATIC_SERVER',
      outputDir: 'dist',
    };
  }

  // PRIORITY 6: Express/Node.js backend (NO frontend frameworks)
  if (deps.express || deps.fastify || deps.koa || deps['@nestjs/core']) {
    console.log('[DETECT] ✓ Express/Node backend detected');
    const isTypeScript = deps.typescript || !!deps['@types/node'];
    return {
      framework: deps.express ? 'Express.js' : deps.fastify ? 'Fastify' : 'Node.js Backend',
      language: isTypeScript ? 'TypeScript' : 'JavaScript',
      packageManager: 'npm',
      buildCommand: isTypeScript && scripts.build ? 'npm run build' : 'echo "No build needed"',
      testCommand: scripts.test ? 'npm run test' : undefined,
      lintCommand: scripts.lint ? 'npm run lint' : undefined,
      startCommand: scripts.start || (structure.hasServerJs ? 'node server.js' : 'node index.js'),
      outputDir: isTypeScript ? 'dist' : '.',
    };
  }

  // PRIORITY 7: Generic Node.js
  console.log('[DETECT] ✓ Generic Node.js project');
  return {
    framework: 'Node.js',
    language: 'JavaScript',
    packageManager: 'npm',
    buildCommand: scripts.build || 'echo "No build needed"',
    testCommand: scripts.test ? 'npm run test' : undefined,
    lintCommand: scripts.lint ? 'npm run lint' : undefined,
    startCommand: scripts.start || (structure.hasServerJs ? 'node server.js' : 'node index.js'),
    outputDir: '.',
  };
}

/**
 * Legacy function for backward compatibility
 */
export function detectProjectType(packageJson: any): ProjectType {
  return detectProjectTypeEnhanced(packageJson, {
    hasNextConfig: false,
    hasViteConfig: false,
    hasWebpackConfig: false,
    hasPagesDir: false,
    hasAppDir: false,
    hasSrcDir: false,
    hasIndexJs: false,
    hasServerJs: false,
  });
}

/**
 * Generate pipeline stages based on detected project type
 */
export function generatePipeline(projectType: ProjectType): GeneratedPipeline {
  const jobs: GeneratedPipeline['jobs'] = [];

  // INSTALL stage with forced clean install
  jobs.push({
    name: 'install-dependencies',
    stage: 'install',
    script: [
      // Force clean install to avoid "up to date" issues
      'echo "[INSTALL] Forcing clean installation..."',
      'rm -rf node_modules package-lock.json',
      'echo "[INSTALL] Running: npm install --force --legacy-peer-deps"',
      `${projectType.packageManager} install ${projectType.packageManager === 'npm' ? '--force --include=dev --legacy-peer-deps' : ''}`,
      'echo "[INSTALL] Verifying installation..."',
      'echo "[INSTALL] node_modules package count: $(ls -1 node_modules 2>/dev/null | wc -l)"',
      'ls -la node_modules/ 2>/dev/null | head -10 || echo "[INSTALL] ERROR: node_modules not found!"',
    ],
  });

  // LINT stage (if linting is available)
  if (projectType.lintCommand) {
    jobs.push({
      name: 'lint',
      stage: 'lint',
      script: [projectType.lintCommand],
    });
  }

  // TEST stage (if tests are available)
  if (projectType.testCommand) {
    jobs.push({
      name: 'test',
      stage: 'test',
      script: [projectType.testCommand],
    });
  }

  // BUILD stage
  jobs.push({
    name: 'build',
    stage: 'build',
    script: [projectType.buildCommand],
  });

  const stages = ['install'];
  if (projectType.lintCommand) stages.push('lint');
  if (projectType.testCommand) stages.push('test');
  stages.push('build');

  return { stages, jobs };
}

/**
 * Fetch and analyze repository from GitHub with deep structure analysis
 */
export async function analyzeGitHubRepo(
  repoUrl: string,
  githubToken?: string
): Promise<{ projectType: ProjectType; pipeline: GeneratedPipeline }> {
  try {
    // Extract owner and repo from URL
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      throw new Error('Invalid GitHub URL');
    }

    const [, owner, repo] = match;
    const cleanRepo = repo.replace('.git', '');

    console.log('[PROJECT-DETECTOR] Analyzing repository:', `${owner}/${cleanRepo}`);

    // Fetch package.json from GitHub API
    const headers: HeadersInit = {
      Accept: 'application/vnd.github.v3.raw',
    };
    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    // Fetch package.json
    const packageResponse = await fetch(
      `https://api.github.com/repos/${owner}/${cleanRepo}/contents/package.json`,
      { headers }
    );

    if (!packageResponse.ok) {
      throw new Error('Could not fetch package.json from repository');
    }

    const packageJson = await packageResponse.json();
    console.log('[PROJECT-DETECTOR] package.json fetched');

    // Fetch repository tree to check file structure
    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${cleanRepo}/git/trees/main?recursive=1`,
      { headers }
    ).catch(() =>
      fetch(
        `https://api.github.com/repos/${owner}/${cleanRepo}/git/trees/master?recursive=1`,
        { headers }
      )
    );

    let hasNextConfig = false;
    let hasViteConfig = false;
    let hasWebpackConfig = false;
    let hasPagesDir = false;
    let hasAppDir = false;
    let hasSrcDir = false;
    let hasIndexJs = false;
    let hasServerJs = false;

    if (treeResponse.ok) {
      const tree = await treeResponse.json();
      const files = tree.tree || [];

      console.log('[PROJECT-DETECTOR] Repository structure:');
      files.forEach((file: any) => {
        const path = file.path.toLowerCase();

        // Check for config files
        if (path.includes('next.config')) hasNextConfig = true;
        if (path.includes('vite.config')) hasViteConfig = true;
        if (path.includes('webpack.config')) hasWebpackConfig = true;

        // Check for directories
        if (path.startsWith('pages/')) hasPagesDir = true;
        if (path.startsWith('app/')) hasAppDir = true;
        if (path.startsWith('src/')) hasSrcDir = true;

        // Check for entry files
        if (path === 'index.js' || path === 'src/index.js') hasIndexJs = true;
        if (path === 'server.js' || path === 'src/server.js') hasServerJs = true;
      });

      console.log('[PROJECT-DETECTOR] Detection results:');
      console.log('  - Next.js config:', hasNextConfig);
      console.log('  - Vite config:', hasViteConfig);
      console.log('  - Webpack config:', hasWebpackConfig);
      console.log('  - pages/ directory:', hasPagesDir);
      console.log('  - app/ directory:', hasAppDir);
      console.log('  - src/ directory:', hasSrcDir);
      console.log('  - index.js:', hasIndexJs);
      console.log('  - server.js:', hasServerJs);
    }

    // Enhanced project type detection
    const projectType = detectProjectTypeEnhanced(
      packageJson,
      {
        hasNextConfig,
        hasViteConfig,
        hasWebpackConfig,
        hasPagesDir,
        hasAppDir,
        hasSrcDir,
        hasIndexJs,
        hasServerJs,
      }
    );

    console.log('[PROJECT-DETECTOR] Detected framework:', projectType.framework);
    console.log('[PROJECT-DETECTOR] Build command:', projectType.buildCommand);
    console.log('[PROJECT-DETECTOR] Start command:', projectType.startCommand);

    const pipeline = generatePipeline(projectType);

    return { projectType, pipeline };
  } catch (error) {
    console.error('[PROJECT-DETECTOR] Error analyzing GitHub repo:', error);
    // Return default Node.js project
    const defaultType: ProjectType = {
      framework: 'Node.js',
      language: 'JavaScript',
      packageManager: 'npm',
      buildCommand: 'npm run build || echo "No build script"',
      testCommand: undefined,
      lintCommand: undefined,
      startCommand: 'npm start',
      outputDir: '.',
    };
    return {
      projectType: defaultType,
      pipeline: generatePipeline(defaultType),
    };
  }
}

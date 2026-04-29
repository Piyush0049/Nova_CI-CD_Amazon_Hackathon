/**
 * Multi-Language Project Analyzer
 * Detects and analyzes projects in ANY language/framework
 */

export interface ProjectFiles {
  // Node.js / JavaScript / TypeScript
  packageJson?: string;
  packageLockJson?: string;
  yarnLock?: string;
  pnpmLock?: string;
  tsconfigJson?: string;
  indexJs?: string;
  serverJs?: string;
  appJs?: string;

  // Python
  requirementsTxt?: string;
  setupPy?: string;
  pyprojectToml?: string;
  pipfile?: string;
  mainPy?: string;
  appPy?: string;

  // Rust
  cargoToml?: string;
  cargoLock?: string;
  mainRs?: string;

  // Go
  goMod?: string;
  goSum?: string;
  mainGo?: string;

  // Java
  pomXml?: string;
  buildGradle?: string;
  gradleProperties?: string;
  applicationProperties?: string;

  // Ruby
  gemfile?: string;
  gemfileLock?: string;
  appRb?: string;
  configRu?: string;

  // PHP
  composerJson?: string;
  composerLock?: string;
  indexPhp?: string;

  // .NET / C#
  csproj?: string;
  slnFile?: string;

  // Docker
  dockerfile?: string;
  dockerCompose?: string;

  // Config files
  viteConfig?: string;
  webpackConfig?: string;
  nextConfig?: string;
  nuxtConfig?: string;

  // CI/CD files (for reference)
  existingGitlabCi?: string;
  existingGithubActions?: string;
  existingJenkinsfile?: string;

  // README for context
  readme?: string;
}

export interface LanguageDetectionResult {
  primaryLanguage: string;
  framework?: string;
  packageManager?: string;
  buildTool?: string;
  hasTests: boolean;
  hasLinter: boolean;
  entryPoint?: string;
  detectedFiles: string[];
  port?: string;
}

/**
 * Fetch all relevant project files from GitHub repository
 */
export async function fetchProjectFiles(
  owner: string,
  repo: string,
  githubToken?: string
): Promise<ProjectFiles> {
  const files: ProjectFiles = {};
  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3.raw',
  };

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  const filesToFetch = [
    // Node.js
    { key: 'packageJson', path: 'package.json' },
    { key: 'packageLockJson', path: 'package-lock.json' },
    { key: 'yarnLock', path: 'yarn.lock' },
    { key: 'pnpmLock', path: 'pnpm-lock.yaml' },
    { key: 'tsconfigJson', path: 'tsconfig.json' },
    { key: 'indexJs', path: 'index.js' },
    { key: 'serverJs', path: 'server.js' },
    { key: 'appJs', path: 'app.js' },

    // Python
    { key: 'requirementsTxt', path: 'requirements.txt' },
    { key: 'setupPy', path: 'setup.py' },
    { key: 'pyprojectToml', path: 'pyproject.toml' },
    { key: 'pipfile', path: 'Pipfile' },
    { key: 'mainPy', path: 'main.py' },
    { key: 'appPy', path: 'app.py' },

    // Rust
    { key: 'cargoToml', path: 'Cargo.toml' },
    { key: 'cargoLock', path: 'Cargo.lock' },
    { key: 'mainRs', path: 'src/main.rs' },

    // Go
    { key: 'goMod', path: 'go.mod' },
    { key: 'goSum', path: 'go.sum' },
    { key: 'mainGo', path: 'main.go' },

    // Java
    { key: 'pomXml', path: 'pom.xml' },
    { key: 'buildGradle', path: 'build.gradle' },
    { key: 'gradleProperties', path: 'gradle.properties' },
    { key: 'applicationProperties', path: 'src/main/resources/application.properties' },

    // Ruby
    { key: 'gemfile', path: 'Gemfile' },
    { key: 'gemfileLock', path: 'Gemfile.lock' },
    { key: 'appRb', path: 'app.rb' },
    { key: 'configRu', path: 'config.ru' },

    // PHP
    { key: 'composerJson', path: 'composer.json' },
    { key: 'composerLock', path: 'composer.lock' },
    { key: 'indexPhp', path: 'index.php' },

    // .NET
    { key: 'csproj', path: 'project.csproj' },
    { key: 'slnFile', path: 'solution.sln' },

    // Docker
    { key: 'dockerfile', path: 'Dockerfile' },
    { key: 'dockerCompose', path: 'docker-compose.yml' },

    // Configs
    { key: 'viteConfig', path: 'vite.config.js' },
    { key: 'webpackConfig', path: 'webpack.config.js' },
    { key: 'nextConfig', path: 'next.config.js' },
    { key: 'nuxtConfig', path: 'nuxt.config.js' },

    // Existing CI/CD
    { key: 'existingGitlabCi', path: '.gitlab-ci.yml' },
    { key: 'existingGithubActions', path: '.github/workflows/main.yml' },
    { key: 'existingJenkinsfile', path: 'Jenkinsfile' },

    // README
    { key: 'readme', path: 'README.md' },
  ];

  // Fetch all files in parallel
  const fetchPromises = filesToFetch.map(async ({ key, path }) => {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        { headers }
      );

      if (response.ok) {
        const content = await response.text();
        return { key, content };
      }
    } catch (error) {
      // File doesn't exist, skip
    }
    return null;
  });

  const results = await Promise.all(fetchPromises);

  results.forEach((result) => {
    if (result) {
      (files as any)[result.key] = result.content;
    }
  });

  console.log('[ANALYZER] Fetched files:', Object.keys(files));
  return files;
}

/**
 * Detect project language and framework from files
 */
export function detectLanguageAndFramework(files: ProjectFiles): LanguageDetectionResult {
  const detectedFiles: string[] = [];

  // Node.js / JavaScript / TypeScript
  if (files.packageJson) {
    detectedFiles.push('package.json');
    const pkg = JSON.parse(files.packageJson);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Detect framework (priority: specific -> general)
    let framework = 'Node.js';
    let buildTool: string | undefined;
    let port = '3000';

    // Framework detection (check specific first)
    if (deps.next || files.nextConfig) {
      framework = 'Next.js';
      buildTool = 'next';
    } else if (deps['@nestjs/core']) {
      framework = 'NestJS';
      buildTool = 'nest';
    } else if (deps.express || deps.fastify || deps.koa) {
      framework = 'Express.js';
      buildTool = 'node';
    } else if (deps.vue || deps['@vue/cli'] || files.nuxtConfig) {
      framework = 'Vue.js';
      buildTool = deps.vite ? 'vite' : deps.webpack ? 'webpack' : 'vue-cli';
    } else if (deps['@angular/core']) {
      framework = 'Angular';
      buildTool = 'angular-cli';
    } else if (deps.react || deps['react-dom']) {
      // Detect React with specific build tool
      if (deps['react-scripts']) {
        framework = 'Create React App';
        buildTool = 'react-scripts';
      } else if (deps.vite || files.viteConfig) {
        framework = 'React (Vite)';
        buildTool = 'vite';
      } else {
        framework = 'React';
        buildTool = deps.webpack ? 'webpack' : 'unknown';
      }
    } else if (deps.vite || files.viteConfig) {
      // Vite without framework
      framework = 'Vite';
      buildTool = 'vite';
    }

    // Detect build tool if not already set
    if (!buildTool) {
      if (deps.vite || files.viteConfig) buildTool = 'vite';
      else if (deps.webpack || files.webpackConfig) buildTool = 'webpack';
      else if (deps['@vitejs/plugin-react']) buildTool = 'vite';
      else if (deps['react-scripts']) buildTool = 'react-scripts';
      else if (pkg.scripts?.build) buildTool = 'npm';
    }

    const packageManager = files.yarnLock ? 'yarn' : files.pnpmLock ? 'pnpm' : 'npm';

    return {
      primaryLanguage: 'JavaScript/TypeScript',
      framework,
      packageManager,
      buildTool,
      hasTests: !!pkg.scripts?.test,
      hasLinter: !!pkg.scripts?.lint,
      detectedFiles,
      port,
    };
  }

  // Python
  if (files.requirementsTxt || files.setupPy || files.pyprojectToml) {
    if (files.requirementsTxt) detectedFiles.push('requirements.txt');
    if (files.setupPy) detectedFiles.push('setup.py');
    if (files.pyprojectToml) detectedFiles.push('pyproject.toml');

    let framework = 'Python';
    let entryPoint = 'app.py';

    if (files.requirementsTxt) {
      const requirements = files.requirementsTxt.toLowerCase();
      if (requirements.includes('django')) {
        framework = 'Django';
        entryPoint = 'manage.py';
      } else if (requirements.includes('flask')) {
        framework = 'Flask';
        entryPoint = 'app.py';
      } else if (requirements.includes('fastapi')) {
        framework = 'FastAPI';
        entryPoint = 'main.py';
      }
    }

    return {
      primaryLanguage: 'Python',
      framework,
      packageManager: files.pipfile ? 'pipenv' : 'pip',
      hasTests: files.requirementsTxt?.includes('pytest') || false,
      hasLinter: files.requirementsTxt?.includes('flake8') || files.requirementsTxt?.includes('pylint') || false,
      entryPoint,
      detectedFiles,
      port: '8000',
    };
  }

  // Rust
  if (files.cargoToml) {
    detectedFiles.push('Cargo.toml');

    return {
      primaryLanguage: 'Rust',
      packageManager: 'cargo',
      buildTool: 'cargo',
      hasTests: true,
      hasLinter: true,
      detectedFiles,
      port: '8080',
    };
  }

  // Go
  if (files.goMod) {
    detectedFiles.push('go.mod');

    return {
      primaryLanguage: 'Go',
      packageManager: 'go modules',
      buildTool: 'go',
      hasTests: true,
      hasLinter: false,
      detectedFiles,
      port: '8080',
    };
  }

  // Java
  if (files.pomXml || files.buildGradle) {
    if (files.pomXml) detectedFiles.push('pom.xml');
    if (files.buildGradle) detectedFiles.push('build.gradle');

    return {
      primaryLanguage: 'Java',
      framework: 'Spring Boot',
      packageManager: files.pomXml ? 'maven' : 'gradle',
      buildTool: files.pomXml ? 'maven' : 'gradle',
      hasTests: true,
      hasLinter: false,
      detectedFiles,
      port: '8080',
    };
  }

  // Ruby
  if (files.gemfile) {
    detectedFiles.push('Gemfile');

    return {
      primaryLanguage: 'Ruby',
      framework: files.gemfile.includes('rails') ? 'Ruby on Rails' : 'Ruby',
      packageManager: 'bundler',
      hasTests: files.gemfile.includes('rspec') || false,
      hasLinter: false,
      detectedFiles,
      port: '3000',
    };
  }

  // PHP
  if (files.composerJson) {
    detectedFiles.push('composer.json');
    const composer = JSON.parse(files.composerJson);

    let framework = 'PHP';
    if (composer.require?.['laravel/framework']) framework = 'Laravel';
    else if (composer.require?.['symfony/symfony']) framework = 'Symfony';

    return {
      primaryLanguage: 'PHP',
      framework,
      packageManager: 'composer',
      hasTests: !!composer.require?.['phpunit/phpunit'],
      hasLinter: false,
      detectedFiles,
      port: '8000',
    };
  }

  // Docker
  if (files.dockerfile) {
    detectedFiles.push('Dockerfile');

    return {
      primaryLanguage: 'Docker',
      framework: 'Containerized Application',
      buildTool: 'docker',
      hasTests: false,
      hasLinter: false,
      detectedFiles,
      port: '80', // Default fallback for raw docker exposed ports
    };
  }

  // Unknown
  return {
    primaryLanguage: 'Unknown',
    hasTests: false,
    hasLinter: false,
    detectedFiles: [],
    port: '3000', // Safe default
  };
}

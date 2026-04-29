/**
 * Universal File Fetcher for Multi-Language Project Detection
 * Supports: Node.js, Rust, Go, Python, Java, Ruby, PHP, .NET, and more
 */

import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export interface UniversalProjectFiles {
  // Language Detection Files
  detectedLanguages: string[];

  // VERSION FILES (CRITICAL for dynamic version detection)
  nvmrc?: string;           // Node.js version: .nvmrc
  nodeVersion?: string;     // Node.js version: .node-version
  pythonVersion?: string;   // Python version: .python-version
  runtimeTxt?: string;      // Python version: runtime.txt (Heroku-style)
  goVersion?: string;       // Go version: .go-version
  rubyVersion?: string;     // Ruby version: .ruby-version

  // Node.js / JavaScript / TypeScript
  packageJson?: string;
  packageLockJson?: string;
  yarnLock?: string;
  pnpmLock?: string;
  tsconfigJson?: string;
  viteConfig?: string;
  webpackConfig?: string;
  nextConfig?: string;
  nuxtConfig?: string;

  // Rust
  cargoToml?: string;
  cargoLock?: string;
  mainRs?: string;
  libRs?: string;

  // Go
  goMod?: string;
  goSum?: string;
  mainGo?: string;

  // Python
  requirementsTxt?: string;
  setupPy?: string;
  pyprojectToml?: string;
  pipfile?: string;
  mainPy?: string;
  appPy?: string;
  managePy?: string;

  // Java
  pomXml?: string;
  buildGradle?: string;
  gradleProperties?: string;
  settingsGradle?: string;

  // Ruby
  gemfile?: string;
  gemfileLock?: string;

  // PHP
  composerJson?: string;
  composerLock?: string;

  // .NET / C#
  csproj?: string;
  slnFile?: string;

  // Docker
  dockerfile?: string;
  dockerCompose?: string;

  // Config files
  readme?: string;
  makeFile?: string;

  // Solana-specific
  anchorToml?: string;

  // Directory structure
  directories?: string[];
  fileList?: string[];
}

/**
 * Fetch all project files from EC2 instance with universal language support
 */
export async function fetchUniversalProjectFiles(instanceId: string): Promise<UniversalProjectFiles> {
  try {
    console.log('[UNIVERSAL-FETCH] Fetching project files from instance...');
    console.log('[UNIVERSAL-FETCH] Detecting all languages: Rust, Go, Python, Node.js, Java, etc.');

    // Comprehensive fetch command that checks for ALL language files
    const fetchCommands = [
      'cd /home/ec2-user/app',

      // First, get directory structure
      'echo "===DIRECTORIES_START==="',
      'ls -la | grep "^d" | awk \'{print $NF}\' | tail -n +3 || echo "NONE"',
      'echo "===DIRECTORIES_END==="',

      // Get file list (top level)
      'echo "===FILE_LIST_START==="',
      'find . -maxdepth 2 -type f -not -path "*/.*" | head -50 || echo "NONE"',
      'echo "===FILE_LIST_END==="',

      // VERSION FILES (CRITICAL for accurate version detection)
      'echo "===NVMRC_START==="',
      'cat .nvmrc 2>/dev/null || echo "NOT_FOUND"',
      'echo "===NVMRC_END==="',

      'echo "===NODE_VERSION_START==="',
      'cat .node-version 2>/dev/null || echo "NOT_FOUND"',
      'echo "===NODE_VERSION_END==="',

      'echo "===PYTHON_VERSION_START==="',
      'cat .python-version 2>/dev/null || echo "NOT_FOUND"',
      'echo "===PYTHON_VERSION_END==="',

      'echo "===RUNTIME_TXT_START==="',
      'cat runtime.txt 2>/dev/null || echo "NOT_FOUND"',
      'echo "===RUNTIME_TXT_END==="',

      'echo "===GO_VERSION_START==="',
      'cat .go-version 2>/dev/null || echo "NOT_FOUND"',
      'echo "===GO_VERSION_END==="',

      'echo "===RUBY_VERSION_START==="',
      'cat .ruby-version 2>/dev/null || echo "NOT_FOUND"',
      'echo "===RUBY_VERSION_END==="',

      // Node.js / JavaScript / TypeScript
      'echo "===PACKAGE_JSON_START==="',
      'cat package.json 2>/dev/null || echo "NOT_FOUND"',
      'echo "===PACKAGE_JSON_END==="',

      'echo "===PACKAGE_LOCK_JSON_START==="',
      'cat package-lock.json 2>/dev/null || echo "NOT_FOUND"',
      'echo "===PACKAGE_LOCK_JSON_END==="',

      'echo "===YARN_LOCK_START==="',
      'cat yarn.lock 2>/dev/null || echo "NOT_FOUND"',
      'echo "===YARN_LOCK_END==="',

      'echo "===PNPM_LOCK_START==="',
      'cat pnpm-lock.yaml 2>/dev/null || echo "NOT_FOUND"',
      'echo "===PNPM_LOCK_END==="',

      'echo "===TSCONFIG_JSON_START==="',
      'cat tsconfig.json 2>/dev/null || echo "NOT_FOUND"',
      'echo "===TSCONFIG_JSON_END==="',

      'echo "===VITE_CONFIG_START==="',
      'cat vite.config.js vite.config.ts 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===VITE_CONFIG_END==="',

      'echo "===WEBPACK_CONFIG_START==="',
      'cat webpack.config.js 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===WEBPACK_CONFIG_END==="',

      'echo "===NEXT_CONFIG_START==="',
      'cat next.config.js next.config.mjs next.config.ts 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===NEXT_CONFIG_END==="',

      'echo "===NUXT_CONFIG_START==="',
      'cat nuxt.config.js nuxt.config.ts 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===NUXT_CONFIG_END==="',

      // Rust
      'echo "===CARGO_TOML_START==="',
      'cat Cargo.toml 2>/dev/null || echo "NOT_FOUND"',
      'echo "===CARGO_TOML_END==="',

      'echo "===CARGO_LOCK_START==="',
      'cat Cargo.lock 2>/dev/null | head -200 || echo "NOT_FOUND"',
      'echo "===CARGO_LOCK_END==="',

      'echo "===MAIN_RS_START==="',
      'cat src/main.rs 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===MAIN_RS_END==="',

      'echo "===LIB_RS_START==="',
      'cat src/lib.rs 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===LIB_RS_END==="',

      // Solana Anchor
      'echo "===ANCHOR_TOML_START==="',
      'cat Anchor.toml 2>/dev/null || echo "NOT_FOUND"',
      'echo "===ANCHOR_TOML_END==="',

      // Go
      'echo "===GO_MOD_START==="',
      'cat go.mod 2>/dev/null || echo "NOT_FOUND"',
      'echo "===GO_MOD_END==="',

      'echo "===GO_SUM_START==="',
      'cat go.sum 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===GO_SUM_END==="',

      'echo "===MAIN_GO_START==="',
      'cat main.go cmd/main.go 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===MAIN_GO_END==="',

      // Python
      'echo "===REQUIREMENTS_TXT_START==="',
      'cat requirements.txt 2>/dev/null || echo "NOT_FOUND"',
      'echo "===REQUIREMENTS_TXT_END==="',

      'echo "===SETUP_PY_START==="',
      'cat setup.py 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===SETUP_PY_END==="',

      'echo "===PYPROJECT_TOML_START==="',
      'cat pyproject.toml 2>/dev/null || echo "NOT_FOUND"',
      'echo "===PYPROJECT_TOML_END==="',

      'echo "===PIPFILE_START==="',
      'cat Pipfile 2>/dev/null || echo "NOT_FOUND"',
      'echo "===PIPFILE_END==="',

      'echo "===MAIN_PY_START==="',
      'cat main.py 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===MAIN_PY_END==="',

      'echo "===APP_PY_START==="',
      'cat app.py 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===APP_PY_END==="',

      'echo "===MANAGE_PY_START==="',
      'cat manage.py 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===MANAGE_PY_END==="',

      // Java
      'echo "===POM_XML_START==="',
      'cat pom.xml 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===POM_XML_END==="',

      'echo "===BUILD_GRADLE_START==="',
      'cat build.gradle build.gradle.kts 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===BUILD_GRADLE_END==="',

      'echo "===GRADLE_PROPERTIES_START==="',
      'cat gradle.properties 2>/dev/null || echo "NOT_FOUND"',
      'echo "===GRADLE_PROPERTIES_END==="',

      'echo "===SETTINGS_GRADLE_START==="',
      'cat settings.gradle settings.gradle.kts 2>/dev/null || echo "NOT_FOUND"',
      'echo "===SETTINGS_GRADLE_END==="',

      // Ruby
      'echo "===GEMFILE_START==="',
      'cat Gemfile 2>/dev/null || echo "NOT_FOUND"',
      'echo "===GEMFILE_END==="',

      'echo "===GEMFILE_LOCK_START==="',
      'cat Gemfile.lock 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===GEMFILE_LOCK_END==="',

      // PHP
      'echo "===COMPOSER_JSON_START==="',
      'cat composer.json 2>/dev/null || echo "NOT_FOUND"',
      'echo "===COMPOSER_JSON_END==="',

      'echo "===COMPOSER_LOCK_START==="',
      'cat composer.lock 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===COMPOSER_LOCK_END==="',

      // .NET
      'echo "===CSPROJ_START==="',
      'find . -maxdepth 2 -name "*.csproj" -exec cat {} \\; 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===CSPROJ_END==="',

      'echo "===SLN_FILE_START==="',
      'find . -maxdepth 2 -name "*.sln" -exec cat {} \\; 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===SLN_FILE_END==="',

      // Docker
      'echo "===DOCKERFILE_START==="',
      'cat Dockerfile 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===DOCKERFILE_END==="',

      'echo "===DOCKER_COMPOSE_START==="',
      'cat docker-compose.yml docker-compose.yaml 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===DOCKER_COMPOSE_END==="',

      // Other
      'echo "===README_START==="',
      'cat README.md README.txt readme.md 2>/dev/null | head -200 || echo "NOT_FOUND"',
      'echo "===README_END==="',

      'echo "===MAKEFILE_START==="',
      'cat Makefile makefile 2>/dev/null | head -100 || echo "NOT_FOUND"',
      'echo "===MAKEFILE_END==="',
    ];

    const sendCmd = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: { commands: fetchCommands },
        TimeoutSeconds: 120,
      })
    );

    const commandId = sendCmd.Command?.CommandId;
    if (!commandId) {
      throw new Error('Failed to get command ID');
    }

    // Wait for completion (increased timeout for comprehensive fetching)
    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const result = await ssmClient.send(
        new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: instanceId })
      );

      if (result.Status === 'Success') {
        const output = result.StandardOutputContent || '';

        // Parse output
        const files: UniversalProjectFiles = {
          detectedLanguages: [],
        };

        const extractContent = (start: string, end: string): string | undefined => {
          const startIdx = output.indexOf(start);
          const endIdx = output.indexOf(end);
          if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            const content = output.substring(startIdx + start.length, endIdx).trim();
            return content !== 'NOT_FOUND' && content !== 'NONE' ? content : undefined;
          }
          return undefined;
        };

        // Extract all files
        files.directories = extractContent('===DIRECTORIES_START===', '===DIRECTORIES_END===')?.split('\n').filter(Boolean);
        files.fileList = extractContent('===FILE_LIST_START===', '===FILE_LIST_END===')?.split('\n').filter(Boolean);

        // VERSION FILES (extract first for priority)
        files.nvmrc = extractContent('===NVMRC_START===', '===NVMRC_END===');
        files.nodeVersion = extractContent('===NODE_VERSION_START===', '===NODE_VERSION_END===');
        files.pythonVersion = extractContent('===PYTHON_VERSION_START===', '===PYTHON_VERSION_END===');
        files.runtimeTxt = extractContent('===RUNTIME_TXT_START===', '===RUNTIME_TXT_END===');
        files.goVersion = extractContent('===GO_VERSION_START===', '===GO_VERSION_END===');
        files.rubyVersion = extractContent('===RUBY_VERSION_START===', '===RUBY_VERSION_END===');

        // Node.js
        files.packageJson = extractContent('===PACKAGE_JSON_START===', '===PACKAGE_JSON_END===');
        files.packageLockJson = extractContent('===PACKAGE_LOCK_JSON_START===', '===PACKAGE_LOCK_JSON_END===');
        files.yarnLock = extractContent('===YARN_LOCK_START===', '===YARN_LOCK_END===');
        files.pnpmLock = extractContent('===PNPM_LOCK_START===', '===PNPM_LOCK_END===');
        files.tsconfigJson = extractContent('===TSCONFIG_JSON_START===', '===TSCONFIG_JSON_END===');
        files.viteConfig = extractContent('===VITE_CONFIG_START===', '===VITE_CONFIG_END===');
        files.webpackConfig = extractContent('===WEBPACK_CONFIG_START===', '===WEBPACK_CONFIG_END===');
        files.nextConfig = extractContent('===NEXT_CONFIG_START===', '===NEXT_CONFIG_END===');
        files.nuxtConfig = extractContent('===NUXT_CONFIG_START===', '===NUXT_CONFIG_END===');

        // Rust
        files.cargoToml = extractContent('===CARGO_TOML_START===', '===CARGO_TOML_END===');
        files.cargoLock = extractContent('===CARGO_LOCK_START===', '===CARGO_LOCK_END===');
        files.mainRs = extractContent('===MAIN_RS_START===', '===MAIN_RS_END===');
        files.libRs = extractContent('===LIB_RS_START===', '===LIB_RS_END===');
        files.anchorToml = extractContent('===ANCHOR_TOML_START===', '===ANCHOR_TOML_END===');

        // Go
        files.goMod = extractContent('===GO_MOD_START===', '===GO_MOD_END===');
        files.goSum = extractContent('===GO_SUM_START===', '===GO_SUM_END===');
        files.mainGo = extractContent('===MAIN_GO_START===', '===MAIN_GO_END===');

        // Python
        files.requirementsTxt = extractContent('===REQUIREMENTS_TXT_START===', '===REQUIREMENTS_TXT_END===');
        files.setupPy = extractContent('===SETUP_PY_START===', '===SETUP_PY_END===');
        files.pyprojectToml = extractContent('===PYPROJECT_TOML_START===', '===PYPROJECT_TOML_END===');
        files.pipfile = extractContent('===PIPFILE_START===', '===PIPFILE_END===');
        files.mainPy = extractContent('===MAIN_PY_START===', '===MAIN_PY_END===');
        files.appPy = extractContent('===APP_PY_START===', '===APP_PY_END===');
        files.managePy = extractContent('===MANAGE_PY_START===', '===MANAGE_PY_END===');

        // Java
        files.pomXml = extractContent('===POM_XML_START===', '===POM_XML_END===');
        files.buildGradle = extractContent('===BUILD_GRADLE_START===', '===BUILD_GRADLE_END===');
        files.gradleProperties = extractContent('===GRADLE_PROPERTIES_START===', '===GRADLE_PROPERTIES_END===');
        files.settingsGradle = extractContent('===SETTINGS_GRADLE_START===', '===SETTINGS_GRADLE_END===');

        // Ruby
        files.gemfile = extractContent('===GEMFILE_START===', '===GEMFILE_END===');
        files.gemfileLock = extractContent('===GEMFILE_LOCK_START===', '===GEMFILE_LOCK_END===');

        // PHP
        files.composerJson = extractContent('===COMPOSER_JSON_START===', '===COMPOSER_JSON_END===');
        files.composerLock = extractContent('===COMPOSER_LOCK_START===', '===COMPOSER_LOCK_END===');

        // .NET
        files.csproj = extractContent('===CSPROJ_START===', '===CSPROJ_END===');
        files.slnFile = extractContent('===SLN_FILE_START===', '===SLN_FILE_END===');

        // Docker
        files.dockerfile = extractContent('===DOCKERFILE_START===', '===DOCKERFILE_END===');
        files.dockerCompose = extractContent('===DOCKER_COMPOSE_START===', '===DOCKER_COMPOSE_END===');

        // Other
        files.readme = extractContent('===README_START===', '===README_END===');
        files.makeFile = extractContent('===MAKEFILE_START===', '===MAKEFILE_END===');

        // Detect languages
        const detectedLanguages: string[] = [];
        if (files.cargoToml) detectedLanguages.push('Rust');
        if (files.goMod) detectedLanguages.push('Go');
        if (files.requirementsTxt || files.setupPy || files.pyprojectToml) detectedLanguages.push('Python');
        if (files.packageJson) detectedLanguages.push('Node.js/JavaScript/TypeScript');
        if (files.pomXml || files.buildGradle) detectedLanguages.push('Java');
        if (files.gemfile) detectedLanguages.push('Ruby');
        if (files.composerJson) detectedLanguages.push('PHP');
        if (files.csproj || files.slnFile) detectedLanguages.push('.NET/C#');
        if (files.anchorToml) detectedLanguages.push('Solana/Anchor');

        files.detectedLanguages = detectedLanguages;

        console.log('[UNIVERSAL-FETCH] ✓ Files fetched successfully');
        console.log('[UNIVERSAL-FETCH] Detected languages:', detectedLanguages.join(', ') || 'Unknown');
        console.log('[UNIVERSAL-FETCH] Found files:', Object.keys(files).filter(k => files[k as keyof UniversalProjectFiles] && k !== 'detectedLanguages').join(', '));

        return files;
      } else if (result.Status === 'Failed') {
        console.error('[UNIVERSAL-FETCH] Command failed:', result.StandardErrorContent);
        throw new Error('Failed to fetch files: ' + result.StandardErrorContent);
      }
    }

    throw new Error('Timeout fetching files');
  } catch (error: any) {
    console.error('[UNIVERSAL-FETCH] Error fetching repository files:', error);
    return { detectedLanguages: [] };
  }
}

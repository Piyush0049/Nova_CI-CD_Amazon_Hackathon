/**
 * GitHub Universal File Fetcher
 * Fetches project files from GitHub API for ANY language
 */

import { UniversalProjectFiles } from './universal-file-fetcher';

/**
 * Fetch universal project files from GitHub repository
 */
export async function fetchUniversalProjectFilesFromGitHub(
  owner: string,
  repo: string,
  githubToken?: string
): Promise<UniversalProjectFiles> {
  const files: UniversalProjectFiles = {
    detectedLanguages: [],
  };

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3.raw',
  };

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  // List of all files to fetch
  const filesToFetch = [
    // Node.js
    { key: 'packageJson', path: 'package.json' },
    { key: 'packageLockJson', path: 'package-lock.json' },
    { key: 'yarnLock', path: 'yarn.lock' },
    { key: 'pnpmLock', path: 'pnpm-lock.yaml' },
    { key: 'tsconfigJson', path: 'tsconfig.json' },
    { key: 'viteConfig', path: 'vite.config.js' },
    { key: 'viteConfig', path: 'vite.config.ts' },
    { key: 'webpackConfig', path: 'webpack.config.js' },
    { key: 'nextConfig', path: 'next.config.js' },
    { key: 'nextConfig', path: 'next.config.mjs' },
    { key: 'nuxtConfig', path: 'nuxt.config.js' },

    // Rust
    { key: 'cargoToml', path: 'Cargo.toml' },
    { key: 'cargoLock', path: 'Cargo.lock' },
    { key: 'mainRs', path: 'src/main.rs' },
    { key: 'libRs', path: 'src/lib.rs' },
    { key: 'anchorToml', path: 'Anchor.toml' },

    // Go
    { key: 'goMod', path: 'go.mod' },
    { key: 'goSum', path: 'go.sum' },
    { key: 'mainGo', path: 'main.go' },
    { key: 'mainGo', path: 'cmd/main.go' },

    // Python
    { key: 'requirementsTxt', path: 'requirements.txt' },
    { key: 'setupPy', path: 'setup.py' },
    { key: 'pyprojectToml', path: 'pyproject.toml' },
    { key: 'pipfile', path: 'Pipfile' },
    { key: 'mainPy', path: 'main.py' },
    { key: 'appPy', path: 'app.py' },
    { key: 'managePy', path: 'manage.py' },

    // Java
    { key: 'pomXml', path: 'pom.xml' },
    { key: 'buildGradle', path: 'build.gradle' },
    { key: 'buildGradle', path: 'build.gradle.kts' },
    { key: 'gradleProperties', path: 'gradle.properties' },
    { key: 'settingsGradle', path: 'settings.gradle' },

    // Ruby
    { key: 'gemfile', path: 'Gemfile' },
    { key: 'gemfileLock', path: 'Gemfile.lock' },

    // PHP
    { key: 'composerJson', path: 'composer.json' },
    { key: 'composerLock', path: 'composer.lock' },

    // .NET
    { key: 'csproj', path: 'project.csproj' },
    { key: 'csproj', path: 'app.csproj' },
    { key: 'slnFile', path: 'solution.sln' },

    // Docker
    { key: 'dockerfile', path: 'Dockerfile' },
    { key: 'dockerCompose', path: 'docker-compose.yml' },
    { key: 'dockerCompose', path: 'docker-compose.yaml' },

    // Other
    { key: 'readme', path: 'README.md' },
    { key: 'readme', path: 'README.txt' },
    { key: 'makeFile', path: 'Makefile' },
  ];

  console.log('[GITHUB-FETCH] Fetching files from GitHub:', `${owner}/${repo}`);

  // Fetch all files in parallel
  const fetchPromises = filesToFetch.map(async ({ key, path }) => {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        { headers }
      );

      if (response.ok) {
        const content = await response.text();
        return { key, content, path };
      }
    } catch (error) {
      // File doesn't exist, skip
    }
    return null;
  });

  const results = await Promise.all(fetchPromises);

  // Collect found files
  const foundFiles: string[] = [];

  results.forEach((result) => {
    if (result && result.content) {
      // Merge content if key already exists (e.g., viteConfig from .js or .ts)
      const currentValue = (files as any)[result.key];
      if (!currentValue) {
        (files as any)[result.key] = result.content;
        foundFiles.push(result.path);
      }
    }
  });

  // Also fetch repository tree to get directory structure
  try {
    const treeResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`,
      { headers }
    ).catch(() =>
      fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`,
        { headers }
      )
    );

    if (treeResponse.ok) {
      const tree = await treeResponse.json();
      const treeFiles = tree.tree || [];

      const directories = new Set<string>();
      const fileList: string[] = [];

      treeFiles.forEach((file: any) => {
        if (file.type === 'tree') {
          directories.add(file.path);
        } else if (file.type === 'blob') {
          fileList.push(file.path);
        }
      });

      files.directories = Array.from(directories).slice(0, 50);
      files.fileList = fileList.slice(0, 100);
    }
  } catch (error) {
    console.warn('[GITHUB-FETCH] Could not fetch repository tree');
  }

  // Detect languages based on found files
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

  console.log('[GITHUB-FETCH] ✓ Files fetched from GitHub');
  console.log('[GITHUB-FETCH] Detected languages:', detectedLanguages.join(', ') || 'None detected');
  console.log('[GITHUB-FETCH] Found files:', foundFiles.slice(0, 10).join(', ') || 'None');
  console.log('[GITHUB-FETCH] Total files found:', foundFiles.length);

  // If no files were found, log a warning
  if (foundFiles.length === 0) {
    console.warn('[GITHUB-FETCH] ⚠️ No project files found! Repository might be empty or private.');
  }

  return files;
}

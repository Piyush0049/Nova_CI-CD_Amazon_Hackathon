/**
 * Universal Language Analyzer using Claude Sonnet AI
 * Supports ALL major languages and frameworks
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { UniversalProjectFiles } from './universal-file-fetcher';
import { extractPortFromSource as enhancedExtractPort, detectPortWithFallback } from './enhanced-port-detector';

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export interface UniversalProjectAnalysis {
  language: string; // 'Rust', 'Go', 'Python', 'Node.js', 'Java', etc.
  framework: string; // 'Rocket', 'Actix', 'FastAPI', 'Next.js', 'Spring Boot', etc.
  projectType: 'frontend' | 'backend' | 'fullstack' | 'library' | 'cli' | 'smart-contract';
  buildTool: string; // 'cargo', 'go', 'npm', 'maven', 'gradle', 'pip', etc.
  packageManager: string;

  // Commands (language-specific)
  installCommand: string;
  buildCommand: string;
  testCommand: string;
  lintCommand: string;
  startCommand: string;

  // Deployment details
  outputDir: string; // 'target/release', 'dist', 'build', 'bin', etc.
  port: string;
  needsRuntime: boolean; // true for Node.js, Python; false for Rust, Go
  runtimeVersion?: string; // 'node 20', 'python 3.11', etc.

  // DYNAMIC VERSION DETECTION (AI-detected from project files)
  pythonVersion?: string; // '3.11', '3.10', '3.9' (from runtime.txt, .python-version, or code analysis)
  nodeVersion?: string; // '20', '18', '16' (from .nvmrc, package.json engines, or default)
  goVersion?: string; // '1.22', '1.21' (from go.mod)
  javaVersion?: string; // '17', '11', '8' (from pom.xml, build.gradle)
  rubyVersion?: string; // '3.2', '3.1' (from .ruby-version, Gemfile)
  phpVersion?: string; // '8.2', '8.1' (from composer.json)

  // Advanced features
  hasTests: boolean;
  hasLinter: boolean;
  hasDocker: boolean;
  hasDatabase: boolean;
  needsEnvVars: string[];

  // Dependencies
  dependencies: {
    production: string[];
    dev: string[];
  };

  // Solana-specific
  isSolanaProject: boolean;
  hasAnchor: boolean;

  // Build configuration
  buildOptimizations: string[];
  estimatedBuildTime: string;

  // Recommendations
  recommendations: string[];
  warnings: string[];
}

/**
 * Analyze project using Claude Sonnet AI with universal language support
 */
export async function analyzeUniversalProject(
  files: UniversalProjectFiles
): Promise<UniversalProjectAnalysis> {
  console.log('[UNIVERSAL-ANALYZER] Starting universal project analysis...');
  console.log('[UNIVERSAL-ANALYZER] Detected languages:', files.detectedLanguages.join(', ') || 'Unknown');

  // Log version files found (critical for debugging)
  console.log('[UNIVERSAL-ANALYZER] ═══════════════════════════════════════════');
  console.log('[UNIVERSAL-ANALYZER] 📁 VERSION FILES IN REPOSITORY:');
  const versionFiles = [];
  if (files.nvmrc) versionFiles.push('.nvmrc (Node.js: ' + files.nvmrc.trim().split('\n')[0] + ')');
  if (files.nodeVersion) versionFiles.push('.node-version (Node.js: ' + files.nodeVersion.trim().split('\n')[0] + ')');
  if (files.pythonVersion) versionFiles.push('.python-version (Python: ' + files.pythonVersion.trim().split('\n')[0] + ')');
  if (files.runtimeTxt) versionFiles.push('runtime.txt (Python: ' + files.runtimeTxt.trim().split('\n')[0] + ')');
  if (files.goVersion) versionFiles.push('.go-version (Go: ' + files.goVersion.trim().split('\n')[0] + ')');
  if (files.rubyVersion) versionFiles.push('.ruby-version (Ruby: ' + files.rubyVersion.trim().split('\n')[0] + ')');

  if (versionFiles.length > 0) {
    versionFiles.forEach(vf => console.log('[UNIVERSAL-ANALYZER]   ✓', vf));
  } else {
    console.log('[UNIVERSAL-ANALYZER]   ⚠️ No version files found - will analyze manifests and code');
  }
  console.log('[UNIVERSAL-ANALYZER] ═══════════════════════════════════════════');

  try {
    const prompt = buildUniversalAnalysisPrompt(files);
    const response = await invokeNovaPremier(prompt);
    const analysis = parseAnalysis(response, files);

    console.log('[UNIVERSAL-ANALYZER] ✓ Analysis complete');
    console.log('[UNIVERSAL-ANALYZER] ═══════════════════════════════════════════');
    console.log('[UNIVERSAL-ANALYZER] 📊 PROJECT DETECTION RESULTS:');
    console.log('[UNIVERSAL-ANALYZER]   - Language:', analysis.language);
    console.log('[UNIVERSAL-ANALYZER]   - Framework:', analysis.framework);
    console.log('[UNIVERSAL-ANALYZER]   - Project Type:', analysis.projectType);
    console.log('[UNIVERSAL-ANALYZER]   - Build tool:', analysis.buildTool);
    console.log('[UNIVERSAL-ANALYZER]   - Output dir:', analysis.outputDir);
    console.log('[UNIVERSAL-ANALYZER] ═══════════════════════════════════════════');

    // VERSION DETECTION RESULTS (show prominently)
    console.log('[UNIVERSAL-ANALYZER] ═══════════════════════════════════════════');
    console.log('[UNIVERSAL-ANALYZER] 🔢 DETECTED VERSIONS (AI-analyzed):');
    if (analysis.pythonVersion) {
      console.log('[UNIVERSAL-ANALYZER]   - Python:', analysis.pythonVersion);
    }
    if (analysis.nodeVersion) {
      console.log('[UNIVERSAL-ANALYZER]   - Node.js:', analysis.nodeVersion);
    }
    if (analysis.goVersion) {
      console.log('[UNIVERSAL-ANALYZER]   - Go:', analysis.goVersion);
    }
    if (analysis.javaVersion) {
      console.log('[UNIVERSAL-ANALYZER]   - Java:', analysis.javaVersion);
    }
    if (analysis.rubyVersion) {
      console.log('[UNIVERSAL-ANALYZER]   - Ruby:', analysis.rubyVersion);
    }
    if (analysis.phpVersion) {
      console.log('[UNIVERSAL-ANALYZER]   - PHP:', analysis.phpVersion);
    }
    if (!analysis.pythonVersion && !analysis.nodeVersion && !analysis.goVersion && !analysis.javaVersion && !analysis.rubyVersion && !analysis.phpVersion) {
      console.log('[UNIVERSAL-ANALYZER]   ⚠️ No specific versions detected - will use defaults');
    }
    console.log('[UNIVERSAL-ANALYZER] ═══════════════════════════════════════════');

    console.log('[UNIVERSAL-ANALYZER] Install:', analysis.installCommand);
    console.log('[UNIVERSAL-ANALYZER] Build:', analysis.buildCommand);
    console.log('[UNIVERSAL-ANALYZER] Start:', analysis.startCommand);
    console.log('[UNIVERSAL-ANALYZER] Port:', analysis.port);

    return analysis;
  } catch (error: any) {
    console.error('[UNIVERSAL-ANALYZER] Error:', error.message);
    return getFallbackAnalysis(files);
  }
}

/**
 * Build comprehensive analysis prompt for Claude Sonnet
 */
function buildUniversalAnalysisPrompt(files: UniversalProjectFiles): string {
  let fileContents = '';

  // Add detected languages
  fileContents += `=== DETECTED LANGUAGES ===\n`;
  fileContents += files.detectedLanguages.join(', ') || 'Unknown';
  fileContents += '\n\n';

  // VERSION FILES (SHOW PROMINENTLY AT TOP FOR AI TO SEE FIRST!)
  fileContents += `═══════════════════════════════════════════════════════════════════\n`;
  fileContents += `🔢 VERSION FILES (CRITICAL - USE THESE FOR VERSION DETECTION!)\n`;
  fileContents += `═══════════════════════════════════════════════════════════════════\n\n`;

  if (files.nvmrc) {
    fileContents += `### .nvmrc (Node.js version)\n\`\`\`\n${files.nvmrc}\n\`\`\`\n`;
    fileContents += `👉 USE THIS FOR nodeVersion!\n\n`;
  }

  if (files.nodeVersion) {
    fileContents += `### .node-version (Node.js version)\n\`\`\`\n${files.nodeVersion}\n\`\`\`\n`;
    fileContents += `👉 USE THIS FOR nodeVersion!\n\n`;
  }

  if (files.pythonVersion) {
    fileContents += `### .python-version (Python version)\n\`\`\`\n${files.pythonVersion}\n\`\`\`\n`;
    fileContents += `👉 USE THIS FOR pythonVersion!\n\n`;
  }

  if (files.runtimeTxt) {
    fileContents += `### runtime.txt (Python version - Heroku style)\n\`\`\`\n${files.runtimeTxt}\n\`\`\`\n`;
    fileContents += `👉 USE THIS FOR pythonVersion! (extract version number)\n\n`;
  }

  if (files.goVersion) {
    fileContents += `### .go-version (Go version)\n\`\`\`\n${files.goVersion}\n\`\`\`\n`;
    fileContents += `👉 USE THIS FOR goVersion!\n\n`;
  }

  if (files.rubyVersion) {
    fileContents += `### .ruby-version (Ruby version)\n\`\`\`\n${files.rubyVersion}\n\`\`\`\n`;
    fileContents += `👉 USE THIS FOR rubyVersion!\n\n`;
  }

  if (!files.nvmrc && !files.nodeVersion && !files.pythonVersion && !files.runtimeTxt && !files.goVersion && !files.rubyVersion) {
    fileContents += `⚠️ NO VERSION FILES FOUND - Will need to detect from manifest files or use defaults\n\n`;
  }

  fileContents += `═══════════════════════════════════════════════════════════════════\n\n`;

  // Add directory structure
  if (files.directories && files.directories.length > 0) {
    fileContents += `=== DIRECTORY STRUCTURE ===\n`;
    fileContents += files.directories.join(', ');
    fileContents += '\n\n';
  }

  // Add file list
  if (files.fileList && files.fileList.length > 0) {
    fileContents += `=== FILE LIST (Top Level) ===\n`;
    fileContents += files.fileList.slice(0, 30).join('\n');
    fileContents += '\n\n';

    // CRITICAL: Analyze file list for frontend indicators
    const hasIndexHtml = files.fileList.some(f => f.toLowerCase().includes('index.html'));
    const hasViteConfig = files.fileList.some(f => f.toLowerCase().includes('vite.config'));
    const hasTailwindConfig = files.fileList.some(f => f.toLowerCase().includes('tailwind.config'));
    const hasPublicFolder = files.fileList.some(f => f.toLowerCase().includes('./public'));
    const hasSrcFolder = files.fileList.some(f => f.toLowerCase().includes('./src'));

    if (hasIndexHtml || hasViteConfig) {
      fileContents += `⚠️⚠️⚠️ CRITICAL FRONTEND INDICATORS DETECTED ⚠️⚠️⚠️\n`;
      if (hasIndexHtml) fileContents += `✓ index.html FOUND → This is a FRONTEND project!\n`;
      if (hasViteConfig) fileContents += `✓ vite.config.* FOUND → This is a FRONTEND project!\n`;
      if (hasTailwindConfig) fileContents += `✓ tailwind.config.js FOUND → Frontend styling framework!\n`;
      if (hasPublicFolder) fileContents += `✓ public/ folder FOUND → Static assets folder (frontend)!\n`;
      if (hasSrcFolder) fileContents += `✓ src/ folder FOUND → Source code folder!\n`;
      fileContents += `\n`;
      fileContents += `🚨 DO NOT classify this as Express.js or backend!\n`;
      fileContents += `🚨 This is a Vite FRONTEND project even if Express exists in server/ folder!\n`;
      fileContents += `🚨 Framework should be: "Vite" or "Vite + React"\n`;
      fileContents += `🚨 Project Type should be: "frontend"\n`;
      fileContents += `\n`;
    }
  }

  // Add all file contents
  fileContents += `=== PROJECT FILES ===\n\n`;

  // Rust files
  if (files.cargoToml) {
    fileContents += `### Cargo.toml\n\`\`\`toml\n${files.cargoToml}\n\`\`\`\n\n`;
  }
  if (files.mainRs) {
    fileContents += `### src/main.rs\n\`\`\`rust\n${files.mainRs}\n\`\`\`\n\n`;
  }
  if (files.libRs) {
    fileContents += `### src/lib.rs\n\`\`\`rust\n${files.libRs}\n\`\`\`\n\n`;
  }
  if (files.anchorToml) {
    fileContents += `### Anchor.toml\n\`\`\`toml\n${files.anchorToml}\n\`\`\`\n\n`;
  }

  // Go files
  if (files.goMod) {
    fileContents += `### go.mod\n\`\`\`\n${files.goMod}\n\`\`\`\n\n`;
  }
  if (files.mainGo) {
    fileContents += `### main.go\n\`\`\`go\n${files.mainGo}\n\`\`\`\n\n`;
  }

  // Python files
  if (files.requirementsTxt) {
    fileContents += `### requirements.txt\n\`\`\`\n${files.requirementsTxt}\n\`\`\`\n\n`;
  }
  if (files.pyprojectToml) {
    fileContents += `### pyproject.toml\n\`\`\`toml\n${files.pyprojectToml}\n\`\`\`\n\n`;
  }
  if (files.mainPy) {
    fileContents += `### main.py\n\`\`\`python\n${files.mainPy}\n\`\`\`\n\n`;
  }
  if (files.appPy) {
    fileContents += `### app.py\n\`\`\`python\n${files.appPy}\n\`\`\`\n\n`;
  }

  // Node.js files
  if (files.packageJson) {
    fileContents += `### package.json\n\`\`\`json\n${files.packageJson}\n\`\`\`\n\n`;
  }
  if (files.tsconfigJson) {
    fileContents += `### tsconfig.json\n\`\`\`json\n${files.tsconfigJson}\n\`\`\`\n\n`;
  }

  // Java files
  if (files.pomXml) {
    fileContents += `### pom.xml\n\`\`\`xml\n${files.pomXml}\n\`\`\`\n\n`;
  }
  if (files.buildGradle) {
    fileContents += `### build.gradle\n\`\`\`groovy\n${files.buildGradle}\n\`\`\`\n\n`;
  }

  // Ruby files
  if (files.gemfile) {
    fileContents += `### Gemfile\n\`\`\`ruby\n${files.gemfile}\n\`\`\`\n\n`;
  }

  // PHP files
  if (files.composerJson) {
    fileContents += `### composer.json\n\`\`\`json\n${files.composerJson}\n\`\`\`\n\n`;
  }

  // Docker
  if (files.dockerfile) {
    fileContents += `### Dockerfile\n\`\`\`dockerfile\n${files.dockerfile}\n\`\`\`\n\n`;
  }

  // README
  if (files.readme) {
    fileContents += `### README\n\`\`\`\n${files.readme.slice(0, 1000)}\n\`\`\`\n\n`;
  }

  return `You are Claude Sonnet - the MOST POWERFUL AI model specialized in DevOps, multi-language deployment, and infrastructure automation.

${fileContents}

═══════════════════════════════════════════════════════════════════
🎯 YOUR MISSION: UNIVERSAL PROJECT ANALYSIS
═══════════════════════════════════════════════════════════════════

Analyze this project and determine the EXACT deployment strategy for ANY language/framework.

You MUST identify:
1. Primary language and framework
2. Build tool and package manager
3. EXACT commands to install, build, test, and run
4. Runtime requirements (if any)
5. Output directory and binary location
6. Port configuration
7. Environment variables needed

═══════════════════════════════════════════════════════════════════
🚨 STEP 0: CHECK FOR FRONTEND PROJECT FIRST (HIGHEST PRIORITY!)
═══════════════════════════════════════════════════════════════════

**BEFORE checking any other language rules, YOU MUST check if this is a frontend project:**

**FRONTEND DETECTION RULES (CHECK THESE FIRST!):**

1. **Check FILE LIST above for these files:**
   - index.html → 99% chance this is FRONTEND
   - vite.config.ts or vite.config.js → FRONTEND (Vite project)
   - tailwind.config.js → FRONTEND (Tailwind CSS)
   - public/ folder → FRONTEND (static assets)

2. **If index.html OR vite.config.* exists:**
   - **framework**: "Vite" or "Vite + React" (NOT "Express.js"!)
   - **projectType**: "frontend" (NOT "backend"!)
   - **buildCommand**: "npm run build"
   - **startCommand**: "echo \"Static files served by Nginx\""
   - **outputDir**: "dist"
   - **port**: "80"

3. **Common mistake to AVOID:**
   - ❌ WRONG: Seeing Express.js in server/ folder → classifying as "Express.js backend"
   - ✅ CORRECT: If index.html exists → It's a "Vite frontend" (Express is just for dev server or API)

4. **If you see BOTH index.html AND Express:**
   - The project is FRONTEND (Vite)
   - Express is either:
     - A dev dependency for local testing
     - Backend API in server/ folder (but project type is still "frontend")
   - **YOU MUST classify as FRONTEND, not backend!**

**Example of CORRECT detection:**
\`\`\`
Files: index.html, vite.config.ts, src/, public/, server/index.js (has Express)
                                                    ↓
Correct: framework="Vite + React", projectType="frontend"
Wrong: framework="Express.js", projectType="backend"  ← DON'T DO THIS!
\`\`\`

═══════════════════════════════════════════════════════════════════
🔍 LANGUAGE DETECTION RULES (Priority Order):
═══════════════════════════════════════════════════════════════════

🦀 **RUST DETECTION:**
- Files: Cargo.toml, Cargo.lock, src/main.rs, src/lib.rs
- Framework detection:
  * "rocket" in dependencies → Rocket web framework
  * "actix-web" in dependencies → Actix Web
  * "axum" in dependencies → Axum
  * "warp" in dependencies → Warp
  * Anchor.toml present → Solana smart contract (Anchor framework)
  * [[bin]] in Cargo.toml → CLI application
  * [lib] in Cargo.toml → Library
- Build tool: cargo
- Install dependencies: echo "Dependencies handled by cargo"
- Build: \`cargo build --release\`
- Test: \`cargo test\`
- Lint: \`cargo clippy\`
- Output: \`target/release/<binary_name>\` (binary name from Cargo.toml [package] name)
- Start: \`./target/release/<binary_name>\` (for web servers)
- Port: **MUST SCAN src/main.rs or src/lib.rs for actual bind address** - look for:
  * \`.bind("127.0.0.1:PORT")\` or \`.bind("0.0.0.0:PORT")\`
  * \`TcpListener::bind("0.0.0.0:PORT")\`
  * If not found, default to "8000"
- Project type:
  * Smart contract if Anchor.toml exists
  * Backend if actix-web/rocket/axum/warp
  * CLI if [[bin]] section exists
  * Library if [lib] section exists
- Needs runtime: NO (compiled binary - Rust is compiled ahead of time)
- Special notes:
  * Rust builds can take 5-15 minutes
  * Rust toolchain is installed in the 'install-runtime' stage separately
  * For dependencies: cargo automatically fetches crates, use: echo "Cargo will fetch dependencies during build"
  * For Solana: need \`solana-cli\` and \`anchor-cli\`

🐹 **GO DETECTION:**
- Files: go.mod, go.sum, main.go, .go-version
- Framework detection:
  * "github.com/gin-gonic/gin" → Gin web framework
  * "github.com/gofiber/fiber" → Fiber
  * "github.com/gorilla/mux" → Gorilla Mux
  * "net/http" imports → Standard library HTTP server
- **VERSION DETECTION (CRITICAL!):**
  * Check go.mod: "go 1.22" → use 1.22
  * Check .go-version: "1.21.5" → use 1.21
  * If using generics → requires 1.18+
  * DEFAULT: 1.22 (latest stable)
- Build tool: go
- Install: Download specific Go version
- Build: \`go build -o app .\` or \`go build -o bin/server cmd/main.go\`
- Test: \`go test ./...\`
- Lint: \`go vet ./...\`
- Output: \`./app\` or \`./bin/server\` (binary)
- Start: \`./app\`
- Port: **MUST SCAN main.go for actual port** - look for:
  * \`http.ListenAndServe(":PORT", handler)\`
  * \`router.Run(":PORT")\`
  * \`fmt.Sprintf(":%d", PORT)\`
  * If not found, default to "8080"
- Project type: backend (usually)
- Needs runtime: NO (compiled binary)
- Go version: DETECTED_VERSION (e.g., "1.22")

🐍 **PYTHON DETECTION:**
- Files: requirements.txt, setup.py, pyproject.toml, app.py, main.py, runtime.txt, .python-version
- Framework detection:
  * "fastapi" in requirements → FastAPI
  * "flask" in requirements → Flask
  * "django" in requirements → Django
  * "uvicorn" in requirements → ASGI server for FastAPI
- **VERSION DETECTION (CRITICAL!):**
  * Check runtime.txt: "python-3.11" → use 3.11
  * Check .python-version: "3.10.5" → use 3.10
  * Check pyproject.toml: requires-python = ">=3.11" → use 3.11
  * Scan code for modern type hints (str | None) → requires 3.10+
  * If using match/case statements → requires 3.10+
  * DEFAULT: 3.11 (modern apps), 3.9 (legacy apps)
- Build tool: pip
- Install: \`pip3 install -r requirements.txt\`
- Build: NONE (interpreted)
- Test: \`pytest\` or \`python -m pytest\`
- Lint: \`flake8\` or \`pylint\`
- Start:
  * FastAPI: \`uvicorn main:app --host 0.0.0.0 --port PORT\` (check main.py/app.py for actual port)
  * Flask: \`python app.py\` or \`flask run --host=0.0.0.0 --port PORT\`
  * Django: \`python manage.py runserver 0.0.0.0:PORT\`
- Output: NONE (source code runs directly)
- Port: **MUST SCAN main.py/app.py for actual port** - look for:
  * \`uvicorn.run(app, port=PORT)\`
  * \`app.run(host="0.0.0.0", port=PORT)\`
  * \`if __name__ == "__main__": uvicorn.run("main:app", port=PORT)\`
- Project type: backend
- Needs runtime: YES (Python 3.9+)
- Python version: DETECTED_VERSION (e.g., "3.11")

📦 **NODE.JS DETECTION:**
- Files: package.json, package-lock.json, yarn.lock, pnpm-lock.yaml, .nvmrc, .node-version
- **CRITICAL: FRONTEND vs BACKEND DETECTION PRIORITY:**

  **STEP 1: Check for FRONTEND indicators FIRST:**
  * Check FILE LIST for: index.html, vite.config.ts, vite.config.js, App.tsx, App.jsx
  * If "vite" in dependencies AND (index.html OR vite.config.* exists) → **Vite frontend (SPA)**
  * If "react-scripts" in dependencies → **Create React App frontend**
  * If "next" in dependencies → **Next.js fullstack**

  **STEP 2: Only if NO frontend indicators, check for BACKEND:**
  * If "express" in dependencies → **Express.js backend**
  * If "@nestjs/core" in dependencies → **NestJS backend**
  * If "fastify" in dependencies → **Fastify backend**

  **DISAMBIGUATION RULE:**
  * If BOTH "vite" AND "express" exist in dependencies:
    → Check for index.html or vite.config.* in file list
    → If found → **Frontend (Vite)** - Express is likely just a dev dependency
    → If NOT found → **Backend (Express)** with Vite for tooling

- Framework detection priority order:
  1. "vite" + (index.html OR vite.config.*) → **Vite + React (frontend SPA)**
  2. "next" in dependencies → **Next.js (fullstack SSR)**
  3. "react-scripts" → **Create React App (frontend)**
  4. "express" (only if no frontend markers) → **Express.js (backend)**
  5. "@nestjs/core" → **NestJS (backend)**

- **VERSION DETECTION (CRITICAL!):**
  * Check .nvmrc: "20.10.0" → use 20
  * Check .node-version: "18" → use 18
  * Check package.json "engines": {"node": ">=20"} → use 20
  * Check package.json "engines": {"node": "18.x"} → use 18
  * If using ES modules (type: "module") → requires 14+
  * DEFAULT: 20 (modern apps), 18 (stable LTS)

- Build tool: npm, yarn, or pnpm
- Install: \`npm install --force --include=dev\`
- Build:
  * **Vite (FRONTEND)**: \`npm run build\` (outputs to dist/)
  * **Next.js (FULLSTACK)**: \`npm run build\` (outputs to .next/)
  * **CRA (FRONTEND)**: \`npm run build\` (outputs to build/)
  * **Express (BACKEND)**: \`npm run build\` (if TypeScript) or echo "No build needed"
- Test: \`npm test\`
- Lint: \`npm run lint\`
- Start:
  * **Vite (FRONTEND)**: \`echo "Static files served by Nginx"\` - DO NOT use npm start!
  * **Next.js (FULLSTACK)**: \`npm start\` (serves .next/)
  * **Express (BACKEND)**: \`node index.js\` or \`npm start\`
- Output:
  * **Vite**: dist/ (static HTML/CSS/JS)
  * **Next.js**: .next/ (SSR server)
  * **CRA**: build/ (static files)
  * **Express**: NONE (source runs directly)
- Port:
  * **Vite**: 80 (Nginx serves static files)
  * **Next.js**: 3000
  * **Express**: Scan source for app.listen(PORT) or default 3000
- Project type:
  * **Vite/CRA**: frontend (static SPA)
  * **Next.js**: fullstack (SSR)
  * **Express/Nest**: backend (API server)
- Needs runtime: YES (Node.js 14+)
- Node version: DETECTED_VERSION (e.g., "20")

☕ **JAVA DETECTION:**
- Files: pom.xml (Maven) or build.gradle (Gradle)
- Framework: Spring Boot (most common)
- Build tool: maven or gradle
- Install: \`yum install -y maven\` or install Gradle
- Build:
  * Maven: \`mvn clean package\`
  * Gradle: \`./gradlew build\`
- Test: \`mvn test\` or \`./gradlew test\`
- Output: \`target/*.jar\` (Maven) or \`build/libs/*.jar\` (Gradle)
- Start: \`java -jar target/app.jar\`
- Port: 8080 (Spring Boot default)
- Project type: backend
- Needs runtime: YES (Java JDK 11+)

💎 **RUBY DETECTION:**
- Files: Gemfile, Gemfile.lock
- Framework: Ruby on Rails or Sinatra
- Build tool: bundler
- Install: \`bundle install\`
- Build: NONE (Rails assets: \`rake assets:precompile\`)
- Start: \`rails server\` or \`ruby app.rb\`
- Port: 3000 (Rails)
- Needs runtime: YES (Ruby 3.x)

🐘 **PHP DETECTION:**
- Files: composer.json, composer.lock
- Framework: Laravel, Symfony, or plain PHP
- Build tool: composer
- Install: \`composer install\`
- Build: NONE
- Start: \`php artisan serve\` (Laravel) or nginx + php-fpm
- Port: 8000
- Needs runtime: YES (PHP 8.x)

🔵 **.NET DETECTION:**
- Files: *.csproj, *.sln
- Framework: ASP.NET Core
- Build tool: dotnet
- Install: Install .NET SDK
- Build: \`dotnet build\`
- Test: \`dotnet test\`
- Start: \`dotnet run\`
- Port: 5000
- Needs runtime: YES (.NET 7+)

═══════════════════════════════════════════════════════════════════
🔍 CRITICAL: PORT DETECTION
═══════════════════════════════════════════════════════════════════

**IMPORTANT**: You MUST scan the actual source code to find the REAL port number!

DO NOT use default ports - find the ACTUAL port from the code:
- **Rust**: Look for .bind("127.0.0.1:PORT") or .bind("0.0.0.0:PORT") in main.rs/lib.rs
  Example: .bind("127.0.0.1:3030") → port is "3030"
- **Python**: Look for port=PORT in uvicorn.run(), app.run(), or manage.py runserver
  Example: uvicorn.run(app, host="0.0.0.0", port=3030) → port is "3030"
- **Go**: Look for :PORT in http.ListenAndServe() or router.Run()
  Example: http.ListenAndServe(":8080", nil) → port is "8080"
- **Node.js**: Look for process.env.PORT or hardcoded port in app.listen()
  Example: app.listen(3000) → port is "3000"

If you cannot find a port in the source code, use these defaults:
- FastAPI/Django/Flask: "8000"
- Node.js/Express: "3000"
- Go: "8080"
- Rust: "8000"

═══════════════════════════════════════════════════════════════════
🔢 VERSION DETECTION (CRITICAL - MUST BE ACCURATE!)
═══════════════════════════════════════════════════════════════════

**YOU MUST DETECT EXACT VERSIONS FROM PROJECT FILES!**

**PRIORITY ORDER FOR VERSION DETECTION:**

**Python Version Detection (PRIORITY ORDER):**
1. **FIRST:** Check .python-version file (if provided above): "3.10" → pythonVersion: "3.10"
2. **SECOND:** Check runtime.txt file (if provided above): "python-3.11.5" → pythonVersion: "3.11"
3. **THIRD:** Check pyproject.toml: requires-python = ">=3.11" → pythonVersion: "3.11"
4. **FOURTH:** Scan code for syntax clues:
   - Uses "str | None" type hints → REQUIRES 3.10+
   - Uses "match/case" statements → REQUIRES 3.10+
   - Uses f-strings with = → REQUIRES 3.8+
5. **DEFAULT (last resort):** "3.11" for modern apps, "3.9" if legacy syntax detected

**Node.js Version Detection (PRIORITY ORDER):**
1. **FIRST:** Check .nvmrc file (if provided above): "20.10.0" → nodeVersion: "20"
2. **SECOND:** Check .node-version file (if provided above): "18" → nodeVersion: "18"
3. **THIRD:** Check package.json "engines": {"node": ">=20"} → nodeVersion: "20"
4. **FOURTH:** Check package.json "engines": {"node": "18.x"} → nodeVersion: "18"
5. **DEFAULT (last resort):** "20" for modern apps, "18" for stable LTS

**Go Version Detection (PRIORITY ORDER):**
1. **FIRST:** Check .go-version file (if provided above): "1.21.5" → goVersion: "1.21"
2. **SECOND:** Check go.mod first line: "go 1.22" → goVersion: "1.22"
3. **DEFAULT (last resort):** "1.22" (latest stable)

**Java Version Detection (PRIORITY ORDER):**
1. **FIRST:** Check pom.xml: <maven.compiler.source>17</maven.compiler.source> → javaVersion: "17"
2. **SECOND:** Check build.gradle: sourceCompatibility = '11' → javaVersion: "11"
3. **DEFAULT (last resort):** "17" (current LTS)

**Ruby Version Detection (PRIORITY ORDER):**
1. **FIRST:** Check .ruby-version file (if provided above): "3.2.0" → rubyVersion: "3.2"
2. **SECOND:** Check Gemfile: ruby "3.1.2" → rubyVersion: "3.1"
3. **DEFAULT (last resort):** "3.2" (latest stable)

**PHP Version Detection (PRIORITY ORDER):**
1. **FIRST:** Check composer.json: "require": {"php": "^8.2"} → phpVersion: "8.2"
2. **DEFAULT (last resort):** "8.2" (latest stable)

**IMPORTANT RULES:**
- If a version file (.nvmrc, .python-version, etc.) is shown above in the "VERSION FILES" section, YOU MUST USE IT!
- Version files take ABSOLUTE PRIORITY over manifest files (package.json, requirements.txt)
- Extract just the major.minor version: "20.10.0" → "20", "3.11.5" → "3.11"
- If runtime.txt says "python-3.11.5", extract "3.11"
- Set version fields to null ONLY if absolutely no version information exists

═══════════════════════════════════════════════════════════════════
🎯 OUTPUT FORMAT (RETURN ONLY VALID JSON):
═══════════════════════════════════════════════════════════════════

{
  "language": "Rust|Go|Python|Node.js|Java|Ruby|PHP|.NET",
  "framework": "Rocket|Actix|FastAPI|Next.js|Spring Boot|Rails|Laravel|etc",
  "projectType": "frontend|backend|fullstack|library|cli|smart-contract",
  "buildTool": "cargo|go|npm|pip|maven|gradle|bundler|composer|dotnet",
  "packageManager": "cargo|go modules|npm|pip|maven|bundler|composer",

  "installCommand": "EXACT executable bash command (e.g., 'cargo install' or 'echo \"Already installed\"' - NEVER use 'NONE (explanation)')",
  "buildCommand": "EXACT executable bash command (e.g., 'cargo build --release' or 'echo \"No build needed\"' - use echo for no-ops)",
  "testCommand": "EXACT executable bash command (e.g., 'cargo test' or 'echo \"No tests\"')",
  "lintCommand": "EXACT executable bash command (e.g., 'cargo clippy' or 'echo \"No linter\"')",
  "startCommand": "EXACT executable bash command to start the application (e.g., './target/release/app' or 'python3 app.py')",

  "outputDir": "target/release|dist|build|bin|NONE",
  "port": "ACTUAL_PORT_NUMBER_FROM_SOURCE_CODE (e.g., '3030', '8000', '5000')",
  "needsRuntime": true|false,
  "runtimeVersion": "node 20|python 3.11|java 17|NONE",

  "pythonVersion": "3.11|3.10|3.9|null (DETECT from runtime.txt/.python-version/code syntax)",
  "nodeVersion": "20|18|16|null (DETECT from .nvmrc/.node-version/package.json engines)",
  "goVersion": "1.22|1.21|1.20|null (DETECT from go.mod)",
  "javaVersion": "17|11|8|null (DETECT from pom.xml/build.gradle)",
  "rubyVersion": "3.2|3.1|null (DETECT from .ruby-version/Gemfile)",
  "phpVersion": "8.2|8.1|null (DETECT from composer.json)",

  "hasTests": boolean,
  "hasLinter": boolean,
  "hasDocker": boolean,
  "hasDatabase": boolean,
  "needsEnvVars": ["DATABASE_URL", "API_KEY", etc],

  "isSolanaProject": boolean,
  "hasAnchor": boolean,

  "buildOptimizations": ["--release", "--jobs 4", etc],
  "estimatedBuildTime": "30 seconds|5 minutes|15 minutes",

  "recommendations": [
    "Install gcc for Rust compilation",
    "Use --release for optimized builds",
    "Set PORT environment variable",
    etc
  ],
  "warnings": [
    "No tests found",
    "Missing environment variables",
    etc
  ]
}

🎯 CRITICAL RULES:
1. Analyze ALL files provided
2. Detect language from manifest files (Cargo.toml → Rust, go.mod → Go, etc)
3. Be SPECIFIC with commands (don't say "build script", say "cargo build --release")
4. For compiled languages (Rust, Go), set needsRuntime: false
5. For interpreted languages (Python, Node.js, Ruby, PHP), set needsRuntime: true
6. Port detection: Look in source files for actual port configuration
7. Start command must be EXECUTABLE (binary path or runtime command)
8. For Solana projects, set isSolanaProject: true and add Solana-specific recommendations

⚠️ **CRITICAL: NODE.JS FRONTEND vs BACKEND DETECTION:**

**STEP 1: Check FILE LIST for frontend indicators:**
- index.html exists? → **FRONTEND PROJECT** (classify as Vite, NOT Express!)
- vite.config.ts exists? → **FRONTEND PROJECT** (classify as Vite, NOT Express!)
- tailwind.config.js exists? → **FRONTEND PROJECT** (uses Tailwind CSS)
- public/ folder exists? → **FRONTEND PROJECT** (static assets)

**STEP 2: If ANY frontend indicator found:**
- framework: "Vite" or "Vite + React" (NEVER "Express.js")
- projectType: "frontend" (NEVER "backend")
- startCommand: "echo \"Static files served by Nginx\"" (NEVER "npm start" or "node server.js")
- outputDir: "dist" (NEVER "NONE")
- port: "80" (Nginx serves static files on port 80)

**STEP 3: Only classify as Express.js backend if:**
- NO index.html file
- NO vite.config.* file
- NO public/ folder
- Has Express in dependencies AND it's the main server (not dev server)

**🚨 MOST COMMON MISTAKE:**
\`\`\`
❌ WRONG DETECTION:
Files: index.html, vite.config.ts, server/index.js (Express)
→ framework: "Express.js", projectType: "backend"  ← DON'T DO THIS!

✅ CORRECT DETECTION:
Files: index.html, vite.config.ts, server/index.js (Express)
→ framework: "Vite + React", projectType: "frontend"  ← DO THIS!
   (Express in server/ is just backend API, but project type is frontend!)
\`\`\`

**REMEMBER:**
- **index.html = FRONTEND** (period, no exceptions!)
- **vite.config.* = FRONTEND** (period, no exceptions!)
- Even if Express exists in server/ folder, PROJECT TYPE is still **frontend** if index.html exists!

Return ONLY valid JSON, no markdown, no explanations.`;
}

/**
 * Invoke Claude Sonnet
 */
async function invokeNovaPremier(prompt: string): Promise<string> {
  console.log('[UNIVERSAL-ANALYZER] 🚀 Invoking Claude Sonnet...');

  const command = new ConverseCommand({
    modelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 8192,  // Increased for comprehensive analysis with Claude Sonnet
      // temperature: 0.1,
      // topP: 0.9,
    },
  });

  const response = await bedrockClient.send(command);
  const text = response.output?.message?.content?.[0]?.text || '';

  console.log('[UNIVERSAL-ANALYZER] Response received (length:', text.length, ')');
  return text;
}

/**
 * Parse AI response into structured analysis
 */
function parseAnalysis(response: string, files: UniversalProjectFiles): UniversalProjectAnalysis {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[UNIVERSAL-ANALYZER] No JSON found in response, using fallback');
      return getFallbackAnalysis(files);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log('[UNIVERSAL-ANALYZER] Parsed analysis:', JSON.stringify(parsed, null, 2));

    // Ensure dependencies field exists (Claude Sonnet might not always return it)
    if (!parsed.dependencies) {
      console.warn('[UNIVERSAL-ANALYZER] No dependencies in AI response, adding default empty object');
      parsed.dependencies = {
        production: [],
        dev: [],
      };
    }

    // Ensure recommendations field exists
    if (!parsed.recommendations) {
      parsed.recommendations = [];
    }

    // Sanitize commands - convert "NONE (...)" to executable echo commands
    const sanitizeCommand = (cmd: string | undefined): string => {
      if (!cmd) return 'echo "No command"';

      // Check if command starts with "NONE" (case insensitive)
      if (cmd.trim().toUpperCase().startsWith('NONE')) {
        // Extract the message if present
        const message = cmd.includes('(') ? cmd.split('(')[1]?.split(')')[0] : 'No action needed';
        return `echo "${message || 'No action needed'}"`;
      }

      return cmd;
    };

    // Apply sanitization to all command fields
    parsed.installCommand = sanitizeCommand(parsed.installCommand);
    parsed.buildCommand = sanitizeCommand(parsed.buildCommand);
    parsed.testCommand = sanitizeCommand(parsed.testCommand);
    parsed.lintCommand = sanitizeCommand(parsed.lintCommand);
    parsed.startCommand = sanitizeCommand(parsed.startCommand);

    console.log('[UNIVERSAL-ANALYZER] Commands sanitized:');
    console.log('  - Install:', parsed.installCommand);
    console.log('  - Build:', parsed.buildCommand);
    console.log('  - Start:', parsed.startCommand);

    // SAFETY CHECK: Override Express.js detection if frontend indicators present
    const fileList = files.fileList || [];
    const hasIndexHtml = fileList.some((f: string) => f.toLowerCase().includes('index.html'));
    const hasViteConfig = fileList.some((f: string) => f.toLowerCase().includes('vite.config'));
    const hasTailwindConfig = fileList.some((f: string) => f.toLowerCase().includes('tailwind.config'));

    if ((hasIndexHtml || hasViteConfig) && (parsed.framework === 'Express.js' || parsed.projectType === 'backend')) {
      console.warn('[UNIVERSAL-ANALYZER] ⚠️ CORRECTING MISDETECTION:');
      console.warn('[UNIVERSAL-ANALYZER]   - AI detected:', parsed.framework, '/', parsed.projectType);
      console.warn('[UNIVERSAL-ANALYZER]   - But index.html or vite.config exists → This is FRONTEND!');
      console.warn('[UNIVERSAL-ANALYZER]   - Overriding to: Vite + React / frontend');

      // Override to correct values
      parsed.framework = 'Vite + React';
      parsed.projectType = 'frontend';
      parsed.buildCommand = parsed.buildCommand === 'echo "No build step needed"' ? 'npm run build' : parsed.buildCommand;
      parsed.startCommand = 'echo "Static files served by Nginx"';
      parsed.outputDir = 'dist';
      parsed.port = '80';

      // Add warning to recommendations
      if (!parsed.warnings) parsed.warnings = [];
      parsed.warnings.push('AI initially misdetected as Express.js backend - corrected to Vite frontend based on index.html/vite.config presence');
    }

    return parsed as UniversalProjectAnalysis;
  } catch (error: any) {
    console.error('[UNIVERSAL-ANALYZER] Parse error:', error.message);
    return getFallbackAnalysis(files);
  }
}

/**

/**
 * Extract port number from source code
 * NOTE: This now uses the enhanced port detector with better pattern matching
 */
export function extractPortFromSource(sourceCode: string, language: string): string {
  return enhancedExtractPort(sourceCode, language);
}
/**
 * Fallback analysis based on simple file detection
 */
function getFallbackAnalysis(files: UniversalProjectFiles): UniversalProjectAnalysis {
  console.log('[UNIVERSAL-ANALYZER] Using fallback analysis');

  // Rust detection
  if (files.cargoToml) {
    const isAnchor = !!files.anchorToml;
    const cargoContent = files.cargoToml.toLowerCase();
    let framework = 'Rust';
    if (cargoContent.includes('rocket')) framework = 'Rocket';
    else if (cargoContent.includes('actix-web')) framework = 'Actix Web';
    else if (cargoContent.includes('axum')) framework = 'Axum';

    // Try to detect port from source code
    const sourceCode = files.mainRs || files.libRs || '';
    const detectedPort = detectPortWithFallback(sourceCode, 'Rust', framework);

    return {
      language: 'Rust',
      framework: isAnchor ? 'Solana/Anchor' : framework,
      projectType: isAnchor ? 'smart-contract' : 'backend',
      buildTool: 'cargo',
      packageManager: 'cargo',
      installCommand: 'echo "Cargo will fetch dependencies during build"',
      buildCommand: 'cargo build --release',
      testCommand: 'cargo test',
      lintCommand: 'cargo clippy',
      startCommand: './target/release/app',
      outputDir: 'target/release',
      port: detectedPort,
      needsRuntime: false,
      runtimeVersion: 'NONE',
      hasTests: true,
      hasLinter: true,
      hasDocker: !!files.dockerfile,
      hasDatabase: false,
      needsEnvVars: [],
      dependencies: {
        production: [],
        dev: [],
      },
      isSolanaProject: isAnchor,
      hasAnchor: isAnchor,
      buildOptimizations: ['--release'],
      estimatedBuildTime: '5-15 minutes',
      recommendations: [
        'Rust toolchain installed via rustup in install-runtime stage',
        'Cargo automatically fetches and builds dependencies',
        'Build uses --release flag for production optimization',
        isAnchor ? 'Install Solana CLI and Anchor CLI' : '',
      ].filter(Boolean),
      warnings: [],
    };
  }

  // Go detection
  if (files.goMod) {
    // Try to detect port from source code
    const sourceCode = files.mainGo || '';
    const detectedPort = detectPortWithFallback(sourceCode, 'Go');

    return {
      language: 'Go',
      framework: 'Go',
      projectType: 'backend',
      buildTool: 'go',
      packageManager: 'go modules',
      installCommand: 'go mod download',
      buildCommand: 'go build -o app .',
      testCommand: 'go test ./...',
      lintCommand: 'go vet ./...',
      startCommand: './app',
      outputDir: '.',
      port: detectedPort,
      needsRuntime: false,
      runtimeVersion: 'NONE',
      hasTests: true,
      hasLinter: true,
      hasDocker: !!files.dockerfile,
      hasDatabase: false,
      needsEnvVars: [],
      dependencies: {
        production: [],
        dev: [],
      },
      isSolanaProject: false,
      hasAnchor: false,
      buildOptimizations: [],
      estimatedBuildTime: '30 seconds',
      recommendations: ['Go runtime installed in install-runtime stage', 'Go modules automatically managed'],
      warnings: [],
    };
  }

  // Python detection
  if (files.requirementsTxt || files.pyprojectToml) {
    const deps = files.requirementsTxt?.toLowerCase() || '';
    let framework = 'Python';
    let startCmd = 'python3 app.py';

    // Try to detect port from source code
    const sourceCode = files.mainPy || files.appPy || '';
    const detectedPort = detectPortWithFallback(sourceCode, 'Python', framework);

    if (deps.includes('fastapi')) {
      framework = 'FastAPI';
      const port = detectedPort || '8000';
      startCmd = `uvicorn main:app --host 0.0.0.0 --port ${port}`;
    } else if (deps.includes('flask')) {
      framework = 'Flask';
      const port = detectedPort || '5000';
      startCmd = `python3 app.py`;
      // Flask usually reads port from app.run(port=...)
    } else if (deps.includes('django')) {
      framework = 'Django';
      const port = detectedPort || '8000';
      startCmd = `python3 manage.py runserver 0.0.0.0:${port}`;
    }

    return {
      language: 'Python',
      framework,
      projectType: 'backend',
      buildTool: 'pip',
      packageManager: 'pip',
      installCommand: 'pip3 install -r requirements.txt',
      buildCommand: 'echo "No build step needed for Python"',
      testCommand: deps.includes('pytest') ? 'pytest' : 'echo "No tests configured"',
      lintCommand: deps.includes('flake8') ? 'flake8' : 'echo "No linter configured"',
      startCommand: startCmd,
      outputDir: 'NONE',
      port: detectedPort || '8000',
      needsRuntime: true,
      runtimeVersion: 'python 3.11',
      hasTests: deps.includes('pytest'),
      hasLinter: deps.includes('flake8'),
      hasDocker: !!files.dockerfile,
      hasDatabase: false,
      needsEnvVars: [],
      dependencies: {
        production: files.requirementsTxt?.split('\n').filter(l => l && !l.startsWith('#')) || [],
        dev: [],
      },
      isSolanaProject: false,
      hasAnchor: false,
      buildOptimizations: [],
      estimatedBuildTime: '30 seconds',
      recommendations: ['Python runtime installed in install-runtime stage'],
      warnings: [],
    };
  }

  // Node.js detection (fallback to existing logic)
  if (files.packageJson) {
    const pkg = JSON.parse(files.packageJson);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    let framework = 'Node.js';
    let projectType: any = 'backend';
    let startCommand = 'node index.js';
    let outputDir = 'NONE';
    let buildCommand = 'NONE';

    // PRIORITY 1: Check for frontend frameworks FIRST
    // Check file list for frontend indicators
    const fileList = files.fileList || [];
    const hasIndexHtml = fileList.some((f: string) => f.toLowerCase().includes('index.html'));
    const hasViteConfig = fileList.some((f: string) =>
      f.toLowerCase().includes('vite.config') && (f.endsWith('.ts') || f.endsWith('.js'))
    );

    if (deps.next) {
      framework = 'Next.js';
      projectType = 'fullstack';
      buildCommand = 'npm run build';
      startCommand = 'npm start';
      outputDir = '.next';
    } else if (deps.vite && (hasIndexHtml || hasViteConfig || !deps.express)) {
      // Vite + (index.html OR vite.config OR no express) = FRONTEND
      framework = 'Vite + React';
      projectType = 'frontend';
      buildCommand = 'npm run build';
      startCommand = 'echo "Static files served by Nginx"';
      outputDir = 'dist';
    } else if (deps['react-scripts']) {
      // Create React App
      framework = 'Create React App';
      projectType = 'frontend';
      buildCommand = 'npm run build';
      startCommand = 'echo "Static files served by Nginx"';
      outputDir = 'build';
    } else if (deps.express) {
      // ONLY classify as Express if no frontend indicators
      framework = 'Express.js';
      projectType = 'backend';
      startCommand = pkg.scripts?.start || 'node index.js';
    } else if (deps['@nestjs/core']) {
      framework = 'NestJS';
      projectType = 'backend';
      startCommand = 'npm start';
    }

    const detectedPort = detectPortWithFallback(undefined, 'Node.js/TypeScript', framework);

    return {
      language: 'Node.js/TypeScript',
      framework,
      projectType,
      buildTool: 'npm',
      packageManager: 'npm',
      installCommand: 'npm install --force --include=dev',
      buildCommand: buildCommand === 'NONE' ? 'echo "No build step needed"' : buildCommand,
      testCommand: pkg.scripts?.test ? 'npm test' : 'echo "No tests configured"',
      lintCommand: pkg.scripts?.lint ? 'npm run lint' : 'echo "No linter configured"',
      startCommand,
      outputDir,
      port: projectType === 'frontend' ? '80' : detectedPort,
      needsRuntime: true,
      runtimeVersion: 'node 20',
      hasTests: !!pkg.scripts?.test,
      hasLinter: !!pkg.scripts?.lint,
      hasDocker: !!files.dockerfile,
      hasDatabase: false,
      needsEnvVars: [],
      dependencies: {
        production: Object.keys(pkg.dependencies || {}),
        dev: Object.keys(pkg.devDependencies || {}),
      },
      isSolanaProject: false,
      hasAnchor: false,
      buildOptimizations: [],
      estimatedBuildTime: projectType === 'frontend' ? '1 minute' : '2 minutes',
      recommendations: ['Node.js 20 required'],
      warnings: [],
    };
  }

  // Unknown project
  return {
    language: 'Unknown',
    framework: 'Unknown',
    projectType: 'backend',
    buildTool: 'unknown',
    packageManager: 'unknown',
    installCommand: 'echo "Unknown project type - no dependencies to install"',
    buildCommand: 'echo "No build step needed"',
    testCommand: 'echo "No tests configured"',
    lintCommand: 'echo "No linter configured"',
    startCommand: 'echo "Cannot start unknown project"',
    outputDir: 'NONE',
    port: '8000',
    needsRuntime: false,
    hasTests: false,
    hasLinter: false,
    hasDocker: !!files.dockerfile,
    hasDatabase: false,
    needsEnvVars: [],
    dependencies: {
      production: [],
      dev: [],
    },
    isSolanaProject: false,
    hasAnchor: false,
    buildOptimizations: [],
    estimatedBuildTime: 'Unknown',
    recommendations: ['Could not detect project type - manual configuration needed'],
    warnings: ['Unknown project type detected'],
  };
}

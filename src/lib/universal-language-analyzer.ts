/**
 * Universal Language Analyzer using Amazon Nova Premier AI
 * Supports ALL major languages and frameworks
 */

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { UniversalProjectFiles } from './universal-file-fetcher';

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
 * Analyze project using Nova Premier AI with universal language support
 */
export async function analyzeUniversalProject(
  files: UniversalProjectFiles
): Promise<UniversalProjectAnalysis> {
  console.log('[UNIVERSAL-ANALYZER] Starting universal project analysis...');
  console.log('[UNIVERSAL-ANALYZER] Detected languages:', files.detectedLanguages.join(', ') || 'Unknown');

  try {
    const prompt = buildUniversalAnalysisPrompt(files);
    const response = await invokeNovaPremier(prompt);
    const analysis = parseAnalysis(response, files);

    console.log('[UNIVERSAL-ANALYZER] ✓ Analysis complete');
    console.log('[UNIVERSAL-ANALYZER] Language:', analysis.language);
    console.log('[UNIVERSAL-ANALYZER] Framework:', analysis.framework);
    console.log('[UNIVERSAL-ANALYZER] Build tool:', analysis.buildTool);
    console.log('[UNIVERSAL-ANALYZER] Install:', analysis.installCommand);
    console.log('[UNIVERSAL-ANALYZER] Build:', analysis.buildCommand);
    console.log('[UNIVERSAL-ANALYZER] Start:', analysis.startCommand);

    return analysis;
  } catch (error: any) {
    console.error('[UNIVERSAL-ANALYZER] Error:', error.message);
    return getFallbackAnalysis(files);
  }
}

/**
 * Build comprehensive analysis prompt for Nova Premier
 */
function buildUniversalAnalysisPrompt(files: UniversalProjectFiles): string {
  let fileContents = '';

  // Add detected languages
  fileContents += `=== DETECTED LANGUAGES ===\n`;
  fileContents += files.detectedLanguages.join(', ') || 'Unknown';
  fileContents += '\n\n';

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

  return `You are Amazon Nova Premier - the MOST POWERFUL AI model specialized in DevOps, multi-language deployment, and infrastructure automation.

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
- Files: go.mod, go.sum, main.go
- Framework detection:
  * "github.com/gin-gonic/gin" → Gin web framework
  * "github.com/gofiber/fiber" → Fiber
  * "github.com/gorilla/mux" → Gorilla Mux
  * "net/http" imports → Standard library HTTP server
- Build tool: go
- Install: \`yum install -y golang\` (or download specific version)
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

🐍 **PYTHON DETECTION:**
- Files: requirements.txt, setup.py, pyproject.toml, app.py, main.py
- Framework detection:
  * "fastapi" in requirements → FastAPI
  * "flask" in requirements → Flask
  * "django" in requirements → Django
  * "uvicorn" in requirements → ASGI server for FastAPI
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
- Runtime install: \`yum install -y python3 python3-pip\`

📦 **NODE.JS DETECTION:**
- Files: package.json, package-lock.json, yarn.lock, pnpm-lock.yaml
- Framework detection:
  * "next" → Next.js (fullstack SSR)
  * "vite" → Vite + React (frontend SPA)
  * "react-scripts" → Create React App (frontend)
  * "express" → Express.js (backend)
  * "@nestjs/core" → NestJS (backend)
- Build tool: npm, yarn, or pnpm
- Install: \`npm install --force --include=dev\`
- Build:
  * Next.js: \`npm run build\` (outputs to .next/)
  * Vite: \`npm run build\` (outputs to dist/)
  * Express: \`npm run build\` (if TypeScript) or NONE
- Test: \`npm test\`
- Lint: \`npm run lint\`
- Start:
  * Next.js: \`npm start\` (serves .next/)
  * Vite: Serve dist/ with nginx or http-server
  * Express: \`node index.js\` or \`npm start\`
- Output: .next/ or dist/ or build/
- Port: 3000 (Next.js), 80 (Vite static), 3000/8000 (Express)
- Project type: fullstack (Next.js), frontend (Vite/CRA), backend (Express)
- Needs runtime: YES (Node.js 18+)
- Runtime install: Already installed in setup

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

Return ONLY valid JSON, no markdown, no explanations.`;
}

/**
 * Invoke Amazon Nova Premier
 */
async function invokeNovaPremier(prompt: string): Promise<string> {
  console.log('[UNIVERSAL-ANALYZER] 🚀 Invoking Amazon Nova Premier...');

  const command = new ConverseCommand({
    modelId: 'us.amazon.nova-premier-v1:0',
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
    inferenceConfig: {
      maxTokens: 4096,
      temperature: 0.1,
      topP: 0.9,
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

    // Ensure dependencies field exists (Nova AI might not always return it)
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

    return parsed as UniversalProjectAnalysis;
  } catch (error: any) {
    console.error('[UNIVERSAL-ANALYZER] Parse error:', error.message);
    return getFallbackAnalysis(files);
  }
}

/**
 * Extract port number from source code
 */
function extractPortFromSource(sourceCode: string, language: string): string {
  if (!sourceCode) return '';

  console.log('[PORT-DETECTOR] Scanning source code for port number...');

  // Rust patterns
  if (language === 'Rust') {
    // Look for .bind("address:port")
    const bindMatch = sourceCode.match(/\.bind\(['""](?:127\.0\.0\.1|0\.0\.0\.0):(\d+)['""\)]/);
    if (bindMatch) {
      console.log('[PORT-DETECTOR] Found Rust port:', bindMatch[1]);
      return bindMatch[1];
    }
    // Look for TcpListener::bind
    const tcpMatch = sourceCode.match(/TcpListener::bind\(['""](?:127\.0\.0\.1|0\.0\.0\.0):(\d+)['""\)]/);
    if (tcpMatch) {
      console.log('[PORT-DETECTOR] Found Rust TCP port:', tcpMatch[1]);
      return tcpMatch[1];
    }
  }

  // Python patterns
  if (language === 'Python') {
    // Look for uvicorn.run with port
    const uvicornMatch = sourceCode.match(/uvicorn\.run\([^)]*port\s*=\s*(\d+)/);
    if (uvicornMatch) {
      console.log('[PORT-DETECTOR] Found Python uvicorn port:', uvicornMatch[1]);
      return uvicornMatch[1];
    }
    // Look for app.run with port
    const flaskMatch = sourceCode.match(/\.run\([^)]*port\s*=\s*(\d+)/);
    if (flaskMatch) {
      console.log('[PORT-DETECTOR] Found Python Flask port:', flaskMatch[1]);
      return flaskMatch[1];
    }
    // Look for runserver with port
    const djangoMatch = sourceCode.match(/runserver\s+(?:0\.0\.0\.0:)?(\d+)/);
    if (djangoMatch) {
      console.log('[PORT-DETECTOR] Found Django port:', djangoMatch[1]);
      return djangoMatch[1];
    }
  }

  // Go patterns
  if (language === 'Go') {
    // Look for ListenAndServe(":port", ...)
    const listenMatch = sourceCode.match(/ListenAndServe\(['""][:]+(\d+)["'"]/);
    if (listenMatch) {
      console.log('[PORT-DETECTOR] Found Go port:', listenMatch[1]);
      return listenMatch[1];
    }
    // Look for .Run(":port")
    const runMatch = sourceCode.match(/\.Run\(['""][:]+(\d+)["'"]/);
    if (runMatch) {
      console.log('[PORT-DETECTOR] Found Go Router port:', runMatch[1]);
      return runMatch[1];
    }
  }

  // Node.js patterns
  if (language === 'Node.js') {
    // Look for app.listen(port, ...)
    const listenMatch = sourceCode.match(/\.listen\(\s*(\d+)/);
    if (listenMatch) {
      console.log('[PORT-DETECTOR] Found Node.js port:', listenMatch[1]);
      return listenMatch[1];
    }
  }

  console.log('[PORT-DETECTOR] No port found in source code');
  return '';
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
    const detectedPort = extractPortFromSource(sourceCode, 'Rust') || '8000';

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
    const detectedPort = extractPortFromSource(sourceCode, 'Go') || '8080';

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
    let detectedPort = extractPortFromSource(sourceCode, 'Python');

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

    if (deps.next) {
      framework = 'Next.js';
      projectType = 'fullstack';
      buildCommand = 'npm run build';
      startCommand = 'npm start';
      outputDir = '.next';
    } else if (deps.vite) {
      framework = 'Vite + React';
      projectType = 'frontend';
      buildCommand = 'npm run build';
      startCommand = 'STATIC_SERVER';
      outputDir = 'dist';
    } else if (deps.express) {
      framework = 'Express.js';
      projectType = 'backend';
      startCommand = 'node index.js';
    }

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
      port: '3000',
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
      estimatedBuildTime: '2 minutes',
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

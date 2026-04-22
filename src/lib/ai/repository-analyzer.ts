// Deep Repository Analyzer with Claude Sonnet
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

export interface DeepRepositoryAnalysis {
  projectType: 'frontend' | 'backend' | 'fullstack' | 'monorepo' | 'unknown';
  framework: string;
  language: string;
  entryPoints: string[];
  buildTool: string;
  buildCommand: string;
  startCommand: string;
  outputDir: string;
  port: string;
  testFramework: string;
  dependencies: {
    production: string[];
    dev: string[];
  };
  structure: {
    hasTests: boolean;
    hasDocker: boolean;
    hasPrisma: boolean;
    hasTypeScript: boolean;
    hasDatabase: boolean;
    directories?: string[];
  };
  recommendations: string[];
  pipelineRequirements: {
    needsBuild: boolean;
    needsTests: boolean;
    needsLint: boolean;
    needsTypeCheck: boolean;
    needsPrismaGenerate: boolean;
    needsEnvVars: string[];
    installCommand?: string;
    preInstallSteps?: string[];
  };
}

export class RepositoryAnalyzer {
  private client: BedrockRuntimeClient;

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });
  }

  /**
   * Analyze repository deeply using Claude Sonnet
   */
  async analyzeRepository(files: Record<string, string>): Promise<DeepRepositoryAnalysis> {
    console.log('[REPO-ANALYZER] 🔍 Starting deep repository analysis...');
    console.log('[REPO-ANALYZER] Files to analyze:', Object.keys(files));

    const prompt = this.buildAnalysisPrompt(files);

    try {
      const response = await this.invokeNovaPremier(prompt);
      const analysis = this.parseAnalysis(response, files);

      console.log('[REPO-ANALYZER] ✓ Analysis complete');
      console.log('[REPO-ANALYZER] Project Type:', analysis.projectType);
      console.log('[REPO-ANALYZER] Framework:', analysis.framework);
      console.log('[REPO-ANALYZER] Entry Points:', analysis.entryPoints);

      return analysis;
    } catch (error: any) {
      console.error('[REPO-ANALYZER] Error during analysis:', error.message);
      return this.getFallbackAnalysis(files);
    }
  }

  /**
   * Build comprehensive analysis prompt for Claude Sonnet
   */
  private buildAnalysisPrompt(files: Record<string, string>): string {
    // Get file list to show structure
    const fileList = Object.keys(files).sort();

    // Detect directories from file paths
    const directories = new Set<string>();
    fileList.forEach(file => {
      const parts = file.split('/');
      if (parts.length > 1) {
        directories.add(parts[0]);
      }
    });

    let fileContents = '=== REPOSITORY FILE STRUCTURE ===\n';
    fileContents += 'Directories: ' + Array.from(directories).join(', ') + '\n';
    fileContents += 'Files: ' + fileList.join(', ') + '\n\n';

    // Show important file contents
    fileContents += '=== IMPORTANT FILE CONTENTS ===\n\n';
    for (const [filename, content] of Object.entries(files)) {
      // Prioritize ALL language-specific key files
      if (filename.includes('package.json') ||
        filename.includes('Cargo.toml') ||
        filename.includes('go.mod') ||
        filename.includes('requirements.txt') ||
        filename.includes('pyproject.toml') ||
        filename.includes('pom.xml') ||
        filename.includes('build.gradle') ||
        filename.includes('composer.json') ||
        filename.includes('Gemfile') ||
        filename.includes('.csproj') ||
        filename.includes('main.rs') ||
        filename.includes('lib.rs') ||
        filename.includes('main.go') ||
        filename.includes('main.py') ||
        filename.includes('app.py') ||
        filename.includes('server.') ||
        filename.includes('index.') ||
        filename.includes('next.config') ||
        filename.includes('vite.config') ||
        filename.includes('webpack.config') ||
        filename.includes('tsconfig')) {
        fileContents += `### ${filename}\n\`\`\`\n${content.slice(0, 3000)}\n\`\`\`\n\n`;
      }
    }

    return `You are an EXPERT DevOps engineer analyzing a repository for deployment. Your analysis must be PERFECT and ACCURATE for ALL LANGUAGES.

${fileContents}

CRITICAL PORT DETECTION:
🔥 EXTRACT THE EXACT PORT NUMBER FROM SOURCE CODE! Look for:
- JavaScript/TypeScript: process.env.PORT || 3000, app.listen(8080), const PORT = 5000
- Rust: env::var("PORT").unwrap_or("8080"), .bind("127.0.0.1:3000"), TcpListener::bind("0.0.0.0:8000")
- Go: os.Getenv("PORT"), http.ListenAndServe(":8080"), net.Listen("tcp", ":3000")
- Python: os.environ.get("PORT", 8000), app.run(port=5000), uvicorn.run(port=8000)
- Java: server.port=8080, ServerSocket(3000)
- Ruby: set :port, 4567
- PHP: php -S localhost:8000

CRITICAL DETECTION RULES BY LANGUAGE:

🔍 RUST DETECTION:
- Look for: Cargo.toml file
- Files: src/main.rs, src/lib.rs
- Project Type: backend (Rust is compiled, server-side)
- Build Command: "cargo build --release"
- Start Command: "./target/release/<binary-name>" (check [package] name in Cargo.toml)
- Needs Build: YES (always compile)
- Output: target/release/ folder
- Port: EXTRACT from main.rs/lib.rs (search for bind, listen, PORT patterns)
- Common frameworks: actix-web (8080), rocket (8000), axum (3000), warp (3030)

🔍 GO DETECTION:
- Look for: go.mod file
- Files: main.go, cmd/main.go
- Project Type: backend
- Build Command: "go build -o app ." or "go build"
- Start Command: "./app" or "./main"
- Needs Build: YES (compiled language)
- Port: EXTRACT from main.go (search for ListenAndServe, :port patterns)
- Common frameworks: gin (8080), echo (1323), fiber (3000)

🔍 PYTHON FLASK DETECTION:
- Look for: requirements.txt with "flask" or "Flask"
- Files: app.py, server.py, wsgi.py
- Project Type: backend
- Build Command: NONE
- Start Command: "python app.py" or "flask run --host=0.0.0.0 --port=<PORT>"
- Port: EXTRACT from app.py (search for app.run(port=), default 5000)

🔍 PYTHON FASTAPI DETECTION:
- Look for: requirements.txt with "fastapi" or "FastAPI"
- Files: main.py, app.py
- Project Type: backend
- Build Command: NONE
- Start Command: "uvicorn main:app --host 0.0.0.0 --port=<PORT>"
- Port: EXTRACT from main.py/requirements.txt, default 8000

🔍 PYTHON DJANGO DETECTION:
- Look for: manage.py, requirements.txt with "django" or "Django"
- Files: manage.py, settings.py, wsgi.py
- Project Type: fullstack
- Build Command: "python manage.py collectstatic --noinput"
- Start Command: "python manage.py runserver 0.0.0.0:<PORT>"
- Port: EXTRACT from settings.py or manage.py, default 8000

🔍 NEXT.JS DETECTION:
- Look for: next.config.js, next.config.mjs, "next" in dependencies
- Directories: pages/, app/, src/app/, src/pages/
- Project Type: fullstack (Next.js is SSR, not pure frontend)
- Build Command: "next build" or "npm run build"
- Start Command: "next start" or "npm start"
- Needs Build: YES (always)
- Port: EXTRACT from package.json scripts or source, default 3000

🔍 VITE + REACT DETECTION:
- Look for: vite.config.js, vite.config.ts, "vite" in devDependencies
- Directories: src/, public/
- Files: index.html, src/main.tsx, src/main.jsx
- Project Type: frontend (static site)
- Build Command: "vite build" or "npm run build"
- Start Command: STATIC_SERVER
- Needs Build: YES
- Output: dist/ folder
- Port: 80 (static server)

🔍 CREATE REACT APP DETECTION:
- Look for: "react-scripts" in dependencies
- Directories: src/, public/
- Files: public/index.html, src/App.js
- Project Type: frontend
- Build Command: "react-scripts build" or "npm run build"
- Start Command: STATIC_SERVER
- Needs Build: YES
- Output: build/ folder
- Port: 80 (static server)

🔍 EXPRESS/NODE BACKEND DETECTION:
- Look for: "express"/"fastify"/"koa" in dependencies
- Files: index.js, server.js, app.js, src/server.js
- NO vite.config, NO webpack.config, NO next.config
- Project Type: backend
- Build Command: NONE (unless TypeScript)
- Start Command: "node index.js" or "node server.js"
- Needs Build: NO (unless TypeScript)
- Port: EXTRACT from source (search for listen, PORT), default 3000

🔍 TYPESCRIPT BACKEND DETECTION:
- Look for: tsconfig.json + "express" + NO frontend framework
- Project Type: backend
- Build Command: "tsc" or "npm run build" (compiles TS to JS)
- Start Command: "node dist/index.js"
- Needs Build: YES (TypeScript compilation)
- Port: EXTRACT from source, default 3000

🔍 JAVA SPRING BOOT DETECTION:
- Look for: pom.xml with "spring-boot" or build.gradle with "spring-boot"
- Files: src/main/java/
- Project Type: backend or fullstack
- Build Command: "mvn clean package" or "gradle build"
- Start Command: "java -jar target/<app-name>.jar"
- Port: EXTRACT from application.properties/application.yml (server.port=), default 8080

🔍 RUBY SINATRA/RAILS DETECTION:
- Look for: Gemfile with "sinatra" or "rails"
- Files: app.rb, config.ru, config/application.rb
- Project Type: backend or fullstack (Rails)
- Build Command: "bundle install"
- Start Command: "ruby app.rb" or "rails server"
- Port: EXTRACT from source, default 4567 (Sinatra) or 3000 (Rails)

🔍 PHP DETECTION:
- Look for: composer.json, index.php
- Project Type: backend or fullstack
- Build Command: "composer install"
- Start Command: "php -S 0.0.0.0:<PORT>"
- Port: EXTRACT from source, default 8000

🔍 .NET/C# DETECTION:
- Look for: .csproj, .sln files
- Files: Program.cs, Startup.cs
- Project Type: backend or fullstack
- Build Command: "dotnet build" or "dotnet publish"
- Start Command: "dotnet run" or "dotnet <app>.dll"
- Port: EXTRACT from appsettings.json or Program.cs, default 5000

ANALYSIS OUTPUT (RETURN ONLY THIS JSON):

{
  "projectType": "frontend|backend|fullstack",
  "framework": "EXACT framework (Actix-Web|Rocket|Next.js 13|Vite+React|Express.js|FastAPI|Flask|Django|Spring Boot|etc)",
  "language": "Rust|Go|Python|JavaScript|TypeScript|Java|Ruby|PHP|.NET|C#",
  "entryPoints": ["ACTUAL files found: main.rs, main.go, index.js, app.py, etc"],
  "buildTool": "cargo|go|next|vite|react-scripts|webpack|tsc|mvn|gradle|none",
  "buildCommand": "EXACT command to build (cargo build --release|go build|next build|vite build|mvn package|NONE)",
  "startCommand": "EXACT command to start (./target/release/app|./main|next start|node index.js|python app.py|uvicorn main:app --host 0.0.0.0 --port 8000)",
  "outputDir": "target/release|dist|build|.next|NONE",
  "port": "EXTRACTED PORT NUMBER FROM SOURCE CODE",
  "testFramework": "cargo test|go test|jest|vitest|pytest|junit|rspec|phpunit|none",
  "dependencies": {
    "production": ["key production dependencies"],
    "dev": ["key dev dependencies"]
  },
  "structure": {
    "hasTests": boolean,
    "hasDocker": boolean,
    "hasPrisma": boolean,
    "hasTypeScript": boolean,
    "hasDatabase": boolean,
    "directories": ["list directories found: src, pages, app, public, dist, target, etc"]
  },
  "recommendations": [
    "specific recommendations for deployment"
  ],
  "pipelineRequirements": {
    "needsBuild": boolean,
    "needsTests": boolean,
    "needsLint": boolean,
    "needsTypeCheck": boolean,
    "needsPrismaGenerate": boolean,
    "needsEnvVars": ["ENV_VAR_NAMES"],
    "installCommand": "cargo build|go mod download|npm install --force|pip install -r requirements.txt|mvn install|bundle install|composer install|etc",
    "preInstallSteps": ["any steps before install"]
  }
}

🎯 CRITICAL RULES:
1. ALWAYS extract the ACTUAL port number from source code!
2. If Cargo.toml exists → It's Rust (compile with cargo build --release)
3. If go.mod exists → It's Go (compile with go build)
4. If requirements.txt exists → It's Python (check for flask, fastapi, django)
5. If package.json exists → Check for next, vite, react-scripts, express
6. Look at ACTUAL source files (main.rs, main.go, app.py) to find port numbers
7. Be SPECIFIC with commands and include the EXACT port in startCommand
8. Default ports if not found: Rust (8000), Go (8080), Python Flask (5000), FastAPI (8000), Node (3000)

Return ONLY valid JSON, no markdown, no explanations.`;
  }

  /**
   * Invoke Claude Sonnet (best model)
   */
  private async invokeNovaPremier(prompt: string): Promise<string> {
    console.log('[REPO-ANALYZER] 🚀 Invoking Claude Sonnet...');

    const command = new ConverseCommand({
      modelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0', // Best Claude Sonnet model
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }],
        },
      ],
      inferenceConfig: {
        maxTokens: 8192,  // Increased for comprehensive analysis with Claude Sonnet
        // temperature: 0.1, // Low temperature for precise analysis
        // topP: 0.9,
      },
    });

    const response = await this.client.send(command);
    const text = response.output?.message?.content?.[0]?.text || '';

    console.log('[REPO-ANALYZER] Response length:', text.length);
    return text;
  }

  /**
   * Parse AI response into structured analysis
   */
  private parseAnalysis(response: string, files: Record<string, string>): DeepRepositoryAnalysis {
    try {
      // Extract JSON from response (may have markdown formatting)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[REPO-ANALYZER] No JSON found in response, using fallback');
        return this.getFallbackAnalysis(files);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed as DeepRepositoryAnalysis;
    } catch (error: any) {
      console.error('[REPO-ANALYZER] Parse error:', error.message);
      return this.getFallbackAnalysis(files);
    }
  }

  /**
   * Fallback analysis based on simple file detection
   */
  private getFallbackAnalysis(files: Record<string, string>): DeepRepositoryAnalysis {
    console.log('[REPO-ANALYZER] Using fallback analysis');

    const hasPackageJson = 'packageJson' in files;
    const hasCargoToml = 'cargoToml' in files;
    const hasGoMod = 'goMod' in files;
    const hasRequirementsTxt = 'requirementsTxt' in files;
    const hasPomXml = 'pomXml' in files;
    const hasGemfile = 'gemfile' in files;
    const hasComposerJson = 'composerJson' in files;

    const packageJson = hasPackageJson ? JSON.parse(files.packageJson || '{}') : {};
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const scripts = packageJson.scripts || {};

    // Detect project type with priority order
    let projectType: any = 'unknown';
    let framework = 'unknown';
    let language = 'unknown';
    let buildTool = 'none';
    let buildCommand = 'NONE';
    let startCommand = 'node index.js';
    let outputDir = 'NONE';
    let port = '3000';
    let installCommand = 'echo "No install needed"';
    const entryPoints: string[] = [];

    // Detect directories
    const directories = Array.from(new Set(
      Object.keys(files).map(f => f.split('/')[0]).filter(d => d && !d.includes('.'))
    ));

    // RUST DETECTION (priority 1 for compiled languages)
    if (hasCargoToml) {
      projectType = 'backend';
      language = 'Rust';
      buildTool = 'cargo';
      buildCommand = 'cargo build --release';
      installCommand = 'cargo fetch';
      outputDir = 'target/release';

      // Extract binary name from Cargo.toml
      const cargoToml = files.cargoToml || '';
      const nameMatch = cargoToml.match(/name\s*=\s*"([^"]+)"/);
      const binaryName = nameMatch ? nameMatch[1] : 'app';
      startCommand = `./target/release/${binaryName}`;

      // Detect Rust framework and port
      if (cargoToml.includes('actix-web')) {
        framework = 'Actix-Web';
        port = '8080';
      } else if (cargoToml.includes('rocket')) {
        framework = 'Rocket';
        port = '8000';
      } else if (cargoToml.includes('axum')) {
        framework = 'Axum';
        port = '3000';
      } else if (cargoToml.includes('warp')) {
        framework = 'Warp';
        port = '3030';
      } else {
        framework = 'Rust';
        port = '8000';
      }

      // Try to extract port from source code
      const mainRs = files.mainRs || files.libRs || '';
      const portMatch = mainRs.match(/\.bind\(['""](?:127\.0\.0\.1|0\.0\.0\.0|localhost):(\d+)['""\)]/) ||
        mainRs.match(/env::var\(['""]PORT['"]\)[\s\S]*?unwrap_or\(['""]?(\d+)['""]?\)/) ||
        mainRs.match(/TcpListener::bind\(['""](?:127\.0\.0\.1|0\.0\.0\.0|localhost):(\d+)['""\)]/) ||
        mainRs.match(/let\s+port\s*[:=]\s*(\d+)/);

      if (portMatch) {
        port = portMatch[1];
      }

      entryPoints.push('src/main.rs', 'src/lib.rs');
    }
    // GO DETECTION
    else if (hasGoMod) {
      projectType = 'backend';
      language = 'Go';
      buildTool = 'go';
      buildCommand = 'go build -o app .';
      startCommand = './app';
      installCommand = 'go mod download';
      outputDir = '.';
      port = '8080';

      // Detect Go framework
      const goMod = files.goMod || '';
      if (goMod.includes('gin-gonic/gin')) {
        framework = 'Gin';
        port = '8080';
      } else if (goMod.includes('labstack/echo')) {
        framework = 'Echo';
        port = '1323';
      } else if (goMod.includes('gofiber/fiber')) {
        framework = 'Fiber';
        port = '3000';
      } else {
        framework = 'Go';
      }

      // Try to extract port from source code
      const mainGo = files.mainGo || '';
      const portMatch = mainGo.match(/ListenAndServe\(['""]?:(\d+)['""]?/) ||
        mainGo.match(/os\.Getenv\(['""]PORT['""\)][\s\S]*?(\d+)/) ||
        mainGo.match(/Listen\(['""]tcp['""],\s*['""]?:(\d+)/);

      if (portMatch) {
        port = portMatch[1];
      }

      entryPoints.push('main.go', 'cmd/main.go');
    }
    // PYTHON DETECTION
    else if (hasRequirementsTxt) {
      projectType = 'backend';
      language = 'Python';
      buildTool = 'none';
      buildCommand = 'NONE';
      installCommand = 'pip install -r requirements.txt';
      outputDir = 'NONE';

      const requirementsTxt = files.requirementsTxt || '';

      // Detect Python framework
      if (requirementsTxt.toLowerCase().includes('fastapi')) {
        framework = 'FastAPI';
        startCommand = 'uvicorn main:app --host 0.0.0.0 --port 8000';
        port = '8000';
        entryPoints.push('main.py', 'app.py');
      } else if (requirementsTxt.toLowerCase().includes('flask')) {
        framework = 'Flask';
        startCommand = 'python app.py';
        port = '5000';
        entryPoints.push('app.py', 'server.py');
      } else if (requirementsTxt.toLowerCase().includes('django')) {
        framework = 'Django';
        startCommand = 'python manage.py runserver 0.0.0.0:8000';
        port = '8000';
        entryPoints.push('manage.py');
      } else {
        framework = 'Python';
        startCommand = 'python main.py';
        port = '8000';
        entryPoints.push('main.py', 'app.py');
      }

      // Try to extract port from source code
      const mainPy = files.mainPy || files.appPy || '';
      const portMatch = mainPy.match(/\.run\(.*?port\s*=\s*(\d+)/) ||
        mainPy.match(/uvicorn\.run\(.*?port\s*=\s*(\d+)/) ||
        mainPy.match(/os\.environ\.get\(['""]PORT['""],\s*['""]?(\d+)/);

      if (portMatch) {
        port = portMatch[1];
      }
    }
    // JAVA DETECTION
    else if (hasPomXml) {
      projectType = 'backend';
      language = 'Java';
      framework = 'Spring Boot';
      buildTool = 'maven';
      buildCommand = 'mvn clean package -DskipTests';
      startCommand = 'java -jar target/*.jar';
      installCommand = 'mvn install';
      outputDir = 'target';
      port = '8080';
      entryPoints.push('src/main/java/');
    }
    // RUBY DETECTION
    else if (hasGemfile) {
      projectType = 'backend';
      language = 'Ruby';
      buildTool = 'none';
      buildCommand = 'NONE';
      installCommand = 'bundle install';
      outputDir = 'NONE';

      const gemfile = files.gemfile || '';
      if (gemfile.includes('rails')) {
        framework = 'Ruby on Rails';
        startCommand = 'rails server -b 0.0.0.0 -p 3000';
        port = '3000';
      } else if (gemfile.includes('sinatra')) {
        framework = 'Sinatra';
        startCommand = 'ruby app.rb';
        port = '4567';
      } else {
        framework = 'Ruby';
        startCommand = 'ruby app.rb';
        port = '4567';
      }
      entryPoints.push('app.rb', 'config.ru');
    }
    // PHP DETECTION
    else if (hasComposerJson) {
      projectType = 'backend';
      language = 'PHP';
      framework = 'PHP';
      buildTool = 'none';
      buildCommand = 'NONE';
      startCommand = 'php -S 0.0.0.0:8000';
      installCommand = 'composer install';
      outputDir = 'NONE';
      port = '8000';
      entryPoints.push('index.php', 'public/index.php');
    }
    // NODE.JS DETECTION (fallback for JavaScript/TypeScript)
    else if (hasPackageJson) {
      language = deps.typescript || 'tsconfig.json' in files ? 'TypeScript' : 'JavaScript';
      installCommand = 'npm install --force --include=dev --legacy-peer-deps';

      // Next.js detection (highest priority for fullstack)
      if (deps.next || Object.keys(files).some(f => f.includes('next.config'))) {
        projectType = 'fullstack';
        framework = 'Next.js';
        buildTool = 'next';
        buildCommand = scripts.build || 'next build';
        startCommand = scripts.start || 'next start';
        outputDir = '.next';
        port = '3000';
        entryPoints.push('pages/index.tsx', 'app/page.tsx', 'pages/index.js', 'app/page.js');
      }
      // Vite frontend detection
      else if (deps.vite || Object.keys(files).some(f => f.includes('vite.config'))) {
        projectType = 'frontend';
        framework = 'Vite + React';
        buildTool = 'vite';
        buildCommand = scripts.build || 'vite build';
        startCommand = 'STATIC_SERVER'; // Special marker for static serving
        outputDir = 'dist';
        port = '80';
        entryPoints.push('src/main.tsx', 'src/main.jsx', 'index.html');
      }
      // Create React App detection
      else if (deps['react-scripts']) {
        projectType = 'frontend';
        framework = 'Create React App';
        buildTool = 'react-scripts';
        buildCommand = scripts.build || 'react-scripts build';
        startCommand = 'STATIC_SERVER';
        outputDir = 'build';
        port = '80';
        entryPoints.push('src/index.js', 'src/index.tsx', 'src/App.js');
      }
      // Express backend detection
      else if (deps.express && !deps.vite && !deps.next) {
        projectType = 'backend';
        framework = 'Express.js';
        buildTool = 'none';
        buildCommand = 'NONE';
        startCommand = scripts.start || 'node index.js';
        outputDir = 'NONE';
        port = '3000';
        entryPoints.push('index.js', 'server.js', 'src/server.js', 'app.js');
      }
      // Generic React (fallback)
      else if (deps.react) {
        projectType = 'frontend';
        framework = 'React';
        buildTool = 'webpack';
        buildCommand = scripts.build || 'npm run build';
        startCommand = 'STATIC_SERVER';
        outputDir = 'build';
        port = '80';
        entryPoints.push('src/index.jsx', 'src/App.jsx');
      }
    }

    return {
      projectType,
      framework,
      language,
      entryPoints,
      buildTool,
      buildCommand,
      startCommand,
      outputDir,
      port,
      testFramework: hasPackageJson ? (deps.jest ? 'jest' : deps.vitest ? 'vitest' : 'none') :
        hasCargoToml ? 'cargo test' :
        hasGoMod ? 'go test' :
        hasRequirementsTxt ? 'pytest' : 'none',
      dependencies: {
        production: hasPackageJson ? Object.keys(packageJson.dependencies || {}) : [],
        dev: hasPackageJson ? Object.keys(packageJson.devDependencies || {}) : [],
      },
      structure: {
        hasTests: hasPackageJson ? (!!deps.jest || !!deps.vitest) : false,
        hasDocker: 'Dockerfile' in files || 'dockerfile' in files,
        hasPrisma: hasPackageJson ? !!deps['@prisma/client'] : false,
        hasTypeScript: !!deps.typescript || 'tsconfig.json' in files || 'tsconfigJson' in files,
        hasDatabase: hasPackageJson ? (!!deps.pg || !!deps.mysql || !!deps['@prisma/client']) : false,
        directories,
      },
      recommendations: [
        `Framework: ${framework}`,
        `Language: ${language}`,
        `Build command: ${buildCommand}`,
        `Start command: ${startCommand}`,
        `Port: ${port}`,
      ],
      pipelineRequirements: {
        needsBuild: projectType === 'frontend' || projectType === 'fullstack' || buildCommand !== 'NONE',
        needsTests: false,
        needsLint: hasPackageJson ? !!deps.eslint : false,
        needsTypeCheck: hasPackageJson ? !!deps.typescript : false,
        needsPrismaGenerate: hasPackageJson ? !!deps['@prisma/client'] : false,
        needsEnvVars: this.detectEnvVars(files),
        installCommand,
        preInstallSteps: hasPackageJson ? ['rm -rf node_modules package-lock.json', 'npm cache clean --force'] : [],
      },
    };
  }

  /**
   * Detect required environment variables from files
   */
  private detectEnvVars(files: Record<string, string>): string[] {
    const envVars = new Set<string>();

    // Check all file contents for process.env.XXX patterns
    for (const content of Object.values(files)) {
      const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g);
      for (const match of matches) {
        envVars.add(match[1]);
      }
    }

    return Array.from(envVars);
  }
}

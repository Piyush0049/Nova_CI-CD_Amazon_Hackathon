/**
 * Enhanced Port Detector - Comprehensive port detection from source code
 * Supports: Node.js, Python, Go, Rust, Java, PHP, Ruby and more
 * Handles: Environment variables, hardcoded ports, default fallbacks
 */

/**
 * Extract port number from source code - ENHANCED VERSION
 * Supports environment variables, multiple patterns, and all major languages
 */
export function extractPortFromSource(sourceCode: string, language: string): string {
  if (!sourceCode) return '';

  console.log('[PORT-DETECTOR] 🔍 Scanning source code for port number...');
  console.log('[PORT-DETECTOR] Language:', language);

  // Rust patterns
  if (language === 'Rust') {
    // Look for env::var("PORT") patterns first
    const envPortMatch = sourceCode.match(/env::var\(['""]PORT['"]\)[\s\S]*?unwrap_or\(['""]?(\d+)['""]?\)/);
    if (envPortMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Rust env PORT with fallback:', envPortMatch[1]);
      return envPortMatch[1];
    }

    // Look for .bind("address:port")
    const bindMatch = sourceCode.match(/\.bind\(['""](?:127\.0\.0\.1|0\.0\.0\.0|localhost):(\d+)['""\)]/);
    if (bindMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Rust .bind() port:', bindMatch[1]);
      return bindMatch[1];
    }

    // Look for TcpListener::bind
    const tcpMatch = sourceCode.match(/TcpListener::bind\(['""](?:127\.0\.0\.1|0\.0\.0\.0|localhost):(\d+)['""\)]/);
    if (tcpMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Rust TcpListener port:', tcpMatch[1]);
      return tcpMatch[1];
    }

    // Look for port variable assignment
    const portVarMatch = sourceCode.match(/let\s+port\s*[:=]\s*(\d+)/);
    if (portVarMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Rust port variable:', portVarMatch[1]);
      return portVarMatch[1];
    }
  }

  // Python patterns
  if (language === 'Python') {
    // Look for os.getenv or os.environ patterns first
    const envPortMatch = sourceCode.match(/(?:os\.getenv|os\.environ\.get)\(['""]PORT['""][^\)]*?(\d+)\)/);
    if (envPortMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Python env PORT with fallback:', envPortMatch[1]);
      return envPortMatch[1];
    }

    // Look for int(os.getenv("PORT", 8000))
    const intEnvMatch = sourceCode.match(/int\(os\.(?:getenv|environ\.get)\(['""]PORT['""][^\)]*?(\d+)\)/);
    if (intEnvMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Python int() wrapped env PORT:', intEnvMatch[1]);
      return intEnvMatch[1];
    }

    // Look for uvicorn.run with port
    const uvicornMatch = sourceCode.match(/uvicorn\.run\([^)]*port\s*=\s*(\d+)/);
    if (uvicornMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Python uvicorn.run() port:', uvicornMatch[1]);
      return uvicornMatch[1];
    }

    // Look for app.run with port
    const flaskMatch = sourceCode.match(/\.run\([^)]*port\s*=\s*(\d+)/);
    if (flaskMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Python Flask .run() port:', flaskMatch[1]);
      return flaskMatch[1];
    }

    // Look for runserver with port
    const djangoMatch = sourceCode.match(/runserver\s+(?:0\.0\.0\.0:)?(\d+)/);
    if (djangoMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Django runserver port:', djangoMatch[1]);
      return djangoMatch[1];
    }

    // Look for PORT variable assignment
    const portVarMatch = sourceCode.match(/PORT\s*=\s*(\d+)/);
    if (portVarMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Python PORT variable:', portVarMatch[1]);
      return portVarMatch[1];
    }
  }

  // Go patterns
  if (language === 'Go') {
    // Look for os.Getenv("PORT") patterns first
    const envPortMatch = sourceCode.match(/os\.Getenv\(['""]PORT['""\)][^\n]*?['""](\d+)['"]/);
    if (envPortMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Go env PORT with fallback:', envPortMatch[1]);
      return envPortMatch[1];
    }

    // Look for ListenAndServe(":port", ...)
    const listenMatch = sourceCode.match(/ListenAndServe\(['""][:]+(\d+)["'"]/);
    if (listenMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Go ListenAndServe() port:', listenMatch[1]);
      return listenMatch[1];
    }

    // Look for .Run(":port")
    const runMatch = sourceCode.match(/\.Run\(['""][:]+(\d+)["'"]/);
    if (runMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Go Router.Run() port:', runMatch[1]);
      return runMatch[1];
    }

    // Look for port variable/constant
    const portVarMatch = sourceCode.match(/(?:var|const)\s+port\s*=\s*['":]?(\d+)/i);
    if (portVarMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Go port variable:', portVarMatch[1]);
      return portVarMatch[1];
    }
  }

  // Node.js / JavaScript / TypeScript patterns
  if (language === 'Node.js' || language === 'Node.js/TypeScript' || language.includes('JavaScript') || language.includes('TypeScript')) {
    // Look for process.env.PORT || 8000 (most common pattern)
    const envPortMatch = sourceCode.match(/process\.env\.PORT\s*\|\|\s*(\d+)/);
    if (envPortMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Node.js env PORT fallback:', envPortMatch[1]);
      return envPortMatch[1];
    }

    // Look for Number(process.env.PORT) || 8000
    const numberEnvMatch = sourceCode.match(/Number\(process\.env\.PORT\)\s*\|\|\s*(\d+)/);
    if (numberEnvMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Node.js Number() wrapped env PORT:', numberEnvMatch[1]);
      return numberEnvMatch[1];
    }

    // Look for parseInt(process.env.PORT) || 8000
    const parseIntMatch = sourceCode.match(/parseInt\(process\.env\.PORT[^\)]*\)\s*\|\|\s*(\d+)/);
    if (parseIntMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Node.js parseInt() wrapped env PORT:', parseIntMatch[1]);
      return parseIntMatch[1];
    }

    // Look for app.set('port', process.env.PORT || 3000)
    const setPortEnvMatch = sourceCode.match(/\.set\(['"]port['"]\s*,\s*process\.env\.PORT\s*\|\|\s*(\d+)/);
    if (setPortEnvMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Node.js app.set() with env PORT:', setPortEnvMatch[1]);
      return setPortEnvMatch[1];
    }

    // Look for app.set('port', 3000)
    const setPortMatch = sourceCode.match(/\.set\(['"]port['"]\s*,\s*(\d+)/);
    if (setPortMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Node.js app.set() port:', setPortMatch[1]);
      return setPortMatch[1];
    }

    // Look for app.listen(8000, ...)
    const listenMatch = sourceCode.match(/\.listen\(\s*(\d+)/);
    if (listenMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Node.js app.listen() port:', listenMatch[1]);
      return listenMatch[1];
    }

    // Look for const PORT = 8000 or const port = 8000
    const constPortMatch = sourceCode.match(/const\s+(?:PORT|port)\s*=\s*(?:process\.env\.PORT\s*\|\|\s*)?(\d+)/i);
    if (constPortMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Node.js const PORT:', constPortMatch[1]);
      return constPortMatch[1];
    }

    // Look for let port = 8000
    const letPortMatch = sourceCode.match(/let\s+port\s*=\s*(\d+)/i);
    if (letPortMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Node.js let port:', letPortMatch[1]);
      return letPortMatch[1];
    }

    // Look for var port = 8000
    const varPortMatch = sourceCode.match(/var\s+port\s*=\s*(\d+)/i);
    if (varPortMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Node.js var port:', varPortMatch[1]);
      return varPortMatch[1];
    }
  }

  // Java patterns
  if (language === 'Java') {
    // Look for server.port in application.properties style
    const serverPortMatch = sourceCode.match(/server\.port\s*=\s*(\d+)/);
    if (serverPortMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Java server.port:', serverPortMatch[1]);
      return serverPortMatch[1];
    }

    // Look for setPort or port variable
    const portMatch = sourceCode.match(/\.setPort\((\d+)\)|port\s*=\s*(\d+)/);
    if (portMatch) {
      const port = portMatch[1] || portMatch[2];
      console.log('[PORT-DETECTOR] ✅ Found Java port:', port);
      return port;
    }
  }

  // PHP patterns
  if (language === 'PHP') {
    // Look for $_ENV['PORT'] or getenv('PORT')
    const envPortMatch = sourceCode.match(/(?:\$_ENV\[['"]PORT['"]\]|getenv\(['"]PORT['"]\))[^\d]*(\d+)/);
    if (envPortMatch) {
      console.log('[PORT-DETECTOR] ✅ Found PHP env PORT with fallback:', envPortMatch[1]);
      return envPortMatch[1];
    }

    // Look for port variable
    const portMatch = sourceCode.match(/\$port\s*=\s*(\d+)/);
    if (portMatch) {
      console.log('[PORT-DETECTOR] ✅ Found PHP $port variable:', portMatch[1]);
      return portMatch[1];
    }
  }

  // Ruby patterns
  if (language === 'Ruby') {
    // Look for ENV['PORT'] or ENV.fetch('PORT')
    const envPortMatch = sourceCode.match(/ENV(?:\.fetch)?\(['"]PORT['"]\s*[,)][\s\S]*?(\d+)/);
    if (envPortMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Ruby ENV PORT with fallback:', envPortMatch[1]);
      return envPortMatch[1];
    }

    // Look for set :port, 8000
    const setPortMatch = sourceCode.match(/set\s+:port\s*,\s*(\d+)/);
    if (setPortMatch) {
      console.log('[PORT-DETECTOR] ✅ Found Ruby set :port:', setPortMatch[1]);
      return setPortMatch[1];
    }
  }

  console.log('[PORT-DETECTOR] ⚠️  No port found in source code - will use language defaults');
  return '';
}

/**
 * Get smart default port based on language and framework
 */
export function getDefaultPort(language: string, framework?: string): string {
  // Framework-specific defaults
  if (framework) {
    const frameworkLower = framework.toLowerCase();
    if (frameworkLower.includes('django') || frameworkLower.includes('fastapi')) return '8000';
    if (frameworkLower.includes('flask')) return '5000';
    if (frameworkLower.includes('next')) return '3000';
    if (frameworkLower.includes('express')) return '3000';
    if (frameworkLower.includes('spring')) return '8080';
    if (frameworkLower.includes('gin') || frameworkLower.includes('fiber')) return '8080';
    if (frameworkLower.includes('rocket') || frameworkLower.includes('actix')) return '8000';
    if (frameworkLower.includes('rails')) return '3000';
    if (frameworkLower.includes('laravel')) return '8000';
  }

  // Language-specific defaults
  const langLower = language.toLowerCase();
  if (langLower.includes('python')) return '8000';
  if (langLower.includes('node') || langLower.includes('javascript') || langLower.includes('typescript')) return '3000';
  if (langLower.includes('go')) return '8080';
  if (langLower.includes('rust')) return '8000';
  if (langLower.includes('java')) return '8080';
  if (langLower.includes('ruby')) return '3000';
  if (langLower.includes('php')) return '8000';
  if (langLower.includes('.net') || langLower.includes('csharp')) return '5000';

  // Generic default
  return '8000';
}

/**
 * Detect port from multiple sources with fallback chain
 */
export function detectPortWithFallback(
  sourceCode: string | undefined,
  language: string,
  framework?: string
): string {
  // Try source code detection first
  if (sourceCode) {
    const detectedPort = extractPortFromSource(sourceCode, language);
    if (detectedPort) {
      console.log(`[PORT-DETECTOR] ✅ Using detected port: ${detectedPort}`);
      return detectedPort;
    }
  }

  // Fall back to smart default
  const defaultPort = getDefaultPort(language, framework);
  console.log(`[PORT-DETECTOR] 📌 Using default port for ${language}${framework ? ` (${framework})` : ''}: ${defaultPort}`);
  return defaultPort;
}

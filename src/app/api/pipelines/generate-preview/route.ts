/**
 * Generate AI Pipeline Preview
 * Analyzes repository and generates YAML pipeline WITHOUT deploying
 * NOW SUPPORTS: Rust, Go, Python, Node.js, Java, Ruby, PHP, .NET, Solana
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchProjectFiles, detectLanguageAndFramework } from '@/lib/github/multi-language-analyzer';
import { generateAIPipeline } from '@/lib/ai/enhanced-pipeline-generator';
import { detectPortWithFallback } from '@/lib/enhanced-port-detector';

/**
 * POST /api/pipelines/generate-preview
 * Generate YAML pipeline preview for ANY language repository
 */
export async function POST(request: NextRequest) {
  try {
    const { repoUrl, repoFullName, githubToken } = await request.json();

    if (!repoUrl || !repoFullName) {
      return NextResponse.json(
        { error: 'Repository URL and name are required' },
        { status: 400 }
      );
    }

    console.log('[PIPELINE-PREVIEW] Analyzing repository:', repoFullName);

    // Extract owner and repo
    const [owner, repo] = repoFullName.split('/');

    // Fetch project files
    console.log('[PIPELINE-PREVIEW] Fetching project files...');
    const projectFiles = await fetchProjectFiles(owner, repo, githubToken);

    console.log('[ANALYZER] Fetched files:', Object.keys(projectFiles));

    // Detect language and framework
    console.log('[PIPELINE-PREVIEW] Detecting language and framework...');
    const languageInfo = detectLanguageAndFramework(projectFiles);

    console.log('[PIPELINE-PREVIEW] Language:', languageInfo.primaryLanguage);
    console.log('[PIPELINE-PREVIEW] Framework:', languageInfo.framework);

    // Detect port from source code files
    console.log('[PIPELINE-PREVIEW] 🔍 Detecting port from source code...');
    let detectedPort = '3000'; // default fallback

    try {
      // Select appropriate source file based on language
      let sourceCode: string | undefined;
      let sourceFileName = '';

      if (languageInfo.primaryLanguage === 'Rust' && projectFiles.mainRs) {
        sourceCode = projectFiles.mainRs;
        sourceFileName = 'src/main.rs';
      } else if (languageInfo.primaryLanguage === 'Go' && projectFiles.mainGo) {
        sourceCode = projectFiles.mainGo;
        sourceFileName = 'main.go';
      } else if (languageInfo.primaryLanguage === 'Python' && projectFiles.mainPy) {
        sourceCode = projectFiles.mainPy;
        sourceFileName = 'main.py';
      } else if ((languageInfo.primaryLanguage === 'JavaScript/TypeScript' || languageInfo.primaryLanguage === 'Node.js') && projectFiles.indexJs) {
        sourceCode = projectFiles.indexJs;
        sourceFileName = 'index.js';
      } else if (languageInfo.primaryLanguage === 'Java' && projectFiles.applicationProperties) {
        sourceCode = projectFiles.applicationProperties;
        sourceFileName = 'application.properties';
      } else if (languageInfo.primaryLanguage === 'Ruby' && projectFiles.appRb) {
        sourceCode = projectFiles.appRb;
        sourceFileName = 'app.rb';
      } else if (languageInfo.primaryLanguage === 'PHP' && projectFiles.indexPhp) {
        sourceCode = projectFiles.indexPhp;
        sourceFileName = 'index.php';
      }

      // Detect port using enhanced port detector
      if (sourceCode) {
        detectedPort = detectPortWithFallback(
          sourceCode,
          languageInfo.primaryLanguage,
          languageInfo.framework
        );
        console.log(`[PIPELINE-PREVIEW] ✅ Detected port ${detectedPort} from ${sourceFileName}`);
      } else {
        console.log('[PIPELINE-PREVIEW] ⚠️  No source file found for port detection, using default');
        detectedPort = detectPortWithFallback(
          undefined,
          languageInfo.primaryLanguage,
          languageInfo.framework
        );
        console.log(`[PIPELINE-PREVIEW] 📌 Using default port ${detectedPort} for ${languageInfo.primaryLanguage}`);
      }
    } catch (portError: any) {
      console.error('[PIPELINE-PREVIEW] Port detection error:', portError);
      console.log('[PIPELINE-PREVIEW] Using default port 3000');
      detectedPort = '3000';
    }

    // Update languageInfo with the detected port (overrides any default port)
    languageInfo.port = detectedPort;
    console.log('[PIPELINE-PREVIEW] Updated languageInfo.port to:', detectedPort);

    // Generate AI pipeline via Sonnet
    console.log('[PIPELINE-PREVIEW] Generating AI pipeline...');
    let generatedPipeline;
    try {
      generatedPipeline = await generateAIPipeline(
        repoFullName,
        projectFiles,
        languageInfo
      );
      console.log('[PIPELINE-PREVIEW] ✓ YAML generated successfully!');
    } catch (yamlError: any) {
      console.error('[PIPELINE-PREVIEW] YAML generation error:', yamlError);
      throw new Error('Failed to generate pipeline YAML: ' + yamlError.message);
    }

    console.log('[PIPELINE-PREVIEW] ✓ Pipeline generated successfully');
    console.log('[PIPELINE-PREVIEW] Stages:', generatedPipeline.stages.join(', '));
    console.log('[PIPELINE-PREVIEW] YAML length:', generatedPipeline.yamlContent.length);

    return NextResponse.json({
      success: true,
      pipeline: {
        yaml: generatedPipeline.yamlContent,
        stages: generatedPipeline.stages,
        language: generatedPipeline.language,
        framework: generatedPipeline.framework,
      },
      detection: {
        language: languageInfo.primaryLanguage,
        framework: languageInfo.framework || 'Unknown',
        projectType: 'unknown',
        packageManager: languageInfo.packageManager || 'unknown',
        buildTool: languageInfo.buildTool || 'unknown',
        hasTests: Boolean(languageInfo.hasTests),
        hasLinter: Boolean(languageInfo.hasLinter),
        detectedFiles: languageInfo.detectedFiles || [],
        installCommand: '',
        buildCommand: '',
        testCommand: '',
        startCommand: '',
        port: detectedPort, // ✅ Use AI-detected port from source code
        isSolanaProject: false,
      },
    });
  } catch (error: any) {
    console.error('[PIPELINE-PREVIEW] Error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate pipeline preview',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}



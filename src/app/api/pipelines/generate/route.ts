/**
 * API Route for AI-Powered Pipeline Generation
 * Analyzes GitHub repository and generates optimized YAML pipeline using Amazon Nova
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchProjectFiles, detectLanguageAndFramework } from '@/lib/github/multi-language-analyzer';
import { generateAIPipeline } from '@/lib/ai/enhanced-pipeline-generator';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const body = await request.json();
    const { owner, repo, repoFullName } = body;

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Missing owner or repo parameter' },
        { status: 400 }
      );
    }

    console.log('[PIPELINE-GEN] Generating AI-powered pipeline for:', repoFullName || `${owner}/${repo}`);

    // Extract GitHub token from auth header
    let githubToken: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // Skip demo tokens
      if (!token.startsWith('demo_github_token')) {
        githubToken = token;
      }
    }

    // STEP 1: Fetch project files from GitHub
    console.log('[PIPELINE-GEN] Step 1: Fetching project files...');
    const projectFiles = await fetchProjectFiles(owner, repo, githubToken);

    if (Object.keys(projectFiles).length === 0) {
      console.warn('[PIPELINE-GEN] No project files found, using basic detection');
    }

    // STEP 2: Detect language and framework
    console.log('[PIPELINE-GEN] Step 2: Detecting language and framework...');
    const languageInfo = detectLanguageAndFramework(projectFiles);

    console.log('[PIPELINE-GEN] Detected:', {
      language: languageInfo.primaryLanguage,
      framework: languageInfo.framework,
      packageManager: languageInfo.packageManager,
      buildTool: languageInfo.buildTool,
    });

    // STEP 3: Generate AI-powered YAML pipeline
    console.log('[PIPELINE-GEN] Step 3: Generating YAML with Amazon Nova AI...');
    const generatedPipeline = await generateAIPipeline(
      repoFullName || `${owner}/${repo}`,
      projectFiles,
      languageInfo
    );

    console.log('[PIPELINE-GEN] ✓ Pipeline generated successfully');
    console.log('[PIPELINE-GEN] Stages:', generatedPipeline.stages.join(', '));

    return NextResponse.json({
      yaml: generatedPipeline.yamlContent,
      parsedPipeline: generatedPipeline.parsedPipeline,
      stages: generatedPipeline.stages,
      language: generatedPipeline.language,
      framework: generatedPipeline.framework,
      detection: {
        language: languageInfo.primaryLanguage,
        framework: languageInfo.framework,
        packageManager: languageInfo.packageManager,
        buildTool: languageInfo.buildTool,
        hasTests: languageInfo.hasTests,
        hasLinter: languageInfo.hasLinter,
        detectedFiles: languageInfo.detectedFiles,
      },
      message: 'AI-powered pipeline generated successfully',
    });
  } catch (error: any) {
    console.error('[PIPELINE-GEN] Error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate pipeline',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}

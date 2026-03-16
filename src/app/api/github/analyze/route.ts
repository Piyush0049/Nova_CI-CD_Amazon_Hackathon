// API Route for analyzing GitHub repository

import { NextRequest } from 'next/server';
import { GitHubService } from '@/lib/github/github-service';

// Mock analysis results for demo mode
const getMockAnalysis = (repo: string) => {
  const analyses: Record<string, any> = {
    'nextjs-ecommerce': {
      type: 'nodejs',
      framework: 'nextjs',
      language: 'TypeScript',
      files: ['package.json', 'tsconfig.json', 'next.config.js', 'src/app/page.tsx'],
      description: 'Full-stack e-commerce application built with Next.js 14',
      packageInfo: JSON.stringify({
        dependencies: {
          'next': '^14.0.0',
          'react': '^18.0.0',
          'typescript': '^5.0.0'
        }
      }, null, 2)
    },
    'python-api': {
      type: 'python',
      framework: 'fastapi',
      language: 'Python',
      files: ['requirements.txt', 'main.py', 'app/__init__.py', 'tests/'],
      description: 'REST API built with FastAPI and PostgreSQL',
      packageInfo: 'fastapi==0.104.1\nuvicorn==0.24.0\npydantic==2.5.0\nsqlalchemy==2.0.23'
    },
    'react-dashboard': {
      type: 'nodejs',
      framework: 'react',
      language: 'JavaScript',
      files: ['package.json', 'src/App.js', 'src/components/', 'public/'],
      description: 'Admin dashboard with charts and analytics',
      packageInfo: JSON.stringify({
        dependencies: {
          'react': '^18.2.0',
          'recharts': '^2.10.0',
          'react-router-dom': '^6.20.0'
        }
      }, null, 2)
    },
    'docker-microservices': {
      type: 'docker',
      framework: 'go',
      language: 'Go',
      files: ['Dockerfile', 'docker-compose.yml', 'go.mod', 'main.go', 'k8s/'],
      description: 'Microservices architecture with Docker and Kubernetes',
      packageInfo: ''
    },
    'mobile-app': {
      type: 'nodejs',
      framework: 'react-native',
      language: 'TypeScript',
      files: ['package.json', 'app.json', 'src/', 'android/', 'ios/'],
      description: 'Cross-platform mobile app with React Native',
      packageInfo: JSON.stringify({
        dependencies: {
          'react-native': '^0.72.0',
          'expo': '^49.0.0'
        }
      }, null, 2)
    }
  };

  return analyses[repo] || {
    type: 'nodejs',
    framework: 'node',
    language: 'JavaScript',
    files: ['package.json', 'index.js'],
    description: 'Node.js application',
    packageInfo: JSON.stringify({ dependencies: {} }, null, 2)
  };
};

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = authHeader.substring(7);
    const body = await request.json();
    const { owner, repo } = body;

    if (!owner || !repo) {
      return new Response(
        JSON.stringify({ error: 'Missing owner or repo parameter' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check if using demo token (only for manual "Connect GitHub" demo flow)
    const isDemoToken = accessToken.startsWith('demo_github_token');

    if (isDemoToken) {
      // Return mock analysis for demo token
      console.log(`Returning mock analysis for ${repo}`);
      const mockAnalysis = getMockAnalysis(repo);

      return new Response(
        JSON.stringify({ analysis: mockAnalysis }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Use real GitHub API with OAuth token
    const github = new GitHubService(accessToken);

    // Detect project type
    const analysis = await github.detectProjectType(owner, repo);

    // Get additional context
    const repoDetails = await github.getRepository(owner, repo);

    // Try to get package.json or requirements.txt for more context
    let packageInfo = '';
    if (analysis.type === 'nodejs') {
      packageInfo = await github.getFileContents(owner, repo, 'package.json');
    } else if (analysis.type === 'python') {
      packageInfo = await github.getFileContents(owner, repo, 'requirements.txt');
    }

    const result = {
      analysis: {
        ...analysis,
        description: repoDetails.description,
        packageInfo: packageInfo.substring(0, 1000), // Limit size
      },
    };

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Failed to analyze repository:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to analyze repository' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

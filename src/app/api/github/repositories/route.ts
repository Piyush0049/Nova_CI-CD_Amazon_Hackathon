// API Route for fetching GitHub repositories

import { NextRequest } from 'next/server';
import { GitHubService } from '@/lib/github/github-service';

// Mock repositories for demo mode
const mockRepositories = [
  {
    id: 1,
    name: 'nextjs-ecommerce',
    full_name: 'demo-user/nextjs-ecommerce',
    description: 'Full-stack e-commerce application built with Next.js 14',
    private: false,
    html_url: 'https://github.com/demo-user/nextjs-ecommerce',
    default_branch: 'main',
    language: 'TypeScript',
    topics: ['nextjs', 'react', 'ecommerce', 'typescript'],
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    size: 15420,
  },
  {
    id: 2,
    name: 'python-api',
    full_name: 'demo-user/python-api',
    description: 'REST API built with FastAPI and PostgreSQL',
    private: false,
    html_url: 'https://github.com/demo-user/python-api',
    default_branch: 'main',
    language: 'Python',
    topics: ['fastapi', 'python', 'api', 'postgresql'],
    updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    size: 8340,
  },
  {
    id: 3,
    name: 'react-dashboard',
    full_name: 'demo-user/react-dashboard',
    description: 'Admin dashboard with charts and analytics',
    private: true,
    html_url: 'https://github.com/demo-user/react-dashboard',
    default_branch: 'main',
    language: 'JavaScript',
    topics: ['react', 'dashboard', 'analytics', 'charts'],
    updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    size: 12150,
  },
  {
    id: 4,
    name: 'docker-microservices',
    full_name: 'demo-user/docker-microservices',
    description: 'Microservices architecture with Docker and Kubernetes',
    private: false,
    html_url: 'https://github.com/demo-user/docker-microservices',
    default_branch: 'main',
    language: 'Go',
    topics: ['docker', 'kubernetes', 'microservices', 'golang'],
    updated_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    size: 25680,
  },
  {
    id: 5,
    name: 'mobile-app',
    full_name: 'demo-user/mobile-app',
    description: 'Cross-platform mobile app with React Native',
    private: true,
    html_url: 'https://github.com/demo-user/mobile-app',
    default_branch: 'develop',
    language: 'TypeScript',
    topics: ['react-native', 'mobile', 'ios', 'android'],
    updated_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    size: 18920,
  },
];

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = authHeader.substring(7);

    // Check if using demo token (only for manual "Connect GitHub" demo flow)
    const isDemoToken = accessToken.startsWith('demo_github_token');

    if (isDemoToken) {
      // Return mock data for demo token
      console.log('Returning mock repositories for demo token');
      return new Response(
        JSON.stringify({ repositories: mockRepositories }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Use real GitHub API with OAuth token
    console.log('Fetching real repositories from GitHub API');
    const github = new GitHubService(accessToken);
    const repositories = await github.getRepositories();

    return new Response(
      JSON.stringify({ repositories }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Failed to fetch repositories:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to fetch repositories' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

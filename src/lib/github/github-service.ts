// GitHub Integration Service

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  html_url: string;
  default_branch: string;
  language: string;
  topics: string[];
  updated_at: string;
  size: number;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string;
  email: string;
}

export class GitHubService {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  /**
   * Fetch authenticated user's repositories
   */
  async getRepositories(): Promise<GitHubRepo[]> {
    try {
      const response = await fetch('https://api.github.com/user/repos?per_page=100&sort=updated', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const repos: GitHubRepo[] = await response.json();
      return repos;
    } catch (error) {
      console.error('Failed to fetch repositories:', error);
      throw error;
    }
  }

  /**
   * Get repository details
   */
  async getRepository(owner: string, repo: string): Promise<GitHubRepo> {
    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch repository:', error);
      throw error;
    }
  }

  /**
   * Get repository file contents
   */
  async getFileContents(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    try {
      const url = ref
        ? `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`
        : `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      const data = await response.json();

      // Decode base64 content
      if (data.content) {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }

      return '';
    } catch (error) {
      console.error('Failed to fetch file contents:', error);
      return '';
    }
  }

  /**
   * Get repository tree (file structure)
   */
  async getRepositoryTree(owner: string, repo: string, ref?: string): Promise<any> {
    try {
      const branch = ref || 'main';
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch repository tree:', error);
      throw error;
    }
  }

  /**
   * Detect project type based on files
   */
  async detectProjectType(owner: string, repo: string): Promise<{
    type: string;
    framework?: string;
    language: string;
    files: string[];
  }> {
    try {
      const tree = await this.getRepositoryTree(owner, repo);
      const files = tree.tree?.map((item: any) => item.path) || [];

      // Node.js detection
      if (files.includes('package.json')) {
        const packageJson = await this.getFileContents(owner, repo, 'package.json');
        let framework = 'node';

        if (packageJson) {
          if (packageJson.includes('"next"')) framework = 'nextjs';
          else if (packageJson.includes('"react"')) framework = 'react';
          else if (packageJson.includes('"vue"')) framework = 'vue';
          else if (packageJson.includes('"express"')) framework = 'express';
          else if (packageJson.includes('"nest"')) framework = 'nestjs';
        }

        return { type: 'nodejs', framework, language: 'javascript', files };
      }

      // Python detection
      if (files.includes('requirements.txt') || files.includes('setup.py') || files.includes('pyproject.toml')) {
        const framework = files.includes('manage.py') ? 'django' :
                         files.includes('app.py') || files.includes('application.py') ? 'flask' :
                         'python';

        return { type: 'python', framework, language: 'python', files };
      }

      // Go detection
      if (files.includes('go.mod')) {
        return { type: 'go', language: 'go', files };
      }

      // Rust detection
      if (files.includes('Cargo.toml')) {
        return { type: 'rust', language: 'rust', files };
      }

      // Java detection
      if (files.includes('pom.xml') || files.includes('build.gradle')) {
        const framework = files.includes('pom.xml') ? 'maven' : 'gradle';
        return { type: 'java', framework, language: 'java', files };
      }

      // Docker detection
      if (files.includes('Dockerfile')) {
        return { type: 'docker', language: 'dockerfile', files };
      }

      return { type: 'unknown', language: 'unknown', files };
    } catch (error) {
      console.error('Failed to detect project type:', error);
      return { type: 'unknown', language: 'unknown', files: [] };
    }
  }

  /**
   * Get authenticated user info
   */
  async getCurrentUser(): Promise<GitHubUser> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to fetch user:', error);
      throw error;
    }
  }
}

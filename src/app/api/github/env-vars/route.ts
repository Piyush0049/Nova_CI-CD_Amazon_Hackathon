import { NextRequest, NextResponse } from 'next/server';

/**
 * Auto-detect environment variables from repository
 * Parses .env.example and scans code for process.env usage
 */
export async function POST(request: NextRequest) {
  try {
    const { repoFullName, githubToken } = await request.json();

    if (!repoFullName) {
      return NextResponse.json(
        { error: 'Repository name is required' },
        { status: 400 }
      );
    }

    const [owner, repo] = repoFullName.split('/');
    const headers: HeadersInit = {
      Accept: 'application/vnd.github.v3.raw',
    };

    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    const envVars: Record<string, { value: string; description: string; required: boolean }> = {};

    // Step 1: Try to fetch .env.example
    try {
      const envExampleResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/.env.example`,
        { headers }
      );

      if (envExampleResponse.ok) {
        const envExampleContent = await envExampleResponse.text();

        // Parse .env.example
        const lines = envExampleContent.split('\n');
        let currentComment = '';

        for (const line of lines) {
          const trimmed = line.trim();

          // Capture comments as descriptions
          if (trimmed.startsWith('#')) {
            currentComment = trimmed.substring(1).trim();
            continue;
          }

          // Parse variable: VAR_NAME=value
          if (trimmed && !trimmed.startsWith('#')) {
            const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
            if (match) {
              const [, key, value] = match;

              // Determine if required (no default value or value is empty/placeholder)
              const hasValue = value && value !== '' && !value.includes('your_') && !value.includes('xxx');

              envVars[key] = {
                value: hasValue ? value : '',
                description: currentComment || `Environment variable: ${key}`,
                required: !hasValue,
              };

              currentComment = ''; // Reset comment for next variable
            }
          }
        }

        console.log(`[ENV-DETECT] Found ${Object.keys(envVars).length} variables in .env.example`);
      }
    } catch (error) {
      console.log('[ENV-DETECT] .env.example not found, scanning code...');
    }

    // Step 2: Scan package.json for common vars
    try {
      const packageJsonResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/package.json`,
        { headers }
      );

      if (packageJsonResponse.ok) {
        const packageJson = await packageJsonResponse.json();

        // Add common Next.js env vars if Next.js project
        if (packageJson.dependencies?.next) {
          if (!envVars['NEXT_PUBLIC_API_URL']) {
            envVars['NEXT_PUBLIC_API_URL'] = {
              value: '',
              description: 'Public API URL for Next.js',
              required: false,
            };
          }
        }

        // Add database URL if DB dependencies found
        const hasDatabase =
          packageJson.dependencies?.mongoose ||
          packageJson.dependencies?.prisma ||
          packageJson.dependencies?.pg ||
          packageJson.dependencies?.mysql;

        if (hasDatabase && !envVars['DATABASE_URL']) {
          envVars['DATABASE_URL'] = {
            value: '',
            description: 'Database connection string',
            required: true,
          };
        }
      }
    } catch (error) {
      console.log('[ENV-DETECT] Could not scan package.json');
    }

    // Step 3: If no env vars found, provide some common defaults
    if (Object.keys(envVars).length === 0) {
      envVars['NODE_ENV'] = {
        value: 'production',
        description: 'Node environment',
        required: false,
      };
    }

    return NextResponse.json({
      success: true,
      envVars,
      count: Object.keys(envVars).length,
    });

  } catch (error: any) {
    console.error('[ENV-DETECT] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to detect environment variables' },
      { status: 500 }
    );
  }
}

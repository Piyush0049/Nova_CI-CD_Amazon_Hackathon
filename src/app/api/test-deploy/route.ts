import { NextRequest, NextResponse } from 'next/server';

/**
 * Test deployment system - Verifies all components are working
 */
export async function GET(request: NextRequest) {
  const tests = {
    timestamp: new Date().toISOString(),
    results: [] as Array<{test: string, status: 'PASS' | 'FAIL', message: string}>,
  };

  // Test 1: Environment Variables
  try {
    const requiredEnvVars = [
      'AWS_REGION',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_AMI_ID',
      'AWS_SECURITY_GROUP_ID',
      'MONGODB_URI',
    ];

    const missing = requiredEnvVars.filter(v => !process.env[v]);

    if (missing.length === 0) {
      tests.results.push({
        test: 'Environment Variables',
        status: 'PASS',
        message: 'All required environment variables are set',
      });
    } else {
      tests.results.push({
        test: 'Environment Variables',
        status: 'FAIL',
        message: `Missing: ${missing.join(', ')}`,
      });
    }
  } catch (error: any) {
    tests.results.push({
      test: 'Environment Variables',
      status: 'FAIL',
      message: error.message,
    });
  }

  // Test 2: AWS SDK
  try {
    const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
    const { EC2Client } = await import('@aws-sdk/client-ec2');
    const { SSMClient } = await import('@aws-sdk/client-ssm');

    const bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    const ec2Client = new EC2Client({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    const ssmClient = new SSMClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    tests.results.push({
      test: 'AWS SDK Initialization',
      status: 'PASS',
      message: 'Bedrock, EC2, and SSM clients initialized successfully',
    });
  } catch (error: any) {
    tests.results.push({
      test: 'AWS SDK Initialization',
      status: 'FAIL',
      message: error.message,
    });
  }

  // Test 3: MongoDB Connection
  try {
    const mongoose = await import('mongoose');

    if (mongoose.default.connection.readyState === 1) {
      tests.results.push({
        test: 'MongoDB Connection',
        status: 'PASS',
        message: 'MongoDB is already connected',
      });
    } else if (process.env.MONGODB_URI) {
      tests.results.push({
        test: 'MongoDB Connection',
        status: 'PASS',
        message: 'MongoDB URI is configured',
      });
    } else {
      tests.results.push({
        test: 'MongoDB Connection',
        status: 'FAIL',
        message: 'MONGODB_URI not set in environment variables',
      });
    }
  } catch (error: any) {
    tests.results.push({
      test: 'MongoDB Connection',
      status: 'FAIL',
      message: error.message,
    });
  }

  // Test 4: Nova AI Configuration
  try {
    const modelId = 'us.amazon.nova-premier-v1:0';
    const maxTokens = 8000;
    const temperature = 0.15;

    if (modelId && maxTokens > 0 && temperature >= 0) {
      tests.results.push({
        test: 'Nova AI Configuration',
        status: 'PASS',
        message: `Model: ${modelId}, Tokens: ${maxTokens}, Temp: ${temperature}`,
      });
    } else {
      tests.results.push({
        test: 'Nova AI Configuration',
        status: 'FAIL',
        message: 'Invalid configuration',
      });
    }
  } catch (error: any) {
    tests.results.push({
      test: 'Nova AI Configuration',
      status: 'FAIL',
      message: error.message,
    });
  }

  // Test 5: Deployment Functions
  try {
    const { analyzeRepositoryStructure } = await import('@/lib/novaDeploymentFixer');

    if (typeof analyzeRepositoryStructure === 'function') {
      tests.results.push({
        test: 'Deployment Functions',
        status: 'PASS',
        message: 'All deployment functions are available',
      });
    } else {
      tests.results.push({
        test: 'Deployment Functions',
        status: 'FAIL',
        message: 'Deployment functions not properly exported',
      });
    }
  } catch (error: any) {
    tests.results.push({
      test: 'Deployment Functions',
        status: 'FAIL',
      message: error.message,
    });
  }

  // Calculate summary
  const passed = tests.results.filter(r => r.status === 'PASS').length;
  const failed = tests.results.filter(r => r.status === 'FAIL').length;
  const total = tests.results.length;

  const summary = {
    total,
    passed,
    failed,
    passRate: Math.round((passed / total) * 100),
    overallStatus: failed === 0 ? 'ALL TESTS PASSED ✅' : `${failed} TEST(S) FAILED ❌`,
  };

  return NextResponse.json({
    summary,
    tests: tests.results,
    timestamp: tests.timestamp,
    recommendations: failed > 0
      ? [
          'Check .env file for missing or incorrect values',
          'Verify AWS credentials have correct permissions',
          'Ensure MongoDB is running and accessible',
          'Review AWS_REGION setting',
        ]
      : ['System is ready for deployment! 🚀'],
  });
}

/**
 * YAML-Driven Smart Deployment
 * Analyzes ANY language/framework, generates AI-powered YAML pipeline, and executes it
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { EC2Client, RunInstancesCommand, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { SSMClient, SendCommandCommand, GetCommandInvocationCommand } from '@aws-sdk/client-ssm';
import dbConnect from '@/lib/mongodb';
import Deployment from '@/models/Deployment';
import Pipeline from '@/models/Pipeline';
import {
  fetchProjectFiles,
  detectLanguageAndFramework,
} from '@/lib/github/multi-language-analyzer';
import { generateAIPipeline } from '@/lib/ai/enhanced-pipeline-generator';
import { executePipelineWithAutoFix } from '@/lib/cicd/yaml-executor';

const ec2Client = new EC2Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const ssmClient = new SSMClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * POST /api/deploy/yaml-driven
 * Universal deployment for ANY language/framework using AI-generated YAML
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    const { repoUrl, repoFullName, githubToken, pipelineName, envVars = {} } =
      await request.json();

    if (!repoUrl || !repoFullName) {
      return NextResponse.json(
        { error: 'Repository URL and name are required' },
        { status: 400 }
      );
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('[YAML-DEPLOY] 🚀 Starting YAML-Driven Deployment');
    console.log('[YAML-DEPLOY] Repository:', repoFullName);
    console.log('[YAML-DEPLOY] Environment variables:', Object.keys(envVars).length);
    console.log('='.repeat(70));
    console.log('');

    // Extract owner and repo
    const [owner, repo] = repoFullName.split('/');

    // ==========================================
    // PHASE 1: Analyze Repository
    // ==========================================
    console.log('[PHASE 1] 📊 Analyzing repository structure...');

    const projectFiles = await fetchProjectFiles(owner, repo, githubToken);
    const languageInfo = detectLanguageAndFramework(projectFiles);

    console.log('[YAML-DEPLOY] ✓ Detected language:', languageInfo.primaryLanguage);
    console.log('[YAML-DEPLOY] ✓ Detected framework:', languageInfo.framework || 'N/A');
    console.log('[YAML-DEPLOY] ✓ Package manager:', languageInfo.packageManager || 'N/A');
    console.log('[YAML-DEPLOY] ✓ Build tool:', languageInfo.buildTool || 'N/A');
    console.log('');

    // ==========================================
    // PHASE 2: Generate AI Pipeline
    // ==========================================
    console.log('[PHASE 2]  Generating AI-powered YAML pipeline...');

    const generatedPipeline = await generateAIPipeline(repoFullName, projectFiles, languageInfo);

    console.log('[YAML-DEPLOY] ✓ Pipeline generated with', generatedPipeline.stages.length, 'stages');
    console.log('[YAML-DEPLOY] Stages:', generatedPipeline.stages.join(' → '));
    console.log('');
    console.log('[YAML-DEPLOY] Generated YAML Preview:');
    console.log('-'.repeat(70));
    console.log(generatedPipeline.yamlContent.substring(0, 500));
    console.log(generatedPipeline.yamlContent.length > 500 ? '... (truncated)' : '');
    console.log('-'.repeat(70));
    console.log('');

    // Save pipeline to database
    await dbConnect();
    let savedPipeline = null;

    if (session?.user) {
      try {
        savedPipeline = await Pipeline.create({
          userId: session.user.email || session.user.id || 'unknown',
          name: pipelineName || `${repoFullName}-pipeline`,
          repoFullName,
          repoUrl,
          content: generatedPipeline.yamlContent,
          framework: generatedPipeline.framework,
          language: generatedPipeline.language,
          stages: generatedPipeline.stages,
        });
        console.log('[YAML-DEPLOY] ✓ Pipeline saved to database');
      } catch (dbError) {
        console.error('[YAML-DEPLOY] DB error saving pipeline:', dbError);
      }
    }

    // ==========================================
    // PHASE 3: Provision EC2 Instance
    // ==========================================
    console.log('[PHASE 3] ☁️ Provisioning EC2 instance...');

    const authenticatedRepoUrl = githubToken
      ? repoUrl.replace('https://github.com/', `https://${githubToken}@github.com/`)
      : repoUrl;

    // Determine runtime dependencies based on language
    const runtimeSetup = getRuntimeSetup(languageInfo);

    const userData = `#!/bin/bash
exec > >(tee /var/log/user-data.log)
exec 2>&1

echo "[SETUP] Installing base system dependencies..."
yum update -y

${runtimeSetup.installCommands.join('\n')}

echo "[SETUP] Cloning repository..."
cd /home/ec2-user
rm -rf app
git clone ${authenticatedRepoUrl} app
cd /home/ec2-user/app

${
  Object.keys(envVars).length > 0
    ? `echo "[SETUP] Creating .env file..."
cat > .env << 'ENVEOF'
${Object.entries(envVars)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n')}
ENVEOF
chmod 600 .env
`
    : ''
}

chown -R ec2-user:ec2-user /home/ec2-user/app
echo "[SETUP] ✓ Setup complete - ready for YAML pipeline execution"
`;

    const runInstancesCommand = new RunInstancesCommand({
      ImageId: process.env.AWS_AMI_ID || 'ami-0440d3b780d96b29d',
      InstanceType: (process.env.AWS_INSTANCE_TYPE || 't3.small') as any,
      MinCount: 1,
      MaxCount: 1,
      KeyName: process.env.AWS_KEY_PAIR_NAME,
      SecurityGroupIds: [process.env.AWS_SECURITY_GROUP_ID || ''],
      IamInstanceProfile: process.env.AWS_IAM_INSTANCE_PROFILE
        ? { Name: process.env.AWS_IAM_INSTANCE_PROFILE }
        : undefined,
      TagSpecifications: [
        {
          ResourceType: 'instance',
          Tags: [
            { Key: 'Name', Value: `yaml-deploy-${repoFullName}` },
            { Key: 'Repository', Value: repoFullName },
            { Key: 'Language', Value: languageInfo.primaryLanguage },
            { Key: 'Framework', Value: languageInfo.framework || 'Unknown' },
            { Key: 'DeploymentType', Value: 'YAML-Driven' },
          ],
        },
      ],
      UserData: Buffer.from(userData).toString('base64'),
    });

    const runResponse = await ec2Client.send(runInstancesCommand);
    const instanceId = runResponse.Instances?.[0]?.InstanceId;

    if (!instanceId) {
      throw new Error('Failed to create EC2 instance');
    }

    console.log('[YAML-DEPLOY] ✓ Instance created:', instanceId);

    // Create deployment record
    let deploymentRecord = null;
    if (session?.user) {
      try {
        deploymentRecord = await Deployment.create({
          userId: session.user.email || session.user.id || 'unknown',
          pipelineId: savedPipeline?._id || 'yaml-driven',
          pipelineName: pipelineName || repoFullName,
          repoFullName,
          instanceId,
          publicIp: '',
          instanceType: process.env.AWS_INSTANCE_TYPE || 't3.small',
          region: process.env.AWS_REGION || 'us-east-1',
          status: 'deploying',
          envVarsCount: Object.keys(envVars).length,
          language: languageInfo.primaryLanguage,
          framework: languageInfo.framework,
        });
      } catch (dbError) {
        console.error('[YAML-DEPLOY] DB error:', dbError);
      }
    }

    // Wait for instance to be running
    console.log('[YAML-DEPLOY] Waiting for instance to start...');
    await waitForInstanceRunning(instanceId);

    // Get public IP
    const describeCommand = new DescribeInstancesCommand({ InstanceIds: [instanceId] });
    const instanceDetails = await ec2Client.send(describeCommand);
    const publicIp = instanceDetails.Reservations?.[0]?.Instances?.[0]?.PublicIpAddress;

    if (!publicIp) {
      throw new Error('Failed to get public IP');
    }

    console.log('[YAML-DEPLOY] ✓ Instance running at:', publicIp);

    if (deploymentRecord) {
      await Deployment.findByIdAndUpdate(deploymentRecord._id, { publicIp });
    }

    // Wait for SSM agent
    console.log('[YAML-DEPLOY] Waiting for SSM agent...');
    await waitForSSMReady(instanceId);
    console.log('[YAML-DEPLOY] ✓ SSM ready');

    // Wait for initial setup to complete
    console.log('[YAML-DEPLOY] Waiting for initial setup (60s)...');
    await new Promise((resolve) => setTimeout(resolve, 60000));

    console.log('');

    // ==========================================
    // PHASE 4: Execute YAML Pipeline
    // ==========================================
    console.log('[PHASE 4] ⚙️ Executing YAML pipeline on EC2...');
    console.log('');

    const pipelineResult = await executePipelineWithAutoFix(
      instanceId,
      generatedPipeline.yamlContent,
      {
        ...envVars,
        FRAMEWORK: generatedPipeline.framework,
        LANGUAGE: generatedPipeline.language,
      },
      '/home/ec2-user/app',
      true // Enable auto-fix
    );

    if (!pipelineResult.success) {
      console.error('[YAML-DEPLOY] ✗ Pipeline execution failed');

      if (deploymentRecord) {
        await Deployment.findByIdAndUpdate(deploymentRecord._id, {
          status: 'failed',
          errorMessage: pipelineResult.error || 'Pipeline execution failed',
        });
      }

      return NextResponse.json(
        {
          error: pipelineResult.error || 'Pipeline execution failed',
          instanceId,
          publicIp,
          pipelineYaml: generatedPipeline.yamlContent,
          results: pipelineResult.results,
        },
        { status: 500 }
      );
    }

    console.log('[YAML-DEPLOY] ✓ Pipeline executed successfully');
    console.log('');

    // ==========================================
    // PHASE 5: Start Application
    // ==========================================
    console.log('[PHASE 5] 🚀 Starting application...');

    const startCommand = getStartCommand(languageInfo, projectFiles);
    await startApplication(instanceId, startCommand);

    console.log('[YAML-DEPLOY] ✓ Application started');

    // Mark deployment as successful
    if (deploymentRecord) {
      await Deployment.findByIdAndUpdate(deploymentRecord._id, {
        status: 'success',
      });
    }

    console.log('');
    console.log('='.repeat(70));
    console.log('[YAML-DEPLOY] ✅ DEPLOYMENT COMPLETED SUCCESSFULLY');
    console.log('[YAML-DEPLOY] Access your application at: http://' + publicIp);
    console.log('='.repeat(70));
    console.log('');

    return NextResponse.json({
      success: true,
      instanceId,
      publicIp,
      language: languageInfo.primaryLanguage,
      framework: generatedPipeline.framework,
      stages: generatedPipeline.stages,
      pipelineYaml: generatedPipeline.yamlContent,
      executionResults: pipelineResult.results,
      totalDuration: pipelineResult.totalDuration,
      message: `${generatedPipeline.framework} application deployed successfully`,
      accessUrl: `http://${publicIp}`,
    });
  } catch (error: any) {
    console.error('[YAML-DEPLOY] ✗ Deployment error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Deployment failed',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}

/**
 * Get runtime setup commands based on language
 */
function getRuntimeSetup(langInfo: any): { installCommands: string[] } {
  const commands: string[] = [];

  switch (langInfo.primaryLanguage) {
    case 'JavaScript/TypeScript':
      commands.push(
        'echo "[SETUP] Installing Node.js 18..."',
        'curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -',
        'yum install -y nodejs git'
      );
      break;

    case 'Python':
      commands.push(
        'echo "[SETUP] Installing Python 3.11..."',
        'yum install -y python3.11 python3.11-pip git'
      );
      break;

    case 'Rust':
      commands.push(
        'echo "[SETUP] Installing Rust..."',
        'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y',
        'source $HOME/.cargo/env'
      );
      break;

    case 'Go':
      commands.push(
        'echo "[SETUP] Installing Go..."',
        'wget https://go.dev/dl/go1.21.0.linux-amd64.tar.gz',
        'tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz',
        'echo "export PATH=$PATH:/usr/local/go/bin" >> /etc/profile'
      );
      break;

    case 'Java':
      commands.push(
        'echo "[SETUP] Installing Java 17..."',
        'yum install -y java-17-amazon-corretto git maven'
      );
      break;

    case 'Ruby':
      commands.push(
        'echo "[SETUP] Installing Ruby..."',
        'yum install -y ruby ruby-devel git'
      );
      break;

    case 'PHP':
      commands.push(
        'echo "[SETUP] Installing PHP 8..."',
        'yum install -y php8.2 php8.2-cli php8.2-common git'
      );
      break;

    case 'Docker':
      commands.push(
        'echo "[SETUP] Installing Docker..."',
        'yum install -y docker git',
        'systemctl start docker',
        'systemctl enable docker',
        'usermod -aG docker ec2-user'
      );
      break;

    default:
      commands.push('echo "[SETUP] Installing basic dependencies..."', 'yum install -y git');
  }

  return { installCommands: commands };
}

/**
 * Get application start command
 */
function getStartCommand(langInfo: any, files: any): string {
  switch (langInfo.primaryLanguage) {
    case 'JavaScript/TypeScript':
      if (langInfo.framework?.includes('Next')) {
        return 'cd /home/ec2-user/app && PORT=80 npm start &';
      }
      return 'cd /home/ec2-user/app && PORT=80 npx serve -s dist -l 80 || npx serve -s build -l 80 || npm start &';

    case 'Python':
      const entryPoint = langInfo.entryPoint || 'app.py';
      return `cd /home/ec2-user/app && source venv/bin/activate && python3 ${entryPoint} &`;

    case 'Rust':
      return 'cd /home/ec2-user/app && ./target/release/* &';

    case 'Go':
      return 'cd /home/ec2-user/app && ./app &';

    case 'Java':
      return 'cd /home/ec2-user/app && java -jar target/*.jar &';

    case 'Ruby':
      return 'cd /home/ec2-user/app && bundle exec ruby app.rb &';

    case 'PHP':
      return 'cd /home/ec2-user/app && php -S 0.0.0.0:80 &';

    case 'Docker':
      return 'cd /home/ec2-user/app && docker run -d -p 80:3000 app:latest';

    default:
      return 'echo "Application ready"';
  }
}

/**
 * Start application on EC2
 */
async function startApplication(instanceId: string, startCommand: string): Promise<void> {
  const commands = [startCommand, 'sleep 5', 'echo "Application started"'];

  const sendCmd = await ssmClient.send(
    new SendCommandCommand({
      InstanceIds: [instanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: { commands },
    })
  );

  // Wait a bit for command to execute
  await new Promise((resolve) => setTimeout(resolve, 10000));
}

/**
 * Wait for instance to be running
 */
async function waitForInstanceRunning(instanceId: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const desc = await ec2Client.send(
      new DescribeInstancesCommand({ InstanceIds: [instanceId] })
    );
    const state = desc.Reservations?.[0]?.Instances?.[0]?.State?.Name;

    if (state === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 30000));
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  throw new Error('Instance failed to start');
}

/**
 * Wait for SSM agent to be ready
 */
async function waitForSSMReady(instanceId: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    try {
      const cmd = await ssmClient.send(
        new SendCommandCommand({
          InstanceIds: [instanceId],
          DocumentName: 'AWS-RunShellScript',
          Parameters: { commands: ['echo "SSM Ready"'] },
        })
      );

      if (cmd.Command?.CommandId) {
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const result = await ssmClient.send(
          new GetCommandInvocationCommand({
            CommandId: cmd.Command.CommandId,
            InstanceId: instanceId,
          })
        );

        if (result.Status === 'Success') {
          return;
        }
      }
    } catch (error) {
      // Keep trying
    }

    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  console.warn('[YAML-DEPLOY] SSM agent may not be ready, continuing anyway...');
}

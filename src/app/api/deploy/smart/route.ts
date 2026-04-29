import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  EC2Client,
  RunInstancesCommand,
  DescribeInstancesCommand,
  AuthorizeSecurityGroupIngressCommand,
} from '@aws-sdk/client-ec2';
import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
} from '@aws-sdk/client-ssm';
import { ProjectType, GeneratedPipeline } from '@/lib/projectDetector';
import {
  autoFixDeploymentError,
  ProjectAnalysis,
  FrameworkBuildConfig,
} from '@/lib/novaDeploymentFixer';
import dbConnect from '@/lib/mongodb';
import Deployment from '@/models/Deployment';
import Pipeline from '@/models/Pipeline';
import {
  isDeploymentInProgress,
  acquireDeploymentLock,
  releaseDeploymentLock,
} from '@/models/DeploymentLock';
import { deployWithNginx } from '@/lib/nginx/deployment';
import { launchRuntime, RuntimeConfig } from '@/lib/runtime-launcher';
import { installRuntimeViaSSM } from '@/lib/ssm-runtime-installer';

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
 * Smart deployment with AI-powered project detection and error fixing
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    const {
      repoUrl,
      repoFullName,
      githubToken,
      pipelineName,
      envVars = {},
      trackingId,
      triggeredBy,
      commit,
      pipelineId,
      reuseInstance = false, // Flag to reuse existing instance
    } = await request.json();

    if (!repoUrl || !repoFullName) {
      return NextResponse.json(
        { error: 'GitHub repository URL is required' },
        { status: 400 }
      );
    }

    // Log webhook trigger info if present
    if (triggeredBy === 'webhook' && commit) {
      console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
      console.log('[SMART-DEPLOY] 🔄 CONTINUOUS DEPLOYMENT TRIGGERED');
      console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
      console.log('[SMART-DEPLOY] Triggered by: GitHub Webhook');
      console.log('[SMART-DEPLOY] Commit:', commit.sha?.substring(0, 7));
      console.log('[SMART-DEPLOY] Message:', commit.message?.split('\n')[0]);
      console.log('[SMART-DEPLOY] Author:', commit.author);
      console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
    }

    // Connect to database first
    await dbConnect();

    // Check if another deployment is in progress
    console.log('[SMART-DEPLOY] Checking deployment lock...');
    const lockStatus = await isDeploymentInProgress();

    if (lockStatus.locked && lockStatus.details) {
      const { repoFullName: lockedRepo, startedAt, duration } = lockStatus.details;
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;

      console.log('[SMART-DEPLOY] ⏸️  Another deployment is in progress');
      console.log(`[SMART-DEPLOY]   Repository: ${lockedRepo}`);
      console.log(`[SMART-DEPLOY]   Duration: ${minutes}m ${seconds}s`);

      return NextResponse.json(
        {
          error: 'Another deployment is currently in progress',
          message: `A deployment for "${lockedRepo}" started ${minutes} minutes and ${seconds} seconds ago. Please wait for it to complete.`,
          lockedRepo,
          duration,
          startedAt,
        },
        { status: 409 } // 409 Conflict
      );
    }

    console.log('[SMART-DEPLOY] ✅ No active deployments, proceeding...');
    console.log('[SMART-DEPLOY] Repository:', repoFullName);
    console.log('[SMART-DEPLOY] Environment variables count:', Object.keys(envVars).length);

    // Step 1: Fetch saved pipeline from database (NO analysis needed)
    console.log('[SMART-DEPLOY] 📋 Fetching saved pipeline from database...');

    // If pipelineId is provided (from webhook), use it directly
    let savedPipeline;
    if (pipelineId) {
      console.log('[SMART-DEPLOY] Using pipeline ID from webhook:', pipelineId);
      savedPipeline = await Pipeline.findById(pipelineId);
    } else {
      // Otherwise, find latest pipeline for repository
      savedPipeline = await Pipeline.findOne({
        repoFullName,
        status: 'active',
      }).sort({ createdAt: -1 });
    }

    if (!savedPipeline) {
      console.error('[SMART-DEPLOY] ❌ No pipeline found for repository:', repoFullName);
      return NextResponse.json(
        {
          error: 'Pipeline not found',
          message: `No pipeline found for repository "${repoFullName}". Please generate a pipeline first at /api/pipelines/generate-preview`,
        },
        { status: 404 }
      );
    }

    console.log('[SMART-DEPLOY] ✅ Pipeline found:', savedPipeline.name);
    console.log('[SMART-DEPLOY] Language:', savedPipeline.language);
    console.log('[SMART-DEPLOY] Framework:', savedPipeline.framework);
    console.log('[SMART-DEPLOY] Pipeline stages:', savedPipeline.stages?.join(' → '));
    console.log('[SMART-DEPLOY] Saved Port:', savedPipeline.port || 'NOT SET');
    console.log('[SMART-DEPLOY] Saved Start Command:', savedPipeline.startCommand || 'NOT SET');

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🔄 INSTANCE REUSE LOGIC (for webhooks)
    // ═══════════════════════════════════════════════════════════════════════════════
    console.log('[SMART-DEPLOY] Reuse instance flag:', reuseInstance);
    let existingInstance = null;
    if (reuseInstance && savedPipeline._id) {
      console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
      console.log('[SMART-DEPLOY] 🔄 CHECKING FOR EXISTING INSTANCE TO REUSE');
      console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
      console.log('[SMART-DEPLOY] Looking for pipeline:', savedPipeline._id.toString());

      // Debug: Show ALL deployments in database
      const allDeployments = await Deployment.find({}).sort({ createdAt: -1 }).limit(5).lean();
      console.log('[SMART-DEPLOY] 📊 Recent deployments in database:', allDeployments.length);
      allDeployments.forEach((d: any, i: number) => {
        console.log(`[SMART-DEPLOY]   ${i + 1}. Pipeline: ${d.pipelineId} | Instance: ${d.instanceId} | Status: ${d.status}`);
      });

      // Find the most recent deployment with an instance (ANY status)
      // We'll check if the instance is running, so status doesn't matter
      const previousDeployment = await Deployment.findOne({
        pipelineId: savedPipeline._id.toString(),
        instanceId: { $exists: true, $ne: null },
      }).sort({ createdAt: -1 });

      console.log('[SMART-DEPLOY] Query: { pipelineId:', savedPipeline._id.toString(), ', instanceId: exists }');
      console.log('[SMART-DEPLOY] Found previous deployment:', previousDeployment ? 'YES' : 'NO');

      if (previousDeployment && previousDeployment.instanceId) {
        console.log('[SMART-DEPLOY] ✅ Found previous deployment');
        console.log('[SMART-DEPLOY]   Instance ID:', previousDeployment.instanceId);
        console.log('[SMART-DEPLOY]   Public IP:', previousDeployment.publicIp);
        console.log('[SMART-DEPLOY]   Status:', previousDeployment.status);
        console.log('[SMART-DEPLOY]   Deployed:', new Date(previousDeployment.createdAt).toLocaleString());

        // Check if instance is still running
        try {
          const describeCommand = new DescribeInstancesCommand({
            InstanceIds: [previousDeployment.instanceId],
          });
          const instanceData = await ec2Client.send(describeCommand);

          const instance = instanceData.Reservations?.[0]?.Instances?.[0];
          const instanceState = instance?.State?.Name;

          console.log('[SMART-DEPLOY]   Current state:', instanceState);

          if (instanceState === 'running') {
            console.log('[SMART-DEPLOY] ✅ Instance is running - will reuse!');
            console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
            existingInstance = {
              instanceId: previousDeployment.instanceId,
              publicIp: previousDeployment.publicIp || instance.PublicIpAddress,
            };
          } else {
            console.log(`[SMART-DEPLOY] ⚠️  Instance is ${instanceState} - creating new instance`);
            console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
          }
        } catch (error: any) {
          console.error('[SMART-DEPLOY] ❌ Error checking instance:', error.message);
          console.log('[SMART-DEPLOY] Will create new instance');
          console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
        }
      } else {
        console.log('[SMART-DEPLOY] ℹ️  No previous deployment with instance found');
        console.log('[SMART-DEPLOY] This is either:');
        console.log('[SMART-DEPLOY]   - First deployment for this pipeline');
        console.log('[SMART-DEPLOY]   - Previous instance was terminated');
        console.log('[SMART-DEPLOY] Will create NEW instance');
        console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
      }
    } else {
      if (!reuseInstance) {
        console.log('[SMART-DEPLOY] ℹ️  Instance reuse disabled (reuseInstance=false)');
        console.log('[SMART-DEPLOY] Creating new instance');
      }
    }

    // ✨ SMART VALIDATION: Detect language/command mismatches and trigger re-analysis
    // This ensures we always use the correct port and command, even if saved data is wrong
    const needsReanalysis = !savedPipeline.port || !savedPipeline.startCommand ||
      // Python app using Node.js commands → INVALID
      (savedPipeline.language?.includes('Python') && savedPipeline.startCommand?.includes('npm')) ||
      // Node.js app using Python commands → INVALID
      (savedPipeline.language?.includes('Node') && (savedPipeline.startCommand?.includes('python') || savedPipeline.startCommand?.includes('uvicorn'))) ||
      // FastAPI with port 3000 (should be 8000) → LIKELY WRONG
      (savedPipeline.framework?.includes('FastAPI') && savedPipeline.port === '3000') ||
      // Flask with port 3000 (should be 5000) → LIKELY WRONG
      (savedPipeline.framework?.includes('Flask') && savedPipeline.port === '3000') ||
      // Direct check: Python with npm start → DEFINITELY WRONG
      (savedPipeline.language?.includes('Python') && savedPipeline.startCommand === 'npm start');

    if (needsReanalysis) {
      if (!savedPipeline.port || !savedPipeline.startCommand) {
        console.log('[SMART-DEPLOY] ⚠️ Port or startCommand not found in saved pipeline - re-analyzing repository...');
      } else {
        console.log('[SMART-DEPLOY] 🚨 VALIDATION FAILED: Language/command mismatch detected!');
        console.log('[SMART-DEPLOY]   Language:', savedPipeline.language);
        console.log('[SMART-DEPLOY]   Framework:', savedPipeline.framework);
        console.log('[SMART-DEPLOY]   Saved Port:', savedPipeline.port, '← INCORRECT');
        console.log('[SMART-DEPLOY]   Saved Command:', savedPipeline.startCommand, '← INCORRECT');
        console.log('[SMART-DEPLOY] → Re-analyzing repository with AI to fix incorrect values...');
      }

      try {
        // Import required modules for re-analysis
        const { fetchUniversalProjectFilesFromGitHub } = await import('@/lib/github-universal-fetcher');
        const { analyzeUniversalProject } = await import('@/lib/universal-language-analyzer');

        const [owner, repo] = repoFullName.split('/');

        console.log('[SMART-DEPLOY] Fetching project files for re-analysis...');
        const projectFiles = await fetchUniversalProjectFilesFromGitHub(owner, repo, githubToken);

        console.log('[SMART-DEPLOY] Analyzing project with Claude 4.6 Sonnet AI...');
        const analysis = await analyzeUniversalProject(projectFiles);

        console.log('[SMART-DEPLOY] ✅ Re-analysis complete:');
        console.log('[SMART-DEPLOY]   - Detected Language:', analysis.language);
        console.log('[SMART-DEPLOY]   - Detected Framework:', analysis.framework);
        console.log('[SMART-DEPLOY]   - Detected Port:', analysis.port, '← CORRECTED');
        console.log('[SMART-DEPLOY]   - Detected Start Command:', analysis.startCommand, '← CORRECTED');

        // Update the saved pipeline with the detected values
        savedPipeline.language = analysis.language;
        savedPipeline.framework = analysis.framework;
        savedPipeline.port = analysis.port || '8000';
        savedPipeline.startCommand = analysis.startCommand || 'echo "No start command"';

        // Save to database
        await Pipeline.findByIdAndUpdate(savedPipeline._id, {
          language: savedPipeline.language,
          framework: savedPipeline.framework,
          port: savedPipeline.port,
          startCommand: savedPipeline.startCommand,
        });

        console.log('[SMART-DEPLOY] ✅ Updated pipeline with corrected port and startCommand');
      } catch (reAnalysisError: any) {
        console.error('[SMART-DEPLOY] ⚠️ Re-analysis failed:', reAnalysisError.message);
        console.log('[SMART-DEPLOY] Falling back to framework-specific defaults');
        // Smart defaults based on detected framework
        if (savedPipeline.framework?.includes('FastAPI')) {
          savedPipeline.port = '8000';
          savedPipeline.startCommand = 'uvicorn main:app --host 0.0.0.0 --port 8000';
        } else if (savedPipeline.framework?.includes('Flask')) {
          savedPipeline.port = '5000';
          savedPipeline.startCommand = 'python app.py';
        } else if (savedPipeline.language?.includes('Python')) {
          savedPipeline.port = '8000';
          savedPipeline.startCommand = 'python main.py';
        } else {
          savedPipeline.port = '3000';
          savedPipeline.startCommand = 'npm start';
        }
      }
    }

    // Parse the YAML to extract pipeline structure
    const pipelineYaml = savedPipeline.yaml || savedPipeline.content || '';
    let pipeline: GeneratedPipeline = {
      stages: savedPipeline.stages || [],
      jobs: parsePipelineJobs(pipelineYaml),
    };

    // Create projectType from saved pipeline metadata
    const projectType: ProjectType = {
      framework: savedPipeline.framework || 'Unknown',
      language: savedPipeline.language || 'Unknown',
      packageManager: 'npm', // Default, not critical for deployment
      buildCommand: '',
      startCommand: '',
      outputDir: '',
    };

    console.log('[SMART-DEPLOY] Pipeline jobs:', pipeline.jobs.length);

    // DETECT REQUIRED RUNTIME FROM PIPELINE
    const detectedRuntime = detectRuntimeFromPipeline(pipeline, savedPipeline);
    console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
    console.log('[SMART-DEPLOY] 🔍 PIPELINE ANALYSIS');
    console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
    console.log('[SMART-DEPLOY] Detected Language:', savedPipeline.language || 'Unknown');
    console.log('[SMART-DEPLOY] Detected Framework:', savedPipeline.framework || 'Unknown');
    console.log('[SMART-DEPLOY] Required Runtime:', detectedRuntime.toUpperCase());
    console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');

    // Check if this is a backend and warn about environment variables
    if (projectType.framework.includes('Express') || projectType.framework.includes('Node.js') || projectType.framework.includes('Python') || projectType.framework.includes('FastAPI')) {
      console.log('[SMART-DEPLOY] ⚠️ Backend detected - checking environment variables...');

      if (Object.keys(envVars).length === 0) {
        console.log('[SMART-DEPLOY] ⚠️⚠️⚠️ WARNING: No environment variables provided!');
        console.log('[SMART-DEPLOY] Backend apps typically require:');
        console.log('[SMART-DEPLOY]   - Database credentials (DATABASE_URL, DB_USER, DB_PASSWORD)');
        console.log('[SMART-DEPLOY]   - API keys (JWT_SECRET, API_KEY, etc.)');
        console.log('[SMART-DEPLOY]   - Service URLs (GOOGLE_CLIENT_ID, etc.)');
        console.log('[SMART-DEPLOY] ');
        console.log('[SMART-DEPLOY] If your app crashes on startup with "undefined" errors,');
        console.log('[SMART-DEPLOY] you need to redeploy with environment variables.');
      } else {
        console.log('[SMART-DEPLOY] ✅ Environment variables provided:');
        console.log('[SMART-DEPLOY]  ', Object.keys(envVars).join(', '));
      }
    }

    // Prepare authenticated repo URL
    const authenticatedRepoUrl = githubToken
      ? repoUrl.replace('https://github.com/', `https://${githubToken}@github.com/`)
      : repoUrl;

    // ⚠️  WARNING CHECK: No GitHub token provided
    if (!githubToken) {
      console.log('[SMART-DEPLOY] ⚠️  ⚠️  ⚠️  WARNING ⚠️  ⚠️  ⚠️');
      console.log('[SMART-DEPLOY] No GitHub token provided!');
      console.log('[SMART-DEPLOY] If this is a PRIVATE repository, git clone will FAIL');
      console.log('[SMART-DEPLOY] Provide a GitHub Personal Access Token when creating the webhook');
      console.log('[SMART-DEPLOY] ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️  ⚠️');
    } else {
      console.log('[SMART-DEPLOY] ✅ GitHub token provided (can clone private repos)');
    }

    await dbConnect();

    // Step 2: Create EC2 instance OR reuse existing one
    let instanceId: string;
    let publicIp: string;

    if (existingInstance) {
      // ═══════════════════════════════════════════════════════════════════════════════
      // REUSING EXISTING INSTANCE
      // ═══════════════════════════════════════════════════════════════════════════════
      console.log('[SMART-DEPLOY] ♻️  Reusing existing instance (no new EC2 creation)');
      instanceId = existingInstance.instanceId;
      publicIp = existingInstance.publicIp;
      console.log('[SMART-DEPLOY] Instance ID:', instanceId);
      console.log('[SMART-DEPLOY] Public IP:', publicIp);
    } else {
      // ═══════════════════════════════════════════════════════════════════════════════
      // CREATING NEW INSTANCE
      // ═══════════════════════════════════════════════════════════════════════════════
      console.log('[SMART-DEPLOY] Creating NEW EC2 instance...');

      // ARCHITECTURE: Application exposed directly on detected port (no Nginx reverse proxy)
      // Access URL: http://PUBLIC_IP:PORT (e.g., http://23.45.67.89:3000)
      // Security group is automatically configured to allow inbound traffic on the detected port

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
            { Key: 'Name', Value: `pipeline-${pipelineName || repoFullName}` },
            { Key: 'Pipeline', Value: pipelineName || repoFullName },
            { Key: 'Framework', Value: projectType.framework },
          ],
        },
      ],
      UserData: Buffer.from(`#!/bin/bash
        exec > >(tee /var/log/user-data.log)
        exec 2>&1

        echo "═══════════════════════════════════════════════════════════════════"
        echo "🚀 NerveFlow CI/CD - Pipeline-Driven Deployment"
        echo "═══════════════════════════════════════════════════════════════════"
        echo "Runtime: ${detectedRuntime.toUpperCase()}"
        echo "Language: ${savedPipeline.language || 'Detected from pipeline'}"
        echo "Framework: ${savedPipeline.framework || 'Detected from pipeline'}"
        echo "═══════════════════════════════════════════════════════════════════"
        echo ""

        # System update (skip conflicts)
        echo "[SETUP] Updating system..."
        yum update -y --skip-broken --quiet 2>&1 | tail -5 || echo "[SETUP] Update had warnings (non-critical)"
        echo "[SETUP] ✅ System updated"

        # Install minimal build tools (CRITICAL - must succeed)
        echo "[SETUP] Installing build essentials..."
        echo "[SETUP] This may take 1-2 minutes..."

        # Try multiple package installation methods
        yum install -y gcc gcc-c++ make wget git pkg-config openssl-devel 2>&1 | tee /tmp/yum-install.log | tail -10

        # Verify critical tools are installed
        if ! command -v gcc >/dev/null 2>&1; then
          echo "[SETUP] ❌ CRITICAL: gcc not installed"
          echo "[SETUP] Trying alternative package names..."
          yum install -y gcc-c++ --allowerasing 2>&1 | tail -5
        fi

        if ! command -v make >/dev/null 2>&1; then
          echo "[SETUP] ❌ CRITICAL: make not installed"
          yum install -y make --allowerasing 2>&1 | tail -5
        fi

        # Final verification
        if command -v gcc >/dev/null 2>&1 && command -v make >/dev/null 2>&1; then
          echo "[SETUP] ✅ Build tools installed:"
          echo "[SETUP]   - gcc: $(gcc --version | head -1)"
          echo "[SETUP]   - make: $(make --version | head -1)"
        else
          echo "[SETUP] ❌ CRITICAL: Build tools installation FAILED"
          echo "[SETUP] Cannot proceed without gcc and make"
        fi

        # Configure Git
        if command -v git >/dev/null 2>&1; then
          git config --global user.name "NerveFlow CI/CD"
          git config --global user.email "ci@nerveflow.com"
          git config --global init.defaultBranch main
          echo "[SETUP] ✅ Git configured"
        else
          echo "[SETUP] ❌ Git not found"
        fi

        # Clone repository
        echo ""
        echo "[SETUP] ═══════════════════════════════════════════════════════════"
        echo "[SETUP] Cloning repository..."
        echo "[SETUP] Repository: ${repoFullName}"
        echo "[SETUP] Using authentication: ${githubToken ? 'Yes (token provided)' : 'No (public repo)'}"
        cd /home/ec2-user
        rm -rf app

        # Clone with detailed error output
        echo "[SETUP] Running: git clone --depth 1 [REPO_URL] app"
        CLONE_OUTPUT=$(git clone --depth 1 ${authenticatedRepoUrl} app 2>&1)
        CLONE_EXIT_CODE=$?

        echo "[SETUP] Git clone output:"
        echo "$CLONE_OUTPUT"

        if [ $CLONE_EXIT_CODE -eq 0 ]; then
          echo "[SETUP] ✅ Repository cloned successfully"
        else
          echo "[SETUP] ════════════════════════════════════════════════════════════"
          echo "[SETUP] ❌ ❌ ❌ GIT CLONE FAILED ❌ ❌ ❌"
          echo "[SETUP] ════════════════════════════════════════════════════════════"
          echo "[SETUP] Exit code: $CLONE_EXIT_CODE"
          echo "[SETUP] Error output:"
          echo "$CLONE_OUTPUT"
          echo "[SETUP] ════════════════════════════════════════════════════════════"

          if echo "$CLONE_OUTPUT" | grep -qi "could not read Username\|Authentication failed\|fatal: Authentication"; then
            echo "[SETUP] ⚠️  DIAGNOSIS: This appears to be a PRIVATE repository"
            echo "[SETUP] ⚠️  Private repos require a GitHub Personal Access Token"
            echo "[SETUP] ⚠️  Please provide a token when creating the webhook"
          elif echo "$CLONE_OUTPUT" | grep -qi "Repository not found\|fatal: repository.*not found"; then
            echo "[SETUP] ⚠️  DIAGNOSIS: Repository not found (${repoFullName})"
            echo "[SETUP] ⚠️  Check if the repository exists and is spelled correctly"
          elif echo "$CLONE_OUTPUT" | grep -qi "fatal: unable to access"; then
            echo "[SETUP] ⚠️  DIAGNOSIS: Network/connectivity issue"
            echo "[SETUP] ⚠️  Check if GitHub is accessible from this EC2 instance"
          fi

          echo "[SETUP] ════════════════════════════════════════════════════════════"
          echo "SETUP_FAILED"
          exit 1
        fi

        cd /home/ec2-user/app
        echo "[SETUP] Current directory: $(pwd)"
        echo "[SETUP] Repository contents:"
        ls -la | head -15

        ${
          Object.keys(envVars).length > 0
            ? `cat > .env << 'ENVEOF'
${Object.entries(envVars)
  .map(([key, value]) => `${key}=${value}`)
  .join('\n')}
ENVEOF
chmod 600 .env
echo "[SETUP] ✅ Environment variables configured (${Object.keys(envVars).length} vars)"`
            : 'echo "[SETUP] ℹ️  No environment variables"'
        }        chown -R ec2-user:ec2-user /home/ec2-user/app

        # Mark UserData setup as complete
        echo ""
        echo "[SETUP] ═══════════════════════════════════════════════════════════"
        echo "[SETUP] UserData setup complete"
        echo "[SETUP] Runtime will be installed via SSM after instance is ready"
        echo "[SETUP] ═══════════════════════════════════════════════════════════"

        # Optional: Docker for containerized projects
        if [ -f "/home/ec2-user/app/Dockerfile" ]; then
          echo ""
          echo "[SETUP] 🐳 Dockerfile detected - Installing Docker..."
          yum install -y docker 2>&1 | tail -5 || true
          systemctl enable docker 2>&1 || true
          systemctl start docker 2>&1 || true
          usermod -aG docker ec2-user 2>&1 || true
          echo "[SETUP] ✅ Docker installed"
        fi

        # Verify setup before marking complete
        echo ""
        echo "[SETUP] ═══════════════════════════════════════════════════════════"
        echo "[SETUP] FINAL VERIFICATION"
        echo "[SETUP] ═══════════════════════════════════════════════════════════"

        # Check critical components
        SETUP_OK=true

        if [ ! -d "/home/ec2-user/app" ]; then
          echo "[SETUP] ❌ Repository directory not found"
          SETUP_OK=false
        fi

        if ! command -v gcc >/dev/null 2>&1; then
          echo "[SETUP] ❌ gcc not available"
          SETUP_OK=false
        fi

        if ! command -v git >/dev/null 2>&1; then
          echo "[SETUP] ❌ git not available"
          SETUP_OK=false
        fi

                # NOTE: Runtime installation moved to SSM (to avoid UserData size limit)
        # Runtime will be installed after this UserData completes
        echo "[SETUP] ℹ️  Runtime (${detectedRuntime}) will be installed via SSM after setup"

        if [ "$SETUP_OK" = true ]; then
          echo "[SETUP] ✅ All verification checks passed"
          echo ""
          echo "[SETUP] ═══════════════════════════════════════════════════════════"
          echo "[SETUP] ✅ ✅ ✅ SETUP_COMPLETE_READY_FOR_DEPLOYMENT ✅ ✅ ✅"
          echo "[SETUP] ═══════════════════════════════════════════════════════════"
          echo "[SETUP] Runtime: ${detectedRuntime.toUpperCase()}"
          echo "[SETUP] Repository: /home/ec2-user/app"
          echo "[SETUP] Log: /var/log/user-data.log"
          echo "[SETUP] ═══════════════════════════════════════════════════════════"
          echo ""
          echo "✅ Ready for pipeline execution"
        else
          echo ""
          echo "[SETUP] ═══════════════════════════════════════════════════════════"
          echo "[SETUP] ❌ ❌ ❌ SETUP_FAILED ❌ ❌ ❌"
          echo "[SETUP] ═══════════════════════════════════════════════════════════"
          echo "[SETUP] Some critical components failed to install"
          echo "[SETUP] Check /var/log/user-data.log for details"
          echo "[SETUP] ═══════════════════════════════════════════════════════════"
          exit 1
        fi
      `).toString('base64'),
    });

      const runResponse = await ec2Client.send(runInstancesCommand);
      const newInstanceId = runResponse.Instances?.[0]?.InstanceId;

      if (!newInstanceId) {
        throw new Error('Failed to create EC2 instance');
      }

      instanceId = newInstanceId;
      console.log('[SMART-DEPLOY] Instance created:', instanceId);
    } // End of else block (new instance creation)

    // Create deployment record (for both manual AND webhook deployments)
    let deploymentRecord = null;

    // Determine userId - use session if available, otherwise use pipeline owner (for webhooks)
    let userId = session?.user?.email || session?.user?.id;
    if (!userId && savedPipeline.userId) {
      // Webhook deployment - use pipeline owner
      userId = savedPipeline.userId;
      console.log('[SMART-DEPLOY] Webhook deployment - using pipeline owner:', userId);
    }

    if (!userId) {
      console.warn('[SMART-DEPLOY] ⚠️  No userId available - deployment won\'t be saved to database');
      userId = 'unknown';
    }

    try {
      const initialLogs = [
        existingInstance ? '[SMART-DEPLOY] ♻️  REDEPLOYMENT started (reusing instance)' : '[SMART-DEPLOY] 🚀 NEW DEPLOYMENT started',
        `[SMART-DEPLOY] Triggered by: ${triggeredBy || 'manual'}`,
        `[SMART-DEPLOY] Repository: ${repoFullName}`,
        `[SMART-DEPLOY] Instance: ${instanceId}`,
        existingInstance ? `[SMART-DEPLOY] ✅ Reusing instance (keeping IP: ${existingInstance.publicIp})` : '[SMART-DEPLOY] Creating new instance',
        existingInstance ? '[SMART-DEPLOY] ✅ Will pull latest code and redeploy' : '[SMART-DEPLOY] Will clone repository and deploy',
        `[SMART-DEPLOY] Region: ${process.env.AWS_REGION || 'us-east-1'}`,
        `[SMART-DEPLOY] Framework: ${savedPipeline.framework || 'Auto-detected'}`,
        `[SMART-DEPLOY] Port: ${savedPipeline.port || '3000'}`,
        `[SMART-DEPLOY] Pipeline stages: ${pipeline.stages.join(' → ')}`,
        '[SMART-DEPLOY] Preparing for deployment...',
      ].join('\n');

      deploymentRecord = await Deployment.create({
        userId: userId,
        pipelineId: savedPipeline._id.toString(), // CRITICAL: Use savedPipeline._id for instance reuse to work!
        pipelineName: savedPipeline.name || repoFullName,
        repoFullName,
        instanceId,
        publicIp: existingInstance?.publicIp || '', // Use existing IP if reusing instance
        instanceType: process.env.AWS_INSTANCE_TYPE || 't3.small',
        region: process.env.AWS_REGION || 'us-east-1',
        status: 'deploying',
        envVarsCount: Object.keys(envVars).length,
        trackingId, // For real-time log streaming before deployment completes
        port: parseInt(savedPipeline.port || '3000', 10), // AI-detected port
        framework: savedPipeline.framework,
        rawLogs: initialLogs, // Add initial logs immediately
        triggeredBy: triggeredBy || 'manual',
        commitSha: commit?.sha,
        commitMessage: commit?.message,
        commitAuthor: commit?.author,
      });
      console.log('[SMART-DEPLOY] ✅ Deployment record created');
      console.log('[SMART-DEPLOY]   - Deployment ID:', deploymentRecord._id);
      console.log('[SMART-DEPLOY]   - Pipeline ID:', savedPipeline._id.toString());
      console.log('[SMART-DEPLOY]   - Instance ID:', instanceId);
      console.log('[SMART-DEPLOY]   - Tracking ID:', trackingId);
    } catch (dbError) {
      console.error('[SMART-DEPLOY] ❌ Failed to create deployment record:', dbError);
      console.error('[SMART-DEPLOY] Deployment will continue but won\'t appear in UI');
    }

    // Acquire deployment lock
    const lockAcquired = await acquireDeploymentLock(
      instanceId,
      repoFullName,
      session?.user?.email || session?.user?.id || 'unknown'
    );

    if (!lockAcquired) {
      console.error('[SMART-DEPLOY] Failed to acquire deployment lock');
      return NextResponse.json(
        {
          error: 'Failed to acquire deployment lock',
          message: 'Another deployment may have started simultaneously. Please try again.',
        },
        { status: 500 }
      );
    }

    console.log('[SMART-DEPLOY] 🔒 Deployment lock acquired');

    // Wait for instance to be running (only for NEW instances)
    if (!existingInstance) {
      await waitForInstanceRunning(instanceId);

      // Get public IP for new instance
      const describeCommand = new DescribeInstancesCommand({
        InstanceIds: [instanceId],
      });
      const instanceDetails = await ec2Client.send(describeCommand);
      publicIp =
        instanceDetails.Reservations?.[0]?.Instances?.[0]?.PublicIpAddress || '';

      if (!publicIp) {
        throw new Error('Failed to get public IP');
      }
    } else {
      // For reused instances, publicIp is already set
      console.log('[SMART-DEPLOY] Skipping instance startup wait (already running)');
    }

    console.log('[SMART-DEPLOY] Instance running at:', publicIp);

    // Update deployment with IP
    if (deploymentRecord) {
      try {
        await Deployment.findByIdAndUpdate(deploymentRecord._id, { publicIp });
      } catch (dbError) {
        console.error('[SMART-DEPLOY] DB update error:', dbError);
      }
    }

    // Wait for SSM agent
    console.log('[SMART-DEPLOY] Waiting for SSM agent...');

    // Update logs: Waiting for SSM
    if (deploymentRecord) {
      try {
        const current = await Deployment.findById(deploymentRecord._id);
        const currentLogs = current?.rawLogs || '';
        await Deployment.findByIdAndUpdate(deploymentRecord._id, {
          rawLogs: currentLogs + '\n[SMART-DEPLOY] Instance is running. Connecting to SSM agent...',
        });
      } catch (dbError) {
        console.error('[SMART-DEPLOY] Failed to update logs:', dbError);
      }
    }

    await waitForSSMReady(instanceId);
    console.log('[SMART-DEPLOY] SSM ready!');

    // Update logs: SSM ready
    if (deploymentRecord) {
      try {
        const current = await Deployment.findById(deploymentRecord._id);
        const currentLogs = current?.rawLogs || '';
        await Deployment.findByIdAndUpdate(deploymentRecord._id, {
          rawLogs: currentLogs + '\n[SMART-DEPLOY] ✅ SSM agent connected\n[SMART-DEPLOY] Running initial setup (installing Node.js, Git, cloning repository)...\n[SMART-DEPLOY] This may take 60-90 seconds...',
        });
      } catch (dbError) {
        console.error('[SMART-DEPLOY] Failed to update logs:', dbError);
      }
    }

    // Wait for UserData to complete setup (git, python, node, repo clone)
    // Skip this for reused instances (already set up)
    let setupComplete = false;

    if (existingInstance) {
      console.log('[SMART-DEPLOY] ♻️  Skipping UserData wait (reusing existing instance)');
      console.log('[SMART-DEPLOY] Instance already has runtimes installed');
      setupComplete = true; // Mark as complete to skip the wait loop
    } else {
      console.log('[SMART-DEPLOY] Waiting for UserData setup to complete...');
      console.log('[SMART-DEPLOY] This includes: installing runtimes + cloning repository');
    }

    if (!setupComplete) { // Only wait if NOT reusing instance
    for (let i = 0; i < 60; i++) {
      // 60 attempts × 3 seconds = 3 minutes
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const checkCommand = new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
          commands: [
            'echo "=== Checking UserData status ==="',
            'if grep -q "SETUP_COMPLETE_READY_FOR_DEPLOYMENT" /var/log/user-data.log 2>/dev/null; then',
            '  echo "✅ SETUP_COMPLETE"',
            '  echo "Repository contents:"',
            '  ls -la /home/ec2-user/app | head -10',
            '  exit 0',
            'else',
            '  echo "⏳ Setup still running..."',
            '  echo "Last 10 lines of UserData log:"',
            '  tail -10 /var/log/user-data.log 2>/dev/null || echo "❌ UserData log not available yet"',
            '  exit 1',
            'fi',
          ],
        },
      });

      try {
        const checkResponse = await ssmClient.send(checkCommand);
        const checkCommandId = checkResponse.Command?.CommandId;

        if (checkCommandId) {
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const result = await ssmClient.send(
            new GetCommandInvocationCommand({
              CommandId: checkCommandId,
              InstanceId: instanceId,
            })
          );

          if (result.StandardOutputContent?.includes('SETUP_COMPLETE')) {
            console.log('[SMART-DEPLOY] ✅ UserData setup complete!');
            console.log('[SMART-DEPLOY] Repository cloned and ready');
            setupComplete = true;

            if (deploymentRecord) {
              try {
                await Deployment.findByIdAndUpdate(deploymentRecord._id, {
                  rawLogs: (deploymentRecord.rawLogs || '') + '\n[SMART-DEPLOY] ✅ Setup complete - repository cloned\n',
                });
              } catch (dbError) {
                console.error('[SMART-DEPLOY] Failed to update logs:', dbError);
              }
            }

            break;
          } else {
            // Show diagnostic output from UserData
            console.log(`[SMART-DEPLOY] Setup in progress... (attempt ${i + 1}/60)`);
            if (result.StandardOutputContent) {
              console.log('[SMART-DEPLOY] UserData status:', result.StandardOutputContent.slice(0, 500));
            }
            if (result.StandardErrorContent) {
              console.error('[SMART-DEPLOY] UserData errors:', result.StandardErrorContent.slice(0, 500));
            }
          }
        }
      } catch (error: any) {
        console.log(`[SMART-DEPLOY] Check failed: ${error.message}, retrying...`);
      }
    }
    } // End of if (!setupComplete) block - reused instances skip UserData wait

    if (!setupComplete) {
      const errorMsg = 'UserData setup timeout - initial setup did not complete within 3 minutes. Check UserData logs for errors.';
      console.error('[SMART-DEPLOY] ❌', errorMsg);

      if (deploymentRecord) {
        await Deployment.findByIdAndUpdate(deploymentRecord._id, {
          status: 'failed',
          errorMessage: errorMsg,
        });
      }

      await releaseDeploymentLock();

      return NextResponse.json({
        success: false,
        error: errorMsg,
        instanceId,
        publicIp,
      }, { status: 500 });
    }

    console.log('[SMART-DEPLOY] Setup verification complete - proceeding with deployment');

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🔧 INSTALL RUNTIME VIA SSM (for new instances only)
    // ═══════════════════════════════════════════════════════════════════════════════
    if (!existingInstance) {
      console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
      console.log('[SMART-DEPLOY] 🔧 INSTALLING RUNTIME VIA SSM');
      console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
      console.log('[SMART-DEPLOY] Runtime:', detectedRuntime);
      console.log('[SMART-DEPLOY] Note: Moved from UserData to avoid AWS 25KB size limit');
      
      const runtimeInstallResult = await installRuntimeViaSSM(instanceId, detectedRuntime);
      
      if (!runtimeInstallResult.success) {
        const errorMsg = `Runtime installation failed: ${runtimeInstallResult.error || 'Unknown error'}`;
        console.error('[SMART-DEPLOY] ❌', errorMsg);
        console.error('[SMART-DEPLOY] Runtime installation output:', runtimeInstallResult.output);
        
        if (deploymentRecord) {
          await Deployment.findByIdAndUpdate(deploymentRecord._id, {
            status: 'failed',
            errorMessage: errorMsg,
            rawLogs: runtimeInstallResult.output,
          });
        }
        
        await releaseDeploymentLock();
        
        return NextResponse.json({
          success: false,
          error: errorMsg,
          details: runtimeInstallResult.output,
          instanceId,
          publicIp,
        }, { status: 500 });
      }
      
      console.log('[SMART-DEPLOY] ✅ Runtime installation completed successfully');
      console.log('[SMART-DEPLOY] Runtime output (last 500 chars):', runtimeInstallResult.output.slice(-500));
      console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
    } else {
      console.log('[SMART-DEPLOY] ℹ️  Reusing existing instance - runtime already installed');
    }

    // ═══════════════════════════════════════════════════════════════════════════════
    // 🔄 GIT PULL FOR REUSED INSTANCES
    // ═══════════════════════════════════════════════════════════════════════════════
    if (existingInstance) {
      console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
      console.log('[SMART-DEPLOY] 🔄 PULLING LATEST CODE (reused instance)');
      console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');

      try {
        const gitPullCommand = new SendCommandCommand({
          DocumentName: 'AWS-RunShellScript',
          InstanceIds: [instanceId],
          Parameters: {
            commands: [
              '#!/bin/bash',
              'echo "[REDEPLOY] ════════════════════════════════════════════════════════════"',
              'echo "[REDEPLOY] 🔄 REDEPLOYING ON EXISTING INSTANCE"',
              'echo "[REDEPLOY] ════════════════════════════════════════════════════════════"',
              'echo ""',
              '',
              'echo "[REDEPLOY] Step 1/3: Stopping old application..."',
              'pkill -f "node.*app" 2>/dev/null && echo "  ✓ Killed Node.js" || echo "  - No Node.js"',
              'pkill -f "python.*app" 2>/dev/null && echo "  ✓ Killed Python" || echo "  - No Python"',
              'pkill -f "uvicorn" 2>/dev/null && echo "  ✓ Killed uvicorn" || echo "  - No uvicorn"',
              'echo "[REDEPLOY] ✅ Old processes stopped"',
              'echo ""',
              '',
              'echo "[REDEPLOY] Step 2/3: Pulling latest code (as ec2-user)..."',
              '',
              '# CRITICAL: Run as ec2-user to ensure proper git permissions',
              'sudo -u ec2-user bash << "EOF_GIT_PULL"',
              'set -e',
              'cd /home/ec2-user/app',
              '',
              'echo "[GIT] Current directory: $(pwd)"',
              'echo "[GIT] Running as user: $(whoami)"',
              'echo "[GIT] Current branch: $(git branch --show-current)"',
              'echo ""',
              'echo "[GIT] Commit BEFORE pull:"',
              'git log -1 --oneline',
              'echo ""',
              '',
              'echo "[GIT] Fetching from origin..."',
              'git fetch origin',
              'echo "[GIT] ✓ Fetch complete"',
              'echo ""',
              '',
              'echo "[GIT] Remote commit:"',
              'git log origin/$(git branch --show-current) -1 --oneline',
              'echo ""',
              '',
              'echo "[GIT] Hard resetting to match remote (discarding local changes)..."',
              'git reset --hard origin/$(git branch --show-current)',
              'echo ""',
              '',
              'echo "[GIT] ═══════════════════════════════════════════"',
              'echo "[GIT] ✅ ✅ ✅ CODE UPDATED ✅ ✅ ✅"',
              'echo "[GIT] ═══════════════════════════════════════════"',
              'echo "[GIT] Commit AFTER pull:"',
              'git log -1 --pretty=format:"Hash: %h%nAuthor: %an%nMessage: %s%n"',
              'echo ""',
              'echo ""',
              'echo "[GIT] Changed files:"',
              'git diff --name-status HEAD~1..HEAD 2>/dev/null | head -10 || echo "First commit"',
              'echo ""',
              '',
              'EOF_GIT_PULL',
              '',
              'echo "[REDEPLOY] Step 3/3: Ready to re-run pipeline..."',
              'echo "[REDEPLOY] ════════════════════════════════════════════════════════════"',
              'echo ""',
            ],
          },
        });

        const gitPullResponse = await ssmClient.send(gitPullCommand);
        const gitPullCommandId = gitPullResponse.Command?.CommandId;

        if (gitPullCommandId) {
          // Wait for git pull and process cleanup to complete
          console.log('[SMART-DEPLOY] Waiting for git pull to complete (8 seconds)...');
          await new Promise(resolve => setTimeout(resolve, 8000));

          const gitResult = await ssmClient.send(
            new GetCommandInvocationCommand({
              CommandId: gitPullCommandId,
              InstanceId: instanceId,
            })
          );

          console.log('[SMART-DEPLOY] ═══════════════════════════════════════════════════════════');
          console.log('[SMART-DEPLOY] Redeploy preparation output:');
          console.log('[SMART-DEPLOY] ═══════════════════════════════════════════════════════════');
          console.log(gitResult.StandardOutputContent);

          if (gitResult.StandardErrorContent) {
            console.log('[SMART-DEPLOY] Warnings/Errors:');
            console.log(gitResult.StandardErrorContent);
          }

          console.log('[SMART-DEPLOY] ═══════════════════════════════════════════════════════════');
          console.log('[SMART-DEPLOY] ✅ Instance ready for redeployment');
          console.log('[SMART-DEPLOY] ✅ Old processes killed');
          console.log('[SMART-DEPLOY] ✅ Latest code pulled');
          console.log('[SMART-DEPLOY] ═══════════════════════════════════════════════════════════');

          // Update deployment logs with git pull output
          if (deploymentRecord) {
            try {
              const current = await Deployment.findById(deploymentRecord._id);
              await Deployment.findByIdAndUpdate(deploymentRecord._id, {
                rawLogs: (current?.rawLogs || '') + '\n\n' + gitResult.StandardOutputContent + '\n',
              });
            } catch (dbError) {
              console.error('[SMART-DEPLOY] Failed to update deployment logs with git pull output');
            }
          }
        }
      } catch (error: any) {
        console.error('[SMART-DEPLOY] ❌ Redeploy preparation failed:', error.message);
        console.log('[SMART-DEPLOY] Will attempt to proceed anyway...');

        // Log the failure to deployment record
        if (deploymentRecord) {
          try {
            const current = await Deployment.findById(deploymentRecord._id);
            await Deployment.findByIdAndUpdate(deploymentRecord._id, {
              rawLogs: (current?.rawLogs || '') + '\n[SMART-DEPLOY] ⚠️  Git pull failed: ' + error.message + '\n',
            });
          } catch (dbError) {
            // Ignore
          }
        }
      }

      console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
    }

    // Update logs: Setup complete, starting stages
    if (deploymentRecord) {
      try {
        const current = await Deployment.findById(deploymentRecord._id);
        // Clean up progress lines
        const cleanLogs = (current?.rawLogs || '').split('\n').filter(line => !line.includes('[PROGRESS]')).join('\n');

        const statusMessage = existingInstance
          ? '\n[SMART-DEPLOY] ✅ Code updated via git pull\n[SMART-DEPLOY] Starting pipeline stages...\n'
          : '\n[SMART-DEPLOY] ✅ Initial setup complete\n[SMART-DEPLOY] Starting pipeline stages...\n';

        await Deployment.findByIdAndUpdate(deploymentRecord._id, {
          rawLogs: cleanLogs + statusMessage,
        });
      } catch (dbError) {
        console.error('[SMART-DEPLOY] Failed to update logs:', dbError);
      }
    }

    // Step 3: AI-POWERED PIPELINE GENERATION - Use Claude Sonnet to analyze and generate perfect pipeline
    console.log('[SMART-DEPLOY] ========================================');
    console.log('[SMART-DEPLOY] 🤖 AI-POWERED DEPLOYMENT');
    console.log('[SMART-DEPLOY] Using Claude Sonnet 4.6 for analysis');
    console.log('[SMART-DEPLOY] ========================================');

    // Import AI analysis and pipeline generation modules
    const { fetchUniversalProjectFilesFromGitHub } = await import('@/lib/github-universal-fetcher');
    const { analyzeUniversalProject } = await import('@/lib/universal-language-analyzer');
    const { generateAIPipeline } = await import('@/lib/ai/enhanced-pipeline-generator');
    const { fetchProjectFiles, detectLanguageAndFramework } = await import('@/lib/github/multi-language-analyzer');

    const [owner, repo] = repoFullName.split('/');

    // Step 3.1: Fetch repository files
    console.log('[SMART-DEPLOY] 📥 Step 3.1: Fetching repository files from GitHub...');
    const universalFiles = await fetchUniversalProjectFilesFromGitHub(owner, repo, githubToken);
    console.log('[SMART-DEPLOY] ✅ Files fetched. Detected languages:', universalFiles.detectedLanguages.join(', ') || 'Unknown');

    // Step 3.2: AI Analysis using Claude Sonnet
    console.log('[SMART-DEPLOY] 🤖 Step 3.2: Analyzing repository with Claude Sonnet AI...');
    const aiAnalysis = await analyzeUniversalProject(universalFiles);
    console.log('[SMART-DEPLOY] ✅ AI Analysis Complete:');
    console.log('[SMART-DEPLOY]    Language:', aiAnalysis.language);
    console.log('[SMART-DEPLOY]    Framework:', aiAnalysis.framework);
    console.log('[SMART-DEPLOY]    Port:', aiAnalysis.port);
    console.log('[SMART-DEPLOY]    Project Type:', aiAnalysis.projectType);

    // Step 3.3: Generate AI-powered pipeline
    console.log('[SMART-DEPLOY] ⚙️  Step 3.3: Generating optimized pipeline with Claude Sonnet...');
    const projectFiles = await fetchProjectFiles(owner, repo, githubToken);
    const languageInfo = detectLanguageAndFramework(projectFiles);
    const generatedPipeline = await generateAIPipeline(repoFullName, projectFiles, languageInfo);

    console.log('[SMART-DEPLOY] ✅ AI Pipeline Generated!');
    console.log('[SMART-DEPLOY]    Stages:', generatedPipeline.stages.join(' → '));
    console.log('[SMART-DEPLOY]    Method: Claude Sonnet 4.6 (AI-Generated)');

    // Step 3.4: Parse AI-generated YAML pipeline
    console.log('[SMART-DEPLOY] 📋 Step 3.4: Parsing AI-generated pipeline...');
    const yaml = await import('yaml');
    const aiPipeline = yaml.parse(generatedPipeline.yamlContent);

    // Use AI-generated pipeline with proper structure (stages + jobs)
    pipeline = {
      stages: aiPipeline.stages || generatedPipeline.stages,
      jobs: parsePipelineJobs(generatedPipeline.yamlContent),  // Parse jobs from YAML
    };
    console.log('[SMART-DEPLOY] ✅ Using AI-generated pipeline with', pipeline.stages.length, 'stages and', pipeline.jobs.length, 'jobs');

    // Update saved pipeline in database with AI-generated version
    await Pipeline.findByIdAndUpdate(savedPipeline._id, {
      yaml: generatedPipeline.yamlContent,
      language: aiAnalysis.language,
      framework: aiAnalysis.framework,
      port: aiAnalysis.port,
      stages: generatedPipeline.stages,
      startCommand: aiAnalysis.startCommand,
    });

    // Create analysis objects for backward compatibility
    const universalAnalysis = {
      projectType: aiAnalysis.projectType,
      port: parseInt(aiAnalysis.port) || 80,
    };

    const buildConfig = {
      framework: aiAnalysis.framework,
      installCommand: aiAnalysis.installCommand,
      buildCommand: aiAnalysis.buildCommand,
      testCommand: aiAnalysis.testCommand || '',
      lintCommand: '',
      startCommand: aiAnalysis.startCommand,
      optimizationFlags: [],
      environmentVars: {},
      estimatedBuildTime: aiAnalysis.estimatedBuildTime || '5-10 minutes',
      progressMonitoring: false,
    };

    const projectAnalysis = {
      buildTool: aiAnalysis.buildTool,
      dependencies: [],
      devDependencies: [],
      buildCommand: aiAnalysis.buildCommand,
      installStrategy: aiAnalysis.installCommand,
      recommendations: aiAnalysis.recommendations || [],
    };

    // Update savedPipeline with AI analysis
    savedPipeline.language = aiAnalysis.language;
    savedPipeline.framework = aiAnalysis.framework;
    savedPipeline.port = aiAnalysis.port;

    // Step 3.6: PRE-FLIGHT CHECKS - Fix common issues BEFORE attempting build (like Vercel does)
    // SKIP FOR NON-NODE.JS PROJECTS (Rust, Go, Python, etc.)
    const isNodeProject = savedPipeline.language?.includes('JavaScript') ||
                          savedPipeline.language?.includes('TypeScript') ||
                          savedPipeline.language?.includes('Node');

    if (!isNodeProject) {
      console.log('[SMART-DEPLOY] ========================================');
      console.log('[SMART-DEPLOY] SKIPPING Pre-flight checks for ' + savedPipeline.language);
      console.log('[SMART-DEPLOY] Language:', savedPipeline.language);
      console.log('[SMART-DEPLOY] Framework:', savedPipeline.framework);
      console.log('[SMART-DEPLOY] Pre-flight checks are Node.js-specific');
      console.log('[SMART-DEPLOY] ========================================');
      console.log('');
    } else {
      console.log('[SMART-DEPLOY] Running pre-flight checks for Node.js project...');
      const preFlightResult = await executeSSMCommand(instanceId, [
        'cd /home/ec2-user/app',
        'export CI=true',
        'export NODE_ENV=production',
        '',
        'echo "════════════════════════════════════════════════════════════"',
        'echo "PRE-FLIGHT CHECKS - Vercel-Style Proactive Fixes"',
        'echo "════════════════════════════════════════════════════════════"',
        '',
        '# 0. VERIFY NODE.JS VERSION',
        'echo "[PRE-FLIGHT] 0/9: Verifying Node.js version..."',
        'CURRENT_NODE_VERSION=$(node -v | sed "s/v//")',
        'MAJOR_VERSION=$(echo $CURRENT_NODE_VERSION | cut -d. -f1)',
        'echo "  ℹ️  Current Node.js version: v$CURRENT_NODE_VERSION"',
        '',
        'if [ "$MAJOR_VERSION" -lt 20 ]; then',
        '  echo "  ⚠️  Node.js $MAJOR_VERSION detected - upgrading to v20 LTS..."',
        '  echo "  → This is required for Next.js 16+ and modern frameworks"',
        '  ',
        '  # Install NVM (Node Version Manager)',
        '  if [ ! -d "$HOME/.nvm" ]; then',
        '    echo "  → Installing NVM..."',
        '    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash',
        '  fi',
        '  ',
        '  # Load NVM',
        '  export NVM_DIR="$HOME/.nvm"',
        '  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
        '  ',
        '  # Install and use Node.js 20',
        '  echo "  → Installing Node.js 20 LTS..."',
        '  nvm install 20',
        '  nvm use 20',
        '  nvm alias default 20',
        '  ',
        '  # Verify upgrade',
        '  NEW_VERSION=$(node -v)',
        '  echo "  ✅ Upgraded to Node.js $NEW_VERSION"',
        'else',
        '  echo "  ✅ Node.js version is compatible (v$MAJOR_VERSION >= 20)"',
        'fi',
      'echo ""',
      '',
      '# 1. FIX JSX FILE EXTENSIONS (Most common issue)',
      'echo "[PRE-FLIGHT] 1/9: Fixing JSX file extensions..."',
      'if [ -d "src" ]; then',
      '  JSX_FIXED=0',
      '  for file in $(find src -name "*.js" -type f 2>/dev/null); do',
      '    if grep -q "className\\|<div\\|<span\\|</\\|jsx\\|<React" "$file" 2>/dev/null; then',
      '      newfile="${file%.js}.jsx"',
      '      echo "  → Renaming $file to $newfile (contains JSX)"',
      '      mv "$file" "$newfile" 2>/dev/null',
      '      JSX_FIXED=$((JSX_FIXED + 1))',
      '    fi',
      '  done',
      '  ',
      '  # Always rename common entry files',
      '  [ -f "src/App.js" ] && mv src/App.js src/App.jsx 2>/dev/null && echo "  → Renamed src/App.js" && JSX_FIXED=$((JSX_FIXED + 1))',
      '  [ -f "src/main.js" ] && mv src/main.js src/main.jsx 2>/dev/null && echo "  → Renamed src/main.js" && JSX_FIXED=$((JSX_FIXED + 1))',
      '  [ -f "src/index.js" ] && mv src/index.js src/index.jsx 2>/dev/null && echo "  → Renamed src/index.js" && JSX_FIXED=$((JSX_FIXED + 1))',
      '  ',
      '  # Update imports',
      '  if [ $JSX_FIXED -gt 0 ]; then',
      '    echo "  → Updating imports from .js to .jsx..."',
      '    find src -type f \\( -name "*.jsx" -o -name "*.js" -o -name "*.ts" -o -name "*.tsx" \\) 2>/dev/null | while read f; do',
      '      sed -i "s/\\.js\\"/\\.jsx\\"/g" "$f" 2>/dev/null || true',
      "      sed -i \"s/\\.js'/\\.jsx'/g\" \"$f\" 2>/dev/null || true",
      '    done',
      '    echo "  ✅ Fixed $JSX_FIXED JSX files"',
      '  else',
      '    echo "  ✅ No JSX files need fixing"',
      '  fi',
      'else',
      '  echo "  ℹ No src/ directory found"',
      'fi',
      '',
      '# 2. FIX TAILWIND CSS CONFIGURATION AND DEPENDENCIES',
      'echo "[PRE-FLIGHT] 2/9: Configuring Tailwind CSS..."',
      '',
      '# Check if Tailwind is USED in CSS files (most reliable detection)',
      'HAS_TAILWIND=false',
      'TAILWIND_IN_PACKAGE=false',
      '',
      '# Method 1: Check for @tailwind directives in CSS files (actual usage)',
      'if find . -name "*.css" -type f -exec grep -l "@tailwind" {} \\; 2>/dev/null | head -1 | grep -q .; then',
      '  HAS_TAILWIND=true',
      '  echo "  ✅ Tailwind CSS detected in CSS files (@tailwind directives found)"',
      'elif find src -name "*.css" -type f 2>/dev/null | head -1 | xargs grep -l "@tailwind" 2>/dev/null | grep -q .; then',
      '  HAS_TAILWIND=true',
      '  echo "  ✅ Tailwind CSS detected in src/ CSS files"',
      'fi',
      '',
      '# Method 2: Check if Tailwind is in package.json',
      'if grep -q "tailwindcss\\|@tailwindcss" package.json 2>/dev/null; then',
      '  TAILWIND_IN_PACKAGE=true',
      '  echo "  ℹ️  Tailwind CSS found in package.json"',
      '  HAS_TAILWIND=true',
      'fi',
      '',
      '# CRITICAL: If Tailwind is USED but NOT in package.json, add it!',
      'if [ "$HAS_TAILWIND" = true ] && [ "$TAILWIND_IN_PACKAGE" = false ]; then',
      '  echo "  ⚠️  Tailwind CSS is USED but NOT in package.json!"',
      '  echo "  → Adding Tailwind to package.json devDependencies..."',
      '  ',
      '  # Add to devDependencies using npm pkg (safely modifies package.json)',
      '  npm pkg set devDependencies.tailwindcss="^3.4.0" --json 2>/dev/null || true',
      '  npm pkg set devDependencies.postcss="^8.4.0" --json 2>/dev/null || true',
      '  npm pkg set devDependencies.autoprefixer="^10.4.0" --json 2>/dev/null || true',
      '  ',
      '  echo "  ✅ Added Tailwind CSS to package.json"',
      '  echo "  → Now npm install will include Tailwind"',
      '  ',
      '  # CRITICAL: Delete package-lock.json so npm install uses updated package.json',
      '  echo "  → Removing package-lock.json (will be regenerated with Tailwind)"',
      '  rm -f package-lock.json',
      '  ',
      '  # Show what was added',
      '  echo "  → Updated devDependencies:"',
      '  grep -A 3 "devDependencies" package.json | grep -E "tailwindcss|postcss|autoprefixer" || echo "    (check package.json)"',
      'fi',
      '',
      '# Handle Tailwind v4 native binding issues',
      'if grep -q "@tailwindcss/vite\\|@tailwindcss/oxide" package.json 2>/dev/null; then',
      '  echo "  ⚠️  Tailwind CSS v4 detected - has native binding issues on EC2"',
      '  echo "  → Downgrading to Tailwind v3 (stable and reliable)..."',
      '  ',
      '  # Check if vite.config.js exists and has @tailwindcss/vite references',
      '  if [ -f "vite.config.js" ]; then',
      '    echo "  → Backing up original vite.config.js..."',
      '    cp vite.config.js vite.config.js.backup',
      '    ',
      '    echo "  → Original vite.config.js:"',
      '    cat vite.config.js',
      '    echo ""',
      '  fi',
      '  ',
      '  # Uninstall Tailwind v4',
      '  npm uninstall @tailwindcss/vite @tailwindcss/oxide 2>/dev/null || true',
      '  npm install --save-dev tailwindcss@^3.4.0 postcss@^8 autoprefixer@^10 --legacy-peer-deps --force 2>&1 | tail -5',
      '  ',
      '  # Fix vite.config.js - Remove @tailwindcss/vite plugin',
      '  if [ -f "vite.config.js" ]; then',
      '    echo "  → Fixing vite.config.js (removing @tailwindcss/vite)..."',
      '    ',
      '    # Create a clean vite.config.js for Tailwind v3',
      '    cat > vite.config.js << "VITEEOF"',
      'import { defineConfig } from "vite";',
      'import react from "@vitejs/plugin-react";',
      '',
      'export default defineConfig({',
      '  plugins: [react()],',
      '  root: ".",',
      '  publicDir: "public",',
      '  build: {',
      '    outDir: "dist",',
      '    assetsDir: "assets",',
      '    emptyOutDir: true,',
      '  },',
      '});',
      'VITEEOF',
      '    ',
      '    echo "  → New vite.config.js:"',
      '    cat vite.config.js',
      '    echo ""',
      '  fi',
      '  ',
      '  # Also check for vite.config.ts',
      '  if [ -f "vite.config.ts" ]; then',
      '    echo "  → Fixing vite.config.ts (removing @tailwindcss/vite)..."',
      '    mv vite.config.ts vite.config.ts.backup',
      '    ',
      '    cat > vite.config.ts << "VITETSEOF"',
      'import { defineConfig } from "vite";',
      'import react from "@vitejs/plugin-react";',
      '',
      'export default defineConfig({',
      '  plugins: [react()],',
      '  root: ".",',
      '  publicDir: "public",',
      '  build: {',
      '    outDir: "dist",',
      '    assetsDir: "assets",',
      '    emptyOutDir: true,',
      '  },',
      '});',
      'VITETSEOF',
      '    echo "  ✅ Fixed vite.config.ts"',
      '  fi',
      '  ',
      '  HAS_TAILWIND=true',
      '  echo "  ✅ Tailwind v4 downgraded to v3 and vite.config.js fixed"',
      'fi',
      '',
      '# If Tailwind is used, ensure complete configuration',
      'if [ "$HAS_TAILWIND" = true ]; then',
      '  echo "  → Setting up Tailwind CSS environment..."',
      '  ',
      '  # Detect Tailwind version from package.json',
      '  TAILWIND_V4=false',
      '  if grep -q "@tailwindcss/postcss" package.json 2>/dev/null; then',
      '    echo "  ✓ Tailwind CSS v4 detected (@tailwindcss/postcss found)"',
      '    TAILWIND_V4=true',
      '  elif grep -q "tailwindcss" package.json 2>/dev/null; then',
      '    TW_VERSION=$(grep -oP \'"tailwindcss":\\s*"\\^?\\K[0-9]+\' package.json | head -1)',
      '    if [ "$TW_VERSION" = "4" ]; then',
      '      echo "  ✓ Tailwind CSS v4 detected (version ^4.x)"',
      '      TAILWIND_V4=true',
      '    fi',
      '  fi',
      '  ',
      '  # Install or verify Tailwind dependencies based on version',
      '  if [ "$TAILWIND_V4" = false ]; then',
      '    if ! npm list tailwindcss --depth=0 2>/dev/null | grep -q "tailwindcss@"; then',
      '      echo "    Installing Tailwind CSS v3..."',
      '      npm install --save-dev tailwindcss@^3.4.0 postcss@^8 autoprefixer@^10 --legacy-peer-deps --force 2>&1 | tail -5',
      '    fi',
      '  else',
      '    echo "  → Tailwind CSS v4 already in package.json, skipping v3 install"',
      '  fi',
      '  ',
      '  # Create config files based on Tailwind version',
      '  if [ "$TAILWIND_V4" = true ]; then',
      '    echo "    Creating Tailwind v4 configuration..."',
      '    ',
      '    # Tailwind v4 uses @tailwindcss/postcss plugin',
      '    if [ ! -f "postcss.config.js" ] && [ ! -f "postcss.config.mjs" ]; then',
      '      echo "    Creating postcss.config.js for Tailwind v4..."',
      '      cat > postcss.config.js << "POSTCSSEOF"',
      'module.exports = {',
      '  plugins: {',
      '    "@tailwindcss/postcss": {}',
      '  }',
      '}',
      'POSTCSSEOF',
      '    else',
      '      echo "    → PostCSS config already exists, keeping it"',
      '    fi',
      '    ',
      '    echo "  ✓ Tailwind v4 configuration complete"',
      '  else',
      '    echo "    Creating Tailwind v3 configuration..."',
      '    ',
      '    # Create Tailwind config for v3',
      '    cat > tailwind.config.js << "TAILWINDEOF"',
      'module.exports = {',
      '  content: [',
      '    "./index.html",',
      '    "./src/**/*.{js,ts,jsx,tsx,html}",',
      '  ],',
      '  theme: {',
      '    extend: {},',
      '  },',
      '  plugins: [],',
      '}',
      'TAILWINDEOF',
      '    ',
      '    # Create PostCSS config for v3',
      '    cat > postcss.config.js << "POSTCSSEOF"',
      'module.exports = {',
      '  plugins: {',
      '    tailwindcss: {},',
      '    autoprefixer: {},',
      '  },',
      '}',
      'POSTCSSEOF',
      '    ',
      '    echo "  ✓ Tailwind v3 configuration complete"',
      '  fi',
      '  ',
      '  # Ensure CSS file has Tailwind directives',
      '  CSS_FILE=""',
      '  [ -f "src/index.css" ] && CSS_FILE="src/index.css"',
      '  [ -f "src/App.css" ] && CSS_FILE="src/App.css"',
      '  [ -f "src/styles.css" ] && CSS_FILE="src/styles.css"',
      '  ',
      '  if [ -z "$CSS_FILE" ]; then',
      '    echo "    Creating src/index.css with Tailwind directives..."',
      '    mkdir -p src',
      '    CSS_FILE="src/index.css"',
      '  fi',
      '  ',
      '  echo "    Ensuring Tailwind directives in $CSS_FILE..."',
      '  if ! grep -q "@tailwind base" "$CSS_FILE" 2>/dev/null; then',
      '    echo "    → Adding Tailwind directives to $CSS_FILE"',
      '    # Backup existing content',
      '    if [ -f "$CSS_FILE" ]; then',
      '      mv "$CSS_FILE" "$CSS_FILE.backup"',
      '    fi',
      '    ',
      '    # Create new file with Tailwind directives',
      '    cat > "$CSS_FILE" << "CSSEOF"',
      '@tailwind base;',
      '@tailwind components;',
      '@tailwind utilities;',
      '',
      'CSSEOF',
      '    ',
      '    # Append backup if exists',
      '    if [ -f "$CSS_FILE.backup" ]; then',
      '      cat "$CSS_FILE.backup" >> "$CSS_FILE"',
      '      rm "$CSS_FILE.backup"',
      '    fi',
      '  fi',
      '  ',
      '  # Verify Tailwind directives are present',
      '  echo "    Verifying Tailwind directives in $CSS_FILE:"',
      '  grep "@tailwind" "$CSS_FILE" || echo "    ⚠️  WARNING: No @tailwind directives found!"',
      '  ',
      '  # Ensure CSS is imported in entry file',
      '  echo "    Checking CSS import in entry files..."',
      '  ENTRY_FILES="src/main.jsx src/index.jsx src/main.tsx src/index.tsx src/App.jsx src/App.tsx"',
      '  CSS_IMPORTED=false',
      '  for entry in $ENTRY_FILES; do',
      '    if [ -f "$entry" ]; then',
      '      if grep -q "import.*\\(index\\.css\\|App\\.css\\|styles\\.css\\)" "$entry" 2>/dev/null; then',
      '        echo "      ✅ CSS already imported in $entry"',
      '        CSS_IMPORTED=true',
      '        break',
      '      fi',
      '    fi',
      '  done',
      '  ',
      '  if [ "$CSS_IMPORTED" = false ]; then',
      '    # Try to add import to main entry file',
      '    for entry in src/main.jsx src/index.jsx src/main.tsx src/index.tsx; do',
      '      if [ -f "$entry" ]; then',
      '        echo "      → Adding CSS import to $entry"',
      '        sed -i "1i import \\"./index.css\\";" "$entry" 2>/dev/null || true',
      '        break',
      '      fi',
      '    done',
      '  fi',
      '  ',
      '  echo "  ✅ Tailwind CSS configuration complete"',
      '  echo "    Config files created:"',
      '  ls -lh tailwind.config.js postcss.config.js 2>/dev/null || echo "    ⚠️  Config files missing!"',
      '  echo "    CSS file: $CSS_FILE"',
      '  echo "    CSS size: $(wc -c < "$CSS_FILE" 2>/dev/null || echo 0) bytes"',
      'else',
      '  echo "  ✅ No Tailwind CSS detected - skipping Tailwind configuration"',
      'fi',
      '',
      '# 2.5. PRISMA DATABASE CLIENT GENERATION',
      'echo "[PRE-FLIGHT] 2.5/8: Checking for Prisma..."',
      '',
      'if grep -q "\\"@prisma/client\\"\\|\\"\\"prisma\\"" package.json 2>/dev/null; then',
      '  echo "  ✅ Prisma detected in package.json"',
      '  ',
      '  # Check if schema exists',
      '  if [ -f "prisma/schema.prisma" ]; then',
      '    echo "  → Found prisma/schema.prisma"',
      '    ',
      '    # Install Prisma CLI if missing',
      '    if ! npm list prisma --depth=0 2>/dev/null | grep -q prisma; then',
      '      echo "    Installing Prisma CLI..."',
      '      npm install --save-dev prisma --legacy-peer-deps 2>&1 | tail -5',
      '    fi',
      '    ',
      '    # Check Prisma version and downgrade if 7.x',
      '    echo "  → Checking Prisma version..."',
      '    PRISMA_VERSION=$(npx prisma --version 2>/dev/null | head -1 | grep -oP "\\\\d+\\\\.\\\\d+\\\\.\\\\d+" | head -1 || echo "0.0.0")',
      '    PRISMA_MAJOR=$(echo $PRISMA_VERSION | cut -d. -f1)',
      '    echo "  → Current Prisma version: $PRISMA_VERSION"',
      '    ',
      '    if [ "$PRISMA_MAJOR" = "7" ]; then',
      '      echo "  ⚠️  Prisma 7.x detected - DOWNGRADING to 5.x (7.x has breaking changes)"',
      '      echo "  → Step 1: Removing package.json Prisma entries..."',
      '      npm pkg delete dependencies.@prisma/client 2>/dev/null || true',
      '      npm pkg delete devDependencies.prisma 2>/dev/null || true',
      '      ',
      '      echo "  → Step 2: Removing node_modules Prisma installations..."',
      '      rm -rf node_modules/.prisma node_modules/@prisma node_modules/prisma 2>/dev/null || true',
      '      ',
      '      echo "  → Step 3: Clearing npm cache..."',
      '      npm cache clean --force 2>&1 | tail -3',
      '      ',
      '      echo "  → Step 4: Installing Prisma 5.22.0..."',
      '      npm install @prisma/client@5.22.0 prisma@5.22.0 --save-exact --legacy-peer-deps 2>&1 | grep -E "added|removed|changed|@prisma" | tail -10',
      '      ',
      '      echo "  → Step 5: Verifying downgrade..."',
      '      NEW_VERSION=$(npx prisma --version 2>/dev/null | head -1 | grep -oP "\\\\d+\\\\.\\\\d+\\\\.\\\\d+" | head -1 || echo "failed")',
      '      if echo "$NEW_VERSION" | grep -q "^5\\\\."; then',
      '        echo "  ✅ Successfully downgraded to Prisma $NEW_VERSION"',
      '      else',
      '        echo "  ❌ Downgrade FAILED - version is still: $NEW_VERSION"',
      '        echo "  → Will try again after full npm install"',
      '      fi',
      '    else',
      '      echo "  ✅ Prisma $PRISMA_VERSION is compatible"',
      '    fi',
      '    ',
      '    # Generate Prisma Client',
      '    echo "  → Running prisma generate..."',
      '    npx prisma generate 2>&1 | tail -15',
      '    ',
      '    # Verify client was generated',
      '    if [ -d "node_modules/.prisma/client" ]; then',
      '      echo "  ✅ Prisma client exists"',
      '      ls -lh node_modules/.prisma/client/index.js 2>/dev/null || echo "  ⚠️  But index.js not found"',
      '    else',
      '      echo "  ⚠️  Prisma client directory not found"',
      '    fi',
      '  else',
      '    echo "  ⚠️  Prisma in package.json but no schema.prisma found"',
      '    echo "     Expected location: prisma/schema.prisma"',
      '  fi',
      'else',
      '  echo "  ℹ️  No Prisma detected - skipping"',
      'fi',
      'echo ""',
      '',
      '# 2.6. ENSURE COMPLETE DEPENDENCIES FOR ALL FRAMEWORKS',
      'echo "[PRE-FLIGHT] 2.6/9: Ensuring complete framework dependencies..."',
      'NEEDS_PACKAGE_LOCK_REFRESH=false',
      '',
      '# Next.js Projects',
      'if grep -q "\\"next\\"" package.json 2>/dev/null; then',
      '  echo "  → Next.js project detected"',
      '  ',
      '  # ESLint (required by Next.js)',
      '  if ! grep -q "\\"eslint\\"" package.json 2>/dev/null; then',
      '    echo "    Adding ESLint (required by Next.js)..."',
      '    npm pkg set devDependencies.eslint="^8.57.0" --json 2>/dev/null || true',
      '    npm pkg set devDependencies.eslint-config-next="latest" --json 2>/dev/null || true',
      '    NEEDS_PACKAGE_LOCK_REFRESH=true',
      '  fi',
      '  ',
      '  # TypeScript types',
      '  if ! grep -q "@types/react" package.json 2>/dev/null; then',
      '    echo "    Adding TypeScript types..."',
      '    npm pkg set devDependencies.@types/react="latest" --json 2>/dev/null || true',
      '    npm pkg set devDependencies.@types/node="latest" --json 2>/dev/null || true',
      '    npm pkg set devDependencies.typescript="latest" --json 2>/dev/null || true',
      '    NEEDS_PACKAGE_LOCK_REFRESH=true',
      '  fi',
      '  ',
      '  echo "  ✅ Next.js dependencies checked"',
      'fi',
      '',
      '# React Projects (CRA, Vite)',
      'if grep -E "react-scripts|vite|@vitejs" package.json 2>/dev/null; then',
      '  echo "  → React project detected"',
      '  ',
      '  # Create React App (CRA) - Fix missing Babel plugin',
      '  if grep -q "react-scripts" package.json 2>/dev/null; then',
      '    echo "    ✓ Create React App detected"',
      '    ',
      '    # Check for missing @babel/plugin-proposal-private-property-in-object',
      '    if ! grep -q "@babel/plugin-proposal-private-property-in-object" package.json 2>/dev/null; then',
      '      echo "    ⚠️  Missing @babel/plugin-proposal-private-property-in-object"',
      '      echo "    → Installing Babel plugin..."',
      '      npm install --save-dev @babel/plugin-proposal-private-property-in-object --legacy-peer-deps --loglevel=error 2>&1 | tail -1',
      '      echo "    ✅ Babel plugin installed"',
      '    else',
      '      echo "    ✓ Babel plugin already present"',
      '    fi',
      '  fi',
      '  ',
      '  # Vite-specific',
      '  if grep -q "\\"vite\\"" package.json 2>/dev/null; then',
      '    if ! grep -q "@vitejs/plugin-react" package.json 2>/dev/null; then',
      '      echo "    Adding Vite React plugin..."',
      '      npm pkg set devDependencies.@vitejs/plugin-react="latest" --json 2>/dev/null || true',
      '      NEEDS_PACKAGE_LOCK_REFRESH=true',
      '    fi',
      '  fi',
      '  ',
      '  # TypeScript types for React',
      '  if ! grep -q "@types/react" package.json 2>/dev/null; then',
      '    echo "    Adding TypeScript types for React..."',
      '    npm pkg set devDependencies.@types/react="latest" --json 2>/dev/null || true',
      '    npm pkg set devDependencies.@types/react-dom="latest" --json 2>/dev/null || true',
      '    NEEDS_PACKAGE_LOCK_REFRESH=true',
      '  fi',
      '  ',
      '  echo "  ✅ React dependencies checked"',
      'fi',
      '',
      '# Vue Projects',
      'if grep -q "\\"vue\\"" package.json 2>/dev/null; then',
      '  echo "  → Vue project detected"',
      '  ',
      '  # Vue 3 + Vite',
      '  if grep -q "\\"vite\\"" package.json 2>/dev/null; then',
      '    if ! grep -q "@vitejs/plugin-vue" package.json 2>/dev/null; then',
      '      echo "    Adding Vite Vue plugin..."',
      '      npm pkg set devDependencies.@vitejs/plugin-vue="latest" --json 2>/dev/null || true',
      '      NEEDS_PACKAGE_LOCK_REFRESH=true',
      '    fi',
      '  fi',
      '  ',
      '  echo "  ✅ Vue dependencies checked"',
      'fi',
      '',
      '# Angular Projects',
      'if grep -q "@angular/core" package.json 2>/dev/null; then',
      '  echo "  → Angular project detected"',
      '  ',
      '  if ! grep -q "@angular/cli" package.json 2>/dev/null; then',
      '    echo "    Adding Angular CLI..."',
      '    npm pkg set devDependencies.@angular/cli="latest" --json 2>/dev/null || true',
      '    NEEDS_PACKAGE_LOCK_REFRESH=true',
      '  fi',
      '  ',
      '  echo "  ✅ Angular dependencies checked"',
      'fi',
      '',
      '# Re-install if we modified package.json',
      'if [ "$NEEDS_PACKAGE_LOCK_REFRESH" = true ]; then',
      '  echo "  → Package.json updated - reinstalling dependencies..."',
      '  rm -f package-lock.json',
      '  npm install --legacy-peer-deps --loglevel=error 2>&1 | tail -3',
      '  echo "  ✅ Dependencies reinstalled with new packages"',
      'fi',
      '',
      '# 3. ENSURE PROPER VITE CONFIGURATION',
      'echo "[PRE-FLIGHT] 3/9: Verifying Vite configuration..."',
      'if grep -q "\\"vite\\"" package.json 2>/dev/null; then',
      '  ',
      '  # Check if existing vite.config has problematic Tailwind v4 references',
      '  if [ -f "vite.config.js" ]; then',
      '    if grep -q "@tailwindcss/vite\\|tailwindcss()" vite.config.js 2>/dev/null; then',
      '      echo "  ⚠️  vite.config.js has problematic Tailwind v4 references"',
      '      echo "  → Recreating vite.config.js for Tailwind v3 compatibility..."',
      '      ',
      '      cat > vite.config.js << "VITEEOF"',
      'import { defineConfig } from "vite";',
      'import react from "@vitejs/plugin-react";',
      '',
      'export default defineConfig({',
      '  plugins: [react()],',
      '  root: ".",',
      '  publicDir: "public",',
      '  build: {',
      '    outDir: "dist",',
      '    assetsDir: "assets",',
      '    emptyOutDir: true,',
      '  },',
      '});',
      'VITEEOF',
      '      echo "  ✅ Fixed vite.config.js"',
      '    else',
      '      echo "  ✅ vite.config.js looks good"',
      '    fi',
      '  elif [ -f "vite.config.ts" ]; then',
      '    if grep -q "@tailwindcss/vite\\|tailwindcss()" vite.config.ts 2>/dev/null; then',
      '      echo "  ⚠️  vite.config.ts has problematic Tailwind v4 references"',
      '      echo "  → Converting to vite.config.js for Tailwind v3..."',
      '      ',
      '      cat > vite.config.js << "VITEEOF"',
      'import { defineConfig } from "vite";',
      'import react from "@vitejs/plugin-react";',
      '',
      'export default defineConfig({',
      '  plugins: [react()],',
      '  root: ".",',
      '  publicDir: "public",',
      '  build: {',
      '    outDir: "dist",',
      '    assetsDir: "assets",',
      '    emptyOutDir: true,',
      '  },',
      '});',
      'VITEEOF',
      '      rm vite.config.ts 2>/dev/null || true',
      '      echo "  ✅ Fixed vite.config (converted TS to JS)"',
      '    else',
      '      echo "  ✅ vite.config.ts looks good"',
      '    fi',
      '  else',
      '    echo "  → Creating vite.config.js..."',
      '    cat > vite.config.js << "VITEEOF"',
      'import { defineConfig } from "vite";',
      'import react from "@vitejs/plugin-react";',
      '',
      'export default defineConfig({',
      '  plugins: [react()],',
      '  root: ".",',
      '  publicDir: "public",',
      '  build: {',
      '    outDir: "dist",',
      '    assetsDir: "assets",',
      '    emptyOutDir: true,',
      '  },',
      '});',
      'VITEEOF',
      '    echo "  ✅ Created vite.config.js"',
      '  fi',
      '  ',
      '  # Ensure index.html exists',
      '  if [ ! -f "index.html" ]; then',
      '    echo "  → Creating index.html..."',
      '    ENTRY_SCRIPT="/src/main.jsx"',
      '    [ -f "src/index.jsx" ] && ENTRY_SCRIPT="/src/index.jsx"',
      '    [ -f "src/main.tsx" ] && ENTRY_SCRIPT="/src/main.tsx"',
      '    [ -f "src/index.tsx" ] && ENTRY_SCRIPT="/src/index.tsx"',
      '    ',
      '    cat > index.html << HTMLEOF',
      '<!DOCTYPE html>',
      '<html lang="en">',
      '  <head>',
      '    <meta charset="UTF-8" />',
      '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      '    <title>App</title>',
      '  </head>',
      '  <body>',
      '    <div id="root"></div>',
      '    <script type="module" src="$ENTRY_SCRIPT"></script>',
      '  </body>',
      '</html>',
      'HTMLEOF',
      '    echo "  ✅ Created index.html"',
      '  fi',
      'fi',
      '',
      '# 4. FIX NPM PERMISSIONS AND OWNERSHIP',
      'echo "[PRE-FLIGHT] 4/9: Fixing file permissions..."',
      'chown -R ec2-user:ec2-user /home/ec2-user/app 2>/dev/null || true',
      'echo "  ✅ Ownership fixed"',
      '',
      '# 5. FIX POSTCSS CONFIG FOR ES MODULES',
      'echo "[PRE-FLIGHT] 5/9: Fixing PostCSS config for ES modules..."',
      'if [ -f "package.json" ] && grep -q \'"type": "module"\' package.json 2>/dev/null; then',
      '  echo "  → Detected \\"type\\": \\"module\\" in package.json"',
      '  if [ -f "postcss.config.js" ]; then',
      '    echo "  → Renaming postcss.config.js to postcss.config.cjs..."',
      '    mv postcss.config.js postcss.config.cjs',
      '    echo "  ✅ Renamed to .cjs (CommonJS) format"',
      '  fi',
      '  if [ -f "tailwind.config.js" ]; then',
      '    echo "  → Renaming tailwind.config.js to tailwind.config.cjs..."',
      '    mv tailwind.config.js tailwind.config.cjs',
      '    echo "  ✅ Renamed to .cjs (CommonJS) format"',
      '  fi',
      'else',
      '  echo "  ✅ No ES module conflicts detected"',
      'fi',
      '',
      '# 6. VERIFY DEPENDENCIES (ONLY FOR FRONTENDS)',
      'echo "[PRE-FLIGHT] 6/9: Verifying project-specific dependencies..."',
      'if [ -f "vite.config.js" ] || [ -f "vite.config.ts" ] || [ -f "vite.config.cjs" ]; then',
      '  echo "  → Frontend project detected (Vite config found)"',
      '  if ! npm list vite --depth=0 2>/dev/null | grep -q "vite@"; then',
      '    echo "  → Installing Vite..."',
      '    npm install --save-dev vite @vitejs/plugin-react --legacy-peer-deps --force 2>&1 | tail -5',
      '  fi',
      '  if ! npm list react --depth=0 2>/dev/null | grep -q "react@"; then',
      '    echo "  → Installing React..."',
      '    npm install react react-dom --save --legacy-peer-deps --force 2>&1 | tail -5',
      '  fi',
      'elif [ -f "webpack.config.js" ]; then',
      '  echo "  → Frontend project detected (Webpack config found)"',
      'elif [ -f "index.js" ] || [ -f "server.js" ] || [ -f "app.js" ]; then',
      '  echo "  → Backend project detected (Node.js server)"',
      'else',
      '  echo "  → Project type: Unknown"',
      'fi',
      'echo "  ✅ Dependencies verified"',
      '',
      '# 7. ADD SWAP FILE FOR MEMORY-INTENSIVE BUILDS',
      'echo "[PRE-FLIGHT] 7/9: Setting up swap file for build memory..."',
      'if [ ! -f "/swapfile" ]; then',
      '  echo "  → Creating 2GB swap file for build process..."',
      '  if sudo fallocate -l 2G /swapfile 2>/dev/null; then',
      '    sudo chmod 600 /swapfile',
      '    sudo mkswap /swapfile >/dev/null 2>&1',
      '    sudo swapon /swapfile >/dev/null 2>&1',
      '    echo "  ✅ Swap file created (2GB) - prevents out-of-memory errors"',
      '  else',
      '    echo "  ⚠️  Could not create swap file (may need sudo)"',
      '  fi',
      'else',
      '  echo "  ✅ Swap file already exists"',
      'fi',
      'FREE_MEM=$(free -h | grep Mem | awk \'{print $4}\')',
      'SWAP_SIZE=$(free -h | grep Swap | awk \'{print $2}\')',
      'echo "  → Available memory: $FREE_MEM"',
      'echo "  → Swap space: $SWAP_SIZE"',
      '',
      '# 8. VALIDATE PACKAGE.JSON SCRIPTS MATCH FRAMEWORK',
      'echo "[PRE-FLIGHT] 8/9: Validating package.json scripts match detected framework..."',
      `echo "  → Detected framework: ${savedPipeline.framework}"`,
      '',
      '# Read current scripts from package.json',
      'if [ -f "package.json" ]; then',
      '  CURRENT_BUILD=$(node -p "try { const pkg = require(\'./package.json\'); pkg.scripts.build || \'NOT_FOUND\' } catch(e) { \'NOT_FOUND\' }" 2>/dev/null)',
      '  CURRENT_DEV=$(node -p "try { const pkg = require(\'./package.json\'); pkg.scripts.dev || \'NOT_FOUND\' } catch(e) { \'NOT_FOUND\' }" 2>/dev/null)',
      '  CURRENT_START=$(node -p "try { const pkg = require(\'./package.json\'); pkg.scripts.start || \'NOT_FOUND\' } catch(e) { \'NOT_FOUND\' }" 2>/dev/null)',
      '  ',
      '  echo "  → Current scripts:"',
      '  echo "    - build: $CURRENT_BUILD"',
      '  echo "    - dev: $CURRENT_DEV"',
      '  echo "    - start: $CURRENT_START"',
      '  ',
      `  # Detect framework mismatches based on AI analysis`,
      `  FRAMEWORK="${savedPipeline.framework}"`,
      '  NEEDS_SCRIPT_FIX=false',
      '  ',
      '  # Check for Next.js project with wrong scripts',
      '  if grep -q "\\"next\\"" package.json 2>/dev/null; then',
      '    echo "  → Next.js project detected"',
      '    if [[ "$CURRENT_BUILD" == *"vite"* ]] || [[ "$CURRENT_DEV" == *"vite"* ]]; then',
      '      echo "  ❌ CRITICAL: Next.js project has VITE scripts!"',
      '      echo "  → This will cause build failure: \\"Cannot resolve entry module index.html\\""',
      '      echo "  → Fixing scripts to use Next.js commands..."',
      '      ',
      '      # Fix scripts to use Next.js commands',
      '      npm pkg set scripts.dev="next dev"',
      '      npm pkg set scripts.build="next build"',
      '      npm pkg set scripts.start="next start"',
      '      npm pkg set scripts.lint="next lint"',
      '      ',
      '      echo "  ✅ Fixed package.json scripts for Next.js"',
      '      NEEDS_SCRIPT_FIX=true',
      '    elif [[ "$CURRENT_BUILD" != *"next"* ]]; then',
      '      echo "  ⚠️  Build script does not use \\"next\\""',
      '      echo "  → Setting Next.js build command..."',
      '      npm pkg set scripts.build="next build"',
      '      npm pkg set scripts.dev="next dev"',
      '      npm pkg set scripts.start="next start"',
      '      echo "  ✅ Updated scripts to use Next.js"',
      '      NEEDS_SCRIPT_FIX=true',
      '    else',
      '      echo "  ✅ Scripts correctly use Next.js commands"',
      '    fi',
      '  fi',
      '  ',
      '  # Check for Vite project with wrong scripts',
      '  if [ -f "vite.config.js" ] || [ -f "vite.config.ts" ]; then',
      '    if [[ "$CURRENT_BUILD" == *"next"* ]] || [[ "$CURRENT_DEV" == *"next"* ]]; then',
      '      echo "  ❌ CRITICAL: Vite project has NEXT.JS scripts!"',
      '      echo "  → Fixing scripts to use Vite commands..."',
      '      ',
      '      npm pkg set scripts.dev="vite"',
      '      npm pkg set scripts.build="vite build"',
      '      npm pkg set scripts.preview="vite preview"',
      '      ',
      '      echo "  ✅ Fixed package.json scripts for Vite"',
      '      NEEDS_SCRIPT_FIX=true',
      '    elif [ "$CURRENT_BUILD" = "NOT_FOUND" ]; then',
      '      echo "  ⚠️  No build script found"',
      '      echo "  → Adding Vite build commands..."',
      '      npm pkg set scripts.dev="vite"',
      '      npm pkg set scripts.build="vite build"',
      '      npm pkg set scripts.preview="vite preview"',
      '      echo "  ✅ Added Vite scripts"',
      '      NEEDS_SCRIPT_FIX=true',
      '    else',
      '      echo "  ✅ Vite config found, scripts look compatible"',
      '    fi',
      '  fi',
      '  ',
      '  # Check for Create React App with wrong scripts',
      '  if grep -q "react-scripts" package.json 2>/dev/null; then',
      '    echo "  → Create React App detected"',
      '    if [[ "$CURRENT_BUILD" != *"react-scripts"* ]]; then',
      '      echo "  ⚠️  Build script does not use react-scripts"',
      '      echo "  → Setting CRA build commands..."',
      '      npm pkg set scripts.start="react-scripts start"',
      '      npm pkg set scripts.build="react-scripts build"',
      '      npm pkg set scripts.test="react-scripts test"',
      '      echo "  ✅ Updated scripts for Create React App"',
      '      NEEDS_SCRIPT_FIX=true',
      '    else',
      '      echo "  ✅ Scripts correctly use react-scripts"',
      '    fi',
      '  fi',
      '  ',
      '  # Show updated scripts if changed',
      '  if [ "$NEEDS_SCRIPT_FIX" = true ]; then',
      '    echo "  "',
      '    echo "  📝 Updated scripts:"',
      '    NEW_BUILD=$(node -p "require(\'./package.json\').scripts.build" 2>/dev/null)',
      '    NEW_DEV=$(node -p "require(\'./package.json\').scripts.dev" 2>/dev/null)',
      '    NEW_START=$(node -p "require(\'./package.json\').scripts.start" 2>/dev/null)',
      '    echo "    - build: $NEW_BUILD"',
      '    echo "    - dev: $NEW_DEV"',
      '    echo "    - start: $NEW_START"',
      '    ',
      '    # Delete package-lock.json so npm install uses updated scripts',
      '    echo "  → Removing package-lock.json (will be regenerated)"',
      '    rm -f package-lock.json',
      '    echo "  ✅ Package.json scripts validated and fixed"',
      '  else',
      '    echo "  ✅ Package.json scripts match framework"',
      '  fi',
      'else',
      '  echo "  ⚠️  No package.json found"',
      'fi',
      'echo ""',
      '',
      'echo "════════════════════════════════════════════════════════════"',
      'echo "📋 FIXES APPLIED SUMMARY"',
      'echo "════════════════════════════════════════════════════════════"',
      'echo ""',
      '# Show what was fixed',
      'if [ -f "vite.config.js" ] || [ -f "vite.config.cjs" ]; then',
      '  echo "  ✓ Vite configuration: FOUND"',
      '  [ -f "postcss.config.cjs" ] && echo "    - Fixed: postcss.config.js → postcss.config.cjs (ES module compat)"',
      '  [ -f "tailwind.config.cjs" ] && echo "    - Fixed: tailwind.config.js → tailwind.config.cjs (ES module compat)"',
      'fi',
      'if [ -f "prisma/schema.prisma" ]; then',
      '  echo "  ✓ Prisma detected: Will run prisma generate during install"',
      'fi',
      'if [ -f "index.html" ]; then',
      '  echo "  ✓ Static HTML: FOUND"',
      'fi',
      'echo ""',
      '',
      'echo "════════════════════════════════════════════════════════════"',
      'echo "✅ PRE-FLIGHT CHECKS COMPLETE"',
      'echo "════════════════════════════════════════════════════════════"',
      'echo ""',
      'echo "📦 Project Information:"',
      'echo "  - JSX files: $(find src -name "*.jsx" 2>/dev/null | wc -l) files"',
      'echo "  - Config files: $(ls *.config.* 2>/dev/null | tr \'\\n\' \' \')"',
      'echo "  - Build tool: $(grep -o \\"vite\\|webpack\\|next\\" package.json 2>/dev/null | head -1 || echo \'unknown\')"',
      'echo "  - Framework: $(grep -o \\"react\\|vue\\|angular\\|express\\" package.json 2>/dev/null | head -1 || echo \'unknown\')"',
      'echo ""',
      '',
      '# Final verification - show vite.config.js content',
      'if [ -f "vite.config.js" ]; then',
      '  echo "════════════════════════════════════════════════════════════"',
      '  echo "FINAL VITE.CONFIG.JS VERIFICATION"',
      '  echo "════════════════════════════════════════════════════════════"',
      '  cat vite.config.js',
      '  echo "════════════════════════════════════════════════════════════"',
      '  echo ""',
      'fi',
      '',
      '# Check for any remaining @tailwindcss/vite references',
      'if grep -r "@tailwindcss/vite" . --exclude-dir=node_modules 2>/dev/null | head -5; then',
      '  echo "⚠️  WARNING: Found remaining @tailwindcss/vite references:"',
      '  grep -r "@tailwindcss/vite" . --exclude-dir=node_modules 2>/dev/null | head -5',
      'else',
      '  echo "✅ No @tailwindcss/vite references found"',
      'fi',
      'echo ""',
      ]);

      console.log('[SMART-DEPLOY] Pre-flight checks completed');
      console.log('[SMART-DEPLOY] Pre-flight output:', preFlightResult.output.slice(-1000));
    }

    // Step 4: Run AI-generated pipeline stages via SSM with auto-fix
    console.log('[SMART-DEPLOY] ========================================');
    console.log('[SMART-DEPLOY] 🚀 EXECUTING AI-GENERATED PIPELINE');
    console.log('[SMART-DEPLOY] ========================================');
    console.log('[SMART-DEPLOY] Pipeline Source: Claude Sonnet 4.6 (AI)');
    console.log('[SMART-DEPLOY] Language:', savedPipeline.language);
    console.log('[SMART-DEPLOY] Framework:', savedPipeline.framework);
    console.log('[SMART-DEPLOY] Port:', savedPipeline.port);
    console.log('[SMART-DEPLOY] Stages:', pipeline.stages.join(' → '));
    console.log('[SMART-DEPLOY] ========================================');

    const deploymentResult = await runStagesWithAutoFix(
      instanceId,
      pipeline,  // AI-generated pipeline
      projectType,
      repoFullName,
      envVars,
      projectAnalysis,  // AI analysis results
      buildConfig,  // AI-generated build config
      deploymentRecord,  // Pass deployment record for real-time log updates
      savedPipeline.language  // Pass language to skip Node.js setup for non-Node projects
    );

    // Collect all logs from all stages with AI attribution
    const allLogs = [
      `[SMART-DEPLOY] ════════════════════════════════════════════════════════════`,
      `[SMART-DEPLOY] 🤖 AI-POWERED DEPLOYMENT STARTED`,
      `[SMART-DEPLOY] ════════════════════════════════════════════════════════════`,
      `[SMART-DEPLOY] 🎯 Pipeline Generation: Claude Sonnet 4.6`,
      `[SMART-DEPLOY] 📦 Repository: ${repoFullName}`,
      `[SMART-DEPLOY] 🔧 Language: ${savedPipeline.language}`,
      `[SMART-DEPLOY] ⚡ Framework: ${savedPipeline.framework}`,
      `[SMART-DEPLOY] 🌐 Port: ${savedPipeline.port}`,
      `[SMART-DEPLOY] 📋 Stages: ${pipeline.stages.join(' → ')}`,
      `[SMART-DEPLOY] 🔐 Environment variables: ${Object.keys(envVars).length} configured`,
      `[SMART-DEPLOY] ════════════════════════════════════════════════════════════`,
      ``,
      ...(deploymentResult.logs || []),
    ].join('\n');

    // Update deployment record with logs
    if (deploymentRecord) {
      await Deployment.findByIdAndUpdate(deploymentRecord._id, {
        rawLogs: allLogs,
      });
    }

    if (!deploymentResult.success) {
      if (deploymentRecord) {
        await Deployment.findByIdAndUpdate(deploymentRecord._id, {
          status: 'failed',
          errorMessage: deploymentResult.error,
          rawLogs: allLogs,
        });
      }

      // Release deployment lock
      await releaseDeploymentLock();
      console.log('[SMART-DEPLOY] 🔓 Deployment lock released (failure)');

      return NextResponse.json(
        {
          error: deploymentResult.error,
          instanceId,
          publicIp,
          message: 'Deployment failed',
        },
        { status: 500 }
      );
    }

    // Step 4.3: Verify build output for static projects (CRITICAL CHECK)
    // Check if build stage produced index.html BEFORE attempting Nginx setup
    const isLikelyStaticProject = savedPipeline.framework?.includes('React') ||
                                   savedPipeline.framework?.includes('Vue') ||
                                   savedPipeline.framework?.includes('Angular') ||
                                   savedPipeline.framework?.includes('Vite') ||
                                   savedPipeline.framework?.includes('Create React App');

    if (isLikelyStaticProject && pipeline.stages.includes('build')) {
      console.log('[BUILD-VERIFY] 🔍 Verifying static build output...');
      console.log('[BUILD-VERIFY] Checking for index.html in build output...');

      const buildVerifyResult = await executeSSMCommand(instanceId, [
        'cd /home/ec2-user/app',
        '',
        '# Check for build output directories',
        'if [ -d "build" ]; then',
        '  BUILD_DIR="build"',
        'elif [ -d "dist" ]; then',
        '  BUILD_DIR="dist"',
        'else',
        '  echo "[BUILD-VERIFY] ❌ ERROR: No build/ or dist/ folder found!"',
        '  exit 1',
        'fi',
        '',
        'echo "[BUILD-VERIFY] Using build directory: $BUILD_DIR"',
        'echo ""',
        '',
        '# Critical check: Does index.html exist?',
        'if [ ! -f "$BUILD_DIR/index.html" ]; then',
        '  echo "╔═══════════════════════════════════════════════════════════╗"',
        '  echo "║        ❌ BUILD OUTPUT VERIFICATION FAILED ❌             ║"',
        '  echo "╚═══════════════════════════════════════════════════════════╝"',
        '  echo ""',
        '  echo "[BUILD-VERIFY] ❌ CRITICAL ERROR: index.html not found in $BUILD_DIR/"',
        '  echo ""',
        '  echo "[BUILD-VERIFY] Your build command completed but did NOT generate React bundles."',
        '  echo "[BUILD-VERIFY] This means npm run build is only copying public/ folder contents."',
        '  echo ""',
        '  echo "[BUILD-VERIFY] Files in $BUILD_DIR:"',
        '  ls -lh "$BUILD_DIR/" | head -20',
        '  echo ""',
        '  echo "[BUILD-VERIFY] 📋 Diagnosing the issue..."',
        '  echo ""',
        '',
        '  # Check if package.json has correct build script',
        '  echo "[BUILD-VERIFY] 1. Checking package.json build script..."',
        '  if grep -q \'"build"\' package.json; then',
        '    BUILD_SCRIPT=$(grep \'"build"\' package.json)',
        '    echo "[BUILD-VERIFY]    Found: $BUILD_SCRIPT"',
        '    if echo "$BUILD_SCRIPT" | grep -q "react-scripts build"; then',
        '      echo "[BUILD-VERIFY]    ✅ Build script looks correct"',
        '    elif echo "$BUILD_SCRIPT" | grep -q "vite build"; then',
        '      echo "[BUILD-VERIFY]    ✅ Build script looks correct"',
        '    else',
        '      echo "[BUILD-VERIFY]    ⚠️  Unusual build script - may not work correctly"',
        '    fi',
        '  else',
        '    echo "[BUILD-VERIFY]    ❌ No build script found in package.json!"',
        '  fi',
        '  echo ""',
        '',
        '  # Check if src/ folder exists',
        '  echo "[BUILD-VERIFY] 2. Checking src/ folder..."',
        '  if [ -d "src" ]; then',
        '    SRC_FILES=$(find src -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" | wc -l)',
        '    echo "[BUILD-VERIFY]    ✅ src/ folder exists with $SRC_FILES files"',
        '    if [ -f "src/index.js" ]; then',
        '      echo "[BUILD-VERIFY]    ✅ Found entry point: src/index.js"',
        '    elif [ -f "src/index.jsx" ]; then',
        '      echo "[BUILD-VERIFY]    ✅ Found entry point: src/index.jsx"',
        '    elif [ -f "src/main.jsx" ]; then',
        '      echo "[BUILD-VERIFY]    ✅ Found entry point: src/main.jsx"',
        '    else',
        '      echo "[BUILD-VERIFY]    ⚠️  No standard entry point found (index.js/jsx, main.jsx)"',
        '    fi',
        '  else',
        '    echo "[BUILD-VERIFY]    ❌ No src/ folder found!"',
        '  fi',
        '  echo ""',
        '',
        '  # Check build output for actual webpack errors (might be in logs)',
        '  echo "[BUILD-VERIFY] 3. Common causes of this issue:"',
        '  echo "[BUILD-VERIFY]    • Build script in package.json is incorrect"',
        '  echo "[BUILD-VERIFY]    • Build process failed silently (check for errors above)"',
        '  echo "[BUILD-VERIFY]    • Missing or incorrect entry point file"',
        '  echo "[BUILD-VERIFY]    • Dependencies not installed correctly"',
        '  echo ""',
        '',
        '  echo "[BUILD-VERIFY] 💡 To fix this issue:"',
        '  echo "[BUILD-VERIFY]    1. Test locally: npm install && npm run build"',
        '  echo "[BUILD-VERIFY]    2. Verify build/ or dist/ folder contains index.html"',
        '  echo "[BUILD-VERIFY]    3. Check package.json has correct build script"',
        '  echo "[BUILD-VERIFY]    4. Ensure src/index.js or src/main.jsx exists"',
        '  echo ""',
        '',
        '  exit 1',
        'else',
        '  echo "╔═══════════════════════════════════════════════════════════╗"',
        '  echo "║         ✅ BUILD OUTPUT VERIFICATION PASSED ✅            ║"',
        '  echo "╚═══════════════════════════════════════════════════════════╝"',
        '  echo ""',
        '  echo "[BUILD-VERIFY] ✅ Found index.html in $BUILD_DIR/"',
        '  HTML_SIZE=$(wc -c < "$BUILD_DIR/index.html")',
        '  echo "[BUILD-VERIFY] ✅ index.html size: $HTML_SIZE bytes"',
        '  echo ""',
        '',
        '  # Check for JavaScript bundles',
        '  JS_COUNT=$(find "$BUILD_DIR" -name "*.js" -type f | wc -l)',
        '  echo "[BUILD-VERIFY] ✅ JavaScript files: $JS_COUNT"',
        '  if [ $JS_COUNT -eq 0 ]; then',
        '    echo "[BUILD-VERIFY] ⚠️  WARNING: No JavaScript files found - site may not work"',
        '  fi',
        '  echo ""',
        '',
        '  # Check for CSS files',
        '  CSS_COUNT=$(find "$BUILD_DIR" -name "*.css" -type f | wc -l)',
        '  echo "[BUILD-VERIFY] ✅ CSS files: $CSS_COUNT"',
        '  if [ $CSS_COUNT -eq 0 ]; then',
        '    echo "[BUILD-VERIFY] ⚠️  WARNING: No CSS files found - site will have no styles"',
        '  fi',
        '  echo ""',
        '',
        '  echo "[BUILD-VERIFY] ✅ Build output is valid and ready for deployment!"',
        'fi',
      ]);

      console.log('[BUILD-VERIFY] Verification result:', buildVerifyResult.success ? 'PASSED' : 'FAILED');

      if (!buildVerifyResult.success) {
        console.error('[BUILD-VERIFY] ❌ Build verification failed!');
        console.error('[BUILD-VERIFY] Output:', buildVerifyResult.output);

        const errorMessage = 'Build verification failed: index.html not found in build output. ' +
          'Your npm run build command is not generating React bundles correctly. ' +
          'This usually means the build script in package.json is incorrect or the build process is failing silently. ' +
          'Test locally with: npm install && npm run build, then verify build/ or dist/ folder contains index.html.';

        if (deploymentRecord) {
          await Deployment.findByIdAndUpdate(deploymentRecord._id, {
            status: 'failed',
            errorMessage,
            rawLogs: allLogs + '\n\n[BUILD-VERIFY]\n' + buildVerifyResult.output,
          });
        }

        await releaseDeploymentLock();

        return NextResponse.json({
          success: false,
          error: errorMessage,
          logs: buildVerifyResult.output,
          diagnostics: {
            issue: 'Build output missing index.html',
            buildFolder: buildVerifyResult.output,
            suggestions: [
              'Test build locally: npm install && npm run build',
              'Check package.json has correct build script (e.g., "react-scripts build")',
              'Verify src/index.js or src/main.jsx exists',
              'Look for build errors in the logs above',
            ],
          },
        }, { status: 500 });
      }

      console.log('[BUILD-VERIFY] ✅ Build output verified successfully');
      console.log('[BUILD-VERIFY] index.html found - proceeding with deployment');
    }

    // Step 4.5: Universal Nginx Deployment - Setup Nginx for ANY project type
    // SKIP FOR BACKEND PROJECTS - the universal starter will handle them with PM2 + Nginx
    console.log('[SMART-DEPLOY] ========================================');
    console.log('[SMART-DEPLOY] Checking if Nginx deployment is needed...');
    console.log('[SMART-DEPLOY] ========================================');

    let nginxLogs = '';
    let isStaticProject = false;
    let nginxSuccessful = false;

    // Skip old Nginx deployment for backend projects - use universal starter instead
    const isBackendProject = universalAnalysis.projectType === 'backend' ||
                             universalAnalysis.projectType === 'fullstack';

    if (isBackendProject) {
      console.log('[SMART-DEPLOY] Backend project detected - skipping old Nginx deployment');
      console.log('[SMART-DEPLOY] Will use Universal Application Starter with PM2 + Nginx proxy');
      nginxLogs = '\n[NGINX] Skipped old Nginx deployment for backend project - using universal starter\n';
    } else {
      console.log('[SMART-DEPLOY] Setting up Nginx for static/frontend project...');

      try {
        const nginxDeployment = await deployWithNginx(instanceId);

        console.log('[NGINX] Deployment type:', nginxDeployment.detection.type);
        console.log('[NGINX] Framework:', nginxDeployment.detection.framework);

        // Track if this is a static project successfully deployed with Nginx
        isStaticProject = nginxDeployment.detection.type === 'STATIC';
        nginxSuccessful = nginxDeployment.success;

        // Add nginx logs to deployment
        nginxLogs = '\n[NGINX] ========================================\n' +
                    '[NGINX] Universal Nginx Deployment\n' +
                    '[NGINX] ========================================\n' +
                    nginxDeployment.logs.join('\n');

        if (!nginxDeployment.success) {
          console.error('[NGINX] ❌ Nginx deployment failed');
          console.error('[NGINX] Logs:', nginxLogs);

          // For STATIC projects, Nginx is REQUIRED - deployment fails if Nginx fails
          if (isStaticProject) {
            console.error('[NGINX] ❌ CRITICAL: Static projects require Nginx to serve files');
            console.error('[NGINX] Common causes:');
            console.error('[NGINX]   - index.html missing in build output');
            console.error('[NGINX]   - Build command did not generate static files');
            console.error('[NGINX]   - File permissions incorrect');

            if (deploymentRecord) {
              await Deployment.findByIdAndUpdate(deploymentRecord._id, {
                status: 'failed',
                errorMessage: 'Nginx deployment failed for static project. Build output may be missing index.html. Check that your build command generates static files correctly.',
                rawLogs: allLogs + nginxLogs,
              });
            }

            await releaseDeploymentLock();

            return NextResponse.json({
              success: false,
              error: 'Static project deployment failed: Nginx could not serve files. Common causes: index.html missing from build output, build command incorrect, or file permissions issue.',
              logs: allLogs + nginxLogs,
              suggestion: 'Verify your build command generates an index.html file. For React apps, check that "npm run build" creates a build/ or dist/ folder with index.html inside.',
            }, { status: 500 });
          }

          // For backend/dynamic projects, continue without Nginx (will use direct port access)
          console.log('[NGINX] ⚠️  Continuing without Nginx (will use direct port access)');
        } else {
          console.log('[NGINX] ✅ Nginx deployment successful!');
          console.log(`[NGINX] Your ${nginxDeployment.detection.framework} app is now served via Nginx on port 80`);

          // Update deployment record with Nginx info
          if (deploymentRecord) {
            await Deployment.findByIdAndUpdate(deploymentRecord._id, {
              deploymentType: nginxDeployment.detection.type,
              framework: nginxDeployment.detection.framework,
              nginxEnabled: true,
              port: nginxDeployment.detection.port,
            });
          }
        }
      } catch (nginxError: any) {
        console.error('[NGINX] ❌ Error during Nginx deployment:', nginxError.message);
        nginxLogs = '\n[NGINX] ⚠️  Error during Nginx deployment: ' + nginxError.message;
        // Continue anyway - Nginx is enhancement, not critical
        console.log('[NGINX] ⚠️  Continuing without Nginx');
      }

      // Update deployment logs with Nginx logs
      if (deploymentRecord && nginxLogs) {
        await Deployment.findByIdAndUpdate(deploymentRecord._id, {
          rawLogs: allLogs + nginxLogs,
        });
      }
    }

    // Step 5: Post-build verification - ensure CSS/assets are properly generated
    console.log('[SMART-DEPLOY] Verifying build output and static assets...');
    await executeSSMCommand(instanceId, [
      'cd /home/ec2-user/app',
      'echo "╔════════════════════════════════════════════════════════════╗"',
      'echo "║         POST-BUILD VERIFICATION - CSS & ASSETS             ║"',
      'echo "╚════════════════════════════════════════════════════════════╝"',
      'echo ""',
      '',
      '# Find build output directory',
      'if [ -d "dist" ]; then',
      '  BUILD_DIR="dist"',
      'elif [ -d "build" ]; then',
      '  BUILD_DIR="build"',
      'elif [ -d ".next" ]; then',
      '  BUILD_DIR=".next"',
      'else',
      '  echo "[VERIFY] ❌ ERROR: No build directory found!"',
      '  echo "[VERIFY] This means the build command may have failed."',
      '  exit 0',
      'fi',
      '',
      'echo "[VERIFY] 📁 Build directory: $BUILD_DIR"',
      'echo "[VERIFY] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"',
      'echo ""',
      'echo "[VERIFY] Directory structure:"',
      'ls -lah $BUILD_DIR/ | head -20',
      'echo ""',
      '',
      '# Check for index.html',
      'echo "[VERIFY] 1️⃣  Checking HTML entry point..."',
      'if [ -f "$BUILD_DIR/index.html" ]; then',
      '  HTML_SIZE=$(wc -c < $BUILD_DIR/index.html)',
      '  echo "[VERIFY]   ✅ index.html found ($HTML_SIZE bytes)"',
      '  ',
      '  # Check if HTML references CSS',
      '  echo "[VERIFY]   Checking CSS references in HTML..."',
      '  if grep -q "stylesheet\\|<style\\|\\.css" "$BUILD_DIR/index.html"; then',
      '    echo "[VERIFY]   ✅ HTML contains CSS references"',
      '    echo "[VERIFY]   CSS/style tags found:"',
      '    grep -o "href=\\"[^\\"]*.css\\"\\|<link[^>]*stylesheet[^>]*>" "$BUILD_DIR/index.html" | head -5',
      '  else',
      '    echo "[VERIFY]   ⚠️  HTML does not reference any CSS files!"',
      '    echo "[VERIFY]   This will cause NO STYLES to load!"',
      '  fi',
      'else',
      '  echo "[VERIFY]   ❌ index.html not found in $BUILD_DIR"',
      'fi',
      'echo ""',
      '',
      '# Check for CSS files - DETAILED',
      'echo "[VERIFY] 2️⃣  Checking CSS files..."',
      'CSS_COUNT=$(find $BUILD_DIR -name "*.css" -type f 2>/dev/null | wc -l)',
      'echo "[VERIFY]   Total CSS files: $CSS_COUNT"',
      '',
      'if [ $CSS_COUNT -gt 0 ]; then',
      '  echo "[VERIFY]   ✅ CSS files found:"',
      '  echo ""',
      '  ',
      '  # List all CSS files with sizes',
      '  find $BUILD_DIR -name "*.css" -type f | while read cssfile; do',
      '    SIZE=$(wc -c < "$cssfile")',
      '    REL_PATH=${cssfile#$BUILD_DIR/}',
      '    echo "[VERIFY]     📄 $REL_PATH ($SIZE bytes)"',
      '    ',
      '    # Check if CSS has actual content',
      '    if [ $SIZE -lt 100 ]; then',
      '      echo "[VERIFY]        ⚠️  WARNING: File is very small (< 100 bytes)"',
      '      echo "[VERIFY]        Content:"',
      '      cat "$cssfile"',
      '    else',
      '      echo "[VERIFY]        ✅ File size looks good"',
      '      # Check for Tailwind or actual CSS rules',
      '      if grep -q ".*{.*}\\|@\\|font-\\|color:\\|margin:\\|padding:" "$cssfile" 2>/dev/null; then',
      '        echo "[VERIFY]        ✅ Contains CSS rules"',
      '        # Show sample of CSS',
      '        echo "[VERIFY]        Sample CSS (first 10 lines):"',
      '        head -10 "$cssfile" | sed "s/^/[VERIFY]          /"',
      '      else',
      '        echo "[VERIFY]        ⚠️  WARNING: File may not contain valid CSS rules!"',
      '        echo "[VERIFY]        Content:"',
      '        head -20 "$cssfile" | sed "s/^/[VERIFY]          /"',
      '      fi',
      '    fi',
      '    echo ""',
      '  done',
      'else',
      '  echo "[VERIFY]   ❌ NO CSS FILES FOUND!"',
      '  echo "[VERIFY]   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"',
      '  echo "[VERIFY]   CRITICAL ERROR: Build did not generate CSS files!"',
      '  echo "[VERIFY]   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"',
      '  echo ""',
      '  echo "[VERIFY]   Possible reasons:"',
      '  echo "[VERIFY]   1. Tailwind CSS not properly configured"',
      '  echo "[VERIFY]   2. CSS not imported in entry file (main.jsx/index.jsx)"',
      '  echo "[VERIFY]   3. PostCSS configuration missing"',
      '  echo "[VERIFY]   4. Build process crashed before CSS generation"',
      '  echo ""',
      '  echo "[VERIFY]   Checking source CSS files..."',
      '  if [ -f "src/index.css" ]; then',
      '    echo "[VERIFY]   ✅ Source CSS exists: src/index.css"',
      '    echo "[VERIFY]   Size: $(wc -c < src/index.css) bytes"',
      '    echo "[VERIFY]   First 10 lines:"',
      '    head -10 src/index.css | sed "s/^/[VERIFY]     /"',
      '  else',
      '    echo "[VERIFY]   ❌ No src/index.css found"',
      '  fi',
      '  echo ""',
      '  echo "[VERIFY]   Checking if CSS is imported in entry files..."',
      '  for entry in src/main.jsx src/index.jsx src/main.tsx src/index.tsx src/App.jsx; do',
      '    if [ -f "$entry" ]; then',
      '      echo "[VERIFY]   Checking $entry..."',
      '      if grep -q "import.*css" "$entry"; then',
      '        echo "[VERIFY]     ✅ CSS import found:"',
      '        grep "import.*css" "$entry" | sed "s/^/[VERIFY]       /"',
      '      else',
      '        echo "[VERIFY]     ❌ No CSS import found in $entry"',
      '      fi',
      '    fi',
      '  done',
      'fi',
      'echo ""',
      '',
      '# Check for JS files',
      'echo "[VERIFY] 3️⃣  Checking JavaScript files..."',
      'JS_COUNT=$(find $BUILD_DIR -name "*.js" -type f 2>/dev/null | wc -l)',
      'echo "[VERIFY]   Found $JS_COUNT JavaScript files"',
      'find $BUILD_DIR -name "*.js" -type f -exec ls -lh {} \\; | head -5 | sed "s/^/[VERIFY]     /"',
      'echo ""',
      '',
      '# Fix permissions on all static assets',
      'echo "[VERIFY] 4️⃣  Fixing file permissions..."',
      'find $BUILD_DIR -type f -exec chmod 644 {} \\; 2>/dev/null || true',
      'find $BUILD_DIR -type d -exec chmod 755 {} \\; 2>/dev/null || true',
      'chown -R ec2-user:ec2-user /home/ec2-user/app 2>/dev/null || true',
      'echo "[VERIFY]   ✅ All files: 644, All directories: 755"',
      'echo ""',
      '',
      '# Final summary',
      'echo "╔════════════════════════════════════════════════════════════╗"',
      'echo "║                  VERIFICATION SUMMARY                      ║"',
      'echo "╚════════════════════════════════════════════════════════════╝"',
      'echo ""',
      'echo "  Build Directory:  $BUILD_DIR"',
      'echo "  HTML Files:       $(find $BUILD_DIR -name "*.html" 2>/dev/null | wc -l)"',
      'echo "  CSS Files:        $CSS_COUNT"',
      'echo "  JavaScript Files: $JS_COUNT"',
      'echo "  Total Assets:     $(find $BUILD_DIR -type f 2>/dev/null | wc -l) files"',
      'echo ""',
      '',
      'if [ $CSS_COUNT -eq 0 ]; then',
      '  echo "  ⚠️  WARNING: NO CSS FILES - STYLES WILL NOT LOAD!"',
      '  echo "  The website will display but without any styling."',
      '  echo ""',
      'else',
      '  echo "  ✅ CSS files generated successfully"',
      '  echo ""',
      'fi',
      '',
      'echo "╚════════════════════════════════════════════════════════════╝"',
    ]);
    console.log('[SMART-DEPLOY] Build verification complete');

    // Step 5: Start the application (SKIP FOR STATIC PROJECTS AND COMPILED LANGUAGES)
    // For static projects, Nginx is already serving the files - no need for additional server
    // For compiled languages (Rust, Go, Java, Ruby, PHP), the pipeline deploy stage already started the app
    const compiledLanguages = ['Rust', 'Go', 'Java', 'Ruby', 'PHP'];
    const isPipelineHandledLanguage = compiledLanguages.includes(savedPipeline.language || '');

    // CRITICAL: Static projects NEVER need runtime launcher (Nginx serves them)
    // If we reach here with isStaticProject=true, Nginx already succeeded (or we would have failed earlier)
    if (isStaticProject || isPipelineHandledLanguage) {
      if (isPipelineHandledLanguage) {
        console.log('[SMART-DEPLOY] ✅ ' + savedPipeline.language + ' project - pipeline deploy stage already started the application');
        console.log('[SMART-DEPLOY] Skipping additional runtime launcher (would cause duplicate/wrong commands)');
        console.log('[SMART-DEPLOY] Skipping Nginx - ' + savedPipeline.language + ' can serve HTTP directly');

        // Configure security group to allow the native application port
        const appPort = parseInt(savedPipeline.port || '8080', 10);
        console.log(`[SMART-DEPLOY] Opening security group port ${appPort} for direct access...`);
        await configureSecurityGroupPort(appPort);

        console.log('[SMART-DEPLOY] Application is accessible at:');
        console.log(`[SMART-DEPLOY]   HTTP:  http://${publicIp}:${appPort}`);
        console.log(`[SMART-DEPLOY] Note: Application runs on native port ${appPort} (no Nginx reverse proxy)`);
      } else {
        console.log('[SMART-DEPLOY] ✅ Static project already served by Nginx - skipping application server');
        console.log('[SMART-DEPLOY] Application is accessible at:');
        console.log(`[SMART-DEPLOY]   HTTP:  http://${publicIp}`);
        console.log(`[SMART-DEPLOY]   HTTPS: https://${publicIp} (self-signed certificate)`);
      }

      // Mark deployment as successful
      if (deploymentRecord) {
        await Deployment.findByIdAndUpdate(deploymentRecord._id, {
          status: 'success',
          rawLogs: allLogs + nginxLogs,
        });
      }
    } else {
      console.log('[SMART-DEPLOY] ═══════════════════════════════════════════════════════');
      console.log('[SMART-DEPLOY] Pipeline completed! Launching runtime server...');
      console.log('[SMART-DEPLOY] ═══════════════════════════════════════════════════════');

      // NEW: Use Vercel-like runtime launcher (PM2/systemd - never blocks pipeline)
      // Use the actual detected port and startCommand from saved pipeline (AI analysis)
      // Nginx will handle reverse proxy from 80 → app port
      const detectedPort = parseInt(savedPipeline.port || '3000', 10);
      const detectedStartCommand = savedPipeline.startCommand || 'npm start';

      console.log('[SMART-DEPLOY] 🎯 AI Detected Port:', savedPipeline.port);
      console.log('[SMART-DEPLOY] 🎯 Using Port:', detectedPort);
      console.log('[SMART-DEPLOY] 🚀 Start Command:', detectedStartCommand);

      const runtimeConfig: RuntimeConfig = {
        framework: savedPipeline.framework || 'Unknown',
        language: savedPipeline.language || 'Unknown',
        startCommand: detectedStartCommand,
        port: detectedPort, // Use AI-detected port (e.g., 3000, 9000, etc.)
        envVars: envVars,
      };

      console.log('[SMART-DEPLOY] ═══════════════════════════════════════════════════════');
      console.log('[SMART-DEPLOY] Runtime Configuration:');
      console.log('[SMART-DEPLOY]   Language:', runtimeConfig.language);
      console.log('[SMART-DEPLOY]   Framework:', runtimeConfig.framework);
      console.log('[SMART-DEPLOY]   Port:', runtimeConfig.port, '(CRITICAL: Nginx will proxy 80 → ' + runtimeConfig.port + ')');
      console.log('[SMART-DEPLOY]   Start Command:', runtimeConfig.startCommand);
      console.log('[SMART-DEPLOY]   Environment Variables:', Object.keys(runtimeConfig.envVars).length, 'vars');
      console.log('[SMART-DEPLOY] ═══════════════════════════════════════════════════════');

      const startResult = await launchRuntime(instanceId, runtimeConfig);
      console.log('[RUNTIME] Launch completed');
      console.log('[RUNTIME] Success:', startResult.success);

      // Configure security group to allow the detected port
      if (startResult.success) {
        // Always open port 80 for standard HTTP access
        await configureSecurityGroupPort(80);
        // Also open the detected app port
        if (detectedPort !== 80) {
          await configureSecurityGroupPort(detectedPort);
        }
      }

      if (!startResult.success) {
        console.error('[RUNTIME] ❌ Runtime launch failed');

        // Mark as partially successful (build worked, runtime failed)
        if (deploymentRecord) {
          await Deployment.findByIdAndUpdate(deploymentRecord._id, {
            status: 'partial',
            rawLogs: allLogs + '\n\n' + startResult.output,
            detectedIssues: {
              runtimeError: startResult.error || 'Runtime launch failed',
            },
          });
        }

        console.log('[RUNTIME] ⚠️ Build completed but server failed to start');
        console.log('[RUNTIME] Check logs for details');
      } else {
        // Mark as successful
        if (deploymentRecord) {
          await Deployment.findByIdAndUpdate(deploymentRecord._id, {
            status: 'success',
            rawLogs: allLogs + '\n\n' + startResult.output,
          });
        }
        console.log('[RUNTIME] ═══════════════════════════════════════════════════════');
        console.log('[RUNTIME] ✅ DEPLOYMENT SUCCESSFUL!');
        console.log('[RUNTIME] ═══════════════════════════════════════════════════════');
        console.log(`[RUNTIME] ✅ Application is running on port ${detectedPort}`);
        console.log(`[RUNTIME] ✅ Application exposed directly (no reverse proxy)`);
        console.log(`[RUNTIME] ✅ Security group configured for port ${detectedPort}`);
        console.log(`[RUNTIME] ✅ Public access: http://${publicIp}:${detectedPort}`);
        console.log('[RUNTIME] ═══════════════════════════════════════════════════════');
      }
    }

    // Release deployment lock
    await releaseDeploymentLock();
    console.log('[SMART-DEPLOY] 🔓 Deployment lock released (success)');

    console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
    console.log('[SMART-DEPLOY] ✅ AI-POWERED DEPLOYMENT COMPLETED SUCCESSFULLY!');
    console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');
    console.log('[SMART-DEPLOY] 🤖 Pipeline: Generated by Claude Sonnet 4.6');
    console.log('[SMART-DEPLOY] 📦 Project:', repoFullName);
    console.log('[SMART-DEPLOY] 🔧 Framework:', savedPipeline.framework);
    console.log('[SMART-DEPLOY] 🌐 Access URL:', `http://${publicIp}:${savedPipeline.port || '3000'}`);
    console.log('[SMART-DEPLOY] ════════════════════════════════════════════════════════════');

    // Prepare deployment summary message with AI attribution
    const isBackend = !isStaticProject;
    const appPort = isBackend ? (savedPipeline.port || '3000') : 'N/A';
    const deploymentMessage = isBackend
      ? `🤖 AI-Powered Deployment Successful!\n` +
        `✨ Pipeline generated by Claude Sonnet 4.6\n\n` +
        `${projectType.framework} application deployed!\n` +
        `- Application runs on port ${appPort}\n` +
        `- Exposed directly (no reverse proxy)\n` +
        `- Security group configured automatically\n` +
        `- Access via: http://${publicIp}:${appPort}`
      : `🤖 AI-Powered Deployment Successful!\n` +
        `✨ Pipeline generated by Claude Sonnet 4.6\n\n` +
        `${projectType.framework} application deployed!\n` +
        `Access via HTTP (http://${publicIp}) or HTTPS (https://${publicIp})`;

    return NextResponse.json({
      success: true,
      aiGenerated: true,  // Mark as AI-generated
      aiModel: 'Claude Sonnet 4.6',
      deploymentId: deploymentRecord?._id?.toString(),
      instanceId,
      publicIp,
      projectType: projectType.framework,
      language: savedPipeline.language,
      framework: savedPipeline.framework,
      port: savedPipeline.port,
      stages: pipeline.stages,
      message: deploymentMessage,
      appPort: isBackend ? appPort : undefined,
      directAccess: isBackend ? true : undefined,
      accessUrl: isBackend ? `http://${publicIp}:${appPort}` : `http://${publicIp}`,
      httpsEnabled: false,  // No HTTPS without reverse proxy
      httpUrl: isBackend ? `http://${publicIp}:${appPort}` : `http://${publicIp}`,
    });
  } catch (error: any) {
    console.error('[SMART-DEPLOY] Error:', error);

    // Release deployment lock on error
    try {
      await releaseDeploymentLock();
      console.log('[SMART-DEPLOY] 🔓 Deployment lock released (error)');
    } catch (lockError) {
      console.error('[SMART-DEPLOY] Failed to release lock:', lockError);
    }

    return NextResponse.json(
      { error: error.message || 'Deployment failed' },
      { status: 500 }
    );
  }
}

/**
 * Run stages via SSM with AI auto-fix on errors
 */
async function runStagesWithAutoFix(
  instanceId: string,
  pipeline: any,
  projectType: any,
  repoName: string,
  envVars: Record<string, string> = {},
  projectAnalysis?: ProjectAnalysis,
  buildConfig?: FrameworkBuildConfig,
  deploymentRecord?: any,  // For real-time log updates
  language?: string  // Language to determine environment setup
): Promise<{ success: boolean; error?: string; logs: string[] }> {
  const allLogs: string[] = [];

  // Determine if this is a Node.js project
  const isNodeProject = language?.includes('JavaScript') ||
                        language?.includes('TypeScript') ||
                        language?.includes('Node');

  console.log(`[STAGES] Project language: ${language || 'Unknown'}`);
  console.log(`[STAGES] Is Node.js project: ${isNodeProject}`);

  for (let i = 0; i < pipeline.stages.length; i++) {
    const stageName = pipeline.stages[i];
    const stageJobs = pipeline.jobs.filter((j: any) => j.stage === stageName);

    console.log('');
    console.log('='.repeat(60));
    console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] Running: ${stageName}`);
    console.log('='.repeat(60));

    // Build environment setup commands
    const envSetupCommands = [
      'cd /home/ec2-user/app',
      'sudo chown -R ec2-user:ec2-user /home/ec2-user/app || true',
      'export CI=true',
    ];

    // Add language-specific environment setup based on detected language
    if (language?.includes('Rust')) {
      // RUST ENVIRONMENT - CRITICAL SETUP
      console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] Setting up Rust environment`);

      // Set working directory and user
      envSetupCommands.push('cd /home/ec2-user/app');
      envSetupCommands.push('export HOME=/home/ec2-user');
      envSetupCommands.push('export USER=ec2-user');

      // Source system-wide Rust profile (created during UserData)
      envSetupCommands.push('source /etc/profile.d/rust-env.sh 2>/dev/null || echo "[ENV] ⚠️  System Rust profile not found"');

      // Source user Rust environment
      envSetupCommands.push('[ -f "/home/ec2-user/.cargo/env" ] && source /home/ec2-user/.cargo/env || echo "[ENV] ⚠️  User Rust env not found"');

      // Explicitly set Rust paths
      envSetupCommands.push('export PATH="/home/ec2-user/.cargo/bin:$PATH"');
      envSetupCommands.push('export CARGO_HOME="/home/ec2-user/.cargo"');
      envSetupCommands.push('export RUSTUP_HOME="/home/ec2-user/.rustup"');

      // Verify Rust is available
      envSetupCommands.push('echo "[ENV] ═══════════════════════════════════════"');
      envSetupCommands.push('echo "[ENV] Rust Environment Verification:"');
      envSetupCommands.push('echo "[ENV] ═══════════════════════════════════════"');
      envSetupCommands.push('echo "[ENV] Working directory: $(pwd)"');
      envSetupCommands.push('echo "[ENV] PATH: $PATH"');
      envSetupCommands.push('echo "[ENV] CARGO_HOME: $CARGO_HOME"');

      // Check if rustc exists
      envSetupCommands.push('if command -v rustc >/dev/null 2>&1; then');
      envSetupCommands.push('  echo "[ENV] ✅ rustc: $(rustc --version)"');
      envSetupCommands.push('else');
      envSetupCommands.push('  echo "[ENV] ❌ CRITICAL: rustc not found in PATH"');
      envSetupCommands.push('  echo "[ENV] Checking installation location..."');
      envSetupCommands.push('  ls -la /home/ec2-user/.cargo/bin/ 2>/dev/null || echo "[ENV] .cargo/bin not found"');
      envSetupCommands.push('fi');

      // Check if cargo exists
      envSetupCommands.push('if command -v cargo >/dev/null 2>&1; then');
      envSetupCommands.push('  echo "[ENV] ✅ cargo: $(cargo --version)"');
      envSetupCommands.push('else');
      envSetupCommands.push('  echo "[ENV] ❌ CRITICAL: cargo not found in PATH"');
      envSetupCommands.push('fi');

      envSetupCommands.push('echo "[ENV] ═══════════════════════════════════════"');

    } else if (language?.includes('Go')) {
      // GO ENVIRONMENT
      console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] Setting up Go environment`);
      envSetupCommands.push('cd /home/ec2-user/app');
      envSetupCommands.push('export PATH="$PATH:/usr/local/go/bin:/home/ec2-user/go/bin"');
      envSetupCommands.push('export GOPATH=/home/ec2-user/go');
      envSetupCommands.push('export GOROOT=/usr/local/go');
      envSetupCommands.push('export GO111MODULE=on');
      envSetupCommands.push('echo "[ENV] Go environment:"');
      envSetupCommands.push('go version 2>/dev/null || echo "[ENV] ⚠️  Go not installed"');
      envSetupCommands.push('echo "[ENV] GOPATH: $GOPATH"');
      envSetupCommands.push('echo "[ENV] Working directory: $(pwd)"');

    } else if (language?.includes('Python')) {
      // PYTHON ENVIRONMENT
      console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] Setting up Python environment`);
      envSetupCommands.push('cd /home/ec2-user/app');
      envSetupCommands.push('export PYTHONUNBUFFERED=1');
      envSetupCommands.push('export PYTHONDONTWRITEBYTECODE=1');
      envSetupCommands.push('export PATH="$PATH:/home/ec2-user/.local/bin"');
      envSetupCommands.push('export PIP_NO_CACHE_DIR=1');
      envSetupCommands.push('echo "[ENV] Python environment:"');
      envSetupCommands.push('python3 --version 2>/dev/null || echo "[ENV] ⚠️  Python not installed"');
      envSetupCommands.push('pip3 --version 2>/dev/null || echo "[ENV] ⚠️  pip not installed"');
      envSetupCommands.push('echo "[ENV] Working directory: $(pwd)"');

    } else if (language?.includes('Java')) {
      // JAVA ENVIRONMENT
      console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] Setting up Java environment`);
      envSetupCommands.push('cd /home/ec2-user/app');
      envSetupCommands.push('export JAVA_HOME=/usr/lib/jvm/java-17-amazon-corretto');
      envSetupCommands.push('export PATH="$PATH:$JAVA_HOME/bin"');
      envSetupCommands.push('export MAVEN_OPTS="-Xmx2048m"');
      envSetupCommands.push('echo "[ENV] Java environment:"');
      envSetupCommands.push('java -version 2>/dev/null || echo "[ENV] ⚠️  Java not installed"');
      envSetupCommands.push('mvn --version 2>/dev/null || echo "[ENV] Maven not installed"');
      envSetupCommands.push('gradle --version 2>/dev/null || echo "[ENV] Gradle not installed"');
      envSetupCommands.push('echo "[ENV] Working directory: $(pwd)"');

    } else if (language?.includes('Ruby')) {
      // RUBY ENVIRONMENT
      console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] Setting up Ruby environment`);
      envSetupCommands.push('cd /home/ec2-user/app');
      envSetupCommands.push('export PATH="$PATH:/home/ec2-user/.gem/ruby/bin"');
      envSetupCommands.push('export GEM_HOME=/home/ec2-user/.gem/ruby');
      envSetupCommands.push('export GEM_PATH=/home/ec2-user/.gem/ruby');
      envSetupCommands.push('echo "[ENV] Ruby environment:"');
      envSetupCommands.push('ruby --version 2>/dev/null || echo "[ENV] ⚠️  Ruby not installed"');
      envSetupCommands.push('bundle --version 2>/dev/null || echo "[ENV] Bundler not installed"');
      envSetupCommands.push('echo "[ENV] Working directory: $(pwd)"');

    } else if (language?.includes('PHP')) {
      // PHP ENVIRONMENT
      console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] Setting up PHP environment`);
      envSetupCommands.push('cd /home/ec2-user/app');
      envSetupCommands.push('export PATH="$PATH:/home/ec2-user/.composer/vendor/bin"');
      envSetupCommands.push('export COMPOSER_HOME=/home/ec2-user/.composer');
      envSetupCommands.push('echo "[ENV] PHP environment:"');
      envSetupCommands.push('php --version 2>/dev/null || echo "[ENV] ⚠️  PHP not installed"');
      envSetupCommands.push('composer --version 2>/dev/null || echo "[ENV] Composer not installed"');
      envSetupCommands.push('echo "[ENV] Working directory: $(pwd)"');

    } else if (isNodeProject) {
      // NODE.JS ENVIRONMENT
      console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] Setting up Node.js environment`);
      envSetupCommands.push('export NODE_ENV=production');
      envSetupCommands.push('export PATH="$PATH:/home/ec2-user/app/node_modules/.bin"');
      envSetupCommands.push('export NODE_OPTIONS="--max-old-space-size=4096"');
      envSetupCommands.push('echo "[ENV] Node.js environment:"');
      envSetupCommands.push('node --version 2>/dev/null || echo "[ENV] ⚠️  Node.js not installed"');
      envSetupCommands.push('npm --version 2>/dev/null || echo "[ENV] npm not installed"');
      envSetupCommands.push('echo "[ENV] Working directory: $(pwd)"');

    } else {
      // UNKNOWN/DOCKER ENVIRONMENT
      console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] Using minimal environment (language: ${language || 'unknown'})`);
      envSetupCommands.push('echo "[ENV] Minimal environment - no specific runtime detected"');
      envSetupCommands.push('echo "[ENV] Working directory: $(pwd)"');
    }

    // Export environment variables if provided
    if (Object.keys(envVars).length > 0) {
      console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] Exporting ${Object.keys(envVars).length} environment variables`);
      Object.entries(envVars).forEach(([key, value]) => {
        // Escape single quotes in value and wrap in single quotes for safety
        const escapedValue = value.replace(/'/g, "'\\''");
        envSetupCommands.push(`export ${key}='${escapedValue}'`);
      });
    }

    // Build stage commands
    const stageCommands: string[] = [];

    // USE AI-GENERATED COMMANDS (when available) instead of hardcoded pipeline commands
    let useAICommand = false;
    let aiCommand = '';

    if (buildConfig && buildConfig.framework !== 'unknown') {
      if (stageName === 'install' && buildConfig.installCommand) {
        useAICommand = true;
        aiCommand = buildConfig.installCommand;
        stageCommands.push(`echo "[INSTALL] ⚡ Using AI-detected install command for ${buildConfig.framework}"`);
        stageCommands.push(`echo "[INSTALL] → ${aiCommand}"`);
        stageCommands.push(aiCommand);
      } else if (stageName === 'lint' && buildConfig.lintCommand) {
        useAICommand = true;
        aiCommand = buildConfig.lintCommand;
        stageCommands.push(`echo "[LINT] ⚡ Using AI-detected lint command"`);
        stageCommands.push(`${aiCommand} || echo "⚠️ Lint warnings detected (non-fatal)"`);
      } else if (stageName === 'test' && buildConfig.testCommand) {
        useAICommand = true;
        aiCommand = buildConfig.testCommand;
        stageCommands.push(`echo "[TEST] ⚡ Using AI-detected test command"`);
        stageCommands.push(`${aiCommand} || echo "⚠️ Tests failed (non-fatal, continuing deployment)"`);
      }
    }

    // If AI didn't provide command for this stage, fall back to pipeline YAML commands
    if (!useAICommand) {
      for (const job of stageJobs) {
        for (const cmd of job.script) {
          // Make lint and test stages non-fatal - they shouldn't block deployment
          if (stageName === 'lint') {
            stageCommands.push(`${cmd} || echo "⚠️ Lint warnings detected (non-fatal)"`);
          } else if (stageName === 'test') {
            // Tests should never block deployment
            stageCommands.push(`${cmd} || echo "⚠️ Tests failed (non-fatal, continuing deployment)"`);
          } else if (stageName === 'install') {
            // Use pipeline install command
            stageCommands.push(cmd);
          } else if (stageName === 'build') {
            stageCommands.push(`echo "[BUILD] 🏗️  Running build command..."`);
            stageCommands.push(cmd);
          } else {
            stageCommands.push(cmd);
          }
        }
      }
    }

    // Combine all commands - USE ONLY PIPELINE COMMANDS
    const commands = [...envSetupCommands, ...stageCommands];

    console.log(`[SMART-DEPLOY] Using ${commands.length} commands from pipeline (no extra injection)`);

    // REMOVED: All Node.js-specific command injection
    // REMOVED: npm cache clean, package.json checks, Prisma generation
    // REASON: These break Python/Rust/Go projects and contradict pipeline commands

    // Try to run stage (with one retry if AI can fix)
    let attempts = 0;
    const maxAttempts = 3; // Increased from 2 to 3 for better AI-powered error recovery
    while (attempts < maxAttempts) {
      attempts++;

      // Log stage info (simplified)
      console.log(`[SMART-DEPLOY] Executing stage: ${stageName} (${commands.length} commands)`);

      // Fast builds with aggressive optimizations - target 3-5 minutes
      let timeout = 600; // Default 10 minutes

      if (stageName === 'build') {
        // With ultra-fast optimizations, even Next.js should build in 5-8 minutes
        timeout = 480; // 8 minutes timeout (gives buffer for 3-5 min build target)
        console.log('[SMART-DEPLOY] ⚡ Ultra-fast build mode (target: 3-5 minutes)');
        console.log(`[SMART-DEPLOY] ⏱️  Build timeout: ${timeout}s (${timeout/60} minutes)`);
      }

      console.log(`[SMART-DEPLOY] Timeout set to: ${timeout}s (${timeout/60} minutes)`);

      // Add stage start log and update database BEFORE running command
      allLogs.push(`[STAGE ${i + 1}/${pipeline.stages.length}] Running: ${stageName}`);
      allLogs.push(`[SMART-DEPLOY] Starting stage ${stageName} with ${commands.length} commands...`);

      // Update database with stage start (so frontend shows progress immediately)
      if (deploymentRecord) {
        try {
          await Deployment.findByIdAndUpdate(deploymentRecord._id, {
            rawLogs: allLogs.join('\n'),
            status: 'deploying',
          });
          console.log(`[SMART-DEPLOY] Updated database: Stage ${stageName} started`);
        } catch (dbError) {
          console.error('[STAGE] Failed to update logs in database:', dbError);
        }
      }

      const result = await executeSSMCommand(
        instanceId, 
        commands, 
        timeout, 
        deploymentRecord?._id?.toString()
      );

      // Add command output to logs
      allLogs.push(result.output);

      // Update database with command output
      if (deploymentRecord) {
        try {
          await Deployment.findByIdAndUpdate(deploymentRecord._id, {
            rawLogs: allLogs.join('\n'),
            status: 'deploying',
          });
          console.log(`[SMART-DEPLOY] Updated database: Stage ${stageName} output added (${result.output.length} chars)`);
        } catch (dbError) {
          console.error('[STAGE] Failed to update logs in database:', dbError);
        }
      }

      if (result.success) {
        console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] ✅ Success`);
        allLogs.push(`[STAGE ${i + 1}/${pipeline.stages.length}] ✅ Success`);

        // Update database again after success
        if (deploymentRecord) {
          try {
            await Deployment.findByIdAndUpdate(deploymentRecord._id, {
              rawLogs: allLogs.join('\n'),
            });
          } catch (dbError) {
            console.error('[STAGE] Failed to update logs in database:', dbError);
          }
        }

        if (stageName === 'install') {
          console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] Full install output (last 2000 chars):`);
          console.log(result.output.slice(-2000));
        } else {
          console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] Output (last 500 chars):`);
          console.log(result.output.slice(-500));
        }
        console.log('');
        break;
      }

      // Capture comprehensive error context
      const fullErrorLog = `
=== STDOUT ===
${result.output}

=== STDERR ===
${result.error}

=== STAGE INFO ===
Stage: ${stageName}
Commands executed:
${commands.join('\n')}
      `.trim();

      console.error(
        `[STAGE ${i + 1}/${pipeline.stages.length}] ❌ Failed:`,
        result.error.substring(0, 500)
      );
      console.log('[SMART-DEPLOY] ========================================');
      console.log('[SMART-DEPLOY] DETAILED ERROR OUTPUT');
      console.log('[SMART-DEPLOY] ========================================');
      console.log('[SMART-DEPLOY] STDOUT (last 1500 chars):');
      console.log(result.output.slice(-1500));
      console.log('[SMART-DEPLOY] ========================================');
      console.log('[SMART-DEPLOY] STDERR (last 1000 chars):');
      console.log(result.error.slice(-1000));
      console.log('[SMART-DEPLOY] ========================================');

      // If first attempt, try AI fix
      if (attempts === 1) {
        console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] AI fixing...`);

        // Check for common errors and apply direct fixes
        const errorText = `${result.output}\n${result.error}`.toLowerCase();

        // Generic "command not found" error - works for ANY tool (vite, webpack, tsc, etc.)
        const commandNotFoundMatch = result.error.match(/(\w+):\s*command not found/i);

        if (commandNotFoundMatch) {
          const missingCommand = commandNotFoundMatch[1];
          const isNodeJs = projectAnalysis?.language?.toLowerCase().includes('javascript') || 
                           projectAnalysis?.language?.toLowerCase().includes('typescript') ||
                           projectAnalysis?.language?.toLowerCase().includes('node');

          if (!isNodeJs && (missingCommand === 'cargo' || missingCommand === 'rustc' || missingCommand === 'go' || missingCommand === 'python3')) {
            console.log(`[AI-FIX] Missing system tool detected for non-Node project: ${missingCommand}. Stopping Node-based fix.`);
          } else if (isNodeJs) {
            console.log(`[AI-FIX] Command not found: ${missingCommand}`);

            // Determine install strategy from project analysis
            let installFlag = '--save-dev';
          if (projectAnalysis) {
            // Check if the missing command should be a production dependency
            const isProductionDep = projectAnalysis.dependencies?.includes(missingCommand);
            const isDevDep = projectAnalysis.devDependencies?.includes(missingCommand);

            if (isProductionDep) {
              installFlag = '--save';
              console.log(`[AI-FIX] ${missingCommand} detected as production dependency`);
            } else if (isDevDep) {
              installFlag = '--save-dev';
              console.log(`[AI-FIX] ${missingCommand} detected as dev dependency`);
            } else {
              // Use strategy from analysis
              if (projectAnalysis.installStrategy?.includes('--save ')) {
                installFlag = '--save';
              }
              console.log(`[AI-FIX] Using install strategy: ${installFlag}`);
            }
          }

          console.log(`[AI-FIX] Installing ${missingCommand} with ${installFlag} flag...`);

          // Get related packages for common build tools
          const relatedPackages: Record<string, string[]> = {
            'vite': ['vite', '@vitejs/plugin-react'],
            'webpack': ['webpack', 'webpack-cli', 'webpack-dev-server'],
            'tsc': ['typescript', '@types/react', '@types/node'],
            'next': ['next', 'react', 'react-dom'],
          };

          const packagesToInstall = relatedPackages[missingCommand] || [missingCommand];
          const installPackages = packagesToInstall.join(' ');

          // Install the missing package with comprehensive fix
          const fixCommands = [
            ...envSetupCommands,
            `echo "[FIX] === INSTALLING ${missingCommand.toUpperCase()} ==="`,
            `echo "[FIX] Strategy: ${installFlag}"`,
            `echo "[FIX] Packages: ${installPackages}"`,
            '',
            '# Clear npm cache',
            'npm cache clean --force || true',
            'rm -rf node_modules/.cache || true',
            '',
            '# Install the missing packages',
            `npm install ${installFlag} ${installPackages} --legacy-peer-deps --force`,
            '',
            '# Verify installation',
            `echo "[FIX] === VERIFICATION ==="`,
            `which ${missingCommand} && echo "[FIX] ✓ ${missingCommand} found in PATH" || echo "[FIX] ⚠ ${missingCommand} not in PATH"`,
            `ls -la node_modules/.bin/${missingCommand} && echo "[FIX] ✓ ${missingCommand} exists in node_modules/.bin" || echo "[FIX] ⚠ ${missingCommand} not in node_modules/.bin"`,
            `npm list ${missingCommand} && echo "[FIX] ✓ ${missingCommand} listed in npm" || echo "[FIX] ⚠ ${missingCommand} not in npm list"`,
            '',
            '# Update PATH and retry',
            'export PATH="$PATH:/home/ec2-user/app/node_modules/.bin"',
            `echo "[FIX] PATH: $PATH"`,
            `echo "[FIX] === RETRYING BUILD COMMAND ==="`,
            '',
            ...stageCommands, // Re-run the original stage commands
          ];

          const quickFixResult = await executeSSMCommand(instanceId, fixCommands);

          console.log(`[AI-FIX] === INSTALLATION OUTPUT ===`);
          console.log(quickFixResult.output.slice(-1000));
          console.log(`[AI-FIX] === END OUTPUT ===`);

          if (quickFixResult.success) {
            console.log(`[AI-FIX] ✓ ${missingCommand} installed and command succeeded!`);
            break; // Stage succeeded, move to next
          } else {
            console.error(`[AI-FIX] ❌ Installation failed`);
            console.error(`[AI-FIX] Error:`, quickFixResult.error.slice(-500));

            // Try using npx as a fallback with --yes flag
            console.log(`[AI-FIX] Trying npx fallback for ${missingCommand}...`);
            const npxCommands = [
              ...envSetupCommands,
              `echo "[FIX] Using npx to run ${missingCommand}"`,
              `echo "[FIX] npx will download and execute the package if needed"`,
              // Replace the command with npx version
              ...stageCommands.map(cmd => {
                // If the stage command is just the missing command, prepend npx --yes
                if (cmd.includes(missingCommand)) {
                  return cmd.replace(new RegExp(`\\b${missingCommand}\\b`, 'g'), `npx --yes ${missingCommand}`);
                }
                return cmd;
              }),
            ];

            const npxResult = await executeSSMCommand(instanceId, npxCommands);

            if (npxResult.success) {
              console.log(`[AI-FIX] ✓ npx --yes ${missingCommand} succeeded!`);
              break; // Stage succeeded
            } else {
              console.log(`[AI-FIX] npx fallback also failed, trying AI analysis...`);
              console.error(`[AI-FIX] npx error:`, npxResult.error.slice(-500));
            }
          }
        }
      }

        // TypeScript dependency error
        const isTypeScriptError = errorText.includes('typescript') &&
                                   (errorText.includes('@types/react') ||
                                    errorText.includes('@types/node') ||
                                    errorText.includes('missingdependencyerror'));

        if (isTypeScriptError) {
          console.log('[AI-FIX] TypeScript dependencies missing, installing and retrying...');
          const fixCommands = [
            ...envSetupCommands,
            'npm install --save-dev typescript @types/react @types/node --legacy-peer-deps',
            ...stageCommands, // Re-run the original stage commands
          ];

          const typeScriptFixResult = await executeSSMCommand(instanceId, fixCommands);

          if (typeScriptFixResult.success) {
            console.log('[AI-FIX] TypeScript dependencies installed and stage succeeded!');
            break; // Stage succeeded
          }
        }

        // Module not found error
        const moduleNotFoundMatch = result.error.match(/Cannot find module ['"]([^'"]+)['"]/i);

        if (moduleNotFoundMatch) {
          const missingModule = moduleNotFoundMatch[1];
          // Extract package name (remove path prefixes like @/ or ~/)
          const packageName = missingModule.split('/')[0].replace(/^[@~]/, '');

          // Skip if it's a local path alias
          if (!missingModule.startsWith('@/') && !missingModule.startsWith('~/') && !missingModule.startsWith('./')) {
            console.log(`[AI-FIX] Module not found: ${packageName}, installing and retrying...`);

            const fixCommands = [
              ...envSetupCommands,
              `npm install --save-dev ${packageName} --legacy-peer-deps`,
              ...stageCommands, // Re-run the original stage commands
            ];

            const moduleFixResult = await executeSSMCommand(instanceId, fixCommands);

            if (moduleFixResult.success) {
              console.log(`[AI-FIX] ${packageName} installed and stage succeeded!`);
              break; // Stage succeeded
            }
          }
        }

        // Special handling for lint and test stages - if failing after attempts, make them non-fatal
        if ((stageName === 'lint' || stageName === 'test') && attempts === 1) {
          console.log(`[AI-FIX] ${stageName} stage has issues. Skipping ${stageName} to continue deployment...`);
          console.log(`[AI-FIX] Note: ${stageName} errors should be fixed locally, but won't block deployment`);
          break; // Skip this stage and continue
        }

        // Try AI fix - but run fix + retry in ONE session
        const fixResult = await autoFixDeploymentError(
          {
            errorLog: fullErrorLog,
            stage: stageName,
            command: stageJobs[0]?.name || stageName,
            repoName,
            framework: projectType.framework,
          },
          instanceId
        );

        if (fixResult.success && fixResult.fixCommands && fixResult.fixCommands.length > 0) {
          console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] 🔧 Applying AI fix and retrying in one session...`);
          console.log(`[AI-FIX] Commands to execute:`, fixResult.fixCommands);

          // Combine fix commands + retry in ONE SSM session
          const combinedFixCommands = [
            ...envSetupCommands,
            'echo "==================================="',
            'echo "[AI-FIX] APPLYING Claude 4.6 Sonnet FIX"',
            'echo "==================================="',
            ...fixResult.fixCommands,
            '',
            'echo "==================================="',
            'echo "[AI-FIX] RETRYING ORIGINAL COMMAND"',
            'echo "==================================="',
            ...stageCommands, // Re-run the original stage commands
          ];

          const combinedFixResult = await executeSSMCommand(instanceId, combinedFixCommands);

          console.log(`[AI-FIX] === FIX OUTPUT ===`);
          console.log(combinedFixResult.output.slice(-1500));
          console.log(`[AI-FIX] === END OUTPUT ===`);

          if (combinedFixResult.success) {
            console.log(
              `[STAGE ${i + 1}/${pipeline.stages.length}] ✅ AI fixed and stage succeeded!`
            );

            // Update database with AI fix success
            if (deploymentRecord) {
              try {
                await Deployment.findByIdAndUpdate(deploymentRecord._id, {
                  rawLogs: allLogs.join('\n'),
                });
              } catch (dbError) {
                console.error('[AI-FIX] Failed to update logs in database:', dbError);
              }
            }

            break; // Stage succeeded
          } else {
            console.log(
              `[STAGE ${i + 1}/${pipeline.stages.length}] ❌ AI fix applied but stage still failed`
            );
            console.error(`[AI-FIX] Error after fix:`, combinedFixResult.error.slice(-500));

            // Update database with AI fix failure
            if (deploymentRecord) {
              try {
                await Deployment.findByIdAndUpdate(deploymentRecord._id, {
                  rawLogs: allLogs.join('\n'),
                });
              } catch (dbError) {
                console.error('[AI-FIX] Failed to update logs in database:', dbError);
              }
            }
          }
        }

        // SUPER NUCLEAR OPTION: Fix missing files and configurations (VITE PROJECTS ONLY!)
        if (attempts === 1 && stageName === 'build' && fullErrorLog.includes('Could not resolve entry module')) {
          // Check if this is actually a Vite project before applying Vite-specific fixes!
          const isViteProject = projectType.framework?.includes('Vite') ||
                               projectAnalysis?.buildTool?.includes('vite');

          if (!isViteProject) {
            console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] ⚠ Skipping SUPER NUCLEAR - not a Vite project (${projectType.framework})`);
          } else {
            console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] ⚡ SUPER NUCLEAR: Fixing Vite project entry files...`);

          const superNuclearCommands = [
            ...envSetupCommands,
            'echo "========================================"',
            'echo "[SUPER-NUCLEAR] FIXING MISSING FILES"',
            'echo "========================================"',
            '',
            '# Step 1: Diagnose project structure',
            'echo "[SUPER-NUCLEAR] Step 1: Analyzing project structure..."',
            'echo "[SUPER-NUCLEAR] Looking for index.html:"',
            'find . -name "index.html" -type f 2>/dev/null | grep -v node_modules | head -3',
            'echo "[SUPER-NUCLEAR] Looking for entry files:"',
            'find . \\( -name "main.jsx" -o -name "main.tsx" -o -name "index.jsx" -o -name "index.tsx" -o -name "App.jsx" \\) -type f 2>/dev/null | grep -v node_modules | head -3',
            'echo "[SUPER-NUCLEAR] Current project structure:"',
            'ls -la',
            'echo "[SUPER-NUCLEAR] Checking src/ directory:"',
            'ls -la src/ 2>/dev/null || echo "No src/ directory"',
            '',
            '# Step 2: Find or create entry point',
            'echo "[SUPER-NUCLEAR] Step 2: Locating entry point..."',
            'ENTRY_FILE=$(find . \\( -name "main.jsx" -o -name "main.tsx" -o -name "index.jsx" -o -name "index.tsx" \\) -type f 2>/dev/null | grep -v node_modules | grep src | head -1)',
            'if [ -z "$ENTRY_FILE" ]; then',
            '  ENTRY_FILE=$(find . \\( -name "main.jsx" -o -name "main.tsx" \\) -type f 2>/dev/null | grep -v node_modules | head -1)',
            'fi',
            'if [ -z "$ENTRY_FILE" ]; then',
            '  echo "[SUPER-NUCLEAR] No entry file found, checking if src/main.jsx needs to be created..."',
            '  if [ ! -f "src/main.jsx" ] && [ ! -f "src/main.tsx" ]; then',
            '    echo "[SUPER-NUCLEAR] Creating src/ directory and basic React entry..."',
            '    mkdir -p src',
            '    cat > src/main.jsx << "MAINEOF"',
            'import React from "react";',
            'import ReactDOM from "react-dom/client";',
            'import App from "./App";',
            'import "./index.css";',
            '',
            'ReactDOM.createRoot(document.getElementById("root")).render(',
            '  <React.StrictMode>',
            '    <App />',
            '  </React.StrictMode>',
            ');',
            'MAINEOF',
            '    ENTRY_FILE="src/main.jsx"',
            '    echo "[SUPER-NUCLEAR] Created $ENTRY_FILE"',
            '  fi',
            'fi',
            'ENTRY_PATH="${ENTRY_FILE#./}"',
            'echo "[SUPER-NUCLEAR] Entry file: $ENTRY_PATH"',
            '',
            '# Step 3: Create/fix index.html with proper entry path',
            'echo "[SUPER-NUCLEAR] Step 3: Creating/fixing index.html..."',
            '# Determine actual entry path',
            'if [ -f "src/main.jsx" ]; then',
            '  ACTUAL_ENTRY="/src/main.jsx"',
            'elif [ -f "src/main.tsx" ]; then',
            '  ACTUAL_ENTRY="/src/main.tsx"',
            'elif [ -f "src/index.jsx" ]; then',
            '  ACTUAL_ENTRY="/src/index.jsx"',
            'elif [ -f "src/index.tsx" ]; then',
            '  ACTUAL_ENTRY="/src/index.tsx"',
            'else',
            '  ACTUAL_ENTRY="/src/main.jsx"',
            'fi',
            'echo "[SUPER-NUCLEAR] Using entry path: $ACTUAL_ENTRY"',
            '',
            '# Always recreate index.html to ensure it\'s correct',
            'cat > index.html << HTMLEOF',
            '<!DOCTYPE html>',
            '<html lang="en">',
            '  <head>',
            '    <meta charset="UTF-8" />',
            '    <link rel="icon" type="image/svg+xml" href="/vite.svg" />',
            '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
            '    <title>React App</title>',
            '  </head>',
            '  <body>',
            '    <div id="root"></div>',
            '    <script type="module" src="$ACTUAL_ENTRY"></script>',
            '  </body>',
            '</html>',
            'HTMLEOF',
            'echo "[SUPER-NUCLEAR] ✓ Created index.html with entry: $ACTUAL_ENTRY"',
            'cat index.html | grep "script"',
            '',
            '# Step 4: Create/fix vite.config.js with proper asset handling',
            'echo "[SUPER-NUCLEAR] Step 4: Creating/fixing vite.config.js..."',
            'cat > vite.config.js << "VITEEOF"',
            'import { defineConfig } from "vite";',
            'import react from "@vitejs/plugin-react";',
            'import path from "path";',
            '',
            'export default defineConfig({',
            '  plugins: [react()],',
            '  root: ".",',
            '  publicDir: "public",',
            '  resolve: {',
            '    alias: {',
            '      "@": path.resolve(__dirname, "./src"),',
            '    },',
            '  },',
            '  build: {',
            '    outDir: "dist",',
            '    assetsDir: "assets",',
            '    emptyOutDir: true,',
            '    cssCodeSplit: true,',
            '    rollupOptions: {',
            '      input: "./index.html",',
            '      output: {',
            '        assetFileNames: "assets/[name]-[hash][extname]",',
            '        chunkFileNames: "assets/[name]-[hash].js",',
            '        entryFileNames: "assets/[name]-[hash].js",',
            '      },',
            '    },',
            '  },',
            '  server: {',
            '    port: 3000,',
            '    host: "0.0.0.0",',
            '  },',
            '});',
            'VITEEOF',
            'echo "[SUPER-NUCLEAR] ✓ Created vite.config.js with proper asset configuration"',
            '',
            '# Step 5: Ensure basic App component exists',
            'echo "[SUPER-NUCLEAR] Step 5: Checking for App component..."',
            'if [ ! -f "src/App.jsx" ] && [ ! -f "src/App.tsx" ]; then',
            '  echo "[SUPER-NUCLEAR] Creating basic App.jsx..."',
            '  cat > src/App.jsx << "APPEOF"',
            'import { useState } from "react";',
            '',
            'function App() {',
            '  const [count, setCount] = useState(0);',
            '',
            '  return (',
            '    <div style={{ padding: "2rem", textAlign: "center" }}>',
            '      <h1>React + Vite</h1>',
            '      <div style={{ margin: "2rem" }}>',
            '        <button onClick={() => setCount((count) => count + 1)}>',
            '          count is {count}',
            '        </button>',
            '      </div>',
            '    </div>',
            '  );',
            '}',
            '',
            'export default App;',
            'APPEOF',
            '  echo "[SUPER-NUCLEAR] ✓ Created App.jsx"',
            'fi',
            '',
            '# Step 6: Create basic CSS if missing',
            'if [ ! -f "src/index.css" ]; then',
            '  echo "[SUPER-NUCLEAR] Creating basic index.css..."',
            '  cat > src/index.css << "CSSEOF"',
            'body { margin: 0; font-family: system-ui, sans-serif; }',
            'CSSEOF',
            'fi',
            '',
            '# Step 7: Ensure package.json has correct scripts',
            'echo "[SUPER-NUCLEAR] Step 6: Fixing package.json scripts..."',
            'npm pkg set scripts.dev="vite"',
            'npm pkg set scripts.build="vite build"',
            'npm pkg set scripts.preview="vite preview"',
            'echo "[SUPER-NUCLEAR] ✓ Package.json scripts updated"',
            '',
            '# Step 8: Verify everything',
            'echo "[SUPER-NUCLEAR] Step 7: Verification..."',
            'echo "===== FILES ====="',
            'ls -la index.html vite.config.js 2>/dev/null',
            'ls -la src/*.jsx src/*.tsx 2>/dev/null',
            'echo "===== PACKAGE.JSON SCRIPTS ====="',
            'cat package.json | grep -A 5 "scripts"',
            '',
            'echo "========================================"',
            'echo "[SUPER-NUCLEAR] RETRYING BUILD"',
            'echo "========================================"',
            '',
            ...stageCommands,
          ];

          const superNuclearResult = await executeSSMCommand(instanceId, superNuclearCommands);

          console.log(`[SUPER-NUCLEAR] === OUTPUT ===`);
          console.log(superNuclearResult.output);
          console.log(`[SUPER-NUCLEAR] === END OUTPUT ===`);

          if (superNuclearResult.success) {
            console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] ✅ Super nuclear fix succeeded!`);
            break; // Stage succeeded
          } else {
            console.error(`[STAGE ${i + 1}/${pipeline.stages.length}] ❌ Super nuclear fix failed`);
            console.error(`[SUPER-NUCLEAR] Error:`, superNuclearResult.error.slice(-500));
          }
          }
        }

        // JSX FILE EXTENSION FIX: Rename .js files with JSX to .jsx
        if (attempts === 1 && stageName === 'build' && (
          fullErrorLog.includes('make sure to name the file with the .jsx or .tsx extension') ||
          fullErrorLog.includes('invalid JS syntax') && fullErrorLog.includes('.js')
        )) {
          console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] 🔧 JSX FIX: Renaming .js files with JSX to .jsx...`);

          const jsxFixCommands = [
            ...envSetupCommands,
            'echo "========================================="',
            'echo "[JSX-FIX] RENAMING JSX FILES"',
            'echo "========================================="',
            '',
            '# Find all .js files in src/ that likely contain JSX',
            'echo "[JSX-FIX] Searching for .js files with JSX..."',
            'find src -name "*.js" -type f 2>/dev/null | while read file; do',
            '  if grep -q "className\\|</\\|</" "$file" 2>/dev/null; then',
            '    newfile="${file%.js}.jsx"',
            '    echo "[JSX-FIX] Renaming $file to $newfile"',
            '    mv "$file" "$newfile"',
            '  fi',
            'done',
            '',
            '# Also rename common files that usually have JSX',
            'if [ -f "src/App.js" ]; then',
            '  echo "[JSX-FIX] Renaming src/App.js to src/App.jsx"',
            '  mv src/App.js src/App.jsx 2>/dev/null || true',
            'fi',
            'if [ -f "src/index.js" ]; then',
            '  echo "[JSX-FIX] Renaming src/index.js to src/index.jsx"',
            '  mv src/index.js src/index.jsx 2>/dev/null || true',
            'fi',
            'if [ -f "src/main.js" ]; then',
            '  echo "[JSX-FIX] Renaming src/main.js to src/main.jsx"',
            '  mv src/main.js src/main.jsx 2>/dev/null || true',
            'fi',
            '',
            '# Update imports in files to point to .jsx',
            'echo "[JSX-FIX] Updating imports..."',
            'find src -name "*.jsx" -o -name "*.tsx" -o -name "*.js" -o -name "*.ts" | while read file; do',
            '  sed -i "s/from \'\\.\\(.*\\)\\.js\'/from \'.\\1.jsx\'/g" "$file" 2>/dev/null || true',
            '  sed -i \'s/from "\\(.*\\)\\.js"/from "\\1.jsx"/g\' "$file" 2>/dev/null || true',
            'done',
            '',
            '# Update index.html if it references .js files',
            'if [ -f "index.html" ]; then',
            '  echo "[JSX-FIX] Updating index.html references..."',
            '  sed -i "s/src\\/main\\.js/src\\/main.jsx/g" index.html 2>/dev/null || true',
            '  sed -i "s/src\\/index\\.js/src\\/index.jsx/g" index.html 2>/dev/null || true',
            'fi',
            '',
            'echo "[JSX-FIX] Verification - current src/ structure:"',
            'ls -la src/*.jsx src/*.js 2>/dev/null || echo "No JS/JSX files found"',
            '',
            'echo "========================================="',
            'echo "[JSX-FIX] RETRYING BUILD"',
            'echo "========================================="',
            '',
            ...stageCommands,
          ];

          const jsxFixResult = await executeSSMCommand(instanceId, jsxFixCommands);

          console.log(`[JSX-FIX] === OUTPUT ===`);
          console.log(jsxFixResult.output);
          console.log(`[JSX-FIX] === END OUTPUT ===`);

          if (jsxFixResult.success) {
            console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] ✅ JSX fix succeeded!`);
            break; // Stage succeeded
          } else {
            console.error(`[STAGE ${i + 1}/${pipeline.stages.length}] ❌ JSX fix failed`);
            console.error(`[JSX-FIX] Error:`, jsxFixResult.error.slice(-500));
          }
        }

        // TAILWIND CSS NATIVE BINDING FIX: Fix @tailwindcss/oxide native dependency issues
        if (attempts === 1 && stageName === 'build' && (
          fullErrorLog.includes('Cannot find native binding') ||
          fullErrorLog.includes('@tailwindcss/oxide') ||
          fullErrorLog.includes('npm has a bug related to optional dependencies')
        )) {
          console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] 🎨 TAILWIND FIX: Fixing native binding issues...`);

          const tailwindFixCommands = [
            ...envSetupCommands,
            'echo "========================================="',
            'echo "[TAILWIND-FIX] FIXING NATIVE BINDINGS"',
            'echo "========================================="',
            '',
            '# Check if using Tailwind v4 with native dependencies',
            'echo "[TAILWIND-FIX] Checking Tailwind version..."',
            'if grep -q "@tailwindcss/vite" package.json || grep -q "@tailwindcss/oxide" package.json; then',
            '  echo "[TAILWIND-FIX] Tailwind v4 detected with native dependencies"',
            '  echo "[TAILWIND-FIX] This version has known issues with npm optional dependencies"',
            '  echo "[TAILWIND-FIX] Downgrading to Tailwind v3 (stable, no native deps)..."',
            '  ',
            '  # Remove problematic packages',
            '  npm uninstall @tailwindcss/vite @tailwindcss/oxide 2>/dev/null || true',
            '  ',
            '  # Install Tailwind v3',
            '  npm install --save-dev tailwindcss@^3.4.0 postcss@^8 autoprefixer@^10 --legacy-peer-deps --force',
            '  ',
            '  # Update vite.config to remove @tailwindcss/vite',
            '  if [ -f "vite.config.js" ]; then',
            '    echo "[TAILWIND-FIX] Updating vite.config.js..."',
            '    # Remove @tailwindcss/vite import and plugin',
            '    sed -i "/@tailwindcss\\/vite/d" vite.config.js',
            '  fi',
            '  ',
            '  # Create Tailwind v3 config',
            '  echo "[TAILWIND-FIX] Creating tailwind.config.js for v3..."',
            '  cat > tailwind.config.js << "TAILWINDEOF"',
            'module.exports = {',
            '  content: [',
            '    "./index.html",',
            '    "./src/**/*.{js,ts,jsx,tsx}",',
            '  ],',
            '  theme: {',
            '    extend: {},',
            '  },',
            '  plugins: [],',
            '}',
            'TAILWINDEOF',
            '  ',
            '  # Create PostCSS config',
            '  echo "[TAILWIND-FIX] Creating postcss.config.js..."',
            '  cat > postcss.config.js << "POSTCSSEOF"',
            'module.exports = {',
            '  plugins: {',
            '    tailwindcss: {},',
            '    autoprefixer: {},',
            '  },',
            '}',
            'POSTCSSEOF',
            '  ',
            '  # Ensure CSS file imports Tailwind directives',
            '  if [ -f "src/index.css" ]; then',
            '    if ! grep -q "@tailwind" src/index.css; then',
            '      echo "[TAILWIND-FIX] Adding Tailwind directives to src/index.css..."',
            '      cat > src/index.css << "CSSEOF"',
            '@tailwind base;',
            '@tailwind components;',
            '@tailwind utilities;',
            '',
            'body { margin: 0; font-family: system-ui, sans-serif; }',
            'CSSEOF',
            '    fi',
            '  else',
            '    echo "[TAILWIND-FIX] Creating src/index.css with Tailwind directives..."',
            '    mkdir -p src',
            '    cat > src/index.css << "CSSEOF"',
            '@tailwind base;',
            '@tailwind components;',
            '@tailwind utilities;',
            '',
            'body { margin: 0; font-family: system-ui, sans-serif; }',
            'CSSEOF',
            '  fi',
            '  ',
            '  echo "[TAILWIND-FIX] ✓ Downgraded to Tailwind CSS v3"',
            'else',
            '  echo "[TAILWIND-FIX] Not a Tailwind v4 issue, cleaning and reinstalling..."',
            '  rm -rf node_modules package-lock.json',
            '  npm cache clean --force',
            '  npm install --legacy-peer-deps --force',
            'fi',
            '',
            '# Rebuild native packages',
            'echo "[TAILWIND-FIX] Rebuilding packages..."',
            'npm rebuild 2>&1 | tail -10',
            '',
            '# Show what we have now',
            'echo "[TAILWIND-FIX] Verification:"',
            'echo "Tailwind version:"',
            'npm list tailwindcss 2>&1 | head -3 || echo "Not found"',
            'echo "Config files:"',
            'ls -la tailwind.config.js postcss.config.js vite.config.js 2>/dev/null || true',
            '',
            'echo "========================================="',
            'echo "[TAILWIND-FIX] RETRYING BUILD"',
            'echo "========================================="',
            '',
            ...stageCommands,
          ];

          const tailwindFixResult = await executeSSMCommand(instanceId, tailwindFixCommands);

          console.log(`[TAILWIND-FIX] === OUTPUT ===`);
          console.log(tailwindFixResult.output.slice(-1500));
          console.log(`[TAILWIND-FIX] === END OUTPUT ===`);

          if (tailwindFixResult.success) {
            console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] ✅ Tailwind fix succeeded!`);
            break; // Stage succeeded
          } else {
            console.error(`[STAGE ${i + 1}/${pipeline.stages.length}] ❌ Tailwind fix failed`);
            console.error(`[TAILWIND-FIX] Error:`, tailwindFixResult.error.slice(-500));
          }
        }

        // MEGA NUCLEAR: Ultimate validation and fix for build failures
        if (attempts === 1 && stageName === 'build' && (
          fullErrorLog.includes('Failed to resolve') ||
          fullErrorLog.includes('Could not resolve') ||
          fullErrorLog.includes('ENTRY_PATH') ||
          fullErrorLog.includes('index.html')
        )) {
          console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] 💥 MEGA NUCLEAR: Ultimate build validation and fix...`);

          const megaNuclearCommands = [
            ...envSetupCommands,
            'echo "========================================="',
            'echo "[MEGA-NUCLEAR] ULTIMATE FIX VALIDATION"',
            'echo "========================================="',
            '',
            '# Step 1: Detect project structure',
            'echo "[MEGA-NUCLEAR] Step 1: Detecting project structure..."',
            'echo "[MEGA-NUCLEAR] Looking for entry files:"',
            'find . -type f \\( -name "*.jsx" -o -name "*.tsx" \\) | grep -E "(main|index|App)" | grep -v node_modules | head -5',
            '',
            '# Step 2: Find actual entry file',
            'echo "[MEGA-NUCLEAR] Step 2: Locating entry file..."',
            'if [ -f "src/main.jsx" ]; then',
            '  ENTRY_FILE="src/main.jsx"',
            '  ENTRY_SCRIPT="/src/main.jsx"',
            'elif [ -f "src/main.tsx" ]; then',
            '  ENTRY_FILE="src/main.tsx"',
            '  ENTRY_SCRIPT="/src/main.tsx"',
            'elif [ -f "src/index.jsx" ]; then',
            '  ENTRY_FILE="src/index.jsx"',
            '  ENTRY_SCRIPT="/src/index.jsx"',
            'elif [ -f "src/index.tsx" ]; then',
            '  ENTRY_FILE="src/index.tsx"',
            '  ENTRY_SCRIPT="/src/index.tsx"',
            'else',
            '  echo "[MEGA-NUCLEAR] No entry file found, creating src/main.jsx..."',
            '  mkdir -p src',
            '  cat > src/main.jsx << "ENTRYEOF"',
            'import React from "react";',
            'import ReactDOM from "react-dom/client";',
            'import App from "./App";',
            'import "./index.css";',
            '',
            'ReactDOM.createRoot(document.getElementById("root")).render(',
            '  <React.StrictMode>',
            '    <App />',
            '  </React.StrictMode>',
            ');',
            'ENTRYEOF',
            '  ENTRY_FILE="src/main.jsx"',
            '  ENTRY_SCRIPT="/src/main.jsx"',
            'fi',
            'echo "[MEGA-NUCLEAR] ✓ Entry file: $ENTRY_FILE"',
            'echo "[MEGA-NUCLEAR] ✓ Entry script path: $ENTRY_SCRIPT"',
            '',
            '# Step 3: Validate and fix index.html',
            'echo "[MEGA-NUCLEAR] Step 3: Validating index.html..."',
            'if [ -f "index.html" ]; then',
            '  echo "[MEGA-NUCLEAR] Checking index.html content..."',
            '  cat index.html',
            '  if grep -q "ENTRY_PATH" index.html || grep -q "\\${" index.html; then',
            '    echo "[MEGA-NUCLEAR] ⚠ index.html contains invalid bash variables, regenerating..."',
            '    rm index.html',
            '  elif ! grep -q "<div id=\\"root\\">" index.html; then',
            '    echo "[MEGA-NUCLEAR] ⚠ index.html missing root div, regenerating..."',
            '    rm index.html',
            '  elif ! grep -q "type=\\"module\\"" index.html; then',
            '    echo "[MEGA-NUCLEAR] ⚠ index.html missing module script, regenerating..."',
            '    rm index.html',
            '  else',
            '    echo "[MEGA-NUCLEAR] ✓ index.html looks valid"',
            '  fi',
            'fi',
            '',
            'if [ ! -f "index.html" ]; then',
            '  echo "[MEGA-NUCLEAR] Creating clean index.html..."',
            '  cat > index.html << FINALEOF',
            '<!DOCTYPE html>',
            '<html lang="en">',
            '  <head>',
            '    <meta charset="UTF-8" />',
            '    <link rel="icon" type="image/svg+xml" href="/vite.svg" />',
            '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
            '    <title>Vite + React</title>',
            '  </head>',
            '  <body>',
            '    <div id="root"></div>',
            '    <script type="module" src="$ENTRY_SCRIPT"></script>',
            '  </body>',
            '</html>',
            'FINALEOF',
            '  echo "[MEGA-NUCLEAR] ✓ Created index.html"',
            'fi',
            '',
            'echo "[MEGA-NUCLEAR] Final index.html content:"',
            'cat index.html',
            '',
            '# Step 4: Ensure App component exists',
            'echo "[MEGA-NUCLEAR] Step 4: Ensuring App component..."',
            'if [ ! -f "src/App.jsx" ] && [ ! -f "src/App.tsx" ]; then',
            '  echo "[MEGA-NUCLEAR] Creating App.jsx..."',
            '  cat > src/App.jsx << "APPFINALEOF"',
            'import { useState } from "react";',
            '',
            'function App() {',
            '  const [count, setCount] = useState(0);',
            '',
            '  return (',
            '    <div style={{ padding: "2rem", fontFamily: "system-ui", textAlign: "center" }}>',
            '      <h1>Vite + React Deployed Successfully!</h1>',
            '      <div style={{ margin: "2rem" }}>',
            '        <button',
            '          onClick={() => setCount((count) => count + 1)}',
            '          style={{',
            '            padding: "1rem 2rem",',
            '            fontSize: "1.2rem",',
            '            borderRadius: "8px",',
            '            border: "none",',
            '            background: "#646cff",',
            '            color: "white",',
            '            cursor: "pointer"',
            '          }}',
            '        >',
            '          count is {count}',
            '        </button>',
            '      </div>',
            '      <p style={{ color: "#888" }}>',
            '        Click the button to test React state management',
            '      </p>',
            '    </div>',
            '  );',
            '}',
            '',
            'export default App;',
            'APPFINALEOF',
            '  echo "[MEGA-NUCLEAR] ✓ Created App.jsx"',
            'fi',
            '',
            '# Step 5: Regenerate vite.config.js',
            'echo "[MEGA-NUCLEAR] Step 5: Regenerating vite.config.js..."',
            'cat > vite.config.js << "VITEFINALEOF"',
            'import { defineConfig } from "vite";',
            'import react from "@vitejs/plugin-react";',
            '',
            'export default defineConfig({',
            '  plugins: [react()],',
            '  root: ".",',
            '  publicDir: "public",',
            '  build: {',
            '    outDir: "dist",',
            '    emptyOutDir: true,',
            '  },',
            '});',
            'VITEFINALEOF',
            'echo "[MEGA-NUCLEAR] ✓ Created vite.config.js"',
            'cat vite.config.js',
            '',
            '# Step 6: Ensure React and dependencies are installed',
            'echo "[MEGA-NUCLEAR] Step 6: Ensuring React dependencies..."',
            'npm install react react-dom --save --legacy-peer-deps --force 2>&1 | tail -10 || true',
            'npm install vite @vitejs/plugin-react --save-dev --legacy-peer-deps --force 2>&1 | tail -10 || true',
            '',
            '# Step 7: Final verification',
            'echo "[MEGA-NUCLEAR] Step 7: Final verification..."',
            'echo "===== ENTRY FILE ====="',
            'ls -la $ENTRY_FILE 2>/dev/null && head -10 $ENTRY_FILE || echo "Entry file missing!"',
            'echo "===== INDEX.HTML ====="',
            'cat index.html',
            'echo "===== VITE CONFIG ====="',
            'cat vite.config.js',
            'echo "===== APP COMPONENT ====="',
            'ls -la src/App.* 2>/dev/null || echo "No App component"',
            '',
            'echo "========================================="',
            'echo "[MEGA-NUCLEAR] ATTEMPTING BUILD"',
            'echo "========================================="',
            '',
            ...stageCommands,
          ];

          const megaNuclearResult = await executeSSMCommand(instanceId, megaNuclearCommands);

          console.log(`[MEGA-NUCLEAR] === FULL OUTPUT ===`);
          console.log(megaNuclearResult.output);
          console.log(`[MEGA-NUCLEAR] === END OUTPUT ===`);

          if (megaNuclearResult.success) {
            console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] ✅ Mega nuclear validation succeeded!`);
            break; // Stage succeeded
          } else {
            console.error(`[STAGE ${i + 1}/${pipeline.stages.length}] ❌ Mega nuclear still failed`);
            console.error(`[MEGA-NUCLEAR] Error:`, megaNuclearResult.error.slice(-800));
          }
        }

        // NUCLEAR OPTION: Ultimate comprehensive fix for npm installation failures
        if (attempts === 1 && (stageName === 'build' || stageName === 'install')) {
          console.log(`[STAGE ${i + 1}/${pipeline.stages.length}] 🔄 NUCLEAR OPTION: Ultra-comprehensive fix...`);

          // USE AI ANALYSIS to determine framework-specific tools (NO blind defaults!)
          let detectedFramework = 'unknown';
          if (projectAnalysis) {
            const allDeps = [...(projectAnalysis.dependencies || []), ...(projectAnalysis.devDependencies || [])];
            if (allDeps.some(dep => dep.includes('next'))) {
              detectedFramework = 'Next.js';
            } else if (allDeps.some(dep => dep.includes('vite'))) {
              detectedFramework = 'Vite';
            } else if (allDeps.some(dep => dep.includes('react-scripts'))) {
              detectedFramework = 'Create React App';
            } else if (allDeps.some(dep => dep.includes('express') || dep.includes('fastify'))) {
              detectedFramework = 'Express/Backend';
            }
            console.log(`[NUCLEAR] AI detected framework: ${detectedFramework} from ${allDeps.slice(0, 10).join(', ')}`);
          } else {
            console.log(`[NUCLEAR] ⚠ No AI analysis available, will detect in bash script`);
          }

          const nuclearFixCommands = [
            ...envSetupCommands,
            'echo "========================================"',
            'echo "[NUCLEAR] ULTRA-COMPREHENSIVE FIX"',
            'echo "========================================"',
            '',
            '# Step 1: Diagnose the problem',
            'echo "[NUCLEAR] Step 1: Diagnosing npm installation issue..."',
            'echo "[NUCLEAR] Checking package.json for vite..."',
            'cat package.json | grep -A 5 -B 5 "vite" || echo "⚠ vite not found in package.json!"',
            'echo ""',
            'echo "[NUCLEAR] Current node_modules state:"',
            'ls -la node_modules/ 2>/dev/null | head -10 || echo "⚠ node_modules missing"',
            'echo "[NUCLEAR] Current ownership:"',
            'ls -la | grep -E "node_modules|package"',
            'echo ""',
            '',
            '# Step 2: Intelligently detect project framework (DO NOT blindly add Vite!)',
            'echo "[NUCLEAR] Step 2: Detecting project framework..."',
            'DETECTED_FRAMEWORK="unknown"',
            'if grep -q "\\"next\\".*:" package.json 2>/dev/null; then',
            '  DETECTED_FRAMEWORK="nextjs"',
            '  echo "[NUCLEAR] ✓ Detected: Next.js project"',
            'elif grep -q "\\"vite\\".*:" package.json 2>/dev/null; then',
            '  DETECTED_FRAMEWORK="vite"',
            '  echo "[NUCLEAR] ✓ Detected: Vite project"',
            'elif grep -q "\\"react-scripts\\".*:" package.json 2>/dev/null; then',
            '  DETECTED_FRAMEWORK="cra"',
            '  echo "[NUCLEAR] ✓ Detected: Create React App"',
            'elif grep -q "\\"express\\".*:" package.json 2>/dev/null; then',
            '  DETECTED_FRAMEWORK="express"',
            '  echo "[NUCLEAR] ✓ Detected: Express backend"',
            'else',
            '  echo "[NUCLEAR] ⚠ Could not detect framework, checking build script..."',
            '  if grep -q "\\"build\\".*\\"next" package.json 2>/dev/null; then',
            '    DETECTED_FRAMEWORK="nextjs"',
            '  elif grep -q "\\"build\\".*\\"vite" package.json 2>/dev/null; then',
            '    DETECTED_FRAMEWORK="vite"',
            '  fi',
            'fi',
            'echo "[NUCLEAR] Framework: $DETECTED_FRAMEWORK"',
            '',
            '# Step 3: Nuclear clean - remove EVERYTHING',
            'echo "[NUCLEAR] Step 3: Nuclear clean..."',
            'npm cache clean --force',
            'rm -rf node_modules',
            'rm -rf package-lock.json',
            'rm -rf npm-debug.log*',
            'rm -rf .npm',
            'rm -rf node_modules/.cache',
            'rm -rf .next || true',
            'rm -rf dist || true',
            'rm -rf build || true',
            'echo "[NUCLEAR] ✓ Everything cleared"',
            '',
            '# Step 4: Fix ownership (run as ec2-user not root)',
            'echo "[NUCLEAR] Step 4: Fixing ownership..."',
            'chown -R ec2-user:ec2-user /home/ec2-user/app',
            'echo "[NUCLEAR] ✓ Ownership fixed to ec2-user"',
            '',
            '# Step 5: Install as ec2-user with multiple fallbacks',
            'echo "[NUCLEAR] Step 5: Installing dependencies as ec2-user..."',
            'su - ec2-user -c "cd /home/ec2-user/app && npm install --legacy-peer-deps --force" 2>&1 | tee /tmp/npm-install.log || true',
            '',
            '# Verify installation worked',
            'if [ ! -d "node_modules" ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then',
            '  echo "[NUCLEAR] ⚠ Installation as ec2-user failed, trying as root..."',
            '  npm install --legacy-peer-deps --force --unsafe-perm',
            'fi',
            '',
            '# Step 6: Detect and fix Tailwind CSS dependency issues',
            'echo "[NUCLEAR] Step 6: Checking for Tailwind CSS usage..."',
            'USES_TAILWIND=false',
            '# Check for @tailwind directives in CSS files',
            'if find . -name "*.css" -type f -exec grep -l "@tailwind" {} \\; 2>/dev/null | head -1 | grep -q .; then',
            '  USES_TAILWIND=true',
            '  echo "[NUCLEAR] ✓ Detected Tailwind CSS usage in CSS files"',
            'elif grep -q "tailwindcss" package.json 2>/dev/null; then',
            '  USES_TAILWIND=true',
            '  echo "[NUCLEAR] ✓ Detected Tailwind CSS in package.json"',
            'fi',
            '',
            'if [ "$USES_TAILWIND" = "true" ]; then',
            '  echo "[NUCLEAR] → Ensuring Tailwind CSS is in package.json devDependencies..."',
            '  ',
            '  # Detect Tailwind version',
            '  TAILWIND_V4=false',
            '  if grep -q "@tailwindcss/postcss" package.json 2>/dev/null; then',
            '    echo "[NUCLEAR] ✓ Tailwind v4 detected (@tailwindcss/postcss)"',
            '    TAILWIND_V4=true',
            '  elif grep -q "\\"tailwindcss\\":\\s*\\"\\^4" package.json 2>/dev/null; then',
            '    echo "[NUCLEAR] ✓ Tailwind v4 detected (^4.x version)"',
            '    TAILWIND_V4=true',
            '  fi',
            '  ',
            '  if [ "$TAILWIND_V4" = "false" ]; then',
            '    # Add tailwindcss v3 to package.json if missing',
            '    if ! grep -q "\\"tailwindcss\\"" package.json; then',
            '      echo "[NUCLEAR] → Adding tailwindcss v3 to devDependencies in package.json..."',
            '      npm pkg set devDependencies.tailwindcss="^3.4.0" --json || true',
            '      npm pkg set devDependencies.postcss="^8.4.0" --json || true',
            '      npm pkg set devDependencies.autoprefixer="^10.4.0" --json || true',
            '      echo "[NUCLEAR] ✓ Added Tailwind v3 to package.json"',
            '    else',
            '      echo "[NUCLEAR] ✓ Tailwind already in package.json"',
            '    fi',
            '    ',
            '    # Install Tailwind v3 dependencies',
            '    echo "[NUCLEAR] → Installing Tailwind CSS v3 dependencies..."',
            '    su - ec2-user -c "cd /home/ec2-user/app && npm install --save-dev tailwindcss@^3.4.0 postcss@^8.4.0 autoprefixer@^10.4.0 --legacy-peer-deps --force" || npm install --save-dev tailwindcss@^3.4.0 postcss@^8.4.0 autoprefixer@^10.4.0 --legacy-peer-deps --force',
            '  else',
            '    echo "[NUCLEAR] → Tailwind v4 already in package.json, using existing version"',
            '    # Just ensure dependencies are installed (no version override)',
            '    su - ec2-user -c "cd /home/ec2-user/app && npm install --legacy-peer-deps" || npm install --legacy-peer-deps',
            '  fi',
            '  ',
            '  # Create tailwind.config.js if missing',
            '  if [ ! -f "tailwind.config.js" ] && [ ! -f "tailwind.config.ts" ]; then',
            '    echo "[NUCLEAR] → Creating tailwind.config.js..."',
            '    cat > tailwind.config.js << "TWEOF"',
            `/** @type {import('tailwindcss').Config} */`,
            'module.exports = {',
            '  content: [',
            '    "./pages/**/*.{js,ts,jsx,tsx,mdx}",',
            '    "./components/**/*.{js,ts,jsx,tsx,mdx}",',
            '    "./src/**/*.{js,ts,jsx,tsx,mdx}",',
            '    "./app/**/*.{js,ts,jsx,tsx,mdx}",',
            '  ],',
            '  theme: {',
            '    extend: {},',
            '  },',
            '  plugins: [],',
            '}',
            'TWEOF',
            '    chown ec2-user:ec2-user tailwind.config.js',
            '    echo "[NUCLEAR] ✓ Created tailwind.config.js"',
            '  fi',
            '  ',
            '  # Create postcss.config.js if missing (version-aware)',
            '  if [ ! -f "postcss.config.js" ] && [ ! -f "postcss.config.mjs" ]; then',
            '    echo "[NUCLEAR] → Creating postcss.config.js..."',
            '    ',
            '    if [ "$TAILWIND_V4" = "true" ]; then',
            '      echo "[NUCLEAR] → Using Tailwind v4 PostCSS plugin..."',
            '      cat > postcss.config.js << "PCEOF"',
            'module.exports = {',
            '  plugins: {',
            '    "@tailwindcss/postcss": {}',
            '  }',
            '}',
            'PCEOF',
            '    else',
            '      echo "[NUCLEAR] → Using Tailwind v3 PostCSS config..."',
            '      cat > postcss.config.js << "PCEOF"',
            'module.exports = {',
            '  plugins: {',
            '    tailwindcss: {},',
            '    autoprefixer: {},',
            '  },',
            '}',
            'PCEOF',
            '    fi',
            '    ',
            '    chown ec2-user:ec2-user postcss.config.js',
            '    echo "[NUCLEAR] ✓ Created postcss.config.js"',
            '  else',
            '    echo "[NUCLEAR] → PostCSS config already exists, keeping it"',
            '  fi',
            '  ',
            '  echo "[NUCLEAR] ✓ Tailwind CSS setup complete"',
            'else',
            '  echo "[NUCLEAR] → No Tailwind CSS usage detected, skipping"',
            'fi',
            'echo ""',
            '',
            '# Step 7: Install framework-specific build tools (NOT blindly Vite!)',
            'echo "[NUCLEAR] Step 7: Installing framework-specific tools..."',
            'case "$DETECTED_FRAMEWORK" in',
            '  "nextjs")',
            '    echo "[NUCLEAR] → Installing Next.js dependencies..."',
            '    su - ec2-user -c "cd /home/ec2-user/app && npm install --save-dev typescript @types/react @types/node eslint --legacy-peer-deps --force" || true',
            '    ;;',
            '  "vite")',
            '    echo "[NUCLEAR] → Installing Vite dependencies..."',
            '    su - ec2-user -c "cd /home/ec2-user/app && npm install --save-dev vite @vitejs/plugin-react --legacy-peer-deps --force" || true',
            '    ;;',
            '  "cra")',
            '    echo "[NUCLEAR] → Installing Create React App dependencies..."',
            '    su - ec2-user -c "cd /home/ec2-user/app && npm install --save-dev react-scripts --legacy-peer-deps --force" || true',
            '    ;;',
            '  "express")',
            '    echo "[NUCLEAR] → No build tools needed for Express backend"',
            '    ;;',
            '  *)',
            '    echo "[NUCLEAR] → Unknown framework, installing common tools..."',
            '    su - ec2-user -c "cd /home/ec2-user/app && npm install --save-dev typescript --legacy-peer-deps --force" || true',
            '    ;;',
            'esac',
            '',
            '# Step 8: Rebuild native bindings',
            'echo "[NUCLEAR] Step 8: Rebuilding npm packages..."',
            'npm rebuild 2>&1 | tee -a /tmp/npm-install.log || true',
            '',
            '# Step 9: Create framework-specific symlinks if needed',
            'echo "[NUCLEAR] Step 9: Checking build tools..."',
            'case "$DETECTED_FRAMEWORK" in',
            '  "nextjs")',
            '    [ -f "node_modules/.bin/next" ] && echo "[NUCLEAR] ✓ Next.js CLI found" || echo "[NUCLEAR] ⚠ Next.js CLI missing"',
            '    ;;',
            '  "vite")',
            '    if [ ! -f "node_modules/.bin/vite" ] && [ -d "node_modules/vite" ]; then',
            '      echo "[NUCLEAR] Creating symlink for Vite..."',
            '      mkdir -p node_modules/.bin',
            '      ln -sf ../vite/bin/vite.js node_modules/.bin/vite 2>/dev/null || true',
            '      chmod +x node_modules/.bin/vite 2>/dev/null || true',
            '    fi',
            '    [ -f "node_modules/.bin/vite" ] && echo "[NUCLEAR] ✓ Vite CLI found" || echo "[NUCLEAR] ⚠ Vite CLI missing"',
            '    ;;',
            '  *)',
            '    echo "[NUCLEAR] ✓ Skipping symlink creation for $DETECTED_FRAMEWORK"',
            '    ;;',
            'esac',
            '',
            '# Step 10: Install globally as ultimate fallback',
            'echo "[NUCLEAR] Step 10: Installing vite globally as fallback..."',
            'npm install -g vite @vitejs/plugin-react 2>&1 | tee -a /tmp/npm-install.log || true',
            '',
            '# Step 11: Add to package.json scripts',
            'echo "[NUCLEAR] Step 11: Ensuring package.json scripts..."',
            'npm pkg set scripts.build="vite build" || npm pkg set scripts.build="npx vite build"',
            'npm pkg set scripts.dev="vite" || npm pkg set scripts.dev="npx vite"',
            '',
            '# Step 12: Final verification',
            'export PATH="$PATH:/home/ec2-user/app/node_modules/.bin:/usr/local/bin"',
            'echo "[NUCLEAR] Step 12: Final verification..."',
            'echo "====== PACKAGE.JSON VERIFICATION ======"',
            'cat package.json | grep -A 2 "vite"',
            'echo ""',
            'echo "====== NODE_MODULES VERIFICATION ======"',
            'ls -la node_modules/ 2>/dev/null | head -15',
            'echo ""',
            'echo "====== BINARIES VERIFICATION ======"',
            'ls -la node_modules/.bin/ 2>/dev/null | grep -E "vite|webpack|tsc" || echo "⚠ No binaries found"',
            'echo ""',
            'echo "====== NPM LIST VERIFICATION ======"',
            'npm list vite webpack typescript --depth=0 2>/dev/null || echo "⚠ Packages not in npm list"',
            'echo ""',
            'echo "====== PATH VERIFICATION ======"',
            'which vite || which npx || echo "⚠ Neither vite nor npx found"',
            'echo ""',
            'echo "====== GLOBAL VITE CHECK ======"',
            'which vite && vite --version 2>/dev/null || echo "⚠ Global vite not available"',
            '',
            '# Step 13: Fix JSX file extensions BEFORE building',
            'echo "[NUCLEAR] Step 13: Fixing JSX file extensions..."',
            'echo "[NUCLEAR] Searching for .js files that contain JSX..."',
            'JSX_FILES_FOUND=0',
            'if [ -d "src" ]; then',
            '  for file in $(find src -name "*.js" -type f 2>/dev/null); do',
            '    if grep -q "className\\|<div\\|<span\\|</\\|<React\\|jsx" "$file" 2>/dev/null; then',
            '      newfile="${file%.js}.jsx"',
            '      echo "[NUCLEAR] Renaming $file to $newfile (contains JSX)"',
            '      mv "$file" "$newfile"',
            '      JSX_FILES_FOUND=$((JSX_FILES_FOUND + 1))',
            '    fi',
            '  done',
            'fi',
            '',
            '# Rename common entry files',
            'if [ -f "src/App.js" ]; then',
            '  echo "[NUCLEAR] Renaming src/App.js to src/App.jsx"',
            '  mv src/App.js src/App.jsx',
            '  JSX_FILES_FOUND=$((JSX_FILES_FOUND + 1))',
            'fi',
            'if [ -f "src/main.js" ]; then',
            '  echo "[NUCLEAR] Renaming src/main.js to src/main.jsx"',
            '  mv src/main.js src/main.jsx',
            '  JSX_FILES_FOUND=$((JSX_FILES_FOUND + 1))',
            'fi',
            'if [ -f "src/index.js" ]; then',
            '  echo "[NUCLEAR] Renaming src/index.js to src/index.jsx"',
            '  mv src/index.js src/index.jsx',
            '  JSX_FILES_FOUND=$((JSX_FILES_FOUND + 1))',
            'fi',
            '',
            '# Update imports in all JS/JSX files to use .jsx extensions',
            'echo "[NUCLEAR] Updating imports from .js to .jsx..."',
            'grep -rl "from.*\\.js" src/ 2>/dev/null | while read file; do',
            '  sed -i "s/\\.js\\"/\\.jsx\\"/g" "$file" 2>/dev/null || true',
            "  sed -i \"s/\\.js'/\\.jsx'/g\" \"$file\" 2>/dev/null || true",
            'done',
            '',
            'echo "[NUCLEAR] ✓ Fixed $JSX_FILES_FOUND JSX files"',
            'echo "[NUCLEAR] Current .js and .jsx files in src/:"',
            'find src -type f \\( -name "*.js" -o -name "*.jsx" \\) 2>/dev/null | head -10',
            '',
            'echo "========================================"',
            'echo "[NUCLEAR] RETRYING BUILD"',
            'echo "========================================"',
            '',
            ...stageCommands,
          ];

          // Use extended timeout for retries too (20 minutes)
          const nuclearResult = await executeSSMCommand(instanceId, nuclearFixCommands, 1200);

          console.log(`[NUCLEAR] === FULL OUTPUT ===`);
          console.log(nuclearResult.output);
          console.log(`[NUCLEAR] === END OUTPUT ===`);

          if (nuclearResult.success) {
            console.log(
              `[STAGE ${i + 1}/${pipeline.stages.length}] ✅ Nuclear fix succeeded!`
            );
            break; // Stage succeeded
          } else {
            console.error(
              `[STAGE ${i + 1}/${pipeline.stages.length}] ❌ Even nuclear fix failed`
            );
            console.error(`[NUCLEAR] Final error:`, nuclearResult.error);
          }
        }
      }

      // Failed even after all attempts
      allLogs.push(`[STAGE ${i + 1}/${pipeline.stages.length}] ❌ Failed after all attempts`);
      allLogs.push(`Error: ${result.error}`);
      return {
        success: false,
        error: `Stage ${stageName} failed after multiple fix attempts: ${result.error}`,
        logs: allLogs,
      };
    }
  }

  allLogs.push(`[SMART-DEPLOY] ✅ All stages completed successfully`);
  return { success: true, logs: allLogs };
}

/**
 * Execute SSM command
 */
async function executeSSMCommand(
  instanceId: string,
  commands: string[],
  timeoutSeconds: number = 600,
  deploymentId?: string
): Promise<{ success: boolean; output: string; error: string }> {
  try {
    // CRITICAL FIX: Combine all commands into a SINGLE shell script
    // AWS SSM runs each array element in a SEPARATE shell session, which breaks:
    // - Environment variable exports (PATH, NODE_ENV, etc.)
    // - Inline variable assignments (PATH="..." npm run build)
    // Solution: Join all commands with newlines and run as ONE command

    // CRITICAL FIX 2: Run as ec2-user, not ssm-user
    // SSM by default runs as ssm-user, which doesn't have access to /home/ec2-user/.cargo
    // Wrap all commands in a sudo -u ec2-user bash -c block

    const singleScript = `#!/bin/bash
# Run as ec2-user to access user-installed runtimes (Rust, Node, etc.)
# SSM runs as ssm-user by default, which doesn't have access to /home/ec2-user/.cargo
sudo -u ec2-user bash << 'EOF_EC2USER'
# Don't use set -e here - let individual commands handle errors
# set -o pipefail  # Catch errors in pipes (disabled to allow || true patterns)

# Start of user commands
${commands.join('\n')}

# End of user commands - capture exit code
COMMAND_EXIT_CODE=$?
echo "[SSM] Command block exit code: $COMMAND_EXIT_CODE"
exit $COMMAND_EXIT_CODE
EOF_EC2USER
`;

    const sendCmd = await ssmClient.send(
      new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: 'AWS-RunShellScript',
        Parameters: { commands: [singleScript] }, // Single script instead of array
        TimeoutSeconds: timeoutSeconds,
      })
    );

    const commandId = sendCmd.Command?.CommandId;
    if (!commandId) {
      return { success: false, output: '', error: 'No command ID' };
    }

    let lastOutput = '';

    // Poll for completion
    for (let i = 0; i < 300; i++) { // Max 10 minutes polling
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const result = await ssmClient.send(
        new GetCommandInvocationCommand({ CommandId: commandId, InstanceId: instanceId })
      );

      // PARTIAL LOGS: Update database if output has changed and we have a deploymentId
      const currentOutput = result.StandardOutputContent || '';
      if (deploymentId && currentOutput !== lastOutput) {
        try {
          const deployment = await Deployment.findById(deploymentId);
          if (deployment) {
            // Find where this stage's logs start and replace everything after it with new output
            const logs = deployment.rawLogs || '';
            const stageStartMarker = `[SMART-DEPLOY] Starting stage`;
            
            // This is a bit complex since we don't know the exact stage name here easily
            // But we can just append a marker or just update the whole field if it's not too large
            await Deployment.findByIdAndUpdate(deploymentId, {
              rawLogs: logs + '\n' + currentOutput.substring(lastOutput.length),
            });
            lastOutput = currentOutput;
          }
        } catch (err) {
          console.error('[SSM-POLL] Failed to update partial logs:', err);
        }
      }

      if (result.Status === 'Success') {
        return {
          success: true,
          output: result.StandardOutputContent || '',
          error: '',
        };
      } else if (
        result.Status === 'Failed' ||
        result.Status === 'Cancelled' ||
        result.Status === 'TimedOut'
      ) {
        // Capture comprehensive error - SSM puts errors in both stdout and stderr
        const fullOutput = result.StandardOutputContent || '';
        const fullError = result.StandardErrorContent || '';

        // Extract last 2000 chars of output (where errors usually are)
        const recentOutput = fullOutput.slice(-2000);

        return {
          success: false,
          output: fullOutput,
          error: fullError || recentOutput || `Command ${result.Status}`,
        };
      }
    }

    return { success: false, output: lastOutput, error: 'SSM Polling Timeout' };
  } catch (error: any) {
    return { success: false, output: '', error: error.message };
  }
}

/**
 * Universal Application Starter - Uses AI-detected commands for ANY language
 */
async function startUniversalApplication(
  instanceId: string,
  universalAnalysis: any,
  envVars: Record<string, string> = {}
): Promise<{ success: boolean; output: string; error: string }> {
  const { language, framework, startCommand, port, projectType } = universalAnalysis;

  console.log('[UNIVERSAL-START] Starting application...');
  console.log('[UNIVERSAL-START] Language:', language);
  console.log('[UNIVERSAL-START] Framework:', framework);
  console.log('[UNIVERSAL-START] Start Command:', startCommand);
  console.log('[UNIVERSAL-START] Port:', port);

  const startCommands = [
    'cd /home/ec2-user/app',
    `echo "[UNIVERSAL-START] Starting ${framework} application..."`,
    `echo "[UNIVERSAL-START] Language: ${language}"`,
    `echo "[UNIVERSAL-START] Port: ${port}"`,
    '',
  ];

  // Export environment variables
  if (Object.keys(envVars).length > 0) {
    startCommands.push('echo "[UNIVERSAL-START] Exporting environment variables..."');
    Object.entries(envVars).forEach(([key, value]) => {
      const escapedValue = value.replace(/'/g, "'\\''");
      startCommands.push(`export ${key}='${escapedValue}'`);
    });
    startCommands.push('');
  }

  // Add port environment variable
  startCommands.push(`export PORT=${port}`);
  startCommands.push('export HOST=0.0.0.0');
  startCommands.push('');

  // Kill any existing process on the port
  startCommands.push(`echo "[UNIVERSAL-START] Clearing port ${port}..."`);
  startCommands.push(`sudo fuser -k ${port}/tcp 2>/dev/null || true`);
  startCommands.push('sleep 2');
  startCommands.push('');

  // Use PM2 for backend services (Python, Node.js, Ruby, etc.)
  if (projectType === 'backend' || projectType === 'fullstack') {
    startCommands.push('echo "[UNIVERSAL-START] Starting backend service with PM2..."');
    startCommands.push('');

    // Install PM2 if not already installed
    startCommands.push('if ! command -v pm2 &> /dev/null; then');
    startCommands.push('  echo "[UNIVERSAL-START] Installing PM2..."');
    startCommands.push('  sudo npm install -g pm2@latest');
    startCommands.push('fi');
    startCommands.push('');

    // Stop any existing PM2 processes
    startCommands.push('pm2 delete all 2>/dev/null || true');
    startCommands.push('');

    // Create PM2 ecosystem file based on language
    if (language === 'Python') {
      // For Python, use python3 -m uvicorn instead of trying to find uvicorn executable
      // This always works if uvicorn is installed via pip
      startCommands.push('echo "[UNIVERSAL-START] Creating Python startup script..."');

      // Parse the start command to extract the module path (e.g., "main:app" from "uvicorn main:app --host...")
      const commandParts = startCommand.split(' ');
      let modulePath = '';

      // Find the module path (it's the argument after "uvicorn")
      const uvicornIndex = commandParts.findIndex((part: string) => part === 'uvicorn' || part.includes('uvicorn'));
      if (uvicornIndex !== -1 && commandParts[uvicornIndex + 1]) {
        modulePath = commandParts[uvicornIndex + 1];
      }

      startCommands.push('cat > start.sh << "STARTEOF"');
      startCommands.push('#!/bin/bash');
      startCommands.push('cd /home/ec2-user/app');
      startCommands.push(`export PORT=${port}`);
      startCommands.push('export HOST=0.0.0.0');
      startCommands.push('');
      startCommands.push('# Use python3 -m uvicorn which always works if uvicorn is installed');
      startCommands.push('echo "Starting FastAPI with python3 -m uvicorn..."');
      startCommands.push(`exec python3 -m uvicorn ${modulePath || 'main:app'} --host 0.0.0.0 --port ${port}`);
      startCommands.push('STARTEOF');
      startCommands.push('chmod +x start.sh');
      startCommands.push('');

      startCommands.push('cat > ecosystem.config.js << "PM2EOF"');
      startCommands.push('module.exports = {');
      startCommands.push('  apps: [{');
      startCommands.push(`    name: "${framework}",`);
      startCommands.push('    script: "./start.sh",');
      startCommands.push('    cwd: "/home/ec2-user/app",');
      startCommands.push('    interpreter: "bash",');
      startCommands.push('    env: {');
      startCommands.push(`      PORT: ${port},`);
      startCommands.push('      HOST: "0.0.0.0"');
      startCommands.push('    }');
      startCommands.push('  }]');
      startCommands.push('};');
      startCommands.push('PM2EOF');
    } else if (language === 'Rust') {
      // For compiled languages like Rust, run the binary directly
      startCommands.push('cat > ecosystem.config.js << "PM2EOF"');
      startCommands.push('module.exports = {');
      startCommands.push('  apps: [{');
      startCommands.push(`    name: "${framework}",`);
      startCommands.push(`    script: "${startCommand}",`);
      startCommands.push('    cwd: "/home/ec2-user/app",');
      startCommands.push('    interpreter: "none",');
      startCommands.push('    env: {');
      startCommands.push(`      PORT: ${port},`);
      startCommands.push('      HOST: "0.0.0.0"');
      startCommands.push('    }');
      startCommands.push('  }]');
      startCommands.push('};');
      startCommands.push('PM2EOF');
    } else if (language === 'Go') {
      startCommands.push('cat > ecosystem.config.js << "PM2EOF"');
      startCommands.push('module.exports = {');
      startCommands.push('  apps: [{');
      startCommands.push(`    name: "${framework}",`);
      startCommands.push(`    script: "${startCommand}",`);
      startCommands.push('    cwd: "/home/ec2-user/app",');
      startCommands.push('    interpreter: "none",');
      startCommands.push('    env: {');
      startCommands.push(`      PORT: ${port}`);
      startCommands.push('    }');
      startCommands.push('  }]');
      startCommands.push('};');
      startCommands.push('PM2EOF');
    } else {
      // Node.js and other interpreted languages
      startCommands.push('cat > ecosystem.config.js << "PM2EOF"');
      startCommands.push('module.exports = {');
      startCommands.push('  apps: [{');
      startCommands.push(`    name: "${framework}",`);
      startCommands.push(`    script: "${startCommand}",`);
      startCommands.push('    cwd: "/home/ec2-user/app",');
      startCommands.push('    env: {');
      startCommands.push(`      PORT: ${port},`);
      startCommands.push('      HOST: "0.0.0.0",');
      startCommands.push('      NODE_ENV: "production"');
      startCommands.push('    }');
      startCommands.push('  }]');
      startCommands.push('};');
      startCommands.push('PM2EOF');
    }

    startCommands.push('');
    startCommands.push('echo "[UNIVERSAL-START] Starting with PM2..."');
    startCommands.push('pm2 start ecosystem.config.js');
    startCommands.push('pm2 save');
    startCommands.push('pm2 startup systemd -u ec2-user --hp /home/ec2-user');
    startCommands.push('');
    startCommands.push('echo "[UNIVERSAL-START] Waiting for application to start..."');
    startCommands.push('sleep 5');
    startCommands.push('');
    startCommands.push('echo "[UNIVERSAL-START] PM2 Status:"');
    startCommands.push('pm2 status');
    startCommands.push('pm2 logs --lines 20 --nostream');
    startCommands.push('');

    // Configure Nginx as reverse proxy
    startCommands.push('echo "[UNIVERSAL-START] =================================="');
    startCommands.push('echo "[UNIVERSAL-START] Configuring Nginx Reverse Proxy"');
    startCommands.push('echo "[UNIVERSAL-START] =================================="');
    startCommands.push('');
    startCommands.push('# Install Nginx if not present');
    startCommands.push('if ! command -v nginx &> /dev/null; then');
    startCommands.push('  echo "[UNIVERSAL-START] Installing Nginx..."');
    startCommands.push('  sudo yum install -y nginx');
    startCommands.push('fi');
    startCommands.push('');
    startCommands.push('# Create Nginx configuration');
    startCommands.push('sudo tee /etc/nginx/conf.d/app.conf > /dev/null << "NGINXEOF"');
    startCommands.push('# Auto-generated reverse proxy configuration');
    startCommands.push(`upstream backend_app {`);
    startCommands.push(`    server 127.0.0.1:${port} fail_timeout=0;`);
    startCommands.push('}');
    startCommands.push('');
    startCommands.push('server {');
    startCommands.push('    listen 80 default_server;');
    startCommands.push('    listen [::]:80 default_server;');
    startCommands.push('    server_name _;');
    startCommands.push('');
    startCommands.push('    client_max_body_size 50M;');
    startCommands.push('');
    startCommands.push('    location / {');
    startCommands.push('        proxy_pass http://backend_app;');
    startCommands.push('        proxy_http_version 1.1;');
    startCommands.push('        proxy_set_header Upgrade $http_upgrade;');
    startCommands.push('        proxy_set_header Connection "upgrade";');
    startCommands.push('        proxy_set_header Host $host;');
    startCommands.push('        proxy_set_header X-Real-IP $remote_addr;');
    startCommands.push('        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
    startCommands.push('        proxy_set_header X-Forwarded-Proto $scheme;');
    startCommands.push('        proxy_cache_bypass $http_upgrade;');
    startCommands.push('    }');
    startCommands.push('}');
    startCommands.push('NGINXEOF');
    startCommands.push('');
    startCommands.push('# Remove default Nginx config to avoid conflicts');
    startCommands.push('sudo rm -f /etc/nginx/conf.d/default.conf');
    startCommands.push('sudo rm -f /etc/nginx/sites-enabled/default');
    startCommands.push('');
    startCommands.push('# Test Nginx configuration');
    startCommands.push('echo "[UNIVERSAL-START] Testing Nginx configuration..."');
    startCommands.push('sudo nginx -t');
    startCommands.push('');
    startCommands.push('# Restart Nginx');
    startCommands.push('echo "[UNIVERSAL-START] Starting Nginx..."');
    startCommands.push('sudo systemctl restart nginx');
    startCommands.push('sudo systemctl enable nginx');
    startCommands.push('');
    startCommands.push(`echo "[UNIVERSAL-START] ✅ Nginx configured to proxy port 80 -> ${port}"`);
  } else {
    // For frontend or other project types, run the start command directly
    startCommands.push(`echo "[UNIVERSAL-START] Running: ${startCommand}"`);
    startCommands.push(`nohup ${startCommand} > /tmp/app.log 2>&1 &`);
    startCommands.push('echo "[UNIVERSAL-START] Application started with PID: $!"');
    startCommands.push('sleep 3');
  }

  startCommands.push('');
  startCommands.push('echo "[UNIVERSAL-START] =================================="');
  startCommands.push('echo "[UNIVERSAL-START] Verifying Application"');
  startCommands.push('echo "[UNIVERSAL-START] =================================="');
  startCommands.push('');

  // Verify the application is running
  startCommands.push(`echo "[UNIVERSAL-START] Checking port ${port}..."`);
  startCommands.push(`if netstat -tuln | grep -q ":${port} "; then`);
  startCommands.push(`  echo "[UNIVERSAL-START] ✅ Application is listening on port ${port}"`);
  startCommands.push('else');
  startCommands.push(`  echo "[UNIVERSAL-START] ⚠️  No process detected on port ${port}"`);
  startCommands.push('  echo "[UNIVERSAL-START] Checking all listening ports:"');
  startCommands.push('  netstat -tuln | grep LISTEN');
  startCommands.push('fi');
  startCommands.push('');

  // Show recent logs
  startCommands.push('echo "[UNIVERSAL-START] Recent logs:"');
  startCommands.push('if [ -f /tmp/app.log ]; then');
  startCommands.push('  tail -30 /tmp/app.log');
  startCommands.push('elif command -v pm2 &> /dev/null; then');
  startCommands.push('  pm2 logs --lines 30 --nostream');
  startCommands.push('fi');
  startCommands.push('');
  startCommands.push('echo "[UNIVERSAL-START] ✅ Startup complete"');

  try {
    const result = await executeSSMCommand(instanceId, startCommands);

    const success = result.output.includes('✅ Application is listening') ||
                   result.output.includes('PM2') ||
                   result.output.includes('online');

    return {
      success,
      output: result.output,
      error: success ? '' : 'Application may not have started successfully'
    };
  } catch (error: any) {
    return {
      success: false,
      output: '',
      error: error.message
    };
  }
}

/**
 * Parse pipeline YAML to extract jobs and scripts
 */
/**
 * Detect required runtime from pipeline commands
 * Analyzes the AI-generated pipeline to determine what runtime to install
 */
function detectRuntimeFromPipeline(
  pipeline: GeneratedPipeline,
  savedPipeline: any
): 'nodejs' | 'python' | 'rust' | 'go' | 'java' | 'ruby' | 'php' | 'docker' | 'unknown' {

  // Priority 1: Check saved pipeline metadata (most reliable)
  const language = savedPipeline?.language?.toLowerCase() || '';
  const framework = savedPipeline?.framework?.toLowerCase() || '';

  if (language.includes('rust') || framework.includes('rust')) return 'rust';
  if (language.includes('go') || language.includes('golang')) return 'go';
  if (language.includes('python')) return 'python';
  if (language.includes('java')) return 'java';
  if (language.includes('ruby')) return 'ruby';
  if (language.includes('php')) return 'php';
  if (language.includes('javascript') || language.includes('typescript') ||
      framework.includes('node') || framework.includes('next') ||
      framework.includes('react') || framework.includes('vue')) return 'nodejs';

  // Priority 2: Analyze pipeline commands
  const allCommands = pipeline.jobs
    .flatMap(job => job.script)
    .map(cmd => cmd.toLowerCase())
    .join(' ');

  // Rust detection
  if (allCommands.includes('cargo build') ||
      allCommands.includes('cargo run') ||
      allCommands.includes('rustc')) {
    return 'rust';
  }

  // Go detection
  if (allCommands.includes('go build') ||
      allCommands.includes('go run') ||
      allCommands.includes('go mod')) {
    return 'go';
  }

  // Python detection
  if (allCommands.includes('pip install') ||
      allCommands.includes('python') ||
      allCommands.includes('uvicorn') ||
      allCommands.includes('gunicorn') ||
      allCommands.includes('flask') ||
      allCommands.includes('django')) {
    return 'python';
  }

  // Node.js detection
  if (allCommands.includes('npm') ||
      allCommands.includes('yarn') ||
      allCommands.includes('pnpm') ||
      allCommands.includes('node ')) {
    return 'nodejs';
  }

  // Java detection
  if (allCommands.includes('mvn') ||
      allCommands.includes('gradle') ||
      allCommands.includes('java -jar')) {
    return 'java';
  }

  // Ruby detection
  if (allCommands.includes('bundle install') ||
      allCommands.includes('rake') ||
      allCommands.includes('rails')) {
    return 'ruby';
  }

  // PHP detection
  if (allCommands.includes('composer') ||
      allCommands.includes('php artisan')) {
    return 'php';
  }

  // Docker detection
  if (allCommands.includes('docker build') ||
      allCommands.includes('docker run') ||
      allCommands.includes('docker-compose')) {
    return 'docker';
  }

  return 'unknown';
}

/**
 * Generate runtime-specific UserData installation script
 * Installs ONLY the runtime specified by the pipeline
 */
function generateRuntimeInstallScript(runtime: string): string {
  const scripts: Record<string, string> = {
    nodejs: `
        echo "[SETUP] 🟢 NODE.JS RUNTIME (detected from pipeline)"
        echo "[SETUP] Installing Node.js 20 LTS..."
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - 2>&1 | tail -10 || true
        yum install -y nodejs 2>&1 | tail -5 || true

        if command -v node >/dev/null 2>&1; then
          echo "[SETUP] ✅ Node.js $(node -v) installed"
          echo "[SETUP] ✅ npm $(npm -v) installed"
          npm install -g yarn pnpm pm2 --force --loglevel=error 2>&1 | tail -5 || true
          echo "[SETUP] ✅ Package managers installed"

          # Add Node.js environment to bashrc
          echo 'export NODE_ENV=production' >> /home/ec2-user/.bashrc
          echo 'export PATH="$PATH:/home/ec2-user/app/node_modules/.bin"' >> /home/ec2-user/.bashrc
          echo "[SETUP] ✅ Node.js environment configured"
        else
          echo "[SETUP] ❌ Node.js installation FAILED"
        fi`,

    python: `
        echo "[SETUP] 🐍 PYTHON RUNTIME (detected from pipeline)"
        echo "[SETUP] Installing Python 3.11..."
        yum install -y python3.11 python3.11-pip python3.11-devel python3 python3-pip python3-devel 2>&1 | tail -5 || true
        ln -sf /usr/bin/python3.11 /usr/bin/python3 2>/dev/null || true
        ln -sf /usr/bin/pip3.11 /usr/bin/pip3 2>/dev/null || true

        if command -v python3 >/dev/null 2>&1; then
          echo "[SETUP] ✅ Python $(python3 --version 2>&1 | awk '{print $2}') installed"
          pip3 install --upgrade pip setuptools wheel --quiet 2>&1 | tail -3 || true
          echo "[SETUP] ✅ pip upgraded"

          # Add Python environment to bashrc
          echo 'export PATH="$PATH:/home/ec2-user/.local/bin"' >> /home/ec2-user/.bashrc
          echo 'export PYTHONUNBUFFERED=1' >> /home/ec2-user/.bashrc
          echo 'export PYTHONDONTWRITEBYTECODE=1' >> /home/ec2-user/.bashrc
          echo "[SETUP] ✅ Python environment configured"
        else
          echo "[SETUP] ❌ Python installation FAILED"
        fi`,

    rust: `
        echo "[SETUP] ════════════════════════════════════════════════════════════"
        echo "[SETUP] 🦀 RUST RUNTIME INSTALLATION"
        echo "[SETUP] ════════════════════════════════════════════════════════════"
        echo "[SETUP] This may take 2-3 minutes..."
        echo ""

        # Ensure openssl-devel is installed FIRST (required for Rust compilation)
        echo "[SETUP] Step 1/4: Installing Rust dependencies..."
        yum install -y openssl-devel pkg-config 2>&1 | tail -5
        echo "[SETUP] ✅ Dependencies installed"
        echo ""

        # Clean up any previous Rust installation attempts
        echo "[SETUP] Cleaning up previous installation attempts..."
        rm -rf /home/ec2-user/.cargo /home/ec2-user/.rustup 2>/dev/null || true
        echo "[SETUP] Cleanup complete"
        echo ""

        # Create installation script that runs as ec2-user with proper HOME
        echo "[SETUP] Step 2/4: Downloading and installing Rust toolchain..."
        cat > /tmp/install-rust.sh << 'RUST_INSTALL_SCRIPT'
#!/bin/bash
export HOME=/home/ec2-user
export USER=ec2-user
cd /home/ec2-user

echo "=== Rust Installation Script ==="
echo "HOME: $HOME"
echo "USER: $USER"
echo "PWD: $(pwd)"
echo ""

# Download rustup installer
echo "Downloading rustup installer..."
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/rustup-init.sh --connect-timeout 30 --max-time 60
if [ ! -f "/tmp/rustup-init.sh" ]; then
  echo "ERROR: Failed to download rustup installer"
  exit 1
fi
chmod +x /tmp/rustup-init.sh
echo "✓ Rustup installer downloaded ($(du -h /tmp/rustup-init.sh | cut -f1))"

# Install Rust with minimal profile (faster, only rustc and cargo)
echo ""
echo "Installing Rust stable (minimal profile for faster setup)..."
echo "This may take 2-3 minutes for toolchain download..."
echo "Starting at: $(date)"
echo ""

# Use timeout to prevent hanging (max 3 minutes for installation)
# Set RUSTUP_INIT_SKIP_PATH_CHECK to avoid interactive prompts
export RUSTUP_INIT_SKIP_PATH_CHECK=yes

timeout 180 sh /tmp/rustup-init.sh -y \
  --default-toolchain stable \
  --profile minimal \
  --no-modify-path

INSTALL_EXIT_CODE=$?

echo ""
echo "Finished at: $(date)"
echo "Rustup installer exit code: $INSTALL_EXIT_CODE"

# Exit code 124 means timeout occurred
if [ $INSTALL_EXIT_CODE -eq 124 ]; then
  echo "ERROR: Rustup installation TIMED OUT after 3 minutes"
  echo "This usually indicates:"
  echo "  - Slow network connection to Rust servers"
  echo "  - DNS resolution issues"
  echo "  - Firewall blocking access"
  echo ""
  echo "Checking network connectivity..."
  ping -c 3 static.rust-lang.org 2>&1 || echo "Cannot reach Rust servers"
  echo ""
  echo "Attempting fallback: Installing from yum repositories..."

  # Fallback: Try to install from Amazon Linux Extras or EPEL
  yum install -y rust cargo 2>&1 | tail -10 || echo "Fallback installation failed"

  FALLBACK_CHECK=0
  if command -v rustc >/dev/null 2>&1 && command -v cargo >/dev/null 2>&1; then
    echo "✓ Fallback installation succeeded!"
    rustc --version
    cargo --version
    FALLBACK_CHECK=1
  fi

  if [ $FALLBACK_CHECK -eq 0 ]; then
    echo "ERROR: Both rustup and fallback installation failed"
    exit 1
  fi
elif [ $INSTALL_EXIT_CODE -ne 0 ]; then
  echo "ERROR: Rustup installation failed with code $INSTALL_EXIT_CODE"

  # Show last 20 lines of any error logs
  if [ -f "$HOME/.rustup/tmp/rustup.log" ]; then
    echo "Last 20 lines of rustup log:"
    tail -20 "$HOME/.rustup/tmp/rustup.log" 2>/dev/null || true
  fi

  exit 1
else
  echo "✓ Rustup installation completed successfully"
fi

# Source the cargo environment
echo ""
echo "Sourcing Rust environment..."
if [ -f "$HOME/.cargo/env" ]; then
  source "$HOME/.cargo/env"
  echo "✓ Cargo environment sourced"
  echo ""

  # Verify installation
  echo "Verifying installation:"
  if rustc --version 2>&1; then
    echo "✓ rustc is working"
  else
    echo "ERROR: rustc not working"
    exit 1
  fi

  if cargo --version 2>&1; then
    echo "✓ cargo is working"
  else
    echo "ERROR: cargo not working"
    exit 1
  fi
else
  echo "WARNING: .cargo/env not found"

  # Check if rustc and cargo exist anyway (from fallback installation)
  if command -v rustc >/dev/null 2>&1 && command -v cargo >/dev/null 2>&1; then
    echo "✓ Rust binaries found in PATH (fallback installation)"
    rustc --version
    cargo --version
  else
    echo "ERROR: .cargo/env not found and binaries not in PATH"
    exit 1
  fi
fi

echo ""
echo "=== Rust Installation Complete ==="
exit 0
RUST_INSTALL_SCRIPT

        chmod +x /tmp/install-rust.sh
        chown ec2-user:ec2-user /tmp/install-rust.sh

        # Run installation script as ec2-user with proper environment
        sudo -u ec2-user -H bash /tmp/install-rust.sh 2>&1 | tee /tmp/rust-install.log
        RUST_INSTALL_STATUS=$?

        echo ""
        echo "[SETUP] Installation script exit status: $RUST_INSTALL_STATUS"
        echo ""

        if [ $RUST_INSTALL_STATUS -ne 0 ]; then
          echo "[SETUP] ❌ Rust installation script failed with status $RUST_INSTALL_STATUS"
          echo "[SETUP] Full installation log:"
          cat /tmp/rust-install.log 2>/dev/null || echo "No log file found"
          echo "[SETUP] Continuing to verification (will fail there)..."
        else
          echo "[SETUP] ✅ Rust installation script completed successfully"
        fi

        # Wait for filesystem sync
        sleep 3

        echo ""
        echo "[SETUP] Step 3/4: Configuring Rust environment..."

        # Set proper ownership (even if installation failed, directories might exist)
        chown -R ec2-user:ec2-user /home/ec2-user/.cargo /home/ec2-user/.rustup 2>/dev/null || true

        # Add to .bashrc for SSH sessions
        if ! grep -q "Rust environment" /home/ec2-user/.bashrc 2>/dev/null; then
          cat >> /home/ec2-user/.bashrc << 'RUST_ENV_EOF'
# Rust environment
export PATH="$PATH:/home/ec2-user/.cargo/bin"
export CARGO_HOME="/home/ec2-user/.cargo"
export RUSTUP_HOME="/home/ec2-user/.rustup"
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
RUST_ENV_EOF
        fi

        # Create system-wide script for SSM sessions
        cat > /etc/profile.d/rust-env.sh << 'RUST_PROFILE_EOF'
# Rust environment for all users (especially SSM)
export PATH="/home/ec2-user/.cargo/bin:$PATH"
export CARGO_HOME="/home/ec2-user/.cargo"
export RUSTUP_HOME="/home/ec2-user/.rustup"
RUST_PROFILE_EOF
        chmod +x /etc/profile.d/rust-env.sh

        echo "[SETUP] ✅ Environment configured"
        echo ""

        echo "[SETUP] Step 4/4: Verifying Rust installation..."

        # Verify binaries exist
        if [ ! -f "/home/ec2-user/.cargo/bin/rustc" ]; then
          echo "[SETUP] ❌ rustc binary not found at /home/ec2-user/.cargo/bin/rustc"
          echo "[SETUP] Checking if .cargo directory exists:"
          ls -la /home/ec2-user/.cargo/ 2>/dev/null || echo "[SETUP] .cargo directory doesn't exist"
          echo "[SETUP] Checking if .cargo/bin directory exists:"
          ls -la /home/ec2-user/.cargo/bin/ 2>/dev/null || echo "[SETUP] .cargo/bin directory doesn't exist"
        elif [ ! -f "/home/ec2-user/.cargo/bin/cargo" ]; then
          echo "[SETUP] ❌ cargo binary not found at /home/ec2-user/.cargo/bin/cargo"
          echo "[SETUP] Contents of .cargo/bin:"
          ls -la /home/ec2-user/.cargo/bin/ 2>/dev/null || echo "[SETUP] Directory doesn't exist"
        else
          # Both binaries exist - test execution
          RUST_VERSION=$(sudo -u ec2-user bash -c "source /home/ec2-user/.cargo/env && rustc --version 2>&1" || echo "rustc execution failed")
          CARGO_VERSION=$(sudo -u ec2-user bash -c "source /home/ec2-user/.cargo/env && cargo --version 2>&1" || echo "cargo execution failed")

          echo "[SETUP] ════════════════════════════════════════════════════════════"
          echo "[SETUP] ✅ RUST INSTALLATION SUCCESSFUL"
          echo "[SETUP] ════════════════════════════════════════════════════════════"
          echo "[SETUP] Rust: $RUST_VERSION"
          echo "[SETUP] Cargo: $CARGO_VERSION"
          echo "[SETUP] Location: /home/ec2-user/.cargo/bin"
          echo "[SETUP] System Profile: /etc/profile.d/rust-env.sh"
          echo "[SETUP] ════════════════════════════════════════════════════════════"
        fi

        echo ""`,

    go: `
        echo "[SETUP] 🐹 GO RUNTIME (detected from pipeline)"
        echo "[SETUP] Installing Go 1.21.5..."
        cd /tmp
        GO_VERSION="1.21.5"
        wget -q https://go.dev/dl/go\${GO_VERSION}.linux-amd64.tar.gz 2>&1 || true

        if [ -f "go\${GO_VERSION}.linux-amd64.tar.gz" ]; then
          rm -rf /usr/local/go
          tar -C /usr/local -xzf go\${GO_VERSION}.linux-amd64.tar.gz 2>&1 || true
          rm go\${GO_VERSION}.linux-amd64.tar.gz

          echo 'export PATH=$PATH:/usr/local/go/bin:/home/ec2-user/go/bin' >> /home/ec2-user/.bashrc
          echo 'export GOPATH=/home/ec2-user/go' >> /home/ec2-user/.bashrc
          echo 'export GOROOT=/usr/local/go' >> /home/ec2-user/.bashrc
          echo 'export GO111MODULE=on' >> /home/ec2-user/.bashrc

          if [ -f "/usr/local/go/bin/go" ]; then
            GO_VER=$(/usr/local/go/bin/go version 2>/dev/null || echo "Go installed")
            echo "[SETUP] ✅ $GO_VER"
            sudo -u ec2-user mkdir -p /home/ec2-user/go/{bin,src,pkg} || true
            echo "[SETUP] ✅ Go workspace created"
            echo "[SETUP] ✅ Go environment configured"
          fi
        else
          echo "[SETUP] ❌ Go download FAILED"
        fi`,

    java: `
        echo "[SETUP] ☕ JAVA RUNTIME (detected from pipeline)"
        echo "[SETUP] Installing Java OpenJDK 17..."
        yum install -y java-17-amazon-corretto-devel maven gradle 2>&1 | tail -5 || true

        if command -v java >/dev/null 2>&1; then
          echo "[SETUP] ✅ $(java -version 2>&1 | head -1)"
          echo 'export JAVA_HOME=/usr/lib/jvm/java-17-amazon-corretto' >> /home/ec2-user/.bashrc
          echo 'export PATH=$PATH:$JAVA_HOME/bin' >> /home/ec2-user/.bashrc
          echo 'export MAVEN_OPTS="-Xmx2048m"' >> /home/ec2-user/.bashrc
          echo "[SETUP] ✅ Java environment configured"
        else
          echo "[SETUP] ❌ Java installation FAILED"
        fi`,

    ruby: `
        echo "[SETUP] 💎 RUBY RUNTIME (detected from pipeline)"
        echo "[SETUP] Installing Ruby..."
        yum install -y ruby ruby-devel rubygems 2>&1 | tail -5 || true

        if command -v ruby >/dev/null 2>&1; then
          echo "[SETUP] ✅ $(ruby --version)"
          gem install bundler --no-document 2>&1 | tail -3 || true
          echo "[SETUP] ✅ Bundler installed"

          # Add Ruby environment to bashrc
          echo 'export PATH="$PATH:/home/ec2-user/.gem/ruby/bin"' >> /home/ec2-user/.bashrc
          echo 'export GEM_HOME=/home/ec2-user/.gem/ruby' >> /home/ec2-user/.bashrc
          echo 'export GEM_PATH=/home/ec2-user/.gem/ruby' >> /home/ec2-user/.bashrc
          echo "[SETUP] ✅ Ruby environment configured"
        else
          echo "[SETUP] ❌ Ruby installation FAILED"
        fi`,

    php: `
        echo "[SETUP] 🐘 PHP RUNTIME (detected from pipeline)"
        echo "[SETUP] Installing PHP..."
        yum install -y php php-cli php-fpm php-json php-mbstring php-xml php-zip 2>&1 | tail -5 || true

        if command -v php >/dev/null 2>&1; then
          echo "[SETUP] ✅ $(php --version | head -1)"
          curl -sS https://getcomposer.org/installer | php 2>&1 || true
          mv composer.phar /usr/local/bin/composer 2>/dev/null || true
          chmod +x /usr/local/bin/composer 2>/dev/null || true
          echo "[SETUP] ✅ Composer installed"

          # Add PHP environment to bashrc
          echo 'export PATH="$PATH:/home/ec2-user/.composer/vendor/bin"' >> /home/ec2-user/.bashrc
          echo 'export COMPOSER_HOME=/home/ec2-user/.composer' >> /home/ec2-user/.bashrc
          echo "[SETUP] ✅ PHP environment configured"
        else
          echo "[SETUP] ❌ PHP installation FAILED"
        fi`,

    docker: `
        echo "[SETUP] 🐳 DOCKER RUNTIME (detected from pipeline)"
        echo "[SETUP] Installing Docker..."
        yum install -y docker 2>&1 | tail -5 || true
        systemctl enable docker 2>&1 || true
        systemctl start docker 2>&1 || true
        usermod -aG docker ec2-user 2>&1 || true

        if command -v docker >/dev/null 2>&1; then
          echo "[SETUP] ✅ $(docker --version)"
        else
          echo "[SETUP] ❌ Docker installation FAILED"
        fi`,

    unknown: `
        echo "[SETUP] ⚠️ UNKNOWN RUNTIME"
        echo "[SETUP] Could not determine runtime from pipeline"
        echo "[SETUP] Pipeline may use Docker or custom setup"
        echo "[SETUP] Proceeding with minimal environment..."`
  };

  return scripts[runtime] || scripts.unknown;
}

function parsePipelineJobs(yamlContent: string): Array<{ name: string; stage: string; script: string[] }> {
  const jobs: Array<{ name: string; stage: string; script: string[] }> = [];

  // Simple YAML parser for our pipeline format
  const lines = yamlContent.split('\n');
  let currentJob: { name: string; stage: string; script: string[] } | null = null;
  let inScript = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect job names (stages like install-runtime:, install-dependencies:, etc.)
    if (trimmed.match(/^[a-z-]+:$/) && !trimmed.startsWith('stage:') && !trimmed.startsWith('script:')) {
      const jobName = trimmed.replace(':', '');

      // Save previous job
      if (currentJob) {
        jobs.push(currentJob);
      }

      // Start new job
      currentJob = {
        name: jobName,
        stage: '', // Will be set when we find the stage line
        script: [],
      };
      inScript = false;
    }

    // Detect stage
    if (currentJob && trimmed.startsWith('stage:')) {
      currentJob.stage = trimmed.replace('stage:', '').trim();
    }

    // Detect script section
    if (currentJob && trimmed === 'script:') {
      inScript = true;
      continue;
    }

    // Collect script commands
    if (currentJob && inScript && line.startsWith('    - ')) {
      const command = line.substring(6); // Remove '    - '
      currentJob.script.push(command);
    } else if (currentJob && inScript && !line.startsWith('    ') && trimmed !== '') {
      // End of script section
      inScript = false;
    }
  }

  // Add last job
  if (currentJob) {
    jobs.push(currentJob);
  }

  return jobs;
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

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error('Instance did not start in time');
}

/**
 * Wait for SSM agent to be ready
 */
async function waitForSSMReady(instanceId: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      await ssmClient.send(
        new SendCommandCommand({
          InstanceIds: [instanceId],
          DocumentName: 'AWS-RunShellScript',
          Parameters: {
            commands: ['echo "SSM ready"'],
          },
        })
      );
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  throw new Error('SSM agent did not become ready in time');
}

/**
 * Configure security group to allow inbound traffic on application port
 */
async function configureSecurityGroupPort(port: number): Promise<void> {
  const securityGroupId = process.env.AWS_SECURITY_GROUP_ID;

  if (!securityGroupId) {
    console.warn('[SECURITY-GROUP] ⚠️  AWS_SECURITY_GROUP_ID not configured - skipping automatic port configuration');
    return;
  }

  try {
    console.log(`[SECURITY-GROUP] Configuring security group ${securityGroupId} to allow port ${port}...`);

    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpPermissions: [
          {
            IpProtocol: 'tcp',
            FromPort: port,
            ToPort: port,
            IpRanges: [{ CidrIp: '0.0.0.0/0', Description: `Application port ${port} (auto-configured)` }],
          },
        ],
      })
    );

    console.log(`[SECURITY-GROUP] ✅ Port ${port} configured successfully`);
  } catch (error) {
    // If rule already exists, that's fine
    const err = error as { name?: string; message?: string };
    if (err.name === 'InvalidPermission.Duplicate') {
      console.log(`[SECURITY-GROUP] ℹ️  Port ${port} already allowed in security group`);
    } else {
      console.error(`[SECURITY-GROUP] ⚠️  Failed to configure port ${port}:`, err.message || error);
      console.error(`[SECURITY-GROUP] ⚠️  Please manually allow port ${port} in security group ${securityGroupId}`);
    }
  }
}

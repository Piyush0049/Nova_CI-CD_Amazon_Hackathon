// API Route for Pipeline Execution

import { NextRequest } from 'next/server';
import { PipelineParser } from '@/lib/cicd/pipeline-parser';
import { PipelineExecutor, ExecutionContext } from '@/lib/cicd/pipeline-executor';
import { jobQueue } from '@/lib/cicd/job-queue';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { yaml, project, branch, commit, triggeredBy, user } = body;

    // Validate request
    if (!yaml || !project || !branch || !commit) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse pipeline
    const pipeline = PipelineParser.parseConfig(yaml, {
      project,
      branch,
      commit,
      triggeredBy: triggeredBy || 'manual',
      user: user || 'anonymous',
    });

    // Setup execution context
    const context: ExecutionContext = {
      workingDirectory: process.cwd(),
      environment: {
        DEMO_MODE: 'true',
        CI: 'true',
        CI_PROJECT_NAME: project,
        CI_COMMIT_BRANCH: branch,
        CI_COMMIT_SHA: commit.sha,
      },
      secrets: {},
    };

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const executor = new PipelineExecutor(context, {
          onPipelineStart: (pipeline) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'pipeline:start', pipeline })}\n\n`)
            );
          },
          onStageStart: (stage) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'stage:start', stage })}\n\n`)
            );
          },
          onJobStart: (job) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'job:start', job })}\n\n`)
            );
          },
          onJobLog: (jobId, log) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'job:log', jobId, log })}\n\n`)
            );
          },
          onJobComplete: (job) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'job:complete', job })}\n\n`)
            );
          },
          onStageComplete: (stage) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'stage:complete', stage })}\n\n`)
            );
          },
          onPipelineComplete: (pipeline) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'pipeline:complete', pipeline })}\n\n`)
            );
            controller.close();
          },
        });

        // Execute pipeline
        await executor.executePipeline(pipeline);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('Pipeline execution error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

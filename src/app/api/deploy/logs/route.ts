/**
 * Real-time Deployment Logs Streaming (Server-Sent Events)
 * Streams live logs from deployment process to frontend
 */

import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Deployment from '@/models/Deployment';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/deploy/logs?deploymentId=xxx
 * Streams real-time deployment logs via Server-Sent Events
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const deploymentId = searchParams.get('deploymentId');
  const instanceId = searchParams.get('instanceId');
  const trackingId = searchParams.get('trackingId');

  if (!deploymentId && !instanceId && !trackingId) {
    return NextResponse.json({ error: 'deploymentId, instanceId, or trackingId required' }, { status: 400 });
  }

  console.log('[LOG-STREAM] Starting SSE stream for:', deploymentId || trackingId || `instance:${instanceId}`);

  // Create a readable stream for Server-Sent Events
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({
          type: 'connected',
          message: 'Log stream connected',
          timestamp: new Date().toISOString(),
        })}\n\n`)
      );

      let isActive = true;
      let previousLogs = '';
      let noNewLogsCount = 0;
      let lastStatus = '';

      // Poll for new logs every 1 second (faster polling)
      const pollInterval = setInterval(async () => {
        if (!isActive) {
          clearInterval(pollInterval);
          return;
        }

        try {
          await dbConnect();

          // Fetch deployment record by ID, trackingId, or instanceId
          let deployment;
          if (deploymentId) {
            deployment = await Deployment.findById(deploymentId).lean();
          } else if (trackingId) {
            deployment = await Deployment.findOne({ trackingId }).lean();
          } else {
            deployment = await Deployment.findOne({ instanceId }).lean();
          }

          if (!deployment) {
            // Don't error immediately - deployment might not be created yet
            noNewLogsCount++;

            // Send waiting message every 10 seconds
            if (noNewLogsCount % 10 === 0) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'log',
                  stage: 'setup',
                  message: `⏳ Waiting for deployment to start... (${noNewLogsCount}s)`,
                  timestamp: new Date().toISOString(),
                  level: 'info',
                })}\n\n`)
              );
            }

            // Only error after 60 seconds of no deployment record
            if (noNewLogsCount > 60) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'error',
                  message: 'Deployment not found after 60 seconds',
                  timestamp: new Date().toISOString(),
                })}\n\n`)
              );
              isActive = false;
              clearInterval(pollInterval);
              controller.close();
            }
            return;
          }

          // Send debug info on first successful fetch
          if (previousLogs === '') {
            console.log('[LOG-STREAM] Found deployment:', {
              id: deployment._id,
              trackingId: deployment.trackingId,
              status: deployment.status,
              logsLength: deployment.rawLogs?.length || 0,
            });
          }

          const currentLogs = deployment.rawLogs || '';
          const currentStatus = deployment.status;

          // Detect new logs
          if (currentLogs !== previousLogs) {
            const newLogs = currentLogs.substring(previousLogs.length);
            previousLogs = currentLogs;
            noNewLogsCount = 0;

            console.log('[LOG-STREAM] New logs detected:', {
              newCharsCount: newLogs.length,
              totalLogsLength: currentLogs.length,
            });

            // Parse and send new log lines
            const lines = newLogs.split('\n').filter(line => line.trim());
            console.log('[LOG-STREAM] Parsed lines:', lines.length);

            for (const line of lines) {
              // Detect stage from log line
              let stage = 'setup';
              if (line.includes('[STAGE')) {
                const stageMatch = line.match(/\[STAGE \d+\/\d+\] Running: (\w+)/);
                if (stageMatch) {
                  stage = stageMatch[1].toLowerCase();
                }
              } else if (line.includes('[SMART-DEPLOY]')) {
                stage = 'setup';
              } else if (line.includes('[RUNTIME]')) {
                stage = 'deploying';
              } else if (line.includes('[NGINX]')) {
                stage = 'nginx';
              } else if (line.includes('[INSTALL]')) {
                stage = 'install';
              } else if (line.includes('[BUILD]')) {
                stage = 'build';
              } else if (line.includes('[TEST]')) {
                stage = 'test';
              } else if (line.includes('[DEPLOY]')) {
                stage = 'deploy';
              }

              // Determine log level
              const level = line.includes('❌') || line.includes('ERROR') || line.includes('Failed') ? 'error' :
                           line.includes('✅') || line.includes('SUCCESS') || line.includes('Complete') ? 'success' :
                           line.includes('⚠️') || line.includes('WARNING') ? 'warning' :
                           'info';

              // Send log entry
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'log',
                  stage,
                  message: line,
                  timestamp: new Date().toISOString(),
                  level,
                })}\n\n`)
              );
            }
          } else {
            noNewLogsCount++;
          }

          // Send status update if changed
          if (currentStatus !== lastStatus) {
            lastStatus = currentStatus;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'status',
                status: currentStatus,
                timestamp: new Date().toISOString(),
              })}\n\n`)
            );
          }

          // Check if deployment completed
          if (currentStatus === 'success' || currentStatus === 'failed') {
            console.log('[LOG-STREAM] Deployment completed:', currentStatus);

            // Send final log entry with instanceId and publicIp
            if (deployment.publicIp) {
              const deployUrl = deployment.port
                ? `http://${deployment.publicIp}:${deployment.port}`
                : `http://${deployment.publicIp}`;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  type: 'log',
                  stage: 'complete',
                  message: `✅ Deployment URL: ${deployUrl}`,
                  timestamp: new Date().toISOString(),
                  level: 'success',
                })}\n\n`)
              );
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'complete',
                status: currentStatus,
                message: currentStatus === 'success'
                  ? 'Deployment completed successfully'
                  : deployment.errorMessage || 'Deployment failed',
                timestamp: new Date().toISOString(),
                instanceId: deployment.instanceId,
                publicIp: deployment.publicIp,
                appPort: deployment.port?.toString(),
                accessUrl: deployment.port ? `http://${deployment.publicIp}:${deployment.port}` : `http://${deployment.publicIp}`,
                deploymentType: deployment.deploymentType,
                framework: deployment.framework,
                nginxEnabled: deployment.nginxEnabled,
              })}\n\n`)
            );

            isActive = false;
            clearInterval(pollInterval);
            controller.close();
          }

          // Timeout after 30 minutes with no new logs
          if (noNewLogsCount > 900) { // 900 * 2s = 30 minutes
            console.log('[LOG-STREAM] Timeout - no new logs for 30 minutes');
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'timeout',
                message: 'Log stream timed out (no new logs for 30 minutes)',
                timestamp: new Date().toISOString(),
              })}\n\n`)
            );
            isActive = false;
            clearInterval(pollInterval);
            controller.close();
          }
        } catch (error: any) {
          console.error('[LOG-STREAM] Error fetching logs:', error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              type: 'error',
              message: `Error fetching logs: ${error.message}`,
              timestamp: new Date().toISOString(),
            })}\n\n`)
          );
        }
      }, 1000); // Poll every 1 second for faster updates

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        console.log('[LOG-STREAM] Client disconnected');
        isActive = false;
        clearInterval(pollInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}

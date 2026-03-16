import { NextRequest, NextResponse } from "next/server";
import { AgentOrchestrator } from "@/lib/agent/agent-orchestrator";
import { AgentActivity, AgentResult } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { command } = await request.json();

    if (!command || typeof command !== "string") {
      return NextResponse.json(
        { error: "Invalid command" },
        { status: 400 }
      );
    }

    const demoMode = process.env.DEMO_MODE !== "false";
    const orchestrator = new AgentOrchestrator(demoMode);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendUpdate = (type: string, data: any) => {
          const message = `data: ${JSON.stringify({ type, data })}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        try {
          const task = await orchestrator.executeCommand(
            command,
            (activity: AgentActivity) => {
              sendUpdate("activity", activity);
            },
            (result: AgentResult) => {
              sendUpdate("result", result);
            }
          );

          sendUpdate("complete", {
            task,
            message: "Task completed successfully!",
          });
        } catch (error: any) {
          sendUpdate("error", {
            message: error.message || "An error occurred",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("Error in agent execution:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

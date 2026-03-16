import { nanoid } from "nanoid";
import { novaService } from "../ai/nova-service";
import { BrowserAutomationService } from "../automation/browser-service";
import {
  AgentTask,
  AgentActivity,
  AgentResult,
  TaskStep,
  ActivityType,
} from "@/types";
import { delay } from "../utils";

export class AgentOrchestrator {
  private browserService: BrowserAutomationService;
  private currentTask: AgentTask | null = null;

  constructor(demoMode: boolean = true) {
    this.browserService = new BrowserAutomationService(demoMode);
  }

  async executeCommand(
    command: string,
    onActivity?: (activity: AgentActivity) => void,
    onResult?: (result: AgentResult) => void
  ): Promise<AgentTask> {
    this.currentTask = {
      id: nanoid(),
      command,
      status: "planning",
      steps: [],
      activities: [],
      results: [],
      createdAt: new Date(),
    };

    try {
      this.addActivity("planning", "Analyzing your request with AI...", onActivity);

      const plan = await novaService.planTask(command);

      this.addActivity(
        "planning",
        `Intent identified: ${plan.intent}`,
        onActivity,
        "completed"
      );

      this.addActivity(
        "planning",
        `Created action plan with ${plan.steps.length} steps`,
        onActivity,
        "completed"
      );

      this.currentTask.steps = plan.steps.map((step, index) => ({
        id: `step-${index}`,
        action: step,
        description: step,
        status: "pending",
      }));

      this.currentTask.status = "executing";

      this.addActivity(
        "planning",
        "Initializing browser automation...",
        onActivity
      );

      await this.browserService.initialize();

      this.addActivity(
        "planning",
        "Browser ready. Starting execution...",
        onActivity,
        "completed"
      );

      for (let i = 0; i < plan.requiredActions.length; i++) {
        const action = plan.requiredActions[i];
        const stepIndex = Math.min(i, this.currentTask.steps.length - 1);

        if (this.currentTask.steps[stepIndex]) {
          this.currentTask.steps[stepIndex].status = "in-progress";
        }

        const activityMessage = this.getActivityMessage(action);
        this.addActivity(
          this.getActivityType(action.type),
          activityMessage,
          onActivity
        );

        const result = await this.browserService.executeAction(action);

        if (result.success) {
          if (this.currentTask.steps[stepIndex]) {
            this.currentTask.steps[stepIndex].status = "completed";
            this.currentTask.steps[stepIndex].result = result.data;
          }

          this.addActivity(
            this.getActivityType(action.type),
            `✓ ${activityMessage}`,
            onActivity,
            "completed"
          );

          if (action.type === "extract" && result.data) {
            const agentResult: AgentResult = {
              id: nanoid(),
              type: "data",
              title: this.getResultTitle(action),
              content: result.data,
              timestamp: new Date(),
            };

            this.currentTask.results.push(agentResult);
            onResult?.(agentResult);
          }
        } else {
          if (this.currentTask.steps[stepIndex]) {
            this.currentTask.steps[stepIndex].status = "error";
          }

          this.addActivity(
            "error",
            `Error: ${result.error}`,
            onActivity,
            "error"
          );
        }

        await delay(500);
      }

      this.currentTask.status = "completed";
      this.currentTask.completedAt = new Date();

      this.addActivity(
        "analysis",
        `Task completed! Found ${this.currentTask.results.length} results.`,
        onActivity,
        "completed"
      );

      await this.browserService.cleanup();

      return this.currentTask;
    } catch (error: any) {
      this.currentTask.status = "error";

      this.addActivity(
        "error",
        `Fatal error: ${error.message}`,
        onActivity,
        "error"
      );

      await this.browserService.cleanup();

      return this.currentTask;
    }
  }

  private addActivity(
    type: ActivityType,
    message: string,
    callback?: (activity: AgentActivity) => void,
    status: AgentActivity["status"] = "in-progress"
  ): void {
    if (!this.currentTask) return;

    const activity: AgentActivity = {
      id: nanoid(),
      type,
      message,
      timestamp: new Date(),
      status,
    };

    this.currentTask.activities.push(activity);
    callback?.(activity);
  }

  private getActivityType(actionType: string): ActivityType {
    switch (actionType) {
      case "navigate":
        return "navigation";
      case "type":
        return "type";
      case "click":
        return "click";
      case "extract":
        return "extract";
      default:
        return "analysis";
    }
  }

  private getActivityMessage(action: any): string {
    switch (action.type) {
      case "navigate":
        return `Navigating to ${action.url}`;
      case "click":
        return `Clicking element: ${action.selector}`;
      case "type":
        return `Entering: "${action.value}"`;
      case "extract":
        return `Extracting data from page`;
      case "wait":
        return `Waiting for page to load...`;
      case "scroll":
        return `Scrolling page`;
      default:
        return `Performing ${action.type}`;
    }
  }

  private getResultTitle(action: any): string {
    if (action.selector?.includes("flight")) {
      return "Flight Options";
    }
    if (action.selector?.includes("job")) {
      return "Job Listings";
    }
    if (action.selector?.includes("product") || action.selector?.includes("result")) {
      return "Product Results";
    }
    return "Extracted Data";
  }

  getCurrentTask(): AgentTask | null {
    return this.currentTask;
  }
}

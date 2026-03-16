"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Message, AgentActivity, AgentResult, AgentStatus } from "@/types";
import ChatWindow from "@/components/ChatWindow";
import CommandInput from "@/components/CommandInput";
import AgentActivityLog from "@/components/AgentActivityLog";
import AgentResults from "@/components/AgentResults";
import ThemeToggle from "@/components/ThemeToggle";
import TaskHistory from "@/components/TaskHistory";
import SettingsModal from "@/components/SettingsModal";
import UsageStats from "@/components/UsageStats";
import ExportResults from "@/components/ExportResults";
import { ToastContainer } from "@/components/ui/Toast";
import { Bot, LogOut, User, Settings, History as HistoryIcon, BarChart3 } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/hooks/useToast";
import { useTaskHistory } from "@/hooks/useTaskHistory";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

export default function AppPageEnhanced() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Toast notifications
  const toast = useToast();

  // Task history
  const taskHistory = useTaskHistory();

  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [results, setResults] = useState<AgentResult[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>("idle");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [currentCommand, setCurrentCommand] = useState("");
  const [taskStartTime, setTaskStartTime] = useState<number>(0);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: "k",
      ctrl: true,
      action: () => {
        inputRef.current?.focus();
        toast.info("Command input focused", "Start typing your command");
      },
    },
    {
      key: ",",
      ctrl: true,
      action: () => setShowSettings(true),
    },
    {
      key: "t",
      ctrl: true,
      shift: true,
      action: () => {
        const html = document.documentElement;
        html.classList.toggle("dark");
        const newTheme = html.classList.contains("dark") ? "dark" : "light";
        localStorage.setItem("theme", newTheme);
        toast.success(`Theme changed to ${newTheme}`, "");
      },
    },
  ]);

  // Auth check
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Bot className="w-16 h-16 mx-auto text-primary animate-pulse" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const handleCommandSubmit = async (command: string) => {
    setCurrentCommand(command);
    setTaskStartTime(Date.now());

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: command,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setAgentStatus("planning");
    setActivities([]);
    setResults([]);

    toast.info("Task started", "AI is analyzing your request...");

    const assistantMessage: Message = {
      id: `msg-${Date.now()}-assistant`,
      role: "assistant",
      content: "I'm analyzing your request and planning the execution...",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch("/api/agent/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ command }),
      });

      if (!response.ok) {
        throw new Error("Failed to execute command");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case "activity":
                setActivities((prev) => [...prev, data.data]);
                setAgentStatus("executing");
                break;

              case "result":
                setResults((prev) => [...prev, data.data]);
                break;

              case "complete":
                const duration = Date.now() - taskStartTime;
                setAgentStatus("completed");
                setMessages((prev) => [
                  ...prev.slice(0, -1),
                  {
                    ...assistantMessage,
                    content: `Task completed! I've found ${data.data.task.results.length} results for you. Check the results panel for details.`,
                  },
                ]);

                // Save to history
                taskHistory.addTask(
                  command,
                  "completed",
                  data.data.task.results,
                  duration
                );

                // Show success toast
                toast.success(
                  "Task completed!",
                  `Found ${data.data.task.results.length} results in ${Math.round(duration / 1000)}s`
                );
                break;

              case "error":
                setAgentStatus("error");
                setMessages((prev) => [
                  ...prev.slice(0, -1),
                  {
                    ...assistantMessage,
                    content: `I encountered an error: ${data.data.message}`,
                  },
                ]);

                // Save failed task
                taskHistory.addTask(command, "error", [], Date.now() - taskStartTime);

                // Show error toast
                toast.error("Task failed", data.data.message);
                break;
            }
          }
        }
      }
    } catch (error: any) {
      setAgentStatus("error");
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          ...assistantMessage,
          content: `Error: ${error.message}. Please try again.`,
        },
      ]);

      taskHistory.addTask(command, "error", [], Date.now() - taskStartTime);
      toast.error("Error", error.message);
    }
  };

  const handleSignOut = async () => {
    await signOut({ callbackUrl: "/" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Enhanced Header */}
      <header className="border-b glass-dark sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-heading font-bold gradient-text">
                AI Operator
              </h1>
              <p className="text-xs text-muted-foreground">
                Powered by Amazon Nova
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Stats Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowStats(!showStats)}
              title="Usage Statistics"
            >
              <BarChart3 className="w-5 h-5" />
            </Button>

            {/* History Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowHistory(!showHistory)}
              title="Task History"
            >
              <HistoryIcon className="w-5 h-5" />
            </Button>

            {/* Settings Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSettings(true)}
              title="Settings (Ctrl+,)"
            >
              <Settings className="w-5 h-5" />
            </Button>

            <ThemeToggle />

            {/* User Menu */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="rounded-full"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
              </Button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-card shadow-lg animate-scale-in">
                  <div className="p-4 border-b">
                    <p className="font-medium truncate">{session?.user?.name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {session?.user?.email}
                    </p>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-destructive/10 text-destructive transition-colors text-sm"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Usage Stats (when visible) */}
      {showStats && (
        <div className="container mx-auto px-4 py-4">
          <UsageStats stats={taskHistory.getStats()} />
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Task History Sidebar (when visible) */}
          {showHistory && (
            <div className="lg:col-span-1">
              <TaskHistory
                history={taskHistory.history}
                onReplay={handleCommandSubmit}
                onRemove={taskHistory.removeTask}
                onClear={() => {
                  taskHistory.clearHistory();
                  toast.success("History cleared", "All tasks removed");
                }}
              />
            </div>
          )}

          {/* Main Content Area */}
          <div className={`lg:col-span-${showHistory ? "2" : "3"} flex flex-col gap-6`}>
            <div className="flex-1 min-h-[500px]">
              <ChatWindow messages={messages} />
            </div>
            <div>
              <CommandInput
                ref={inputRef}
                onSubmit={handleCommandSubmit}
                disabled={agentStatus === "planning" || agentStatus === "executing"}
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="flex-1">
              <AgentActivityLog activities={activities} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <ExportResults results={results} command={currentCommand} />
              </div>
              <AgentResults results={results} />
            </div>
          </div>
        </div>
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onClearHistory={() => {
          taskHistory.clearHistory();
          toast.success("History cleared", "All tasks removed");
        }}
        historyCount={taskHistory.history.length}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}

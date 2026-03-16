"use client";

import { useState } from "react";
import { X, Settings as SettingsIcon, Key, Bell, Trash2, Info } from "lucide-react";
import Button from "./ui/Button";
import { Card } from "./ui/Card";
import { cn } from "@/lib/utils";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClearHistory: () => void;
  historyCount: number;
}

export default function SettingsModal({
  isOpen,
  onClose,
  onClearHistory,
  historyCount,
}: SettingsModalProps) {
  const [awsRegion, setAwsRegion] = useState(
    typeof window !== "undefined" ? localStorage.getItem("aws_region") || "us-east-1" : "us-east-1"
  );
  const [notifications, setNotifications] = useState(
    typeof window !== "undefined" ? localStorage.getItem("notifications") !== "false" : true
  );
  const [autoSave, setAutoSave] = useState(
    typeof window !== "undefined" ? localStorage.getItem("auto_save") !== "false" : true
  );

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem("aws_region", awsRegion);
    localStorage.setItem("notifications", String(notifications));
    localStorage.setItem("auto_save", String(autoSave));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in scrollbar-thin">
        <div className="sticky top-0 bg-card border-b p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <SettingsIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-heading font-bold">Settings</h2>
              <p className="text-sm text-muted-foreground">
                Manage your preferences and configurations
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* AWS Configuration */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-heading font-semibold">AWS Configuration</h3>
            </div>

            <div className="space-y-3 pl-7">
              <div>
                <label className="text-sm font-medium block mb-2">
                  AWS Region
                </label>
                <select
                  value={awsRegion}
                  onChange={(e) => setAwsRegion(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="us-east-1">US East (N. Virginia)</option>
                  <option value="us-west-2">US West (Oregon)</option>
                  <option value="eu-west-1">EU (Ireland)</option>
                  <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Select the AWS region for Nova API calls
                </p>
              </div>

              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-blue-700 dark:text-blue-400">
                    <p className="font-medium mb-1">API Keys Configuration</p>
                    <p>
                      AWS credentials are configured in your <code className="px-1 py-0.5 rounded bg-blue-500/20">.env</code> file.
                      Update <code className="px-1 py-0.5 rounded bg-blue-500/20">AWS_ACCESS_KEY_ID</code> and{" "}
                      <code className="px-1 py-0.5 rounded bg-blue-500/20">AWS_SECRET_ACCESS_KEY</code> there.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-heading font-semibold">Preferences</h3>
            </div>

            <div className="space-y-3 pl-7">
              <label className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/5 transition-colors cursor-pointer">
                <div>
                  <p className="font-medium text-sm">Enable Notifications</p>
                  <p className="text-xs text-muted-foreground">
                    Show toast notifications for task updates
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={notifications}
                  onChange={(e) => setNotifications(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/5 transition-colors cursor-pointer">
                <div>
                  <p className="font-medium text-sm">Auto-Save Task History</p>
                  <p className="text-xs text-muted-foreground">
                    Automatically save completed tasks to history
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => setAutoSave(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
              </label>
            </div>
          </div>

          {/* Data Management */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-heading font-semibold">Data Management</h3>
            </div>

            <div className="space-y-3 pl-7">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="font-medium text-sm">Task History</p>
                  <p className="text-xs text-muted-foreground">
                    {historyCount} tasks stored locally
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm("Are you sure you want to clear all task history? This cannot be undone.")) {
                      onClearHistory();
                    }
                  }}
                  disabled={historyCount === 0}
                >
                  Clear History
                </Button>
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="space-y-4">
            <h3 className="text-lg font-heading font-semibold">Keyboard Shortcuts</h3>
            <div className="space-y-2 pl-7 text-sm">
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">Focus command input</span>
                <kbd className="px-2 py-1 rounded bg-muted text-xs font-mono">Ctrl + K</kbd>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">Open settings</span>
                <kbd className="px-2 py-1 rounded bg-muted text-xs font-mono">Ctrl + ,</kbd>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">Toggle theme</span>
                <kbd className="px-2 py-1 rounded bg-muted text-xs font-mono">Ctrl + Shift + T</kbd>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-card border-t p-6 flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} className="gradient-primary text-white">
            Save Changes
          </Button>
        </div>
      </Card>
    </div>
  );
}

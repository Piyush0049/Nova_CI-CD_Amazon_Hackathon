"use client";

import { useState, useEffect, useCallback } from "react";
import { TaskHistoryItem, AgentResult, AgentStatus } from "@/types";

const STORAGE_KEY = "ai-operator-task-history";
const MAX_HISTORY = 50;

export function useTaskHistory() {
  const [history, setHistory] = useState<TaskHistoryItem[]>([]);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert timestamp strings back to Date objects
        const withDates = parsed.map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp),
        }));
        setHistory(withDates);
      }
    } catch (error) {
      console.error("Failed to load task history:", error);
    }
  }, []);

  // Save history to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
      console.error("Failed to save task history:", error);
    }
  }, [history]);

  const addTask = useCallback((
    command: string,
    status: AgentStatus,
    results: AgentResult[],
    duration?: number
  ) => {
    const newTask: TaskHistoryItem = {
      id: `task-${Date.now()}`,
      command,
      status,
      timestamp: new Date(),
      duration,
      resultsCount: results.length,
      results,
    };

    setHistory((prev) => {
      const updated = [newTask, ...prev].slice(0, MAX_HISTORY);
      return updated;
    });

    return newTask.id;
  }, []);

  const removeTask = useCallback((id: string) => {
    setHistory((prev) => prev.filter((task) => task.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const getTaskById = useCallback((id: string) => {
    return history.find((task) => task.id === id);
  }, [history]);

  const getRecentCommands = useCallback((limit: number = 5) => {
    return history
      .slice(0, limit)
      .map((task) => task.command)
      .filter((cmd, index, self) => self.indexOf(cmd) === index); // Remove duplicates
  }, [history]);

  const getStats = useCallback(() => {
    const totalTasks = history.length;
    const successfulTasks = history.filter((t) => t.status === "completed").length;
    const failedTasks = history.filter((t) => t.status === "error").length;
    const totalTime = history.reduce((sum, t) => sum + (t.duration || 0), 0);
    const averageTime = totalTasks > 0 ? totalTime / totalTasks : 0;
    const lastUsed = history[0]?.timestamp || new Date();

    return {
      totalTasks,
      successfulTasks,
      failedTasks,
      totalTime,
      averageTime,
      lastUsed,
    };
  }, [history]);

  return {
    history,
    addTask,
    removeTask,
    clearHistory,
    getTaskById,
    getRecentCommands,
    getStats,
  };
}

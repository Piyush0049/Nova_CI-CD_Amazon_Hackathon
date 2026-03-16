// Core types for the AI Internet Operator

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  results?: AgentResult[];
  activities?: AgentActivity[];
}

export type AgentStatus = 'idle' | 'planning' | 'executing' | 'completed' | 'error';

export type ActivityType =
  | 'planning'
  | 'navigation'
  | 'search'
  | 'click'
  | 'type'
  | 'extract'
  | 'analysis'
  | 'error';

export interface AgentActivity {
  id: string;
  type: ActivityType;
  message: string;
  timestamp: Date;
  status: 'in-progress' | 'completed' | 'error';
  metadata?: Record<string, any>;
}

export interface TaskStep {
  id: string;
  action: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  result?: any;
}

export interface AgentTask {
  id: string;
  command: string;
  status: AgentStatus;
  steps: TaskStep[];
  activities: AgentActivity[];
  results: AgentResult[];
  createdAt: Date;
  completedAt?: Date;
}

export interface AgentResult {
  id: string;
  type: 'data' | 'link' | 'image' | 'text' | 'table';
  title: string;
  content: any;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface BrowserAction {
  type: 'navigate' | 'click' | 'type' | 'extract' | 'wait' | 'scroll';
  selector?: string;
  value?: string;
  url?: string;
  waitFor?: number;
}

export interface AutomationResult {
  success: boolean;
  data?: any;
  error?: string;
  screenshot?: string;
}

export interface AITaskPlan {
  intent: string;
  steps: string[];
  requiredActions: BrowserAction[];
  estimatedTime?: string;
}

export interface TaskHistoryItem {
  id: string;
  command: string;
  status: AgentStatus;
  timestamp: Date;
  duration?: number;
  resultsCount: number;
  results?: AgentResult[];
}

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  autoSave: boolean;
  notifications: boolean;
  maxHistory: number;
}

export interface UsageStats {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  totalTime: number;
  averageTime: number;
  lastUsed: Date;
}

'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Message, AgentStatus } from '@/types';
import Loader from '@/components/Loader';
import ChatWindow from '@/components/ChatWindow';
import CommandInput from '@/components/CommandInput';
import AppLayout from '@/components/AppLayout';

export default function ChatPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [createdPipelines, setCreatedPipelines] = useState<Array<{
    id: string;
    name: string;
    repo: string;
    yaml: string;
    createdAt: Date;
  }>>([]);

  // Load pipelines from MongoDB
  useEffect(() => {
    const loadPipelines = async () => {
      try {
        const response = await fetch('/api/pipelines');
        if (response.ok) {
          const data = await response.json();
          setCreatedPipelines(data.pipelines.map((p: any) => ({
            id: p._id,
            name: p.name,
            repo: p.repo,
            yaml: p.yaml,
            createdAt: new Date(p.createdAt),
          })));
        }
      } catch (error) {
        console.error('Failed to load pipelines:', error);
      }
    };

    if (session) {
      loadPipelines();
    }
  }, [session]);

  const handleCommandSubmit = async (command: string) => {
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: command,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);

    const assistantMessage: Message = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: 'Processing your request...',
      timestamp: new Date(),
      activities: [],
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setAgentStatus('planning');

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });

      if (!response.ok) {
        throw new Error('Failed to process command');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response stream');
      }

      let currentActivities: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case 'activity':
                currentActivities = [...currentActivities, data.data];
                setMessages((msgs) => {
                  const lastMsg = msgs[msgs.length - 1];
                  if (lastMsg && lastMsg.role === 'assistant') {
                    return [
                      ...msgs.slice(0, -1),
                      { ...lastMsg, activities: [...currentActivities] }
                    ];
                  }
                  return msgs;
                });
                setAgentStatus('executing');
                break;

              case 'result':
                break;

              case 'complete':
                setAgentStatus('completed');
                setMessages((prev) => {
                  const lastMsg = prev[prev.length - 1];
                  return [
                    ...prev.slice(0, -1),
                    {
                      ...(lastMsg || assistantMessage),
                      content: `Task completed! I've found ${data.data.task.results.length} results for you:`,
                      results: data.data.task.results,
                      activities: [...currentActivities]
                    },
                  ];
                });
                break;

              case 'error':
                setAgentStatus('error');
                setMessages((prev) => [
                  ...prev.slice(0, -1),
                  {
                    ...assistantMessage,
                    content: `I encountered an error: ${data.data.message}`,
                  },
                ]);
                break;
            }
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setAgentStatus('error');
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          ...assistantMessage,
          content: `Error: ${errorMessage}. Please try again.`,
        },
      ]);
    }
  };

  if (status === "loading") {
    return <Loader text="Synchronizing Session" />;
  }

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  return (
    <AppLayout pipelineCount={createdPipelines.length}>
      <div className="max-w-7xl mx-auto w-full h-full flex flex-col p-6">
        <div className="flex-1 overflow-hidden">
          <ChatWindow messages={messages} />
        </div>

        <div className="sticky bottom-0 pt-6 bg-gradient-to-t from-background via-background to-transparent">
          <div className="border bg-card/80 backdrop-blur-xl rounded-2xl shadow-lg">
            <CommandInput
              onSubmit={handleCommandSubmit}
              disabled={agentStatus === 'planning' || agentStatus === 'executing'}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

"use client";

import { useRef, useEffect } from "react";
import { Message } from "@/types";
import { User, Bot } from "lucide-react";
import { formatTimestamp, cn } from "@/lib/utils";
import AgentResults from "./AgentResults";
import AgentActivityLog from "./AgentActivityLog";

interface ChatWindowProps {
  messages: Message[];
}

export default function ChatWindow({ messages }: ChatWindowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-background/50">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <Bot className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-2">How can I help you?</h2>
        <p className="text-muted-foreground max-w-sm">
          Describe any web task you&apos;d like me to perform, and I&apos;ll handle the rest.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-8 p-6 pb-32 scrollbar-thin scrollbar-thumb-muted"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-4 w-full animate-fade-in",
              message.role === "user" ? "flex-row-reverse" : "flex-row"
            )}
          >
            <div className={cn(
              "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border",
              message.role === "user" ? "bg-primary/10 border-primary/20" : "bg-muted border-border"
            )}>
              {message.role === "user" ? (
                <User className="w-4 h-4 text-primary" />
              ) : (
                <Bot className="w-4 h-4 text-primary" />
              )}
            </div>

            <div className={cn(
              "flex flex-col gap-2",
              message.role === "user" ? "items-end max-w-[80%]" : "items-start max-w-[90%] w-full"
            )}>
              <div className={cn(
                "px-5 py-4 rounded-2xl text-[15px] leading-relaxed shadow-sm transition-all",
                message.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-none"
                  : "bg-card border text-foreground rounded-tl-none w-full"
              )}>
                <div className="whitespace-pre-wrap">{message.content}</div>

                {/* Activities / Execution Flow */}
                {message.activities && message.activities.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-border/50">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Execution Flow</span>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto pr-2 scrollbar-thin">
                      <AgentActivityLog activities={message.activities} />
                    </div>
                  </div>
                )}

                {/* Results */}
                {message.results && message.results.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-border/50">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Results Found</span>
                    </div>
                    <AgentResults results={message.results} />
                  </div>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground font-semibold px-2">
                {formatTimestamp(message.timestamp)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

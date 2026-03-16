"use client";

import { useState, KeyboardEvent, forwardRef } from "react";
import { Send, Sparkles, Wand2 } from "lucide-react";
import Button from "./ui/Button";
import { cn } from "@/lib/utils";

interface CommandInputProps {
  onSubmit: (command: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const CommandInput = forwardRef<HTMLTextAreaElement, CommandInputProps>(({
  onSubmit,
  disabled = false,
  placeholder = "Command the internet...",
}, ref) => {
  const [command, setCommand] = useState("");

  const handleSubmit = () => {
    if (command.trim() && !disabled) {
      onSubmit(command.trim());
      setCommand("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const exampleCommands = [
    "Find the cheapest flight to Dubai",
    "Apply to React jobs remotely",
    "Find the cheapest iPhone 15",
  ];

  return (
    <div className="w-full flex flex-col gap-3 p-4">
      {/* Example Commands */}
      {!disabled && command === "" && (
        <div className="flex flex-wrap items-center gap-2 animate-fade-in px-1 text-left">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/50 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            <Wand2 className="w-3 h-3" />
            Suggestions
          </div>
          {exampleCommands.map((example, index) => (
            <button
              key={index}
              onClick={() => setCommand(example)}
              className="text-left px-3 py-1.5 rounded-full border border-border bg-card hover:bg-muted hover:border-primary/50 transition-all duration-300 text-[13px] text-muted-foreground hover:text-foreground shadow-sm hover:shadow-md"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="relative">
        <textarea
          ref={ref}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          style={{ minHeight: "60px" }}
          className={cn(
            "w-full rounded-xl border-2 border-border bg-card px-5 py-4 pr-16",
            "text-[15px] placeholder:text-muted-foreground/60 shadow-sm transition-all",
            "focus:outline-none focus:border-primary/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "resize-none"
          )}
        />
        <div className="absolute right-3 bottom-3">
          <Button
            onClick={handleSubmit}
            disabled={disabled || !command.trim()}
            size="icon"
            className={cn(
              "w-10 h-10 rounded-lg transition-all",
              (command.trim() && !disabled)
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {disabled && (
        <div className="flex items-center justify-center gap-2 text-[10px] uppercase font-bold text-primary tracking-widest bg-primary/5 py-1 rounded-md">
          <Sparkles className="w-3 h-3" />
          <span>Agent Operating</span>
        </div>
      )}
    </div>
  );
});

CommandInput.displayName = "CommandInput";

export default CommandInput;

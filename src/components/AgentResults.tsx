"use client";

import { AgentResult } from "@/types";
import {
  FileText,
  Link as LinkIcon,
  Image as ImageIcon,
  Table,
  Database
} from "lucide-react";

interface AgentResultsProps {
  results: AgentResult[];
}

export default function AgentResults({ results }: AgentResultsProps) {
  const getResultIcon = (type: AgentResult["type"]) => {
    const iconClass = "w-4 h-4";

    switch (type) {
      case "text":
        return <FileText className={iconClass} />;
      case "link":
        return <LinkIcon className={iconClass} />;
      case "image":
        return <ImageIcon className={iconClass} />;
      case "table":
        return <Table className={iconClass} />;
      default:
        return <Database className={iconClass} />;
    }
  };

  const renderResultContent = (result: AgentResult) => {
    if (Array.isArray(result.content)) {
      return (
        <div className="space-y-3 p-3">
          {result.content.map((item, index) => (
            <div
              key={index}
              className="p-3 rounded-xl border border-border/50 bg-background/50"
            >
              {typeof item === "object" ? (
                <div className="space-y-2">
                  {Object.entries(item).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-start gap-4 pb-1.5 border-b border-border/30 last:border-0 last:pb-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground capitalize">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <span className="text-[12px] font-medium text-right text-foreground">
                        {String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] leading-relaxed text-foreground/90">{String(item)}</p>
              )}
            </div>
          ))}
        </div>
      );
    }

    if (typeof result.content === "object" && result.content !== null) {
      return (
        <div className="space-y-2 p-4">
          {Object.entries(result.content).map(([key, value]) => (
            <div key={key} className="flex justify-between items-start gap-4 pb-1.5 border-b border-border/30 last:border-0 last:pb-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground capitalize">
                {key.replace(/([A-Z])/g, " $1").trim()}
              </span>
              <span className="text-[12px] font-medium text-right text-foreground">
                {String(value)}
              </span>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="p-4">
        <p className="text-[12px] leading-relaxed text-foreground/90">
          {String(result.content)}
        </p>
      </div>
    );
  };

  if (results.length === 0) return null;

  return (
    <div className="w-full space-y-4">
      {results.map((result) => (
        <div key={result.id} className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-muted-foreground">
                {getResultIcon(result.type)}
              </div>
              <h3 className="text-xs font-bold text-foreground">{result.title}</h3>
            </div>
            <button className="text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors">JSON</button>
          </div>

          <div className="bg-muted/30 border border-border/50 rounded-xl overflow-hidden">
            {renderResultContent(result)}
          </div>
        </div>
      ))}
    </div>
  );
}

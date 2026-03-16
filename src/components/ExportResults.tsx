"use client";

import { AgentResult } from "@/types";
import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import Button from "./ui/Button";

interface ExportResultsProps {
  results: AgentResult[];
  command: string;
}

export default function ExportResults({ results, command }: ExportResultsProps) {
  const exportAsJSON = () => {
    const data = {
      command,
      timestamp: new Date().toISOString(),
      resultsCount: results.length,
      results: results.map((r) => ({
        title: r.title,
        type: r.type,
        content: r.content,
        timestamp: r.timestamp,
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-operator-results-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportAsCSV = () => {
    // Flatten results for CSV
    const rows: string[][] = [["Title", "Type", "Content", "Timestamp"]];

    results.forEach((result) => {
      if (Array.isArray(result.content)) {
        result.content.forEach((item) => {
          const contentStr =
            typeof item === "object"
              ? Object.values(item).join(" | ")
              : String(item);
          rows.push([
            result.title,
            result.type,
            contentStr,
            new Date(result.timestamp).toLocaleString(),
          ]);
        });
      } else {
        const contentStr =
          typeof result.content === "object"
            ? JSON.stringify(result.content)
            : String(result.content);
        rows.push([
          result.title,
          result.type,
          contentStr,
          new Date(result.timestamp).toLocaleString(),
        ]);
      }
    });

    const csv = rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-operator-results-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (results.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={exportAsJSON}
        className="text-xs"
        title="Export as JSON"
      >
        <FileJson className="w-4 h-4 mr-1" />
        JSON
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={exportAsCSV}
        className="text-xs"
        title="Export as CSV"
      >
        <FileSpreadsheet className="w-4 h-4 mr-1" />
        CSV
      </Button>
    </div>
  );
}

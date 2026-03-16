"use client";

import { cn } from "@/lib/utils";

interface LoaderProps {
    fullScreen?: boolean;
    text?: string;
}

export default function Loader({ fullScreen = true, text = "Synchronizing" }: LoaderProps) {
    return (
        <div className={cn(
            "flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm",
            fullScreen ? "fixed inset-0 z-[100]" : "w-full h-full min-h-[300px]"
        )}>
            <div className="flex flex-col items-center gap-6">
                <div className="relative w-12 h-12">
                    <div className="absolute inset-0 border-2 border-primary/20 rounded-full" />
                    <div className="absolute inset-0 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/80">
                        {text}
                    </span>
                    <div className="flex gap-1">
                        <div className="w-1 h-1 rounded-full bg-primary/40 animate-pulse" />
                        <div className="w-1 h-1 rounded-full bg-primary/40 animate-pulse delay-75" />
                        <div className="w-1 h-1 rounded-full bg-primary/40 animate-pulse delay-150" />
                    </div>
                </div>
            </div>
        </div>
    );
}

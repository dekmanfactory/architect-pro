"use client";

import { useState, useEffect } from "react";
import { Terminal as TerminalIcon, ChevronRight } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface LogEntry {
    id: number;
    message: string;
    type: "info" | "success" | "warning";
}

export default function TerminalStatus({ fileCounts }: { fileCounts: { template: number; ref: number; raw: number } }) {
    const [logs, setLogs] = useState<LogEntry[]>([]);

    useEffect(() => {
        const newLogs: LogEntry[] = [];
        let id = Date.now();

        if (fileCounts.template > 0) {
            newLogs.push({ id: id++, message: `FOUND: ${fileCounts.template} template(s) localized.`, type: "success" });
        }
        if (fileCounts.ref > 0) {
            newLogs.push({ id: id++, message: `LOADED: ${fileCounts.ref} reference document(s).`, type: "info" });
        }
        if (fileCounts.raw > 0) {
            newLogs.push({ id: id++, message: `INDEXED: ${fileCounts.raw} raw data sources.`, type: "info" });
        }

        if (fileCounts.template > 0 && fileCounts.raw > 0) {
            newLogs.push({ id: id++, message: "READY: Proposal generation engine is armed.", type: "success" });
        } else {
            newLogs.push({ id: id++, message: "WAITING: Required documents (Template/Raw) pending.", type: "warning" });
        }

        setLogs(newLogs.slice(-4)); // Keep last 4 logs
    }, [fileCounts]);

    return (
        <div className="hidden lg:flex flex-1 max-w-xl mx-8 h-12 bg-slate-900 rounded-xl border border-white/10 items-center px-4 gap-4 overflow-hidden shadow-inner">
            <div className="flex items-center gap-2 shrink-0">
                <TerminalIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">TUI_LOGS</span>
            </div>

            <div className="h-4 w-px bg-white/10 shrink-0" />

            <div className="flex-1 overflow-hidden relative h-full">
                <div className="absolute inset-0 flex flex-col justify-center animate-in fade-in transition-all">
                    {logs.length > 0 ? (
                        <div className="flex items-center gap-2 group">
                            <ChevronRight className="w-3 h-3 text-emerald-500 shrink-0" />
                            <span className={cn(
                                "text-[11px] font-mono truncate",
                                logs[logs.length - 1].type === "success" ? "text-emerald-400" :
                                    logs[logs.length - 1].type === "warning" ? "text-amber-400" : "text-blue-400"
                            )}>
                                {logs[logs.length - 1].message}
                            </span>
                            <span className="w-1.5 h-3 bg-emerald-500/50 animate-pulse shrink-0" />
                        </div>
                    ) : (
                        <span className="text-[11px] font-mono text-white/20 italic">Initializing agent sensors...</span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
                <div className={cn("w-1.5 h-1.5 rounded-full", fileCounts.template > 0 && fileCounts.raw > 0 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-700")} />
                <div className={cn("w-1.5 h-1.5 rounded-full", fileCounts.ref > 0 ? "bg-blue-500" : "bg-slate-700")} />
            </div>
        </div>
    );
}

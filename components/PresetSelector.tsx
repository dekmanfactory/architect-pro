"use client";

import { Layout, FileText, FileStack, Files, FileUp } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const PRESETS = [
    { id: "p1", label: "20만 자", value: 200000, icon: <Files className="w-5 h-5" />, color: "text-purple-400" },
    { id: "p2", label: "15만 자", value: 150000, icon: <FileStack className="w-5 h-5" />, color: "text-blue-400" },
    { id: "p3", label: "10만 자", value: 100000, icon: <FileText className="w-5 h-5" />, color: "text-emerald-400" },
    { id: "p4", label: "5만 자", value: 50000, icon: <FileUp className="w-5 h-5" />, color: "text-orange-400" },
];

interface PresetSelectorProps {
    selectedId: string;
    onSelect: (id: string) => void;
}

export default function PresetSelector({ selectedId, onSelect }: PresetSelectorProps) {
    return (
        <div className="flex items-center gap-2 p-1.5 bg-slate-900 rounded-2xl border border-white/10 shadow-xl self-end">
            <div className="px-3 border-r border-white/10 mr-1 flex items-center gap-2">
                <Layout className="w-4 h-4 text-slate-500" />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Preset</span>
            </div>
            {PRESETS.map((preset) => {
                const isSelected = selectedId === preset.id;
                return (
                    <button
                        key={preset.id}
                        onClick={() => onSelect(preset.id)}
                        className={cn(
                            "group relative flex items-center gap-2 px-4 py-2 rounded-xl transition-all",
                            isSelected
                                ? "bg-white/10 text-white shadow-lg"
                                : "text-slate-500 hover:text-white hover:bg-white/5"
                        )}
                        title={preset.label}
                    >
                        <div className={cn("transition-colors", isSelected ? preset.color : "text-inherit")}>
                            {preset.icon}
                        </div>
                        <span className="text-xs font-bold whitespace-nowrap">{preset.label}</span>
                        {isSelected && (
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full border border-slate-900" />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

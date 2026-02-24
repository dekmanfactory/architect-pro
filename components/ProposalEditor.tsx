"use client";

import { useState } from "react";
import { Copy, Download, Wand2, ArrowRight, FileText, Layout } from "lucide-react";
import ModelSelector from "@/components/ModelSelector";

const PRESETS = [
    { label: "20만 자 (대용량)", value: 200000, color: "from-purple-500 to-indigo-600" },
    { label: "15만 자 (표준)", value: 150000, color: "from-blue-500 to-cyan-600" },
    { label: "10만 자 (요약)", value: 100000, color: "from-emerald-500 to-teal-600" },
    { label: "5만 자 (간이)", value: 50000, color: "from-orange-500 to-pink-600" },
];

export default function ProposalEditor() {
    const [content, setContent] = useState("");
    const [selectedPreset, setSelectedPreset] = useState(PRESETS[1]);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleGenerate = () => {
        setIsGenerating(true);
        // TODO: AI API 연동
        setTimeout(() => {
            setContent(`[${selectedPreset.label} 제안서 초안]\n\n이 내용은 선택하신 모델을 통해 생성될 예정입니다. RFP 분석 결과와 사내 데이터를 결합하여 약 ${selectedPreset.value.toLocaleString()}자 분량의 전문적인 제안서를 작성합니다.`);
            setIsGenerating(false);
        }, 1500);
    };

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-8">
            {/* Header with Model Selector */}
            <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-3xl border border-white/10 backdrop-blur-xl">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl shadow-lg ring-4 ring-indigo-500/20">
                        <FileText className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">제안서 초안 작성</h1>
                        <p className="text-xs text-slate-400">PDF RFP와 사내 데이터를 조합하여 초안을 생성합니다.</p>
                    </div>
                </div>
                <ModelSelector />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Sidebar Controls */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-slate-900/40 p-5 rounded-3xl border border-white/10 space-y-4">
                        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                            <Layout className="w-4 h-4" /> 분량 프리셋 선택
                        </h2>
                        <div className="grid grid-cols-1 gap-3">
                            {PRESETS.map((preset) => (
                                <button
                                    key={preset.value}
                                    onClick={() => setSelectedPreset(preset)}
                                    className={`relative p-4 rounded-2xl border transition-all text-left group overflow-hidden ${selectedPreset.value === preset.value
                                        ? "border-white/20 ring-2 ring-indigo-500/50"
                                        : "border-white/5 hover:border-white/10 bg-white/5"
                                        }`}
                                >
                                    <div className={`absolute inset-0 bg-gradient-to-r ${preset.color} opacity-0 group-hover:opacity-10 transition-opacity`} />
                                    <div className="relative flex flex-col">
                                        <span className={`text-sm font-bold ${selectedPreset.value === preset.value ? "text-white" : "text-slate-400"}`}>
                                            {preset.label}
                                        </span>
                                        <span className="text-[10px] text-slate-500">목표 글자 수: {preset.value.toLocaleString()}자</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold shadow-xl shadow-indigo-500/20 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50"
                    >
                        {isGenerating ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Wand2 className="w-5 h-5" />
                        )}
                        AI 초안 생성 시작
                    </button>
                </div>

                {/* Editor Area */}
                <div className="lg:col-span-3 space-y-4">
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                        <div className="relative bg-slate-900 rounded-3xl border border-white/10 overflow-hidden min-h-[600px] flex flex-col">
                            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5">
                                <span className="text-xs font-medium text-slate-400 uppercase tracking-widest">Editor Canvas</span>
                                <div className="flex items-center gap-2">
                                    <button className="p-2 rounded-xl text-slate-400 hover:bg-white/10 transition-colors">
                                        <Copy className="w-4 h-4" />
                                    </button>
                                    <button className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-xl hover:bg-emerald-500/20 border border-emerald-500/20 transition-all text-sm font-bold">
                                        <Download className="w-4 h-4" /> HWPX 다운로드
                                    </button>
                                </div>
                            </div>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="PDF 리포트 분석 및 데이터 매핑 후 AI가 생성한 제안서 초안이 여기에 표시됩니다..."
                                className="w-full flex-grow p-8 bg-transparent text-slate-200 focus:outline-none resize-none leading-relaxed font-serif text-lg"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

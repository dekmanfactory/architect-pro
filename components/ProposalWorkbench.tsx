"use client";

import { useState, useRef, useEffect } from "react";
import { Play, RotateCcw, Save, Menu, ChevronRight, FileJson, Send, Download, Sparkles, FileText } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}


interface Section {
    id: string;
    title: string;
    depth: number;
    initialContent?: string;
}

interface ProposalWorkbenchProps {
    sections?: Section[];
    globalPrompt?: string;
    presetValue?: number;
    refData?: string;
    rawData?: string;
}

export default function ProposalWorkbench({
    sections = [],
    globalPrompt = "",
    presetValue = 100000,
    refData = "",
    rawData = ""
}: ProposalWorkbenchProps) {
    const [activeTab, setActiveTab] = useState(sections[0]?.id || "");

    const [contents, setContents] = useState<Record<string, string>>({});
    const [prompts, setPrompts] = useState<Record<string, string>>({});
    const [status, setStatus] = useState<Record<string, "pending" | "generating" | "complete" | "error">>({});
    const [isFullRunning, setIsFullRunning] = useState(false);
    const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

    // Update state when sections change
    useEffect(() => {
        if (sections.length > 0) {
            if (!activeTab) setActiveTab(sections[0].id);

            // Populate initial content if available
            const initialContents: Record<string, string> = {};
            sections.forEach(s => {
                if (s.initialContent) {
                    initialContents[s.id] = s.initialContent;
                }
            });
            if (Object.keys(initialContents).length > 0) {
                setContents(prev => ({ ...prev, ...initialContents }));
            }
        }
    }, [sections]);

    const scrollToSection = (id: string) => {
        setActiveTab(id);
        const el = sectionRefs.current[id];
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    const handleGenerate = async (id: string) => {
        const section = sections.find(s => s.id === id);
        if (!section || section.depth === 1) return;

        setStatus(prev => ({ ...prev, [id]: "generating" }));
        const modelId = localStorage.getItem("selected-ai-model") || "gemini-3.0-flash";
        const customGeminiKey = localStorage.getItem("custom-gemini-key") || "";
        const customClaudeKey = localStorage.getItem("custom-claude-key") || "";

        // 📌 섹션별 목표 분량 계산: 전체 분량 / 2depth 섹션 개수 × 1.5배 (AI가 목표의 40~50%만 작성하는 경향 보정)
        const depth2Count = sections.filter(s => s.depth === 2).length;
        const perSectionTarget = depth2Count > 0 ? Math.floor((presetValue / depth2Count) * 1.5) : Math.floor(presetValue * 2.5);

        try {
            const response = await fetch("/api/ai/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    modelId,
                    customGeminiKey,
                    customClaudeKey,
                    sectionTitle: section.title,
                    prompt: `${globalPrompt}\n\n[이 섹션의 개별 지침]\n${prompts[id] || "특별한 추가 지침 없음"}`,
                    presetValue: perSectionTarget, // 📌 섹션별 분량 전달
                    refData,
                    sourceData: rawData,
                }),
            });

            const data = await response.json();
            if (data.text) {
                setContents(prev => ({ ...prev, [id]: data.text }));
                setStatus(prev => ({ ...prev, [id]: "complete" }));
            } else {
                setStatus(prev => ({ ...prev, [id]: "error" }));
            }
        } catch (error) {
            console.error(error);
            setStatus(prev => ({ ...prev, [id]: "error" }));
        }
    };

    const handleFullRun = async () => {
        if (isFullRunning) return;

        const depth2Sections = sections.filter(s => s.depth === 2);
        console.log("[MASTER RUN] Total sections:", sections.length);
        console.log("[MASTER RUN] Depth 2 sections:", depth2Sections.length);
        console.log("[MASTER RUN] Sections:", depth2Sections.map(s => ({ id: s.id, title: s.title, depth: s.depth })));

        if (depth2Sections.length === 0) {
            alert("2depth 섹션이 없습니다. 뼈대에서 2depth 항목을 추가해주세요.");
            return;
        }

        setIsFullRunning(true);

        for (const section of depth2Sections) {
            console.log("[MASTER RUN] Processing:", section.title);
            scrollToSection(section.id);
            await handleGenerate(section.id);
        }

        setIsFullRunning(false);
        console.log("[MASTER RUN] Completed!");
    };

    const handleDownloadMarkdown = () => {
        const depth2Sections = sections.filter(s => s.depth === 2 && contents[s.id]);
        if (depth2Sections.length === 0) {
            alert("작성된 내용이 없습니다.");
            return;
        }

        // Generate Markdown content
        let markdown = `# 제안서 초안\n\n`;
        markdown += `**생성일**: ${new Date().toLocaleDateString("ko-KR")}\n\n`;
        markdown += `---\n\n`;

        depth2Sections.forEach((section) => {
            markdown += `## ${section.title}\n\n`;
            let cleanText = contents[section.id] || "";

            // 1. HTML <table>을 마크다운 표로 변환 (태그 제거 전에 처리)
            cleanText = cleanText.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (tableMatch) => {
                const headers: string[] = [];
                const rows: string[][] = [];

                // 헤더 추출 (<th>)
                const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
                let thMatch;
                while ((thMatch = thRegex.exec(tableMatch)) !== null) {
                    headers.push(thMatch[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
                }

                // 데이터 행 추출 (<tbody> 이후의 <tr>)
                let bodyHtml = tableMatch;
                const theadEnd = tableMatch.indexOf('</thead>');
                if (theadEnd !== -1) bodyHtml = tableMatch.substring(theadEnd);

                const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                let trMatch;
                while ((trMatch = trRegex.exec(bodyHtml)) !== null) {
                    if (/<th[\s>]/i.test(trMatch[1])) continue;
                    const cells: string[] = [];
                    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                    let tdMatch;
                    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
                        let cellText = tdMatch[1];
                        cellText = cellText.replace(/<span class="[^"]*text-red-[^"]*"[^>]*>(.*?)<\/span>/gi, "**$1**");
                        cellText = cellText.replace(/<span class="[^"]*text-green-[^"]*"[^>]*>(.*?)<\/span>/gi, "*$1*");
                        cellText = cellText.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
                        cells.push(cellText);
                    }
                    if (cells.length > 0) rows.push(cells);
                }

                if (headers.length === 0) return '';

                // 마크다운 표 생성
                let md = `\n| ${headers.join(' | ')} |\n`;
                md += `| ${headers.map(() => '---').join(' | ')} |\n`;
                rows.forEach(row => {
                    md += `| ${row.join(' | ')} |\n`;
                });
                return md + '\n';
            });

            // 2. 나머지 HTML 처리
            cleanText = cleanText.replace(/<br\s*\/?>/gi, "\n");
            cleanText = cleanText.replace(/<\/p>/gi, "\n\n");
            cleanText = cleanText.replace(/<span class="[^"]*text-red-[^"]*"[^>]*>(.*?)<\/span>/gi, "**$1**");
            cleanText = cleanText.replace(/<span class="[^"]*text-green-[^"]*"[^>]*>(.*?)<\/span>/gi, "*$1*");
            cleanText = cleanText.replace(/<[^>]+>/g, "");
            markdown += cleanText.trim() + "\n\n";
        });

        // Download as .md file
        const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
        const url = window.URL.createObjectURL(blob);
        const modelId = localStorage.getItem("selected-ai-model") || "gemini-3.0-flash";
        const modelName = modelId.replace(/-/g, '_');
        const timestamp = new Date().toLocaleDateString("ko-KR").replace(/\. /g, '-').replace(/\./g, '');
        const a = document.createElement("a");
        a.href = url;
        a.download = `제안서_${modelName}_${timestamp}.md`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const handleDownloadIndividual = async (id: string) => {
        const section = sections.find(s => s.id === id);
        if (!section || !contents[id]) return;

        // Get model info
        const modelId = localStorage.getItem("selected-ai-model") || "gemini-3.0-flash";
        const modelName = modelId.replace(/-/g, '_');

        try {
            const response = await fetch("/api/generate-hwpx", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: section.title,
                    sections: [{ title: section.title, text: contents[id] }],
                    organization: "Architect PRO",
                    date: new Date().toLocaleDateString("ko-KR").replace(/\//g, '. '),
                    model: modelName,
                    preset: section.title
                }),
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `제안서_${section.title}.hwpx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } else {
                const error = await response.json();
                console.error("API Error:", error);
                alert(`다운로드 실패: ${error.error || '알 수 없는 오류'}`);
            }
        } catch (e) {
            console.error("Download failed", e);
            alert("다운로드 중 오류가 발생했습니다.");
        }
    };

    const handleDownloadAll = async () => {
        const depth2Sections = sections.filter(s => s.depth === 2 && contents[s.id]);
        if (depth2Sections.length === 0) {
            alert("작성된 내용이 없습니다.");
            return;
        }

        // Get model and preset info for filename
        const modelId = localStorage.getItem("selected-ai-model") || "gemini-3.0-flash";
        const modelName = modelId.replace(/-/g, '_'); // e.g., gemini_3.0_flash
        const presetName = `${Math.floor(presetValue / 10000)}만자`; // e.g., "20만자", "10만자"
        const timestamp = new Date().toLocaleDateString("ko-KR").replace(/\. /g, '-').replace(/\./g, '');

        try {
            const response = await fetch("/api/generate-hwpx", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: "종합 제안서 초안",
                    sections: depth2Sections.map(s => ({
                        title: s.title,
                        text: contents[s.id]
                    })),
                    organization: "Architect PRO",
                    date: new Date().toLocaleDateString("ko-KR").replace(/\//g, '. '),
                    model: modelName,
                    preset: presetName
                }),
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `통합_제안서_${modelName}_${presetName}_${timestamp}.hwpx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } else {
                const error = await response.json();
                console.error("API Error:", error);
                alert(`다운로드 실패: ${error.error || '알 수 없는 오류'}`);
            }
        } catch (e) {
            console.error("Full download failed", e);
            alert("파일 생성 중 오류가 발생했습니다.");
        }
    };

    return (
        <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 pb-20 min-h-[800px]">
            {/* Left: Hierarchical Sidebar */}
            <div className="w-full lg:w-[360px] flex flex-col bg-slate-900 rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl shrink-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.04] shrink-0">
                    <div className="flex flex-col">
                        <h3 className="text-[14px] font-black text-white/90 uppercase tracking-tighter flex items-center gap-2">
                            <Menu className="w-4 h-4 text-indigo-400" /> BACKBONE STRUCTURE
                        </h3>
                    </div>
                    <button
                        onClick={handleFullRun}
                        disabled={isFullRunning}
                        className="flex items-center gap-2 px-4 py-2 bg-[#6366F1] hover:bg-[#5558E3] text-white rounded-xl text-[10px] font-black uppercase transition-all disabled:opacity-50 shadow-lg shadow-indigo-600/30"
                    >
                        {isFullRunning ? <RotateCcw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        MASTER RUN (FULL)
                    </button>
                </div>

                <div className="p-4 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
                    {sections.map((section: Section) => {
                        const isDepth1 = section.depth === 1;
                        const isActive = activeTab === section.id;
                        const s = status[section.id];

                        if (isDepth1) {
                            return (
                                <div key={section.id} className="pt-6 first:pt-2 px-4 scroll-mt-24" ref={(el: any) => (sectionRefs.current[section.id] = el)}>
                                    <button
                                        onClick={() => scrollToSection(section.id)}
                                        className="text-left w-full group/lv1"
                                    >
                                        <div className="text-[14px] font-black text-[#6366F1] uppercase tracking-tighter mb-1 select-none flex items-center gap-2 group-hover/lv1:translate-x-1 transition-transform">
                                            <div className="w-1 h-3 bg-[#6366F1] rounded-full" />
                                            {section.title}
                                        </div>
                                    </button>
                                </div>
                            );
                        }

                        return (
                            <div key={section.id} className="px-1.5 scroll-mt-24" ref={(el: any) => (sectionRefs.current[section.id] = el)}>
                                <div className={cn(
                                    "group flex flex-col gap-3 p-4 rounded-2xl transition-all border outline-none",
                                    isActive ? "bg-[#4F46E5] border-white/20 shadow-2xl shadow-indigo-500/40" : "hover:bg-white/5 border-transparent"
                                )}>
                                    <button
                                        onClick={() => scrollToSection(section.id)}
                                        className="flex items-center justify-between text-left w-full"
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className={cn(
                                                "w-2 h-2 rounded-full shrink-0 shadow-sm",
                                                s === "complete" ? "bg-emerald-400" :
                                                    s === "generating" ? "bg-blue-300 animate-pulse" :
                                                        s === "error" ? "bg-red-500" : "bg-[#FF4D4D]"
                                            )} />
                                            <span className={cn(
                                                "text-[12px] font-bold tracking-tight",
                                                isActive ? "text-white" : "text-slate-200"
                                            )}>
                                                {section.title}
                                            </span>
                                        </div>
                                        <ChevronRight className={cn(
                                            "w-3.5 h-3.5 transition-transform shrink-0",
                                            isActive ? "rotate-90 text-white" : "text-white/40"
                                        )} />
                                    </button>

                                    {isActive && (
                                        <div className="flex flex-col gap-3 mt-1 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <textarea
                                                placeholder="지침 추가..."
                                                value={prompts[section.id] || ""}
                                                onChange={(e) => setPrompts({ ...prompts, [section.id]: e.target.value })}
                                                className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-[11px] text-white placeholder:text-white/40 focus:outline-none focus:border-white/40 resize-none h-20 transition-all font-medium"
                                            />
                                            <button
                                                onClick={() => handleGenerate(section.id)}
                                                disabled={s === "generating"}
                                                className="w-full flex items-center justify-center gap-2 py-3 bg-white text-[#4F46E5] hover:bg-slate-50 rounded-xl text-[11px] font-black tracking-widest uppercase transition-all disabled:opacity-50 shadow-xl shadow-black/20"
                                            >
                                                {s === "generating" ? <RotateCcw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-[#4F46E5]" />}
                                                AI 작성
                                            </button>
                                            {contents[section.id] && (
                                                <button
                                                    onClick={() => handleDownloadIndividual(section.id)}
                                                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all shadow-lg"
                                                >
                                                    <Download className="w-3 h-3" />
                                                    개별 HWPX 다운로드
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Right: Scrolling Document Preview */}
            <div className="flex-1 flex flex-col bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl">
                <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-white w-full rounded-t-[2.5rem]">
                    <div className="flex items-center gap-4">
                        <div className="px-3 py-1 bg-slate-900 text-white text-[10px] font-black rounded-lg uppercase tracking-widest">Document Preview</div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Live Synthesizing</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleDownloadMarkdown}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                        >
                            <FileText className="w-4 h-4" />
                            Markdown 다운로드
                        </button>
                        <button
                            onClick={handleDownloadAll}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
                        >
                            <Download className="w-4 h-4" />
                            전체 HWPX 다운로드
                        </button>
                    </div>
                </div>

                <div className="p-12 bg-[#fdfdfd]">
                    <div className="max-w-3xl mx-auto space-y-12">
                        {sections.map((section: Section) => (
                            <div
                                key={section.id}
                                ref={(el: any) => (sectionRefs.current[section.id] = el)}
                                className={cn(
                                    "transition-opacity duration-500 scroll-mt-24",
                                    section.depth === 1 ? "pt-8" : ""
                                )}
                            >
                                {section.depth === 1 ? (
                                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter border-b-2 border-slate-100 pb-4 mb-6">
                                        {section.title}
                                    </h2>
                                ) : (
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-3">
                                            <span className="text-indigo-600 select-none opacity-50">#</span>
                                            {section.title}
                                        </h3>
                                        <div
                                            className={cn(
                                                "min-h-[160px] p-10 rounded-[2.5rem] transition-all leading-relaxed font-serif text-lg text-slate-700 whitespace-pre-wrap border",
                                                contents[section.id]
                                                    ? "bg-white border-slate-100 shadow-xl shadow-slate-200/50"
                                                    : "bg-slate-50/50 border-slate-100 border-dashed flex flex-col items-center justify-center text-slate-400"
                                            )}
                                        >
                                            {status[section.id] === "generating" ? (
                                                <div className="text-center space-y-4 opacity-60">
                                                    <div className="w-16 h-16 mx-auto">
                                                        <RotateCcw className="w-full h-full animate-spin text-indigo-500" />
                                                    </div>
                                                    <p className="font-bold text-xl tracking-tight text-indigo-600">
                                                        AI 작성 중...
                                                    </p>
                                                    <p className="text-sm font-sans font-medium text-slate-500">
                                                        {section.title} 섹션을 생성하고 있습니다.
                                                    </p>
                                                </div>
                                            ) : contents[section.id] ? (
                                                <div dangerouslySetInnerHTML={{ __html: contents[section.id] }} />
                                            ) : (
                                                <div className="text-center space-y-3 opacity-40 group-hover:opacity-60 transition-opacity">
                                                    <div className="w-12 h-1 bg-slate-200 mx-auto rounded-full mb-4" />
                                                    <p className="font-bold text-xl tracking-tight text-slate-500">
                                                        {section.title}
                                                    </p>
                                                    <p className="text-sm font-sans font-medium">내역이 작성되면 이 자리에 표시됩니다.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

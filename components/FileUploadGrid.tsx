"use client";

import { Upload, FileText, Zap, ShieldCheck, RotateCcw, Trash2, Send, Save, FileJson, Edit3 } from "lucide-react";
import { useState, useRef } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface UploadCardProps {
    title: string;
    subtitle: string;
    description: string;
    isRequired?: boolean;
    type: "template" | "ref" | "raw";
    icon: React.ReactNode;
    color: string;
    onCountChange?: (count: number) => void;
    onFileSelected?: (file: File) => void;
}

const UploadCard = ({ title, subtitle, description, isRequired, icon, color, onCountChange, onFileSelected }: UploadCardProps) => {
    const [fileCount, setFileCount] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        // Only set to false if we leave the outer container
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            processFiles(files);
        }
    };

    const processFiles = (files: FileList) => {
        const newCount = fileCount + files.length;
        setFileCount(newCount);
        onCountChange?.(newCount);
        onFileSelected?.(files[0]);
    };

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            processFiles(files);
        }
    };

    return (
        <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
            className={cn(
                "relative flex flex-col items-center p-8 rounded-[2rem] border-2 transition-all cursor-pointer bg-white group hover:shadow-2xl hover:-translate-y-1",
                color,
                isDragging && "border-indigo-600 bg-indigo-50/50 scale-[1.02] shadow-2xl"
            )}
        >
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                multiple
                className="hidden"
            />

            <div className={cn(
                "p-5 rounded-2xl bg-slate-50 mb-6 transition-transform group-hover:scale-110",
                isDragging && "scale-125 bg-white shadow-xl"
            )}>
                {icon}
            </div>

            <div className="text-center space-y-1 pointer-events-none">
                <h3 className="text-xl font-bold text-slate-900">{title}</h3>
                <p className="text-sm text-slate-500 font-medium">{subtitle}</p>
                <p className="text-xs text-slate-400 mt-2">{description}</p>
            </div>

            <div className="mt-8 flex flex-col items-center gap-2 pointer-events-none">
                {isRequired && (
                    <span className="text-[10px] font-bold text-red-500 uppercase tracking-tighter">* 필수 업로드</span>
                )}

                <div className={cn(
                    "flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs font-bold transition-colors",
                    fileCount > 0 ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-slate-50 border-slate-100 text-slate-400"
                )}>
                    {fileCount > 0 && <ShieldCheck className="w-3 h-3" />}
                    {fileCount}개 준비됨
                </div>
            </div>
        </div>
    );
};

interface BackboneSection {
    id: string;
    title: string;
    depth: number;
    initialContent?: string;
}

export default function FileUploadGrid({
    onFilesChange,
    onStart,
    onTemplateAnalyzed,
    onRefDataExtracted,
    onRawDataExtracted
}: {
    onFilesChange?: (counts: { template: number; ref: number; raw: number }) => void;
    onStart?: () => void;
    onTemplateAnalyzed?: (sections: BackboneSection[]) => void;
    onRefDataExtracted?: (text: string) => void;
    onRawDataExtracted?: (text: string) => void;
}) {
    const [counts, setCounts] = useState({ template: 0, ref: 0, raw: 0 });
    const [sections, setSections] = useState<BackboneSection[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [editingSplitIdx, setEditingSplitIdx] = useState<number | null>(null);
    const [splitBuffer, setSplitBuffer] = useState<{ title: string; content: string }>({ title: "", content: "" });
    const jsonInputRef = useRef<HTMLInputElement>(null);

    const handleCountChange = (type: "template" | "ref" | "raw", count: number) => {
        const newCounts = { ...counts, [type]: count };
        setCounts(newCounts);
        onFilesChange?.(newCounts);
    };

    const handleTemplateFile = async (file: File) => {
        const name = file.name.toLowerCase();
        if (!name.endsWith(".hwpx") && !name.endsWith(".pdf")) return;

        setIsAnalyzing(true);
        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch("/api/hwpx/analyze", {
                method: "POST",
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                if (data.error) {
                    alert(data.error);
                } else if (data.sections) {
                    setSections(data.sections);
                    onTemplateAnalyzed?.(data.sections);
                }
            }
        } catch (error) {
            console.error("Analysis failed:", error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleRefFile = async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        try {
            const response = await fetch("/api/hwpx/extract", {
                method: "POST",
                body: formData,
            });
            if (response.ok) {
                const data = await response.json();
                onRefDataExtracted?.(data.text || "");
            }
        } catch (error) {
            console.error("Ref extraction failed:", error);
        }
    };

    const handleRawFile = async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        try {
            const response = await fetch("/api/hwpx/extract", {
                method: "POST",
                body: formData,
            });
            if (response.ok) {
                const data = await response.json();
                onRawDataExtracted?.(data.text || "");
            }
        } catch (error) {
            console.error("Raw extraction failed:", error);
        }
    };

    // Backbone Edit Handlers
    const handleDeleteSection = (index: number) => {
        const newSections = sections.filter((_, i) => i !== index);
        setSections(newSections);
        onTemplateAnalyzed?.(newSections);
    };

    const handleToggleDepth = (index: number) => {
        const newSections = sections.map((s, i) =>
            i === index ? { ...s, depth: s.depth === 1 ? 2 : 1 } : s
        );
        setSections(newSections);
        onTemplateAnalyzed?.(newSections);
    };

    const handleMergeWithPrevious = (index: number) => {
        if (index === 0) return;
        const newSections = [...sections];
        const current = newSections[index];
        const prev = newSections[index - 1];

        // Merge titles
        prev.title = `${prev.title} ${current.title}`;

        // Remove current
        newSections.splice(index, 1);

        setSections(newSections);
        onTemplateAnalyzed?.(newSections);
    };

    const handleSplitSection = (index: number) => {
        const section = sections[index];
        const parts = section.title.split(' ');
        if (parts.length < 2) return;

        const newSections = [...sections];
        const lastPart = parts.pop() || "";
        section.title = parts.join(' ');

        newSections.splice(index + 1, 0, {
            id: `s${Date.now()}`,
            title: lastPart,
            depth: section.depth
        });

        setSections(newSections);
        onTemplateAnalyzed?.(newSections);
    };

    const handleEdit = (index: number) => {
        const section = sections[index];
        setSplitBuffer({
            title: section.title,
            content: section.initialContent || ""
        });
        setEditingSplitIdx(index);
    };

    const handleExtractToContent = (index: number) => {
        const section = sections[index];
        const parts = section.title.split(' ');

        // Initial suggestion: first word as title, rest as content
        const suggestedTitle = parts[0];
        const suggestedContent = parts.slice(1).join(' ');

        setSplitBuffer({
            title: suggestedTitle,
            content: suggestedContent + (section.initialContent ? "\n" + section.initialContent : "")
        });
        setEditingSplitIdx(index);
    };

    const applySplit = () => {
        if (editingSplitIdx === null) return;

        const newSections = [...sections];
        newSections[editingSplitIdx] = {
            ...newSections[editingSplitIdx],
            title: splitBuffer.title,
            initialContent: splitBuffer.content
        };

        setSections(newSections);
        onTemplateAnalyzed?.(newSections);
        setEditingSplitIdx(null);
    };

    const exportBackbone = () => {
        // level 필드 제거, depth만 유지
        const cleanedSections = sections.map(({ id, title, depth, initialContent }) => ({
            id,
            title,
            depth,
            ...(initialContent ? { initialContent } : {})
        }));

        const dataStr = JSON.stringify(cleanedSections, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const exportFileDefaultName = `backbone_${new Date().toISOString().split('T')[0]}.json`;

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    };

    const importBackbone = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (Array.isArray(json)) {
                    setSections(json);
                    onTemplateAnalyzed?.(json);
                }
            } catch (err) {
                alert("JSON 형식이 올바르지 않습니다.");
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="w-full max-w-7xl mx-auto space-y-12 py-12 px-6">
            <div className="text-center space-y-2">
                <h2 className="text-5xl font-black text-slate-900 tracking-tight italic">
                    Ready to <span className="text-indigo-600">Draft?</span>
                </h2>
                <p className="text-slate-500 font-medium">제안서 작성을 위한 기본 문서들을 업로드해 주세요.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <UploadCard
                    title="발주처 양식"
                    subtitle={isAnalyzing ? "뼈대 추출 중..." : "RFP Template (PDF)"}
                    description="문서의 구조와 작성 항목을 파악합니다"
                    isRequired
                    type="template"
                    icon={<Upload className={cn("w-10 h-10 text-orange-400", isAnalyzing && "animate-bounce")} />}
                    color="border-orange-100/50 hover:border-orange-300 shadow-orange-500/5"
                    onCountChange={(c) => handleCountChange("template", c)}
                    onFileSelected={(f) => handleTemplateFile(f)}
                />

                <UploadCard
                    title="참조 제안서"
                    subtitle="Reference (Ref)"
                    description="합격 제안서의 문체와 논리를 학습합니다"
                    type="ref"
                    icon={<FileText className="w-10 h-10 text-blue-400" />}
                    color="border-blue-100/50 hover:border-blue-300 shadow-blue-500/5"
                    onCountChange={(c) => handleCountChange("ref", c)}
                    onFileSelected={(f) => handleRefFile(f)}
                />

                <UploadCard
                    title="매칭 로데이터"
                    subtitle="Source Data (Raw)"
                    description="기술 스펙, 업체 정보 등 사실 데이터"
                    isRequired
                    type="raw"
                    icon={<Zap className="w-10 h-10 text-yellow-500" />}
                    color="border-yellow-100/50 hover:border-yellow-300 shadow-yellow-500/5"
                    onCountChange={(c) => handleCountChange("raw", c)}
                    onFileSelected={(f) => handleRawFile(f)}
                />
            </div>

            {/* Backbone Preview (The "OK" Step) */}
            {sections.length > 0 && (
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl border border-slate-200 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                            <Zap className="w-32 h-32 text-indigo-500" />
                        </div>

                        <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-6">
                            <div className="space-y-1">
                                <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                                    <div className="w-2.5 h-8 bg-indigo-500 rounded-full" />
                                    Extracted <span className="text-indigo-600 uppercase tracking-widest text-xl">Backbone</span>
                                </h3>
                                <p className="text-slate-500 text-sm font-medium">단위별로 쪼개진 항목은 [위와 합치기] 또는 [재분리]를 통해 구조를 완성해 주세요.</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <input
                                    type="file"
                                    ref={jsonInputRef}
                                    onChange={importBackbone}
                                    accept=".json"
                                    className="hidden"
                                />
                                <button
                                    onClick={() => jsonInputRef.current?.click()}
                                    className="px-5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-[13px] font-black hover:bg-slate-200 transition-all shadow-sm flex items-center gap-2"
                                >
                                    <Upload className="w-4 h-4" />
                                    JSON 불러오기
                                </button>
                                <button
                                    onClick={exportBackbone}
                                    className="px-5 py-2.5 bg-slate-900 border border-slate-900 rounded-xl text-white text-[13px] font-black hover:bg-slate-800 transition-all shadow-md flex items-center gap-2"
                                >
                                    <FileJson className="w-4 h-4" />
                                    JSON 저장
                                </button>
                                <div className="w-px h-6 bg-slate-200 mx-1" />
                                <button
                                    onClick={() => {
                                        let newSections = [...sections];
                                        for (let i = newSections.length - 1; i > 0; i--) {
                                            if (newSections[i].title.length < 15) {
                                                newSections[i - 1].title = `${newSections[i - 1].title} ${newSections[i].title}`;
                                                newSections.splice(i, 1);
                                            }
                                        }
                                        setSections(newSections);
                                        onTemplateAnalyzed?.(newSections);
                                    }}
                                    className="px-6 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600 text-[13px] font-black hover:bg-indigo-100 transition-all shadow-sm"
                                >
                                    자동 병합 (Auto Merge)
                                </button>
                                <div className="px-6 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-600 text-[13px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm">
                                    <ShieldCheck className="w-5 h-5" /> Analyzed Successfully
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            {sections.map((s, idx) => (
                                <div
                                    key={s.id}
                                    className={cn(
                                        "group/item p-6 rounded-[2rem] border transition-all relative flex flex-col gap-4",
                                        s.depth === 1
                                            ? "bg-slate-50 border-slate-200 shadow-md"
                                            : "bg-white border-slate-100 ml-16 shadow-sm"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-8">
                                        <div className="flex items-center gap-5">
                                            <div className={cn(
                                                "w-2.5 h-6 rounded-full shrink-0",
                                                s.depth === 1 ? "bg-indigo-500 shadow-lg shadow-indigo-500/20" : "bg-slate-300"
                                            )} />
                                            <span className={cn(
                                                "tracking-tight leading-snug whitespace-pre-wrap",
                                                s.depth === 1 ? "text-slate-900 text-xl font-black" : "text-slate-700 text-[17px] font-bold"
                                            )}>
                                                {s.title}
                                            </span>
                                        </div>

                                        {/* Action Buttons - Top Rigth */}
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleToggleDepth(idx);
                                                }}
                                                className="px-4 py-2 bg-slate-100 hover:bg-indigo-500 rounded-xl text-slate-600 hover:text-white text-[12px] font-black transition-all border border-slate-200 hover:border-indigo-500 flex items-center gap-2"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                                {s.depth === 1 ? "To 2depth" : "To 1depth"}
                                            </button>
                                            {idx > 0 && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleMergeWithPrevious(idx);
                                                    }}
                                                    className="px-4 py-2 bg-slate-100 hover:bg-blue-500 rounded-xl text-slate-600 hover:text-white text-[12px] font-black transition-all border border-slate-200 hover:border-blue-500 flex items-center gap-2"
                                                >
                                                    <FileText className="w-3.5 h-3.5" />
                                                    위와 합치기
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSplitSection(idx);
                                                }}
                                                className="px-4 py-2 bg-slate-100 hover:bg-emerald-500 rounded-xl text-slate-600 hover:text-white text-[12px] font-black transition-all border border-slate-200 hover:border-emerald-500 flex items-center gap-2"
                                            >
                                                <Zap className="w-3.5 h-3.5" />
                                                재분리
                                            </button>
                                            {s.depth === 1 && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleEdit(idx);
                                                    }}
                                                    className="px-4 py-2 bg-indigo-50 hover:bg-indigo-600 rounded-xl text-indigo-600 hover:text-white text-[12px] font-black transition-all border border-indigo-100 hover:border-indigo-600 flex items-center gap-2"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                    제목 수정
                                                </button>
                                            )}
                                            {s.depth === 2 && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleExtractToContent(idx);
                                                    }}
                                                    title="첫 단어를 제외한 나머지를 본문으로 보내기"
                                                    className="px-4 py-2 bg-orange-50 hover:bg-orange-600 rounded-xl text-orange-600 hover:text-white text-[12px] font-black transition-all border border-orange-100 hover:border-orange-600 flex items-center gap-2"
                                                >
                                                    <Send className="w-3.5 h-3.5" />
                                                    본문 분리
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteSection(idx);
                                                }}
                                                className="p-2.5 bg-slate-50 hover:bg-red-50 rounded-xl text-slate-400 hover:text-red-600 border border-slate-100 hover:border-red-100 transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Content Preview - Below Title */}
                                    {s.initialContent && (
                                        <div className="ml-[3.15rem] p-4 bg-slate-50/80 rounded-2xl border border-slate-100">
                                            <p className="text-[13px] text-slate-500 font-medium leading-relaxed italic">
                                                <span className="text-indigo-500 font-black mr-2 not-italic">CONTENT:</span>
                                                {s.initialContent}
                                            </p>
                                        </div>
                                    )}

                                    {/* Inline Split Editor - Full Width Below */}
                                    {editingSplitIdx === idx && (
                                        <div className="ml-[3.15rem] p-8 bg-indigo-50/30 rounded-[2rem] border border-indigo-100 space-y-6 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-black text-indigo-400 uppercase tracking-widest ml-1">Title Editor (Enter for new line)</label>
                                                    <textarea
                                                        value={splitBuffer.title}
                                                        onChange={(e) => setSplitBuffer(prev => ({ ...prev, title: e.target.value }))}
                                                        className="w-full px-5 py-3 bg-white border border-indigo-100 rounded-2xl text-[15px] font-bold focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm h-32 resize-none"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[11px] font-black text-indigo-400 uppercase tracking-widest ml-1">Content Editor</label>
                                                    <textarea
                                                        value={splitBuffer.content}
                                                        onChange={(e) => setSplitBuffer(prev => ({ ...prev, content: e.target.value }))}
                                                        className="w-full px-5 py-3 bg-white border border-indigo-100 rounded-2xl text-[14px] font-medium focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-sm h-32 resize-none"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-3 pt-2">
                                                <button
                                                    onClick={() => setEditingSplitIdx(null)}
                                                    className="px-6 py-2.5 text-slate-500 text-sm font-bold hover:bg-slate-100 rounded-xl transition-colors"
                                                >
                                                    취소
                                                </button>
                                                <button
                                                    onClick={applySplit}
                                                    className="px-8 py-3 bg-indigo-600 text-white text-sm font-black rounded-xl shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 transition-all active:scale-95 flex items-center gap-2"
                                                >
                                                    <Save className="w-4 h-4" />
                                                    본문 분리 적용
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-center pt-8">
                <button
                    onClick={onStart}
                    className="group relative flex items-center gap-4 px-20 py-6 bg-slate-900 text-white rounded-[2rem] text-2xl font-black shadow-2xl shadow-slate-900/40 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                    disabled={counts.template === 0 || counts.raw === 0 || isAnalyzing}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/0 via-indigo-600/10 to-indigo-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    {isAnalyzing ? (
                        <>
                            <RotateCcw className="w-6 h-6 animate-spin text-indigo-400" />
                            <span>분석 중...</span>
                        </>
                    ) : (
                        <>
                            <Zap className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                            <span>{sections.length > 0 ? "내용으로 이동하여 작성 시작" : "분석 및 설계 시작"}</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

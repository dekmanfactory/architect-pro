"use client";

import { useState } from "react";
import ModelSelector from "@/components/ModelSelector";
import FileUploadGrid from "@/components/FileUploadGrid";
import PresetSelector from "@/components/PresetSelector";
import ProposalWorkbench from "@/components/ProposalWorkbench";
import TerminalStatus from "@/components/TerminalStatus";
import { PRESETS } from "@/components/PresetSelector";
import { Sparkles } from "lucide-react";

export default function Home() {
  const [phase, setPhase] = useState<"input" | "writing">("input");
  const [selectedPreset, setSelectedPreset] = useState("p2");
  const [fileCounts, setFileCounts] = useState({ template: 0, ref: 0, raw: 0 });
  const [dynamicSections, setDynamicSections] = useState<{ id: string; title: string, depth: number, initialContent?: string }[] | undefined>();
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [refData, setRefData] = useState("");
  const [rawData, setRawData] = useState("");

  const handlePresetSelect = (id: string) => {
    setSelectedPreset(id);
    const preset = PRESETS.find(p => p.id === id);
    if (preset) {
      setGlobalPrompt(`당신은 공공기관 제안서 작성 전문가입니다. 
전체 제안서 분량 목표는 ${preset.value.toLocaleString()}자입니다.
각 섹션별로 논리적인 흐름과 전문적인 문체를 유지하며, 로데이터의 수치를 정확히 반영하여 작성해 주세요.
참조 제안서의 스타일을 가이드로 삼아 최적의 결과물을 도출해 주십시오.`);
    }
  };

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900 selection:bg-indigo-500/10">
      {/* Background Accent for Input Phase */}
      {phase === "input" && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-orange-500/5 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />
        </div>
      )}

      {/* Persistent Navbar */}
      <nav className="w-full flex justify-center border-b border-slate-200 h-20 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="w-full max-w-7xl flex justify-between items-center px-8">
          <div className="flex gap-3 items-center">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg shadow-slate-900/20">
              <span className="text-white font-black text-xl tracking-tighter">AP</span>
            </div>
            <div className="flex flex-col">
              <span className="font-black text-lg tracking-tighter text-slate-900 leading-none">
                ARCHITECT <span className="text-indigo-600">PRO</span>
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Intelligent Proposal Agent</span>
            </div>
          </div>

          <TerminalStatus fileCounts={fileCounts} />

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full border border-slate-200">
              <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">System Status</span>
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            </div>
            <ModelSelector />
          </div>
        </div>
      </nav>

      <div className="relative z-10">
        {phase === "input" ? (
          <div className="pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Input Component (1) */}
            <div className="pt-20">
              <FileUploadGrid
                onFilesChange={setFileCounts}
                onTemplateAnalyzed={setDynamicSections}
                onRefDataExtracted={setRefData}
                onRawDataExtracted={setRawData}
                onStart={() => setPhase("writing")}
              />
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-right-4 duration-700">
            {/* Writing Phase: Preset (2) + Backbone/Preview (3) */}
            <div className="max-w-7xl mx-auto px-6 pt-12 space-y-6">
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-8">
                    <h1 className="text-5xl font-black text-slate-900 tracking-tighter italic">
                      Drafting <span className="text-indigo-600">Workbench</span>
                    </h1>
                  </div>
                  <PresetSelector selectedId={selectedPreset} onSelect={handlePresetSelect} />
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-2xl flex flex-col gap-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-all" />
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Master Writing Strategy (Global Prompt)</span>
                    </div>
                  </div>
                  <textarea
                    value={globalPrompt}
                    onChange={(e) => setGlobalPrompt(e.target.value)}
                    placeholder="제안서 전체에 적용할 마스터 프롬프트를 입력하세요. 프리셋을 선택하면 기본 전략이 자동으로 구성됩니다."
                    className="w-full h-28 bg-slate-50 border border-slate-100 rounded-3xl p-6 text-sm text-slate-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 resize-none font-medium transition-all"
                  />
                </div>
              </div>

              {/* Backbone & Preview Workbench */}
              <ProposalWorkbench
                sections={dynamicSections}
                globalPrompt={globalPrompt}
                refData={refData}
                rawData={rawData}
                presetValue={PRESETS.find(p => p.id === selectedPreset)?.value || 150000}
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="w-full border-t border-slate-200 py-12 text-center mt-20">
        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
          &copy; 2026 Architect PRO. Advanced HWPX Generation Suite.
        </p>
      </footer>
    </main>
  );
}

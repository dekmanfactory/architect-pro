"use client";

import { useState, useEffect } from "react";
import { Settings, Check, ChevronDown, Sparkles, Cpu } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const AI_MODELS = [
  { id: "gemini-3.0-pro", name: "Gemini 3.0 Pro", provider: "google", description: "Most capable Gemini" },
  { id: "gemini-3.0-flash", name: "Gemini 3.0 Flash", provider: "google", description: "Fast & intelligent" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google", description: "Balanced performance" },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google", description: "High speed Gemini" },
  { id: "claude-4.6-opus", name: "Claude 4.6 Opus", provider: "anthropic", description: "Top-tier reasoning" },
  { id: "claude-4.5-sonnet", name: "Claude 4.5 Sonnet", provider: "anthropic", description: "Best for daily tasks" },
  { id: "claude-4.5-haiku", name: "Claude 4.5 Haiku", provider: "anthropic", description: "Fastest Claude" },
];

export default function ModelSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[1]); // Default to Gemini 3.0 Flash
  const [keys, setKeys] = useState({
    gemini: "",
    claude: "",
  });

  useEffect(() => {
    const savedModel = localStorage.getItem("selected-ai-model");
    if (savedModel) {
      const model = AI_MODELS.find((m) => m.id === savedModel);
      if (model) setSelectedModel(model);
    }

    // Load saved keys
    const savedGemini = localStorage.getItem("custom-gemini-key") || "";
    const savedClaude = localStorage.getItem("custom-claude-key") || "";
    setKeys({ gemini: savedGemini, claude: savedClaude });
  }, []);

  const handleSelect = (model: typeof AI_MODELS[0]) => {
    setSelectedModel(model);
    localStorage.setItem("selected-ai-model", model.id);
    setIsOpen(false);
  };

  const handleKeyChange = (provider: "gemini" | "claude", value: string) => {
    setKeys(prev => ({ ...prev, [provider]: value }));
    localStorage.setItem(`custom-${provider}-key`, value);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-slate-200 transition-all text-sm font-bold text-slate-900 shadow-sm backdrop-blur-md"
      >
        <div className={cn(
          "w-2 h-2 rounded-full ring-4",
          selectedModel.provider === "google" ? "bg-blue-400 ring-blue-400/20" : "bg-orange-400 ring-orange-400/20"
        )} />
        {selectedModel.name}
        <Settings className={cn("w-4 h-4 transition-transform", isOpen && "rotate-90")} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-2xl bg-slate-900/95 border border-white/10 shadow-2xl backdrop-blur-xl z-50 overflow-hidden ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="p-2 space-y-1">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 mb-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-3 h-3" /> {showKeys ? "API Key Settings" : "Select AI Model"}
              </div>
              <button
                onClick={() => setShowKeys(!showKeys)}
                className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {showKeys ? "Back to Models" : "API Setup"}
              </button>
            </div>

            {showKeys ? (
              <div className="p-3 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Google Gemini Key</label>
                  <input
                    type="password"
                    value={keys.gemini}
                    onChange={(e) => handleKeyChange("gemini", e.target.value)}
                    placeholder="Enter Gemini API Key..."
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Anthropic Claude Key</label>
                  <input
                    type="password"
                    value={keys.claude}
                    onChange={(e) => handleKeyChange("claude", e.target.value)}
                    placeholder="Enter Claude API Key..."
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500/50 transition-all"
                  />
                </div>
                <p className="text-[10px] text-slate-600 leading-tight">
                  입력된 키는 브라우저 로컬 저장소에 암호화되지 않은 상태로 저장됩니다. 개인 환경에서만 사용하세요.
                </p>
              </div>
            ) : (
              AI_MODELS.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleSelect(model)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all group",
                    selectedModel.id === model.id
                      ? "bg-white/10 text-white"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{model.name}</span>
                    <span className="text-[10px] text-slate-500 group-hover:text-slate-400">{model.description}</span>
                  </div>
                  {selectedModel.id === model.id && (
                    <Check className="w-4 h-4 text-emerald-400" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

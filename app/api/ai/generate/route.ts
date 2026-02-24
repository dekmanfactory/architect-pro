import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
    try {
        const { modelId, prompt, sectionTitle, presetValue, customGeminiKey, customClaudeKey, sourceData, refData } = await req.json();

        // 1. Identify Provider and Get Key (Prioritize custom keys from UI)
        const isGoogle = modelId.startsWith("gemini");
        const isClaude = modelId.startsWith("claude");

        let apiKey = "";
        if (isGoogle) {
            apiKey = customGeminiKey || "";
            if (!apiKey) {
                if (modelId.includes("pro")) apiKey = process.env.NEXT_PUBLIC_GEMINI_3_0_PRO_KEY || "";
                else apiKey = process.env.NEXT_PUBLIC_GEMINI_3_0_FLASH_KEY || "";
            }
        } else if (isClaude) {
            apiKey = customClaudeKey || "";
            if (!apiKey) {
                if (modelId.includes("opus")) apiKey = process.env.NEXT_PUBLIC_CLAUDE_4_6_OPUS_KEY || "";
                else if (modelId.includes("sonnet")) apiKey = process.env.NEXT_PUBLIC_CLAUDE_4_5_SONNET_KEY || "";
                else apiKey = process.env.NEXT_PUBLIC_CLAUDE_4_5_HAIKU_KEY || "";
            }
        }

        if (!apiKey) {
            return NextResponse.json({ error: "API Key not found for selected model." }, { status: 400 });
        }

        const systemPrompt = `
      당신은 공공기관 제안서 작성 전문가입니다.
      공공기관 특유의 정중하고 전문적인 문체를 사용하며, 제공된 참조 데이터와 원본 데이터를 철저히 활용하세요.

      **작성 전략**:
      1. **논리 및 문체 (Reference 활용)**: 과거 합격 제안서의 논리 전개 방식, 소제목 구성, 전문적인 표현을 따르세요.
      2. **사실 및 수치 (Raw Data 활용)**: 실적, 인력, 기술 스펙 등은 반드시 제공된 원본 데이터의 사실만을 바탕으로 작성하세요.

      **⚠️ 분량 엄수 규칙 (최우선 사항)**:
      1. **절대적으로 목표 분량을 달성해야 합니다.** 짧게 작성하면 안 됩니다.
      2. 각 항목을 충분히 상세하게 설명하고, 구체적인 예시와 근거를 포함하세요.
      3. 필요시 하위 항목, 단계별 설명, 상세 예시 등을 추가하여 분량을 확보하세요.
      4. 반복적인 표현 없이 실질적이고 전문적인 내용으로 목표 분량을 채워야 합니다.

      **중요 출처 표시 규칙 (HTML 태그 사용)**:
      1. **사내 Raw Data가 제공된 경우에만**: 수치, 직접적인 데이터, 실적 등 Raw Data에서 직접 유래한 텍스트는 <span class="text-red-500 font-bold">...</span> 태그로 감싸세요.
      2. **참조 데이터가 제공된 경우에만**: 참조 제안서의 논리, 문체, 표현을 직접 차용한 부분만 <span class="text-green-600 font-bold">...</span> 태그로 감싸세요.
      3. **중요**: 제공되지 않은 데이터 출처에 대한 색상 태그는 절대 사용하지 마세요. 예를 들어 참조 데이터가 "제공된 참조 데이터 없음"이면 녹색 태그를 절대 사용하지 마세요.
      4. **일반적인 공공기관 문체나 상식적인 표현은 색상 태그 없이 일반 텍스트로 작성**하세요.

      **출력 형식 규칙 (매우 중요)**:
      - 색상 강조: <span class="text-red-500">...</span>, <span class="text-green-600">...</span> 태그 사용
      - 넘버링: 1. 2. 3. 또는 1.1. 1.2. 등의 번호 매기기를 적극 활용하세요.
      - 문단 구분: 줄바꿈(\\n\\n)으로 구분
      - ❌ 금지: **, ##, ###, *, 등 마크다운 강조/제목 문법 사용 금지

      **표(Table) 작성 규칙 (반드시 준수)**:
      - 비교, 수치 데이터, 일정, 인력 현황, 장비 목록 등 표로 정리하기 적합한 내용은 마크다운 표를 사용하세요.
      - 표 형식 (반드시 이 형식만 사용):
        | 헤더1 | 헤더2 | 헤더3 |
        |-------|-------|-------|
        | 값1 | 값2 | 값3 |
      - 표 안에서도 색상 마커를 사용할 수 있습니다: | <span class="text-red-500">수치</span> | 값 |
      - 적극적으로 표를 활용하세요. 3개 이상의 항목을 나열하거나 비교할 때는 표가 효과적입니다.
      - ⚠️ 표 작성 제한:
        - 반드시 2열(컬럼) 이상의 표만 작성하세요. 1열짜리 표는 금지입니다.
        - 셀 병합(colspan, rowspan)은 절대 사용하지 마세요.
        - 모든 행의 열 수가 헤더와 동일해야 합니다.
        - 한 셀에 여러 줄의 내용을 넣지 마세요. 내용이 길면 여러 행으로 나누세요.
        - 표 앞뒤로 반드시 빈 줄을 넣으세요.

      **⛔ 불필요한 메타/가이드성 문장 절대 금지 (매우 중요)**:
      - 다음과 같은 "제안서 작성 과정 설명" 문장은 절대 쓰지 마세요:
        ❌ "본 문서는 ~사업의 일환으로 기획된 훈련과정의 상세 운영 계획 및 제안 내용을 담고 있습니다."
        ❌ "본 제안서는 공공기관의 엄격한 심사 기준과 요구사항을 충족하기 위해 작성되었으며..."
        ❌ "제공된 Raw Data를 철저히 분석하여...", "Reference Data를 바탕으로..."
        ❌ "본 섹션에서는 ~에 대해 서술합니다.", "아래에서 상세히 기술하겠습니다."
      - 제안서는 심사위원이 읽는 문서입니다. "이 제안서가 어떻게 만들어졌는지"가 아니라 "사업을 어떻게 수행할 것인지"만 작성하세요.
      - 도입부에 불필요한 배경 설명 없이, 바로 핵심 내용(구체적 계획, 방법론, 실행 방안)부터 시작하세요.
    `;

        let generatedText = "";
        const userMessage = `
[작성 섹션]: "${sectionTitle}"
[목표 분량]: **최소 ${presetValue}자 이상** (반드시 이 분량을 충족하세요)
[추가 지침]: ${prompt || "없음"}

[원본 소스 (Raw Data)]:
${sourceData || "제공된 원본 데이터 없음"}

[참조 제안서 (Reference)]:
${refData || "제공된 참조 데이터 없음"}

**⚠️ 필수 지시사항 (절대 무시하지 마세요)**:
1. **분량 엄수**: 반드시 ${presetValue}자 이상의 분량으로 작성하세요. 짧게 작성하면 절대 안 됩니다.
2. **내용 충실**: 내용을 충분히 상세하고 구체적으로 작성하여 목표 분량을 달성하세요.
3. **구조화**: 각 항목마다 충분한 설명과 예시를 포함하세요. (1) 개요, (2) 세부 내용, (3) 기대효과 등으로 구분
4. **전문성**: 단순히 분량을 채우는 것이 아니라, 실질적이고 전문적인 내용으로 채워주세요.
5. **빈 섹션 금지**: 절대로 "내용 없음", "작성중", "추후 보완" 같은 표현을 사용하지 마세요. 반드시 구체적인 내용을 작성하세요.
6. **섹션 특성 반영**: "${sectionTitle}" 섹션의 특성에 맞는 내용을 작성하세요. (예: 조직도 → 조직 구성원, 역할, 책임 상세 기술)

위 정보를 바탕으로 해당 섹션을 공공기관 사업 제안서 형식에 맞춰 전문적으로 작성해 주세요.
**다시 한번 강조: ${presetValue}자 이상 분량을 반드시 달성하세요!**
`;

        if (isGoogle) {
            const genAI = new GoogleGenerativeAI(apiKey);
            // Map UI model IDs to actual Google API model names (v1beta compatible)
            let modelName = "gemini-2.0-flash"; // Default

            if (modelId === "gemini-3.0-pro") {
                modelName = "gemini-3-pro-preview"; // Gemini 3 Pro
            } else if (modelId === "gemini-3.0-flash") {
                modelName = "gemini-3-flash-preview"; // Gemini 3 Flash
            } else if (modelId === "gemini-2.5-pro") {
                modelName = "gemini-2.5-pro";
            } else if (modelId === "gemini-2.5-flash") {
                modelName = "gemini-2.5-flash";
            }

            console.log(`[AI API] Using model: ${modelName} for modelId: ${modelId}`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent([systemPrompt, userMessage]);
            generatedText = result.response.text();
        } else {
            const anthropic = new Anthropic({ apiKey });
            let modelName = "claude-sonnet-4-5-20250929";
            if (modelId.includes("opus")) modelName = "claude-opus-4-6";
            else if (modelId.includes("sonnet")) modelName = "claude-sonnet-4-5-20250929";
            else modelName = "claude-haiku-4-5-20251001";

            console.log(`[AI API] Using Claude model: ${modelName} for modelId: ${modelId}`);
            const message = await anthropic.messages.create({
                model: modelName,
                max_tokens: 16384,
                system: systemPrompt,
                messages: [{ role: "user", content: userMessage }],
            });
            // @ts-ignore
            generatedText = message.content[0].text;
        }

        return NextResponse.json({ text: generatedText });
    } catch (error: any) {
        console.error("AI Generation Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

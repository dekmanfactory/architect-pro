import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

/**
 * HWPX 생성 API - Python 기반 코드 생성 방식
 * 템플릿 파일 대신 hwpx_generator.py를 사용하여 문서 생성
 */
export async function POST(req: NextRequest) {
    const tempJsonPath = path.join(process.cwd(), "_temp_proposal.json");
    const tempOutputPath = path.join(process.cwd(), "_temp_output.hwpx");

    try {
        const { title, sections, organization, date, model = "unknown", preset = "제안서" } = await req.json();

        // 1. HTML에서 색상 정보와 텍스트를 분리하여 파싱
        interface ColoredSegment {
            text: string;
            color: string;
        }

        const parseHtmlWithColors = (html: string): ColoredSegment[] => {
            let workingHtml = html || "";

            // 1단계: HTML span을 색상 마커로 먼저 변환
            // <span class="text-green-600 ...">텍스트</span> → {{green:텍스트}}
            workingHtml = workingHtml.replace(
                /<span\s+class="[^"]*text-green-[^"]*"[^>]*>(.*?)<\/span>/gi,
                "{{green:$1}}"
            );
            // <span class="text-red-600 ...">텍스트</span> → {{red:텍스트}}
            workingHtml = workingHtml.replace(
                /<span\s+class="[^"]*text-red-[^"]*"[^>]*>(.*?)<\/span>/gi,
                "{{red:$1}}"
            );

            // <p> 태그는 나중에 엔터로 처리하므로 여기서는 보존
            // (처리는 fullText 단계에서 수행)

            // AI 생성 오류 제거 (특수문자 패턴)
            workingHtml = workingHtml.replace(/^[^\w\sㄱ-ㅎ가-힣{<]+/gm, ""); // {, < 허용
            workingHtml = workingHtml.replace(/[v\^~]{3,}/g, "");

            // 마크다운 문법 제거
            workingHtml = workingHtml.replace(/^#{1,6}\s+/gm, "");
            workingHtml = workingHtml.replace(/\*\*([^*]+)\*\*/g, "$1");
            workingHtml = workingHtml.replace(/\*([^*]+)\*/g, "$1");
            workingHtml = workingHtml.replace(/^[\-\*]\s+/gm, "");
            workingHtml = workingHtml.replace(/^\d+\.\s+/gm, "");

            // HTML 기본 처리 (<p> 태그는 나중에 처리)
            workingHtml = workingHtml.replace(/<br\s*\/?>/gi, "\n");
            workingHtml = workingHtml.replace(/<strong>|<\/strong>/gi, "");
            workingHtml = workingHtml.replace(/<em>|<\/em>/gi, "");

            const segments: ColoredSegment[] = [];
            const colorMap: Record<string, string> = {
                "text-red": "red",
                "text-green": "green",
                "text-blue": "blue",
                "text-yellow": "yellow"
            };

            // <span class="text-red-XXX">...</span> 패턴 추출
            const spanRegex = /<span[^>]*class="([^"]*)"[^>]*>(.*?)<\/span>/gi;
            let lastIndex = 0;
            let match;

            while ((match = spanRegex.exec(workingHtml)) !== null) {
                // span 태그 이전의 일반 텍스트
                if (match.index > lastIndex) {
                    const plainText = workingHtml.substring(lastIndex, match.index);
                    if (plainText.trim()) {
                        segments.push({ text: plainText, color: "black" });
                    }
                }

                // span 태그 내부의 색상 텍스트
                const classList = match[1];
                const innerText = match[2];
                let detectedColor = "black";

                for (const [colorClass, colorName] of Object.entries(colorMap)) {
                    if (classList.includes(colorClass)) {
                        detectedColor = colorName;
                        break;
                    }
                }

                if (innerText.trim()) {
                    segments.push({ text: innerText, color: detectedColor });
                }

                lastIndex = spanRegex.lastIndex;
            }

            // 남은 텍스트 처리
            if (lastIndex < workingHtml.length) {
                const remainingText = workingHtml.substring(lastIndex);
                if (remainingText.trim()) {
                    segments.push({ text: remainingText, color: "black" });
                }
            }

            // 세그먼트가 없으면 전체를 일반 텍스트로 처리
            if (segments.length === 0) {
                // <p> 태그는 보존 (나중에 엔터로 변환)
                // 다른 HTML 태그만 제거
                let cleanText = workingHtml.replace(/<(?!\/p|p\s|p>)[^>]*>?/gi, "");  // <p>, </p> 제외

                // HTML 속성 조각 제거 (class="text-green-600" 등)
                cleanText = cleanText.replace(/\s*(class|style|id)="[^"]*"/gi, "");
                cleanText = cleanText.replace(/\s*(class|style|id)='[^']*'/gi, "");

                // HTML 태그명과 속성명 제거 (p, table 관련 태그는 제외)
                cleanText = cleanText.replace(/\b(span|div|br|h[1-6]|strong|em|ul|ol|li)\b/gi, "");
                cleanText = cleanText.replace(/\b(text-[a-z]+-\d+|font-bold|font-semibold)\b/gi, "");

                // HTML 엔티티 디코딩
                cleanText = cleanText.replace(/&nbsp;/g, " ");
                cleanText = cleanText.replace(/&lt;/g, "<");
                cleanText = cleanText.replace(/&gt;/g, ">");
                cleanText = cleanText.replace(/&amp;/g, "&");
                cleanText = cleanText.replace(/&quot;/g, '"');

                // 과도한 공백 정리 (줄바꿈은 보존)
                cleanText = cleanText.replace(/ {2,}/g, " ");  // 공백만 정리
                cleanText = cleanText.trim();

                if (cleanText) {
                    segments.push({ text: cleanText, color: "black" });
                }
            } else {
                // 각 세그먼트의 HTML 엔티티 디코딩 및 완전한 정리
                segments.forEach(seg => {
                    // <p> 태그는 보존 (나중에 엔터로 변환)
                    // 다른 HTML 태그만 제거
                    seg.text = seg.text.replace(/<(?!\/p|p\s|p>)[^>]*>?/gi, "");  // <p>, </p> 제외하고 제거

                    // HTML 속성 조각 제거
                    seg.text = seg.text.replace(/\s*(class|style|id)="[^"]*"/gi, "");
                    seg.text = seg.text.replace(/\s*(class|style|id)='[^']*'/gi, "");

                    // HTML 태그명과 속성명 제거 (p, table 관련 태그는 제외)
                    seg.text = seg.text.replace(/\b(span|div|br|h[1-6]|strong|em|ul|ol|li)\b/gi, "");
                    seg.text = seg.text.replace(/\b(text-[a-z]+-\d+|font-bold|font-semibold)\b/gi, "");

                    // HTML 엔티티 디코딩
                    seg.text = seg.text.replace(/&nbsp;/g, " ");
                    seg.text = seg.text.replace(/&lt;/g, "<");
                    seg.text = seg.text.replace(/&gt;/g, ">");
                    seg.text = seg.text.replace(/&amp;/g, "&");
                    seg.text = seg.text.replace(/&quot;/g, '"');

                    // 마크다운 문법 잔여물 제거
                    seg.text = seg.text.replace(/^#+\s*/gm, "");   // ### 제거
                    seg.text = seg.text.replace(/\*\*/g, "");      // ** 제거

                    // 과도한 공백 정리 (줄바꿈은 보존)
                    seg.text = seg.text.replace(/ {2,}/g, " ");  // 공백만 정리
                    seg.text = seg.text.trim();
                });
            }

            return segments.filter(s => s.text.length > 0);
        };

        // 2. 마크다운 표 파싱 함수 (| col1 | col2 | 형식)
        const parseMarkdownTable = (tableLines: string[]): { headers: string[]; rows: string[][] } | null => {
            if (tableLines.length < 2) return null;

            const headers = tableLines[0].split('|').map(s => s.trim()).filter(s => s.length > 0);
            if (headers.length === 0) return null;

            // 구분선(|---|) 건너뛰기
            let dataStartIdx = 1;
            if (tableLines.length > 1) {
                const sep = tableLines[1].replace(/[|\-: ]/g, '');
                if (sep === '') dataStartIdx = 2;
            }

            const rows: string[][] = [];
            for (let i = dataStartIdx; i < tableLines.length; i++) {
                const line = tableLines[i].trim();
                if (!line) continue;

                let cells = line.split('|').map(s => s.trim());
                if (cells[0] === '') cells.shift();
                if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();

                // 셀 내 색상 마커 변환 및 HTML 제거
                cells = cells.map(cell => {
                    cell = cell.replace(/<span\s+class="[^"]*text-green-[^"]*"[^>]*>(.*?)<\/span>/gi, "{{green:$1}}");
                    cell = cell.replace(/<span\s+class="[^"]*text-red-[^"]*"[^>]*>(.*?)<\/span>/gi, "{{red:$1}}");
                    cell = cell.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
                    return cell;
                });

                // 셀 개수를 헤더에 맞춤
                if (cells.length < headers.length) cells.push(...Array(headers.length - cells.length).fill(""));
                else if (cells.length > headers.length) cells = cells.slice(0, headers.length);

                rows.push(cells);
            }

            return rows.length > 0 ? { headers, rows } : null;
        };

        // 3. 텍스트에서 마크다운 표와 일반 텍스트를 분리
        type ContentPart = { type: 'text'; content: string } | { type: 'table'; data: { headers: string[]; rows: string[][] } };

        const extractTablesAndText = (html: string): ContentPart[] => {
            // HTML <table> 태그를 마크다운 표로 변환 (AI가 HTML 표를 생성한 경우)
            let text = html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (tableMatch) => {
                const headers: string[] = [];
                const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
                let m;
                while ((m = thRegex.exec(tableMatch)) !== null) {
                    headers.push(m[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
                }
                if (headers.length === 0) return '';

                let bodyHtml = tableMatch;
                const theadEnd = tableMatch.indexOf('</thead>');
                if (theadEnd !== -1) bodyHtml = tableMatch.substring(theadEnd);

                const rows: string[][] = [];
                const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
                let trM;
                while ((trM = trRegex.exec(bodyHtml)) !== null) {
                    if (/<th[\s>]/i.test(trM[1])) continue;
                    const cells: string[] = [];
                    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
                    let tdM;
                    while ((tdM = tdRegex.exec(trM[1])) !== null) {
                        let c = tdM[1];
                        c = c.replace(/<span\s+class="[^"]*text-green-[^"]*"[^>]*>(.*?)<\/span>/gi, "{{green:$1}}");
                        c = c.replace(/<span\s+class="[^"]*text-red-[^"]*"[^>]*>(.*?)<\/span>/gi, "{{red:$1}}");
                        c = c.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
                        cells.push(c);
                    }
                    if (cells.length > 0) rows.push(cells);
                }

                let md = `\n| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n`;
                rows.forEach(row => { md += `| ${row.join(' | ')} |\n`; });
                return md;
            });

            // HTML 래핑 태그 정리 (마크다운 표가 <p>, <br> 등으로 감싸져 있는 경우)
            // 색상 span → 마커 변환 (표 감지 전에 처리)
            text = text.replace(/<span\s+class="[^"]*text-green-[^"]*"[^>]*>(.*?)<\/span>/gi, "{{green:$1}}");
            text = text.replace(/<span\s+class="[^"]*text-red-[^"]*"[^>]*>(.*?)<\/span>/gi, "{{red:$1}}");
            text = text.replace(/<span\s+class="[^"]*text-blue-[^"]*"[^>]*>(.*?)<\/span>/gi, "{{blue:$1}}");
            // <p> 태그를 줄바꿈으로 변환
            text = text.replace(/<\/p>\s*<p[^>]*>/gi, '\n');
            text = text.replace(/<p[^>]*>/gi, '\n');
            text = text.replace(/<\/p>/gi, '\n');
            // <br> 태그를 줄바꿈으로
            text = text.replace(/<br\s*\/?>/gi, '\n');
            // <strong>, <em> 등 인라인 태그 제거 (표 감지에 방해되므로)
            text = text.replace(/<\/?(strong|em|b|i|u)>/gi, '');
            // 나머지 HTML 태그 제거 (span 등 색상 마커로 변환되지 않은 것들)
            text = text.replace(/<[^>]*>/g, '');
            // HTML 엔티티 변환
            text = text.replace(/&nbsp;/g, ' ');
            text = text.replace(/&amp;/g, '&');
            text = text.replace(/&lt;/g, '<');
            text = text.replace(/&gt;/g, '>');

            // 줄 단위로 마크다운 표 감지
            const lines = text.split('\n');
            const result: ContentPart[] = [];
            let textBuf: string[] = [];
            let tableBuf: string[] = [];

            const flushText = () => {
                const content = textBuf.join('\n').trim();
                if (content) result.push({ type: 'text', content });
                textBuf = [];
            };
            const flushTable = () => {
                if (tableBuf.length >= 2) {
                    const td = parseMarkdownTable(tableBuf);
                    if (td) { result.push({ type: 'table', data: td }); }
                    else { textBuf.push(...tableBuf); }
                } else if (tableBuf.length > 0) {
                    textBuf.push(...tableBuf);
                }
                tableBuf = [];
            };

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('|') && trimmed.includes('|', 1)) {
                    if (tableBuf.length === 0) flushText();
                    tableBuf.push(trimmed);
                } else {
                    if (tableBuf.length > 0) flushTable();
                    textBuf.push(line);
                }
            }
            if (tableBuf.length > 0) flushTable();
            flushText();

            return result.length > 0 ? result : [{ type: 'text', content: html }];
        };

        // 4. 문단 레벨 자동 추론 함수
        const inferParagraphLevel = (text: string, index: number): number => {
            const trimmed = text.trim();
            const length = trimmed.length;

            // 1. 매우 짧고 굵은 제목 형태 (50자 이하) -> level1 (□)
            if (length < 50 && (
                trimmed.endsWith(':') ||
                trimmed.endsWith('?') ||
                /^[0-9]+\./.test(trimmed) || // 1. 로 시작
                /^[가-힣]{2,10}$/.test(trimmed) // 짧은 한글 제목
            )) {
                return 1;
            }

            // 2. 중간 제목 (50~150자) -> level2 (○)
            if (length < 150) {
                return 2;
            }

            // 3. 일반 문단 (150~400자) -> level3 (―)
            if (length < 400) {
                return 3;
            }

            // 4. 긴 상세 설명 (400자 이상) -> level4 (※)
            return 4;
        };

        // 5. 텍스트를 문단 아이템으로 변환하는 헬퍼
        const textToItems = (text: string): any[] => {
            // 색상 마커 변환 (parseHtmlWithColors 활용)
            const coloredSegments = parseHtmlWithColors(text);
            let fullText = coloredSegments.map(s => s.text).join("");

            // <p> 태그를 엔터로 변환
            fullText = fullText.replace(/<\/p>\s*<p[^>]*>/gi, "\n");
            fullText = fullText.replace(/<p[^>]*>/gi, "");
            fullText = fullText.replace(/<\/p>/gi, "");
            fullText = fullText.replace(/<br\s*\/?>/gi, "\n");
            fullText = fullText.replace(/\n{2,}/g, "\n");

            const paragraphs = fullText.split(/\n/).map(p => p.trim()).filter(p => p.length > 0);

            return paragraphs.map((para, pIdx) => {
                let cleanPara = para.trim().replace(/^\s+/gm, "").replace(/\s+$/gm, "");

                // 색상 마커 보호
                const markerPlaceholders: { placeholder: string; original: string }[] = [];
                let markerIndex = 0;
                cleanPara = cleanPara.replace(/\{\{(green|red):([^}]+)\}\}/g, (match) => {
                    const placeholder = `__MARKER_${markerIndex}__`;
                    markerPlaceholders.push({ placeholder, original: match });
                    markerIndex++;
                    return placeholder;
                });

                // HTML 제거
                cleanPara = cleanPara.replace(/<[^>]*>?/g, "");
                cleanPara = cleanPara.replace(/[<>]/g, "");
                cleanPara = cleanPara.replace(/\s*(class|style|id)="[^"]*"/gi, "");
                cleanPara = cleanPara.replace(/\s*(class|style|id)='[^']*'/gi, "");
                cleanPara = cleanPara.replace(/\b(span|div|br|h[1-6]|strong|em|ul|ol|li)\b/gi, "");
                cleanPara = cleanPara.replace(/\b(text-[a-z]+-\d+|font-bold|font-semibold)\b/gi, "");

                // 공백 정리
                cleanPara = cleanPara.replace(/\s{2,}/g, " ");
                cleanPara = cleanPara.trim();

                // 색상 마커 복원
                markerPlaceholders.forEach(({ placeholder, original }) => {
                    cleanPara = cleanPara.replace(placeholder, original);
                });

                return {
                    level: inferParagraphLevel(cleanPara, pIdx),
                    text: cleanPara,
                    color: "default",
                    source: "generated"
                };
            }).filter(item => item.text.length > 0);
        };

        // 6. Skill 3 JSON 형식으로 변환 (표 자동 감지 포함)
        const contentArray: any[] = [];

        sections.forEach((section: any, idx: number) => {
            const sectionHtml = section.text || "";

            // 디버깅: 원본 텍스트 저장
            const debugDir = path.join(process.cwd(), '_temp');
            if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
            fs.writeFileSync(path.join(debugDir, `section_${idx}_raw.txt`), sectionHtml, 'utf-8');

            // HTML에서 <table>과 텍스트를 분리
            const parts = extractTablesAndText(sectionHtml);

            // 디버깅: 파싱 결과 저장
            fs.writeFileSync(path.join(debugDir, `section_${idx}_parts.json`), JSON.stringify(parts, null, 2), 'utf-8');

            // 첫 번째 텍스트 파트를 섹션의 items로, 나머지는 별도 content로
            let sectionItems: any[] = [];
            let tableCounter = 0;

            for (const part of parts) {
                if (part.type === 'text') {
                    const items = textToItems(part.content);
                    if (sectionItems.length === 0) {
                        // 첫 번째 텍스트는 섹션 items에 포함
                        sectionItems.push(...items);
                    } else {
                        // 표 뒤의 텍스트도 섹션 items에 추가
                        sectionItems.push(...items);
                    }
                } else if (part.type === 'table') {
                    // 표 앞의 텍스트가 있으면 먼저 섹션으로 추가
                    if (sectionItems.length > 0) {
                        contentArray.push({
                            type: "section",
                            id: `section${idx + 1}${tableCounter > 0 ? `_part${tableCounter}` : ''}`,
                            title: tableCounter === 0 ? section.title : "",
                            items: sectionItems
                        });
                        sectionItems = [];
                    } else if (tableCounter === 0) {
                        // 표가 첫 번째인 경우에도 섹션 제목을 빈 섹션으로 먼저 추가
                        if (section.title) {
                            contentArray.push({
                                type: "section",
                                id: `section${idx + 1}`,
                                title: section.title,
                                items: []
                            });
                        }
                    }

                    tableCounter++;
                    // 표를 content에 추가
                    contentArray.push({
                        type: "table",
                        id: `table_s${idx + 1}_${tableCounter}`,
                        title: "",
                        headers: part.data.headers,
                        rows: part.data.rows
                    });
                }
            }

            // 남은 텍스트 items 추가
            if (sectionItems.length > 0) {
                contentArray.push({
                    type: "section",
                    id: `section${idx + 1}${tableCounter > 0 ? `_part${tableCounter + 1}` : ''}`,
                    title: tableCounter === 0 ? section.title : "",
                    items: sectionItems
                });
            }

            // 표도 텍스트도 없는 경우 빈 섹션이라도 추가
            if (tableCounter === 0 && sectionItems.length === 0) {
                contentArray.push({
                    type: "section",
                    id: `section${idx + 1}`,
                    title: section.title,
                    items: []
                });
            }
        });

        const proposalJson = {
            metadata: {
                title: title || "제안서",
                organization: organization || "Architect PRO",
                date: date || new Date().toLocaleDateString("ko-KR").replace(/\//g, '. '),
                model: model,
                preset: preset,
                total_chars: sections.reduce((sum: number, s: any) => sum + (s.text?.length || 0), 0)
            },
            content: contentArray
        };

        // 3. 임시 JSON 파일 생성
        fs.writeFileSync(tempJsonPath, JSON.stringify(proposalJson, null, 2), 'utf-8');

        // 디버깅용: JSON 파일 영구 저장 (temp 폴더)
        const tempDir = path.join(process.cwd(), '_temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const debugJsonPath = path.join(tempDir, `proposal_${Date.now()}.json`);
        fs.writeFileSync(debugJsonPath, JSON.stringify(proposalJson, null, 2), 'utf-8');
        console.log(`[DEBUG] JSON saved to: ${debugJsonPath}`);

        // 4. Python HWPX 생성기 호출
        const pythonScript = path.join(process.cwd(), "skills", "4_hwpx_generation", "src", "hwpx_generator.py");

        if (!fs.existsSync(pythonScript)) {
            throw new Error(`Python script not found: ${pythonScript}`);
        }

        // Python 스크립트 생성
        const runnerScript = `
# -*- coding: utf-8 -*-
import sys
import json
import io
from pathlib import Path

# UTF-8 인코딩 강제 설정 (Windows cp949 오류 방지)
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# 프로젝트 루트를 sys.path에 추가
project_root = Path(r'${process.cwd().replace(/\\/g, '\\\\')}')
sys.path.insert(0, str(project_root))
sys.path.insert(0, str(project_root / 'skills' / '4_hwpx_generation' / 'src'))

# hwpx_generator 임포트
from hwpx_generator import HWPXGenerator

# JSON 파일 읽기
json_file = Path(r'${tempJsonPath.replace(/\\/g, '\\\\')}')
with open(json_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

# HWPX 생성
gen = HWPXGenerator(base_dir=str(project_root))
gen.generate(data, r'${tempOutputPath.replace(/\\/g, '\\\\')}')
`;

        const tempScriptPath = path.join(process.cwd(), "_temp_hwpx_runner.py");
        fs.writeFileSync(tempScriptPath, runnerScript, 'utf-8');

        // Python 실행
        await new Promise<void>((resolve, reject) => {
            const python = spawn('python', [tempScriptPath], {
                cwd: process.cwd(),
                stdio: ['pipe', 'pipe', 'pipe'],
                shell: true,
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8',  // UTF-8 인코딩 강제
                    PYTHONLEGACYWINDOWSSTDIO: '1'  // Windows 레거시 모드
                }
            });

            let stdout = '';
            let stderr = '';

            python.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            python.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            python.on('close', (code) => {
                // 임시 스크립트 삭제
                try {
                    if (fs.existsSync(tempScriptPath)) {
                        fs.unlinkSync(tempScriptPath);
                    }
                } catch (e) {
                    console.error('Failed to delete temp script:', e);
                }

                if (code === 0) {
                    console.log('Python output:', stdout);
                    resolve();
                } else {
                    console.error('Python stderr:', stderr);
                    reject(new Error(`Python script failed with code ${code}\nStderr: ${stderr}`));
                }
            });

            python.on('error', (err) => {
                reject(new Error(`Failed to start Python: ${err.message}`));
            });
        });

        // 5. 생성된 HWPX 파일 읽기
        if (!fs.existsSync(tempOutputPath)) {
            throw new Error('HWPX file was not generated');
        }

        const buffer = fs.readFileSync(tempOutputPath);

        // 6. 임시 파일 정리
        try {
            if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);
            if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
        } catch (e) {
            console.error('Failed to clean up temp files:', e);
        }

        // 7. HWPX 파일 반환
        const filename = `${preset}_${model}_${date.replace(/\. /g, '-').replace(/\./g, '')}.hwpx`;

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": "application/vnd.hancom.hwpx+zip",
                "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
            },
        });

    } catch (error: any) {
        console.error("HWPX Generation Error:", error);
        console.error("Error stack:", error.stack);

        // 임시 파일 정리
        try {
            if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);
            if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
        } catch (e) {
            // 무시
        }

        return NextResponse.json({
            error: error.message || "HWPX 파일 생성 중 오류가 발생했습니다.",
            details: error.stack
        }, { status: 500 });
    }
}

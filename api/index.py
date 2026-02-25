# -*- coding: utf-8 -*-
"""
Vercel Python Serverless Function - HWPX Generation API
FastAPI 기반, HWPXGenerator를 사용하여 HWPX 문서 생성
"""
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

# HWPXGenerator import를 위해 경로 추가
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "skills" / "4_hwpx_generation" / "src"))

from hwpx_generator import HWPXGenerator

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Pydantic Models ---

class SectionContent(BaseModel):
    title: str
    text: str


class GenerateRequest(BaseModel):
    title: str
    sections: List[SectionContent]
    organization: str = "Architect PRO"
    date: str = ""
    model: str = "unknown"
    preset: str = "제안서"


# --- HTML Preprocessing (Node.js route.ts 로직을 Python으로 이식) ---

def parse_html_with_color_markers(html: str) -> str:
    """HTML span 태그를 {{color:text}} 마커로 변환하고 나머지 HTML 제거"""
    if not html:
        return ""

    text = html

    # 1. HTML <span class="text-green-..."> → {{green:...}}
    text = re.sub(
        r'<span\s+class="[^"]*text-green-[^"]*"[^>]*>(.*?)</span>',
        r'{{green:\1}}', text, flags=re.DOTALL
    )
    # <span class="text-red-..."> → {{red:...}}
    text = re.sub(
        r'<span\s+class="[^"]*text-red-[^"]*"[^>]*>(.*?)</span>',
        r'{{red:\1}}', text, flags=re.DOTALL
    )
    # <span class="text-blue-..."> → {{blue:...}}
    text = re.sub(
        r'<span\s+class="[^"]*text-blue-[^"]*"[^>]*>(.*?)</span>',
        r'{{blue:\1}}', text, flags=re.DOTALL
    )

    return text


def extract_tables_and_text(html: str):
    """HTML에서 마크다운 표와 일반 텍스트를 분리"""
    text = parse_html_with_color_markers(html)

    # HTML <table> → 마크다운 표 변환
    def table_to_markdown(match):
        table_html = match.group(0)
        headers = []
        for th_match in re.finditer(r'<th[^>]*>([\s\S]*?)</th>', table_html):
            h = re.sub(r'<[^>]*>', '', th_match.group(1)).replace('&nbsp;', ' ').strip()
            headers.append(h)
        if not headers:
            return ''

        thead_end = table_html.find('</thead>')
        body_html = table_html[thead_end:] if thead_end != -1 else table_html

        rows = []
        for tr_match in re.finditer(r'<tr[^>]*>([\s\S]*?)</tr>', body_html):
            tr_content = tr_match.group(1)
            if re.search(r'<th[\s>]', tr_content):
                continue
            cells = []
            for td_match in re.finditer(r'<td[^>]*>([\s\S]*?)</td>', tr_content):
                c = td_match.group(1)
                c = re.sub(r'<span\s+class="[^"]*text-green-[^"]*"[^>]*>(.*?)</span>',
                           r'{{green:\1}}', c, flags=re.DOTALL)
                c = re.sub(r'<span\s+class="[^"]*text-red-[^"]*"[^>]*>(.*?)</span>',
                           r'{{red:\1}}', c, flags=re.DOTALL)
                c = re.sub(r'<[^>]*>', '', c).replace('&nbsp;', ' ').strip()
                cells.append(c)
            if cells:
                rows.append(cells)

        md = f"\n| {' | '.join(headers)} |\n| {' | '.join(['---'] * len(headers))} |\n"
        for row in rows:
            md += f"| {' | '.join(row)} |\n"
        return md

    text = re.sub(r'<table[^>]*>[\s\S]*?</table>', table_to_markdown, text, flags=re.IGNORECASE)

    # <p> 태그를 줄바꿈으로 변환
    text = re.sub(r'</p>\s*<p[^>]*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<p[^>]*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</p>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</?(strong|em|b|i|u)>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]*>', '', text)
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&')
    text = text.replace('&lt;', '<').replace('&gt;', '>')

    # 줄 단위로 마크다운 표 감지
    lines = text.split('\n')
    result = []
    text_buf = []
    table_buf = []

    def flush_text():
        content = '\n'.join(text_buf).strip()
        if content:
            result.append({'type': 'text', 'content': content})
        text_buf.clear()

    def flush_table():
        if len(table_buf) >= 2:
            td = parse_markdown_table(table_buf)
            if td:
                result.append({'type': 'table', 'data': td})
            else:
                text_buf.extend(table_buf)
        elif table_buf:
            text_buf.extend(table_buf)
        table_buf.clear()

    for line in lines:
        trimmed = line.strip()
        if trimmed.startswith('|') and '|' in trimmed[1:]:
            if not table_buf:
                flush_text()
            table_buf.append(trimmed)
        else:
            if table_buf:
                flush_table()
            text_buf.append(line)

    if table_buf:
        flush_table()
    flush_text()

    return result if result else [{'type': 'text', 'content': html}]


def parse_markdown_table(table_lines):
    """마크다운 표 파싱"""
    if len(table_lines) < 2:
        return None

    headers = [s.strip() for s in table_lines[0].split('|') if s.strip()]
    if not headers:
        return None

    # 구분선 건너뛰기
    data_start = 1
    if len(table_lines) > 1:
        sep = re.sub(r'[|\-: ]', '', table_lines[1])
        if sep == '':
            data_start = 2

    rows = []
    for i in range(data_start, len(table_lines)):
        line = table_lines[i].strip()
        if not line:
            continue
        cells = [s.strip() for s in line.split('|')]
        if cells and cells[0] == '':
            cells = cells[1:]
        if cells and cells[-1] == '':
            cells = cells[:-1]

        # 셀 개수 맞춤
        while len(cells) < len(headers):
            cells.append("")
        cells = cells[:len(headers)]
        rows.append(cells)

    return {'headers': headers, 'rows': rows} if rows else None


def infer_paragraph_level(text: str) -> int:
    """문단 레벨 자동 추론"""
    trimmed = text.strip()
    length = len(trimmed)

    # 매우 짧고 제목 형태 -> level1
    if length < 50 and (
        trimmed.endswith(':') or trimmed.endswith('?') or
        re.match(r'^[0-9]+\.', trimmed) or
        re.match(r'^[가-힣]{2,10}$', trimmed)
    ):
        return 1

    if length < 150:
        return 2
    if length < 400:
        return 3
    return 4


def clean_paragraph_text(text: str) -> str:
    """문단 텍스트 정리 - 색상 마커 보존, HTML 잔여물 제거"""
    # 색상 마커 보호
    placeholders = []
    counter = [0]

    def protect_marker(match):
        placeholder = f"__MARKER_{counter[0]}__"
        placeholders.append((placeholder, match.group(0)))
        counter[0] += 1
        return placeholder

    cleaned = re.sub(r'\{\{(green|red|blue):[^}]+\}\}', protect_marker, text)

    # 마크다운 문법 제거
    cleaned = re.sub(r'^#{1,6}\s+', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'\*\*([^*]+)\*\*', r'\1', cleaned)
    cleaned = re.sub(r'\*([^*]+)\*', r'\1', cleaned)
    cleaned = re.sub(r'^[\-\*]\s+', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'^\d+\.\s+', '', cleaned, flags=re.MULTILINE)

    # HTML 잔여물 제거
    cleaned = re.sub(r'<[^>]*>?', '', cleaned)
    cleaned = re.sub(r'[<>]', '', cleaned)
    cleaned = re.sub(r'\s*(class|style|id)="[^"]*"', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\b(span|div|br|h[1-6]|strong|em|ul|ol|li)\b', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\b(text-[a-z]+-\d+|font-bold|font-semibold)\b', '', cleaned, flags=re.IGNORECASE)

    # 공백 정리
    cleaned = re.sub(r' {2,}', ' ', cleaned).strip()

    # 마커 복원
    for placeholder, original in placeholders:
        cleaned = cleaned.replace(placeholder, original)

    return cleaned


def text_to_items(text: str) -> list:
    """텍스트를 문단 아이템 리스트로 변환"""
    # 줄바꿈으로 문단 분리
    text = re.sub(r'\n{2,}', '\n', text)
    paragraphs = [p.strip() for p in text.split('\n') if p.strip()]

    items = []
    for para in paragraphs:
        cleaned = clean_paragraph_text(para)
        if cleaned:
            items.append({
                'level': infer_paragraph_level(cleaned),
                'text': cleaned,
                'color': 'default',
                'source': 'generated'
            })
    return items


def preprocess_sections(sections: list, metadata: dict) -> dict:
    """프론트엔드에서 받은 섹션 데이터를 HWPXGenerator용 JSON으로 변환"""
    content_array = []

    for idx, section in enumerate(sections):
        section_html = section.get('text', '') or ''
        parts = extract_tables_and_text(section_html)

        section_items = []
        table_counter = 0

        for part in parts:
            if part['type'] == 'text':
                items = text_to_items(part['content'])
                section_items.extend(items)
            elif part['type'] == 'table':
                # 표 앞 텍스트가 있으면 먼저 섹션으로 추가
                if section_items:
                    content_array.append({
                        'type': 'section',
                        'id': f'section{idx + 1}{"_part" + str(table_counter) if table_counter > 0 else ""}',
                        'title': section.get('title', '') if table_counter == 0 else '',
                        'items': section_items
                    })
                    section_items = []
                elif table_counter == 0 and section.get('title'):
                    content_array.append({
                        'type': 'section',
                        'id': f'section{idx + 1}',
                        'title': section.get('title', ''),
                        'items': []
                    })

                table_counter += 1
                content_array.append({
                    'type': 'table',
                    'id': f'table_s{idx + 1}_{table_counter}',
                    'title': '',
                    'headers': part['data']['headers'],
                    'rows': part['data']['rows']
                })

        # 남은 텍스트
        if section_items:
            suffix = f'_part{table_counter + 1}' if table_counter > 0 else ''
            content_array.append({
                'type': 'section',
                'id': f'section{idx + 1}{suffix}',
                'title': section.get('title', '') if table_counter == 0 else '',
                'items': section_items
            })

        # 빈 섹션
        if table_counter == 0 and not section_items:
            content_array.append({
                'type': 'section',
                'id': f'section{idx + 1}',
                'title': section.get('title', ''),
                'items': []
            })

    return {
        'metadata': metadata,
        'content': content_array
    }


# --- API Endpoints ---

@app.get("/api/health")
async def health():
    return {"status": "ok", "generator": "HWPXGenerator"}


@app.post("/api/generate-hwpx")
async def generate_hwpx(req: GenerateRequest):
    """HWPX 문서 생성 API - HWPXGenerator 기반"""
    temp_output = None
    try:
        # 1. 메타데이터 구성
        date_str = req.date or __import__('datetime').datetime.now().strftime('%Y. %m. %d.')
        total_chars = sum(len(s.text or '') for s in req.sections)

        metadata = {
            'title': req.title or '제안서',
            'organization': req.organization,
            'date': date_str,
            'model': req.model,
            'preset': req.preset,
            'total_chars': total_chars
        }

        # 2. HTML 전처리 → HWPXGenerator용 JSON 변환
        sections_data = [{'title': s.title, 'text': s.text} for s in req.sections]
        proposal_json = preprocess_sections(sections_data, metadata)

        # 3. HWPX 생성
        base_dir = str(PROJECT_ROOT)
        gen = HWPXGenerator(base_dir=base_dir, embed_fonts=False)

        # 임시 출력 파일
        fd, temp_output = tempfile.mkstemp(suffix='.hwpx')
        os.close(fd)

        gen.generate(proposal_json, temp_output)

        # 4. 네임스페이스 수정 (fix_hwpx_namespaces)
        fix_hwpx_namespaces(temp_output)

        # 5. 파일 읽기 및 반환
        with open(temp_output, 'rb') as f:
            hwpx_bytes = f.read()

        # 파일명 생성 (한국어 파일명은 RFC 5987 형식으로 인코딩)
        safe_date = date_str.replace('. ', '-').replace('.', '')
        filename = f"{req.preset}_{req.model}_{safe_date}.hwpx"
        from urllib.parse import quote
        filename_encoded = quote(filename)

        return Response(
            content=hwpx_bytes,
            media_type="application/vnd.hancom.hwpx+zip",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{filename_encoded}"
            }
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        # 임시 파일 정리
        if temp_output and os.path.exists(temp_output):
            try:
                os.unlink(temp_output)
            except Exception:
                pass


def fix_hwpx_namespaces(hwpx_path: str):
    """HWPX 파일의 네임스페이스를 표준 prefix로 수정"""
    import zipfile

    NS_MAP = {
        "http://www.hancom.co.kr/hwpml/2011/head": "hh",
        "http://www.hancom.co.kr/hwpml/2011/core": "hc",
        "http://www.hancom.co.kr/hwpml/2011/paragraph": "hp",
        "http://www.hancom.co.kr/hwpml/2011/section": "hs",
    }
    tmp_path = hwpx_path + ".tmp"
    with zipfile.ZipFile(hwpx_path, "r") as zin:
        with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                data = zin.read(item.filename)
                if item.filename.startswith("Contents/") and item.filename.endswith(".xml"):
                    text = data.decode("utf-8")
                    ns_aliases = {}
                    for match in re.finditer(r'xmlns:(ns\d+)="([^"]+)"', text):
                        alias, uri = match.group(1), match.group(2)
                        if uri in NS_MAP:
                            ns_aliases[alias] = NS_MAP[uri]
                    for old_prefix, new_prefix in ns_aliases.items():
                        text = text.replace(f"xmlns:{old_prefix}=", f"xmlns:{new_prefix}=")
                        text = text.replace(f"<{old_prefix}:", f"<{new_prefix}:")
                        text = text.replace(f"</{old_prefix}:", f"</{new_prefix}:")
                    data = text.encode("utf-8")
                zout.writestr(item, data)
    os.replace(tmp_path, hwpx_path)

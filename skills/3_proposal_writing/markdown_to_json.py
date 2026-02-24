#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Markdown to JSON Converter for Proposal Generation
마크다운 제안서를 JSON 형식으로 변환하고, 색상 마커를 추가합니다.
"""

import re
import json
import sys
from pathlib import Path


class MarkdownToJsonConverter:
    """마크다운을 JSON으로 변환하는 클래스"""

    def __init__(self):
        self.color_patterns = {
            'green': [
                r'\*\*AI[^*]+?\*\*',  # **AI로 시작하는 볼드**
                r'\*\*인공지능[^*]+?\*\*',
                r'\*\*자동화[^*]+?\*\*',
                r'\*\*머신러닝[^*]+?\*\*',
                r'\*\*딥러닝[^*]+?\*\*',
            ],
            'red': [
                r'\*\*\d+%[^*]+?\*\*',  # **숫자%로 시작하는 볼드**
                r'\*\*\d+시간[^*]+?\*\*',
                r'\*\*\d+분[^*]+?\*\*',
            ]
        }

    def convert_bold_to_markers(self, text):
        """볼드 마크다운을 색상 마커로 변환"""

        # 먼저 green 패턴 적용
        for pattern in self.color_patterns['green']:
            def replace_green(match):
                content = match.group(0)
                # **제거
                content = content.replace('**', '')
                return f'{{{{green:{content}}}}}'

            text = re.sub(pattern, replace_green, text)

        # 그 다음 red 패턴 적용
        for pattern in self.color_patterns['red']:
            def replace_red(match):
                content = match.group(0)
                # **제거
                content = content.replace('**', '')
                return f'{{{{red:{content}}}}}'

            text = re.sub(pattern, replace_red, text)

        # 남은 볼드는 그냥 제거
        text = re.sub(r'\*\*([^*]+?)\*\*', r'\1', text)

        return text

    def convert_markdown_to_json(self, markdown_text, metadata=None):
        """마크다운 텍스트를 JSON으로 변환"""

        if metadata is None:
            metadata = {
                "title": "제안서",
                "organization": "기관명",
                "date": "2026-02-16",
                "model": "claude_sonnet_4.5",
                "preset": "default",
                "rfp_source": "rfp.pdf",
                "total_chars": len(markdown_text)
            }

        content = []
        lines = markdown_text.split('\n')

        current_section = None
        current_items = []
        table_buffer = []

        def process_table_buffer():
            """버퍼에 있는 표 데이터를 JSON 아이템으로 변환"""
            nonlocal current_items
            if not table_buffer:
                return
            if current_items is None:
                return

            try:
                # 첫 번째 줄은 헤더
                header_row = table_buffer[0]
                headers = [cell.strip() for cell in header_row.strip('|').split('|')]
                headers = [h for h in headers if h]  # 빈 헤더 제거

                if not headers:
                    return

                rows = []
                start_row_idx = 1

                # 두 번째 줄이 구분선(|---|)인지 확인
                if len(table_buffer) > 1:
                    second_row = table_buffer[1].strip()
                    separator_content = second_row.replace('|', '').replace('-', '').replace(':', '').replace(' ', '')
                    if separator_content == '':
                        start_row_idx = 2

                for i in range(start_row_idx, len(table_buffer)):
                    row_text = table_buffer[i]
                    if not row_text.strip():
                        continue

                    cells = [cell.strip() for cell in row_text.strip('|').split('|')]
                    cells = [c for c in cells if c or len(cells) <= len(headers)]  # 빈 셀 처리

                    # 셀 개수를 헤더에 맞춤
                    if len(cells) < len(headers):
                        cells.extend([""] * (len(headers) - len(cells)))
                    elif len(cells) > len(headers):
                        cells = cells[:len(headers)]

                    rows.append(cells)

                if not rows:
                    return

                current_items.append({
                    "type": "table",
                    "headers": headers,
                    "rows": rows,
                    "style": {
                        "headerBg": "#2563eb",
                        "headerColor": "#ffffff",
                        "borderColor": "#cbd5e1"
                    }
                })
                print(f"  [Table Parsed] Headers: {headers}, Rows: {len(rows)}")
            except Exception as e:
                print(f"Error parsing table: {e}")

        for line in lines:
            line = line.strip()
            
            # 표 처리 (파이프로 시작하는 경우)
            if line.startswith('|'):
                table_buffer.append(line)
                continue
            
            # 표가 끝났는데 버퍼가 차있는 경우 처리
            if table_buffer:
                process_table_buffer()
                table_buffer = []

            if not line:
                continue

            # 섹션 제목 (# 또는 ##)
            if line.startswith('# ') or line.startswith('## '):
                # 이전 섹션 저장
                if current_section:
                    current_section['items'] = current_items
                    content.append(current_section)

                # 새 섹션 시작
                section_title = line.lstrip('#').strip()
                section_title = self.convert_bold_to_markers(section_title)

                current_section = {
                    "type": "section",
                    "id": f"section{len(content) + 1}",
                    "title": section_title,
                }
                current_items = []

            # 본문 텍스트 (표가 아닌 경우)
            elif line and current_section:
                # 레벨 판단 (들여쓰기나 번호로)
                level = 2  # 기본 레벨

                if line.startswith('- '):
                    level = 2
                    line = line[2:].strip()
                elif re.match(r'^\d+\.', line):
                    level = 2
                    line = re.sub(r'^\d+\.\s*', '', line)

                # 볼드를 색상 마커로 변환
                converted_text = self.convert_bold_to_markers(line)

                current_items.append({
                    "level": level,
                    "text": converted_text,
                    "color": "default",
                    "source": "generated"
                })

        # 루프 종료 후 남은 표 처리
        if table_buffer:
            process_table_buffer()

        # 마지막 섹션 저장
        if current_section:
            current_section['items'] = current_items
            content.append(current_section)

        return {
            "metadata": metadata,
            "content": content
        }


def main():
    """메인 함수"""
    if len(sys.argv) < 2:
        print("Usage: python markdown_to_json.py <input.md> [output.json]")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else input_file.replace('.md', '.json')

    # 마크다운 읽기
    with open(input_file, 'r', encoding='utf-8') as f:
        markdown_text = f.read()

    # 변환
    converter = MarkdownToJsonConverter()
    result = converter.convert_markdown_to_json(markdown_text)

    # JSON 저장
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"✓ Converted: {input_file} -> {output_file}")
    print(f"  Sections: {len(result['content'])}")
    total_items = sum(len(s.get('items', [])) for s in result['content'])
    print(f"  Items: {total_items}")


if __name__ == "__main__":
    main()

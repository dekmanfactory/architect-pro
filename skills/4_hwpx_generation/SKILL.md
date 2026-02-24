---
name: hwpx_generation
description: "JSON 데이터를 입력받아 스타일 규정이 적용된 HWPX 문서 + HTML 미리보기를 생성하는 스킬. 템플릿 파일 없이 코드로 직접 문서를 생성하며, 색상(적색/녹색), 표, 단계별 여백을 모두 지원한다."
---

# HWPX 리포트 생성 스킬 (Step 4)

## 개요

이 스킬은 **Skill 3에서 생성된 JSON 데이터**를 입력받아:
1. **스타일 규정이 적용된 HWPX 문서** 생성 (템플릿 없이 코드로 직접 생성)
2. **HTML 미리보기** 생성 (웹에서 확인)

두 파일의 **내용이 완전히 일치**하도록 생성합니다.

---

## ⚠️ 핵심 원칙: 템플릿 없는 코드 기반 생성

> **`report-template.hwpx`를 사용하지 않고 `HwpxDocument.new()`로 문서를 처음부터 생성합니다.**

이유:
- ✅ 템플릿 파일 손상 문제 해결
- ✅ 스타일 완전 제어 가능
- ✅ 동적으로 색상/여백 적용 가능

---

## 주요 기능

### 1. 문단 스타일 강제 적용

**모든 문단에 자동 적용:**
- **양쪽 정렬 (Justified)**: 전문적인 문서 느낌
- **단계별 왼쪽 여백**: 레벨에 따라 자동 계산

| 레벨 | 기호 | 폰트 | 크기 | 문단 위 여백 | 왼쪽 여백 |
|------|------|------|------|-------------|----------|
| level1 | □ | HY헤드라인M | 16pt | 15pt | 0pt |
| level2 | ○ | 휴먼명조 | 15pt | 10pt | 10pt |
| level3 | ― | 휴먼명조 | 15pt | 6pt | 20pt |
| level4 | ※ | 한양중고딕 | 13pt | 3pt | 30pt |

### 2. 색상 데이터 반영

JSON의 `color` 속성을 읽어서 적용:

| 색상 코드 | 의미 | HEX |
|----------|------|-----|
| `red` | Raw 데이터 기반 | `#dc2626` |
| `green` | Reference 기반 | `#16a34a` |
| `blue` | RFP 기반 | `#2563eb` |
| `yellow` | AI 생성 | `#eab308` |
| `black` (기본) | 일반 텍스트 | `#000000` |

### 3. 표(Table) 지원

표 내부 데이터에도 색상과 스타일 적용 가능:
- 헤더: 파란색 배경 + 흰색 글자
- 데이터: 각 셀별로 개별 색상 지정 가능

---

## JSON 입력 형식

### 기본 구조

```json
{
  "metadata": {
    "title": "제안서 제목",
    "organization": "기관명",
    "date": "2026. 2. 14.",
    "model": "gemini_3.0_flash",
    "preset": "제안서"
  },
  "content": [
    {
      "type": "section",
      "title": "섹션 제목",
      "items": [
        {
          "level": 1,
          "text": "이것은 적색 강조 제목입니다",
          "color": "red"
        },
        {
          "level": 2,
          "text": "데이터가 녹색으로 표시됩니다",
          "color": "green"
        }
      ]
    },
    {
      "type": "table",
      "title": "표 제목",
      "headers": ["컬럼1", "컬럼2"],
      "rows": [
        [
          {"text": "적색 헤더", "color": "red"},
          "일반 헤더"
        ],
        [
          "일반 값",
          {"text": "녹색 값", "color": "green"}
        ]
      ],
      "style": {
        "headerBg": "#2563eb",
        "headerColor": "#ffffff"
      }
    }
  ]
}
```

---

## 스타일 규정 파일 (proposal-styles.json)

**위치**: 프로젝트 루트

```json
{
  "styles": {
    "level1": {
      "symbol": "□",
      "font": "HY헤드라인M",
      "size": 16,
      "paragraphSpaceBefore": 15,
      "align": "justify",
      "leftMargin": 0
    },
    "level2": {
      "symbol": "○",
      "font": "휴먼명조",
      "size": 15,
      "paragraphSpaceBefore": 10,
      "align": "justify",
      "leftMargin": 10
    },
    "level3": {
      "symbol": "―",
      "font": "휴먼명조",
      "size": 15,
      "paragraphSpaceBefore": 6,
      "align": "justify",
      "leftMargin": 20
    },
    "level4": {
      "symbol": "※",
      "font": "한양중고딕",
      "size": 13,
      "paragraphSpaceBefore": 3,
      "align": "justify",
      "leftMargin": 30
    },
    "table": {
      "font": "휴먼명조",
      "size": 11,
      "headerBg": "#2563eb",
      "headerColor": "#ffffff",
      "borderColor": "#cbd5e1"
    }
  },
  "colors": {
    "red": "#dc2626",
    "green": "#16a34a",
    "blue": "#2563eb",
    "yellow": "#eab308",
    "black": "#000000"
  }
}
```

---

## 파일 구조

```
skills/4_hwpx_generation/
├── SKILL.md                    # 이 문서
├── src/
│   ├── hwpx_generator.py       # HWPX 생성 엔진
│   └── html_generator.py       # HTML 생성 엔진
└── scripts/
    └── fix_namespaces.py       # 네임스페이스 후처리 (필수!)
```

---

## Python 구현 예시

### hwpx_generator.py

```python
from hwpx import HwpxDocument
import json

class HWPXGenerator:
    def __init__(self, styles_path="proposal-styles.json"):
        with open(styles_path, 'r', encoding='utf-8') as f:
            self.styles = json.load(f)

    def _get_color_hex(self, color_name):
        """색상 이름을 HEX 코드로 변환"""
        return self.styles['colors'].get(color_name, '#000000')

    def _apply_paragraph_style(self, para, level):
        """문단 스타일 적용"""
        style = self.styles['styles'][f'level{level}']

        # 폰트 설정
        para.set_font(style['font'], style['size'])

        # 정렬 (양쪽 정렬)
        para.set_align('justify')

        # 여백
        para.set_margin_left(style['leftMargin'])
        para.set_spacing_before(style['paragraphSpaceBefore'])

        return para

    def _add_text_with_color(self, para, text, color='black'):
        """색상이 적용된 텍스트 추가"""
        hex_color = self._get_color_hex(color)
        para.add_run(text, color=hex_color)

    def generate(self, json_data, output_path):
        """JSON에서 HWPX 생성"""
        doc = HwpxDocument.new()

        # 메타데이터
        metadata = json_data['metadata']

        # 표지
        title_para = doc.add_paragraph()
        title_para.set_font('HY헤드라인M', 25)
        title_para.set_align('center')
        title_para.add_run(metadata['title'], bold=True)

        doc.add_paragraph()  # 빈 줄

        org_para = doc.add_paragraph()
        org_para.set_font('HY헤드라인M', 30)
        org_para.set_align('center')
        org_para.add_run(metadata['organization'], bold=True)

        doc.add_paragraph()  # 빈 줄

        date_para = doc.add_paragraph()
        date_para.set_font('HY헤드라인M', 25)
        date_para.set_align('center')
        date_para.add_run(metadata['date'])

        doc.add_page_break()

        # 본문 섹션
        for section in json_data['content']:
            if section['type'] == 'section':
                # 섹션 제목
                sec_title = doc.add_paragraph()
                sec_title.set_font('HY헤드라인M', 20)
                sec_title.add_run(section['title'], bold=True)

                # 섹션 아이템
                for item in section['items']:
                    para = doc.add_paragraph()
                    self._apply_paragraph_style(para, item['level'])

                    # 기호 추가
                    symbol = self.styles['styles'][f'level{item["level"]}']['symbol']
                    para.add_run(f"{symbol} ")

                    # 텍스트 + 색상
                    color = item.get('color', 'black')
                    self._add_text_with_color(para, item['text'], color)

            elif section['type'] == 'table':
                # 표 제목
                table_title = doc.add_paragraph()
                table_title.set_font('HY헤드라인M', 18)
                table_title.add_run(section['title'], bold=True)

                # 표 생성
                table = doc.add_table(
                    len(section['rows']) + 1,  # 헤더 포함
                    len(section['headers'])
                )

                # 헤더 행
                for col_idx, header in enumerate(section['headers']):
                    cell = table.cell(0, col_idx)
                    cell.set_background_color(
                        section.get('style', {}).get('headerBg', '#2563eb')
                    )
                    cell.add_paragraph(header, color='#ffffff')

                # 데이터 행
                for row_idx, row in enumerate(section['rows']):
                    for col_idx, cell_data in enumerate(row):
                        cell = table.cell(row_idx + 1, col_idx)

                        if isinstance(cell_data, dict):
                            # 색상 정보 포함
                            text = cell_data['text']
                            color = self._get_color_hex(cell_data.get('color', 'black'))
                            cell.add_paragraph(text, color=color)
                        else:
                            # 일반 텍스트
                            cell.add_paragraph(cell_data)

        # 저장
        doc.save(output_path)

        # 네임스페이스 후처리 (필수!)
        import subprocess
        subprocess.run([
            'python',
            'skills/4_hwpx_generation/scripts/fix_namespaces.py',
            output_path
        ], check=True)

        return output_path
```

---

## 사용 방법

### 1. JSON 파일 준비

Skill 3에서 생성된 `proposal-full.json`

### 2. HWPX + HTML 생성

```python
from skills.4_hwpx_generation.src.hwpx_generator import HWPXGenerator
from skills.4_hwpx_generation.src.html_generator import HTMLGenerator

# JSON 로드
with open('proposal-full.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# HWPX 생성
hwpx_gen = HWPXGenerator()
hwpx_file = hwpx_gen.generate(data, '제안서_gemini_3.0_flash_2026-2-14.hwpx')

# HTML 생성
html_gen = HTMLGenerator()
html_file = html_gen.generate(data, '제안서_gemini_3.0_flash_2026-2-14.html')

print(f"✅ HWPX: {hwpx_file}")
print(f"✅ HTML: {html_file}")
```

### 3. Node.js 스크립트로 실행

```bash
node json-to-documents.mjs proposal-full.json
```

---

## 네임스페이스 후처리 (필수!)

HWPX 생성 후 반드시 실행:

```python
import subprocess

subprocess.run([
    'python',
    'skills/4_hwpx_generation/scripts/fix_namespaces.py',
    'output.hwpx'
], check=True)
```

이 단계를 빠뜨리면 **한글 뷰어에서 파일이 손상된 것으로 표시**됩니다!

---

## Skill 3 연동 가이드

### 색상 지정 방법

Skill 3에서 JSON 생성 시 `color` 속성 추가:

```json
{
  "level": 2,
  "text": "이것은 적색 강조 제목입니다",
  "color": "red"
}
```

### 표 데이터 색상 지정

```json
{
  "type": "table",
  "headers": ["항목", "값"],
  "rows": [
    [
      {"text": "Raw 데이터", "color": "red"},
      {"text": "100명", "color": "red"}
    ],
    [
      {"text": "Reference 데이터", "color": "green"},
      {"text": "과거 실적", "color": "green"}
    ]
  ]
}
```

---

## 출력 파일

### 자동 생성되는 파일명

```
{preset}_{model}_{date}.hwpx
{preset}_{model}_{date}.html
```

예시:
- `제안서_gemini_3.0_flash_2026-2-14.hwpx`
- `제안서_gemini_3.0_flash_2026-2-14.html`

---

## 주의 사항

1. ⚠️ **템플릿 사용 금지**: `report-template.hwpx`를 사용하지 않습니다
2. ⚠️ **네임스페이스 후처리 필수**: `fix_namespaces.py` 반드시 실행
3. ⚠️ **색상 키워드 제한**: `red`, `green`, `blue`, `yellow`, `black`만 지원
4. ⚠️ **폰트 설치 필요**: HY헤드라인M, 휴먼명조, 한양중고딕이 시스템에 설치되어야 함

---

## 문제 해결

### Q: 파일이 손상되었다고 나옵니다
→ `fix_namespaces.py` 실행 여부 확인
→ 실행: `python skills/4_hwpx_generation/scripts/fix_namespaces.py output.hwpx`

### Q: 색상이 적용되지 않습니다
→ JSON의 `color` 속성이 올바른 값인지 확인 (`red`/`green`/`blue`/`yellow`/`black`)
→ `proposal-styles.json`의 colors 섹션 확인

### Q: 폰트가 이상하게 나옵니다
→ 시스템에 해당 폰트가 설치되어 있는지 확인
→ `proposal-styles.json`에서 대체 폰트로 변경

---

## 참고 문서

- **스타일 규정**: `스타일_규정.md`
- **JSON 스키마**: `content-schema.json`
- **Skill 3 연동**: `skills/3_proposal_writing/SKILL.md`
- **전체 워크플로우**: `WORKFLOW.md`

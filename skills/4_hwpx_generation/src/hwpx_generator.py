# -*- coding: utf-8 -*-
import os
import json
import zipfile
import tempfile
import shutil
import base64
from pathlib import Path
from lxml import etree


class HWPXGenerator:
    def __init__(self, base_dir: str = None, styles_path: str = "proposal-styles.json", embed_fonts: bool = True):
        self.embed_fonts = embed_fonts
        if base_dir:
            self.base_dir = Path(base_dir)
            self.styles_path = self.base_dir / styles_path
        else:
            self.base_dir = Path.cwd()
            self.styles_path = self.base_dir / styles_path

        # 스타일 설정 로드
        with open(self.styles_path, "r", encoding="utf-8") as f:
            styles_data = json.load(f)
            self.style_config = styles_data["styles"]
            self.colors = styles_data.get("colors", {})

        # 네임스페이스 정의
        self.ns = {
            'hp': 'http://www.hancom.co.kr/hwpml/2011/paragraph',
            'hs': 'http://www.hancom.co.kr/hwpml/2011/section',
            'hh': 'http://www.hancom.co.kr/hwpml/2011/head',
            'hc': 'http://www.hancom.co.kr/hwpml/2011/core'
        }

        # CharShape ID 카운터
        self.next_charpr_id = 10  # 기본 스타일들 다음부터 시작 (한글 오피스 샘플은 0-9 사용)
        self.charpr_cache = {}  # (height, color) -> charPr ID 매핑

        # 레벨별 ParaPr ID 매핑 (기본값, _ensure_level_parapr에서 갱신)
        self.level_parapr_ids = {1: "0", 2: "0", 3: "0", 4: "0"}

        # 표 borderFill ID (기본값, _ensure_table_borderfill에서 갱신)
        self.table_borderfill_id = "4"
        self.cell_borderfill_id = "5"

        # 폰트 임베딩 관련
        self.font_embed_cache = {}  # font_name -> binary_id 매핑
        self.next_binary_id = 0

    def _create_template_hwpx(self, output_path):
        """sample-from-hangul.hwpx가 없을 때 python-hwpx 내장 템플릿으로 생성"""
        from hwpx.templates import blank_document_bytes
        data = blank_document_bytes()
        with open(output_path, 'wb') as f:
            f.write(data)
        print(f"[Template] Created HWPX template from python-hwpx: {output_path}")

    def _get_color_hex(self, color_name):
        """색상 이름을 HEX 코드로 변환"""
        color_hex = self.colors.get(color_name.lower(), self.colors.get("black", "#000000"))
        # HWPX는 대문자 HEX 선호
        return color_hex.upper()

    def _pt_to_hwp_height(self, pt):
        """포인트를 HWPX height 단위로 변환 (1pt = 100)"""
        return int(pt * 100)

    def _font_name_to_filename(self, font_name):
        """폰트 이름을 파일 이름으로 변환"""
        # 한글 폰트 이름 -> 영문 파일 이름 매핑
        mapping = {
            "KoPubWorld바탕체 Bold": "KoPubWorld Batang Bold",
            "KoPubWorld바탕체 Medium": "KoPubWorld Batang Medium",
            "KoPubWorld바탕체 Light": "KoPubWorld Batang Light",
            "KoPubWorld돋움체 Bold": "KoPubWorld Dotum Bold",
            "KoPubWorld돋움체 Medium": "KoPubWorld Dotum Medium",
            "KoPubWorld돋움체 Light": "KoPubWorld Dotum Light",
        }
        return mapping.get(font_name, font_name)

    def _embed_font_file(self, temp_dir, font_name):
        """
        폰트 파일을 HWPX의 BinData 폴더에 임베딩하고 binary ID 반환
        """
        # 폰트 임베딩 비활성화 시 건너뛰기
        if not self.embed_fonts:
            return None

        if font_name in self.font_embed_cache:
            return self.font_embed_cache[font_name]

        # 폰트 이름을 파일 이름으로 변환
        file_name = self._font_name_to_filename(font_name)

        # TTF 파일 찾기
        font_path = self.base_dir / "assets" / "fonts" / f"{file_name}.ttf"
        if not font_path.exists():
            print(f"[Warning] Font file not found: {font_path}")
            print(f"[Debug] Looking for: {font_name} -> {file_name}")
            return None

        # BinData 디렉토리 생성
        bindata_dir = Path(temp_dir) / "BinData"
        bindata_dir.mkdir(exist_ok=True)

        # Binary ID 생성
        binary_id = f"BIN{self.next_binary_id:04d}"
        self.next_binary_id += 1

        # 폰트 파일 복사
        dest_path = bindata_dir / f"{binary_id}.ttf"
        shutil.copy2(font_path, dest_path)

        # 캐시에 저장
        self.font_embed_cache[font_name] = binary_id

        print(f"[Font Embedded] {font_name} -> {binary_id}")
        return binary_id

    def _update_manifest(self, temp_dir):
        """
        manifest.xml에 임베딩된 폰트 파일들을 추가
        """
        manifest_path = Path(temp_dir) / "META-INF" / "manifest.xml"
        if not manifest_path.exists():
            print("[Warning] manifest.xml not found")
            return

        # manifest.xml 읽기
        tree = etree.parse(str(manifest_path))
        root = tree.getroot()

        # 네임스페이스 확인
        ns = {'manifest': 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0'}

        # 각 임베딩된 폰트에 대해 file-entry 추가
        for font_name, binary_id in self.font_embed_cache.items():
            file_entry = etree.SubElement(
                root,
                f"{{{ns['manifest']}}}file-entry",
                nsmap=ns
            )
            file_entry.set(f"{{{ns['manifest']}}}full-path", f"BinData/{binary_id}.ttf")
            file_entry.set(f"{{{ns['manifest']}}}media-type", "application/x-font-truetype")

        # manifest.xml 저장
        tree.write(str(manifest_path), encoding='utf-8', xml_declaration=True, pretty_print=True)
        print(f"[Manifest Updated] Added {len(self.font_embed_cache)} font entries")

    def _get_font_weight(self, font_name):
        """폰트 이름에서 weight 값 추출"""
        if 'Bold' in font_name:
            return "8"
        elif 'Light' in font_name:
            return "3"
        elif 'Medium' in font_name:
            return "6"
        else:
            return "6"  # 기본값

    def _register_font_in_header(self, header_root, font_name, binary_id=None):
        """header.xml의 fontfaces에 폰트 등록하고 ID 반환"""
        # fontfaces 섹션 찾기
        fontfaces = header_root.find(f".//{{{self.ns['hh']}}}fontfaces")
        if fontfaces is None:
            print("[Error] fontfaces not found in header.xml")
            return None

        # 각 언어별 fontface 찾기
        for lang in ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"]:
            fontface = fontfaces.find(f".//{{{self.ns['hh']}}}fontface[@lang='{lang}']")
            if fontface is not None:
                # 이미 등록된 폰트인지 확인
                existing_fonts = fontface.findall(f"{{{self.ns['hh']}}}font")
                for existing_font in existing_fonts:
                    if existing_font.get("face") == font_name:
                        return existing_font.get("id")

                # 새 폰트 ID 생성 (기존 폰트 개수 + 1)
                new_font_id = str(len(existing_fonts))

                # 새 폰트 요소 생성
                new_font = etree.SubElement(fontface, f"{{{self.ns['hh']}}}font")
                new_font.set("id", new_font_id)
                new_font.set("face", font_name)
                new_font.set("type", "TTF")

                # 임베딩 설정
                if binary_id:
                    new_font.set("isEmbedded", "1")
                    new_font.set("binaryItemIDRef", binary_id)
                else:
                    new_font.set("isEmbedded", "0")

                # typeInfo 추가 (한글 오피스 형식)
                type_info = etree.SubElement(new_font, f"{{{self.ns['hh']}}}typeInfo")
                type_info.set("familyType", "FCAT_UNKNOWN")
                type_info.set("weight", self._get_font_weight(font_name))
                type_info.set("proportion", "4")
                type_info.set("contrast", "0")
                type_info.set("strokeVariation", "1")
                type_info.set("armStyle", "1")
                type_info.set("letterform", "1")
                type_info.set("midline", "1")
                type_info.set("xHeight", "1")

                # fontCnt 업데이트
                fontface.set("fontCnt", str(len(existing_fonts) + 1))

        return new_font_id

    def _create_charpr_element(self, height, text_color, shade_color="none", font_id="0"):
        """새로운 CharPr XML 요소 생성 - 색상과 크기만 사용"""
        charpr_attrs = {
            "id": str(self.next_charpr_id),
            "height": str(height),
            "textColor": text_color,
            "shadeColor": shade_color,
            "useFontSpace": "0",
            "useKerning": "0",
            "symMark": "NONE",
            "borderFillIDRef": "2"
        }

        charpr = etree.Element(
            f"{{{self.ns['hh']}}}charPr",
            **charpr_attrs
        )

        # 하위 요소들 추가
        fontref = etree.SubElement(charpr, f"{{{self.ns['hh']}}}fontRef")
        fontref.set("hangul", font_id)
        fontref.set("latin", font_id)
        fontref.set("hanja", font_id)
        fontref.set("japanese", font_id)
        fontref.set("other", font_id)
        fontref.set("symbol", font_id)
        fontref.set("user", font_id)

        ratio = etree.SubElement(charpr, f"{{{self.ns['hh']}}}ratio")
        ratio.set("hangul", "100")
        ratio.set("latin", "100")
        ratio.set("hanja", "100")
        ratio.set("japanese", "100")
        ratio.set("other", "100")
        ratio.set("symbol", "100")
        ratio.set("user", "100")

        spacing = etree.SubElement(charpr, f"{{{self.ns['hh']}}}spacing")
        spacing.set("hangul", "0")
        spacing.set("latin", "0")
        spacing.set("hanja", "0")
        spacing.set("japanese", "0")
        spacing.set("other", "0")
        spacing.set("symbol", "0")
        spacing.set("user", "0")

        relSz = etree.SubElement(charpr, f"{{{self.ns['hh']}}}relSz")
        relSz.set("hangul", "100")
        relSz.set("latin", "100")
        relSz.set("hanja", "100")
        relSz.set("japanese", "100")
        relSz.set("other", "100")
        relSz.set("symbol", "100")
        relSz.set("user", "100")

        offset = etree.SubElement(charpr, f"{{{self.ns['hh']}}}offset")
        offset.set("hangul", "0")
        offset.set("latin", "0")
        offset.set("hanja", "0")
        offset.set("japanese", "0")
        offset.set("other", "0")
        offset.set("symbol", "0")
        offset.set("user", "0")

        # 한글 오피스 기본 CharPr에는 underline, strikeout, outline, shadow가 없음
        # 호환성을 위해 제거

        return charpr

    def _get_or_create_font_id(self, header_root, temp_dir, font_name):
        """폰트 이름으로 Font ID를 찾거나 생성"""
        # HANGUL fontface 찾기
        ns_hh = self.ns['hh']
        fontface = header_root.find(f".//{{{ns_hh}}}fontface[@lang='HANGUL']")

        if fontface is None:
            print(f"[Font] HANGUL fontface not found, using default Font ID 0")
            return "0"

        # 기존 폰트에서 이름으로 찾기
        fonts = fontface.findall(f"{{{ns_hh}}}font")
        for font in fonts:
            face_name = font.get('face', '')
            if face_name == font_name:
                font_id = font.get('id', '0')
                return font_id

        # 폰트를 찾지 못하면 실제 등록 시도
        binary_id = self._embed_font_file(temp_dir, font_name)
        font_id = self._register_font_in_header(header_root, font_name, binary_id)

        if font_id:
            print(f"[Font] Registered new font: {font_name} -> ID {font_id}")
            return font_id

        print(f"[Font] Failed to register '{font_name}', using default Font ID 0")
        return "0"

    def _get_or_create_charpr_id(self, header_root, temp_dir, height, text_color, shade_color="none", font_name="Hamchorong Batang"):
        """CharPr을 찾거나 생성하여 ID 반환 - 크기, 색상, 폰트 사용"""
        # 폰트를 포함한 캐시 키
        cache_key = (height, text_color, shade_color, font_name)

        if cache_key in self.charpr_cache:
            return self.charpr_cache[cache_key]

        # 폰트 ID 찾기 (기본값 0)
        font_id = self._get_or_create_font_id(header_root, temp_dir, font_name)

        # 2. charProperties 섹션 찾기
        charprops = header_root.find(f".//{{{self.ns['hh']}}}charProperties")
        if charprops is None:
            print("[Error] charProperties not found in header.xml")
            return "0"

        # 3. 새 CharPr 생성 (폰트 ID 전달)
        new_charpr = self._create_charpr_element(height, text_color, shade_color, font_id)
        charpr_id = self.next_charpr_id

        # 4. charProperties에 추가
        charprops.append(new_charpr)

        # 5. itemCnt 업데이트
        current_count = int(charprops.get("itemCnt", "0"))
        charprops.set("itemCnt", str(current_count + 1))

        # 6. 캐시에 저장
        self.charpr_cache[cache_key] = charpr_id
        self.next_charpr_id += 1

        print(f"[CharPr Created] ID: {charpr_id}, Height: {height}, TextColor: {text_color}, ShadeColor: {shade_color}, Font: {font_name} (ID: {font_id})")
        return charpr_id

    def generate(self, data, output_path):
        """
        JSON 데이터를 기반으로 HWPX 문서 생성 (XML 직접 조작)
        """
        # 1. 샘플 HWPX 파일을 템플릿으로 사용
        print("[Step 1] Using sample HWPX as template...")
        sample_path = Path("sample-from-hangul.hwpx")

        with tempfile.NamedTemporaryFile(suffix='.hwpx', delete=False) as tmp:
            temp_path = tmp.name

        if sample_path.exists():
            # 샘플 파일 복사
            shutil.copy(sample_path, temp_path)
        else:
            # 샘플 없으면 프로그래밍으로 생성
            print("[Warning] Sample file not found, creating template programmatically...")
            self._create_template_hwpx(temp_path)

        # 2. ZIP으로 열어서 XML 조작
        print("[Step 2] Extracting HWPX archive...")
        temp_dir = tempfile.mkdtemp()

        with zipfile.ZipFile(temp_path, 'r') as zf:
            zf.extractall(temp_dir)

        # 3. header.xml 및 section0.xml 로드
        header_path = Path(temp_dir) / "Contents" / "header.xml"
        section_path = Path(temp_dir) / "Contents" / "section0.xml"

        header_tree = etree.parse(str(header_path))
        header_root = header_tree.getroot()

        section_tree = etree.parse(str(section_path))
        section_root = section_tree.getroot()

        # 3.5. 표 테두리용 borderFill 추가
        self._ensure_table_borderfill(header_root)

        # 3.5.5. 레벨별 ParaPr 추가 (어절 단위 + 문단 간격 + 왼쪽 여백)
        self._ensure_level_parapr(header_root)

        # 3.6. 기존 CharPr 개수 확인하여 ID 충돌 방지
        charprops = header_root.find(f".//{{{self.ns['hh']}}}charProperties")
        if charprops is not None:
            existing_charpr = charprops.findall(f"{{{self.ns['hh']}}}charPr")
            max_existing_id = 0
            for charpr in existing_charpr:
                try:
                    cid = int(charpr.get('id', '0'))
                    if cid > max_existing_id:
                        max_existing_id = cid
                except:
                    pass
            # 기존 ID 다음부터 시작
            self.next_charpr_id = max_existing_id + 1
            print(f"[CharPr] Starting from ID {self.next_charpr_id} (existing: {max_existing_id})")

        # 4. 기존 콘텐츠 삭제 (section의 모든 자식 제거)
        print("[Step 3] Clearing existing content...")
        for child in list(section_root):
            section_root.remove(child)

        # 5. 새 콘텐츠 추가
        print("[Step 4] Adding new content...")
        metadata = data.get("metadata", {})
        title = metadata.get("title", "제목 없음")

        # 제목 추가 (선택적 - metadata에서 설정 가능)
        include_title = metadata.get("include_title", False)  # 기본값: 제목 표시 안 함

        if include_title and title:
            title_style = self.style_config.get("title", {})
            title_height = self._pt_to_hwp_height(title_style.get("size", 25))
            title_color = "#000000"
            title_font = title_style.get("font", "KoPubWorld돋움체 Bold")
            title_charpr_id = self._get_or_create_charpr_id(header_root, temp_dir, title_height, title_color, "none", title_font)

            title_para = self._create_paragraph(title, title_charpr_id)
            section_root.append(title_para)

        # 콘텐츠 처리
        for item in data.get("content", []):
            item_type = item.get("type", "section")

            if item_type == "section":
                # 섹션 제목 (선택적 - 기본값: 표시 안 함)
                include_section_titles = metadata.get("include_section_titles", False)
                section_title = item.get("title")

                if include_section_titles and section_title:
                    sec_height = self._pt_to_hwp_height(18)
                    sec_color = "#000000"
                    sec_font = "KoPubWorld바탕체 Bold"
                    sec_charpr_id = self._get_or_create_charpr_id(header_root, temp_dir, sec_height, sec_color, "none", sec_font)
                    sec_para = self._create_paragraph(section_title, sec_charpr_id)
                    section_root.append(sec_para)

                # 섹션 항목 처리
                for sub_item in item.get("items", []):
                    sub_item_type = sub_item.get("type")

                    # 표인 경우
                    if sub_item_type == "table":
                        # 표를 담을 paragraph 생성 (네이티브 한글 구조 동일)
                        table_para = self._create_table_paragraph(header_root, temp_dir, sub_item)
                        section_root.append(table_para)

                        print(f"[Added] Table in section: Rows: {len(sub_item.get('rows', []))}, Cols: {len(sub_item.get('headers', []))}")

                    # 일반 텍스트인 경우
                    else:
                        level = sub_item.get("level", 1)
                        text = sub_item.get("text", "")

                        # 레벨별 스타일 가져오기
                        level_key = f"level{level}"
                        style = self.style_config.get(level_key, {})

                        font_size_pt = style.get("size", 15)
                        font_name = style.get("font", "Hamchorong Batang")  # 스타일에서 폰트 가져오기
                        height = self._pt_to_hwp_height(font_size_pt)

                        # Paragraph 생성 - 마커 기반 색상 적용 (폰트 + 레벨 전달)
                        para = self._create_paragraph_with_markers(text, height, header_root, temp_dir, font_name, level)
                        section_root.append(para)

                        print(f"[Added] Level: {level_key}, Size: {font_size_pt}pt, Font: {font_name}, Text: {text[:50]}...")

            elif item_type == "table":
                # 표 제목 (선택적)
                table_title = item.get("title")
                if table_title:
                    title_height = self._pt_to_hwp_height(18)
                    title_color = "#000000"
                    title_charpr_id = self._get_or_create_charpr_id(header_root, temp_dir, title_height, title_color)
                    title_para = self._create_paragraph(table_title, title_charpr_id)
                    section_root.append(title_para)

                # 표를 담을 paragraph 생성 (네이티브 한글 구조 동일)
                table_para = self._create_table_paragraph(header_root, temp_dir, item)
                section_root.append(table_para)

                print(f"[Added] Table: {item.get('id', 'unknown')}, Rows: {len(item.get('rows', []))}, Cols: {len(item.get('headers', []))}")

        # 6. 수정된 XML 저장
        print("[Step 5] Saving modified XML files...")
        header_tree.write(str(header_path), encoding='utf-8', xml_declaration=True, pretty_print=True)
        section_tree.write(str(section_path), encoding='utf-8', xml_declaration=True, pretty_print=True)

        # 7. 다시 ZIP으로 압축
        print("[Step 6] Re-packing HWPX archive...")
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    file_path = Path(root) / file
                    arcname = file_path.relative_to(temp_dir)
                    zf.write(file_path, arcname)

        # 8. 임시 파일 정리
        shutil.rmtree(temp_dir)
        os.unlink(temp_path)

        print(f"[Success] HWPX generated: {output_path}")
        return output_path

    def _ensure_table_borderfill(self, header_root):
        """표 테두리용 borderFill 보장 (ID 4: 표용, ID 5: 셀용 - 네이티브 한글과 동일)"""
        borderfills = header_root.find(f".//{{{self.ns['hh']}}}borderFills")
        if borderfills is None:
            print("[Warning] borderFills not found in header.xml")
            return

        # 기존 최대 borderFill ID 구하기 (연속 ID 보장)
        existing_bf_ids = []
        for bf in borderfills.findall(f"{{{self.ns['hh']}}}borderFill"):
            try:
                existing_bf_ids.append(int(bf.get("id", "0")))
            except ValueError:
                pass
        next_bf_id = max(existing_bf_ids) + 1 if existing_bf_ids else 1

        # 표용, 셀용 borderFill 2개 생성 (연속 ID)
        self.table_borderfill_id = str(next_bf_id)      # 표 외곽용
        self.cell_borderfill_id = str(next_bf_id + 1)    # 셀용

        for bf_id in [self.table_borderfill_id, self.cell_borderfill_id]:
            # borderFill 생성 (SOLID 테두리)
            bf = etree.Element(
                f"{{{self.ns['hh']}}}borderFill",
                id=bf_id, threeD="0", shadow="0",
                centerLine="NONE", breakCellSeparateLine="0"
            )

            slash = etree.SubElement(bf, f"{{{self.ns['hh']}}}slash")
            slash.set("type", "NONE")
            slash.set("Crooked", "0")
            slash.set("isCounter", "0")

            backSlash = etree.SubElement(bf, f"{{{self.ns['hh']}}}backSlash")
            backSlash.set("type", "NONE")
            backSlash.set("Crooked", "0")
            backSlash.set("isCounter", "0")

            for border_name in ["leftBorder", "rightBorder", "topBorder", "bottomBorder"]:
                border = etree.SubElement(bf, f"{{{self.ns['hh']}}}{border_name}")
                border.set("type", "SOLID")
                border.set("width", "0.12 mm")
                border.set("color", "#C4C4C4")   # 표 색상

            diagonal = etree.SubElement(bf, f"{{{self.ns['hh']}}}diagonal")
            diagonal.set("type", "SOLID")
            diagonal.set("width", "0.1 mm")
            diagonal.set("color", "#000000")

            # 배경색 추가 (표 외곽 + 셀 모두)
            fillBrush = etree.SubElement(bf, f"{{{self.ns['hc']}}}fillBrush")
            winBrush = etree.SubElement(fillBrush, f"{{{self.ns['hc']}}}winBrush")
            winBrush.set("faceColor", "#F2F2F2")  # 연한 회색 배경
            winBrush.set("hatchColor", "#FFFFFF")
            winBrush.set("alpha", "0")

            borderfills.append(bf)
            print(f"[BorderFill Created] ID {bf_id} with SOLID borders + bg #F2F2F2")

        # itemCnt를 실제 개수로 업데이트
        actual_count = len(borderfills.findall(f"{{{self.ns['hh']}}}borderFill"))
        borderfills.set("itemCnt", str(actual_count))

    def _ensure_level_parapr(self, header_root):
        """레벨별 ParaPr 생성 (어절 단위 + proposal-styles.json 설정 반영)"""
        paraprops = header_root.find(f".//{{{self.ns['hh']}}}paraProperties")
        if paraprops is None:
            print("[Warning] paraProperties not found in header.xml")
            return

        # 기존 최대 ParaPr ID 구하기 (연속 ID 보장)
        existing_ids = []
        for pp in paraprops.findall(f"{{{self.ns['hh']}}}paraPr"):
            try:
                existing_ids.append(int(pp.get("id", "0")))
            except ValueError:
                pass
        next_id = max(existing_ids) + 1 if existing_ids else 0

        # 레벨별 ParaPr ID 매핑 저장 (본문에서 참조용)
        self.level_parapr_ids = {}

        # 레벨 1-4에 대해 ParaPr 생성 (연속 ID)
        for level in range(1, 5):
            parapr_id = str(next_id)
            self.level_parapr_ids[level] = parapr_id
            next_id += 1

            # proposal-styles.json에서 설정 가져오기
            level_key = f"level{level}"
            style = self.style_config.get(level_key, {})

            left_margin_pt = style.get("leftMargin", 0)
            space_before_pt = style.get("paragraphSpaceBefore", 0)
            space_after_pt = style.get("paragraphSpaceAfter", 5)  # 기본값 5pt

            # pt를 HWPUNIT로 변환 (1pt = 100 HWPUNIT)
            left_margin = left_margin_pt * 100
            space_before = space_before_pt * 100
            space_after = space_after_pt * 100

            # 새 ParaPr 생성
            parapr = etree.Element(
                f"{{{self.ns['hh']}}}paraPr",
                id=parapr_id,
                tabPrIDRef="0",
                condense="0",
                fontLineHeight="0",
                snapToGrid="1",
                suppressLineNumbers="0",
                checked="0"
            )

            # align
            align = etree.SubElement(parapr, f"{{{self.ns['hh']}}}align")
            align.set("horizontal", "JUSTIFY")
            align.set("vertical", "BASELINE")

            # heading
            heading = etree.SubElement(parapr, f"{{{self.ns['hh']}}}heading")
            heading.set("type", "NONE")
            heading.set("idRef", "0")
            heading.set("level", "0")

            # breakSetting (어절 단위: KEEP_WORD)
            breakSetting = etree.SubElement(parapr, f"{{{self.ns['hh']}}}breakSetting")
            breakSetting.set("breakLatinWord", "KEEP_WORD")
            breakSetting.set("breakNonLatinWord", "KEEP_WORD")  # 한글 어절 단위
            breakSetting.set("widowOrphan", "0")
            breakSetting.set("keepWithNext", "0")
            breakSetting.set("keepLines", "0")
            breakSetting.set("pageBreakBefore", "0")
            breakSetting.set("lineWrap", "BREAK")

            # autoSpacing
            autoSpacing = etree.SubElement(parapr, f"{{{self.ns['hh']}}}autoSpacing")
            autoSpacing.set("eAsianEng", "0")
            autoSpacing.set("eAsianNum", "0")

            # margin (왼쪽 여백 + 문단 위 간격)
            margin = etree.SubElement(parapr, f"{{{self.ns['hh']}}}margin")

            intent = etree.SubElement(margin, f"{{{self.ns['hc']}}}intent")
            intent.set("value", "0")
            intent.set("unit", "HWPUNIT")

            left = etree.SubElement(margin, f"{{{self.ns['hc']}}}left")
            left.set("value", str(left_margin))
            left.set("unit", "HWPUNIT")

            right = etree.SubElement(margin, f"{{{self.ns['hc']}}}right")
            right.set("value", "0")
            right.set("unit", "HWPUNIT")

            prev = etree.SubElement(margin, f"{{{self.ns['hc']}}}prev")
            prev.set("value", str(space_before))
            prev.set("unit", "HWPUNIT")

            next_elem = etree.SubElement(margin, f"{{{self.ns['hc']}}}next")
            next_elem.set("value", str(space_after))  # 문단 아래 간격 (proposal-styles.json)
            next_elem.set("unit", "HWPUNIT")

            # lineSpacing
            lineSpacing = etree.SubElement(parapr, f"{{{self.ns['hh']}}}lineSpacing")
            lineSpacing.set("type", "PERCENT")
            lineSpacing.set("value", "160")
            lineSpacing.set("unit", "HWPUNIT")

            # border
            border = etree.SubElement(parapr, f"{{{self.ns['hh']}}}border")
            border.set("borderFillIDRef", "2")
            border.set("offsetLeft", "0")
            border.set("offsetRight", "0")
            border.set("offsetTop", "0")
            border.set("offsetBottom", "0")
            border.set("connect", "0")
            border.set("ignoreMargin", "0")

            # paraProperties에 추가
            paraprops.append(parapr)

            # itemCnt 업데이트
            current_count = int(paraprops.get("itemCnt", "0"))
            paraprops.set("itemCnt", str(current_count + 1))

            print(f"[ParaPr Added] ID {parapr_id} (Level {level}, LeftMargin: {left_margin_pt}pt, SpaceBefore: {space_before_pt}pt, SpaceAfter: {space_after_pt}pt)")

    def _clean_html_tags(self, text):
        """HTML 태그를 제거하고 마커로 변환"""
        import re

        if not isinstance(text, str):
            return text

        # 1. HTML span 태그를 마커로 변환
        # <span class="text-green-600 ...">텍스트</span> → {{green:텍스트}}
        text = re.sub(
            r'<span\s+class="[^"]*text-green-[^"]*"[^>]*>(.*?)</span>',
            r'{{green:\1}}',
            text,
            flags=re.DOTALL
        )

        # <span class="text-red-600 ...">텍스트</span> → {{red:텍스트}}
        text = re.sub(
            r'<span\s+class="[^"]*text-red-[^"]*"[^>]*>(.*?)</span>',
            r'{{red:\1}}',
            text,
            flags=re.DOTALL
        )

        # 2. 다른 HTML 태그 제거 (strong, b, em 등)
        text = re.sub(r'<strong>(.*?)</strong>', r'\1', text, flags=re.DOTALL)
        text = re.sub(r'<b>(.*?)</b>', r'\1', text, flags=re.DOTALL)
        text = re.sub(r'<em>(.*?)</em>', r'\1', text, flags=re.DOTALL)
        text = re.sub(r'<i>(.*?)</i>', r'\1', text, flags=re.DOTALL)

        # 3. 나머지 모든 HTML 태그 제거
        text = re.sub(r'<[^>]+>', '', text)

        # 4. HTML 엔티티 변환
        text = text.replace('&nbsp;', ' ')
        text = text.replace('&lt;', '<')
        text = text.replace('&gt;', '>')
        text = text.replace('&amp;', '&')
        text = text.replace('&quot;', '"')

        return text

    def _parse_color_markers(self, text):
        """텍스트에서 {{red:...}}, {{green:...}} 마커 파싱 (HTML 제거 포함)"""
        import re

        # HTML 태그 제거 및 마커 변환
        text = self._clean_html_tags(text)

        segments = []
        current_pos = 0

        # {{color:text}} 패턴 찾기
        pattern = r'\{\{(red|green):([^}]+)\}\}'

        for match in re.finditer(pattern, text):
            # 마커 앞의 일반 텍스트
            if match.start() > current_pos:
                segments.append({
                    'text': text[current_pos:match.start()],
                    'color': None
                })

            # 마커 안의 색상 텍스트
            color = match.group(1)
            colored_text = match.group(2)
            segments.append({
                'text': colored_text,
                'color': color
            })

            current_pos = match.end()

        # 마지막 남은 텍스트
        if current_pos < len(text):
            segments.append({
                'text': text[current_pos:],
                'color': None
            })

        return segments if segments else [{'text': text, 'color': None}]

    def _create_paragraph_with_markers(self, text, default_size, header_root, temp_dir, font_name="Hamchorong Batang", level=1):
        """마커 기반 다중 색상 paragraph 생성 - 글자색 사용"""
        # 마커 파싱
        segments = self._parse_color_markers(text)

        # 레벨에 맞는 ParaPr ID 결정 (동적 할당)
        parapr_id = self.level_parapr_ids.get(level, "0")

        # Paragraph 생성 (레벨별 ParaPr 사용)
        para = etree.Element(
            f"{{{self.ns['hp']}}}p",
            id=str(abs(hash(text)) % 1000000000),
            paraPrIDRef=parapr_id,
            styleIDRef="0",
            pageBreak="0",
            columnBreak="0",
            merged="0"
        )

        # 빈 run (항상 필요)
        run1 = etree.SubElement(para, f"{{{self.ns['hp']}}}run")
        run1.set("charPrIDRef", "0")
        t1 = etree.SubElement(run1, f"{{{self.ns['hp']}}}t")
        t1.text = ""

        # 각 segment마다 run 생성
        for segment in segments:
            segment_text = segment['text']
            segment_color = segment['color']

            # 글자색 결정
            if segment_color == 'red':
                text_color = "#DC2626"  # 빨간색 글자
            elif segment_color == 'green':
                text_color = "#16A34A"  # 녹색 글자
            else:
                text_color = "#000000"  # 기본 검정

            # CharPr ID 가져오기 또는 생성 (폰트 전달)
            charpr_id = self._get_or_create_charpr_id(header_root, temp_dir, default_size, text_color, "none", font_name)

            # Run 추가
            run = etree.SubElement(para, f"{{{self.ns['hp']}}}run")
            run.set("charPrIDRef", str(charpr_id))
            t = etree.SubElement(run, f"{{{self.ns['hp']}}}t")
            t.text = segment_text

        return para

    def _create_paragraph(self, text, charpr_id):
        """Paragraph XML 요소 생성 - prefix 분리 지원"""
        para = etree.Element(
            f"{{{self.ns['hp']}}}p",
            id=str(abs(hash(text)) % 1000000000),  # 간단한 ID 생성
            paraPrIDRef="0",
            styleIDRef="0",
            pageBreak="0",
            columnBreak="0",
            merged="0"
        )

        # Run 추가 (빈 run)
        run1 = etree.SubElement(para, f"{{{self.ns['hp']}}}run")
        run1.set("charPrIDRef", "0")
        t1 = etree.SubElement(run1, f"{{{self.ns['hp']}}}t")
        t1.text = ""

        # Run 추가 (실제 텍스트)
        run2 = etree.SubElement(para, f"{{{self.ns['hp']}}}run")
        run2.set("charPrIDRef", str(charpr_id))
        t2 = etree.SubElement(run2, f"{{{self.ns['hp']}}}t")
        t2.text = text

        return para

    def _create_paragraph_with_prefix(self, text, charpr_id, prefix_charpr_id):
        """prefix와 본문을 분리하여 paragraph 생성"""
        para = etree.Element(
            f"{{{self.ns['hp']}}}p",
            id=str(abs(hash(text)) % 1000000000),
            paraPrIDRef="0",
            styleIDRef="0",
            pageBreak="0",
            columnBreak="0",
            merged="0"
        )

        # Run 추가 (빈 run)
        run1 = etree.SubElement(para, f"{{{self.ns['hp']}}}run")
        run1.set("charPrIDRef", "0")
        t1 = etree.SubElement(run1, f"{{{self.ns['hp']}}}t")
        t1.text = ""

        # prefix와 본문 분리
        prefix, rest = self._split_prefix(text)

        if prefix:
            # prefix run (색상 적용)
            prefix_run = etree.SubElement(para, f"{{{self.ns['hp']}}}run")
            prefix_run.set("charPrIDRef", str(prefix_charpr_id))
            prefix_t = etree.SubElement(prefix_run, f"{{{self.ns['hp']}}}t")
            prefix_t.text = prefix

            # 본문 run (검정색)
            rest_run = etree.SubElement(para, f"{{{self.ns['hp']}}}run")
            rest_run.set("charPrIDRef", "0")  # 기본 CharPr (검정색)
            rest_t = etree.SubElement(rest_run, f"{{{self.ns['hp']}}}t")
            rest_t.text = rest
        else:
            # prefix 없으면 전체에 색상 적용
            run2 = etree.SubElement(para, f"{{{self.ns['hp']}}}run")
            run2.set("charPrIDRef", str(charpr_id))
            t2 = etree.SubElement(run2, f"{{{self.ns['hp']}}}t")
            t2.text = text

        return para

    def _create_table_paragraph(self, header_root, temp_dir, table_data):
        """표를 담는 paragraph 생성 (네이티브 한글 구조 정확 재현)

        네이티브 한글 구조:
        <hp:p id="0" paraPrIDRef="0" styleIDRef="0" ...>
          <hp:run charPrIDRef="0">
            <hp:tbl ...>...</hp:tbl>
            <hp:t/>
          </hp:run>
          <hp:linesegarray>
            <hp:lineseg textpos="0" vertpos="..." vertsize="1000" textheight="1000"
                        baseline="850" spacing="600" horzpos="0" horzsize="0" flags="393216"/>
          </hp:linesegarray>
        </hp:p>
        """
        # paragraph
        table_para = etree.Element(
            f"{{{self.ns['hp']}}}p",
            id="0",
            paraPrIDRef="0",
            styleIDRef="0",
            pageBreak="0",
            columnBreak="0",
            merged="0"
        )

        # run (charPrIDRef="0" 필수)
        table_run = etree.SubElement(table_para, f"{{{self.ns['hp']}}}run")
        table_run.set("charPrIDRef", "0")

        # 표 생성하여 run에 추가
        table = self._create_table(header_root, temp_dir, table_data)
        table_run.append(table)

        # 빈 <hp:t/> 추가 (tbl 뒤에 - 네이티브 필수 구조)
        etree.SubElement(table_run, f"{{{self.ns['hp']}}}t")

        # linesegarray (표 paragraph용: horzsize=0)
        row_count = len(table_data.get("rows", [])) + 1
        table_height = 1765 * row_count  # 행 높이 * 행 수
        linesegarray = etree.SubElement(table_para, f"{{{self.ns['hp']}}}linesegarray")
        lineseg = etree.SubElement(linesegarray, f"{{{self.ns['hp']}}}lineseg")
        lineseg.set("textpos", "0")
        lineseg.set("vertpos", str(table_height))
        lineseg.set("vertsize", "1000")
        lineseg.set("textheight", "1000")
        lineseg.set("baseline", "850")
        lineseg.set("spacing", "600")
        lineseg.set("horzpos", "0")
        lineseg.set("horzsize", "0")
        lineseg.set("flags", "393216")

        return table_para

    def _create_table(self, header_root, temp_dir, table_data):
        """표 XML 요소 생성"""
        import random

        headers = table_data.get("headers", [])
        rows = table_data.get("rows", [])

        col_count = len(headers)
        row_count = len(rows) + 1  # 헤더 포함

        # 표 요소 생성
        table = etree.Element(
            f"{{{self.ns['hp']}}}tbl",
            id=str(random.randint(1000000000, 2000000000)),
            zOrder="0",
            numberingType="TABLE",
            textWrap="TOP_AND_BOTTOM",
            textFlow="BOTH_SIDES",
            lock="0",
            dropcapstyle="None",
            pageBreak="CELL",
            repeatHeader="1",
            rowCnt=str(row_count),
            colCnt=str(col_count),
            cellSpacing="0",
            borderFillIDRef=self.table_borderfill_id,
            noAdjust="0"
        )

        # 크기 설정
        sz = etree.SubElement(table, f"{{{self.ns['hp']}}}sz")
        sz.set("width", "41950")  # A4 너비
        sz.set("widthRelTo", "ABSOLUTE")
        sz.set("height", str(1500 * row_count))  # 행 높이 * 행 수
        sz.set("heightRelTo", "ABSOLUTE")
        sz.set("protect", "0")

        # 위치 설정
        pos = etree.SubElement(table, f"{{{self.ns['hp']}}}pos")
        pos.set("treatAsChar", "1")  # 글자처럼 취급
        pos.set("affectLSpacing", "0")
        pos.set("flowWithText", "1")
        pos.set("allowOverlap", "0")
        pos.set("holdAnchorAndSO", "0")
        pos.set("vertRelTo", "PARA")
        pos.set("horzRelTo", "COLUMN")
        pos.set("vertAlign", "TOP")
        pos.set("horzAlign", "LEFT")
        pos.set("vertOffset", "0")
        pos.set("horzOffset", "0")

        # 외부 여백
        outMargin = etree.SubElement(table, f"{{{self.ns['hp']}}}outMargin")
        outMargin.set("left", "283")
        outMargin.set("right", "283")
        outMargin.set("top", "283")
        outMargin.set("bottom", "283")

        # 내부 여백
        inMargin = etree.SubElement(table, f"{{{self.ns['hp']}}}inMargin")
        inMargin.set("left", "510")
        inMargin.set("right", "510")
        inMargin.set("top", "141")
        inMargin.set("bottom", "141")

        # 표 스타일 (proposal-styles.json에서 로드)
        table_style = self.style_config.get("table", {})
        table_font_size = table_style.get("size", 11)
        table_font_name = table_style.get("font", "KoPubWorld돋움체 Medium")
        height = self._pt_to_hwp_height(table_font_size)

        # 헤더 행 생성
        header_row = etree.SubElement(table, f"{{{self.ns['hp']}}}tr")
        for col_idx, header in enumerate(headers):
            header_text = header.get("text", "") if isinstance(header, dict) else header
            cell = self._create_table_cell(header_text, height, header_root, temp_dir, col_idx, 0, table_font_name, col_count)
            header_row.append(cell)

        # 데이터 행 생성
        for row_idx, row in enumerate(rows):
            data_row = etree.SubElement(table, f"{{{self.ns['hp']}}}tr")
            for col_idx, cell_data in enumerate(row):
                cell_text = cell_data.get("text", "") if isinstance(cell_data, dict) else cell_data
                cell = self._create_table_cell(cell_text, height, header_root, temp_dir, col_idx, row_idx + 1, table_font_name, col_count)
                data_row.append(cell)

        return table

    def _create_table_cell(self, text, default_size, header_root, temp_dir, col_idx, row_idx, font_name="Hamchorong Batang", col_count=1):
        """표 셀 XML 요소 생성 - 마커 기반 색상 지원"""
        cell = etree.Element(
            f"{{{self.ns['hp']}}}tc",
            name="",
            header="0",
            hasMargin="0",
            protect="0",
            editable="0",
            dirty="0",
            borderFillIDRef=self.cell_borderfill_id
        )

        # subList 추가 (필수!)
        subList = etree.SubElement(cell, f"{{{self.ns['hp']}}}subList")
        subList.set("id", "")
        subList.set("textDirection", "HORIZONTAL")
        subList.set("lineWrap", "BREAK")
        subList.set("vertAlign", "CENTER")
        subList.set("linkListIDRef", "0")
        subList.set("linkListNextIDRef", "0")
        subList.set("textWidth", "0")
        subList.set("textHeight", "0")
        subList.set("hasTextRef", "0")
        subList.set("hasNumRef", "0")

        # subList 안에 Paragraph 추가 (네이티브 한글 구조: 빈 초기 run 없이)
        para = etree.SubElement(subList, f"{{{self.ns['hp']}}}p")
        para.set("id", "0")
        para.set("paraPrIDRef", "0")  # 기본 paraPr (표 셀용 - 여백 없음)
        para.set("styleIDRef", "0")
        para.set("pageBreak", "0")
        para.set("columnBreak", "0")
        para.set("merged", "0")

        # 마커 파싱하여 각 세그먼트별 run 생성 (빈 초기 run 없음 - 네이티브 호환)
        segments = self._parse_color_markers(text)
        for segment in segments:
            segment_text = segment['text']
            segment_color = segment['color']

            if segment_color == 'red':
                text_color = "#DC2626"
            elif segment_color == 'green':
                text_color = "#16A34A"
            else:
                text_color = "#000000"

            charpr_id = self._get_or_create_charpr_id(header_root, temp_dir, default_size, text_color, "none", font_name)

            run = etree.SubElement(para, f"{{{self.ns['hp']}}}run")
            run.set("charPrIDRef", str(charpr_id))
            t = etree.SubElement(run, f"{{{self.ns['hp']}}}t")
            t.text = segment_text

        # linesegarray 추가 (한글 렌더링에 필수)
        cell_width = 41950 // max(col_count, 1)
        cell_inner_width = cell_width - 1020  # 좌우 cellMargin(510*2) 제외
        linesegarray = etree.SubElement(para, f"{{{self.ns['hp']}}}linesegarray")
        lineseg = etree.SubElement(linesegarray, f"{{{self.ns['hp']}}}lineseg")
        lineseg.set("textpos", "0")
        lineseg.set("vertpos", "0")
        lineseg.set("vertsize", "1200")
        lineseg.set("textheight", "1200")
        lineseg.set("baseline", "1020")
        lineseg.set("spacing", "720")
        lineseg.set("horzpos", "0")
        lineseg.set("horzsize", str(cell_inner_width))
        lineseg.set("flags", "393216")

        # cellAddr 추가 (col, row 인덱스)
        cellAddr = etree.SubElement(cell, f"{{{self.ns['hp']}}}cellAddr")
        cellAddr.set("colAddr", str(col_idx))
        cellAddr.set("rowAddr", str(row_idx))

        # cellSpan 추가
        cellSpan = etree.SubElement(cell, f"{{{self.ns['hp']}}}cellSpan")
        cellSpan.set("colSpan", "1")
        cellSpan.set("rowSpan", "1")

        # cellSz 추가 (열 수에 맞게 균등 분배: 41950 / col_count)
        cell_width = 41950 // max(col_count, 1)
        cellSz = etree.SubElement(cell, f"{{{self.ns['hp']}}}cellSz")
        cellSz.set("width", str(cell_width))
        cellSz.set("height", "1765")

        # cellMargin 추가
        cellMargin = etree.SubElement(cell, f"{{{self.ns['hp']}}}cellMargin")
        cellMargin.set("left", "510")
        cellMargin.set("right", "510")
        cellMargin.set("top", "141")
        cellMargin.set("bottom", "141")

        return cell


if __name__ == "__main__":
    # 테스트
    gen = HWPXGenerator(os.getcwd())
    test_data = {
        "metadata": {"title": "테스트 문서"},
        "content": [
            {
                "type": "section",
                "title": "섹션 1",
                "items": [
                    {"level": 1, "text": "레벨 1 텍스트", "color": "black"},
                    {"level": 2, "text": "레벨 2 빨간색 텍스트", "color": "red"},
                    {"level": 3, "text": "레벨 3 녹색 텍스트", "color": "green"},
                ]
            }
        ]
    }
    gen.generate(test_data, "test_hwpx_output.hwpx")

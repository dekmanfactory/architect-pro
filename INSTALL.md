# ARCHITECT PRO - 설치 및 실행 가이드

## 사전 요구사항

| 항목 | 버전 | 다운로드 |
|------|------|----------|
| Node.js | 18 이상 | https://nodejs.org/ |
| Python | 3.10 ~ 3.12 | https://www.python.org/downloads/ |

> Python 설치 시 반드시 **"Add Python to PATH"** 체크!

---

## 1단계: 설치

`install.bat`을 더블클릭하면 자동으로 설치됩니다.

수동 설치 시:
```
npm install
pip install lxml python-hwpx
```

---

## 2단계: API 키 설정

`.env.local` 파일을 열어 API 키를 입력합니다.

```
# Gemini (최소 1개 필수)
NEXT_PUBLIC_GEMINI_3_0_FLASH_KEY=여기에_키_입력
NEXT_PUBLIC_GEMINI_3_0_PRO_KEY=여기에_키_입력
NEXT_PUBLIC_GEMINI_2_5_PRO_KEY=여기에_키_입력
NEXT_PUBLIC_GEMINI_2_5_FLASH_KEY=여기에_키_입력

# Claude (선택)
NEXT_PUBLIC_CLAUDE_4_6_OPUS_KEY=여기에_키_입력
NEXT_PUBLIC_CLAUDE_4_5_SONNET_KEY=여기에_키_입력
NEXT_PUBLIC_CLAUDE_4_5_HAIKU_KEY=여기에_키_입력
```

API 키 발급:
- Gemini: https://aistudio.google.com/apikey
- Claude: https://console.anthropic.com/

---

## 3단계: 실행

`start.bat`을 더블클릭하면 서버가 시작됩니다.

브라우저에서 http://localhost:3000 접속

수동 실행 시:
```
npm run dev
```

---

## 폴더 구조

```
project/
├── install.bat                  ← 설치 (더블클릭)
├── start.bat                    ← 실행 (더블클릭)
├── .env.local                   ← API 키 설정 (직접 수정)
├── proposal-styles.json         ← 문서 스타일 설정
├── sample-from-hangul.hwpx      ← HWPX 템플릿 (삭제 금지!)
├── requirements.txt             ← Python 패키지 목록
├── package.json                 ← Node.js 패키지 목록
├── assets/fonts/                ← 폰트 파일
├── skills/                      ← HWPX 생성 엔진
├── app/                         ← 웹 앱 소스
└── components/                  ← UI 컴포넌트
```

---

## 사용법

1. 브라우저에서 http://localhost:3000 접속
2. 좌측에서 뼈대(BACKBONE) PDF 업로드 또는 직접 구성
3. 각 섹션별로 AI 작성 실행
4. 미리보기 확인 후 HWPX 다운로드
5. 한글 오피스에서 열기

---

## 문제 해결

| 증상 | 해결 |
|------|------|
| `npm: command not found` | Node.js 설치 필요 |
| `python: command not found` | Python 설치 필요 (PATH 확인) |
| `lxml` 모듈 에러 | `pip install lxml` 실행 |
| HWPX 다운로드 실패 | `pip install lxml python-hwpx` 실행 |
| 포트 3000 사용 중 | 기존 서버 종료 후 재실행 |
| API 키 에러 | `.env.local` 파일에 키 입력 확인 |
| 한글에서 파일 손상 | `sample-from-hangul.hwpx` 존재 확인 |

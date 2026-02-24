@echo off
chcp 65001 >nul 2>&1
title ARCHITECT PRO - 설치

echo ============================================================
echo   ARCHITECT PRO 설치
echo ============================================================
echo.

:: Node.js 확인
where node >nul 2>&1
if errorlevel 1 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo        https://nodejs.org/ 에서 설치 후 다시 실행하세요.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do echo [확인] Node.js %%i

:: Python 확인
where python >nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo        https://www.python.org/downloads/ 에서 설치 후 다시 실행하세요.
    echo        설치 시 "Add Python to PATH" 반드시 체크!
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do echo [확인] %%i

echo.
echo [1/2] Node.js 패키지 설치 중...
echo.
call npm install
if errorlevel 1 (
    echo [오류] npm install 실패
    pause
    exit /b 1
)

echo.
echo [2/2] Python 패키지 설치 중...
echo.
pip install lxml python-hwpx
if errorlevel 1 (
    echo [경고] pip install 실패 - 다른 Python 경로로 재시도...
    python -m pip install lxml python-hwpx
)

echo.
echo ============================================================
echo   설치 완료!
echo ============================================================
echo.
echo   다음 단계:
echo   1. .env.local 파일에 API 키를 입력하세요
echo   2. start.bat 을 더블클릭하여 서버를 시작하세요
echo   3. 브라우저에서 http://localhost:3000 접속
echo.
echo   자세한 내용은 INSTALL.md 를 참고하세요.
echo ============================================================
echo.
pause

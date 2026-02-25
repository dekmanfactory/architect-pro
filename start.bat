@echo off
chcp 65001 >nul 2>&1
title ARCHITECT PRO - 서버 실행

echo ============================================================
echo   ARCHITECT PRO 서버 시작
echo ============================================================
echo.

:: node_modules 확인
if not exist "node_modules" (
    echo [오류] 패키지가 설치되지 않았습니다.
    echo        install.bat 을 먼저 실행하세요.
    echo.
    pause
    exit /b 1
)

:: venv 확인
if not exist "venv" (
    echo [오류] Python 가상환경이 없습니다.
    echo        install.bat 을 먼저 실행하세요.
    echo.
    pause
    exit /b 1
)

:: venv 활성화
call venv\Scripts\activate

echo   서버를 시작합니다...
echo   브라우저에서 http://localhost:3000 접속하세요.
echo   종료하려면 이 창에서 Ctrl+C 를 누르세요.
echo.
echo ============================================================
echo.

npm run dev

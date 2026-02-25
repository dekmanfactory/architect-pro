@echo off
chcp 65001 >nul 2>&1
title ARCHITECT PRO - 서버 실행

echo ============================================================
echo   ARCHITECT PRO 서버 시작
echo ============================================================
echo.

:: node_modules 및 venv 확인
if not exist "node_modules" (
    echo [알림] 첫 실행입니다. 설치를 먼저 진행합니다...
    echo.
    call install.bat
    if errorlevel 1 (
        echo [오류] 설치에 실패했습니다.
        pause
        exit /b 1
    )
    echo.
    echo ============================================================
    echo   설치 완료! 서버를 시작합니다...
    echo ============================================================
    echo.
)

:: venv 활성화
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate
)

echo   브라우저에서 http://localhost:3000 접속하세요.
echo   종료하려면 이 창에서 Ctrl+C 를 누르세요.
echo.
echo ============================================================
echo.

npm run dev

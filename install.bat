@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title ARCHITECT PRO - 설치

echo ============================================================
echo   ARCHITECT PRO 설치
echo ============================================================
echo.

:: ──────────────────────────────────────
:: 1. Node.js 확인 및 자동 설치
:: ──────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [설치] Node.js가 없습니다. 자동 설치를 시작합니다...
    echo        Node.js v20 LTS 다운로드 중... 잠시 기다려주세요...
    echo.

    set NODEINSTALLER=%TEMP%\node-v20.18.3-x64.msi
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.3/node-v20.18.3-x64.msi' -OutFile '!NODEINSTALLER!'"

    if not exist "!NODEINSTALLER!" (
        echo [오류] Node.js 다운로드 실패
        echo        직접 설치하세요: https://nodejs.org/
        pause
        exit /b 1
    )

    echo [설치] Node.js v20 설치 중... (자동 설치)
    echo        설치 완료까지 1~2분 소요됩니다...
    echo.
    msiexec /i "!NODEINSTALLER!" /quiet /norestart

    if errorlevel 1 (
        echo [오류] Node.js 자동 설치 실패
        echo        직접 설치하세요: https://nodejs.org/
        pause
        exit /b 1
    )

    del "!NODEINSTALLER!" >nul 2>&1

    echo [확인] Node.js v20 설치 완료!
    echo.
    echo [중요] PATH 적용을 위해 이 창을 닫고 install.bat을 다시 실행하세요!
    echo.
    pause
    exit /b 0
)
for /f "tokens=*" %%i in ('node --version') do echo [확인] Node.js %%i

:: ──────────────────────────────────────
:: 2. Python 확인 및 자동 설치
:: ──────────────────────────────────────
set PYTHON_OK=0
where python >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PYVER=%%v
    for /f "tokens=1,2 delims=." %%a in ("!PYVER!") do (
        set PYMAJOR=%%a
        set PYMINOR=%%b
    )
    if !PYMAJOR! EQU 3 if !PYMINOR! GEQ 10 if !PYMINOR! LEQ 12 (
        set PYTHON_OK=1
        echo [확인] Python !PYVER! - 호환 버전
    )
    if !PYTHON_OK! EQU 0 (
        echo [경고] Python !PYVER! - 호환되지 않는 버전입니다.
        echo        Python 3.11을 설치합니다...
    )
)

if !PYTHON_OK! EQU 0 (
    echo.
    echo [설치] Python 3.11.9 다운로드 중... 잠시 기다려주세요...
    echo.

    set PYINSTALLER=%TEMP%\python-3.11.9-amd64.exe
    powershell -Command "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe' -OutFile '!PYINSTALLER!'"

    if not exist "!PYINSTALLER!" (
        echo [오류] Python 다운로드 실패
        echo        직접 설치하세요: https://www.python.org/downloads/release/python-3119/
        pause
        exit /b 1
    )

    echo [설치] Python 3.11.9 설치 중... (자동 설치)
    echo        설치 완료까지 1~2분 소요됩니다...
    echo.
    "!PYINSTALLER!" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0 Include_launcher=1

    if errorlevel 1 (
        echo [오류] Python 자동 설치 실패
        echo        직접 설치하세요: https://www.python.org/downloads/release/python-3119/
        pause
        exit /b 1
    )

    del "!PYINSTALLER!" >nul 2>&1

    echo [확인] Python 3.11.9 설치 완료!
    echo.
    echo [중요] PATH 적용을 위해 이 창을 닫고 install.bat을 다시 실행하세요!
    echo.
    pause
    exit /b 0
)

:: ──────────────────────────────────────
:: 3. Node.js 패키지 설치
:: ──────────────────────────────────────
echo.
echo [1/3] Node.js 패키지 설치 중...
echo.
call npm install
if errorlevel 1 (
    echo [오류] npm install 실패
    pause
    exit /b 1
)

:: ──────────────────────────────────────
:: 4. Python 가상환경 생성
:: ──────────────────────────────────────
echo.
echo [2/3] Python 가상환경(venv) 생성 중...
echo.
if not exist "venv" (
    python -m venv venv
    if errorlevel 1 (
        echo [오류] 가상환경 생성 실패
        pause
        exit /b 1
    )
    echo [확인] venv 가상환경 생성 완료
) else (
    echo [확인] venv 가상환경이 이미 존재합니다
)

:: ──────────────────────────────────────
:: 5. Python 패키지 설치
:: ──────────────────────────────────────
echo.
echo [3/3] Python 패키지 설치 중 (venv)...
echo.
call venv\Scripts\pip install lxml python-hwpx
if errorlevel 1 (
    echo [오류] pip install 실패
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   설치 완료!
echo ============================================================
echo.
echo   start.bat 을 더블클릭하면 서버가 시작됩니다.
echo   브라우저에서 http://localhost:3000 접속하세요.
echo.
echo ============================================================
echo.
pause

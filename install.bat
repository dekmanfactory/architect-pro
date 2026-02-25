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

:: Python 버전 체크 (3.10~3.12 권장)
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PYVER=%%v
for /f "tokens=1,2 delims=." %%a in ("%PYVER%") do (
    set PYMAJOR=%%a
    set PYMINOR=%%b
)
if %PYMINOR% GTR 12 (
    echo.
    echo [경고] Python %PYVER% 은 너무 최신 버전입니다.
    echo        일부 패키지(lxml)가 호환되지 않을 수 있습니다.
    echo        Python 3.12를 권장합니다: https://www.python.org/downloads/release/python-3129/
    echo.
    set /p "CONTINUE=계속 진행하시겠습니까? (Y/N): "
    if /i not "!CONTINUE!"=="Y" (
        pause
        exit /b 1
    )
)

echo.
echo [1/3] Node.js 패키지 설치 중...
echo.
call npm install
if errorlevel 1 (
    echo [오류] npm install 실패
    pause
    exit /b 1
)

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

echo.
echo [3/3] Python 패키지 설치 중 (venv)...
echo.
call venv\Scripts\pip install --only-binary=:all: lxml python-hwpx
if errorlevel 1 (
    echo.
    echo [재시도] 바이너리 wheel 설치 실패, 호환 버전으로 재시도...
    call venv\Scripts\pip install "lxml>=5.0,<7.0" python-hwpx
    if errorlevel 1 (
        echo.
        echo [오류] pip install 실패
        echo        Python 3.12 설치를 권장합니다.
        echo        https://www.python.org/downloads/release/python-3129/
        pause
        exit /b 1
    )
)

echo.
echo ============================================================
echo   설치 완료!
echo ============================================================
echo.
echo   다음 단계:
echo   1. start.bat 을 더블클릭하여 서버를 시작하세요
echo   2. 브라우저에서 http://localhost:3000 접속
echo.
echo   자세한 내용은 INSTALL.md 를 참고하세요.
echo ============================================================
echo.
pause

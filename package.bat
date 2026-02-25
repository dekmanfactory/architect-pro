@echo off
chcp 65001 >nul 2>&1
title ARCHITECT PRO - 배포 패키지 생성

echo ============================================================
echo   ARCHITECT PRO 배포 패키지 생성
echo ============================================================
echo.

set ZIPNAME=ArchitectPRO_배포용.zip
set TEMPDIR=_package_temp

:: 기존 임시 폴더/zip 정리
if exist "%TEMPDIR%" rmdir /s /q "%TEMPDIR%"
if exist "%ZIPNAME%" del "%ZIPNAME%"

:: 임시 폴더 생성
mkdir "%TEMPDIR%\ArchitectPRO"

echo [1/3] 파일 복사 중...

:: 핵심 파일 복사
xcopy /E /I /Q "app" "%TEMPDIR%\ArchitectPRO\app" /EXCLUDE:_package_exclude.txt
xcopy /E /I /Q "api" "%TEMPDIR%\ArchitectPRO\api"
xcopy /E /I /Q "assets" "%TEMPDIR%\ArchitectPRO\assets"
xcopy /E /I /Q "components" "%TEMPDIR%\ArchitectPRO\components"
xcopy /E /I /Q "skills" "%TEMPDIR%\ArchitectPRO\skills"
xcopy /E /I /Q "types" "%TEMPDIR%\ArchitectPRO\types"

:: 개별 파일 복사
copy /Y "package.json" "%TEMPDIR%\ArchitectPRO\" >nul
copy /Y "package-lock.json" "%TEMPDIR%\ArchitectPRO\" >nul
copy /Y "next.config.ts" "%TEMPDIR%\ArchitectPRO\" >nul
copy /Y "tsconfig.json" "%TEMPDIR%\ArchitectPRO\" >nul
copy /Y "postcss.config.mjs" "%TEMPDIR%\ArchitectPRO\" >nul
copy /Y "requirements.txt" "%TEMPDIR%\ArchitectPRO\" >nul
copy /Y "proposal-styles.json" "%TEMPDIR%\ArchitectPRO\" >nul
copy /Y "sample-from-hangul.hwpx" "%TEMPDIR%\ArchitectPRO\" >nul
copy /Y "install.bat" "%TEMPDIR%\ArchitectPRO\" >nul
copy /Y "start.bat" "%TEMPDIR%\ArchitectPRO\" >nul
copy /Y "INSTALL.md" "%TEMPDIR%\ArchitectPRO\" >nul
if exist "tailwind.config.ts" copy /Y "tailwind.config.ts" "%TEMPDIR%\ArchitectPRO\" >nul

echo [2/3] ZIP 파일 생성 중...

:: PowerShell로 ZIP 생성
powershell -Command "Compress-Archive -Path '%TEMPDIR%\ArchitectPRO' -DestinationPath '%ZIPNAME%' -Force"

if errorlevel 1 (
    echo [오류] ZIP 생성 실패
    pause
    exit /b 1
)

echo [3/3] 정리 중...
rmdir /s /q "%TEMPDIR%"

echo.
echo ============================================================
echo   완료! %ZIPNAME% 파일이 생성되었습니다.
echo ============================================================
echo.
echo   이 파일을 사내 배포하세요.
echo.
echo   [사용자 안내 - 아래 내용을 함께 전달하세요]
echo   ──────────────────────────────────────
echo   1. ZIP 압축 해제
echo   2. start.bat 더블클릭
echo      (Node.js, Python 자동 설치됩니다)
echo   3. 브라우저에서 http://localhost:3000 접속
echo   ──────────────────────────────────────
echo.
pause

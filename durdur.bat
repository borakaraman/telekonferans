@echo off
REM ============================================================
REM  Telekonferans - tek tikla durdur
REM  Tunel ve sunucu (port 3000) sureclerini kapatir.
REM ============================================================
echo Tunel kapatiliyor...
taskkill /f /im cloudflared.exe >nul 2>&1

echo Sunucu (port 3000) kapatiliyor...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

echo.
echo Bitti. Acik kalan "Sunucu"/"Tunel" pencerelerini de kapatabilirsiniz.
echo.
pause

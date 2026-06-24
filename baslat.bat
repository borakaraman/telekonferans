@echo off
REM ============================================================
REM  Telekonferans - tek tikla baslat
REM  1) Next.js sunucusu (npm run dev)  -> http://localhost:3000
REM  2) Cloudflare tunel                -> https://....trycloudflare.com
REM  Not: bu .bat dosyasinin bulundugu klasor proje klasoru kabul edilir.
REM ============================================================
set "PROJ=%~dp0"

echo Sunucu baslatiliyor...
start "Telekonferans - Sunucu" cmd /k "cd /d %PROJ% && npm run dev"

echo Sunucunun hazir olmasi icin bekleniyor (8 sn)...
timeout /t 8 /nobreak >nul

echo Tunel baslatiliyor...
REM --protocol http2: bu agda UDP/QUIC engelli oldugundan TCP/HTTP2 kullaniyoruz
start "Telekonferans - Tunel" cmd /k "cloudflared tunnel --protocol http2 --url http://localhost:3000"

echo.
echo ============================================================
echo  Iki pencere acildi: "Sunucu" ve "Tunel".
echo  TUNEL penceresinde su satiri bul:
echo      https://....trycloudflare.com
echo  Bu adresi telefonda ve PC'de ac. (Her baslatista adres DEGISIR.)
echo.
echo  Durdurmak icin: durdur.bat  (veya iki pencereyi kapat)
echo ============================================================
echo.
pause

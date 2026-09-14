@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Vui long cai Node.js 24 LTS tu https://nodejs.org truoc.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<24){console.error('Can Node.js 24 hoac moi hon.');process.exit(1)}"
if errorlevel 1 (
  pause
  exit /b 1
)
echo Dang khoi dong CanteenGo. Dia chi chinh xac se hien o dong ben duoi.
echo Neu cong 3000 dang ban, chuong trinh se tu chon cong ke tiep.
echo Nhan Ctrl+C de dung may chu.
node src/server.js
pause

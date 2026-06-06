@echo off
cd /d "%~dp0"

where pm2 >nul 2>nul
if errorlevel 1 (
  echo 未找到 pm2，请先执行：npm install -g pm2
  exit /b 1
)

pm2 startOrRestart ecosystem.config.cjs --update-env

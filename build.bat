@echo off
rem Rebuilds code-graph.html and the Electron packages in dist\ (CodeGraph-Portable.exe and CodeGraph-Setup.exe). Needs Node.js.
cd /d "%~dp0"
if not exist node_modules call npm install || goto :err
call npm run dist || goto :err
echo.
echo Done: code-graph.html, dist\CodeGraph-Portable.exe and dist\CodeGraph-Setup.exe are up to date.
exit /b 0
:err
echo Build failed.
exit /b 1

@echo off
rem Rebuilds code-graph.html and CodeGraph.exe (needs Node.js; the C# compiler ships with Windows)
cd /d "%~dp0"
node build.js || goto :err
"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /optimize+ /win32icon:launcher\icon.ico /out:CodeGraph.exe /resource:code-graph.html,code-graph.html /r:System.Windows.Forms.dll launcher\launcher.cs || goto :err
echo.
echo Done: code-graph.html and CodeGraph.exe are up to date.
exit /b 0
:err
echo Build failed.
exit /b 1

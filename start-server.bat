@echo off
rem 使用 UTF-8 代碼頁，避免中文 echo 變成亂碼（Win10+）
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto :use_python

where npm >nul 2>nul
if errorlevel 1 (
  echo 找不到 npm，請先安裝 Node.js（含 npm）。
  pause
  exit /b 1
)

rem 預設開區網；只要本機請：start-server.bat --localhost
rem 參數原樣傳給 Node（勿在括號區塊內用 %%errorlevel%% 判斷，會被預先展開）
echo.
echo [提示] 預設為區網模式，手機可連；同一 Wi-Fi 可讀取 API（含 Maps 金鑰）。
echo        展場／不需手機測試請改：start-server.bat --localhost
echo.
node scripts\dev-stack.cjs %*
goto :eof

:use_python
echo 未偵測到 Node，改用 Python（僅能讀取靜態檔，無法啟用 Vite / 管理登入 / 節點寫入）
python -m http.server 8080 --bind 0.0.0.0

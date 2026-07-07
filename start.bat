@echo off
chcp 65001 >nul
title 错题助手 - fenbi-helper
cd /d "%~dp0"

echo ════════════════════════════════════════
echo   错题助手 启动中...
echo ════════════════════════════════════════
echo.

:: 检查 node 是否安装
where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org/
    pause
    exit /b 1
)

:: 检查 node_modules 是否存在
if not exist "node_modules" (
    echo [初始化] 首次运行，安装依赖中...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查 package.json
        pause
        exit /b 1
    )
    echo.
)

:: 启动服务
echo [启动] 服务监听 http://localhost:3000
echo [启动] 局域网设备请连接同一 WiFi 后访问本机 IP:3000
echo [启动] 按 Ctrl+C 可停止服务
echo.
node src/app.js

:: 异常退出时暂停
echo.
echo [停止] 服务已停止
pause

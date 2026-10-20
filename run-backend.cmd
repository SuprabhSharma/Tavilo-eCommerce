@echo off
setlocal
cd /d "%~dp0backend"

rem Use the backend project environment explicitly. This avoids uv treating an
rem unrelated activated workspace environment as the project environment.
set "VIRTUAL_ENV="
set "PYTHONUNBUFFERED=1"

echo Starting backend with uv...
uv run --project "%~dp0backend" --python "%~dp0backend\.venv\Scripts\python.exe" -m uvicorn src:app --host 127.0.0.1 --port 8000 --reload --log-level info --access-log

if errorlevel 1 (
    echo.
    echo Backend stopped with an error.
    pause
)

endlocal

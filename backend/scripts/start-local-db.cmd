@echo off
REM ============================================================
REM  Start the portable Local PostgreSQL cluster inside project
REM  (After running setup-local-db.cmd once, use this each time)
REM ============================================================
setlocal

set "PG_BIN=C:\Program Files\PostgreSQL\16\bin"
set "PROJ_ROOT=%~dp0.."
for %%I in ("%PROJ_ROOT%") do set "PROJ_ROOT=%%~fI"
set "PG_ROOT=%PROJ_ROOT%\pgsql_data"
set "PG_DATA=%PG_ROOT%\data"
set "PG_LOG=%PG_ROOT%\server.log"
set "PG_PORT=5433"

REM Ensure PATH includes PG bin for DLL resolution
set "PATH=%PG_BIN%;%PATH%"

if not exist "%PG_DATA%" (
    echo ERROR: No cluster data found at %PG_DATA%
    echo Run setup-local-db.cmd first to initialize the local cluster.
    exit /b 1
)

echo Starting portable PostgreSQL on 127.0.0.1:%PG_PORT% ...
"%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" -l "%PG_LOG%" start -w
if errorlevel 1 (
    echo FAILED to start PostgreSQL.
    echo Check log: %PG_LOG%
    exit /b 1
)

timeout /t 1 /nobreak >nul
"%PG_BIN%\pg_isready.exe" -h 127.0.0.1 -p %PG_PORT% -U postgres

echo.
echo PostgreSQL is running on 127.0.0.1:%PG_PORT%
echo Stop  it with:  "%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" stop
echo Backend    run:  cd /d "%PROJ_ROOT%\backend" ^&^& npm run dev
echo.

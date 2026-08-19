@echo off
REM ============================================================
REM  Portable Local PostgreSQL Setup - LOCAL ONLY (inside project dir)
REM  Creates cluster in %~dp0..\pgsql_data on PORT 5433
REM  Run ONCE to initialize. Thereafter use start-local-db.cmd
REM ============================================================
setlocal

set "PG_BIN=C:\Program Files\PostgreSQL\16\bin"
set "PROJ_ROOT=%~dp0.."
for %%I in ("%PROJ_ROOT%") do set "PROJ_ROOT=%%~fI"
set "PG_ROOT=%PROJ_ROOT%\pgsql_data"
set "PG_DATA=%PG_ROOT%\data"
set "PG_LOG=%PG_ROOT%\server.log"
set "PG_PORT=5433"
set "PG_SUPER=postgres"
set "PG_PASS=admin"

echo.
echo === Portable PostgreSQL 16 Cluster Setup (LOCAL ONLY) ===
echo   PG_BIN:  %PG_BIN%
echo   PG_ROOT: %PG_ROOT%
echo   PG_DATA: %PG_DATA%
echo   Port:    %PG_PORT%
echo   User:    %PG_SUPER% / %PG_PASS%
echo   DB:      smsdb
echo.

if not exist "%PG_BIN%\initdb.exe" (
    echo ERROR: PostgreSQL 16 bin not found at %PG_BIN%
    exit /b 1
)

REM Ensure PATH contains PG bin for DLL resolution
set "PATH=%PG_BIN%;%PATH%"

if exist "%PG_DATA%" (
    echo DATA directory already exists at %PG_DATA%
    echo Skipping initdb. Start server with: start-local-db.cmd
    goto :STARTSERVER
)

mkdir "%PG_ROOT%" 2>nul

REM 1) initdb
echo.
echo [1/4] Initializing PostgreSQL cluster...
echo %PG_PASS% > "%PG_ROOT%\.pw"
"%PG_BIN%\initdb.exe" -D "%PG_DATA%" -U %PG_SUPER% --pwfile "%PG_ROOT%\.pw" -E UTF8 --locale=C -A scram-sha-256
set INITDB_RC=%ERRORLEVEL%
del "%PG_ROOT%\.pw"
if not exist "%PG_DATA%\PG_VERSION" (
    echo ERROR: initdb did not produce %PG_DATA%\PG_VERSION (initdb exit code %INITDB_RC%)
    goto :FAIL
)
if %INITDB_RC% NEQ 0 goto :FAIL
echo initdb OK.

REM 2) postgresql.conf
echo.
echo [2/4] Configuring postgresql.conf (port=%PG_PORT%)...
(
echo.
echo # ---- SMS project customisations ----
echo listen_addresses = 'localhost'
echo port = %PG_PORT%
echo logging_collector = on
echo log_directory = 'log'
echo log_filename = 'postgresql-%%Y-%%m-%%d_%%H%%M%%S.log'
echo shared_buffers = 128MB
echo max_connections = 100
) >> "%PG_DATA%\postgresql.conf"

REM 3) pg_hba.conf
echo.
echo [3/4] Rewriting pg_hba.conf (scram-sha-256 local auth)...
(
echo # TYPE  DATABASE        USER            ADDRESS                 METHOD
echo local   all             all                                     scram-sha-256
echo host    all             all             127.0.0.1/32            scram-sha-256
echo host    all             all             ::1/128                 scram-sha-256
) > "%PG_DATA%\pg_hba.conf"

:STARTSERVER
REM 4) Start server
echo.
echo [4/4] Starting PostgreSQL on 127.0.0.1:%PG_PORT% ...
"%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" -l "%PG_LOG%" start -w
if errorlevel 1 goto :FAIL

timeout /t 2 /nobreak >nul
"%PG_BIN%\pg_isready.exe" -h 127.0.0.1 -p %PG_PORT% -U %PG_SUPER%

REM 5) Create smsdb
echo.
echo Creating smsdb database if needed...
set "PGPASSWORD=%PG_PASS%"
for /f "delims=" %%i in ('"%PG_BIN%\psql.exe" -h 127.0.0.1 -p %PG_PORT% -U %PG_SUPER% -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='smsdb'" 2^>^&1') do set "EXISTS=%%i"
if "%EXISTS%"=="1" (
    echo Database smsdb already exists.
) else (
    "%PG_BIN%\psql.exe" -h 127.0.0.1 -p %PG_PORT% -U %PG_SUPER% -d postgres -c "CREATE DATABASE smsdb OWNER %PG_SUPER%;"
    if errorlevel 1 (
        set "PGPASSWORD="
        goto :FAIL
    )
    echo Database smsdb created.
)
set "PGPASSWORD="

echo.
echo === ALL DONE ===
echo PostgreSQL host: 127.0.0.1   port: %PG_PORT%
echo Superuser:       %PG_SUPER%   password: %PG_PASS%
echo Database:        smsdb
echo Cluster root:    %PG_ROOT%
echo.
echo Stop  it anytime with:  "%PG_BIN%\pg_ctl.exe" -D "%PG_DATA%" stop
echo Start it again  with:   scripts\start-local-db.cmd
echo Then start backend:     cd /d "%PROJ_ROOT%\backend" ^&^& npm run dev
echo.
goto :EOF

:FAIL
echo.
echo === FAILED ===
echo Check the log: %PG_LOG%
exit /b 1

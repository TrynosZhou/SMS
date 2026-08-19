@echo off
REM Start the installed PostgreSQL 16 Windows service (port 5432).
REM Run this script as Administrator if you get "Access is denied".

setlocal
set "PG_BIN=C:\Program Files\PostgreSQL\16\bin"
set "PG_PORT=5432"

echo.
echo === Start PostgreSQL for SMS backend ===
echo Expected: 127.0.0.1:%PG_PORT%  database: smsdb  user: postgres
echo.

sc query postgresql-x64-16 >nul 2>&1
if errorlevel 1 (
    echo ERROR: Windows service postgresql-x64-16 was not found.
    echo Install PostgreSQL 16 or update this script with your service name.
    exit /b 1
)

for /f "tokens=3" %%a in ('sc query postgresql-x64-16 ^| findstr /i "STATE"') do set "STATE=%%a"
if /i "%STATE%"=="RUNNING" (
    echo Service is already running.
    goto :READY
)

echo Starting postgresql-x64-16 ...
net start postgresql-x64-16
if errorlevel 1 (
    echo.
    echo FAILED to start the service.
    echo - Right-click this file and choose "Run as administrator", OR
    echo - Open services.msc and start "postgresql-x64-16" manually.
    exit /b 1
)

:READY
set "PATH=%PG_BIN%;%PATH%"
timeout /t 2 /nobreak >nul
"%PG_BIN%\pg_isready.exe" -h 127.0.0.1 -p %PG_PORT% -U postgres
if errorlevel 1 (
    echo PostgreSQL service started but pg_isready failed. Check PostgreSQL logs.
    exit /b 1
)

echo.
echo PostgreSQL is ready on 127.0.0.1:%PG_PORT%
echo Next: cd backend ^&^& npm run dev
echo.

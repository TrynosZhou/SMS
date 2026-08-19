# Start the portable user-level PostgreSQL cluster
# (After running setup-local-postgres.ps1 once, use this to start the DB.)

$ErrorActionPreference = 'Stop'

$PG_BIN  = 'C:\Program Files\PostgreSQL\16\bin'
$PG_ROOT = Join-Path $env:USERPROFILE 'pgsql'
$PG_DATA = Join-Path $PG_ROOT 'data'
$PG_LOG  = Join-Path $PG_ROOT 'server.log'
$PG_PORT = 5433

if (-not (Test-Path $PG_DATA)) {
    throw "No cluster found at $PG_DATA. Run scripts\setup-local-postgres.ps1 first."
}

Write-Host "Starting portable PostgreSQL on 127.0.0.1:$PG_PORT ..." -ForegroundColor Green
& (Join-Path $PG_BIN 'pg_ctl.exe') -D $PG_DATA -l $PG_LOG start -w
if ($LASTEXITCODE -ne 0) { throw "pg_ctl start failed (exit $LASTEXITCODE)" }

Start-Sleep -Seconds 1
& (Join-Path $PG_BIN 'pg_isready.exe') -h 127.0.0.1 -p $PG_PORT -U postgres
Write-Host ""
Write-Host "PostgreSQL is running. Stop with:  pg_ctl -D `"$PG_DATA`" stop" -ForegroundColor Green

# Portable Local PostgreSQL Setup (no admin, no Windows Service)
# Creates a brand-new PostgreSQL 16 cluster in $env:USERPROFILE\pgsql\data
# Runs on PORT 5433 to avoid conflict with the broken postgresql-x64-16 service.
# Run ONCE (or whenever you want to re-create the local cluster from scratch).

$ErrorActionPreference = 'Stop'

$PG_BIN    = 'C:\Program Files\PostgreSQL\16\bin'
$PG_ROOT   = Join-Path $env:USERPROFILE 'pgsql'
$PG_DATA   = Join-Path $PG_ROOT 'data'
$PG_LOG    = Join-Path $PG_ROOT 'server.log'
$PG_PORT   = 5433
$PG_SUPER  = 'postgres'
$PG_PASS   = 'admin'       # must match DB_PASSWORD in .env

function Invoke-PgExe([string]$exe, [string[]]$args) {
    $full = Join-Path $PG_BIN $exe
    Write-Host ">> $full $args" -ForegroundColor Cyan
    & $full @args
    if ($LASTEXITCODE -ne 0) {
        throw "$exe failed with exit code $LASTEXITCODE"
    }
}

Write-Host ""
Write-Host "=== Portable PostgreSQL 16 Cluster Setup ===" -ForegroundColor Green
Write-Host "Cluster root: $PG_ROOT"
Write-Host "Port:         $PG_PORT"
Write-Host "Superuser:    $PG_SUPER / $PG_PASS"
Write-Host ""

if (-not (Test-Path $PG_BIN)) {
    throw "PostgreSQL 16 bin directory not found at $PG_BIN"
}

if (Test-Path $PG_DATA) {
    $yn = Read-Host "Cluster data dir already exists at $PG_DATA. Delete and re-create? (y/N)"
    if ($yn -eq 'y' -or $yn -eq 'Y') {
        Remove-Item -Recurse -Force $PG_DATA
        Write-Host "Deleted existing cluster." -ForegroundColor DarkYellow
    } else {
        Write-Host "Aborted. Remove $PG_DATA manually if you want a fresh cluster."
        exit 0
    }
}

New-Item -ItemType Directory -Force -Path $PG_ROOT | Out-Null

# 1) Initialize cluster (no password prompt: use a temporary pwfile)
$pwfile = Join-Path $PG_ROOT '.initdb-pw.txt'
Set-Content -Path $pwfile -Value $PG_PASS -Encoding UTF8 -NoNewline
try {
    Invoke-PgExe 'initdb.exe' @(
        '-D', $PG_DATA,
        '-U', $PG_SUPER,
        '--pwfile', $pwfile,
        '-E', 'UTF8',
        '--locale=C',
        '-A', 'scram-sha-256'
    )
} finally {
    Remove-Item $pwfile -ErrorAction SilentlyContinue
}

# 2) Configure: listen on localhost, port 5433, write log
$conf = Join-Path $PG_DATA 'postgresql.conf'
@"

# ---- SMS project customisations ----
listen_addresses = 'localhost'
port = $PG_PORT
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
shared_buffers = 128MB
max_connections = 100
"@ | Add-Content -Path $conf -Encoding UTF8

Write-Host ""
Write-Host "Configuration updated in postgresql.conf (port=$PG_PORT)." -ForegroundColor Green

# 3) Re-write pg_hba.conf to allow local password auth (md5/scram)
$hba = Join-Path $PG_DATA 'pg_hba.conf'
$hbaContent = @"
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     scram-sha-256
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
"@
Set-Content -Path $hba -Value $hbaContent -Encoding UTF8
Write-Host "pg_hba.conf rewritten (SCRAM-SHA-256)." -ForegroundColor Green

# 4) Start the server in background (not as a Windows service)
Write-Host ""
Write-Host "Starting PostgreSQL on 127.0.0.1:$PG_PORT ..." -ForegroundColor Green
Invoke-PgExe 'pg_ctl.exe' @(
    '-D', $PG_DATA,
    '-l', $PG_LOG,
    'start',
    '-w'
)

# 5) Quick readiness check
Start-Sleep -Seconds 2
Invoke-PgExe 'pg_isready.exe' @('-h', '127.0.0.1', '-p', $PG_PORT, '-U', $PG_SUPER)

# 6) Create the smsdb database
$env:PGPASSWORD = $PG_PASS
try {
    Write-Host ""
    Write-Host "Creating smsdb database ..." -ForegroundColor Green
    $createDbSql = "SELECT 1 FROM pg_database WHERE datname='smsdb'; CREATE DATABASE smsdb OWNER $PG_SUPER;"
    # Use a "DO block-free" approach: run psql twice to be safe
    $exists = & (Join-Path $PG_BIN 'psql.exe') -h 127.0.0.1 -p $PG_PORT -U $PG_SUPER -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='smsdb'" 2>&1
    if ($exists -ne '1') {
        & (Join-Path $PG_BIN 'psql.exe') -h 127.0.0.1 -p $PG_PORT -U $PG_SUPER -d postgres -c "CREATE DATABASE smsdb OWNER $PG_SUPER;"
        if ($LASTEXITCODE -ne 0) { throw "CREATE DATABASE smsdb failed" }
        Write-Host "Database smsdb created." -ForegroundColor Green
    } else {
        Write-Host "Database smsdb already exists." -ForegroundColor DarkYellow
    }
} finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "=== ALL DONE ===" -ForegroundColor Green
Write-Host "PostgreSQL host: 127.0.0.1  port: $PG_PORT"
Write-Host "Superuser:       $PG_SUPER  password: $PG_PASS"
Write-Host "Database:        smsdb"
Write-Host ""
Write-Host "Stop it anytime with:  & '$PG_BIN\pg_ctl.exe' -D '$PG_DATA' stop"
Write-Host "Start it again  with:  .\scripts\start-local-postgres.ps1"
Write-Host ""

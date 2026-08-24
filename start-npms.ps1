# start-npms.ps1
#
# One-command startup for the full NPMS stack.
# Safe to run from ANY directory -- it anchors every path to this script's
# own location, so it never depends on your current working directory.
#
# What it does:
#   1. Starts Docker infrastructure (Postgres, Redis, Kafka, Mailhog, auth-service)
#   2. Waits for Postgres to report healthy
#   3. Sets core-service's local environment variables
#   4. Builds and launches core-service in a new window (port 8083)
#   5. Launches the frontend dev server in a new window (port 5173)
#
# Usage:
#   .\start-npms.ps1

$ErrorActionPreference = "Stop"

# Anchor to this script's own folder (the npms root), regardless of caller's cwd.
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

# Load environment variables from .env if it exists
if (Test-Path "$RootDir\.env") {
    Write-Host "==> Loading environment variables from .env..." -ForegroundColor Cyan
    Get-Content "$RootDir\.env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#")) {
            if ($line -match '^([^=]+)=(.*)$') {
                $key = $Matches[1].Trim()
                $val = $Matches[2].Trim()
                if ($val -match '^"(.*)"$') { $val = $Matches[1] }
                elseif ($val -match "^'(.*)'$") { $val = $Matches[1] }
                [Environment]::SetEnvironmentVariable($key, $val)
            }
        }
    }
}

$dbPort = if ($env:DB_PORT) { [int]$env:DB_PORT } else { 5433 }

Write-Host "==> NPMS root: $RootDir" -ForegroundColor Cyan

# --- Step 0: Free port 8081 if in use by host or stale process -------------
$existingAuth = Get-NetTCPConnection -LocalPort 8081 -State Listen -ErrorAction SilentlyContinue
if ($existingAuth) {
    $proc = Get-Process -Id $existingAuth.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and ($proc.Name -eq "java" -or $proc.Name -eq "javaw" -or $proc.Name -eq "node")) {
        Write-Host "==> Port 8081 is in use by PID $($existingAuth.OwningProcess) ($($proc.Name)) -- stopping it." -ForegroundColor Yellow
        Stop-Process -Id $existingAuth.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}

# --- Step 1: Docker infrastructure + auth-service ---------------------------
Write-Host "==> Starting Docker services (postgres, redis, zookeeper, kafka, mailhog, auth-service)..." -ForegroundColor Cyan
docker compose up -d postgres redis zookeeper kafka mailhog auth-service
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker failed to start. Is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

# --- Step 2: Wait for Postgres to be healthy and host port reachable ---------
Write-Host "==> Waiting for Postgres to complete initialization and become reachable on port $dbPort..." -ForegroundColor Cyan
$maxAttempts = 90
$attempt = 0
$healthy = $false
while ($attempt -lt $maxAttempts) {
    # Check if the initialization script is running inside the container logs
    $oldEAP = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    $logs = docker logs npms_postgres 2>&1
    $ErrorActionPreference = $oldEAP
    $isInitializing = $logs -match "/docker-entrypoint-initdb.d/"
    $isComplete = $logs -match "PostgreSQL init process complete; ready for start up."
    
    if ($isInitializing -and -not $isComplete) {
        # Still executing schema dump, wait
    } else {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $async = $tcp.BeginConnect("localhost", $dbPort, $null, $null)
            $wait = $async.AsyncWaitHandle.WaitOne(1000, $false)
            if ($wait -and $tcp.Connected) {
                $tcp.EndConnect($async)
                $tcp.Close()
                $healthy = $true
                break
            }
            $tcp.Close()
        } catch {
            # ignore
        }
    }
    Start-Sleep -Seconds 2
    $attempt++
}
if (-not $healthy) {
    Write-Host "Postgres failed to become ready in time." -ForegroundColor Red
    exit 1
}
Write-Host "==> Postgres is healthy and reachable on port $dbPort." -ForegroundColor Green

# --- Step 2.5: Dynamic ingestion & public schema consolidation --------------
Write-Host "==> Running NPMS Database dynamic ingestion & schema consolidation..." -ForegroundColor Cyan
python "$RootDir\database\ingest_all_databases.py"
python "$RootDir\database\recreate_project_list_view.py"

# --- Step 3: core-service environment variables (host-side, for Maven) ------
if (-not $env:JAVA_HOME -or -not (Test-Path $env:JAVA_HOME)) {
    $candidateJdks = @(
        "$env:USERPROFILE\.jdks\temurin-24.0.2",
        "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot",
        "C:\Program Files\Java\jdk-21",
        "C:\Program Files\Java\jdk-17",
        "C:\Program Files\JetBrains\IntelliJ IDEA 2026.1\jbr"
    )
    foreach ($jdk in $candidateJdks) {
        if (Test-Path $jdk) {
            $env:JAVA_HOME = $jdk
            [Environment]::SetEnvironmentVariable("JAVA_HOME", $jdk, "User")
            break
        }
    }
}

if (-not $env:DB_HOST) { $env:DB_HOST = "localhost" }
if (-not $env:DB_PORT) { $env:DB_PORT = "5433" }
if (-not $env:DB_NAME) { $env:DB_NAME = "npms_db" }
if (-not $env:DB_USER) { $env:DB_USER = "npms_user" }
if (-not $env:DB_PASSWORD) { $env:DB_PASSWORD = "npms_local_pass_2026" }
if (-not $env:REDIS_HOST) { $env:REDIS_HOST = "localhost" }
if (-not $env:REDIS_PORT) { $env:REDIS_PORT = "6379" }
if (-not $env:KAFKA_BOOTSTRAP) { $env:KAFKA_BOOTSTRAP = "localhost:9092" }
if (-not $env:OLLAMA_BASE_URL) { $env:OLLAMA_BASE_URL = "http://localhost:11434" }
if (-not $env:JWT_PRIVATE_KEY_PATH) { $env:JWT_PRIVATE_KEY_PATH = "classpath:keys/private.pem" }
if (-not $env:JWT_PUBLIC_KEY_PATH) { $env:JWT_PUBLIC_KEY_PATH = "classpath:keys/public.pem" }
if (-not $env:JWT_ACCESS_EXPIRY_MINUTES) { $env:JWT_ACCESS_EXPIRY_MINUTES = "15" }
if (-not $env:JWT_REFRESH_EXPIRY_DAYS) { $env:JWT_REFRESH_EXPIRY_DAYS = "7" }
if (-not $env:APP_BASE_URL) { $env:APP_BASE_URL = "http://localhost:3000" }
if (-not $env:APP_ENV) { $env:APP_ENV = "local" }

# --- Step 4: Free port 8083 if a stale core-service is still holding it ----
$existing = Get-NetTCPConnection -LocalPort 8083 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    $proc = Get-Process -Id $existing.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and ($proc.Name -eq "java" -or $proc.Name -eq "javaw" -or $proc.Name -eq "node")) {
        Write-Host "==> Port 8083 is in use by PID $($existing.OwningProcess) ($($proc.Name)) -- stopping it." -ForegroundColor Yellow
        Stop-Process -Id $existing.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}

# --- Step 5: Build + run core-service in its own window ---------------------
Write-Host "==> Building core-service..." -ForegroundColor Cyan
Push-Location "$RootDir\backend"
mvn -q -DskipTests package -pl npms-core-service -am
if ($LASTEXITCODE -ne 0) {
    Write-Host "core-service build failed." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

$javaHomeClean = if ($env:JAVA_HOME) { $env:JAVA_HOME.TrimEnd('\') } else { "" }
Write-Host "==> Launching core-service (port 8083) in a new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "cd '$RootDir\backend'; " +
    "`$env:JAVA_HOME='$javaHomeClean'; " +
    "`$env:DB_HOST='$($env:DB_HOST)'; `$env:DB_PORT='$($env:DB_PORT)'; `$env:DB_NAME='$($env:DB_NAME)'; `$env:DB_USER='$($env:DB_USER)'; `$env:DB_PASSWORD='$($env:DB_PASSWORD)'; " +
    "`$env:REDIS_HOST='$($env:REDIS_HOST)'; `$env:REDIS_PORT='$($env:REDIS_PORT)'; `$env:KAFKA_BOOTSTRAP='$($env:KAFKA_BOOTSTRAP)'; `$env:OLLAMA_BASE_URL='$($env:OLLAMA_BASE_URL)'; " +
    "`$env:JWT_PRIVATE_KEY_PATH='$($env:JWT_PRIVATE_KEY_PATH)'; `$env:JWT_PUBLIC_KEY_PATH='$($env:JWT_PUBLIC_KEY_PATH)'; " +
    "`$env:JWT_ACCESS_EXPIRY_MINUTES='$($env:JWT_ACCESS_EXPIRY_MINUTES)'; `$env:JWT_REFRESH_EXPIRY_DAYS='$($env:JWT_REFRESH_EXPIRY_DAYS)'; `$env:APP_BASE_URL='$($env:APP_BASE_URL)'; `$env:APP_ENV='$($env:APP_ENV)'; " +
    "mvn spring-boot:run -pl npms-core-service"
)

# --- Step 6: Launch frontend dev server in its own window -------------------
$existingFrontend = Get-NetTCPConnection -LocalPort 5195 -State Listen -ErrorAction SilentlyContinue
if ($existingFrontend) {
    $proc = Get-Process -Id $existingFrontend.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and ($proc.Name -eq "java" -or $proc.Name -eq "javaw" -or $proc.Name -eq "node")) {
        Write-Host "==> Port 5195 is in use by PID $($existingFrontend.OwningProcess) ($($proc.Name)) -- stopping it." -ForegroundColor Yellow
        Stop-Process -Id $existingFrontend.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}

Write-Host "==> Launching frontend dev server (port 5195) in a new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "cd '$RootDir\frontend'; npm install; npm run dev"
)

Write-Host ""
Write-Host "==> All services are starting." -ForegroundColor Green
Write-Host "    auth-service (Docker):  http://localhost:8081/actuator/health"
Write-Host "    core-service (Maven):   http://localhost:8083/actuator/health  (new window, ~10-15s to boot)"
Write-Host "    frontend (Vite):        http://localhost:5195  (new window, ~5-10s to boot)"
Write-Host ""
Write-Host "    Wait for both new windows to show 'Started CoreServiceApplication' and 'ready in ...ms' before opening the frontend." -ForegroundColor Yellow

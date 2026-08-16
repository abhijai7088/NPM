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

Write-Host "==> NPMS root: $RootDir" -ForegroundColor Cyan

# --- Step 1: Docker infrastructure + auth-service ---------------------------
Write-Host "==> Starting Docker services (postgres, redis, zookeeper, kafka, mailhog, auth-service)..." -ForegroundColor Cyan
docker compose up -d postgres redis zookeeper kafka mailhog auth-service
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker failed to start. Is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

# --- Step 2: Wait for Postgres to be healthy and host port reachable ---------
Write-Host "==> Waiting for Postgres to become healthy and reachable on port 5433..." -ForegroundColor Cyan
$maxAttempts = 30
$attempt = 0
$healthy = $false
while ($attempt -lt $maxAttempts) {
    $status = docker inspect --format='{{.State.Health.Status}}' npms_postgres 2>$null
    if ($status -eq "healthy") {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $async = $tcp.BeginConnect("localhost", 5433, $null, $null)
            $wait = $async.AsyncWaitHandle.WaitOne(1000, $false)
            if ($wait -and $tcp.Connected) {
                $tcp.EndConnect($async)
                $tcp.Close()
                $healthy = $true
                break
            }
            $tcp.Close()
            Write-Host "Postgres container healthy, but host port 5433 unreachable. Recreating container..." -ForegroundColor Yellow
            docker compose up -d --force-recreate postgres
        } catch {
            Write-Host "Postgres container healthy, but host port 5433 unreachable. Recreating container..." -ForegroundColor Yellow
            docker compose up -d --force-recreate postgres
        }
    }
    Start-Sleep -Seconds 2
    $attempt++
}
if (-not $healthy) {
    Write-Host "Postgres did not become healthy/reachable in time. Check 'docker compose logs postgres'." -ForegroundColor Red
    exit 1
}
Write-Host "==> Postgres is healthy and reachable on port 5433." -ForegroundColor Green

# --- Step 2.5: Dynamic ingestion & public schema consolidation --------------
Write-Host "==> Running NPMS Database dynamic ingestion & schema consolidation..." -ForegroundColor Cyan
python "$RootDir\database\dynamic_ingest.py" --host localhost --port 5433 --dbname npms_db --user npms_user --password npms_local_pass_2026


# --- Step 3: core-service environment variables (host-side, for Maven) ------
# NOTE: MAIL_HOST / MAIL_PORT are intentionally NOT set here. core-service
# hardcodes its own Gmail SMTP settings in application.yml. auth-service
# (Dockerized) reads its real Gmail settings from the .env FILE directly.
# Do not add mail vars to this shell -- they would leak into 'docker compose'
# commands run afterward in the same session and silently break OTP email.
# Ensure JAVA_HOME is set and valid for Maven
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

$env:DB_HOST = "localhost"
$env:DB_PORT = "5433"
$env:DB_NAME = "npms_db"
$env:DB_USER = "npms_user"
$env:DB_PASSWORD = "npms_local_pass_2026"
$env:REDIS_HOST = "localhost"
$env:REDIS_PORT = "6379"
$env:KAFKA_BOOTSTRAP = "localhost:9092"
$env:OLLAMA_BASE_URL = "http://localhost:11434"
$env:JWT_PRIVATE_KEY_PATH = "classpath:keys/private.pem"
$env:JWT_PUBLIC_KEY_PATH = "classpath:keys/public.pem"
$env:JWT_ACCESS_EXPIRY_MINUTES = "15"
$env:JWT_REFRESH_EXPIRY_DAYS = "7"
$env:APP_BASE_URL = "http://localhost:3000"
$env:APP_ENV = "local"

# --- Step 4: Free port 8083 if a stale core-service is still holding it ----
$existing = Get-NetTCPConnection -LocalPort 8083 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "==> Port 8083 is in use by PID $($existing.OwningProcess) -- stopping it." -ForegroundColor Yellow
    Stop-Process -Id $existing.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
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

Write-Host "==> Launching core-service (port 8083) in a new window..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList @(
    '-NoExit', '-Command',
    "cd '$RootDir\backend'; " +
    "`$env:JAVA_HOME='$env:JAVA_HOME'; " +
    "`$env:DB_HOST='localhost'; `$env:DB_PORT='5433'; `$env:DB_NAME='npms_db'; `$env:DB_USER='npms_user'; `$env:DB_PASSWORD='npms_local_pass_2026'; " +
    "`$env:REDIS_HOST='localhost'; `$env:REDIS_PORT='6379'; `$env:KAFKA_BOOTSTRAP='localhost:9092'; `$env:OLLAMA_BASE_URL='http://localhost:11434'; " +
    "`$env:JWT_PRIVATE_KEY_PATH='classpath:keys/private.pem'; `$env:JWT_PUBLIC_KEY_PATH='classpath:keys/public.pem'; " +
    "`$env:JWT_ACCESS_EXPIRY_MINUTES='15'; `$env:JWT_REFRESH_EXPIRY_DAYS='7'; `$env:APP_BASE_URL='http://localhost:3000'; `$env:APP_ENV='local'; " +
    "mvn spring-boot:run -pl npms-core-service"
)

# --- Step 6: Launch frontend dev server in its own window -------------------
$existingFrontend = Get-NetTCPConnection -LocalPort 5195 -State Listen -ErrorAction SilentlyContinue
if ($existingFrontend) {
    Write-Host "==> Port 5195 is in use by PID $($existingFrontend.OwningProcess) -- stopping it." -ForegroundColor Yellow
    Stop-Process -Id $existingFrontend.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
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

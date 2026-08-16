# set-env.ps1
$env:DB_HOST = "localhost"
$env:DB_PORT = "5433"
$env:DB_NAME = "npms_db"
$env:DB_USER = "npms_user"
$env:DB_PASSWORD = "npms_local_pass_2026"       # must match your .env
$env:REDIS_HOST = "localhost"
$env:REDIS_PORT = "6379"
$env:KAFKA_BOOTSTRAP = "localhost:9092"
# NOTE: MAIL_HOST / MAIL_PORT are intentionally NOT set here.
# core-service (this script's target) hardcodes its own Gmail SMTP settings
# directly in application.yml, so it never reads these variables anyway.
# auth-service (Dockerized) reads its real Gmail settings straight from the
# .env FILE via `env_file:` in docker-compose.yml. If MAIL_HOST/MAIL_PORT
# were exported into this shell, `docker compose up` run from the SAME
# terminal would silently override the container's mail config with these
# values, breaking OTP delivery. Keep this script mail-free.
$env:OLLAMA_BASE_URL = "http://localhost:11434"
$env:JWT_PRIVATE_KEY_PATH = "classpath:keys/private.pem"
$env:JWT_PUBLIC_KEY_PATH = "classpath:keys/public.pem"
$env:JWT_ACCESS_EXPIRY_MINUTES = "15"
$env:JWT_REFRESH_EXPIRY_DAYS = "7"
$env:APP_BASE_URL = "http://localhost:3000"
$env:APP_ENV = "local"

Write-Host "✅ Environment variables set!" -ForegroundColor Green

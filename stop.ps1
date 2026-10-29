# Docker で起動した BookKeeper を止める（Windows 用）
# コンテナは消さずに残すので、次の起動が速い。DB はホストのファイル（backend/bookkeeper.db）なので消えない
$ErrorActionPreference = "Continue"

Set-Location -Path $PSScriptRoot

docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Desktop が起動していないので、BookKeeper も動いていません。"
    exit 0
}

docker compose stop
if ($LASTEXITCODE -ne 0) {
    Write-Host "止められませんでした。docker compose ps で状態を確かめてください。"
    exit 1
}

Write-Host "止めました。"

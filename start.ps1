# BookKeeper を Docker で起動し、ブラウザで開く（Windows 用）
#   .\start.ps1                    既定のブラウザで開く
#   .\start.ps1 -Browser msedge    指定したブラウザで開く（chrome・msedge・firefox など）
# 止めるときは .\stop.ps1 を実行する
param(
    [string]$Browser = ""
)

# エラーで止めると、docker の標準エラー出力（進み具合の表示）までエラーとして扱われるため、
# 終了コードを $LASTEXITCODE で確かめる
$ErrorActionPreference = "Continue"

$FrontendUrl = "http://localhost:5173"
# ポートは 127.0.0.1 にだけ公開しているので、待つときは IPv6（::1）を避けて 127.0.0.1 に送る
$FrontendCheckUrl = "http://127.0.0.1:5173"
$BackendCheckUrl = "http://127.0.0.1:8000/api/health"

Set-Location -Path $PSScriptRoot

function Test-DockerRunning {
    docker info *> $null
    return $LASTEXITCODE -eq 0
}

function Wait-Until {
    param(
        [scriptblock]$Condition,
        [int]$TimeoutSeconds
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (& $Condition) {
            return $true
        }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Test-UrlResponds {
    param([string]$Url)
    try {
        Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "docker コマンドが見つかりません。Docker Desktop をインストールしてください。"
    exit 1
}

# 1. Docker を起動する
if (-not (Test-DockerRunning)) {
    Write-Host "Docker Desktop を起動しています..."
    # docker desktop start は Docker Desktop 4.37 以降のコマンド。使えない版では実行ファイルを直接起動する
    docker desktop start *> $null
    if ($LASTEXITCODE -ne 0) {
        $dockerDesktopExe = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
        if (-not (Test-Path $dockerDesktopExe)) {
            Write-Host "Docker Desktop を起動できませんでした。手動で起動してから、もう一度実行してください。"
            exit 1
        }
        Start-Process -FilePath $dockerDesktopExe
    }
    if (-not (Wait-Until -Condition { Test-DockerRunning } -TimeoutSeconds 180)) {
        Write-Host "Docker Desktop の起動を待ちましたが、使える状態になりませんでした。"
        exit 1
    }
}

# 2. ポートが空いているか確かめる。BookKeeper がすでに動いていれば、自分で使っているので確かめない
$runningServices = docker compose ps --status running --quiet
if (-not $runningServices) {
    $listening = Get-NetTCPConnection -LocalPort 8000, 5173 -State Listen -ErrorAction SilentlyContinue
    if ($listening) {
        $ports = ($listening | Select-Object -ExpandProperty LocalPort -Unique) -join "・"
        Write-Host "ポート $ports が、ほかのプログラムに使われています。そのプログラムを止めてから、もう一度実行してください。"
        exit 1
    }
}

# 3. 起動する。-d でバックグラウンドで動かし、--wait でコンテナが動き始めるまで待つ
Write-Host "BookKeeper を起動しています..."
docker compose up --build --detach --wait
if ($LASTEXITCODE -ne 0) {
    Write-Host "起動できませんでした。docker compose logs でログを確かめてください。"
    exit 1
}

# コンテナが動き始めても、DB の準備（alembic upgrade head）や Vite の起動が終わるまでは開けないので、応答を待つ
Write-Host "画面の準備ができるのを待っています..."
$ready = Wait-Until -Condition {
    (Test-UrlResponds -Url $BackendCheckUrl) -and (Test-UrlResponds -Url $FrontendCheckUrl)
} -TimeoutSeconds 120
if (-not $ready) {
    Write-Host "応答がありませんでした。docker compose logs でログを確かめてください。"
    exit 1
}

# 4. ブラウザで開く
if ($Browser) {
    try {
        Start-Process -FilePath $Browser -ArgumentList $FrontendUrl -ErrorAction Stop
    } catch {
        Write-Host "ブラウザ「$Browser」を起動できなかったので、既定のブラウザで開きます。"
        Start-Process -FilePath $FrontendUrl
    }
} else {
    Start-Process -FilePath $FrontendUrl
}

Write-Host "起動しました：$FrontendUrl"
Write-Host "止めるときは stop.cmd（または .\stop.ps1）を実行してください。ログは docker compose logs -f で見られます。"

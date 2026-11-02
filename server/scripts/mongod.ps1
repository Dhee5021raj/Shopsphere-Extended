# mongod.ps1 — Start/stop/status the real disk-backed mongod on Windows
# Uses the mongod binary already downloaded by mongodb-memory-server.
#
# Usage:
#   pwsh -File scripts\mongod.ps1 start
#   pwsh -File scripts\mongod.ps1 stop
#   pwsh -File scripts\mongod.ps1 status

param([string]$Action = "start")

$Port    = if ($env:BENCH_MONGO_PORT) { $env:BENCH_MONGO_PORT } else { "27018" }
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir = Split-Path -Parent $ScriptDir
$DbPath  = if ($env:BENCH_MONGO_DBPATH) { $env:BENCH_MONGO_DBPATH } else { (Join-Path $ServerDir ".mongo-bench-data") }
$PidFile = Join-Path $DbPath "mongod.pid"
$LogFile = Join-Path $DbPath "mongod.log"

# Find the mongod binary: cached by mongodb-memory-server, or on PATH
function Find-Mongod {
    $cached = Get-ChildItem (Join-Path $ServerDir "node_modules\.cache\mongodb-memory-server") -Filter "mongod*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cached) { return $cached.FullName }
    $onPath = Get-Command mongod -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    return $null
}

function Get-RunningPid {
    if (Test-Path $PidFile) {
        $content = (Get-Content $PidFile -Raw).Trim()
        if ($content -match '^\d+$' -and (Get-Process -Id ([int]$content) -ErrorAction SilentlyContinue)) {
            return [int]$content
        }
    }
    return $null
}

switch ($Action) {
    "start" {
        $bin = Find-Mongod
        if (-not $bin) {
            Write-Error "No mongod binary found. npm install should have downloaded it via mongodb-memory-server."
            exit 1
        }
        $runningPid = Get-RunningPid
        if ($runningPid) {
            Write-Host "mongod already running (pid $runningPid) on port $Port"
            exit 0
        }
        New-Item -ItemType Directory -Force -Path $DbPath | Out-Null
        Write-Host "Starting mongod: $bin"
        $proc = Start-Process -FilePath $bin `
            -ArgumentList "--dbpath `"$DbPath`" --port $Port --bind_ip 127.0.0.1 --wiredTigerCacheSizeGB 1" `
            -RedirectStandardOutput $LogFile `
            -RedirectStandardError  (Join-Path $DbPath "mongod.err") `
            -WindowStyle Hidden -PassThru
        $proc.Id | Set-Content $PidFile
        Start-Sleep -Seconds 3
        if (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue) {
            Write-Host "mongod up: pid $($proc.Id), port $Port, dbpath $DbPath"
            Write-Host "BENCH_URI=mongodb://127.0.0.1:$Port/shopsphere_bench"
        } else {
            Write-Error "mongod failed to start. Check: $LogFile"
            exit 1
        }
    }
    "stop" {
        $runningPid = Get-RunningPid
        if ($runningPid) {
            Stop-Process -Id $runningPid -Force
            Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
            Write-Host "Stopped mongod pid $runningPid"
        } else {
            Write-Host "No running mongod found"
        }
    }
    "status" {
        $runningPid = Get-RunningPid
        if ($runningPid) {
            Write-Host "running (pid $runningPid, port $Port)"
        } else {
            Write-Host "not running"
        }
    }
    default {
        Write-Error "Usage: mongod.ps1 start|stop|status"
        exit 1
    }
}

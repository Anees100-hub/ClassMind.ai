# Keep ClassMind AI server online - auto-restart if it exits or hangs.
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$port = 8000
Write-Host "[ClassMind.ai] watchdog starting on port $port"

function Test-AiPing {
    try {
        $req = [System.Net.WebRequest]::Create("http://127.0.0.1:$port/api/face/ping")
        $req.Timeout = 4000
        $resp = $req.GetResponse()
        $resp.Close()
        return $true
    } catch {
        return $false
    }
}

function Stop-PortListener {
    $lines = netstat -ano | Select-String "127.0.0.1:$port\s+.*LISTENING"
    foreach ($line in $lines) {
        if ($line -match '\s(\d+)\s*$') {
            $procId = [int]$Matches[1]
            if ($procId -gt 0) {
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                Write-Host "[ClassMind.ai] stopped PID $procId"
            }
        }
    }
}

while ($true) {
    Stop-PortListener
    Start-Sleep -Seconds 1
    Write-Host "[ClassMind.ai] launching uvicorn..."

    $proc = Start-Process -FilePath "python" -ArgumentList "-m","uvicorn","fastapi_server:app","--host","127.0.0.1","--port","$port" -WorkingDirectory $Root -PassThru -WindowStyle Hidden

    $healthy = $false
    for ($i = 0; $i -lt 90; $i++) {
        if ($proc.HasExited) { break }
        if (Test-AiPing) {
            $healthy = $true
            break
        }
        Start-Sleep -Seconds 2
    }

    if (-not $healthy) {
        Write-Host "[ClassMind.ai] not healthy - restarting"
        if (-not $proc.HasExited) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
        Start-Sleep -Seconds 3
        continue
    }

    Write-Host "[ClassMind.ai] online at http://127.0.0.1:$port"
    $fails = 0
    while (-not $proc.HasExited) {
        Start-Sleep -Seconds 8
        if (Test-AiPing) {
            $fails = 0
        } else {
            $fails = $fails + 1
            Write-Host "[ClassMind.ai] ping fail $fails"
            if ($fails -ge 3) {
                Write-Host "[ClassMind.ai] hung - restarting"
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                break
            }
        }
    }

    Write-Host "[ClassMind.ai] process ended - restart in 2s"
    Start-Sleep -Seconds 2
}

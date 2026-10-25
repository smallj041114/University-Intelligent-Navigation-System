$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "========================================"
Write-Host " 銘傳校園導航：一鍵建置本機環境"
Write-Host "========================================"
Write-Host ""

function Test-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Refresh-Path {
  $machine = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [System.Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
}

function Install-NodeWithWinget {
  if (-not (Test-Command "winget")) {
    return $false
  }
  Write-Host "  使用 winget 安裝 Node.js LTS，過程中可能跳出權限視窗..."
  & winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
  Refresh-Path
  return (Test-Command "node")
}

function Install-NodeWithMsi {
  Write-Host "  改從 nodejs.org 下載官方安裝檔..."
  $index = Invoke-RestMethod "https://nodejs.org/dist/index.json"
  $release = $index | Where-Object { $_.lts } | Select-Object -First 1
  if (-not $release) {
    throw "找不到 Node.js LTS 版本資訊。"
  }
  $ver = $release.version
  $msiName = "node-$ver-x64.msi"
  $url = "https://nodejs.org/dist/$ver/$msiName"
  $out = Join-Path $env:TEMP $msiName
  Write-Host "  正在下載 $msiName ..."
  Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
  Write-Host "  正在安裝，過程中可能跳出權限視窗..."
  $proc = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$out`" /passive /norestart" -Wait -PassThru
  Refresh-Path
  return ($proc.ExitCode -eq 0 -and (Test-Command "node"))
}

Refresh-Path

Write-Host "[1/4] 確認 Node.js..."
if (Test-Command "node") {
  Write-Host "  已安裝：$(node -v) / npm $(npm -v)"
} else {
  Write-Host "  尚未安裝 Node.js，開始自動安裝..."
  $ok = $false
  try {
    $ok = Install-NodeWithWinget
  } catch {
    $ok = $false
  }
  if (-not $ok) {
    try {
      $ok = Install-NodeWithMsi
    } catch {
      Write-Host "  自動安裝失敗：$($_.Exception.Message)"
      $ok = $false
    }
  }
  if (-not $ok -or -not (Test-Command "node")) {
    Write-Host "找不到 Node.js，且自動安裝未成功。"
    Write-Host "請手動安裝後再跑一次本腳本："
    Write-Host "  https://nodejs.org/"
    exit 1
  }
  Write-Host "  已安裝：$(node -v) / npm $(npm -v)"
}
Write-Host ""

if (-not (Test-Command "npm")) {
  Write-Host "找不到 npm。請重新安裝 Node.js，安裝時需包含 npm。"
  Write-Host "  https://nodejs.org/"
  exit 1
}

Write-Host "[2/4] 安裝 npm 依賴（包含 vite，這些套件不進 Git）..."
npm install
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "npm install 失敗，請確認網路可用後再重試。"
  exit 1
}
Write-Host ""

Write-Host "[3/4] 準備本機設定檔（已存在的不會覆蓋）..."
if (-not (Test-Path "config\admin.local.json")) {
  Copy-Item "config\admin.example.json" "config\admin.local.json"
  Write-Host "  已複製 config\admin.local.json"
  Write-Host "  請執行：node scripts/hash-admin-password.cjs `"你的密碼`" 並把輸出貼進該檔（不要用範例字串當密碼）"
} else {
  Write-Host "  已有 config\admin.local.json，略過"
}

if (-not (Test-Path "config\maps.local.json")) {
  Copy-Item "config\maps.example.json" "config\maps.local.json"
  Write-Host "  已複製 config\maps.local.json，可再填入 Google Maps API 金鑰"
} else {
  Write-Host "  已有 config\maps.local.json，略過"
}
Write-Host ""

Write-Host "[4/4] 檢查完成。"
if (-not (Test-Path "node_modules\vite")) {
  Write-Host "  警告：仍找不到 node_modules\vite，請再跑一次本腳本。"
  exit 1
}

Write-Host ""
Write-Host "建置完成。接下來請雙擊 start-server.bat 啟動開發伺服器。"
Write-Host "全景與平面圖放在 images 資料夾，這個資料夾不進 Git。"
Write-Host "若畫面缺圖，需另外取得圖檔。"
exit 0

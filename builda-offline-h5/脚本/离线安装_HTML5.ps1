# Builda HTML5 SDK 离线注入脚本（Windows PowerShell 5.1）
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File .\离线安装_HTML5.ps1 -Target "C:\path\to\project"
param(
    [string]$Target = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
$SiteOrigin = "https://builda.cn"
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$SkillRoot  = Split-Path -Parent $ScriptDir
$SdkSrc     = Join-Path $SkillRoot "离线SDK_HTML5"
$ToolSrc    = Join-Path $ScriptDir "工具链"
$AgentDir   = Join-Path $Target ".builda-agent"

Write-Host "== Builda 离线安装（HTML5） =="
Write-Host "技能目录: $SkillRoot"
Write-Host "目标项目: $Target"

if (-not (Test-Path $Target)) { throw "目标目录不存在: $Target" }
if (-not (Test-Path (Join-Path $Target "index.html")) -and
    -not (Test-Path (Join-Path $Target "package.json"))) {
    Write-Warning "目标目录下没有 index.html / package.json，确认这是 HTML5 项目根目录。"
}

$SdkJs = Join-Path $SdkSrc "builda-sdk.js"
New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null

if (Test-Path $SdkJs) {
    Write-Host "-- 使用本地离线 SDK: $SdkSrc"
    $WebDir = Join-Path $AgentDir "sdk\web"
    $MicDir = Join-Path $WebDir "mic"
    New-Item -ItemType Directory -Force -Path $MicDir | Out-Null
    Copy-Item -Force (Join-Path $SdkSrc "builda-sdk.js")        (Join-Path $WebDir "builda-sdk.js")
    Copy-Item -Force (Join-Path $SdkSrc "builda-sdk.d.ts")      (Join-Path $WebDir "builda-sdk.d.ts")
    Copy-Item -Force (Join-Path $SdkSrc "builda-dev-shell.html") (Join-Path $WebDir "builda-dev-shell.html")
    $MicWorker = Join-Path $SdkSrc "mic\builda-mic-worker.js"
    if (Test-Path $MicWorker) { Copy-Item -Force $MicWorker (Join-Path $MicDir "builda-mic-worker.js") }
    Set-Content -NoNewline -Encoding ascii -Path (Join-Path $AgentDir "sdk-version") -Value "0.19.4"

    $ToolCli = Join-Path $ToolSrc "builda"
    if (Test-Path $ToolCli) {
        Write-Host "-- 使用本地离线 CLI: $ToolCli"
        Copy-Item -Force (Join-Path $ToolSrc "builda")     (Join-Path $AgentDir "builda")
        Copy-Item -Force (Join-Path $ToolSrc "builda.ps1") (Join-Path $AgentDir "builda.ps1")
        Copy-Item -Force (Join-Path $ToolSrc "builda.cmd") (Join-Path $AgentDir "builda.cmd")
        Copy-Item -Force (Join-Path $ToolSrc "VERSION")    (Join-Path $AgentDir "VERSION")
        $Guidance = Join-Path $ToolSrc "sdk-guidance"
        if (Test-Path $Guidance) {
            Copy-Item -Recurse -Force $Guidance (Join-Path $AgentDir "sdk-guidance")
        }
    }

    Write-Host "-- 校验本地注入结果"
    foreach ($f in @("builda-sdk.js", "builda-sdk.d.ts")) {
        $p = Join-Path $WebDir $f
        if (-not (Test-Path $p) -or (Get-Item $p).Length -eq 0) { throw "注入后缺少 $f" }
    }
    Write-Host ("sdk-version=" + (Get-Content (Join-Path $AgentDir "sdk-version")))
    Write-Host "sdk-web=$WebDir"
    $Cmd = Join-Path $AgentDir "builda.cmd"
    if (Test-Path $Cmd) { Push-Location $Target; & $Cmd sdk check; Pop-Location }
} else {
    Write-Host "-- 本地离线 SDK 缺失，降级联网安装（仅此一次）"
    $Cli = Join-Path $AgentDir "builda.cmd"
    if (-not (Test-Path $Cli)) {
        $ProgressPreference = "SilentlyContinue"
        $tmp = Join-Path $env:TEMP "builda-install.ps1"
        Invoke-WebRequest -UseBasicParsing "https://ai.builda.game/agent/releases/0.4.117/install.ps1" -OutFile $tmp
        & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $tmp --site-origin $SiteOrigin
        Remove-Item -Force $tmp -ErrorAction SilentlyContinue
    }
    Push-Location $Target; & (Join-Path $AgentDir "builda.cmd") sdk install; Pop-Location
}

Write-Host "== 完成 =="
Write-Host "下一步: 在游戏 index.html 的 <head> 保留 <script src=`"builda-sdk.js`"></script>，并在入口脚本第一行调用 Builda.runtime.ready()"

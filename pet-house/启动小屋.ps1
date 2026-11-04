param([switch]$CheckOnly,[switch]$Configure,[switch]$NonInteractive)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
$backendDir = Join-Path $PSScriptRoot 'backend'
$savedPassword = [Environment]::GetEnvironmentVariable('PET_ROOM_MYSQL_PASSWORD','Process')
$savedSocial = [Environment]::GetEnvironmentVariable('PET_ROOM_SOCIAL','Process')
$savedConfig = [Environment]::GetEnvironmentVariable('PET_ROOM_MYSQL_CONFIG','Process')
try {
    $env:PET_ROOM_SOCIAL = '1'
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 20 或更高版本。' }
    $configPath = $env:PET_ROOM_MYSQL_CONFIG
    if (-not $configPath) {
        $configPath = Join-Path $backendDir 'app.local.json'
        if (-not (Test-Path -LiteralPath $configPath)) { $configPath = Join-Path $backendDir 'mysql.local.json' }
    }
    $configPath = [IO.Path]::GetFullPath($configPath)
    $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    # Resolve before changing directory so Node receives the same file.
    $env:PET_ROOM_MYSQL_CONFIG = $configPath
    $effectivePort = if ($env:PORT) { [int]$env:PORT } elseif ($config.httpPort) { [int]$config.httpPort } else { 8899 }
    if ($effectivePort -lt 1 -or $effectivePort -gt 65535) { throw 'HTTP端口需要是1至65535的整数。' }
    $protectedPath = Join-Path ([IO.Path]::GetDirectoryName($configPath)) 'mysql.password.dpapi'
    if ($Configure -or (-not $env:PET_ROOM_MYSQL_PASSWORD -and -not $env:PET_ROOM_MYSQL_PASSWORD_FILE -and -not $config.password)) {
        $securePassword = $null
        if (-not $Configure -and (Test-Path -LiteralPath $protectedPath)) {
            try { $securePassword = (Get-Content -LiteralPath $protectedPath -Raw).Trim() | ConvertTo-SecureString } catch { Write-Host '本机口令需要重新配置（加密记录仅适用于原 Windows 用户和电脑）。' }
        }
        if (-not $securePassword) {
            if ($NonInteractive) { throw '非交互启动没有可用的数据库口令，已停止。请先在当前 Windows 用户下运行启动小屋.cmd配置口令，或通过环境变量提供口令。' }
            if ($CheckOnly) { throw '没有可用口令。请先双击启动小屋.cmd，按提示输入数据库应用账号的口令。' }
            $securePassword = Read-Host ('请输入 MySQL 应用账号 {0} 的口令' -f $config.user) -AsSecureString
            if ($securePassword.Length -eq 0) { throw '数据库口令不能为空。' }
            $securePassword | ConvertFrom-SecureString | Set-Content -LiteralPath $protectedPath -Encoding ASCII
        }
        $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        try { $env:PET_ROOM_MYSQL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer); $securePassword.Dispose() }
    }
    Push-Location -LiteralPath $backendDir
    try {
        if ($CheckOnly) { & node server/check-connection.mjs }
        else {
            Write-Host ('打开小屋：http://127.0.0.1:{0}/?storage=mysql' -f $effectivePort)
            Write-Host ('数据库目录：http://127.0.0.1:{0}/database' -f $effectivePort)
            Write-Host '按 Ctrl+C 停止服务。'
            & node server/server.mjs
        }
        if ($LASTEXITCODE -ne 0) { throw '服务未能完成启动或检查。请检查 MySQL 服务、数据库配置和口令。' }
    } finally { Pop-Location }
} catch {
    $failureWriter = New-Object System.IO.StreamWriter([Console]::OpenStandardError(), (New-Object System.Text.UTF8Encoding($false)))
    $failureWriter.WriteLine($_.Exception.Message)
    $failureWriter.Flush()
    exit 1
}
finally {
    if ($null -eq $savedConfig) { Remove-Item Env:PET_ROOM_MYSQL_CONFIG -ErrorAction SilentlyContinue }
    else { $env:PET_ROOM_MYSQL_CONFIG = $savedConfig }
    if ($null -eq $savedSocial) { Remove-Item Env:PET_ROOM_SOCIAL -ErrorAction SilentlyContinue }
    else { $env:PET_ROOM_SOCIAL = $savedSocial }
    if ($null -eq $savedPassword) { Remove-Item Env:PET_ROOM_MYSQL_PASSWORD -ErrorAction SilentlyContinue }
    else { $env:PET_ROOM_MYSQL_PASSWORD = $savedPassword }
}

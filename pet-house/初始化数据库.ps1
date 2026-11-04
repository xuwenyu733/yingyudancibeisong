$ErrorActionPreference = 'Stop'
$backendDir = Join-Path $PSScriptRoot 'backend'
$temporaryConfig = Join-Path $backendDir ('.admin-init-' + [Guid]::NewGuid().ToString('N') + '.json')
$savedConfig = [Environment]::GetEnvironmentVariable('PET_ROOM_MYSQL_ADMIN_CONFIG','Process')
$savedPassword = [Environment]::GetEnvironmentVariable('PET_ROOM_MYSQL_ADMIN_PASSWORD','Process')
$savedApplicationPassword = [Environment]::GetEnvironmentVariable('PET_ROOM_MYSQL_PASSWORD','Process')
try {
    Write-Host '首次安装会创建 pet_room 数据库和独立应用账号；已有业务表不会被删除。'
    $adminUser = Read-Host 'MySQL 管理员账号（回车使用 root）'
    if (-not $adminUser) { $adminUser = 'root' }
    $adminPassword = Read-Host 'MySQL 管理员口令（不会保存）' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPassword)
    try { $env:PET_ROOM_MYSQL_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $adminPassword.Dispose() }
    @{host='127.0.0.1';port=3306;user=$adminUser;database='pet_room';sourceRoot=(Join-Path $PSScriptRoot 'source-connected');httpPort=8899} | ConvertTo-Json | Set-Content -LiteralPath $temporaryConfig -Encoding UTF8
    $env:PET_ROOM_MYSQL_ADMIN_CONFIG = $temporaryConfig
    $existingAppConfig = Join-Path $backendDir 'app.local.json'
    $existingProtectedPassword = Join-Path $backendDir 'mysql.password.dpapi'
    if (-not $env:PET_ROOM_MYSQL_PASSWORD -and (Test-Path -LiteralPath $existingAppConfig) -and (Test-Path -LiteralPath $existingProtectedPassword)) {
        $existing = Get-Content -LiteralPath $existingAppConfig -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not $existing.password) {
            $secret = (Get-Content -LiteralPath $existingProtectedPassword -Raw).Trim() | ConvertTo-SecureString
            $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
            try { $env:PET_ROOM_MYSQL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
            finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secret.Dispose() }
        }
    }
    Push-Location -LiteralPath $backendDir
    try { & node server/init.mjs; if ($LASTEXITCODE -ne 0) { throw '初始化未完成。请检查管理员权限及 MySQL 服务。' } }
    finally { Pop-Location }
    $applicationConfig = Join-Path $backendDir 'app.local.json'
    $config = Get-Content -LiteralPath $applicationConfig -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($config.password) {
        $secret = ConvertTo-SecureString -String $config.password -AsPlainText -Force
        try { $secret | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $backendDir 'mysql.password.dpapi') -Encoding ASCII }
        finally { $secret.Dispose() }
        $config.password = ''
        $config | ConvertTo-Json | Set-Content -LiteralPath $applicationConfig -Encoding UTF8
    }
    Write-Host '初始化完成。请双击启动小屋.cmd。'
} catch { Write-Error $_.Exception.Message; exit 1 }
finally {
    if (Test-Path -LiteralPath $temporaryConfig) { Remove-Item -LiteralPath $temporaryConfig }
    if ($null -eq $savedConfig) { Remove-Item Env:PET_ROOM_MYSQL_ADMIN_CONFIG -ErrorAction SilentlyContinue } else { $env:PET_ROOM_MYSQL_ADMIN_CONFIG = $savedConfig }
    if ($null -eq $savedPassword) { Remove-Item Env:PET_ROOM_MYSQL_ADMIN_PASSWORD -ErrorAction SilentlyContinue } else { $env:PET_ROOM_MYSQL_ADMIN_PASSWORD = $savedPassword }
    if ($null -eq $savedApplicationPassword) { Remove-Item Env:PET_ROOM_MYSQL_PASSWORD -ErrorAction SilentlyContinue } else { $env:PET_ROOM_MYSQL_PASSWORD = $savedApplicationPassword }
}

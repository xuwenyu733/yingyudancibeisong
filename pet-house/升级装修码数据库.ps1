$ErrorActionPreference = 'Stop'
$backendDir = Join-Path $PSScriptRoot 'backend'
$temporaryConfig = Join-Path $backendDir ('.admin-init-' + [Guid]::NewGuid().ToString('N') + '.json')
$savedConfig = [Environment]::GetEnvironmentVariable('PET_ROOM_MYSQL_ADMIN_CONFIG','Process')
$savedPassword = [Environment]::GetEnvironmentVariable('PET_ROOM_MYSQL_ADMIN_PASSWORD','Process')
try {
    Write-Host '本脚本为 pet_room 新增装修码分享表，不修改原游戏存档。'
    $adminUser = Read-Host 'MySQL 管理员账号（回车使用 root）'
    if (-not $adminUser) { $adminUser = 'root' }
    $adminPassword = Read-Host 'MySQL 管理员口令（不会保存）' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPassword)
    try { $env:PET_ROOM_MYSQL_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $adminPassword.Dispose() }
    @{host='127.0.0.1';port=3306;user=$adminUser;database='pet_room';sourceRoot=(Join-Path $PSScriptRoot 'source-connected');httpPort=8899} | ConvertTo-Json | Set-Content -LiteralPath $temporaryConfig -Encoding UTF8
    $env:PET_ROOM_MYSQL_ADMIN_CONFIG = $temporaryConfig
    $dumpCommand = Get-Command mysqldump.exe -ErrorAction SilentlyContinue
    $dumpPath = if ($dumpCommand) { $dumpCommand.Source } else { Join-Path $env:ProgramFiles 'MySQL\MySQL Server 8.0\bin\mysqldump.exe' }
    if (-not (Test-Path -LiteralPath $dumpPath)) { throw '找不到 mysqldump.exe，未执行升级。请安装 MySQL 客户端或先手动备份后使用 npm run migrate:designs。' }
    $backupDir = Join-Path $PSScriptRoot 'database-backups'
    New-Item -ItemType Directory -Path $backupDir -Force > $null
    $backupPath = Join-Path $backupDir ('pet_room-before-designs-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,6) + '.sql')
    $savedMysqlPassword = [Environment]::GetEnvironmentVariable('MYSQL_PWD','Process')
    try {
        $env:MYSQL_PWD = $env:PET_ROOM_MYSQL_ADMIN_PASSWORD
        & $dumpPath --host=127.0.0.1 --port=3306 "--user=$adminUser" --single-transaction --skip-lock-tables --set-gtid-purged=OFF --no-tablespaces --hex-blob --default-character-set=utf8mb4 "--result-file=$backupPath" --databases pet_room
        if ($LASTEXITCODE -ne 0 -or (Get-Item -LiteralPath $backupPath).Length -lt 1000) { throw '备份未完成，未执行升级。' }
    } finally {
        if ($null -eq $savedMysqlPassword) { Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue } else { $env:MYSQL_PWD = $savedMysqlPassword }
    }
    Push-Location -LiteralPath $backendDir
    try { & node server/migrate-designs.mjs; if ($LASTEXITCODE -ne 0) { throw '升级未完成，请保留刚生成的备份并检查错误信息。' } }
    finally { Pop-Location }
    Write-Host ('升级完成，升级前备份：' + $backupPath)
} catch { Write-Error $_.Exception.Message; exit 1 }
finally {
    if (Test-Path -LiteralPath $temporaryConfig) { Remove-Item -LiteralPath $temporaryConfig }
    if ($null -eq $savedConfig) { Remove-Item Env:PET_ROOM_MYSQL_ADMIN_CONFIG -ErrorAction SilentlyContinue } else { $env:PET_ROOM_MYSQL_ADMIN_CONFIG = $savedConfig }
    if ($null -eq $savedPassword) { Remove-Item Env:PET_ROOM_MYSQL_ADMIN_PASSWORD -ErrorAction SilentlyContinue } else { $env:PET_ROOM_MYSQL_ADMIN_PASSWORD = $savedPassword }
}

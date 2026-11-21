param(
    [switch]$EnablePublishing,
    [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$taskName = 'Guiji-Instagram-Publisher'
if ($Remove) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host '已移除任务。'
    exit
}
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'publisher.json'))) {
    throw '请先执行 node scripts/publish.mjs init 并填写配置。'
}
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$entryPath = Join-Path $PSScriptRoot 'publish.mjs'
$taskArguments = '"' + $entryPath + '" run --once'
if ($EnablePublishing) { $taskArguments += ' --live' }
$action = New-ScheduledTaskAction -Execute $nodePath -Argument $taskArguments -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 6)
# Interactive logon runs without storing a Windows password. The user must remain logged in.
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
if ($EnablePublishing) { Write-Host '已安装正式发布任务。每分钟检查排期，电脑需开机且用户保持登录。' }
else { Write-Host '已安装试运行任务：仅生成视频，不发布。使用 -EnablePublishing 可切换正式发布。' }
